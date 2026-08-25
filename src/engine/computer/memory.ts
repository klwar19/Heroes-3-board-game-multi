import type { GameAction, GameState, MapSpaceId, PlayerId } from "../state";

/**
 * Bounded multi-round policy memory for a computer seat. Persisted on
 * `GameState.computerMemory` so reconnect / runner restarts keep sticky
 * objectives and economy focus. Contains ONLY that seat's own notes derived
 * from public + own-private state — never opponent hands/decks.
 *
 * Caps keep snapshots small: 8 resource trail entries, 12 visit fields/turn.
 */

export type EconomyFocus = "army" | "income" | "magic" | "balanced";

export type ResourceTrailEntry = {
  round: number;
  gold: number;
  mats: number;
  vals: number;
  army: number;
  buildings: number;
};

export type ComputerPolicyMemory = {
  /** `${round}|${activePlayerId}|${completedTurns signature}` — clears visit list. */
  lastTurnKey: string;
  resourceTrail: ResourceTrailEntry[];
  focus: EconomyFocus;
  stickyObjectiveSpaceId: MapSpaceId | null;
  stickySinceRound: number;
  visitedThisTurn: MapSpaceId[];
  lastMarketRound: number | null;
  stagnantArmyTurns: number;
  /**
   * Hashes of progress-fingerprint states this seat already LEFT this turn —
   * the cross-tick cycle guard. The live pump paces ONE action per tick with a
   * fresh runner each time, so its in-call retry sets cannot see a loop that
   * spans ticks. Only zero-cost reversible actions can return the seat to an
   * earlier state (e.g. the free Subterranean-Gate twin hop, which cost the
   * table an infinite A↔B shuffle); the runner refuses any candidate whose
   * post-state hash is already listed here. Cleared with visitedThisTurn.
   * Optional in serialized form: legacy snapshots read as an empty list.
   */
  recentStateHashes?: number[];
};

const TRAIL_CAP = 8;
const VISIT_CAP = 12;
const STATE_HASH_CAP = 16;
/** Keep a sticky objective for at most this many rounds without revalidation. */
export const STICKY_OBJECTIVE_MAX_ROUNDS = 4;

export function emptyComputerMemory(round = 0): ComputerPolicyMemory {
  return {
    lastTurnKey: "",
    resourceTrail: [],
    focus: "balanced",
    stickyObjectiveSpaceId: null,
    stickySinceRound: round,
    visitedThisTurn: [],
    lastMarketRound: null,
    stagnantArmyTurns: 0,
    recentStateHashes: [],
  };
}

export function getComputerMemory(
  state: GameState,
  playerId: PlayerId,
): ComputerPolicyMemory {
  const raw = state.computerMemory?.[playerId];
  if (!raw) {
    return emptyComputerMemory(state.round ?? 0);
  }
  // Defensive copy so callers can mutate the returned object safely.
  return {
    ...raw,
    resourceTrail: [...(raw.resourceTrail ?? [])],
    visitedThisTurn: [...(raw.visitedThisTurn ?? [])],
    recentStateHashes: [...(raw.recentStateHashes ?? [])],
  };
}

function buildingCount(state: GameState, playerId: PlayerId): number {
  return Object.values(state.towns ?? {}).filter(
    (town) => town.controllerId === playerId,
  ).reduce((sum, town) => sum + (town.buildings?.length ?? 0), 0);
}

function snapshotTrail(
  state: GameState,
  playerId: PlayerId,
): ResourceTrailEntry {
  const player = state.players[playerId];
  return {
    round: state.round ?? 0,
    gold: player?.resources.gold ?? 0,
    mats: player?.resources.buildingMaterials ?? 0,
    vals: player?.resources.valuables ?? 0,
    army: player?.army.length ?? 0,
    buildings: buildingCount(state, playerId),
  };
}

/**
 * Infer focus from the resource trail + current army size.
 * - army: thin force or no growth over several trail samples
 * - income: chronically broke (gold low across trail)
 * - magic: flush gold + decent army, soft buildings lagging
 * - balanced: default
 */
