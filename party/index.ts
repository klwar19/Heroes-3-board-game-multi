import type * as Party from "partykit/server";
import {
  applyAction,
  configuredComputerOpponents,
  createAdventureGameState,
  createAdventureLobbyState,
  createCombatSandboxLobbyState,
  driveAfkDrop,
  dropDisconnectedMember,
  forcedResolutionPending,
  ENGINE_SIGNATURE,
  freshEntropy,
  isPrivateSinglePlayer,
  isSinglePlayerRoomId,
  OBSERVER_VIEWER_SEAT,
  redactStateForSeat,
  resetVoteAuthorizes,
  resetVoteRequired,
  seatForViewer,
  sessionModeOf,
  type AdventurePlayerConfig,
  type GameAction,
  type GameDifficulty,
  type GameMode,
  type GameSessionMode,
  type GameState,
  type PlayerId
} from "@/engine";
import {
  applyHumanComputerAdvance,
  computerPumpOwed,
  computerStepDelayMs,
  settleComputerForLiveAction,
  settleComputerVisibleStep,
} from "@/server/computer-runner";
import { deriveLobbyRecord, lobbyRecordSignature, lobbyReportIsDue, LOBBY_SINGLETON_ID, STALE_ROOM_TTL_MS } from "@/server/lobby-registry";
import { detectFinishedMatch, type FinishedMatch } from "@/server/match-report";
import {
  appendRankedReplayEntry,
  createRankedReplay,
  finishRankedReplay,
  rankedClashReplayEligible,
  rankedReplayEnabled,
  type RankedReplay,
} from "@/server/ranked-replay";
import {
  actorIsRoomParticipant,
  applyUndoMove,
  clearUndoHistory,
  recordUndoSnapshot,
  undoModeEnabled
} from "@/server/undo-history";
import { prepareSinglePlayerLoad, singlePlayerSaveAccess } from "@/server/single-player-save";
import { httpTokenVerifier, memoizeVerifier, type TokenVerifier, type VerifiedIdentity } from "@/server/verified-actor";

/**
 * One PartyKit room per game table — PartyKit runs every room as its own
 * Cloudflare Durable Object at the edge, so this class is the authoritative
 * version of src/server/game-room-store.ts: it owns the GameState, applies
 * actions through the same rules engine, persists snapshots to Durable
 * Object storage (rooms survive hibernation), and pushes every new snapshot
 * to all connected WebSockets (players, observers, the works).
 *
 * Deploy with `npx partykit deploy` and point the Next.js client at it with
 * NEXT_PUBLIC_PARTYKIT_HOST (see src/lib/realtime.ts).
 */

export type RoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  /** When the room was first created (ISO) — for lobby sort/age, mirrors the store. */
  createdAt?: string;
  /** Display name of whoever created the room (the first member to join). */
  createdByName?: string;
  state: GameState;
  /**
   * This server's ENGINE_SIGNATURE, stamped onto every snapshot at send time
   * (see src/engine/version.ts). Lets the client warn when the room server is
   * running older engine code than the frontend.
   */
  serverSignature?: string;
  /** Set on the final frame a closed room sends, so clients return to the lobby. */
  closed?: boolean;
  /**
   * The seat this frame was redacted for ("p1"…, or "observer"), stamped at
   * send time on HOSTED rooms only. Lets the client tell a zero-trust observer
   * frame from its own seat frame at the SAME version — after a socket
   * reconnect both arrive back-to-back, and the version gate alone would drop
   * the seat-correct one (the "no Event buttons after reconnect" freeze).
   * Absent on open-table frames (the full shared state) and older servers.
   */
  viewerSeat?: string;
};

type CloseRoomResult = { closed: boolean; reason?: string };

export type RoomResetOptions = {
  mode?: GameMode;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
  sessionMode?: GameSessionMode;
  computerOpponents?: number;
};

type ClientMessage =
  | { type: "action"; requestId?: string; action: GameAction; actorClientId?: string }
  | ({ type: "reset"; requestId?: string; actorClientId?: string; adminKey?: string } & RoomResetOptions)
  | { type: "sync"; knownVersion?: number }
  | { type: "ping"; knownVersion: number };

/** The app origin the party calls to verify a socket's session token (Phase 2). */
function appUrlOf(room: Party.Room): string | undefined {
  const env = (room as unknown as { env?: Record<string, unknown> }).env;
  const url = typeof env?.HOMM3BG_APP_URL === "string" ? env.HOMM3BG_APP_URL : "";
  return url.length > 0 ? url : undefined;
}

/**
 * Where the edge posts finished-match results (Phase 6). The Durable Object has
 * no database of its own, so it reports to the app's /api/matches/report,
 * authenticated by the shared HOMM3BG_MATCH_REPORT_KEY (set the SAME value on
 * the party env AND the app deployment). Null ⇒ reporting is off on the edge.
 */
function matchReportConfigOf(room: Party.Room): { appUrl: string; key: string } | null {
  const appUrl = appUrlOf(room);
  const env = (room as unknown as { env?: Record<string, unknown> }).env;
  // Prefer the dedicated match-report secret; fall back to the admin key so a
  // deployment that already set HOMM3BG_ADMIN_KEY for room moderation still
  // records finished games when HOMM3BG_MATCH_REPORT_KEY was never configured.
  const matchKey = typeof env?.HOMM3BG_MATCH_REPORT_KEY === "string" ? env.HOMM3BG_MATCH_REPORT_KEY : "";
  const adminKey = typeof env?.HOMM3BG_ADMIN_KEY === "string" ? env.HOMM3BG_ADMIN_KEY : "";
  const key = matchKey.trim() || adminKey.trim();
  if (!appUrl || key.length === 0) {
    return null;
  }
  return { appUrl: appUrl.replace(/\/+$/, ""), key };
}

type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot; requestId?: string }
  /**
   * Immediate transport receipt for a submitted action. Large late-game hosted
   * rooms redact and serialize one full snapshot per connected seat before the
   * final action-result can be sent.
   *
   * `durable: true` additionally advertises that this server's answered-action
   * ledger SURVIVES an instance restart (it persists with the snapshot). It is
   * the client's permission to RE-SEND an unacknowledged frame: a repeat is
   * then safe even when it wakes a fresh Durable Object instance. A server
   * with only the in-memory ledger must omit it — see realtime.ts.
   */
  | { type: "action-received"; requestId: string; durable?: true }
  | {
      type: "action-result";
      requestId?: string;
      version: number;
      errors: { code: string; message: string }[];
      notices?: string[];
    }
  | { type: "pong"; version: number; viewerSeat?: string }
  /** Sent only to a sender whose reset was REFUSED (host-authority rule). */
  | { type: "reset-denied"; reason: string };

const SNAPSHOT_KEY = "snapshot";

/**
 * Legacy KV-backed Durable Objects reject any single value above 128 KiB.
 * Keep enough headroom for key/structured-clone overhead and split only rooms
 * that need it; small and already-persisted rooms retain the legacy value.
 */
const SNAPSHOT_CHUNK_BYTES = 64 * 1024;
const SNAPSHOT_INLINE_BYTES = 64 * 1024;
const SNAPSHOT_MAX_CHUNKS = 512;
type SnapshotChunkBank = "a" | "b";
type StoredSnapshotManifest = {
  format: "room-snapshot-chunks-v1";
  bank: SnapshotChunkBank;
  chunkCount: number;
  byteLength: number;
  bankChunkCounts: Record<SnapshotChunkBank, number>;
};

function isStoredSnapshotManifest(value: unknown): value is StoredSnapshotManifest {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<StoredSnapshotManifest>;
  return (
    raw.format === "room-snapshot-chunks-v1" &&
    (raw.bank === "a" || raw.bank === "b") &&
    Number.isInteger(raw.chunkCount) &&
    Number(raw.chunkCount) > 0 &&
    Number(raw.chunkCount) <= SNAPSHOT_MAX_CHUNKS &&
    Number.isInteger(raw.byteLength) &&
    Number(raw.byteLength) > 0 &&
    Boolean(raw.bankChunkCounts) &&
    Number.isInteger(raw.bankChunkCounts?.a) &&
    Number.isInteger(raw.bankChunkCounts?.b)
  );
}

function snapshotChunkKey(bank: SnapshotChunkBank, index: number): string {
  return `snapshot-chunk-${bank}-${index}`;
}

/**
 * Storage key of the answered-action ledger (see answeredActionRequests). The
 * client RE-SENDS an unacknowledged frame over a recovered socket, and the
 * repeat may land on a freshly-woken instance whose in-memory ledger is gone —
 * without this persisted copy the retry would re-apply an already-applied
 * action (a hero moving twice). Written in the same coalesced storage write as
 * the snapshot, so ledger and state can never disagree.
 */
const ANSWERED_ACTIONS_KEY = "answered-actions";

/**
 * One entry of the hibernation-surviving verified-identity cache (Fix A). Keyed
 * in Durable Object storage by a SHA-256 digest of the socket ticket (never the
 * raw token), so a WOKEN instance whose in-memory memoization was wiped — and
 * whose 10-minute socket ticket has since expired while the websocket stayed
 * open — can still resolve a signed-in actor it once verified. See
 * `resolveVerifiedIdentity` for the trust model.
 */
type StoredIdentity = VerifiedIdentity & { expiresAt: number };

/** Storage key holding the bounded { digest → StoredIdentity } record map. */
const VERIFIED_IDENTITY_CACHE_KEY = "verified-identity-cache";

const RANKED_REPLAY_META_KEY = "ranked-replay-meta";
const RANKED_REPLAY_INITIAL_PREFIX = "ranked-replay-initial-";
const RANKED_REPLAY_ENTRY_PREFIX = "ranked-replay-entry-";
const RANKED_REPLAY_CHUNK_BYTES = 96 * 1024;
const RANKED_MATCH_REPORT_OUTBOX_KEY = "ranked-match-report-outbox-v1";
type StoredRankedReplayMeta = Omit<RankedReplay, "initialState" | "entries"> & {
  initialChunkCount: number;
  entryCount: number;
};
type RankedMatchReportOutbox = {
  format: "homm3bg-ranked-match-report-outbox-v1";
  match: FinishedMatch;
  winnerPlayerId?: PlayerId;
  replayRequired: boolean;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
};

export default class GameRoomServer implements Party.Server {
  /** Snapshots persist across hibernation; connections re-sync on attach. */
  readonly options: Party.ServerOptions = { hibernate: true };

  private snapshot: RoomSnapshot | null = null;
  /** Active persisted chunk bank, null while the room still uses one inline value. */
  private persistedSnapshotBank: SnapshotChunkBank | null = null;
  /** Highest live chunk count in each alternating bank, used for bounded cleanup. */
  private persistedSnapshotChunkCounts: Record<SnapshotChunkBank, number> = { a: 0, b: 0 };
  /** Private replay buffer: never included in RoomSnapshot or broadcasts. */
  private rankedReplay: RankedReplay | null = null;
  private readonly metricsEnabled: boolean;

  /**
   * Verified-identity resolver (Phase 2). Built lazily from the HOMM3BG_APP_URL
   * env: the edge cannot read the app's httpOnly cookie cross-origin, so it
   * resolves a socket's raw session token by calling back to the app's
   * /api/auth/verify-token route. Memoized so only the first action per token
   * pays the round-trip. Null (and every action stays a guest) when no app URL
   * is configured — the current guest behaviour, unchanged.
   */
  private tokenVerifier: TokenVerifier | null | undefined;

  /**
   * Raw tokens already write-through to the storage identity cache this
   * instance lifetime — so a cache HIT (live verify still succeeds) never
   * churns storage on every broadcast/action. In-memory only (like the
   * memoization), so a cold wake starts empty and re-persists once per token.
   */
  private persistedTokens = new Set<string>();

  /**
   * In-memory mirror of identities RECALLED from the storage cache (a lapsed
   * ticket on this instance). Purely a fast path: entries originate from the
   * storage cache alone and carry its expiresAt, so the trust model is
   * unchanged; see resolveVerifiedIdentity. Lost on instance death by design.
   */
  private recalledIdentities = new Map<string, StoredIdentity>();

  /**
   * Serializes rememberVerifiedIdentity's get-modify-put: the parallel hosted
   * fan-out can verify several fresh tokens in one broadcast, and interleaved
   * get/get/put/put would let the last write clobber the other token's entry
   * while persistedTokens marks BOTH persisted (the clobbered one then never
   * re-persists for the instance lifetime).
   */
  private identityWriteQueue: Promise<void> = Promise.resolve();

  /** Identity-cache tuning: one full game session, bounded to a small map. */
  private static readonly VERIFIED_IDENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly VERIFIED_IDENTITY_CACHE_MAX = 64;

