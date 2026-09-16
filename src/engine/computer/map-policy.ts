import { isOpeningFarSweepField, securedFarTileIds } from "./far-sweep";
import { heroReadyForGrowth, tileBandOffersGrowth } from "./map-navigation";
import { preferredOpeningPacks, committedGoldInvestment, goldStepMarketPlan, goldLadderValuablesReserve } from "./development";
import {
  GOLD_RESERVE,
  MARKET_MIN_ROUND,
  playerResources,
  resourceDeficits,
  tradeUtility,
  wantsMarketVisit,
  type ResourceKey,
} from "./market-trades";
export { MARKET_MIN_ROUND, resourceDeficits, hasUsefulMarketTrade, tradeUtility } from "./market-trades";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { COMMANDER_GRADE_VALUES, commanderUnlockedCombos } from "@/data/commanders";
import { commanderGradesOf } from "../commanders";
import { secondaryHeroOpportunity } from "./secondary-plan";
import { HERO_GRADE_NODES } from "@/data/anime/hero-grades";
import { getEquipmentDefinition } from "@/data/anime/equipment";
import { heroEquipmentSlot } from "../anime-equipment";
import { cardLibrary } from "@/data/cards/library";
import { inlineLegionSavings, legionPurchaseSavings } from "./card-planning";
import { isMarketLocation, locationDefinitions } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import { hasInternalBorder } from "@/data/map/borders";
import {
  adventureVictoryMode,
  applyRecruitGoldDiscount,
  canHeroImmediatelyReachPlacementCenter,
  canHeroReachPlacementCenter,
  canHeroReachPlacedTile,
  gateFieldsLinked,
  freeSpellBookActive,
  getTownOfPlayer,
  getAdjacentSpaceIds,
  getUnitSide,
  reinforceCostFor,
  unitDrillGoldCostFor,
  unitDrillMovementCost,
  reinforcementDiscountCostFor,
  heroesAtSpace,
  isFieldGuarded,
  isOuterEdgeSealed,
  materializeTileFields,
  heroMovementMax,
  neutralBattleLevel,
  wanderingMerchantAvailable,
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
import { effectiveTownBuildingCost, houseRuleEnabled } from "../house-rules";
import { getRuleset, wisdomGoldDiscount } from "../ruleset";
import { armyUnitRankInfo } from "../unit-experience";
import {
  hasNecromancyPlan,
  needsNecromancyVampire,
  necromancyUpgradePriority,
  neutralsArePlayerControlled,
  armyDevelopmentProfile,
  needsPremiumSilverBreakthrough,
  armyReadyForContestedFight,
  assessDwellingRush,
  developmentResourceTargets,
  goldPurchaseReachable,
  purchaseLandingRounds,
  hasGoldArmy,
  hasReachedGoldArmy,
  hasReachedSilverArmy,
  goldArmyAllowsBronzePurchase,
  hasOpenedFarEconomy,
  INCOME_FIRST_LAST_ROUND,
  INCOME_NEVER_FROM_ROUND,
  factionBuildingForEffect,
  incomeBuildingBeforeDwelling,
  nextGoldLadderStep,
  nextPlannedSilver,
  rankedGoldUnits,
  spendDelaysSavedCost,
  unitDevelopmentSideStrength,
  shouldPrioritizeFirstAidTent,
  shouldLaunchBronzeRush,
} from "./development";
import {
  canBeatGuardedField,
  collectMapObjectives,
  hasAttainableGoldFunding,
  distanceFromHeroTo,
  fieldSuppliesResource,
  freeSeizuresWithinReach,
  shouldDeferExpansionTile,
  isHomeTileOpeningObjective,
  lowerExpansionBandImmediatelyAvailable,
  homeTileInstanceId,
  objectiveDistanceField,
  needsFarValuablesReveal,
  premiumEconomyResourceBonus,
  primaryMapObjective,
  seatHoldsFarSupplyTile,
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
import { hasCommittedIncomeRoute, premiumCombatMovementReserve, scorePremiumApproach } from "./premium-approach";

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


function playerGold(state: GameState, playerId: string): number {
  return state.players[playerId]?.resources.gold ?? 0;
}

function heroMarketLocation(state: GameState, heroId: string): string | undefined {
  const spaceId = state.heroes[heroId]?.spaceId;
  return spaceId ? state.adventure?.fields[spaceId]?.location : undefined;
}


/**
 * A concrete map payoff the hero can march toward with its remaining movement. This
 * gate keeps a marketplace visit from consuming the turn while a fight, free
 * claim, town, visit, or expansion doorway is reachable. Staging at
 * an unbeatable guard does not count as actionable work.
 */
function hasReachableMapWork(
  observation: ComputerObservation,
  heroId: string,
): boolean {
  const state = observation.state as unknown as GameState;
  const hero = state.heroes[heroId];
  if (!hero?.spaceId || (hero.movementPoints ?? 0) <= 0) return false;
  // A market can share a doorway with a face-down tile. In that case its field
  // is classified as the market visitable (rather than a second explore
  // objective), so use the authoritative legal set to retain the direct reveal.
  if (observation.legalActions.some((legal) => {
    const action = legal.action;
    return (
      (action.type === "DISCOVER_TILE" || action.type === "PLACE_TILE") &&
      action.heroId === heroId
    );
  })) return true;
  return collectMapObjectives(state, hero).some((objective) => {
    const distance = distanceFromHeroTo(state, hero, objective.spaceId);
    // Distance zero is the marketplace itself, not a reason to reject opening
    // that marketplace. Direct exploration at the same field is caught above.
    if (distance === undefined || distance === 0) {
      return false;
    }
    const field = state.adventure?.fields[objective.spaceId];
    if (field && isMarketLocation(field.location) && objective.kind === "visitable") return false;
    if (objective.kind !== "guard") return true;
    return Boolean(field && canBeatGuardedField(state, hero, field));
  });
}

/**
 * Whether the main hero's current army still has winnable work on the map: an
 * unguarded objective (flag, visit, town, victory site, exploration) or a guard
 * the army can beat now. False means the army is the bottleneck — the next
 * dwelling, not the income building, is the plan (see
 * incomeBuildingBeforeDwelling). Enemy heroes are not "work" here: PvP has its
 * own engagement gate.
 */
function bronzeCoreHasWork(state: GameState, playerId: PlayerId): boolean {
  const main = Object.values(state.heroes ?? {}).find(
    (hero) => hero.controllerId === playerId && hero.kind === "main",
  );
  if (!main) return false;
  return collectMapObjectives(state, main).some((objective) => {
    if (objective.kind === "enemy-hero") return false;
    if (objective.kind !== "guard") return true;
    const field = state.adventure?.fields[objective.spaceId];
    return Boolean(field && canBeatGuardedField(state, main, field));
  });
}

function buildingScore(
  state: GameState,
  playerId: PlayerId,
  buildingId: string,
  memory: ComputerPolicyMemory,
): number {
  const effect = coreBuildingDefinitions[buildingId]?.effect;
  const development = armyDevelopmentProfile(state, playerId);
  // PvP pre-battle preparation: a town building adds nothing to the fight
  // that is about to start, so every non-dwelling build sits BELOW the
  // accept floor (225). Measured (Dungeon seed eval-10, R9): with the
  // enemy hero at the gate the "never before the Gold dwelling" 280 band
  // still beat ACCEPT and the seat bought a Portal of Summoning — 7 gold,
  // 3 materials and the Gold dwelling's own valuable — instead of readying.
  // A dwelling keeps its score: it can still unlock a preparation recruit.
  if (state.combat?.prep && !state.combat.prep.accepted.includes(playerId) &&
      effect?.type !== "UNLOCK_RECRUIT_TIER") {
    return 200;
  }
  if (effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold" &&
      needsPremiumSilverBreakthrough(state, playerId)) return 240;
  const armySize = state.players[playerId]?.army.length ?? 0;
  const gold = playerGold(state, playerId);
  if (effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver" &&
      !hasOpenedFarEconomy(state, playerId)) {
    const cost = effectiveTownBuildingCost(state, coreBuildingDefinitions[buildingId]);
    const remainingBronzeGold = (state.players[playerId]?.army ?? []).reduce((sum, unit) => {
      const definition = coreUnitDefinitions[unit.unitDefId];
      if (definition?.tier !== "bronze" || unit.side !== "few") return sum;
      const preferred = preferredOpeningPacks(state, playerId);
      if (preferred.length > 0 && !preferred.includes(unit.unitDefId)) return sum;
      const waitForNecromancy = hasNecromancyPlan(state, playerId) &&
        (unit.unitDefId === "necropolis.wraiths" || unit.unitDefId === "necropolis.zombies" &&
          state.players[playerId].army.some(u => u.unitDefId === "necropolis.wraiths" && u.side === "pack") &&
          state.players[playerId].hand.some(id => cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE"));
      return sum + (reinforceCostFor(state, playerId, unit.id, false, waitForNecromancy, waitForNecromancy)?.gold ?? 0);
    }, 0);
    if (gold - (cost?.gold ?? 0) < Math.max(GOLD_RESERVE, remainingBronzeGold)) return 240;
  }
  // After the bronze-funding guard above so the breakthrough Silver dwelling
  // can never strand the gold reserved for a remaining opening Pack.
  if (effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver" &&
      needsPremiumSilverBreakthrough(state, playerId)) return 976;
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
  if (needsNecromancyVampire(state, playerId) && effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "gold") return 180;
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
  // Too late for income: no ranked seat built a City Hall from R8 on — the
  // +5/round cannot repay its cost before the game is decided. Never build it.
  if (
    effect?.type === "RESOURCE_ROUND_CHOICE" &&
    (state.round ?? 0) >= INCOME_NEVER_FROM_ROUND
  ) {
    return 280;
  }
  // SITUATIONAL income-first (all ranked replays through 2026-09-11, see
  // incomeBuildingBeforeDwelling): while the hall buys tempo toward a Gold
  // dwelling by R7 — next dwelling out of reach, early, not behind — it
  // outranks both dwelling milestones and skips the dwelling-fund guard (it IS
  // the fund's payback). The dwellings keep their own scores (a hall the seat
  // cannot afford never stalls them) but cap below it. Otherwise the hall is
  // an ordinary side build: surplus only, fund protected.
  const incomeFirst = incomeBuildingBeforeDwelling(
    state,
    playerId,
    bronzeCoreHasWork(state, playerId),
  );
  if (incomeFirst?.id === buildingId) {
    return Math.min(975, 970 + economyFocusBias(memory, focusKind));
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
    // legal step that completes the scenario immediately (980), nor the
    // income-first City Hall (970+) while that is still missing.
    return Math.min(score, incomeFirst ? 960 : 975);
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
  // USER RULE: before the faction's Gold Dwelling stands, a side building is
  // never bought — genuine surplus included (the milestone builds returned
  // above, and the situational income-first City Hall keeps its own gate: it
  // IS the gold-dwelling plan). The two cheap recurring-payout exceptions —
  // Cove's Pub and Stronghold's Freelancer's Guild — stay buyable at
  // rock-bottom priority (just above END_TURN 300), everything else waits in
  // the 280 "do not do this" band until the Gold Dwelling is built.
  // USER RULING (2026-09-16): the City Hall is marginal in R5–R6 — still
  // allowed from genuine surplus (the dwelling-fund guard above already ran),
  // never ahead of a dwelling (its 820 band sits below the 950/955 milestone
  // scores), and off limits from INCOME_NEVER_FROM_ROUND (returned 280 above).
  const soSoIncomeWindow =
    effect?.type === "RESOURCE_ROUND_CHOICE" &&
    (state.round ?? 0) > INCOME_FIRST_LAST_ROUND &&
    (state.round ?? 0) < INCOME_NEVER_FROM_ROUND;
  if (
    !development.goldUnlocked &&
    !soSoIncomeWindow &&
    effect?.type !== "UNLOCK_RECRUIT_TIER" &&
    effect?.type !== "UNLOCK_REINFORCE" &&
    factionBuildingForEffect(
      state,
      playerId,
      (candidate) =>
        candidate.type === "UNLOCK_RECRUIT_TIER" && candidate.tier === "gold",
    )
  ) {
    return Math.min(
      score,
      buildingId === "cove.pub" || buildingId === "stronghold.freelancers_guild"
        ? 310
        : 280,
    );
  }
  // Keep the missing Gold recruit funded even if the lower Gold body already
  // stands. A side building must not consume the remaining recruit fund.
  if (development.goldUnlocked && (nextGoldLadderStep(state, playerId)?.kind === "recruit" || committedGoldInvestment(state, playerId))) {
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

/** A Trading Post the main hero can reach this turn or the next (walk only). */
function tradingPostInReach(state: GameState, playerId: PlayerId): boolean {
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === playerId && candidate.kind === "main" && candidate.spaceId,
  );
  if (!hero) return false;
  const reach = hero.movementPoints + heroMovementMax(state, hero);
  return Object.values(state.adventure?.fields ?? {}).some((field) =>
    field.location === "trading_post" && !isFieldGuarded(field) &&
    (distanceFromHeroTo(state, hero, field.spaceId, true) ?? Infinity) <= reach);
}

/**
 * Whether spending `spend` (the lower Gold Few) pushes the top Gold step's
 * landing to a later Resource Round. Trading counts only with a post in reach.
 */
function lowerFewDelaysTopGold(
  state: GameState,
  playerId: PlayerId,
  topCost: ResourceCost,
  spend: ResourceCost,
): boolean {
  const player = state.players[playerId];
  if (!player) return true;
  const production = player.production ?? {};
  const allowTrade = tradingPostInReach(state, playerId);
  const before = purchaseLandingRounds(player.resources, production, topCost, allowTrade);
  const after = purchaseLandingRounds({
    gold: (player.resources.gold ?? 0) - (spend.gold ?? 0),
    buildingMaterials: (player.resources.buildingMaterials ?? 0) - (spend.buildingMaterials ?? 0),
    valuables: (player.resources.valuables ?? 0) - (spend.valuables ?? 0),
  }, production, topCost, allowTrade);
  if (before === null) return false;
  return after === null || after > before;
}

/**
 * Whether the army WITH this extra Few body can beat a reachable guarded
 * field that pays resources (creature bank, mine, settlement, guarded pickup)
 * — the fight the ruling buys it for. Two turns of walking count as reach.
 */
function lowerFewHelpsResourceFight(state: GameState, playerId: PlayerId, unitDefId: string): boolean {
  const player = state.players[playerId];
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === playerId && candidate.kind === "main" && candidate.spaceId,
  );
  if (!player || !hero) return false;
  const probe: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, army: [...player.army, { id: `${playerId}_probe_few`, unitDefId, side: "few" }] },
    },
  };
  const reach = hero.movementPoints + 2 * heroMovementMax(state, hero);
  return collectMapObjectives(probe, hero).some((objective) => {
    if (objective.kind !== "guard") return false;
    const field = probe.adventure?.fields[objective.spaceId];
    if (!field || !(isFieldGuarded(field) || field.location === "creature_bank")) return false;
    if (!(["gold", "buildingMaterials", "valuables"] as const).some((resource) =>
      fieldSuppliesResource(probe, playerId, field, resource))) return false;
    const distance = distanceFromHeroTo(probe, hero, objective.spaceId, true);
    return distance !== undefined && distance <= reach && canBeatGuardedField(probe, hero, field);
  });
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
  // PvP pre-battle preparation: the fight is NOW, so every saving plan below
  // yields to the largest combat gain this Population token can still buy (a
  // missing Gold body first, else the best Pack upgrade or body). Measured: the
  // AI readied up with gold in hand and units unbought because the ladder guards
  // (240 "save for the Gold step") sat below ACCEPT's 225 prep floor.
  if (state.combat?.prep && !state.combat.prep.accepted.includes(observation.playerId)) {
    let gain = 0;
    for (const purchase of action.purchases) {
      if (purchase.kind === "stack") continue;
      const side = purchase.kind === "reinforce" ? "pack"
        : coreUnitDefinitions[purchase.unitDefId]?.few ? "few" : "neutral";
      gain += unitDevelopmentSideStrength(purchase.unitDefId, side) -
        (purchase.kind === "reinforce" ? unitDevelopmentSideStrength(purchase.unitDefId, "few") : 0);
    }
    if (gain > 0) return 940 + Math.min(35, Math.round(gain));
  }
  if (action.purchases.some(purchase => !goldArmyAllowsBronzePurchase(
    state, observation.playerId, purchase.unitDefId, purchase.kind))) return 180;
  if (hasReachedSilverArmy(state, observation.playerId) && action.purchases.filter(purchase =>
    purchase.kind === "recruit" && coreUnitDefinitions[purchase.unitDefId]?.tier === "bronze").length > 1) return 180;

  // Earn Wraiths with Necromancy; buy Skeletons and keep paid Zombies legal
  // unless Wraiths are complete and a held Necromancy can supply Zombies.
  if (hasNecromancyPlan(state, observation.playerId) && !hasReachedGoldArmy(state, observation.playerId)) {
    const main = Object.values(state.heroes).find(hero =>
      hero.controllerId === observation.playerId && hero.kind === "main");
    const earnedUpgradeAvailable = player.hand.some(id =>
      cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE") && main &&
      collectMapObjectives(state, main).some(objective => {
        const field = state.adventure?.fields[objective.spaceId];
        const distance = distanceFromHeroTo(state, main, objective.spaceId, true);
        return objective.kind === "guard" && field && distance !== undefined &&
          distance + premiumCombatMovementReserve(state, main, field) <= Math.max(main.movementPoints, heroMovementMax(state, main)) &&
          canBeatGuardedField(state, main, field);
      });
    const fallbackUpgrade = action.purchases.length === 1 && action.purchases[0].kind === "reinforce" &&
      ["necropolis.wraiths", "necropolis.vampires"].includes(action.purchases[0].unitDefId) &&
      player.army.some(unit => unit.unitDefId === "necropolis.skeletons" && unit.side === "pack");
    // A held ability without a reachable fight cannot pay for an upgrade.
    // Use the legal paid offer to break that deadlock, including Vampire Pack.
    const fallbackPurchase = action.purchases[0];
    const fallbackCost = fallbackPurchase?.kind === "reinforce" && fallbackPurchase.armyUnitId
      ? reinforceCostFor(state, observation.playerId, fallbackPurchase.armyUnitId, false, false, false) : null;
    if (fallbackUpgrade && !earnedUpgradeAvailable &&
        !spendsMissingGoldRecruitFund(state, observation.playerId, fallbackCost)) return 976;
    if (action.purchases.some(purchase => purchase.kind !== "recruit" &&
        (purchase.unitDefId === "necropolis.vampires" || purchase.unitDefId === "necropolis.wraiths" ||
          (purchase.unitDefId === "necropolis.zombies" && player.army.some(u => u.unitDefId === "necropolis.wraiths" && u.side === "pack") && player.hand.some(id =>
            cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE"))))) return 180;
    const skeletonNeedsPack = player.army.some(unit => unit.unitDefId === "necropolis.skeletons" && unit.side === "few");
    if (skeletonNeedsPack && action.purchases.some(purchase => purchase.kind === "reinforce" &&
        purchase.unitDefId === "necropolis.wraiths")) return 180;
    if (action.purchases.length === 1 && action.purchases[0].kind === "reinforce" &&
        action.purchases[0].unitDefId === "necropolis.skeletons") return 976;
    if (needsNecromancyVampire(state, observation.playerId)) {
      if (action.purchases.some(purchase => coreUnitDefinitions[purchase.unitDefId]?.tier === "gold" ||
          purchase.unitDefId === "necropolis.liches")) return 180;
      if (action.purchases.length === 1 && action.purchases[0].kind === "recruit" &&
          action.purchases[0].unitDefId === "necropolis.vampires" &&
          player.army.some(unit => unit.unitDefId === "necropolis.skeletons" && unit.side === "pack")) return 976;
    }
  }

  const goldArmy = hasReachedGoldArmy(state, observation.playerId);
  const preferred = preferredOpeningPacks(state, observation.playerId);
  if (!hasReachedSilverArmy(state, observation.playerId) && preferred.length > 0) {
    const next = preferred.find(id => !player?.army.some(unit => unit.unitDefId === id && unit.side === "pack"));
    if (action.purchases.some(purchase => purchase.kind === "reinforce" &&
        coreUnitDefinitions[purchase.unitDefId]?.tier === "bronze" && purchase.unitDefId !== next)) return 240;
    if (next && !player?.army.some(unit => unit.unitDefId === next) &&
        action.purchases.length === 1 && action.purchases[0].kind === "recruit" &&
        action.purchases[0].unitDefId === next) return 976;
  }
  const bronzePurchases = action.purchases.filter((purchase) =>
    coreUnitDefinitions[purchase.unitDefId]?.tier === "bronze");
  // Inferno's two surviving opening Packs have already won the first Far.
  // Replace a lost Magog with the first Silver, not another Bronze screen:
  // the three gold screen otherwise delays the Silver dwelling/recruit pair
  // through the next Resource Round. If either Pack is lost, rebuild normally.
  if (player.factionId === "inferno" && !hasReachedSilverArmy(state, observation.playerId) &&
      securedFarTileIds(state, observation.playerId).size > 0 &&
      preferred.every(id => player.army.some(unit => unit.unitDefId === id && unit.side === "pack")) &&
      bronzePurchases.length > 0) return 180;
  if (!goldArmy && !hasNecromancyPlan(state, observation.playerId) &&
      (development.silverUnits > 0 || hasOpenedFarEconomy(state, observation.playerId))) {
    // After the first premium capture, keep only the level-3 Bronze Pack
    // investment; other surviving Few cards are screens. Conflux's explicitly
    // permitted Sprites Pack remains available before Gold.
    if (bronzePurchases.some(purchase => purchase.kind !== "recruit" &&
        purchase.unitDefId !== preferred[0] &&
        !(player.factionId === "conflux" && purchase.unitDefId === "conflux.sprites"))) return 180;
  }

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
    const stackCost = target ? polishArmyUnitStackCost(target) : polishUnitStackCost(stackPurchase.unitDefId, stackSide);
    const cost = stackCost && target ? applyRecruitGoldDiscount(state, observation.playerId,
      { kind: "stack", unitDefId: stackPurchase.unitDefId, armyUnitId: target.id }, stackCost).gold ?? 0 : Number.POSITIVE_INFINITY;
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
  const ownsUnit = (unitDefId: string) =>
    player?.army.find((unit) => unit.side !== "bank" && unit.unitDefId === unitDefId);
  const goldLadder = rankedGoldUnits(state, observation.playerId);
  const goldFewMissing = goldLadder.some((unitDefId) => !ownsUnit(unitDefId));
  // The Silver this seat should recruit NEXT (per its faction plan: Dungeon
  // Minotaur→Medusa, Rampart Dendroid). User ruling: buy the planned body FIRST
  // AT ALL COST — an OFF-plan Silver (Medusa/Pegasi) is deferred until the
  // planned one is owned, even if that means saving for several rounds with no
  // Silver at all. developmentResourceTargets saves for the planned body's cost.
  const plannedSilver = nextPlannedSilver(state, observation.playerId);
  const buysSilverPack = action.purchases.some(
    (purchase) =>
      purchase.kind === "reinforce" &&
      coreUnitDefinitions[purchase.unitDefId]?.tier === "silver",
  );
  // Paid Silver Packs wait for both Gold Few bodies and their Packs. Keep
  // earned Necromancy upgrades in their own discounted resolution path.
  const goldGrowthPending = !development.goldUnlocked || nextGoldLadderStep(state, observation.playerId) !== null;
  if (buysSilverPack && goldGrowthPending &&
      state.adventure?.pendingNecromancy?.playerId !== observation.playerId) return 180;
  for (const purchase of action.purchases) {
    const definition = coreUnitDefinitions[purchase.unitDefId];
    // A Settlement Neutral-Units recruit (BINH house rule) buys the single-sided
    // NEUTRAL card — such a definition has no Few side, so price and value the
    // side the offer actually adds instead of a zero-cost, zero-gain phantom.
    const recruitSide: "few" | "neutral" =
      purchase.kind !== "reinforce" && !definition?.few && definition?.neutral
        ? "neutral"
        : "few";
    const gainedSide = getUnitSide(
      purchase.unitDefId,
      purchase.kind === "reinforce" ? "pack" : recruitSide,
    );
    const previousSide =
      purchase.kind === "reinforce"
        ? getUnitSide(purchase.unitDefId, "few")
        : null;
    // Spend the once-per-round Population token on the largest real combat
    // gain, not a hash-random unit among same-tier offers. Reinforcement is
    // valued by the Pack's improvement over Few; recruitment gains the whole
    // Few body. These are public printed stats only.
    const developmentSide = purchase.kind === "reinforce" ? "pack" : recruitSide;
    const sideValue = unitDevelopmentSideStrength(
      purchase.unitDefId,
      developmentSide,
    );
    const previousValue = previousSide
      ? unitDevelopmentSideStrength(purchase.unitDefId, "few")
      : 0;
    const gain = Math.max(0, sideValue - previousValue);
    totalGain += gain;
    const discountedUnitId = purchase.armyUnitId ?? ownsUnit(purchase.unitDefId)?.id;
    const priceRef = purchase.kind === "recruit"
      ? { kind: "recruit" as const, unitDefId: purchase.unitDefId }
      : discountedUnitId ? { kind: purchase.kind, unitDefId: purchase.unitDefId, armyUnitId: discountedUnitId } : null;
    const printedCost = priceRef ? applyRecruitGoldDiscount(state, observation.playerId, priceRef, gainedSide?.cost ?? {}) : gainedSide?.cost ?? {};
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
    // An off-plan Silver defers to the planned one while that is reachable soon.
    const offPlanSilver = definition?.tier === "silver" && purchase.kind !== "reinforce" &&
      plannedSilver !== null && purchase.unitDefId !== plannedSilver;
    if (development.phase === "unlock-silver" || development.phase === "unlock-gold") {
      if (definition?.tier === "gold") score = Math.max(score, 940);
      else if (definition?.tier === "silver") score = offPlanSilver ? Math.min(score, 820) : Math.max(score, 915);
      else score = Math.min(score, 820);
    } else if (definition?.tier === "gold") {
      // Gold ladder bases (see nextGoldLadderStep): top Few, lower Few, top
      // Pack, lower Pack. The exact saved step is promoted after the loop.
      const rank = goldLadder.indexOf(purchase.unitDefId);
      if (purchase.kind !== "reinforce") {
        score = Math.max(score, rank === 0 ? 960 : 955);
      } else if (goldFewMissing) {
        score = Math.max(score, 930);
      } else {
        score = Math.max(score, rank === 0 ? 950 : 945);
      }
    } else if (definition?.tier === "silver") {
      score = offPlanSilver ? Math.min(score, 820) : Math.max(score, purchase.kind === "reinforce" ? 935 : 940);
    } else if (purchase.kind === "reinforce") {
      score = Math.max(score, 900);
    }
  }
  // Combat gain per weighted resource breaks same-stage ties intelligently.
  const efficiency = totalCostWeight > 0 ? totalGain / totalCostWeight : totalGain;
  score += Math.min(40, Math.round(totalGain * 1.5 + efficiency));
  if (gold >= GOLD_RESERVE + 10) score += 5;
  score += economyFocusBias(memory, "recruit");
  // Only the first Silver recruit for a premium commitment can spend this
  // reserve — and only the seat's PLANNED first Silver (Dungeon Minotaur,
  // Rampart Dendroid), never a cheaper off-plan body that would satisfy the tier
  // gate with a unit too weak to win the fight it is being bought for.
  if (needsPremiumSilverBreakthrough(state, observation.playerId) &&
      action.purchases.length === 1 && action.purchases[0].kind === "recruit" &&
      coreUnitDefinitions[action.purchases[0].unitDefId]?.tier === "silver" &&
      (plannedSilver === null || action.purchases[0].unitDefId === plannedSilver)) {
    return 976 + Math.min(1, efficiency / 100);
  }
  // Other Silver is an optional surplus purchase. Never spend the Bronze opening /
  // next dwelling or Gold-recruit fund merely to satisfy a tier gate.
  if (!goldArmy && action.purchases.some(
    purchase => coreUnitDefinitions[purchase.unitDefId]?.tier === "silver",
  )) {
    const reserve = developmentResourceTargets(state, observation.playerId);
    const resources = playerResources(state, observation.playerId);
    if (resources.gold - spentGold < reserve.gold ||
        resources.buildingMaterials - spentMaterials < reserve.buildingMaterials ||
        resources.valuables - spentValuables < reserve.valuables) return 240;
  }
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
  if (development.goldUnlocked) {
    const step = nextGoldLadderStep(state, observation.playerId);
    if (step) {
      const buysStep = action.purchases.some(
        (purchase) =>
          purchase.unitDefId === step.unitDefId &&
          (purchase.kind === "reinforce") === (step.kind === "reinforce"),
      );
      if (buysStep) {
        // The saved ladder step: above every other purchase, below a
        // scenario-winning map step (980).
        return Math.min(975, Math.max(score, 968));
      }
      if (committedGoldInvestment(state, observation.playerId)) {
        const reserve = developmentResourceTargets(state, observation.playerId);
        const resources = playerResources(state, observation.playerId);
        if (resources.gold - spentGold < reserve.gold ||
            resources.buildingMaterials - spentMaterials < reserve.buildingMaterials ||
            resources.valuables - spentValuables < reserve.valuables) return 240;
      }
      score = Math.min(score, 965);
      const buysLowerGoldFew =
        step.kind === "recruit" &&
        action.purchases.some(
          (purchase) =>
            purchase.kind === "recruit" &&
            coreUnitDefinitions[purchase.unitDefId]?.tier === "gold",
        );
      if (buysLowerGoldFew) {
        // USER RULING (2026-09-16): the lower Gold Few goes through when it
        // cannot delay the level-7 anyway AND it helps win a reachable
        // resource fight (creature bank, guarded mine / settlement / pickup).
        // Landing rounds are read WITHOUT trading unless a Trading Post is in
        // reach: "reachable by trade" with no post in sight was a fiction that
        // held the body back (measured: 18 gold, level-7 at 19, income only
        // on odd rounds — the level-7 lands R11 either way, the level-6 was
        // held for nothing).
        const lowerFew = action.purchases.find(
          (purchase) => purchase.kind === "recruit" &&
            coreUnitDefinitions[purchase.unitDefId]?.tier === "gold",
        );
        if (lowerFew && !lowerFewDelaysTopGold(state, observation.playerId, step.cost,
              { gold: spentGold, buildingMaterials: spentMaterials, valuables: spentValuables }) &&
            lowerFewHelpsResourceFight(state, observation.playerId, lowerFew.unitDefId)) {
          return score;
        }
        // Elapsed time does not make spending the level-7 fund sensible.
        // Visible, reachable pickups can finish the fund even when printed
        // production alone cannot. Reconsider after each actual collection.
        if (goldPurchaseReachable(state, observation.playerId, step.cost, 2) ||
            hasAttainableGoldFunding(state, observation.playerId)) {
          return Math.min(score, 240);
        }
        return score;
      }
      const saving =
        step.kind === "recruit" ||
        goldPurchaseReachable(state, observation.playerId, step.cost, 1);
      if (saving) {
        if (development.goldUnits === 0 || (step.kind === "recruit" &&
            (goldPurchaseReachable(state, observation.playerId, step.cost, 2) ||
              hasAttainableGoldFunding(state, observation.playerId)))) {
          // Hold the Population token and treasury for the missing Gold body.
          return Math.min(score, 240);
        }
        if (
          spendDelaysSavedCost(state, observation.playerId, step.cost, {
            gold: spentGold,
            buildingMaterials: spentMaterials,
            valuables: spentValuables,
          })
        ) {
          // A cheaper body that would push the saved Gold step past the next
          // Resource Round waits one round; one that changes nothing flows.
          return Math.min(score, 240);
        }
      }
    }
  }
  if (
    development.phase === "unlock-silver" ||
    development.phase === "unlock-gold"
  ) {
    // A first Silver bought from genuine surplus adds useful combat depth.
    // The shared Silver purchase gate above already protects the saved fund.
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

  // A shared map hex is temporary and END_TURN is illegal there. Always take a
  // legal step onto an unoccupied neighbor before optional economy/card noise;
  // this also prevents an allied AI corridor step from stalling its turn.
  if (
    hero.spaceId &&
    heroesAtSpace(state, hero.spaceId, hero.id).length > 0 &&
    heroesAtSpace(state, action.to, hero.id).length === 0
  ) {
    return 1_050;
  }

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
    const primaryField = state.adventure?.fields[primary.spaceId];
    // Premium detours are budgeted by scorePremiumApproach. A second,
    // unbudgeted multi-source pickup route can consume its combat reserve.
    const scoopable = primaryField && isPremiumEconomyField(primaryField)
      ? []
      : freeThisTurn.filter((objective) => !seen.has(objective.spaceId));
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
  const primaryEconomy = primary && state.adventure?.fields[primary.spaceId];
  const walkThroughVisits = Boolean(primaryEconomy && (isPremiumEconomyField(primaryEconomy) ||
    isOpeningFarSweepField(state, observation.playerId, primaryEconomy)));
  let distance = objectiveDistanceField(state, hero, marchTargets, walkThroughVisits);
  let here = hero.spaceId ? distance.get(hero.spaceId) ?? Infinity : Infinity;
  // ROUTE FALLBACK: the primary objective is chosen with peaceful one-use
  // visits (temple, witch hut, shrine …) treated as passable stops, but the
  // strict march graph above treats them as walls. When that graph has NO
  // route at all from the hero, every step read as "no progress" (260, below
  // END_TURN) and the seat parked. Measured (Necropolis, impossible, seed
  // eval-14): the hero sat still from R7 to R11 with a beatable learning
  // stone four cells away behind a witch hut. Walking onto the visit is the
  // real route — the visit resolves (or is declined) and the march continues.
  if (here === Infinity && !walkThroughVisits && hero.spaceId) {
    distance = objectiveDistanceField(state, hero, marchTargets, true);
    here = distance.get(hero.spaceId) ?? Infinity;
  }
  const to = distance.get(action.to) ?? Infinity;

  // A funded dwelling conversion is a concrete development step. Its march
  // must beat more tile reveals just as opening/trading does once we arrive.
  // A known FAR capture is selected ahead of this market by the primary plan.
  const primaryField = primary && state.adventure?.fields[primary.spaceId];
  const dwellingMarketMarch = Boolean(primaryField &&
    primaryField.location === "trading_post" && primary?.kind === "visitable" &&
    (assessDwellingRush(state, observation.playerId)?.feasible ||
      goldStepMarketPlan(state, observation.playerId)));

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
    return dwellingMarketMarch && arriving.spaceId === primary?.spaceId
      ? 935 : OBJECTIVE_ENTER_SCORE[arriving.kind];
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
    if (dwellingMarketMarch) return 935;
    return OBJECTIVE_PROGRESS_BASE + Math.max(0, 10 - to);
  }
  // Progress toward the PRIMARY through peaceful visit stops. The
  // multi-source field above can be dominated by a free pickup one step away
  // (a temple beside the hero) that another rule then refuses to enter, so
  // every other step read as "no progress" while the primary itself sat a
  // few cells away behind a witch hut — the seat parked for five rounds
  // (Necropolis, impossible, seed eval-14, R7–R11). A step that strictly
  // shortens the visit-passing route to the primary IS a march step.
  if (primary && hero.spaceId && action.to !== primary.spaceId) {
    const towardPrimaryPeaceful = objectiveDistanceField(state, hero, [primary], true);
    const hereP = towardPrimaryPeaceful.get(hero.spaceId) ?? Infinity;
    const toP = towardPrimaryPeaceful.get(action.to) ?? Infinity;
    if (toP < hereP) {
      return OBJECTIVE_PROGRESS_BASE + Math.max(0, 10 - toP);
    }
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
    (adventureVictoryMode(state) !== "conquest" && adventureVictoryMode(state) !== "conquer") ||
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
  // Keep the far-discovery bonus HIGH past the first settlement while the seat
  // still needs a valuables source — the valuables mine that unblocks the gold
  // dwelling may sit on a still-face-down 3rd/4th far tile, so "keep pushing" for
  // more tiles instead of cutting discovery tempo the moment 2 tiles are open.
  const keepPushingForValuables = needsFarValuablesReveal(state, observation.playerId);
  const bonus = (opened < 2 && !hasSettlement) || keepPushingForValuables ? 80 : 45;
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
  score += premiumRotationRouteScore(state, tile, action.rotation, observation.playerId);

  // Stable preference among equal scores (lower rotation when all equal).
  score += (6 - action.rotation) * 0.01;
  return score;
}

/** Score the real path after rotation, including internal walls and guard stops. */
export function premiumRotationRouteScore(
  state: GameState, tile: MapTileState, rotation: number, playerId: PlayerId,
): number {
  if (!state.adventure || (tile.group !== "far" && tile.group !== "near")) return 0;
  const heroId = state.adventure.pendingTileChoice?.heroId;
  const hero = heroId ? state.heroes[heroId] : Object.values(state.heroes).find(
    candidate => candidate.controllerId === playerId && candidate.kind === "main",
  );
  if (!hero?.spaceId) return 0;
  const rotated = { ...tile, rotation, faceDown: false, awaitingRotation: false };
  const adventure = { ...state.adventure, fields: { ...state.adventure.fields },
    tiles: { ...state.adventure.tiles, [tile.id]: rotated } };
  materializeTileFields(adventure, rotated);
  const probe = { ...state, adventure };
  let best = 0;
  for (const field of Object.values(adventure.fields)) {
    if (field.tileInstanceId !== tile.id) continue;
    const premium = isPremiumEconomyField(field);
    const category = locationDefinitions[field.location]?.category;
    if (!premium && field.location !== "mine" && category !== "visitable" && category !== "flaggable" && category !== "town") continue;
    if (isMarketLocation(field.location)) continue;
    const ready = !isFieldGuarded(field) || canBeatGuardedField(probe, hero, field);
    const distance = distanceFromHeroTo(probe, hero, field.spaceId, premium);
    if (distance === undefined) continue;
    const reserve = premiumCombatMovementReserve(probe, hero, field);
    const budget = distance + reserve;
    const captureThisTurn = ready && budget <= hero.movementPoints;
    const captureNextTurn = ready && budget <= heroMovementMax(probe, hero);
    // A clear two-step route with a combat point left beats a pretty entrance
    // that needs a full turn merely to walk to the same mine.
    // Unbeatable rewards still need an accessible return route after army
    // development. They never get the immediate-capture bonus. This is only
    // rotation geometry; the ordinary fight-readiness gate still controls entry.
    best = Math.max(best, (premium ? 300 : field.location === "mine" ? 220 : 160) - distance * 30 +
      (ready ? 45 : 0) +
      (captureThisTurn ? 120 : captureNextTurn ? 65 : 0));
  }
  return best;
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
  // Dwelling rush: a trade that buys a missing dwelling input is either the
  // decisive enabler (feasible surplus) or actively SUPPRESSED (would strip the
  // recruit reserve). This overrides the generic heuristic, which would happily
  // over-trade gold down to zero to complete the dwelling and destroy potential.
  const rush = assessDwellingRush(state, observation.playerId);
  if (rush && rush.inputRateIndices.includes(action.rateIndex)) {
    return rush.feasible ? DWELLING_RUSH_TRADE_SCORE : DWELLING_RUSH_SUPPRESS_SCORE;
  }
  // Gold-recruit completion: the exchanges that make the saved Gold body
  // payable this visit (buy its missing valuable, sell stock it does not need)
  // are decisive, like a feasible dwelling rush. The plan re-evaluates after
  // every trade and disappears once the body is affordable, so this can never
  // over-trade past the purchase.
  const goldStep = goldStepMarketPlan(state, observation.playerId);
  if (goldStep && goldStep.rateIndices.includes(action.rateIndex)) {
    return DWELLING_RUSH_TRADE_SCORE;
  }
  if ((state.round ?? 0) < MARKET_MIN_ROUND) return 180;
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
  if (!goldArmyAllowsBronzePurchase(state, playerId, unitDefId, "recruit")) return -100;
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
      case "REINFORCE_ARMY_UNIT": {
        const unit = state.players[playerId]?.army.find((candidate) => candidate.id === step.armyUnitId);
        const cost = reinforceCostFor(state, playerId, step.armyUnitId, step.halfCost, false, step.roundDown ?? false);
        const paid = eventResourceCostValue(cost ?? undefined) > 0;
        utility += unit && paid && !goldArmyAllowsBronzePurchase(state, playerId, unit.unitDefId, "reinforce") ? -100 : 36;
        break;
      }
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
        utility += hasGoldArmy(state, playerId)
          ? step.recruit ? eventNeutralUnitUtility(state, playerId, step.recruit.unitDefId) : 0
          : army < 6 ? 28 : 12;
        break;
      case "RECRUIT_FACTION_UNIT":
        utility += army < 6 ? 28 : 12;
        break;
      case "USE_LEGION_RECRUIT_DISCOUNT":
        {
          const savings = inlineLegionSavings(state, playerId, step.unitDefId, step.amount);
          utility += savings > 0 ? 50 + savings : -50;
        }
        break;
      case "BANK_RECRUIT_DISCOUNT":
        utility += legionPurchaseSavings(state, playerId, step.amount, step.valuables, step.target) * 8;
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
  isSettlement = false,
): number {
  const deficit = resourceDeficits(state, playerId);
  const player = state.players[playerId];
  // Sandro's paid opening needs cash for the Silver dwelling and Vampire.
  // If existing stock plus the next printed income covers their non-gold
  // inputs, fund that breakthrough with this settlement's Gold income. Later
  // settlements still evaluate the missing valuables for the Gold dwelling.
  if (isSettlement && player?.heroDefId === "sandro" && !hasNecromancyPlan(state, playerId) &&
      !hasReachedSilverArmy(state, playerId)) {
    const profile = armyDevelopmentProfile(state, playerId);
    const dwelling = profile.silverUnlocked ? undefined : factionBuildingForEffect(state, playerId,
      effect => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver");
    const dwellingCost = dwelling ? effectiveTownBuildingCost(state, dwelling) : {};
    const recruit = applyRecruitGoldDiscount(state, playerId, { kind: "recruit", unitDefId: "necropolis.vampires" },
      coreUnitDefinitions["necropolis.vampires"].few!.cost);
    const stocked = (["buildingMaterials", "valuables"] as const).every(key =>
      player.resources[key] + (player.production?.[key] ?? 0) >= (dwellingCost[key] ?? 0) + (recruit[key] ?? 0));
    if (stocked && player.resources.gold < (dwellingCost.gold ?? 0) + (recruit.gold ?? 0) && optionIndex === 0) return 1_290;
  }
  // User ruling 2026-09-15: the far-tile SETTLEMENT bonus is a CHOSEN resource
  // (gold / materials / valuables), and valuables are the Gold-dwelling
  // bottleneck (4 valuables) that otherwise only come from an RNG valuables mine.
  //  - If a valuables MINE is revealed anywhere the seat can take it, that mine
  //    supplies the valuables, so the settlement takes GOLD early (first far,
  //    developing toward the Gold dwelling) — "the first far tile settlement,
  //    still choose gold".
  //  - If NO valuables mine is revealed, the settlement bonus is the only
  //    valuables the seat will get, so take VALUABLES even on the first far —
  //    "if you open both far tiles and see no valuable, choose valuable anyway".
  //    Placing both far tiles first (see place-far-tile) makes this reliable.
  if (isSettlement) {
    const main = Object.values(state.heroes).find(hero =>
      hero.controllerId === playerId && hero.kind === "main");
    const valuablesMineAvailable = Object.values(state.adventure?.fields ?? {}).some(
      (field) => {
        if (field.location !== "mine" || field.resource !== "valuables") return false;
        if (field.flagOwnerId === playerId) return true;
        if (field.flagOwnerId || !main) return false;
        const distance = distanceFromHeroTo(state, main, field.spaceId, true);
        return distance !== undefined && distance + premiumCombatMovementReserve(state, main, field) <=
          heroMovementMax(state, main) * 2 && (!isFieldGuarded(field) || canBeatGuardedField(state, main, field));
      },
    );
    // "See no valuable" is only trustworthy once BOTH far tiles are down: while
    // the seat still HOLDS a placeable far tile, an unrevealed tile could carry
    // the valuables mine, so do NOT jump to valuables early and starve the
    // opening gold — take gold and finish placing/scouting first. Only when all
    // far supply is placed AND no valuables mine exists anywhere does the
    // settlement become the seat's valuables source.
    const allFarTilesPlaced = !seatHoldsFarSupplyTile(state, playerId);
    if (!valuablesMineAvailable && allFarTilesPlaced && deficit.valuables > 0) {
      if (optionIndex === 2) return 1_280;
    } else if (!armyDevelopmentProfile(state, playerId).goldUnlocked) {
      if (optionIndex === 0) return 1_260;
    }
  }
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

/** Optional paid upgrades must leave the missing Gold body's inputs intact. */
function spendsMissingGoldRecruitFund(state: GameState, playerId: PlayerId, cost: ResourceCost | null): boolean {
  const step = nextGoldLadderStep(state, playerId);
  if (!cost || step?.kind !== "recruit" ||
      state.adventure?.pendingNecromancy?.playerId === playerId) return false;
  const resources = state.players[playerId].resources;
  return (["gold", "buildingMaterials", "valuables"] as const).some(resource =>
    (cost[resource] ?? 0) > 0 && resources[resource] - (cost[resource] ?? 0) < (step.cost[resource] ?? 0));
}

function rejectsPaidBronzeSteps(state: GameState, playerId: PlayerId, steps: ReadonlyArray<VisitStep>): boolean {
  return steps.some((step) => {
    if (step.type === "EVENT_NEUTRAL_BUY") return hasGoldArmy(state, playerId) && !goldArmyAllowsBronzePurchase(state, playerId, step.unitDefId, "recruit");
    if (step.type === "RECRUIT_DRAWN_NEUTRAL") return Boolean(hasGoldArmy(state, playerId) && step.recruit &&
      !goldArmyAllowsBronzePurchase(state, playerId, step.recruit.unitDefId, "recruit"));
    if (step.type === "REINFORCE_ARMY_UNIT") {
      const unit = state.players[playerId]?.army.find((candidate) => candidate.id === step.armyUnitId);
      const cost = reinforceCostFor(state, playerId, step.armyUnitId, step.halfCost, false, step.roundDown ?? false);
      return spendsMissingGoldRecruitFund(state, playerId, cost) || Boolean(hasGoldArmy(state, playerId) &&
        unit && eventResourceCostValue(cost ?? undefined) > 0 &&
        !goldArmyAllowsBronzePurchase(state, playerId, unit.unitDefId, "reinforce"));
    }
    if (step.type === "PAY_TO") return rejectsPaidBronzeSteps(state, playerId, step.steps);
    return false;
  });
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
    if (state.adventure?.pendingNecromancy?.playerId === playerId) {
      const reinforce = option.steps.find(inner => inner.type === "REINFORCE_HALF_GOLD");
      if (reinforce?.type === "REINFORCE_HALF_GOLD") {
        const unit = state.players[playerId].army.find(candidate => candidate.id === reinforce.armyUnitId);
        return 1_150 + necromancyUpgradePriority(unit?.unitDefId ?? "") * 5;
      }
    }
    // Optional deck thinning must never delete the engine or its damage spell.
    // Utility's minimum still beats Done, so this needs an explicit refusal.
    if (option.steps.some(inner=>
        inner.type === "REMOVE_CARD_FROM_PILE" && (inner.cardId === "spell.magic_arrow" ||
          (state.players[playerId]?.factionId === "necropolis" &&
            cardLibrary[inner.cardId]?.effect.type === "NECROMANCY_REINFORCE")))) return 1_020;
    if (rejectsPaidBronzeSteps(state, playerId, option.steps)) return 1_020;
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
    if (rejectsPaidBronzeSteps(state, playerId, step.steps)) return 1_020;
    const cost: ResourceCost = step.costOptions[optionIndex] ?? {};
    const goldCost = cost.gold ?? 0;
    const matsCost = cost.buildingMaterials ?? 0;
    const valsCost = cost.valuables ?? 0;
    const gold = playerGold(state, playerId);
    // Cannot leave reserve — prefer decline path (1_050) by scoring lower.
    if (gold - goldCost < GOLD_RESERVE && goldCost > 0) {
      return 1_020;
    }
    // A paid visit never spends the dwelling / Gold-ladder inputs. Measured
    // (Necropolis, impossible, seed eval-6): the Tree of Knowledge offered +2
    // experience for 3 valuables OR 10 gold; the flat cost penalty (5 per
    // valuable, 2 per gold) picked the valuables at R5, and the Gold dwelling
    // slipped from R7 to R9 waiting for them. Materials and valuables below
    // the plan's target (and the whole remaining Gold-ladder valuables need)
    // decline; gold is only pushed toward the other option, since it refills
    // every Resource Round and the reserve floor above still holds.
    const resources = playerResources(state, playerId);
    const planTarget = developmentResourceTargets(state, playerId);
    if (
      (valsCost > 0 && resources.valuables - valsCost <
        Math.max(planTarget.valuables, goldLadderValuablesReserve(state, playerId))) ||
      (matsCost > 0 && resources.buildingMaterials - matsCost < planTarget.buildingMaterials)
    ) {
      return 1_020;
    }
    const followUp = visitStepsUtility(state, playerId, step.steps);
    const costPenalty = goldCost * 2 + matsCost * 3 + valsCost * 5 +
      (goldCost > 0 && gold - goldCost < planTarget.gold ? 12 : 0);
    return 1_100 + Math.max(-30, Math.min(60, Math.round(followUp - costPenalty)));
  }

  // --- Settlement / mine income levels --------------------------------------
  if (step.type === "SETTLEMENT_CHOICE" || step.type === "RESOURCE_GAIN_LEVEL") {
    return resourceIncomeOptionScore(state, playerId, optionIndex, step.type === "SETTLEMENT_CHOICE");
  }

  // --- Magic Spring: return highest-value discard card ----------------------
  if (step.type === "MAGIC_SPRING") {
    const player = state.players[playerId];
    const topThree = player?.discard.slice(-3).reverse() ?? [];
    const cardId = topThree[optionIndex];
    if (!cardId) return 1_050;
    const value = Math.max(0, cardKeepValue(cardId, { state, playerId }));
    return 1_100 + 60 * value / (80 + value);
  }

  // --- Search discard top: take best card -----------------------------------
  if (step.type === "SEARCH_DISCARD") {
    const deck = state.decks[step.deckId];
    const topCards = deck ? deck.discardPile.slice(-step.count).reverse() : [];
    const cardId = topCards[optionIndex];
    if (!cardId) return 1_050;
    const value = Math.max(0, cardKeepValue(cardId, { state, playerId }));
    return 1_100 + 60 * value / (80 + value);
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
    const unit = state.players[playerId]?.army.filter((candidate) => {
      const def = coreUnitDefinitions[candidate.unitDefId];
      return candidate.side === "few" && def?.pack && (def.tier === "bronze" || def.tier === "silver");
    })[optionIndex];
    const cost = unit ? reinforceCostFor(state, playerId, unit.id, false, false, false, 3) : null;
    if (spendsMissingGoldRecruitFund(state, playerId, cost)) return 1_020;
    if (unit && eventResourceCostValue(cost ?? undefined) > 0 &&
        !goldArmyAllowsBronzePurchase(state, playerId, unit.unitDefId, "reinforce")) return 1_020;
    return 1_130 - Math.min(15, optionIndex);
  }

  // --- Tavern: take secondary hero when gold allows (legal set only) --------
  if (step.type === "TAVERN") {
    // The seven-gold visit is the same strategic purchase as the town's hire.
    // It must not bypass the Gold-army and concrete-work gate.
    return secondaryHeroOpportunity(state, playerId).worthwhile ? 1_120 - Math.min(10, optionIndex) : 180;
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
  if ((action.type === "DISCOVER_TILE" || action.type === "PLACE_TILE") &&
      hasCommittedIncomeRoute(state, action.heroId, memory)) {
    // Includes the unconditional FAR-discovery bonus below. When entry needs
    // refreshed MP, keep the combat budget instead of opening another tile.
    return { score: 200, policy: "map.capture-income-before-expansion" };
  }
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
      {
        const unit = state.players[observation.playerId]?.army.find((candidate) => candidate.id === action.armyUnitId);
        const cost = reinforcementDiscountCostFor(state, observation.playerId, action.discountId, action.armyUnitId, action.kind);
        if (spendsMissingGoldRecruitFund(state, observation.playerId, cost)) {
          return { score: 180, policy: "map.save-for-missing-gold-recruit" };
        }
        if (unit && eventResourceCostValue(cost ?? undefined) > 0 &&
            !goldArmyAllowsBronzePurchase(state, observation.playerId, unit.unitDefId, action.kind)) {
          return { score: 180, policy: "map.preserve-premium-army-fund" };
        }
      }
      // Inside the atomic after-combat Necromancy window the bank is USE-IT-OR-
      // LOSE-IT: SKIP_NECROMANCY ("Resolve bonuses and continue", 1_120) expires
      // every offer this window created. At the ordinary 820/760 the AI played
      // its Necromancy card (1_140), banked the half-gold offer and then scored
      // the Resolve above the redeem — throwing the card away every single win.
      // Priced between the two: play every held card first, then redeem, then
      // resolve.
      if (state.adventure?.pendingNecromancy?.playerId === observation.playerId) {
        return {
          score: action.kind === "reinforce" ? 1_135 + necromancyUpgradePriority(
            state.players[observation.playerId].army.find(unit => unit.id === action.armyUnitId)?.unitDefId ?? "") : 1_130,
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
        gold < 10 + GOLD_RESERVE ||
        !secondaryHeroOpportunity(state, observation.playerId, action.fieldId).worthwhile
      ) {
        return { score: 150, policy: "map.hire-secondary-hold" };
      }
      return {
        score: 946,
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
          isHomeTileOpeningObjective(state, hero, objective) &&
          distanceFromHeroTo(state, hero, objective.spaceId) !== undefined,
        )
      ) {
        return { score: 100, policy: "map.finish-home-before-discover" };
      }
      if (
        hero?.spaceId &&
        (state.round ?? 0) <= 3 &&
        tile?.group !== "far" &&
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
        shouldDeferExpansionTile(state, hero, tile)
      ) {
        return { score: 100, policy: "map.discover-high-band-defer" };
      }
      const farGroup =
        tile?.group === "far";
      if (hero && tile && heroReadyForGrowth(state, hero) && tileBandOffersGrowth(hero, tile.group) &&
          primaryMapObjective(state, hero)?.kind === "explore") {
        return { score: 915, policy: "map.discover-experience-band" };
      }
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
          isHomeTileOpeningObjective(state, hero, objective) &&
          distanceFromHeroTo(state, hero, objective.spaceId) !== undefined,
        )
      ) {
        return { score: 100, policy: "map.finish-home-before-place" };
      }
      const objectives = hero ? collectMapObjectives(state, hero) : [];
      // Spend the opening's held supply by rounds 2–3 so settlement income
      // can be chosen with both Far rewards visible. This is a legal placement
      // only: empty supply and sealed geometry never invent an exploration job.
      if (hero?.kind === "main" && state.round >= 2 && state.round <= 3 &&
          seatHoldsFarSupplyTile(state, observation.playerId) &&
          (state.adventure?.farTilesOpenedByPlayer?.[observation.playerId] ?? 0) < 2) {
        return { score: 945, policy: "map.reveal-opening-far-supply" };
      }
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
        !hasFight && seatHoldsFarSupplyTile(state, observation.playerId)
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
      const ordinaryMoveScore = moveScore(observation, action);
      if (ordinaryMoveScore >= 1_000) {
        return { score: ordinaryMoveScore, policy: "map.clear-shared-space" };
      }
      const enterHero = state.heroes[action.heroId];
      const enterField = state.adventure?.fields[action.to];
      const combatReserve = enterHero && enterField
        ? premiumCombatMovementReserve(state, enterHero, enterField) : 0;
      if (enterHero && enterField && isFieldGuarded(enterField) &&
          !(enterHero.spaceId && heroesAtSpace(state, enterHero.spaceId).length > 1) &&
          !gateFieldsLinked(enterHero.spaceId ? state.adventure?.fields[enterHero.spaceId] : undefined, enterField) &&
          combatReserve > 0 &&
          enterHero.movementPoints < 1 + combatReserve) {
        // Preserve the planned paid continuations before entering. Only
        // banks with free continuations and unlimited fights are exempt.
        return { score: 250, policy: "map.save-guard-continuation" };
      }
      const premium = scorePremiumApproach(state, action, memory);
      if (premium && (premium.score <= 300 || ordinaryMoveScore > 300 ||
          premium.policy === "map.premium-pickup-before-next-turn")) {
        const destination = state.adventure?.fields[action.to];
        const enemy = Object.values(state.heroes).some(other =>
          other.spaceId === action.to && !playersAreAllied(state, other.controllerId, observation.playerId),
        );
        if (premium.policy !== "map.premium-pickup-before-next-turn" ||
            (destination && !isFieldGuarded(destination) && !enemy &&
             (!destination.flagOwnerId || playersAreAllied(state, destination.flagOwnerId, observation.playerId) ||
              locationDefinitions[destination.location]?.category === "flaggable"))) return premium;
      }
      if (
        (state.round ?? 0) <= 3 &&
        enterHero?.spaceId &&
        !visitedThisTurn(memory, action.to) &&
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
      if (
        (state.round ?? 0) <= 3 &&
        enterHero?.spaceId &&
        state.adventure?.fields[enterHero.spaceId]?.tileInstanceId ===
          homeTileInstanceId(state, observation.playerId)
      ) {
        const openedTileId = latestPlacedTileId(state, observation.playerId);
        const safeOpenedFields = openedTileId
          ? Object.values(state.adventure.fields)
              .filter((field) =>
                field.tileInstanceId === openedTileId &&
                (!isFieldGuarded(field) || canBeatGuardedField(state, enterHero, field)) &&
                !Object.values(state.heroes).some(
                  (other) =>
                    other.spaceId === field.spaceId &&
                    other.controllerId !== observation.playerId,
                ),
              )
              .map((field) => ({ spaceId: field.spaceId, kind: "explore" as const }))
          : [];
        if (safeOpenedFields.length > 0) {
          const towardOpenedTile = objectiveDistanceField(state, enterHero, safeOpenedFields);
          const hereDistance = towardOpenedTile.get(enterHero.spaceId) ?? Infinity;
          const nextDistance = towardOpenedTile.get(action.to) ?? Infinity;
          if (
            nextDistance < hereDistance &&
            enterField &&
            (!isFieldGuarded(enterField) || canBeatGuardedField(state, enterHero, enterField))
          ) {
            return { score: 929, policy: "map.approach-first-opened-tile" };
          }
        }
      }
      return { score: ordinaryMoveScore, policy: "map.move-to-objective" };
    }
    case "REVISIT_FIELD": {
      // Revisits are optional luxuries — never outrank marching to new land or
      // a real objective (was 690 and pulled heroes back to known sites).
      // Markets use OPEN_MARKET; Trading Post reopenings also cost 1 MP.
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
      // Resource conversion happens only at the Trading Post; a Factory shop
      // cannot serve a dwelling rush (measured open/leave/return loop).
      const dwellingRush = marketLocation === "trading_post" &&
        assessDwellingRush(state, observation.playerId)?.feasible;
      if ((state.round ?? 0) < MARKET_MIN_ROUND && !earlyTentVisit && !dwellingRush) {
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
      if (dwellingRush) {
        return {
          score: DWELLING_RUSH_OPEN_MARKET_SCORE,
          policy: "map.open-market-dwelling-rush",
        };
      }
      // Ranked lesson (latest four through 2026-09-12): the losing Tower seat
      // opened the market three times in round 4, made one trade, and performed
      // no productive map action, while the winner kept fighting, flagging and
      // revealing. A useful but non-urgent conversion must not pin the hero to
      // the shop when its current MP can already reach real board progress.
      if (!earlyTentVisit && hasReachableMapWork(observation, action.heroId)) {
        return { score: 250, policy: "map.leave-market-for-objective" };
      }
      // Trading Post reopenings cost 1 MP. Only open when a useful trade or shop
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
    case "OPEN_WANDERING_MERCHANT":
      // Keep the reminder visible to humans even before they can afford a buy.
      // The computer waits for funds instead of repeatedly opening an empty shop.
      // Open it before ending the turn; the choice policy selects
      // the actual machine (and the purchase then removes this action).
      return {
        score: wanderingMerchantAvailable(state, observation.playerId, true)
          ? 710 + economyFocusBias(memory, "market") : 0,
        policy: "map.open-wandering-merchant",
      };
    case "BUY_WANDERING_MERCHANT":
      return { score: 710 + economyFocusBias(memory, "market"), policy: "map.buy-wandering-merchant" };
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
      const commander = state.players[observation.playerId]?.commander;
      if (!commander) return { score: 0, policy: "commander.missing" };
      const grades = commanderGradesOf(commander);
      const next = { ...grades, [action.stat]: Math.min(3, grades[action.stat] + 1) } as typeof grades;
      const delta = COMMANDER_GRADE_VALUES[action.stat][next[action.stat]] -
        COMMANDER_GRADE_VALUES[action.stat][grades[action.stat]];
      const weight = { attack: 5, damage: 3, defense: 5, health: 3, speed: 2, magic: 6 };
      const combos = commanderUnlockedCombos(next).length - commanderUnlockedCombos(grades).length;
      // Magic I adds immunity/ward despite no Power increase; Defense II adds
      // its defend die despite no printed Defense increase. Free points should
      // be spent before marching into a battle, with learned close-choice ties.
      const ward = action.stat === "magic" && grades.magic === 0 ? 6 : 0;
      const defendDie = action.stat === "defense" && grades.defense === 1 ? 3 : 0;
      return {
        score: 1000 + delta * weight[action.stat] + ward + defendDie + combos * 14,
        policy: "commander.grade-stats-and-combos",
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
      // User ruling (2026-09-15): reviving the commander is a MUST — it is the
      // army's 5th body and, for casters, its once-per-round Command cast. Bring
      // it back as soon as the gold is there, ahead of ordinary map plays (moves
      // and recruits sit ~590-900); only defer when it is genuinely unaffordable.
      if (gold < cost) {
        return { score: 40, policy: "commander.revive-unaffordable" };
      }
      return {
        score: gold - cost >= GOLD_RESERVE ? 985 : 900,
        policy: "commander.revive-must",
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
      // Price this specific action before protecting the next recruit fund.
      // Wisdom discounts the purchase; holding it never makes army money spare.
      const phase = armyDevelopmentProfile(state, observation.playerId).phase;
      const target = developmentResourceTargets(state, observation.playerId);
      const mageGuild = getTownOfPlayer(state, observation.playerId)?.buildings
        .map(id => coreBuildingDefinitions[id])
        .find(building => building?.effect?.type === "MAGE_GUILD");
      const baseCost = freeSpellBookActive(state) ? 0 : (mageGuild?.spellBookCost ?? 5);
      const discount = action.wisdom ? wisdomGoldDiscount(getRuleset(state), action.wisdom.mode,
        houseRuleEnabled(state, "wisdom-expert-discount")) : 0;
      const cost = action.rollSpell ? 3 : Math.max(0, baseCost - discount);
      const needsArrow =
        ![...state.players[observation.playerId].hand,
          ...(state.players[observation.playerId].spellBook ?? [])].includes("spell.magic_arrow");
      const arrowFunded = needsArrow && phase !== "establish-core" && playerGold(state, observation.playerId) - cost >= target.gold;
      const funded = cost === 0 || arrowFunded || (phase === "improve-army" &&
        playerGold(state, observation.playerId) - cost >= target.gold);

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
        return { score: arrowFunded ? 930 : 620, policy: arrowFunded ? "town.seek-magic-arrow" : "town.buy-spells-after-army-core" };
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
      const unit = state.players[observation.playerId]?.army.find(
        (candidate) => candidate.id === action.armyUnitId,
      );
      if (!unit) return { score: 5, policy: "map.drill-unit-missing" };
      const cost = unitDrillGoldCostFor(state, observation.playerId, unit);
      if (cost > 0 && gold - cost < developmentResourceTargets(state, observation.playerId).gold) {
        return { score: 5, policy: "map.drill-preserve-development" };
      }
      const tier = unit ? coreUnitDefinitions[unit.unitDefId]?.tier : undefined;
      const tierNudge =
        tier === "gold" || tier === "azure" ? 18 : tier === "silver" ? 12 : 4;
      // Drill grants one XP: only a card one XP short ranks up immediately.
      // Two XP short is progress, with a smaller value than an actual unlock.
      const rankInfo = unit ? armyUnitRankInfo(unit) : null;
      const toNextRank =
        rankInfo && rankInfo.nextThreshold !== null
          ? rankInfo.nextThreshold - rankInfo.experience
          : null;
      const proximityNudge = toNextRank === 1 ? 40 : toNextRank === 2 ? 10 : 0;
      const movementCost = unitDrillMovementCost(state, observation.playerId, unit) ?? 0;
      return {
        score: 325 + tierNudge + proximityNudge - movementCost * 20,
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
