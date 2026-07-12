import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { cardLibrary } from "@/data/cards/library";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { canHeroReachPlacedTile } from "../adventure";
import { isTileRotationConnected } from "../adventure-reducer";
import type {
  GameAction,
  GameState,
  MapSpaceId,
  PlayerId,
  ResourceCost,
  VisitStep,
} from "../state";
import { cardKeepValue } from "./card-policy";
import { playerArmyStrength } from "./army-strength";
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

function buildingScore(
  state: GameState,
  playerId: string,
  buildingId: string,
  memory: ComputerPolicyMemory,
): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
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
  // Multi-round focus: nudge toward the remembered economy priority.
  score += economyFocusBias(memory, focusKind);
  return score;
}

function populationScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "POPULATION_ACTION" }>,
): number {
  const state = observation.state as unknown as GameState;
  const memory = memoryOf(observation);
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
  score += economyFocusBias(memory, "recruit");
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
    case "PLACE_TILE":
      return { score: 785, policy: "map.explore-tile" };
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
          score: 300 + economyFocusBias(memory, "market"),
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
