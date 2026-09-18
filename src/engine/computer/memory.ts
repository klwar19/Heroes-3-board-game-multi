import type { GameAction, GameState, MapSpaceId, PlayerId } from "../state";
import { updateDevelopmentPlan, type DevelopmentPlan } from "./development-plan";
import { bronzeArmyNeedsWithdrawal, openingGuardCommitment } from "./necropolis-combat";
import { playerArmyStrength } from "./army-strength";
import { baseCardId } from "../phantom-cards";
import { coreUnitDefinitions } from "@/data/factions/units";

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
  withdrawalCombatId?: string;
  scoutedWithdrawalCombatId?: string;
  /** The opening Vampire Pack milestone survives casualties and saves. */
  necromancyVampirePackEarned?: boolean;
  goldArmyEstablished?: boolean;
  silverArmyEstablished?: boolean;
  settlementLossStreak?: number;
  settlementLossRound?: number;
  lastSettlementCombatId?: string;
  failedFields?: Array<{ fieldId: string; round: number; readiness: string; armyStrength?: number; heroLevel?: number; hadArrow?: boolean; hadPremiumBody?: boolean; scoutedRetreat?: boolean }>;
  developmentPlan?: DevelopmentPlan;
  routeHistory?: Array<{ heroId: string; to: string; progress: string; round?: number }>;
  /** This seat's round/completion key — other seats cannot clear its visit list. */
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
    routeHistory: [...(raw.routeHistory ?? [])],
    failedFields: [...(raw.failedFields ?? [])],
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
  // Another parallel seat ending its turn does not reset OUR route guard.
  const completed = state.turn?.completedPlayerIds?.includes(playerId) ?? false;
  return `${state.round}|${playerId}|${completed}`;
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
  mem.developmentPlan = updateDevelopmentPlan(state, playerId, mem.developmentPlan);

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
  previousState?: GameState,
): GameState {
  let mem = getComputerMemory(state, playerId);
  const round = state.round ?? 0;
  if ([state, previousState].some(view => (view?.players[playerId]?.army ?? []).some(unit =>
    unit.side !== "bank" && ["gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier)))) {
    mem.goldArmyEstablished = true;
  }
  if ([state, previousState].some(view => (view?.players[playerId]?.army ?? []).some(unit =>
    unit.side !== "bank" && coreUnitDefinitions[unit.unitDefId]?.tier === "silver"))) {
    mem.silverArmyEstablished = true;
  }
  if (state.players[playerId]?.factionId === "necropolis" && state.players[playerId].army.some(unit =>
      unit.unitDefId === "necropolis.vampires" && unit.side === "pack")) mem.necromancyVampirePackEarned = true;
  // Retreat can remove combat in the reducer before this post-action hook.
  // Preserve that defeated field so a new hand cannot cause an immediate retry.
  const retreated = action.type === "RETREAT_FROM_COMBAT";
  const combat = state.combat ?? (retreated || previousState?.combat?.outcome ? previousState?.combat : undefined);
  if (combat && !combat.outcome && combat.round === 1 &&
      Object.values(combat.units).every(unit => !unit.activatedThisRound && unit.damage === 0) &&
      openingGuardCommitment(state, playerId, combat) === "retreat") mem.scoutedWithdrawalCombatId = combat.id;
  // Neutral retreat is legal only at the round boundary. Remember the scouting
  // decision made before activations; requiring unactivated units HERE would
  // make the next-round retry path impossible to reach.
  const scoutedRetreat = Boolean((retreated || combat?.outcome?.reason === "retreat") && combat && combat.round === 1 &&
    mem.scoutedWithdrawalCombatId === combat.id && Object.values(combat.units).every(unit =>
      unit.controllerId !== playerId || unit.damage < unit.maxHealth));
  if (combat && !combat.outcome && bronzeArmyNeedsWithdrawal(state, playerId, combat)) mem.withdrawalCombatId = combat.id;
  // Outcome windows can span several actions. Count each settlement battle
  // exactly once, and keep the streak across turns, unrelated fights and saves.
  if (combat?.context.kind === "neutral" && combat.attackerPlayerId === playerId &&
      (combat.outcome || retreated) && !scoutedRetreat && mem.lastSettlementCombatId !== combat.id &&
      state.adventure?.fields[combat.context.fieldId]?.location === "settlement") {
    mem.lastSettlementCombatId = combat.id;
    if (combat.outcome?.winnerPlayerId !== playerId) mem.settlementLossRound = round;
    mem.settlementLossStreak = combat.outcome?.winnerPlayerId === playerId
      ? 0 : Math.min(2, (mem.settlementLossStreak ?? 0) + 1);
  }
  if (combat?.context.kind === "neutral" && combat.attackerPlayerId === playerId &&
      (retreated || combat.outcome && combat.outcome.winnerPlayerId !== playerId)) {
    const fieldId = combat.context.fieldId;
    mem.failedFields = [...(mem.failedFields ?? []).filter(entry => entry.fieldId !== fieldId),
      { fieldId, round, readiness: fightReadinessKey(state, playerId), scoutedRetreat,
        armyStrength: playerArmyStrength(state, playerId),
        hadPremiumBody: (state.players[playerId]?.army ?? []).some(unit => unit.side !== "bank" &&
          ["silver", "gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier)),
        // Main-hero level: repeatsFailedFight compares against the CURRENT
        // main hero, so a secondary's defeat must not skew the release rule.
        heroLevel: Object.values(state.heroes).find(hero =>
          hero.controllerId === playerId && hero.kind === "main")?.level ?? 0,
        hadArrow: state.players[playerId]?.hand.some((id) => baseCardId(id) === "spell.magic_arrow") ||
          state.players[playerId]?.spellBook?.includes("spell.magic_arrow") }].slice(-8);
  }

  switch (action.type) {
    case "MOVE_HERO":
    case "MOVE_HERO_PATH": {
      // Record the authoritative destination: path movement can stop early
      // for a visit, combat, or an interruption.
      const to = state.heroes[action.heroId]?.spaceId;
      if (!to) break;
      mem.routeHistory = [...(mem.routeHistory ?? []), { heroId: action.heroId, to, progress: routeProgressKey(state, playerId), round }].slice(-12);
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

/** Captured value / army development, not tile reveals or passive income. */
export function routeProgressKey(state: GameState, playerId: PlayerId): string {
  const player = state.players[playerId];
  const text = JSON.stringify([
    player?.army,
    Object.values(state.towns ?? {}).filter(t => t.controllerId === playerId).map(t => t.buildings),
    Object.values(state.heroes ?? {}).filter(h => h.controllerId === playerId).map(h => [h.id, h.level]),
    Object.values(state.adventure?.fields ?? {}).filter(f => f.flagOwnerId === playerId).map(f => [f.spaceId, f.blackCube]),
    Object.values(state.adventure?.fields ?? {}).filter(f => f.blackCube).map(f => f.spaceId),
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function repeatsUnproductiveRoute(state: GameState, playerId: PlayerId, action: GameAction, memory?: ComputerPolicyMemory): boolean {
  if ((action.type !== "MOVE_HERO" && action.type !== "MOVE_HERO_PATH") || !memory?.routeHistory) return false;
  const destination = action.type === "MOVE_HERO" ? action.to : action.path.at(-1);
  const progress = routeProgressKey(state, playerId);
  return memory.routeHistory.some(step => step.heroId === action.heroId && step.to === destination && step.progress === progress &&
    (step.round === undefined || state.round - step.round <= 3));
}

/** A new hand, stronger army or hero level can justify a rematch. More gold
 * alone cannot: spend it on preparation before retrying a failed guard. */
function fightReadinessKey(state: GameState, playerId: PlayerId): string {
  const player = state.players[playerId];
  return JSON.stringify([player?.army, [...(player?.hand ?? [])].sort(),
    Object.values(state.heroes ?? {}).filter(hero => hero.controllerId === playerId).map(hero => [hero.id, hero.level])]);
}

export function repeatsFailedFight(state: GameState, playerId: PlayerId, fieldId: string): boolean {
  const scouted = state.computerMemory?.[playerId]?.failedFields?.find(entry => entry.fieldId === fieldId);
  // A pristine withdrawal from the mandatory armored-guard rule is scouting,
  // not a failed attack. New guards next turn justify a retry; same-turn loops
  // remain blocked so remaining movement can collect resources instead.
  if (scouted?.scoutedRetreat) return state.round <= scouted.round;
  // A different hand alone is no longer a reason for a third bronze-only
  // settlement attempt. Let the normal map planner find income elsewhere
  // until a Silver (or higher) body is actually in the army.
  // Bounded like failedFields: without a window, two early losses plus an
  // unaffordable Silver would blacklist every settlement for the whole game.
  if (state.adventure?.fields[fieldId]?.location === "settlement" &&
      (state.computerMemory?.[playerId]?.settlementLossStreak ?? 0) >= 2 &&
      state.round - (state.computerMemory?.[playerId]?.settlementLossRound ?? 0) <= 8 &&
      !(state.players[playerId]?.army ?? []).some(unit => unit.side !== "bank" &&
        ["silver", "gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier))) return true;
  if (state.players[playerId]) {
    const failed = state.computerMemory?.[playerId]?.failedFields?.find(entry=>entry.fieldId===fieldId);
    if (failed?.armyStrength !== undefined && state.round - failed.round <= 3) {
      const level = Object.values(state.heroes).find(h=>h.controllerId===playerId && h.kind==="main")?.level ?? 0;
      const addedArrow = !failed.hadArrow &&
        (state.players[playerId].hand.some((id) => baseCardId(id) === "spell.magic_arrow") ||
          state.players[playerId].spellBook?.includes("spell.magic_arrow"));
      const field = state.adventure?.fields[fieldId];
      const premiumEconomy = Boolean(field && (field.location === "settlement" ||
        (field.location === "mine" && (field.resource === "gold" || field.resource === "valuables"))));
      const hasStrongBody = (state.players[playerId].army ?? []).some(unit => unit.side !== "bank" &&
        ["silver","gold","azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier));
      // A bronze-only strength tick or a fresh hand does NOT make a lost PREMIUM
      // fight (settlement / gold+valuables mine) winnable — recruiting chaff must
      // not unlock a grind against a mine we just lost four times. Require a real
      // upgrade (a silver+ body or a newly-added Magic Arrow); otherwise keep it
      // blocked so the planner routes to a beatable lower goods tile instead.
      // Non-premium fields keep the original bronze-strength/level release.
      const meaningfullyStronger = premiumEconomy
        ? (hasStrongBody && (failed.hadPremiumBody === false ||
            playerArmyStrength(state, playerId) > failed.armyStrength * 1.1)) || addedArrow
        : playerArmyStrength(state,playerId) > failed.armyStrength * 1.1 ||
          level > (failed.heroLevel ?? 0) || addedArrow;
      if (!meaningfullyStronger) return true;
    }
  }
  return (state.computerMemory?.[playerId]?.failedFields ?? []).some(entry =>
    entry.fieldId === fieldId && state.round - entry.round <= 2 &&
    entry.readiness === fightReadinessKey(state, playerId));
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
