"use client";

import PartySocket from "partysocket";
import type { AdventurePlayerConfig, EngineResult, GameAction, GameDifficulty, GameMode, GameState } from "@/engine";
import { VERIFIED_SEAT_REJECTION_MESSAGE } from "@/engine";
import { getPartyKitHost, partyProtocol } from "@/lib/party-origin";
import { frameBytes, metricNow, metricsSampled, recordPerformanceMetric } from "@/lib/performance-metrics";
import { peekPendingSinglePlayer, savePendingSinglePlayer } from "@/lib/pending-room-name";
import { LOBBY_SINGLETON_ID, type RoomDirectoryEntry } from "@/server/lobby-registry";

export type { RoomDirectoryEntry };
export { getPartyKitHost };

/**
 * Room transport layer. Two backends share one interface:
 *
 *  - PartyKit (Cloudflare Durable Objects): one object per room, WebSockets
 *    at the edge. Enabled by setting NEXT_PUBLIC_PARTYKIT_HOST to the host
 *    printed by `npx partykit deploy` (e.g. heroes3bg-rooms.<user>.partykit.dev).
 *  - The built-in Next.js API routes (in-memory room store + SSE stream),
 *    used automatically when no PartyKit host is configured.
 */

export type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
  /** Server store generation — changes when the host process restarted. */
  bootId?: string;
  /**
   * The room server's ENGINE_SIGNATURE (see src/engine/version.ts), stamped at
   * send time. The client compares it against its own to detect a stale
   * room-server deploy. Absent from very old servers that predate this field.
   */
  serverSignature?: string;
  /** Set on the final frame a closed room sends, so the client returns to the lobby. */
  closed?: boolean;
  /** Effective redaction seat on hosted PartyKit frames. */
  viewerSeat?: string;
};

/**
 * Result of asking for the room list. `supported` is true on both backends now
 * that the PartyKit edge has a lobby Durable Object directory; it is reported
 * false only when that directory can't be reached (e.g. a PartyKit deploy that
 * predates the lobby party), in which case the lobby falls back to join-by-code.
 */
export type RoomListResult = { rooms: RoomDirectoryEntry[]; supported: boolean };

export type CloseRoomResult = { closed: boolean; reason?: string };

export type RoomResetOptions = {
  mode?: GameMode;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
};

/** Provenance of a delivered snapshot, for the caller's version gate. */
export type SnapshotMeta = {
  source?: "connect" | "broadcast" | "action-ack" | "sync" | "http-recovery" | "reset";
  /**
   * The snapshot came from a channel the server redacts to THIS client's own
   * seat (the HTTP snapshot fetch with clientId+token attached). The caller may
   * accept it at the SAME version it already holds: on a hosted room the
   * socket's zero-trust connect frame is observer-redacted at the current
   * version, and only an equal-version upgrade from a seat-authoritative
   * channel can restore the player's own hidden cards without waiting for the
   * next state change.
   */
  seatAuthoritative?: boolean;
};

/**
 * A connection-quality sample: the measured round-trip to the room server, in
 * milliseconds. Sampled from the health ping→pong exchange and from every
 * action submit→acknowledgment — the latter is the primary source during
 * active play (pings only flow after 35 s of silence, by design; do NOT
 * shorten the ping interval to feed this). Presentation-only: nothing may
 * gate behaviour on it.
 */
export type ConnectionQualitySample = { rttMs?: number; at: number };

export type RoomConnectionHandlers = {
  onSnapshot: (snapshot: GameRoomSnapshot, meta?: SnapshotMeta) => void;
  onStatus: (status: string) => void;
  /**
   * Round-trip measurement, delivered on every pong and every action ack.
   * Works with metric sampling OFF — never couple it to metricsSampled.
   */
  onQuality?: (quality: ConnectionQualitySample) => void;
  /** The room was closed (deleted) by its host — drop back to the lobby. */
  onClosed?: () => void;
  /**
   * The live channel (socket / event stream) dropped. The server reaps an
   * unseated member's room membership on disconnect, so the caller uses this to
   * re-arm its one-shot join guard — a member missing after a drop is re-joined,
   * while a member kicked over a LIVE connection still never auto-rejoins.
   */
  onDropped?: () => void;
};

export type RoomConnection = {
  /** Stops the stream/socket and releases resources. */
  close: () => void;
  submitAction: (action: GameAction) => Promise<{
    version: number;
    errors: EngineResult["errors"];
    notices: string[];
  }>;
  resetRoom: (options: RoomResetOptions) => Promise<GameRoomSnapshot>;
  fetchSnapshot: () => Promise<GameRoomSnapshot>;
  /**
   * Re-seed a room the server lost (recycle / cold start) from a cached game
   * state. Only applied over a fresh lobby, so it never clobbers live games.
   */
  restoreRoom: (state: GameState) => Promise<GameRoomSnapshot>;
  /**
   * Single-player save slots: fetch the room's RAW state for a local save.
   * Owner-only and solo rooms only — the server refuses everything else (the
   * per-seat redacted frames cannot serve as saves; see
   * src/server/single-player-save.ts).
   */
  fetchSinglePlayerSave: () => Promise<{ state: GameState; version: number }>;
  /**
   * Single-player save slots: replace the room's game with a saved snapshot —
   * an atomic whole-state swap into the SAME room (owner-only, solo only).
   */
  loadSinglePlayerSave: (state: GameState) => Promise<GameRoomSnapshot>;
};