  /**
   * Serializes every snapshot MUTATION on this room. A Durable Object delivers
   * new events while a handler is awaiting non-storage work (the identity
   * verification fetch), so without this two concurrent actions could both
   * read the same snapshot, both apply against it, and both write
   * `version + 1` — the first writer's action vanished while its reply still
   * reported success ("I clicked, got nothing"; lost Event choices, stuck
   * round barriers). Every read-modify-write of `this.snapshot` goes through
   * `serialized()`; read-only paths (sync, GET) stay lock-free. Identity
   * verification is resolved BEFORE taking the lock so one player's slow
   * token fetch never stalls the whole table.
   */
  private mutationQueue: Promise<unknown> = Promise.resolve();

  private serialized<T>(run: () => Promise<T>): Promise<T> {
    const queuedAt = Date.now();
    const execute = () => {
      this.metric("room.mutation.queue", queuedAt);
      return run();
    };
    const next = this.mutationQueue.then(execute, execute);
    // Keep the chain alive whether `run` resolved or rejected.
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Recently answered action requestIds (keyed by sender identity), so a
   * DUPLICATED frame — a client retry after a socket flap, a double-send — is
   * answered from this ledger with the original outcome instead of applying
   * the same action twice. Bounded FIFO (Map keeps insertion order). APPLIED
   * outcomes also persist alongside the snapshot (ANSWERED_ACTIONS_KEY) so a
   * retry that wakes a fresh instance still dedupes; rejections stay
   * in-memory only — replaying a rejected action just re-rejects it.
   */
  private answeredActionRequests = new Map<
    string,
    { errors: { code: string; message: string }[]; notices: string[]; version: number }
  >();

  private static readonly ANSWERED_REQUEST_CAP = 256;
  /** How many answered outcomes ride the persisted ledger (newest kept). */
  private static readonly ANSWERED_PERSISTED_CAP = 64;

  private recordAnsweredRequest(
    key: string,
    outcome: { errors: { code: string; message: string }[]; notices: string[]; version: number }
  ): void {
    if (this.answeredActionRequests.size >= GameRoomServer.ANSWERED_REQUEST_CAP) {
      const oldest = this.answeredActionRequests.keys().next().value;
      if (oldest !== undefined) {
        this.answeredActionRequests.delete(oldest);
      }
    }
    this.answeredActionRequests.set(key, outcome);
  }

  /**
   * Ledger keys for one request: the outcome is recorded under BOTH the
   * verified account id and the per-tab clientId (when present), so a RETRY
   * whose identity verification degraded in either direction — a timed-out
   * verify falling back to guest, or a guest-applied first send verifying on
   * the repeat — still finds the recorded outcome instead of re-applying.
   */
  private dedupeKeysFor(requestId: string, userId: string | undefined, clientKey: string): string[] {
    const keys: string[] = [];
    if (userId) {
      keys.push(`${userId}:${requestId}`);
    }
    keys.push(`${clientKey}:${requestId}`);
    return keys;
  }

  /** The newest answered outcomes, as the JSON-serializable persisted ledger. */
  private persistableAnsweredRequests(): Record<
    string,
    { errors: { code: string; message: string }[]; notices: string[]; version: number }
  > {
    const entries = [...this.answeredActionRequests.entries()];
    return Object.fromEntries(entries.slice(-GameRoomServer.ANSWERED_PERSISTED_CAP));
  }

  constructor(readonly room: Party.Room) {
    const env = (room as unknown as { env?: Record<string, unknown> }).env;
    const rate = Math.max(0, Math.min(1, Number(env?.PERFORMANCE_METRICS_SAMPLE_RATE ?? 0)));
    this.metricsEnabled = rate > 0 && Math.random() < rate;
  }

  private metric(name: string, startedAt: number, fields: Record<string, string | number | boolean> = {}): void {
    if (!this.metricsEnabled) return;
    console.info(JSON.stringify({ metric: name, durationMs: Date.now() - startedAt, roomId: this.roomIdSafe(), ...fields }));
  }

  /**
   * The room id, readable from ANY handler. `this.room.id` THROWS inside
   * onAlarm (a documented PartyKit limitation), so alarm-reachable code must
   * come through here — the persisted snapshot carries the same id.
   */
  private roomIdSafe(): string {
    try {
      return this.room.id;
    } catch {
      return this.snapshot?.roomId ?? "unknown";
    }
  }

  private connectionCount(): number {
    const getConnections = (this.room as unknown as { getConnections?: () => Iterable<Party.Connection> }).getConnections;
    return typeof getConnections === "function" ? [...getConnections.call(this.room)].length : 0;
  }

  private verifier(): TokenVerifier | null {
    if (this.tokenVerifier === undefined) {
      const appUrl = appUrlOf(this.room);
      this.tokenVerifier = appUrl
        ? memoizeVerifier(httpTokenVerifier(appUrl, (input, init) => fetch(input, init)))
        : null;
    }
    return this.tokenVerifier;
  }

  /** The raw session token the client attached to the socket URL, if any. */
  private tokenOf(connection: Party.Connection): string | undefined {
    const uri = (connection as unknown as { uri?: string }).uri;
    if (!uri) {
      return undefined;
    }
    try {
      return new URL(uri).searchParams.get("token") ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * SHA-256 hex digest of a token — the storage cache key (never the raw token).
   * `crypto.subtle` is available in the Workers runtime and Node ≥18.
   */
  private async tokenDigest(token: string): Promise<string> {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Resolve a socket/request token to its verified identity — DURABLY (Fix A).
   *
   * TRUST MODEL: this makes the in-memory positive memoization survive
   * Cloudflare hibernation. When the live app callback verifies a token we WRITE
   * THROUGH the resulting identity to THIS room's Durable Object storage, keyed
   * by a SHA-256 digest of the token. When a later verify FAILS — the canonical
   * case is a woken instance whose 10-minute socket ticket has since expired
   * while the websocket stayed open — we fall back to that stored entry.
   *
   * We NEVER grant identity for a token that never successfully verified (the
   * store is written only on a real success), so possession of the ticket was
   * already the credential; this only extends its validity for THIS room,
   * exactly as the in-memory memoization already did for the instance's
   * lifetime. A ban/logout still bites at the client's next FRESH connect: a new
   * ticket that never verifies has no stored entry to fall back on. Entries live
   * 24h (a full session), bounded to 64, oldest/expired pruned on write.
   * Degrades to guest (null) on any failure — never throws, never blocks.
   */
  private async resolveVerifiedIdentity(token: string | undefined | null): Promise<VerifiedIdentity | null> {
    const verify = this.verifier();
    if (!verify || !token) {
      return null;
    }
    // Post-expiry steady state: once a LAPSED ticket has been recalled from
    // storage on this instance, answer from the in-memory mirror — otherwise
    // every later action would pay a failed HTTP verify round-trip plus a
    // storage read for the rest of the session. Entries only ever come from
    // the storage cache (written on a real verify success alone) and keep its
    // expiresAt, so the trust model and expiry are identical; instance death
    // simply drops the mirror and the next action re-reads storage.
    const mirrored = this.recalledIdentities.get(token);
    if (mirrored && mirrored.expiresAt > Date.now()) {
      return { userId: mirrored.userId, nickname: mirrored.nickname, isAdmin: mirrored.isAdmin };
    }
    const live = await verify(token);
    if (live) {
      await this.rememberVerifiedIdentity(token, live);
      return live;
    }
    return this.recallVerifiedIdentity(token);
  }

  /**
   * Write-through a freshly-verified identity to storage, at most once per token
   * per instance lifetime (the `persistedTokens` guard keeps the happy path —
   * cache hits on every broadcast — from churning storage). Best-effort: a
   * storage hiccup only costs a future cold wake a live re-verify, never a
   * crashed action.
   */
  private async rememberVerifiedIdentity(token: string, identity: VerifiedIdentity): Promise<void> {
    if (this.persistedTokens.has(token)) {
      return;
    }
    const work = () => this.rememberVerifiedIdentityNow(token, identity);
    const queued = this.identityWriteQueue.then(work, work);
    this.identityWriteQueue = queued;
    return queued;
  }

  private async rememberVerifiedIdentityNow(token: string, identity: VerifiedIdentity): Promise<void> {
    if (this.persistedTokens.has(token)) {
      return;
    }
    try {
      const digest = await this.tokenDigest(token);
      const now = Date.now();
      const stored =
        (await this.room.storage.get<Record<string, StoredIdentity>>(VERIFIED_IDENTITY_CACHE_KEY)) ?? {};
      stored[digest] = { ...identity, expiresAt: now + GameRoomServer.VERIFIED_IDENTITY_CACHE_TTL_MS };
      // Drop expired, then bound the map (oldest expiry evicted first) so a room
      // churning through many tokens can never grow storage without limit.
      let entries = Object.entries(stored).filter(([, entry]) => entry.expiresAt > now);
      if (entries.length > GameRoomServer.VERIFIED_IDENTITY_CACHE_MAX) {
        entries = entries
          .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
          .slice(entries.length - GameRoomServer.VERIFIED_IDENTITY_CACHE_MAX);
      }
      await this.room.storage.put(VERIFIED_IDENTITY_CACHE_KEY, Object.fromEntries(entries));
      this.persistedTokens.add(token);
      if (this.persistedTokens.size > GameRoomServer.VERIFIED_IDENTITY_CACHE_MAX * 4) {
        // Keep the in-memory guard bounded too; a dropped token just re-persists.
        this.persistedTokens.clear();
      }
    } catch (error) {
      console.warn("[verified-identity] failed to persist token identity", error);
    }
  }

  /** Read a non-expired stored identity for a token, or null. Never throws. */
  private async recallVerifiedIdentity(token: string): Promise<VerifiedIdentity | null> {
    try {
      const digest = await this.tokenDigest(token);
      const stored =
        (await this.room.storage.get<Record<string, StoredIdentity>>(VERIFIED_IDENTITY_CACHE_KEY)) ?? {};
      const entry = stored[digest];
      if (!entry || entry.expiresAt <= Date.now()) {
        return null;
      }
      // Prime the in-memory mirror so the NEXT action for this lapsed ticket
      // skips both the failed HTTP verify and this storage read (see
      // resolveVerifiedIdentity). Bounded like persistedTokens.
      if (this.recalledIdentities.size > GameRoomServer.VERIFIED_IDENTITY_CACHE_MAX * 4) {
        this.recalledIdentities.clear();
      }
      this.recalledIdentities.set(token, entry);
      return { userId: entry.userId, nickname: entry.nickname, isAdmin: entry.isAdmin };
    } catch {
      return null;
    }
  }

  /**
   * The VERIFIED account id for a socket, or undefined for a guest. Authoritative
   * over any client-claimed actorClientId (Phase 2): the engine binds a signed-in
   * actor to their seat by this id, so a spoofed clientId can no longer act for a
   * verified seat. A verification failure degrades to guest, never throws.
   */
  private async verifiedUserId(connection: Party.Connection): Promise<string | undefined> {
    return (await this.resolveVerifiedIdentity(this.tokenOf(connection)))?.userId;
  }

  /**
   * Whether the socket's verified session belongs to a PLATFORM ADMIN. Resolved
   * from the same token callback as the seat identity, so a spoofed clientId
   * cannot claim it. Lets an admin close/reset ANY room over the edge, matching
   * the built-in backend (which reads the role from the session cookie). False
   * for a guest, an ordinary player, or when no app URL is configured.
   */
  private async verifiedIsAdmin(connection: Party.Connection): Promise<boolean> {
    return (await this.resolveVerifiedIdentity(this.tokenOf(connection)))?.isAdmin === true;
  }

  private rankedReplayCaptureEnabled(): boolean {
    const env = (this.room as unknown as { env?: Record<string, unknown> }).env;
    return rankedReplayEnabled(env?.HOMM3BG_RANKED_REPLAY_ENABLED);
  }

  private replayMeta(replay: RankedReplay, initialChunkCount: number): StoredRankedReplayMeta {
    const header = { ...replay } as Partial<RankedReplay>;
    delete header.initialState;
    delete header.entries;
    return {
      ...(header as Omit<RankedReplay, "initialState" | "entries">),
      initialChunkCount,
      entryCount: replay.entries.length,
    };
  }

  private async persistNewRankedReplay(replay: RankedReplay): Promise<void> {
    const encoded = new TextEncoder().encode(JSON.stringify(replay.initialState));
    const initialChunkCount = Math.ceil(encoded.byteLength / RANKED_REPLAY_CHUNK_BYTES);
    const write = async (storage: Pick<Party.Storage, "put">): Promise<void> => {
      const writes: Promise<unknown>[] = [];
      for (let index = 0; index < initialChunkCount; index += 1) {
        const start = index * RANKED_REPLAY_CHUNK_BYTES;
        writes.push(
          storage.put(
            `${RANKED_REPLAY_INITIAL_PREFIX}${index}`,
            encoded.slice(start, start + RANKED_REPLAY_CHUNK_BYTES),
          ),
        );
      }
      writes.push(storage.put(RANKED_REPLAY_META_KEY, this.replayMeta(replay, initialChunkCount)));
      await Promise.all(writes);
    };
    // The Round-1 header and every initial-state chunk become visible together.
    // A failed pre-start write therefore leaves the setup lobby untouched and
    // never leaves a meta record pointing at half an initial state.
    if (typeof this.room.storage.transaction === "function") {
      await this.room.storage.transaction(async (transaction) => write(transaction));
    } else {
      // Test/local storage shims predate DurableObjectStorage.transaction.
      await write(this.room.storage);
    }
  }

  private async persistRankedReplayAppend(previousCount: number, replay: RankedReplay): Promise<void> {
    const stored = await this.room.storage.get<StoredRankedReplayMeta>(RANKED_REPLAY_META_KEY);
    const initialChunkCount = stored?.initialChunkCount ?? 0;
    const write = async (storage: Pick<Party.Storage, "put">): Promise<void> => {
      // Entries must become durable no later than the meta count that exposes
      // them. A cold wake that sees entryCount=N with entry N-1 missing treats
      // the buffer as corrupt and used to restart capture at the current round.
      for (let index = previousCount; index < replay.entries.length; index += 1) {
        await storage.put(`${RANKED_REPLAY_ENTRY_PREFIX}${index}`, replay.entries[index]!);
      }
      await storage.put(RANKED_REPLAY_META_KEY, this.replayMeta(replay, initialChunkCount));
    };
    if (typeof this.room.storage.transaction === "function") {
      await this.room.storage.transaction(async (transaction) => write(transaction));
    } else {
      // Legacy/test shims: entry-first ordering leaves an ignored extra entry
      // on interruption, never a meta record that points past durable data.
      await write(this.room.storage);
    }
  }

  private async loadRankedReplay(): Promise<RankedReplay | null> {
    const meta = await this.room.storage.get<StoredRankedReplayMeta>(RANKED_REPLAY_META_KEY);
    if (!meta || meta.format !== "homm3bg-ranked-replay-v1") return null;
    const chunks = await Promise.all(
      Array.from({ length: meta.initialChunkCount }, (_, index) =>
        this.room.storage.get<Uint8Array>(`${RANKED_REPLAY_INITIAL_PREFIX}${index}`),
      ),
    );
    if (chunks.some((chunk) => !(chunk instanceof Uint8Array))) return null;
    const initialBytes = chunks.reduce((sum, chunk) => sum + chunk!.byteLength, 0);
    const joined = new Uint8Array(initialBytes);
    let offset = 0;
    for (const chunk of chunks as Uint8Array[]) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const entries: RankedReplay["entries"] = [];
    // Read in bounded batches so a long game never creates thousands of live
    // storage promises at once during a cold wake.
    for (let start = 0; start < meta.entryCount; start += 100) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(100, meta.entryCount - start) }, (_, offsetIndex) =>
          this.room.storage.get<RankedReplay["entries"][number]>(
            `${RANKED_REPLAY_ENTRY_PREFIX}${start + offsetIndex}`,
          ),
        ),
      );
      if (batch.some((entry) => !entry)) return null;
      entries.push(...(batch as RankedReplay["entries"]));
    }
    const header = { ...meta } as Partial<StoredRankedReplayMeta>;
    delete header.initialChunkCount;
    delete header.entryCount;
    return {
      ...(header as Omit<RankedReplay, "initialState" | "entries">),
      initialState: JSON.parse(new TextDecoder().decode(joined)) as GameState,
      entries,
    };
  }

