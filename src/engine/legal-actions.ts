import { cardLibrary } from "@/data/cards/library";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import { hasToken as unitHasToken } from "./tokens";
import { moraleCardsRuleEnabled } from "./morale-cards";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  factoryGoldUnitConflict,
  isPlayableFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { isMarketLocation, locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { sampleBuildings } from "@/data/towns/buildings";
import {
  adventurePvpTroopLoss,
  applyRecruitGoldDiscount,
  armyHasMapEffect,
  canDigGrail,
  canUseAstrologersHeroEmpower,
  canHeroReachPlacedTile,
  capturableEnemyMinesWithin,
  farTilePlacementCenters,
  freeSpellBookActive,
  legionDiscountTargets,
  playerHasPlaceableFarTile,
  reinforcementDiscountCostFor,
  reinforceCostFor,
  getActiveAstrologersCard,
  getMainHero,
  getSecondaryHero,
  getTownOfPlayer,
  getUnitSide,
  hasRecruitResources,
  hasResources as playerHasResources,
  humanPlayerIds,
  isSeaField,
  NEUTRAL_DECK_IDS,
  obeliskRoleIsMonolith,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  currentSurrenderGoldCost,
  tournamentMoraleSearchAgainEnabled,
  townHasBuildingEffect,
  unlockedRecruitTiers,
  drillableArmyUnits,
  unitDrillAvailable,
  heroHasFreeGateStep
} from "./adventure";
import { DRILL_UNIT_GOLD_COST } from "@/data/units/experience";
import {
  placementCellsFor,
  neutralFormationCellsFor,
  commanderDeploymentCellsFor,
  neutralFormationCellsForGuard,
  neutralPlacementIsManual,
  canMulliganStartingHand,
  getHeroMoveDestinations,
  inCombatPrep,
  isDefendingOwnFactionTown,
  isHerolessMineDefender,
  isMapPowerTierSpell,
  dimensionDoorDestinations,
  townPortalDestinations,
  canHeroDiscoverAdjacentTile,
  isTileRotationConnected,
  TILE_ROTATION_SEAL_GATE_ENABLED,
  observatoryPlacementCenters,
  observatoryRevealTargets,
  removableHandCards
} from "./adventure-reducer";
import {
  effectAppliesToUnit,
  effectiveInitiative,
  getSchoolPowerBonus,
  getSchoolPowerMultiplier,
  getSpellCastRestriction,
  playerCannotSurrenderCombat,
  playerHasSpellTimingFreedom,
  unitAttackRollDisadvantaged,
  unitImmuneToSpellSchoolsByEffect,
  unitIsBerserk
} from "./active-effects";
import {
  cancelSpellAllowsSchoolAndLevel,
  cardCanBoostPower,
  getEffectiveCardEffect,
  heroMovementGrantOption,
  spellMinUsefulPower,
  spellPowerValueOfCard
} from "./effects";
import { commanderReviveCost } from "@/data/commanders";
import {
  commandersModuleEnabled,
  commanderCastAvailable,
  commanderCastOf,
  commanderCastPower,
  commanderCastRuneCost,
  commanderDefenseReactionUnit,
  commanderGradeUpChoices,
  commanderStandsInCurrentCombat,
  commanderUnitId
} from "./commanders";
import { RUNE_MAX } from "./runes";
import {
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getOrthogonalNeighbors,
  getReachableDestinations,
  isAdjacent,
  isBattlefieldPosition
} from "./battlefield";
import {
  countBallistas,
  firstAidVolleyHeals,
  getPermanentCardIds,
  getPermanentSchoolBonus,
  permanentCrackOpenGain,
  permanentSpellPowerBonus,
  playerCanUseFirstAidVolley,
  schoolScopedStandingPower,
  warMachinesForSale
} from "./permanents";
import { cultivationSpellPowerBonus, tribulationAvailable } from "./anime-cultivation";
import {
  heroGradeSpellPowerBonus,
  heroGradePickableNodes,
  heroGradeNodesOf,
  heroSkillAvailableThisCombat,
  heroSkillAvailableThisRound,
  heroTrainAvailable,
  playerMainHeroInCombat
} from "./anime-hero-grades";
import {
  equipmentEnabled,
  equipmentFirstSpellPowerBonus,
  equipmentSpellPowerBonus
} from "./anime-equipment";
import { getEquipmentDefinition } from "@/data/anime/equipment";
import { HERO_GRADE_NODES } from "@/data/anime/hero-grades";
import { getDemolishAbility, isArrowTowerUnit, parseFortificationTargetId, siegeBlockedPositions } from "./siege";
import {
  manualGuardControllerId,
  neutralCombatControllerId,
  neutralControlMustAttack,
  pvpNeutralControllerId
} from "./neutral-control";
import {
  hasOpenAdventureTurn,
  isParallelActor,
  isRoundStartEventBarrierActive,
  parallelInteractionBlocker,
  roundStartEventResolver
} from "./parallel-turns";
import { pvpEscapeWindowOpen } from "./combat-units";
import { canPlaceTransformOn } from "./unit-transforms";
import { bannableHeroesForSeat, DRAFT_FORMAT_LABELS, getDraftPhase, getScenario } from "./adventure-setup";
import {
  combatHasHumanParticipant,
  controllerOf,
  humanPlayerIdsByController,
  isComputerPlayer,
  sessionModeOf,
} from "./computer/control";
import { computerDecisionOwner } from "./computer/window";
import { SHARED_DECK_IDS } from "./decks";
import {
  CAST_A_SPELL_CARD_ID,
  isCastASpellCard,
  polishSpellBookEnabled
} from "./polish-spell-book";
import {
  abilityExpertIsCrownFree,
  activeSchoolFetches,
  canPlayExpertMode,
  deckDisplayName,
  discardPickAllowedInCombat,
  instantSideAllowedInCombat,
  matchingSchoolFetchForCast,
  expertUsesAvailable,
  getRuleset,
  spellBookPowerAvailable,
  spellBookRuleEnabled,
  spellCanEnterSpellBook,
  spellLimitFor,
  SPELL_DECK_BASIC,
  SPELL_DECK_EXPERT,
  wisdomGoldDiscount,
  wisdomSearchCount
} from "./ruleset";
import { armyUnitStacksActive, houseRuleEnabled } from "./house-rules";
import {
  polishArmyUnitCanBuyStack,
  polishArmyUnitStackCost,
  polishUnitStackCap
} from "./polish-unit-stacks";
import type {
  AttackRerollSource,
  AttackRollMode,
  ActiveEffectState,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
  CardId,
  CardOptionDefinition,
  CardPlayCost,
  CardPlayMode,
  CardLibrary,
  CombatState,
  CombatUnitState,
  EffectDefinition,
  FactionId,
  GameAction,
  GameEvent,
  GameState,
  HeroState,
  LegalAction,
  PlayerId,
  PlayerState,
  ResolutionStackItem,
  ResourceCost,
  ResourceKind,
  SpellSchool,
  TargetDefinition,
  TargetRef,
  TownId,
  TriggerDefinition,
  UnitId
} from "./state";
import { NEUTRAL_PLAYER_ID, UNOPENED_FAR_TILE } from "./state";
import {
  getActivationSpellPowerBoost,
  getAstrologersRoundFrenzy,
  getDiscardToIgnoreAttackDieAbility,
  getEnemySpellPowerReduction,
  getLethalSaveUnitAbility,
  getSpendCubeAttackAgain,
  getSplashAllocationAttack,
  getUnitAbilityDefinitions,
  hasBindAdjacentEnemies,
  hasInnateMagicMirror,
  hasSpellCastLock,
  hasSpellCastPowerTax,
  hasUnitAbilityEffect,
  moraleLockedForPlayer,
  unitHasAttackRollAdvantage,
  unitImmuneToSpellSchools
} from "./unit-abilities";

type ConcreteEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;

/**
 * One playable face of a card: regular cards expose a single variant, while
 * "OR" cards expose one variant per printed option.
 */
type CardPlayVariant = {
  trigger?: TriggerDefinition;
  effect: ConcreteEffect;
  optionIndex?: number;
  optionLabel?: string;
  /** Printed extra price (discard/remove cards) of this option. */
  cost?: CardPlayCost;
  /** Option only playable outside combat. */
  mapOnly?: boolean;
  /** Option only playable during combat. */
  combatOnly?: boolean;
  /** Option is the card's expert side (costs a crown). */
  expertOnly?: boolean;
};

export function getCardPlayVariants(card: CardDefinition): CardPlayVariant[] {
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.map((option, optionIndex) => ({
      trigger: option.trigger,
      effect: option.effect,
      optionIndex,
      optionLabel: option.label,
      cost: option.cost,
      mapOnly: option.mapOnly,
      combatOnly: option.combatOnly,
      expertOnly: option.expertOnly
    }));
  }

  return [
    {
      trigger: card.trigger,
      effect: card.effect
    }
  ];
}

/**
 * The "free" spell Power a player brings to a spell from standing sources this
 * turn/round — the once-per-turn Astrologers bonus, the once-per-round active
 * unit (Magi) boost, and a School-of-Magic permanent's basic bonus for the
 * spell's school. Mirrors what `castSpell` seeds onto a freshly cast spell, so
 * a spell played as an instant/reaction (Slayer, Sorrow…) or a Power-value cost
 * (Sorrow's silver/gold) counts the same standing Power a normal cast would.
 */
export function standingSpellPower(state: GameState, playerId: PlayerId, card: CardDefinition): number {
  const player = state.players[playerId];
  // Hero specialties that pay or scale by Power (Deemer's Meteor Shower, the
  // Alamar/Jeddite lethal-saves) draw standing spell Power too — per the wiki
  // their effect "scales directly with spell power, similar to standard spells" /
  // "can be improved by spell power, just like a regular spell". But a Specialty
  // belongs to NO school of magic, so the ONLY standing source it can pick up is
  // the flat, school-agnostic Pandora-style bonus (permanentSpellPowerBonus,
  // below). Everything school-scoped is excluded for a Specialty:
  //   - School-of-Magic permanent — getPermanentSchoolBonus returns null for any
  //     non-Spell card, so it adds nothing here;
  //   - the Magi pack's first-cast boost and Astrologers' first-spell bonus — both
  //     gated to `card.kind === "spell"` below (also avoids double-dipping a
  //     once-per-spell-cast bonus, since a Specialty never increments the spell
  //     counters);
  //   - the Elemental Orbs' school multiplier and the Tomes' SET_SPELL_POWER_MAX
  //     never reach this function at all — they live only in the CAST_SPELL power
  //     pipeline (getCurrentSpellPower / the cast boost window).
  if (!player || (card.kind !== "spell" && card.kind !== "hero-specialty")) {
    return 0;
  }
  let bonus = 0;
  if (card.kind === "spell" && (player.combatStats.spellsCastThisTurn ?? 0) === 0) {
    const astrologers = getActiveAstrologersCard(state);
    if (astrologers?.effect.type === "FIRST_SPELL_POWER_BONUS") {
      bonus += astrologers.effect.amount;
    }
  }
  if (card.kind === "spell" && (player.combatStats.spellsCastThisRound ?? 0) === 0) {
    const combat = state.combat;
    const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
    if (activeUnit && activeUnit.controllerId === playerId) {
      // Pass the card's schools so the school-scoped Conflux Pack Elemental boost
      // ("+1 Power to the first <School> Magic spell") is counted for a matching
      // spell — not only the Magi's school-less boost. Without the schools the
      // preview/affordability/pool-scaling paths silently dropped it, disagreeing
      // with the actual cast in performSpellCast.
      bonus += getActivationSpellPowerBoost(activeUnit, card.spellSchools);
    }
  }
  // School-of-Magic permanent basic + Conflux Elemental-tile +1 for the spell's
  // school. Magic Arrow auto-picks the single strongest school (wiki: one school
  // at a time) so Water Magic does not stack with a Fire elemental tile.
  if (card.kind === "spell") {
    bonus += schoolScopedStandingPower(state, playerId, card);
  }
  // Astrologers Blue Sky / Scorched Ground: "all Spells from the X Magic
  // Schools are cast at +1 Power". A matching-school spell played as an
  // instant/reaction (Bloodlust/Curse into an attack window, Sorrow's Power
  // cost) is still a spell being cast, so the proclamation counts here exactly
  // as it does for a normal cast (astrologersSchoolPowerBonusFor inside
  // resolvedSpellPowerForStackItem). Always-on while the card is face up —
  // like the School-of-Magic basic bonus above, never gated on the
  // first-spell counters. `kind === "spell"` keeps it off Specialties, which
  // belong to no school.
  if (card.kind === "spell") {
    bonus += astrologersSchoolPowerBonusFor(state, card);
  }
  // Pandora's Bargain: Power — a flat +Power on every spell while in play.
  bonus += permanentSpellPowerBonus(state, playerId);
  // Anime Cultivation Nascent Soul (realm 3, §5.6): +1 Power on the player's
  // spell casts. Folded here beside the Pandora flat bonus — the single standing
  // chokepoint — so a Power-scaling Specialty picks it up too (like Pandora),
  // and it agrees with the cast pipeline (resolvedSpellPowerForStackItem below).
  bonus += cultivationSpellPowerBonus(state, playerId);
  // Anime Hero Grades Arcane Insight (tier 3, §3.11): +1 Power, folded at the
  // same standing chokepoint so it stacks with Cultivation / Pandora and a
  // Power-scaling Specialty picks it up too.
  bonus += heroGradeSpellPowerBonus(state, playerId);
  // Anime Equipment Cosmos Pendant (§3.13): +1 Power, folded at the same
  // standing chokepoint so it STACKS observably with Cultivation Nascent Soul
  // and the Arcane Insight grade (a caster with all three casts three tiers up).
  bonus += equipmentSpellPowerBonus(state, playerId);
  // Neon Microphone: first Spell each combat +1 Power (spell cards only).
  if (card.kind === "spell") {
    bonus += equipmentFirstSpellPowerBonus(state, playerId);
  }
  return bonus;
}

/**
 * +Power banked on the MAP by a Sorcery / Scales-of-the-Greater-Basilisk-style
 * "+Power, then draw" rider (player.mapSpellPowerBank), available to pay a map
 * Spell's Power cost. Zero inside combat (the combat bank is the separate
 * combatStats.pendingDrawRiderSpellPower, folded in performSpellCast) so a
 * map-banked value can never leak into a combat cast.
 */
export function mapSpellPowerBankAvailable(state: GameState, playerId: PlayerId): number {
  if (state.combat) {
    return 0;
  }
  return state.players[playerId]?.mapSpellPowerBank ?? 0;
}

/**
 * Whether the player can pay an option's card cost from hand right now.
 *
 * Spell Book (house rule): one stashed Book Spell may count toward a value /
 * discard Power cost (the same once-per-turn budget as the "+1 Power" discard).
 * Any Spell works — map Spells like Fly, combat Spells, reaction Spells — so a
 * Book-stashed Fly can pay Magic Mirror / Sorrow / View Air / a lethal save.
 * Without this a silver/gold cost was unaffordable whenever the missing Power
 * sat in the Book instead of the hand.
 */
function canAffordCardCost(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  cost?: CardPlayCost
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  // Resource price (Ballistics' expert bombardment): the player must hold it.
  if (cost?.resources && !hasResources(player.resources, cost.resources)) {
    return false;
  }

  if (
    !cost ||
    (cost.discardCards === undefined && cost.discardCardsUpTo === undefined && cost.powerCost === undefined)
  ) {
    return true;
  }

  // Polish Crown of Dragontooth (option B): owned Spells never sit in hand in
  // this mode, so its printed "remove 1 Spell" cost is paid from either side
  // of the Book. This is a real removal/replacement, not the old Spell Book's
  // once-per-turn Power burn, and a Cast-a-Spell enabler is not an owned Spell.
  if (
    polishSpellBookEnabled(state) &&
    cardId === "artifact.crown_of_dragontooth" &&
    cost.costCardFilter === "spell" &&
    cost.removeCostCards
  ) {
    return [...(player.spellBook ?? []), ...(player.spellBookUsed ?? [])].some(
      (id) => cardLibrary[id]?.kind === "spell" && !isCastASpellCard(id)
    );
  }

  // The played card itself cannot pay its own cost (hand or Book).
  const rest = [...player.hand];
  const selfIndex = rest.indexOf(cardId);
  if (selfIndex !== -1) {
    rest.splice(selfIndex, 1);
  }

  const passesFilter = (id: CardId) =>
    cost.costCardFilter === "spell"
      ? cardLibrary[id]?.kind === "spell"
      : cost.costCardFilter === "power-source"
        ? cardCanBoostPower(cardLibrary[id])
        : true;

  const eligible = rest.filter(passesFilter);

  // Spell Book (house rule): one usable Book Spell may pay for Power, capped at
  // the once-per-turn Book Power budget. A Book Spell is always a valid power
  // source (a Spell counts as +1), and never the very card being played.
  const bookPowerSourceId =
    spellBookRuleEnabled(state) && spellBookPowerAvailable(player)
      ? (player.spellBook ?? []).find((id) => id !== cardId && passesFilter(id)) ?? null
      : null;

  // Power-value cost (Sorrow, Alamar's Resurrection, map View Air / Dimension
  // Door tiers): the standing spell Power plus the full printed Power of every
  // eligible power-source card in hand must reach the threshold. Crowns let
  // Power statistics use their expertAmount when checking affordability — on the
  // map (PLAY_CARD) AND in combat (the reaction path). The actual crown spend is
  // chosen at payment via costCardModes.
  if (cost.powerCost !== undefined) {
    const card = cardLibrary[cardId];
    const schools = card?.spellSchools ?? [];
    // The map draw-rider bank (Sorcery / Scales) counts toward a map Spell's
    // Power exactly like standing Power, so a banked +1 makes a higher tier
    // affordable with one fewer discard. Zero in combat (guarded in the helper).
    const standing =
      (card ? standingSpellPower(state, playerId, card) + getSchoolPowerBonus(state, playerId, card) : 0) +
      mapSpellPowerBankAvailable(state, playerId);
    const crownsLeft =
      player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound;
    // Greedy: assign available crowns to the sources that gain the most from
    // expert valuation, so one Expert Power (+2) alone can afford a Power-2 tier.
    const valued = eligible.map((id) => {
      const basic = spellPowerValueOfCard(cardLibrary[id], schools, "basic");
      const expert = spellPowerValueOfCard(cardLibrary[id], schools, "expert");
      return { basic, expertGain: Math.max(0, expert - basic) };
    });
    if (!state.combat && card) {
      const school = getPermanentSchoolBonus(state, playerId, card);
      if (school) {
        valued.push({
          basic: 0,
          expertGain: Math.max(0, school.expertPower - school.basicPower)
        });
      }
      const matches = (schoolName: "air" | "earth" | "fire" | "water") =>
        schools.includes(schoolName) || schools.includes("any");
      if (activeSchoolFetches(state, playerId).some(matches)) {
        valued.push({ basic: 0, expertGain: 3 });
      }
      // Polish Spell Book: the map boost window offers a SPARE "Cast a Spell"
      // for its printed +1 Power (cardCanBoostPower deliberately hides it from
      // the generic power-source filter, so the hand scan above misses it).
      // Scoped to a BOOK cast — the only Polish play that opens that window —
      // and one copy is consumed as the cast's own enabler, so only the rest
      // add Power. Without this a Book Spell whose only useful tier needs +1
      // was hidden from the offer list even though the window could pay it.
      if (polishSpellBookEnabled(state) && (player.spellBook ?? []).includes(cardId)) {
        const spare = rest.filter((id) => isCastASpellCard(id)).length - 1;
        for (let index = 0; index < spare; index += 1) {
          valued.push({ basic: 1, expertGain: 0 });
        }
      }
    }
    valued.sort((a, b) => b.expertGain - a.expertGain);
    let crowns = crownsLeft;
    let fromCards = 0;
    for (const entry of valued) {
      if (crowns > 0 && entry.expertGain > 0) {
        fromCards += entry.basic + entry.expertGain;
        crowns -= 1;
      } else {
        fromCards += entry.basic;
      }
    }
    const fromBook = bookPowerSourceId ? spellPowerValueOfCard(cardLibrary[bookPowerSourceId], schools) : 0;
    return standing + fromCards + fromBook >= cost.powerCost;
  }

  const needed = cost.discardCards ?? 0;
  return eligible.length + (bookPowerSourceId ? 1 : 0) >= needed;
}

/** Grade ordering shared by spell-immunity and Magic Mirror grade gates. */
export function gradeRank(grade: CombatUnitState["grade"]): number {
  return grade === "bronze" ? 0 : grade === "silver" ? 1 : grade === "gold" ? 2 : 3;
}

/**
 * Tier-gate rank of a UNIT (mirrors the reducer): a Creature Bank defender has
 * NO tier (rulebook p.66) — and a WOG commander is likewise tierless in play —
 * so both rank above every grade and fail every tier-specific spell/specialty
 * gate; neither can ever be such an effect's target.
 */
function gradeRankOfUnit(unit: CombatUnitState): number {
  return unit.bankUnit || unit.commanderSlug ? Number.POSITIVE_INFINITY : gradeRank(unit.grade);
}

/**
 * Whether a card effect (or option effect) gates its target by tier — it carries
 * a `grade` ceiling or a `gradeByPower` ladder. Such an effect can never reach a
 * gradeless Creature Bank defender, so those are dropped from its target list.
 */
function effectIsTierGated(effect: EffectDefinition): boolean {
  return (
    ("gradeByPower" in effect && effect.gradeByPower !== undefined) ||
    ("grade" in effect && effect.grade !== undefined)
  );
}

/**
 * The highest grade a tier-gated effect's ladder can EVER reach, independent of
 * the Power paid — its grade ceiling. No spell ladder climbs above "gold", so an
 * azure-tier unit (gradeRank 3) sits above every ceiling and can never be
 * affected by a tier-gated spell whatever Power is poured in.
 */
function maxTierGateRank(effect: EffectDefinition): number {
  if ("gradeByPower" in effect && effect.gradeByPower) {
    const ranks = Object.values(effect.gradeByPower).map((grade) => gradeRank(grade));
    return ranks.length > 0 ? Math.max(...ranks) : gradeRank("gold");
  }
  if ("grade" in effect && effect.grade !== undefined) {
    return gradeRank(effect.grade);
  }
  return gradeRank("gold");
}

/**
 * Orb of Vulnerability (option A): while its combat-wide effect is on the
 * table, every unit's innate spell-related ability is switched off. Read at
 * each such ability's site so a single grant covers both armies for the Combat.
 */
export function spellAbilitiesSuppressed(state: GameState): boolean {
  return state.activeEffects.some((effect) =>
    effect.modifiers.some((modifier) => modifier.type === "SUPPRESS_SPELL_ABILITIES")
  );
}

/** Whether a unit currently has spell immunity covering its grade. */
export function isUnitSpellImmune(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      // A Gargoyle/Titan that ignores ongoing (Spell) effects ignores an
      // Anti-Magic placed on it too, so it is not made spell-immune by it.
      effectAppliesToUnit(effect, unit) &&
      effect.target?.type === "unit" &&
      effect.target.unitId === unit.id &&
      effect.modifiers.some(
        (modifier) => modifier.type === "UNIT_SPELL_IMMUNE" && gradeRank(unit.grade) <= gradeRank(modifier.maxGrade)
      )
  );
}

/**
 * Whether `unit` is blocked from receiving this Spell card's effects — printed
 * school immunity (Black Dragons Pack / Azure / Oceanids Pack / …), Anti-Magic,
 * and artifact-granted school immunity. Shared by cast targeting, attack-window
 * reactions (Bless / Curse / Weakness / …), Sorrow, and Magic Mirror redirects
 * so "immune to Spells" means every Spell path, not only CAST_SPELL picks.
 * Orb of Vulnerability lifts only printed innate school immunity.
 */
export function unitBlockedBySpellCard(
  state: GameState,
  unit: CombatUnitState,
  card: Pick<CardDefinition, "kind" | "spellSchools">
): boolean {
  if (card.kind !== "spell") {
    return false;
  }
  if (isUnitSpellImmune(state, unit)) {
    return true;
  }
  if (unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools)) {
    return true;
  }
  return !spellAbilitiesSuppressed(state) && unitImmuneToSpellSchools(unit, card.spellSchools);
}

/**
 * The combat unit a Spell reaction's effect lands on during an open attack.
 * Attack-stat / die / strike buffs hit the attacker; defense changes hit the
 * defender. Null when the effect has no single unit recipient (Power, draws…).
 * Used by offer gates, apply backstops, and CARD_PLAYED FX anchoring.
 */
export function spellReactionAffectedUnitId(
  effect: ConcreteEffect,
  attackerId: UnitId,
  defenderId: UnitId
): UnitId | null {
  switch (effect.type) {
    case "ADD_COMBAT_STAT":
      return effect.stat === "attack" ? attackerId : defenderId;
    case "IGNORE_ATTACK_DIE":
    case "NEGATE_ATTACK":
    case "SLAYER_ATTACK":
    case "IGNORE_DEFENSE":
    case "FORCE_ATTACK_ROLL":
    case "TRIPLE_ATTACK_DIE":
      return attackerId;
    case "REDUCE_RETALIATION_DAMAGE":
      return defenderId;
    default:
      return null;
  }
}

/**
 * True when this Spell card's reaction would land on a unit immune to it.
 * Covers attack-window instants and Sorrow's activation skip.
 */
export function spellReactionBlockedByImmunity(
  state: GameState,
  card: Pick<CardDefinition, "kind" | "spellSchools">,
  effect: ConcreteEffect,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>
): boolean {
  if (card.kind !== "spell" || !state.combat) {
    return false;
  }
  let unitId: UnitId | null = null;
  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    unitId = spellReactionAffectedUnitId(effect, triggerEvent.attackerId, triggerEvent.defenderId);
  } else if (triggerEvent.type === "UNIT_ACTIVATION_STARTED" && effect.type === "SKIP_ACTIVATION") {
    unitId = triggerEvent.unitId;
  }
  if (!unitId) {
    return false;
  }
  const unit = state.combat.units[unitId];
  return Boolean(unit && unitBlockedBySpellCard(state, unit, card));
}

/**
 * Magic Mirror: legal new targets for a pending Spell when redirecting it.
 * Any unit of the paid grade or lower (Power 0 → bronze, 1 → silver, 2 → gold),
 * friend or foe, except the unit currently targeted, and never a unit immune to
 * that Spell (Anti-Magic, printed school immunity, artifact school immunity).
 */
export function spellRedirectTargets(
  state: GameState,
  currentTargetUnitId: UnitId | null,
  maxGrade: CombatUnitState["grade"],
  spellCard?: Pick<CardDefinition, "kind" | "spellSchools">
): CombatUnitState[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  // When the reflected card is unknown, treat the redirect as "any Spell" so
  // full-school-immune units (Black/Azure Dragons, Oceanids Pack, …) still drop
  // out; partial elemental immunities need the real card's schools at the call site.
  const reflected: Pick<CardDefinition, "kind" | "spellSchools"> = spellCard ?? {
    kind: "spell",
    spellSchools: ["any", "air", "earth", "fire", "water"]
  };
  return Object.values(combat.units).filter(
    (unit) =>
      // `currentTargetUnitId` is null for a space-targeted blast (Inferno), where
      // there is no single "current" unit to exclude — every legal unit qualifies.
      unit.id !== currentTargetUnitId &&
      isUnitAlive(unit) &&
      gradeRank(unit.grade) <= gradeRank(maxGrade) &&
      !unitBlockedBySpellCard(state, unit, reflected)
  );
}

/** Living units standing on any of `positions`. */
function unitsOnPositions(combat: CombatState, positions: Set<number>): UnitId[] {
  return Object.values(combat.units)
    .filter((unit) => isUnitAlive(unit) && positions.has(unit.position))
    .map((unit) => unit.id);
}

/**
 * The units an in-flight area Spell would (or could) damage — the set Magic
 * Mirror reads to decide whether one of your units "is about to be damaged".
 * Computed from the pending cast on the stack, BEFORE the dice are rolled:
 *  - Inferno (space target): every unit on the centre space and its orthogonal
 *    neighbours (all are hit on a "+1").
 *  - Fireball (unit target, AREA_DAMAGE_ADJACENT): the primary target plus every
 *    unit adjacent to it — the caster picks one of those adjacents as the splash,
 *    so any of them is a potential victim while the cast is pending.
 *  - Frost Ring (space target, AREA_DAMAGE_PICK_ADJACENT): the units adjacent to
 *    the centre — plus the centre unit when the ring includes it — friend or foe.
 * Only a Spell CAST qualifies: a hero specialty reusing an area effect (Deemer's
 * Meteor Shower, Xyron's Inferno) is never a Spell, so it is never reflectable.
 * Single-target casts have no splash and return [] (their primary is handled by
 * pendingSpellTargetForPlayer). Chain Lightning's forks are routed at resolution
 * and are intentionally not predicted here.
 */
export function spellPotentialBlastUnitIds(
  state: GameState,
  stackItem: ResolutionStackItem,
  cards: CardLibrary = cardLibrary
): UnitId[] {
  const combat = state.combat;
  if (!combat || stackItem.action.type !== "CAST_SPELL") {
    return [];
  }
  const card = cards[stackItem.action.cardId];
  if (card?.kind !== "spell") {
    return [];
  }
  const effect = card.effect;
  const target = stackItem.action.target;

  // Inferno: the centre space and all orthogonal neighbours.
  if (effect.type === "INFERNO" && target.type === "space") {
    return unitsOnPositions(combat, new Set([target.position, ...getOrthogonalNeighbors(target.position)]));
  }

  // Fireball: the primary unit plus every unit adjacent to it (the caster picks
  // one adjacent as the splash, so all of them are potential victims).
  if (effect.type === "AREA_DAMAGE_ADJACENT" && target.type === "unit") {
    const primary = combat.units[target.unitId];
    if (!primary) {
      return [];
    }
    return Object.values(combat.units)
      .filter(
        (unit) => isUnitAlive(unit) && (unit.id === primary.id || isAdjacent(unit.position, primary.position))
      )
      .map((unit) => unit.id);
  }

  // Frost Ring (and any AREA_DAMAGE_PICK_ADJACENT cast): the centre's orthogonal
  // neighbours, and the centre unit itself only when the effect includes it.
  if (effect.type === "AREA_DAMAGE_PICK_ADJACENT") {
    const centre =
      target.type === "space"
        ? target.position
        : target.type === "unit"
          ? combat.units[target.unitId]?.position
          : undefined;
    if (centre === undefined) {
      return [];
    }
    const blast = new Set<number>(getOrthogonalNeighbors(centre));
    if (effect.includeCenter) {
      blast.add(centre);
    }
    return unitsOnPositions(combat, blast);
  }

  return [];
}

/**
 * An enemy instant combat Spell layered onto the pending attack that lands on a
 * unit `playerId` controls — the case Magic Mirror reflects in an attack window.
 * Only stat instants qualify: Curse (−defense, lands on the defender) and
 * Weakness (−attack, lands on the attacker). Bloodlust/Bless/Precision buff the
 * caster's OWN unit, so their affected unit is never yours; Bless/Slayer are not
 * even ADD_COMBAT_STAT (no single stat to bounce). Returns the most recent match
 * (the one Resistance would also take first), with its index for splicing.
 */
export function reflectableAttackInstantForPlayer(
  state: GameState,
  stackItem: ResolutionStackItem,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): { index: number; cardId: CardId; stat: "attack" | "defense"; affectedUnitId: UnitId } | null {
  if (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT") {
    return null;
  }
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  const attacker = combat.units[stackItem.action.attackerId];
  const defender = combat.units[stackItem.action.defenderId];
  const instants = stackItem.modifiers.cancellableSpellInstants ?? [];

  for (let index = instants.length - 1; index >= 0; index -= 1) {
    const entry = instants[index];
    // Only an enemy's Spell can be reflected — never your own buff.
    if (entry.playerId === playerId) {
      continue;
    }
    const effect = cards[entry.cardId]?.effect;
    if (!effect || effect.type !== "ADD_COMBAT_STAT") {
      continue;
    }
    const affected = effect.stat === "attack" ? attacker : defender;
    if (!affected || affected.controllerId !== playerId || !isUnitAlive(affected)) {
      continue;
    }
    return { index, cardId: entry.cardId, stat: effect.stat, affectedUnitId: affected.id };
  }
  return null;
}

/**
 * The unit a pending SPELL_CAST_STARTED is currently aimed at, when that unit
 * belongs to `playerId` — i.e. when Magic Mirror's "your unit is about to be
 * targeted by a spell" condition holds for that player. Reads the live stack
 * item so a chain of redirects keys off the current target, not the original.
 */
export function pendingSpellTargetForPlayer(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>,
  playerId: PlayerId
): CombatUnitState | null {
  const stackItem = state.stack.find((item) => item.triggerEventIds.includes(triggerEvent.id));
  if (!stackItem || stackItem.action.type !== "CAST_SPELL" || stackItem.action.target.type !== "unit") {
    return null;
  }
  const targetUnit = state.combat?.units[stackItem.action.target.unitId];
  return targetUnit && targetUnit.controllerId === playerId ? targetUnit : null;
}

export function isUnitAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

// isAdjacent moved to battlefield.ts (dependency-free) so active-effects and
// the permanents module can share it without import cycles.
export { isAdjacent } from "./battlefield";

/**
 * Printed movement values: ground and flying units move up to 3 spaces,
 * ranged units up to 1 space (after shooting or instead of attacking).
 */
export function getUnitMoveRange(unit: CombatUnitState, state?: GameState): number {
  const base = unit.type === "ranged" ? 1 : 3;

  // House rule ("combat-move-initiative"): Haste / Slow (and the initiative-buff
  // hero specialties — Cyra, Catherine VI, …) also shift Combat movement by ±1
  // (MOVEMENT_BONUS), the Battlefield-Expansion reading. When the rule is off the
  // buff changes only Initiative, keeping the fixed range (the standard/wiki rule).
  if (!state || !houseRuleEnabled(state, "combat-move-initiative")) {
    return base;
  }
  let bonus = 0;
  for (const effect of state.activeEffects) {
    if (!effectAppliesToUnit(effect, unit)) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "MOVEMENT_BONUS") {
        bonus += modifier.amount;
      }
    }
  }
  return Math.max(1, base + bonus);
}

export function getCombatObstacles(combat: CombatState): number[] {
  return combat.obstacles ?? [];
}

/**
 * Spaces holding a Force Field token: these count as Combat Obstacles (they
 * block non-flying movement and nobody may stop on them) while they stand. The
 * other battlefield tokens (Fire Wall / Quicksand / Land Mine) deliberately do
 * NOT block — units enter them so the wall can burn or the trap can spring.
 */
export function getForceFieldPositions(combat: CombatState): number[] {
  return (combat.battlefieldTokens ?? [])
    .filter((token) => token.kind === "force_field")
    .map((token) => token.position);
}

/**
 * Every unit card and obstacle token on the board is a Combat Obstacle.
 * They block movement paths for non-flying units and nobody can stop on them.
 */
export function getBlockedSpaces(combat: CombatState, movingUnit?: CombatUnitState): Set<number> {
  const blocked = new Set<number>(getCombatObstacles(combat));

  for (const position of getForceFieldPositions(combat)) {
    blocked.add(position);
  }

  for (const unit of Object.values(combat.units)) {
    if (isUnitAlive(unit) && unit.id !== movingUnit?.id) {
      blocked.add(unit.position);
    }
  }

  // Siege fortifications are Combat Obstacles; the Gate is open to the
  // defender ("Defending units may move through the Gate and may stop on it").
  if (combat.siege && movingUnit) {
    for (const position of siegeBlockedPositions(combat.siege, movingUnit)) {
      blocked.add(position);
    }
  }

  return blocked;
}

/**
 * Step-count from `origin` to every square `mover` could path to, treating
 * other units and obstacles as walls (flyers ignore them). Used by the neutral
 * AI to walk *around* blockers toward a target rather than only ever stepping
 * in a straight line — a unit boxed off the direct line still closes the gap.
 * Squares the mover can never reach are absent from the result.
 */
export function getPathDistances(combat: CombatState, mover: CombatUnitState, origin: number): Map<number, number> {
  const blocked = getBlockedSpaces(combat, mover);
  // The origin (the target's own square) seeds the flood even though it is
  // occupied — we want the distance to stand *next to* the target.
  blocked.delete(origin);
  const ignoresObstacles = mover.type === "flying";

  const distances = new Map<number, number>([[origin, 0]]);
  let frontier = [origin];
  let step = 0;
  while (frontier.length > 0) {
    step += 1;
    const next: number[] = [];
    for (const position of frontier) {
      for (const neighbor of getOrthogonalNeighbors(position)) {
        if (distances.has(neighbor) || (!ignoresObstacles && blocked.has(neighbor))) {
          continue;
        }
        distances.set(neighbor, step);
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  return distances;
}

function hasCannotMoveEffect(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_MOVE")
    )
  );
}

export function canUnitMoveTo(
  combat: CombatState,
  unit: CombatUnitState,
  destination: number,
  state?: GameState
): boolean {
  return getLegalMoveDestinations(combat, unit, state).includes(destination);
}

/**
 * Rampart Dendroids (Pack) "Bind": an enemy that begins its activation adjacent
 * to a living Dendroid cannot move. Evaluated against the unit's current
 * position — callers only reach here before the active unit has moved, so its
 * position is exactly where its activation began.
 */
function isBoundByAdjacentEnemy(combat: CombatState, unit: CombatUnitState): boolean {
  return Object.values(combat.units).some(
    (binder) =>
      binder.controllerId !== unit.controllerId &&
      isUnitAlive(binder) &&
      hasBindAdjacentEnemies(binder) &&
      isAdjacent(binder.position, unit.position)
  );
}

export function getLegalMoveDestinations(combat: CombatState, unit: CombatUnitState, state?: GameState): number[] {
  if (!isUnitAlive(unit) || unit.activatedThisRound || unit.movedThisActivation) {
    return [];
  }

  // WOG Commanders: a commander that used its command ability this activation may
  // no longer move (casting ends its movement — user spec). Covers the Battle
  // Teleport MOVE_ANYWHERE branch below too, since it sits before it.
  if (unit.movementLockedThisActivation) {
    return [];
  }

  if (hasCannotMoveEffect(state, unit)) {
    return [];
  }

  if (isBoundByAdjacentEnemy(combat, unit)) {
    return [];
  }

  const blocked = getBlockedSpaces(combat, unit);

  // Arch Devils teleport: a regular move may land on any empty space.
  if (hasUnitAbilityEffect(unit, "MOVE_ANYWHERE")) {
    return Array.from({ length: BATTLEFIELD_CELL_COUNT }, (_, position) => position).filter(
      (position) => position !== unit.position && !blocked.has(position)
    );
  }

  return getReachableDestinations(
    unit.position,
    getUnitMoveRange(unit, state),
    blocked,
    unit.type === "flying"
  ).filter(isBattlefieldPosition);
}

/**
 * Which side activates next, and the units that side may pick from, at the top
 * (highest effective initiative) tier of un-acted units.
 *
 * Tie rules (house rules layered on the rulebook initiative order):
 *  - Units of the SAME side tied at this initiative are ALL returned as
 *    `candidates`, so the controller chooses which goes first (engine prompt).
 *  - When BOTH sides have units tied at this initiative, activation ALTERNATES
 *    between them rather than letting one side run all of its tied units first.
 *    The side that has activated fewer units at this initiative this round acts
 *    next; on an even split the ATTACKER side goes first, then they go back and
 *    forth. In a Neutral fight the player is always the attacker, so the player
 *    leads and the Neutral army follows; in PvP the attacker leads the defender.
 */
export type ActivationStep = {
  side: PlayerId;
  candidates: CombatUnitState[];
  initiative: number;
};

/**
 * The single source of truth for "who activates next", shared by the live
 * engine (getActivationStep, reading `activatedThisRound`) and the rail preview
 * (getActivationOrder, simulating the round). Whatever counts as already-acted
 * is supplied via `hasActed`, so the displayed order can never drift from the
 * order the engine actually plays.
 */
function selectActivationStep(
  units: CombatUnitState[],
  attackerId: PlayerId,
  initiativeOf: (unit: CombatUnitState) => number,
  hasActed: (unit: CombatUnitState) => boolean
): ActivationStep | null {
  const eligible = units.filter((unit) => isUnitAlive(unit) && !hasActed(unit));
  if (eligible.length === 0) {
    return null;
  }

  const topInitiative = Math.max(...eligible.map(initiativeOf));
  const tier = eligible
    .filter((unit) => initiativeOf(unit) === topInitiative)
    .sort((left, right) => left.id.localeCompare(right.id));

  const tierAttackers = tier.filter((unit) => unit.controllerId === attackerId);
  const tierOthers = tier.filter((unit) => unit.controllerId !== attackerId);

  if (tierOthers.length === 0) {
    return { side: attackerId, candidates: tierAttackers, initiative: topInitiative };
  }
  if (tierAttackers.length === 0) {
    return { side: tierOthers[0].controllerId, candidates: tierOthers, initiative: topInitiative };
  }

  // Both sides are present at this initiative: alternate, ATTACKER-first on
  // ties. Whichever side has activated fewer units at this tier goes next; on an
  // even split the attacker leads (the player in a Neutral fight, the attacking
  // hero in PvP), so the two sides go back and forth starting with the attacker.
  //
  // Imp Cache (all initiative 5): Pack Orcs → Familiar → Pack Ogres → Familiar…
  // NEVER Orcs then Ogres with Familiars skipped. Count acted units by the
  // initiative band they BEGAN their activation in (`activationInitiative`),
  // not their current effective initiative — a Pack→Few flip mid-activation
  // drops printed initiative (5→4) and would otherwise erase the attacker from
  // the tier count, handing the next slot to another attacker unit.
  const bandOf = (unit: CombatUnitState) => unit.activationInitiative ?? initiativeOf(unit);
  const actedAtTier = (predicate: (unit: CombatUnitState) => boolean) =>
    units.filter((unit) => hasActed(unit) && bandOf(unit) === topInitiative && predicate(unit)).length;
  const attackerActed = actedAtTier((unit) => unit.controllerId === attackerId);
  const othersActed = actedAtTier((unit) => unit.controllerId !== attackerId);

  if (othersActed < attackerActed) {
    return { side: tierOthers[0].controllerId, candidates: tierOthers, initiative: topInitiative };
  }
  return { side: attackerId, candidates: tierAttackers, initiative: topInitiative };
}

export function getActivationStep(
  combat: CombatState,
  activeEffects: ActiveEffectState[] = []
): ActivationStep | null {
  // Polish Wait phase: re-activate waited units from highest token number down.
  if (combat.waitPhase) {
    const pending = Object.values(combat.units).filter(
      (unit) => isUnitAlive(unit) && unit.waitPending && !unit.activatedThisRound
    );
    if (pending.length === 0) {
      return null;
    }
    const topToken = Math.max(...pending.map((unit) => unit.waitToken ?? 0));
    const tier = pending
      .filter((unit) => (unit.waitToken ?? 0) === topToken)
      .sort((left, right) => left.id.localeCompare(right.id));
    return {
      side: tier[0]!.controllerId,
      candidates: tier,
      initiative: topToken
    };
  }

  const initiativeOf = (unit: CombatUnitState) => effectiveInitiative(unit, activeEffects);
  return selectActivationStep(
    Object.values(combat.units),
    combat.attackerPlayerId,
    initiativeOf,
    (unit) => unit.activatedThisRound
  );
}

export function getNextUnitToActivate(combat: CombatState, activeEffects: ActiveEffectState[] = []): CombatUnitState | null {
  return getActivationStep(combat, activeEffects)?.candidates[0] ?? null;
}

/**
 * The full order the current combat round will actually play out, computed by
 * stepping the SAME selection logic the engine uses, one unit at a time. The
 * initiative rail shows this so the displayed order matches reality — in
 * particular the cross-side ALTERNATION on initiative ties (attacker, defender,
 * attacker, …), which a flat "highest initiative, attacker-first" sort gets
 * wrong: it would list all of one side's tied units before the other's, even
 * though the engine interleaves them.
 *
 * Already-activated units come first (the rail greys them as "done"), then the
 * upcoming units in true activation order. Same-side ties are emitted in id
 * order; the live engine prompts the controller to choose among them, so that
 * part is a best-effort preview while the cross-side interleaving is exact.
 */
export function getActivationOrder(
  combat: CombatState,
  activeEffects: ActiveEffectState[] = []
): CombatUnitState[] {
  const alive = Object.values(combat.units).filter(isUnitAlive);
  const initiativeOf = (unit: CombatUnitState) => effectiveInitiative(unit, activeEffects);

  // Polish Wait: a unit that Waited has finished its MAIN-phase turn but will
  // re-activate AFTER every other unit, highest wait token first (the engine's
  // wait phase). So it leaves the greyed "done" bucket and joins the TAIL of the
  // upcoming list, and counts as already-acted for the main-phase ordering below.
  const waited = alive
    .filter((unit) => unit.waitPending)
    .sort((left, right) => (right.waitToken ?? 0) - (left.waitToken ?? 0) || left.id.localeCompare(right.id));

  // Truly finished this round (won't act again): activated and NOT waiting.
  const done = alive
    .filter((unit) => unit.activatedThisRound && !unit.waitPending)
    .sort((left, right) => initiativeOf(right) - initiativeOf(left) || left.id.localeCompare(right.id));

  // Remaining MAIN-phase units, in the engine's true (alternating) order. A
  // waited unit is treated as acted here so it never appears in this bucket.
  const acted = new Set<UnitId>(
    alive.filter((unit) => unit.activatedThisRound || unit.waitPending).map((unit) => unit.id)
  );
  const upcoming: CombatUnitState[] = [];
  // Bounded by the unit count: each pass marks exactly one more unit acted.
  for (let guard = alive.length; guard > 0; guard -= 1) {
    const next = selectActivationStep(alive, combat.attackerPlayerId, initiativeOf, (unit) => acted.has(unit.id))
      ?.candidates[0];
    if (!next) {
      break;
    }
    upcoming.push(next);
    acted.add(next.id);
  }

  // Order: finished (grey) · upcoming main-phase · waited (re-activate last).
  return [...done, ...upcoming, ...waited];
}

function hasAdjacentEnemy(combat: CombatState, unit: CombatUnitState): boolean {
  return Object.values(combat.units).some(
    (candidate) =>
      candidate.controllerId !== unit.controllerId &&
      isUnitAlive(candidate) &&
      isAdjacent(candidate.position, unit.position)
  );
}

export function getAttackKind(attacker: CombatUnitState, defender: CombatUnitState): "melee" | "ranged" {
  return attacker.type === "ranged" && !isAdjacent(attacker.position, defender.position) ? "ranged" : "melee";
}

function isBackRow(position: number): boolean {
  const row = Math.floor(position / BATTLEFIELD_COLUMNS);
  return row === 0 || row === BATTLEFIELD_ROWS - 1;
}

function isOppositeBackRow(leftPosition: number, rightPosition: number): boolean {
  const leftRow = Math.floor(leftPosition / BATTLEFIELD_COLUMNS);
  const rightRow = Math.floor(rightPosition / BATTLEFIELD_COLUMNS);

  return (
    (leftRow === 0 && rightRow === BATTLEFIELD_ROWS - 1) ||
    (leftRow === BATTLEFIELD_ROWS - 1 && rightRow === 0)
  );
}

/** Ammo Cart and friends: a player-scoped waiver of the ranged penalties. */
function hasRangedPenaltyWaiver(state: GameState | undefined, unit: CombatUnitState): boolean {
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
    )
  );
}

export function getAttackRollMode(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  state?: GameState,
  isRetaliation = false
): AttackRollMode {
  // A full waiver (Ammo Cart, or the "ignore the combat penalties" units —
  // Magi / Sharpshooters / Halflings) drops both the adjacent-attack and the
  // long-range penalty. The "ignore the combat penalty against adjacent units"
  // units (Evil Eyes / Medusas / Zealots / Titans) drop only the adjacent one.
  //
  // The unit-ability full waiver is printed "[unit_attack] Ignore the combat
  // penalties" (Sharpshooters, Magi, Halflings all carry it under that icon), so
  // it fires ONLY on the unit's own attack — never on a Retaliation Attack. The
  // Ammo Cart's player-scoped waiver is a standing effect, not attack-gated, so
  // it still applies on a retaliation. The "[unit_passive] … against adjacent
  // units" melee waiver (Evil Eyes / Medusas / Zealots / Titans) is passive too,
  // so it also stays on when retaliating.
  const abilityIgnoresAllPenalties =
    !isRetaliation && hasUnitAbilityEffect(attacker, "IGNORE_RANGED_PENALTIES");
  const ignoresAllPenalties = abilityIgnoresAllPenalties || hasRangedPenaltyWaiver(state, attacker);
  const ignoresMeleePenalty =
    ignoresAllPenalties || hasUnitAbilityEffect(attacker, "IGNORE_RANGED_MELEE_PENALTY");

  // The ranged Combat penalty ("throw two Attack dice and apply the smaller
  // result", rulebook p.28): a ranged unit either attacking an adjacent enemy or
  // shooting from its own Backline into the enemy's Backline. Computed here but
  // NOT returned immediately — the "resolve the higher" advantage below overrides
  // it (see the ATTACK_ROLL_ADVANTAGE block).
  const attackKind = getAttackKind(attacker, defender);
  const hasMeleePenalty = attacker.type === "ranged" && attackKind === "melee" && !ignoresMeleePenalty;
  const hasLongRangePenalty =
    attackKind === "ranged" &&
    !ignoresAllPenalties &&
    isBackRow(attacker.position) &&
    isBackRow(defender.position) &&
    isOppositeBackRow(attacker.position, defender.position);
  const hasCombatPenalty = hasMeleePenalty || hasLongRangePenalty;

  // Shaman's Puppet (option A): the puppeted unit rolls two Attack dice and
  // resolves the LOWER result for every attack this activation. Checked before
  // BOTH the ranged penalty and the "resolve the higher" advantage so the debuff
  // always wins — it is designed to force the worst roll (and the reducer re-
  // asserts it after the Precision/Golden Bow waiver). Needs `state` to read the
  // active effect.
  if (state && unitAttackRollDisadvantaged(state, attacker)) {
    return "disadvantage";
  }

  // WOG Nightmare's Fear: attacking the Nightmare forces the attacker to roll two
  // Attack dice and keep the LOWER. Like the Shaman's Puppet it is a forced
  // disadvantage that beats the attacker's own advantage, so it is resolved before
  // the ATTACK_ROLL_ADVANTAGE block. It fires only on a real attack ON the
  // Nightmare (the `defender`), never when the current attack is a Retaliation
  // Attack — so a foe's retaliation back against the Nightmare rolls normally.
  if (!isRetaliation && hasUnitAbilityEffect(defender, "FEAR_ATTACKER_DISADVANTAGE")) {
    return "disadvantage";
  }

  // "[unit_attack] Roll 2 Attack dice and resolve the higher one" (Factory
  // Halflings Few/Pack, the neutral Crusaders/Leprechaun/Halfling). Per the
  // board-game ruling this specific card ability OVERRIDES the general ranged
  // Combat penalty: a Halfling forced to shoot an adjacent enemy (or backline-to-
  // backline) still rolls two dice and keeps the HIGHER, rather than the penalty's
  // "keep the lower". So advantage is resolved BEFORE the penalty below. (The
  // neutral core Halfling additionally prints "Ignore combat penalties" — a
  // separate waiver that drops the penalty outright; the Factory Halfling has only
  // this override, so it still rolls two dice, just keeping the better face.)
  //
  // The [unit_attack] Halfling/Leprechaun variant (`ownAttackOnly`) is dropped on
  // a Retaliation Attack — like the [unit_attack] penalty waivers above — while
  // the Crusaders' [unit_passive] "any attack" variant keeps the advantage even
  // when retaliating (handled inside unitHasAttackRollAdvantage).
  if (unitHasAttackRollAdvantage(attacker, isRetaliation)) {
    return "advantage";
  }

  if (hasCombatPenalty) {
    return "disadvantage";
  }

  return "normal";
}

/**
 * Whether a reroll source can fire against the current (latest) roll: it
 * needs uses left, and face-gated sources like the Crusaders' 'every "0"'
 * only while the die actually shows that face.
 */
export function rerollSourceAvailableFor(source: AttackRerollSource, currentRoll: number): boolean {
  if (source.remaining <= 0) {
    return false;
  }

  if (source.onlyOnRoll !== undefined && currentRoll !== source.onlyOnRoll) {
    return false;
  }

  // A set-die source (Positive Morale "set one of the dice to the +1 side")
  // is only worth offering while the outcome sits below the face it sets.
  if (source.setDieFace !== undefined && currentRoll >= source.setDieFace) {
    return false;
  }

  return true;
}

export function canUnitAttack(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  activeEffects: ActiveEffectState[] = []
): boolean {
  if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  // Berserk forces a unit onto the nearest unit, friend or foe — so a berserked
  // attacker may strike its own ally (which still retaliates). Every other unit
  // can only attack an enemy.
  if (attacker.controllerId === defender.controllerId && !unitIsBerserk(activeEffects, attacker)) {
    return false;
  }

  // Forgetfulness: a unit holding UNIT_CANNOT_ATTACK may move but not attack.
  if (
    activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, attacker) &&
        effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_ATTACK")
    )
  ) {
    return false;
  }

  if (attacker.type === "ranged") {
    // Ranged units either shoot then step 1, or move 1 without attacking —
    // a ranged unit that has already moved gave up its attack.
    if (attacker.movedThisActivation) {
      return false;
    }

    if (hasAdjacentEnemy(combat, attacker)) {
      return isAdjacent(attacker.position, defender.position);
    }

    return true;
  }

  return isAdjacent(attacker.position, defender.position);
}

export function canUnitMoveAndAttack(
  combat: CombatState,
  attacker: CombatUnitState,
  destination: number,
  defender: CombatUnitState,
  state?: GameState
): boolean {
  if (attacker.type === "ranged" || !canUnitMoveTo(combat, attacker, destination, state)) {
    return false;
  }

  const movedAttacker = {
    ...attacker,
    position: destination
  };
  const virtualCombat = {
    ...combat,
    units: {
      ...combat.units,
      [attacker.id]: movedAttacker
    }
  };

  return canUnitAttack(virtualCombat, movedAttacker, defender, state?.activeEffects ?? []);
}

/**
 * Berserk targeting: the living units (friend or foe, never the unit itself)
 * tied for the shortest distance from `unit`. A berserked unit must attack one
 * of these — the controller (or the neutral AI) breaks the tie, the rulebook's
 * "the player owning the unit decides the direction." Distance is the orthogonal
 * board distance, the same "closest" measure the neutral AI uses elsewhere.
 */
export function getBerserkNearestTargets(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  const others = Object.values(combat.units).filter(
    (candidate) => candidate.id !== unit.id && isUnitAlive(candidate)
  );
  if (others.length === 0) {
    return [];
  }
  const nearest = Math.min(
    ...others.map((candidate) => getBattlefieldDistance(unit.position, candidate.position))
  );
  return others.filter(
    (candidate) => getBattlefieldDistance(unit.position, candidate.position) === nearest
  );
}

/** A target definition that resolves to units (not "none", a space, or an obstacle). */
type UnitTargetDefinition = Exclude<
  TargetDefinition,
  { type: "none" } | { type: "empty-space" } | { type: "any-space" } | { type: "unit-or-obstacle" }
>;

/**
 * Mirrors the reducer's `unitMatchesSpecialtyName` (kept local to avoid a
 * legal-actions -> reducer import cycle): exact name, "X and/or Y" descriptors,
 * and "a … unit" family suffixes all match.
 */
function matchesUnitName(unitName: string | undefined, target: string): boolean {
  if (!unitName) {
    return false;
  }
  if (/\s+(?:and|or)\s+/i.test(target)) {
    return target.split(/\s+(?:and|or)\s+/i).some((part) => matchesUnitName(unitName, part.trim()));
  }
  if (unitName === target) {
    return true;
  }
  const family = target.replace(/^an?\s+/i, "").replace(/\s+units?$/i, "").trim();
  return family.length > 0 && family !== target && unitName.toLowerCase().endsWith(family.toLowerCase());
}

function unitMatchesTarget(unit: CombatUnitState, target: UnitTargetDefinition): boolean {
  if (target.unitTypes && !target.unitTypes.includes(unit.type)) {
    return false;
  }

  if (target.damagedOnly && unit.damage <= 0) {
    return false;
  }

  // Bowstring of the Unicorn's Mane: only a ranged unit that has not yet taken
  // its turn this round can be activated.
  if (target.type === "friendly-unit" && target.notActivatedThisRound && unit.activatedThisRound) {
    return false;
  }

  // Ingham's Zealots VI (friendly) / Tarnum (Dungeon)'s Dragons VI (any unit):
  // the effect lands only on a unit whose name matches the named family.
  if (
    (target.type === "friendly-unit" || target.type === "any-unit") &&
    target.unitName &&
    !matchesUnitName(unit.name, target.unitName)
  ) {
    return false;
  }

  return true;
}

function getEnemyTargets(
  state: GameState,
  playerId: PlayerId,
  target: UnitTargetDefinition
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  let units = Object.values(state.combat.units)
    .filter((unit) => unit.controllerId !== playerId)
    .filter(isUnitAlive)
    .filter((unit) => unitMatchesTarget(unit, target));

  // Artillery: only the enemy unit(s) with the lowest effective initiative are
  // legal targets (a tie offers each, so the controller picks which is hit).
  if (target.type === "enemy-unit" && target.lowestInitiativeOnly && units.length > 0) {
    const lowest = Math.min(...units.map((unit) => effectiveInitiative(unit, state.activeEffects)));
    units = units.filter((unit) => effectiveInitiative(unit, state.activeEffects) === lowest);
  }

  return units.map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function getFriendlyTargets(
  state: GameState,
  playerId: PlayerId,
  target: UnitTargetDefinition
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter((unit) => unit.controllerId === playerId)
    .filter(isUnitAlive)
    .filter((unit) => unitMatchesTarget(unit, target))
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

function getTargetsForCard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  cards: CardLibrary,
  /**
   * Per-option target override (Ring of the Wayfarer): when a CHOOSE_ONE option
   * carries its own `target`, it is used instead of the card-level one.
   */
  overrideTarget?: TargetDefinition
): TargetRef[] {
  const card = cards[cardId];
  // Self-resolving effects (Leadership's morale token, active effects) never
  // pick a unit: they default to a no-target play. Only effects that actually
  // strike a unit fall back to "enemy-unit".
  const selfTargetedEffect =
    card?.effect.type === "CREATE_ACTIVE_EFFECT" ||
    card?.effect.type === "GAIN_MORALE" ||
    // Mirth: a player-scoped reroll buff picks no unit.
    card?.effect.type === "CREATE_ATTACK_DIE_REROLL" ||
    // Remove Obstacle picks no unit — it opens a board-obstacle choice instead.
    card?.effect.type === "REMOVE_OBSTACLE" ||
    // Quicksand / Land Mine pick no unit either — the cast opens a face-down
    // token placement picker (every token is placed there, including the first).
    card?.effect.type === "PLACE_HIDDEN_TOKENS" ||
    // Eagle Eye digs the shared Spell deck for a Basic/Expert spell — it never
    // touches a battlefield unit. Without this it defaults to "enemy-unit" and
    // (wrongly) demands an enemy-unit pick when played in combat — and becomes
    // un-playable when no enemy unit is targetable. The dig opens a take/discard
    // choice instead. (optionNeedsUnitTarget already excludes it on the option
    // path used by the Tome relics.)
    card?.effect.type === "EAGLE_EYE_DIG";
  const cardTarget = overrideTarget ?? card?.target;
  const targetType =
    cardTarget?.type ??
    (card?.effect.type === "HEAL_DAMAGE"
      ? "friendly-unit"
      : selfTargetedEffect
        ? "none"
        : "enemy-unit");

  if (targetType === "none") {
    return [{ type: "none" }];
  }

  // Summon spells target a chosen empty space (no living unit, obstacle, Wall
  // or Gate). Mirrors isSpaceBlockedForSummon in the reducer.
  if (targetType === "empty-space") {
    const combat = state.combat;
    if (!combat) {
      return [];
    }
    const blocked = new Set<number>();
    for (const unit of Object.values(combat.units)) {
      if (isUnitAlive(unit)) {
        blocked.add(unit.position);
      }
    }
    for (const position of combat.obstacles ?? []) {
      blocked.add(position);
    }
    // A space already holding any spell token (Force Field / Fire Wall /
    // Quicksand / Land Mine) is not "empty" for placing another one or summoning.
    for (const token of combat.battlefieldTokens ?? []) {
      blocked.add(token.position);
    }
    for (const position of combat.siege?.walls ?? []) {
      blocked.add(position);
    }
    if (combat.siege?.gatePosition != null) {
      blocked.add(combat.siege.gatePosition);
    }

    const spaces: TargetRef[] = [];
    for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
      if (!blocked.has(position)) {
        spaces.push({ type: "space", position });
      }
    }
    return spaces;
  }

  // Inferno: any space on the board is a legal target — occupied or empty — so
  // the blast can be centred on a stack of units.
  if (targetType === "any-space") {
    if (!state.combat) {
      return [];
    }
    const spaces: TargetRef[] = [];
    for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
      spaces.push({ type: "space", position });
    }
    return spaces;
  }

  // Dispel targets any unit OR an obstacle space: its unit half behaves like
  // "any-unit"; the obstacle spaces are appended after the unit filtering below.
  const unitTargetType = targetType === "unit-or-obstacle" ? "any-unit" : targetType;
  const target =
    cardTarget &&
    cardTarget.type !== "none" &&
    cardTarget.type !== "empty-space" &&
    cardTarget.type !== "any-space" &&
    cardTarget.type !== "unit-or-obstacle"
      ? cardTarget
      : ({ type: unitTargetType } as UnitTargetDefinition);

  let targets =
    target.type === "friendly-unit"
      ? getFriendlyTargets(state, playerId, target)
      : target.type === "any-unit"
        ? [...getFriendlyTargets(state, playerId, target), ...getEnemyTargets(state, playerId, target)]
        : getEnemyTargets(state, playerId, target);

  // Anti-Magic, printed school immunity, and artifact school immunity: a unit
  // cannot be targeted by a Spell it is immune to (friend or foe — same gate).
  // Shared with attack-window reactions via unitBlockedBySpellCard.
  if (card?.kind === "spell") {
    targets = targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = state.combat?.units[candidate.unitId];
      return !unit || !unitBlockedBySpellCard(state, unit, card);
    });
  }

  // A tier-gated spell/specialty (a `grade` ceiling or `gradeByPower` ladder) can
  // never reach a unit whose grade sits above its ladder's TOP grade, whatever
  // Power is paid — and no spell ladder climbs above "gold". So drop the two kinds
  // of forever-unreachable unit from a tier-gated card's target list: a gradeless
  // Creature Bank defender (rulebook p.66 — gradeRank ∞) AND any AZURE-tier unit
  // (gradeRank above gold). This keeps Berserk / Teleport / Clone — whose per-Power
  // grade gate is otherwise deferred to resolution (Power can be added after the
  // cast is declared) — from ever OFFERING (then silently fizzling on) an azure or
  // bank unit. Option-card tier gates are filtered per option in addOptionPlays.
  if (card && effectIsTierGated(card.effect)) {
    const ceiling = maxTierGateRank(card.effect);
    targets = targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = state.combat?.units[candidate.unitId];
      return !unit || gradeRankOfUnit(unit) <= ceiling;
    });
  }

  // Dispel also targets a board space holding an obstacle/trap token ("Remove all
  // ongoing effects from a space"). Offer each occupied token space once.
  if (targetType === "unit-or-obstacle" && state.combat) {
    const tokenSpaces = new Set<number>();
    for (const token of state.combat.battlefieldTokens ?? []) {
      tokenSpaces.add(token.position);
    }
    for (const position of tokenSpaces) {
      targets.push({ type: "space", position });
    }
  }

  // Clone: only offer on a friendly unit that has a printed side to copy AND at
  // least one empty space orthogonally adjacent to it for the Clone Token —
  // otherwise the cast would be a no-op. The grade gate is NOT applied here: the
  // cast can be empowered after it is declared, so the reachable grade is decided
  // at resolution against the Power actually paid (like Berserk / Teleport).
  if (card?.effect.type === "CLONE_UNIT" && state.combat) {
    const combat = state.combat;
    const blocked = new Set<number>();
    for (const unit of Object.values(combat.units)) {
      if (isUnitAlive(unit)) {
        blocked.add(unit.position);
      }
    }
    for (const position of combat.obstacles ?? []) {
      blocked.add(position);
    }
    for (const position of combat.siege?.walls ?? []) {
      blocked.add(position);
    }
    if (combat.siege?.gatePosition != null) {
      blocked.add(combat.siege.gatePosition);
    }
    targets = targets.filter((candidate) => {
      if (candidate.type !== "unit") {
        return true;
      }
      const unit = combat.units[candidate.unitId];
      if (!unit || !unit.unitDefId) {
        return false;
      }
      return getOrthogonalNeighbors(unit.position).some((position) => !blocked.has(position));
    });
  }

  return targets;
}

function isPhaseAllowedForCard(state: GameState, card: CardDefinition): boolean {
  return !card.phaseLimit || card.phaseLimit.includes(state.phase);
}

function getAttackRerollsForMode(card: CardDefinition, mode: CardPlayMode): number {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return 0;
  }

  if (mode === "expert") {
    return card.effect.expertRerolls ?? card.effect.basicRerolls;
  }

  return card.effect.basicRerolls;
}

function getPlayableModesForCard(state: GameState, playerId: PlayerId, card: CardDefinition): CardPlayMode[] {
  // An Empowered ability may take its Expert side without a crown; otherwise a
  // spare Expert use (crown) is required.
  const player = state.players[playerId];
  const expertCrownFree = Boolean(player) && canPlayExpertMode(player, card.id);

  if (card.effect.type === "CREATE_ATTACK_DIE_REROLL" && card.effect.basicRerolls <= 0) {
    return card.effect.expertRerolls && expertCrownFree ? ["expert"] : [];
  }

  const modes: CardPlayMode[] = ["basic"];

  if (
    (card.effect.type === "ADD_COMBAT_STAT" ||
      card.effect.type === "ADD_SPELL_POWER" ||
      card.effect.type === "CREATE_ACTIVE_EFFECT" ||
      card.effect.type === "CREATE_ATTACK_DIE_REROLL" ||
      // Leadership: the expert side (draw 2) is usable mid-battle for an expert use.
      card.effect.type === "GAIN_MORALE") &&
    ((card.effect.type === "CREATE_ACTIVE_EFFECT" && card.effect.expertEffect) ||
      (card.effect.type === "CREATE_ATTACK_DIE_REROLL" && card.effect.expertRerolls && card.effect.expertRerolls > 0) ||
      (card.effect.type === "GAIN_MORALE" && card.effect.expertDrawCards !== undefined) ||
      ("expertAmount" in card.effect && card.effect.expertAmount !== undefined)) &&
    expertCrownFree
  ) {
    modes.push("expert");
  }

  // Eagle Eye's Expert side digs for an Expert spell instead of a Basic one (an
  // Expert use / crown). Offer it in combat too so the player picks Basic or
  // Expert just like on the map play (effectSupportsExpertOption) — never a unit.
  if (card.effect.type === "EAGLE_EYE_DIG" && expertCrownFree) {
    modes.push("expert");
  }

  return modes.filter((mode) => {
    if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
      return true;
    }

    return getAttackRerollsForMode(card, mode) > 0;
  });
}

/** True while combat is running and no attack, reaction or choice is resolving. */
function isCombatCardWindowOpen(state: GameState): boolean {
  return Boolean(
    state.combat &&
      !state.combat.outcome &&
      !state.combat.setup &&
      !state.combat.awaitingContinue &&
      state.phase === "combat" &&
      state.stack.length === 0 &&
      !state.reactionWindow &&
      !state.pendingChoice
  );
}

function isCombatParticipant(state: GameState, playerId: PlayerId): boolean {
  return Boolean(
    state.combat && (state.combat.attackerPlayerId === playerId || state.combat.defenderPlayerId === playerId)
  );
}

/**
 * Hand lock: a player "cannot use your Deck during this Combat" when they have
 * no hero present (a garrison defended without the town hero) or when a
 * Secondary Hero leads the fight — Secondary Heroes never play cards. Applies
 * to the relevant side of both Neutral and player-vs-player combats.
 *
 * ONE exception, flagged on the combat context by `startPlayerCombat`: the
 * `mine-army-defense` house rule's Mine defense (`garrisonCardsAllowed`) — its
 * heroless DEFENDER keeps their cards. Hero-scoped effects (commander,
 * equipment, hero grades, Tactics, Retreat/Surrender) are gated on the hero
 * itself elsewhere and stay off for every heroless defense.
 *
 * This is the SINGLE seam every hand-lock gate reads (legal-action offers and
 * the reducer backstops alike), so the exception can never be honoured by one
 * surface and refused by another.
 */
export function isHandLockedInCombat(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  if (combat.context.kind === "neutral") {
    const hero = state.heroes[combat.context.heroId];
    return hero?.controllerId === playerId && hero.kind === "secondary";
  }

  if (combat.context.kind !== "player") {
    return false;
  }

  let heroId: string | null = null;
  if (playerId === combat.attackerPlayerId) {
    heroId = combat.context.attackerHeroId;
  } else if (playerId === combat.defenderPlayerId) {
    heroId = combat.context.defenderHeroId;
  } else {
    return false;
  }

  if (heroId === null) {
    // Heroless (garrison) defense: units-only, unless this fight is the
    // `mine-army-defense` Mine defense — there the OWNER still plays cards.
    return !isHerolessMineDefender(state, playerId);
  }

  return state.heroes[heroId]?.kind === "secondary";
}

/**
 * Spell casting by the printed timing symbols — limited to one Spell card per
 * player per combat round (Knowledge/Necklace raise it):
 *  - Activation spells (Magic Arrow, Fireball, Haste…) are cast while one of
 *    YOUR units is active, before it attacks.
 *  - Trigger-free instant spells (Cure, Counterstrike) may be cast at any
 *    open moment of the combat by either fighter.
 *  - Instant spells with an attack trigger (Bloodlust, Stone Skin, Curse…)
 *    are played inside the attack windows instead, never cast directly.
 */
/**
 * Neutral Pegasi "Mystic Toll": a living enemy Pegasi forces this player to pay
 * (discard) one extra Power card whenever they cast a Spell. Combat-only.
 */
export function combatEnemyImposesPowerTax(state: GameState, casterId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  return Object.values(combat.units).some(
    (unit) => unit.controllerId !== casterId && isUnitAlive(unit) && hasSpellCastPowerTax(unit)
  );
}

/**
 * Creature Bank Dragon Utopia Faerie Dragons (while Stacked): a living enemy
 * unit with the spell-cast lock forbids this player from casting any Spell.
 * Combat-only; the Stacked gate lives in `getUnitAbilityDefinitions`, so the
 * lock lifts the moment the Faerie Dragons lose their Stack Token.
 */
export function combatEnemyLocksSpells(state: GameState, casterId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  return Object.values(combat.units).some(
    (unit) => unit.controllerId !== casterId && isUnitAlive(unit) && hasSpellCastLock(unit)
  );
}

/**
 * The Power cards the player could pay for the Pegasi toll. A hand cast spends
 * the spell itself first, so it cannot also pay the toll — the toll must come
 * from a *different* Power card; a Scroll cast leaves the hand intact.
 */
export function payablePowerCardIds(
  hand: readonly CardId[],
  cards: CardLibrary,
  castCardId: CardId,
  fromScroll: boolean
): CardId[] {
  let remaining: readonly CardId[] = hand;
  if (!fromScroll) {
    const index = remaining.indexOf(castCardId);
    if (index >= 0) {
      remaining = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
    }
  }
  return remaining.filter((cardId) => cardCanBoostPower(cards[cardId]));
}

/** Whether the player holds any Power card to pay the Pegasi toll for this cast. */
export function handCanPayPowerTax(
  hand: readonly CardId[],
  cards: CardLibrary,
  castCardId: CardId,
  fromScroll: boolean
): boolean {
  return payablePowerCardIds(hand, cards, castCardId, fromScroll).length > 0;
}

/**
 * Whether a card in hand is a Helm of the Alabaster Unicorn-style artifact whose
 * CHOOSE_ONE offers the "cast the top of the Spell-deck discard pile" side. Such
 * a card lets its holder cast the public top spell of the shared Spell-deck
 * discard pile (sourced from there, not the hand), removing the artifact.
 */
function cardEnablesSpellDeckCast(card: CardDefinition | undefined): boolean {
  return Boolean(
    card &&
      card.implementationStatus === "implemented" &&
      card.effect.type === "CHOOSE_ONE" &&
      card.effect.options.some((option) => option.effect.type === "CAST_FROM_SPELL_DISCARD")
  );
}

function addSpellActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  if (!isCombatCardWindowOpen(state) || !isCombatParticipant(state, playerId) || isHandLockedInCombat(state, playerId)) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }
  // The one-Spell-per-combat-round limit blocks hand / Book casts. Spell Scroll
  // casts and the Helm of the Alabaster Unicorn cast are free bonuses that do
  // not count toward the limit, so they are still offered even once the limit
  // is reached.
  const spellLimitReached = player.combatStats.spellsCastThisRound >= spellLimitFor(state, player);

  // Recanter's Cloak (option B): "no Hero can use Spells" this Combat — a global
  // lock that binds both heroes, so no cast is offered at all. (Option A's
  // Power-0 floor is enforced at resolution, since the Power is only fixed once
  // the cast window closes; a cast can still be declared and then boosted.)
  if (getSpellCastRestriction(state).lockAll) {
    return;
  }

  // Creature Bank Dragon Utopia Faerie Dragons (while Stacked): a living enemy
  // Faerie Dragons locks this player out of casting any Spell — none is offered.
  if (combatEnemyLocksSpells(state, playerId)) {
    return;
  }

  // Neutral Pegasi: a living enemy Pegasi gates every Spell cast behind paying
  // an extra Power card — with none to pay, the cast is not offered at all.
  const powerTaxed = combatEnemyImposesPowerTax(state, playerId);

  const combat = state.combat;
  const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  // Intelligence lifts the activation-timing gate: its holder may cast an
  // activation spell at any open moment of the combat, even off-turn, without
  // one of their own units being active.
  const ownActivationOpen =
    Boolean(
      activeUnit &&
        activeUnit.controllerId === playerId &&
        !activeUnit.activatedThisRound &&
        !activeUnit.attackedThisActivation
    ) || playerHasSpellTimingFreedom(state, playerId);

  // Tarnum (Conflux) VI: spells Searched this combat are cast for free OVER the
  // per-round limit (a bonus), and they never go to the caster's own discard —
  // they are offered separately from normal hand casts (which they are excluded
  // from) so the limit-reached gate cannot block them.
  const tarnumFlagged = new Set(player.combatStats.tarnumOverlimitCards ?? []);

  // Hand / Book spells (blocked once the spell limit is reached) plus every
  // Spell Scroll spell (scroll spells are not in hand; they cast at power 0,
  // are removed once used, and do NOT count toward / are not blocked by the
  // per-round spell limit).
  const castCandidates: {
    cardId: string;
    fromScroll?: string;
    fromSpellDeck?: string;
    fromOwnDiscard?: boolean;
    fromSpellBook?: boolean;
    tarnumReturn?: "deck-top" | "discard";
  }[] = [
    ...(spellLimitReached
      ? []
      : [
          ...[...new Set(player.hand)].filter((cardId) => !tarnumFlagged.has(cardId)).map((cardId) => ({ cardId })),
          // Spell Book (house rule): a Book Spell casts like a hand Spell and SHARES
          // the same one-Spell-per-round cast limit — full Power, same timing/
          // targeting gates. (The Book's separate once-per-round budget is only its
          // +1-Power discard, spellBookPowerUsedThisTurn — see the reaction path.)
          ...(bookCastSourcesEnabled(state)
            ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true }))
            : [])
        ]),
    // Scrolls stay available after the hand/Book limit is spent.
    ...(player.scrolls ?? []).flatMap((scroll) =>
      [...new Set(scroll.spellCardIds)].map((cardId) => ({ cardId, fromScroll: scroll.id }))
    )
  ];

  // Tarnum over-limit casts: each flagged hand spell, offered with both
  // placements ("on the top of the Spell deck or on its discard pile").
  for (const cardId of tarnumFlagged) {
    if (!player.hand.includes(cardId)) {
      continue;
    }
    castCandidates.push({ cardId, tarnumReturn: "deck-top" });
    castCandidates.push({ cardId, tarnumReturn: "discard" });
  }

  // Helm of the Alabaster Unicorn (option B): cast the top card of the shared
  // Spell-deck discard pile. Offered like a scroll cast — the spell is sourced
  // from that discard, not the hand — and the Helm that enables it is removed by
  // the cast (its removal lives in performSpellCast). Only the public top card is
  // castable; the same timing/targeting rules below decide whether it can be cast
  // now (a map-only or untargetable top spell is simply not offered).
  // Helm of the Alabaster Unicorn (option B) casts the discard TOP; Ciele's Magic
  // Arrow IV — a hero-specialty enabler whose CAST_FROM_SPELL_DISCARD option sets
  // `spellId` — instead casts that specific Spell found anywhere in the discard
  // pile. Both are free bonus casts sourced from the Spell-deck discard pile and
  // consume the enabling card (see performSpellCast).
  for (const enablerId of [...new Set(player.hand)].filter((id) => cardEnablesSpellDeckCast(cards[id]))) {
    const enabler = cards[enablerId];
    const castOption =
      enabler?.effect.type === "CHOOSE_ONE"
        ? enabler.effect.options.find((o) => o.effect.type === "CAST_FROM_SPELL_DISCARD")
        : undefined;
    const spellIdFilter =
      castOption?.effect.type === "CAST_FROM_SPELL_DISCARD" ? castOption.effect.spellId : undefined;
    // Ciele IV (Conflux): `ownDiscard` reads the caster's OWN discard pile (where
    // a cast Magic Arrow actually lands), not the shared Spell-deck discard the
    // Helm draws from. Search it for the filtered spell id.
    const fromOwnDiscard = castOption?.effect.type === "CAST_FROM_SPELL_DISCARD" && castOption.effect.ownDiscard === true;
    const sourcePile = fromOwnDiscard
      ? polishSpellBookEnabled(state)
        ? player.spellBook
        : player.discard
      : state.decks.spells?.discardPile ?? [];
    const sourceSpell = spellIdFilter
      ? [...sourcePile].reverse().find((id) => id === spellIdFilter)
      : sourcePile.at(-1);
    if (sourceSpell) {
      castCandidates.push({ cardId: sourceSpell, fromSpellDeck: enablerId, ...(fromOwnDiscard ? { fromOwnDiscard: true } : {}) });
    }
  }

  for (const { cardId, fromScroll, fromSpellDeck, fromOwnDiscard, fromSpellBook, tarnumReturn } of castCandidates) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    // Attack-window instants (triggered spells) and Map spells route elsewhere.
    // A CHOOSE_ONE spell is NOT skipped wholesale: its trigger-free, directly-
    // castable arms are offered below as a real Spell cast (see the CHOOSE_ONE
    // branch); its triggered arms still wait for their reaction window.
    if (card.trigger || card.timing === "map") {
      continue;
    }

    if (!isPhaseAllowedForCard(state, card)) {
      continue;
    }

    // Activation spells need one of your own units active, pre-attack.
    const needsOwnActivation = card.timing === "combat" || card.timing === "action";
    if (needsOwnActivation && !ownActivationOpen) {
      continue;
    }

    // Neutral Pegasi toll: cannot cast without a separate Power card to pay.
    if (powerTaxed && !handCanPayPowerTax(player.hand, cards, cardId, Boolean(fromScroll))) {
      continue;
    }

    // A CHOOSE_ONE spell's trigger-free, directly-castable arm (Prayer's
    // +initiative side) is offered here as a real Spell cast, so it flows through
    // the normal pipeline (SPELL_CAST_STARTED window for Resist/Power, power
    // scaling, the one-Spell-per-round limit) and resolves the chosen option in
    // resolveTopStack. Its +attack/+defense arms carry triggers and were skipped
    // above, so they stay on the reaction-window path and are never offered here.
    if (card.effect.type === "CHOOSE_ONE") {
      addChooseOneSpellInstantCasts(actions, state, playerId, card, cardId, cards, {
        fromScroll,
        fromSpellDeck,
        fromOwnDiscard,
        fromSpellBook,
        tarnumReturn
      });
      continue;
    }

    // Earthquake works only against standing siege fortifications.
    if (card.effect.type === "EARTHQUAKE") {
      const siege = combat?.siege;
      if (!siege || (siege.walls.length === 0 && siege.gatePosition === null)) {
        continue;
      }
    }

    // Remove Obstacle needs at least one obstacle to lift: an obstacle marker, a
    // battlefield token (Force Field / Fire Wall / Quicksand / Land Mine), or a
    // standing siege Wall or Gate.
    if (card.effect.type === "REMOVE_OBSTACLE") {
      const siege = combat?.siege;
      const hasObstacleMarker = (combat?.obstacles ?? []).length > 0;
      const hasToken = (combat?.battlefieldTokens ?? []).length > 0;
      const hasFortification = Boolean(siege && (siege.walls.length > 0 || siege.gatePosition !== null));
      if (!hasObstacleMarker && !hasToken && !hasFortification) {
        continue;
      }
    }

    // Quicksand / Land Mine open a face-down placement picker on cast, so the
    // spell can only be cast when there is at least one empty space to drop a
    // token on (same "empty space" rule as the Summon spells above).
    if (card.effect.type === "PLACE_HIDDEN_TOKENS") {
      if (!combat) {
        continue;
      }
      const blocked = new Set<number>();
      for (const unit of Object.values(combat.units)) {
        if (isUnitAlive(unit)) {
          blocked.add(unit.position);
        }
      }
      for (const position of combat.obstacles ?? []) {
        blocked.add(position);
      }
      for (const token of combat.battlefieldTokens ?? []) {
        blocked.add(token.position);
      }
      for (const position of combat.siege?.walls ?? []) {
        blocked.add(position);
      }
      if (combat.siege?.gatePosition != null) {
        blocked.add(combat.siege.gatePosition);
      }
      let hasEmpty = false;
      for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
        if (!blocked.has(position)) {
          hasEmpty = true;
          break;
        }
      }
      if (!hasEmpty) {
        continue;
      }
    }

    // School of Magic (Air/Earth/Fire/Water Magic) in play matching this spell,
    // with an expert use to spend: a normal hand cast may instead discard the
    // permanent for its expert power bonus. Offered as a separate cast option so
    // the choice is made up front — never as a prompt after the cast.
    // A Scroll/Spell-deck cast can't pair a School of Magic permanent; a Book
    // cast can (it casts like a hand cast), so it is offered the expert variant.
    const schoolExpert =
      !fromScroll && !fromSpellDeck && !tarnumReturn && expertUsesAvailable(player) > 0
        ? getPermanentSchoolBonus(state, playerId, card)
        : null;

    // Basic X Magic (Conflux fetch permanent) in play matching this spell, with an
    // expert use to spend: the caster may fold its +3 Power AS PART OF the cast
    // (up front, like the Tower schoolExpert above) instead of playing the
    // standalone USE_SCHOOL_FETCH_EXPERT reaction after the cast. Like the Tower
    // expert it CONSUMES its source — the permanent is discarded (user ruling)
    // — and a crown is spent; the label says so. Same scroll/Spell-deck/Tarnum
    // exclusions; a Book cast keeps its flag.
    const fetchExpertSchool =
      !fromScroll && !fromSpellDeck && !tarnumReturn && expertUsesAvailable(player) > 0
        ? matchingSchoolFetchForCast(state, playerId, card.spellSchools ?? [])
        : null;

    for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
      actions.push({
        label: fromScroll
          ? `Cast ${card.name} (Scroll)`
          : fromOwnDiscard
            ? `Cast ${card.name} from your discard pile (free)`
            : fromSpellDeck
              ? `Cast ${card.name} (Helm of the Alabaster Unicorn)`
              : fromSpellBook
                ? `Cast ${card.name} (Spell Book)`
                : tarnumReturn
                  ? `Cast ${card.name} (free; ${tarnumReturn === "deck-top" ? "to Spell deck top" : "to Spell discard"})`
                  : `Cast ${card.name}`,
        action: {
          type: "CAST_SPELL",
          playerId,
          cardId,
          target,
          ...(fromScroll ? { fromScroll } : {}),
          ...(fromSpellDeck ? { fromSpellDeck } : {}),
          ...(fromOwnDiscard ? { fromOwnDiscard: true } : {}),
          ...(fromSpellBook ? { fromSpellBook: true } : {}),
          ...(tarnumReturn ? { tarnumReturn } : {})
        }
      });

      if (schoolExpert) {
        actions.push({
          label: `Cast ${card.name} + ${schoolExpert.card.name} (+${schoolExpert.expertPower} expert)${
            fromSpellBook ? " (Spell Book)" : ""
          }`,
          action: {
            type: "CAST_SPELL",
            playerId,
            cardId,
            target,
            useSchoolExpert: true,
            ...(fromSpellBook ? { fromSpellBook: true } : {})
          }
        });
      }

      if (fetchExpertSchool) {
        const schoolName = `${fetchExpertSchool.charAt(0).toUpperCase()}${fetchExpertSchool.slice(1)}`;
        actions.push({
          label: `Cast ${card.name} with +3 Power — Basic ${schoolName} Magic expert (crown; discards the permanent)${
            fromSpellBook ? " (Spell Book)" : ""
          }`,
          action: {
            type: "CAST_SPELL",
            playerId,
            cardId,
            target,
            useSchoolFetchExpert: true,
            ...(fromOwnDiscard ? { fromOwnDiscard: true } : {}),
            ...(fromSpellBook ? { fromSpellBook: true } : {})
          }
        });
      }
    }
  }
}

/**
 * Trigger-free CHOOSE_ONE Spell arms the spell-cast pipeline can resolve directly
 * (i.e. arms that resolveTopStack's CHOOSE_ONE-spell branch knows how to apply).
 * Today only Prayer's +initiative arm — a trigger-free CREATE_INITIATIVE_BUFF.
 * Any other trigger-free option type has no spell-cast resolution path yet, so it
 * stays skipped (never silently offered, then fizzling).
 */
function optionCastableAsCombatSpell(effect: ConcreteEffect): boolean {
  return effect.type === "CREATE_INITIATIVE_BUFF";
}

/**
 * Offers the trigger-free, directly-castable arms of a CHOOSE_ONE Spell as real
 * Spell casts (CAST_SPELL carrying an optionIndex + the option's own target).
 * This is the on-turn / off-turn cast path for Prayer's +initiative arm — the
 * arm that was previously unreachable. The triggered arms (+attack/+defense) are
 * deliberately NOT offered here: they wait for their UNIT_ATTACK_DECLARED
 * reaction window, exactly as before.
 */
function addChooseOneSpellInstantCasts(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  cardId: string,
  cards: CardLibrary,
  source: {
    fromScroll?: string;
    fromSpellDeck?: string;
    fromOwnDiscard?: boolean;
    fromSpellBook?: boolean;
    tarnumReturn?: "deck-top" | "discard";
  }
): void {
  if (card.effect.type !== "CHOOSE_ONE") {
    return;
  }
  for (const [optionIndex, option] of card.effect.options.entries()) {
    // Triggered arms route through reaction windows; map-only arms never apply in
    // combat; everything the spell-cast dispatch can't resolve is left alone.
    if (option.trigger || option.mapOnly || !optionCastableAsCombatSpell(option.effect)) {
      continue;
    }
    for (const target of getTargetsForCard(state, playerId, cardId, cards, option.target)) {
      actions.push({
        label: source.fromScroll
          ? `Cast ${card.name} — ${option.label} (Scroll)`
          : source.fromSpellDeck
            ? `Cast ${card.name} — ${option.label} (Helm of the Alabaster Unicorn)`
            : source.fromSpellBook
              ? `Cast ${card.name} — ${option.label} (Spell Book)`
              : source.tarnumReturn
                ? `Cast ${card.name} — ${option.label} (free; ${
                    source.tarnumReturn === "deck-top" ? "to Spell deck top" : "to Spell discard"
                  })`
                : `Cast ${card.name} — ${option.label}`,
        action: {
          type: "CAST_SPELL",
          playerId,
          cardId,
          target,
          optionIndex,
          ...(source.fromScroll ? { fromScroll: source.fromScroll } : {}),
          ...(source.fromSpellDeck ? { fromSpellDeck: source.fromSpellDeck } : {}),
          ...(source.fromOwnDiscard ? { fromOwnDiscard: true } : {}),
          ...(source.fromSpellBook ? { fromSpellBook: true } : {}),
          ...(source.tarnumReturn ? { tarnumReturn: source.tarnumReturn } : {})
        }
      });
    }
  }
}

function getTransformTargets(
  state: GameState,
  playerId: PlayerId,
  effect: Extract<ConcreteEffect, { type: "TRANSFORM_UNIT" }>
): TargetRef[] {
  if (!state.combat) {
    return [];
  }

  return Object.values(state.combat.units)
    .filter(
      (unit) =>
        unit.controllerId === playerId &&
        isUnitAlive(unit) &&
        canPlaceTransformOn(unit.name, unit.variant, unit.transforms, effect)
    )
    .map<TargetRef>((unit) => ({ type: "unit", unitId: unit.id }));
}

/**
 * Non-spell cards during combat, with the printed timing rules:
 *  - Instant cards may be played at any time (both players), except while an
 *    attack resolves — trigger cards wait for their reaction window instead.
 *  - Ongoing and activation cards may only be played while one of your own
 *    units is active and before it attacks.
 */
function addPlayableCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const player = state.players[playerId];
  const combat = state.combat;
  if (!player || !combat || !isCombatCardWindowOpen(state) || !isCombatParticipant(state, playerId)) {
    return;
  }

  // Garrison defense: the heroless defender cannot use their deck.
  if (isHandLockedInCombat(state, playerId)) {
    return;
  }

  const activeUnit = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === playerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );
  const unitNotMovedYet = Boolean(activeUnit && !activeUnit.movedThisActivation);

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.kind === "spell" || card.implementationStatus !== "implemented") {
      continue;
    }

    // Permanents are played like activation cards: during one of your own
    // unit's activations, before it attacks. They enter play instead of
    // resolving (replacing the previous permanent — the one-permanent limit
    // applies in combat too). A hybrid permanent/instant artifact (income
    // rings and carts) instead exposes its sides through the CHOOSE_ONE option
    // machinery below, so it is not short-circuited here.
    if (card.permanent && card.effect.type !== "CHOOSE_ONE") {
      if (ownActivationOpen) {
        actions.push({
          label: `Put ${card.name} into play`,
          action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
        });
      }
      continue;
    }

    // Offense/Armorer/Sorcery ("+stat / +Power, then draw a card"): on your own
    // activation (before attack) they may be played just for the draw — the
    // trigger window is not required. Basic only (no crown wasted on a fizzled
    // stat). Sorcery still banks Power for the next spell when the unit has not
    // moved yet (see playCard).
    const combatDrawOnly =
      ownActivationOpen &&
      (card.effect.type === "ADD_COMBAT_STAT" || card.effect.type === "ADD_SPELL_POWER") &&
      Boolean(card.effect.drawCards) &&
      Boolean(card.trigger);
    if (combatDrawOnly && isPhaseAllowedForCard(state, card)) {
      actions.push({
        label: `Play ${card.name} (draw${
          card.effect.type === "ADD_SPELL_POWER" && unitNotMovedYet ? ", next spell +Power" : ""
        })`,
        action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
      });
      continue;
    }

    if (card.trigger || !isPhaseAllowedForCard(state, card)) {
      continue;
    }

    if (card.timing !== "combat" && card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "action") {
      continue;
    }

    const needsOwnActivation = card.timing !== "instant";
    if (needsOwnActivation && !ownActivationOpen) {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      // House-rule twin of the Offense/Armorer/Sorcery draw-only play above:
      // a trigger SIDE that carries a "then draw" rider (ADD_COMBAT_STAT /
      // ADD_SPELL_POWER with drawCards — Armor of Wonder, Scales of the
      // Greater Basilisk, Tunic of the Cyclops King) may be played on your own
      // activation JUST for the draw. Outside its window the stat/Power
      // fizzles and only the rider resolves (playCard's draw-rider handler;
      // an unmoved active unit still banks Sorcery-style +Power for the next
      // spell). Basic only — no crown is wasted on a fizzled stat. Conditional
      // draws (Blackshard's drawIfCostCardSpell) stay window-only: their draw
      // resolves in the reaction path alone.
      if (ownActivationOpen) {
        for (const [optionIndex, option] of card.effect.options.entries()) {
          if (
            !option.trigger ||
            (option.effect.type !== "ADD_COMBAT_STAT" && option.effect.type !== "ADD_SPELL_POWER") ||
            !option.effect.drawCards
          ) {
            continue;
          }
          if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
            continue;
          }
          actions.push({
            label: `${card.name}: ${option.label} (draw only${
              option.effect.type === "ADD_SPELL_POWER" && unitNotMovedYet ? ", next spell +Power" : ""
            })`,
            action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", optionIndex, target: { type: "none" } }
          });
        }
      }
      // Options with a trigger wait for their reaction window; the rest play
      // directly when their effect makes sense in combat.
      addOptionPlays(actions, state, playerId, card, cardId, "combat", cards);
      continue;
    }

    if (card.effect.type === "TRANSFORM_UNIT") {
      for (const target of getTransformTargets(state, playerId, card.effect)) {
        actions.push({
          label: `Play ${card.name}`,
          action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target }
        });
      }
      continue;
    }

    // Necromancy is a map ability played after a combat win, never during one.
    if (card.effect.type === "NECROMANCY_REINFORCE") {
      continue;
    }

    for (const mode of getPlayableModesForCard(state, playerId, card)) {
      for (const target of getTargetsForCard(state, playerId, cardId, cards)) {
        actions.push({
          label: `Play ${card.name}${mode === "expert" ? " expert" : ""}`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode,
            target
          }
        });
      }
    }
  }
}

/**
 * The reactions a combat participant may take OFF-TURN — while it is not one of
 * their own units' activation: cast a Spell (Intelligence lifts the activation-
 * timing gate; trigger-free instant spells are castable by anyone), play an
 * instant ability/card (e.g. Intelligence itself), or use an active effect.
 *
 * This is the SINGLE source of truth for off-turn combat reactions, used two
 * ways: it is the exact menu offered to the reacting player during a
 * "pre-activation" pause, AND the pump opens that pause (neutral and PvP alike)
 * precisely when this is non-empty for the off-turn side. It only returns
 * anything while a combat card window is open (no attack/reaction/choice
 * resolving), so callers can rely on it being empty whenever the player has
 * nothing useful to do.
 *
 * To add a new off-turn reaction (a new instant, ability, or active effect),
 * make it appear here — it then both shows up in the pause and earns the
 * forced PvP stop automatically, with no change to the pump or reactor logic.
 */
export function getOffTurnCombatReactions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): LegalAction[] {
  const actions: LegalAction[] = [];
  addActiveEffectActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);
  addPlayableCardActions(actions, state, playerId, cards);
  // Instant damage specialties (Gerwulf's Ballista discard, Adelaide's Frost
  // Ring, Deemer's Meteor Shower) are "Instant" — playable off-turn during an
  // enemy unit's activation, not only on the owner's own turn. They are timed
  // "combat" (so addPlayableCardActions skips them off-turn); this offers just
  // their `combatAnytime` sides here.
  addCombatAnytimeSpecialtyPlays(actions, state, playerId, cards);
  return actions;
}

/**
 * The instant damage specialties a player may play OFF-TURN — i.e. during an
 * enemy unit's activation (Gerwulf's Ballista discard, Adelaide's Frost Ring,
 * Deemer's Meteor Shower). Only the `combatAnytime` options are offered, never a
 * card's own-turn-only sides (Gerwulf IV's free 1 damage, Gerwulf VI's ongoing
 * aim). These cards are timed "combat", so the normal off-turn card pass
 * (addPlayableCardActions) skips them while it is not the owner's turn — this
 * adds just their instant sides back. It self-gates to OFF-turn: when the
 * player's own unit is active and yet to act, the on-turn pass already offers
 * every option, so this no-ops to avoid double-listing.
 */
function addCombatAnytimeSpecialtyPlays(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): void {
  const combat = state.combat;
  if (!combat || combat.outcome || combat.setup || !isCombatParticipant(state, playerId)) {
    return;
  }
  if (isHandLockedInCombat(state, playerId)) {
    return;
  }
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  // On-turn (this player's own fresh unit is active), the standard card pass
  // offers every option, including these — skip to avoid offering them twice.
  const activeUnit = combat.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === playerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );
  if (ownActivationOpen) {
    return;
  }
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (
      !card ||
      card.kind !== "hero-specialty" ||
      card.implementationStatus !== "implemented" ||
      card.effect.type !== "CHOOSE_ONE" ||
      !card.effect.options.some((option) => option.combatAnytime)
    ) {
      continue;
    }
    addOptionPlays(actions, state, playerId, card, cardId, "combat", cards, (option) =>
      Boolean(option.combatAnytime)
    );
  }
}

/** Effects an "OR" option may resolve directly in the given context. */
function isOptionEffectPlayable(
  state: GameState,
  playerId: PlayerId,
  effect: ConcreteEffect,
  context: "combat" | "map",
  /** The card being played, excluded from "is there a card to remove" counts. */
  excludeCardId?: CardId
): boolean {
  switch (effect.type) {
    case "GAIN_RESOURCES":
      // Sephinroth's Valuables I: "Pay N gold to gain …" is only offered when the
      // player can actually afford the gold cost.
      return !effect.goldCost || (state.players[playerId]?.resources.gold ?? 0) >= effect.goldCost;
    case "DRAW_CARDS":
    // Legion artifacts' discount side: banking the one-shot recruit discount is
    // always a valid choice (it is spent later, on the map, by a recruit/reinforce).
    case "GAIN_RECRUIT_DISCOUNT":
    case "GAIN_MORALE":
    case "ENEMY_MORALE_STRIP":
    case "ROLL_FOR_MORALE":
    case "RANDOM_ENEMY_DISCARD":
    case "GAIN_EXPERT_USE":
    case "CREATE_ACTIVE_EFFECT":
    // Anime Hero Grades (§3.11): the Training Manual grants Merit — always a
    // valid map play (a no-op when the module is off).
    case "GAIN_GRADE_PROGRESS":
      return true;
    case "BIND_COMMANDER_ARTIFACT": {
      // WOG Commander Artifact bind (Task 2): a map-only play, offered only when
      // the Commanders module is on, the player has a commander (a DEAD one is
      // fine — it binds for later), and the target slot is EMPTY. An occupied slot
      // hides the option (and the reducer rejects a forged play).
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const commander = state.players[playerId]?.commander;
      return (
        commandersModuleEnabled(state) && Boolean(commander) && !commander?.artifacts?.[effect.slot]
      );
    }
    case "EQUIP_HERO_EQUIPMENT": {
      // Anime equipment card: map-only, module on, main hero present. Occupied
      // slots are fine (old item goes to the bag). Already-owning the same item
      // is still legal (equip is idempotent for that id).
      if (context !== "map" || !state.adventure) {
        return false;
      }
      if (!equipmentEnabled(state)) {
        return false;
      }
      return Boolean(getMainHero(state, playerId));
    }
    case "ENTER_PLAY":
      // The permanent-income side of a hybrid artifact (Eversmoking Ring of
      // Sulfur, Inexhaustible Cart of Ore): putting the card into play is
      // always a valid choice in either context.
      return true;
    case "TAKE_FROM_DISCARD": {
      // Map play (needs an adventure). Mid-Combat it is offered when the option
      // opts in (Scholar / Ciele via `allowInCombat`) OR — house rule — the card
      // is an INSTANT artifact: an instant artifact's "take a card from your
      // discard" side is a click-to-use combat play too (Skull Helmet, Helm of
      // the Alabaster Unicorn, …), not a map-only one. See discardPickAllowedInCombat.
      const playedCard = excludeCardId ? cardLibrary[excludeCardId] : undefined;
      if (context === "map" ? !state.adventure : !(discardPickAllowedInCombat(playedCard, effect) && state.combat)) {
        return false;
      }
      const player = state.players[playerId];
      const pool = effect.fromTop ? (player?.discard.slice(-effect.fromTop) ?? []) : (player?.discard ?? []);
      // Polish recovery effects read the face-up used side of the Book instead
      // of a discard pile that can no longer contain owned Spells. Preserve any
      // non-Spell half of a mixed filter (Scholar's specialty recovery).
      if (polishSpellBookEnabled(state)) {
        const used = player?.spellBookUsed ?? [];
        if (effect.filter === "spell" && used.length > 0) {
          return true;
        }
        if (effect.filter === "magic-arrow" && used.includes("spell.magic_arrow")) {
          return true;
        }
        if (
          effect.filter === "spell-or-specialty" &&
          (used.length > 0 || pool.some((cardId) => cardLibrary[cardId]?.kind === "hero-specialty"))
        ) {
          return true;
        }
      }
      return pool.some((cardId) => {
        const kind = cardLibrary[cardId]?.kind;
        if (effect.filter === "spell") {
          return kind === "spell";
        }
        if (effect.filter === "non-artifact") {
          return kind !== "artifact";
        }
        if (effect.filter === "spell-or-specialty") {
          return kind === "spell" || kind === "hero-specialty";
        }
        if (effect.filter === "magic-arrow") {
          return cardId === "spell.magic_arrow";
        }
        return true;
      });
    }
    case "SCHOLAR_EMPOWER_SWAP": {
      // Scholar expert: map-only. Both phases are "up to N" (including zero), so
      // there is no Statistic-in-hand gate — you may remove nothing and still
      // take Empowered cards, or remove without taking.
      return context === "map" && Boolean(state.adventure) && Boolean(state.players[playerId]);
    }
    case "CARD_DECK_SEARCH":
    case "EAGLE_EYE_DIG":
      // Map plays; ALSO — house rule, mirroring TAKE_FROM_DISCARD — any INSTANT
      // card's Search/dig side is playable mid-Combat (Breastplate of Brimstone,
      // the Tomes, AND hero-specialty twins): the printed Instant timing makes it
      // a click-to-use card, not a map-only one. The reducer opens the Search/dig
      // choice immediately (the reward queue is parked during a live combat).
      // See instantSideAllowedInCombat.
      if (context === "combat") {
        return Boolean(state.combat) && instantSideAllowedInCombat(excludeCardId ? cardLibrary[excludeCardId] : undefined);
      }
      return Boolean(state.adventure);
    case "TELEPORT_HERO_TO_TOWN":
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        townPortalDestinations(state, playerId, effect.movementBonus ?? 0).length > 0
      );
    case "DISCOVER_TILE_CARD":
    case "GAIN_HERO_MOVEMENT":
    // Octavia "Gold" / Melodia "Fortune": Resource-die roll, morale/gold gain,
    // and the location-dice buff are all resolved through a queued map visit.
    case "RESOURCE_FORTUNE_PLAY":
    // Pandora's Box map plays: a queued main-hero visit-steps reward, and the
    // "peek a deck" scry — both resolve on the map through the adventure queues.
    case "PANDORA_VISIT":
    case "PANDORA_SCRY":
      return context === "map" && Boolean(state.adventure);
    case "DIMENSION_DOOR": {
      const hero = getMainHero(state, playerId);
      return Boolean(
        context === "map" &&
          state.adventure &&
          hero &&
          dimensionDoorDestinations(state, hero, effect.fields).length > 0
      );
    }
    case "REMOVE_HAND_CARD_THEN_SEARCH": {
      // Play that removes a card matching the filter (default "removable" =
      // ability / artifact / spell; Miriam's Scouting I narrows it to "ability"),
      // then Searches that card's deck. There must be at least one matching card
      // to remove OTHER than the card being played: the Hat is itself a removable
      // artifact (so it needs a second removable), while Miriam's hero-specialty
      // never matches the filter (so one matching card is enough). Mid-Combat it
      // is offered only for an INSTANT artifact (the Hat — same house rule as
      // the Search side above); Miriam's specialty stays map-only.
      const removeFilter = effect.filter ?? "removable";
      const removable = removableHandCards(state, playerId, removeFilter).filter(
        (candidate) => candidate.cardId !== excludeCardId
      );
      if (context === "combat") {
        const playedCard = excludeCardId ? cardLibrary[excludeCardId] : undefined;
        return Boolean(state.combat) && instantSideAllowedInCombat(playedCard) && removable.length >= 1;
      }
      return Boolean(state.adventure) && removable.length >= 1;
    }
    case "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD": {
      // Spellbinder's Hat (option B): needs at least one OTHER card to remove
      // alongside the Hat (which is still in hand at this point). Playable
      // mid-Combat too — the Hat is an INSTANT artifact (house rule above).
      const player = state.players[playerId];
      const hasAnother = Boolean(player && player.hand.length + player.discard.length >= 2);
      if (context === "combat") {
        const playedCard = excludeCardId ? cardLibrary[excludeCardId] : undefined;
        return Boolean(state.combat) && instantSideAllowedInCombat(playedCard) && hasAnother;
      }
      return Boolean(state.adventure) && hasAnother;
    }
    case "VIEW_EARTH":
      // View Earth captures an enemy-owned Mine in reach — offered only when at
      // least one such Mine sits within this option's range of the caster's Hero.
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        capturableEnemyMinesWithin(state, playerId, effect.withinFields).length > 0
      );
    case "DIPLOMACY_RECRUIT":
      // Diplomacy's Map side only does something with at least one Dwelling.
      return context === "map" && Boolean(state.adventure) && unlockedRecruitTiers(state, playerId).size > 0;
    case "VISIONS_SCRY":
      // Visions scrys a Neutral Unit deck — only useful when at least one tier
      // deck still holds cards.
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        (["bronze", "silver", "gold", "azure"] as const).some((tier) => {
          const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
          return Boolean(deck) && deck.drawPile.length + deck.discardPile.length > 0;
        })
      );
    case "CREATE_INITIATIVE_BUFF":
    case "CREATE_ATTACK_BUFF":
    case "CREATE_DEFENSE_BUFF":
    case "ADD_UNIT_MAX_HEALTH":
    case "MOVE_UNIT_ADJACENT":
    case "HEAL_DAMAGE":
    // Shaman's Puppet (option B): a Cure-style cleanse, played in combat on a unit.
    case "HEAL_DAMAGE_AND_REMOVE_EFFECTS":
    case "AREA_DAMAGE_ALL_ADJACENT":
    case "AREA_DAMAGE_PICK_ADJACENT":
    case "CREATE_FIRE_SHIELD":
    case "GRANT_ELEMENTAL_DAMAGE":
    // Ballistics' expert bombardment: a combat play. The primary enemy is the
    // option's `enemy-unit` target (so an empty enemy board offers no play); the
    // building-material price is enforced by canAffordCardCost.
    case "BALLISTICS_BOMBARD":
    case "DAMAGE_LOWEST_INITIATIVE_ENEMY":
    // Septienna's Death Ripple: a targetless combat activation that sweeps every
    // enemy unit of a grade.
    case "DAMAGE_ENEMY_UNITS_BY_GRADE":
    // Miku Voice of Angel VI: targetless damage to every living enemy.
    case "DAMAGE_ALL_ENEMY_UNITS":
    // Miku Voice of Angel I/IV: targetless ongoing combat plays.
    case "SLOW_ALL_ENEMIES":
    case "CREATE_HEAL_ON_ATTACKED":
    // Oidana VI: a targetless combat activation that auras every neutral unit
    // the caster controls with +1 Attack for the whole battle.
    case "CREATE_VARIANT_ATTACK_BUFF":
    // Tarnum (Castle)'s Ballista VI / Gerwulf's Ballista IV: pick N enemy units
    // to damage (a targetless combat activation; the pick choice handles the rest).
    case "DAMAGE_CHOSEN_ENEMIES":
    // Tarnum (Dungeon)'s Dragons IV (line damage) / VI (toggle a Dragons unit's
    // Black cube) are combat plays.
    case "DAMAGE_BATTLEFIELD_LINE":
    case "TOGGLE_RETALIATION_MARKER":
    // Luna's Fire Wall specialty (I/VI): place a Fire Wall token on an empty
    // space — a combat play (its empty-space targets are generated generically).
    case "PLACE_FIRE_WALL_FIXED":
      return context === "combat" && Boolean(state.combat);
    case "GAIN_RUNES":
      // Kriv (Bulwark): bank Runes mid-combat — only a Bulwark caster benefits.
      return context === "combat" && Boolean(state.combat) && state.players[playerId]?.factionId === "bulwark";
    case "GAIN_STARTING_RUNES":
      // Kriv (Bulwark): become Rune-Empowered on the MAP — only a Bulwark caster
      // benefits, and only while the starting-rune flag is below the cap (so the
      // option is never offered once it can add nothing).
      return (
        context === "map" &&
        Boolean(state.adventure) &&
        state.players[playerId]?.factionId === "bulwark" &&
        (state.players[playerId]?.runeEmpoweredNextCombats ?? 0) < RUNE_MAX
      );
    case "RESHUFFLE_DISCARD_THEN_DRAW": {
      // Deemer's Meteor Shower IV deck-cycle: useful whenever there is a card to
      // shuffle back or draw (map or combat).
      const player = state.players[playerId];
      return Boolean(player && player.deck.length + player.discard.length > 0);
    }
    case "DECK_DIG_KEEP_MATCHING": {
      // Jeddite's Mysterious Warlock I/VI: dig your own deck, keeping Spells /
      // Specialties. A printed Instant's card manipulation is playable on the map
      // AND mid-Combat (instantSideAllowedInCombat — the reducer resolves the dig
      // synchronously either way). Useful while the deck OR its discard pile (which
      // reshuffles in mid-dig, like every other draw) still holds a card — an
      // emptied deck must never make the specialty unplayable.
      if (context === "combat" ? !(state.combat && instantSideAllowedInCombat(excludeCardId ? cardLibrary[excludeCardId] : undefined)) : !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      return Boolean(player && player.deck.length + player.discard.length > 0);
    }
    case "SEARCH_DECK_THEN_RESHUFFLE": {
      // Adrienne's Fire Magic IV: Search your own deck + reshuffle the discard. A
      // printed Instant's card manipulation is playable on the map AND mid-Combat
      // (instantSideAllowedInCombat — the reducer opens the own-deck pick with a
      // combat returnPhase). Useful whenever there is a card to reveal or a
      // discard pile to shuffle back.
      if (context === "combat" ? !(state.combat && instantSideAllowedInCombat(excludeCardId ? cardLibrary[excludeCardId] : undefined)) : !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      return Boolean(player && player.deck.length + player.discard.length > 0);
    }
    case "DRAW_TOP_ARTIFACT": {
      // Tazar's War Hero VI: draw the top Artifact card to hand. A printed
      // Instant's card manipulation is playable on the map AND mid-Combat
      // (instantSideAllowedInCombat — the reducer draws / opens the deck pick with
      // a combat returnPhase). Useful while any Artifact deck (the Legacy deck, or
      // a BINH Minor/Major/Relic deck) still holds a card in its draw pile OR its
      // discard pile — an emptied draw pile reshuffles its discard back in.
      if (context === "combat" ? !(state.combat && instantSideAllowedInCombat(excludeCardId ? cardLibrary[excludeCardId] : undefined)) : !state.adventure) {
        return false;
      }
      return ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"].some(
        (deckId) =>
          (state.decks[deckId]?.drawPile.length ?? 0) + (state.decks[deckId]?.discardPile.length ?? 0) > 0
      );
    }
    case "PLACE_PARALYSIS":
      // Ring of the Wayfarer's paralysis side is a combat play; the neutral /
      // opening-round gate lives on its `requiresNeutralCombatStart` flag.
      return context === "combat" && Boolean(state.combat);
    case "FORGETFULNESS":
      // Zilare's Forgetfulness specialty: a combat play; the grade/type gate
      // lives on the option's gradeByPower and target filters.
      return context === "combat" && Boolean(state.combat);
    case "PLACE_WEAKNESS_TOKEN":
      // Casmetra's Sorceresses VI (option A): a combat play that drops a
      // −2 Weakness token on a chosen unit.
      return context === "combat" && Boolean(state.combat);
    case "BLOCK_ENEMY_SURRENDER":
      // Shackles of War (house rule): only at the start of a player-vs-player
      // combat, where there is an enemy hero who could otherwise surrender.
      return context === "combat" && state.combat?.context.kind === "player" && state.combat.round === 1;
    case "BORROW_NEUTRAL_UNIT": {
      // Tarnum (Rampart) Sharpshooters VI: "Play at the start of Combat" — only on
      // combat round 1, and only while the unit is still available to borrow from
      // its tier's Neutral deck (draw or discard pile).
      if (context !== "combat" || !state.combat || state.combat.round !== 1) {
        return false;
      }
      const deck = state.decks[NEUTRAL_DECK_IDS[effect.tier]];
      return Boolean(
        deck && (deck.drawPile.includes(effect.unitDefId) || deck.discardPile.includes(effect.unitDefId))
      );
    }
    case "DOUBLE_FIRST_AID_TENT":
      // Gem's First Aid VI only does something with a First Aid Tent in play.
      return (
        context === "combat" &&
        Boolean(state.combat) &&
        state.activeEffects.some(
          (active) =>
            active.controllerId === playerId &&
            active.modifiers.some((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND")
        )
      );
    case "CONVERT_ARMY_UNIT": {
      // Gelu's Sharpshooters IV: needs a Pack of Elves, the Sharpshooters still
      // in the silver Neutral deck, and (unique) no Sharpshooters already owned.
      if (context !== "map" || !state.adventure) {
        return false;
      }
      const player = state.players[playerId];
      const deck = state.decks[NEUTRAL_DECK_IDS[effect.toTier]];
      if (!player || !deck) {
        return false;
      }
      // Tarnum (Conflux) IV pays gold instead of trading in a unit, so the
      // from-unit requirement only applies when fromUnitDefId is set.
      const hasFrom = effect.fromUnitDefId
        ? player.army.some(
            (unit) => unit.unitDefId === effect.fromUnitDefId && unit.side === effect.fromSide
          )
        : true;
      const canPayGold = !effect.goldCost || player.resources.gold >= effect.goldCost;
      const blockedByUnique =
        Boolean(effect.unique) && player.army.some((unit) => unit.unitDefId === effect.toUnitDefId);
      const deckHasTarget =
        deck.drawPile.includes(effect.toUnitDefId) || deck.discardPile.includes(effect.toUnitDefId);
      return hasFrom && canPayGold && !blockedByUnique && deckHasTarget;
    }
    case "SIEGE_DEMOLISH": {
      const siege = state.combat?.siege;
      if (context !== "combat" || !siege) {
        return false;
      }
      return effect.target === "arrow-tower"
        ? Boolean(siege.arrowTowerUnitId)
        : siege.walls.length > 0 || siege.gatePosition !== null;
    }
    case "GAIN_WAR_MACHINE": {
      // Torosar's Ballista I "Pay 5 gold to gain a Ballista": needs the machine in
      // the catalog, NOT already owned by this player, and enough gold (a map play).
      // The catalog is per-player and never depletes — another player owning a
      // Ballista never blocks this one. (It still offers the fallback draw at
      // resolution when the player already holds it — see GAIN_WAR_MACHINE.)
      if (context !== "map" || !state.adventure) {
        return false;
      }
      if (!(state.adventure.warMachineSupply ?? []).includes(effect.warMachineCardId)) {
        return false;
      }
      const buyer = state.players[playerId];
      return !effect.goldCost || (buyer?.resources.gold ?? 0) >= effect.goldCost;
    }
    case "BALLISTA_SPECIALTY":
      // Torosar's Ballista I "Activate your Ballista" needs one to activate; the
      // IV/VI grants always do something (and bring their own Ballista).
      if (context !== "combat" || !state.combat) {
        return false;
      }
      if (effect.activate === "one" && !effect.grant) {
        return countBallistas(state, playerId) >= 1;
      }
      return true;
    case "DISCARD_WAR_MACHINE_DAMAGE":
      // Gerwulf's Ballista IV/VI discard: needs an in-play war-machine card to
      // discard (a temporary Torosar grant is not a card and cannot be spent).
      return (
        context === "combat" &&
        Boolean(state.combat) &&
        getPermanentCardIds(state, playerId).includes(effect.warMachineCardId)
      );
    case "REMOVE_ACTIVE_EFFECT":
      // Boots of Polarity (option B): only worth playing while at least one
      // removable, unit-scoped ongoing effect is on the table to strip.
      return (
        context === "combat" &&
        Boolean(state.combat) &&
        state.activeEffects.some(
          (active) => active.target?.type === "unit" && active.removable !== false
        )
      );
    default:
      return false;
  }
}

/** Whether the option's effect needs a unit on the battlefield as target. */
function optionNeedsUnitTarget(effect: ConcreteEffect): boolean {
  // A unit-scoped active effect (Pendant of Second Sight's Paralysis immunity)
  // is placed on a chosen unit; player/global-scoped ones (Golden Bow, the
  // Orbs) pick no unit.
  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return effect.effect.scope === "unit";
  }

  return (
    effect.type === "CREATE_INITIATIVE_BUFF" ||
    effect.type === "CREATE_ATTACK_BUFF" ||
    effect.type === "CREATE_DEFENSE_BUFF" ||
    effect.type === "ADD_UNIT_MAX_HEALTH" ||
    effect.type === "MOVE_UNIT_ADJACENT" ||
    effect.type === "HEAL_DAMAGE" ||
    // Shaman's Puppet (option B): a Cure-style cleanse placed on a chosen unit.
    effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" ||
    effect.type === "AREA_DAMAGE_ALL_ADJACENT" ||
    effect.type === "AREA_DAMAGE_PICK_ADJACENT" ||
    effect.type === "GRANT_ELEMENTAL_DAMAGE" ||
    effect.type === "DAMAGE_LOWEST_INITIATIVE_ENEMY" ||
    // Ballistics' expert bombardment: the player picks the primary enemy unit.
    effect.type === "BALLISTICS_BOMBARD" ||
    // Gerwulf's Ballista discard: the player picks which enemy unit it hits.
    effect.type === "DISCARD_WAR_MACHINE_DAMAGE" ||
    // Tarnum (Dungeon)'s Dragons VI: toggle the Black cube on a chosen Dragons unit.
    effect.type === "TOGGLE_RETALIATION_MARKER" ||
    effect.type === "PLACE_PARALYSIS" ||
    // Zilare's Forgetfulness specialty (the chosen enemy cannot attack next activation).
    effect.type === "FORGETFULNESS" ||
    // Casmetra's Sorceresses VI (option A) drops a Weakness token on a chosen unit.
    effect.type === "PLACE_WEAKNESS_TOKEN" ||
    // Boots of Polarity (option B): the ongoing effect it strips lives on a
    // chosen unit (yours or the enemy's).
    effect.type === "REMOVE_ACTIVE_EFFECT"
  );
}

/** Highest grade unlocked by the paid power (mirrors the reducer's gate). */
function gradeAtPower(
  gradeByPower: Record<number, CombatUnitState["grade"]>,
  power: number
): CombatUnitState["grade"] | null {
  const thresholds = Object.keys(gradeByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (gradeByPower[matched] ?? null);
}

/**
 * Direct plays of "OR" card options outside reaction windows — Estates'
 * gold, Logistics' ongoing step, an artifact's "Remove this card: gain 6
 * gold", Boots of Speed's initiative side, and so on.
 */
function addOptionPlays(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  cardId: string,
  context: "combat" | "map",
  cards: CardLibrary,
  // When given, only options matching the predicate are offered. Used to offer
  // ONLY the `combatAnytime` instant sides off-turn (so a card's own-turn-only
  // sides, e.g. Gerwulf IV's free 1 damage, are never offered during an enemy's
  // activation window).
  filter?: (option: CardOptionDefinition) => boolean,
  // Spell Book (house rule): when true the card is an "OR" Map Spell played from
  // the Book, so every PLAY_CARD offer here carries `fromSpellBook`.
  fromSpellBook?: boolean
): void {
  if (card.effect.type !== "CHOOSE_ONE") {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  // Spell "OR" cards (Prayer) still respect the combat spell limit.
  if (card.kind === "spell" && state.combat && player.combatStats.spellsCastThisRound >= spellLimitFor(state, player)) {
    return;
  }

  // Map Power-tier spells (View Air, Fly, Dimension Door, …): ONE cast action —
  // Power is added after play, like combat. Never list the per-tier options.
  if (context === "map" && isMapPowerTierSpell(card)) {
    // Dimension Door / Town Portal / View Earth need a reachable destination at
    // SOME tier — gate on any option being playable (higher Power can open more
    // cells than the free tier alone).
    const anyPlayable = card.effect.options.some(
      (option) =>
        isOptionEffectPlayable(state, playerId, option.effect, "map", cardId) &&
        canAffordCardCost(state, playerId, cardId, option.cost)
    );
    if (!anyPlayable) {
      return;
    }
    actions.push({
      label: `Cast ${card.name}`,
      action: {
        type: "PLAY_CARD",
        playerId,
        cardId,
        mode: "basic",
        target: { type: "none" },
        ...(fromSpellBook
          ? {
              fromSpellBook: true as const,
              ...(polishSpellBookEnabled(state)
                ? { castEnablerCardId: CAST_A_SPELL_CARD_ID }
                : {})
            }
          : {})
      }
    });
    return;
  }

  for (const [optionIndex, option] of card.effect.options.entries()) {
    if (option.trigger) {
      continue;
    }
    if (filter && !filter(option)) {
      continue;
    }
    if (option.mapOnly && context !== "map") {
      continue;
    }
    if (option.combatOnly && context !== "combat") {
      continue;
    }
    // Shackles of War's "block the enemy's Surrender" side is never played from
    // hand: Surrender is a before-battle (defender prep) decision, so the block is
    // offered to the attacker as a dedicated start-of-combat choice instead (see
    // maybeOpenShacklesDecision). Played mid-fight it would be a no-op.
    if (option.effect.type === "BLOCK_ENEMY_SURRENDER") {
      continue;
    }
    // Pendant of Courage's repeat-Search side is played AFTER a Search, not from
    // hand — it is offered as a post-Search decision (pendant-repeat-search), so
    // it never appears on the normal play list.
    if (option.postSearchOnly) {
      continue;
    }
    // Mystic Orb of Mana's "draw 2" option is offered only on an empty discard.
    if (option.requiresEmptyDiscard && (state.players[playerId]?.discard.length ?? 0) > 0) {
      continue;
    }
    // Crown of the Five Seas' sea side: only while this player's main Hero is on
    // a Sea (water-terrain) field.
    if (option.requiresSeaTile) {
      const hero = getMainHero(state, playerId);
      if (!hero?.spaceId || !isSeaField(state, hero.spaceId)) {
        continue;
      }
    }
    // Ring of the Wayfarer's paralysis side ("At start of Combat with Neutral
    // Units …") is NOT played from hand: it is offered as a dedicated start-of-
    // combat decision (maybeOpenWayfarerParalysisDecision) so it lands BEFORE any
    // unit acts — a hand play could only fire mid-round-1, after a faster guard
    // had already moved. Skip it here (the initiative side stays a hand play).
    if (option.requiresNeutralCombatStart) {
      continue;
    }
    // Jeremy's Cannon IV/VI "use the Cannon" side: only while the player has the
    // war-machine card in play (the same gate as Torosar's "if you have one").
    if (option.requiresWarMachine && !getPermanentCardIds(state, playerId).includes(option.requiresWarMachine)) {
      continue;
    }
    // House-rule-gated option (Ballistics' Expert bombard, Pathfinding's Expert
    // coastline/layer crossing): offered only while the named rule is ON. Dropped
    // from the offer when off — and, since seat actions are validated against this
    // offer, rejected at play too.
    if (option.requiresHouseRule && !houseRuleEnabled(state, option.requiresHouseRule)) {
      continue;
    }
    if (!isOptionEffectPlayable(state, playerId, option.effect, context, cardId)) {
      continue;
    }
    // Legion artifacts' discount side: hide it unless there is a unit to spend it
    // on, and never let one piece bank twice in a turn. Once this card has banked
    // a voucher this turn its discount side disappears (its resource side stays),
    // so it cannot be replayed for a second voucher after being pulled back from
    // the discard pile; and with no recruitable/reinforceable target the only
    // sensible choice is the resource side, so the discount side is withheld
    // (this also guarantees the selection prompt is never opened empty).
    if (option.effect.type === "GAIN_RECRUIT_DISCOUNT") {
      const alreadyBanked = houseRuleEnabled(state, "immediate-reinforcement-prompts")
        ? player.recruitDiscounts?.some((voucher) => voucher.cardId === cardId) ?? false
        : player.legionDiscountCardIdsUsed?.includes(cardId) ?? false;
      if (alreadyBanked || legionDiscountTargets(state, playerId).length === 0) {
        continue;
      }
    }
    if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
      continue;
    }

    // An Empowered ability may take its Expert side without a crown.
    const expertOk = canPlayExpertMode(player, cardId);
    // `expertUnlessHouseRule` flips an option to its Expert side (spend a crown)
    // while the named rule is OFF — Ballistics' Arrow-Tower demolition is a basic
    // side under the buff, but the printed/wiki Expert side without it.
    const expertOnly =
      option.expertOnly ||
      (option.expertUnlessHouseRule !== undefined && !houseRuleEnabled(state, option.expertUnlessHouseRule));
    const modes: CardPlayMode[] = expertOnly
      ? expertOk
        ? ["expert"]
        : []
      : effectSupportsExpertOption(option.effect) && expertOk
        ? ["basic", "expert"]
        : ["basic"];

    let targets = optionNeedsUnitTarget(option.effect)
      ? getTargetsForCard(state, playerId, cardId, cards, option.target)
      : [{ type: "none" } as TargetRef];

    // Some options only land on a named unit (Moandor's elemental grant reads
    // "your Liches unit").
    const restrictName =
      option.effect.type === "GRANT_ELEMENTAL_DAMAGE" ? option.effect.targetUnitName : undefined;
    if (restrictName) {
      targets = targets.filter(
        (candidate) => candidate.type === "unit" && state.combat?.units[candidate.unitId]?.name === restrictName
      );
    }

    // Ring of the Wayfarer's paralysis side reads "any unit except Azure": its
    // gradeByPower gate unlocks gold at Power 0, so units above that grade
    // (Azure) are never legal targets — keep the offered list in step with the
    // resolution gate rather than offering a no-op.
    // Zilare's Forgetfulness specialty shares the same grade gate: its option
    // unlocks a fixed top grade (I -> silver, IV/VI -> gold), so units above it
    // are never offered rather than offering a no-op.
    if (option.effect.type === "PLACE_PARALYSIS" || option.effect.type === "FORGETFULNESS") {
      const gradeByPower = option.effect.gradeByPower;
      targets = targets.filter((candidate) => {
        if (candidate.type !== "unit") {
          return true;
        }
        const unit = state.combat?.units[candidate.unitId];
        if (!unit) {
          return false;
        }
        const maxGrade = gradeAtPower(gradeByPower, card.power ?? 0);
        return maxGrade !== null && gradeRankOfUnit(unit) <= gradeRank(maxGrade);
      });
    }
    // Necklace of Swiftness's "Move one of your units 1 space": only offer a
    // unit that has at least one empty orthogonally-adjacent space to step onto
    // (occupied spaces, obstacles, Walls and the Gate are blocked) — otherwise
    // the move would be a no-op. Mirrors the Clone target filter.
    if (option.effect.type === "MOVE_UNIT_ADJACENT" && state.combat) {
      const combat = state.combat;
      const blocked = new Set<number>();
      for (const unit of Object.values(combat.units)) {
        if (isUnitAlive(unit)) {
          blocked.add(unit.position);
        }
      }
      for (const position of combat.obstacles ?? []) {
        blocked.add(position);
      }
      for (const position of combat.siege?.walls ?? []) {
        blocked.add(position);
      }
      if (combat.siege?.gatePosition != null) {
        blocked.add(combat.siege.gatePosition);
      }
      targets = targets.filter((candidate) => {
        if (candidate.type !== "unit") {
          return false;
        }
        const unit = combat.units[candidate.unitId];
        return Boolean(unit) && getOrthogonalNeighbors(unit!.position).some((position) => !blocked.has(position));
      });
    }
    // Boots of Polarity (option B): only units that actually carry a removable
    // ongoing effect are legal targets, so the play is never a no-op.
    if (option.effect.type === "REMOVE_ACTIVE_EFFECT") {
      targets = targets.filter(
        (candidate) =>
          candidate.type === "unit" &&
          state.activeEffects.some(
            (active) =>
              active.target?.type === "unit" &&
              active.target.unitId === candidate.unitId &&
              active.removable !== false
          )
      );
    }
    if (targets.length === 0) {
      continue;
    }

    for (const mode of modes) {
      for (const target of targets) {
        actions.push({
          label: `${card.name}: ${option.label}${mode === "expert" && !option.expertOnly ? " (expert)" : ""}${
            fromSpellBook ? " (Spell Book)" : ""
          }`,
          action: {
            type: "PLAY_CARD",
            playerId,
            cardId,
            mode,
            optionIndex,
            target,
            ...(fromSpellBook ? { fromSpellBook: true } : {})
          }
        });
      }
    }
  }
}

/** Expert sides of option effects playable outside reaction windows. */
function effectSupportsExpertOption(effect: ConcreteEffect): boolean {
  if (effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }
  if (effect.type === "GAIN_RESOURCES") {
    return effect.expertGain !== undefined;
  }
  if (effect.type === "GAIN_HERO_MOVEMENT") {
    return effect.expertAmount !== undefined;
  }
  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }
  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }
  // Eagle Eye: the expert play digs for an Expert spell instead.
  if (effect.type === "EAGLE_EYE_DIG") {
    return true;
  }
  return false;
}

/** Effects that do something useful when played on the adventure map. */
function isMapPlayableEffect(state: GameState, playerId: PlayerId, card: CardDefinition, effect: ConcreteEffect): boolean {
  if (card.timing === "map") {
    return true;
  }

  if (effect.type === "DRAW_CARDS" || effect.type === "GAIN_MORALE") {
    return true;
  }

  // Offense/Armorer (ADD_COMBAT_STAT) and Sorcery (ADD_SPELL_POWER) carry a
  // "then draw a card" rider: "may be played outside Combat just for the draw."
  // On the map the stat/Power has nothing to apply to and fizzles; the draw runs.
  if ((effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER") && effect.drawCards) {
    return true;
  }

  if (
    effect.type === "GAIN_RESOURCES" ||
    // Octavia's "Gold" / Melodia's "Fortune": roll Resource dice, gain morale /
    // gold, or raise the location-dice count — all map-only economy plays.
    effect.type === "RESOURCE_FORTUNE_PLAY" ||
    // Legion artifacts' discount side: banked on the map for the next recruit.
    effect.type === "GAIN_RECRUIT_DISCOUNT" ||
    effect.type === "ENEMY_MORALE_STRIP" ||
    effect.type === "ROLL_FOR_MORALE" ||
    effect.type === "RANDOM_ENEMY_DISCARD" ||
    effect.type === "GAIN_EXPERT_USE" ||
    // Gem's First Aid: grab the Tent from the supply (or draw) on the map.
    effect.type === "GAIN_WAR_MACHINE"
  ) {
    return true;
  }

  if (isOptionEffectPlayable(state, playerId, effect, "map") && effect.type !== "CREATE_ACTIVE_EFFECT") {
    return true;
  }

  // Fortune: its Attack-die reroll effect also rerolls the map Treasure/Resource
  // dice (the adventureDice flag), so it is useful on the adventure map.
  if (effect.type === "CREATE_ATTACK_DIE_REROLL" && effect.adventureDice) {
    return true;
  }

  return (
    effect.type === "CREATE_ACTIVE_EFFECT" &&
    effect.effect.modifiers.some(
      (modifier) =>
        modifier.type === "ADVENTURE_DIE_REROLL" ||
        modifier.type === "ADVENTURE_DIE_SET" ||
        modifier.type === "SEARCH_COUNT_OVERRIDE" ||
        modifier.type === "SPELL_SCHOOL_FETCH" ||
        modifier.type === "END_TURN_ADJACENT_MOVE" ||
        modifier.type === "HERO_MOVE_THROUGH"
    )
  );
}

/**
 * Cards playable during your own map turn, outside combat: Instant and
 * Ongoing cards (Luck before dice, Estates' gold, Scouting before a search,
 * Eagle Eye, map spells like Town Portal…). Map-timed cards can never be
 * used during combat.
 */
function addTurnCardActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary,
  // "combat-prep": the PvP pre-battle window. Both participants may play the same
  // hand cards they could on a map turn (artifacts/permanents like the Legion, an
  // Ability, Sandro's Cloak, an instant) to prepare for the fight — so a held card
  // is never wasted just because an enemy attacked mid-turn. The caller guarantees
  // the player is a participant still in prep; the live combat / active-player
  // gates below are relaxed for it, and map-MOVEMENT Spells (Town Portal) are
  // dropped since teleporting the hero out would break the pending battle.
  context: "map" | "combat-prep" = "map"
): void {
  const player = state.players[playerId];
  if (!player || state.pendingChoice || state.reactionWindow) {
    return;
  }
  if (context === "map" && (state.combat || !hasOpenAdventureTurn(state, playerId))) {
    return;
  }
  // Parallel turns: card plays can open choices/windows of their own, so they
  // wait while another player's interaction is resolving.
  if (context === "map" && parallelInteractionBlocker(state, playerId)) {
    return;
  }

  // Spell Book (house rule): a Map Spell in the Book may be cast on your turn
  // exactly like a hand Spell, flagged `fromSpellBook` so it resolves from (and
  // returns to the discard from) the Book. The Book holds only Spells; the gates
  // below drop anything that is not a Map-playable Spell.
  const turnCardSources: { cardId: CardId; fromSpellBook?: true }[] = [
    ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
    ...(bookCastSourcesEnabled(state)
      ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
      : [])
  ];

  for (const { cardId, fromSpellBook } of turnCardSources) {
    const card = cards[cardId];
    if (!card || card.implementationStatus !== "implemented") {
      continue;
    }

    if (context === "map" && !fromSpellBook && canUseAstrologersHeroEmpower(state, playerId, cardId)) {
      const effect = getActiveAstrologersCard(state)?.effect;
      const costGold = effect?.type === "PAID_EMPOWER_PER_TURN" ? effect.costGold : 4;
      actions.push({
        label: `Hero: pay ${costGold} gold to Empower ${card.name}`,
        action: { type: "ASTROLOGERS_HERO_EMPOWER", playerId, cardId }
      });
    }

    // PvP prep: a map-movement Spell (Town Portal et al.) would relocate the hero
    // out of the pending fight, so it is never offered in the prep window. Every
    // other card a map turn allows (permanents, instants, Sandro's Cloak …) is.
    if (context === "combat-prep" && card.kind === "spell" && card.timing === "map") {
      continue;
    }

    // Permanents may also enter play on the owner's map turn (they are
    // played the same way as map cards). A plain permanent offers a single
    // enter-play action; a hybrid permanent/instant artifact (income rings and
    // carts) exposes its enter-play side AND its one-shot instant side through
    // the CHOOSE_ONE option machinery below instead. (Book entries are Spells,
    // never permanents, so this branch never fires for them.)
    if (card.permanent && card.effect.type !== "CHOOSE_ONE") {
      actions.push({
        label: `Put ${card.name} into play`,
        action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
      });
      continue;
    }

    // Trigger cards wait for their windows — except the "+stat / +Power, then
    // draw a card" instants (Offense/Armorer's ADD_COMBAT_STAT, Sorcery's
    // ADD_SPELL_POWER), which may be played outside their window just for the
    // card draw: with no attack/spell to apply it to the stat/Power fizzles, but
    // the draw rider still resolves (see the matching reducer handler).
    const drawOnly =
      (card.effect.type === "ADD_COMBAT_STAT" || card.effect.type === "ADD_SPELL_POWER") &&
      Boolean(card.effect.drawCards);
    if (card.trigger && !drawOnly) {
      continue;
    }

    // Spells reach the map only when printed as Map effects (Town Portal) or
    // when their effect is otherwise useful there (Fortune's adventure-die
    // rerolls — same gate isMapPlayableEffect applies to non-spell cards).
    if (card.kind === "spell" && card.timing !== "map") {
      const mapUsable =
        card.effect.type !== "CHOOSE_ONE" && isMapPlayableEffect(state, playerId, card, card.effect);
      if (!mapUsable) {
        continue;
      }
    }

    if (card.timing !== "instant" && card.timing !== "ongoing" && card.timing !== "map") {
      continue;
    }

    if (card.effect.type === "CHOOSE_ONE") {
      // House-rule twin of the combat draw-only CHOOSE_ONE offer: a trigger SIDE
      // carrying a "+Power/+stat, then draw" rider (Scales of the Greater
      // Basilisk, Tunic of the Cyclops King, Armor of Wonder) may be played on
      // your MAP turn just for the draw — outside its reaction window the
      // stat/Power fizzles and only the draw resolves, and an ADD_SPELL_POWER
      // side banks +Power for the next map Spell (mapSpellPowerBank; see the
      // reducer draw-rider handler). Bypasses the card's reaction/combat
      // phaseLimit exactly like the combat draw-only play bypasses the window.
      if (!fromSpellBook) {
        for (const [optionIndex, option] of card.effect.options.entries()) {
          if (
            !option.trigger ||
            (option.effect.type !== "ADD_COMBAT_STAT" && option.effect.type !== "ADD_SPELL_POWER") ||
            !option.effect.drawCards ||
            !canAffordCardCost(state, playerId, cardId, option.cost)
          ) {
            continue;
          }
          actions.push({
            label: `${card.name}: ${option.label} (draw only${
              option.effect.type === "ADD_SPELL_POWER" ? ", next Spell +Power" : ""
            })`,
            action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", optionIndex, target: { type: "none" } }
          });
        }
      }
      addOptionPlays(actions, state, playerId, card, cardId, "map", cards, undefined, fromSpellBook);
      continue;
    }

    // Necromancy is NEVER a free-turn play: it is legal ONLY in the now-or-never
    // after-combat window (the pendingNecromancy gate in
    // getAdventureLegalActions, surfaced via addNecromancyPlays). Skip it here so
    // a player can't bank gold during the turn and reinforce cheaply later.
    if (card.effect.type === "NECROMANCY_REINFORCE") {
      continue;
    }

    // Sandro's Cloak: place the specialty card on a matching unit card during
    // your turn (it rides into the next combat).
    if (card.effect.type === "TRANSFORM_UNIT") {
      const effectDef = card.effect;
      for (const armyUnit of player.army) {
        const def = coreUnitDefinitions[armyUnit.unitDefId];
        if (
          def &&
          armyUnit.side !== "bank" &&
          canPlaceTransformOn(def.name, armyUnit.side, armyUnit.transforms, effectDef)
        ) {
          actions.push({
            label: `Place ${card.name} on ${def.name}`,
            action: {
              type: "PLAY_CARD",
              playerId,
              cardId,
              mode: "basic",
              target: { type: "none" },
              armyUnitId: armyUnit.id
            }
          });
        }
      }
      continue;
    }

    const effect = card.effect;
    if (!isMapPlayableEffect(state, playerId, card, effect)) {
      continue;
    }

    const modes: CardPlayMode[] =
      effectSupportsExpertOption(effect) && canPlayExpertMode(player, cardId) ? ["basic", "expert"] : ["basic"];
    for (const mode of modes) {
      actions.push({
        label: `Play ${card.name}${mode === "expert" ? " (expert)" : ""}${fromSpellBook ? " (Spell Book)" : ""}`,
        action: {
          type: "PLAY_CARD",
          playerId,
          cardId,
          mode,
          target: { type: "none" },
          ...(fromSpellBook ? { fromSpellBook: true } : {})
        }
      });
    }
  }
}

function formatResourceCost(cost: ResourceCost): string {
  return (
    Object.entries(cost)
      .filter(([, amount]) => (amount ?? 0) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" + ") || "free"
  );
}

/**
 * Necromancy and Hill Fort now bank their reinforcement offer instead of
 * forcing an immediate target. The source discount is priced first; any
 * currently banked Legion/Stables gold discount is then deducted from the
 * amount shown and paid here.
 */
function addBankedReinforcementActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId
): void {
  const player = state.players[playerId];
  if (!player || state.combat || !hasOpenAdventureTurn(state, playerId)) {
    return;
  }

  for (const discount of player.reinforcementDiscounts ?? []) {
    for (const unit of player.army) {
      const name = coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId;
      const reinforceCost = reinforcementDiscountCostFor(state, playerId, discount.id, unit.id, "reinforce");
      if (reinforceCost && hasRecruitResources(state, playerId, reinforceCost)) {
        actions.push({
          label: `${discount.sourceName}: reinforce ${name} (${formatResourceCost(reinforceCost)})`,
          action: {
            type: "REDEEM_REINFORCEMENT_DISCOUNT",
            playerId,
            discountId: discount.id,
            armyUnitId: unit.id,
            kind: "reinforce"
          }
        });
      }

      const stackCost = reinforcementDiscountCostFor(state, playerId, discount.id, unit.id, "stack");
      if (stackCost && hasRecruitResources(state, playerId, stackCost)) {
        actions.push({
          label: `${discount.sourceName}: increase ${name} stack (${formatResourceCost(stackCost)})`,
          action: {
            type: "REDEEM_REINFORCEMENT_DISCOUNT",
            playerId,
            discountId: discount.id,
            armyUnitId: unit.id,
            kind: "stack"
          }
        });
      }
    }
  }
}

/**
 * Spell Book (house rule): on your own map turn you may move any Spell from hand
 * into your Spell Book, freeing the hand slot without drawing a replacement.
 * Offered only outside combat / reaction windows / pending choices — the same
 * "your map turn" gate addTurnCardActions uses.
 */
function addSpellBookStashActions(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  if (!spellBookRuleEnabled(state)) {
    return;
  }
  const player = state.players[playerId];
  if (!player || state.combat || !hasOpenAdventureTurn(state, playerId) || state.pendingChoice || state.reactionWindow) {
    return;
  }
  // Over the hand limit at the start of the turn, the forced discard
  // (REFRESH_HAND) must be resolved FIRST — you cannot dodge it by stashing a
  // Spell into the Book. getAdventureLegalActions already returns before reaching
  // here while needsHandRefresh is set; this guard states the rule explicitly.
  if (player.needsHandRefresh) {
    return;
  }
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    // Magic Arrow (any starting-only Spell) may be held and cast, but never
    // stashed — it has no Spell Book home (spellCanEnterSpellBook).
    if (card?.kind === "spell" && spellCanEnterSpellBook(cardId)) {
      actions.push({
        label: `Move ${card.name} to your Spell Book`,
        action: { type: "MOVE_SPELL_TO_SPELL_BOOK", playerId, cardId }
      });
    }
  }
}

/**
 * The after-combat Necromancy plays for a Necropolis player who holds one —
 * EVERY copy in hand, printed board card OR one searched/drawn from the shared
 * Ability deck (wiki p.24: the "keep it without being able to play it" clause is
 * for NON-Necropolis heroes only). Vidomina's specialties pin the tier (no
 * expert crown); the printed ability may be played basic, or expert when a crown
 * use is spare. Used only inside the pendingNecromancy now-or-never gate.
 */
/**
 * WOG Commanders — map-turn actions on the player's own turn:
 *  - COMMANDER_GRADE_UP: one action per stat below grade 3, while the commander
 *    has at least one unspent stat point;
 *  - REVIVE_COMMANDER: pay 2 + 2x hero level gold to bring a dead commander back.
 */
function addCommanderMapActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  const commander = player?.commander;
  if (!player || !commander || state.combat) {
    return;
  }

  if ((commander.gradePoints ?? 0) > 0) {
    // The mastery gate (grade 2 → 3 needs hero level 5+) filters the offers, so
    // the legal actions mirror what the reducer will actually accept.
    const heroLevel = getMainHeroOf(state, playerId)?.level ?? 1;
    for (const stat of commanderGradeUpChoices(commander, heroLevel)) {
      actions.push({
        label: `Commander grade-up: raise ${stat}`,
        action: {
          type: "COMMANDER_GRADE_UP",
          playerId,
          stat
        }
      });
    }
  }

  if (commander.dead) {
    const hero = getMainHeroOf(state, playerId);
    const cost = commanderReviveCost(hero?.level ?? 1);
    if ((player.resources.gold ?? 0) >= cost) {
      actions.push({
        label: `Revive the commander (${cost} gold)`,
        action: { type: "REVIVE_COMMANDER", playerId }
      });
    }
  }
}

function getMainHeroOf(state: GameState, playerId: PlayerId): HeroState | null {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      return hero;
    }
  }
  return null;
}

function addNecromancyPlays(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  const player = state.players[playerId];
  if (!player || player.factionId !== "necropolis") {
    return;
  }

  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.effect.type !== "NECROMANCY_REINFORCE") {
      continue;
    }
    // A Necropolis hero may play EVERY Necromancy copy it holds, including one
    // searched/drawn from the shared Ability deck — the printed "keep it without
    // being able to play it" clause is for NON-Necropolis heroes only (wiki
    // p.24). No deck-drawn exclusion here (see playerCanPlayNecromancy).

    if (card.effect.forceMode) {
      actions.push({
        label: `Play ${card.name}`,
        action: { type: "PLAY_CARD", playerId, cardId, mode: "basic", target: { type: "none" } }
      });
    } else {
      const modes: CardPlayMode[] = canPlayExpertMode(player, cardId) ? ["basic", "expert"] : ["basic"];
      for (const mode of modes) {
        actions.push({
          label: `Play ${card.name}${mode === "expert" ? " (expert)" : ""}`,
          action: { type: "PLAY_CARD", playerId, cardId, mode, target: { type: "none" } }
        });
      }
    }
  }
}

function isSimultaneousTurnAvailable(state: GameState, playerId: PlayerId): boolean {
  return (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction" &&
    !state.turn.completedPlayerIds.includes(playerId)
  );
}

/**
 * Rulebook voluntary removal: the owner may put an in-play permanent into
 * the discard pile at any open moment (no reaction window or choice pending).
 */
function addPermanentDiscardActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }

  for (const cardId of getPermanentCardIds(state, playerId)) {
    const name = cardLibrary[cardId]?.name ?? cardId;
    actions.push({
      label: `Discard ${name} from play`,
      action: { type: "DISCARD_PERMANENT", playerId, cardId }
    });

    // Income permanents (Eversmoking Ring of Sulfur, Inexhaustible Cart of Ore)
    // can be cracked open for their one-off instant gain even after the income
    // side was chosen and the card is sitting in the permanent slot.
    const crackGain = permanentCrackOpenGain(cardId);
    if (crackGain) {
      const parts = [
        crackGain.gold ? `${crackGain.gold} gold` : null,
        crackGain.buildingMaterials ? `${crackGain.buildingMaterials} building materials` : null,
        crackGain.valuables ? `${crackGain.valuables} valuables` : null
      ].filter((part): part is string => part !== null);
      actions.push({
        label: `Crack ${name} open: gain ${parts.join(", ")}`,
        action: { type: "CRACK_PERMANENT", playerId, cardId }
      });
    }
  }
}

function addActiveEffectActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || state.phase !== "combat" || state.stack.length > 0 || state.reactionWindow || state.pendingChoice) {
    return;
  }
  actions.push(...firstAidHealActions(state, playerId));
}

/**
 * The First Aid Tent (and any HEAL_ONCE_PER_COMBAT_ROUND active effect) heal
 * plays available to `playerId` right now — one per wounded friendly unit. This
 * is the *content* of the heal offer with no timing gate of its own, so it can
 * be surfaced both on the player's turn (addActiveEffectActions) and as an
 * instant reaction the moment one of their units is attacked
 * (getLegalReactionsForTrigger), letting the owner mend a wound BEFORE the
 * incoming attack's damage is calculated.
 */
export function firstAidHealActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }

  const out: LegalAction[] = [];
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }

    const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
    if (!healModifier || healModifier.type !== "HEAL_ONCE_PER_COMBAT_ROUND") {
      continue;
    }

    // First Aid Tent: one basic heal per round, OR — if the player holds the
    // First Aid ability card with a free expert use — spend it (discarding the
    // card) to heal the same target several times this round. The volley size is
    // read from that card (firstAidVolleyHeals), mirroring Artillery/Ballista.
    const usage = effect.healRound?.round === combat.round ? effect.healRound : undefined;
    const expertMax = firstAidVolleyHeals();
    const canBasic = !usage;
    const canExpertActivate = !usage && playerCanUseFirstAidVolley(state, playerId);
    const canExpertContinue = Boolean(usage?.expert && usage.count < expertMax);
    if (!canBasic && !canExpertActivate && !canExpertContinue) {
      continue;
    }

    for (const unit of Object.values(combat.units)) {
      if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
        continue;
      }
      const target = { type: "unit" as const, unitId: unit.id };

      // Basic heal and expert continuations omit the mode (it defaults to
      // basic), so plays submitted without a mode still match.
      if (canBasic) {
        out.push({
          label: `${effect.name} heal ${unit.name}`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target }
        });
      }
      if (canExpertActivate) {
        out.push({
          label: `${effect.name} expert: heal ${unit.name} (1/${expertMax}, spend 1 crown)`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target, mode: "expert" }
        });
      }
      // The expert volley resolves against the SAME target each time, so only
      // the unit pinned by the first expert heal is offered the continuation.
      if (canExpertContinue && (!usage?.targetUnitId || usage.targetUnitId === unit.id)) {
        out.push({
          label: `${effect.name} heal ${unit.name} (${(usage?.count ?? 0) + 1}/${expertMax})`,
          action: { type: "USE_ACTIVE_EFFECT", playerId, effectId: effect.id, target }
        });
      }
    }
  }
  return out;
}

const FIRST_AID_ABILITY_CARD_ID = "ability.first_aid" as CardId;

/**
 * The First Aid ability card's BASIC heal played as an instant reaction the
 * moment one of `playerId`'s units is attacked — one offer per wounded friendly
 * unit, the chosen target travelling on the reaction's `target` (mirroring the
 * Bowstring ranged-activation reaction). This is the card held in hand mending 1
 * damage BEFORE the incoming hit is calculated, so a healed unit can survive a
 * blow that would otherwise defeat it. It is available even WITHOUT a First Aid
 * Tent in play (the Tent's own per-round heal is surfaced separately by
 * firstAidHealActions). The card's EXPERT side is never played from hand — it
 * rides the Tent's heal (USE_ACTIVE_EFFECT, mode "expert"), so only the basic
 * side (option 0) is offered here.
 */
export function firstAidCardHealReactions(state: GameState, playerId: PlayerId): LegalAction[] {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || !player || isHandLockedInCombat(state, playerId)) {
    return [];
  }
  if (!player.hand.includes(FIRST_AID_ABILITY_CARD_ID)) {
    return [];
  }
  const card = cardLibrary[FIRST_AID_ABILITY_CARD_ID];
  if (!card || card.implementationStatus !== "implemented") {
    return [];
  }

  const out: LegalAction[] = [];
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
      continue;
    }
    out.push(
      makeReactionAction(`${card.name} heal ${unit.name}`, {
        type: "PLAY_REACTION",
        playerId,
        cardId: FIRST_AID_ABILITY_CARD_ID,
        mode: "basic",
        optionIndex: 0,
        target: { type: "unit", unitId: unit.id }
      })
    );
  }
  return out;
}

/**
 * Instant heal spells (Cure) and similar hand heals playable as a reaction the
 * moment damage is about to land — either from a declared attack OR from a
 * pending damaging Spell / specialty on the stack. One offer per wounded
 * friendly unit; the target rides on the reaction. Spell-limit and cast-lock
 * gates match other instant spell reactions.
 */
export function instantHealSpellReactions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): LegalAction[] {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || !player || isHandLockedInCombat(state, playerId)) {
    return [];
  }
  // Recanter's Cloak ("no Hero can use Spells") and the per-round Spell limit
  // gate SPELL-kind heals only; a non-Spell heal instant (if any) would still be
  // offerable without burning the Spell slot.
  const spellsLocked = getSpellCastRestriction(state).lockAll;
  const spellLimitLeft = spellLimitFor(state, player) - player.combatStats.spellsCastThisRound;

  const sources: { cardId: CardId; fromSpellBook?: true }[] = [
    ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
    ...(bookCastSourcesEnabled(state)
      ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
      : [])
  ];

  const out: LegalAction[] = [];
  for (const { cardId, fromSpellBook } of sources) {
    const card = cards[cardId];
    if (
      !card ||
      card.implementationStatus !== "implemented" ||
      (card.timing !== "instant" && card.timing !== "reaction")
    ) {
      continue;
    }
    if (card.kind === "spell" && (spellsLocked || spellLimitLeft <= 0)) {
      continue;
    }

    for (const variant of getCardPlayVariants(card)) {
      if (
        variant.mapOnly ||
        variant.expertOnly ||
        (variant.effect.type !== "HEAL_DAMAGE" && variant.effect.type !== "HEAL_DAMAGE_AND_REMOVE_EFFECTS") ||
        !canAffordCardCost(state, playerId, cardId, variant.cost)
      ) {
        continue;
      }
      // Cure and kin need a wounded friendly unit to target.
      for (const unit of Object.values(combat.units)) {
        if (unit.controllerId !== playerId || !isUnitAlive(unit) || unit.damage <= 0) {
          continue;
        }
        const variantName = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
        out.push(
          makeReactionAction(`${variantName} heal ${unit.name}${fromSpellBook ? " (Spell Book)" : ""}`, {
            type: "PLAY_REACTION",
            playerId,
            cardId,
            mode: "basic",
            ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
            ...(fromSpellBook ? { fromSpellBook: true } : {}),
            target: { type: "unit", unitId: unit.id }
          })
        );
      }
    }
  }
  return out;
}

type ConcreteEffectDef = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;

/** Concrete effects that assign combat damage to units when resolved. */
function effectDealsCombatDamage(effect: ConcreteEffectDef | null | undefined): boolean {
  if (!effect) {
    return false;
  }
  return (
    effect.type === "DEAL_DAMAGE" ||
    effect.type === "AREA_DAMAGE_ADJACENT" ||
    effect.type === "AREA_DAMAGE_ALL_ADJACENT" ||
    effect.type === "AREA_DAMAGE_PICK_ADJACENT" ||
    effect.type === "INFERNO" ||
    effect.type === "CHAIN_LIGHTNING" ||
    effect.type === "DISCARD_WAR_MACHINE_DAMAGE" ||
    effect.type === "DAMAGE_CHOSEN_ENEMIES"
  );
}

/**
 * Whether `playerId` controls at least one living unit that a pending
 * SPELL_CAST_STARTED damage effect would (or could) hit — primary target,
 * area blast, or specialty damage on the stack. Used to offer pre-hit heals
 * (Cure / First Aid) only when damage is actually coming, so a Haste or Cure
 * cast never opens a forced heal window.
 */
export function playerThreatenedByPendingDamage(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): boolean {
  const combat = state.combat;
  const stackItem = getPendingStackItem(state, triggerEvent);
  if (!combat || !stackItem) {
    return false;
  }

  if (stackItem.action.type === "CAST_SPELL") {
    const card = cards[stackItem.action.cardId];
    if (!card || card.kind !== "spell") {
      return false;
    }
    const effect =
      getEffectiveCardEffect(card, stackItem.action.optionIndex) ??
      (card.effect.type !== "CHOOSE_ONE" ? card.effect : null);
    // Area / multi-target: any of our units in the predicted blast.
    if (
      spellPotentialBlastUnitIds(state, stackItem, cards).some(
        (unitId) => combat.units[unitId]?.controllerId === playerId
      )
    ) {
      return true;
    }
    // Single-target damaging Spell aimed at one of our units.
    if (effectDealsCombatDamage(effect) && pendingSpellTargetForPlayer(state, triggerEvent, playerId)) {
      return true;
    }
    // CHAIN_LIGHTNING and other unit-primary damages that are not in the blast
    // helper still hit the primary target.
    if (
      effect &&
      (effect.type === "CHAIN_LIGHTNING" || effect.type === "DEAL_DAMAGE") &&
      stackItem.action.target.type === "unit"
    ) {
      const primary = combat.units[stackItem.action.target.unitId];
      if (primary && primary.controllerId === playerId && isUnitAlive(primary)) {
        return true;
      }
    }
    return false;
  }

  // Specialty (or other) damage card deferred onto the stack so heals can fire
  // before the hit — Frost Ring / Meteor Shower area specialties, Ballista discard.
  if (stackItem.action.type === "PLAY_CARD") {
    const card = cards[stackItem.action.cardId];
    if (!card) {
      return false;
    }
    const effect = getEffectiveCardEffect(card, stackItem.action.optionIndex);
    if (!effectDealsCombatDamage(effect)) {
      return false;
    }
    return unitIdsThreatenedByDamageEffect(state, effect!, stackItem.action.target).some(
      (unitId) => combat.units[unitId]?.controllerId === playerId
    );
  }

  return false;
}

/**
 * Living unit ids a damage effect would (or could) hit from its chosen target.
 * Used for specialty pre-hit heal windows and the threat gate above.
 */
export function unitIdsThreatenedByDamageEffect(
  state: GameState,
  effect: ConcreteEffectDef,
  target: TargetRef | undefined
): UnitId[] {
  const combat = state.combat;
  if (!combat || !target) {
    return [];
  }

  if (
    (effect.type === "DEAL_DAMAGE" ||
      effect.type === "DISCARD_WAR_MACHINE_DAMAGE" ||
      effect.type === "DAMAGE_CHOSEN_ENEMIES") &&
    target.type === "unit"
  ) {
    const unit = combat.units[target.unitId];
    return unit && isUnitAlive(unit) ? [unit.id] : [];
  }

  if (effect.type === "AREA_DAMAGE_ADJACENT" && target.type === "unit") {
    const primary = combat.units[target.unitId];
    if (!primary || !isUnitAlive(primary)) {
      return [];
    }
    return Object.values(combat.units)
      .filter(
        (unit) => isUnitAlive(unit) && (unit.id === primary.id || isAdjacent(unit.position, primary.position))
      )
      .map((unit) => unit.id);
  }

  if (effect.type === "AREA_DAMAGE_ALL_ADJACENT" || effect.type === "INFERNO") {
    const center =
      target.type === "space"
        ? target.position
        : target.type === "unit"
          ? combat.units[target.unitId]?.position
          : undefined;
    if (center === undefined) {
      return [];
    }
    return unitsOnPositions(combat, new Set([center, ...getOrthogonalNeighbors(center)]));
  }

  if (effect.type === "AREA_DAMAGE_PICK_ADJACENT") {
    const center =
      target.type === "space"
        ? target.position
        : target.type === "unit"
          ? combat.units[target.unitId]?.position
          : undefined;
    if (center === undefined) {
      return [];
    }
    const blast = new Set<number>(getOrthogonalNeighbors(center));
    if (effect.includeCenter) {
      blast.add(center);
    }
    return unitsOnPositions(combat, blast);
  }

  return [];
}

/**
 * First Aid Tent + First Aid ability + Cure (and kin) offered to a player whose
 * units are about to take damage — the shared pre-hit heal package for both
 * attack windows and damaging Spell/specialty windows.
 */
export function preHitHealReactions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary
): LegalAction[] {
  return [
    ...firstAidHealActions(state, playerId),
    ...firstAidCardHealReactions(state, playerId),
    ...instantHealSpellReactions(state, playerId, cards)
  ];
}

/**
 * Human-readable command label for a `PLACE_TOKEN_ACTION` "[activation]" other
 * action (Ogres' Bloodlust, Sorceresses' Weakness). Names the ability AND what
 * it does — "place it on <side> unit (<±amount>)" — so the command reads like a
 * proper instruction, not a bare "Bloodlust Token (+1)". Shared by the player
 * offer (addUnitAbilityActions) and the PvP-Neutral-Control offer
 * (addControlledNeutralTokenActions) so both stay in lockstep.
 */
function placeTokenCommandLabel(
  unitName: string,
  abilityName: string,
  targets: "any" | "friendly" | "enemy",
  amount: number
): string {
  const sideWord = targets === "enemy" ? "an enemy" : targets === "friendly" ? "a friendly" : "a";
  return `${unitName}: ${abilityName} — place it on ${sideWord} unit (${amount >= 0 ? "+" : ""}${amount})`;
}

function addUnitAbilityActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || activeUnit.movedThisActivation) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(activeUnit)) {
    if (ability.implementationStatus !== "implemented") {
      continue;
    }

    if (ability.effect?.type === "ACTIVATION_ATTACK_BUFF") {
      for (const target of Object.values(combat.units)) {
        if (
          target.controllerId !== playerId ||
          !isUnitAlive(target) ||
          !ability.effect.targetTypes.includes(target.type)
        ) {
          continue;
        }

        actions.push({
          label: `${activeUnit.name} use ${ability.name} on ${target.name}`,
          action: {
            type: "USE_UNIT_ABILITY",
            playerId,
            unitId: activeUnit.id,
            abilityId: ability.id,
            target: { type: "unit", unitId: target.id }
          }
        });
      }
    }

    // Pit Lords' "Summon Demons" other action: only after a friendly unit has
    // been removed this combat, and once per combat per Pit Lords unit. Used
    // instead of moving or attacking (the caller already gated on those).
    // Official: only ONE Demons unit on the field (Few or Pack). House rule
    // `multi-demon-summon` allows summoning additional stacks.
    if (
      ability.effect?.type === "SUMMON_OR_REINFORCE_DEMONS" &&
      combat.unitRemovedControllerIds?.includes(playerId) &&
      !activeUnit.summonedThisCombat
    ) {
      const demonDefId = ability.effect.demonUnitDefId;
      const demonName = coreUnitDefinitions[demonDefId]?.name ?? "Demons";
      const livingDemons = Object.values(combat.units).filter(
        (candidate) =>
          candidate.controllerId === playerId &&
          isUnitAlive(candidate) &&
          candidate.unitDefId === demonDefId
      );
      const multiDemonOk = houseRuleEnabled(state, "multi-demon-summon");
      const canSummonNew = multiDemonOk || livingDemons.length === 0;

      // Summon: place a Few of Demons on an empty adjacent space.
      if (canSummonNew && getUnitSide(demonDefId, "few")) {
        const occupied = new Set<number>(
          Object.values(combat.units)
            .filter(isUnitAlive)
            .map((candidate) => candidate.position)
        );
        for (const position of combat.obstacles ?? []) {
          occupied.add(position);
        }
        for (const position of getOrthogonalNeighbors(activeUnit.position)) {
          if (!isBattlefieldPosition(position) || occupied.has(position)) {
            continue;
          }
          actions.push({
            label: `${activeUnit.name}: Summon a Few of ${demonName} at ${getBattlefieldLabel(position)}`,
            action: { type: "SUMMON_DEMONS", playerId, unitId: activeUnit.id, mode: "summon", position }
          });
        }
      }

      // Reinforce: flip a friendly Few of Demons up to a Pack at no cost.
      if (getUnitSide(demonDefId, "pack")) {
        for (const candidate of livingDemons) {
          if (candidate.variant === "few") {
            actions.push({
              label: `${activeUnit.name}: Reinforce ${candidate.cardName} to a Pack`,
              action: {
                type: "SUMMON_DEMONS",
                playerId,
                unitId: activeUnit.id,
                mode: "reinforce",
                targetUnitId: candidate.id
              }
            });
          }
        }
      }

      // Unit Stacks (Polish / Anime): add ONE free Stack layer to a living Pack
      // of Demons below its tier cap. This is the stack-mode path for Summon
      // Demons — without it, a table with only Pack Demons (no Few left to
      // reinforce) and multi-demon-summon OFF had no legal Summon action after
      // a friendly died.
      if (armyUnitStacksActive(state)) {
        for (const candidate of livingDemons) {
          if (candidate.variant !== "pack") {
            continue;
          }
          const armyCard = state.players[playerId]?.army.find(
            (entry) => entry.id === candidate.armyUnitId
          );
          // Prefer the army card (cap + side), fall back to the combat unit's
          // live stack count when the army card is missing (shouldn't happen).
          const canStack = armyCard
            ? polishArmyUnitCanBuyStack(armyCard)
            : (candidate.armyStacks ?? 0) < polishUnitStackCap(demonDefId, "pack");
          if (!canStack) {
            continue;
          }
          actions.push({
            label: `${activeUnit.name}: Add a Stack to ${candidate.cardName}`,
            action: {
              type: "SUMMON_DEMONS",
              playerId,
              unitId: activeUnit.id,
              mode: "stack",
              targetUnitId: candidate.id
            }
          });
        }
      }
    }

    // Token "other actions": Ogres' Attack ("Bloodlust") token, Few Sorceresses'
    // Weakness token. A single "use" command opens a board target picker (the
    // ABILITY_TARGET_CHOICE the player resolves by clicking a glowing unit) —
    // offered only when at least one legal recipient exists, so a side with no
    // eligible target never advertises a dead button.
    if (ability.effect?.type === "PLACE_TOKEN_ACTION") {
      const effect = ability.effect;
      const hasCandidate = Object.values(combat.units).some((target) => {
        const sideOk =
          effect.targets === "any" ||
          (effect.targets === "friendly" && target.controllerId === activeUnit.controllerId) ||
          (effect.targets === "enemy" && target.controllerId !== activeUnit.controllerId);
        return (
          sideOk &&
          isUnitAlive(target) &&
          !isArrowTowerUnit(target) &&
          (!effect.targetTypes || effect.targetTypes.includes(target.type))
        );
      });
      if (hasCandidate) {
        actions.push({
          label: placeTokenCommandLabel(activeUnit.name, ability.name, effect.targets, effect.amount),
          action: {
            type: "USE_UNIT_ABILITY",
            playerId,
            unitId: activeUnit.id,
            abilityId: ability.id,
            target: { type: "none" }
          }
        });
      }
    }

    // WOG commander command ability: a single "cast" command that opens the
    // board target picker. Offered only during the commander's own activation,
    // before it moves/attacks, once per combat round, with the rune cost
    // payable and at least one legal target (commanderCastAvailable).
    if (ability.effect?.type === "COMMANDER_CAST" && commanderCastAvailable(state, activeUnit)) {
      const power = commanderCastPower(state, activeUnit);
      const runeCost = commanderCastRuneCost(state, activeUnit);
      actions.push({
        label: `${activeUnit.cardName}: cast ${ability.name} (Power ${power}${runeCost > 0 ? `, ${runeCost} Runes` : ""})`,
        action: {
          type: "USE_UNIT_ABILITY",
          playerId,
          unitId: activeUnit.id,
          abilityId: ability.id,
          target: { type: "none" }
        }
      });
    }

    // Tower Genies (Few) "Wish" other action: dig Spells out of your own deck.
    // Used instead of moving/attacking, and only when the deck (or its discard
    // pile, which reshuffles in) still holds a card to dig.
    if (
      ability.effect?.type === "DECK_DISCARD_TAKE_SPELL" &&
      ability.effect.trigger === "other-action" &&
      !activeUnit.attackedThisActivation
    ) {
      const player = state.players[playerId];
      const hasDeckCards = (player?.deck.length ?? 0) + (player?.discard.length ?? 0) > 0;
      // Polish Spell Book: the Wish's payoff is refreshing a used Book Spell,
      // which does not depend on what the dig turns up — so the offer keys off
      // a used Spell existing (an empty deck digs 0 and still refreshes).
      // Outside the Polish rule the printed dig is the whole ability, so it
      // needs cards to dig.
      const usable = polishSpellBookEnabled(state)
        ? (player?.spellBookUsed?.length ?? 0) > 0
        : hasDeckCards;
      if (usable) {
        actions.push({
          label: polishSpellBookEnabled(state)
            ? `${activeUnit.name}: ${ability.name} (discard ${ability.effect.count} from your deck, refresh a used Book Spell)`
            : `${activeUnit.name}: ${ability.name} (discard ${ability.effect.count} from your deck, take a Spell)`,
          action: { type: "USE_GENIE_DECK_DRAW", playerId, unitId: activeUnit.id }
        });
      }
    }
  }
}

/**
 * Siege demolition: the active unit may bring down a Wall or the Gate as its
 * attack — adjacent ground/flying units always, Cyclops-style units at any
 * range (their pack version also levels the Arrow Tower).
 */
function addFortificationActions(actions: LegalAction[], state: GameState, playerId: PlayerId, activeUnit: CombatUnitState): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege || activeUnit.attackedThisActivation) {
    return;
  }

  const demolish = getDemolishAbility(activeUnit);
  const targets: { kind: "wall" | "gate"; position: number }[] = [
    ...siege.walls.map((position) => ({ kind: "wall" as const, position })),
    ...(siege.gatePosition !== null ? [{ kind: "gate" as const, position: siege.gatePosition }] : [])
  ];

  for (const target of targets) {
    const adjacentDemolisher =
      activeUnit.type !== "ranged" && isAdjacent(activeUnit.position, target.position);
    if (!adjacentDemolisher && !demolish) {
      continue;
    }

    actions.push({
      label: `${activeUnit.cardName} destroy the ${target.kind === "wall" ? "Wall" : "Gate"} at ${getBattlefieldLabel(target.position)}`,
      action: { type: "ATTACK_FORTIFICATION", playerId, attackerId: activeUnit.id, target }
    });
  }

  if (demolish?.canTargetArrowTower && siege.arrowTowerUnitId) {
    actions.push({
      label: `${activeUnit.cardName} destroy the Arrow Tower`,
      action: { type: "ATTACK_FORTIFICATION", playerId, attackerId: activeUnit.id, target: { kind: "arrow-tower" } }
    });
  }
}

/** Berserk: move destinations that step strictly closer to a nearest target. */
function berserkApproachSquares(
  unit: CombatUnitState,
  nearest: CombatUnitState[],
  moveDestinations: number[]
): number[] {
  return moveDestinations.filter((space) =>
    nearest.some(
      (target) =>
        getBattlefieldDistance(space, target.position) <
        getBattlefieldDistance(unit.position, target.position)
    )
  );
}

/**
 * The forced menu of a berserked unit: it must attack the nearest unit (friend
 * or foe) or move to the nearest unit and attack it. In priority order —
 *  1. strike a nearest unit it can already hit (the only options offered);
 *  2. else move-and-attack / step adjacent to a nearest unit to strike this turn
 *     (those squares only — the board's move-then-attack flow forces the hit);
 *  3. else advance on a nearest unit (the squares that close the distance);
 *  4. else (boxed in, or alone on the board) hold.
 * Every branch drops Defend, abilities and free movement — that is the spell.
 */
function addBerserkUnitActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  activeUnit: CombatUnitState
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const hold: LegalAction = {
    label: `${activeUnit.name} hold position`,
    action: { type: "END_ACTIVATION", playerId, unitId: activeUnit.id }
  };

  // Its forced strike is spent — the activation is over.
  if (activeUnit.attackedThisActivation) {
    actions.push(hold);
    return;
  }

  const nearest = getBerserkNearestTargets(combat, activeUnit);
  if (nearest.length === 0) {
    actions.push(hold);
    return;
  }

  // 1. Attack a nearest unit it can reach from here (ranged shots included).
  let canStrikeNow = false;
  for (const target of nearest) {
    if (canUnitAttack(combat, activeUnit, target, state.activeEffects)) {
      canStrikeNow = true;
      actions.push({
        label: `${activeUnit.name} attack ${target.name}`,
        action: { type: "ATTACK_UNIT", playerId, attackerId: activeUnit.id, defenderId: target.id }
      });
    }
  }
  if (canStrikeNow) {
    return;
  }

  const moveDestinations = getLegalMoveDestinations(combat, activeUnit, state);
  if (moveDestinations.length === 0) {
    actions.push(hold);
    return;
  }

  // 2. Close in and strike a nearest unit this activation.
  const strikeSquares = new Set<number>();
  for (const target of nearest) {
    for (const space of moveDestinations) {
      if (isAdjacent(space, target.position) && canUnitMoveAndAttack(combat, activeUnit, space, target, state)) {
        strikeSquares.add(space);
        actions.push({
          label: `${activeUnit.name} move to ${getBattlefieldLabel(space)} and attack ${target.name}`,
          action: {
            type: "MOVE_AND_ATTACK_UNIT",
            playerId,
            attackerId: activeUnit.id,
            destination: space,
            defenderId: target.id
          }
        });
      }
    }
  }
  if (strikeSquares.size > 0) {
    for (const space of strikeSquares) {
      actions.push({
        label: `${activeUnit.name} move to ${getBattlefieldLabel(space)}`,
        action: { type: "MOVE_UNIT", playerId, unitId: activeUnit.id, destination: space }
      });
    }
    return;
  }

  // 3. Cannot reach a strike — advance on a nearest unit (closing squares only).
  const approaches = berserkApproachSquares(activeUnit, nearest, moveDestinations);
  if (approaches.length === 0) {
    actions.push(hold);
    return;
  }
  for (const space of approaches) {
    actions.push({
      label: `${activeUnit.name} move to ${getBattlefieldLabel(space)}`,
      action: { type: "MOVE_UNIT", playerId, unitId: activeUnit.id, destination: space }
    });
  }
}

/**
 * The token-placement "other actions" a CONTROLLED neutral guard may use in the
 * FREE-play menu (user rule "mode free: do whatever" — including "use token"):
 * the Ogres' Bloodlust Attack token and the Sorceresses' Weakness token
 * (`PLACE_TOKEN_ACTION`). These are the one guard "other action" that reads only
 * the guard's OWN side (`activeUnit.controllerId`), so they are neutral-safe. The
 * deck-digging (Genie Wish) and Summon Demons other-actions stay OFF a controlled
 * guard — they read the CONTROLLER's own deck / removed units, not the neutral
 * side, so handing them over would be a bug/exploit, and the AI never used them.
 *
 * The offer is issued for the controlling `playerId`; the dispatch re-stamps it
 * to the neutral seat (asNeutralSeatCommand in reducer.ts), and the target-pick
 * choice it opens is a NEUTRAL-owned choice the pump hands back to the controller
 * — exactly like the guards' [activation] follow-ups.
 */
function addControlledNeutralTokenActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  activeUnit: CombatUnitState
): void {
  const combat = state.combat;
  // A token "other action" is used INSTEAD of moving/attacking — never once the
  // guard has begun to move (mirrors addUnitAbilityActions' own gate).
  if (!combat || activeUnit.movedThisActivation) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(activeUnit)) {
    if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "PLACE_TOKEN_ACTION") {
      continue;
    }
    const effect = ability.effect;
    const hasCandidate = Object.values(combat.units).some((target) => {
      const sideOk =
        effect.targets === "any" ||
        (effect.targets === "friendly" && target.controllerId === activeUnit.controllerId) ||
        (effect.targets === "enemy" && target.controllerId !== activeUnit.controllerId);
      return (
        sideOk &&
        isUnitAlive(target) &&
        !isArrowTowerUnit(target) &&
        (!effect.targetTypes || effect.targetTypes.includes(target.type))
      );
    });
    if (!hasCandidate) {
      continue;
    }
    actions.push({
      label: placeTokenCommandLabel(activeUnit.name, ability.name, effect.targets, effect.amount),
      action: {
        type: "USE_UNIT_ABILITY",
        playerId,
        unitId: activeUnit.id,
        abilityId: ability.id,
        target: { type: "none" }
      }
    });
  }
}

/**
 * PvP Neutral Control: the IN-COMBAT unit menu the CONTROLLING player gets for
 * an active Neutral guard. Identical for a normal guard FIELD and a Creature
 * BANK — both obey the `pvpNeutralControlMustAttack` sub-toggle (user rules):
 *
 *  - MUST-ATTACK mode (default): the rulebook constraint — a guard that can
 *    strike now may ONLY strike; one that can reach a strike by moving may only
 *    move to those cells; otherwise it may only step strictly CLOSER to some
 *    enemy — never Defend, never a token "other action", never wander to buy
 *    time; it holds only when boxed in. (A bank guard must attack too.)
 *  - FREE mode: "do whatever" — move anywhere legal, attack, Defend, hold, AND
 *    use the guard's token "other actions" (Bloodlust / Weakness tokens; see
 *    addControlledNeutralTokenActions). A bank guard "keeps its corner as start
 *    but can do whatever it wants".
 *
 * A WOG Werewolf's Astrologers-round frenzy forces the must-attack menu even
 * with the toggle OFF. (The pre-battle formation SORT is a separate window —
 * `pendingNeutralPlacement` — offered on both normal fields and Creature Banks.)
 */
function addControlledNeutralUnitActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  activeUnit: CombatUnitState
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const alreadyAttacked = Boolean(activeUnit.attackedThisActivation);
  // Polish Wait re-activation: a Neutral that Waited MUST attack a player unit
  // when it can (sheet: "Neutral units now has to attack players units").
  const waitMustAttack = Boolean(combat.waitPhase && activeUnit.waitPending);
  const mustAttack =
    waitMustAttack ||
    neutralControlMustAttack(state, combat) ||
    (state.round % 2 === 0 && getAstrologersRoundFrenzy(activeUnit) > 0 && !alreadyAttacked);

  // Attacks the guard can make from where it stands (any enemy, engine-legal).
  const attacks: LegalAction[] = [];
  if (!alreadyAttacked) {
    for (const defender of Object.values(combat.units)) {
      if (!canUnitAttack(combat, activeUnit, defender, state.activeEffects)) {
        continue;
      }
      attacks.push({
        label: `${activeUnit.name} attack ${defender.name}`,
        action: { type: "ATTACK_UNIT", playerId, attackerId: activeUnit.id, defenderId: defender.id }
      });
    }
  }

  const moveDestinations = getLegalMoveDestinations(combat, activeUnit, state);
  const pushMove = (destination: number) =>
    actions.push({
      label: `${activeUnit.name} move to ${getBattlefieldLabel(destination)}`,
      action: { type: "MOVE_UNIT", playerId, unitId: activeUnit.id, destination }
    });
  const hold: LegalAction = {
    label: `${activeUnit.name} hold position`,
    action: { type: "END_ACTIVATION", playerId, unitId: activeUnit.id }
  };

  // A guard that already fired keeps only the PvP tail: the optional post-shot
  // step (the engine's move set is already reduced accordingly) and hold.
  if (alreadyAttacked) {
    for (const destination of moveDestinations) {
      pushMove(destination);
    }
    actions.push(hold);
    return;
  }

  if (!mustAttack) {
    // Free play ("do whatever"): the exact PvP menu — move anywhere legal,
    // attack, Defend, the token "other actions", and pure hold at any time
    // (including activation start: consecutive-Defend ban still needs a way
    // to sit still without attacking). Same for a normal field and a bank guard.
    for (const destination of moveDestinations) {
      pushMove(destination);
    }
    actions.push(...attacks);
    // Consecutive-Defend ban: a guard that Defended last activation must do
    // something else before it may Defend again.
    if (!isArrowTowerUnit(activeUnit) && !activeUnit.defendedLastActivation) {
      actions.push({
        label: `${activeUnit.name} defend`,
        action: { type: "DEFEND_UNIT", playerId, unitId: activeUnit.id }
      });
    }
    addControlledNeutralTokenActions(actions, state, playerId, activeUnit);
    maybeAddControlledNeutralWait(actions, state, playerId, activeUnit);
    actions.push(hold);
    return;
  }

  // Must-attack: a strike from here is mandatory when one exists. Under the
  // polish-wait house rule the guard may WAIT instead (all units can Wait) —
  // but its Waited re-activation must attack (maybeAddControlledNeutralWait
  // self-guards on the wait phase, so a Waited guard is never offered Wait
  // again and `waitMustAttack` above forces the strike).
  maybeAddControlledNeutralWait(actions, state, playerId, activeUnit);
  if (attacks.length > 0) {
    actions.push(...attacks);
    return;
  }

  const enemies = Object.values(combat.units).filter(
    (candidate) => candidate.controllerId !== activeUnit.controllerId && isUnitAlive(candidate)
  );

  // No strike from here — cells from which the guard CAN strike this
  // activation come first (the move half of a forced move-and-attack)…
  const strikeCells = moveDestinations.filter((space) =>
    enemies.some(
      (target) => isAdjacent(space, target.position) && canUnitMoveAndAttack(combat, activeUnit, space, target, state)
    )
  );
  if (strikeCells.length > 0) {
    for (const destination of strikeCells) {
      pushMove(destination);
    }
    return;
  }

  // …else only steps that strictly CLOSE the walked distance to some enemy
  // (no wandering to run down the round limit). Path-aware like the AI's own
  // approach: blockers wall a ground guard in, flyers pass over them.
  const approaches = moveDestinations.filter((space) =>
    enemies.some((target) => {
      const field = getPathDistances(combat, activeUnit, target.position);
      const here = field.get(activeUnit.position);
      const there = field.get(space);
      return here !== undefined && there !== undefined && there < here;
    })
  );
  if (approaches.length > 0) {
    for (const destination of approaches) {
      pushMove(destination);
    }
    return;
  }

  // Boxed in (or alone): nothing to do but hold.
  actions.push(hold);
}

function addUnitActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (combat && (combat.setup || combat.awaitingContinue)) {
    return;
  }

  if (!combat?.activeUnitId) {
    if (combat && playerId === combat.attackerPlayerId && state.mode !== "adventure") {
      actions.push({
        label: "Start next combat round",
        action: { type: "END_COMBAT_ROUND", playerId }
      });
    }
    return;
  }

  const activeUnit = combat.units[combat.activeUnitId];
  if (!activeUnit || activeUnit.activatedThisRound) {
    return;
  }
  // PvP Neutral Control: the controlling player drives an active Neutral guard
  // with the normal unit actions (the dispatch re-stamps the acting seat — see
  // asNeutralSeatCommand in reducer.ts). Everyone else needs real ownership.
  const controlsNeutral =
    activeUnit.controllerId === NEUTRAL_PLAYER_ID && neutralCombatControllerId(state, combat) === playerId;
  if (activeUnit.controllerId !== playerId && !controlsNeutral) {
    return;
  }

  // Berserk: the unit must attack the nearest unit (friend or foe), or move to
  // it and attack — no free move, defend, ability or hold while a target stands.
  // Binds a PvP-Neutral-Control guard exactly like a player unit.
  if (unitIsBerserk(state.activeEffects, activeUnit)) {
    addBerserkUnitActions(actions, state, playerId, activeUnit);
    return;
  }

  if (controlsNeutral) {
    addControlledNeutralUnitActions(actions, state, playerId, activeUnit);
    // Manual guard control (the FIGHTER commands their own guards): any single
    // activation may instead be handed back to the rulebook AI — the classic
    // "Let the unit act" button, next to the manual commands. Only before the
    // guard has begun to act, and never under PvP Neutral Control (there a
    // human OPPONENT plays the guards — no AI delegation).
    if (
      manualGuardControllerId(state, combat) === playerId &&
      !pvpNeutralControllerId(state, combat) &&
      !activeUnit.movedThisActivation &&
      !activeUnit.attackedThisActivation
    ) {
      actions.push({
        label: `Let ${activeUnit.name} act (automatic)`,
        action: { type: "AUTO_NEUTRAL_ACTIVATION", playerId }
      });
    }
    return;
  }

  // WOG Werewolf: on an Astrologers round it must attack whenever a direct or
  // move-and-attack line exists. Only when no attack is reachable does it fall
  // through to the ordinary move/defend menu.
  if (
    state.round % 2 === 0 &&
    getAstrologersRoundFrenzy(activeUnit) > 0 &&
    !activeUnit.attackedThisActivation
  ) {
    const forced: LegalAction[] = [];
    const enemies = Object.values(combat.units).filter(
      (unit) => unit.controllerId !== activeUnit.controllerId && isUnitAlive(unit)
    );
    for (const defender of enemies) {
      if (canUnitAttack(combat, activeUnit, defender, state.activeEffects)) {
        forced.push({
          label: `${activeUnit.name} attack ${defender.name}`,
          action: { type: "ATTACK_UNIT", playerId, attackerId: activeUnit.id, defenderId: defender.id }
        });
      }
    }
    if (forced.length === 0) {
      for (const destination of getLegalMoveDestinations(combat, activeUnit, state)) {
        for (const defender of enemies) {
          if (canUnitMoveAndAttack(combat, activeUnit, destination, defender, state)) {
            forced.push({
              label: `${activeUnit.name} move to ${getBattlefieldLabel(destination)} and attack ${defender.name}`,
              action: {
                type: "MOVE_AND_ATTACK_UNIT",
                playerId,
                attackerId: activeUnit.id,
                destination,
                defenderId: defender.id
              }
            });
          }
        }
      }
    }
    if (forced.length > 0) {
      actions.push(...forced);
      return;
    }
  }

  const alreadyAttacked = Boolean(activeUnit.attackedThisActivation);

  // Factory Sandworms (Pack): after attacking, while a faction cube remains the
  // controller may spend one to "attack again" — so extra attacks stay on offer
  // beyond the normal once-per-activation attack (each declared attack spends a
  // cube in declareAttack).
  const cubeAttackAvailable =
    alreadyAttacked && Boolean(getSpendCubeAttackAgain(activeUnit)) && (activeUnit.factionCubes ?? 0) >= 1;

  if (!alreadyAttacked) {
    addUnitAbilityActions(actions, state, playerId, activeUnit);
    addFortificationActions(actions, state, playerId, activeUnit);

    // Anime Hero Grades (§3.11): War Cry — a combat active on your OWN unit's
    // activation (+Attack this activation), offered before it attacks so the
    // buff matters. Only your main hero's battles, only your real unit (never a
    // controlled Neutral guard), once per combat.
    if (!controlsNeutral && playerMainHeroInCombat(state, playerId)) {
      for (const nodeId of heroGradeNodesOf(state, playerId)) {
        const node = HERO_GRADE_NODES[nodeId];
        if (node?.skill?.mode === "combat-active" && heroSkillAvailableThisCombat(state, playerId, nodeId)) {
          actions.push({
            label: `${node.name.en}: ${activeUnit.name} +${node.skill.amount} Attack this activation`,
            action: { type: "USE_HERO_SKILL", playerId, nodeId, unitId: activeUnit.id }
          });
        }
      }
    }
  }

  for (const destination of getLegalMoveDestinations(combat, activeUnit, state)) {
    actions.push({
      label: `${activeUnit.name} move to ${getBattlefieldLabel(destination)}`,
      action: {
        type: "MOVE_UNIT",
        playerId,
        unitId: activeUnit.id,
        destination
      }
    });
  }

  // Ranged units shoot first and may step afterwards; everyone else may move
  // first and then attack an adjacent enemy. canUnitAttack enforces that a
  // ranged unit that already moved gave up its attack. A Sandworm with a cube
  // may attack again even after its first strike (cubeAttackAvailable).
  if (!alreadyAttacked || cubeAttackAvailable) {
    for (const defender of Object.values(combat.units)) {
      if (!canUnitAttack(combat, activeUnit, defender, state.activeEffects)) {
        continue;
      }

      actions.push({
        label: cubeAttackAvailable
          ? `${activeUnit.name} attack ${defender.name} again (spend a faction cube)`
          : `${activeUnit.name} attack ${defender.name}`,
        action: {
          type: "ATTACK_UNIT",
          playerId,
          attackerId: activeUnit.id,
          defenderId: defender.id
        }
      });
    }
  }

  // Factory Dreadnoughts (Juggernaut): "[activation] Instead of attacking, select
  // up to N units adjacent to this one." Offered as an attack ALTERNATIVE — like a
  // normal attack it is available after an optional move (never once it has
  // attacked), so a slow Juggernaut can advance into a cluster and then splash.
  // Choosing it opens the per-pick allocation in applyUnitAbilityAction.
  if (!alreadyAttacked) {
    const splash = getSplashAllocationAttack(activeUnit);
    if (
      splash &&
      Object.values(combat.units).some(
        (candidate) =>
          candidate.id !== activeUnit.id &&
          isUnitAlive(candidate) &&
          !isArrowTowerUnit(candidate) &&
          isAdjacent(candidate.position, activeUnit.position)
      )
    ) {
      actions.push({
        label: `${activeUnit.name} use ${splash.abilityName} (allocate splash to adjacent units instead of attacking)`,
        action: {
          type: "USE_UNIT_ABILITY",
          playerId,
          unitId: activeUnit.id,
          abilityId: splash.abilityId,
          target: { type: "none" }
        }
      });
    }
  }

  if (!alreadyAttacked && !isArrowTowerUnit(activeUnit) && !activeUnit.defendedLastActivation) {
    // Defend replaces the attack, so a unit that already moved may still
    // defend. The Arrow Tower never defends — it only shoots or holds.
    // Consecutive-Defend ban: after Defending, the next activation must do
    // something else; only then may the unit Defend again.
    actions.push({
      label: `${activeUnit.name} defend`,
      action: {
        type: "DEFEND_UNIT",
        playerId,
        unitId: activeUnit.id
      }
    });
  }

  // Pure hold is ALWAYS available on a normal activation — including at the
  // start, before any move/attack. Required by the consecutive-Defend ban: a
  // unit that Defended last activation cannot Defend again, but must still be
  // able to sit still without being forced to attack or move. Hold also ends
  // the activation after a shot/move (ranged post-shot step, move-only, etc.).
  // Berserk / must-attack neutral menus deliberately do NOT offer free hold —
  // they route through their own forced menus above.
  //
  // END_ACTIVATION clears defendedLastActivation (markActivatedThisRound with
  // defended=false), so pure hold is a valid "something else" between Defends.
  actions.push({
    label: `${activeUnit.name} hold position`,
    action: {
      type: "END_ACTIVATION",
      playerId,
      unitId: activeUnit.id
    }
  });

  // Polish Wait: once per combat round, at the beginning of activation (no
  // move/attack yet), the unit may take a Wait token and re-activate later.
  // Not offered during the Waited re-activation phase itself.
  if (
    houseRuleEnabled(state, "polish-wait") &&
    !combat.waitPhase &&
    !alreadyAttacked &&
    !activeUnit.movedThisActivation &&
    !activeUnit.waitToken &&
    !isArrowTowerUnit(activeUnit)
  ) {
    actions.push({
      label: `${activeUnit.name} wait`,
      action: {
        type: "WAIT_UNIT",
        playerId,
        unitId: activeUnit.id
      }
    });
  }
}

/** Offer Wait on a controlled Neutral guard (same gates as player units). */
function maybeAddControlledNeutralWait(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  activeUnit: CombatUnitState
): void {
  const combat = state.combat;
  if (
    !combat ||
    !houseRuleEnabled(state, "polish-wait") ||
    combat.waitPhase ||
    activeUnit.attackedThisActivation ||
    activeUnit.movedThisActivation ||
    activeUnit.waitToken ||
    isArrowTowerUnit(activeUnit)
  ) {
    return;
  }
  actions.push({
    label: `${activeUnit.name} wait`,
    action: { type: "WAIT_UNIT", playerId, unitId: activeUnit.id }
  });
}

function addDeckSearchActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  // Searches are normally granted by rewards (level ups, treasure fields,
  // town actions). Until the adventure-map reward loop is implemented, the
  // active player may demo the full search flow from the table decks.
  if (state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }

  // A search opens the deck-search choice — parallel turns take those one at a
  // time, and only a player whose turn is open may start one.
  if (!hasOpenAdventureTurn(state, playerId) || parallelInteractionBlocker(state, playerId)) {
    return;
  }

  for (const deckId of SHARED_DECK_IDS) {
    const deck = state.decks[deckId];
    if (!deck || deck.drawPile.length + deck.discardPile.length === 0) {
      continue;
    }

    actions.push({
      label: `Search 2 in the ${deckId} deck`,
      action: {
        type: "SEARCH_DECK",
        playerId,
        deckId,
        count: 2
      }
    });
  }
}

/**
 * Rogues (army map ability): once during your turn, look at the top card of any
 * deck. Offered per shared/neutral deck that has cards, only while it's your
 * uninterrupted turn and the scout has not been used yet.
 */
function addRoguesScoutActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }
  if (!hasOpenAdventureTurn(state, playerId) || parallelInteractionBlocker(state, playerId)) {
    return;
  }
  const player = state.players[playerId];
  if (!player || player.rogueScoutUsedThisTurn || !armyHasMapEffect(state, playerId, "MAP_TURN_DECK_PEEK")) {
    return;
  }

  for (const [deckId, deck] of Object.entries(state.decks)) {
    if (deck.drawPile.length === 0) {
      continue;
    }
    actions.push({
      label: `Rogues: scout the top of the ${deckId} deck`,
      action: { type: "ROGUES_SCOUT_DECK", playerId, deckId }
    });
  }
}

/**
 * Satyrs (army map ability): once during your turn, roll an Attack die;
 * on "+1" gain positive morale. Offered only while it's your uninterrupted
 * turn and the roll has not been used yet this turn.
 */
function addSatyrMoraleRollActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || state.reactionWindow || state.pendingChoice || state.stack.length > 0) {
    return;
  }
  if (!hasOpenAdventureTurn(state, playerId) || parallelInteractionBlocker(state, playerId)) {
    return;
  }
  const player = state.players[playerId];
  if (!player || player.satyrMoraleRollUsedThisTurn || !armyHasMapEffect(state, playerId, "MAP_TURN_MORALE_ROLL")) {
    return;
  }

  actions.push({
    label: "Satyrs: roll an Attack die — on '+1' gain positive morale",
    action: { type: "SATYR_MORALE_ROLL", playerId }
  });
}

function addHeroMoveActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  if (state.combat || (state.phase !== "map" && state.phase !== "player-turn")) {
    return;
  }

  for (const hero of Object.values(state.heroes)) {
    if (
      hero.controllerId !== playerId ||
      !hero.spaceId ||
      // Out of movement, the FREE Subterranean-Gate crossing ("one Field",
      // 0 MP) is still a legal step; anything else needs a point left.
      (hero.movementPoints <= 0 && !heroHasFreeGateStep(state, hero))
    ) {
      continue;
    }

    const space = state.map.spaces[hero.spaceId];
    for (const adjacentSpaceId of space?.adjacent ?? []) {
      actions.push({
        label: `Move hero to ${adjacentSpaceId}`,
        action: {
          type: "MOVE_HERO",
          playerId,
          heroId: hero.id,
          to: adjacentSpaceId
        }
      });
    }
  }
}

function hasResources(
  resources: Record<ResourceKind, number>,
  cost: ResourceCost
): boolean {
  return (Object.entries(cost) as [ResourceKind, number][]).every(
    ([resource, amount]) => resources[resource] >= amount
  );
}

export function canPlayerBuildStructure(
  state: GameState,
  playerId: PlayerId,
  townId: TownId,
  buildingId: BuildingId,
  buildings: BuildingLibrary = sampleBuildings
): boolean {
  const player = state.players[playerId];
  const town = state.towns[townId];
  const building = buildings[buildingId];

  if (!player || !town || !building || building.implementationStatus !== "implemented") {
    return false;
  }

  if (town.controllerId !== playerId || town.buildings.includes(buildingId)) {
    return false;
  }

  if (!hasResources(player.resources, building.cost)) {
    return false;
  }

  return (building.prerequisites ?? []).every((prerequisiteId) => town.buildings.includes(prerequisiteId));
}

function addTownBuildActions(
  actions: LegalAction[],
  state: GameState,
  playerId: PlayerId,
  buildings: BuildingLibrary
): void {
  for (const town of Object.values(state.towns)) {
    if (town.controllerId !== playerId) {
      continue;
    }

    for (const building of Object.values(buildings)) {
      if (!canPlayerBuildStructure(state, playerId, town.id, building.id, buildings)) {
        continue;
      }

      actions.push({
        label: `Build ${building.name}`,
        action: {
          type: "BUILD_STRUCTURE",
          playerId,
          townId: town.id,
          buildingId: building.id
        }
      });
    }
  }
}

export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary,
  buildings: BuildingLibrary = sampleBuildings
): LegalAction[] {
  const coreActions = getLegalActionsCore(state, playerId, cards, buildings);
  return withComputerAdvanceOffer(
    state,
    playerId,
    polishSpellBookEnabled(state)
      ? applyPolishSpellBookActionGate(state, playerId, coreActions)
      : coreActions,
  );
}

function bookCastSourcesEnabled(state: GameState): boolean {
  return spellBookRuleEnabled(state) || polishSpellBookEnabled(state);
}

/**
 * Polish Book casts reuse every standard Book target/timing path, but are only
 * exposed while a generic Cast-a-Spell card is in hand. The marker makes the
 * reducer consume that enabler atomically with the selected refreshed Spell.
 * Direct Book power-burning and playing Cast-a-Spell as an actual spell remain
 * hidden; its printed hand-side +1 Power reaction is intentionally preserved.
 */
function applyPolishSpellBookActionGate(
  state: GameState,
  playerId: PlayerId,
  actions: LegalAction[]
): LegalAction[] {
  const player = state.players[playerId];
  const hasEnabler = Boolean(player?.hand.includes(CAST_A_SPELL_CARD_ID));
  // Intelligence (combat-long): the ability stands in for the Cast a Spell
  // enabler — Book Spells are selected and cast directly, nothing consumed
  // from hand. The action is offered WITHOUT `castEnablerCardId`, which is the
  // marker the resolution's free path keys off (consumePolishSpellBookCast).
  const intelligenceFreedom = playerHasSpellTimingFreedom(state, playerId);
  const gated: LegalAction[] = [];

  for (const legal of actions) {
    const action = legal.action;
    if (action.type === "MOVE_SPELL_TO_SPELL_BOOK") {
      continue;
    }
    if (
      (action.type === "CAST_SPELL" || action.type === "PLAY_CARD" || action.type === "PLAY_REACTION") &&
      isCastASpellCard(action.cardId) &&
      !(action.type === "PLAY_REACTION" && action.asPowerBoost)
    ) {
      continue;
    }
    if (
      (action.type === "CAST_SPELL" || action.type === "PLAY_CARD" || action.type === "PLAY_REACTION") &&
      cardLibrary[action.cardId]?.kind === "spell" &&
      !isCastASpellCard(action.cardId) &&
      !action.fromSpellBook &&
      !(action.type === "CAST_SPELL" && (action.fromScroll || action.fromSpellDeck || action.tarnumReturn)) &&
      !(action.type === "PLAY_REACTION" && (action.fromScroll || action.tarnumReturn))
    ) {
      // Owned Polish Spells live only in the Book. This also heals legacy saves
      // defensively: a stray hand Spell cannot bypass the Cast-a-Spell gate.
      continue;
    }
    if (
      (action.type === "CAST_SPELL" || action.type === "PLAY_CARD" || action.type === "PLAY_REACTION") &&
      action.fromSpellBook
    ) {
      if (action.type === "PLAY_REACTION" && action.asPowerBoost) {
        continue;
      }
      if (intelligenceFreedom) {
        // Free cast via Intelligence: strip any eagerly-stamped enabler so the
        // resolution takes the no-enabler path (nothing leaves the hand).
        const freeAction = { ...action };
        delete (freeAction as { castEnablerCardId?: string }).castEnablerCardId;
        gated.push({
          ...legal,
          label: `${legal.label.replace(" (Spell Book)", "")} (Spell Book · Intelligence)`,
          action: freeAction
        });
        continue;
      }
      if (!hasEnabler) {
        continue;
      }
      gated.push({
        ...legal,
        label: `${legal.label.replace(" (Spell Book)", "")} (Spell Book · Cast a Spell)`,
        action: { ...action, castEnablerCardId: CAST_A_SPELL_CARD_ID }
      });
      continue;
    }
    gated.push(legal);
  }
  return gated;
}

/**
 * Single-player: while a computer seat owns the next decision on the map (or
 * an AI-only fight), the human always has ADVANCE_COMPUTER — even when the
 * computer is the active player / owns a pending choice. PvP with the human
 * auto-pumps and does not offer this. Prepended so the UI can always find it.
 */
function withComputerAdvanceOffer(
  state: GameState,
  playerId: PlayerId,
  actions: LegalAction[],
): LegalAction[] {
  if (sessionModeOf(state) !== "single-player") {
    return actions;
  }
  if (isComputerPlayer(state, playerId) || state.players[playerId]?.eliminated) {
    return actions;
  }
  if (!computerDecisionOwner(state) || combatHasHumanParticipant(state)) {
    return actions;
  }
  if (actions.some((legal) => legal.action.type === "ADVANCE_COMPUTER")) {
    return actions;
  }
  return [
    {
      label: "Next computer step",
      action: { type: "ADVANCE_COMPUTER", playerId },
    },
    ...actions,
  ];
}

function getLegalActionsCore(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary = cardLibrary,
  buildings: BuildingLibrary = sampleBuildings
): LegalAction[] {
  if (state.phase === "game-over") {
    // An adventure combat that just ended waits on the battlefield until a
    // participant closes the end-of-combat notice; only that acknowledgment
    // is legal here (sandbox results stay on the table until a reset).
    if (
      state.mode === "adventure" &&
      state.combat?.outcome &&
      !state.combat.endAcknowledged &&
      state.combat.context.kind !== "sandbox" &&
      isCombatParticipant(state, playerId)
    ) {
      return [
        {
          label: "Return to the adventure map",
          action: { type: "ACKNOWLEDGE_COMBAT_END", playerId }
        }
      ];
    }
    return [];
  }

  if (state.pendingChoice) {
    if (state.pendingChoice.playerId !== playerId) {
      // Parallel turns: bystanders keep their quiet actions while another
      // player's choice is open ([] outside parallel mode, as before).
      return getParallelBystanderActions(state, playerId);
    }

    if (state.pendingChoice.type === "OPTION_CHOICE") {
      const choice = state.pendingChoice;
      return choice.options.map((option, optionIndex) => ({
        label: option.label,
        action: {
          type: "CHOOSE_OPTION",
          playerId,
          choiceId: choice.id,
          optionIndex
        }
      }));
    }

    if (state.pendingChoice.type === "COMBAT_HAND_DISCARD") {
      const choice = state.pendingChoice;
      const actions: LegalAction[] = choice.powerCardIds.map((cardId) => ({
        label: `Discard ${cards[cardId]?.name ?? cardId}`,
        action: {
          type: "RESOLVE_COMBAT_DISCARD",
          playerId,
          choiceId: choice.id,
          cardId
        }
      }));
      // The Magi drain also offers a random discard; the Pegasi toll is a pure
      // "pay a Power card of your choice" — no random option.
      if (choice.kind === "magi-power-or-random") {
        actions.push({
          label: "Let a random card be discarded",
          action: {
            type: "RESOLVE_COMBAT_DISCARD",
            playerId,
            choiceId: choice.id,
            cardId: "random"
          }
        });
      }
      return actions;
    }

    if (state.pendingChoice.type === "TARNUM_SEARCH") {
      const choice = state.pendingChoice;
      // Tarnum (Conflux) VI: pick ONE Spell deck (basic or expert) to Search 1
      // card from — only decks that still hold a card are offered.
      const actions: LegalAction[] = [];
      const decks = [SPELL_DECK_BASIC, SPELL_DECK_EXPERT].filter(
        (deckId) =>
          (state.decks[deckId]?.drawPile.length ?? 0) +
            (state.decks[deckId]?.discardPile.length ?? 0) >
          0
      );
      for (const [optionIndex, deckId] of decks.entries()) {
        actions.push({
          label: `Search the ${deckId === SPELL_DECK_EXPERT ? "expert" : "basic"} Spell deck`,
          action: { type: "CHOOSE_OPTION", playerId, choiceId: choice.id, optionIndex }
        });
      }
      return actions;
    }

    if (state.pendingChoice.type === "DECK_SEARCH") {
      const choice = state.pendingChoice;
      // The discard-top and Basic X Magic "draw from a School of Magic"
      // alternatives are resolved up front (the "deck-search-mode" option
      // choice), so once a player is looking at the revealed cards they only
      // keep one of those — no fall back to the discard pile or a fetch here.
      const actions: LegalAction[] = choice.revealedCardIds.map((cardId, index) => ({
        label: `Keep ${cards[cardId]?.name ?? cardId}`,
        action: {
          type: "RESOLVE_DECK_SEARCH",
          playerId,
          choiceId: choice.id,
          pick: { kind: "revealed", index }
        }
      }));

      // Tarnum (Conflux) I: each revealed card may instead be Removed from the
      // game rather than kept in hand.
      if (choice.allowRemove) {
        for (const [index, cardId] of choice.revealedCardIds.entries()) {
          actions.push({
            label: `Remove ${cards[cardId]?.name ?? cardId}`,
            action: {
              type: "RESOLVE_DECK_SEARCH",
              playerId,
              choiceId: choice.id,
              pick: { kind: "revealed", index, remove: true }
            }
          });
        }
      }

      // Tournament Book p.54: with a positive Morale token (token mode, not
      // Morale Cards), discard all revealed cards and Search (X) again.
      if (
        choice.playerId === playerId &&
        choice.revealedCardIds.length > 0 &&
        tournamentMoraleSearchAgainEnabled(state) &&
        !moraleCardsRuleEnabled(state)
      ) {
        const seer = state.players[playerId];
        const hasToken = (seer?.morale ?? 0) >= 1 || (seer?.moraleOverflow ?? 0) > 0;
        if (hasToken) {
          const x = choice.baseCount ?? choice.revealedCardIds.length;
          actions.push({
            label: `Spend Morale token — discard all revealed, Search (${x}) again`,
            action: { type: "SPEND_MORALE", playerId, benefit: "repeat-search" }
          });
        }
      }

      return actions;
    }

    if (state.pendingChoice.type === "ABILITY_TARGET_CHOICE") {
      const choice = state.pendingChoice;
      const verb =
        choice.kind === "second-attack"
          ? `${choice.abilityName}: attack`
          : choice.kind === "enchanter-activation"
            ? `${choice.abilityName}: heal`
            : choice.kind === "jotunn-teleport"
              ? `${choice.abilityName}: teleport`
              : choice.kind === "place-token"
                ? `${choice.abilityName}: place on`
              : choice.kind === "spell-redirect"
              ? `${choice.abilityName}: redirect to`
              : choice.kind === "dreadnought-splash"
                ? `${choice.abilityName}: deal ${choice.chainRemainingDamages?.[0] ?? 0} to`
              : choice.kind === "couatl-invulnerability"
                ? "Become invulnerable —"
              : choice.kind === "automaton-cube"
                ? "Place a faction cube on"
              : choice.kind === "commander-cast"
                ? `${choice.abilityName}: cast on`
              : choice.kind === "flat-damage" ||
                  choice.kind === "spell-splash" ||
                  choice.kind === "ballistics-splash" ||
                  choice.kind === "area-pick" ||
                  choice.kind === "faerie-damage" ||
                  choice.kind === "chain-lightning" ||
                  choice.kind === "war-machine"
                ? `${choice.abilityName}: hit`
                : "Neutrals attack";
      const targetActions = choice.candidateUnitIds.flatMap((unitId) => {
        // Catapult bombardment: a Wall/Gate target is a pseudo-id, not a unit.
        const fort = parseFortificationTargetId(unitId);
        if (fort) {
          return [
            {
              label: `${choice.abilityName}: batter the ${fort.kind === "gate" ? "Gate" : "Wall"}`,
              action: {
                type: "CHOOSE_ABILITY_TARGET",
                playerId,
                choiceId: choice.id,
                targetUnitId: unitId
              }
            } satisfies LegalAction
          ];
        }
        const unit = state.combat?.units[unitId];
        if (!unit || !isUnitAlive(unit)) {
          return [];
        }
        return [
          {
            label: `${verb} ${unit.cardName}`,
            action: {
              type: "CHOOSE_ABILITY_TARGET",
              playerId,
              choiceId: choice.id,
              targetUnitId: unitId
            }
          } satisfies LegalAction
        ];
      });

      // Optional choices carry a skip (Fireball's empty second space, the
      // Enchanters' "+1 Attack instead" of healing).
      if (choice.optional) {
        targetActions.push({
          label: choice.skipLabel ?? "Skip (no second target)",
          action: {
            type: "CHOOSE_ABILITY_TARGET",
            playerId,
            choiceId: choice.id,
            targetUnitId: "skip"
          }
        });
      }

      return targetActions;
    }

    // A reroll replaces the previous result (rulebook): only the latest roll
    // can be kept, earlier candidates are history.
    const latestIndex = state.pendingChoice.candidates.length - 1;
    const latest = state.pendingChoice.candidates[latestIndex];
    // An ability-roll window (Death Stare & co.) names the ability and shows
    // every die — its outcome is the faces, not a single kept value.
    const abilityRoll = state.pendingChoice.abilityRoll;
    const facesLabel = latest.rolls.map((roll) => (roll >= 0 ? `+${roll}` : `${roll}`)).join(", ");
    const actions: LegalAction[] = [
      {
        label: abilityRoll
          ? `Keep the ${abilityRoll.abilityName} roll ${facesLabel}`
          : `Keep the attack roll ${latest.roll >= 0 ? "+" : ""}${latest.roll}`,
        action: {
          type: "CHOOSE_PENDING_ROLL",
          playerId,
          choiceId: state.pendingChoice?.id ?? "",
          candidateIndex: latestIndex
        }
      }
    ];

    const nextSource = state.pendingChoice.rerollSources.find(
      (source) => rerollSourceAvailableFor(source, latest.roll) && source.setDieFace === undefined
    );
    if (nextSource) {
      actions.push({
        label: abilityRoll
          ? `Reroll ${abilityRoll.abilityName} dice (${nextSource.name})`
          : `Reroll attack die (${nextSource.name})`,
        action: {
          type: "REROLL_PENDING_CHOICE",
          playerId,
          choiceId: state.pendingChoice.id
        }
      });
    }

    // Positive Morale "set one of the dice to the +1 side": its own button —
    // a set, not a reroll, so neither spends the other.
    const setSource = state.pendingChoice.rerollSources.find(
      (source) => rerollSourceAvailableFor(source, latest.roll) && source.setDieFace !== undefined
    );
    if (setSource) {
      actions.push({
        label: `Set a die to +${setSource.setDieFace} (${setSource.name})`,
        action: {
          type: "REROLL_PENDING_CHOICE",
          playerId,
          choiceId: state.pendingChoice.id,
          useSetDie: true
        }
      });
    }

    return actions;
  }

  if (state.reactionWindow) {
    if (state.reactionWindow.priorityPlayerId !== playerId) {
      // Parallel turns: bystanders keep their quiet actions while a window is
      // open for someone else ([] outside parallel mode, as before).
      return getParallelBystanderActions(state, playerId);
    }

    return [
      ...(state.reactionWindow.legalReactions[playerId] ?? []),
      {
        label:
          state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
            ? "Keep normal attack"
            : "Pass reaction",
        action: { type: "PASS_REACTION", playerId }
      }
    ];
  }

  if (state.setupLobby && state.phase === "setup") {
    return getSetupLobbyLegalActions(state, playerId);
  }

  if (state.mode === "adventure") {
    return getAdventureLegalActions(state, playerId, cards);
  }

  // Battle Test (combat-sandbox): once a fight is open it runs on the exact
  // same CombatState as a PvP battle, so drive it through the shared combat
  // dispatcher — deployment placement (PLACE_COMBAT_UNIT / FINISH_COMBAT_
  // PLACEMENT), Tactics, the neutral-step pause and the active fight. This MUST
  // come before the simultaneous town-turn branch below: during `combat-setup`
  // that branch would otherwise offer Build Training Ground / Marketplace and no
  // way to deploy or start the fight.
  if (state.mode === "combat-sandbox" && state.combat) {
    const combatActions = getCombatInteractionActions(state, playerId, cards);
    if (combatActions) {
      return combatActions;
    }
  }

  if (isSimultaneousTurnAvailable(state, playerId)) {
    const actions: LegalAction[] = [];
    addTownBuildActions(actions, state, playerId, buildings);
    actions.push({
      label: "Complete simultaneous turn",
      action: { type: "COMPLETE_SIMULTANEOUS_TURN", playerId }
    });
    return actions;
  }

  if (
    state.turn.mode === "simultaneous" &&
    state.round <= state.turn.simultaneousRoundLimit &&
    state.phase !== "combat" &&
    state.phase !== "reaction"
  ) {
    return [];
  }

  if (state.activePlayerId !== playerId) {
    // Even while the opponent's unit is active you may still cast your one
    // spell per combat round, slot in trigger-free instants, use the First Aid
    // Tent, and play an instant damage specialty (Gerwulf/Adelaide/Deemer) —
    // these are "Instant" and playable at any time during the Combat.
    const anytimeActions: LegalAction[] = [];
    addActiveEffectActions(anytimeActions, state, playerId);
    addSpellActions(anytimeActions, state, playerId, cards);
    addPlayableCardActions(anytimeActions, state, playerId, cards);
    addCombatAnytimeSpecialtyPlays(anytimeActions, state, playerId, cards);
    return anytimeActions;
  }

  const actions: LegalAction[] = [];
  addActiveEffectActions(actions, state, playerId);

  if (state.phase === "town") {
    addTownBuildActions(actions, state, playerId, buildings);
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  if (!state.combat || state.phase !== "combat") {
    addHeroMoveActions(actions, state, playerId);
    addDeckSearchActions(actions, state, playerId);
    addRoguesScoutActions(actions, state, playerId);
    addSatyrMoraleRollActions(actions, state, playerId);
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  addUnitActions(actions, state, playerId);
  addSpellActions(actions, state, playerId, cards);
  addPlayableCardActions(actions, state, playerId, cards);
  addDeckSearchActions(actions, state, playerId);
  if (isCombatParticipant(state, playerId)) {
    addPermanentDiscardActions(actions, state, playerId);
    // A positive morale token may be spent mid-combat for its draw / discard-
    // redraw here (the reroll use is offered by the attack-die reroll choice).
    addMoraleActions(actions, state, playerId);
    addAbilityEmpowerTokenActions(actions, state, playerId);
  }

  return actions;
}

/**
 * Alamar's Resurrection save window: when a unit is about to die, offer its
 * controller the grade-matching, affordable Resurrection option(s) — and
 * nothing else. Passing lets the unit die.
 */
/**
 * Shield of the Dwarven Lords: after a real Attack die roll, the defending
 * unit's controller may play it to ignore the die. Offered only to that
 * controller, only while the die-cancel has not already been armed, and never
 * when the defender's hand is locked out of the Combat.
 */
/**
 * Bowstring of the Unicorn's Mane: a player's ranged units that may be activated
 * out of order in the pre-activation window — alive, ranged, not yet activated
 * this round, and not the unit currently about to activate.
 */
function getActivateRangedUnitTargets(
  state: GameState,
  playerId: PlayerId,
  aboutToActivateUnitId: UnitId,
  // Valeska's Marksmen VI may re-fire a ranged unit that has already acted; the
  // Bowstring leaves this false so it only reaches not-yet-activated units.
  allowAlreadyActivated = false
): UnitId[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  return Object.values(combat.units)
    .filter(
      (unit) =>
        unit.controllerId === playerId &&
        isUnitAlive(unit) &&
        unit.type === "ranged" &&
        (allowAlreadyActivated || !unit.activatedThisRound) &&
        unit.id !== aboutToActivateUnitId
    )
    .map((unit) => unit.id);
}

function getDieCancelReactions(
  state: GameState,
  defenderId: UnitId,
  attackerId: UnitId,
  cards: CardLibrary,
  roll: number
): Record<PlayerId, LegalAction[]> {
  const combat = state.combat;
  const defender = combat?.units[defenderId];
  if (!combat || !defender) {
    return {};
  }
  // Bowstring of the Unicorn's Mane (option B) is gated to a ranged attacker.
  const attackerIsRanged = combat.units[attackerId]?.type === "ranged";
  const playerId = defender.controllerId;
  const player = state.players[playerId];
  if (!player || playerId === NEUTRAL_PLAYER_ID || isHandLockedInCombat(state, playerId)) {
    return {};
  }

  // Only one die-cancel per attack: if it is already armed, offer nothing more.
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  if (pendingAttack?.modifiers.attackDieCancelled) {
    return {};
  }

  const reactions: LegalAction[] = [];
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (!card || card.implementationStatus !== "implemented" || card.effect.type !== "CHOOSE_ONE") {
      continue;
    }
    for (const [optionIndex, option] of card.effect.options.entries()) {
      if (option.effect.type !== "IGNORE_ATTACK_DIE_RESULT") {
        continue;
      }
      // Bowstring of the Unicorn's Mane: only "after a ranged unit's Attack die
      // roll". Shield of the Dwarven Lords sets no such gate and is always offered.
      if (option.requiresRangedAttacker && !attackerIsRanged) {
        continue;
      }
      if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
        continue;
      }
      reactions.push(
        makeReactionAction(`${card.name}: ${option.label}`, {
          type: "PLAY_REACTION",
          playerId,
          cardId,
          mode: "basic",
          optionIndex
        })
      );
    }
  }

  // Castle Halberdiers (Pack): the DEFENDING unit itself may discard a card to
  // ignore the Attack die. Offered only on a "+1" face (the sole result worth
  // cancelling — ignoring a 0/−1 never helps the defender) and only while the
  // controller still holds a card to pay the discard cost. Not a card play, so
  // it is pushed as a plain unit-ability reaction (like the Archangels' save).
  if (roll > 0 && player.hand.length > 0 && getDiscardToIgnoreAttackDieAbility(defender)) {
    reactions.push({
      label: `${defender.cardName}: discard a card to ignore the Attack die`,
      action: { type: "USE_UNIT_DIE_IGNORE", playerId, defenderUnitId: defender.id }
    });
  }

  return reactions.length > 0 ? { [playerId]: reactions } : {};
}

/**
 * Misfortune's dedicated pre-buff window: the instant an enemy unit declares an
 * attack, the attacked unit's controller may play Misfortune — before any other
 * card — to negate that attack's die and lock the attacker out of buffing it.
 * Only the option whose grade matches the attacking unit is offered, and only
 * when affordable and within the one-Spell-per-combat-round limit. Returns the
 * defender's offers (or nothing, so the pre-window simply does not open and the
 * normal buff window takes over).
 */
function getMisfortunePreWindowReactions(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }>,
  cards: CardLibrary
): Record<PlayerId, LegalAction[]> {
  const combat = state.combat;
  const attacker = combat?.units[triggerEvent.attackerId];
  const defender = combat?.units[triggerEvent.defenderId];
  if (!combat || !attacker || !defender) {
    return {};
  }
  const playerId = defender.controllerId;
  const player = state.players[playerId];
  if (!player || playerId === NEUTRAL_PLAYER_ID || isHandLockedInCombat(state, playerId)) {
    return {};
  }
  // Misfortune is a Spell, so it respects the one-Spell-per-round limit.
  if (spellLimitFor(state, player) - player.combatStats.spellsCastThisRound <= 0) {
    return {};
  }

  // Spell Book (house rule): a Misfortune stashed in the Book fires the same
  // pre-buff window as a hand copy (flagged `fromSpellBook`). Without this the
  // dedicated pass only scanned the hand, so a Book Misfortune never opened.
  const sources: { cardId: CardId; fromSpellBook?: true }[] = [
    ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
    ...(bookCastSourcesEnabled(state)
      ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
      : [])
  ];

  const reactions: LegalAction[] = [];
  for (const { cardId, fromSpellBook } of sources) {
    const card = cards[cardId];
    if (
      !card ||
      card.kind !== "spell" ||
      card.implementationStatus !== "implemented" ||
      card.effect.type !== "CHOOSE_ONE"
    ) {
      continue;
    }
    for (const [optionIndex, option] of card.effect.options.entries()) {
      // Only the option whose grade matches the attacking unit (Power 0/1/2 →
      // bronze/silver/gold) is offered, and only when its Power cost is payable.
      if (
        option.effect.type !== "NEGATE_ATTACK" ||
        option.effect.grade === undefined ||
        gradeRankOfUnit(attacker) !== gradeRank(option.effect.grade) ||
        !canAffordCardCost(state, playerId, cardId, option.cost)
      ) {
        continue;
      }
      // Printed full Spell immunity (Black Dragons Pack, Azure, …): Misfortune
      // lands on the attacker, so an immune attacker cannot be hexed.
      if (unitBlockedBySpellCard(state, attacker, card)) {
        continue;
      }
      reactions.push(
        makeReactionAction(`${card.name}: ${option.label}${fromSpellBook ? " (Spell Book)" : ""}`, {
          type: "PLAY_REACTION",
          playerId,
          cardId,
          mode: "basic",
          optionIndex,
          ...(fromSpellBook ? { fromSpellBook: true } : {})
        })
      );
    }
  }

  return reactions.length > 0 ? { [playerId]: reactions } : {};
}

/**
 * Knowledge / Mysticism "take the Spell card back" plays a player holds in hand:
 * the basic recall plus, when an expert use (or a crown-free Empowered ability)
 * is available, the expert side. Shared by every window where a recall may be
 * offered after a reaction Spell is played (the attack buff exchange, the
 * lethal-save window, the Sorrow activation-skip window) so all three offer the
 * same cards; the caller decides WHEN there is a recallable Spell to take back.
 */
function spellRecallReactionOffers(
  player: PlayerState,
  cards: CardLibrary
): LegalAction[] {
  const expertUsesLeft =
    player.limits.expertUses +
    (player.combatStats.expertUseBonusThisRound ?? 0) -
    player.combatStats.expertUsesSpentThisRound;
  const offers: LegalAction[] = [];
  for (const cardId of new Set(player.hand)) {
    const card = cards[cardId];
    if (
      !card ||
      card.effect.type !== "RECALL_SPELL" ||
      card.implementationStatus !== "implemented" ||
      (card.timing !== "reaction" && card.timing !== "instant")
    ) {
      continue;
    }
    offers.push(makeReactionAction(card.name, { type: "PLAY_REACTION", playerId: player.id, cardId, mode: "basic" }));
    if (effectHasExpertMode(card.effect) && (expertUsesLeft > 0 || abilityExpertIsCrownFree(player, cardId))) {
      offers.push(
        makeReactionAction(`${card.name} expert`, {
          type: "PLAY_REACTION",
          playerId: player.id,
          cardId,
          mode: "expert"
        })
      );
    }
  }
  return offers;
}

/**
 * Sorrow (activation-skip) recall window: a Sorrow closes its own window, so the
 * reducer keeps it OPEN for the caster alone (recording combat.pendingActivation
 * SkipRecall) to take the just-played Sorrow back. While that record is set this
 * window offers ONLY the caster's Knowledge/Mysticism recall — no second Sorrow
 * or other interrupt, which would assume a fresh activation of the already-
 * skipped unit.
 */
function getActivationSkipRecallReactions(
  state: GameState,
  cards: CardLibrary
): Record<PlayerId, LegalAction[]> {
  const recall = state.combat?.pendingActivationSkipRecall;
  const player = recall ? state.players[recall.playerId] : undefined;
  if (!recall || !player || isHandLockedInCombat(state, recall.playerId)) {
    return {};
  }
  const offers = spellRecallReactionOffers(player, cards);
  return offers.length > 0 ? { [recall.playerId]: offers } : {};
}

function getLethalSaveReactions(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "UNIT_LETHAL_HIT" }>,
  cards: CardLibrary
): Record<PlayerId, LegalAction[]> {
  const combat = state.combat;
  const defender = combat?.units[triggerEvent.defenderId];
  if (!combat || !defender) {
    return {};
  }
  const playerId = defender.controllerId;
  const player = state.players[playerId];
  if (!player || playerId === NEUTRAL_PLAYER_ID) {
    return {};
  }

  // The killing blow is saved at most once: if a save is already armed on the
  // pending attack, offer no second save. The one remaining play is a
  // Knowledge/Mysticism take-back of the Spell that armed it (a lethal-save
  // Resurrection) — held until the attack resolves, so the save still lands and
  // the Spell can never be re-cast into this same attack. Offered only to the
  // saving player, and only when they hold a recall card and have an own
  // recallable Spell recorded on this attack; a Book Resurrection routes back
  // into the Book on resolution (recallableSpellReactions carries fromSpellBook).
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  if (pendingAttack?.modifiers.cancelLethal) {
    const hasOwnRecallable = (pendingAttack.modifiers.recallableSpellReactions ?? []).some(
      (entry) => entry.playerId === playerId
    );
    if (!hasOwnRecallable || isHandLockedInCombat(state, playerId)) {
      return {};
    }
    const recall = spellRecallReactionOffers(player, cards);
    return recall.length > 0 ? { [playerId]: recall } : {};
  }

  const reactions: LegalAction[] = [];

  // Deck-based saves (the Resurrection Spell, Alamar's Resurrection specialty)
  // are played from the controller's hand, so they are unavailable whenever
  // that controller "cannot use your Deck during this Combat" — a Secondary
  // Hero leads the fight, or a heroless garrison defends. The Archangels' free
  // unit ability below is NOT a Deck card, so it must still be offered then.
  if (!isHandLockedInCombat(state, playerId)) {
    // A Resurrection-style Spell counts against the one-Spell-per-combat-round
    // limit (Expert Knowledge / Intelligence raise it); the specialty and the
    // Archangels' ability do not.
    const spellLimitReached = player.combatStats.spellsCastThisRound >= spellLimitFor(state, player);

    // Spell Book (house rule): a Resurrection Spell you stashed in the Book is
    // still yours to cast, so the save window offers it exactly like a hand
    // Spell (flagged `fromSpellBook` so it cycles Book → discard on resolution).
    // Without this a Book Resurrection was never offered — you could not save a
    // unit with a Spell you had set aside for that very emergency.
    const saveSources: { cardId: CardId; fromSpellBook?: true }[] = [
      ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
      ...(bookCastSourcesEnabled(state)
        ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
        : [])
    ];

    for (const { cardId, fromSpellBook } of saveSources) {
      const card = cards[cardId];
      if (!card || card.implementationStatus !== "implemented" || card.effect.type !== "CHOOSE_ONE") {
        continue;
      }
      if (card.kind === "spell" && spellLimitReached) {
        continue;
      }
      for (const [optionIndex, option] of card.effect.options.entries()) {
        if (
          option.effect.type !== "CANCEL_LETHAL_ATTACK" ||
          defender.bankUnit ||
          option.effect.grade !== defender.grade
        ) {
          continue;
        }
        // The Spell Book's once-per-turn +1 Power may help pay a lethal save.
        if (!canAffordCardCost(state, playerId, cardId, option.cost)) {
          continue;
        }
        reactions.push(
          makeReactionAction(`${card.name}: ${option.label}${fromSpellBook ? " (Spell Book)" : ""}`, {
            type: "PLAY_REACTION",
            playerId,
            cardId,
            mode: "basic",
            optionIndex,
            ...(fromSpellBook ? { fromSpellBook: true } : {})
          })
        );
      }
    }
  }

  // Archangels (Pack): a free once-per-combat cancel of a killing blow on any
  // OTHER friendly unit (any grade), offered as a unit-ability reaction.
  for (const unit of Object.values(combat.units)) {
    if (
      unit.controllerId !== playerId ||
      unit.id === defender.id ||
      unit.damage >= unit.maxHealth ||
      unit.usedLethalSaveThisCombat
    ) {
      continue;
    }
    const ability = getLethalSaveUnitAbility(unit);
    if (!ability) {
      continue;
    }
    reactions.push({
      label: `${unit.cardName}: ${ability.abilityName} (cancel the killing blow, once per Combat)`,
      action: { type: "USE_UNIT_RESURRECTION", playerId, savingUnitId: unit.id }
    });
  }

  return reactions.length > 0 ? { [playerId]: reactions } : {};
}

/**
 * The unit Magic Mirror would lift the Spell OFF of for `playerId`, or null when
 * the card cannot fire for them in this window. This is the "your unit is about
 * to be targeted or damaged" gate, and the unit it returns is excluded from the
 * new-target candidates (you cannot redirect a Spell onto the very unit it was
 * already going to hit). null with eligibility still true means a space-centred
 * blast (Inferno) where no single unit is the anchor — every legal unit qualifies.
 */
function magicMirrorRedirectContext(
  state: GameState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  playerId: PlayerId,
  cards: CardLibrary
): { excludeUnitId: UnitId | null } | null {
  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    // Magic Mirror answers an ENEMY Spell only — never the caster's own.
    if (triggerEvent.playerId === playerId) {
      return null;
    }
    // (a) a single-target cast aimed straight at one of your units.
    const primary = pendingSpellTargetForPlayer(state, triggerEvent, playerId);
    if (primary) {
      return { excludeUnitId: primary.id };
    }
    // (b) an area cast whose blast would catch one of your units even though its
    // primary target is an enemy unit or a bare space.
    const stackItem = getPendingStackItem(state, triggerEvent);
    if (stackItem?.action.type === "CAST_SPELL") {
      const hitsMine = spellPotentialBlastUnitIds(state, stackItem, cards).some(
        (unitId) => state.combat?.units[unitId]?.controllerId === playerId
      );
      if (hitsMine) {
        const target = stackItem.action.target;
        return { excludeUnitId: target.type === "unit" ? target.unitId : null };
      }
    }
    return null;
  }

  // (c) an enemy instant combat debuff layered onto the pending attack.
  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const stackItem = state.stack.at(-1);
    const instant = stackItem ? reflectableAttackInstantForPlayer(state, stackItem, playerId, cards) : null;
    return instant ? { excludeUnitId: instant.affectedUnitId } : null;
  }

  return null;
}

/**
 * Builds the Magic Mirror offers for one player: one PLAY_REACTION per grade
 * tier they can both afford and find a legal new target for. Shared by every
 * window the card can fire in (cast-on-your-unit, area-damage-on-your-unit,
 * attack-instant-on-your-unit) so the offer, the spell-limit gate and the cost
 * picker all behave identically regardless of what is being reflected.
 *
 * Spell Book (house rule): a Magic Mirror stashed in the Book is offered the
 * same way as a hand copy (flagged `fromSpellBook` so it cycles Book → discard).
 * Without this the dedicated pass only scanned the hand, so a Book Mirror never
 * opened a reaction window and never redirected anything.
 */
function getMagicMirrorReactions(
  state: GameState,
  player: PlayerState,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  spellLimitLeft: number,
  cards: CardLibrary
): LegalAction[] {
  if (spellLimitLeft <= 0) {
    return [];
  }
  const context = magicMirrorRedirectContext(state, triggerEvent, player.id, cards);
  if (!context) {
    return [];
  }

  const sources: { cardId: CardId; fromSpellBook?: true }[] = [
    ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
    ...(bookCastSourcesEnabled(state)
      ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
      : [])
  ];

  const offers: LegalAction[] = [];
  for (const { cardId, fromSpellBook } of sources) {
    const card = cards[cardId];
    if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
      continue;
    }
    if (card.timing !== "reaction" && card.timing !== "instant") {
      continue;
    }
    for (const variant of getCardPlayVariants(card)) {
      if (variant.effect.type !== "REDIRECT_SPELL") {
        continue;
      }
      if (!canAffordCardCost(state, player.id, cardId, variant.cost)) {
        continue;
      }
      // Prefer the pending cast/instant's schools so partial elemental immunity
      // is judged against the actual bounced Spell, not "all schools".
      const pendingStack = state.stack.at(-1);
      const reflectedSpell =
        pendingStack?.action.type === "CAST_SPELL"
          ? cards[pendingStack.action.cardId]
          : pendingStack &&
              (pendingStack.action.type === "ATTACK_UNIT" || pendingStack.action.type === "MOVE_AND_ATTACK_UNIT")
            ? (() => {
                const found = reflectableAttackInstantForPlayer(state, pendingStack, player.id, cards);
                return found ? cards[found.cardId] : undefined;
              })()
            : undefined;
      if (spellRedirectTargets(state, context.excludeUnitId, variant.effect.grade, reflectedSpell).length === 0) {
        continue;
      }
      const variantName = variant.optionLabel
        ? `${card.name}: ${variant.optionLabel}${fromSpellBook ? " (Spell Book)" : ""}`
        : `${card.name}${fromSpellBook ? " (Spell Book)" : ""}`;
      offers.push(
        makeReactionAction(variantName, {
          type: "PLAY_REACTION",
          playerId: player.id,
          cardId,
          mode: "basic",
          ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
          ...(fromSpellBook ? { fromSpellBook: true } : {})
        })
      );
    }
  }
  return offers;
}

/** WOG War Zealot: Magic Mirror is a unit ability, so it costs no card or Spell use. */
function getInnateMagicMirrorReactions(
  state: GameState,
  playerId: PlayerId,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  cards: CardLibrary
): LegalAction[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }

  let affectedUnitId: UnitId | null = null;
  if (triggerEvent.type === "SPELL_CAST_STARTED" && triggerEvent.playerId !== playerId) {
    const primary = pendingSpellTargetForPlayer(state, triggerEvent, playerId);
    if (primary && hasInnateMagicMirror(primary)) {
      affectedUnitId = primary.id;
    } else {
      const stackItem = getPendingStackItem(state, triggerEvent);
      if (stackItem?.action.type === "CAST_SPELL") {
        affectedUnitId =
          spellPotentialBlastUnitIds(state, stackItem, cards).find((unitId) => {
            const unit = combat.units[unitId];
            return unit?.controllerId === playerId && hasInnateMagicMirror(unit);
          }) ?? null;
      }
    }
  } else if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const stackItem = state.stack.at(-1);
    const instant = stackItem ? reflectableAttackInstantForPlayer(state, stackItem, playerId, cards) : null;
    const affected = instant ? combat.units[instant.affectedUnitId] : undefined;
    if (affected && hasInnateMagicMirror(affected)) {
      affectedUnitId = affected.id;
    }
  }

  const stackItem = state.stack.at(-1);
  const reflectedSpell =
    stackItem?.action.type === "CAST_SPELL"
      ? cards[stackItem.action.cardId]
      : stackItem && (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT")
        ? (() => {
            const found = reflectableAttackInstantForPlayer(state, stackItem, playerId, cards);
            return found ? cards[found.cardId] : undefined;
          })()
        : undefined;
  if (!affectedUnitId || spellRedirectTargets(state, affectedUnitId, "azure", reflectedSpell).length === 0) {
    return [];
  }
  const unit = combat.units[affectedUnitId];
  return unit
    ? [{
        label: `${unit.cardName}: Magic Mirror`,
        action: { type: "USE_UNIT_MAGIC_MIRROR", playerId, unitId: unit.id }
      }]
    : [];
}

/** Whether either shared Spell deck still holds a card for Tarnum VI to Search. */
function tarnumSearchableDeckExists(state: GameState): boolean {
  return [SPELL_DECK_BASIC, SPELL_DECK_EXPERT].some(
    (deckId) =>
      (state.decks[deckId]?.drawPile.length ?? 0) +
        (state.decks[deckId]?.discardPile.length ?? 0) >
      0
  );
}

export function getLegalReactionsForTrigger(
  state: GameState,
  triggerEvent: GameEvent,
  cards: CardLibrary = cardLibrary
): Record<PlayerId, LegalAction[]> {
  // Alamar's Resurrection: its own save window when a unit is about to die.
  if (triggerEvent.type === "UNIT_LETHAL_HIT") {
    return getLethalSaveReactions(state, triggerEvent, cards);
  }

  // Shield of the Dwarven Lords: the defender's post-roll window to ignore the
  // Attack die and the effects it triggered.
  if (triggerEvent.type === "ATTACK_DIE_SETTLED") {
    return getDieCancelReactions(state, triggerEvent.defenderId, triggerEvent.attackerId, cards, triggerEvent.roll);
  }

  if (
    triggerEvent.type !== "SPELL_CAST_STARTED" &&
    triggerEvent.type !== "UNIT_ATTACK_DECLARED" &&
    triggerEvent.type !== "UNIT_ACTIVATION_STARTED"
  ) {
    return {};
  }

  const result: Record<PlayerId, LegalAction[]> = {};
  const isAttackWindow = triggerEvent.type === "UNIT_ATTACK_DECLARED";
  // Recanter's Cloak (option B): "no Hero can use Spells" blocks casting a Spell
  // as a reaction/instant too, not just on a turn (the cast-offer gate handles
  // turn casts). Artifact/ability counters (Resistance, the Boots, etc.) are not
  // Spells and are unaffected.
  const castLocked = getSpellCastRestriction(state).lockAll;

  // Misfortune pre-buff window: the instant an enemy unit declares an attack, the
  // attacked unit's controller may play Misfortune BEFORE any other card. While
  // that phase is open, ONLY Misfortune is offered (to the defender) — no buffs,
  // no debuffs — matching "play immediately when the enemy is attacking, before
  // other cards are played".
  if (isAttackWindow && state.stack.at(-1)?.modifiers.misfortunePhase) {
    return getMisfortunePreWindowReactions(state, triggerEvent, cards);
  }

  // Sorrow take-back: while the activation-skip window is being held open for the
  // caster's Knowledge/Mysticism recall, offer ONLY that recall (see the reducer's
  // SKIP_ACTIVATION handler) — nothing else on the already-skipped unit.
  if (triggerEvent.type === "UNIT_ACTIVATION_STARTED" && state.combat?.pendingActivationSkipRecall) {
    return getActivationSkipRecallReactions(state, cards);
  }

  for (const player of Object.values(state.players)) {
    // Only the two sides actually in the fight may react. A bystander (neither
    // the attacker nor the defender — e.g. another player during someone else's
    // Neutral combat) is never offered an instant/reaction, even a trigger-free
    // "Draw a card" instant (Offense I's draw side) that variantMatchesTrigger
    // would otherwise slot into any open window. Without this gate every attack
    // or cast in a Neutral fight opened a reaction window for every onlooker
    // holding such a card.
    if (state.combat && !isCombatParticipant(state, player.id)) {
      continue;
    }
    const innateMirrorReactions = getInnateMagicMirrorReactions(state, player.id, triggerEvent, cards);
    // Garrison defense: "You cannot use your Deck during this Combat, as
    // your Main Hero is not present" — no card plays for that defender.
    if (isHandLockedInCombat(state, player.id)) {
      if (innateMirrorReactions.length > 0) {
        result[player.id] = innateMirrorReactions;
      }
      continue;
    }
    const expertUsesLeft =
      player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound;
    const spellLimitLeft = spellLimitFor(state, player) - player.combatStats.spellsCastThisRound;
    // Tarnum (Conflux) VI: just-Searched flagged Spells are offered as free
    // over-limit reactions through a dedicated pass below, so the normal
    // (limit-counting, own-discard) reaction path skips them here.
    const tarnumFlagged = new Set(player.combatStats.tarnumOverlimitCards ?? []);

    const reactions: LegalAction[] = [...innateMirrorReactions];
    // Power has no effect of its own during an attack: it may only be paid
    // alongside an instant spell in the same declaration. Power offers are
    // collected apart and only added when such a spell is available.
    const powerReactions: LegalAction[] = [];

    // Spell Book (house rule): a Book Spell may be played as a combat instant
    // exactly like a hand Spell — full Power, expert side, same limit — so the
    // Book entries run through the SAME offer logic, flagged `fromSpellBook` so
    // the reaction resolves from the Book zone. (The Book holds only Spells; the
    // card-kind/timing gates below drop anything that is not a playable instant.)
    const reactionSources: { cardId: CardId; fromSpellBook?: true }[] = [
      ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
      ...(bookCastSourcesEnabled(state)
        ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
        : [])
    ];

    for (const { cardId, fromSpellBook } of reactionSources) {
      const card = cards[cardId];
      // Tarnum-flagged Spells run through the dedicated free over-limit pass.
      if (!fromSpellBook && tarnumFlagged.has(cardId)) {
        continue;
      }
      // Permanents join reaction windows only through their printed expert
      // side (School of Magic +3 power from hand); their basic side is the
      // enter-play action outside reaction windows.
      const allowedTiming =
        card && (card.timing === "reaction" || card.timing === "instant" || Boolean(card.permanent));
      if (!card || !allowedTiming || card.implementationStatus !== "implemented") {
        continue;
      }

      // Spell instants (hand or Book) respect the one-Spell-per-combat-round limit.
      if (card.kind === "spell" && spellLimitLeft <= 0) {
        continue;
      }

      // Recanter's Cloak (option B) locks every Hero out of casting any Spell.
      if (card.kind === "spell" && castLocked) {
        continue;
      }

      for (const variant of getCardPlayVariants(card)) {
        if (variant.mapOnly || !variantMatchesTrigger(variant, triggerEvent, player.id)) {
          continue;
        }

        if (!canAffordCardCost(state, player.id, cardId, variant.cost)) {
          continue;
        }

        // "Immune to all Spells" (and school / Anti-Magic wards) blocks attack-
        // window and activation-skip Spell reactions on the affected unit —
        // Bless / Bloodlust / Curse / Weakness / Shield / Sorrow / …, own or
        // enemy. Non-Spell reactions (Offense, Armorer, artifacts) are untouched.
        if (spellReactionBlockedByImmunity(state, card, variant.effect, triggerEvent)) {
          continue;
        }

        const variantName = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
        const isPowerPlay = variant.effect.type === "ADD_SPELL_POWER";
        const push = (action: LegalAction) => {
          if (isAttackWindow && isPowerPlay) {
            powerReactions.push(action);
          } else {
            reactions.push(action);
          }
        };

        // Magic Mirror is offered through its own dedicated pass
        // (getMagicMirrorReactions), which covers all three windows it can fire
        // in — a single-target cast on your unit, an area cast that would damage
        // your unit, and an instant debuff layered onto an attack. Skip its
        // REDIRECT_SPELL options here so they are never double-offered.
        if (variant.effect.type === "REDIRECT_SPELL") {
          continue;
        }

        // Permanents only join reaction windows through their expert side
        // (School of Magic from hand); their basic side is the enter-play
        // action outside reaction windows.
        if (
          !variant.expertOnly &&
          !card.permanent &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic")
        ) {
          if (variant.effect.type === "ACTIVATE_RANGED_UNIT" && triggerEvent.type === "UNIT_ACTIVATION_STARTED") {
            // Bowstring of the Unicorn's Mane / Valeska's Marksmen VI: one play
            // per eligible ranged unit — the chosen unit travels on the reaction's
            // `target`. Valeska may also re-fire an already-activated unit.
            for (const unitId of getActivateRangedUnitTargets(
              state,
              player.id,
              triggerEvent.unitId,
              variant.effect.allowAlreadyActivated
            )) {
              const targetUnit = state.combat?.units[unitId];
              push(
                makeReactionAction(`${variantName} (${targetUnit?.cardName ?? unitId})${fromSpellBook ? " (Spell Book)" : ""}`, {
                  type: "PLAY_REACTION",
                  playerId: player.id,
                  cardId,
                  mode: "basic",
                  ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
                  ...(fromSpellBook ? { fromSpellBook: true } : {}),
                  target: { type: "unit", unitId }
                })
              );
            }
          } else {
            push(
              makeReactionAction(`${variantName}${fromSpellBook ? " (Spell Book)" : ""}`, {
                type: "PLAY_REACTION",
                playerId: player.id,
                cardId,
                mode: "basic",
                ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
                ...(fromSpellBook ? { fromSpellBook: true } : {})
              })
            );
          }
        }

        if (
          (effectHasExpertMode(variant.effect) || variant.expertOnly) &&
          // An Empowered ability may take its Expert side without a crown.
          (expertUsesLeft > 0 || abilityExpertIsCrownFree(player, cardId)) &&
          isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "expert")
        ) {
          push(
            makeReactionAction(`${variantName} expert${fromSpellBook ? " (Spell Book)" : ""}`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "expert",
              ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
              ...(fromSpellBook ? { fromSpellBook: true } : {})
            })
          );
        }
      }
    }

    // Magic Mirror: its own pass, covering all three windows it fires in. Kept
    // out of the variant loop above (whose trigger gate is tied to the cast
    // window) so an attack-instant or area-damage reflection is offered too.
    for (const offer of getMagicMirrorReactions(state, player, triggerEvent, spellLimitLeft, cards)) {
      reactions.push(offer);
    }

    // Spell Scroll spells played as reactions: basic side only, power-locked
    // to 0, removed once used. They do NOT count toward / are not blocked by
    // the one-Spell-per-round limit (unlike hand/Book instants). Recanter's
    // Cloak (option B) still locks them out along with every other Spell.
    if (!castLocked) {
      for (const scroll of player.scrolls ?? []) {
        for (const cardId of new Set(scroll.spellCardIds)) {
          const card = cards[cardId];
          const allowedTiming =
            card && (card.timing === "reaction" || card.timing === "instant");
          if (!card || card.kind !== "spell" || !allowedTiming || card.implementationStatus !== "implemented") {
            continue;
          }

          for (const variant of getCardPlayVariants(card)) {
            if (
              variant.mapOnly ||
              variant.expertOnly ||
              variant.cost ||
              variant.effect.type === "ADD_SPELL_POWER" ||
              !variantMatchesTrigger(variant, triggerEvent, player.id) ||
              !isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic") ||
              spellReactionBlockedByImmunity(state, card, variant.effect, triggerEvent)
            ) {
              continue;
            }

            const variantName = variant.optionLabel
              ? `${card.name}: ${variant.optionLabel} (Scroll)`
              : `${card.name} (Scroll)`;
            reactions.push(
              makeReactionAction(variantName, {
                type: "PLAY_REACTION",
                playerId: player.id,
                cardId,
                mode: "basic",
                fromScroll: scroll.id,
                ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {})
              })
            );
          }
        }
      }
    }

    // School of Magic (Air/Earth/Fire/Water Magic) in play: the discard-for-+3
    // expert is NOT a reaction here — it would pop an extra prompt on every
    // matching cast. It is decided up front as a cast option instead (a
    // `useSchoolExpert` CAST_SPELL variant; see addSpellActions), so a plain
    // cast just keeps the standing +1 and resolves.

    // Basic X Magic in play (the spell-fetch permanent): +3 Power for a
    // matching-school spell — a normal cast or an instant on the attack — without
    // discarding the permanent. Once per stack per player, and only while you
    // hold an expert use.
    for (const offer of getSchoolFetchExpertActions(state, player.id, triggerEvent, cards)) {
      reactions.push(offer);
    }

    // Brimstone Stormclouds: a stored faction cube powers the owner's cast.
    // Gated on a REAL Spell cast pending — the synthetic specialty-damage window
    // is not a cast, and spendTownCube would reject the spend anyway.
    if (
      triggerEvent.type === "SPELL_CAST_STARTED" &&
      triggerEvent.playerId === player.id &&
      state.stack.at(-1)?.action.type === "CAST_SPELL"
    ) {
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
      for (const buildingId of town?.buildings ?? []) {
        const building = coreBuildingDefinitions[buildingId];
        const cubes = town?.factionCubes?.[buildingId] ?? 0;
        const stackItem = state.stack.at(-1);
        const alreadySpent = (stackItem?.modifiers.townCubePowerBonus ?? 0) >= 1;
        if (building?.effect?.type === "COMBAT_CUBES" && building.effect.spend === "spell-power" && cubes > 0 && !alreadySpent) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 Power (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId }
          });
        }
      }
    }

    // Resistance against an instant Spell buff the OTHER side has played into
    // this attack (Curse/Weakness/Bloodlust/Precision/Bless/Slayer): the player
    // whose unit it was cast against may end it, exactly like Resistance counters
    // an Activation cast — basic ends a spell at or below its power cap, expert
    // ends any power (spending a crown). Reversing the buff is handled by the
    // reducer; only the offer is built here.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attackItem = state.stack.at(-1);
      const instants =
        attackItem?.action.type === "ATTACK_UNIT" || attackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
          ? (attackItem.modifiers.cancellableSpellInstants ?? [])
          : [];
      const enemyInstants = instants.filter((entry) => entry.playerId !== player.id);
      if (enemyInstants.length > 0) {
        // Resistance's basic power cap is judged against the CASTER's own attack
        // Power pool, not a shared total, so one side's Power can't push the
        // other's spell above a cap that should still be cancellable. (In a
        // two-player attack every enemy instant shares the one opposing caster.)
        const spellPower = attackItem?.modifiers.attackPowerByPlayer?.[enemyInstants[0]!.playerId] ?? 0;
        // Spell Book (house rule): Protection / Resistance Spells stashed in the
        // Book cancel an enemy attack-instant the same way a hand copy does.
        const cancelSources: { cardId: CardId; fromSpellBook?: true }[] = [
          ...[...new Set(player.hand)].map((cardId) => ({ cardId })),
          ...(bookCastSourcesEnabled(state)
            ? [...new Set(player.spellBook ?? [])].map((cardId) => ({ cardId, fromSpellBook: true as const }))
            : [])
        ];
        for (const { cardId, fromSpellBook } of cancelSources) {
          const card = cards[cardId];
          if (
            !card ||
            card.effect.type !== "CANCEL_SPELL" ||
            card.implementationStatus !== "implemented" ||
            (card.timing !== "reaction" && card.timing !== "instant")
          ) {
            continue;
          }
          const cancel = card.effect;
          // Protection-from-X is offered only when an enemy instant of its own
          // School (and, at basic, Basic level) is on the attack; Resistance, with
          // no such gate, matches every enemy instant.
          const matchesAt = (mode: CardPlayMode) =>
            enemyInstants.some((entry) =>
              cancelSpellAllowsSchoolAndLevel(
                cancel,
                { schools: cards[entry.cardId]?.spellSchools ?? [], level: cards[entry.cardId]?.spellLevel },
                mode
              )
            );
          // Basic still respects Resistance's power cap (Protection has none).
          if ((cancel.maxPower === undefined || spellPower <= cancel.maxPower) && matchesAt("basic")) {
            reactions.push(
              makeReactionAction(`${card.name}${fromSpellBook ? " (Spell Book)" : ""}`, {
                type: "PLAY_REACTION",
                playerId: player.id,
                cardId,
                mode: "basic",
                ...(fromSpellBook ? { fromSpellBook: true } : {})
              })
            );
          }
          if (
            (cancel.expertIgnoresMaxPower || cancel.expertIgnoresMaxSpellLevel) &&
            (expertUsesLeft > 0 || abilityExpertIsCrownFree(player, cardId)) &&
            matchesAt("expert")
          ) {
            reactions.push(
              makeReactionAction(`${card.name} expert${fromSpellBook ? " (Spell Book)" : ""}`, {
                type: "PLAY_REACTION",
                playerId: player.id,
                cardId,
                mode: "expert",
                ...(fromSpellBook ? { fromSpellBook: true } : {})
              })
            );
          }
        }
      }
    }

    // Knowledge / Mysticism after a spell instant this player played into the
    // pending attack (Stone Skin, Bloodlust, Curse, Misfortune, …): "play
    // immediately after casting a spell — take the Spell card back into your
    // hand instead of discarding it." The cast-window play is matched by the
    // generic variant loop (Knowledge's printed trigger is SPELL_CAST_STARTED);
    // this dedicated pass covers the attack-declared buff exchange
    // (UNIT_ATTACK_DECLARED, incl. Misfortune's pre-buff phase), where the spell
    // was cast as a reaction and no cast window ever opens. The reducer arms a
    // DEFERRED take-back of the player's most recent recallable entry and
    // consumes it — released only once the attack resolves, so it can never be
    // re-cast into the same attack. The offer disappears once every own spell on
    // this attack has been recalled. (The lethal-save window's Resurrection
    // recall is offered separately in getLethalSaveReactions, since that window
    // is computed on its own path.)
    // (Sorrow's activation-skip recall is handled by its own kept-open window
    // above; Magic Mirror's redirect and a counter played into a cast still
    // close their window on play, so those casts stay unrecallable.)
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attackItem = state.stack.at(-1);
      const hasOwnRecallable =
        (attackItem?.action.type === "ATTACK_UNIT" || attackItem?.action.type === "MOVE_AND_ATTACK_UNIT") &&
        (attackItem.modifiers.recallableSpellReactions ?? []).some((entry) => entry.playerId === player.id);
      if (hasOwnRecallable) {
        reactions.push(...spellRecallReactionOffers(player, cards));
      }
    }

    // Hall of Valhalla: once per round, +1 attack on one of your attacks.
    // Misfortune-locked attacks cannot be buffed, so it is not offered then.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
      if (attacker && attacker.controllerId === player.id && !attackLocked) {
        const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
        for (const buildingId of town?.buildings ?? []) {
          const building = coreBuildingDefinitions[buildingId];
          if (
            building?.effect?.type === "HALL_OF_VALHALLA" &&
            (player.buildingUsedRound?.[buildingId] ?? 0) !== state.round
          ) {
            reactions.push({
              label: `${building.name}: +${building.effect.amount} attack on this attack (once per round)`,
              action: { type: "HALL_OF_VALHALLA_BOOST", playerId: player.id, buildingId }
            });
          }
        }
      }
    }

    // Crag Hack's Offense VI: while its aura is up, discard any held card during
    // your own unit's attack for +1 attack ("every card you play can grant +1
    // attack instead of its effect"). One offer per distinct held card; the window
    // reopens after each conversion, so several cards can stack on one attack.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
      const auraAmount = state.activeEffects.reduce((sum, effect) => {
        if (effect.scope !== "player" || effect.controllerId !== player.id) {
          return sum;
        }
        return sum + effect.modifiers.reduce((inner, modifier) => inner + (modifier.type === "CARDS_AS_ATTACK_BONUS" ? modifier.amount : 0), 0);
      }, 0);
      if (attacker && attacker.controllerId === player.id && !attackLocked && auraAmount > 0) {
        for (const cardId of [...new Set(player.hand)]) {
          reactions.push({
            label: `Offense VI: discard ${cardLibrary[cardId]?.name ?? cardId} for +${auraAmount} attack`,
            action: { type: "CONVERT_CARD_TO_ATTACK", playerId: player.id, cardId }
          });
        }
      }
    }

    // Cage of Warlords: while an attack waits to resolve, remove a faction
    // cube for +1 attack (you are the attacker) or +1 defense (your unit is
    // the target). One per cube — offered again while cubes remain.
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
      const attacker = state.combat?.units[triggerEvent.attackerId];
      const defender = state.combat?.units[triggerEvent.defenderId];
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === player.id);
      for (const buildingId of town?.buildings ?? []) {
        const building = coreBuildingDefinitions[buildingId];
        const cubes = town?.factionCubes?.[buildingId] ?? 0;
        if (building?.effect?.type !== "COMBAT_CUBES" || building.effect.spend !== "attack-or-defense" || cubes <= 0) {
          continue;
        }
        // A Misfortune-locked attack cannot be buffed: the attacker's +attack
        // option is withheld, but the defender's +defense option stands.
        const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
        if (attacker && attacker.controllerId === player.id && !attackLocked) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 attack (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId, boost: "attack" }
          });
        }
        if (defender && defender.controllerId === player.id) {
          reactions.push({
            label: `${building.name}: remove 1 cube for +1 defense (${cubes} stored)`,
            action: { type: "SPEND_TOWN_CUBE", playerId: player.id, buildingId, boost: "defense" }
          });
        }
      }
    }

    // Positive Morale "Combat Bonus" (+1 Attack / +1 Defense for this Combat):
    // playable as an instant-window reaction too, not only on the holder's own
    // turn (addMoraleActions). It is a combat-long player buff, so a holder may
    // drop it into an open attack window — the defender adds +1 Defense to blunt
    // the incoming hit, the attacker +1 Attack. The +Attack pick is withheld only
    // when THIS attack is Misfortune-locked and it is the player's own attack
    // (a negated buff would be misleading; +Defense is never negated). The used
    // card returns to its deck, and the window refreshes (reducer) so it is not
    // re-offered. "+1 Combat Power" is Battlefield-mode only (inert here).
    if (
      triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
      moraleCardsRuleEnabled(state) &&
      // Raid-boss Fear (§6.8): a living enemy Fear unit locks every morale USE
      // — the reaction-window combat bonus included.
      !moraleLockedForPlayer(state.combat, player.id)
    ) {
      const held = player.moraleCards?.positive ?? [];
      if (held.includes(MORALE_CARD_IDS.combatBonus)) {
        const attacker = state.combat?.units[triggerEvent.attackerId];
        const attackLocked = Boolean(state.stack.at(-1)?.modifiers.negateAttackBuffs);
        const isOwnAttack = attacker?.controllerId === player.id;
        if (!(isOwnAttack && attackLocked)) {
          reactions.push({
            label: "Positive Morale: +1 Attack for this Combat",
            action: { type: "SPEND_MORALE", playerId: player.id, benefit: "combat-bonus", bonus: "attack" }
          });
        }
        reactions.push({
          label: "Positive Morale: +1 Defense for this Combat",
          action: { type: "SPEND_MORALE", playerId: player.id, benefit: "combat-bonus", bonus: "defense" }
        });
      }
    }

    // The printed alternative bottom effect: discard any Spell card for
    // +1 Power — toward your own cast, or paired with an instant spell in an
    // attack window (the batch validator enforces the pairing). NOT offered in
    // the Sorrow activation-skip window: that window has no spell on the stack
    // to empower, and Sorrow pays its own Power as the chosen option's cost.
    const boostLegal =
      (triggerEvent.type === "SPELL_CAST_STARTED"
        ? triggerEvent.playerId === player.id
        : isCombatParticipant(state, player.id)) &&
      triggerEvent.type !== "UNIT_ACTIVATION_STARTED";
    if (boostLegal) {
      for (const cardId of new Set(player.hand)) {
        const card = cards[cardId];
        if (card?.kind === "spell") {
          const boost = makeReactionAction(`Discard ${card.name}: +1 Power`, {
            type: "PLAY_REACTION",
            playerId: player.id,
            cardId,
            mode: "basic",
            asPowerBoost: true
          });
          if (isAttackWindow) {
            powerReactions.push(boost);
          } else {
            reactions.push(boost);
          }
        }
      }

      // Spell Book (house rule): a Book Spell may also be discarded for +1 Power,
      // but only ONE Book Spell per turn (crown-style). Once the per-turn budget is
      // spent (spellBookPowerUsedThisTurn) no Book Power boost is offered; hand
      // boosts above are unaffected.
      if (spellBookRuleEnabled(state) && spellBookPowerAvailable(player)) {
        for (const cardId of new Set(player.spellBook ?? [])) {
          const card = cards[cardId];
          if (card?.kind === "spell") {
            const boost = makeReactionAction(`Discard ${card.name}: +1 Power (Spell Book)`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "basic",
              asPowerBoost: true,
              fromSpellBook: true
            });
            if (isAttackWindow) {
              powerReactions.push(boost);
            } else {
              reactions.push(boost);
            }
          }
        }
      }
    }

    // Attack windows: only spells that modify the attack (buffs/nerfs of
    // attack or defense) may consume Power, so Power plays are offered only
    // while the player still holds such an instant spell to pair them with…
    const hasPairableSpell = reactions.some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        !legal.action.asPowerBoost &&
        cards[legal.action.cardId]?.kind === "spell"
    );
    // …or while a Power-scaling spell this player already cast into the attack
    // is still on the stack waiting to grow (the caster keeps priority and may
    // keep empowering a Bloodlust/Bless after playing it).
    const attackStackItem = isAttackWindow ? state.stack.at(-1) : undefined;
    const attackOwner =
      attackStackItem?.action.type === "ATTACK_UNIT" || attackStackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
        ? attackStackItem.action.playerId
        : undefined;
    // Either side may keep empowering a Power-scaling spell instant THEY already
    // cast into this attack (the attacker's Bloodlust/Slayer/Frenzy, the
    // defender's Curse/Weakness) — each pays into their own Power pool.
    const hasEmpowerablePlayed =
      (attackStackItem?.modifiers.powerScaledAttackInstants ?? []).some((record) => record.playerId === player.id) ||
      (attackOwner === player.id && attackStackItem?.modifiers.slayerRollsByPower !== undefined) ||
      attackStackItem?.modifiers.ignoreDefenseCasterId === player.id;
    if (!isAttackWindow || hasPairableSpell || hasEmpowerablePlayed) {
      reactions.push(...powerReactions);
    }

    // Tarnum (Conflux) VI used AS a reaction: in an attack window the holder may
    // play the specialty to Search 2 Spells (the per-search deck choice opens),
    // then — once the window re-derives its offers — immediately cast an
    // applicable Searched instant into the SAME window. Offered to either side
    // (the attacker's buffs, the defender's debuffs).
    if (triggerEvent.type === "UNIT_ATTACK_DECLARED" && tarnumSearchableDeckExists(state)) {
      for (const cardId of new Set(player.hand)) {
        const card = cards[cardId];
        if (
          card?.kind === "hero-specialty" &&
          card.implementationStatus === "implemented" &&
          card.effect.type === "TARNUM_OVERLIMIT_SEARCH"
        ) {
          reactions.push(
            makeReactionAction(`${card.name}: Search 2 Spells`, {
              type: "PLAY_REACTION",
              playerId: player.id,
              cardId,
              mode: "basic"
            })
          );
        }
      }
    }

    // Tarnum (Conflux) VI: a just-Searched, flagged trigger-instant Spell (Bless,
    // Curse, Stone Skin… — the attack/defense changers) is castable here in the
    // instant window for FREE, OVER the per-round limit, returning to the shared
    // Spell deck top or its discard pile (the caster's choice). Offered as a
    // dedicated pass so it bypasses the spell-limit gate the normal path applies.
    if (!castLocked) {
      for (const cardId of tarnumFlagged) {
        if (!player.hand.includes(cardId)) {
          continue;
        }
        const card = cards[cardId];
        if (!card || card.kind !== "spell" || card.implementationStatus !== "implemented") {
          continue;
        }
        for (const variant of getCardPlayVariants(card)) {
          if (
            variant.mapOnly ||
            variant.expertOnly ||
            Boolean(card.permanent) ||
            variant.effect.type === "ADD_SPELL_POWER" ||
            variant.effect.type === "REDIRECT_SPELL" ||
            !variantMatchesTrigger(variant, triggerEvent, player.id) ||
            !isEffectLegalForTrigger(state, player.id, variant.effect, triggerEvent, "basic") ||
            spellReactionBlockedByImmunity(state, card, variant.effect, triggerEvent)
          ) {
            continue;
          }
          const base = variant.optionLabel ? `${card.name}: ${variant.optionLabel}` : card.name;
          for (const tarnumReturn of ["deck-top", "discard"] as const) {
            reactions.push(
              makeReactionAction(
                `${base} (free; ${tarnumReturn === "deck-top" ? "to Spell deck top" : "to Spell discard"})`,
                {
                  type: "PLAY_REACTION",
                  playerId: player.id,
                  cardId,
                  mode: "basic",
                  ...(variant.optionIndex !== undefined ? { optionIndex: variant.optionIndex } : {}),
                  tarnumReturn
                }
              )
            );
          }
        }
      }
    }

    if (reactions.length > 0) {
      result[player.id] = reactions;
    }
  }

  // Pre-hit heals (First Aid Tent, First Aid ability, Cure and kin): mend an
  // existing wound BEFORE the incoming damage is calculated — usable as an
  // instant against BOTH a declared unit attack AND a pending damaging Spell /
  // specialty on the stack (not only Resistance / Magic Mirror / Protection).
  // A healed unit therefore enters the hit with more health. Optional: pass
  // and take the hit. Offered only to the side(s) about to be damaged so a
  // non-damaging cast (Haste, buff) never forces a heal window.
  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const defenderId = state.combat?.units[triggerEvent.defenderId]?.controllerId;
    if (defenderId) {
      const heals = preHitHealReactions(state, defenderId, cards);
      if (heals.length > 0) {
        result[defenderId] = [...(result[defenderId] ?? []), ...heals];
      }
    }

    // WOG Commanders: the defend buffs (Hierophant's Shield, Ogre Leader's Stone
    // Skin) are INSTANT REACTIONS — offered to the attacked unit's controller
    // before the hit's damage, buffing that unit's Defense. Once per combat round,
    // free, off-turn (does not lock the commander's movement).
    const defenderUnit = state.combat?.units[triggerEvent.defenderId];
    const attackerUnit = state.combat?.units[triggerEvent.attackerId];
    if (defenderUnit) {
      const commander = commanderDefenseReactionUnit(state, defenderUnit, attackerUnit);
      const cast = commander ? commanderCastOf(commander) : null;
      if (commander && cast) {
        const owner = defenderUnit.controllerId;
        result[owner] = [
          ...(result[owner] ?? []),
          {
            label: `${commander.cardName}: cast ${cast.name} (Power ${commanderCastPower(state, commander)}) on ${defenderUnit.cardName}`,
            action: {
              type: "USE_COMMANDER_CAST_REACTION",
              playerId: owner,
              commanderUnitId: commander.id,
              targetUnitId: defenderUnit.id
            }
          }
        ];
      }
    }

    // Anime Hero Grades (§3.11): the reaction skills — Battle Focus (+Attack on
    // YOUR attacking unit) and Iron Will (+Defense on YOUR attacked unit),
    // offered to the relevant side in this open attack window. Non-card instants
    // (no spell/limit gate), only in the main hero's battle, once per combat.
    for (const [reactUnit, role] of [
      [state.combat?.units[triggerEvent.attackerId], "attacker"],
      [state.combat?.units[triggerEvent.defenderId], "defender"]
    ] as const) {
      const owner = reactUnit?.controllerId;
      if (!reactUnit || !owner || owner === NEUTRAL_PLAYER_ID || !playerMainHeroInCombat(state, owner)) {
        continue;
      }
      for (const nodeId of heroGradeNodesOf(state, owner)) {
        const node = HERO_GRADE_NODES[nodeId];
        if (node?.skill?.mode !== "reaction" || node.skill.role !== role || !heroSkillAvailableThisCombat(state, owner, nodeId)) {
          continue;
        }
        result[owner] = [
          ...(result[owner] ?? []),
          {
            label: `${node.name.en}: ${reactUnit.cardName} +${node.skill.amount} ${node.skill.stat === "attack" ? "Attack" : "Defense"}`,
            action: { type: "USE_HERO_SKILL_REACTION", playerId: owner, nodeId, unitId: reactUnit.id }
          }
        ];
      }
    }
  }

  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    for (const player of Object.values(state.players)) {
      if (state.combat && !isCombatParticipant(state, player.id)) {
        continue;
      }
      if (!playerThreatenedByPendingDamage(state, triggerEvent, player.id, cards)) {
        continue;
      }
      const heals = preHitHealReactions(state, player.id, cards);
      if (heals.length > 0) {
        result[player.id] = [...(result[player.id] ?? []), ...heals];
      }
    }
  }

  return result;
}

/** Whether a card's schools include `school` (or the school-agnostic "any"). */
function cardMatchesSchool(cardId: CardId, school: SpellSchool): boolean {
  const schools = cardLibrary[cardId]?.spellSchools ?? [];
  return schools.includes(school) || schools.includes("any");
}

/**
 * Whether `playerId` has a Power-scaling spell instant of `school` of their own
 * on this attack — the spells whose Power the Basic X Magic +3 expert can feed:
 * the recorded buffs/debuffs (Bloodlust, Curse, Weakness, Precision, the scaled
 * Bless), plus Slayer and Frenzy (both Fire, tracked separately).
 */
export function playerHasAttackInstantOfSchool(
  stackItem: ResolutionStackItem,
  playerId: PlayerId,
  school: SpellSchool
): boolean {
  const records = stackItem.modifiers.powerScaledAttackInstants ?? [];
  if (records.some((record) => record.playerId === playerId && cardMatchesSchool(record.cardId, school))) {
    return true;
  }
  const attackerId =
    stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
      ? stackItem.action.playerId
      : undefined;
  // Slayer and Frenzy are Fire and do not create scaling records.
  if (school === "fire") {
    if (stackItem.modifiers.slayerRollsByPower !== undefined && attackerId === playerId) {
      return true;
    }
    if (stackItem.modifiers.ignoreDefenseCasterId === playerId) {
      return true;
    }
  }
  return false;
}

/**
 * Basic X Magic (in-play spell-fetch permanent): its expert +3 Power offers, for
 * every school the player can fetch. Offered while one of the player's matching
 * spells is on the stack — a normal cast they own, or an instant of that school
 * they played into the attack — and an expert use remains, once per stack.
 */
function getSchoolFetchExpertActions(
  state: GameState,
  playerId: PlayerId,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  cards: CardLibrary
): LegalAction[] {
  if (triggerEvent.type !== "SPELL_CAST_STARTED" && triggerEvent.type !== "UNIT_ATTACK_DECLARED") {
    return [];
  }
  const player = state.players[playerId];
  if (!player || expertUsesAvailable(player) <= 0) {
    return [];
  }
  const stackItem = triggerEvent.type === "UNIT_ATTACK_DECLARED" ? state.stack.at(-1) : getPendingStackItem(state, triggerEvent);
  if (!stackItem || (stackItem.modifiers.schoolFetchExpertUsedBy ?? []).includes(playerId)) {
    return [];
  }

  const offers: LegalAction[] = [];
  for (const school of activeSchoolFetches(state, playerId)) {
    let matches = false;
    if (stackItem.action.type === "CAST_SPELL") {
      if (stackItem.action.playerId === playerId && !stackItem.modifiers.scrollLocked) {
        const schools = cards[stackItem.action.cardId]?.spellSchools ?? [];
        matches = schools.includes(school) || schools.includes("any");
      }
    } else if (
      stackItem.action.type === "ATTACK_UNIT" ||
      stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
    ) {
      matches = playerHasAttackInstantOfSchool(stackItem, playerId, school);
    }
    if (matches) {
      offers.push({
        label: `Basic ${school.charAt(0).toUpperCase()}${school.slice(1)} Magic: +3 Power (expert — discards the permanent)`,
        action: { type: "USE_SCHOOL_FETCH_EXPERT", playerId, school }
      });
    }
  }
  return offers;
}

function variantMatchesTrigger(
  variant: CardPlayVariant,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  playerId: PlayerId
): boolean {
  if (!variant.trigger) {
    // A trigger-free "Draw a card" instant (the Breastplate of Petrified Wood's
    // "Draw 1 card" arm, Offense/Armorer I's draw option, …) is NOT a response to
    // any trigger — drawing a card has nothing to do with the spell/attack/
    // activation that opened the window. It used to be offered in EVERY reaction
    // window, which FORCED a reaction window to open (and dragged its holder into
    // it) the instant ANY spell was cast / attack declared / unit activated — so
    // merely *holding* such a card meant "suddenly you must use it / pass" on
    // every opponent's action. That is the forced-use bug.
    //
    // These draws stay fully playable on the holder's OWN initiative — on their
    // turn and off-turn via addPlayableCardActions — they just never force or
    // join a reaction window. (A real triggered reaction, e.g. the breastplate's
    // "+1 Power" on your own cast or Armorer's "+defense, then draw" on an
    // incoming attack, still works: those carry a `trigger` and fall through.)
    return false;
  }

  if (variant.trigger.event !== triggerEvent.type) {
    // Power plays declared on a SPELL_CAST trigger may also be paid into an
    // attack window, fueling a spell instant in the same declaration.
    if (
      triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
      variant.trigger.event === "SPELL_CAST_STARTED" &&
      variant.effect.type === "ADD_SPELL_POWER"
    ) {
      return true;
    }
    // Interference / Plate of the Dying Light: their "+X defense" base is the
    // same as Armorer's, i.e. a plain defense reaction usable against a physical
    // attack too (the spell-damage-reduction rider is simply inert vs an attack).
    // Their printed trigger is the SPELL_CAST window, so cross them into the
    // attack window for the DEFENDER — the side whose unit is being attacked.
    // isEffectLegalForTrigger re-checks the exact defender match.
    if (
      triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
      variant.trigger.event === "SPELL_CAST_STARTED" &&
      variant.effect.type === "INTERFERE_SPELL"
    ) {
      return triggerEvent.playerId !== playerId;
    }
    return false;
  }

  const isSelf = triggerEvent.playerId === playerId;
  if (variant.trigger.controller === "self" && !isSelf) {
    return false;
  }

  if (variant.trigger.controller === "opponent" && isSelf) {
    return false;
  }

  return true;
}

function getPendingStackItem(state: GameState, triggerEvent: GameEvent) {
  return state.stack.find((item) => item.triggerEventIds.includes(triggerEvent.id));
}

/**
 * The Power a spell will RESOLVE at — the single source of truth shared by the
 * cast pipeline (reducer's getCurrentSpellPower delegates here) and the live UI
 * power readout / Resistance offer gate, so the defender always SEES and is
 * GATED BY the exact Power the spell finally resolves at. Mirrors the cast
 * formula verbatim:
 *   (printed power + Power statistics/"+1 Power" Spell discards + School-of-Magic
 *    bonus + Brimstone town cube + Adrienne's Fire Magic + Astrologers' school
 *    proclamation + Pandora's flat bonus)
 *   × the matching Elemental-Orb multiplier − the enemy Pegasi reduction,
 *   floored at 0.
 * A Spell Scroll cast ignores standing/school/equipment Power and Orb
 * doubling: only Power paid into THIS cast window (`spellPowerBonus` from
 * Power cards / "+1 Power" discards) counts, and only up to the spell's
 * lowest useful tier (`spellMinUsefulPower`) — so you may fuel Implosion to
 * Power 1 for its first damage rung, but never climb a higher ladder. Spells
 * whose lowest useful tier is 0 (Magic Arrow, Lightning Bolt…) stay at 0.
 *
 * Previously the readout/gate counted only the stack-item modifier terms and
 * silently dropped the Orb doubling, the school/flat bonuses and the Pegasi
 * reduction — so a Lightning Bolt doubled by an Air Orb showed (and let the
 * defender Resist) "Power 1" while it actually resolved at Power 2. Unifying
 * with the cast removes that divergence.
 */
export function resolvedSpellPowerForStackItem(
  state: GameState,
  stackItem: ResolutionStackItem | undefined,
  cards: CardLibrary = cardLibrary
): number {
  if (!stackItem || stackItem.action.type !== "CAST_SPELL") {
    return 0;
  }
  const card = cards[stackItem.action.cardId];
  if (stackItem.modifiers.scrollLocked) {
    // Scroll: paid Power into this window only, capped at the lowest useful tier.
    const minUseful = spellMinUsefulPower(card);
    const paid = Math.max(0, stackItem.modifiers.spellPowerBonus);
    if (minUseful <= 0) {
      return 0;
    }
    return Math.min(paid, minUseful);
  }
  const playerId = stackItem.action.playerId;
  const base =
    (card?.power ?? 0) +
    stackItem.modifiers.spellPowerBonus +
    (stackItem.modifiers.schoolPowerBonus ?? 0) +
    (stackItem.modifiers.townCubePowerBonus ?? 0) +
    getSchoolPowerBonus(state, playerId, card) +
    astrologersSchoolPowerBonusFor(state, card) +
    permanentSpellPowerBonus(state, playerId) +
    // Anime Cultivation Nascent Soul (realm 3, §5.6): +1 Power on every cast —
    // same chokepoint as the preview (standingSpellPower), so Book Spell casts
    // (polish-spell-book) and normal casts alike resolve one Power tier higher.
    cultivationSpellPowerBonus(state, playerId) +
    // Anime Hero Grades Arcane Insight (tier 3, §3.11): +1 Power at the resolve
    // chokepoint too, agreeing with the standingSpellPower preview above.
    heroGradeSpellPowerBonus(state, playerId) +
    // Anime Equipment Cosmos Pendant (§3.13): +1 Power at the resolve chokepoint
    // too, agreeing with the standingSpellPower preview above.
    equipmentSpellPowerBonus(state, playerId);
  const doubled = base * getSchoolPowerMultiplier(state, playerId, card);
  return Math.max(0, doubled - enemySpellPowerReductionFor(state, playerId));
}

/**
 * Astrologers Blue Sky (Air+Water) / Scorched Ground (Earth+Fire): +Power to
 * every matching-school spell while the card is up, for every player. A
 * school-agnostic "any" spell (Magic Arrow) qualifies for either proclamation,
 * mirroring getSchoolPowerBonus. Replicated here (the reducer keeps its own copy
 * private) so the readout and the cast stay byte-for-byte equal.
 */
function astrologersSchoolPowerBonusFor(state: GameState, spellCard: CardDefinition | undefined): number {
  const active = getActiveAstrologersCard(state);
  if (active?.effect.type !== "SCHOOL_SPELL_POWER_BONUS") {
    return 0;
  }
  const schools = spellCard?.spellSchools ?? [];
  const matches = schools.includes("any") || active.effect.schools.some((school) => schools.includes(school));
  return matches ? active.effect.amount : 0;
}

/**
 * Rampart/neutral Pegasi drain the Power of every spell their enemy resolves (to
 * a minimum of 0); Orb of Vulnerability suppresses the drain. Mirrors the
 * reducer's enemySpellPowerReduction so the readout/gate match the cast.
 */
function enemySpellPowerReductionFor(state: GameState, casterPlayerId: PlayerId): number {
  const combat = state.combat;
  if (!combat || spellAbilitiesSuppressed(state)) {
    return 0;
  }
  let total = 0;
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== casterPlayerId && isUnitAlive(unit)) {
      total += getEnemySpellPowerReduction(unit);
    }
  }
  return total;
}

/** Whether a spell of `school` (or "any") has already been played into this attack. */
function attackStackHasSpellOfSchool(stackItem: ResolutionStackItem | undefined, school: SpellSchool): boolean {
  if (!stackItem) {
    return false;
  }
  return stackItem.modifiers.playedCardIds.some((id) => {
    const card = cardLibrary[id];
    if (card?.kind !== "spell") {
      return false;
    }
    const schools = card.spellSchools ?? [];
    return schools.includes(school) || schools.includes("any");
  });
}

function getPendingSpellPower(state: GameState, triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" }>): number {
  return resolvedSpellPowerForStackItem(state, getPendingStackItem(state, triggerEvent));
}

/**
 * The current Power of whatever an open reaction window is reacting to — a spell
 * cast or a declared attack carrying a Power-scaling spell instant. Returns the
 * printed base, the Power fueled on top (Power cards / +1-Power discards /
 * School of Magic / town cube), and their sum. The UI shows this live so a
 * caster can SEE how much Power they have committed, and the defender can SEE
 * the final Power before deciding Resistance (capped at Power 1) or Magic
 * Mirror. Returns null when nothing power-relevant is pending.
 */
export type PendingReactionPower = {
  kind: "spell" | "attack";
  /** The spell being empowered (null for a bare attack window). */
  spellCardId: CardId | null;
  /** Printed power of the spell (0 for an attack). */
  basePower: number;
  /** Power added since the cast/declaration. */
  fueledPower: number;
  /** basePower + fueledPower — the power level it currently resolves at. */
  totalPower: number;
};

export function getPendingReactionPower(
  state: GameState,
  cards: CardLibrary = cardLibrary
): PendingReactionPower | null {
  const window = state.reactionWindow;
  if (!window) {
    return null;
  }
  const trigger = window.triggerEvent;
  if (trigger.type !== "SPELL_CAST_STARTED" && trigger.type !== "UNIT_ATTACK_DECLARED") {
    return null;
  }

  const stackItem = getPendingStackItem(state, trigger) ?? state.stack.at(-1);
  if (!stackItem) {
    return null;
  }

  if (stackItem.action.type === "CAST_SPELL") {
    const basePower = stackItem.modifiers.scrollLocked ? 0 : cards[stackItem.action.cardId]?.power ?? 0;
    // The resolved Power (with Orb doubling / school + flat bonuses / Pegasi
    // reduction) drives the displayed total and the damage preview; the fuelled
    // portion is the remainder so the "base + fuelled" line still sums to it.
    const totalPower = resolvedSpellPowerForStackItem(state, stackItem, cards);
    return {
      kind: "spell",
      spellCardId: stackItem.action.cardId,
      basePower,
      fueledPower: totalPower - basePower,
      totalPower
    };
  }

  if (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT") {
    // Attack windows pool Power per caster, so the readout reports the Power the
    // player currently on priority has fuelled into their own spell instant
    // (the attacker's Bloodlust/Bless/Slayer or the defender's Curse/Weakness).
    const fueledPower = stackItem.modifiers.attackPowerByPlayer?.[window.priorityPlayerId] ?? 0;
    // An attack only has a Power to report while a Power-scaling spell instant
    // (Bloodlust/Bless/Slayer) sits on it — otherwise a plain attack has none.
    const hasPowerSubject =
      fueledPower > 0 ||
      (stackItem.modifiers.powerScaledAttackInstants?.length ?? 0) > 0 ||
      stackItem.modifiers.slayerRollsByPower !== undefined;
    if (!hasPowerSubject) {
      return null;
    }
    return { kind: "attack", spellCardId: null, basePower: 0, fueledPower, totalPower: fueledPower };
  }

  return null;
}

export function effectHasExpertMode(effect: ConcreteEffect): boolean {
  if (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER" || effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }

  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }

  if (effect.type === "RECALL_SPELL") {
    // Mysticism's expert side recalls every card played with the spell;
    // Knowledge's expert side raises the spell-per-round limit. Either makes the
    // expert play real.
    return Boolean(effect.expertSpellLimitBonus || effect.expertRecallPlayedCards);
  }

  if (effect.type === "CANCEL_SPELL") {
    // Resistance's expert ignores the power cap; Protection-from-X's expert
    // ignores the spell-level cap. Either makes the card's expert play real.
    return Boolean(effect.expertIgnoresMaxPower || effect.expertIgnoresMaxSpellLevel);
  }

  // Interference has an expert side (+2 instead of +1); Plate of the Dying
  // Light reuses the same effect with no expert side, so it omits expertAmount.
  if (effect.type === "INTERFERE_SPELL") {
    return effect.expertAmount !== undefined;
  }

  return false;
}

function makeReactionAction(label: string, action: Extract<GameAction, { type: "PLAY_REACTION" }>): LegalAction {
  const modeLabel = action.mode === "expert" ? " (expert)" : "";
  return {
    label: `Play ${label}${modeLabel}`,
    action
  };
}

export function isEffectLegalForTrigger(
  state: GameState,
  playerId: PlayerId,
  effect: ConcreteEffect,
  triggerEvent: Extract<GameEvent, { type: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED" }>,
  mode: CardPlayMode
): boolean {
  // Sorrow: skip the about-to-activate unit. Offered to the unit's opponent
  // only, and only the CHOOSE_ONE option whose grade matches that unit (bronze
  // free, silver pay 2, gold pay 4) — so the tray shows a single "skip this
  // unit" choice with its cost picker. Whether that cost is affordable is judged
  // separately by canAffordCardCost, so a grade you cannot pay never opens the
  // window.
  if (triggerEvent.type === "UNIT_ACTIVATION_STARTED") {
    // Bowstring of the Unicorn's Mane: either side may interject here (controller
    // "any") to activate one of THEIR ranged units that has not acted this round —
    // never the unit about to activate. Legal as long as such a ranged unit
    // exists; the offer loop enumerates one play per eligible unit.
    if (effect.type === "ACTIVATE_RANGED_UNIT") {
      return (
        getActivateRangedUnitTargets(state, playerId, triggerEvent.unitId, effect.allowAlreadyActivated).length > 0
      );
    }
    if (effect.type !== "SKIP_ACTIVATION" || !effect.grade) {
      return false;
    }
    if (triggerEvent.playerId === playerId) {
      return false;
    }
    const unit = state.combat?.units[triggerEvent.unitId];
    return Boolean(unit && isUnitAlive(unit) && gradeRankOfUnit(unit) === gradeRank(effect.grade));
  }

  // Card draws are timing-free instants: they fit inside any open window.
  if (effect.type === "DRAW_CARDS") {
    return true;
  }

  if (triggerEvent.type === "SPELL_CAST_STARTED") {
    if (effect.type === "ADD_SPELL_POWER") {
      if (triggerEvent.playerId !== playerId) {
        return false;
      }
      // Power only empowers a real Spell cast — never a specialty damage card
      // that reuses the SPELL_CAST_STARTED window so pre-hit heals can fire.
      const stackItemForPower = getPendingStackItem(state, triggerEvent);
      if (stackItemForPower?.action.type !== "CAST_SPELL") {
        return false;
      }

      // Elemental Magic boosts only empower their own school.
      if (effect.schoolOnly) {
        const pendingSpell = cardLibrary[stackItemForPower.action.cardId];
        const schools = pendingSpell?.spellSchools ?? [];
        return schools.includes(effect.schoolOnly) || schools.includes("any");
      }

      return true;
    }

    // Tome of X (option B): offered to the caster only, while casting a spell of
    // the Tome's School (a school-agnostic "any" spell qualifies).
    if (effect.type === "SET_SPELL_POWER_MAX") {
      if (triggerEvent.playerId !== playerId) {
        return false;
      }
      const stackItem = getPendingStackItem(state, triggerEvent);
      const pendingSpell =
        stackItem?.action.type === "CAST_SPELL" ? cardLibrary[stackItem.action.cardId] : undefined;
      const schools = pendingSpell?.spellSchools ?? [];
      return schools.includes(effect.schoolOnly) || schools.includes("any");
    }

    if (effect.type === "CANCEL_SPELL") {
      if (triggerEvent.playerId === playerId) {
        return false;
      }

      // Only a real Spell cast can be cancelled. A specialty damage card that
      // reuses the SPELL_CAST_STARTED window (so pre-hit heals can fire) is not
      // a Spell — offering Resistance there would spend the card for nothing
      // (the reducer's cancel branch is gated on CAST_SPELL and never fires).
      const pendingStackItem = getPendingStackItem(state, triggerEvent);
      if (pendingStackItem?.action.type !== "CAST_SPELL") {
        return false;
      }

      // Protection-from-X: the pending spell must belong to the card's School,
      // and (basic play) be a Basic spell. Resistance leaves both gates open.
      const pendingSpell = cardLibrary[pendingStackItem.action.cardId];
      if (
        !cancelSpellAllowsSchoolAndLevel(
          effect,
          { schools: pendingSpell?.spellSchools ?? [], level: pendingSpell?.spellLevel },
          mode
        )
      ) {
        return false;
      }

      // Expert play (e.g. Expert Resistance) ends a spell of any power. The
      // basic play only applies while the spell's current power, including
      // Power cards already committed, is at or below the printed limit.
      if (mode === "expert" && effect.expertIgnoresMaxPower) {
        return true;
      }

      if (effect.maxPower !== undefined && getPendingSpellPower(state, triggerEvent) > effect.maxPower) {
        return false;
      }

      return true;
    }

    if (effect.type === "RECALL_SPELL") {
      // Only a real Spell cast can be taken back. The synthetic specialty-damage
      // window (a PLAY_CARD on the stack) must not offer Knowledge/Mysticism —
      // the reducer's recall branch is gated on CAST_SPELL and would eat the card.
      return (
        triggerEvent.playerId === playerId &&
        getPendingStackItem(state, triggerEvent)?.action.type === "CAST_SPELL"
      );
    }

    // Interference: offered to the targeted side only (never the caster) when
    // the pending Spell deals Spell damage to one of this player's units. The
    // bonus lands on that unit; an enemy buff/debuff or a non-damaging spell
    // never opens the window.
    if (effect.type === "INTERFERE_SPELL") {
      if (triggerEvent.playerId === playerId) {
        return false;
      }
      if (!pendingSpellTargetForPlayer(state, triggerEvent, playerId)) {
        return false;
      }
      const stackItem = getPendingStackItem(state, triggerEvent);
      const pendingSpell =
        stackItem?.action.type === "CAST_SPELL" ? cardLibrary[stackItem.action.cardId] : undefined;
      return Boolean(
        pendingSpell &&
          pendingSpell.effect.type === "DEAL_DAMAGE" &&
          pendingSpell.effect.damageKind === "spell"
      );
    }

    return false;
  }

  if (triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const combat = state.combat;
    const attacker = combat?.units[triggerEvent.attackerId];
    const defender = combat?.units[triggerEvent.defenderId];
    if (!attacker || !defender) {
      return false;
    }

    // Kriv (Bulwark): bank Runes in reaction to an enemy's attack so a crossed
    // Rune-Level threshold's army-wide buff turns on BEFORE the attack resolves.
    // Only a Bulwark reactor benefits (gainRunes is a no-op otherwise); the card's
    // "opponent" trigger already keeps this off the attacker's own tray.
    if (effect.type === "GAIN_RUNES") {
      return state.players[playerId]?.factionId === "bulwark";
    }

    // Centaur's Axe: only the attacker (the side whose unit is making this
    // attack and rolling its Attack die) may triple the outcome. It is the
    // attacker's own die — the defender can never reach across to triple the
    // enemy's roll (e.g. fishing for a tripled -1 against the attacker).
    if (effect.type === "TRIPLE_ATTACK_DIE") {
      return attacker.controllerId === playerId;
    }

    if (effect.type === "CREATE_ACTIVE_EFFECT") {
      return effect.effect.modifiers.every((modifier) => {
        if (modifier.type !== "RANGED_ATTACK_BONUS") {
          return true;
        }

        if (attacker.type !== "ranged") {
          return false;
        }

        return !modifier.nonAdjacentOnly || !isAdjacent(attacker.position, defender.position);
      });
    }

    // Misfortune locked this attack: refuse every attack-INCREASING reaction to
    // the attacker (its die is cancelled and its attack cannot be buffed from any
    // source). The defender's debuffs and the attacker's defense-ignore (Frenzy)
    // are untouched — only increases to the attacker's attack are negated.
    const attackBuffsNegated = Boolean(
      attacker.controllerId === playerId && state.stack.at(-1)?.modifiers.negateAttackBuffs
    );

    // Bless: "the selected ground or flying unit" ignores the die — only the
    // attacker's controller plays it, and never on a ranged shot.
    if (effect.type === "IGNORE_ATTACK_DIE") {
      return !attackBuffsNegated && attacker.controllerId === playerId && attacker.type !== "ranged";
    }

    // Ivor's Elves I / VI: force this attack's die to a fixed face. The card's
    // trigger controller already decided who may play it (I = "any" — either side
    // may set the next roll to 0; VI = "self" — the attacker sets their roll to
    // +1), so legality here only needs the attack to exist. A Misfortune-locked
    // attacker may not touch their own die.
    if (effect.type === "FORCE_ATTACK_ROLL") {
      return !attackBuffsNegated;
    }

    // Lord Haart (Necropolis) Dread Knights I/VI: an instant that softens an
    // enemy Retaliation Attack. Offered only on a genuine retaliation
    // (`isRetaliation`) aimed at one of the reacting player's own units — the
    // trigger controller "opponent" already kept it off the attacker's tray, so
    // this just confirms the strike is a retaliation against your unit.
    if (effect.type === "REDUCE_RETALIATION_DAMAGE") {
      return triggerEvent.isRetaliation && defender.controllerId === playerId;
    }

    // Slayer: only the attacker's controller, and only when striking a gold
    // unit ("when attacking a golden unit"). A Creature Bank defender has no
    // tier, so it never counts as golden. Misfortune locks it out too.
    if (effect.type === "SLAYER_ATTACK") {
      return (
        !attackBuffsNegated && attacker.controllerId === playerId && !defender.bankUnit && defender.grade === "gold"
      );
    }

    // Frenzy: only the attacker's controller. The Power-scaled form (gradeByPower)
    // is offered whenever you attack — the pierced grade is decided at resolution
    // from the Power you pool in (power 0 already pierces bronze, like Bloodlust
    // is always offered). The legacy fixed-grade form is offered only when its
    // grade reaches the defender, keeping a wasted pierce off the menu.
    if (effect.type === "IGNORE_DEFENSE") {
      // A Creature Bank defender has no tier, so Frenzy can never pierce it —
      // never offer it (the Power-scaled form would otherwise always appear).
      if (defender.bankUnit) {
        return false;
      }
      if (effect.gradeByPower) {
        return attacker.controllerId === playerId;
      }
      return (
        attacker.controllerId === playerId &&
        effect.grade !== undefined &&
        gradeRankOfUnit(defender) <= gradeRank(effect.grade)
      );
    }

    // Alamar's Resurrection is never a pre-die attack reaction — it is offered
    // only in its own save window, when the attack would actually be lethal.

    // Power may be paid into an attack window so a spell instant in the same
    // declaration can consume it (the batch validator enforces the pairing).
    if (effect.type === "ADD_SPELL_POWER") {
      if (!(attacker.controllerId === playerId || defender.controllerId === playerId)) {
        return false;
      }
      // School-restricted Power (Elemental Orbs, Basic-School Magic abilities)
      // may empower a spell instant here only once a matching-school spell has
      // been played into this attack — Slayer, Bloodlust and Frenzy are Fire,
      // so a Fire Orb fuels them. Generic Power needs no school match.
      if (effect.schoolOnly) {
        return attackStackHasSpellOfSchool(getPendingStackItem(state, triggerEvent), effect.schoolOnly);
      }
      return true;
    }

    // Interference / Plate of the Dying Light: the "+X defense" base is a plain
    // Instant defense reaction (this attack only, like Armorer), offered to the
    // controller of the unit being attacked. The spell-damage half is inert on a
    // physical hit. (basic +X / expert +X.)
    if (effect.type === "INTERFERE_SPELL") {
      return defender.controllerId === playerId;
    }

    if (effect.type !== "ADD_COMBAT_STAT") {
      return false;
    }

    // Misfortune: a positive attack bonus on the attacker (Bloodlust, Precision)
    // is refused once their attack is locked. A negative attack (Weakness, the
    // defender's debuff) and any defense change (Curse) are NOT attack increases,
    // so they are untouched.
    if (attackBuffsNegated && effect.stat === "attack" && effect.amount >= 0) {
      return false;
    }

    // Curse (−defense) is played by the attacker against the defender;
    // Weakness (−attack) by the defender against the attacker. Positive
    // bonuses belong to the unit's own side as before.
    const benefitsAttacker = effect.stat === "attack" ? effect.amount >= 0 : effect.amount < 0;
    const owner = benefitsAttacker ? attacker : defender;
    if (owner.controllerId !== playerId) {
      return false;
    }

    // Bloodlust/Precision/Golden Bow restrict the unit types they boost.
    const affected = effect.stat === "attack" ? attacker : defender;
    if (effect.unitTypes && !effect.unitTypes.includes(affected.type)) {
      return false;
    }

    // Shield (instant): +Defense only against a ground/flying attacker. Gate on
    // the ATTACKER's type, not the buffed defender's (the unitTypes check above).
    // A ranged shot slips past Shield — that is Air Shield's (Ongoing) job.
    if (effect.vsAttackerType === "ground-or-flying" && attacker.type === "ranged") {
      return false;
    }
    if (effect.vsAttackerType === "ranged" && attacker.type !== "ranged") {
      return false;
    }

    // Precision: only on a ranged (non-adjacent) shot.
    if (effect.ignoreRangedPenalty && triggerEvent.attackKind !== "ranged") {
      return false;
    }

    return true;
  }

  return false;
}

export function getActiveUnitId(state: GameState): UnitId | null {
  return state.combat?.activeUnitId ?? null;
}

// ---------------------------------------------------------------------------
// Adventure mode legal actions
// ---------------------------------------------------------------------------

function addVisitStepActions(actions: LegalAction[], state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  const adventure = state.adventure;
  const visit = adventure?.pendingVisit;
  const step = visit?.steps[0];
  if (!adventure || !visit || !step || visit.playerId !== playerId) {
    return;
  }

  const player = state.players[playerId];
  if (!player) {
    return;
  }

  if (step.type === "CHOOSE_ONE") {
    for (const [optionIndex, option] of step.options.entries()) {
      if (
        option.steps.some(
          (inner) => inner.type === "EMPOWER_STATISTIC" && (inner.costGold ?? 0) > 0 && inner.source !== "hand"
        )
      ) {
        continue;
      }
      // Pandora's Box: the deck-draw option needs cards left in the deck.
      if (
        option.steps.some((inner) => inner.type === "DRAW_PANDORA_CARD") &&
        !state.adventure?.pandoraDeck?.length
      ) {
        continue;
      }
      // Anime Equipment (§3.13): a BUY_EQUIPMENT option is offered only when the
      // hero can afford it — gold-gated like a PAY_TO option. An unaffordable
      // item drops out (the "poor hero → option absent" rule); "Leave" remains.
      const buyStep = option.steps.find((inner) => inner.type === "BUY_EQUIPMENT");
      if (buyStep && buyStep.type === "BUY_EQUIPMENT") {
        const cost = getEquipmentDefinition(buyStep.equipmentId)?.cost ?? 0;
        if (!playerHasResources(player, { gold: cost })) {
          continue;
        }
      }
      actions.push({
        label: option.label,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex }
      });
    }
    return;
  }

  if (step.type === "PAY_TO") {
    for (const [optionIndex, cost] of step.costOptions.entries()) {
      if (!playerHasResources(player, cost)) {
        continue;
      }

      const label = Object.entries(cost)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ");
      actions.push({
        label: `Pay ${label}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex }
      });
    }
    actions.push({
      label: "Decline",
      action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true }
    });
    return;
  }

  if (step.type === "SETTLEMENT_CHOICE") {
    const field = adventure.fields[visit.fieldId];
    const free = field ? !field.everFlagged : false;
    actions.push(
      {
        label: `Increase gold income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.gold}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
      },
      {
        label: `Increase building materials income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.buildingMaterials}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      {
        label: `Increase valuables income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.valuables}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 2 }
      }
    );

    const fewUnits = player.army.filter((unit) => {
      if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
        return false;
      }
      const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
      return tier === "bronze" || tier === "silver";
    });
    fewUnits.forEach((unit, index) => {
      // Half cost (rounded up) applies first, then every distinct Legion voucher
      // reserved for this unit reduces the remaining gold.
      const halfCost = Object.entries(reinforceCostFor(state, playerId, unit.id, true, false, false) ?? {})
        .filter(([, amount]) => amount)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ") || "free";
      actions.push({
        label: free
          ? `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} for free`
          : `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${halfCost})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 3 + index }
      });
    });
    return;
  }

  if (step.type === "RESOURCE_GAIN_LEVEL") {
    actions.push(
      {
        label: `Raise Gold income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.gold} (one level)`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
      },
      {
        label: `Raise Building Materials income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.buildingMaterials} (one level)`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 1 }
      },
      {
        label: `Raise Valuables income by ${RESOURCE_GAIN_LEVEL_AMOUNTS.valuables} (one level)`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 2 }
      }
    );
    return;
  }

  if (step.type === "MAGIC_SPRING") {
    const topThree = player.discard.slice(-3).reverse();
    topThree.forEach((cardId, index) => {
      actions.push({
        label: `Return ${cards[cardId]?.name ?? cardId} to hand`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "TRADING_POST") {
    for (const [rateIndex, rate] of TRADE_RATES.entries()) {
      if (playerHasResources(player, rate.sell)) {
        actions.push({
          label: `Trade ${rate.label}`,
          action: { type: "TRADE_RESOURCES", playerId, rateIndex }
        });
      }
    }
    // The other two printed options ("choose one") stay open only until the
    // first resource trade: sell one card from hand for 1 gold (Specialty,
    // Statistic, starting Ability and Magic Arrow excluded), or buy a war
    // machine at the higher price. The Marketplace Event's "Trade resources
    // using Trading Post rules" is the exchange alone — tradesOnly hides both.
    if (!step.traded && !step.tradesOnly) {
      for (const { index, cardId } of removableHandCards(state, playerId, "sellable")) {
        actions.push({
          label: `Sell ${cards[cardId]?.name ?? cardId} → gain 1 gold`,
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
        });
      }
      for (const offer of warMachinesForSale(state, "trading-post")) {
        if (playerHasResources(player, offer.cost)) {
          actions.push({
            label: `Buy ${offer.card.name} (${offer.cost.gold ?? 0} gold)`,
            action: { type: "BUY_WAR_MACHINE", playerId, cardId: offer.cardId }
          });
        }
      }
      // Spell Scroll spells may be sold here for 2 gold each.
      for (const scroll of player.scrolls ?? []) {
        for (const cardId of new Set(scroll.spellCardIds)) {
          actions.push({
            label: `Sell ${cards[cardId]?.name ?? cardId} (Scroll) → gain 2 gold`,
            action: { type: "SELL_SCROLL_SPELL", playerId, scrollId: scroll.id, cardId }
          });
        }
      }
    }
    actions.push({ label: "Done trading", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "WAR_MACHINE_SHOP") {
    for (const offer of warMachinesForSale(state, "factory")) {
      if (playerHasResources(player, offer.cost)) {
        actions.push({
          label: `Buy ${offer.card.name} (${offer.cost.gold ?? 0} gold)`,
          action: { type: "BUY_WAR_MACHINE", playerId, cardId: offer.cardId }
        });
      }
    }
    actions.push({ label: "Leave the factory", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "DISCOVER_ADJACENT_TILE") {
    const field = adventure.fields[visit.fieldId];
    const tile = field ? adventure.tiles[field.tileInstanceId] : undefined;
    const hero = state.heroes[visit.heroId];
    // Flip any adjacent face-down tile on the hero's layer — the Observatory /
    // Speculum ignore borders and edges, so there is NO "stand at an open
    // border" requirement here (unlike ordinary movement-driven discovery).
    const candidates = tile && hero ? observatoryRevealTargets(state, hero, tile) : [];
    candidates.forEach((candidate, index) => {
      actions.push({
        label: `Discover the face-down tile at (${candidate.centerRow}, ${candidate.centerCol})`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    // Or open a brand-new tile by dropping a Far (Ⅱ–Ⅲ) supply tile into an empty
    // slot adjacent to the observatory's own flower — no hero-access/border gate
    // (that is the whole point of the Observatory). Face-down Far tiles are
    // interchangeable backs, so the top of the supply is offered for each slot.
    const supply = adventure.playerFarTiles[playerId] ?? [];
    if (tile && hero && supply.length > 0) {
      const supplyIndex = 0;
      for (const center of observatoryPlacementCenters(state, hero, tile, supply[supplyIndex])) {
        actions.push({
          label: `Place a Far (Ⅱ–Ⅲ) tile at (${center.row}, ${center.col})`,
          action: {
            type: "PLACE_OBSERVATORY_TILE",
            playerId,
            supplyIndex,
            centerRow: center.row,
            centerCol: center.col
          }
        });
      }
    }
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "REMOVE_HAND_CARD") {
    for (const { index, cardId } of removableHandCards(state, playerId, step.filter)) {
      actions.push({
        label: `Remove ${cards[cardId]?.name ?? cardId}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    }
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "SEARCH_DISCARD") {
    const deck = state.decks[step.deckId];
    const topCards = deck ? deck.discardPile.slice(-step.count).reverse() : [];
    topCards.forEach((cardId, index) => {
      actions.push({
        label: `Take ${cards[cardId]?.name ?? cardId}`,
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
      });
    });
    actions.push({ label: "Take nothing", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "HILL_FORT") {
    if (!houseRuleEnabled(state, "immediate-reinforcement-prompts")) {
      actions.push({
        label: "Bank Hill Fort reinforcement discount (-3 gold; expires when you move)",
        action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
      });
      actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
      return;
    }

    const fewUnits = player.army.filter((unit) => {
      if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
        return false;
      }
      const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
      return tier === "bronze" || tier === "silver";
    });
    fewUnits.forEach((unit, index) => {
      const cost = reinforceCostFor(state, playerId, unit.id, false, false, false, 3);
      if (cost && hasRecruitResources(state, playerId, cost)) {
        actions.push({
          label: `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${formatResourceCost(cost)})`,
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
        });
      }
    });
    actions.push({ label: "Skip", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }

  if (step.type === "TAVERN") {
    // Pay 7 gold to gain a Secondary Hero (one per player), then pick an enemy
    // to discard a card. optionIndex selects the enemy in turn order.
    const canGain = !getSecondaryHero(state, playerId) && playerHasResources(player, { gold: 7 });
    if (canGain) {
      const enemies = humanPlayerIds(state).filter((id) => id !== playerId);
      if (enemies.length === 0) {
        actions.push({
          label: "Pay 7 gold to gain a Secondary Hero",
          action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 }
        });
      } else {
        enemies.forEach((enemyId, index) => {
          actions.push({
            label: `Pay 7 gold — ${state.players[enemyId]?.name ?? enemyId} discards a card`,
            action: { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: index }
          });
        });
      }
    }
    actions.push({ label: "Decline", action: { type: "RESOLVE_VISIT_STEP", playerId, decline: true } });
    return;
  }
}

function addCombatSetupActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  const setup = combat?.setup;
  const player = state.players[playerId];
  if (!combat || !setup || !player || setup.pendingPlayerIds[0] !== playerId) {
    return;
  }

  const placed = setup.placedUnitIds[playerId] ?? [];
  const cells = placementCellsFor(state, playerId);
  const takenPositions = new Set(Object.values(combat.units).map((unit) => unit.position));

  if (placed.length < setup.unitLimit) {
    for (const armyUnit of player.army) {
      if (placed.includes(armyUnit.id)) {
        continue;
      }

      const unitName = coreUnitDefinitions[armyUnit.unitDefId]?.name ?? armyUnit.unitDefId;
      for (const position of cells) {
        if (takenPositions.has(position)) {
          continue;
        }

        actions.push({
          label: `Place ${armyUnit.side} ${unitName} at ${getBattlefieldLabel(position)}`,
          action: { type: "PLACE_COMBAT_UNIT", playerId, armyUnitId: armyUnit.id, position }
        });
      }
    }
  }

  for (const armyUnitId of placed) {
    const unitName = coreUnitDefinitions[player.army.find((unit) => unit.id === armyUnitId)?.unitDefId ?? ""]?.name;
    actions.push({
      label: `Take back ${unitName ?? armyUnitId}`,
      action: { type: "UNPLACE_COMBAT_UNIT", playerId, armyUnitId }
    });
  }

  // WOG Commanders: an EMPTY unit deck (no free restock while the commander
  // lives) may deploy commander-only — the commander is auto-placed at combat
  // start, so "Ready" with zero placed units is legal for that player.
  const commanderOnly = player.army.length === 0 && commanderStandsInCurrentCombat(state, playerId);
  if (placed.length > 0 || commanderOnly) {
    actions.push({
      label: commanderOnly && placed.length === 0 ? "Ready for battle (commander only)" : "Ready for battle",
      action: { type: "FINISH_COMBAT_PLACEMENT", playerId }
    });
  }
}

/** A player's living, swappable (non-Arrow-Tower) units, left-to-right. */
function tacticsSwappableUnits(combat: CombatState, playerId: PlayerId): CombatUnitState[] {
  return Object.values(combat.units)
    .filter((unit) => unit.controllerId === playerId && isUnitAlive(unit) && !isArrowTowerUnit(unit))
    .sort((left, right) => left.position - right.position);
}

/** Start-of-combat Tactics window: every two-unit switch, plus "keep". */
function addTacticsSetupActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.pendingTacticsSwaps?.[0] !== playerId) {
    return;
  }

  const units = tacticsSwappableUnits(combat, playerId);
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      actions.push({
        label: `Tactics: switch ${units[i].cardName} (${getBattlefieldLabel(units[i].position)}) and ${units[j].cardName} (${getBattlefieldLabel(units[j].position)})`,
        action: { type: "SWAP_COMBAT_UNITS", playerId, unitIdA: units[i].id, unitIdB: units[j].id }
      });
    }
  }

  actions.push({
    label: "Tactics: keep your current positions",
    action: { type: "FINISH_TACTICS", playerId }
  });
}

/**
 * PvP Neutral Control: the pre-battle formation-SORT window offered to the
 * controller (`combat.pendingNeutralPlacement === playerId`). Enumerates every
 * `PLACE_NEUTRAL_GUARD` (move a guard to an empty defender cell, or swap it with
 * another guard standing there) plus the `FINISH_NEUTRAL_PLACEMENT` "Ready".
 * The board also drives this by drag/click; enumerating keeps the AFK driver and
 * tests exercising the exact same commands.
 */
function addNeutralPlacementActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.pendingNeutralPlacement !== playerId) {
    return;
  }

  const guards = Object.values(combat.units).filter(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && isUnitAlive(unit) && !isArrowTowerUnit(unit)
  );
  const occupantAt = new Map<number, CombatUnitState>();
  for (const unit of Object.values(combat.units)) {
    occupantAt.set(unit.position, unit);
  }

  const obstacles = new Set(combat.obstacles ?? []);
  for (const guard of guards) {
    // Field = defender's two rows (a shooter is limited to the back row under
    // Manual guard control); Creature Bank = the four corners.
    for (const position of neutralFormationCellsForGuard(state, guard)) {
      if (position === guard.position || obstacles.has(position)) {
        continue;
      }
      const occupant = occupantAt.get(position);
      // An empty cell (move) or a fellow guard (swap); anything else stays blocked.
      if (occupant && (occupant.controllerId !== NEUTRAL_PLAYER_ID || isArrowTowerUnit(occupant))) {
        continue;
      }
      // A swap must also respect the partner's rule: a shooter cannot be pushed
      // off the back row (it would land on the mover's old cell).
      if (occupant && !neutralFormationCellsForGuard(state, occupant).includes(guard.position)) {
        continue;
      }
      actions.push({
        label: occupant
          ? `Swap ${guard.cardName} (${getBattlefieldLabel(guard.position)}) with ${occupant.cardName} (${getBattlefieldLabel(position)})`
          : `Move ${guard.cardName} to ${getBattlefieldLabel(position)}`,
        action: { type: "PLACE_NEUTRAL_GUARD", playerId, unitId: guard.id, position }
      });
    }
  }

  // Manual guard control: the fighter may hand the formation back to the AI's
  // auto-placement at any point ("return to AI auto control").
  if (neutralPlacementIsManual(state)) {
    actions.push({
      label: "Let the AI place them",
      action: { type: "AUTO_NEUTRAL_PLACEMENT", playerId }
    });
  }

  actions.push({
    label: "Ready for battle",
    action: { type: "FINISH_NEUTRAL_PLACEMENT", playerId }
  });
}

/**
 * WOG Commanders pre-combat SORT window offered to the head owner
 * (`combat.pendingCommanderPlacement[0] === playerId`). Enumerates every
 * `PLACE_COMMANDER` (move the commander to an empty own-zone cell, or swap it
 * with one of the owner's own units there) plus the `FINISH_COMMANDER_PLACEMENT`
 * "Ready". The board also drives this by drag/click; enumerating keeps the AFK
 * driver and tests exercising the exact same commands.
 */
function addCommanderPlacementActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.pendingCommanderPlacement?.[0] !== playerId) {
    return;
  }
  const commander = combat.units[commanderUnitId(playerId)];
  if (commander && isUnitAlive(commander)) {
    const cells = commanderDeploymentCellsFor(state, playerId);
    const occupantAt = new Map<number, CombatUnitState>();
    for (const unit of Object.values(combat.units)) {
      occupantAt.set(unit.position, unit);
    }
    const obstacles = new Set(combat.obstacles ?? []);
    for (const position of cells) {
      if (position === commander.position || obstacles.has(position)) {
        continue;
      }
      const occupant = occupantAt.get(position);
      // An empty cell (move) or one of the owner's OWN units (swap); anything
      // else (enemy / Neutral guard) stays blocked.
      if (occupant && (occupant.controllerId !== playerId || !isUnitAlive(occupant))) {
        continue;
      }
      actions.push({
        label: occupant
          ? `Swap ${commander.cardName} (${getBattlefieldLabel(commander.position)}) with ${occupant.cardName} (${getBattlefieldLabel(position)})`
          : `Move ${commander.cardName} to ${getBattlefieldLabel(position)}`,
        action: { type: "PLACE_COMMANDER", playerId, position }
      });
    }
  }

  actions.push({
    label: "Ready for battle",
    action: { type: "FINISH_COMMANDER_PLACEMENT", playerId }
  });
}

/**
 * Expert Tactics mid-combat: on the holder's turn, before their active unit has
 * moved or attacked, spend one expert use to switch any two of their units.
 */
function addTacticsCombatActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || state.phase !== "combat" || state.pendingChoice || state.reactionWindow || state.stack.length > 0) {
    return;
  }
  const player = state.players[playerId];
  // Tactics is Expert-only; an Empowered Tactics may be used without a crown.
  if (!player || !player.hand.includes("ability.tactics") || !canPlayExpertMode(player, "ability.tactics")) {
    return;
  }
  const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
  if (!active || active.controllerId !== playerId || active.movedThisActivation || active.attackedThisActivation) {
    return;
  }

  const units = tacticsSwappableUnits(combat, playerId);
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      actions.push({
        label: `Tactics (expert): switch ${units[i].cardName} (${getBattlefieldLabel(units[i].position)}) and ${units[j].cardName} (${getBattlefieldLabel(units[j].position)})`,
        action: { type: "SWAP_COMBAT_UNITS", playerId, unitIdA: units[i].id, unitIdB: units[j].id }
      });
    }
  }
}

function addTownActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  const town = getTownOfPlayer(state, playerId);
  // Town actions are normally blocked during a combat, with one exception: a
  // participant in their PvP pre-battle preparation window may still spend the
  // round's town actions before the fight (build / recruit / buy spells).
  const inPrep = inCombatPrep(state, playerId);
  if (!player || !town || (state.combat && !inPrep)) {
    return;
  }

  if (player.townTokens.build) {
    for (const buildingId of coreFactionDefinitions[player.factionId ?? ""]?.buildings ?? []) {
      const building = coreBuildingDefinitions[buildingId];
      if (
        !building ||
        building.implementationStatus !== "implemented" ||
        town.buildings.includes(buildingId) ||
        (building.prerequisites ?? []).some((prerequisite) => !town.buildings.includes(prerequisite)) ||
        !playerHasResources(player, building.cost)
      ) {
        continue;
      }

      actions.push({
        label: `Build ${building.name}`,
        action: { type: "BUILD_STRUCTURE", playerId, townId: town.id, buildingId }
      });
    }
  }

  if (player.townTokens.population) {
    const tiers = unlockedRecruitTiers(state, playerId);
    const canReinforce = townHasBuildingEffect(state, playerId, "UNLOCK_REINFORCE");
    const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;

    for (const unitDefId of faction?.units ?? []) {
      const unit = coreUnitDefinitions[unitDefId];
      const fewSide = unit?.few;
      if (!unit || !fewSide || !tiers.has(unit.tier)) {
        continue;
      }

      // Each unit card exists once: a type already in the army cannot be
      // recruited again — only its Few card may be reinforced to the Pack.
      const owned = player.army.some(
        (armyUnit) => armyUnit.side !== "bank" && armyUnit.unitDefId === unitDefId
      );
      // Factory: Couatls and Juggernauts are mutually exclusive — owning one
      // hides the other from the recruit offer.
      const goldChoiceBlocked = factoryGoldUnitConflict(player.army, unitDefId);
      // A Legion voucher reserved for this unit may make it affordable — fold in
      // the total gold discount when offering the action.
      const recruitCost = applyRecruitGoldDiscount(state, playerId, { kind: "recruit", unitDefId }, fewSide.cost);
      if (!owned && !goldChoiceBlocked && hasRecruitResources(state, playerId, recruitCost)) {
        actions.push({
          label: `Recruit few ${unit.name}`,
          action: {
            type: "POPULATION_ACTION",
            playerId,
            purchases: [{ kind: "recruit", unitDefId }]
          }
        });
      }

      if (canReinforce) {
        const target = player.army.find(
          (armyUnit) => armyUnit.unitDefId === unitDefId && armyUnit.side === "few"
        );
        const packSide = unit.pack;
        // The gold paid drops by the TOTAL discount: a Legion voucher reserved for
        // this unit STACKS with the Champions' Stables discount
        // (applyRecruitGoldDiscount). Every distinct Legion piece is included.
        const reinforceCost =
          packSide && target
            ? applyRecruitGoldDiscount(
                state,
                playerId,
                { kind: "reinforce", unitDefId, armyUnitId: target.id },
                packSide.cost
              )
            : undefined;
        if (target && packSide && reinforceCost && hasRecruitResources(state, playerId, reinforceCost)) {
          actions.push({
            label: `Reinforce ${unit.name} to a pack`,
            action: {
              type: "POPULATION_ACTION",
              playerId,
              purchases: [{ kind: "reinforce", unitDefId, armyUnitId: target.id }]
            }
          });
        }
      }
    }

    // Polish Unit Stacks are an optional Population purchase at the player's
    // own Citadel. Pack Groups and recruited Neutrals qualify; cost is the
    // printed gold of that side plus its tier surcharge — minus a Legion
    // voucher reserved for this card's Stack, payable with the Freelancer's
    // Guild substitution (both mirror the reducer's charge exactly).
    if (armyUnitStacksActive(state) && canReinforce) {
      for (const target of player.army) {
        if (!polishArmyUnitCanBuyStack(target)) {
          continue;
        }
        const baseCost = polishArmyUnitStackCost(target);
        const cost = baseCost
          ? applyRecruitGoldDiscount(
              state,
              playerId,
              { kind: "stack", unitDefId: target.unitDefId, armyUnitId: target.id },
              baseCost
            )
          : null;
        if (!cost || !hasRecruitResources(state, playerId, cost)) {
          continue;
        }
        const unitName = coreUnitDefinitions[target.unitDefId]?.name ?? target.unitDefId;
        actions.push({
          label: `Add Stack to ${unitName}`,
          action: {
            type: "POPULATION_ACTION",
            playerId,
            purchases: [{ kind: "stack", unitDefId: target.unitDefId, armyUnitId: target.id }]
          }
        });
      }
    }
  }

  // Mages (Astrologers): the Spell Book token is free this round and usable even
  // without a Mage Guild — so it is offered without one, at 0 gold, ignoring the
  // "same round the guild was built" restriction (which is about the guild).
  const magesFree = freeSpellBookActive(state);
  if (player.townTokens.spellBook && (townHasBuildingEffect(state, playerId, "MAGE_GUILD") || magesFree)) {
    const mageGuild = town.buildings
      .map((buildingId) => coreBuildingDefinitions[buildingId])
      .find((building) => building?.effect?.type === "MAGE_GUILD");
    const cost = magesFree ? 0 : (mageGuild?.spellBookCost ?? 5);
    const baseSearchCount = polishSpellBookEnabled(state) ? 3 : 2;
    if (magesFree || player.mageGuildBuiltRound !== state.round) {
      if (player.resources.gold >= cost) {
        actions.push({
          label: `Buy spells (${cost} gold, Search ${baseSearchCount})`,
          action: { type: "SPELL_BOOK_ACTION", playerId }
        });
        if (polishSpellBookEnabled(state)) {
          actions.push({
            label: `Buy Cast a Spell instead (${cost} gold)`,
            action: { type: "SPELL_BOOK_ACTION", playerId, takeCastCard: true }
          });
        }
      }

      // Wisdom rides on the purchase: cheaper spells and a bigger search.
      const ruleset = getRuleset(state);
      const wisdomCardId = player.hand.find((cardId) => cardLibrary[cardId]?.name === "Wisdom");
      if (wisdomCardId) {
        const basicCost = Math.max(0, cost - wisdomGoldDiscount(ruleset, "basic"));
        if (player.resources.gold >= basicCost) {
          actions.push({
            label: `Buy spells with Wisdom (${basicCost} gold, Search ${wisdomSearchCount("basic")})`,
            action: { type: "SPELL_BOOK_ACTION", playerId, wisdom: { cardId: wisdomCardId, mode: "basic" } }
          });
        }

        const expertCost = Math.max(
          0,
          cost - wisdomGoldDiscount(ruleset, "expert", houseRuleEnabled(state, "wisdom-expert-discount"))
        );
        // Empowered Wisdom skips the crown but still pays the gold.
        if (canPlayExpertMode(player, wisdomCardId) && player.resources.gold >= expertCost) {
          actions.push({
            label: `Buy spells with expert Wisdom (${expertCost} gold, Search ${wisdomSearchCount("expert")})`,
            action: { type: "SPELL_BOOK_ACTION", playerId, wisdom: { cardId: wisdomCardId, mode: "expert" } }
          });
        }
      }
    }
  }

  if (
    polishSpellBookEnabled(state) &&
    townHasBuildingEffect(state, playerId, "MAGE_GUILD") &&
    player.resources.gold >= 3 &&
    player.polishSpellRollUsedRound !== state.round
  ) {
    const rollCandidates = [
      ...player.spellBook.map((cardId) => ({ cardId, source: "refreshed" as const })),
      ...(player.spellBookUsed ?? []).map((cardId) => ({ cardId, source: "used" as const }))
    ];
    for (const candidate of rollCandidates) {
      const name = cardLibrary[candidate.cardId]?.name ?? candidate.cardId;
      actions.push({
        label: `Rolling Spells: return ${name}${candidate.source === "used" ? " (used)" : ""}, pay 3 gold, Search 2`,
        action: { type: "SPELL_BOOK_ACTION", playerId, rollSpell: candidate }
      });
    }
  }

  // Blacksmith: once per turn, search Artifacts for gold or sell one.
  const smith = town.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "ARTIFACT_SMITH");
  if (smith?.effect?.type === "ARTIFACT_SMITH" && player.blacksmithUsedRound !== state.round) {
    if (player.resources.gold >= smith.effect.searchCost) {
      actions.push({
        label: `Blacksmith: pay ${smith.effect.searchCost} gold, Search (2) Artifacts`,
        action: { type: "BLACKSMITH_ACTION", playerId, option: "search" }
      });
    }
    for (const cardId of new Set(player.hand)) {
      if (cardLibrary[cardId]?.kind === "artifact") {
        actions.push({
          label: `Blacksmith: sell ${cardLibrary[cardId]?.name} for ${smith.effect.sellGold} gold`,
          action: { type: "BLACKSMITH_ACTION", playerId, option: "sell", artifactCardId: cardId }
        });
      }
    }
  }

  // Magic University (Conflux): once per round, instead of buying spells at the
  // Mage Guild, choose a School of Magic and dig your deck for that school's
  // Spell. Offered as one action per school during your turn.
  if (
    townHasBuildingEffect(state, playerId, "MAGIC_UNIVERSITY") &&
    player.magicUniversityUsedRound !== state.round
  ) {
    const schools: SpellSchool[] = ["air", "earth", "fire", "water"];
    for (const school of schools) {
      actions.push({
        label: `Magic University: search your deck for a ${school[0].toUpperCase()}${school.slice(1)} Magic spell`,
        action: { type: "MAGIC_UNIVERSITY_ACTION", playerId, school }
      });
    }
  }

  // "During your turn" buildings, each once per round. Their uses open choices
  // of their own, so parallel turns take them one at a time.
  if (hasOpenAdventureTurn(state, playerId) && !parallelInteractionBlocker(state, playerId)) {
    for (const buildingId of town.buildings) {
      const building = coreBuildingDefinitions[buildingId];
      if (!building || (player.buildingUsedRound?.[buildingId] ?? 0) === state.round) {
        continue;
      }

      if (building.effect?.type === "COVER_OF_DARKNESS" && player.hand.length > 0) {
        actions.push({
          label: `${building.name}: discard up to 2 cards, draw that many`,
          action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 0, cardIds: [] }
        });
      }

      // A clean map turn action only — never mid-combat (incl. the PvP prep
      // window, where addTownActions also runs) or mid-reaction, matching
      // thievesGuildAction's assertNoPendingInput so the offer can never be rejected.
      if (building.effect?.type === "THIEVES_GUILD" && !state.combat && !state.reactionWindow) {
        // "Any one deck in the game": every shared deck with at least 2 cards on
        // top to look at...
        for (const [deckId, deck] of Object.entries(state.decks)) {
          if (deck.drawPile.length >= 2) {
            actions.push({
              label: `${building.name}: look at the top 2 of the ${deckDisplayName(state, deckId)} deck`,
              action: { type: "THIEVES_GUILD_ACTION", playerId, buildingId, target: { kind: "shared", deckId } }
            });
          }
        }
        // ...plus every player's Might & Magic deck (your own and opponents').
        for (const ownerId of state.turnOrder) {
          const owner = state.players[ownerId];
          if (ownerId === "neutrals" || !owner || owner.deck.length < 2) {
            continue;
          }
          actions.push({
            label: `${building.name}: look at the top 2 of ${ownerId === playerId ? "your own" : `${owner.name}'s`} Might & Magic deck`,
            action: { type: "THIEVES_GUILD_ACTION", playerId, buildingId, target: { kind: "player", ownerId } }
          });
        }
      }

      if (building.effect?.type === "CASTLE_GATE") {
        if (player.resources.gold >= building.effect.discardCost) {
          for (const opponentId of state.turnOrder) {
            const opponent = state.players[opponentId];
            if (opponentId === playerId || opponentId === "neutrals" || !opponent || opponent.hand.length === 0) {
              continue;
            }
            actions.push({
              label: `${building.name}: pay ${building.effect.discardCost} gold — random discard from ${opponent.name}`,
              action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 0, targetPlayerId: opponentId }
            });
          }
        }

        const hero = Object.values(state.heroes).find(
          (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
        );
        if (hero?.spaceId && state.adventure) {
          const here = hero.spaceId;
          const isOwnHolding = (spaceId: string) =>
            Object.values(state.towns).some((candidate) => candidate.fieldId === spaceId && candidate.controllerId === playerId) ||
            (state.adventure?.fields[spaceId]?.location === "settlement" &&
              state.adventure?.fields[spaceId]?.flagOwnerId === playerId);
          if (isOwnHolding(here)) {
            for (const field of Object.values(state.adventure.fields)) {
              if (field.spaceId !== here && isOwnHolding(field.spaceId)) {
                actions.push({
                  label: `${building.name}: move the hero to ${field.location === "settlement" ? "the settlement" : "the town"} at ${field.spaceId}`,
                  action: { type: "USE_TOWN_BUILDING", playerId, buildingId, optionIndex: 1, spaceId: field.spaceId }
                });
              }
            }
          }
        }
      }
    }
  }

  // Buy a Secondary Hero for 10 gold (one per player). It appears at the town
  // wearing the portrait of one of your faction's other heroes. Hiring one spends
  // the Population Token (the same token that recruits/reinforces units), so it is
  // only offered while that token is still available this round — and taking it
  // hides the recruit/reinforce offers (which are likewise gated on the token).
  if (!getSecondaryHero(state, playerId) && player.townTokens.population && playerHasResources(player, { gold: 10 })) {
    const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;
    const mainHeroDefId = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === playerId && candidate.kind === "main"
    )?.heroDefId;
    for (const heroDefId of faction?.heroes ?? []) {
      if (heroDefId === mainHeroDefId) {
        continue;
      }
      actions.push({
        label: `Hire Secondary Hero as ${coreHeroDefinitions[heroDefId]?.name ?? heroDefId} (10 gold)`,
        action: { type: "HIRE_SECONDARY_HERO", playerId, heroDefId }
      });
    }
  }
}

/**
 * The positive morale token's non-reroll uses, by the book ("Draw a card from
 * your Deck" / "Discard any number of cards, then draw that many") — spendable
 * at any time while you hold the token, not only while standing at your Town.
 * The third use, rerolling a Die you have thrown, is offered inside the dice
 * flows (adventure rolls and the combat attack-die reroll) instead.
 */
/**
 * Player-vs-player escape (house rule): at the start of the combat (round 1,
 * between activations) a participating hero may:
 * - Retreat — lose the combat: pay 5 gold (may go into debt), take -1 morale,
 *   lose troops per the lobby mode, and fall back home. Always available.
 * - Surrender — pay a flat 10 gold to the opponent, keep the whole army, take
 *   no morale hit, return home, and deny the opponent any victory credit.
 *   Offered only with the full 10 gold in hand and while Shackles of War has
 *   not locked it.
 */
function addPvpEscapeActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player") {
    return;
  }
  // Retreat is offered here in two spots: a participant's pre-battle prep window,
  // and after deployment but before any unit has begun fighting
  // (pvpEscapeWindowOpen) while the combat card window is open. (It is also
  // offered DURING placement — see addPvpRetreatDuringSetup.) Once a unit acts
  // Retreat closes and the in-fight concede takes over (addGiveUpCombatActions,
  // labelled Retreat). Surrender is prep-only by default; with polish-reduced-
  // surrender it is also offered mid-fight (so the dropping cost can matter).
  const inPrep = inCombatPrep(state, playerId);
  const polishMidFight = houseRuleEnabled(state, "polish-reduced-surrender");
  const earlyEscape = inPrep || (pvpEscapeWindowOpen(combat) && isCombatCardWindowOpen(state));
  const midFightSurrender =
    polishMidFight &&
    !inPrep &&
    !combat.setup &&
    !combat.outcome &&
    isCombatCardWindowOpen(state);
  if (!earlyEscape && !midFightSurrender) {
    return;
  }
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId) {
    return;
  }
  if (earlyEscape) {
    actions.push({
      label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)",
      action: { type: "RETREAT_FROM_COMBAT", playerId }
    });
  }
  // Surrender: prep (always) or mid-fight under polish-reduced-surrender. Never
  // when defending your own Faction Town (rulebook p.46).
  const gold = state.players[playerId]?.resources.gold ?? 0;
  const escapingHero = state.heroes[heroId];
  const surrenderWindow = inPrep || midFightSurrender;
  if (
    surrenderWindow &&
    !playerCannotSurrenderCombat(state, playerId) &&
    !isDefendingOwnFactionTown(state, playerId)
  ) {
    if (escapingHero?.kind === "secondary") {
      // Secondary-Hero surrender (house rule): sacrifice ONLY the 2nd hero — no
      // gold, keep your army — instead of paying the gold toll. Same
      // SURRENDER_COMBAT action; escapePvpCombat routes it by hero kind.
      actions.push({
        label: "Surrender the Secondary Hero (lose only the 2nd hero — no gold, keep your army)",
        action: { type: "SURRENDER_COMBAT", playerId }
      });
    } else {
      const toll = currentSurrenderGoldCost(state);
      if (gold >= toll) {
        actions.push({
          label: `Surrender (pay ${toll} gold, keep your whole army, return home)`,
          action: { type: "SURRENDER_COMBAT", playerId }
        });
      }
    }
  }
}

/**
 * Retreat offered WHILE units are being placed (the combat-setup / deployment
 * step). A PvP hero may bail out before the fighting starts even mid-deployment;
 * no unit has acted yet, so it is the same no-casualties Retreat as the
 * post-deployment window. Surrender is NOT offered here — it is a prep-only
 * ("before battle") option.
 */
function addPvpRetreatDuringSetup(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player" || combat.outcome || !combat.setup) {
    return;
  }
  // Offered to the player whose turn it is to place (the one looking at the
  // deployment panel) — the other side is shown a "waiting" panel with no
  // controls, so offering it to them would be a button-less legal action.
  if (combat.setup.pendingPlayerIds[0] !== playerId) {
    return;
  }
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId) {
    return;
  }
  actions.push({
    label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)",
    action: { type: "RETREAT_FROM_COMBAT", playerId }
  });
}

/**
 * The in-fight Retreat: once the fighting has begun there is only ONE way to
 * leave a player-vs-player combat, and it is shown to the player as "Retreat".
 * Internally it is the GIVE_UP_COMBAT concede (the start-of-combat
 * RETREAT_FROM_COMBAT is a no-casualties flee that closes the instant a unit
 * acts). Always a defeat with the same consequences (5 gold, -1 morale, fall
 * back home, the opponent wins). The troop cost depends on the lobby's PvP
 * casualty mode: in losing-troop mode only the casualties taken up to that point
 * are lost (survivors fall back); in keep-troops mode every unit is kept and the
 * hand is discarded instead. Neutral-guard fights have no in-fight Retreat — only
 * the end-of-round Retreat.
 *
 * It is NOT offered while the start-of-combat escape window is still open: there
 * the no-casualties RETREAT_FROM_COMBAT is offered instead (also labelled
 * "Retreat"), so the player always sees exactly one Retreat button. This concede
 * surfaces only once fighting has begun and that window has closed.
 */
function addGiveUpCombatActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const combat = state.combat;
  if (!combat || combat.outcome || combat.context.kind !== "player") {
    return;
  }
  // While the no-casualties RETREAT_FROM_COMBAT is still available (start of
  // combat, before any unit acts) this concede is suppressed so there is never
  // more than one Retreat button on screen at a time.
  if (pvpEscapeWindowOpen(combat)) {
    return;
  }
  const isParticipant = combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId;
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  // The `mine-army-defense` Mine defender concedes with no hero in the fight, so
  // the game can end quickly instead of playing the garrison out to the last unit.
  const herolessMine = isHerolessMineDefender(state, playerId);
  if (!isParticipant || (!heroId && !herolessMine)) {
    return;
  }
  const losesTroops = adventurePvpTroopLoss(state) === "normal";
  actions.push({
    label: herolessMine
      ? losesTroops
        ? "Retreat (give up the Mine — your fallen so far stay lost, survivors are kept, no hero to move)"
        : "Retreat (give up the Mine and discard your hand, no hero to move)"
      : losesTroops
        ? "Retreat (lose the combat — your fallen so far stay lost, survivors fall back home)"
        : "Retreat (lose the combat and discard your hand, fall back home)",
    action: { type: "GIVE_UP_COMBAT", playerId }
  });
}

/**
 * Ability Empower token: spend anytime (map or combat participant) to Empower
 * one non-Empowered Ability currently in hand. Max storage 1; surplus auto-use
 * is handled at gain time, not here.
 */
function addAbilityEmpowerTokenActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player || (player.abilityEmpowerToken ?? 0) < 1) {
    return;
  }
  const seen = new Set<string>();
  for (const cardId of player.hand) {
    if (seen.has(cardId) || cardLibrary[cardId]?.kind !== "ability") {
      continue;
    }
    if (player.empoweredAbilities?.includes(cardId)) {
      continue;
    }
    seen.add(cardId);
    const name = cardLibrary[cardId]?.name ?? cardId;
    actions.push({
      label: `Ability token: Empower ${name}`,
      action: { type: "USE_ABILITY_EMPOWER_TOKEN", playerId, cardId }
    });
  }
}

function addMoraleActions(actions: LegalAction[], state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  // Raid-boss Fear (§6.8): while a living enemy Fear unit stands in the
  // player's open combat, NO morale use is offered (token or cards alike);
  // morale gains and morale-card draws still happen normally.
  if (moraleLockedForPlayer(state.combat, playerId)) {
    return;
  }
  if (moraleCardsRuleEnabled(state)) {
    const held = player?.moraleCards?.positive ?? [];
    if (held.includes("morale.positive.redraw_hand") && (player?.hand.length ?? 0) > 0) {
      actions.push({
        label: "Positive Morale: discard any cards, draw that many",
        action: { type: "SPEND_MORALE", playerId, benefit: "redraw", discardCardIds: [] }
      });
    }

    const combat = state.combat;
    const inOwnCombat =
      combat && !combat.outcome && (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId);

    // "+1 Attack, +1 Defense, or +1 Combat Power during the next Combat":
    // played while the holder fights; Combat Power is a Battlefield-mode value
    // with no regular-game roll, so only the two live picks are offered.
    if (inOwnCombat && held.includes(MORALE_CARD_IDS.combatBonus)) {
      actions.push(
        {
          label: "Positive Morale: +1 Attack for this Combat",
          action: { type: "SPEND_MORALE", playerId, benefit: "combat-bonus", bonus: "attack" }
        },
        {
          label: "Positive Morale: +1 Defense for this Combat",
          action: { type: "SPEND_MORALE", playerId, benefit: "combat-bonus", bonus: "defense" }
        }
      );
    }

    // "Remove a morale-token marker from one of your units" (engine reading:
    // one negative combat token — Weakness/Corrosion/Paralysis — off an own
    // unit): one offer per removable token on the holder's living units.
    if (inOwnCombat && held.includes(MORALE_CARD_IDS.removeToken)) {
      for (const unit of Object.values(combat.units)) {
        if (unit.controllerId !== playerId || !isUnitAlive(unit)) {
          continue;
        }
        for (const kind of ["weakness", "corrosion", "paralysis"] as const) {
          if (unitHasToken(unit, kind)) {
            actions.push({
              label: `Positive Morale: remove the ${kind} token from ${unit.cardName}`,
              action: { type: "SPEND_MORALE", playerId, benefit: "remove-token", unitId: unit.id, tokenKind: kind }
            });
          }
        }
      }
    }
    return;
  }
  // The stored +1 token, or an overflow token gained past the cap that must be
  // spent now — both resolve through the same draw / discard-redraw actions.
  if (!player || ((player.morale ?? 0) <= 0 && (player.moraleOverflow ?? 0) <= 0)) {
    return;
  }

  actions.push({
    label: "Spend morale: draw a card",
    action: { type: "SPEND_MORALE", playerId, benefit: "draw" }
  });
  if (player.hand.length > 0) {
    actions.push({
      label: "Spend morale: discard any cards, draw that many",
      action: { type: "SPEND_MORALE", playerId, benefit: "redraw", discardCardIds: [] }
    });
  }
}

function getSetupLobbyLegalActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const lobby = state.setupLobby;
  const actions: LegalAction[] = [];
  if (!lobby) {
    return actions;
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat) {
    return actions;
  }

  const draft = lobby.draft ?? { format: "open" as const, bannedHeroDefIds: [] };
  const phase = getDraftPhase(lobby);
  const banned = new Set(draft.bannedHeroDefIds ?? []);
  const takenFactions = new Set(
    lobby.seats
      .filter((candidate) => candidate.playerId !== playerId)
      .map((candidate) => candidate.factionId)
      .filter((id): id is FactionId => Boolean(id))
  );
  const untakenFactions = (Object.values(coreFactionDefinitions) as { id: FactionId }[])
    .map((faction) => faction.id)
    .filter((id) => !takenFactions.has(id) && isPlayableFaction(id, lobby.options.anime));

  if (state.sessionMode === "single-player" && controllerOf(state, playerId).kind === "human" &&
      humanPlayerIdsByController(state).length === 1 && !lobby.startCheck) {
    const scenario = getScenario(lobby.options.scenarioId);
    const max = Math.min(scenario.maxPlayers, scenario.layout.starts.length);
    for (let count = 1; count < max; count += 1) {
      actions.push({ label: `${count} computer opponent${count === 1 ? "" : "s"}`,
        action: { type: "SET_COMPUTER_OPPONENTS", playerId, count } });
    }

    // The human owner may hand-pick, roll, or clear each COMPUTER seat's faction
    // + hero (single-player Free-pick only). Mirrors how CHOOSE_FACTION enumerates
    // untaken factions × heroes, but targets a computer seat via seatPlayerId.
    if (phase.format === "open") {
      for (const computerSeat of lobby.seats) {
        if (controllerOf(state, computerSeat.playerId).kind !== "computer") {
          continue;
        }
        const takenForSeat = new Set(
          lobby.seats
            .filter((candidate) => candidate.playerId !== computerSeat.playerId)
            .map((candidate) => candidate.factionId)
            .filter((id): id is FactionId => Boolean(id))
        );
        for (const factionId of (Object.values(coreFactionDefinitions) as { id: FactionId }[])
          .map((faction) => faction.id)
          .filter((id) => !takenForSeat.has(id) && isPlayableFaction(id, lobby.options.anime))) {
          const faction = coreFactionDefinitions[factionId];
          for (const heroDefId of faction.heroes) {
            if (computerSeat.factionId === factionId && computerSeat.heroDefId === heroDefId) {
              continue;
            }
            actions.push({
              label: `Set ${computerSeat.name}: ${faction.name} — ${heroDefId}`,
              action: {
                type: "SET_COMPUTER_SEAT_FACTION",
                playerId,
                seatPlayerId: computerSeat.playerId,
                choice: { factionId, heroDefId }
              }
            });
          }
        }
        actions.push({
          label: `Roll a random town & hero for ${computerSeat.name}`,
          action: { type: "SET_COMPUTER_SEAT_FACTION", playerId, seatPlayerId: computerSeat.playerId, choice: "roll" }
        });
        if (computerSeat.factionId || computerSeat.heroDefId) {
          actions.push({
            label: `Set ${computerSeat.name} back to auto`,
            action: { type: "SET_COMPUTER_SEAT_FACTION", playerId, seatPlayerId: computerSeat.playerId, choice: "clear" }
          });
        }
      }
    }
  }

  // The setup format selector — any seated player may (re)start any format.
  for (const format of ["open", "draft", "random", "random-choice"] as const) {
    actions.push({
      label: `Setup format: ${DRAFT_FORMAT_LABELS[format]}`,
      action: { type: "SET_DRAFT_FORMAT", playerId, format }
    });
  }

  if (phase.format === "open") {
    // TYPE 4 — free pick: any untaken town + any of its heroes.
    for (const factionId of untakenFactions) {
      const faction = coreFactionDefinitions[factionId];
      for (const heroDefId of faction.heroes) {
        if (seat.factionId === factionId && seat.heroDefId === heroDefId) {
          continue;
        }
        actions.push({
          label: `Play ${faction.name} — ${heroDefId}`,
          action: { type: "CHOOSE_FACTION", playerId, factionId, heroDefId }
        });
      }
    }
  } else if (phase.format === "random") {
    // TYPE 2 — full random town + hero.
    if (untakenFactions.length > 0) {
      actions.push({
        label: "Roll a random town and hero",
        action: { type: "RANDOM_ASSIGN_SEAT", playerId, scope: "faction" }
      });
    }
    if (seat.factionId) {
      actions.push({
        label: "Roll a random hero",
        action: { type: "RANDOM_ASSIGN_SEAT", playerId, scope: "hero" }
      });
    }
  } else if (phase.format === "draft") {
    // TYPE 1 — town two-choice, then ban phase, then pick.
    if (!seat.factionId) {
      if (untakenFactions.length > 0) {
        actions.push({ label: "Roll two town options", action: { type: "ROLL_TOWN_OPTIONS", playerId } });
      }
      const rolled = draft.seatRolls?.[playerId]?.townOptions ?? [];
      const townChoices = (rolled.length > 0 ? rolled : untakenFactions).filter((id) => !takenFactions.has(id));
      for (const factionId of townChoices) {
        actions.push({
          label: `Lock the ${coreFactionDefinitions[factionId]?.name ?? factionId} town`,
          action: { type: "CHOOSE_TOWN", playerId, factionId }
        });
      }
    } else if (phase.banPhaseActive && phase.currentBannerPlayerId === playerId) {
      for (const heroDefId of bannableHeroesForSeat(lobby, playerId)) {
        actions.push({ label: `Ban ${heroDefId}`, action: { type: "BAN_HERO", playerId, heroDefId } });
      }
    } else if (phase.pickPhaseOpen) {
      const faction = coreFactionDefinitions[seat.factionId];
      for (const heroDefId of faction?.heroes ?? []) {
        if (banned.has(heroDefId) || seat.heroDefId === heroDefId) {
          continue;
        }
        actions.push({
          label: `Play ${faction.name} — ${heroDefId}`,
          action: { type: "CHOOSE_FACTION", playerId, factionId: seat.factionId, heroDefId }
        });
      }
    }
  } else if (phase.format === "random-choice") {
    // TYPE 3 — town two-choice, then hero two-choice.
    if (!seat.factionId) {
      if (untakenFactions.length > 0) {
        actions.push({ label: "Roll two town options", action: { type: "ROLL_TOWN_OPTIONS", playerId } });
      }
      for (const factionId of (draft.seatRolls?.[playerId]?.townOptions ?? []).filter((id) => !takenFactions.has(id))) {
        actions.push({
          label: `Lock the ${coreFactionDefinitions[factionId]?.name ?? factionId} town`,
          action: { type: "CHOOSE_TOWN", playerId, factionId }
        });
      }
    } else if (!seat.heroDefId) {
      actions.push({ label: "Roll two hero options", action: { type: "ROLL_HERO_OPTIONS", playerId } });
      const faction = coreFactionDefinitions[seat.factionId];
      for (const heroDefId of draft.seatRolls?.[playerId]?.heroOptions ?? []) {
        actions.push({
          label: `Play ${faction?.name ?? seat.factionId} — ${heroDefId}`,
          action: { type: "CHOOSE_FACTION", playerId, factionId: seat.factionId, heroDefId }
        });
      }
    }
  }

  // Per-seat reset, when there is something to clear and the format allows it
  // (blocked in "draft" once the ban phase has begun).
  const hasPendingRoll = Boolean(draft.seatRolls?.[playerId]);
  const resetBlocked = phase.format === "draft" && phase.townLockedAll;
  if ((seat.factionId || seat.heroDefId || hasPendingRoll) && !resetBlocked) {
    actions.push({ label: "Reset this seat's pick", action: { type: "RESET_SEAT_DRAFT", playerId } });
  }

  if (lobby.seats.every((candidate) => candidate.factionId && candidate.heroDefId)) {
    actions.push({
      label: "Start the adventure",
      action: { type: "START_ADVENTURE", playerId }
    });
  }

  return actions;
}

/**
 * Parallel turns: the quiet-action set for a player whose parallel turn is open
 * while ANOTHER player's exclusive interaction (battle, choice, visit, tile
 * rotation…) is resolving. They may keep moving over trigger-free fields, take
 * their start-of-turn hand steps, and — outside combats — spend their round's
 * town actions and morale tokens. Everything that could open an interaction of
 * its own (visits, discoveries, battles, card plays, searches, ending the
 * turn) waits until the table's current one closes. Returns [] whenever the
 * player is not an open-turn parallel actor, so every non-parallel code path
 * behaves exactly as before.
 */
function getParallelBystanderActions(state: GameState, playerId: PlayerId): LegalAction[] {
  const actions: LegalAction[] = [];
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (state.mode !== "adventure" || !adventure || !player || !isParallelActor(state, playerId)) {
    return actions;
  }

  // Round-start Event / Astrologers barrier: a frozen bystander has NO quiet
  // actions — not even a hand refresh, a town action or a move — until the
  // player whose event choice is open (and the rest of the table) has resolved
  // it. Reached here via the pendingChoice branch of getLegalActions too, which
  // is why the gate lives at this common sink as well as in getAdventureLegalActions.
  if (isRoundStartEventBarrierActive(state) && roundStartEventResolver(state) !== playerId) {
    return actions;
  }

  // Over the hand limit at the start of the turn: the forced discard-down
  // comes before anything else, exactly like an ordered turn.
  if (player.needsHandRefresh) {
    return [
      {
        label: "Discard down to your hand limit, then draw",
        action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
      }
    ];
  }

  // Town and morale actions stay open between battles (they only queue/park);
  // an open combat blocks them for everyone, exactly like ordered play.
  if (!state.combat) {
    addTownActions(actions, state, playerId);
    addMoraleActions(actions, state, playerId);
    addAbilityEmpowerTokenActions(actions, state, playerId);
  }

  // The mandatory start-of-turn draw may be taken while others resolve their
  // interactions — but movement stays locked behind it, as on an ordered turn.
  if (player.canMulligan) {
    actions.push({
      label: "Draw new — or discard some and draw up to your hand limit (start of turn)",
      action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
    });
    return actions;
  }

  // First-round opening Mulligan (option ON) — optional, non-blocking.
  if (player.canOpeningMulligan) {
    actions.push({
      label: "Opening Mulligan — discard 0 or more cards to your deck and draw that many (or keep your hand)",
      action: { type: "OPENING_HAND_MULLIGAN", playerId, discardCardIds: [] }
    });
  }

  // Quiet movement: getHeroMoveDestinations self-filters to trigger-free
  // ("open") fields while the table's interaction slot is busy.
  for (const hero of Object.values(state.heroes)) {
    if (
      hero.controllerId !== playerId ||
      !hero.spaceId ||
      (hero.movementPoints <= 0 && !heroHasFreeGateStep(state, hero))
    ) {
      continue;
    }
    for (const destination of getHeroMoveDestinations(state, hero)) {
      actions.push({
        label: `Move hero to ${destination}`,
        action: { type: "MOVE_HERO", playerId, heroId: hero.id, to: destination }
      });
    }
  }

  return actions;
}

/**
 * Legal actions for an OPEN COMBAT, shared by adventure PvP/neutral fights AND
 * Battle Test (combat-sandbox) fights — they run on the identical CombatState.
 * Covers the end-of-combat acknowledgment, PvP prep, the Tactics window, the
 * deployment placement step, the neutral-step pause, the continue/retreat
 * window and the active fight. Returns `null` when the state is NOT in a combat
 * interaction so the caller falls through to its own (map / sandbox) handling.
 *
 * Before this existed the combat-sandbox path had no deployment handling at all:
 * getLegalActions offered the sandbox's simultaneous town-turn (Build Training
 * Ground / Marketplace…) during `combat-setup` and never surfaced
 * PLACE_COMBAT_UNIT / FINISH_COMBAT_PLACEMENT, so the tester could not deploy or
 * start the fight. Routing both modes through this one function fixes that and
 * keeps Battle Test combat behaviour identical to a real PvP battle.
 */
function getCombatInteractionActions(
  state: GameState,
  playerId: PlayerId,
  cards: CardLibrary
): LegalAction[] | null {
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  const actions: LegalAction[] = [];

  // A finished combat waits on the battlefield until a participant closes the
  // end-of-combat notice; only then does finalization run. A Battle Test
  // (sandbox) fight has no map to return to — it stays on the table until reset
  // (ACKNOWLEDGE_COMBAT_END throws for it), so this ack is adventure-only.
  if (
    combat.outcome &&
    !combat.endAcknowledged &&
    !state.pendingChoice &&
    combat.context.kind !== "sandbox"
  ) {
    if (isCombatParticipant(state, playerId)) {
      actions.push({
        label: "Return to the adventure map",
        action: { type: "ACKNOWLEDGE_COMBAT_END", playerId }
      });
    }
    return actions;
  }

  // PvP pre-battle preparation: before deployment, BOTH the attacker and the
  // defender may spend any town action they still hold this round (build /
  // recruit / buy spells), then Accept to ready up — or Retreat / Surrender out
  // of the fight. Deployment begins only once both have accepted. The town
  // actions surface through addTownActions (allowed during this window). A
  // participant who has already accepted gets nothing here but waits.
  if (combat.prep) {
    if (inCombatPrep(state, playerId)) {
      addTownActions(actions, state, playerId);
      // Prepare for the fight with hand cards too — exactly the map-turn plays
      // (put the Legion artifact into play, place Sandro's Cloak, etc.), so a held
      // card is never wasted just because an enemy attacked mid-turn.
      addTurnCardActions(actions, state, playerId, cards, "combat-prep");
      addPermanentDiscardActions(actions, state, playerId);
      addPvpEscapeActions(actions, state, playerId);
      actions.push({
        label: "Accept the battle (ready up — deployment begins when both sides accept)",
        action: { type: "ACCEPT_COMBAT", playerId }
      });
    }
    return actions;
  }

  // PvP Neutral Control: the pre-battle formation SORT window. The controller
  // repositions/swaps the Neutral guards within the defender zone, then starts
  // the battle — before the Tactics window and round 1.
  if (combat.pendingNeutralPlacement) {
    if (combat.pendingNeutralPlacement === playerId) {
      addNeutralPlacementActions(actions, state, playerId);
    }
    return actions;
  }

  // Start-of-combat Tactics window: the head of the queue switches two of their
  // units or declines, before round 1 begins.
  if (combat.pendingTacticsSwaps && combat.pendingTacticsSwaps.length > 0) {
    if (combat.pendingTacticsSwaps[0] === playerId) {
      addTacticsSetupActions(actions, state, playerId);
    }
    return actions;
  }

  // WOG Commanders pre-combat SORT window: the head owner repositions their
  // commander in their deployment zone, then Ready — the LAST setup window,
  // after the Neutral sort / Tactics have already resolved.
  if (combat.pendingCommanderPlacement && combat.pendingCommanderPlacement.length > 0) {
    if (combat.pendingCommanderPlacement[0] === playerId) {
      addCommanderPlacementActions(actions, state, playerId);
    }
    return actions;
  }

  // Combat setup placement.
  if (combat.setup) {
    addCombatSetupActions(actions, state, playerId);
    // A PvP hero may still Retreat while deploying (before any fighting).
    addPvpRetreatDuringSetup(actions, state, playerId);
    return actions;
  }

  // Combat pacing / reaction pause (see CombatState.pendingNeutralStep). The
  // reacting player may cast/react first (pre-activation) and then resumes; the
  // guard-walk pause just lets the table click the enemy move on.
  if (combat.pendingNeutralStep) {
    const pause = combat.pendingNeutralStep;
    const reactor = pause.reactingPlayerId ?? combat.attackerPlayerId;
    if (playerId === reactor) {
      if (pause.kind === "pre-activation") {
        // Cast Intelligence-enabled spells, trigger-free instant spells, play
        // an instant ability, use an active effect (First Aid Tent), or play an
        // instant damage specialty (Gerwulf/Adelaide/Deemer's `combatAnytime`
        // sides) — all before the unit acts. (addSpellActions already gates
        // activation spells on the Intelligence freedom, so only the right
        // spells are offered off-turn.)
        actions.push(...getOffTurnCombatReactions(state, playerId, cards));
      }
      // Manual guard control: after this pause the FIGHTER commands the unit
      // (or delegates via the separate "Let … act (automatic)" button), so the
      // continue label says so instead of promising the AI will act.
      const manualNext =
        pause.kind === "pre-activation" &&
        combat.units[pause.unitId]?.controllerId === NEUTRAL_PLAYER_ID &&
        manualGuardControllerId(state, combat) === playerId &&
        !pvpNeutralControllerId(state, combat);
      actions.push({
        label:
          pause.kind === "pre-activation"
            ? manualNext
              ? "Continue — you command this unit"
              : "Let the unit act"
            : "Continue the enemy turn",
        action: { type: "CONTINUE_NEUTRAL_STEP", playerId }
      });
    }
    return actions;
  }

  // The neutral combat time limit: continue for 1 MP or retreat.
  if (combat.awaitingContinue) {
    const context = combat.context;
    if (context.kind === "neutral") {
      const hero = state.heroes[context.heroId];
      if (hero?.controllerId === playerId) {
        if (hero.movementPoints > 0) {
          actions.push({
            label: "Spend 1 movement point: fight another combat round",
            action: { type: "CONTINUE_NEUTRAL_COMBAT", playerId }
          });
        }
        // Dessa's Logistics specialty: continue the combat for free.
        const player = state.players[playerId];
        for (const cardId of new Set(player?.hand ?? [])) {
          if (cards[cardId]?.effect.type === "CONTINUE_NEUTRAL_FREE") {
            actions.push({
              label: `Play ${cards[cardId]?.name}: fight another combat round for free`,
              action: { type: "PLAY_CARD", playerId, cardId, target: { type: "none" } }
            });
          }
        }
        // A hero's +Movement card (Boots of Speed, the Logistics ability's
        // expert side, Dessa's Logistics IV/VI, Shield of Naval Glory's sea
        // side, …) is normally map-only, but may be spent HERE to top up the
        // movement pool and buy another combat round — so a hero out of movement
        // can fight on (spend the fresh movement on CONTINUE_NEUTRAL_COMBAT)
        // instead of being forced to retreat. Its map-only flag is waived for
        // exactly this window (in the reducer). The gates below mirror the
        // reducer's so an offered top-up never rejects.
        const expertUsesLeft =
          (player?.limits.expertUses ?? 0) +
          (player?.combatStats.expertUseBonusThisRound ?? 0) -
          (player?.combatStats.expertUsesSpentThisRound ?? 0);
        for (const cardId of new Set(player?.hand ?? [])) {
          const grant = heroMovementGrantOption(cards[cardId]);
          if (!grant || !player) {
            continue;
          }
          if (grant.mode === "expert" && expertUsesLeft <= 0 && !abilityExpertIsCrownFree(player, cardId)) {
            continue;
          }
          if (grant.option?.requiresSeaTile) {
            const main = getMainHero(state, playerId);
            if (!main?.spaceId || !isSeaField(state, main.spaceId)) {
              continue;
            }
          }
          actions.push({
            label: `Play ${cards[cardId]?.name}: gain movement to fight another combat round`,
            action: {
              type: "PLAY_CARD",
              playerId,
              cardId,
              ...(grant.optionIndex !== undefined ? { optionIndex: grant.optionIndex } : {}),
              ...(grant.mode === "expert" ? { mode: "expert" as const } : {}),
              target: { type: "none" }
            }
          });
        }
        actions.push({
          label: "Retreat to the last visited field",
          action: { type: "RETREAT_FROM_COMBAT", playerId }
        });
      }
    }
    return actions;
  }

  // Active combat: the standard combat actions apply. Spells and instants
  // stay available to both fighters whoever's unit is active.
  if (state.phase === "combat" && !combat.outcome) {
    addActiveEffectActions(actions, state, playerId);
    addUnitActions(actions, state, playerId);
    addTacticsCombatActions(actions, state, playerId);
    addSpellActions(actions, state, playerId, cards);
    addPlayableCardActions(actions, state, playerId, cards);
    // Instant damage specialties are playable off-turn too (self-gates to the
    // off-turn side, so the active player is not double-offered them).
    addCombatAnytimeSpecialtyPlays(actions, state, playerId, cards);
    // Battle Test only: the active player may Search any populated well mid-fight
    // to pull cards for testing (there is no map reward loop in the sandbox). A
    // real adventure combat never offers this — hence the mode gate.
    if (state.mode === "combat-sandbox") {
      addDeckSearchActions(actions, state, playerId);
    }
    if (isCombatParticipant(state, playerId)) {
      addPermanentDiscardActions(actions, state, playerId);
      // A morale token (e.g. gained by playing Leadership mid-battle) may also
      // be spent for its draw / discard-redraw here; the reroll use is offered
      // by the attack-die reroll choice instead.
      addMoraleActions(actions, state, playerId);
      addAbilityEmpowerTokenActions(actions, state, playerId);
      addPvpEscapeActions(actions, state, playerId);
      // Give up (concede) is available throughout the fight, not just the
      // start-of-combat escape window.
      addGiveUpCombatActions(actions, state, playerId);
    }
    return actions;
  }

  return null;
}

function getAdventureLegalActions(state: GameState, playerId: PlayerId, cards: CardLibrary): LegalAction[] {
  const actions: LegalAction[] = [];
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
    return actions;
  }

  // Round-start Event / Astrologers barrier: while the round's Event is being
  // resolved clockwise, only the player whose event choice is currently open has
  // any legal action (they flow through the normal branches below to their
  // RESOLVE_VISIT_STEP); every other player is frozen with nothing to do until
  // the whole table finishes. Mirrors the applyAction backstop (ordered AND
  // parallel play).
  if (isRoundStartEventBarrierActive(state)) {
    const resolver = roundStartEventResolver(state);
    if (resolver && resolver !== playerId) {
      return actions;
    }
  }

  // Parallel turns: while ANOTHER player's exclusive interaction is open this
  // player is a bystander with only the quiet-action set, wherever the
  // interaction machinery currently stands (combat, visit, tile, Necromancy…).
  // Owners and combat participants have a null blocker and flow through the
  // normal branches below unchanged.
  if (parallelInteractionBlocker(state, playerId)) {
    return getParallelBystanderActions(state, playerId);
  }

  // Any open combat — end-of-combat ack, PvP prep, Tactics, deployment
  // placement, the neutral-step pause, the continue/retreat window and the
  // active fight — is handled by the shared combat dispatcher (also used by
  // Battle Test). It returns null only when the state is NOT a combat
  // interaction, so play falls through to the map handling below.
  const combatActions = getCombatInteractionActions(state, playerId, cards);
  if (combatActions) {
    return combatActions;
  }

  // A freshly revealed or placed tile waits for its rotation choice.
  const tileChoice = adventure.pendingTileChoice;
  if (tileChoice) {
    const tile = adventure.tiles[tileChoice.tileInstanceId];
    if (tileChoice.playerId === playerId && tile) {
      // When the seal gate is OFF every rotation is offered (Confirm always
      // works). When ON, filter to connected / hero-reachable rotations only
      // (matches setTileRotation).
      const anyConnected =
        TILE_ROTATION_SEAL_GATE_ENABLED &&
        [0, 1, 2, 3, 4, 5].some((rotation) => isTileRotationConnected(state, tile, rotation));
      // On-foot Far placements also require a rotation the placing hero can cross
      // onto (matches setTileRotation). Redwood Observatory openings carry no
      // heroId — they only need to connect to the map, no hero-access gate.
      const placingHero = tileChoice.heroId ? state.heroes[tileChoice.heroId] : null;
      const center = { row: tile.centerRow, col: tile.centerCol };
      const anyReachable =
        TILE_ROTATION_SEAL_GATE_ENABLED &&
        placingHero != null &&
        [0, 1, 2, 3, 4, 5].some((rotation) =>
          canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, rotation)
        );
      for (let rotation = 0; rotation < 6; rotation += 1) {
        if (anyConnected && !isTileRotationConnected(state, tile, rotation)) {
          continue;
        }
        if (
          TILE_ROTATION_SEAL_GATE_ENABLED &&
          placingHero &&
          anyReachable &&
          !canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, rotation)
        ) {
          continue;
        }
        actions.push({
          label: `Confirm tile rotation ${rotation * 60}°`,
          action: { type: "SET_TILE_ROTATION", playerId, tileInstanceId: tile.id, rotation }
        });
      }
    }
    return actions;
  }

  // Pending field visit choices. Any free combat-driven reinforce (the Skeleton
  // fallback) or level-up choice queued during finalization resolves here FIRST,
  // before the Necromancy gate below — none of these is the withheld field
  // reward, so the now-or-never rule is not weakened by letting them through.
  if (adventure.pendingVisit) {
    addVisitStepActions(actions, state, playerId, cards);
    return actions;
  }

  // WOG Hierophant commander: the after-combat First Aid window resolves
  // before anything else on the map — the owner restores ONE bronze/silver
  // casualty of the fight (or declines); everyone else waits, exactly like the
  // Necromancy deferral below.
  if (adventure.pendingCommanderFirstAid) {
    const firstAid = adventure.pendingCommanderFirstAid;
    if (firstAid.playerId === playerId) {
      firstAid.options.forEach((option, index) => {
        actions.push({
          label: `First Aid: ${option.label}`,
          action: { type: "COMMANDER_FIRST_AID", playerId, optionIndex: index }
        });
      });
      actions.push({
        label: "Decline First Aid",
        action: { type: "COMMANDER_FIRST_AID", playerId, optionIndex: null }
      });
    }
    return actions;
  }

  // BINH house rule: the after-combat Necromancy window is now-or-never. Until
  // the winner plays Necromancy or skips it, NOTHING else on the map is legal
  // and the field reward of the fight they just won stays withheld — so "collect
  // the field gold, then reinforce with it" is impossible.
  if (adventure.pendingNecromancy) {
    if (adventure.pendingNecromancy.playerId === playerId) {
      addNecromancyPlays(actions, state, playerId, cards);
      actions.push({ label: "Skip Necromancy", action: { type: "SKIP_NECROMANCY", playerId } });
    }
    return actions;
  }

  // Town and morale actions may happen during any player's turn. The morale
  // token's draw / discard-redraw is spendable anywhere, not only at a Town.
  // Ability Empower tokens are spendable the same way (hand Ability only).
  addTownActions(actions, state, playerId);
  addMoraleActions(actions, state, playerId);
  addAbilityEmpowerTokenActions(actions, state, playerId);

  // Concede the whole game OFF-TURN: a player may give up while another player
  // is active, as long as the table is quiet (no combat or pending interaction
  // anywhere) — so nobody is trapped watching an opponent's turn just to quit.
  // Guarded to players WITHOUT an open turn; the active player is offered it
  // below (with full turn context). Mirrors giveUpAdventure's own guards.
  if (
    playerId !== NEUTRAL_PLAYER_ID &&
    !hasOpenAdventureTurn(state, playerId) &&
    !state.combat &&
    !state.pendingChoice &&
    !state.reactionWindow &&
    !adventure.pendingVisit &&
    !adventure.pendingNecromancy &&
    !adventure.pendingTileChoice &&
    !player.eliminated
  ) {
    actions.push({
      label: "Give up (become an observer)",
      action: { type: "GIVE_UP", playerId }
    });
  }

  // Parallel turns: every open parallel turn counts as "your turn" here.
  if (!hasOpenAdventureTurn(state, playerId)) {
    return actions;
  }

  // Over the hand limit at the start of the turn: discarding down (then drawing
  // back up) MUST come first — before town/morale actions, the optional draw,
  // any card play, movement or exploration. Nothing else is offered until the
  // forced discard is resolved, so the over-limit check always starts the turn.
  if (player.needsHandRefresh) {
    return [
      {
        label: "Discard down to your hand limit, then draw",
        action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
      }
    ];
  }

  // Start-of-turn draw/discard (every turn, including the first): discard any
  // number of cards, then draw back up to the hand limit ("draw new" with no
  // discards is the no-op pass). The draw is MANDATORY (house rule): it must be
  // taken before the player MOVES, EXPLORES or USES A CARD, so it can never be
  // forgotten. While it is unspent, the only turn actions offered are the draw
  // itself, ending the turn, and the town/morale actions already added above —
  // no movement, exploration, market or card play. (The engine backstops this in
  // assertHandRefreshed / assertStartOfTurnDrawTaken for handler-validated map
  // actions that skip this legal-action check.)
  // Round 1: only under-limit cards may be discarded here (bonus artifact);
  // a full hand is draw-only, then OPENING_HAND_MULLIGAN when the option is ON.
  // "End turn" stays offered while the draw is owed — ending a turn is a
  // deliberate pass, never a forgotten draw (pinned in
  // mandatory-draw-six-rounds.test.ts). CONSEQUENCE: the "beginning of your
  // turn" town buildings are queued by REFRESH_HAND (they read the settled
  // post-draw hand), so a seat that passes without drawing forfeits them for
  // that turn — the rulebook resolves them "after drawing". Pinned in
  // siege-tokens.test.ts.
  if (player.canMulligan) {
    actions.push({
      label: "Draw new — or discard some and draw up to your hand limit (start of turn)",
      action: { type: "REFRESH_HAND", playerId, discardCardIds: [] }
    });
    actions.push({
      label: "End turn",
      action: { type: "END_TURN", playerId }
    });
    return actions;
  }

  // First-round opening-hand Mulligan (option ON): after fill-to-limit, optional
  // discard 0–N to the deck bottom and draw the same number. Non-blocking —
  // offered alongside normal map play until used or the turn ends.
  if (player.canOpeningMulligan) {
    actions.push({
      label: "Opening Mulligan — discard 0 or more cards to your deck and draw that many (or keep your hand)",
      action: { type: "OPENING_HAND_MULLIGAN", playerId, discardCardIds: [] }
    });
  }

  // Legacy one-at-a-time MULLIGAN_CARD (firstRoundMulligansLeft) — only if a
  // snapshot still carries a budget; normal games seed 0.
  if (canMulliganStartingHand(state, playerId)) {
    for (const cardId of new Set(player.hand)) {
      actions.push({
        label: `Replace ${cards[cardId]?.name ?? cardId} (starting-hand Mulligan)`,
        action: { type: "MULLIGAN_CARD", playerId, cardId }
      });
    }
  }

  // Instant, Ongoing and Map cards may be played during your own map turn.
  addTurnCardActions(actions, state, playerId, cards);
  // Banked reinforcement offers remain non-blocking so Legion pieces and other
  // discount sources can be added before the player chooses a target.
  addBankedReinforcementActions(actions, state, playerId);
  // Spell Book (house rule): stash hand Spells into the Book to free hand slots.
  addSpellBookStashActions(actions, state, playerId, cards);
  addPermanentDiscardActions(actions, state, playerId);
  // WOG Commanders: spend an owed grade-up pick / revive a dead commander.
  addCommanderMapActions(actions, state, playerId);

  // Anime Cultivation (§5.6): OFFER the Heavenly Tribulation (never forced) when
  // the main hero is at Core Formation (realm 2), level ≥ 7, has not won it, and
  // has not attempted it this turn. Reached only past the exclusive-window
  // returns above, so "no other interaction open" already holds.
  if (tribulationAvailable(state, playerId)) {
    actions.push({
      label: "Brave the Heavenly Tribulation (Độ kiếp)",
      action: { type: "HEAVEN_TRIBULATION", playerId }
    });
  }

  // Anime Hero Grades (§3.11): TRAIN for Merit (spend 2 MP → +1 Merit, once per
  // turn), spend a grade point on a tree node, and use the Forced March map
  // active (+1 movement, once per round). All no-ops when the module is off.
  if (heroTrainAvailable(state, playerId)) {
    actions.push({
      label: "Train (2 movement → +1 Merit)",
      action: { type: "HERO_TRAIN", playerId }
    });
  }

  // Unit Experience Drill (optional rule): with the main hero in an own Town,
  // pay gold to grant one army unit +1 XP — once per turn, offered per card
  // still below max veteran rank. All no-ops when the rule is off.
  if (unitDrillAvailable(state, playerId)) {
    for (const armyUnit of drillableArmyUnits(state, playerId)) {
      const unitName = coreUnitDefinitions[armyUnit.unitDefId]?.name ?? armyUnit.unitDefId;
      actions.push({
        label: `Drill ${unitName} (${DRILL_UNIT_GOLD_COST} gold → +1 unit XP)`,
        action: { type: "DRILL_UNIT", playerId, armyUnitId: armyUnit.id }
      });
    }
  }
  for (const node of heroGradePickableNodes(state, playerId)) {
    actions.push({
      label: `Grade up: learn ${node.name.en} (${node.name.vi})`,
      action: { type: "HERO_GRADE_PICK", playerId, nodeId: node.id }
    });
  }
  for (const nodeId of heroGradeNodesOf(state, playerId)) {
    const node = HERO_GRADE_NODES[nodeId];
    if (
      node?.skill?.mode === "map-active" &&
      heroSkillAvailableThisRound(state, playerId, nodeId) &&
      hasOpenAdventureTurn(state, playerId)
    ) {
      const hero = getMainHeroOf(state, playerId);
      if (hero?.spaceId) {
        actions.push({
          label: `${node.name.en}: +${node.skill.amount} movement`,
          action: { type: "USE_HERO_SKILL", playerId, nodeId }
        });
      }
    }
  }

  // A player may field ONE Secondary Hero beside the Main one, and the hero
  // actions dock renders the REVISIT_FIELD labels below verbatim as a flat list
  // of buttons. With both heroes on the map two of them can be offered at once —
  // on two Monoliths they would read identically — so name the acting hero
  // whenever there is more than one. A single hero keeps the classic label.
  const mapHeroCount = Object.values(state.heroes).filter(
    (candidate) => candidate.controllerId === playerId && candidate.spaceId
  ).length;
  const whichHero = (kind: "main" | "secondary"): string =>
    mapHeroCount > 1 ? ` — ${kind === "secondary" ? "2nd Hero" : "Main Hero"}` : "";

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId !== playerId || !hero.spaceId) {
      continue;
    }

    const field = adventure.fields[hero.spaceId];

    // A hero parked on a Market may reopen the trade/shop panel any time, for
    // free — no movement point needed, so it stays available even when a
    // Secondary Hero simply sits on the tile.
    if (field && isMarketLocation(field.location)) {
      actions.push({
        label: `Open the ${locationDefinitions[field.location]?.name ?? field.location}`,
        action: { type: "OPEN_MARKET", playerId, heroId: hero.id }
      });
    }

    // Out of movement, the FREE Subterranean-Gate crossing ("one Field", 0 MP)
    // is still offered — but none of the 1-MP actions below (revisit, dig).
    if (hero.movementPoints <= 0 && heroHasFreeGateStep(state, hero)) {
      for (const destination of getHeroMoveDestinations(state, hero)) {
        actions.push({
          label: `Move hero to ${destination}`,
          action: { type: "MOVE_HERO", playerId, heroId: hero.id, to: destination }
        });
      }
    }

    // Dig / build the Grail may be free (0 MP) — offered even when the hero has
    // no movement left. Other movement actions still need MP.
    if (field?.grailDiggable && canDigGrail(state, playerId)) {
      const digCost = state.adventure?.mapPreset?.objectives?.grailDigCost;
      const cost = digCost === 0 || digCost === 1 || digCost === 2 ? digCost : 1;
      if (hero.movementPoints >= cost) {
        actions.push({
          label:
            (cost === 0
              ? "Dig the Grail (free)"
              : `Dig the Grail (${cost} movement point${cost === 1 ? "" : "s"})`) + whichHero(hero.kind),
          action: { type: "REVISIT_FIELD", playerId, heroId: hero.id }
        });
      }
    }
    // Build carried Grail at a legal Town/Settlement (map-maker grailBuildAt).
    {
      const grail = adventure.grail;
      const buildAt = adventure.mapPreset?.objectives?.grailBuildAt;
      if (
        buildAt &&
        grail?.status === "carried" &&
        grail.carrierHeroId === hero.id &&
        field
      ) {
        const isTown = field.location === "town" || field.location === "random_town";
        const isSettlement = field.location === "settlement";
        const town = getTownOfPlayer(state, playerId);
        const isStartingTown = Boolean(isTown && town?.fieldId === field.spaceId);
        const owned =
          field.flagOwnerId === playerId || (isTown && town?.fieldId === field.spaceId);
        let legal = false;
        if (buildAt === "town" && isTown && owned) legal = true;
        if (buildAt === "settlement" && isSettlement && owned) legal = true;
        if (buildAt === "both" && (isTown || isSettlement) && owned) legal = true;
        if (buildAt === "starting-town" && isStartingTown) legal = true;
        if (legal) {
          actions.push({
            label: "Build the Grail here",
            action: { type: "BUILD_GRAIL", playerId, heroId: hero.id }
          });
        }
      }
    }

    if (hero.movementPoints > 0) {
      for (const destination of getHeroMoveDestinations(state, hero)) {
        actions.push({
          label: `Move hero to ${destination}`,
          action: { type: "MOVE_HERO", playerId, heroId: hero.id, to: destination }
        });
      }

      if (
        field &&
        !field.grailDiggable &&
        (locationDefinitions[field.location]?.category === "revisitable" ||
          // Obelisk role "monolith": Revisit (1 MP) travels the network again,
          // like a Monolith token (which is category "revisitable").
          (field.location === "obelisk" && obeliskRoleIsMonolith(state))) &&
        // Markets use the free OPEN_MARKET path above, not the 1-MP revisit.
        !isMarketLocation(field.location)
      ) {
        actions.push({
          label:
            (field.location === "obelisk"
              ? "Revisit the Obelisk (Monolith travel)"
              : `Revisit ${locationDefinitions[field.location]?.name ?? field.location}`) +
            whichHero(hero.kind),
          action: { type: "REVISIT_FIELD", playerId, heroId: hero.id }
        });
      }

      for (const tile of Object.values(adventure.tiles)) {
        // Ordinary discovery needs an open border on the hero's own layer (no
        // crossing the Surface/Subterranean divide, no flipping across a sealed
        // yellow edge). The Redwood Observatory / Speculum bypass this gate.
        if (canHeroDiscoverAdjacentTile(state, hero, tile)) {
          actions.push({
            label: `Discover the face-down tile at (${tile.centerRow}, ${tile.centerCol})`,
            action: { type: "DISCOVER_TILE", playerId, heroId: hero.id, tileInstanceId: tile.id }
          });
        }
      }

      // Place a Far (Ⅱ–Ⅲ) supply tile into a legal empty lattice slot next to
      // the hero. Same slots the human UI ghosts; without this offer the
      // computer can never expand the map when face-down Near/center tiles
      // are sealed off and only a new Ⅱ–Ⅲ notch opens a path.
      if (playerHasPlaceableFarTile(state, playerId)) {
        const supply = adventure.playerFarTiles[playerId] ?? [];
        const supplyIndex = supply.findIndex((entry) => entry === UNOPENED_FAR_TILE);
        if (supplyIndex >= 0) {
          for (const center of farTilePlacementCenters(state, hero)) {
            actions.push({
              label: `Place a Far (Ⅱ–Ⅲ) tile at (${center.row}, ${center.col})`,
              action: {
                type: "PLACE_TILE",
                playerId,
                heroId: hero.id,
                supplyIndex,
                centerRow: center.row,
                centerCol: center.col
              }
            });
          }
        }
      }
    }
  }

  addSatyrMoraleRollActions(actions, state, playerId);

  actions.push({
    label: "End turn",
    action: { type: "END_TURN", playerId }
  });

  // Concede: only on your own quiet map turn (never mid-Combat — "you cannot
  // surrender when defending your Faction Town", rulebook p.46).
  if (
    !state.combat &&
    !state.pendingChoice &&
    !state.reactionWindow &&
    !adventure.pendingVisit &&
    !adventure.pendingTileChoice &&
    !state.players[playerId]?.eliminated
  ) {
    actions.push({
      label: "Give up (become an observer)",
      action: { type: "GIVE_UP", playerId }
    });
  }

  return actions;
}
