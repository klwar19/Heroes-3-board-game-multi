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
// Kept below Vercel's compressed/uncompressed request ceiling with headroom for
// match metadata and headers. This is large enough for long full adventures;
// the previous 1.5 MB cap could truncate before late-game adaptation.
export const RANKED_REPLAY_MAX_BYTES = 4_000_000;
export const RANKED_REPLAY_MAX_LEGAL_ACTIONS = 512;
export const RANKED_REPLAY_MAX_ENTRY_BYTES = 96 * 1024;

export type RankedReplaySource = "human" | "computer" | "neutral" | "system";

export type RankedReplayLearningDomain =
  | "opening"
  | "map-movement"
  | "economy"
  | "neutral-combat"
  | "pvp-combat"
  | "card-use"
  | "recovery";

export type RankedReplayLearningContext = {
  stage: "opening" | "midgame" | "late-game";
  domains: RankedReplayLearningDomain[];
  legalAlternativeCount: number;
  underPressure: boolean;
  pressureSignals: string[];
  actorEconomy?: { gold: number; buildingMaterials: number; valuables: number };
  combat?: {
    kind: "neutral" | "pvp" | "other";
    ownLivingUnits: number;
    enemyLivingUnits: number;
    ownRemainingHealth: number;
    enemyRemainingHealth: number;
  };
};

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
  /** Bounded semantic features for preference/outcome learning, never policy imitation alone. */
  learningContext?: RankedReplayLearningContext;
};

export type RankedReplay = {
  format: "homm3bg-ranked-replay-v1";
  schemaVersion: typeof RANKED_REPLAY_SCHEMA_VERSION;
  engineSignature: string;
  matchId: string;
  startedAt: string;
  captureStart: "adventure-start" | "mid-match-recovery";
  finishedAt?: string;
  initialState: GameState;
  entries: RankedReplayEntry[];
  byteLength: number;
  truncated: boolean;
  truncationReason?: "action-limit" | "byte-limit" | "entry-too-large";
  /** Terminal seat outcome used to credit later consequences, not every isolated move. */
  winnerPlayerId?: PlayerId;
};

export type RankedReplayAppendCursor = Pick<
  RankedReplay,
  "byteLength" | "truncated" | "truncationReason"
> & { entryCount: number };

export type RankedReplayCursorAppend = {
  cursor: RankedReplayAppendCursor;
  entry?: RankedReplayEntry;
};

type ActionWithPlayer = GameAction & { playerId?: unknown };

