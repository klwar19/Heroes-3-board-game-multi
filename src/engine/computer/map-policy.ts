import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { HERO_GRADE_NODES } from "@/data/anime/hero-grades";
import { getEquipmentDefinition } from "@/data/anime/equipment";
import { heroEquipmentSlot } from "../anime-equipment";
import { cardLibrary } from "@/data/cards/library";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import { hasInternalBorder } from "@/data/map/borders";
import {
  adventureVictoryMode,
  canHeroImmediatelyReachPlacementCenter,
  canHeroReachPlacementCenter,
  canHeroReachPlacedTile,
  gateFieldsLinked,
  getAdjacentSpaceIds,
  getUnitSide,
  isFieldGuarded,
  isOuterEdgeSealed,
  neutralBattleLevel,
  playerHasPlaceableFarTile,
} from "../adventure";
import {
  canHeroDiscoverAdjacentTile,
  canHeroImmediatelyAccessAdjacentTile,
  isTileRotationConnected,
} from "../adventure-reducer";
import { hexSpaceId, tileFootprint } from "../hex";
import type {
  GameAction,
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId,
  ResourceCost,
  VisitStep,
} from "../state";
import { cardKeepValue } from "./card-policy";
import { playersAreAllied } from "./control";
import { cardTier } from "./card-values";
import { isPremiumEconomyField, playerArmyStrength } from "./army-strength";
import { polishArmyUnitStackCost, polishUnitStackCost } from "../polish-unit-stacks";
import { effectiveTownBuildingCost } from "../house-rules";
import { armyUnitRankInfo } from "../unit-experience";
import {
  armyDevelopmentProfile,
  armyReadyForContestedFight,
  assessDwellingRush,
  developmentResourceTargets,
  hasOpenedFarEconomy,
  unitDevelopmentSideStrength,
  shouldPrioritizeFirstAidTent,
  shouldSeekLateWarMachineShop,
  shouldLaunchBronzeRush,
} from "./development";
import {
  canBeatGuardedField,
  collectMapObjectives,
  farExpansionRouteRemains,
  freeSeizuresWithinReach,
  heroCanBeatNoGuardInBand,
  isHomeTileOpeningObjective,
  lowerExpansionBandImmediatelyAvailable,
  homeTileInstanceId,
  objectiveDistanceField,
  premiumEconomyResourceBonus,
  primaryMapObjective,
  startTileRotationOpensFarExpansion,
  type MapObjective,
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

function latestPlacedTileId(state: GameState, playerId: PlayerId): string | null {
  for (let index = state.eventLog.length - 1; index >= 0; index -= 1) {
    const event = state.eventLog[index];
    if (event.type === "TILE_PLACED" && event.playerId === playerId) {
      return event.tileInstanceId;
    }
  }
  return null;
}

/** Keep a small gold cushion so the AI does not spend to 0 and stall next turn. */
const GOLD_RESERVE = 5;
/** The opening four rounds avoid markets except a well-funded First Aid Tent. */
export const MARKET_MIN_ROUND = 5;

// Dwelling-rush trade planner (see development.assessDwellingRush).
/** A trade that converts genuine surplus into the missing dwelling input — above
 *  Done (520) and every generic trade (<=700) so the conversion runs to completion. */
const DWELLING_RUSH_TRADE_SCORE = 720;
/** A dwelling-input purchase the rush deems INFEASIBLE (would eat the recruit
 *  reserve) — below Done (520) so the seat leaves the market without stripping it. */
const DWELLING_RUSH_SUPPRESS_SCORE = 280;
/** Opening the market to run a feasible dwelling rush: decisive economy play. Set
 *  above the unlock-phase recruit ceiling (940) so the AI rushes the dwelling
 *  before spending its gold on stray troops, yet below the dwelling BUILD (950/955)
 *  and any scenario-winning map step (victory enter 980). */
const DWELLING_RUSH_OPEN_MARKET_SCORE = 945;

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
  // DWELLING-INPUT FLOOR: until the Gold dwelling stands, materials and
  // valuables are the bottleneck the whole tempo hangs on, and the market
  // spread makes every sell-then-rebuy a net loss (1m sells for 1g, rebuys at
  // 2g; 1v sells for 3g, rebuys at 6g). Measured pre-fix: seven materials
  // dumped at 1:1 plus a v→2m / 3m→v churn cycle in the round before the
  // Silver dwelling. A trade may only sell m/v stock that stays a cushion
  // ABOVE the current dwelling target after the sale (materials keep +3
  // toward the NEXT dwelling's rebuild; valuables +2, they trickle slower).
  // The margin also breaks the churn pair: after a v→m conversion the bought
  // side sits at/above its target, so the reverse trade buys "nothing wanted"
  // and scores below zero.
  if (!armyDevelopmentProfile(state, playerId).goldUnlocked) {
    const target = developmentResourceTargets(state, playerId);
    const cushion = { buildingMaterials: 3, valuables: 2 } as const;
    for (const key of ["buildingMaterials", "valuables"] as const) {
      const sold = rate.sell[key] ?? 0;
      if (sold > 0 && res[key] - sold < (target[key] ?? 0) + cushion[key]) {
        return -99;
      }
    }
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

function heroMarketLocation(state: GameState, heroId: string): string | undefined {
  const spaceId = state.heroes[heroId]?.spaceId;
  return spaceId ? state.adventure?.fields[spaceId]?.location : undefined;
}

/** Whether the seat should bother opening this particular market this turn. */
function wantsMarketVisit(
  state: GameState,
  playerId: PlayerId,
  location?: string,
): boolean {
  if (
    location === "war_machine_factory" &&
    shouldPrioritizeFirstAidTent(state, playerId)
  ) {
    return true;
  }
  if ((state.round ?? 0) < MARKET_MIN_ROUND) return false;
  if (
    TRADE_RATES.some(
      (_, index) => tradeUtility(state, playerId, index) >= 4,
    )
  ) {
    return true;
  }
  // War-machine detours are specific to the Factory and use the shared
  // late-development/surplus gate.
  return (
    location === "war_machine_factory" &&
    shouldSeekLateWarMachineShop(state, playerId)
  );
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
  const hand = state.players[playerId]?.hand ?? [];
  const discard = state.players[playerId]?.discard ?? [];
  const army = state.players[playerId]?.army ?? [];
  const weakHand = hand.length <= 2;
  const hasDiscardPrize = discard.some(
    (cardId) => cardKeepValue(cardId, { state, playerId }) >= 55,
  );
  const hasLowArtifact = hand.some((cardId) => {
    const card = cardLibrary[cardId];
    return card?.kind === "artifact" && cardKeepValue(cardId, { state, playerId }) < 65;
  });
  const hasFewEligibleForDiscount = (tiers: readonly string[]) =>
    army.some(
      (unit) =>
        unit.side === "few" &&
        tiers.includes(coreUnitDefinitions[unit.unitDefId]?.tier ?? ""),
    );
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
      score = 820 + (broke ? 15 : 0);
      focusKind = "build-income";
      break;
    case "RESOURCE_ROUND_MORALE":
    case "RESOURCE_ROUND_RESOURCE_DIE":
      // Recurring early resources/morale compound across several rounds.
      score = 825 + ((state.round ?? 0) <= 3 ? 15 : 0);
      focusKind = "build-income";
      break;
    case "RESOURCE_ROUND_SEARCH_DISCARD":
      // Fortress converts a real discard prize into reliable card economy.
      score = 820 + (hasDiscardPrize || weakHand ? 20 : 0);
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
    case "ASTROLOGERS_HALF_GOLD_REINFORCE":
    case "ASTROLOGERS_FLAT_GOLD_REINFORCE":
      // Rampart/Cove should build the discount when it can immediately turn a
      // Few into a Pack, not merely because the building happens to be legal.
      score = hasFewEligibleForDiscount(effect.tiers) ? 850 : 785;
      focusKind = "build-recruit-unlock";
      break;
    case "TURN_START_NECROMANCY": {
      // Necropolis' defining loop is win -> Necromancy -> half-price growth.
      // Build its search engine aggressively from genuine surplus; the shared
      // dwelling-fund guard below still prevents an R1 Amplifier from delaying
      // Silver/Gold. Once the card is already held, urgency falls slightly.
      const holdsNecromancy = hand.some(
        (cardId) => cardLibrary[cardId]?.effect.type === "NECROMANCY_REINFORCE",
      );
      score = holdsNecromancy ? 810 : 875;
      focusKind = "build-recruit-unlock";
      break;
    }
    case "TURN_START_PORTAL_SUMMON":
      score = 815 + (needsArmy || development.silverUnlocked ? 25 : 0);
      focusKind = "build-recruit-unlock";
      break;
    case "TURN_START_MANA_VORTEX":
      score = 810 + (hasDiscardPrize && weakHand ? 35 : hasDiscardPrize ? 15 : 0);
      focusKind = "build-magic";
      break;
    case "COVER_OF_DARKNESS":
    case "THIEVES_GUILD":
      score = 805 + (weakHand ? 15 : 0);
      focusKind = "build-other";
      break;
    case "COMBAT_CUBES":
    case "HALL_OF_VALHALLA":
      score = 800 + (armyReadyForContestedFight(state, playerId) ? 25 : 0);
      focusKind = "build-other";
      break;
    case "FREELANCERS_GUILD":
      score = 825 + ((state.round ?? 0) <= 4 ? 20 : 0);
      focusKind = "build-income";
      break;
    case "ARTIFACT_SMITH":
      score = 795 + (hasLowArtifact ? 30 : 0);
      focusKind = "build-income";
      break;
    case "ASTROLOGERS_TAKE_STATISTIC":
      score = 805 +
        (discard.some((cardId) => cardLibrary[cardId]?.kind === "statistic") ? 30 : 0);
      focusKind = "build-magic";
      break;
    case "MAGIC_UNIVERSITY":
      score = 805 + (weakHand ? 25 : 0);
      focusKind = "build-magic";
      break;
    case "CASTLE_GATE":
      score = 790 + (Object.keys(state.players).length >= 3 ? 20 : 0);
      focusKind = "build-other";
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
      // The starting army already holds every bronze type as a Few, so before
      // the Citadel stands this dwelling unlocks NO purchase — it is only the
      // Silver prerequisite. Buying it first burns the exact materials the
      // Citadel needs (measured: bronze at R2 pushed the Citadel to R4 and the
      // Pack core to R6). Hold it until reinforce is unlocked UNLESS a bronze
      // unit is actually missing from the army (a casualty to re-recruit).
      const player = state.players[playerId];
      const factionBronzeMissing = (
        coreFactionDefinitions[player?.factionId ?? ""]?.units ?? []
      ).some((unitDefId) => {
        const unit = coreUnitDefinitions[unitDefId];
        return (
          unit?.tier === "bronze" &&
          !player?.army.some((armyUnit) => armyUnit.side !== "bank" && armyUnit.unitDefId === unitDefId)
        );
      });
      score =
        !development.reinforceUnlocked && !factionBronzeMissing
          ? Math.min(score, 280)
          : Math.max(score, 950);
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
          effect.tier === "bronze") ||
        // Citadel + Bronze prebuilt (live lobby default): the next missing
        // dwelling is the real milestone even while the Pack core assembles.
        (development.reinforceUnlocked &&
          development.bronzeUnlocked &&
          effect?.type === "UNLOCK_RECRUIT_TIER" &&
          effect.tier === (development.silverUnlocked ? "gold" : "silver")))) ||
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
  // Dwelling-first: while saving for the Silver/Gold dwelling, a side building
  // (Mage Guild, economy, anything non-milestone) that would eat into the
  // dwelling fund waits — only genuine surplus may buy extras. Mirrors the
  // populationScore treasury guard so building and recruiting cannot each
  // spend the same savings. ALSO active in the prebuilt establish-core (the
  // live default) — measured: a round-1 Necromancy Amplifier ate the silver
  // dwelling's materials because no phase guard covered that window.
  if (
    development.phase === "unlock-silver" ||
    development.phase === "unlock-gold" ||
    (development.phase === "establish-core" &&
      development.reinforceUnlocked &&
      development.bronzeUnlocked)
  ) {
    const building = coreBuildingDefinitions[buildingId];
    const cost = building ? effectiveTownBuildingCost(state, building) : {};
    const resources = playerResources(state, playerId);
    const target = developmentResourceTargets(state, playerId);
    const protectsDwellingFund =
      resources.gold - (cost.gold ?? 0) >= target.gold &&
      resources.buildingMaterials - (cost.buildingMaterials ?? 0) >=
        target.buildingMaterials &&
      resources.valuables - (cost.valuables ?? 0) >= target.valuables;
    if (!protectsDwellingFund) {
      return Math.min(score, 280);
    }
  }
  // Building the Gold Dwelling is not the milestone's outcome. Until one real
  // Gold unit has joined the army, do not let a side building consume its exact
  // recruit fund.
  if (development.goldUnlocked && development.goldUnits === 0) {
    const building = coreBuildingDefinitions[buildingId];
    const cost = building ? effectiveTownBuildingCost(state, building) : {};
    const resources = playerResources(state, playerId);
    const target = developmentResourceTargets(state, playerId);
    const protectsGoldRecruit =
      resources.gold - (cost.gold ?? 0) >= target.gold &&
      resources.buildingMaterials - (cost.buildingMaterials ?? 0) >=
        target.buildingMaterials &&
      resources.valuables - (cost.valuables ?? 0) >= target.valuables;
    if (!protectsGoldRecruit) {
      return Math.min(score, 280);
    }
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

  // Polish Unit Stacks are durability investments, not fresh bodies. Buy one
  // only after the three-tier army core is complete and after preserving the
  // development treasury target. Among affordable surplus purchases, prefer a
  // first layer (+1 Attack as well as a full Pack health bar), then the layer
  // with the best health-to-gold return. A tight treasury stays below END_TURN.
  const stackPurchase = action.purchases.find((purchase) => purchase.kind === "stack");
  if (stackPurchase?.kind === "stack") {
    const target = player?.army.find((unit) => unit.id === stackPurchase.armyUnitId);
    // Read the card's OWN side through the one shared pricing function: a
    // recruited NEUTRAL card has no Pack side, so the old default-"pack" read
    // priced it at +Infinity and the AI could never buy it a Stack.
    const stackSide = target?.side === "neutral" ? "neutral" : "pack";
    const side = getUnitSide(stackPurchase.unitDefId, stackSide);
    const cost =
      (target ? polishArmyUnitStackCost(target) : polishUnitStackCost(stackPurchase.unitDefId, stackSide))?.gold ??
      Number.POSITIVE_INFINITY;
    const treasury = developmentResourceTargets(state, observation.playerId);
    const protectsPlan = Number.isFinite(cost) && gold - cost >= Math.max(GOLD_RESERVE, treasury.gold);
    if (!target || !side || development.phase !== "improve-army" || !protectsPlan) {
      return 245;
    }
    const firstLayerBonus = (target.stacks ?? 0) === 0 ? 28 : 0;
    return Math.max(340, Math.min(720, 570 + side.health * 8 + firstLayerBonus - cost * 2));
  }
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
    const developmentSide = purchase.kind === "reinforce" ? "pack" : "few";
    const sideValue = unitDevelopmentSideStrength(
      purchase.unitDefId,
      developmentSide,
    );
    const previousValue = previousSide
      ? unitDevelopmentSideStrength(purchase.unitDefId, "few")
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
  // Necropolis tempo: when a currently beatable guard can trigger a held
  // Necromancy card, do not spend the Population token on a nonessential
  // full-price Pack first. Fight, resolve the discounted reinforcement, then
  // buy normally if the window remains. Establishing the opening core is
  // exempt because the AI may need that Pack to make the fight beatable.
  const holdsNecromancy = player?.hand.some(
    (cardId) => cardLibrary[cardId]?.effect.type === "NECROMANCY_REINFORCE",
  );
  const mainHero = Object.values(state.heroes).find(
    (hero) => hero.controllerId === observation.playerId && hero.kind === "main",
  );
  const hasBeatableNecromancyFight = Boolean(
    holdsNecromancy &&
      mainHero &&
      collectMapObjectives(state, mainHero).some((objective) => {
        if (objective.kind !== "guard") return false;
        const field = state.adventure?.fields[objective.spaceId];
        return Boolean(field && canBeatGuardedField(state, mainHero, field));
      }),
  );
  if (
    development.phase !== "establish-core" &&
    hasBeatableNecromancyFight &&
    action.purchases.length > 0 &&
    action.purchases.every((purchase) => purchase.kind === "reinforce")
  ) {
    return Math.min(score, 650);
  }
  if (development.phase === "establish-core") {
    // Never postpone an adjacent scenario-winning capture just to buy a Pack,
    // while still beating ordinary fights, exploration, and END_TURN.
    return Math.min(score, 970 + Math.min(5, Math.round(efficiency)));
  }
  if (development.goldUnlocked && development.goldUnits === 0) {
    const buysGold = action.purchases.some(
      (purchase) => coreUnitDefinitions[purchase.unitDefId]?.tier === "gold",
    );
    if (!buysGold) {
      // Hold the Population token and treasury for the first Gold body.
      return Math.min(score, 240);
    }
  }
  if (
    development.phase === "unlock-silver" ||
    development.phase === "unlock-gold"
  ) {
    // The FIRST silver body is exempt from the dwelling-fund guard: it turns
    // the ready bronze core into the force that takes lv3 premium guards
    // on Impossible and diff-3/4 side guards everywhere (armyEngagementTier's
    // soft silver unlock), and the fight loot it opens repays the dwelling fund
    // faster than hoarding would. Every LATER silver/gold body saves normally.
    const firstSilverBody =
      development.silverUnits === 0 &&
      action.purchases.some(
        (purchase) =>
          purchase.kind === "recruit" &&
          coreUnitDefinitions[purchase.unitDefId]?.tier === "silver",
      );
    if (firstSilverBody) {
      return Math.min(score, 945);
    }
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
    if (!protectsNextDwelling) {
      // A fund-breaking purchase only fires while the roster is still thin or
      // a Pack needs rebuilding — a healthy 5-body army WAITS for the dwelling
      // instead. A score cap alone never saved anything: recruits at 820 beat
      // every mundane action, so seeds recruited every round, held gold at
      // 0-2 for six straight rounds, and the Gold dwelling never landed.
      // Reinforces (cheap, gold-only Pack upgrades that rebuild the fighting
      // core after premium losses) stay exempt.
      const onlyNewRecruits = action.purchases.every(
        (purchase) => purchase.kind === "recruit",
      );
      if (onlyNewRecruits && development.totalUnits >= 5) {
        return Math.min(score, 240);
      }
      return Math.min(score, 820);
    }
    // Build the next dwelling before buying intermediate troops. Population
    // may still use genuine surplus without touching the saved Silver/Gold fund.
    return Math.min(score, 940);
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
// A secondary hero stepping OUT of the main hero's march lane (see the
// ally-blockade sidestep in moveScore): above END_TURN and the development
// noise so the blocker actually moves, below a real march/enter step so a
// secondary with an objective of its own never abandons it to shuffle around.
const ALLY_UNBLOCK_SCORE = 620;
// Standing ON a live guard we can beat (a Subterranean-Gate hop slipped past
// it): the only way to open that fight is stepping OFF to a non-twin neighbor
// and walking back on. Above END_TURN so the setup step happens, below a real
// march/enter step so it never outranks live progress elsewhere.
const GUARD_REENTRY_SETUP_SCORE = 640;
// Home (Ⅰ) rotation bonus for leaving a Ⅱ–Ⅲ expansion doorway open — larger
// than the whole band-blind doorway-count spread (3*9 + 3*6 = 45) so a
// qualifying rotation always wins, per the user rule. See
// `startTileFarDoorwayScore`.
const START_TILE_FAR_DOORWAY_SCORE = 240;

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
  // March toward the sticky primary, but ALSO free seizures still in this
  // turn's walking reach (unguarded mines / symbols / settlements) that lie
  // ALONG the march: a pickup no farther from the primary than the hero is
  // now. Multi-source BFS then scoops free objects on the way without letting
  // a nearer pickup in the OPPOSITE direction reverse a committed march
  // (measured on the Impossible premium-rush seeds: an unfiltered scoop pulled
  // the hero west off the eastern settlement commit, and the premium fight
  // never happened).
  const freeThisTurn = freeSeizuresWithinReach(state, hero, objectives);
  const marchTargets: MapObjective[] = [];
  const seen = new Set<string>();
  if (primary) {
    marchTargets.push(primary);
    seen.add(primary.spaceId);
    const scoopable = freeThisTurn.filter(
      (objective) => !seen.has(objective.spaceId),
    );
    if (scoopable.length > 0) {
      const towardPrimary = objectiveDistanceField(state, hero, [primary]);
      const heroToPrimary = hero.spaceId
        ? towardPrimary.get(hero.spaceId) ?? Infinity
        : Infinity;
      for (const objective of scoopable) {
        const freeToPrimary =
          towardPrimary.get(objective.spaceId) ?? Infinity;
        if (freeToPrimary <= heroToPrimary) {
          seen.add(objective.spaceId);
          marchTargets.push(objective);
        }
      }
    }
  } else {
    for (const objective of objectives) {
      if (seen.has(objective.spaceId)) continue;
      seen.add(objective.spaceId);
      marchTargets.push(objective);
    }
  }
  const distance = objectiveDistanceField(state, hero, marchTargets);
  const here = hero.spaceId ? distance.get(hero.spaceId) ?? Infinity : Infinity;
  const to = distance.get(action.to) ?? Infinity;

  // The free hop between the two linked halves of a Subterranean Gate SLIPS
  // PAST a live guard on the far half (engine rule 2026-08-07): this step can
  // never open that fight. It must not read as "arriving" at a guard objective
  // (measured: the hero slipped on, believed the fight resolved, and parked on
  // the guarded half for the rest of the game) — but it IS a legal, free,
  // combat-less corridor step, so it keeps the ordinary march-progress scoring.
  const hereField = hero.spaceId ? state.adventure?.fields[hero.spaceId] : undefined;
  const gateSlipHop =
    gateFieldsLinked(hereField, field) &&
    isFieldGuarded(field) &&
    field.flagOwnerId !== observation.playerId;

  // The destination IS the sticky objective (or any objective if none sticky).
  const arriving = marchTargets.find((objective) => objective.spaceId === action.to);
  if (to === 0 && arriving && !gateSlipHop) {
    // A STAGED premium guard (listed as a march target while the army cannot
    // cover it yet — see premiumEconomyWorthStaging) must never be ENTERED:
    // stepping on would open the very fight the staging is waiting out. The
    // hero parks adjacent instead; the entry unblocks the moment
    // canBeatGuardedField flips true (first silver body bought).
    if (
      (isFieldGuarded(field) || field.location === "creature_bank") &&
      !canBeatGuardedField(state, hero, field)
    ) {
      return 250;
    }
    return OBJECTIVE_ENTER_SCORE[arriving.kind];
  }

  // Not a chosen objective: keep clear of a fight we did not calculate for — an
  // enemy hero, a town garrison we did not pick as target, and any guard we
  // cannot beat. Bare enemy mines re-flag free (flaggable) and may be stepped
  // through / toward without this penalty.
  const opposingHero = Object.values(state.heroes).some(
    (other) =>
      other.spaceId === action.to &&
      !playersAreAllied(state, other.controllerId, observation.playerId),
  );
  if (opposingHero) {
    return 200;
  }
  if (
    field.flagOwnerId &&
    !playersAreAllied(state, field.flagOwnerId, observation.playerId)
  ) {
    const cat = locationDefinitions[field.location]?.category;
    if (cat !== "flaggable") {
      return 200;
    }
  }
  // LIVE guards only (isFieldGuarded folds in blackCube / everFlagged): a
  // difficulty-stamped field the hero already cleared (its own flagged mine, a
  // used treasure symbol) is an ordinary corridor cell. The old raw-difficulty
  // read walled the hero off behind its OWN beaten guards — measured on the
  // Impossible premium-rush seeds as a multi-round park at h:10:7 while the
  // beatable settlement sat 4 cells away behind two cleared guard fields.
  if (isFieldGuarded(field) && !gateSlipHop) {
    return 250;
  }

  // Ally-blockade sidestep: a single-step move can never END on an allied
  // hero, so an idle secondary parked one cell ahead of the main hero inside a
  // one-lane corridor deadlocks the main's march for the rest of the game
  // (measured on the Impossible premium-rush seeds: the secondary sat on the
  // scholar doorway for nine straight rounds while the beatable settlement sat
  // two cells beyond it). When THIS hero stands adjacent to the seat's main
  // hero on a cell that strictly advances the main's march, any step that
  // leaves that lane scores high enough to beat idle parking — the freed cell
  // then unblocks the main within the same turn.
  if (hero.kind !== "main" && hero.spaceId) {
    const main = Object.values(state.heroes).find(
      (candidate) =>
        candidate.controllerId === observation.playerId &&
        candidate.kind === "main" &&
        candidate.id !== hero.id &&
        candidate.spaceId,
    );
    if (
      main?.spaceId &&
      getAdjacentSpaceIds(main.spaceId).includes(hero.spaceId)
    ) {
      const mainObjectives = collectMapObjectives(state, main);
      const mainPrimary = primaryMapObjective(
        state,
        main,
        mainObjectives,
        memory.stickyObjectiveSpaceId,
      );
      if (mainPrimary && mainPrimary.spaceId !== hero.spaceId) {
        const towardMain = objectiveDistanceField(state, main, [mainPrimary]);
        const mainHere = towardMain.get(main.spaceId) ?? Infinity;
        const blockerHere = towardMain.get(hero.spaceId) ?? Infinity;
        const stepTo = towardMain.get(action.to) ?? Infinity;
        // Any step that does not land STRICTLY closer to the main's target
        // frees the lane: the freed cell is the one the main needs, and a
        // same-ring sidestep leaves the shortest path open.
        if (blockerHere < mainHere && stepTo >= blockerHere) {
          return ALLY_UNBLOCK_SCORE;
        }
      }
    }
  }

  // Already walked this field this turn — never thrash back and forth.
  if (visitedThisTurn(memory, action.to) && to >= here) {
    return NO_PROGRESS_SCORE;
  }

  // Progress toward the sticky objective: prefer the biggest step in.
  if (to < here) {
    return OBJECTIVE_PROGRESS_BASE + Math.max(0, 10 - to);
  }

  // SLIP-PAST RE-ENTRY SETUP: the hero stands ON a live guard it can beat —
  // it slipped past through the Subterranean-Gate hop, and the fight only
  // opens on an ordinary re-entry from a NON-TWIN neighbor. Score the step
  // off above END_TURN; the walk back on then takes the normal guard-arrival
  // score and finally starts the battle.
  if (
    hereField &&
    isFieldGuarded(hereField) &&
    hereField.flagOwnerId !== observation.playerId &&
    action.to !== hereField.gateLinkSpaceId &&
    canBeatGuardedField(state, hero, hereField)
  ) {
    return GUARD_REENTRY_SETUP_SCORE;
  }

  return NO_PROGRESS_SCORE;
}

/**
 * Revealing land is useful only until it competes with a known, NEARBY map
 * payoff. Once a mine, reward, beatable guard, town, enemy, or victory site is
 * within this turn's marching reach, collecting it beats spending movement on
 * opening more tiles ("hit the home-tile objects first"). But when every known
 * payoff is a long trek away, flipping the adjacent face-down tile or dropping
 * a fresh Ⅱ–Ⅲ supply tile is the better tempo play — new land next door beats
 * a multi-turn march to a distant leftover. This is the conversion loop the
 * old fixed 830 discovery score lacked: explore -> identify value -> collect
 * it -> develop the army -> expand again.
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
  // One multi-source BFS over every known payoff: how far is the NEAREST one?
  // When it sits beyond what the hero can still walk this turn (or is outright
  // unreachable), expanding the frontier NOW wins over the march (the frontier
  // score outranks OBJECTIVE_PROGRESS_BASE); a close payoff keeps the old
  // collect-first ordering.
  const nearest = hero.spaceId
    ? objectiveDistanceField(state, hero, knownPayoffs).get(hero.spaceId)
    : undefined;
  const reach = Math.max(1, hero.movementPoints ?? 0);
  if (nearest === undefined || nearest > reach) {
    return noKnownPayoffScore;
  }
  // Keep discovery legal and attractive over END_TURN, but below build/recruit
  // and below objective progress/entry. A weak army especially needs to convert
  // known rewards into development before opening another frontier.
  return armyNeedsReinforcement(state, observation.playerId) ? 640 : 670;
}

function hasReachableBronzeRushTarget(
  state: GameState,
  hero: HeroState,
): boolean {
  if (
    hero.kind !== "main" ||
    adventureVictoryMode(state) !== "conquest" ||
    !shouldLaunchBronzeRush(state, hero.controllerId) ||
    !hero.spaceId
  ) {
    return false;
  }
  const targets = collectMapObjectives(state, hero).filter(
    (objective) =>
      objective.kind === "victory" || objective.kind === "enemy-hero",
  );
  return (
    targets.length > 0 &&
    objectiveDistanceField(state, hero, targets).has(hero.spaceId)
  );
}

/**
 * Far (II-III) openings get explicit tempo priority, especially until the
 * player's second opening has had its Settlement chance. Once a reachable
 * composition-ready conquest rush is live, the main hero commits instead.
 */
function expansionPriorityScore(
  observation: ComputerObservation,
  heroId: string,
  base: number,
  farTile: boolean,
): number {
  const state = observation.state as unknown as GameState;
  const hero = state.heroes[heroId];
  const score = explorationActionScore(observation, heroId, base);
  if (!hero || !farTile) return score;
  if (hasReachableBronzeRushTarget(state, hero)) return Math.min(score, 675);
  const opened =
    state.adventure?.farTilesOpenedByPlayer?.[observation.playerId] ?? 0;
  const hasSettlement = Boolean(
    state.adventure?.farSettlementOpenedByPlayer?.[observation.playerId],
  );
  const bonus = opened < 2 && !hasSettlement ? 80 : 45;
  return Math.min(930, score + bonus);
}

/**
 * How many other slots of the tile a hero ENTERING at `entrySlot` can go on to
 * reach walking only inside the tile: blocked fields are walls, printed
 * internal borders block their edge, guards are fought through (a payoff, not
 * a wall). Pure def geometry — the slot adjacency of the 7-hex flower is the
 * same under every rotation — so it is computed once per candidate entrance.
 */
function tileSlotsReachableFrom(
  tileDefId: string,
  entrySlot: number,
): Set<number> {
  const def = allTileDefinitions[tileDefId];
  if (!def) {
    return new Set();
  }
  const cells = tileFootprint({ row: 8, col: 8 }, 0).map((cell) =>
    hexSpaceId(cell),
  );
  const passable = (slot: number): boolean => {
    const field = def.fields[slot];
    return Boolean(
      field && locationDefinitions[field.location]?.category !== "blocked",
    );
  };
  if (!passable(entrySlot)) {
    return new Set();
  }
  const reached = new Set<number>([entrySlot]);
  const queue = [entrySlot];
  while (queue.length > 0) {
    const slot = queue.pop()!;
    const neighbors = new Set(getAdjacentSpaceIds(cells[slot]));
    for (let other = 0; other < cells.length; other += 1) {
      if (
        reached.has(other) ||
        !neighbors.has(cells[other]) ||
        !passable(other) ||
        hasInternalBorder(def, slot, other)
      ) {
        continue;
      }
      reached.add(other);
      queue.push(other);
    }
  }
  return reached;
}

/**
 * How many DOORWAYS a rotation leaves open around the new tile: non-blocked
 * ring slots whose printed outer arc is open, facing (a) already-revealed
 * walkable land — connections that keep the route alive — and (b) a
 * still-face-down tile's footprint — future expansion (a face-down tile
 * covers the same 7 cells at every rotation, so its ground is known before it
 * flips). A rotation that turns every remaining open arc against rock or
 * blocked neighbors makes the tile a dead end even when its own entrance is
 * fine — the classic "the AI walled itself in" pick. Also the ONLY
 * rotation-sensitive signal for the round-1 home-tile rotation (the hero
 * stands on the rotation-invariant center, so entrance grading cancels out).
 */
function tileRotationDoorwayScore(
  state: GameState,
  tile: MapTileState,
  rotation: number,
): number {
  const adventure = state.adventure;
  const def = allTileDefinitions[tile.tileDefId];
  if (!adventure || !def) {
    return 0;
  }
  const center = { row: tile.centerRow, col: tile.centerCol };
  const cells = tileFootprint(center, rotation).map((cell) => hexSpaceId(cell));
  const inTile = new Set(cells);
  const faceDownCells = new Set<string>();
  for (const other of Object.values(adventure.tiles)) {
    if (!other.faceDown || other.id === tile.id) {
      continue;
    }
    for (const cell of tileFootprint(
      { row: other.centerRow, col: other.centerCol },
      0,
    )) {
      faceDownCells.add(hexSpaceId(cell));
    }
  }

  let revealedDoorways = 0;
  let frontierDoorways = 0;
  for (let slot = 1; slot <= 6; slot += 1) {
    const field = def.fields[slot];
    if (
      !field ||
      locationDefinitions[field.location]?.category === "blocked" ||
      def.outerImpassable[slot - 1]
    ) {
      continue;
    }
    let revealed = false;
    let frontier = false;
    for (const neighborId of getAdjacentSpaceIds(cells[slot])) {
      if (inTile.has(neighborId)) {
        continue;
      }
      const neighborField = adventure.fields[neighborId];
      if (neighborField) {
        if (
          locationDefinitions[neighborField.location]?.category !== "blocked" &&
          !isOuterEdgeSealed(adventure, neighborField)
        ) {
          revealed = true;
        }
      } else if (faceDownCells.has(neighborId)) {
        frontier = true;
      }
    }
    if (revealed) revealedDoorways += 1;
    if (frontier) frontierDoorways += 1;
  }
  return Math.min(3, revealedDoorways) * 9 + Math.min(3, frontierDoorways) * 6;
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
  // Whether the next dwelling still needs building materials — an ordinary
  // materials mine in reach is then worth rotating toward (payoff loop below).
  const materialsShort =
    (state.players[observation.playerId]?.resources.buildingMaterials ?? 0) <
    developmentResourceTargets(state, observation.playerId).buildingMaterials;
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
      // Onward mobility THROUGH this entrance: an entrance walled into a
      // pocket (blocked fields / printed internal borders isolate it) strands
      // the hero on arrival — sink it below every connected entrance, even a
      // beatable-guard one. A broader open interior wins close calls.
      const reachableSlots = tileSlotsReachableFrom(tile.tileDefId, slot);
      const onward = reachableSlots.size;
      entry += Math.min(12, (onward - 1) * 3);
      if (onward <= 1) {
        entry -= 60;
      }
      // PAYOFF REACHABILITY: never rotate the tile's own economy into a
      // sealed pocket. Premium fields (settlement / gold / valuables mine)
      // keep their dominant weight — the whole premium rush dies on a mine
      // the hero can never path to (measured: a Far tile self-placed with its
      // gold mine unreachable left the rush parked for the entire game) —
      // and are now NEED-weighted via premiumEconomyResourceBonus, so a
      // valuables ("crystal") mine while the Gold dwelling still lacks
      // valuables rotates into reach ahead of yet another gold field.
      // Materials mines and one-shot resource/treasure pickups count too
      // (smaller), so a rotation that lands SOME payoff in the hero's pocket
      // beats one that faces only empty fields. Best single payoff only —
      // never summed, so the premium ordering above cannot be swamped.
      let payoff = 0;
      for (const reachableSlot of reachableSlots) {
        const reachableField = def?.fields[reachableSlot];
        if (!reachableField) continue;
        const asField = reachableField as unknown as MapFieldState;
        if (isPremiumEconomyField(asField)) {
          payoff = Math.max(
            payoff,
            90 +
              premiumEconomyResourceBonus(state, observation.playerId, asField),
          );
        } else if (reachableField.location === "mine") {
          payoff = Math.max(payoff, materialsShort ? 40 : 20);
        } else if (
          reachableField.location === "resource_symbol" ||
          reachableField.location === "treasure_symbol"
        ) {
          payoff = Math.max(payoff, 12);
        }
      }
      entry += payoff;
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
 * USER RULE: the round-1 home (Ⅰ) rotation must be the one that lets the seat
 * open a Ⅱ–Ⅲ tile NEXT, after the three home objectives are drained. The
 * generic `tileRotationDoorwayScore` counts open arcs but is BAND-BLIND (a
 * frontier doorway onto a Ⅳ–Ⅴ or Ⅵ–Ⅶ tile scores exactly like one onto Ⅱ–Ⅲ),
 * and it never asks whether a Ⅱ–Ⅲ SUPPLY tile could be dropped through that
 * arc at all — so the alignment on the stock layout was luck, not policy.
 *
 * The weight (240) is deliberately larger than the whole doorway-count spread
 * (max 45) so on the home tile this is effectively "always". Scoped to the
 * `"starting"` rotation on purpose:
 *  - the hero sits on the rotation-invariant centre there, so the entrance
 *    grading cancels out and this term cannot fight it;
 *  - a placed/revealed Ⅱ–Ⅲ / Ⅳ–Ⅴ tile keeps its existing easiest-entrance +
 *    payoff-reachability ordering untouched.
 * FALLBACK: when no rotation qualifies (no Ⅱ–Ⅲ neighbour, no supply tile, or
 * every arc walled) every rotation scores 0 here and the previous tiebreaks
 * decide exactly as before — never a stall.
 */
function startTileFarDoorwayScore(
  observation: ComputerObservation,
  state: GameState,
  tile: MapTileState,
  rotation: number,
): number {
  if (state.adventure?.pendingTileChoice?.kind !== "starting") return 0;
  const hero = Object.values(state.heroes).find(
    (candidate) =>
      candidate.controllerId === observation.playerId &&
      candidate.kind === "main" &&
      candidate.spaceId,
  );
  if (!hero) return 0;
  return startTileRotationOpensFarExpansion(state, tile, rotation, hero)
    ? START_TILE_FAR_DOORWAY_SCORE
    : 0;
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
  // Keep the tile's OTHER arcs useful too: more open doorways onto revealed
  // land / future tiles means the hero can leave again and keep expanding —
  // never rotate yourself into a dead end when an equal entrance avoids it.
  score += tileRotationDoorwayScore(state, tile, action.rotation);
  score += startTileFarDoorwayScore(observation, state, tile, action.rotation);

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
  if ((state.round ?? 0) < MARKET_MIN_ROUND) return 180;
  // Dwelling rush: a trade that buys a missing dwelling input is either the
  // decisive enabler (feasible surplus) or actively SUPPRESSED (would strip the
  // recruit reserve). This overrides the generic heuristic, which would happily
  // over-trade gold down to zero to complete the dwelling and destroy potential.
  const rush = assessDwellingRush(state, observation.playerId);
  if (rush && rush.inputRateIndices.includes(action.rateIndex)) {
    return rush.feasible ? DWELLING_RUSH_TRADE_SCORE : DWELLING_RUSH_SUPPRESS_SCORE;
  }
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
  const ownedMachines = owned.filter((cardId) =>
    cardId.startsWith("war_machine."),
  );
  const card = cardLibrary[action.cardId];
  const isFirstAid =
    action.cardId.includes("first_aid") ||
    Boolean(card?.name?.toLowerCase().includes("first aid"));
  if (owned.includes(action.cardId)) {
    return 200;
  }
  if (
    isFirstAid &&
    shouldPrioritizeFirstAidTent(state, observation.playerId)
  ) {
    return 640;
  }
  if (
    (state.round ?? 0) < MARKET_MIN_ROUND ||
    armyDevelopmentProfile(state, observation.playerId).phase !== "improve-army"
  ) {
    return 220;
  }
  const target = developmentResourceTargets(state, observation.playerId);
  if (ownedMachines.length >= 2) return 260;
  const repeatPurchase = ownedMachines.length === 1;
  if (repeatPurchase && gold < target.gold + 24) return 300;
  if (!repeatPurchase && gold < target.gold + 12) {
    // Prefer holding gold for recruits.
    return 400;
  }
  // Ballista / First Aid Tent / Ammo Cart / Cannon are all useful and kept in a
  // CLOSE band (base 600, +8..+22) so different contexts buy different machines
  // (variety), rather than one machine always winning. The First Aid Tent is
  // competitive by DEFAULT and PREFERRED when the army holds a unit worth saving
  // — any silver/gold/azure-tier card is the signal (mirrors the in-combat
  // value layer: the Tent earns its slot by keeping a premium body alive). Gem,
  // whose First Aid VI specialty reads the Tent, keeps the strongest preference.
  // Keep below recruit/build (~850+) and above Done (520) only for the first buy.
  const healingSpecialist = player?.heroDefId === "gem";
  const hasValuableUnit = (player?.army ?? []).some((unit) => {
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    return tier === "silver" || tier === "gold" || tier === "azure";
  });
  let score = 600;
  const isBallista =
    action.cardId.includes("ballista") ||
    Boolean(card?.name?.toLowerCase().includes("ballista"));
  if (isBallista) {
    score += healingSpecialist ? 12 : 18;
  } else if (isFirstAid) {
    score += 12;
    if (hasValuableUnit) score += 10;
    if (healingSpecialist) score += 16;
  } else if (action.cardId.includes("ammo")) {
    score += 14;
  } else {
    // Cannon / Catapult and any other purchasable machine: in-band variety.
    score += 10;
  }
  return repeatPurchase ? score - 60 : score;
}

/**
 * Value of a nested VisitStep payload (Event/Astrologers/map reward branches).
 * Used to rank CHOOSE_ONE / PAY_TO options without parsing labels — the option
 * steps are the printed rules. Empty / pure-decline branches score low so the
 * AI still exits, but never freezes on a multi-option Event menu.
 */
/**
 * Gold-equivalent printed cost of an army card the Heavenly Tribulation toll
 * would take — the tie-breaker so the runner deterministically pays the CHEAPEST
 * card (matches the engine's cheapest-first offer ordering and the AFK default).
 */
function tribulationTollCost(state: GameState, playerId: PlayerId, unitId: string): number {
  const unit = state.players[playerId]?.army.find((candidate) => candidate.id === unitId);
  if (!unit) {
    return 0;
  }
  const cost =
    (unit.side === "neutral"
      ? coreUnitDefinitions[unit.unitDefId]?.neutral?.cost
      : getUnitSide(unit.unitDefId, unit.side)?.cost) ?? {};
  return (cost.gold ?? 0) + (cost.buildingMaterials ?? 0) * 3 + (cost.valuables ?? 0) * 7;
}

function eventResourceCostValue(cost: ResourceCost | undefined): number {
  return (
    (cost?.gold ?? 0) +
    (cost?.buildingMaterials ?? 0) * 3 +
    (cost?.valuables ?? 0) * 7
  );
}

/** Net utility of acquiring a known Event card, including the actual price. */
function eventCardAcquisitionUtility(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  cost?: ResourceCost,
): number {
  const keep = cardKeepValue(cardId, { state, playerId });
  const price = eventResourceCostValue(cost);
  const player = state.players[playerId];
  const breaksGoldReserve =
    (cost?.gold ?? 0) > 0 &&
    (player?.resources.gold ?? 0) - (cost?.gold ?? 0) < GOLD_RESERVE;
  return Math.round(keep * 0.65) - price * 4 - (breaksGoldReserve ? 35 : 0);
}

/** Printed combat value of a known Neutral offered by an Event. */
function eventNeutralUnitUtility(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
): number {
  const def = coreUnitDefinitions[unitDefId];
  const side = def?.neutral;
  if (!def || !side) return 0;
  const tierBonus =
    def.tier === "azure" ? 48 : def.tier === "gold" ? 34 : def.tier === "silver" ? 20 : 8;
  const combatValue =
    side.attack * 3 +
    side.health * 2 +
    side.defense +
    Math.round(side.initiative / 2);
  const cost = eventResourceCostValue(side.cost);
  const thinArmyBonus = (state.players[playerId]?.army.length ?? 0) < 5 ? 18 : 0;
  return tierBonus + combatValue + thinArmyBonus - Math.round(cost * 1.5);
}

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
      case "FLIP_PACK_TO_FEW":
        // Cultivation Heavenly Tribulation toll (§5.6) ONLY (Plague/Pandora
        // flips are unscored, exactly as before): flipping / shedding a Stack
        // from a Pack is a mild loss; prefer the CHEAPEST candidate so the pick
        // is deterministic and minimal.
        if (step.source === "tribulation") {
          utility -= 4 + tribulationTollCost(state, playerId, step.armyUnitId) * 0.2;
        }
        break;
      case "TRIBULATION_LOSE_UNIT":
        // Losing a whole Few/Neutral card is worse than flipping a Pack — but
        // still take the cheapest, so the runner protects value deterministically.
        utility -= 14 + tribulationTollCost(state, playerId, step.unitId) * 0.2;
        break;
      case "REINFORCE_FREE":
        utility += 48;
        break;
      case "WITCH_HUT_TAKE":
        // Witch Hut reveal: taking the revealed Ability into hand always
        // outranks binning it (which still progresses the deck a little).
        utility += 24 + Math.min(30, cardKeepValue(step.cardId, { state, playerId }));
        break;
      case "WITCH_HUT_DISCARD":
        utility += 2;
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
        // The lot is public: bid by its real keep value instead of hard-coding
        // one gold for every Artifact. Strong Major/Relic/S-tier cards justify
        // a serious bid, while weak Minors still preserve the development fund.
        const amount = step.amount;
        const lotId = state.adventure?.events?.auction?.lotCardId;
        const keep = lotId ? cardKeepValue(lotId, { state, playerId }) : 40;
        const qualityBudget = Math.max(1, Math.min(12, Math.round((keep - 40) / 7)));
        const flexibleReserve = keep >= 90 ? 2 : GOLD_RESERVE;
        const spendable = Math.max(0, res.gold - flexibleReserve);
        const target = Math.min(qualityBudget, spendable);
        if (amount > spendable) {
          utility -= 80 + amount * 2;
          break;
        }
        utility += 36 - Math.abs(amount - target) * 7 - Math.round(amount * 0.5);
        if (target === 0 && amount === 0) utility += 8;
        break;
      }
      case "EVENT_HERMIT_GAMBLE": {
        // Wrong guesses lose the named resource. Naming an empty/scarce track
        // caps the downside; risking a stocked dwelling input is much worse.
        const stock = res[step.resource] ?? 0;
        const need = Math.max(0, deficit[step.resource]);
        utility += 16 - stock * 3 + need * 2;
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
        utility += eventNeutralUnitUtility(state, playerId, step.unitDefId);
        break;
      case "EVENT_MERC_RECRUIT":
        utility += army < 5 ? 30 : 12;
        break;
      case "EVENT_MERC_TAKE": {
        // Drawing higher-tier candidates is useful only when the treasury can
        // plausibly recruit them; otherwise fish in the affordable tiers.
        const tierValue =
          step.tier === "azure" ? 50 : step.tier === "gold" ? 40 : step.tier === "silver" ? 28 : 18;
        const affordability =
          step.tier === "azure"
            ? res.gold >= 18
            : step.tier === "gold"
              ? res.gold >= 12
              : step.tier === "silver"
                ? res.gold >= 8
                : true;
        utility += (affordability ? tierValue : 4) + Math.max(0, step.count - 1) * 5;
        break;
      }
      case "EVENT_ARTIFACT_SHOP":
      case "EVENT_SPELL_MARKET":
      case "EVENT_MESSENGER_DRAW":
        utility += 24;
        break;
      case "EVENT_TAKE_CARD":
      case "EVENT_TAKE_POOL_CARD":
        utility += eventCardAcquisitionUtility(state, playerId, step.cardId, step.cost);
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
      case "USE_LEGION_RECRUIT_DISCOUNT":
        // Inline Legion play at a neutral-recruit menu. Deliberately scored BELOW
        // a plain recruit (28/12): the option re-opens the same menu, so a higher
        // score could make the AI cycle its whole hand of Legion pieces before
        // buying. A computer seat therefore only takes it when the recruit itself
        // is unaffordable at full price (the plain option is then absent).
        utility += 10;
        break;
      case "EVENT_REMOVE_FOR_SEARCH":
        // Value the searches already earned, but stop removing once the next
        // card would not cross another threshold.
        utility +=
          (step.single
            ? step.removed >= (step.minRemoved ?? 0) ? 30 : 4
            : Math.floor(step.removed / step.per) * 26) +
          (step.thenDiscardAllRedraw ? 8 : 0);
        break;
      case "REMOVE_CARD_FROM_PILE":
      case "EVENT_DISCARD_HAND_CARD":
      case "EVENT_POOL_ADD_FROM_HAND":
        utility += 24 - Math.round(cardKeepValue(step.cardId, { state, playerId }) * 0.75);
        break;
      case "EVENT_DISCARD_ANY_THEN_DRAW":
        // Continuation value makes discarding genuine junk beat Done, while
        // the card-loss term above protects strong cards.
        utility += 16;
        break;
      case "EVENT_NEUTRAL_DISCARD_GOLD":
        utility += step.gold * 2 - Math.max(0, eventNeutralUnitUtility(state, playerId, step.unitDefId) / 3);
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
        utility += 14;
        break;
      case "EVENT_TAKE_POOL_DIE": {
        const die = state.adventure?.events?.dicePool?.[step.index];
        if (!die) {
          utility += 8;
        } else if (die.kind === "resource") {
          const need = Math.max(0, deficit[die.resource]);
          utility += die.amount * (die.resource === "gold" ? 3 : die.resource === "buildingMaterials" ? 5 : 7) + need;
        } else {
          utility +=
            die.face === "artifact-search"
              ? 30
              : die.face === "experience"
                ? 24
                : die.face === "double-resource-die"
                  ? 22
                  : 14;
        }
        break;
      }
      case "EVENT_FOREST_CONTRIBUTE":
      case "EVENT_FOREST_TAKE":
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
      case "BUY_EQUIPMENT":
        // Ranked further in resolveVisitStepScore; mild positive here for nests.
        utility += 22;
        break;
      case "GAIN_COMMANDER_POINTS":
        utility += 28;
        break;
      case "RAID_BOSS_FIGHT": {
        // Raid Bosses (§6.5, §17 "engage… risk, never suicidal"): challenge
        // only behind a real army — chip layers for the payouts when solid,
        // otherwise Withdraw outranks the pick (its penalty sinks the option
        // below the empty-steps Leave band).
        const strength = playerArmyStrength(state, playerId);
        utility += strength >= 8 ? 30 + Math.min(20, strength - 8) : -160;
        break;
      }
      case "DUNGEON_FLOOR_FIGHT":
        // The Dungeon (§6.7.3): the grind site — normal XP + the floor ladder.
        // Delve when standing at the gate unless the army is truly gutted.
        utility += playerArmyStrength(state, playerId) >= 4 ? 26 : -160;
        break;
      case "PLAY_STORY_SCENE":
        utility += 2;
        break;
      case "SELL_HAND_ARTIFACT": {
        // Prefer selling junk (low keep value); keep high-value relics.
        const cardId = step.cardId;
        const keep = cardId ? cardKeepValue(cardId, { state, playerId }) : 50;
        utility += keep < 35 ? 24 : keep < 55 ? 8 : -10;
        break;
      }
      case "SMASH_WOG_SKULL":
        // +2 gold then permanent latch — only when gold is tight.
        utility += res.gold < GOLD_RESERVE + 4 ? 18 : 4;
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
 * The single teleport destination a Monolith/Whirlpool travel option carries the
 * hero to: a known token field (its `spaceId`), or a still-face-down destination
 * tile (`reveal`, no materialized cell yet). Both live inside the CHOOSE_ONE
 * `resolveTokenTeleport` opens (see mapTokenTravelSteps); a Town-Portal /
 * Logistics destination menu (also TELEPORT_HERO options) routes the same way.
 */
function teleportOptionDestination(
  steps: ReadonlyArray<VisitStep>,
): { kind: "field"; spaceId: MapSpaceId } | { kind: "reveal" } | null {
  for (const step of steps) {
    if (step.type === "TELEPORT_HERO") {
      return { kind: "field", spaceId: step.spaceId };
    }
    if (step.type === "TOKEN_TELEPORT_REVEAL") {
      return { kind: "reveal" };
    }
  }
  return null;
}

/**
 * Score one Monolith/Whirlpool (or Town-Portal) destination by how close it
 * lands the hero to the CURRENT primary march objective. `visitStepsUtility`
 * scores every TELEPORT_HERO identically (0), so without this the AI takes the
 * engine's FIRST-listed token by hash tie-break and a teleport advances no plan.
 * Routing to the destination nearest the objective (the same public
 * objective-distance field normal marching uses) turns the free jump into real
 * progress — the Dimension-Door router applied to token travel. Returns null for
 * a non-teleport option so the caller falls back to the utility scorer.
 */
function teleportDestinationScore(
  observation: ComputerObservation,
  steps: ReadonlyArray<VisitStep>,
): number | null {
  const dest = teleportOptionDestination(steps);
  if (!dest) {
    return null;
  }
  const state = observation.state as unknown as GameState;
  const visit = state.adventure?.pendingVisit;
  const hero = visit ? state.heroes[visit.heroId] : undefined;
  if (!hero?.spaceId) {
    return 1_100;
  }
  // A face-down destination reveals fresh land — a solid pick, but a known field
  // that lands ON/near the objective should still win, so keep it mid-band.
  if (dest.kind === "reveal") {
    return 1_105;
  }
  const objectives = collectMapObjectives(state, hero);
  const primary = primaryMapObjective(
    state,
    hero,
    objectives,
    memoryOf(observation).stickyObjectiveSpaceId,
  );
  if (!primary) {
    // No plan to advance — every destination is equal; stay deterministic.
    return 1_100;
  }
  const distanceField = objectiveDistanceField(state, hero, [primary]);
  const destinationDistance = distanceField.get(dest.spaceId);
  if (destinationDistance === undefined) {
    // The destination cannot walk to the objective at all — a poor exit, but a
    // legal one; keep it above decline so a mandatory travel never stalls.
    return 1_060;
  }
  // Lower distance-to-objective is better; landing ON it is best. The band stays
  // within [1_080, 1_180] so every destination outranks a plain decline (1_050)
  // and the nearest one is the clear pick.
  return (
    1_100 +
    Math.max(-20, 60 - destinationDistance * 6) +
    (destinationDistance === 0 ? 20 : 0)
  );
}

/**
 * Visit-step resolution: market "Done", Event/Astrologers menus, settlement
 * income, Witch Hut / Magic Spring / Hill Fort / Tavern, and generic picks.
 * Decline must outrank wasteful trades so an open market always exits cleanly;
 * every other open visit always has a scored pick so the runner never freezes.
 */
/**
 * Anime Equipment (§3.13): score a BUY_EQUIPMENT outfitter option. Buy into an
 * EMPTY slot from genuine surplus (gold ≥ cost + 6) — the AI NEVER auto-replaces
 * an already-equipped item (even a higher-grade shop item): a filled slot scores
 * under Leave (1_050) so the runner exits the shop cleanly (no stall, no
 * over-spend). Pinned by anime-equipment.test.ts "never auto-replaces a filled
 * one (CONTROL)".
 */
function equipmentBuyScore(state: GameState, playerId: string, equipmentId: string): number {
  const def = getEquipmentDefinition(equipmentId);
  if (!def) {
    return 1_000;
  }
  const gold = playerGold(state, playerId);
  if (gold < def.cost + 6) {
    return 1_000;
  }
  const equippedId = heroEquipmentSlot(state, playerId, def.slot);
  if (!equippedId) {
    // Prefer higher grades slightly when several empty-slot buys compete.
    const gradeNudge = def.grade === "III" ? 12 : def.grade === "II" ? 6 : 0;
    return 1_120 + gradeNudge;
  }
  // Slot already filled → NEVER auto-replace, even with a higher-grade shop item
  // (the map policy has no way to reclaim the sunk cost of the worn item, and the
  // authoritative anime-equipment.test.ts CONTROL pins "never auto-replaces a
  // filled one"). Score under Leave (1_050) so the runner exits the shop cleanly.
  return 1_000;
}

function resolveVisitStepScore(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>,
): number {
  const state = observation.state as unknown as GameState;
  const playerId = observation.playerId;
  const step = state.adventure?.pendingVisit?.steps[0];
  const optionIndex = action.optionIndex ?? 0;

  if (
    (state.round ?? 0) < MARKET_MIN_ROUND &&
    (step?.type === "TRADING_POST" || step?.type === "WAR_MACHINE_SHOP")
  ) {
    return action.decline ? 520 : 180;
  }

  // Explicit Done / Leave (decline: true) — safe exit from any open visit.
  if (action.decline) {
    if (step?.type === "TRADING_POST" || step?.type === "WAR_MACHINE_SHOP") {
      return 520; // above wasteful trades (280), below useful trades (540+)
    }
    // Optional pay-sites / shops: declining is fine but below a real take.
    if (
      step?.type === "PAY_TO" ||
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
    // Anime Equipment outfitter (§3.13): buy an item into an EMPTY slot only from
    // genuine surplus (gold ≥ cost + 6); otherwise leave. A buy below that scores
    // under the Leave option (1_050) so the shop always exits cleanly (no stall).
    const buyStep = option.steps.find((inner) => inner.type === "BUY_EQUIPMENT");
    if (buyStep && buyStep.type === "BUY_EQUIPMENT") {
      return equipmentBuyScore(state, playerId, buyStep.equipmentId);
    }
    // Monolith/Whirlpool (or Town-Portal) travel: route to the destination
    // nearest the march plan instead of the engine's first-listed token.
    const teleportScore = teleportDestinationScore(observation, option.steps);
    if (teleportScore !== null) {
      return teleportScore;
    }
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

  // --- Magic Spring: return highest-value discard card ----------------------
  if (step.type === "MAGIC_SPRING") {
    const player = state.players[playerId];
    const topThree = player?.discard.slice(-3).reverse() ?? [];
    const cardId = topThree[optionIndex];
    if (!cardId) return 1_050;
    return 1_100 + Math.min(40, cardKeepValue(cardId, { state, playerId }));
  }

  // --- Search discard top: take best card -----------------------------------
  if (step.type === "SEARCH_DISCARD") {
    const deck = state.decks[step.deckId];
    const topCards = deck ? deck.discardPile.slice(-step.count).reverse() : [];
    const cardId = topCards[optionIndex];
    if (!cardId) return 1_050;
    return 1_100 + Math.min(40, cardKeepValue(cardId, { state, playerId }));
  }

  // --- Remove hand card: dump lowest keep value -----------------------------
  if (step.type === "REMOVE_HAND_CARD") {
    const hand = state.players[playerId]?.hand ?? [];
    // legal-actions indexes removable cards; optionIndex maps into that list
    // only approximately when filters apply — still prefer lower-value cards
    // when the index lands on the raw hand (common for unfiltered removes).
    const cardId = hand[optionIndex];
    if (!cardId) return 1_100;
    return (
      1_100 +
      Math.max(0, 40 - Math.min(40, cardKeepValue(cardId, { state, playerId })))
    );
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
    case "RESOLVE_COMPANION_RECRUITMENT":
      return {
        score: action.unitDefId ? 1_150 : 1_000,
        policy: action.unitDefId ? "map.recruit-companion" : "map.decline-companion",
      };
    case "SET_MGQ_SPIRIT":
      // A spiritless MGQ seat MUST pick a Spirit before it may ACCEPT a PvP
      // battle (the printed Four Spirits gate withholds Accept), so the first
      // pick outranks the prep-exit floor (225) — without it the only exits a
      // spiritless seat had were the escapes, i.e. the AI fled every PvP fight.
      // Once a Spirit is set the re-pick drops to a token score (below END_TURN
      // and every real play), so the offer can never ping-pong between Spirits.
      return {
        score: state.players[action.playerId]?.mgqSpirit ? 5 : 700,
        policy: "map.mgq-select-spirit",
      };
    case "POPULATION_ACTION":
      return {
        score: populationScore(observation, action),
        policy: "map.recruit-army",
      };
    case "REDEEM_REINFORCEMENT_DISCOUNT":
      // Inside the atomic after-combat Necromancy window the bank is USE-IT-OR-
      // LOSE-IT: SKIP_NECROMANCY ("Resolve bonuses and continue", 1_120) expires
      // every offer this window created. At the ordinary 820/760 the AI played
      // its Necromancy card (1_140), banked the half-gold offer and then scored
      // the Resolve above the redeem — throwing the card away every single win.
      // Priced between the two: play every held card first, then redeem, then
      // resolve.
      if (state.adventure?.pendingNecromancy?.playerId === observation.playerId) {
        return {
          score: action.kind === "reinforce" ? 1_135 : 1_130,
          policy: "map.redeem-reinforcement-discount",
        };
      }
      return {
        score: action.kind === "reinforce" ? 820 : 760,
        policy: "map.redeem-reinforcement-discount",
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
      // A second pair of boots to sweep leftover pickups and flag mines while
      // the main hero pushes on. But the hire spends the round's Population
      // Token PLUS 10 gold: before the composition-aware fighting core exists or when
      // it would eat the treasury cushion, holding the token for
      // recruit/reinforce is strictly better — score below END_TURN so the
      // offer waits for a developed, funded turn (the old flat 420 hired a
      // hero while the army was still thin whenever recruiting didn't fire).
      const gold = playerGold(state, observation.playerId);
      if (
        !armyReadyForContestedFight(state, observation.playerId) ||
        gold < 10 + GOLD_RESERVE
      ) {
        return { score: 150, policy: "map.hire-secondary-hold" };
      }
      const army = state.players[observation.playerId]?.army.length ?? 0;
      return {
        score: army >= 5 ? 700 : 640,
        policy: "map.hire-secondary-hero",
      };
    }
    case "DISCOVER_TILE": {
      const hero = state.heroes[action.heroId];
      const tile = state.adventure?.tiles[action.tileInstanceId];
      if (
        hero &&
        tile &&
        canHeroDiscoverAdjacentTile(state, hero, tile) &&
        !canHeroImmediatelyAccessAdjacentTile(state, hero, tile)
      ) {
        // A human Legacy table may legally reveal by adjacency alone. The AI is
        // stricter: never spend its move exposing land behind a yellow wall it
        // cannot enter immediately; END_TURN (300) safely wins instead.
        return { score: 100, policy: "map.discover-inaccessible-skip" };
      }
      if (
        hero &&
        collectMapObjectives(state, hero).some((objective) =>
          isHomeTileOpeningObjective(state, hero, objective),
        )
      ) {
        return { score: 100, policy: "map.finish-home-before-discover" };
      }
      if (
        hero?.spaceId &&
        (state.round ?? 0) <= 3 &&
        state.adventure?.fields[hero.spaceId]?.tileInstanceId ===
          homeTileInstanceId(state, hero.controllerId) &&
        latestPlacedTileId(state, observation.playerId) !== null
      ) {
        // Once the opening route has placed its first Far tile, movement is
        // reserved for stepping into it (this turn or the next). Do not expose
        // a second adjacent tile while still standing on tile I.
        return { score: 100, policy: "map.enter-opened-tile-before-more-discovery" };
      }
      // USER RULE: while cheap Ⅱ–Ⅲ expansion is still ahead of the seat, never
      // burn a discovery on a Ⅳ–Ⅴ / Ⅵ–Ⅶ tile whose cheapest printed guard is
      // already above the hero's battle level. Measured pre-fix on 6 of 8 fixed
      // seeds: round 2 placed a Ⅱ–Ⅲ tile, then round 3 flipped a Ⅵ–Ⅶ CENTER
      // tile at 640 with a level-2 hero — the reported "flip tiles they can't
      // get in". 100 is the file's established "do not do this" band (below
      // END_TURN 300), so the seat marches / places instead.
      // SELF-TERMINATING on BOTH halves, so late-game Ⅳ+ discovery is untouched:
      // the hero out-levels the band (level 4 opens Ⅳ–Ⅴ, level 6 Ⅵ–Ⅶ), or the
      // Ⅱ–Ⅲ route runs out (last supply tile spent AND no Ⅱ–Ⅲ tile the hero can
      // flip from where it stands). A Ⅱ–Ⅲ tile is NEVER deferred by this.
      if (
        hero &&
        tile &&
        tile.group !== "far" &&
        tile.group !== "starting" &&
        heroCanBeatNoGuardInBand(state, hero, tile.group) &&
        farExpansionRouteRemains(state, observation.playerId, hero)
      ) {
        return { score: 100, policy: "map.discover-high-band-defer" };
      }
      const farGroup =
        tile?.group === "far";
      // Normal expansion ladder: when two public tile backs are reachable at
      // once, open the lower band first (II-III before IV-V, IV-V before
      // VI-VII). This is a preference, not a hard refusal: 650 remains above
      // END_TURN, so a blocked/unoffered lower reveal can never strand the hero.
      if (
        hero &&
        tile &&
        lowerExpansionBandImmediatelyAvailable(state, hero, tile.group)
      ) {
        const ordinary = expansionPriorityScore(
          observation,
          action.heroId,
          830,
          farGroup,
        );
        return {
          score: Math.max(650, ordinary - 160),
          policy: "map.discover-lower-band-first",
        };
      }
      // FAR-TILE HUNT: flipping a face-down Ⅱ–Ⅲ tile while the seat has no Far
      // economy is the settlement lottery the premium rush depends on — never
      // let the "collect the nearby payoff first" collapse (640/670) defer it.
      // 905 beats every move/enter score (≤ 890 short of a victory step) but
      // stays under the town build milestones (950+), so the flip happens the
      // moment the hero is adjacent. Measured pre-fix: own placed Far tiles sat
      // face-down for 5+ rounds while premium capture slipped to R7+/never.
      if (farGroup && !hasOpenedFarEconomy(state, observation.playerId)) {
        return { score: 905, policy: "map.discover-far-economy" };
      }
      return {
        score: expansionPriorityScore(observation, action.heroId, 830, farGroup),
        policy: "map.discover-tile",
      };
    }
    case "PLACE_TILE": {
      // Ⅱ–Ⅲ placement is the escape hatch when the hero is boxed by sealed
      // Near/center faces (the "stare at VI–VII" stall). Boost further when no
      // fightable prize remains so expand-or-recruit wins over END_TURN.
      const hero = state.heroes[action.heroId];
      const placementCenter = { row: action.centerRow, col: action.centerCol };
      if (
        hero &&
        canHeroReachPlacementCenter(state, hero, placementCenter) &&
        !canHeroImmediatelyReachPlacementCenter(state, hero, placementCenter)
      ) {
        return { score: 100, policy: "map.place-inaccessible-skip" };
      }
      if (
        hero &&
        collectMapObjectives(state, hero).some((objective) =>
          isHomeTileOpeningObjective(state, hero, objective),
        )
      ) {
        return { score: 100, policy: "map.finish-home-before-place" };
      }
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
        score: expansionPriorityScore(
          observation,
          action.heroId,
          780 + expandUrgency,
          true,
        ),
        policy: "map.place-far-tile",
      };
    }
    case "PLACE_OBSERVATORY_TILE":
      return {
        score: 1_130,
        policy: "map.observatory-place-expansion-tile",
      };
    case "MOVE_HERO": {
      const enterHero = state.heroes[action.heroId];
      const enterField = state.adventure?.fields[action.to];
      if (
        (state.round ?? 0) <= 3 &&
        enterHero?.spaceId &&
        state.adventure?.fields[enterHero.spaceId]?.tileInstanceId ===
          homeTileInstanceId(state, observation.playerId) &&
        enterField?.tileInstanceId === latestPlacedTileId(state, observation.playerId) &&
        // The entry step must be SAFE: this boost bypasses moveScore's whole
        // objective/can-beat read, so an unbeatable entry guard (or an enemy
        // hero on the entry hex) would otherwise be attacked at 930 — and a
        // beaten hero falls back to the home town, re-arming the same boost
        // next turn (a bounded but real suicide loop). A guarded entry the
        // hero cannot cover falls through to the normal objective scoring.
        (!isFieldGuarded(enterField) || canBeatGuardedField(state, enterHero, enterField)) &&
        !Object.values(state.heroes).some(
          (other) =>
            other.spaceId === action.to && other.controllerId !== observation.playerId,
        )
      ) {
        return { score: 930, policy: "map.enter-first-opened-tile" };
      }
      return { score: moveScore(observation, action), policy: "map.move-to-objective" };
    }
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
      const marketLocation = heroMarketLocation(state, action.heroId);
      const earlyTentVisit =
        marketLocation === "war_machine_factory" &&
        shouldPrioritizeFirstAidTent(state, observation.playerId);
      if ((state.round ?? 0) < MARKET_MIN_ROUND && !earlyTentVisit) {
        return { score: 180, policy: "map.market-wait-until-round-five" };
      }
      // Already used the market this round — avoid open/close thrash (applies to
      // the dwelling rush too: it completes in the first open of the round).
      if (memory.lastMarketRound === state.round) {
        return {
          score: 240,
          policy: "map.market-already-used",
        };
      }
      // Dwelling rush: convert genuine gold surplus into the missing dwelling
      // input and build THIS turn. Decisive so the AI does not fritter the gold
      // on stray troops / idle away instead of reaching Silver/Gold.
      if (assessDwellingRush(state, observation.playerId)?.feasible) {
        return {
          score: DWELLING_RUSH_OPEN_MARKET_SCORE,
          policy: "map.open-market-dwelling-rush",
        };
      }
      // Free while parked on a market. Only open when a useful trade or shop
      // buy exists — otherwise the hero would open/close forever (score 0 was
      // below END_TURN so it never opened; a high unconditional score loops).
      if (!wantsMarketVisit(state, observation.playerId, marketLocation)) {
        return { score: 250, policy: "map.market-skip-balanced" };
      }
      if (earlyTentVisit) {
        return { score: 700, policy: "map.open-war-machine-first-aid" };
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
    case "SELL_SCROLL_SPELL": {
      if ((state.round ?? 0) < MARKET_MIN_ROUND) {
        return { score: 180, policy: "map.market-wait-until-round-five" };
      }
      // Tier-aware scroll economics: a C/D-tier spell (Earthquake, Inferno …)
      // is 2 gold the AI would never cast — sell it whenever the shop is open.
      // An S/A-tier spell (Fly, Resurrection …) is worth far more cast from
      // the scroll than sold, even broke — keep it below END_TURN (300).
      // B-tier and unmapped spells keep the legacy only-when-tight behavior.
      const tight =
        playerGold(state, observation.playerId) < GOLD_RESERVE + 4;
      const tier = cardTier(action.cardId);
      if (tier === "S" || tier === "A") {
        return { score: 220, policy: "map.keep-scroll-spell" };
      }
      if (tier === "C" || tier === "D") {
        return { score: tight ? 560 : 540, policy: "map.sell-scroll-spell" };
      }
      return {
        score: tight ? 550 : 300,
        policy: "map.sell-scroll-spell",
      };
    }
    case "MOVE_SPELL_TO_SPELL_BOOK": {
      const hand = state.players[observation.playerId]?.hand ?? [];
      const crowded = hand.length >= 4;
      const value = cardKeepValue(action.cardId, observation);
      // Hand-slot relief (the original driver): stash to unclog a crowded hand,
      // otherwise keep the Spell ready in hand.
      const crowdedRelief = crowded ? 690 + Math.min(35, value) : 260;
      const tier = cardTier(action.cardId);
      // Junk Spells (D-tier: Earthquake, Inferno, Remove Obstacle) never belong
      // in the Book — the AI would never cast them, so burying one wastes the
      // stash (better left in hand to pay a cost / be discarded). Kept below every
      // real play so it is never chosen. CONTROL: an S/A Spell scores far above.
      if (tier === "D") {
        return { score: 205, policy: "card.dont-stash-junk-spell" };
      }
      // A combat-only Spell (timing != "map") cannot be cast on this map turn, so
      // a high-tier one is the prime Book candidate: stashing banks it for a
      // crown-free cast in the next fight AND frees a hand slot — worth doing even
      // from an uncrowded hand. A high-tier MAP Spell (Town Portal, View Air) the
      // AI might want to cast NOW is left ready unless the hand is crowded.
      const combatOnly = cardLibrary[action.cardId]?.timing !== "map";
      if ((tier === "S" || tier === "A") && combatOnly) {
        return {
          score: Math.max(crowdedRelief, 600 + Math.min(30, value)),
          policy: "card.stash-high-tier-spell-crown-free",
        };
      }
      return {
        score: crowdedRelief,
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
    case "SPELL_BOOK_ACTION": {
      // Spells are a luxury: buy only once the army core + dwellings are done
      // AND the purchase is actually a good deal — Wisdom in hand makes it one
      // (cheaper buy + a bigger Search), otherwise only genuine surplus gold
      // may fund it. A spell bought out of the dwelling/recruit fund does not
      // help the next fight the way a stronger army does.
      const phase = armyDevelopmentProfile(state, observation.playerId).phase;
      const holdsWisdom = (
        state.players[observation.playerId]?.hand ?? []
      ).includes("ability.wisdom");
      const target = developmentResourceTargets(state, observation.playerId);
      const flushGold =
        playerGold(state, observation.playerId) >= target.gold + 4;
      const funded = phase === "improve-army" && (holdsWisdom || flushGold);

      // Rolling Spells trades a weak owned Spell for two new looks. Keep strong
      // S/A/B spells and only roll C/D cards once the army fund is protected.
      if (action.rollSpell) {
        const tier = cardTier(action.rollSpell.cardId);
        return funded && (tier === "C" || tier === "D")
          ? { score: 640, policy: "town.roll-weak-polish-spell" }
          : { score: 215, policy: "town.keep-useful-polish-spell" };
      }

      // Buy another reusable Cast card only when the Book has outgrown the
      // player's total enabler supply. Otherwise a new Spell is the better buy.
      if (action.takeCastCard) {
        const player = state.players[observation.playerId];
        const castSupply = [...(player?.hand ?? []), ...(player?.deck ?? []), ...(player?.discard ?? [])].filter(
          (cardId) => cardId === "spell.cast_a_spell",
        ).length;
        const ownedSpells = (player?.spellBook?.length ?? 0) + (player?.spellBookUsed?.length ?? 0);
        return funded && castSupply < Math.max(1, ownedSpells)
          ? { score: 630, policy: "town.buy-polish-cast-enabler" }
          : { score: 225, policy: "town.cast-supply-sufficient" };
      }

      if (funded) {
        return { score: 620, policy: "town.buy-spells-after-army-core" };
      }
      return { score: 250, policy: "town.skip-spell-buy-fund-army" };
    }
    case "MAGIC_UNIVERSITY_ACTION": {
      const phase = armyDevelopmentProfile(state, observation.playerId).phase;
      const target = developmentResourceTargets(state, observation.playerId);
      const flushGold =
        playerGold(state, observation.playerId) >= target.gold + 4;
      return {
        score: phase === "improve-army" && flushGold ? 615 : 290,
        policy: "town.use-magic-university-after-core",
      };
    }
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
    case "HEAVEN_TRIBULATION": {
      // Anime Cultivation (§5.6): brave the Tribulation ONLY with an army buffer
      // so the toll gamble cannot strand the seat — otherwise skip (null →
      // foundation 0, below END_TURN). A larger army (realm-3 Power is real)
      // raises priority into the low map-play band so it is not forever idle.
      const army = state.players[observation.playerId]?.army.length ?? 0;
      if (army < 3) {
        return null;
      }
      return {
        score: army >= 4 ? 480 : 360,
        policy: "map.heaven-tribulation",
      };
    }
    case "HERO_GRADE_PICK": {
      // Anime Hero Grades (§3.11): spending a grade point is free and beneficial,
      // so grade up IMMEDIATELY (like COMMANDER_GRADE_UP). No earlier scorer
      // claims this type, so map-policy owns it. Prefer PASSIVES and the lowest
      // unlocked tier ("first affordable tier") so the pick is deterministic.
      const node = HERO_GRADE_NODES[action.nodeId];
      const passiveNudge = node?.kind === "passive" ? 4 : 0;
      const tierNudge = node ? 3 - node.tier : 0;
      return { score: 1200 + passiveNudge + tierNudge, policy: "map.hero-grade-pick" };
    }
    case "HERO_TRAIN":
      // Train for Merit only when idle: scored just above END_TURN (300) and
      // below every real map play (moves/recruits/builds ≥ ~590), so a reachable
      // objective always outscores it — i.e. only when the seat would otherwise
      // end the turn with the 2 MP unspent. Legal only with ≥2 MP (heroTrainAvailable).
      return { score: 330, policy: "map.hero-train" };
    case "HERO_GRADE_SELL_ARTIFACT":
      return { score: 315, policy: "map.hero-grade-artifact-sale" };
    case "DRILL_UNIT": {
      // Unit Experience Drill: surplus-gold only; prefer silver/gold bodies and
      // cards close to the next rank when unit experience is on.
      const gold = playerGold(state, observation.playerId);
      if (gold < 10) {
        return { score: 5, policy: "map.drill-unit-broke" };
      }
      const unit = state.players[observation.playerId]?.army.find(
        (candidate) => candidate.id === action.armyUnitId,
      );
      const tier = unit ? coreUnitDefinitions[unit.unitDefId]?.tier : undefined;
      const tierNudge =
        tier === "gold" || tier === "azure" ? 18 : tier === "silver" ? 12 : 4;
      // Rank proximity — actually read the veteran track (the old score only
      // CLAIMED to): a card 1-2 XP short of its next rank converts this drill
      // straight into a stat/ability step, worth taking over idle turns.
      const rankInfo = unit ? armyUnitRankInfo(unit) : null;
      const toNextRank =
        rankInfo && rankInfo.nextThreshold !== null
          ? rankInfo.nextThreshold - rankInfo.experience
          : null;
      const proximityNudge = toNextRank !== null && toNextRank <= 2 ? 40 : 0;
      return {
        score: 325 + tierNudge + proximityNudge,
        policy: "map.drill-unit",
      };
    }
    case "USE_HERO_SKILL":
      // On the map this is Forced March (+1 movement, once per round). Combat
      // War Cry is claimed earlier by combat-policy, so a USE_HERO_SKILL reaching
      // here is the map active. Scored just above END_TURN so a stuck hero pumps
      // +1 MP and re-evaluates (a previously out-of-reach objective may open up);
      // once-per-round, so it can never loop.
      return state.combat ? null : { score: 340, policy: "map.hero-forced-march" };
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