/** Shared reader for the save/load endpoints' error bodies. */
async function saveEndpointError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { reason?: string } | null;
  return new Error(body && typeof body.reason === "string" ? body.reason : fallback);
}

const STALE_SAVE_SERVER_MESSAGE =
  "The room server is running an older version without save slots — redeploy it (npm run deploy:partykit) and try again.";

/**
 * The spSave reply must carry its marker: an OLDER room-server deploy answers
 * an unknown POST body with a generic (seat-REDACTED) snapshot, which would
 * silently store a corrupted save. Never accept an unmarked reply.
 */
function parseSaveFetchReply(payload: unknown): { state: GameState; version: number } {
  const marked = payload as { spSave?: boolean; state?: GameState; version?: number } | null;
  if (!marked || marked.spSave !== true || !marked.state || typeof marked.version !== "number") {
    throw new Error(STALE_SAVE_SERVER_MESSAGE);
  }
  return { state: marked.state, version: marked.version };
}

/**
 * The spLoad reply must carry its marker: an older server would ignore the
 * body and return a plain snapshot WITHOUT applying the load — the client must
 * never report such a reply as "loaded".
 */
function parseSaveLoadReply(payload: unknown): GameRoomSnapshot {
  const marked = payload as { spLoad?: boolean; snapshot?: GameRoomSnapshot } | null;
  if (!marked || marked.spLoad !== true || !marked.snapshot) {
    throw new Error(STALE_SAVE_SERVER_MESSAGE);
  }
  return marked.snapshot;
}

/**
 * Provides a short-lived socket ticket for the cross-origin PartyKit edge
 * (Phase 2). Resolves the current signed-in player's ticket, or undefined for a
 * guest. Re-invoked on every (re)connect so an expired ticket is always
 * refreshed. Only the PartyKit transport uses it — the built-in backend rides
 * the same-origin httpOnly session cookie and needs no ticket.
 */
export type SocketTokenProvider = () => Promise<string | undefined>;

/**
 * Minimum gap between two self-healing reconnects (see
 * {@link shouldReconnectForSeatRejection}) so a persistent refusal can never
 * spin the socket.
 */
export const SEAT_REHEAL_COOLDOWN_MS = 30_000;

/** No server frame at all after a submit means the room/socket is unavailable. */
export const ACTION_RECEIPT_TIMEOUT_MS = 15_000;
/**
 * Once the room confirms receipt, allow a large late-game state to apply,
 * persist, redact, and fan out before its final action-result arrives.
 */
export const ACTION_PROCESSING_TIMEOUT_MS = 60_000;
/**
 * How long a submitted action may go without its transport receipt before the
 * socket is treated as suspect. The server sends `action-received`
 * SYNCHRONOUSLY, before identity resolution and the mutation queue, so on a
 * receipt-capable server even a few seconds of silence means the frame (or the
 * socket under it) is gone — recover and re-send instead of idling toward the
 * 15 s "The room did not answer in time." error. Well under
 * ACTION_RECEIPT_TIMEOUT_MS so recovery fits inside the unchanged deadline.
 */
export const ACTION_RECEIPT_PROBE_MS = 5_000;
/**
 * How many times one request's frame may be re-sent over a recovered socket.
 * The server's requestId dedupe ledger answers a repeat with the original
 * outcome, so a re-send can never double-apply — this cap only stops a
 * flapping socket from spamming the same frame forever.
 */
export const MAX_ACTION_RESENDS = 2;

/**
 * Whether an action-result's errors warrant a self-healing socket reconnect.
 *
 * Over a long hosted session the edge's verified-identity resolution can lapse:
 * Cloudflare hibernation wipes its in-memory token cache AND the browser's
 * 10-minute socket ticket has since expired, so a signed-in actor degrades to a
 * guest and the seat guard rejects EVERY subsequent action with
 * VERIFIED_SEAT_REJECTION_MESSAGE — until the player refreshes the page. The
 * transport instead reconnects (which re-runs the async query → a fresh ticket)
 * and refetches the seat snapshot, healing the session with no refresh. Pure so
 * the decision (including the cooldown that stops it spinning) is unit-tested
 * without a socket. The edge's own storage cache (Fix A) is the primary fix;
 * this is the client-side belt-and-braces that also heals a hosted MULTIPLAYER
 * session whose ticket simply aged out.
 */
export function shouldReconnectForSeatRejection(
  errors: { message: string }[],
  lastHealAt: number,
  now: number
): boolean {
  if (now - lastHealAt < SEAT_REHEAL_COOLDOWN_MS) {
    return false;
  }
  return errors.some((error) => error.message.includes(VERIFIED_SEAT_REJECTION_MESSAGE));
}

export function connectRoom(
  roomId: string,
  handlers: RoomConnectionHandlers,
  /**
   * Stable per-browser client id, attached to every action so a hosted room
   * can enforce seat ownership (see roomActionGuard in the engine). Omitted on
   * an open table — then the server applies no seat enforcement.
   */
  actorClientId?: string,
  /** See SocketTokenProvider — binds a verified account to the edge socket. */
  getSocketToken?: SocketTokenProvider
): RoomConnection {
  const host = getPartyKitHost();
  return host
    ? connectPartyRoom(host, roomId, handlers, actorClientId, getSocketToken)
    : connectApiRoom(roomId, handlers, actorClientId);
}

