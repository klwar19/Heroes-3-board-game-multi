import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { cardLibrary } from "@/data/cards/library";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  canHeroReachPlacedTile,
  getAdjacentSpaceIds,
  getUnitSide,
  neutralBattleLevel,
  playerHasPlaceableFarTile,
} from "../adventure";
import { isTileRotationConnected } from "../adventure-reducer";
import { hexSpaceId, tileFootprint } from "../hex";
import type {
  GameAction,
  GameState,
  HeroState,
  MapSpaceId,
  MapTileState,
  PlayerId,
  ResourceCost,
  VisitStep,
} from "../state";
import { cardKeepValue } from "./card-policy";
import { playerArmyStrength } from "./army-strength";
import {
  armyDevelopmentProfile,
  developmentResourceTargets,
} from "./development";
import {
  collectMapObjectives,
  objectiveDistanceField,
  ownTownSpaceId,
  primaryMapObjective,
  type MapObjectiveKind,
} from "./map-navigation";
import {
  economyFocusBias,
  emptyComputerMemory,
  visitedThisTurn,
  type ComputerPolicyMemory,
} from "./memory";
import type { ComputerObservation } from "./types";

function memoryOf(observation: ComputerObservation): ComputerPolicyMemory {
  return (
    observation.memory ??
    emptyComputerMemory((observation.state as { round?: number }).round ?? 0)
  );
}

export type ComputerActionScore = {
  score: number;
  policy: string;
};

/** Keep a small gold cushion so the AI does not spend to 0 and stall next turn. */
const GOLD_RESERVE = 5;

type ResourceKey = "gold" | "buildingMaterials" | "valuables";

function playerGold(state: GameState, playerId: string): number {
  return state.players[playerId]?.resources.gold ?? 0;
}

function playerResources(
  state: GameState,
  playerId: string,
): Record<ResourceKey, number> {
  const r = state.players[playerId]?.resources;
  return {
    gold: r?.gold ?? 0,
    buildingMaterials: r?.buildingMaterials ?? 0,
    valuables: r?.valuables ?? 0,
  };
}

/**
 * How much of each resource the seat "wants" right now (positive = deficit).
 * Public resource counts only — used to open the market and rank trades without
 * spinning forever on repeatable exchanges.
 */
export function resourceDeficits(
  state: GameState,
  playerId: PlayerId,
): Record<ResourceKey, number> {
  const res = playerResources(state, playerId);
  const army = state.players[playerId]?.army.length ?? 0;
  // Preserve the ACTUAL next dwelling cost. The old fixed 3 materials / one
  // valuable target made the market sell the Silver/Gold savings as "surplus",
  // leaving the computer permanently stuck on Bronze units.
  const target = developmentResourceTargets(state, playerId);
  const goldTarget = Math.max(target.gold, army < 5 ? 14 : 10) +
    (res.gold < GOLD_RESERVE ? 6 : 0);
  const wantGold = goldTarget - res.gold;
  const wantMats = Math.max(0, target.buildingMaterials - res.buildingMaterials) > 0
    ? target.buildingMaterials - res.buildingMaterials
    : res.buildingMaterials >= target.buildingMaterials + 2
      ? -(res.buildingMaterials - target.buildingMaterials - 1)
      : 0;
  const wantVals = target.valuables - res.valuables > 0
    ? target.valuables - res.valuables
    : res.valuables >= target.valuables + 2
      ? -(res.valuables - target.valuables - 1)
      : 0;
  return {
    gold: wantGold,
    buildingMaterials: wantMats,
    valuables: wantVals,
  };
}

/** True when at least one TRADE_RATES exchange would reduce a real deficit. */
export function hasUsefulMarketTrade(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return TRADE_RATES.some((rate, index) => tradeUtility(state, playerId, index) > 0);
}

/**
 * Net utility of one market rate: + for filling a deficit with surplus stock,
 * ≤0 when the seat would burn a scarce resource for something it does not need.
 */
export function tradeUtility(
  state: GameState,
  playerId: PlayerId,
  rateIndex: number,
): number {
  const rate = TRADE_RATES[rateIndex];
  if (!rate) return -99;
  const res = playerResources(state, playerId);
  // Must be able to pay (legal-actions already gates, but score still ranks).
  for (const key of Object.keys(rate.sell) as ResourceKey[]) {
    if ((res[key] ?? 0) < (rate.sell[key] ?? 0)) return -99;
  }
  const deficit = resourceDeficits(state, playerId);
  let utility = 0;
  for (const key of Object.keys(rate.sell) as ResourceKey[]) {
    const amount = rate.sell[key] ?? 0;
    // Selling something we still want is a cost; selling surplus is free-ish.
    const remainingWant = deficit[key];
    if (remainingWant > 0) {
      // Burning a scarce resource — heavy penalty.
      utility -= amount * 6;
    } else {
      // Surplus: mild cost so we do not spam-convert for no reason.
      utility -= amount * 0.5;
    }
  }
  for (const key of Object.keys(rate.buy) as ResourceKey[]) {
    const amount = rate.buy[key] ?? 0;
    const want = deficit[key];
    if (want > 0) {
      utility += Math.min(want, amount) * 5 + amount;
    } else {
      // Buying something we already have enough of is almost worthless.
      utility += 0.2;
    }
  }
  return utility;
}

/** Whether the seat should bother opening a market this turn. */
function wantsMarketVisit(state: GameState, playerId: PlayerId): boolean {
  if (hasUsefulMarketTrade(state, playerId)) return true;
  // Healthy gold + thin permanents → consider a war machine purchase.
  const gold = playerGold(state, playerId);
  const permanents = state.players[playerId]?.permanents?.length ?? 0;
  return gold >= GOLD_RESERVE + 12 && permanents < 2;
}

