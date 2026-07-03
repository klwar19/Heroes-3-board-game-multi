"use client";

import PartySocket from "partysocket";
import type { AdventurePlayerConfig, EngineResult, GameAction, GameDifficulty, GameMode, GameState } from "@/engine";
import { LOBBY_SINGLETON_ID, type RoomDirectoryEntry } from "@/server/lobby-registry";

export type { RoomDirectoryEntry };

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

export type RoomConnectionHandlers = {
  onSnapshot: (snapshot: GameRoomSnapshot) => void;
  onStatus: (status: string) => void;
  /** The room was closed (deleted) by its host — drop back to the lobby. */
  onClosed?: () => void;
};

export type RoomConnection = {
  /** Stops the stream/socket and releases resources. */
  close: () => void;
  submitAction: (action: GameAction) => Promise<{ snapshot: GameRoomSnapshot; result: EngineResult }>;
  resetRoom: (options: RoomResetOptions) => Promise<GameRoomSnapshot>;
  fetchSnapshot: () => Promise<GameRoomSnapshot>;
  /**
   * Re-seed a room the server lost (recycle / cold start) from a cached game
   * state. Only applied over a fresh lobby, so it never clobbers live games.
   */
  restoreRoom: (state: GameState) => Promise<GameRoomSnapshot>;
};

export function getPartyKitHost(): string | null {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  return host && host.trim().length > 0 ? host.trim() : null;
}

/**
 * Provides a short-lived socket ticket for the cross-origin PartyKit edge
 * (Phase 2). Resolves the current signed-in player's ticket, or undefined for a
 * guest. Re-invoked on every (re)connect so an expired ticket is always
 * refreshed. Only the PartyKit transport uses it — the built-in backend rides
 * the same-origin httpOnly session cookie and needs no ticket.
 */
export type SocketTokenProvider = () => Promise<string | undefined>;

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
  | {
      type: "action-result";
      requestId?: string;
      errors: { code: string; message: string }[];
      snapshot: GameRoomSnapshot;
    }
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

function partyProtocol(host: string): string {
  return host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
}

function partyHttpUrl(host: string, roomId: string, clientId?: string): string {
  // PartyKit serves the default ("main") party at /parties/main/<room> — the
  // same path PartySocket uses for the WebSocket. (The room server adds CORS
  // headers so these cross-origin GETs are not blocked by the browser.) The
  // clientId lets the edge redact a GET snapshot to this seat (Phase 2),
  // matching the socket frames.
  const base = `${partyProtocol(host)}://${host}/parties/main/${encodeURIComponent(roomId)}`;
  return clientId ? `${base}?clientId=${encodeURIComponent(clientId)}` : base;
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
  const socket = new PartySocket({
    host,
    room: roomId,
    query: buildQuery
  });
  const pending = new Map<
    string,
    (reply: Extract<PartyServerMessage, { type: "action-result" }>) => void
  >();
  let requestCounter = 0;
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

  socket.addEventListener("open", () => {
    handlers.onStatus("live (edge)");
  });
  socket.addEventListener("close", () => {
    handlers.onStatus("edge socket reconnecting");
  });
  socket.addEventListener("error", () => {
    handlers.onStatus("edge socket reconnecting");
  });
  socket.addEventListener("message", (event) => {
    let message: PartyServerMessage;
    try {
      message = JSON.parse(event.data as string) as PartyServerMessage;
    } catch {
      return;
    }

    if (message.type === "snapshot") {
      if (message.snapshot.closed) {
        handlers.onClosed?.();
        return;
      }
      handlers.onSnapshot(message.snapshot);
      handlers.onStatus(`live (edge) v${message.snapshot.version}`);
      if (pendingReset) {
        const settle = pendingReset;
        pendingReset = null;
        settle.resolve(message.snapshot);
      }
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

    if (message.type === "action-result") {
      if (message.requestId) {
        pending.get(message.requestId)?.(message);
        pending.delete(message.requestId);
      }
      if (message.errors.length === 0) {
        handlers.onSnapshot(message.snapshot);
      }
    }
  });

  return {
    close: () => {
      socket.close();
      pending.clear();
    },
    submitAction: (action) =>
      new Promise((resolve, reject) => {
        requestCounter += 1;
        const requestId = `req_${requestCounter}_${Date.now().toString(36)}`;
        const timeout = window.setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("The room did not answer in time."));
        }, 15000);

        pending.set(requestId, (reply) => {
          window.clearTimeout(timeout);
          resolve({
            snapshot: reply.snapshot,
            result: {
              state: reply.snapshot.state,
              events: [],
              errors: reply.errors.map((error) => ({
                code: error.code as EngineResult["errors"][number]["code"],
                message: error.message
              }))
            }
          });
        });

        socket.send(
          JSON.stringify({ type: "action", requestId, action, ...(actorClientId ? { actorClientId } : {}) })
        );
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
      const response = await fetch(partyHttpUrl(host, roomId, actorClientId), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    // PartyKit Durable Objects persist their state, so a room is never lost
    // there — restoring is just reading the authoritative copy back.
    restoreRoom: async () => {
      const response = await fetch(partyHttpUrl(host, roomId, actorClientId), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load room.");
      }
      return (await response.json()) as GameRoomSnapshot;
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
    handlers.onStatus("stream reconnecting");
  };

  const pollId = window.setInterval(() => {
    const stale = Date.now() - lastMessageAt > 45000;
    if (!streamErrored && !stale) {
      return;
    }
    fetchSnapshot()
      .then((snapshot) => {
        handlers.onSnapshot(snapshot);
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
      .then((snapshot) => handlers.onSnapshot(snapshot))
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
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(actorClientId ? { actorClientId } : {}) })
      });
      if (!response.ok) {
        throw new Error("Server rejected the action request.");
      }
      return (await response.json()) as { snapshot: GameRoomSnapshot; result: EngineResult };
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
 * implicitly on first connect) this mints an id locally; the chosen name is
 * applied by the caller via a SET_ROOM_NAME action once connected.
 */
export async function createRoomOnServer(options: {
  name?: string;
  createdByName?: string;
  roomId?: string;
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
 * Closes (deletes) a room. The server validates `actorClientId` against the
 * room's host / membership (host while connected, any member once the host is
 * gone), and the developer's admin key overrides — see localAdminKey.
 */
export async function requestCloseRoom(roomId: string, actorClientId?: string): Promise<CloseRoomResult> {
  const host = getPartyKitHost();
  const url = host
    ? partyHttpUrl(host, roomId)
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