// ---------------------------------------------------------------------------
// PartyKit backend (WebSockets to a Durable Object per room)
// ---------------------------------------------------------------------------

type PartyServerMessage =
  | { type: "snapshot"; snapshot: GameRoomSnapshot }
  | { type: "action-received"; requestId: string; durable?: boolean }
  | {
      type: "action-result";
      requestId?: string;
      version: number;
      errors: { code: string; message: string }[];
      notices?: string[];
    }
  | { type: "pong"; version: number; viewerSeat?: string }
  | { type: "reset-denied"; reason: string };

/** Marks an Error as a server-side authority refusal (vs a network failure). */
export function isResetDenied(error: unknown): boolean {
  return error instanceof Error && error.name === "ResetDeniedError";
}

function resetDeniedError(reason: string): Error {
  const error = new Error(reason);
  error.name = "ResetDeniedError";
  return error;
}

/**
 * The developer's admin override key, set once per browser via
 * `localStorage["homm3bg.adminKey"] = "<HOMM3BG_ADMIN_KEY>"` on the deployed
 * app. Sent with reset/close requests; the server honours it only when it
 * matches its HOMM3BG_ADMIN_KEY env var. Absent for normal players.
 */
function localAdminKey(): string | undefined {
  try {
    if (typeof window === "undefined") {
      return undefined;
    }
    return window.localStorage.getItem("homm3bg.adminKey") ?? undefined;
  } catch {
    return undefined;
  }
}

function partyHttpUrl(host: string, roomId: string, clientId?: string, token?: string): string {
  // PartyKit serves the default ("main") party at /parties/main/<room> — the
  // same path PartySocket uses for the WebSocket. (The room server adds CORS
  // headers so these cross-origin GETs are not blocked by the browser.) The
  // clientId lets the edge redact a GET snapshot to this seat (Phase 2),
  // matching the socket frames; the verified session `token` (same one the
  // socket carries) lets the edge honour a platform admin for close/reset.
  const base = `${partyProtocol(host)}://${host}/parties/main/${encodeURIComponent(roomId)}`;
  const query = new URLSearchParams();
  if (clientId) {
    query.set("clientId", clientId);
  }
  if (token) {
    query.set("token", token);
  }
  const suffix = query.toString();
  return suffix ? `${base}?${suffix}` : base;
}

/**
 * The lobby/registry Durable Object's HTTP endpoint — one fixed object in the
 * `lobby` party that holds the directory of live rooms (see party/lobby.ts).
 */
function partyLobbyUrl(host: string): string {
  return `${partyProtocol(host)}://${host}/parties/lobby/${encodeURIComponent(LOBBY_SINGLETON_ID)}`;
}

