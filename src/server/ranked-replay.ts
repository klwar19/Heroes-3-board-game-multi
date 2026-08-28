import {
  ENGINE_SIGNATURE,
  NEUTRAL_PLAYER_ID,
  getLegalActions,
  isComputerPlayer,
  type EngineResult,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@/engine";

/**
 * Private, bounded training replay for a Ranked Clash match.
 *
 * This deliberately does not live in GameState: replay collection must never
 * make live snapshots, websocket broadcasts, or the reducer progressively
 * larger. Transports persist the buffer beside the room and upload it once,
 * together with the terminal match report.
 */
export const RANKED_REPLAY_SCHEMA_VERSION = 1;
export const RANKED_REPLAY_MAX_ACTIONS = 2_000;
export const RANKED_REPLAY_MAX_BYTES = 1_500_000;
export const RANKED_REPLAY_MAX_LEGAL_ACTIONS = 512;
export const RANKED_REPLAY_MAX_ENTRY_BYTES = 96 * 1024;

export type RankedReplaySource = "human" | "computer" | "neutral" | "system";

export type RankedReplayEntry = {
  sequence: number;
  round: number;
  phase: GameState["phase"];
  actorPlayerId: PlayerId | null;
  source: RankedReplaySource;
  action: GameAction;
  /** Full legal candidates, generated from the actor's authoritative pre-state. */
  legalActions: GameAction[];
  legalActionsTruncated?: boolean;
  /** Integrity checkpoints let an extractor detect engine/version divergence. */
  beforeStateHash: string;
  afterStateHash: string;
  entropy?: string;
  now?: number;
  events: GameEvent[];
};

export type RankedReplay = {
  format: "homm3bg-ranked-replay-v1";
  schemaVersion: typeof RANKED_REPLAY_SCHEMA_VERSION;
  engineSignature: string;
  matchId: string;
  startedAt: string;
  finishedAt?: string;
  initialState: GameState;
  entries: RankedReplayEntry[];
  byteLength: number;
  truncated: boolean;
  truncationReason?: "action-limit" | "byte-limit" | "entry-too-large";
};

type ActionWithPlayer = GameAction & { playerId?: unknown };

export function rankedReplayEnabled(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

export function rankedClashReplayEligible(state: GameState): boolean {
  return (
    state.sessionMode !== "single-player" &&
    state.gameMode !== "coop" &&
    state.room?.visibility !== "private" &&
    state.room?.ranked !== false &&
    Boolean(state.adventure) &&
    !state.adventure?.winnerPlayerId &&
    state.phase !== "game-over"
  );
}

function actorForAction(state: GameState, action: GameAction, actorClientId?: string): PlayerId | null {
  const claimed = (action as ActionWithPlayer).playerId;
  if (typeof claimed === "string" && (claimed in state.players || claimed === NEUTRAL_PLAYER_ID)) {
    return claimed as PlayerId;
  }
  if (actorClientId) {
    const seat = state.room?.members.find((member) => member.clientId === actorClientId)?.seat;
    if (seat && seat !== "observer") return seat;
  }
  return null;
}

function sourceFor(state: GameState, actorPlayerId: PlayerId | null): RankedReplaySource {
  if (!actorPlayerId) return "system";
  if (actorPlayerId === NEUTRAL_PLAYER_ID) return "neutral";
  return isComputerPlayer(state, actorPlayerId) ? "computer" : "human";
}

function identityReplacements(state: GameState): Array<[string, string]> {
  const replacements: Array<[string, string]> = [];
  for (const [index, member] of (state.room?.members ?? []).entries()) {
    const seat = member.seat === "observer" ? `observer-${index + 1}` : String(member.seat);
    replacements.push([member.clientId, `replay-client-${index + 1}`], [member.name, seat]);
    if (member.userId) replacements.push([member.userId, `replay-user-${index + 1}`]);
  }
  return replacements.sort((a, b) => b[0].length - a[0].length);
}

function sanitizeReplayValue<T>(value: T, state: GameState): T {
  const replacements = identityReplacements(state);
  const visit = (current: unknown, key?: string): unknown => {
    if (["password", "passwordHash", "chat", "email", "sessionToken", "socketToken", "authToken"].includes(key ?? "")) {
      return undefined;
    }
    if (typeof current === "string") {
      let clean = current;
      for (const [privateValue, replacement] of replacements) {
        if (!privateValue) continue;
        clean = clean === privateValue
          ? replacement
          : privateValue.length >= 3
            ? clean.split(privateValue).join(replacement)
            : clean;
      }
      return clean;
    }
    if (Array.isArray(current)) return current.map((entry) => visit(entry));
    if (current && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).flatMap(([entryKey, entryValue]) => {
          const clean = visit(entryValue, entryKey);
          return clean === undefined ? [] : [[entryKey, clean]];
        }),
      );
    }
    return current;
  };
  return visit(value) as T;
}