export function rankedReplayEnabled(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

export function rankedClashReplayEligible(state: GameState): boolean {
  // Adventure combat temporarily uses `phase === "game-over"` while its
  // result overlay is open. The adventure itself remains live until it has a
  // winner, so excluding that phase makes the following ACK look like a new
  // adventure and can replace the Round-1 replay with a late-round buffer.
  return (
    state.sessionMode !== "single-player" &&
    state.gameMode !== "coop" &&
    state.room?.visibility !== "private" &&
    state.room?.ranked !== false &&
    Boolean(state.adventure) &&
    !state.adventure?.winnerPlayerId
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

function learningContextFor(
  state: GameState,
  actorPlayerId: PlayerId | null,
  action: GameAction,
  legalAlternativeCount: number,
): RankedReplayLearningContext {
  const actionType = action.type;
  const domains = new Set<RankedReplayLearningDomain>();
  const stage = state.round <= 3 ? "opening" : state.round >= 8 ? "late-game" : "midgame";
  if (stage === "opening") domains.add("opening");
  if (/MOVE|DISCOVER|REVEAL|PLACE_TILE|ROTATE_TILE|TELEPORT|VISIT/.test(actionType)) domains.add("map-movement");
  if (/BUILD|RECRUIT|REINFORCE|TRADE|BUY|UPGRADE|RESOURCE|POPULATION|TOWN/.test(actionType)) domains.add("economy");
  if (/CARD|SPELL|REACTION|ABILITY|ARTIFACT|PERMANENT/.test(actionType)) domains.add("card-use");

  const pressureSignals: string[] = [];
  const player = actorPlayerId ? state.players[actorPlayerId] : undefined;
  const resources = player?.resources;
  const actorEconomy = resources
    ? {
        gold: Number(resources.gold ?? 0),
        buildingMaterials: Number(resources.buildingMaterials ?? 0),
        valuables: Number(resources.valuables ?? 0),
      }
    : undefined;
  if (actorEconomy && actorEconomy.gold <= 2) pressureSignals.push("low-gold");

  let combat: RankedReplayLearningContext["combat"];
  if (state.combat && actorPlayerId) {
    const fight = state.combat;
    const neutral = fight.attackerPlayerId === NEUTRAL_PLAYER_ID || fight.defenderPlayerId === NEUTRAL_PLAYER_ID;
    const pvp = !neutral && fight.context.kind !== "sandbox";
    domains.add(neutral ? "neutral-combat" : pvp ? "pvp-combat" : "pvp-combat");
    const units = Object.values(fight.units).filter((unit) => unit.position >= 0 && unit.damage < unit.maxHealth);
    const own = units.filter((unit) => unit.controllerId === actorPlayerId);
    const enemy = units.filter((unit) => unit.controllerId !== actorPlayerId);
    const health = (group: typeof units) => group.reduce((sum, unit) => sum + Math.max(0, unit.maxHealth - unit.damage), 0);
    combat = {
      kind: neutral ? "neutral" : pvp ? "pvp" : "other",
      ownLivingUnits: own.length,
      enemyLivingUnits: enemy.length,
      ownRemainingHealth: health(own),
      enemyRemainingHealth: health(enemy),
    };
    if (combat.ownLivingUnits < combat.enemyLivingUnits) pressureSignals.push("outnumbered");
    if (combat.ownRemainingHealth < combat.enemyRemainingHealth) pressureSignals.push("health-disadvantage");
    if (fight.defenderPlayerId === actorPlayerId && pvp) pressureSignals.push("defending-pvp");
  }
  const recentEvents = state.eventLog.slice(-12).map((event) => event.type).join(" ");
  if (/DEFEAT|LOSS|DESTROYED|ELIMINATED|RETREAT/.test(recentEvents)) pressureSignals.push("recent-setback");
  if (pressureSignals.length > 0) domains.add("recovery");
  if (domains.size === 0) domains.add("map-movement");

  return {
    stage,
    domains: [...domains],
    legalAlternativeCount,
    underPressure: pressureSignals.length > 0,
    pressureSignals,
    ...(actorEconomy ? { actorEconomy } : {}),
    ...(combat ? { combat } : {}),
  };
}

export function createRankedReplay(
  state: GameState,
  now = Date.now(),
  captureStart: RankedReplay["captureStart"] = "mid-match-recovery",
): RankedReplay {
  const replay: RankedReplay = {
    format: "homm3bg-ranked-replay-v1",
    schemaVersion: RANKED_REPLAY_SCHEMA_VERSION,
    engineSignature: ENGINE_SIGNATURE,
    matchId: state.seed,
    startedAt: new Date(now).toISOString(),
    captureStart,
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

function buildRankedReplayEntry(
  sequence: number,
  before: GameState,
  action: GameAction,
  result: EngineResult,
  options: { actorClientId?: string; entropy?: string; now?: number } = {},
): { entry?: RankedReplayEntry; byteLength: number } {
  const actorPlayerId = actorForAction(before, action, options.actorClientId);
  const legal = actorPlayerId ? getLegalActions(before, actorPlayerId).map((entry) => sanitizeAction(entry.action, before)) : [];
  const legalActions = legal.slice(0, RANKED_REPLAY_MAX_LEGAL_ACTIONS);
  const entry: RankedReplayEntry = {
    sequence,
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
    learningContext: learningContextFor(before, actorPlayerId, action, legal.length),
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
    return { byteLength: compactEntryBytes };
  }
  return { entry, byteLength: compactEntryBytes };
}

/**
 * Append from the small durable replay header without hydrating every prior
 * entry. PartyKit's HTTP path can construct a fresh handler for every action;
 * replaying N storage reads per action becomes O(N²) and eventually trips the
 * Durable Object concurrent-operation throttle near the end of real battles.
 */
export function appendRankedReplayEntryFromCursor(
  cursor: RankedReplayAppendCursor,
  before: GameState,
  action: GameAction,
  result: EngineResult,
  options: { actorClientId?: string; entropy?: string; now?: number } = {},
): RankedReplayCursorAppend {
  if (cursor.truncated) return { cursor };
  if (cursor.entryCount >= RANKED_REPLAY_MAX_ACTIONS) {
    return { cursor: { ...cursor, truncated: true, truncationReason: "action-limit" } };
  }
  const built = buildRankedReplayEntry(cursor.entryCount + 1, before, action, result, options);
  if (!built.entry) {
    return { cursor: { ...cursor, truncated: true, truncationReason: "entry-too-large" } };
  }
  const nextBytes = cursor.byteLength + built.byteLength;
  if (nextBytes > RANKED_REPLAY_MAX_BYTES) {
    return { cursor: { ...cursor, truncated: true, truncationReason: "byte-limit" } };
  }
  return {
    entry: built.entry,
    cursor: { entryCount: cursor.entryCount + 1, byteLength: nextBytes, truncated: false },
  };
}

export function appendRankedReplayEntry(
  replay: RankedReplay,
  before: GameState,
  action: GameAction,
  result: EngineResult,
  options: { actorClientId?: string; entropy?: string; now?: number } = {},
): RankedReplay {
  const appended = appendRankedReplayEntryFromCursor(
    {
      entryCount: replay.entries.length,
      byteLength: replay.byteLength,
      truncated: replay.truncated,
      ...(replay.truncationReason ? { truncationReason: replay.truncationReason } : {}),
    },
    before,
    action,
    result,
    options,
  );
  if (!appended.entry) {
    return {
      ...replay,
      byteLength: appended.cursor.byteLength,
      truncated: appended.cursor.truncated,
      ...(appended.cursor.truncationReason
        ? { truncationReason: appended.cursor.truncationReason }
        : {}),
    };
  }
  return {
    ...replay,
    byteLength: appended.cursor.byteLength,
    entries: [...replay.entries, appended.entry],
  };
}

export function finishRankedReplay(replay: RankedReplay, now = Date.now(), winnerPlayerId?: PlayerId): RankedReplay {
  const finished = { ...replay, finishedAt: new Date(now).toISOString(), ...(winnerPlayerId ? { winnerPlayerId } : {}) };
  return { ...finished, byteLength: encodedBytes(finished) };
}
