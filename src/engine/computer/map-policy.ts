import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { cardLibrary } from "@/data/cards/library";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { canHeroReachPlacedTile } from "../adventure";
import { isTileRotationConnected } from "../adventure-reducer";
import type { GameAction, GameState, MapSpaceId, PlayerId } from "../state";
import { playerArmyStrength } from "./army-strength";
import {
  collectMapObjectives,
  objectiveDistanceField,
  ownTownSpaceId,
  primaryMapObjective,
  type MapObjectiveKind,
} from "./map-navigation";
import type { ComputerObservation } from "./types";

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
  // Target stocks: enough gold to recruit, a small mat pile, one valuable.
  // Positive = want more; zero/negative = surplus (do not buy more of it).
  const goldTarget = (army < 5 ? 14 : 10) + (res.gold < GOLD_RESERVE ? 6 : 0);
  const wantGold = goldTarget - res.gold;
  const wantMats = Math.max(0, 3 - res.buildingMaterials) > 0
    ? 3 - res.buildingMaterials
    : res.buildingMaterials >= 5
      ? -(res.buildingMaterials - 4)
      : 0;
  const wantVals =
    res.valuables <= 0 ? 1 : res.valuables >= 2 ? -(res.valuables - 1) : 0;
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

function buildingScore(state: GameState, playerId: string, buildingId: string): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
  const armySize = state.players[playerId]?.army.length ?? 0;
  const gold = playerGold(state, playerId);
  // When the army is thin, prefer recruit unlocks / reinforce over soft economy.
  const needsArmy = armySize < 4;
  // When gold is tight, deprioritise expensive soft builds so recruit can fire.
  const broke = gold < GOLD_RESERVE + 5;
  switch (effect?.type) {
    case "UNLOCK_RECRUIT_TIER":
      return (
        (effect.tier === "gold" ? 870 : effect.tier === "silver" ? 860 : 850) +
        (needsArmy ? 25 : 0)
      );
    case "UNLOCK_REINFORCE":
      return 865 + (needsArmy ? 25 : 0);
    case "RESOURCE_ROUND_CHOICE":
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      return 820 + (broke ? 15 : 0);
    case "MAGE_GUILD":
      return needsArmy || broke ? 740 : 810;
    case "ROUND_START_FREE_SPRITE":
      return 805 + (needsArmy ? 10 : 0);
    case "RUNE_ALTAR":
      return 800 + effect.levelCap;
    default:
      return broke ? 760 : 790;
  }
}

function populationScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "POPULATION_ACTION" }>,
): number {
  const state = observation.state as unknown as GameState;
  const player = state.players[observation.playerId];
  const armySize = player?.army.length ?? 0;
  const gold = player?.resources.gold ?? 0;
  let score = 900 + (armySize < 4 ? 30 : armySize < 6 ? 12 : 0);
  // Prefer recruiting while gold is healthy; still recruit when thin even if
  // broke (army is the win condition).
  if (gold >= GOLD_RESERVE + 10) score += 8;
  for (const purchase of action.purchases) {
    if (purchase.kind === "reinforce") {
      score += 14;
      continue;
    }
    const unit = coreUnitDefinitions[purchase.unitDefId];
    if (unit?.tier === "gold") score += 20;
    else if (unit?.tier === "silver") score += 14;
    else score += 8;
  }
  return score;
}

// Stepping directly ONTO an objective (flag it, visit it, or fight a beatable
// guard) — kept below map develop/discover actions so the hero still builds,
// recruits and reveals adjacent tiles first, but well above END_TURN (300).
// Victory sites sit above recruit-adjacent movement so the AI commits to the win.
const OBJECTIVE_ENTER_SCORE: Record<MapObjectiveKind, number> = {
  victory: 880,
  "enemy-hero": 770,
  guard: 760,
  town: 750,
  flaggable: 740,
  visitable: 720,
  explore: 735,
};
// A step that shrinks the distance to the sticky primary objective without
// arriving yet: above END_TURN so the march continues, below entering.
const OBJECTIVE_PROGRESS_BASE = 630;
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
  const field = state.adventure?.fields[action.to];
  const hero = state.heroes[action.heroId];
  if (!field || !hero) return NO_PROGRESS_SCORE;

  const objectives = collectMapObjectives(state, hero);
  const primary = primaryMapObjective(state, hero, objectives);
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
 * Visit-step resolution: market "Done", sell-a-card, and generic decline/pick.
 * Decline must outrank wasteful trades so an open market always exits cleanly.
 */
function resolveVisitStepScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>,
): number {
  const state = observation.state as unknown as GameState;
  const step = state.adventure?.pendingVisit?.steps[0];

  // Explicit Done / Leave (decline: true) — safe exit from any open visit.
  if (action.decline) {
    if (step?.type === "TRADING_POST" || step?.type === "WAR_MACHINE_SHOP") {
      return 520; // above wasteful trades (280), below useful trades (540+)
    }
    // Generic visit skip/done — resolve and move on.
    return 1_080;
  }

  // Sell a hand card at the Trading Post for 1 gold: only dump junk.
  if (step?.type === "TRADING_POST" && action.optionIndex !== undefined) {
    const player = state.players[observation.playerId];
    // legal-actions indexes removable hand cards; we only have the index, so
    // prefer selling when gold is tight (any sell is better than stuck broke).
    const gold = player?.resources.gold ?? 0;
    if (gold < GOLD_RESERVE) {
      return 560;
    }
    // Mild positive — real ranking of which card is sold is limited without
    // the engine's removable list; prefer Done when flush.
    return 480;
  }

  // Other structured visit picks (rewards, choices): take them.
  return 1_090;
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
  switch (action.type) {
    case "POPULATION_ACTION":
      return {
        score: populationScore(observation, action),
        policy: "map.recruit-army",
      };
    case "BUILD_STRUCTURE":
      return {
        score: buildingScore(state, observation.playerId, action.buildingId),
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
    case "PLACE_TILE":
      return { score: 785, policy: "map.explore-tile" };
    case "MOVE_HERO":
      return { score: moveScore(observation, action), policy: "map.move-to-objective" };
    case "REVISIT_FIELD":
      // Revisits are optional luxuries — never outrank marching to new land or
      // a real objective (was 690 and pulled heroes back to known sites).
      // Markets use free OPEN_MARKET, not this 1-MP revisit.
      return { score: 480, policy: "map.revisit-location" };
    case "OPEN_MARKET": {
      // Free while parked on a market. Only open when a useful trade or shop
      // buy exists — otherwise the hero would open/close forever (score 0 was
      // below END_TURN so it never opened; a high unconditional score loops).
      if (!wantsMarketVisit(state, observation.playerId)) {
        return { score: 250, policy: "map.market-skip-balanced" };
      }
      return { score: 680, policy: "map.open-market" };
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
    case "RESOLVE_VISIT_STEP":
      return {
        score: resolveVisitStepScore(observation, action),
        policy: "map.resolve-visit",
      };
    case "SPELL_BOOK_ACTION":
      return { score: 620, policy: "town.buy-spells" };
    case "MAGIC_UNIVERSITY_ACTION":
      return { score: 615, policy: "town.use-magic-university" };
    case "BLACKSMITH_ACTION":
      return {
        score: action.option === "sell" ? 640 : 590,
        policy: action.option === "sell" ? "town.sell-artifact" : "town.search-artifact",
      };
    case "USE_TOWN_BUILDING":
      return { score: 585, policy: "town.use-building" };
    case "SATYR_MORALE_ROLL":
      return { score: 575, policy: "map.use-free-army-action" };
    case "ROGUES_SCOUT_DECK":
    case "THIEVES_GUILD_ACTION":
      return { score: 540, policy: "map.scout-deck" };
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
): MapSpaceId | null {
  const hero = state.heroes[heroId];
  if (!hero) return null;
  return primaryMapObjective(state, hero)?.spaceId ?? null;
}