function buildingScore(
  state: GameState,
  playerId: PlayerId,
  buildingId: string,
  memory: ComputerPolicyMemory,
): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
  const development = armyDevelopmentProfile(state, playerId);
  const armySize = state.players[playerId]?.army.length ?? 0;
  const gold = playerGold(state, playerId);
  // When the army is thin, prefer recruit unlocks / reinforce over soft economy.
  const needsArmy = armySize < 4;
  // When gold is tight, deprioritise expensive soft builds so recruit can fire.
  const broke = gold < GOLD_RESERVE + 5;
  let score: number;
  let focusKind:
    | "build-recruit-unlock"
    | "build-income"
    | "build-magic"
    | "build-other" = "build-other";
  switch (effect?.type) {
    case "UNLOCK_RECRUIT_TIER":
      score =
        (effect.tier === "gold" ? 870 : effect.tier === "silver" ? 860 : 850) +
        (needsArmy ? 25 : 0);
      focusKind = "build-recruit-unlock";
      break;
    case "UNLOCK_REINFORCE":
      score = 865 + (needsArmy ? 25 : 0);
      focusKind = "build-recruit-unlock";
      break;
    case "RESOURCE_ROUND_CHOICE":
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      score = 820 + (broke ? 15 : 0);
      focusKind = "build-income";
      break;
    case "MAGE_GUILD":
      score = needsArmy || broke ? 740 : 810;
      focusKind = "build-magic";
      break;
    case "ROUND_START_FREE_SPRITE":
      score = 805 + (needsArmy ? 10 : 0);
      focusKind = "build-recruit-unlock";
      break;
    case "RUNE_ALTAR":
      score = 800 + effect.levelCap;
      focusKind = "build-magic";
      break;
    default:
      score = broke ? 760 : 790;
      focusKind = "build-other";
      break;
  }
  // Coherent development ladder: secure three Pack stacks, then unlock Silver,
  // then Gold. An immediately winning map step still scores above these bands,
  // but ordinary movement/fights wait until the round's key build is made.
  if (development.phase === "establish-core") {
    if (effect?.type === "UNLOCK_REINFORCE") {
      score = Math.max(score, 955);
    } else if (
      effect?.type === "UNLOCK_RECRUIT_TIER" &&
      effect.tier === "bronze"
    ) {
      score = Math.max(score, 950);
    } else if (
      !development.reinforceUnlocked ||
      !development.bronzeUnlocked
    ) {
      // Do not burn the Pack treasury on Mage Guild/economy/advanced buildings
      // before the two structures that make the starting army upgradeable.
      score = Math.min(score, 280);
    } else if (
      effect?.type === "UNLOCK_RECRUIT_TIER" &&
      (effect.tier === "silver" || effect.tier === "gold")
    ) {
      score = Math.min(score, 720);
    }
  } else if (
    development.phase === "unlock-silver" &&
    effect?.type === "UNLOCK_RECRUIT_TIER" &&
    effect.tier === "silver"
  ) {
    score = 955;
  } else if (
    development.phase === "unlock-gold" &&
    effect?.type === "UNLOCK_RECRUIT_TIER" &&
    effect.tier === "gold"
  ) {
    score = 950;
  }
  // Multi-round focus: nudge toward the remembered economy priority.
  score += economyFocusBias(memory, focusKind);
  const developmentMilestone =
    (development.phase === "establish-core" &&
      (effect?.type === "UNLOCK_REINFORCE" ||
        (effect?.type === "UNLOCK_RECRUIT_TIER" &&
          effect.tier === "bronze"))) ||
    (development.phase === "unlock-silver" &&
      effect?.type === "UNLOCK_RECRUIT_TIER" &&
      effect.tier === "silver") ||
    (development.phase === "unlock-gold" &&
      effect?.type === "UNLOCK_RECRUIT_TIER" &&
      effect.tier === "gold");
  if (developmentMilestone) {
    // A development focus may break a close tie, but must never outscore a
    // legal step that completes the scenario immediately (980).
    return Math.min(score, 975);
  }
  return score;
}

function populationScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "POPULATION_ACTION" }>,
): number {
  const state = observation.state as unknown as GameState;
  const memory = memoryOf(observation);
  const player = state.players[observation.playerId];
  const development = armyDevelopmentProfile(state, observation.playerId);
  const gold = player?.resources.gold ?? 0;
  let score = 860;
  let totalGain = 0;
  let totalCostWeight = 0;
  let spentGold = 0;
  let spentMaterials = 0;
  let spentValuables = 0;
  for (const purchase of action.purchases) {
    const definition = coreUnitDefinitions[purchase.unitDefId];
    const gainedSide = getUnitSide(
      purchase.unitDefId,
      purchase.kind === "reinforce" ? "pack" : "few",
    );
    const previousSide =
      purchase.kind === "reinforce"
        ? getUnitSide(purchase.unitDefId, "few")
        : null;
    // Spend the once-per-round Population token on the largest real combat
    // gain, not a hash-random unit among same-tier offers. Reinforcement is
    // valued by the Pack's improvement over Few; recruitment gains the whole
    // Few body. These are public printed stats only.
    const sideValue = gainedSide
      ? gainedSide.attack * 3 +
        gainedSide.health * 2 +
        gainedSide.defense +
        Math.round(gainedSide.initiative / 2)
      : 0;
    const previousValue = previousSide
      ? previousSide.attack * 3 +
        previousSide.health * 2 +
        previousSide.defense +
        Math.round(previousSide.initiative / 2)
      : 0;
    const gain = Math.max(0, sideValue - previousValue);
    totalGain += gain;
    const printedCost = gainedSide?.cost ?? {};
    spentGold += printedCost.gold ?? 0;
    spentMaterials += printedCost.buildingMaterials ?? 0;
    spentValuables += printedCost.valuables ?? 0;
    totalCostWeight +=
      (printedCost.gold ?? 0) +
      (printedCost.buildingMaterials ?? 0) * 3 +
      (printedCost.valuables ?? 0) * 7;

    if (development.phase === "establish-core") {
      if (purchase.kind === "reinforce") {
        // The primary opening: turn the three starting Few cards into Packs.
        score = Math.max(score, 955);
      } else if (development.totalUnits < 3) {
        score = Math.max(score, 960);
      } else {
        score = Math.max(score, 830);
      }
      continue;
    }

    // Once the core is ready, higher-tier bodies and their upgrades are the
    // efficient way to scale. While saving for the next dwelling, buying stray
    // Bronze cards must not consume that treasury.
    if (development.phase === "unlock-silver" || development.phase === "unlock-gold") {
      if (definition?.tier === "gold") score = Math.max(score, 940);
      else if (definition?.tier === "silver") score = Math.max(score, 915);
      else score = Math.min(score, 820);
    } else if (definition?.tier === "gold") {
      score = Math.max(score, purchase.kind === "reinforce" ? 950 : 955);
    } else if (definition?.tier === "silver") {
      score = Math.max(score, purchase.kind === "reinforce" ? 935 : 940);
    } else if (purchase.kind === "reinforce") {
      score = Math.max(score, 900);
    }
  }
  // Combat gain per weighted resource breaks same-stage ties intelligently.
  const efficiency = totalCostWeight > 0 ? totalGain / totalCostWeight : totalGain;
  score += Math.min(40, Math.round(totalGain * 1.5 + efficiency));
  if (gold >= GOLD_RESERVE + 10) score += 5;
  score += economyFocusBias(memory, "recruit");
  if (development.phase === "establish-core") {
    // Never postpone an adjacent scenario-winning capture just to buy a Pack,
    // while still beating ordinary fights, exploration, and END_TURN.
    return Math.min(score, 970 + Math.min(5, Math.round(efficiency)));
  }
  if (
    development.phase === "unlock-silver" ||
    development.phase === "unlock-gold"
  ) {
    const resources = player?.resources ?? {
      gold: 0,
      buildingMaterials: 0,
      valuables: 0,
    };
    const target = developmentResourceTargets(state, observation.playerId);
    const protectsNextDwelling =
      resources.gold - spentGold >= target.gold &&
      resources.buildingMaterials - spentMaterials >=
        target.buildingMaterials &&
      resources.valuables - spentValuables >= target.valuables;
    // Build the next dwelling before buying intermediate troops. Population
    // may still use genuine surplus without touching the saved Silver/Gold fund.
    return Math.min(score, protectsNextDwelling ? 940 : 820);
  }
  return score;
}