function connectPartyRoom(
  host: string,
  roomId: string,
  handlers: RoomConnectionHandlers,
  actorClientId?: string,
  getSocketToken?: SocketTokenProvider
): RoomConnection {
  // Carry the stable per-tab client id on the socket URL so the room server can
  // read it in `onClose` and reap this client's ephemeral membership when the
  // connection drops (a tab close / navigate away), instead of leaving a ghost
  // member that inflates the room's head count on every rejoin. The verified
  // socket ticket (Phase 2) rides alongside it, resolved fresh on every
  // (re)connect via the async query so an expired ticket is re-minted — the
  // party overrides the claimed clientId with the account this ticket verifies.
  const buildQuery = async (): Promise<Record<string, string>> => {
    const query: Record<string, string> = {};
    if (actorClientId) {
      query.clientId = actorClientId;
    }
    // Single-player creation marker (this tab just created this room id via
    // createSinglePlayerRoom): the party honors it ONLY while the room has no
    // snapshot at all, so re-sending it on reconnects is harmless.
    const singlePlayer = peekPendingSinglePlayer(roomId);
    if (singlePlayer) {
      query.singlePlayer = String(singlePlayer.computerOpponents);
    }
    if (getSocketToken) {
      try {
        const token = await getSocketToken();
        if (token) {
          query.token = token;
        }
      } catch {
        // A ticket fetch failure degrades to guest — never blocks the connection.
      }
    }
    return query;
  };
  const actorToken = async (): Promise<string | undefined> => {
    if (!getSocketToken) {
      return undefined;
    }
    try {
      return await getSocketToken();
    } catch {
      return undefined;
    }
  };
  const socket = new PartySocket({
    host,
    room: roomId,
    query: buildQuery
  });
  type PendingActionRequest = {
    /** The exact frame sent, kept for dedupe-safe re-sends over a fresh socket. */
    frame: string;
    /** The server confirmed transport receipt (action-received). */
    received: boolean;
    /** How many times the frame was re-sent (see MAX_ACTION_RESENDS). */
    resends: number;
    settle: (reply: Extract<PartyServerMessage, { type: "action-result" }>) => void;
    markReceived: () => void;
    cancel: () => void;
  };
  const pending = new Map<string, PendingActionRequest>();
  /**
   * Latch: this room server answered a receipt with `durable: true`, i.e. its
   * requestId dedupe ledger PERSISTS across instance restarts. That is the
   * permission to re-send a pending frame — a repeat is answered with the
   * recorded outcome, never applied twice, even by a freshly-woken instance.
   * While false (an older room server, or the very first action of a session),
   * no probe fires and no frame is ever re-sent: exactly the old single-send
   * behaviour, so a frontend-only deploy can never double-apply.
   */
  let serverAcksActions = false;
  let requestCounter = 0;
  let lastMessageAt = Date.now();
  let opened = false;
  let awaitingPong = false;
  let pingSentAt = 0;
  let syncRequested = false;
  let knownVersion = 0;
  // Last time a seat-identity rejection triggered a self-healing reconnect —
  // the cooldown gate for shouldReconnectForSeatRejection.
  let lastSeatHealAt = 0;
  // Reset travels over the socket, not HTTP: the room server is a different
  // origin than the app, so a cross-origin fetch would be blocked by CORS
  // (the WebSocket is not). The next snapshot the server broadcasts is the
  // reset result, so we resolve the reset promise on it — and a reset-denied
  // frame (host-authority refusal) rejects it with the server's reason.
  let pendingReset: {
    resolve: (snapshot: GameRoomSnapshot) => void;
    reject: (error: Error) => void;
  } | null = null;

  handlers.onStatus("connecting (edge)");

  // The seat-redacted HTTP snapshot, delivered as a seat-authoritative frame.
  // Used on every REconnect: the server's synchronous connect frame is the
  // zero-trust OBSERVER view at the current version, and if nothing changed
  // while the socket was down no later broadcast is due — without this refetch
  // a hosted-room player's own hand/Pandora cards would stay masked until the
  // next state change (the closed-room reload bug).
  let recoveryFetch: Promise<void> | null = null;
  const refetchSeatSnapshot = (): Promise<void> => {
    // A watchdog reconnect can open while its emergency fetch is still in
    // flight. Share that request so one dead socket never mints/fetches the
    // same recovery snapshot twice.
    if (recoveryFetch) return recoveryFetch;
    recoveryFetch = (async () => {
      try {
        const response = await fetch(partyHttpUrl(host, roomId, actorClientId, await actorToken()), {
          cache: "no-store"
        });
        if (response.ok) {
          const snapshot = (await response.json()) as GameRoomSnapshot;
          lastMessageAt = Date.now();
          knownVersion = Math.max(knownVersion, snapshot.version);
          handlers.onSnapshot(snapshot, {
            source: "http-recovery",
            seatAuthoritative: true
          });
        }
      } catch {
        // The reconnecting socket and the caller's own fetch paths keep trying.
      }
    })().finally(() => {
      recoveryFetch = null;
    });
    return recoveryFetch;
  };

  let dropped = false;
  let recoveryRequestedForDrop = false;
  const markDropped = () => {
    opened = false;
    awaitingPong = false;
    syncRequested = false;
    if (dropped) return;
    dropped = true;
    handlers.onDropped?.();
  };
  /**
   * Re-send every unsettled action frame over a freshly-(re)opened socket. A
   * frame handed to a dying socket is silently lost, and a result the server
   * sent into that socket never arrives — either way the submit used to idle
   * into "The room did not answer in time." with the action's fate unknown.
   * The server answers a requestId it already applied from its dedupe ledger,
   * so a repeat settles with the ORIGINAL outcome instead of double-applying;
   * a frame that never arrived simply arrives now. Gated on the receipt latch
   * (an old server without the ledger must never see a repeat) and capped per
   * request so a flapping socket cannot spam.
   */
  const resendPendingActions = () => {
    if (!serverAcksActions) return;
    for (const [requestId, request] of pending) {
      if (request.resends >= MAX_ACTION_RESENDS) continue;
      request.resends += 1;
      recordPerformanceMetric({
        name: "room.action.resent",
        at: metricNow(),
        fields: { requestId, attempt: request.resends }
      });
      socket.send(request.frame);
    }
  };
  socket.addEventListener("open", () => {
    opened = true;
    lastMessageAt = Date.now();
    handlers.onStatus("live (edge)");
    if (dropped) {
      dropped = false;
      if (!recoveryRequestedForDrop) void refetchSeatSnapshot();
      recoveryRequestedForDrop = false;
    }
    resendPendingActions();
  });
  socket.addEventListener("close", () => {
    markDropped();
    handlers.onStatus("edge socket reconnecting");
  });
  socket.addEventListener("error", () => {
    markDropped();
    handlers.onStatus("edge socket reconnecting");
  });
  socket.addEventListener("message", (event) => {
    let message: PartyServerMessage;
    try {
      message = JSON.parse(event.data as string) as PartyServerMessage;
    } catch {
      return;
    }
    lastMessageAt = Date.now();
    awaitingPong = false;
    // Guarded: frameBytes() TextEncoder-scans the whole frame (a ~48 KiB
    // snapshot) on EVERY inbound message. Skip that work entirely unless metrics
    // are actually being sampled (off by default) — recordPerformanceMetric
    // would otherwise discard it after the payload was already built.
    if (metricsSampled) {
      recordPerformanceMetric({
        name: "room.frame.in",
        at: metricNow(),
        fields: { type: message.type, bytes: frameBytes(event.data as string) }
      });
    }

    if (message.type === "pong") {
      const rttMs = pingSentAt ? Date.now() - pingSentAt : undefined;
      recordPerformanceMetric({
        name: "room.health.pong",
        at: metricNow(),
        durationMs: rttMs,
        fields: { version: message.version }
      });
      handlers.onQuality?.({ rttMs, at: Date.now() });
      if (message.version > knownVersion) {
        syncRequested = true;
        socket.send(JSON.stringify({ type: "sync" }));
      }
      return;
    }

    if (message.type === "snapshot") {
      knownVersion = Math.max(knownVersion, message.snapshot.version);
      if (message.snapshot.closed) {
        handlers.onClosed?.();
        return;
      }
      if (pendingReset) {
        const settle = pendingReset;
        pendingReset = null;
        handlers.onStatus(`live (edge) v${message.snapshot.version}`);
        settle.resolve(message.snapshot);
        return;
      }
      handlers.onSnapshot(message.snapshot, {
        source: syncRequested ? "sync" : "broadcast",
        seatAuthoritative: syncRequested || (message.snapshot.viewerSeat !== undefined && message.snapshot.viewerSeat !== "observer")
      });
      syncRequested = false;
      handlers.onStatus(`live (edge) v${message.snapshot.version}`);
      return;
    }

    if (message.type === "reset-denied") {
      if (pendingReset) {
        const settle = pendingReset;
        pendingReset = null;
        settle.reject(resetDeniedError(message.reason));
      }
      return;
    }

    if (message.type === "action-received") {
      // Only a server that advertises a DURABLE ledger unlocks the probe and
      // the re-send. A receipt alone proves just the in-memory ledger, which a
      // woken (hibernated/evicted/redeployed) instance loses — a repeat would
      // then APPLY THE ACTION TWICE. This handshake is also what keeps a
      // frontend-only deploy (Vercel ships before/without the room server)
      // safe: an older edge omits the flag, so nothing is ever re-sent.
      if (message.durable === true) {
        serverAcksActions = true;
      }
      pending.get(message.requestId)?.markReceived();
      return;
    }

    if (message.type === "action-result" && message.requestId) {
      const request = pending.get(message.requestId);
      request?.settle(message);
      pending.delete(message.requestId);
    }
  });

  const requestSync = () => {
    if (!opened) return;
    syncRequested = true;
    socket.send(JSON.stringify({ type: "sync" }));
  };
  const sendHealthPing = () => {
    if (!opened || awaitingPong) return;
    awaitingPong = true;
    pingSentAt = Date.now();
    const frame = JSON.stringify({ type: "ping", knownVersion });
    recordPerformanceMetric({
      name: "room.frame.out",
      at: metricNow(),
      fields: { type: "ping", bytes: frameBytes(frame) }
    });
    socket.send(frame);
  };
  const onWake = () => {
    if (document.visibilityState === "hidden") return;
    requestSync();
    // A suspended laptop/background tab can wake with a socket that still says
    // OPEN locally although the route has died. Probe at once instead of
    // waiting up to another health interval before starting the timeout clock.
    if (Date.now() - lastMessageAt >= 35_000) sendHealthPing();
  };
  const canObserveWake = typeof window !== "undefined" && typeof document !== "undefined";
  if (canObserveWake) {
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
  }
  const healthId = canObserveWake ? window.setInterval(() => {
    if (!opened || document.visibilityState === "hidden") return;
    const silentMs = Date.now() - lastMessageAt;
    if (awaitingPong && Date.now() - pingSentAt >= 5_000) {
      recordPerformanceMetric({ name: "room.health.timeout", at: metricNow(), fields: { silentMs } });
      handlers.onStatus("edge socket unhealthy; recovering");
      // An HTTP snapshot heals the screen immediately, while a forced socket
      // reconnect repairs the live update channel. Keeping the apparently-open
      // socket would otherwise make later events/rewards disappear again until
      // the player refreshed the page.
      markDropped();
      recoveryRequestedForDrop = true;
      void refetchSeatSnapshot();
      socket.reconnect(4000, "health timeout");
      return;
    }
    if (!awaitingPong && silentMs >= 35_000) {
      sendHealthPing();
    }
  }, 5_000) : null;

  return {
    close: () => {
      socket.close();
      for (const request of pending.values()) {
        request.cancel();
      }
      pending.clear();
      if (healthId !== null) window.clearInterval(healthId);
      if (canObserveWake) {
        window.removeEventListener("focus", onWake);
        document.removeEventListener("visibilitychange", onWake);
      }
    },
    submitAction: (action) =>
      new Promise((resolve, reject) => {
        requestCounter += 1;
        const requestId = `req_${requestCounter}_${Date.now().toString(36)}`;
        const sentAt = metricNow();
        const sentAtWall = Date.now();
        let timeout = 0;
        let probeTimer = 0;
        const armTimeout = (delayMs: number, message: string) => {
          window.clearTimeout(timeout);
          timeout = window.setTimeout(() => {
            window.clearTimeout(probeTimer);
            pending.delete(requestId);
            reject(new Error(message));
          }, delayMs);
        };
        armTimeout(ACTION_RECEIPT_TIMEOUT_MS, "The room did not answer in time.");
        // Receipt probe: on a receipt-capable server (serverAcksActions), a few
        // seconds without the transport receipt means the frame or the socket
        // under it is gone — the receipt is sent synchronously, before any
        // processing. Recover exactly like the pong-timeout watchdog (refetch
        // the seat snapshot, replace the socket) and let the open handler
        // re-send this frame (dedupe-safe; see resendPendingActions). The 15 s
        // receipt / 60 s processing deadlines are unchanged — the probe only
        // works INSIDE them, so a genuinely unreachable room still errors at
        // the same moment it always did.
        const armReceiptProbe = () => {
          if (!serverAcksActions) return;
          window.clearTimeout(probeTimer);
          probeTimer = window.setTimeout(() => {
            const request = pending.get(requestId);
            if (!request || request.received || request.resends >= MAX_ACTION_RESENDS) return;
            recordPerformanceMetric({
              name: "room.action.receipt-probe",
              at: metricNow(),
              fields: { requestId, actionType: action.type }
            });
            // A replacement socket may already be on its way (another request's
            // probe, the health watchdog, a real close) — then just keep
            // probing; the open handler re-sends for every pending request.
            if (!dropped) {
              handlers.onStatus("edge socket unhealthy; recovering");
              markDropped();
              recoveryRequestedForDrop = true;
              void refetchSeatSnapshot();
              socket.reconnect(4000, "action receipt timeout");
            }
            armReceiptProbe();
          }, ACTION_RECEIPT_PROBE_MS);
        };

        const frame = JSON.stringify({ type: "action", requestId, action, ...(actorClientId ? { actorClientId } : {}) });
        const request: PendingActionRequest = {
          frame,
          received: false,
          resends: 0,
          markReceived: () => {
            request.received = true;
            window.clearTimeout(probeTimer);
            armTimeout(
              ACTION_PROCESSING_TIMEOUT_MS,
              "The room received the action but could not finish it in time."
            );
          },
          cancel: () => {
            window.clearTimeout(timeout);
            window.clearTimeout(probeTimer);
            reject(new Error("The room connection closed."));
          },
          settle: (reply) => {
            window.clearTimeout(timeout);
            window.clearTimeout(probeTimer);
            recordPerformanceMetric({
              name: "room.action.acknowledged",
              at: sentAt,
              durationMs: metricNow() - sentAt,
              fields: { requestId, actionType: action.type, version: reply.version }
            });
            // The ack round-trip is the "felt" latency of active play — feed the
            // quality surface from it (pongs alone are too rare while playing).
            // Wall-clock, like the pong sample.
            handlers.onQuality?.({ rttMs: Date.now() - sentAtWall, at: Date.now() });
            const errors = reply.errors.map((error) => ({
              code: error.code as EngineResult["errors"][number]["code"],
              message: error.message
            }));
            // Self-heal a lapsed verified identity: a seat-identity rejection on a
            // client that CAN mint a ticket (getSocketToken) means the edge lost
            // our verified identity — reconnect to re-run the async query (fresh
            // ticket) and refetch the seat snapshot, instead of forcing a page
            // refresh. Bounded to once per SEAT_REHEAL_COOLDOWN_MS so a genuine,
            // persistent refusal can never spin the socket. A pure guest gains
            // nothing from a reconnect, so it is skipped for them.
            if (getSocketToken && shouldReconnectForSeatRejection(errors, lastSeatHealAt, Date.now())) {
              lastSeatHealAt = Date.now();
              handlers.onStatus("re-authenticating (edge)");
              void refetchSeatSnapshot();
              socket.reconnect(4000, "seat re-auth");
            }
            resolve({
              version: reply.version,
              notices: reply.notices ?? [],
              errors
            });
          }
        };
        pending.set(requestId, request);

        recordPerformanceMetric({
          name: "room.action.sent",
          at: metricNow(),
          fields: { requestId, actionType: action.type, bytes: frameBytes(frame) }
        });
        socket.send(frame);
        armReceiptProbe();
      }),
    resetRoom: (options) =>
      new Promise<GameRoomSnapshot>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          if (pendingReset) {
            pendingReset = null;
            reject(new Error("Could not reset the room."));
          }
        }, 15000);
        pendingReset = {
          resolve: (snapshot) => {
            window.clearTimeout(timeout);
            resolve(snapshot);
          },
          reject: (error) => {
            window.clearTimeout(timeout);
            reject(error);
          }
        };
        const adminKey = localAdminKey();
        socket.send(
          JSON.stringify({
            type: "reset",
            ...options,
            ...(actorClientId ? { actorClientId } : {}),
            ...(adminKey ? { adminKey } : {})
          })
        );
      }),
    fetchSnapshot: async () => {
      const response = await fetch(partyHttpUrl(host, roomId, actorClientId, await actorToken()), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    // PartyKit Durable Objects persist their state, so a room is never lost
    // there — restoring is just reading the authoritative copy back.
    restoreRoom: async () => {
      const response = await fetch(partyHttpUrl(host, roomId, actorClientId, await actorToken()), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    fetchSinglePlayerSave: async () => {
      const response = await fetch(partyHttpUrl(host, roomId, actorClientId, await actorToken()), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spSave: true, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw await saveEndpointError(response, "Could not read the game for saving.");
      }
      return parseSaveFetchReply(await response.json());
    },
    loadSinglePlayerSave: async (state) => {
      const response = await fetch(partyHttpUrl(host, roomId, actorClientId, await actorToken()), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spLoad: true, state, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw await saveEndpointError(response, "Could not load the saved game.");
      }
      return parseSaveLoadReply(await response.json());
    }
  };
}

// ---------------------------------------------------------------------------
// Built-in Next.js API backend (in-memory store + SSE stream)
// ---------------------------------------------------------------------------

function connectApiRoom(
  roomId: string,
  handlers: RoomConnectionHandlers,
  actorClientId?: string
): RoomConnection {
  // The stable per-tab client id rides on the stream URL so the server can reap
  // this client's ephemeral membership when the stream drops (tab close /
  // navigate away) — the fix for one computer being counted as many after
  // repeated join/leave. Seated players in a hosted game are never reaped.
  const streamUrl = `/api/rooms/${encodeURIComponent(roomId)}/stream${
    actorClientId ? `?clientId=${encodeURIComponent(actorClientId)}` : ""
  }`;
  const source = new EventSource(streamUrl);
  // The server pings every 20s with a real data event. A stream that stayed
  // silent for much longer is half-dead (idle proxies, sleeping laptops) even
  // when the browser never fired onerror — fall back to polling until the
  // EventSource reconnects.
  let lastMessageAt = Date.now();
  let streamErrored = false;

  const fetchSnapshot = async (): Promise<GameRoomSnapshot> => {
    // Carry the clientId so the server redacts the snapshot to this seat (Phase
    // 2 per-connection redaction) on the initial load and the polling fallback,
    // matching the stream — a guest seated player still sees their own hand.
    const url = `/api/rooms/${encodeURIComponent(roomId)}${
      actorClientId ? `?clientId=${encodeURIComponent(actorClientId)}` : ""
    }`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load room.");
    }
    return (await response.json()) as GameRoomSnapshot;
  };

  source.onmessage = (message) => {
    lastMessageAt = Date.now();
    streamErrored = false;
    try {
      const payload = JSON.parse(message.data) as GameRoomSnapshot | { ping: true };
      if ("ping" in payload) {
        return;
      }
      if (payload?.closed) {
        handlers.onClosed?.();
        return;
      }
      if (payload && payload.state) {
        handlers.onSnapshot(payload);
        handlers.onStatus(`live v${payload.version}`);
      }
    } catch {
      // Ignore malformed frames.
    }
  };
  source.onerror = () => {
    streamErrored = true;
    // The server reaps an unseated member when its stream drops — let the
    // caller re-arm its join guard, mirroring the PartyKit socket.
    handlers.onDropped?.();
    handlers.onStatus("stream reconnecting");
  };

  const pollId = window.setInterval(() => {
    const stale = Date.now() - lastMessageAt > 45000;
    if (!streamErrored && !stale) {
      return;
    }
    fetchSnapshot()
      .then((snapshot) => {
        // The HTTP snapshot is redacted to this client's own seat, so it may
        // upgrade an equal-version frame (see SnapshotMeta.seatAuthoritative).
        handlers.onSnapshot(snapshot, { seatAuthoritative: true });
        handlers.onStatus(`live (poll) v${snapshot.version}`);
      })
      .catch(() => handlers.onStatus("room sync failed"));
  }, 4000);

  // Waking up from a background tab or laptop sleep: resync immediately
  // instead of waiting for the next poll window.
  const onWake = () => {
    if (document.visibilityState === "hidden") {
      return;
    }
    fetchSnapshot()
      .then((snapshot) => handlers.onSnapshot(snapshot, { seatAuthoritative: true }))
      .catch(() => {
        /* The regular poll keeps retrying. */
      });
  };
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onWake);

  return {
    close: () => {
      source.close();
      window.clearInterval(pollId);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    },
    submitAction: async (action) => {
      const sentAt = Date.now();
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw new Error("Server rejected the action request.");
      }
      // Same "felt latency" sample the PartyKit ack path delivers, so the
      // quality surface works on both backends.
      handlers.onQuality?.({ rttMs: Date.now() - sentAt, at: Date.now() });
      const payload = (await response.json()) as { snapshot: GameRoomSnapshot; result: EngineResult };
      return {
        version: payload.snapshot.version,
        errors: payload.result.errors,
        notices: payload.result.events
          .filter((event) => event.type === "SPELL_CAST_REFUNDED")
          .map((event) => (event as Extract<typeof event, { type: "SPELL_CAST_REFUNDED" }>).reason)
      };
    },
    resetRoom: async (options) => {
      const adminKey = localAdminKey();
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reset: true,
          ...options,
          ...(actorClientId ? { actorClientId } : {}),
          ...(adminKey ? { adminKey } : {})
        })
      });
      if (!response.ok) {
        // A 403 is the host-authority refusal; surface its reason (as a
        // ResetDeniedError) instead of the generic network message.
        const denial = response.status === 403 ? await response.json().catch(() => null) : null;
        const reason = denial && typeof denial.reason === "string" ? denial.reason : null;
        throw reason ? resetDeniedError(reason) : new Error("Could not reset the room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    restoreRoom: async (state) => {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true, state, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw new Error("Could not restore the room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    fetchSinglePlayerSave: async () => {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spSave: true, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw await saveEndpointError(response, "Could not read the game for saving.");
      }
      return parseSaveFetchReply(await response.json());
    },
    loadSinglePlayerSave: async (state) => {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spLoad: true, state, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw await saveEndpointError(response, "Could not load the saved game.");
      }
      return parseSaveLoadReply(await response.json());
    },
    fetchSnapshot
  };
}