/** Remove account/session/chat data while retaining all gameplay information. */
export function sanitizeReplayState(state: GameState): GameState {
  const copy = sanitizeReplayValue(state, state);
  if (copy.room) {
    delete copy.room.passwordHash;
    delete copy.room.chat;
    copy.room.chatSeq = 0;
    copy.room.hostClientId = copy.room.hostClientId ? "replay-host" : null;
    copy.room.ownerClientId = copy.room.ownerClientId ? "replay-owner" : undefined;
    copy.room.ownerUserId = copy.room.ownerUserId ? "replay-owner" : undefined;
    copy.room.members = copy.room.members.map((member, index) => ({
      ...member,
      clientId: `replay-client-${index + 1}`,
      name: member.seat === "observer" ? "Observer" : String(member.seat),
      ...(member.userId ? { userId: `replay-user-${index + 1}` } : {}),
    }));
    if (copy.room.matchSeats) {
      copy.room.matchSeats = Object.fromEntries(
        Object.entries(copy.room.matchSeats).map(([seat, binding]) => [
          seat,
          { name: seat, ...(binding.userId ? { userId: `replay-user-${seat}` } : {}) },
        ]),
      );
    }
  }
  return copy;
}

function sanitizeAction(action: GameAction, state: GameState): GameAction {
  const copy = sanitizeReplayValue(action, state) as Record<string, unknown>;
  // Room administration and chat are retained as sequence markers without
  // collecting player-provided text or credentials.
  for (const key of ["password", "passwordHash", "message", "name", "clientId"] as const) {
    if (key in copy) copy[key] = `[redacted-${key}]`;
  }
  return copy as GameAction;
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function stateHash(state: GameState): string {
  const text = JSON.stringify(sanitizeReplayState(state));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createRankedReplay(state: GameState, now = Date.now()): RankedReplay {
  const replay: RankedReplay = {
    format: "homm3bg-ranked-replay-v1",
    schemaVersion: RANKED_REPLAY_SCHEMA_VERSION,
    engineSignature: ENGINE_SIGNATURE,
    matchId: state.seed,
    startedAt: new Date(now).toISOString(),
    initialState: sanitizeReplayState(state),
    entries: [],
    byteLength: 0,
    truncated: false,
  };
  replay.byteLength = encodedBytes(replay);
  if (replay.byteLength > RANKED_REPLAY_MAX_BYTES) {
    // A pathological custom map may already exceed the complete replay budget.
    // Keep a valid, explicitly truncated header instead of risking server/KV
    // failure or silently accepting an unbounded payload.
    replay.initialState = sanitizeReplayState({ ...state, eventLog: [] });
    replay.entries = [];
    replay.truncated = true;
    replay.truncationReason = "byte-limit";
    replay.byteLength = encodedBytes(replay);
  }
  return replay;
}

export function appendRankedReplayEntry(
  replay: RankedReplay,
  before: GameState,
  action: GameAction,
  result: EngineResult,
  options: { actorClientId?: string; entropy?: string; now?: number } = {},
): RankedReplay {
  if (replay.truncated) return replay;
  if (replay.entries.length >= RANKED_REPLAY_MAX_ACTIONS) {
    return { ...replay, truncated: true, truncationReason: "action-limit" };
  }
  const actorPlayerId = actorForAction(before, action, options.actorClientId);
  const legal = actorPlayerId ? getLegalActions(before, actorPlayerId).map((entry) => sanitizeAction(entry.action, before)) : [];
  const legalActions = legal.slice(0, RANKED_REPLAY_MAX_LEGAL_ACTIONS);
  const entry: RankedReplayEntry = {
    sequence: replay.entries.length + 1,
    round: before.round,
    phase: before.phase,
    actorPlayerId,
    source: sourceFor(before, actorPlayerId),
    action: sanitizeAction(action, before),
    legalActions,
    ...(legal.length > legalActions.length ? { legalActionsTruncated: true } : {}),
    beforeStateHash: stateHash(before),
    afterStateHash: stateHash(result.state),
    ...(options.entropy ? { entropy: options.entropy } : {}),
    ...(options.now != null ? { now: options.now } : {}),
    events: sanitizeReplayValue(result.events, before) as GameEvent[],
  };
  const entryBytes = encodedBytes(entry);
  // A pathological legal-action fanout must never break the room. Preserve the
  // chosen action/events before giving up entirely.
  if (entryBytes > RANKED_REPLAY_MAX_ENTRY_BYTES) {
    entry.legalActions = [];
    entry.legalActionsTruncated = legal.length > 0;
  }
  const compactEntryBytes = encodedBytes(entry);
  if (compactEntryBytes > RANKED_REPLAY_MAX_ENTRY_BYTES) {
    return { ...replay, truncated: true, truncationReason: "entry-too-large" };
  }
  const nextBytes = replay.byteLength + compactEntryBytes;
  if (nextBytes > RANKED_REPLAY_MAX_BYTES) {
    return { ...replay, truncated: true, truncationReason: "byte-limit" };
  }
  return { ...replay, entries: [...replay.entries, entry], byteLength: nextBytes };
}

export function finishRankedReplay(replay: RankedReplay, now = Date.now()): RankedReplay {
  const finished = { ...replay, finishedAt: new Date(now).toISOString() };
  return { ...finished, byteLength: encodedBytes(finished) };
}