// Stepping directly ONTO an objective (flag it, visit it, or fight a beatable
// guard) outranks opening more land. Recruitment remains higher when it yields
// a meaningful combat gain, while victory sites override ordinary development.
const OBJECTIVE_ENTER_SCORE: Record<MapObjectiveKind, number> = {
  victory: 980,
  "enemy-hero": 890,
  guard: 870,
  town: 850,
  flaggable: 830,
  visitable: 810,
  explore: 720,
};
// A step that shrinks the distance to the sticky primary objective without
// arriving yet: above END_TURN so the march continues, below entering.
const OBJECTIVE_PROGRESS_BASE = 700;
// A step that reaches no objective / makes no progress: below END_TURN (300) so
// the hero stops instead of wandering back and forth over empty fields.
const NO_PROGRESS_SCORE = 260;
// Walking onto the hero's OWN town while marching elsewhere — classic
// ping-pong. Only allowed when the sticky target IS the town or we are
// already closer via that cell for the primary objective.
const OWN_TOWN_DETOUR_SCORE = 240;

function moveScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "MOVE_HERO" }>,
): number {
  const state = observation.state as unknown as GameState;
  const memory = memoryOf(observation);
  const field = state.adventure?.fields[action.to];
  const hero = state.heroes[action.heroId];
  if (!field || !hero) return NO_PROGRESS_SCORE;

  const objectives = collectMapObjectives(state, hero);
  // Cross-turn sticky from multi-round memory beats pure instantaneous primary.
  const primary = primaryMapObjective(
    state,
    hero,
    objectives,
    memory.stickyObjectiveSpaceId,
  );
  // March toward ONE sticky target so mid-turn objective drop-outs do not reverse
  // the hero through home town toward a different nearby prize.
  const marchTargets = primary ? [primary] : objectives;
  const distance = objectiveDistanceField(state, hero, marchTargets);
  const here = hero.spaceId ? distance.get(hero.spaceId) ?? Infinity : Infinity;
  const to = distance.get(action.to) ?? Infinity;

  const ownTown = ownTownSpaceId(state, observation.playerId);
  const steppingOntoOwnTown = ownTown !== null && action.to === ownTown;

  // The destination IS the sticky objective (or any objective if none sticky).
  const arriving = marchTargets.find((objective) => objective.spaceId === action.to);
  if (to === 0 && arriving) {
    return OBJECTIVE_ENTER_SCORE[arriving.kind];
  }

  // Not a chosen objective: keep clear of a fight we did not calculate for — an
  // enemy hero, a town garrison we did not pick as target, and any guard we
  // cannot beat. Bare enemy mines re-flag free (flaggable) and may be stepped
  // through / toward without this penalty.
  const opposingHero = Object.values(state.heroes).some(
    (other) => other.spaceId === action.to && other.controllerId !== observation.playerId,
  );
  if (opposingHero) {
    return 200;
  }
  if (field.flagOwnerId && field.flagOwnerId !== observation.playerId) {
    const cat = locationDefinitions[field.location]?.category;
    if (cat !== "flaggable") {
      return 200;
    }
  }
  if ((field.difficulty ?? 0) > 0 || field.location === "creature_bank") {
    return 250;
  }

  // Already walked this field this turn — never thrash back and forth.
  if (visitedThisTurn(memory, action.to) && to >= here) {
    return Math.min(NO_PROGRESS_SCORE, OWN_TOWN_DETOUR_SCORE);
  }

  // Progress toward the sticky objective: prefer the biggest step in.
  if (to < here) {
    // Prefer not to path through own town unless that IS the only progress.
    if (steppingOntoOwnTown && primary && primary.spaceId !== ownTown) {
      // Still progress, but only barely above END_TURN if every other step is
      // worse — usually a non-town neighbour with the same distance wins.
      return OBJECTIVE_PROGRESS_BASE - 40 + Math.max(0, 10 - to);
    }
    return OBJECTIVE_PROGRESS_BASE + Math.max(0, 10 - to);
  }

  if (steppingOntoOwnTown) {
    return OWN_TOWN_DETOUR_SCORE;
  }
  return NO_PROGRESS_SCORE;
}