  private async clearRankedReplayStorage(replay = this.rankedReplay): Promise<void> {
    const meta = await this.room.storage.get<StoredRankedReplayMeta>(RANKED_REPLAY_META_KEY);
    const deletes: Promise<unknown>[] = [this.room.storage.delete(RANKED_REPLAY_META_KEY)];
    for (let index = 0; index < (meta?.initialChunkCount ?? 0); index += 1) {
      deletes.push(this.room.storage.delete(`${RANKED_REPLAY_INITIAL_PREFIX}${index}`));
    }
    for (let index = 0; index < (meta?.entryCount ?? replay?.entries.length ?? 0); index += 1) {
      deletes.push(this.room.storage.delete(`${RANKED_REPLAY_ENTRY_PREFIX}${index}`));
    }
    await Promise.all(deletes);
    this.rankedReplay = null;
  }

  private async captureRankedReplay(
    before: GameState,
    action: GameAction,
    result: ReturnType<typeof applyAction>,
    options: { actorClientId?: string; entropy: string; now: number },
  ): Promise<void> {
    if (!this.rankedReplayCaptureEnabled()) return;
    if (this.rankedReplay?.truncated) return;
    if (this.rankedReplay && this.rankedReplay.matchId !== before.seed) {
      await this.clearRankedReplayStorage();
    }
    const startsRankedAdventure =
      !rankedClashReplayEligible(before) && rankedClashReplayEligible(result.state);
    // START_ADVENTURE is preflighted before the room snapshot commit and then
    // passes this method once more after that commit. Treat the second call as
    // an idempotent confirmation, not as replay entry 1.
    if (
      this.rankedReplay &&
      startsRankedAdventure &&
      this.rankedReplay.matchId === result.state.seed &&
      this.rankedReplay.captureStart === "adventure-start" &&
      this.rankedReplay.entries.length === 0
    ) {
      return;
    }
    if (!this.rankedReplay) {
      if (rankedClashReplayEligible(before)) {
        const started = createRankedReplay(before, options.now, "mid-match-recovery");
        await this.persistNewRankedReplay(started);
        this.rankedReplay = started;
      } else if (startsRankedAdventure) {
        const started = createRankedReplay(result.state, options.now, "adventure-start");
        await this.persistNewRankedReplay(started);
        this.rankedReplay = started;
        return;
      } else {
        return;
      }
    }
    const current = this.rankedReplay;
    const next = appendRankedReplayEntry(current, before, action, result, options);
    const previousEntry = current.entries.at(-1);
    const candidateEntry = next.entries.at(-1);
    // A terminal UI can race its WebSocket submit with HTTP recovery and hand
    // us the exact same accepted transition twice. The room state/result is
    // already idempotent, so keep the replay idempotent too; otherwise the
    // duplicate's old before-hash creates a false chain break.
    if (
      previousEntry &&
      candidateEntry &&
      previousEntry.beforeStateHash === candidateEntry.beforeStateHash &&
      previousEntry.afterStateHash === candidateEntry.afterStateHash &&
      previousEntry.actorPlayerId === candidateEntry.actorPlayerId &&
      JSON.stringify(previousEntry.action) === JSON.stringify(candidateEntry.action)
    ) {
      return;
    }
    await this.persistRankedReplayAppend(current.entries.length, next);
    this.rankedReplay = next;
  }

  async onStart(): Promise<void> {
    const stored = await this.loadPersistedSnapshot();
    // Reclaim an abandoned single-player game. Its room is a private, isolated
    // Durable Object that no lobby sweeper can reach (it never enters the
    // directory and the per-account cap deliberately never counts it), so if it
    // wakes idle past the stale TTL, drop its persisted snapshot instead of
    // resurrecting a dead game. A reconnect to a long-dead sp- id then starts
    // fresh and its storage is reclaimed on this touch. (A never-revisited sp-
    // object is reclaimed by the platform's Durable Object lifecycle — nothing
    // in-process can reach one that never wakes.)
    if (stored && isPrivateSinglePlayer(stored.state) && this.isIdlePastStaleTtl(stored.updatedAt)) {
      await this.deletePersistedSnapshot();
      await this.room.storage.delete(ANSWERED_ACTIONS_KEY);
      this.snapshot = null;
      return;
    }
    this.snapshot = stored;
    try {
      this.rankedReplay = this.rankedReplayCaptureEnabled() ? await this.loadRankedReplay() : null;
    } catch (error) {
      console.warn("[ranked-replay] failed to restore capture; starting a fresh bounded buffer", error);
      this.rankedReplay = null;
    }
    try {
      const outbox = await this.room.storage.get<RankedMatchReportOutbox>(RANKED_MATCH_REPORT_OUTBOX_KEY);
      if (outbox?.format === "homm3bg-ranked-match-report-outbox-v1") {
        await this.ensureComputerPump(0);
      }
    } catch (error) {
      console.warn("[match-report] failed to restore pending delivery alarm", error);
    }
    // Rehydrate the answered-action ledger so a client retry that woke this
    // instance is answered from the recorded outcome, never applied twice.
    try {
      const answered = await this.room.storage.get<
        Record<string, { errors: { code: string; message: string }[]; notices: string[]; version: number }>
      >(ANSWERED_ACTIONS_KEY);
      if (answered) {
        for (const [key, outcome] of Object.entries(answered)) {
          this.answeredActionRequests.set(key, outcome);
        }
      }
    } catch {
      // A missing/corrupt ledger only costs dedupe depth — never block onStart.
    }
  }

  /**
   * True when a stamp is older than the stale-room TTL. A NaN/absent stamp is
   * treated as fresh (never purge on bad data), and a frozen/behind edge clock
   * only ever under-reports the age, so this can never wrongly discard a live
   * game — it only reclaims one that is unambiguously abandoned.
   */
  private isIdlePastStaleTtl(updatedAt: string): boolean {
    const updatedMs = Date.parse(updatedAt);
    if (Number.isNaN(updatedMs)) {
      return false;
    }
    return Date.now() - updatedMs > STALE_ROOM_TTL_MS;
  }

  private makeState(options: RoomResetOptions = {}): GameState {
    // Crypto entropy (freshEntropy), not Date.now()+Math.random(): PartyKit runs
    // each room as a Cloudflare Durable Object where the clock can be frozen and
    // Math.random() seeded per isolate, which made every fresh room (new game in
    // a new window) open on the identical map and Creature Bank order.
    const nonce = freshEntropy();
    const seed = `room-${this.room.id}-${nonce}`;
    const mode = options.mode ?? "adventure";

    if (mode === "combat-sandbox") {
      return createCombatSandboxLobbyState(seed);
    }

    // An `sp-` room id is minted ONLY for single-player. Default such a room to
    // single-player even when no `?singlePlayer=` marker reached this creation
    // (marker read from localStorage — absent when storage is blocked/cleared or
    // an sp- link is opened fresh, and on the bare `ensureSnapshot` fallthrough
    // from an HTTP action/snapshot request). Without this the room would be born
    // as a PUBLIC, listed multiplayer lobby, flooding the directory with what
    // must stay an invisible private game.
    const sessionMode =
      options.sessionMode ?? (isSinglePlayerRoomId(this.room.id) ? "single-player" : undefined);
    const computerOpponents =
      options.computerOpponents ?? (sessionMode === "single-player" ? 1 : undefined);

    return options.players?.length
      ? createAdventureGameState({
          seed,
          difficulty: options.difficulty,
          scenarioId: options.scenarioId,
          players: options.players,
          sessionMode,
          computerOpponents
        })
      : createAdventureLobbyState({ seed, scenarioId: options.scenarioId, sessionMode,
          computerOpponents });
  }

  private ensureSnapshot(): RoomSnapshot {
    if (!this.snapshot) {
      const now = new Date().toISOString();
      this.snapshot = {
        roomId: this.room.id,
        version: 1,
        createdAt: now,
        updatedAt: now,
        state: this.makeState()
      };
      void this.persist();
    }

    return this.snapshot;
  }

  /**
   * Reset options with the single-player session rules applied:
   * — preservation: a single-player room's "New adventure" stays single-player
   *   with the same computer-seat count unless the caller explicitly overrides
   *   the mode (plan §4.4);
   * — fresh-room-only creation: a reset may INTRODUCE single-player mode only
   *   over a memberless, unstarted setup lobby (the implicit-creation flow).
   *   An established room can never be flipped into a private single-player
   *   one by a later client — the marker is silently dropped instead.
   */
  private resetOptionsFor(previous: RoomSnapshot, options: RoomResetOptions): RoomResetOptions {
    const prev = previous.state;
    if (sessionModeOf(prev) === "single-player") {
      if (options.sessionMode !== undefined) {
        return options;
      }
      return {
        ...options,
        sessionMode: "single-player",
        computerOpponents: options.computerOpponents ?? Math.max(1, configuredComputerOpponents(prev))
      };
    }
    if (options.sessionMode === "single-player") {
      const fresh =
        prev.phase === "setup" && Boolean(prev.setupLobby) && (prev.room?.members.length ?? 0) === 0;
      if (!fresh) {
        return { ...options, sessionMode: undefined, computerOpponents: undefined };
      }
    }
    return options;
  }