// ---------------------------------------------------------------------------
// Lobby directory (transport-aware standalone calls, not tied to one room)
// ---------------------------------------------------------------------------

/**
 * Fetches the list of active rooms. On the built-in backend this hits
 * `/api/rooms`; on the PartyKit edge it hits the lobby Durable Object's
 * directory (party/lobby.ts). If that lobby object can't be reached (a PartyKit
 * deploy that predates it), it resolves `supported: false` so the lobby falls
 * back to joining by room code / shared link, exactly as before.
 */
export async function fetchRoomList(clientId?: string): Promise<RoomListResult> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const host = getPartyKitHost();
  if (host) {
    try {
      const response = await fetch(`${partyLobbyUrl(host)}${query}`, { cache: "no-store" });
      if (!response.ok) {
        return { rooms: [], supported: false };
      }
      const data = (await response.json()) as { rooms?: RoomDirectoryEntry[] };
      return { rooms: data.rooms ?? [], supported: true };
    } catch {
      // The lobby party isn't reachable — fall back to join-by-code.
      return { rooms: [], supported: false };
    }
  }
  const response = await fetch(`/api/rooms${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load the room list.");
  }
  const data = (await response.json()) as { rooms?: RoomDirectoryEntry[] };
  return { rooms: data.rooms ?? [], supported: true };
}

/**
 * Creates a new room and returns its id. On PartyKit (rooms are created
 * implicitly on first connect) this mints an id locally; the chosen name — and,
 * for a battle-test room, the `mode` — are applied by the caller once connected
 * (SET_ROOM_NAME / a reset to the chosen mode). On the built-in backend the room
 * is created server-side in the chosen `mode` straight away.
 */
export async function createRoomOnServer(options: {
  name?: string;
  createdByName?: string;
  roomId?: string;
  mode?: GameMode;
  /** Ranked (counts MMR) vs Normal (casual). Applied on connect for PartyKit. */
  ranked?: boolean;
  /** Closed table (hosted). Ranked games should always set this. */
  hosted?: boolean;
}): Promise<{ roomId: string }> {
  if (getPartyKitHost()) {
    return { roomId: options.roomId?.trim() || `room-${Math.random().toString(36).slice(2, 8)}` };
  }
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  });
  if (!response.ok) {
    throw new Error("Could not create the room.");
  }
  const data = (await response.json()) as { roomId: string };
  return { roomId: data.roomId };
}

/**
 * Creates a PRIVATE single-player room (one human + `computerOpponents`
 * computer seats) and returns its id. Purpose-built (plan §5.1): on the
 * built-in backend the server creates the room private/single-player with a
 * non-guessable id BEFORE it could ever be listed; on PartyKit (implicit
 * creation) this mints a 128-bit id locally and stores the one-shot
 * `?singlePlayer=` socket marker the room server honors only on a fresh,
 * memberless, unconfigured room.
 */
export async function createSinglePlayerRoom(computerOpponents: number): Promise<{ roomId: string }> {
  const count = Math.max(1, Math.floor(computerOpponents));
  if (getPartyKitHost()) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const roomId = `sp-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    savePendingSinglePlayer(roomId, count);
    return { roomId };
  }
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionMode: "single-player", computerOpponents: count })
  });
  if (!response.ok) {
    throw new Error("Could not create the single-player game.");
  }
  const data = (await response.json()) as { roomId: string };
  return { roomId: data.roomId };
}