/**
 * Revealing land is useful only until it competes with a known, reachable map
 * payoff. Once a mine, reward, beatable guard, town, enemy, or victory site is
 * visible, marching toward it must beat spending every movement point opening
 * more tiles. This is the conversion loop the old fixed 830 discovery score
 * lacked: explore -> identify value -> collect it -> develop the army.
 */
function explorationActionScore(
  observation: ComputerObservation,
  heroId: string,
  noKnownPayoffScore: number,
): number {
  const state = observation.state as unknown as GameState;
  const hero = state.heroes[heroId];
  if (!hero) return 650;
  const knownPayoffs = collectMapObjectives(state, hero).filter(
    (objective) => objective.kind !== "explore",
  );
  if (knownPayoffs.length === 0) {
    return noKnownPayoffScore;
  }
  // Keep discovery legal and attractive over END_TURN, but below build/recruit
  // and below objective progress/entry. A weak army especially needs to convert
  // known rewards into development before opening another frontier.
  return armyNeedsReinforcement(state, observation.playerId) ? 640 : 670;
}

/**
 * Grade how good a tile rotation is as an ENTRANCE for the placing/revealing
 * hero. `tileRotationScore` already prefers any rotation the hero can reach; this
 * refines the choice so the AI rotates the *easiest usable* field toward the hero
 * (an open field, or a guard it can beat) instead of walling a hard guard in
 * front of its own doorway. Returns a large positive band when a hero-facing
 * entrance exists — higher for an easier entrance — and a small fallback
 * otherwise so a plain reveal that only connects elsewhere stays legal but ranks
 * below every hero-facing orientation.
 */
function tileHeroEntryScore(
  observation: ComputerObservation,
  state: GameState,
  tile: MapTileState,
  rotation: number,
): number {
  const pending = state.adventure?.pendingTileChoice;
  const heroes: Array<HeroState | undefined> = pending?.heroId
    ? [state.heroes[pending.heroId]]
    : Object.values(state.heroes).filter(
        (hero) => hero.controllerId === observation.playerId,
      );
  const center = { row: tile.centerRow, col: tile.centerCol };
  const def = allTileDefinitions[tile.tileDefId];
  const slotByCell = new Map(
    tileFootprint(center, rotation).map(
      (cell, slot) => [hexSpaceId(cell), slot] as const,
    ),
  );
  let bestEntry = Number.NEGATIVE_INFINITY;

  for (const hero of heroes) {
    if (
      !hero?.spaceId ||
      !canHeroReachPlacedTile(state, hero, tile.tileDefId, center, rotation)
    ) {
      continue;
    }

    const battleLevel = neutralBattleLevel(state, hero);
    for (const neighborId of getAdjacentSpaceIds(hero.spaceId)) {
      const slot = slotByCell.get(neighborId);
      if (slot === undefined) {
        continue;
      }
      const field = def?.fields[slot];
      if (
        !field ||
        locationDefinitions[field.location]?.category === "blocked" ||
        (slot > 0 && Boolean(def?.outerImpassable[slot - 1]))
      ) {
        continue;
      }

      const difficulty = field.difficulty ?? 0;
      let entry = difficulty === 0 ? 130 : 70 - difficulty * 8;
      if (difficulty > 0 && battleLevel > difficulty) {
        entry += 35;
      } else if (difficulty > 0 && battleLevel === difficulty) {
        entry += 15;
      } else if (difficulty > battleLevel) {
        entry -= 80 + (difficulty - battleLevel) * 15;
      }
      bestEntry = Math.max(bestEntry, entry);
    }
  }

  if (Number.isFinite(bestEntry)) {
    // Own-hero access dominates a generic connection; difficulty then chooses
    // the easiest usable entrance instead of rotating a hard guard in front.
    return 120 + bestEntry;
  }
  // A plain reveal can be connected somewhere other than the revealing hero.
  // Keep it as a legal fallback, below every hero-facing orientation.
  return pending?.heroId ? 0 : -40;
}

/**
 * Score a tile rotation so the AI opens a doorway onto the new land instead of
 * sealing itself off with a random hash pick among equal foundation scores.
 */
function tileRotationScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "SET_TILE_ROTATION" }>,
): number {
  const state = observation.state as unknown as GameState;
  const adventure = state.adventure;
  const tile = adventure?.tiles[action.tileInstanceId];
  if (!adventure || !tile) {
    return 1_100;
  }

  let score = 1_100;
  if (isTileRotationConnected(state, tile, action.rotation)) {
    score += 30;
  }

  const pending = adventure.pendingTileChoice;
  const placingHero = pending?.heroId ? state.heroes[pending.heroId] : null;
  if (placingHero) {
    const center = { row: tile.centerRow, col: tile.centerCol };
    if (
      canHeroReachPlacedTile(
        state,
        placingHero,
        tile.tileDefId,
        center,
        action.rotation,
      )
    ) {
      // Reachable doorway for the placing hero — highest priority.
      score += 80;
    }
  } else {
    // On-foot discovery: prefer any rotation that stays connected (above).
    // Nudge rotations that put more non-blocked ring slots "open" toward the
    // map by rewarding connectedness only — materialization is rotation-fixed
    // after confirm; the connected gate is the practical "can walk in" proxy.
    score += 10;
  }

  score += tileHeroEntryScore(observation, state, tile, action.rotation);

  // Stable preference among equal scores (lower rotation when all equal).
  score += (6 - action.rotation) * 0.01;
  return score;
}

/**
 * Score a resource trade at an open Trading Post. Only positive-utility trades
 * beat the visit's "Done" exit, so the AI never spam-converts until broke.
 */
function tradeResourceScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "TRADE_RESOURCES" }>,
): number {
  const state = observation.state as unknown as GameState;
  const utility = tradeUtility(state, observation.playerId, action.rateIndex);
  if (utility <= 0) {
    // Below "Done trading" (520) so a useless exchange never loops.
    return 280;
  }
  // Band above Done (520) and below recruit/build so economy plays first, then
  // a single useful trade, then leave.
  return Math.min(700, 540 + Math.round(utility * 8));
}