  private async persist(): Promise<void> {
    if (!this.snapshot) return;

    const encoded = new TextEncoder().encode(JSON.stringify(this.snapshot));
    // Keep the direct format for small/legacy rooms. Once a room crosses the
    // boundary it remains chunked so the manifest retains both banks' cleanup
    // counts even if a reset briefly makes the state small again.
    if (encoded.byteLength <= SNAPSHOT_INLINE_BYTES && this.persistedSnapshotBank === null) {
      // Both puts are issued in the same microtask, so the Durable Object
      // runtime coalesces them into ONE atomic write — the persisted ledger
      // can never claim "answered" for a snapshot version that was not
      // persisted, nor the reverse (the double-apply / lost-answer windows).
      await Promise.all([
        this.room.storage.put(SNAPSHOT_KEY, this.snapshot),
        this.room.storage.put(ANSWERED_ACTIONS_KEY, this.persistableAnsweredRequests())
      ]);
      return;
    }

    const chunkCount = Math.ceil(encoded.byteLength / SNAPSHOT_CHUNK_BYTES);
    if (chunkCount > SNAPSHOT_MAX_CHUNKS) {
      throw new Error(`Room snapshot is too large to persist safely (${encoded.byteLength} bytes).`);
    }
    const bank: SnapshotChunkBank = this.persistedSnapshotBank === "a" ? "b" : "a";
    const previousTargetCount = this.persistedSnapshotChunkCounts[bank];
    const nextCounts = { ...this.persistedSnapshotChunkCounts, [bank]: chunkCount };
    const manifest: StoredSnapshotManifest = {
      format: "room-snapshot-chunks-v1",
      bank,
      chunkCount,
      byteLength: encoded.byteLength,
      bankChunkCounts: nextCounts
    };
    const writes: Promise<unknown>[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * SNAPSHOT_CHUNK_BYTES;
      writes.push(this.room.storage.put(snapshotChunkKey(bank, index), encoded.slice(start, start + SNAPSHOT_CHUNK_BYTES)));
    }
    // If this alternating bank used to hold a larger state, discard its unused
    // tail in the SAME coalesced transaction. The other bank remains a bounded
    // rollback generation until it is overwritten on the following commit.
    for (let index = chunkCount; index < previousTargetCount; index += 1) {
      writes.push(this.room.storage.delete(snapshotChunkKey(bank, index)));
    }
    writes.push(
      this.room.storage.put(SNAPSHOT_KEY, manifest),
      this.room.storage.put(ANSWERED_ACTIONS_KEY, this.persistableAnsweredRequests())
    );
    await Promise.all(writes);
    this.persistedSnapshotBank = bank;
    this.persistedSnapshotChunkCounts = nextCounts;
  }