export function inferEconomyFocus(
  trail: ReadonlyArray<ResourceTrailEntry>,
  currentArmy: number,
): EconomyFocus {
  if (trail.length === 0) {
    return currentArmy < 4 ? "army" : "balanced";
  }
  const latest = trail[trail.length - 1];
  const earliest = trail[0];
  const avgGold =
    trail.reduce((sum, entry) => sum + entry.gold, 0) / trail.length;
  const armyDelta = latest.army - earliest.army;
  const goldStuckLow = avgGold < 10 && latest.gold < 12;
  const armyStagnant = armyDelta <= 0 && trail.length >= 3;

  // Thin armies always recruit first. Stagnant mid-size forces also need army
  // — but chronic gold shortage outranks that so the AI can afford recruits.
  if (currentArmy < 4) {
    return "army";
  }
  if (goldStuckLow || (latest.gold < 8 && latest.mats + latest.vals > 2)) {
    return "income";
  }
  if (armyStagnant && currentArmy < 6) {
    return "army";
  }
  if (
    latest.gold >= 18 &&
    currentArmy >= 5 &&
    latest.buildings >= 3 &&
    latest.army >= earliest.army
  ) {
    return "magic";
  }
  return "balanced";
}

function turnKey(state: GameState, playerId: PlayerId): string {
  const completed = state.turn?.completedPlayerIds?.join(",") ?? "";
  return `${state.round}|${state.activePlayerId}|${playerId}|${completed}`;
}

/**
 * Refresh trail / focus / per-turn visit list. Called by the runner before a
 * decision so memory reflects the current public economy without waiting for
 * an action.
 */
export function refreshComputerMemory(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const mem = getComputerMemory(state, playerId);
  const key = turnKey(state, playerId);
  if (mem.lastTurnKey !== key) {
    mem.visitedThisTurn = [];
    mem.recentStateHashes = [];
    mem.lastTurnKey = key;
  }

  const snap = snapshotTrail(state, playerId);
  const last = mem.resourceTrail[mem.resourceTrail.length - 1];
  // One trail sample per round (overwrite same-round tail).
  if (last && last.round === snap.round) {
    mem.resourceTrail[mem.resourceTrail.length - 1] = snap;
  } else {
    mem.resourceTrail.push(snap);
    if (mem.resourceTrail.length > TRAIL_CAP) {
      mem.resourceTrail.shift();
    }
    // Army stagnant counter: increment when a NEW round sample shows no growth.
    if (last && snap.army <= last.army) {
      mem.stagnantArmyTurns += 1;
    } else if (last && snap.army > last.army) {
      mem.stagnantArmyTurns = 0;
    }
  }

  mem.focus = inferEconomyFocus(mem.resourceTrail, snap.army);

  // Drop sticky objective if it has aged out (re-pick next decision).
  if (
    mem.stickyObjectiveSpaceId &&
    state.round - mem.stickySinceRound > STICKY_OBJECTIVE_MAX_ROUNDS
  ) {
    mem.stickyObjectiveSpaceId = null;
  }

  return writeComputerMemory(state, playerId, mem);
}

export function writeComputerMemory(
  state: GameState,
  playerId: PlayerId,
  memory: ComputerPolicyMemory,
): GameState {
  return {
    ...state,
    computerMemory: {
      ...(state.computerMemory ?? {}),
      [playerId]: memory,
    },
  };
}

/**
 * Record the effects of a just-applied computer action on memory (visits,
 * market, recruit, sticky objective updates).
 */