/** Buy a war machine when gold is healthy and the seat does not already own it. */
function buyWarMachineScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "BUY_WAR_MACHINE" }>,
): number {
  const state = observation.state as unknown as GameState;
  const player = state.players[observation.playerId];
  const gold = player?.resources.gold ?? 0;
  const owned = player?.permanents ?? [];
  if (owned.includes(action.cardId)) {
    return 200;
  }
  // One machine is enough early; do not dump gold on a second/third while
  // coffers should fund recruits and builds.
  if (owned.length >= 1) {
    return gold >= GOLD_RESERVE + 30 ? 480 : 300;
  }
  if (gold < GOLD_RESERVE + 12) {
    // Prefer holding gold for recruits.
    return 400;
  }
  const card = cardLibrary[action.cardId];
  // Ballista / First Aid / Ammo Cart are all useful; slight preference order.
  // Keep below recruit/build (~850+) and above Done (520) only for the first buy.
  let score = 600;
  if (action.cardId.includes("ballista") || card?.name?.toLowerCase().includes("ballista")) {
    score += 20;
  } else if (
    action.cardId.includes("first_aid") ||
    card?.name?.toLowerCase().includes("first aid")
  ) {
    score += 15;
  } else if (action.cardId.includes("ammo")) {
    score += 10;
  }
  return score;
}

/**
 * Value of a nested VisitStep payload (Event/Astrologers/map reward branches).
 * Used to rank CHOOSE_ONE / PAY_TO options without parsing labels — the option
 * steps are the printed rules. Empty / pure-decline branches score low so the
 * AI still exits, but never freezes on a multi-option Event menu.
 */
function visitStepsUtility(
  state: GameState,
  playerId: PlayerId,
  steps: ReadonlyArray<VisitStep>,
): number {
  let utility = 0;
  const res = playerResources(state, playerId);
  const deficit = resourceDeficits(state, playerId);
  const army = state.players[playerId]?.army.length ?? 0;

  for (const step of steps) {
    switch (step.type) {
      case "GAIN_RESOURCES":
        utility += (step.gold ?? 0) * 2 + (step.buildingMaterials ?? 0) * 3 + (step.valuables ?? 0) * 6;
        break;
      case "GAIN_EXPERIENCE":
        utility += 18 + step.amount * 4;
        break;
      case "GAIN_MOVEMENT":
      case "GAIN_MOVEMENT_ANY_HERO":
      case "GAIN_MOVEMENT_FOR_HERO":
        utility += step.amount * 5;
        break;
      case "GAIN_MORALE":
      case "EVENT_CHANGE_MORALE":
        // Prefer positive morale; negative is only worth it when a strong
        // follow-up (treasure gamble, free reinforce) rides with it.
        utility += step.amount > 0 ? 16 + step.amount * 4 : step.amount * 8;
        break;
      case "EVENT_TREASURE_GAMBLE":
      case "ROLL_TREASURE_DICE":
        utility += 14 + step.count * 2;
        break;
      case "ROLL_RESOURCE_DICE":
        utility += 12 + step.count * 3;
        break;
      case "SEARCH_SHARED_DECK":
      case "EVENT_SEARCH_FRONT":
        utility += 22 + Math.min(12, (step as { count?: number }).count ?? 1) * 3;
        break;
      case "EVENT_DISCARD_CHEAPEST_UNIT":
        utility -= army <= 2 ? 40 : 18;
        break;
      case "REINFORCE_FREE":
        utility += 48;
        break;
      case "REINFORCE_ARMY_UNIT":
        utility += 36;
        break;
      case "RECRUIT_FREE":
        utility += 40;
        break;
      case "EVENT_DRAW_OWN":
      case "EVENT_DRAW_TO_LIMIT":
        utility += 20;
        break;
      case "EVENT_DISCARD_ALL_DRAW_LIMIT":
        utility += 8;
        break;
      case "LOSE_RESOURCES": {
        const lose =
          (step.gold ?? 0) * 2 +
          (step.buildingMaterials ?? 0) * 3 +
          (step.valuables ?? 0) * 6;
        utility -= lose;
        break;
      }
      case "SPEND_HERO_MOVEMENT":
        utility -= step.amount * 4;
        break;
      case "EVENT_AUCTION_SET_BID": {
        // Never dump the treasury on a blind lot. Prefer a modest bid (or 0)
        // that keeps GOLD_RESERVE; high bids only when gold is very flush.
        const amount = step.amount;
        if (amount === 0) {
          utility += 8;
          break;
        }
        const affordable = res.gold - amount >= GOLD_RESERVE;
        if (!affordable) {
          utility -= 50 + amount;
          break;
        }
        // Sweet spot: 1–4 gold when coffers can spare it (wins vs other 0-bids).
        if (amount <= 4) {
          utility += 28 - amount * 2;
        } else if (amount <= Math.floor(res.gold / 4)) {
          utility += 10 - amount;
        } else {
          utility -= amount;
        }
        break;
      }
      case "EVENT_MARKET_DEAL_OPEN": {
        // Propose only when we have surplus of `give` and want `get`.
        const give = step.give as ResourceKey;
        const get = step.get as ResourceKey;
        const giveSurplus = deficit[give] <= 0 && res[give] >= 1;
        const wantGet = deficit[get] > 0;
        utility += giveSurplus && wantGet ? 30 : giveSurplus ? 8 : -10;
        break;
      }
      case "EVENT_MARKET_DEAL_ACCEPT": {
        // Accept when the offered `give` (from proposer) is something we want
        // and we can spare `get`. Deal fields live on adventure.events.deal.
        const deal = state.adventure?.events?.deal;
        if (!deal) {
          utility += 5;
          break;
        }
        const wantIncoming = deficit[deal.give as ResourceKey] > 0;
        const canSpare = deficit[deal.get as ResourceKey] <= 0 || res[deal.get as ResourceKey] > 1;
        utility += wantIncoming && canSpare ? 35 : wantIncoming ? 12 : -5;
        break;
      }
      case "EVENT_NEUTRAL_BUY":
      case "EVENT_MERC_RECRUIT":
      case "EVENT_MERC_TAKE":
        utility += army < 5 ? 30 : 12;
        break;
      case "EVENT_ARTIFACT_SHOP":
      case "EVENT_SPELL_MARKET":
      case "EVENT_TAKE_CARD":
      case "EVENT_TAKE_POOL_CARD":
      case "EVENT_MESSENGER_DRAW":
        utility += 24;
        break;
      case "GRANT_WAR_MACHINE":
        // Free grant is excellent; paid only when gold is healthy (cost checked
        // by legal-actions, but still prefer free / cheap).
        utility += step.cost ? (res.gold >= GOLD_RESERVE + (step.cost.gold ?? 0) + 5 ? 22 : 8) : 32;
        break;
      case "RECRUIT_DRAWN_NEUTRAL":
      case "RECRUIT_FACTION_UNIT":
        utility += army < 6 ? 28 : 12;
        break;
      case "EVENT_REMOVE_FOR_SEARCH":
        // Paying cards for a Search is fine when the hand is full of fodder.
        utility += 18;
        break;
      case "EVENT_HERMIT_PAY_SEARCH":
        utility += res.gold >= GOLD_RESERVE + 5 ? 20 : 5;
        break;
      case "EVENT_PRISON_OFFER":
        utility += 25;
        break;
      case "EVENT_DEN_OF_THIEVES":
      case "EVENT_DEN_DRAW":
      case "EVENT_DEN_PLACE":
        utility += 16;
        break;
      case "EVENT_LEPRECHAUN_ROLL":
      case "EVENT_TAKE_POOL_DIE":
        utility += 14;
        break;
      case "EVENT_FOREST_CONTRIBUTE":
      case "EVENT_FOREST_TAKE":
      case "EVENT_POOL_ADD_FROM_HAND":
      case "EVENT_POOL_TAKE_RANDOM":
        utility += 12;
        break;
      case "CHOOSE_ONE":
        // Nested menus (rare): take the best child option's utility.
        utility += Math.max(
          0,
          ...step.options.map((opt) => visitStepsUtility(state, playerId, opt.steps)),
        );
        break;
      case "PAY_TO":
        // Prefer the cheapest cost option that leaves reserve gold.
        utility += 10;
        break;
      default:
        // Unknown auto-resolve steps are mildly positive (progress, not stall).
        utility += 6;
        break;
    }
  }
  return utility;
}