/**
 * Closes (deletes) a room. The server validates `actorClientId` against the
 * room's host / membership (host while connected, any member once the host is
 * gone), plus two overrides that let a moderator close ANY room:
 *  - a signed-in PLATFORM ADMIN — resolved server-side from the session. On the
 *    built-in backend the same-origin httpOnly cookie carries it; on the
 *    cross-origin PartyKit edge the browser can't send that cookie, so
 *    `getSocketToken` mints the same short-lived ticket the live socket uses
 *    and it rides on the request `?token=` for the edge to verify.
 *  - the developer's admin key — see localAdminKey.
 */
/**
 * Close (delete) a room AS A PLATFORM ADMIN, through the SAME-ORIGIN app.
 *
 * This is the reliable admin path: the app verifies the admin from the httpOnly
 * session cookie (which is proven to work — the admin sees the admin panel) and
 * then deletes the room itself, forwarding to the PartyKit edge server-side with
 * the app's own credentials (see src/server/edge-close.ts). It sidesteps every
 * fragile link of the cross-origin browser → edge path (socket-ticket store
 * sharing, CORS preflight, the localStorage admin key) that produced repeated
 * "Only members of this room can close it" refusals. Works for a room on the
 * edge OR the built-in store — the server routes it correctly either way.
 */
export async function requestAdminCloseRoom(roomId: string): Promise<CloseRoomResult> {
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = (await response.json().catch(() => ({}))) as CloseRoomResult;
    return { closed: response.ok && data.closed !== false, reason: data.reason };
  } catch {
    return { closed: false, reason: "Could not reach the server to delete the room." };
  }
}

export async function requestCloseRoom(
  roomId: string,
  actorClientId?: string,
  /** See SocketTokenProvider — lets the edge resolve a platform-admin session. */
  getSocketToken?: SocketTokenProvider
): Promise<CloseRoomResult> {
  const host = getPartyKitHost();
  // Only the cross-origin edge needs the ticket on the wire; the built-in
  // backend reads the admin from the same-origin cookie the fetch sends anyway.
  const token = host && getSocketToken ? await getSocketToken().catch(() => undefined) : undefined;
  const url = host
    ? partyHttpUrl(host, roomId, actorClientId, token)
    : `/api/rooms/${encodeURIComponent(roomId)}`;
  const adminKey = localAdminKey();
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorClientId, ...(adminKey ? { adminKey } : {}) })
  });
  const data = (await response.json().catch(() => ({}))) as CloseRoomResult;
  return { closed: response.ok && data.closed !== false, reason: data.reason };
}