export function noteComputerAction(
  state: GameState,
  playerId: PlayerId,
  action: GameAction,
): GameState {
  let mem = getComputerMemory(state, playerId);
  const round = state.round ?? 0;

  switch (action.type) {
    case "MOVE_HERO": {
      const to = action.to;
      if (to && !mem.visitedThisTurn.includes(to)) {
        mem = {
          ...mem,
          visitedThisTurn: [...mem.visitedThisTurn, to].slice(-VISIT_CAP),
        };
      }
      break;
    }
    case "REVISIT_FIELD": {
      // A revisit is once-per-turn value: record the hero's field so the
      // thrash-skip gate (map-policy REVISIT_FIELD → 200) blocks an immediate
      // re-revisit. Without this, a Stables refunds the very 1 MP the revisit
      // costs, and an idle hero parked on one revisited it FOREVER (a real
      // 256-step runner stall, seed measure-f). Runs after the action applied,
      // so a teleport-style revisit records the DESTINATION — those move the
      // hero away and cannot loop in place anyway.
      const hero = state.heroes[action.heroId];
      const space = hero?.spaceId;
      if (space && !mem.visitedThisTurn.includes(space)) {
        mem = {
          ...mem,
          visitedThisTurn: [...mem.visitedThisTurn, space].slice(-VISIT_CAP),
        };
      }
      break;
    }
    case "OPEN_MARKET":
    case "TRADE_RESOURCES":
    case "BUY_WAR_MACHINE":
      mem = { ...mem, lastMarketRound: round };
      break;
    case "POPULATION_ACTION":
      // Recruiting resets the army-stagnation counter (read by economyFocusBias).
      mem = { ...mem, stagnantArmyTurns: 0 };
      break;
    case "ACKNOWLEDGE_COMBAT_END":
      // Fresh objective pick after EVERY fight. A WON fight consumed its
      // objective anyway; after a LOST one the stale sticky would keep the
      // hero committed to (or parked beside) the guard that just beat it —
      // the observed "stops moving after a loss" stall. Clearing costs one
      // deterministic re-pick on the next decision.
      mem = { ...mem, stickyObjectiveSpaceId: null };
      break;
    case "END_TURN":
    case "COMPLETE_SIMULTANEOUS_TURN":
      // Clear per-turn visit thrash list + the cycle guard at end of turn.
      mem = { ...mem, visitedThisTurn: [], recentStateHashes: [] };
      break;
    default:
      break;
  }

  return writeComputerMemory(state, playerId, mem);
}

/** Commit a sticky map objective for cross-turn march continuity. */
export function setStickyObjective(
  state: GameState,
  playerId: PlayerId,
  spaceId: MapSpaceId | null,
): GameState {
  const mem = getComputerMemory(state, playerId);
  if (spaceId === mem.stickyObjectiveSpaceId) {
    return state;
  }
  return writeComputerMemory(state, playerId, {
    ...mem,
    stickyObjectiveSpaceId: spaceId,
    stickySinceRound: state.round ?? 0,
  });
}

/**
 * Score bias for map economy actions from multi-round memory.
 * Positive = prefer; used as additive nudge on top of instantaneous scores.
 */
export function economyFocusBias(
  memory: ComputerPolicyMemory,
  kind: "recruit" | "build-recruit-unlock" | "build-income" | "build-magic" | "build-other" | "market",
): number {
  switch (memory.focus) {
    case "army":
      if (kind === "recruit") return 40;
      if (kind === "build-recruit-unlock") return 30;
      if (kind === "build-income") return 5;
      if (kind === "build-magic") return -25;
      if (kind === "market") return 10;
      return 0;
    case "income":
      if (kind === "build-income") return 35;
      if (kind === "market") return 25;
      if (kind === "recruit") return 10;
      if (kind === "build-magic") return -15;
      return 5;
    case "magic":
      if (kind === "build-magic") return 30;
      if (kind === "recruit") return 5;
      if (kind === "build-income") return 0;
      return 0;
    case "balanced":
    default:
      if (kind === "recruit" && memory.stagnantArmyTurns >= 2) return 20;
      return 0;
  }
}

/** True when the seat already LEFT a state with this fingerprint hash this turn. */
export function recentStateHashSeen(
  state: GameState,
  playerId: PlayerId,
  hash: number,
): boolean {
  return Boolean(
    state.computerMemory?.[playerId]?.recentStateHashes?.includes(hash),
  );
}

/** Record a departed state's fingerprint hash for the cross-tick cycle guard. */
export function noteRecentStateHash(
  state: GameState,
  playerId: PlayerId,
  hash: number,
): GameState {
  const mem = getComputerMemory(state, playerId);
  const hashes = [...(mem.recentStateHashes ?? []), hash].slice(-STATE_HASH_CAP);
  return writeComputerMemory(state, playerId, {
    ...mem,
    recentStateHashes: hashes,
  });
}

/** True when this field was already stepped on this map turn (revisit thrash). */
export function visitedThisTurn(
  memory: ComputerPolicyMemory,
  spaceId: MapSpaceId,
): boolean {
  return memory.visitedThisTurn.includes(spaceId);
}