/**
 * Rank income-level picks (settlement flag / resource mine levels): prefer gold
 * when broke, materials when building, valuables last unless already stocked.
 */
function resourceIncomeOptionScore(
  state: GameState,
  playerId: PlayerId,
  optionIndex: number,
): number {
  const deficit = resourceDeficits(state, playerId);
  // Engine order: 0 gold, 1 materials, 2 valuables (then reinforce indices).
  if (optionIndex === 0) {
    return 1_100 + Math.max(0, deficit.gold) * 2 + (deficit.gold > 0 ? 20 : 5);
  }
  if (optionIndex === 1) {
    return 1_100 + Math.max(0, deficit.buildingMaterials) * 3 + (deficit.buildingMaterials > 0 ? 18 : 4);
  }
  if (optionIndex === 2) {
    return 1_100 + Math.max(0, deficit.valuables) * 4 + (deficit.valuables > 0 ? 16 : 2);
  }
  // Reinforce few→pack at settlement (indices 3+): strong when army is thin.
  const army = state.players[playerId]?.army.length ?? 0;
  return 1_100 + (army < 5 ? 35 : 15) - Math.min(10, optionIndex);
}

/**
 * Visit-step resolution: market "Done", Event/Astrologers menus, settlement
 * income, Witch Hut / Magic Spring / Hill Fort / Tavern, and generic picks.
 * Decline must outrank wasteful trades so an open market always exits cleanly;
 * every other open visit always has a scored pick so the runner never freezes.
 */
function resolveVisitStepScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>,
): number {
  const state = observation.state as unknown as GameState;
  const playerId = observation.playerId;
  const step = state.adventure?.pendingVisit?.steps[0];
  const optionIndex = action.optionIndex ?? 0;

  // Explicit Done / Leave (decline: true) — safe exit from any open visit.
  if (action.decline) {
    if (step?.type === "TRADING_POST" || step?.type === "WAR_MACHINE_SHOP") {
      return 520; // above wasteful trades (280), below useful trades (540+)
    }
    // Optional pay-sites / shops: declining is fine but below a real take.
    if (
      step?.type === "PAY_TO" ||
      step?.type === "WITCH_HUT" ||
      step?.type === "MAGIC_SPRING" ||
      step?.type === "HILL_FORT" ||
      step?.type === "TAVERN" ||
      step?.type === "SEARCH_DISCARD" ||
      step?.type === "REMOVE_HAND_CARD" ||
      step?.type === "DISCOVER_ADJACENT_TILE"
    ) {
      return 1_050;
    }
    // Generic visit skip — resolve and move on (still above END_TURN).
    return 1_080;
  }

  if (!step) {
    return 1_090;
  }

  // --- CHOOSE_ONE (Events, Astrologers dice picks, map multi-options) --------
  if (step.type === "CHOOSE_ONE") {
    const option = step.options[optionIndex];
    if (!option) return 1_000;
    const utility = visitStepsUtility(state, playerId, option.steps);
    // Empty steps = "leave / cancel / decline" branch.
    if (option.steps.length === 0) {
      return 1_050;
    }
    // Band [1_060, 1_180] so every real pick outranks decline (1_050) and the
    // runner always has a measurable best option (no all-tie hash thrash on
    // auctions — utility differentiates bid amounts).
    return 1_100 + Math.max(-40, Math.min(80, Math.round(utility)));
  }

  // --- PAY_TO (optional paid field uses) ------------------------------------
  if (step.type === "PAY_TO") {
    const cost: ResourceCost = step.costOptions[optionIndex] ?? {};
    const goldCost = cost.gold ?? 0;
    const matsCost = cost.buildingMaterials ?? 0;
    const valsCost = cost.valuables ?? 0;
    const gold = playerGold(state, playerId);
    // Cannot leave reserve — prefer decline path (1_050) by scoring lower.
    if (gold - goldCost < GOLD_RESERVE && goldCost > 0) {
      return 1_020;
    }
    const followUp = visitStepsUtility(state, playerId, step.steps);
    const costPenalty = goldCost * 2 + matsCost * 3 + valsCost * 5;
    return 1_100 + Math.max(-30, Math.min(60, Math.round(followUp - costPenalty)));
  }

  // --- Settlement / mine income levels --------------------------------------
  if (step.type === "SETTLEMENT_CHOICE" || step.type === "RESOURCE_GAIN_LEVEL") {
    return resourceIncomeOptionScore(state, playerId, optionIndex);
  }

  // --- Witch Hut: take ability > put in discard > skip ----------------------
  if (step.type === "WITCH_HUT") {
    if (optionIndex === 0) return 1_140; // take into hand
    if (optionIndex === 1) return 1_090; // discard (still progresses deck)
    return 1_050;
  }

  // --- Magic Spring: return highest-value discard card ----------------------
  if (step.type === "MAGIC_SPRING") {
    const player = state.players[playerId];
    const topThree = player?.discard.slice(-3).reverse() ?? [];
    const cardId = topThree[optionIndex];
    if (!cardId) return 1_050;
    return 1_100 + Math.min(40, cardKeepValue(cardId));
  }

  // --- Search discard top: take best card -----------------------------------
  if (step.type === "SEARCH_DISCARD") {
    const deck = state.decks[step.deckId];
    const topCards = deck ? deck.discardPile.slice(-step.count).reverse() : [];
    const cardId = topCards[optionIndex];
    if (!cardId) return 1_050;
    return 1_100 + Math.min(40, cardKeepValue(cardId));
  }

  // --- Remove hand card: dump lowest keep value -----------------------------
  if (step.type === "REMOVE_HAND_CARD") {
    const hand = state.players[playerId]?.hand ?? [];
    // legal-actions indexes removable cards; optionIndex maps into that list
    // only approximately when filters apply — still prefer lower-value cards
    // when the index lands on the raw hand (common for unfiltered removes).
    const cardId = hand[optionIndex];
    if (!cardId) return 1_100;
    return 1_100 + Math.max(0, 40 - Math.min(40, cardKeepValue(cardId)));
  }

  // --- Hill Fort: reinforce when offered (legal-actions already gates cost) -
  if (step.type === "HILL_FORT") {
    return 1_130 - Math.min(15, optionIndex);
  }

  // --- Tavern: take secondary hero when gold allows (legal set only) --------
  if (step.type === "TAVERN") {
    return 1_120 - Math.min(10, optionIndex);
  }

  // --- Observatory: prefer discovering over skip ----------------------------
  if (step.type === "DISCOVER_ADJACENT_TILE") {
    return 1_130 - Math.min(10, optionIndex);
  }

  // Sell a hand card at the Trading Post for 1 gold: only dump junk.
  if (step.type === "TRADING_POST") {
    const gold = playerGold(state, playerId);
    if (gold < GOLD_RESERVE) {
      return 560;
    }
    return 480;
  }

  // Other structured visit picks (rewards, choices): take them.
  return 1_090 + Math.max(0, 10 - optionIndex);
}

/**
 * Strategic scores for finite adventure-map actions. Returning null delegates
 * to the total safety fallback. Market trades are scored (with a Done exit
 * above wasteful rates) so the AI can rebalance resources without looping.
 */