  /** Read both the legacy inline value and the size-safe chunked format. */
  private async loadPersistedSnapshot(): Promise<RoomSnapshot | null> {
    const stored = (await this.room.storage.get<RoomSnapshot | StoredSnapshotManifest>(SNAPSHOT_KEY)) ?? null;
    if (!stored || !isStoredSnapshotManifest(stored)) {
      this.persistedSnapshotBank = null;
      this.persistedSnapshotChunkCounts = { a: 0, b: 0 };
      return stored as RoomSnapshot | null;
    }

    const chunks = await Promise.all(
      Array.from({ length: stored.chunkCount }, (_, index) =>
        this.room.storage.get<Uint8Array>(snapshotChunkKey(stored.bank, index))
      )
    );
    if (chunks.some((chunk) => !(chunk instanceof Uint8Array))) {
      throw new Error("Persisted room snapshot is missing one or more chunks.");
    }
    const encoded = new Uint8Array(stored.byteLength);
    let offset = 0;
    for (const chunk of chunks as Uint8Array[]) {
      if (offset + chunk.byteLength > encoded.byteLength) {
        throw new Error("Persisted room snapshot chunks exceed the manifest length.");
      }
      encoded.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (offset !== stored.byteLength) {
      throw new Error("Persisted room snapshot chunks do not match the manifest length.");
    }
    const snapshot = JSON.parse(new TextDecoder().decode(encoded)) as RoomSnapshot;
    if (!snapshot || typeof snapshot.roomId !== "string" || !snapshot.state) {
      throw new Error("Persisted room snapshot is invalid.");
    }
    this.persistedSnapshotBank = stored.bank;
    this.persistedSnapshotChunkCounts = { ...stored.bankChunkCounts };
    return snapshot;
  }

  /** Delete the manifest/legacy value and every bounded alternating chunk. */
  private async deletePersistedSnapshot(): Promise<void> {
    const deletes: Promise<unknown>[] = [this.room.storage.delete(SNAPSHOT_KEY)];
    for (const bank of ["a", "b"] as const) {
      for (let index = 0; index < this.persistedSnapshotChunkCounts[bank]; index += 1) {
        deletes.push(this.room.storage.delete(snapshotChunkKey(bank, index)));
      }
    }
    await Promise.all(deletes);
    this.persistedSnapshotBank = null;
    this.persistedSnapshotChunkCounts = { a: 0, b: 0 };
  }

  /**
   * Creation identity carried across every new snapshot version: the original
   * `createdAt`, plus `createdByName` captured the first time the room has a
   * member (the lobby's creator attribution, since the edge has no separate
   * "create" call that could pass it). Read from the CURRENT snapshot, which is
   * still the previous version while a new one is being built.
   */
  private creationMeta(state: GameState): { createdAt?: string; createdByName?: string } {
    const createdAt = this.snapshot?.createdAt;
    let createdByName = this.snapshot?.createdByName;
    if (!createdByName) {
      const firstMember = state.room?.members[0];
      if (firstMember?.name) {
        createdByName = firstMember.name;
      }
    }
    return {
      ...(createdAt ? { createdAt } : {}),
      ...(createdByName ? { createdByName } : {})
    };
  }

  /** Directory-record signature last reported to the lobby (skip-if-unchanged). */
  private lastReportedSignature: string | null = null;
  /** `updatedAt` of the last record reported (for the throttled activity refresh). */
  private lastReportedAt: string | null = null;

  /**
   * Report this room to the lobby Durable Object so it shows up in (and updates
   * within) the room browser. Fires when a directory-relevant field changed OR
   * — while the room is still being played — when the last report's stamp has
   * aged past the activity-refresh interval (see {@link lobbyReportIsDue}), so
   * ordinary game actions don't spam the lobby yet an active game keeps a fresh
   * `updatedAt` and is never idle-pruned mid-game. Best-effort: a failed report
   * is retried on the next change, and a missing lobby party (e.g. local
   * single-room dev) is simply a no-op.
   */
  private async reportToLobby(): Promise<void> {
    const snapshot = this.snapshot;
    const lobby = this.room.context?.parties?.lobby;
    if (!snapshot || !lobby) {
      return;
    }
    if (isPrivateSinglePlayer(snapshot.state)) {
      await this.deregisterFromLobby();
      return;
    }
    const record = deriveLobbyRecord({
      roomId: this.room.id,
      state: snapshot.state,
      createdAt: snapshot.createdAt ?? snapshot.updatedAt,
      updatedAt: snapshot.updatedAt,
      createdByName: snapshot.createdByName ?? null
    });
    const signature = lobbyRecordSignature(record);
    if (!lobbyReportIsDue(this.lastReportedSignature, signature, this.lastReportedAt, snapshot.updatedAt)) {
      return;
    }
    this.lastReportedSignature = signature;
    this.lastReportedAt = snapshot.updatedAt;
    try {
      await lobby.get(LOBBY_SINGLETON_ID).fetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
    } catch {
      // Let the next change retry rather than going permanently silent.
      this.lastReportedSignature = null;
      this.lastReportedAt = null;
    }
  }

  /** Remove this room from the lobby directory when it is closed. */
  private async deregisterFromLobby(): Promise<void> {
    const lobby = this.room.context?.parties?.lobby;
    this.lastReportedSignature = null;
    this.lastReportedAt = null;
    if (!lobby) {
      return;
    }
    try {
      await lobby.get(LOBBY_SINGLETON_ID).fetch({
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: this.room.id })
      });
    } catch {
      // Best effort; the lobby also expires empty rooms after the TTL.
    }
  }

  /**
   * Wire-only event-log tail (flagged experiment, plan N4): with the
   * HOMM3BG_BROADCAST_EVENT_TAIL env var set to a positive integer K, every
   * OUTGOING snapshot carries only the last K eventLog entries — the log is
   * ~45% of a late-game frame, re-sent to every connection on every action.
   * STORAGE always keeps the engine's full log (the trim runs in signed(),
   * which never touches this.snapshot); absent/0 = off = full log, exactly
   * today's behaviour. Safe because client presentation is cursor-based
   * (src/lib/presentation-event-window.ts): a tail starting past the cursor
   * reads as log rotation — history primes from state, nothing replays. The
   * known trade-off is feed scrollback depth after a reload. Delete this flag
   * when protocol v2 (scaling-plan Phase 4 deltas) ships.
   */
  private broadcastEventTail(): number {
    const env = (this.room as unknown as { env?: Record<string, unknown> }).env;
    const raw = Number(env?.HOMM3BG_BROADCAST_EVENT_TAIL ?? 0);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  }

  /**
   * Stamp this server's engine signature onto an outgoing snapshot. Done at
   * send time (not persisted) so a snapshot stored by an older deploy is
   * always re-broadcast with the *running* server's signature. This is the
   * ONE shared spot every outgoing frame flows through (broadcast, connect
   * frame, sync reply, HTTP GET), so the N4 wire-only event tail is applied
   * here too — callers must derive any further redaction from the returned
   * copy, never from this.snapshot.state again.
   */
  private signed(snapshot: RoomSnapshot): RoomSnapshot {
    const stamped = { ...snapshot, serverSignature: ENGINE_SIGNATURE };
    const tail = this.broadcastEventTail();
    if (!tail || !Array.isArray(stamped.state?.eventLog) || stamped.state.eventLog.length <= tail) {
      return stamped;
    }
    return {
      ...stamped,
      state: { ...stamped.state, eventLog: stamped.state.eventLog.slice(-tail) }
    };
  }

  /**
   * Developer override for destructive room ops: a request carrying the
   * deployment's HOMM3BG_ADMIN_KEY (PartyKit env var) may reset or close ANY
   * table. With no key configured the override does not exist — an empty or
   * missing env never matches anything.
   */
  private adminAuthorizes(adminKey: string | undefined): boolean {
    const env = (this.room as unknown as { env?: Record<string, unknown> }).env;
    const configured = typeof env?.HOMM3BG_ADMIN_KEY === "string" ? env.HOMM3BG_ADMIN_KEY : "";
    return configured.length > 0 && adminKey === configured;
  }

  /** Whether the given clientId currently holds a live socket on this room. */
  private isClientConnected(clientId: string | null): boolean {
    if (!clientId) {
      return false;
    }
    for (const connection of this.room.getConnections()) {
      if (this.clientIdOf(connection) === clientId) {
        return true;
      }
    }
    return false;
  }

  /**
   * The clientIds currently holding a live socket on this room (for
   * RECLAIM_HOST). Called on every action, so it degrades gracefully if the
   * runtime cannot enumerate connections — an unknown live set just means host
   * recovery cannot verify the host is present (treated as absent), never a
   * crashed action.
   */
  private liveClientIds(): string[] {
    const ids: string[] = [];
    const getConnections = (this.room as { getConnections?: () => Iterable<Party.Connection> | undefined })
      .getConnections;
    const connections = typeof getConnections === "function" ? getConnections.call(this.room) : undefined;
    if (!connections || typeof (connections as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
      return ids;
    }
    for (const connection of connections) {
      const clientId = this.clientIdOf(connection);
      if (clientId && !ids.includes(clientId)) {
        ids.push(clientId);
      }
    }
    return ids;
  }

  /**
   * Mirrors the store's authorizeHostedWipe for the two destructive room ops
   * (reset and close) — both wipe the running game for every seat. HOSTED
   * room: the host always may; any MEMBER may while the host holds no live
   * socket (per-tab client ids die with the browser, so a restarted host must
   * not strand the table); a stranger never may. An OPEN table has no
   * ownership to protect, so anyone may.
   */
  private hostAuthorizes(actorClientId: string | undefined, verb: "reset" | "close"): { allowed: boolean; reason?: string } {
    const room = this.snapshot?.state.room ?? null;
    if (!room?.hosted) {
      // Open table: no ownership to protect.
      return { allowed: true };
    }
    if (actorClientId && actorClientId === room.hostClientId) {
      return { allowed: true };
    }
    const isMember = Boolean(actorClientId) && room.members.some((member) => member.clientId === actorClientId);
    if (!isMember) {
      return { allowed: false, reason: `Only members of this room can ${verb} it.` };
    }
    if (this.isClientConnected(room.hostClientId)) {
      return { allowed: false, reason: `Only the host can ${verb} this room while the host is connected.` };
    }
    return { allowed: true };
  }

  private authorizeClose(actorClientId: string | undefined, adminKey?: string, isAdmin = false): CloseRoomResult {
    // A verified platform admin (from the socket ticket) or the developer's
    // admin key may close ANY room, exactly like the built-in backend.
    if (isAdmin || this.adminAuthorizes(adminKey)) {
      return { closed: true };
    }
    const authority = this.hostAuthorizes(actorClientId, "close");
    return authority.allowed ? { closed: true } : { closed: false, reason: authority.reason };
  }

  /**
   * A signed snapshot redacted to ONE actor's own seat (Phase 2,
   * per-connection redaction). On a hosted room a devtools reader on the socket
   * never sees another seat's hidden info; an open table keeps the full shared
   * frame (the client redacts locally), so it stays the O(1) fast path.
   */
  private redactSnapshotForActor(signed: RoomSnapshot, actor: { clientId?: string; userId?: string }): RoomSnapshot {
    const room = signed.state.room;
    if (!room?.hosted) {
      return signed;
    }
    const seat = seatForViewer(signed.state, actor);
    const viewer = seat === "observer" ? OBSERVER_VIEWER_SEAT : seat;
    // Stamp which seat this frame is redacted for, so the client can accept a
    // seat-correct frame that follows an observer frame at the SAME version
    // (the post-reconnect redaction refresh) without weakening its version gate.
    return { ...signed, viewerSeat: viewer, state: redactStateForSeat(signed.state, viewer) };
  }

  /** The signed snapshot redacted to one live socket's seat. */
  private async snapshotForConnection(connection: Party.Connection): Promise<RoomSnapshot> {
    const userId = await this.verifiedUserId(connection);
    // Re-read AFTER the await: another event may have advanced (or re-created)
    // the snapshot while the token verification round-trip was in flight.
    return this.redactSnapshotForActor(this.signed(this.ensureSnapshot()), {
      clientId: this.clientIdOf(connection),
      userId
    });
  }

  /** The raw `?token=` on an HTTP request URL, or undefined. */
  private tokenFromRequest(request: Party.Request): string | undefined {
    try {
      return new URL(request.url).searchParams.get("token") ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** The verified account id for an HTTP request's `?token=`, or undefined. */
  private async verifiedUserIdFromRequest(request: Party.Request): Promise<string | undefined> {
    return (await this.resolveVerifiedIdentity(this.tokenFromRequest(request)))?.userId;
  }

  /**
   * Whether an HTTP request's `?token=` belongs to a PLATFORM ADMIN. Backs the
   * admin panel's "Delete" on the edge: the admin is a stranger to the hosted
   * room, so only this role bypass lets them close it. False on any failure.
   */
  private async verifiedIsAdminFromRequest(request: Party.Request): Promise<boolean> {
    return (await this.resolveVerifiedIdentity(this.tokenFromRequest(request)))?.isAdmin === true;
  }

  private async broadcastSnapshot(requestId?: string): Promise<void> {
    const startedAt = Date.now();
    if (!this.snapshot) {
      return;
    }
    const room = this.snapshot.state.room;
    if (!room?.hosted) {
      // Open table: one shared frame to everyone (the client redacts locally).
      const frame = JSON.stringify({
        type: "snapshot",
        snapshot: this.signed(this.snapshot),
        ...(requestId ? { requestId } : {})
      } satisfies ServerMessage);
      try {
        this.room.broadcast(frame);
      } catch (error) {
        // Persistence is the transaction boundary. A stale/broken recipient
        // must never turn a committed action into a failed action response;
        // socket health/sync will repair that recipient independently.
        console.warn("[room-broadcast] open-room fan-out failed", error);
      }
      this.metric("room.broadcast", startedAt, {
        connections: this.connectionCount(),
        hosted: false,
        bytes: new TextEncoder().encode(frame).byteLength
      });
      return;
    }
    // Hosted: each socket gets a frame redacted to its own seat. Resolve seats
    // in parallel so four slow identity callbacks cost one bounded timeout,
    // not four sequential timeouts.
    await Promise.all(
      [...this.room.getConnections()].map(async (connection) => {
        try {
          const redactStartedAt = Date.now();
          const snapshot = await this.snapshotForConnection(connection);
          this.metric("room.redaction", redactStartedAt, { version: snapshot.version });
          const serializeStartedAt = Date.now();
          const frame = JSON.stringify({
            type: "snapshot",
            snapshot,
            ...(requestId ? { requestId } : {})
          } satisfies ServerMessage);
          connection.send(frame);
          this.metric("room.serialization", serializeStartedAt, {
            version: snapshot.version,
            bytes: new TextEncoder().encode(frame).byteLength
          });
        } catch (error) {
          // Continue to the other seats. One dead socket used to abort fan-out
          // and strand the sender without an action-result after commit.
          console.warn("[room-broadcast] hosted recipient failed", error);
        }
      })
    );
    this.metric("room.broadcast", startedAt, { connections: this.connectionCount(), hosted: true });
  }

  /**
   * Complete the initiating request as soon as its authoritative state is
   * persisted. Full snapshot fan-out is delivery work, not part of the room
   * transaction, and may legitimately be slower on a large hosted table.
   */
  private sendActionResult(
    sender: Party.Connection,
    requestId: string | undefined,
    outcome: {
      version: number;
      errors: { code: string; message: string }[];
      notices: string[];
    }
  ): void {
    const reply: ServerMessage = {
      type: "action-result",
      requestId,
      version: outcome.version,
      errors: outcome.errors,
      ...(outcome.notices.length > 0 ? { notices: outcome.notices } : {})
    };
    try {
      sender.send(JSON.stringify(reply));
    } catch (error) {
      // The action is already committed. A dead initiating socket will recover
      // from the persisted snapshot on reconnect; never poison the room queue.
      console.warn("[room-action] could not deliver action-result", error);
    }
  }

  /**
   * Single-player paced computer turns. Durable Object alarms survive
   * hibernation (setTimeout does not with `hibernate: true`). Each alarm tick
   * applies ONE computer action, broadcasts, and re-arms until the human owns
   * the next decision — so the human watches move → roll → reward → move.
   */
  private async scheduleComputerPump(delayMs: number): Promise<void> {
    try {
      await this.room.storage.setAlarm(Date.now() + Math.max(0, delayMs));
    } catch (error) {
      console.warn("[computer-runner] failed to arm computer alarm", error);
    }
  }

  /**
   * Arm the pump only when NO alarm is already pending — the self-heal path
   * (onConnect) must never postpone a due tick by overwriting it.
   */
  private async ensureComputerPump(delayMs: number): Promise<void> {
    try {
      const pending = await this.room.storage.getAlarm();
      if (pending !== null && pending !== undefined) {
        return;
      }
    } catch {
      // getAlarm unavailable (old runtime/mock): fall through and arm.
    }
    await this.scheduleComputerPump(delayMs);
  }

  /** Retry pace after a FAILED alarm tick — slower than a normal step so a
   *  persistent fault (storage hiccup, throwing socket) can never hot-loop. */
  private static readonly COMPUTER_PUMP_RETRY_MS = 5_000;

  async onAlarm(): Promise<void> {
    try {
      const reportDelivery = await this.deliverRankedMatchReportOutbox();
      if (reportDelivery === "pending" || (reportDelivery === "delivered" && !this.snapshot)) {
        return;
      }
      await this.runComputerPumpTick();
    } catch (error) {
      // A failed tick (a storage/broadcast hiccup) must NOT kill the pump
      // chain: Cloudflare retries a throwing alarm only a few times before
      // giving up, and a lost alarm used to freeze the AI turn until a page
      // reload. Log and re-arm at a gentle retry pace instead — the
      // onMessage/onConnect/GET self-heals remain the backstop.
      console.warn(
        `[computer-runner] alarm tick failed in room ${this.snapshot?.roomId ?? "unknown"}; re-arming`,
        error,
      );
      if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
        await this.scheduleComputerPump(GameRoomServer.COMPUTER_PUMP_RETRY_MS);
      }
    }
  }

  private async runComputerPumpTick(): Promise<void> {
    const outcome = await this.serialized(async () => {
      const current = this.snapshot;
      if (!current || !computerPumpOwed(current.state)) {
        return null;
      }
      const before = current.state;
      const run = settleComputerVisibleStep(before);
      if (run.decisions.length === 0) {
        // Pump was owed (computerPumpOwed above) yet produced nothing: a genuine
        // stall. Single-player rooms have no turn-clock/AFK recovery, so log it
        // rather than freezing the table silently.
        if (run.stalled) {
          console.warn(
            `[computer-runner] alarm stall in room ${current.roomId}: ${run.reason ?? "no safe legal action"}`,
          );
        }
        return null;
      }
      this.snapshot = {
        // PartyKit THROWS on `this.room.id` inside onAlarm ("You can not access
        // `Party.id` in the `onAlarm` handler") — reading it here crashed every
        // alarm tick, killing the paced computer pump after its first step and
        // freezing the AI turn. The snapshot already carries the room id.
        roomId: current.roomId,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
        ...this.creationMeta(run.state),
        state: run.state,
      };
      try {
        await this.persist();
      } catch (error) {
        this.snapshot = current;
        throw error;
      }
      return { continuePump: computerPumpOwed(run.state), before, after: run.state };
    });
    if (!outcome) {
      return;
    }
    // Fan-out is delivery work, not mutation work. Keeping it outside the room
    // lock prevents a slow redaction/identity callback during an AI animation
    // from queueing the human's next click until its processing deadline.
    await this.broadcastSnapshot();
    // Match report may fire mid-computer-turn (last faction standing, etc.).
    void this.reportFinishedMatchToApp(outcome.before, outcome.after);
    if (outcome.continuePump && this.snapshot) {
      await this.scheduleComputerPump(computerStepDelayMs(this.snapshot.state));
    }
  }

  onConnect(connection: Party.Connection): void {
    // Single-player creation (plan §5.1): the creating browser's FIRST
    // connection carries ?singlePlayer=<count> on the socket URL. Honored only
    // while NO snapshot exists at all — a fresh, memberless, unconfigured
    // room — so a later connection can never flip an established room. The
    // state is single-player (hence private) before reportToLobby below can
    // run, so not even a momentary public directory record exists.
    if (!this.snapshot) {
      const opponents = this.singlePlayerCreationOf(connection);
      if (opponents !== null) {
        const now = new Date().toISOString();
        this.snapshot = {
          roomId: this.room.id,
          version: 1,
          createdAt: now,
          updatedAt: now,
          state: this.makeState({ sessionMode: "single-player", computerOpponents: opponents })
        };
        void this.persist();
      }
    }
    this.ensureSnapshot();
    // Send the initial frame SYNCHRONOUSLY so it always precedes later messages.
    // The just-attached socket has not verified an identity or run its JOIN yet,
    // so a HOSTED room's first frame is the zero-trust OBSERVER view (it leaks
    // nothing); the client's JOIN then triggers a broadcast redacted to its
    // VERIFIED seat. An open table sends the full shared frame as before.
    const room = this.snapshot!.state.room;
    // Redact FROM the signed copy (not this.snapshot.state) so the send-time
    // transforms in signed() — signature stamp + N4 event tail — survive.
    const outgoing = this.signed(this.snapshot!);
    const snapshot = room?.hosted
      ? {
          ...outgoing,
          viewerSeat: OBSERVER_VIEWER_SEAT,
          state: redactStateForSeat(outgoing.state, OBSERVER_VIEWER_SEAT)
        }
      : outgoing;
    connection.send(JSON.stringify({ type: "snapshot", snapshot } satisfies ServerMessage));
    if (room?.hosted) {
      // Follow up with the frame redacted to the socket's ACTUAL seat once its
      // identity resolves. An automatic reconnect never re-sends JOIN_ROOM, so
      // without this a seated player who reconnected mid-game would stay stuck
      // on the zero-trust observer frame above — no hand, no pending-Event
      // steps, and (during a round-start barrier) a table frozen for everyone.
      void this.sendSeatFrame(connection);
    }
    // A connection means the room exists — surface it in the lobby. The
    // JOIN_ROOM that follows re-reports reliably (awaited) once it has a member.
    void this.reportToLobby();
    // Self-heal the paced computer pump: if a computer seat still owes a
    // decision but no alarm is pending (a crashed alarm tick, an evicted
    // object, a pre-fix deploy), re-arm it so a reconnecting/reloading human
    // never finds the AI frozen mid-turn with no action able to revive it.
    if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
      void this.ensureComputerPump(computerStepDelayMs(this.snapshot.state));
    }
  }

  /** Push the current snapshot, redacted to one socket's verified seat. */
  private async sendSeatFrame(connection: Party.Connection): Promise<void> {
    try {
      const snapshot = await this.snapshotForConnection(connection);
      connection.send(JSON.stringify({ type: "snapshot", snapshot } satisfies ServerMessage));
    } catch {
      // Best effort — the client's sync / polling paths keep retrying.
    }
  }

  /** The stable per-tab client id the browser put on the socket URL, if any. */
  private clientIdOf(connection: Party.Connection): string | undefined {
    // `connection.uri` is the URL that opened the socket (it survives
    // hibernation, unlike a per-instance map), and carries the `?clientId=` the
    // client attaches in src/lib/realtime.ts. Read defensively so a narrower
    // Party.Connection type never breaks the typecheck.
    const uri = (connection as unknown as { uri?: string }).uri;
    if (!uri) {
      return undefined;
    }
    try {
      return new URL(uri).searchParams.get("clientId") ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The `?singlePlayer=<computer count>` creation marker on the socket URL the
   * creating browser opened (see createSinglePlayerRoom in src/lib/realtime.ts).
   * Consumed by onConnect on a room with no snapshot at all; every other
   * connection ignores it.
   */
  private singlePlayerCreationOf(connection: Party.Connection): number | null {
    const uri = (connection as unknown as { uri?: string }).uri;
    if (!uri) {
      return null;
    }
    try {
      const raw = new URL(uri).searchParams.get("singlePlayer");
      if (!raw) {
        return null;
      }
      const count = Math.floor(Number(raw));
      // The seat cap is enforced again by scenario capacity in the engine.
      return Number.isFinite(count) && count >= 1 ? Math.min(count, 11) : null;
    } catch {
      return null;
    }
  }

  /**
   * A socket dropped (tab closed, navigated back to the lobby, or the network
   * died). Reap that client's ephemeral membership — an unseated spectator or an
   * open-table member — so one computer isn't counted as many after it joins,
   * leaves and rejoins. A SEATED player in a hosted game (and the host) is never
   * reaped, so a transient reconnect never unseats them or hands their turn /
   * choices to anyone else. Only re-broadcasts when the member list changed.
   */
  private async handleDisconnect(connection: Party.Connection): Promise<void> {
    const clientId = this.clientIdOf(connection);
    if (!clientId) {
      return;
    }
    // Serialized with the action pipeline: the reap is a read-modify-write of
    // the snapshot, and racing it against an in-flight action could publish
    // two different snapshots under the same version.
    const changed = await this.serialized(async () => {
      if (!this.snapshot || !dropDisconnectedMember(this.snapshot.state, clientId)) {
        return false;
      }
      this.snapshot = {
        ...this.snapshot,
        version: this.snapshot.version + 1,
        updatedAt: new Date().toISOString()
      };
      await this.persist();
      await this.broadcastSnapshot();
      return true;
    });
    if (changed) {
      await this.reportToLobby();
    }
  }

  async onClose(connection: Party.Connection): Promise<void> {
    // Fires for every closure (a clean close and after an error alike), so it is
    // the single place to reap a dropped client's ephemeral membership.
    await this.handleDisconnect(connection);
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): Promise<void> {
    const parseStartedAt = Date.now();
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMessage;
    } catch {
      return;
    }
    this.metric("room.message.parse", parseStartedAt, { type: message.type });

    // ANY client traffic (ping, sync, action…) self-heals a lost computer
    // pump: if a computer seat owes a decision but no alarm is pending (a
    // crashed/expired alarm chain, a pre-fix deploy), re-arm it — so a frozen
    // AI turn revives on the next health ping instead of needing a page
    // reload. ensureComputerPump never postpones an already-pending tick.
    if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
      void this.ensureComputerPump(computerStepDelayMs(this.snapshot.state));
    }

    if (message.type === "ping") {
      const userId = await this.verifiedUserId(sender);
      const snapshot = this.ensureSnapshot();
      const viewerSeat = snapshot.state.room?.hosted
        ? seatForViewer(snapshot.state, { clientId: this.clientIdOf(sender), userId })
        : undefined;
      const reply: ServerMessage = {
        type: "pong",
        version: snapshot.version,
        ...(viewerSeat ? { viewerSeat } : {})
      };
      sender.send(JSON.stringify(reply));
      return;
    }

    if (message.type === "sync") {
      this.ensureSnapshot();
      const reply: ServerMessage = { type: "snapshot", snapshot: await this.snapshotForConnection(sender) };
      sender.send(JSON.stringify(reply));
      return;
    }

    if (message.type === "reset") {
      // Same authority as close: host while connected, any member once the
      // host is gone, a verified platform admin (socket ticket) or the
      // developer's admin key always. The socket's own ?clientId= identity
      // backs up the message field. Identity resolves BEFORE the lock (it may
      // fetch); the snapshot read-modify-write runs inside it.
      const isAdmin = this.adminAuthorizes(message.adminKey) || (await this.verifiedIsAdmin(sender));
      const deniedReason = await this.serialized(async () => {
        const previous = this.ensureSnapshot();
        if (!isAdmin) {
          const actor = message.actorClientId ?? this.clientIdOf(sender);
          if (resetVoteRequired(previous.state)) {
            // In-progress multiplayer adventure: the unanimous "new adventure"
            // vote, fired by the browser that opened it, may wipe the running
            // game. The HOST of a hosted room may ALSO start it directly (host
            // override) — the escape hatch so a stuck vote (a player who left
            // but is not eliminated, a solo-host test) is never a dead end. An
            // OPEN table has no host, so it still needs the vote.
            const hostOverride =
              Boolean(previous.state.room?.hosted) && this.hostAuthorizes(actor, "reset").allowed;
            if (!resetVoteAuthorizes(previous.state, actor) && !hostOverride) {
              return "Everyone still in the game must confirm a new adventure — or the host can start it.";
            }
          } else {
            const authority = this.hostAuthorizes(actor, "reset");
            if (!authority.allowed) {
              return authority.reason ?? "Only the host can reset this room.";
            }
          }
        }
        // A reset wipes the running game — drop any undo history so the new
        // game cannot roll back into the old one.
        clearUndoHistory(this.room.id);
        const state = this.makeState(this.resetOptionsFor(previous, message));
        // Carry room membership (host, seats, observers) across a game reset.
        state.room = previous.state.room ?? null;
        this.snapshot = {
          roomId: this.room.id,
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
          ...this.creationMeta(state),
          state
        };
        await this.persist();
        await this.broadcastSnapshot();
        return null;
      });
      if (deniedReason) {
        // Refused: the room is untouched; tell the sender (only) why.
        const reply: ServerMessage = { type: "reset-denied", reason: deniedReason };
        sender.send(JSON.stringify(reply));
        return;
      }
      await this.reportToLobby();
      return;
    }

    if (message.type === "action") {
      // This is deliberately not an acceptance/result: the browser keeps the
      // action pending, but no longer mistakes late-game processing for a dead
      // room. Send before identity resolution and the mutation queue because
      // both can await external or earlier work while this socket is healthy.
      if (message.requestId) {
        sender.send(JSON.stringify({
          type: "action-received",
          requestId: message.requestId,
          // This server persists its answered-action ledger, so a client
          // re-send is dedupe-safe even against a woken instance.
          durable: true
        } satisfies ServerMessage));
      }
      const outcome = await (async () => {
        try {
          // Resolve the sender's VERIFIED account id from the token on its socket
          // (Phase 2). Authoritative over the claimed actorClientId — a spoofed id
          // can no longer act for a signed-in player's seat. Undefined for guests.
          // Resolved BEFORE the mutation lock: the verification may fetch, and the
          // room must stay serialized-but-responsive while it does.
          const actorUserId = await this.verifiedUserId(sender);
          const senderClientId = message.actorClientId ?? this.clientIdOf(sender);
          const dedupeKeys = message.requestId
            ? this.dedupeKeysFor(message.requestId, actorUserId, senderClientId ?? sender.id)
            : [];
          return await this.serialized(async () => {
        const current = this.ensureSnapshot();
        // A requestId this room already answered is a duplicate frame (client
        // retry / double-send): reply with the recorded outcome, apply nothing.
        const answered = dedupeKeys
          .map((key) => this.answeredActionRequests.get(key))
          .find((entry) => entry !== undefined);
        if (answered) {
          return { ...answered, applied: false, prev: null as GameState | null };
        }
        // OPTIONAL Undo mode (debug/testing): an UNDO_MOVE never runs through the
        // engine reducer — it pops the server-side per-room snapshot stack and
        // restores it wholesale (atomic: open combats / choices / reward queues
        // roll back together). Rejected when the mode is off, the actor is not a
        // member, or there is nothing to undo. The history lives only in the
        // undo-history module (never in state, never broadcast, never in a view).
        if (message.action.type === "UNDO_MOVE") {
          const undo = await this.applyUndo(
            current,
            message.action.playerId,
            senderClientId,
            actorUserId,
            dedupeKeys
          );
          if (!undo.applied) {
            return undo;
          }
          this.sendActionResult(sender, message.requestId, undo);
          return { ...undo, acknowledged: true, broadcast: true };
        }
        const applyStartedAt = Date.now();
        const replayEntropy = freshEntropy();
        const replayNow = Date.now();
        const result = applyAction(current.state, message.action, {
          // Fresh crypto entropy per action makes every die roll, shuffle and Ⅱ–Ⅲ
          // tile flip genuinely unpredictable and non-reproducible (true random),
          // not derivable from the game seed (see random.ts).
          entropy: replayEntropy,
          // Server wall clock: the AFK vote-kick's only time source (idle
          // stamps + the 10-minute idle/re-ask gates).
          now: replayNow,
          // Live-socket set for this room: RECLAIM_HOST refuses while the host
          // is still connected (host-recovery mirror of the reset/close rule).
          liveClientIds: this.liveClientIds(),
          ...(message.actorClientId ? { actorClientId: message.actorClientId } : {}),
          ...(actorUserId ? { actorUserId } : {})
        });
        this.metric("room.action.apply", applyStartedAt, { actionType: message.action.type });
        const errors = result.errors.map((error) => ({ code: error.code, message: error.message }));
        const notices = result.events
          .filter((event) => event.type === "SPELL_CAST_REFUNDED")
          .map((event) => event.reason);
        if (result.errors.length > 0) {
          // Honor the reducer's repair contract: when applyAction found
          // duplicate army-unit ids it validated against a REPAIRED clone and
          // "that copy is returned even on failure so the stored room heals".
          // Dropping it here (the old behaviour) left the room serving the
          // UNREPAIRED state while every action was validated against the
          // repaired one — the ids the client held never matched the legality
          // set again, so every unit command rejected with the generic
          // "not legal" forever. Identity check: fail() returns the input
          // state object unchanged unless a repair cloned it.
          if (result.state !== current.state) {
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(result.state),
              state: result.state
            };
            try {
              await this.persist();
            } catch (error) {
              this.snapshot = current;
              throw error;
            }
            const rejected = { errors, notices, version: this.snapshot.version };
            for (const key of dedupeKeys) this.recordAnsweredRequest(key, rejected);
            // The repaired snapshot is committed. Finish the request now and
            // fan it out outside the mutation queue, exactly like a successful
            // action; a slow hosted peer must not strand this sender.
            this.sendActionResult(sender, message.requestId, rejected);
            return {
              ...rejected,
              applied: false,
              prev: null as GameState | null,
              acknowledged: true,
              broadcast: true
            };
          }
          const rejected = { errors, notices, version: current.version };
          for (const key of dedupeKeys) this.recordAnsweredRequest(key, rejected);
          return { ...rejected, applied: false, prev: null as GameState | null };
        }
        // A passed AFK kick vote or an expired 10-minute turn: drive the forced
        // resolution through the normal action pipeline until it settles (or
        // the table must wait). ADVANCE_COMPUTER is a recovery beat; the server
        // alarm owns normal map and combat computer progression.
        const afkSettled = forcedResolutionPending(result.state)
          ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
          : result.state;
        const settled =
          message.action.type === "ADVANCE_COMPUTER"
            ? applyHumanComputerAdvance(afkSettled).state
            : settleComputerForLiveAction(afkSettled);
        const startsRankedAdventure =
          !rankedClashReplayEligible(current.state) && rankedClashReplayEligible(result.state);
        if (startsRankedAdventure && this.rankedReplayCaptureEnabled()) {
          try {
            // Establish the complete Round-1 replay before START_ADVENTURE can
            // become the durable room state. Failure leaves players in setup;
            // it never rolls back or damages an already-running match.
            await this.captureRankedReplay(current.state, message.action, result, {
              ...(message.actorClientId ? { actorClientId: message.actorClientId } : {}),
              entropy: replayEntropy,
              now: replayNow,
            });
          } catch (error) {
            console.error("[ranked-replay] could not initialize Round-1 capture; ranked start remains in setup", error);
            return {
              errors: [{
                code: "ACTION_NOT_LEGAL",
                message: "The ranked replay could not be initialized. The match has not started; please try Start again.",
              }],
              notices: [],
              version: current.version,
              applied: false,
              prev: null as GameState | null,
            };
          }
        }
        this.snapshot = {
          roomId: this.room.id,
          version: current.version + 1,
          updatedAt: new Date().toISOString(),
          ...this.creationMeta(settled),
          state: settled
        };
        // Record BEFORE persist so the applied outcome rides the SAME atomic
        // storage write as the snapshot (see persist) — a retry can then never
        // find the new state without its ledger entry.
        const accepted = { errors, notices, version: this.snapshot.version };
        for (const key of dedupeKeys) this.recordAnsweredRequest(key, accepted);
        const persistStartedAt = Date.now();
        try {
          await this.persist();
        } catch (error) {
          // The mutation is not authoritative until storage accepts BOTH the
          // snapshot and its dedupe ledger. Restore the in-memory timeline and
          // remove the uncommitted ledger keys so a retry applies exactly once.
          this.snapshot = current;
          for (const key of dedupeKeys) this.answeredActionRequests.delete(key);
          throw error;
        }
        this.metric("room.storage.persist", persistStartedAt, { version: this.snapshot.version });
        try {
          await this.captureRankedReplay(current.state, message.action, result, {
            ...(message.actorClientId ? { actorClientId: message.actorClientId } : {}),
            entropy: replayEntropy,
            now: replayNow,
          });
        } catch (error) {
          // Capture is non-critical and separately bounded. A storage failure
          // must never roll back or reject an already committed game action.
          console.warn("[ranked-replay] action capture failed", error);
        }
        // Undo history is also a commit-side effect: record it only after the
        // new timeline is durable, never for a failed storage attempt.
        recordUndoSnapshot(this.room.id, current.state);
        // The move is authoritative once storage accepts it. Acknowledge the
        // sender before expensive per-seat snapshot delivery.
        this.sendActionResult(sender, message.requestId, accepted);
        return {
          ...accepted,
          applied: true,
          prev: current.state,
          acknowledged: true,
          broadcast: true,
          scheduleComputer: computerPumpOwed(settled),
          computerDelayMs: computerStepDelayMs(settled),
        };
          });
        } catch (error) {
          // Every durable receipt must have a terminal answer. Previously an
          // unexpected reducer/storage failure escaped the handler after
          // `action-received`, leaving the browser to wait a full minute for
          // "could not finish in time" with no idea whether the move landed.
          // Transactional branches below roll their in-memory snapshot back
          // before rethrowing, so this explicit failure is safe to retry.
          console.error("[room-action] transaction failed before commit", error);
          this.sendActionResult(sender, message.requestId, {
            version: this.snapshot?.version ?? 0,
            errors: [{
              code: "ACTION_NOT_LEGAL",
              message: "The room could not commit that action. Nothing changed; please try it again."
            }],
            notices: []
          });
          return null;
        }
      })();
      if (!outcome) {
        return;
      }

      // Snapshot delivery is deliberately outside the mutation queue. A slow
      // or stale hosted peer must not keep the next action from reaching its
      // persistence boundary. Snapshot versions arbitrate any reordered
      // fan-out, and the initiating request id lets the client treat this
      // authoritative post-commit frame as an acknowledgement if the smaller
      // action-result frame was lost.
      if ("broadcast" in outcome && outcome.broadcast) {
        await this.broadcastSnapshot(message.requestId);
      }

      if (outcome.applied && "scheduleComputer" in outcome && outcome.scheduleComputer) {
        await this.scheduleComputerPump(outcome.computerDelayMs ?? computerStepDelayMs(this.snapshot?.state as GameState));
      }

      // Rejections and duplicate requestIds have no persistence/fan-out work,
      // so answer them here. Applied actions were already acknowledged at the
      // persistence boundary, before snapshot broadcast.
      if (!("acknowledged" in outcome && outcome.acknowledged)) {
        this.sendActionResult(sender, message.requestId, outcome);
      }
      // Keep awaiting the best-effort directory report afterward so the
      // Durable Object remains alive until it finishes.
      if (outcome.applied && outcome.prev) {
        await this.reportToLobby();
        // Ranked-match auto-report (Phase 6): if this action just ended the
        // game, post the result to the app so seated verified accounts get
        // their win/loss + Elo. Awaited (not floated) so hibernation cannot
        // cancel it; failures are logged inside and never break the action.
        // Read the SETTLED snapshot, not result.state — an AFK kick driven
        // right after this action may itself have ended the game.
        await this.reportFinishedMatchToApp(outcome.prev, this.snapshot?.state ?? outcome.prev);
      }
    }
  }

  /**
   * OPTIONAL Undo mode (debug/testing) — the WebSocket action path handler for
   * UNDO_MOVE. Pops+restores the server-side prior snapshot (atomic whole-state
   * swap) and persists it. The caller acknowledges that commit before
   * broadcasting, matching the normal action path. `prev` is null so no match
   * report / lobby churn fires (an undo can never finish a game).
   */
  private async applyUndo(
    current: RoomSnapshot,
    playerId: PlayerId,
    actorClientId: string | undefined,
    actorUserId: string | undefined,
    dedupeKeys: string[]
  ): Promise<{
    errors: { code: string; message: string }[];
    notices: string[];
    version: number;
    applied: boolean;
    prev: GameState | null;
    scheduleComputer?: boolean;
    computerDelayMs?: number;
  }> {
    const reject = (message: string) => {
      const rejected = {
        errors: [{ code: "ACTION_NOT_LEGAL", message }],
        notices: [] as string[],
        version: current.version
      };
      for (const key of dedupeKeys) this.recordAnsweredRequest(key, rejected);
      return { ...rejected, applied: false, prev: null as GameState | null };
    };
    if (!undoModeEnabled(current.state)) {
      return reject("Undo mode is off for this game.");
    }
    if (!actorIsRoomParticipant(current.state, actorClientId, actorUserId)) {
      return reject("Only a member of this room can undo.");
    }
    const outcome = applyUndoMove(this.room.id, current.state, playerId);
    if (!outcome.undone) {
      return reject(outcome.reason);
    }
    this.snapshot = {
      roomId: this.room.id,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      ...this.creationMeta(outcome.state),
      state: outcome.state
    };
    const accepted = { errors: [] as { code: string; message: string }[], notices: [] as string[], version: this.snapshot.version };
    for (const key of dedupeKeys) this.recordAnsweredRequest(key, accepted);
    try {
      await this.persist();
    } catch (error) {
      this.snapshot = current;
      for (const key of dedupeKeys) this.answeredActionRequests.delete(key);
      // applyUndoMove popped this checkpoint; put it back so a transient
      // storage failure does not consume the player's undo step.
      recordUndoSnapshot(this.room.id, outcome.state);
      throw error;
    }
    return {
      ...accepted,
      applied: true,
      prev: null as GameState | null,
      scheduleComputer: computerPumpOwed(outcome.state),
      computerDelayMs: computerStepDelayMs(outcome.state)
    };
  }

  private static readonly MATCH_REPORT_RETRY_BASE_MS = 15_000;
  private static readonly MATCH_REPORT_RETRY_MAX_MS = 15 * 60_000;

  private async scheduleMatchReportRetry(attempts: number): Promise<void> {
    const exponent = Math.min(6, Math.max(0, attempts - 1));
    const delay = Math.min(
      GameRoomServer.MATCH_REPORT_RETRY_MAX_MS,
      GameRoomServer.MATCH_REPORT_RETRY_BASE_MS * (2 ** exponent),
    );
    await this.room.storage.setAlarm(Date.now() + delay);
  }

  /**
   * Deliver the durable terminal-report outbox. Success means BOTH the ladder
   * result and (for Ranked) replay reached durable app storage. Anything else
   * stays in Durable Object storage and is retried by alarm after hibernation.
   */
  private async deliverRankedMatchReportOutbox(): Promise<"none" | "delivered" | "pending"> {
    const outbox = await this.room.storage.get<RankedMatchReportOutbox>(RANKED_MATCH_REPORT_OUTBOX_KEY);
    if (!outbox || outbox.format !== "homm3bg-ranked-match-report-outbox-v1") return "none";

    const config = matchReportConfigOf(this.room);
    const replayRequired = outbox.match.ranked && outbox.replayRequired !== false;
    let failure = "PartyKit match-report configuration is missing";
    if (config) {
      try {
        const loadedReplay = replayRequired
          ? (this.rankedReplay ?? await this.loadRankedReplay())
          : null;
        const replay = loadedReplay ? finishRankedReplay(loadedReplay, Date.now(), outbox.winnerPlayerId) : undefined;
        if (replayRequired && !replay) {
          failure = "Ranked replay buffer is missing";
        } else {
          const response = await fetch(`${config.appUrl}/api/matches/report`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-homm3bg-report-key": config.key },
            body: JSON.stringify({ ...outbox.match, ...(replay ? { replay } : {}) }),
          });
          const body = await response.json().catch(() => null) as
            | { applied?: boolean; replayStored?: boolean; error?: string; message?: string }
            | null;
          const durable = response.ok && (!replayRequired || body?.replayStored === true);
          if (durable) {
            await this.room.storage.delete(RANKED_MATCH_REPORT_OUTBOX_KEY);
            await this.clearRankedReplayStorage();
            console.log(`[match-report] durably recorded ${outbox.match.matchId}`);
            return "delivered";
          }
          failure = `HTTP ${response.status}: ${body?.error ?? body?.message ?? "report not acknowledged"}`;
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }

    const attempts = outbox.attempts + 1;
    await this.room.storage.put(RANKED_MATCH_REPORT_OUTBOX_KEY, {
      ...outbox,
      attempts,
      lastAttemptAt: new Date().toISOString(),
      lastError: failure.slice(0, 500),
    } satisfies RankedMatchReportOutbox);
    await this.scheduleMatchReportRetry(attempts);
    console.error(`[match-report] delivery pending for ${outbox.match.matchId}: ${failure}`);
    return "pending";
  }

  /** Detect a just-finished ranked game and durably enqueue its app report. */
  private async reportFinishedMatchToApp(prev: GameState, next: GameState): Promise<void> {
    const match = detectFinishedMatch(prev, next);
    if (!match) {
      return;
    }
    await this.room.storage.put(RANKED_MATCH_REPORT_OUTBOX_KEY, {
      format: "homm3bg-ranked-match-report-outbox-v1",
      match,
      ...(next.adventure?.winnerPlayerId ? { winnerPlayerId: next.adventure.winnerPlayerId } : {}),
      replayRequired: match.ranked && this.rankedReplayCaptureEnabled(),
      attempts: 0,
      createdAt: new Date().toISOString(),
    } satisfies RankedMatchReportOutbox);
    const delivery = await this.deliverRankedMatchReportOutbox();
    // RANKED only: close the table after a real attributed win/loss so rematch
    // cannot reuse seed/matchSeats. Casual / single-player / sandbox stay open.
    if (match.ranked) {
      await this.forceCloseAfterRankedMatch(delivery !== "delivered");
    }
  }

  /**
   * System force-close after a ranked match (no host gate). Broadcasts a final
   * closed snapshot, wipes storage, and deregisters from the lobby directory.
   */
  private async forceCloseAfterRankedMatch(preservePendingReport = false): Promise<void> {
    await this.serialized(async () => {
      const closing = this.snapshot;
      if (closing) {
        const message: ServerMessage = {
          type: "snapshot",
          snapshot: this.signed({ ...closing, closed: true })
        };
        this.room.broadcast(JSON.stringify(message));
      }
      this.snapshot = null;
      clearUndoHistory(this.room.id);
      this.answeredActionRequests.clear();
      try {
        await this.deletePersistedSnapshot();
        if (!preservePendingReport) await this.clearRankedReplayStorage();
        await this.room.storage.delete(ANSWERED_ACTIONS_KEY);
        if (!preservePendingReport) await this.room.storage.deleteAlarm();
      } catch (error) {
        console.error(`[room] ranked force-close storage wipe failed:`, error);
      }
    });
    await this.deregisterFromLobby();
    console.log(`[room] force-closed ${this.room.id}: ranked match finished`);
  }

  /**
   * Plain HTTP access to the same room (reset, snapshot polling, debugging).
   * The Next.js app is almost always served from a different origin than this
   * `*.partykit.dev` host, so every browser request here is cross-origin: we
   * must answer the CORS pre-flight and stamp the allow-origin header, or the
   * browser blocks the response and the caller sees "Could not reset the
   * room." (The WebSocket has no such restriction, which is why live play
   * works while the HTTP reset fails.)
   */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      // Redact the snapshot to the requesting client's seat (Phase 2). The
      // browser attaches `?clientId=` (+ optional `?token=`) so a cross-origin
      // poll / initial load leaks no opponent hidden info, mirroring the socket.
      // The snapshot is read AFTER the async verification, so the reply always
      // reflects whatever concurrent events landed during the round-trip.
      const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
      const userId = await this.verifiedUserIdFromRequest(request);
      const snapshot = this.redactSnapshotForActor(this.signed(this.ensureSnapshot()), { clientId, userId });
      void this.reportToLobby();
      // The client's http-recovery poll self-heals a lost computer pump too
      // (same rule as onMessage/onConnect): re-arm only when no alarm pends.
      if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
        void this.ensureComputerPump(computerStepDelayMs(this.snapshot.state));
      }
      return jsonWithCors(snapshot);
    }

    if (request.method === "DELETE") {
      const body = (await request.json().catch(() => null)) as
        | { actorClientId?: string; adminKey?: string }
        | null;
      const isAdmin = await this.verifiedIsAdminFromRequest(request);
      const result = this.authorizeClose(body?.actorClientId, body?.adminKey, isAdmin);
      if (!result.closed) {
        return jsonWithCors(result, 403);
      }
      // Tell everyone still connected the room is gone, then wipe its storage.
      // Serialized so an in-flight action can never resurrect the snapshot by
      // writing after the wipe.
      await this.serialized(async () => {
        const closing = this.snapshot;
        if (closing) {
          const message: ServerMessage = { type: "snapshot", snapshot: this.signed({ ...closing, closed: true }) };
          this.room.broadcast(JSON.stringify(message));
        }
        this.snapshot = null;
        clearUndoHistory(this.room.id);
        this.answeredActionRequests.clear();
        await this.deletePersistedSnapshot();
        await this.clearRankedReplayStorage();
        await this.room.storage.delete(ANSWERED_ACTIONS_KEY);
      });
      // Drop it from the lobby directory too, so the room browser stops listing it.
      await this.deregisterFromLobby();
      return jsonWithCors(result);
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | ({ reset?: boolean; actorClientId?: string; adminKey?: string } & RoomResetOptions)
        | { action?: GameAction; actorClientId?: string }
        | { spSave?: boolean; spLoad?: boolean; state?: GameState; actorClientId?: string }
        | null;

      // Single-player save slots (owner-only, solo rooms only) — the edge twin
      // of the built-in route's spSave/spLoad. The save fetch returns the RAW
      // state on purpose: the per-seat redacted frames ("hidden" deck
      // placeholders) can never restore a game. See src/server/single-player-save.ts.
      if (body && "spSave" in body && body.spSave) {
        const actorClientId = "actorClientId" in body ? body.actorClientId : undefined;
        const userId = await this.verifiedUserIdFromRequest(request);
        const current = this.ensureSnapshot();
        const access = singlePlayerSaveAccess(current.state, { clientId: actorClientId, userId });
        if (!access.ok) {
          return jsonWithCors({ reason: access.reason }, 403);
        }
        // The `spSave: true` marker lets the client tell this RAW reply apart
        // from the generic snapshot fallback an OLDER room-server deploy would
        // return for an unknown body (which is REDACTED and would silently
        // corrupt a save) — the stale-edge guard.
        return jsonWithCors({ spSave: true, state: current.state, version: current.version });
      }
      if (body && "spLoad" in body && body.spLoad && "state" in body && body.state) {
        const actorClientId = "actorClientId" in body ? body.actorClientId : undefined;
        const userId = await this.verifiedUserIdFromRequest(request);
        const incoming = body.state;
        let outcome: { denied: string | null; snapshot: RoomSnapshot };
        try {
          outcome = await this.serialized(async () => {
            const current = this.ensureSnapshot();
            const prepared = prepareSinglePlayerLoad(current.state, incoming, { clientId: actorClientId, userId });
            if (!prepared.ok) {
              return { denied: prepared.reason as string | null, snapshot: current };
            }
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(prepared.state),
              state: prepared.state
            };
            try {
              await this.persist();
            } catch (error) {
              this.snapshot = current;
              throw error;
            }
            // A load jumps timelines — drop undo only after the new timeline is
            // durable, never when storage rejected the swap.
            clearUndoHistory(this.room.id);
            return { denied: null, snapshot: this.snapshot };
          });
        } catch (error) {
          console.error("[single-player-save] load transaction failed", error);
          return jsonWithCors(
            { reason: "The room could not commit the saved game. Nothing changed; the save is safe to retry." },
            503
          );
        }
        if (outcome.denied) {
          return jsonWithCors({ reason: outcome.denied }, 403);
        }
        // Persisted already: fan-out no longer owns the room mutation lock.
        await this.broadcastSnapshot();
        // The loaded game may be mid-computer-turn: re-arm the paced pump for
        // the restored state; otherwise cancel any alarm from the abandoned
        // timeline so it cannot wake needlessly after a human-owned load.
        if (this.snapshot && computerPumpOwed(this.snapshot.state)) {
          await this.scheduleComputerPump(computerStepDelayMs(this.snapshot.state));
        } else {
          try {
            await this.room.storage.deleteAlarm();
          } catch {
            /* old runtimes/mocks may not expose alarms */
          }
        }
        // `spLoad: true` marker: an OLDER room-server deploy answers an unknown
        // body with a plain snapshot WITHOUT applying anything — the client
        // must be able to tell "loaded" from "ignored" (the stale-edge guard).
        return jsonWithCors({
          spLoad: true,
          snapshot: this.redactSnapshotForActor(this.signed(this.snapshot ?? outcome.snapshot), {
            clientId: actorClientId,
            userId
          })
        });
      }

      if (body && "reset" in body && body.reset) {
        // Same authority as DELETE: host while connected, member once the
        // host is gone, a verified platform admin (?token=) or the developer's
        // admin key always. Identity resolves before the mutation lock.
        const isAdmin = this.adminAuthorizes(body.adminKey) || (await this.verifiedIsAdminFromRequest(request));
        const resetOutcome = await this.serialized(async () => {
          const previous = this.ensureSnapshot();
          if (!isAdmin) {
            const authority = this.hostAuthorizes(
              "actorClientId" in body ? body.actorClientId : undefined,
              "reset"
            );
            if (!authority.allowed) {
              return { denied: authority.reason ?? "Only the host can reset this room.", snapshot: previous };
            }
          }
          // A reset wipes the running game — drop any undo history so the new
        // game cannot roll back into the old one.
        clearUndoHistory(this.room.id);
        const state = this.makeState(this.resetOptionsFor(previous, body));
          // Carry room membership (host, seats, observers) across a game reset.
          state.room = previous.state.room ?? null;
          this.snapshot = {
            roomId: this.room.id,
            version: previous.version + 1,
            updatedAt: new Date().toISOString(),
            ...this.creationMeta(state),
            state
          };
          await this.persist();
          await this.clearRankedReplayStorage();
          await this.broadcastSnapshot();
          return { denied: null, snapshot: this.snapshot };
        });
        if (resetOutcome.denied) {
          return jsonWithCors({ reason: resetOutcome.denied }, 403);
        }
        await this.reportToLobby();
        return jsonWithCors(
          this.redactSnapshotForActor(this.signed(this.snapshot ?? resetOutcome.snapshot), {
            clientId: "actorClientId" in body ? body.actorClientId : undefined
          })
        );
      }

      if (body && "action" in body && body.action) {
        const actorClientId = "actorClientId" in body ? body.actorClientId : undefined;
        const actorUserId = await this.verifiedUserIdFromRequest(request);
        const action = body.action;
        const outcome = await this.serialized(async () => {
          const current = this.ensureSnapshot();
          // OPTIONAL Undo mode: the HTTP action fallback mirrors the WebSocket
          // path. UNDO_MOVE pops+restores the server-side prior snapshot; every
          // other action first records its PRE-action state on the undo stack.
          if (action.type === "UNDO_MOVE") {
            const undoFail = (message: string) => ({
              result: { state: current.state, events: [], errors: [{ code: "ACTION_NOT_LEGAL", message }] },
              prev: current.state,
              applied: false,
              replyBase: this.snapshot ?? current,
              scheduleComputer: false,
              computerDelayMs: 0
            });
            if (!undoModeEnabled(current.state)) {
              return undoFail("Undo mode is off for this game.");
            }
            if (!actorIsRoomParticipant(current.state, actorClientId, actorUserId)) {
              return undoFail("Only a member of this room can undo.");
            }
            const undone = applyUndoMove(this.room.id, current.state, action.playerId);
            if (!undone.undone) {
              return undoFail(undone.reason);
            }
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(undone.state),
              state: undone.state
            };
            await this.persist();
            await this.broadcastSnapshot();
            return {
              result: { state: undone.state, events: [], errors: [] },
              // prev === next: an undo can never finish a game, so match
              // detection is a no-op.
              prev: undone.state,
              applied: true,
              replyBase: this.snapshot,
              scheduleComputer: computerPumpOwed(undone.state),
              computerDelayMs: computerStepDelayMs(undone.state)
            };
          }
          recordUndoSnapshot(this.room.id, current.state);
          const replayEntropy = freshEntropy();
          const replayNow = Date.now();
          const result = applyAction(current.state, action, {
            entropy: replayEntropy,
            now: replayNow,
            liveClientIds: this.liveClientIds(),
            ...(actorClientId ? { actorClientId } : {}),
            ...(actorUserId ? { actorUserId } : {})
          });
          if (result.errors.length === 0) {
            // Mirrors the WebSocket path: ADVANCE_COMPUTER is one recovery beat;
            // otherwise setup settles and the server alarm owns later AI work.
            const afkSettled = forcedResolutionPending(result.state)
              ? driveAfkDrop(result.state, () => ({ entropy: freshEntropy(), now: Date.now() }))
              : result.state;
            const settled =
              action.type === "ADVANCE_COMPUTER"
                ? applyHumanComputerAdvance(afkSettled).state
                : settleComputerForLiveAction(afkSettled);
            const startsRankedAdventure =
              !rankedClashReplayEligible(current.state) && rankedClashReplayEligible(result.state);
            if (startsRankedAdventure && this.rankedReplayCaptureEnabled()) {
              try {
                // HTTP action submissions are a real production transport too
                // (recovery clients and operational E2E checks use it). Start
                // the replay before the Round-1 snapshot becomes durable, just
                // like the WebSocket action pipeline above.
                await this.captureRankedReplay(current.state, action, result, {
                  ...(actorClientId ? { actorClientId } : {}),
                  entropy: replayEntropy,
                  now: replayNow,
                });
              } catch (error) {
                console.error("[ranked-replay] could not initialize Round-1 capture over HTTP; ranked start remains in setup", error);
                return {
                  result: {
                    state: current.state,
                    events: [],
                    errors: [{
                      code: "ACTION_NOT_LEGAL" as const,
                      message: "The ranked replay could not be initialized. The match has not started; please try Start again.",
                    }],
                    notices: [],
                  },
                  prev: current.state,
                  applied: false,
                  replyBase: current,
                  scheduleComputer: false,
                  computerDelayMs: 0,
                };
              }
            }
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(settled),
              state: settled
            };
            await this.persist();
            try {
              await this.captureRankedReplay(current.state, action, result, {
                ...(actorClientId ? { actorClientId } : {}),
                entropy: replayEntropy,
                now: replayNow,
              });
            } catch (error) {
              console.warn("[ranked-replay] HTTP action capture failed", error);
            }
            await this.broadcastSnapshot();
            return {
              result,
              prev: current.state,
              applied: true,
              replyBase: this.snapshot ?? current,
              scheduleComputer: computerPumpOwed(settled),
              computerDelayMs: computerStepDelayMs(settled),
            };
          }
          // Rejected: adopt the reducer's duplicate-army-id repair when one
          // happened (result.state is a repaired clone then — see the WS path)
          // so the served room heals instead of diverging from what every
          // later legality check validates against.
          if (result.state !== current.state) {
            this.snapshot = {
              roomId: this.room.id,
              version: current.version + 1,
              updatedAt: new Date().toISOString(),
              ...this.creationMeta(result.state),
              state: result.state
            };
            await this.persist();
            await this.broadcastSnapshot();
          }
          return {
            result,
            prev: current.state,
            applied: false,
            replyBase: this.snapshot ?? current,
            scheduleComputer: false,
            computerDelayMs: 0,
          };
        });
        if (outcome.applied) {
          await this.reportToLobby();
          await this.reportFinishedMatchToApp(outcome.prev, this.snapshot?.state ?? outcome.prev);
          if (outcome.scheduleComputer) {
            await this.scheduleComputerPump(outcome.computerDelayMs);
          }
        }
        const redacted = this.redactSnapshotForActor(this.signed(this.snapshot ?? outcome.replyBase), {
          clientId: actorClientId,
          userId: actorUserId
        });
        // Redact result.state too (the full GameState) so the HTTP action
        // response leaks no opponent hidden info, matching the snapshot.
        return jsonWithCors({ snapshot: redacted, result: { ...outcome.result, state: redacted.state } });
      }

      this.ensureSnapshot();
      return jsonWithCors(this.redactSnapshotForActor(this.signed(this.snapshot!), {}));
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
}

/**
 * Open CORS for the room's HTTP endpoints. The payloads are public room
 * snapshots (no cookies or credentials), so a wildcard origin is safe and
 * lets the app work from any deploy host.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonWithCors(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

GameRoomServer satisfies Party.Worker;