export function scoreMapAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  const state = observation.state as unknown as GameState;
  const memory = memoryOf(observation);
  switch (action.type) {
    case "POPULATION_ACTION":
      return {
        score: populationScore(observation, action),
        policy: "map.recruit-army",
      };
    case "BUILD_STRUCTURE":
      return {
        score: buildingScore(
          state,
          observation.playerId,
          action.buildingId,
          memory,
        ),
        policy: "map.build-structure",
      };
    case "SET_TILE_ROTATION":
      return {
        score: tileRotationScore(observation, action),
        policy: "map.rotate-tile-for-path",
      };
    case "HIRE_SECONDARY_HERO": {
      // A secondary hero early drains gold that should go into the army/town.
      // Only worth it once the main force is already decent.
      const army = state.players[observation.playerId]?.army.length ?? 0;
      return {
        score: army >= 5 ? 700 : 420,
        policy: "map.hire-secondary-hero",
      };
    }
    case "DISCOVER_TILE":
      return {
        score: explorationActionScore(observation, action.heroId, 830),
        policy: "map.discover-tile",
      };
    case "PLACE_TILE": {
      // Ⅱ–Ⅲ placement is the escape hatch when the hero is boxed by sealed
      // Near/center faces (the "stare at VI–VII" stall). Boost further when no
      // fightable prize remains so expand-or-recruit wins over END_TURN.
      const hero = state.heroes[action.heroId];
      const objectives = hero ? collectMapObjectives(state, hero) : [];
      const hasFight = objectives.some(
        (objective) =>
          objective.kind === "guard" ||
          objective.kind === "enemy-hero" ||
          objective.kind === "victory",
      );
      const hasExplore = objectives.some((objective) => objective.kind === "explore");
      // Prefer place when boxed (no fight + only expand left) or when the seat
      // still holds supply and nothing better is on the board.
      const expandUrgency =
        !hasFight && playerHasPlaceableFarTile(state, observation.playerId)
          ? 40
          : hasExplore
            ? 15
            : 25;
      return {
        score: explorationActionScore(
          observation,
          action.heroId,
          780 + expandUrgency,
        ),
        policy: "map.place-far-tile",
      };
    }
    case "PLACE_OBSERVATORY_TILE":
      return {
        score: 1_130,
        policy: "map.observatory-place-expansion-tile",
      };
    case "MOVE_HERO":
      return { score: moveScore(observation, action), policy: "map.move-to-objective" };
    case "REVISIT_FIELD": {
      // Revisits are optional luxuries — never outrank marching to new land or
      // a real objective (was 690 and pulled heroes back to known sites).
      // Markets use free OPEN_MARKET, not this 1-MP revisit.
      // Multi-round memory: do not re-spend MP on a field already walked this turn.
      const heroSpace = state.heroes[action.heroId]?.spaceId;
      if (heroSpace && visitedThisTurn(memory, heroSpace)) {
        return { score: 200, policy: "map.revisit-thrash-skip" };
      }
      return { score: 480, policy: "map.revisit-location" };
    }
    case "OPEN_MARKET": {
      // Free while parked on a market. Only open when a useful trade or shop
      // buy exists — otherwise the hero would open/close forever (score 0 was
      // below END_TURN so it never opened; a high unconditional score loops).
      if (!wantsMarketVisit(state, observation.playerId)) {
        return { score: 250, policy: "map.market-skip-balanced" };
      }
      // Already used the market this round — avoid open/close thrash.
      if (memory.lastMarketRound === state.round) {
        return {
          score: 240,
          policy: "map.market-already-used",
        };
      }
      return {
        score: 680 + economyFocusBias(memory, "market"),
        policy: "map.open-market",
      };
    }
    case "TRADE_RESOURCES":
      return {
        score: tradeResourceScore(observation, action),
        policy: "map.trade-resources",
      };
    case "BUY_WAR_MACHINE":
      return {
        score: buyWarMachineScore(observation, action),
        policy: "map.buy-war-machine",
      };
    case "SELL_SCROLL_SPELL":
      // Selling scroll spells for 2 gold — only when gold is tight.
      return {
        score: playerGold(state, observation.playerId) < GOLD_RESERVE + 4 ? 550 : 300,
        policy: "map.sell-scroll-spell",
      };
    case "MOVE_SPELL_TO_SPELL_BOOK": {
      const hand = state.players[observation.playerId]?.hand ?? [];
      const crowded = hand.length >= 4;
      return {
        score: crowded ? 690 + Math.min(35, cardKeepValue(action.cardId)) : 260,
        policy: crowded ? "card.store-spell-free-hand-slot" : "card.keep-spell-ready",
      };
    }
    case "ASTROLOGERS_HERO_EMPOWER":
      return { score: 735, policy: "card.empower-statistic" };
    case "CRACK_PERMANENT": {
      const card = cardLibrary[action.cardId];
      const option = card?.effect.type === "CHOOSE_ONE"
        ? card.effect.options.find(
            (candidate) =>
              candidate.cost?.removeSelf &&
              candidate.effect.type === "GAIN_RESOURCES",
          )
        : undefined;
      const gain = option?.effect.type === "GAIN_RESOURCES"
        ? option.effect.gain
        : {};
      const deficit = resourceDeficits(state, observation.playerId);
      const useful =
        Math.min(Math.max(0, deficit.gold), gain.gold ?? 0) * 5 +
        Math.min(
          Math.max(0, deficit.buildingMaterials),
          gain.buildingMaterials ?? 0,
        ) * 15 +
        Math.min(Math.max(0, deficit.valuables), gain.valuables ?? 0) * 25;
      return {
        score: useful > 0 ? 650 + Math.min(120, useful) : 220,
        policy: useful > 0
          ? "card.crack-income-to-fund-plan"
          : "card.keep-income-permanent",
      };
    }
    case "DISCARD_PERMANENT":
      return { score: 100, policy: "card.keep-useful-permanent" };
    case "COMMANDER_GRADE_UP": {
      const priorities = {
        attack: 760,
        damage: 750,
        defense: 735,
        health: 725,
        speed: 715,
        magic: 705,
      } as const;
      return {
        score: priorities[action.stat],
        policy: "commander.grade-combat-impact",
      };
    }
    case "REVIVE_COMMANDER": {
      const hero = Object.values(state.heroes).find(
        (candidate) =>
          candidate.controllerId === observation.playerId &&
          candidate.kind === "main",
      );
      const cost = 2 + 2 * (hero?.level ?? 1);
      const gold = playerGold(state, observation.playerId);
      return {
        score: gold - cost >= GOLD_RESERVE ? 740 : 290,
        policy: "commander.revive-with-reserve",
      };
    }
    case "COMMANDER_SET_STANCE":
      return {
        score: action.stance === "attack" ? 720 : 710,
        policy: "commander.set-pressure-stance",
      };
    case "RESOLVE_VISIT_STEP":
      return {
        score: resolveVisitStepScore(observation, action),
        policy: "map.resolve-visit",
      };
    case "SPELL_BOOK_ACTION":
      return {
        score:
          armyDevelopmentProfile(state, observation.playerId).phase ===
          "improve-army"
            ? 620
            : 250,
        policy: "town.buy-spells-after-army-core",
      };
    case "MAGIC_UNIVERSITY_ACTION":
      return {
        score:
          armyDevelopmentProfile(state, observation.playerId).phase ===
          "improve-army"
            ? 615
            : 290,
        policy: "town.use-magic-university-after-core",
      };
    case "BLACKSMITH_ACTION":
      return {
        score:
          action.option === "sell"
            ? 640
            : armyDevelopmentProfile(state, observation.playerId).phase ===
                "improve-army"
              ? 590
              : 260,
        policy: action.option === "sell" ? "town.sell-artifact" : "town.search-artifact",
      };
    case "USE_TOWN_BUILDING":
      return { score: 585, policy: "town.use-building" };
    case "SATYR_MORALE_ROLL":
      return { score: 575, policy: "map.use-free-army-action" };
    case "ROGUES_SCOUT_DECK":
    case "THIEVES_GUILD_ACTION":
      return { score: 540, policy: "map.scout-deck" };
    case "SKIP_NECROMANCY":
      // Only offered when the seat owns the window and chose not to play the
      // card — close the gate so the field reward / next turn can proceed.
      return { score: 1_120, policy: "map.skip-necromancy" };
    default:
      return null;
  }
}

/** @internal test helper — expose army weakness nudge without exporting score guts. */
export function armyNeedsReinforcement(
  state: GameState,
  playerId: string,
): boolean {
  const army = state.players[playerId]?.army.length ?? 0;
  return army < 4 || playerArmyStrength(state, playerId) < 20;
}

/** @internal — re-export for tests that want sticky target space. */
export function stickyObjectiveSpace(
  state: GameState,
  heroId: string,
  stickySpaceId?: MapSpaceId | null,
): MapSpaceId | null {
  const hero = state.heroes[heroId];
  if (!hero) return null;
  return primaryMapObjective(state, hero, undefined, stickySpaceId)?.spaceId ?? null;
}
