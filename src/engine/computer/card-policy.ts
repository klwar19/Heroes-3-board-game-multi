import { reinforceCostFor } from "../adventure";
import { previewSpellDamage, unitMatchesSpecialtyName } from "../reducer";
import { cardLibrary } from "@/data/cards/library";
import { unitAbilities } from "@/data/units/abilities";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  getBattlefieldCoordinates,
  getOrthogonalNeighbors,
} from "../battlefield";
import { cancelSpellAllowsSchoolAndLevel, getSpellDamageAmount, getSpellDiceRollCount } from "../effects";
import { abilityExpertIsCrownFree, spellLimitFor } from "../ruleset";
import { unitImmuneToSpellSchools } from "../unit-abilities";
import { dealsElementalStrike } from "./strike-value";
import { houseRuleEnabled } from "../house-rules";
import { balanceCardLibrary } from "../community-balance-cards";
import { resolvedSpellPowerForStackItem, standingSpellPower } from "../legal-actions";
import { NEUTRAL_PLAYER_ID } from "../state";
import type {
  CardDefinition,
  CardPlayMode,
  CombatUnitState,
  EffectDefinition,
  GameAction,
  GameState,
  TargetRef,
} from "../state";
import type { ComputerActionScore } from "./map-policy";
import {
  cardTierValue,
  cardValueContext,
  type CardValueStateView,
} from "./card-values";
import {
  armyDevelopmentProfile,
  developmentResourceTargets,
} from "./development";
import { collectMapObjectives } from "./map-navigation";
import { legionPurchaseSavings, nearbyPlayerFight, readySpells, saveLegionForAfterFight, upcomingFight } from "./card-planning";
import { coordinatedReplyDamage } from "./opponent-reply";
import { getPermanentCardIds, permanentLimitFor } from "../permanents";
import {
  expectedAttackDamage,
  hasThreatAbility,
  hasOutputAbility,
  livingEnemyUnits,
  pendingIncomingDamage,
  unitRemainingHealth,
  unitRemovalHealth,
  unitThreatValue,
} from "./score";
import type { ComputerObservation } from "./types";

/**
 * Scores PLAY_CARD / CAST_SPELL / PLAY_REACTION / USE_ACTIVE_EFFECT from the
 * printed effect type and PUBLIC combat/map state. Never reads an opponent's
 * hand or deck — card definitions are shared data, and targets come only from
 * the offered legal action (already validated by getLegalActions).
 *
 * Score bands (must stay consistent with policy foundation scores):
 *   - lethal-save / cancel-spell reactions: 1_060–1_180  (above PASS_REACTION 1_050)
 *   - attack/defense stat reactions that matter: 1_060–1_140
 *   - combat damage spells / strong combat cards: 640–860  (compete with attacks)
 *   - combat buffs / unit abilities via cards: 600–780
 *   - map economy / search / movement cards: 520–700  (below recruit/build, above end-turn)
 *   - inert / wasteful plays: below END_TURN (300) so they are never preferred
 *
 * Only already-legal actions are scored; an approximation error can never
 * produce an illegal move.
 */

// The First Aid Tent's once-per-round heal is a scarce charge. When the only
// wounded body is safe low-value chaff with a trivial scratch, hold it — score
// below END_ACTIVATION (400) / DEFEND (500) / PASS_REACTION (1_050) so the AI
// does something real (or PASSes) and keeps the charge for a unit worth saving.
const HOLD_FIRST_AID_SCORE = 360;

// --- effect family tables ----------------------------------------------------

const COMBAT_DAMAGE_EFFECTS = new Set<EffectDefinition["type"]>([
  "DEAL_DAMAGE",
  "AREA_DAMAGE_ADJACENT",
  "AREA_DAMAGE_ALL_ADJACENT",
  "AREA_DAMAGE_PICK_ADJACENT",
  "CHAIN_LIGHTNING",
  "INFERNO",
  "SLAYER_ATTACK",
  "DAMAGE_LOWEST_INITIATIVE_ENEMY",
  "DAMAGE_ENEMY_UNITS_BY_GRADE",
  "DAMAGE_ALL_ENEMY_UNITS",
  "SLOW_ALL_ENEMIES",
  "CREATE_HEAL_ON_ATTACKED",
  "DAMAGE_CHOSEN_ENEMIES",
  "DAMAGE_BATTLEFIELD_LINE",
  "DISCARD_WAR_MACHINE_DAMAGE",
  "EARTHQUAKE",
  "SIEGE_DEMOLISH",
  "BALLISTICS_BOMBARD",
  "ARTILLERY_BALLISTA_VOLLEY",
]);

const COMBAT_BUFF_EFFECTS = new Set<EffectDefinition["type"]>([
  "CREATE_ATTACK_BUFF",
  "CREATE_VARIANT_ATTACK_BUFF",
  "CREATE_DEFENSE_BUFF",
  "CREATE_INITIATIVE_BUFF",
  "CREATE_FIRE_SHIELD",
  "CREATE_SPELL_WARD",
  "CREATE_SPELL_IMMUNITY",
  "CREATE_ATTACK_DIE_REROLL",
  "ADD_UNIT_MAX_HEALTH",
  "HEAL_DAMAGE",
  "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
  "GRANT_DEFENSE_TOKENS",
  "STONE_SKIN_AURA",
  "CLEAR_RETALIATION",
  "IGNORE_ATTACK_DIE",
  "IGNORE_ATTACK_DIE_RESULT",
  "IGNORE_DEFENSE",
  "ACTIVATE_RANGED_UNIT",
  "FIRST_AID_TENT_VOLLEY",
  "DOUBLE_FIRST_AID_TENT",
  "CLONE_UNIT",
  "SUMMON_ELEMENTAL",
  "GRANT_ELEMENTAL_DAMAGE",
  "TOGGLE_RETALIATION_MARKER",
  "REDUCE_RETALIATION_DAMAGE",
]);

const COMBAT_DEBUFF_EFFECTS = new Set<EffectDefinition["type"]>([
  "PLACE_PARALYSIS",
  "PLACE_WEAKNESS_TOKEN",
  "SKIP_ACTIVATION",
  "FORGETFULNESS",
  "BERSERK",
  "DISPEL_EFFECTS",
  "DISRUPTING_RAY",
  "BLOCK_ENEMY_SURRENDER",
  "FORCE_ATTACK_ROLL",
  "PLACE_FORCE_FIELD",
  "PLACE_FIRE_WALL",
  "PLACE_FIRE_WALL_FIXED",
  "PLACE_HIDDEN_TOKENS",
  "TELEPORT_UNIT",
  "MOVE_UNIT_ADJACENT",
  "REMOVE_OBSTACLE",
]);

/** Debuffs that deny a whole activation (or worse) — tempo, not a stat shave. */
const TEMPO_DENIAL_EFFECTS = new Set<EffectDefinition["type"]>([
  "PLACE_PARALYSIS",
  "SKIP_ACTIVATION",
  "BERSERK",
]);

const SAVE_EFFECTS = new Set<EffectDefinition["type"]>([
  "CANCEL_LETHAL_ATTACK",
  "CANCEL_SPELL",
  "NEGATE_ATTACK",
  "REDIRECT_SPELL",
  "INTERFERE_SPELL",
]);

const MAP_ECONOMY_EFFECTS = new Set<EffectDefinition["type"]>([
  "GAIN_RESOURCES",
  "DRAW_CARDS",
  "DRAW_NEUTRAL_RECRUIT_OFFER",
  "RESOURCE_FORTUNE_PLAY",
  "GAIN_RECRUIT_DISCOUNT",
  // Community Balance Change Legion remove-sides: a map economy play (it opens
  // the tier-scoped reinforce menu). No dedicated AI valuation — it is scored as
  // a generic map economy card, exactly like the discount side beside it.
  "LEGION_TIER_REINFORCE",
  "GAIN_EXPERT_USE",
  "GAIN_WAR_MACHINE",
  "GAIN_RUNES",
  "GAIN_STARTING_RUNES",
  "GAIN_MORALE",
  "ADVANCE_EXPERIENCE",
  "DIPLOMACY_RECRUIT",
  "DIPLOMACY_SKIP_COMBAT",
  "CONVERT_ARMY_UNIT",
  "BORROW_NEUTRAL_UNIT",
  "NECROMANCY_REINFORCE",
]);

const MAP_SEARCH_EFFECTS = new Set<EffectDefinition["type"]>([
  "CARD_DECK_SEARCH",
  "REMOVE_HAND_CARD_THEN_SEARCH",
  "SEARCH_DECK_THEN_RESHUFFLE",
  "DECK_DIG_KEEP_ONE",
  "DECK_DIG_KEEP_MATCHING",
  "DRAW_TOP_ARTIFACT",
  "EAGLE_EYE_DIG",
  "TAKE_FROM_DISCARD",
  "VISIONS_SCRY",
  "PANDORA_VISIT",
  "PANDORA_SCRY",
  "PANDORA_SILVER_REFRESH",
  "TARNUM_OVERLIMIT_SEARCH",
  "CAST_FROM_SPELL_DISCARD",
  "SCHOLAR_EMPOWER_SWAP",
  "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD",
]);

const MAP_MOVEMENT_EFFECTS = new Set<EffectDefinition["type"]>([
  "GAIN_HERO_MOVEMENT",
  "TELEPORT_HERO_TO_TOWN",
  "DIMENSION_DOOR",
  "VIEW_EARTH",
  "DISCOVER_TILE_CARD",
  "CONTINUE_NEUTRAL_FREE",
]);

const STAT_COMBAT_EFFECTS = new Set<EffectDefinition["type"]>([
  "ADD_COMBAT_STAT",
  "ADD_SPELL_POWER",
  "SET_SPELL_POWER_MAX",
  "TRIPLE_ATTACK_DIE",
  "RECALL_SPELL",
]);

function primaryEffect(
  card: CardDefinition,
  optionIndex?: number,
): EffectDefinition | null {
  if (card.effect.type === "CHOOSE_ONE") {
    const option = card.effect.options[optionIndex ?? 0];
    return option?.effect ?? null;
  }
  return card.effect;
}

/** Current hand utility differs from long-term acquisition quality. */
export function cardHandValue(cardId: string, observation: ComputerObservation): number {
  const state = observation.state as unknown as GameState;
  const card = balanceCardLibrary(state, cardLibrary)[cardId];
  if (!card) return 0;
  const fight = upcomingFight(observation);
  let value = cardKeepValue(cardId, observation);
  const effect = card.effect;
  // Build a usable opening hand before the Far tile is revealed. Keep the
  // first Power/Knowledge while searching for Arrow, not repeated orphan fuel.
  const opening = !state.combat && state.round <= 5 && Boolean(state.adventure);
  if (opening && (cardId === "stat.power" || cardId === "stat.knowledge")) return Math.max(value, 72);
  if (card.statisticType === "attack" && (fight || opening)) return Math.max(value, 78);
  // Statistic cards have no community tier and otherwise score only 32,
  // below the fight-refresh discard threshold (50). Keep the attack/defense
  // reactions that make a PvP hand useful, including while finishing a guard.
  if ((card.statisticType === "attack" || card.statisticType === "defense") &&
      (fight?.kind === "pvp" || nearbyPlayerFight(observation))) return Math.max(value, 70);
  if (cardId === "spell.magic_arrow") {
    // Inside a fight whose every living enemy is Arrow-immune (Elementals,
    // spell-immune guards) the Arrow is dead weight: refresh it away.
    const enemies = state.combat ? Object.values(state.combat.units).filter(unit =>
      unit.controllerId !== observation.playerId && unit.position >= 0 && unit.damage < unit.maxHealth) : [];
    if (enemies.length && enemies.every(unit => unitImmuneToSpellSchools(unit, card.spellSchools))) return 10;
    return Math.max(value, fight ? 90 : 75);
  }
  if (effect.type === "NECROMANCY_REINFORCE" && state.players[observation.playerId]?.factionId === "necropolis") return Math.max(value, 85);
  const spells = readySpells(state, observation.playerId).filter(spell =>
    !fight || spell.timing !== "map" || (effect.type === "RECALL_SPELL" && !state.combat));
  if ((effect.type === "ADD_SPELL_POWER" || effect.type === "RECALL_SPELL" ||
      effect.type === "SET_SPELL_POWER_MAX") && !spells.length && !card.permanent) value = Math.min(value, 12);
  if (spells.length && (effect.type === "ADD_SPELL_POWER" || effect.type === "RECALL_SPELL" ||
      effect.type === "SET_SPELL_POWER_MAX") && !card.permanent) value = Math.max(value, 65);
  const school = card.permanentEffect?.schoolBonus?.school;
  if (school && !spells.some(spell => spell.spellSchools?.includes(school) || spell.spellSchools?.includes("any"))) value = 20;
  if (card.id === "ability.resistance") {
    if (nearbyPlayerFight(observation)) return Math.max(value, 80);
    if (fight?.kind === "neutral") return 8;
    if (fight?.kind === "pvp") return Math.max(value, 80);
  }
  if (fight) {
    // These are spendable before entering combat, or saved for its reward purchase.
    if (!state.combat && (card.id === "ability.estates" || card.id === "spell.view_air" || card.id.includes("_of_legion"))) return Math.max(value, 75);
    if (card.id === "ability.learning") return Math.max(value, 70);
    if (card.id === "ability.scholar" || card.id === "ability.luck" || card.id === "ability.leadership") return Math.max(value, 80);
    if (card.id === "ability.diplomacy") return (!state.combat || state.combat.prep) && fight.kind === "neutral" &&
      (cardValueContext(state, observation.playerId).ownHeroLevel ?? 0) >= 3 ? Math.max(value, 70) : 8;
    if (card.id === "war_machine.first_aid_tent") return Math.max(value, 70);
    if (card.timing === "map" || MAP_ECONOMY_EFFECTS.has(effect.type)) value = Math.min(value, 35);
    if (card.kind === "spell" && card.timing !== "map") value += 20;
  }
  return value;
}

function combatUnitFromTarget(
  observation: ComputerObservation,
  target: TargetRef | undefined,
) {
  if (!target || target.type !== "unit") return null;
  return observation.state.combat?.units[target.unitId] ?? null;
}

/**
 * Seat view for context-aware keep values — any ComputerObservation (or a
 * bare `{ state, playerId }` pair) satisfies it structurally.
 */
export type CardKeepView = {
  state: CardValueStateView;
  playerId: string;
};

/**
 * Value of keeping/playing a card type for search/discard ranking. Higher =
 * more worth holding. Public card definitions only, refined by the community
 * tier list (card-values.ts) — pass the observing seat's `view` so the tier
 * contribution adjusts to the live context (PvP threat, morale rule,
 * Necropolis matchup, Mage-Guild access); without a view the printed tier
 * applies as-is, and an unmapped card keeps the pure kind/family heuristic.
 */
/**
 * A hero-specialty whose (chosen) effect grants +Attack/+Defense — the "might"
 * specialties. The AI conserves these as combat tempo rather than discard fuel.
 */
function specialtyBoostsAttackOrDefense(card: CardDefinition): boolean {
  const effects =
    card.effect.type === "CHOOSE_ONE"
      ? card.effect.options.map((option) => option.effect)
      : [card.effect];
  return effects.some(
    (effect) =>
      effect?.type === "ADD_COMBAT_STAT" &&
      (effect.stat === "attack" || effect.stat === "defense"),
  );
}

export function cardKeepValue(
  cardId: string,
  view?: CardKeepView | null,
): number {
  const card = cardLibrary[cardId];
  if (!card || card.implementationStatus !== "implemented") return 0;
  let value = 10;
  switch (card.kind) {
    case "artifact":
      value +=
        card.artifactTier === "relic"
          ? 80
          : card.artifactTier === "major"
            ? 55
            : 35;
      break;
    case "spell":
      value += card.spellLevel === "expert" ? 45 : 30;
      break;
    case "ability":
      value += 28;
      break;
    case "statistic":
      value += 22;
      break;
    case "hero-specialty":
      value += 40;
      // Attack/Defense-boosting specialties are a recurring combat-tempo
      // resource: hold them for the fight rather than burning them as fuel for
      // other plays. Raising the keep value lifts the discard-cost penalty and
      // every keep/discard ranking that reads it.
      if (specialtyBoostsAttackOrDefense(card)) value += 25;
      break;
    case "war-machine":
      value += 25;
      break;
    default:
      value += 18;
      break;
  }
  if (card.permanent) value += 12;
  if (SAVE_EFFECTS.has(card.effect.type)) value += 20;
  if (COMBAT_DAMAGE_EFFECTS.has(card.effect.type)) value += 10;
  if (MAP_ECONOMY_EFFECTS.has(card.effect.type)) value += 8;
  value += cardTierValue(
    cardId,
    view ? cardValueContext(view.state, view.playerId) : null,
  );
  if (view) {
    // Only our known hand/discard/permanents; never inspect hidden draw order
    // or an opponent's hand. Acquisitions and discards share this valuation.
    const owner = view.state.players?.[view.playerId];
    const known = [...(owner?.hand ?? []), ...(owner?.discard ?? []), ...(owner?.permanents ?? []),
      ...(owner?.spellBook ?? []), ...(owner?.spellBookUsed ?? [])]
      .map((id) => cardLibrary[id]).filter((entry) => entry?.implementationStatus === "implemented");
    const spells = known.filter((entry) => entry.kind === "spell").length;
    const power = known.filter((entry) => entry.effect.type === "ADD_SPELL_POWER").length;
    const recall = known.filter((entry) => entry.effect.type === "RECALL_SPELL").length;
    if (card.effect.type === "ADD_SPELL_POWER" && spells > power) value += 14;
    if (card.effect.type === "RECALL_SPELL" && spells > 0 && recall < 2) value += 18;
    if (card.kind === "spell" && spells === 0) value += 12;
    if (card.effect.type === "CANCEL_SPELL" && cardValueContext(view.state, view.playerId).enemyHeroThreat) {
      const counters = known.filter((entry) => entry.effect.type === "CANCEL_SPELL").length;
      if (counters < 2) value += 14;
    }
    if (card.id === "ability.archery" || card.id === "spell.precision" || card.id === "artifact.golden_bow") {
      const ranged = (owner?.army ?? []).filter((unit) => {
        const def = coreUnitDefinitions[unit.unitDefId];
        const side = unit.side === "bank" ? undefined : def?.[unit.side];
        return (side?.type ?? def?.type) === "ranged";
      }).length;
      value += ranged > 0 ? Math.min(18, ranged * 9) : -18;
    }
    const context = cardValueContext(view.state, view.playerId);
    if (card.id === "ability.wisdom" && !context.mageGuildBuilt) value = 8;
    if (card.id === "ability.pathfinding" && (context.ownHeroLevel ?? 1) < 3) value = 18;
    if (card.id === "ability.artillery" || card.id === "ability.ballistics" || card.id.startsWith("ability.basic_")) value = Math.min(value, 18);
    if (card.id === "ability.tactics") value = Math.min(value, 25);
    if (card.id === "ability.eagle_eye") value = Math.max(value, spells < 2 ? 80 : 60);
    if (card.id === "ability.learning" && (context.ownHeroLevel ?? 1) < 7) value = Math.max(value, 70);
    if (card.id === "ability.diplomacy") value = (context.ownHeroLevel ?? 1) >= 3 ? Math.max(value, 65) : 20;
    if (card.id === "ability.offense" || card.id === "ability.armorer") value = Math.max(value, 80);
    if (card.id === "ability.sorcery" && spells === 0) value = 20;
  }
  return value;
}

function modeBonus(mode: CardPlayMode | undefined): number {
  return mode === "expert" ? 8 : 0;
}

function areaDamageAmount(
  card: CardDefinition,
  effect: EffectDefinition,
): number {
  if ("amount" in effect && typeof effect.amount === "number") {
    return Math.max(1, effect.amount);
  }
  return Math.max(1, getSpellDamageAmount(card, card.power ?? 0));
}

/** Units the selected centre/line would actually hit, including friendly fire. */
function areaDamageUnits(
  observation: ComputerObservation,
  effect: EffectDefinition,
  target: TargetRef | undefined,
): CombatUnitState[] | null {
  const combat = observation.state.combat;
  if (!combat || !target) return null;
  const living = Object.values(combat.units).filter(
    (unit) => unitRemainingHealth(unit) > 0,
  );
  const center =
    target.type === "space"
      ? target.position
      : target.type === "unit"
        ? combat.units[target.unitId]?.position
        : undefined;
  if (center === undefined) return null;

  if (effect.type === "DAMAGE_BATTLEFIELD_LINE") {
    const column = getBattlefieldCoordinates(center).column;
    return living.filter(
      (unit) => getBattlefieldCoordinates(unit.position).column === column,
    );
  }
  if (
    effect.type === "AREA_DAMAGE_ADJACENT" ||
    effect.type === "AREA_DAMAGE_ALL_ADJACENT" ||
    effect.type === "INFERNO"
  ) {
    const positions = new Set([
      ...(effect.type === "AREA_DAMAGE_ALL_ADJACENT" && effect.includeCenter === false ? [] : [center]),
      ...getOrthogonalNeighbors(center),
    ]);
    return living.filter((unit) => positions.has(unit.position));
  }
  if (effect.type === "AREA_DAMAGE_PICK_ADJACENT") {
    const adjacent = new Set(getOrthogonalNeighbors(center));
    const picked = living
      .filter(
        (unit) =>
          adjacent.has(unit.position) &&
          unit.controllerId !== observation.playerId,
      )
      .sort((a, b) => unitThreatValue(b) - unitThreatValue(a))
      .slice(0, effect.adjacentPicks);
    if (effect.includeCenter) {
      const centerUnit = living.find((unit) => unit.position === center);
      if (centerUnit) picked.push(centerUnit);
    }
    return picked;
  }
  return null;
}

function scoreDamageEffect(
  observation: ComputerObservation,
  card: CardDefinition,
  effect: EffectDefinition,
  target: TargetRef | undefined,
  base: number,
): number {
  const affected = areaDamageUnits(observation, effect, target);
  if (affected) {
    const damage = areaDamageAmount(card, effect);
    let enemyHits = 0;
    const swing = affected.reduce((total, unit) => {
      const remaining = unitRemainingHealth(unit);
      const threat = unitThreatValue(unit);
      const lethal = damage >= remaining;
      if (unit.controllerId === observation.playerId) {
        // User ruling (2026-09-15): an AoE damage spell (Fireball / Frost Ring /
        // Meteor Shower) must AVOID catching our OWN gold lvl-7 bodies — never hit
        // the enemy gold if the same blast also lands on ours. Our own gold/azure
        // in the splash costs far more than any enemy body the centre gains, so the
        // AI shifts the centre to spare it (or declines the cast when no centre can).
        const ownPremium = unit.grade === "gold" || unit.grade === "azure";
        return total - (ownPremium
          ? 220 + (lethal ? 140 : 0)
          : 55 + Math.min(35, threat) + (lethal ? 55 : 0));
      }
      enemyHits += 1;
      return (
        total +
        24 +
        Math.min(35, Math.round(threat / 2)) +
        (lethal ? 45 : 0)
      );
    }, 0);
    // A blast that catches NO enemy — an empty center (areaDamageUnits returns
    // [], which is still truthy) or a friendlies-only splash — is a wasted cast.
    // Score it below END_ACTIVATION (400) so the AI ends its activation instead
    // of dumping the spell on empty space (legal-actions offers every board cell).
    if (enemyHits === 0) {
      return 200;
    }
    return Math.max(180, Math.min(900, base + swing));
  }

  const defender = combatUnitFromTarget(observation, target);
  if (!defender) {
    // Untargeted / space-targeted AREA damage hits several bodies at once:
    // scale by how many living enemies are actually on the field so a crowded
    // Inferno / Chain Lightning outranks a single-target chip, while a lone
    // straggler keeps the old mild nudge.
    const combat = observation.state.combat;
    const enemies = combat
      ? livingEnemyUnits(combat, observation.playerId).length
      : 0;
    return Math.min(860, base + 20 + Math.max(0, enemies - 1) * 15);
  }
  if (defender.controllerId === observation.playerId) {
    // Never prefer self-damage.
    return 200;
  }
  const threat = unitThreatValue(defender);
  const remaining = unitRemainingHealth(defender);
  // Spell/card damage is NOT reduced by Defense (see the DEAL_DAMAGE resolution
  // in reducer.ts — only dedicated spell-ward abilities shave it), so estimate
  // with the card's PRINTED base-Power damage. The old attack-style
  // `attack − defense` guess made armoured high-value units look unhittable and
  // steered every cast at the cheapest chaff instead of the real threat.
  const owner = observation.state.players[observation.playerId];
  const heldPower = (owner?.hand ?? []).filter(id => id === "stat.power").length;
  // Plain Power is legal fuel for any spell. Preview that finite hand budget,
  // while still respecting the target's actual wards and immunity.
  const powerBudget = heldPower + Math.min(heldPower, Math.max(0, crownsAvailable(observation)));
  // Include the active unit, school, artifact, and other standing bonuses
  // when choosing a target. The pending-cast evaluator still decides exact
  // marginal Power spending through the authoritative stack calculation.
  const standingPower = standingSpellPower(observation.state as unknown as GameState, observation.playerId, card);
  const printed = getSpellDamageAmount(card, Math.max(0, (card.power ?? 0) + standingPower + powerBudget));
  const damage = card.kind === "spell"
    ? previewSpellDamage(observation.state as unknown as GameState, defender, card, printed)
    : Math.max(1, printed);
  if (damage <= 0) return 200;
  const combat = observation.state.combat;
  if (card.id === "spell.magic_arrow" && combat?.context.kind === "neutral" && defender.defense >= 2 &&
      damage >= unitRemovalHealth(defender) && livingEnemyUnits(combat, observation.playerId).some(dealsElementalStrike)) {
    return 1_180;
  }
  const bestPhysicalDamage = combat
    ? Object.values(combat.units).reduce(
        (best, unit) =>
          unit.controllerId === observation.playerId &&
          unitRemainingHealth(unit) > 0
            ? Math.max(best, expectedAttackDamage(unit, defender))
            : best,
        0,
      )
    : 0;
  // A defender that nullifies the attacker's die (Mummies force it to "-1") or
  // is otherwise beyond our melee reach is a job for the spell — melee wastes an
  // activation on it. Treat those like a zero-physical wall so the Arrow focuses
  // the units our bodies genuinely cannot kill.
  const meleeNullified =
    (defender.abilities ?? []).includes("mummy-force-attacker-die") ||
    (defender.abilities ?? []).includes("mummy-ignore-own-die");
  const armorLeverage =
    Math.min(30, defender.defense * 3) +
    (bestPhysicalDamage === 0 || meleeNullified ? 28 : 0);
  let quality =
    Math.min(60, threat) +
    Math.round((Math.min(damage, remaining) / Math.max(1, remaining)) * 40) +
    armorLeverage;
  if (damage >= unitRemovalHealth(defender)) quality += 50 +
    (!defender.activatedThisRound ? 30 : 0) + (defender.defense >= 2 ? 25 : 0);
  // PvP (user ruling 2026-09-15): a damage spell exists to punch the enemy's GOLD
  // lvl-7 body (2-3 Defense) — Defense-ignoring damage is the ONLY tool that hurts
  // an armoured gold stack our melee bounces off. Order targets STRICTLY by tier so
  // a gold/azure body always outranks silver, and ANY non-bronze body outranks a
  // bronze — even a lethal bronze kill (the +50/+30/+25 lethal terms above are
  // exactly what let a bronze kill jump the gold chip). NEVER spend the spell on a
  // bronze, not even a bronze shooter; a dangerous shooter is still an acceptable
  // silver-band target via the within-tier threat term. The tier bands are spaced
  // wider than the within-tier range, so a gold body present is always the target;
  // when only bronze remains it is still cast at (this orders WITHIN the offered
  // targets, it does not forbid the sole option). Neutral fights keep the
  // lethal/armour logic above — guard parties are scripted and the Def-2 Power-pour
  // ruling owns them.
  if (combat?.context.kind === "player") {
    const tierBand =
      defender.grade === "gold" || defender.grade === "azure" ? 150
        : defender.grade === "silver" ? 90
          : 30;
    const withinTier =
      Math.min(30, Math.round(threat / 3)) +
      Math.round((Math.min(damage, remaining) / Math.max(1, remaining)) * 15) +
      (damage >= unitRemovalHealth(defender) ? 10 : 0);
    return Math.min(860, base + tierBand + withinTier);
  }
  return Math.min(860, base + quality);
}

function scoreBuffTarget(
  observation: ComputerObservation,
  target: TargetRef | undefined,
  base: number,
): number {
  const unit = combatUnitFromTarget(observation, target);
  if (!unit) return base + 10;
  if (unit.controllerId !== observation.playerId) {
    // Debuff-shaped buffs (e.g. Slow is CREATE_INITIATIVE_BUFF negative) still
    // land on enemies via legal targets — reward threat.
    return base + Math.min(40, Math.round(unitThreatValue(unit) / 3));
  }
  return base + Math.min(35, Math.round(unitThreatValue(unit) / 4));
}

export function knowledgeExtraCastUseful(observation: ComputerObservation): boolean {
  const state = observation.state as unknown as GameState;
  const combat = state.combat;
  const player = state.players[observation.playerId];
  const cast = state.stack?.at(-1)?.action;
  if (!combat || !player || cast?.type !== "CAST_SPELL") return false;
  const enemies = livingEnemyUnits(combat, observation.playerId);
  const spells = readySpells(state, observation.playerId).filter(card =>
    card.effect.type === "DEAL_DAMAGE" && enemies.some(enemy =>
      previewSpellDamage(state, enemy, card, getSpellDamageAmount(card, (card.power ?? 0) +
        Math.min(2, player.hand.filter(id => id === "stat.power").length))) > 0));
  // The casting card is returned by Knowledge, unless a spell-book rule
  // recalls only the enabler. In either case require a real remaining spell.
  const current = balanceCardLibrary(state, cardLibrary)[cast.cardId];
  const recurring = current?.effect.type === "DEAL_DAMAGE" && enemies.some(enemy =>
    (enemy.id !== (cast.target?.type === "unit" ? cast.target.unitId : undefined) ||
      previewSpellDamage(state, enemy, current, getSpellDamageAmount(current, (current.power ?? 0) +
        player.hand.filter(id => id === "stat.power").length)) < unitRemovalHealth(enemy)) &&
    previewSpellDamage(state, enemy, current, getSpellDamageAmount(current, current.power ?? 0)) > 0);
  const remainingSlots = Math.max(0, spellLimitFor(state, player) - player.combatStats.spellsCastThisRound);
  return enemies.length >= 2 && spells.length + Number(Boolean(recurring)) > remainingSlots;
}

function scoreStatReaction(
  observation: ComputerObservation,
  card: CardDefinition,
  mode: CardPlayMode | undefined,
  effect: EffectDefinition,
): number {
  // Attack/Defense statistic cards and similar combat-stat reactions. High
  // value because they only appear when legal (an attack window is open).
  let amount =
    mode === "expert"
      ? ("expertAmount" in effect ? (effect.expertAmount as number | undefined) : undefined) ??
        ("amount" in effect ? (effect.amount as number) : 1)
      : ("amount" in effect ? (effect.amount as number) : 1);

  // Hero-specialty tactical awareness: a "might" specialty (ADD_COMBAT_STAT with
  // `doubleForUnitName`) grants DOUBLE the stat to the hero's signature unit —
  // the attacker for its attack option, the unit under attack for its defense
  // option (mirrors the reducer's doubleAmountForUnitName). Reflect that here so
  // the AI values the boost at its true size on that unit: it plays the attack
  // card more readily behind the signature attacker, and recognises that the
  // doubled defense can save the signature unit from an otherwise lethal hit.
  if (effect.type === "ADD_COMBAT_STAT" && effect.doubleForUnitName) {
    const combat = observation.state.combat;
    const pending = observation.state.stack?.at(-1)?.action;
    if (
      combat &&
      (pending?.type === "ATTACK_UNIT" || pending?.type === "MOVE_AND_ATTACK_UNIT")
    ) {
      const signatureUnit =
        effect.stat === "attack"
          ? combat.units[pending.attackerId]
          : combat.units[pending.defenderId];
      if (unitMatchesSpecialtyName(signatureUnit?.name, effect.doubleForUnitName)) {
        amount *= 2;
      }
    }
  }

  if (effect.type === "ADD_SPELL_POWER" || card.statisticType === "power") {
    if (pendingViewAirGold(observation)) return 180;
    const impact = pendingSpellBoostImpact(observation, amount);
    if (impact === "lethal-already" || impact === "no-ladder-step") return 1_020;
    return 1_100 + amount * 10 + modeBonus(mode);
  }
  if (effect.type === "RECALL_SPELL") {
    const recalled = observation.state.stack?.at(-1)?.modifiers.recallSpell;
    if (card.id === "stat.knowledge" && recalled && mode !== "expert" &&
        !effect.basicSpellLimitBonus && !effect.basicRecallPlayedCards) return 1_020;
    if (mode === "expert" && effect.expertSpellLimitBonus && knowledgeExtraCastUseful(observation)) return 1_145;
    return 1_080 + modeBonus(mode);
  }
  if (effect.type === "ADD_COMBAT_STAT") {
    const stat = effect.stat;
    if (stat === "attack") {
      const combat = observation.state.combat;
      const top = observation.state.stack?.at(-1);
      const attack = top?.action;
      if (
        combat &&
        attack &&
        (attack.type === "ATTACK_UNIT" || attack.type === "MOVE_AND_ATTACK_UNIT")
      ) {
        const attacker = combat.units[attack.attackerId];
        const defender = combat.units[attack.defenderId];
        if (attacker?.controllerId === observation.playerId && defender) {
          const cap = (defender.abilities ?? []).reduce((lowest, abilityId) => {
            const abilityEffect = unitAbilities[abilityId]?.effect;
            return abilityEffect?.type === "CAP_DAMAGE_PER_ATTACK"
              ? Math.min(lowest, abilityEffect.amount)
              : lowest;
          }, Number.POSITIVE_INFINITY);
          const ownElemental = dealsElementalStrike(attacker);
          // BINH house rule: an elemental attack cannot be raised by Attack
          // cards at all — the card would be burned for nothing.
          if (ownElemental && houseRuleEnabled(observation.state as unknown as GameState, "elemental-damage-no-die")) {
            return 1_020;
          }
          const currentDamage = Math.max(
            0,
            attacker.attack + (top.modifiers.attackBonus ?? 0) -
              (ownElemental ? 0 : defender.defense + (top.modifiers.defenseBonus ?? 0)),
          );
          // The Absolution–VuHy replay showed Offense + Sword of Hellfire
          // stacked onto Hydras even though Nix's Hardened Shell already capped
          // the hit at 4. Preserve every extra Attack card once the current hit
          // has reached the target's per-attack cap.
          if (Number.isFinite(cap) && currentDamage - 1 >= cap) {
            return 1_020;
          }
          // Do not spend another Attack card when even the low (-1) printed
          // die already removes the target. Keep it for a subsequent attack.
          if (Math.min(cap, Math.max(0, currentDamage - 1)) >= unitRemovalHealth(defender)) {
            return 1_020;
          }
        }
      }
    }
    if (stat === "defense") {
      const combat = observation.state.combat;
      const top = observation.state.stack?.at(-1);
      const attack = top?.action;
      if (
        combat &&
        attack &&
        (attack.type === "ATTACK_UNIT" || attack.type === "MOVE_AND_ATTACK_UNIT")
      ) {
        const attacker = combat.units[attack.attackerId];
        const defender = combat.units[attack.defenderId];
        if (attacker && defender?.controllerId === observation.playerId) {
          // An elemental strike ignores the Defense value AND Defense cards:
          // the card would change nothing. Keep it for a hit it can reduce.
          if (dealsElementalStrike(attacker)) {
            return 300;
          }
          const attackValue = attacker.attack + (top.modifiers.attackBonus ?? 0);
          const defenseValue = defender.defense + (top.modifiers.defenseBonus ?? 0);
          const beforeDamage = Math.max(0, attackValue - defenseValue);
          const afterDamage = Math.max(0, attackValue - defenseValue - amount);
          const remaining = unitRemovalHealth(defender);
          // Ranked-PvP lesson v1: preserve a scarce Defense card when its
          // expected reduction still leaves the attacked unit dead. This is
          // outcome-aware conservation, not imitation of a named unit/faction;
          // if the card turns lethal into survival, it remains the top play.
          if (beforeDamage >= remaining && afterDamage >= remaining) {
            return 1_020;
          }
          if (beforeDamage >= remaining && afterDamage < remaining) {
            return 1_150 + Math.min(25, Math.round(unitThreatValue(defender) / 3)) + modeBonus(mode);
          }
          if (card.statisticType === "defense" && beforeDamage > 0 && afterDamage < beforeDamage) {
            const ownLiving = Object.values(combat.units).filter(unit =>
              unit.controllerId === observation.playerId && unitRemainingHealth(unit) > 0);
            // The Marksman gets the Defense card specifically when an enemy
            // SHOOTER attacks it — a ranged duel the card can actually win.
            // (Melee threats to the back row fall through to normal valuation.)
            if (defender.unitDefId === "castle.marksmen" && attacker.type === "ranged") {
              return 1_150 + Math.min(25, Math.round(unitThreatValue(defender) / 3)) + modeBonus(mode);
            }
            const griffin = ownLiving.find(unit => unit.unitDefId === "castle.griffins");
            // Early game — the first few rounds, before any gold-grade unit is
            // fielded — the scarce Defense card is conserved for the Griffin (a
            // key fast body) rather than spent on a lesser unit. Once a gold unit
            // is in play, or past the opening, this hold drops and the card is
            // valued normally below.
            const beforeGoldUnit = !ownLiving.some(unit =>
              unit.grade === "gold" || unit.grade === "azure");
            const earlyRounds = (observation.state.round ?? 1) <= 3;
            if (griffin && beforeGoldUnit && earlyRounds) {
              if (defender.id !== griffin.id) return 1_020;
              return 1_145 + modeBonus(mode);
            }
          }
        }
      }
    }
    // Attack window for self / defense window for opponent — both are offered
    // only when useful. Prefer expert when crowns allow (already gated).
    if (stat === "attack" || stat === "defense") {
      return 1_090 + amount * 12 + modeBonus(mode);
    }
    return 1_070 + amount * 8 + modeBonus(mode);
  }
  if (effect.type === "TRIPLE_ATTACK_DIE") {
    return 1_100 + modeBonus(mode);
  }
  return 1_070 + modeBonus(mode);
}

/**
 * How valuable the unit currently under lethal threat is (reaction window /
 * stack target when public). Saves a high-threat ally first; still always
 * above PASS so a legal save is never skipped for a worthless body when it is
 * the only offered save.
 */
function threatenedAllyBonus(observation: ComputerObservation): number {
  const window = observation.state.reactionWindow;
  const combat = observation.state.combat;
  if (!window || !combat) return 0;
  // Attack windows name the defender on the stack item / window context when
  // present; fall back to scanning own living units for the most damaged one.
  const stack = observation.state.stack;
  const top = stack?.[stack.length - 1];
  let unitId: string | undefined;
  if (top && "defenderId" in top.action) {
    unitId = (top.action as { defenderId?: string }).defenderId;
  }
  if (!unitId && "targetUnitId" in (window as object)) {
    unitId = (window as { targetUnitId?: string }).targetUnitId;
  }
  const unit = unitId ? combat.units[unitId] : null;
  if (unit && unit.controllerId === observation.playerId) {
    return Math.min(25, Math.round(unitThreatValue(unit) / 3));
  }
  return 0;
}

/** Narrow, conservative counter conservation for a plain attack-stat instant.
 * Match the resolver's last eligible instant and recorded Power-scaled delta.
 * Complex riders keep the normal counter priority rather than a false proof.
 */
function counteredInstantHasNoBenefit(
  observation: ComputerObservation,
  counter: Extract<EffectDefinition, { type: "CANCEL_SPELL" }>,
  mode: CardPlayMode | undefined,
): boolean {
  const item = observation.state.stack?.at(-1);
  const pending = pendingAttackValues(observation);
  if (!item || !pending || pending.defender.controllerId !== observation.playerId) return false;
  const cards = balanceCardLibrary(observation.state as unknown as GameState, cardLibrary);
  const instant = [...(item.modifiers.cancellableSpellInstants ?? [])].reverse().find((entry) => {
    const spell = cards[entry.cardId];
    return entry.playerId !== observation.playerId && spell && cancelSpellAllowsSchoolAndLevel(counter,
      { schools: spell.spellSchools ?? [], level: spell.spellLevel }, mode ?? "basic");
  });
  const effect = instant ? cards[instant.cardId]?.effect : undefined;
  const record = [...(item.modifiers.powerScaledAttackInstants ?? [])].reverse()
    .find((entry) => entry.cardId === instant?.cardId);
  if (effect?.type !== "ADD_COMBAT_STAT" || effect.ignoreRangedPenalty || !record ||
      record.stat !== "attack" || record.appliedAmount < 0) return false;
  if (record.appliedAmount === 0) return true;
  // Only a plain melee exchange permits this lower-bound calculation.
  if (pending.attacker.type === "ranged" || pending.attacker.abilities.length ||
      pending.defender.abilities.length || pending.attacker.tokens?.length || pending.defender.tokens?.length ||
      pending.defender.defenseToken || pending.attacker.commanderSlug || pending.defender.commanderSlug || observation.state.activeEffects?.length ||
      item.modifiers.cultivationDefenseBonus ||
      item.modifiers.slayerRolls || item.modifiers.redirectedInstants?.length) return false;
  // A counter may combine with another defense/save; never discard that line.
  const furtherDefense = observation.legalActions.some(({ action }) => {
    if (action.type === "PLAY_REACTIONS" || action.type === "USE_HERO_SKILL_REACTION" ||
        action.type === "USE_ACTIVE_EFFECT") return true;
    if (action.type !== "PLAY_REACTION" || action.asPowerBoost) return false;
    const other = cards[action.cardId];
    const otherEffect = other ? primaryEffect(other, action.optionIndex) : undefined;
    return otherEffect && ((otherEffect.type === "ADD_COMBAT_STAT" && otherEffect.stat === "defense") ||
      (SAVE_EFFECTS.has(otherEffect.type) && otherEffect.type !== "CANCEL_SPELL"));
  });
  return !furtherDefense && pending.damage - record.appliedAmount - 1 >= unitRemovalHealth(pending.defender);
}

/** Scholar must buy a usable card, and must never retrieve another retriever. */
export function scholarRetrievalValue(cardId: string, observation: ComputerObservation): number {
  const state = observation.state as unknown as GameState;
  const card = balanceCardLibrary(state, cardLibrary)[cardId];
  if (!card || card.implementationStatus !== "implemented") return 0;
  const effects = card.effect.type === "CHOOSE_ONE" ? card.effect.options.map(option => option.effect) : [card.effect];
  if (effects.some(effect => effect.type === "TAKE_FROM_DISCARD")) return 0;
  const inCombat = Boolean(state.combat && !state.combat.prep && !state.combat.outcome);
  if (inCombat) {
    if (card.id === "ability.leadership") return 85;
    if (card.timing === "map" || effects.every(effect => MAP_ECONOMY_EFFECTS.has(effect.type) || MAP_SEARCH_EFFECTS.has(effect.type))) return 0;
    if (card.kind === "spell" && state.players[observation.playerId].combatStats.spellsCastThisRound >=
        spellLimitFor(state, state.players[observation.playerId])) return 15;
    // Tent/school swaps are useful only if they improve the occupied slot.
    if (card.permanent && permanentPlayScore(observation, card) < 300) return 0;
    return cardHandValue(cardId, observation);
  }
  if (cardId === "ability.estates" || cardId === "spell.view_air") return 150;
  if (cardId.includes("_of_legion")) return 145;
  return cardHandValue(cardId, observation);
}

function permanentUtility(observation: ComputerObservation, card: CardDefinition): number {
  const state = observation.state as unknown as GameState;
  const school = card.permanentEffect?.schoolBonus?.school;
  if (school) {
    const matching = readySpells(state, observation.playerId).filter(spell =>
      (!state.combat || spell.timing !== "map") &&
      (spell.spellSchools?.includes(school) || spell.spellSchools?.includes("any"))).length;
    return matching ? 95 + Math.min(45, matching * 15) : 10;
  }
  if (card.id === "war_machine.first_aid_tent") {
    const wounded = Object.values(state.combat?.units ?? {}).some(unit =>
      unit.controllerId === observation.playerId && unit.damage > 0 && unitRemainingHealth(unit) > 0);
    return wounded ? 130 : 80;
  }
  if (card.permanentEffect?.permanentLimitOverride) return 200;
  return cardKeepValue(card.id, observation);
}

function permanentPlayScore(observation: ComputerObservation, card: CardDefinition): number {
  const state = observation.state as unknown as GameState;
  const ids = getPermanentCardIds(state, observation.playerId);
  const isBallista = (id: string) => cardLibrary[id]?.permanentEffect?.roundStart?.kind === "damage-lowest-initiative";
  const slots = ids.filter(id => !isBallista(id)).length + Number(ids.some(isBallista));
  const addsSlot = !isBallista(card.id) || !ids.some(isBallista);
  const limit = Math.max(permanentLimitFor(state, observation.playerId), card.permanentEffect?.permanentLimitOverride ?? 1);
  const value = permanentUtility(observation, card);
  if (value < 30) return 180;
  if (addsSlot && slots >= limit) {
    const previous = balanceCardLibrary(state, cardLibrary)[ids[0]];
    if (previous && value <= permanentUtility(observation, previous) + 10) return 180;
    // Do not evict a capacity provider and cascade-discard other permanents.
    if (previous?.permanentEffect?.permanentLimitOverride && ids.length > 1) return 180;
  }
  return state.combat && !state.combat.prep ? 760 + Math.min(40, value / 4) : 1_015;
}

function scoreSaveReaction(
  observation: ComputerObservation,
  effect: EffectDefinition,
  mode: CardPlayMode | undefined,
): number {
  const ally = threatenedAllyBonus(observation);
  // Highest band: above PASS_REACTION (1_050). Prefer cancel-lethal slightly
  // over cancel-spell (a unit death is permanent this combat). Always play a
  // legal save — legal-actions only offers it when the situation applies.
  if (effect.type === "CANCEL_LETHAL_ATTACK") {
    return 1_160 + modeBonus(mode) + ally;
  }
  if (effect.type === "NEGATE_ATTACK") {
    return 1_150 + modeBonus(mode) + ally;
  }
  if (effect.type === "CANCEL_SPELL" || effect.type === "REDIRECT_SPELL") {
    if (effect.type === "CANCEL_SPELL" && counteredInstantHasNoBenefit(observation, effect, mode)) return 1_010;
    return 1_140 + modeBonus(mode);
  }
  if (effect.type === "INTERFERE_SPELL") {
    return 1_120 + modeBonus(mode);
  }
  return 1_110 + modeBonus(mode);
}

function scoreMapEconomy(
  observation: ComputerObservation,
  effect: EffectDefinition,
  base: number,
): number {
  if (effect.type === "GAIN_RESOURCES") {
    const gain = effect.gain ?? {};
    const gold = gain.gold ?? 0;
    const mats = gain.buildingMaterials ?? 0;
    const vals = gain.valuables ?? 0;
    const state = observation.state as unknown as GameState;
    const resources = state.players[observation.playerId]?.resources;
    const target = developmentResourceTargets(state, observation.playerId);
    const usefulGold = Math.min(gold, Math.max(0, target.gold - (resources?.gold ?? 0)));
    const usefulMats = Math.min(
      mats,
      Math.max(0, target.buildingMaterials - (resources?.buildingMaterials ?? 0)),
    );
    const usefulVals = Math.min(
      vals,
      Math.max(0, target.valuables - (resources?.valuables ?? 0)),
    );
    const planProgress = usefulGold * 8 + usefulMats * 28 + usefulVals * 45;
    const closesDevelopmentGoal =
      armyDevelopmentProfile(state, observation.playerId).phase !==
        "improve-army" &&
      (resources?.gold ?? 0) + gold >= target.gold &&
      (resources?.buildingMaterials ?? 0) + mats >= target.buildingMaterials &&
      (resources?.valuables ?? 0) + vals >= target.valuables;
    const goldCost = "goldCost" in effect ? (effect.goldCost ?? 0) : 0;
    return (
      base +
      gold * 3 +
      mats * 4 +
      vals * 8 +
      planProgress +
      (closesDevelopmentGoal ? 260 : 0) -
      goldCost * 5
    );
  }
  if (effect.type === "NECROMANCY_REINFORCE") {
    // The after-combat Necromancy window is now-or-never (legal-actions gates
    // every other map action behind it), and its freeze-proof exit
    // SKIP_NECROMANCY scores 1_120. Playing the held card must OUTRANK that
    // exit or the AI skips its own faction engine after every single win —
    // which is exactly what the old base+10 (~600) score did. Playing is
    // always safe: queueNecromancyReinforce pre-filters to affordable
    // reinforces and keeps the card when nothing is reinforced.
    const adventure = (observation.state as unknown as GameState).adventure;
    if (adventure?.pendingNecromancy?.playerId === observation.playerId) {
      return 1_140;
    }
    return base + 10;
  }
  if (effect.type === "DRAW_CARDS") {
    const handSize = observation.state.players[observation.playerId]?.hand.length ?? 0;
    // Draw aggressively into a thin hand, but do not burn a useful draw effect
    // merely to overfill an already healthy hand. Draw-rider-only combat loops
    // are caught earlier by their dedicated low score.
    return base + (handSize <= 2 ? 55 : handSize === 3 ? 30 : 10);
  }
  if (effect.type === "ADVANCE_EXPERIENCE") {
    return base + 25;
  }
  if (effect.type === "DIPLOMACY_SKIP_COMBAT" || effect.type === "DIPLOMACY_RECRUIT") {
    return base + 30;
  }
  if (effect.type === "GAIN_RECRUIT_DISCOUNT") {
    const state = observation.state as unknown as GameState;
    const savings = legionPurchaseSavings(state, observation.playerId, effect.amount, effect.valuables);
    return savings > 0 ? 1_065 + Math.min(20, savings) : 180;
  }
  return base + 10;
}

function scoreMapMovement(
  observation: ComputerObservation,
  effect: EffectDefinition,
  base: number,
): number {
  const state = observation.state as unknown as GameState;
  const hero = Object.values(state.heroes ?? {}).find(
    (h) => h.controllerId === observation.playerId && h.kind === "main",
  );
  const mp = hero?.movementPoints ?? 0;
  const hasObjective = hero
    ? collectMapObjectives(state, hero).length > 0
    : false;
  // Movement cards matter most when the hero is out (or nearly out) of MP but
  // still has work to do — never dump them while flush with movement.
  if (effect.type === "GAIN_HERO_MOVEMENT") {
    if (mp >= 3) return 280; // keep for later
    if (!hasObjective) return 280;
    if (mp === 0) return base + 165;
    return base + 20;
  }
  if (effect.type === "DIMENSION_DOOR" || effect.type === "TELEPORT_HERO_TO_TOWN") {
    return hasObjective && mp <= 1 ? base + 120 : 480;
  }
  if (effect.type === "VIEW_EARTH") {
    return base + 15;
  }
  if (effect.type === "CONTINUE_NEUTRAL_FREE") {
    // Free extra neutral round — take when offered.
    return 720;
  }
  return base;
}

function scoreEffect(
  observation: ComputerObservation,
  card: CardDefinition,
  mode: CardPlayMode | undefined,
  optionIndex: number | undefined,
  target: TargetRef | undefined,
  isReaction: boolean,
): number {
  const effect = primaryEffect(card, optionIndex);
  if (!effect) return 250;

  const state = observation.state as unknown as GameState;
  if (!isReaction) {
    if (effect.type === "DIPLOMACY_SKIP_COMBAT" || effect.type === "DIPLOMACY_EASE_BATTLE") return 1_080;
    if (card.id === "ability.scholar" && effect.type === "SCHOLAR_EMPOWER_SWAP") return 180;
    if (card.id === "ability.scholar" && effect.type === "TAKE_FROM_DISCARD") {
      const best = Math.max(0, ...(state.players[observation.playerId]?.discard ?? [])
        .map(id => scholarRetrievalValue(id, observation)));
      return best < 50 ? 180 : state.combat && !state.combat.prep ? 740 + Math.min(65, best / 2) : 1_050 + Math.min(20, best / 8);
    }
    if (card.id === "ability.luck") {
      const existing = state.activeEffects?.some(active => active.controllerId === observation.playerId &&
        active.source.type === "card" && active.source.cardId === card.id);
      if (existing) return 180;
      return mode === "expert" ? 1_020 : upcomingFight(observation) ? 180 : 580;
    }
    if (card.id === "ability.leadership") {
      return state.combat && !state.combat.prep ? mode === "expert" ? 810 : 660 : 180;
    }
    if (card.id === "ability.diplomacy" && effect.type === "DIPLOMACY_RECRUIT" && upcomingFight(observation)?.kind === "neutral") return 180;
    if (card.id === "spell.view_air" && effect.type === "GAIN_RESOURCES") {
      return effect.gain.gold ? 1_060 + effect.gain.gold : 500;
    }
    if (card.id.includes("_of_legion") && effect.type === "GAIN_RESOURCES" && effect.gain.gold &&
        saveLegionForAfterFight(observation)) return 180;
    if (card.id.includes("_of_legion") && effect.type === "GAIN_RECRUIT_DISCOUNT") {
      const goldAlternative = card.effect.type === "CHOOSE_ONE" ? Math.max(0, ...card.effect.options.map(option =>
        option.effect.type === "GAIN_RESOURCES" ? option.effect.gain.gold ?? 0 : 0)) : 0;
      const savings = legionPurchaseSavings(state, observation.playerId, effect.amount, effect.valuables);
      if (savings <= goldAlternative && !saveLegionForAfterFight(observation)) return 180;
    }
    if (card.id === "ability.eagle_eye" && effect.type === "EAGLE_EYE_DIG") return 1_055;
    if (card.id === "ability.pathfinding" && (cardValueContext(state, observation.playerId).ownHeroLevel ?? 1) < 3) return 180;
    if (effect.type === "ADD_SPELL_POWER" && !card.permanent &&
        !readySpells(state, observation.playerId).some(spell => state.combat ? spell.timing !== "map" : spell.timing === "map")) return 180;
  }

  if (SAVE_EFFECTS.has(effect.type)) {
    return scoreSaveReaction(observation, effect, mode);
  }

  if (STAT_COMBAT_EFFECTS.has(effect.type) && isReaction) {
    return scoreStatReaction(observation, card, mode, effect);
  }

  if (COMBAT_DAMAGE_EFFECTS.has(effect.type)) {
    return scoreDamageEffect(
      observation,
      card,
      effect,
      target,
      680 + modeBonus(mode),
    );
  }

  // A medic heal instant played OUTSIDE combat is the map draw-only play (Rion's
  // Battlefield Medic, Astra's Cure I and their rethemed clones): there is no
  // unit to mend, so it is pure card cycling. Scored well below the map
  // economy/search families so a Rion/Aoko/Sirius/Molian seat never dumps the
  // specialty it wants for a combat heal just to draw one card.
  if (
    !observation.state.combat &&
    (effect.type === "HEAL_DAMAGE" || effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS") &&
    effect.drawCards
  ) {
    return 300;
  }

  // In combat, a draw-rider heal with no wound and no Paralysis to clear is
  // pure card cycling. It must sit below END_ACTIVATION or two draw riders can
  // repeatedly draw and replay each other forever (Rion IV ↔ Sorcery was the
  // concrete diverse-simulation case).
  if (
    observation.state.combat &&
    (effect.type === "HEAL_DAMAGE" || effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS")
  ) {
    const patient = combatUnitFromTarget(observation, target);
    if (patient) {
      const missing = patient.maxHealth - unitRemainingHealth(patient);
      const paralyzed = (patient.tokens ?? []).some((token) => token.kind === "paralysis");
      const clearsParalysis = "removeParalysis" in effect && Boolean(effect.removeParalysis);
      if (missing <= 0 && !(clearsParalysis && paralyzed)) return 180;
      return 660 + Math.min(45, missing * 10) + (paralyzed && clearsParalysis ? 55 : 0);
    }
  }

  if (COMBAT_BUFF_EFFECTS.has(effect.type)) {
    return scoreBuffTarget(observation, target, 660 + modeBonus(mode));
  }

  if (COMBAT_DEBUFF_EFFECTS.has(effect.type)) {
    // Action-denial is tempo, not just a stat shave: stealing a whole
    // activation (Blind's Paralysis, activation skips) or turning a unit on
    // its own side (Berserk) is worth far more against a scary enemy than a
    // generic debuff — scale hard with the victim's threat so the most
    // dangerous unit is shut down first. Removal (lethal damage ≥ 780) still
    // outranks denial.
    if (TEMPO_DENIAL_EFFECTS.has(effect.type)) {
      const victim = combatUnitFromTarget(observation, target);
      if (victim && victim.controllerId !== observation.playerId) {
        return (
          700 +
          modeBonus(mode) +
          Math.min(80, Math.round((unitThreatValue(victim) * 2) / 3))
        );
      }
    }
    return scoreBuffTarget(observation, target, 650 + modeBonus(mode));
  }

  if (effect.type === "ENTER_PLAY" || card.permanent) {
    return permanentPlayScore(observation, card);
  }

  if (STAT_COMBAT_EFFECTS.has(effect.type)) {
    // On-activation Offense/Armorer/Sorcery (draw-only or with stack).
    if (effect.type === "ADD_SPELL_POWER") {
      return 700 + modeBonus(mode);
    }
    if (effect.type === "ADD_COMBAT_STAT") {
      return 690 + modeBonus(mode);
    }
    return 650 + modeBonus(mode);
  }

  // Scholar's useful combat recovery and Leadership are handled above. Other
  // pure map economy/search cards stay below END_ACTIVATION; movement effects
  // such as CONTINUE_NEUTRAL_FREE keep their combat continuation value.
  const inCombatActivation =
    Boolean(observation.state.combat && !observation.state.combat.outcome) &&
    !isReaction;
  if (
    inCombatActivation &&
    (MAP_ECONOMY_EFFECTS.has(effect.type) || MAP_SEARCH_EFFECTS.has(effect.type))
  ) {
    return 120;
  }

  if (MAP_MOVEMENT_EFFECTS.has(effect.type)) {
    return scoreMapMovement(observation, effect, 600);
  }

  if (MAP_SEARCH_EFFECTS.has(effect.type)) {
    const hand = observation.state.players[observation.playerId]?.hand ?? [];
    const usefulHeld = hand.filter(
      (cardId) => cardKeepValue(cardId, observation) >= 55,
    ).length;
    const depth =
      "count" in effect && typeof effect.count === "number"
        ? effect.count
        : 1;
    return (
      610 +
      modeBonus(mode) +
      Math.min(32, depth * 8) +
      (hand.length <= 2 ? 20 : 0) +
      (usefulHeld === 0 ? 15 : 0)
    );
  }

  if (MAP_ECONOMY_EFFECTS.has(effect.type)) {
    const resolvedEffect = effect.type === "GAIN_RESOURCES" && mode === "expert" && effect.expertGain
      ? { ...effect, gain: effect.expertGain } : effect;
    // Estates leads the economy band, but scoreMapEconomy's additive bonuses
    // (gold, plan progress, goal-closing +260) were calibrated on a 590 base:
    // uncapped it would preempt mandatory picks (1_100+) and save reactions.
    return card.id === "ability.estates"
      ? Math.min(1_075, scoreMapEconomy(observation, resolvedEffect, 1_050 + modeBonus(mode)))
      : scoreMapEconomy(observation, resolvedEffect, 590 + modeBonus(mode));
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return 630 + modeBonus(mode);
  }

  if (effect.type === "TRANSFORM_UNIT") {
    return 720 + modeBonus(mode);
  }

  if (effect.type === "RANDOM_ENEMY_DISCARD" || effect.type === "ENEMY_MORALE_STRIP") {
    return 580;
  }

  // Permanent gear packages (WOG commander artifacts / anime equipment / Merit
  // training manuals): legal-actions already gates slot empty / module on, so
  // a legal play is a free permanent combat package — take it above END_TURN
  // and residual map junk, below recruit/build (~850+).
  if (effect.type === "BIND_COMMANDER_ARTIFACT") {
    return 810 + modeBonus(mode);
  }
  if (effect.type === "EQUIP_HERO_EQUIPMENT") {
    return 790 + modeBonus(mode);
  }
  if (effect.type === "GAIN_GRADE_PROGRESS") {
    const amount = typeof effect.amount === "number" ? effect.amount : 1;
    return 740 + Math.min(40, amount * 8) + modeBonus(mode);
  }

  // Unknown / residual implemented effects: mild positive on the map so they
  // can still fire when nothing better is available — but NEVER auto-play an
  // unrecognised reaction over PASS (1_050). Only the save/stat families above
  // deliberately outrank PASS; everything else waits for a better window.
  if (card.implementationStatus === "implemented") {
    return isReaction ? 900 : 520;
  }
  return 200;
}

/**
 * What one more +1 Power actually buys on the pending damage cast (the stack
 * top). Read from the SAME public inputs the engine resolves with: the spell's
 * printed ladder (amountByPower / dice rollsByPower) and the stack item's
 * accumulated Power modifiers. Returns null when the pending item is not a
 * damage cast at an enemy unit (buff ladders etc. keep the generic heuristic).
 */
function pendingSpellBoostImpact(
  observation: ComputerObservation,
  boost = 1,
): "lethal-already" | "no-ladder-step" | "kills" | "chips" | null {
  const combat = observation.state.combat;
  const top = observation.state.stack?.at(-1);
  if (!combat || !top || top.action.type !== "CAST_SPELL") return null;
  const publicState = observation.state as unknown as GameState;
  const cards = balanceCardLibrary(publicState, cardLibrary);
  const spell = cards[top.action.cardId];
  const target = top.action.target;
  if (!spell || !target || target.type !== "unit") return null;
  if (!COMBAT_DAMAGE_EFFECTS.has(spell.effect.type)) return null;
  const defender = combat.units[target.unitId];
  if (!defender || defender.controllerId === observation.playerId) return null;
  // This read uses public power sources/modifiers, not hidden draw piles. Keep
  // the redacted object; the engine helper's broader signature needs the cast.
  const power = resolvedSpellPowerForStackItem(publicState, top, cards);
  const boostedPower = resolvedSpellPowerForStackItem(publicState, {
    ...top,
    modifiers: { ...top.modifiers, spellPowerBonus: top.modifiers.spellPowerBonus + boost },
  }, cards);
  // Dice-roll spells (Inferno, Slayer): the ladder is the DICE count.
  const diceNow = getSpellDiceRollCount(spell, power);
  if (diceNow !== null) {
    const diceBoosted = getSpellDiceRollCount(spell, boostedPower) ?? diceNow;
    return diceBoosted > diceNow ? "chips" : "no-ladder-step";
  }
  // The scalar helper does not model chains, splashes or secondary effects.
  // Unknown marginal value is not evidence that their Power is worthless.
  if (spell.effect.type !== "DEAL_DAMAGE") return null;
  const now = previewSpellDamage(publicState, defender, spell, getSpellDamageAmount(spell, power));
  const boosted = previewSpellDamage(publicState, defender, spell, getSpellDamageAmount(spell, boostedPower));
  const remaining = unitRemovalHealth(defender);
  if (now > 0 && now >= remaining) return "lethal-already";
  if (boosted <= now) return "no-ladder-step";
  return boosted >= remaining ? "kills" : "chips";
}

/**
 * Discarding a spell for +1 Power is only legal in a Power-paying window.
 * NEVER burn a save / high-value combat card for +1 Power — keep those for
 * their printed effect. "Correct Power" discipline: when the pending cast is a
 * damage spell, pay only Power that changes the outcome — stop once the hit is
 * already lethal, refuse a +1 that does not move the printed ladder, and pay
 * up eagerly when one more Power turns the cast into a removal.
 */
/**
 * Armoured neutral guards the dice barely scratch — Ogres, Gorgons, Dendroids,
 * Minotaurs, Crusaders (all Defense 2), and any neutral whose Defense leaves our best physical hit at one
 * point. User ruling (2026-09-14): a damage spell is THE answer to these, so
 * Power is poured into it up to the kill ("not over the limit"), not rationed.
 */
const ARMOURED_NEUTRAL_GUARDS = new Set(["ogres", "gorgons", "dendroids", "minotaurs", "crusaders", "mummies"]);
function armouredNeutralTarget(observation: ComputerObservation): boolean {
  const combat = observation.state.combat;
  const top = observation.state.stack?.at(-1);
  if (!combat || !top || top.action.type !== "CAST_SPELL") return false;
  const target = top.action.target;
  if (!target || target.type !== "unit") return false;
  const defender = combat.units[target.unitId];
  if (!defender || defender.controllerId !== NEUTRAL_PLAYER_ID) return false;
  const baseName = (defender.unitDefId ?? "").replace(/^[a-z_]+\./, "");
  if (ARMOURED_NEUTRAL_GUARDS.has(baseName)) return true;
  const bestPhysical = Object.values(combat.units).reduce((best, unit) =>
    unit.controllerId === observation.playerId && unitRemainingHealth(unit) > 0
      ? Math.max(best, expectedAttackDamage(unit, defender)) : best, 0);
  return defender.defense >= 2 && bestPhysical <= 1;
}

/** Reserve cards only with a clear surplus and no endangered body, including
 * the next activation cycle. A +1 enemy die is a risk bound, not an RNG peek.
 * Unknown caster output, stacked guards and wounded allies disable this extra
 * conservation; the established neutral spending policy then decides. */
function neutralFightAllowsCardReserve(observation: ComputerObservation): boolean {
  const combat = observation.state.combat;
  if (!combat || combat.context.kind !== "neutral") return false;
  const living = Object.values(combat.units).filter(unit => unit.position >= 0 && unitRemainingHealth(unit) > 0);
  const own = living.filter(unit => unit.controllerId === observation.playerId);
  const enemies = living.filter(unit => unit.controllerId !== observation.playerId);
  if (!own.length || !enemies.length || own.some(unit => unit.damage > 0) ||
      enemies.some(unit => unit.stackToken || hasThreatAbility(unit) || hasOutputAbility(unit))) return false;
  if (own.reduce((sum, unit) => sum + unitThreatValue(unit), 0) <
      enemies.reduce((sum, unit) => sum + unitThreatValue(unit), 0) * 1.5) return false;
  const nextRound = { ...combat, units: { ...combat.units } };
  for (const enemy of enemies) nextRound.units[enemy.id] = {
    ...enemy, attack: enemy.attack + 1, activatedThisRound: false,
    attackedThisActivation: false, movedThisActivation: false,
    tokens: (enemy.tokens ?? []).filter(token => token.kind !== "paralysis"),
  };
  return own.every(unit => coordinatedReplyDamage(nextRound, unit, unit.position, undefined,
    observation.state as unknown as GameState) + 1 < unitRemainingHealth(unit));
}

function asPowerBoostScore(
  observation: ComputerObservation,
  cardId: string,
): number {
  if (pendingViewAirGold(observation)) return 180;
  const card = cardLibrary[cardId];
  if (!card) return 900;
  const effect = primaryEffect(card);
  if (effect && SAVE_EFFECTS.has(effect.type)) {
    // Well below PASS_REACTION (1_050) — never power-boost with a save.
    return 200;
  }
  const impact = pendingSpellBoostImpact(observation);
  if (impact === "lethal-already" || impact === "no-ladder-step") {
    // Below PASS — the card buys nothing on this cast; hold it.
    return 320;
  }
  const keep = cardKeepValue(cardId, observation);
  // An approaching player still matters while clearing a neutral guard.
  // Keep valuable combat tools for that fight instead of burning them for
  // incremental neutral damage. Cheap fuel and immediate removals still pay.
  if (impact === "chips" && neutralFightAllowsCardReserve(observation) &&
      nearbyPlayerFight(observation) && card.timing !== "map" &&
      (keep >= 55 || card.statisticType === "attack" || card.statisticType === "defense")) return 940;
  if (impact === "chips" && armouredNeutralTarget(observation)) {
    // Every Power point that still moves the ladder goes in against an
    // armoured guard. Only another real damage spell stays for its own cast.
    if (effect && COMBAT_DAMAGE_EFFECTS.has(effect.type)) return 980;
    return 1_095 - Math.min(30, Math.floor(keep / 2));
  }
  if (impact === "kills") {
    // One more Power converts the cast into a removal: worth any low/mid-CLASS
    // card. High-value artifacts/expert spells still stay in hand (940 < PASS).
    // The hold-gate deliberately ignores the tier layer (class value only): an
    // S-tier staple such as Magic Arrow must still buy the kill when it is the
    // only fuel — the list itself calls the arrow the fuel of choice. The tier
    // still orders WHICH burnable card goes first (D burns before S below).
    const classKeep =
      keep -
      cardTierValue(
        cardId,
        cardValueContext(observation.state, observation.playerId),
      );
    return classKeep >= 55 ? 940 : 1_150 - Math.min(30, Math.floor(keep / 2));
  }
  if (effect && COMBAT_DAMAGE_EFFECTS.has(effect.type)) {
    // Keep real damage spells for casting; mild boost only as last resort.
    return 980;
  }
  // High-value artifacts/spells: do not discard for +1 Power (below PASS).
  if (keep >= 55) {
    return 940;
  }
  // Junk / low-value spells: take the +1 Power over PASS so the cast scales.
  return 1_095 - Math.min(30, Math.floor(keep / 2));
}

function discardCostPenalty(
  observation: ComputerObservation,
  cardIds: readonly string[] | undefined,
): number {
  if (!cardIds?.length) return 0;
  return Math.min(
    150,
    Math.round(
      [...new Set(cardIds)].reduce(
        // Tier-aware: paying a cost with a D-tier situational (Earthquake)
        // penalizes less than burning an S-tier staple, so the cheaper-fuel
        // action variant wins.
        (sum, cardId) => sum + cardKeepValue(cardId, observation) * 0.45,
        0,
      ),
    ),
  );
}

/** Crowns (expert uses) this seat still has this round — own-seat fields only. */
export function crownsAvailable(observation: ComputerObservation): number {
  const player = observation.state.players[observation.playerId];
  if (!player?.limits) return 2;
  return (
    player.limits.expertUses +
    (player.combatStats?.expertUseBonusThisRound ?? 0) -
    (player.combatStats?.expertUsesSpentThisRound ?? 0)
  );
}

/**
 * Whether spending a crown on this expert play is worth it. Combat-impact
 * families always are — the expert side is only offered when legal and the
 * open window IS the moment. Map conveniences (a bigger search, +gold) are not
 * worth the LAST crown of the round: a fight later this round wants an expert
 * save/stat reaction far more than a map search wants its bonus card, so with
 * one crown left the basic twin wins. (Crown-free Empowered expert plays lose
 * nothing either way — the nudge only orders basic vs expert twins.)
 */
function expertCrownNudge(
  observation: ComputerObservation,
  card: CardDefinition,
  optionIndex: number | undefined,
): number {
  if (card.id === "ability.estates" || card.id === "ability.luck" || card.id === "ability.leadership") return 35;
  const effect = primaryEffect(card, optionIndex);
  if (effect?.type === "NECROMANCY_REINFORCE") {
    const state = observation.state as unknown as GameState;
    const player = state.players[observation.playerId];
    const goldUpgrade = effect.forceMode !== "basic" && player.army.some(unit => {
      if (unit.side !== "few" || !["gold", "azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier)) return false;
      const cost = reinforceCostFor(state, observation.playerId, unit.id, false, true, true);
      return cost && player.resources.gold >= (cost.gold ?? 0) &&
        player.resources.buildingMaterials >= (cost.buildingMaterials ?? 0) &&
        player.resources.valuables >= (cost.valuables ?? 0);
    });
    // This crown unlocks a real Gold upgrade in the expiring victory window.
    // Basic cannot upgrade Gold; saving the last crown would waste the win.
    return goldUpgrade ? 45 : -30;
  }
  const combatImpact =
    effect &&
    (SAVE_EFFECTS.has(effect.type) ||
      COMBAT_DAMAGE_EFFECTS.has(effect.type) ||
      COMBAT_BUFF_EFFECTS.has(effect.type) ||
      COMBAT_DEBUFF_EFFECTS.has(effect.type) ||
      STAT_COMBAT_EFFECTS.has(effect.type));
  if (combatImpact) return 12;
  return crownsAvailable(observation) >= 2 ? 12 : -30;
}

function pendingViewAirGold(observation: ComputerObservation): boolean {
  const action = observation.state.stack?.at(-1)?.action;
  if (action?.type !== "CAST_SPELL" || action.cardId !== "spell.view_air") return false;
  const card = balanceCardLibrary(observation.state as unknown as GameState, cardLibrary)[action.cardId];
  const effect = card && primaryEffect(card, action.optionIndex);
  return effect?.type === "GAIN_RESOURCES" && (effect.gain.gold ?? 0) > 0;
}

function pendingAttackValues(observation: ComputerObservation) {
  const combat = observation.state.combat;
  const item = observation.state.stack?.at(-1);
  if (
    !combat ||
    !item ||
    (item.action.type !== "ATTACK_UNIT" &&
      item.action.type !== "MOVE_AND_ATTACK_UNIT")
  ) {
    return null;
  }
  const attacker = combat.units[item.action.attackerId];
  const defender = combat.units[item.action.defenderId];
  if (!attacker || !defender) return null;
  const attackValue = attacker.attack + (item.modifiers.attackBonus ?? 0);
  // Elemental strikes ignore printed Defense AND every Defense card played.
  const elemental = dealsElementalStrike(attacker);
  const defenseValue = elemental ? 0 : defender.defense + (item.modifiers.defenseBonus ?? 0);
  return {
    attacker,
    defender,
    damage: Math.max(0, attackValue - defenseValue),
    elemental,
  };
}

function marginalAttackModifierScore(
  observation: ComputerObservation,
  boost: "attack" | "defense",
  free: boolean,
): number {
  const pending = pendingAttackValues(observation);
  if (!pending) return 1_020;
  const { attacker, defender, damage, elemental } = pending;
  if (boost === "attack") {
    if (attacker.controllerId !== observation.playerId) return 900;
    const remaining = unitRemainingHealth(defender);
    if (damage < remaining && damage + 1 >= remaining) return 1_155;
    if (damage === 0) return 1_105;
    // An Elemental cannot be defended against and (Magic Arrow-immune) cannot
    // be burned down by the Arrow either: Attack cards are the tool against it.
    if (unitThreatValue(defender) >= 30 || dealsElementalStrike(defender)) return free ? 1_080 : 1_060;
    return free ? 1_060 : 1_030;
  }
  if (defender.controllerId !== observation.playerId) return 900;
  // A Defense card against an elemental strike changes nothing (the resolver
  // ignores Defense cards too): keep it for a hit it can actually reduce.
  if (elemental) return 300;
  const remaining = unitRemainingHealth(defender);
  const nextDamage = Math.max(0, damage - 1);
  if (damage >= remaining && nextDamage < remaining) return 1_165;
  if (damage > 0 && unitThreatValue(defender) >= 25) return free ? 1_095 : 1_075;
  return free ? 1_060 : 1_030;
}

/**
 * Strategic score for card / spell / reaction plays. Returns null for actions
 * this module does not handle.
 */
export function scoreCardAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  switch (action.type) {
    case "PLAY_CARD":
    case "CAST_SPELL":
    case "PLAY_REACTION": {
      const card = balanceCardLibrary(observation.state as unknown as GameState, cardLibrary)[action.cardId];
      if (!card) {
        return { score: 250, policy: "card.unknown" };
      }

      if (action.type === "PLAY_REACTION" && action.asPowerBoost) {
        return {
          score: asPowerBoostScore(observation, action.cardId),
          policy: "card.power-boost",
        };
      }

      // A draw-rider-only play resolves NOTHING but "draw N": scoring it by the
      // primary effect would value a medic's drawOnly as a save-tier heal (and
      // a stat rider as a stat reaction), making the AI dump the card it wants
      // for a real play later. Score it as the pure card-cycle it is — the same
      // deliberately-low band as the medic map draw-only play (~300), so a real
      // in-combat use always outranks it.
      if ((action.type === "PLAY_CARD" || action.type === "PLAY_REACTION") && action.drawOnly) {
        // On the MAP a pure cycle must sit strictly BELOW END_TURN (300): tied
        // at 300 it could win the tie-break and, with a deck of nothing but
        // draw riders, replay itself through the reshuffled discard forever
        // (the seed "measure-f" 256-action stall, 2026-09-04).
        return observation.state.combat
          ? { score: 300, policy: "card.draw-rider-only" }
          : { score: 290, policy: "card.draw-rider-only" };
      }

      // Sorcery-style activation play banks Power for the next Spell and draws
      // a card. Once Power is already banked, replaying another copy is mostly
      // a cycle and can alternate forever with another draw-rider card. Hold it
      // below END_ACTIVATION; the bank clears after the intended Spell or when
      // this activation ends. The MAP twin is `player.mapSpellPowerBank` (the
      // whole bank feeds the next map Power-tier cast and a hero MOVE clears
      // it): with Power already banked, Sorcery / Scales / Armor of Wonder
      // cycled each other through a three-card deck for 256 actions (seed
      // "measure-f", 2026-09-04) — hold the replay below END_TURN (300) too.
      const optionIndex = "optionIndex" in action ? action.optionIndex : undefined;
      const actionEffect = primaryEffect(card, optionIndex);
      const actor = observation.state.players[observation.playerId];
      const powerAlreadyBanked = observation.state.combat
        ? (actor?.combatStats?.pendingDrawRiderSpellPower ?? 0) > 0
        : (actor?.mapSpellPowerBank ?? 0) > 0;
      if (action.type === "PLAY_REACTION") {
        const pending = pendingAttackValues(observation);
        if (
          pending?.defender.controllerId === observation.playerId &&
          pending.attacker.abilities?.some((abilityId) =>
            abilityId === "fuyuki-caster-fixed-2" || abilityId === "fuyuki-caster-fixed-3"
          )
        ) {
          return { score: -1000, policy: "card.hold-defense-vs-fixed-medea" };
        }
      }
      if (
        action.type === "PLAY_CARD" &&
        actionEffect?.type === "ADD_SPELL_POWER" &&
        actionEffect.drawCards &&
        powerAlreadyBanked
      ) {
        return { score: 180, policy: "card.hold-draw-rider-cycle" };
      }

      const mode = "mode" in action ? action.mode : undefined;
      const target = "target" in action ? action.target : undefined;
      const isReaction = action.type === "PLAY_REACTION";
      let score = scoreEffect(
        observation,
        card,
        mode,
        optionIndex,
        target,
        isReaction,
      );

      // Expert mode (already crown-gated by legal-actions) is strictly better
      // for damage / buff ladders — nudge so expert wins over its basic twin,
      // EXCEPT when it would burn the round's last crown on a map convenience.
      if (mode === "expert") {
        score += expertCrownNudge(observation, card, optionIndex);
      }
      if (isReaction && mode === "expert" && observation.state.combat) {
        const state = observation.state as unknown as GameState;
        const player = state.players[observation.playerId];
        const recall = balanceCardLibrary(state, cardLibrary)[action.cardId]?.effect;
        // Keep crown-free/empowered modes and enhanced Mysticism retrieval.
        // Only defer a paid extra-limit upgrade when basic is offered and the
        // current limit already leaves a cast. Stay outside learned tie range.
        if (recall?.type === "RECALL_SPELL" && recall.expertSpellLimitBonus && !recall.expertRecallPlayedCards &&
            player && !abilityExpertIsCrownFree(player, action.cardId) &&
            player.combatStats.spellsCastThisRound < spellLimitFor(state, player) &&
            !knowledgeExtraCastUseful(observation) &&
            observation.legalActions.some(({ action: candidate }) => candidate.type === "PLAY_REACTION" &&
              candidate.cardId === action.cardId && candidate.mode !== "expert" && !candidate.asPowerBoost)) {
          return { score: 1_020, policy: "card.recall-preserve-crown" };
        }
      }

      score -= discardCostPenalty(
        observation,
        "costCardIds" in action ? action.costCardIds : undefined,
      );

      const policy =
        action.type === "CAST_SPELL"
          ? "card.cast-spell"
          : isReaction
            ? "card.play-reaction"
            : card.kind === "artifact"
              ? "card.play-artifact"
              : card.kind === "ability"
                ? "card.play-ability"
                : "card.play-card";

      return { score, policy };
    }
    case "PLAY_REACTIONS": {
      // Batch reaction path — score by the first play's card quality.
      const first = action.plays?.[0];
      if (!first) return { score: 250, policy: "card.batch-empty" };
      const card = cardLibrary[first.cardId];
      if (!card) return { score: 250, policy: "card.unknown" };
      const effect = primaryEffect(card, first.optionIndex);
      if (effect && SAVE_EFFECTS.has(effect.type)) {
        return {
          score: scoreSaveReaction(observation, effect, first.mode),
          policy: "card.batch-save",
        };
      }
      if (effect && STAT_COMBAT_EFFECTS.has(effect.type)) {
        return {
          score: scoreStatReaction(observation, card, first.mode, effect),
          policy: "card.batch-stat",
        };
      }
      return {
        score:
          1_080 -
          action.plays.reduce(
            (sum, play) => sum + discardCostPenalty(observation, play.costCardIds),
            0,
          ),
        policy: "card.batch-reaction",
      };
    }
    case "USE_ACTIVE_EFFECT": {
      const target = combatUnitFromTarget(observation, action.target);
      const combat = observation.state.combat;
      if (!target || !combat) {
        return { score: 620, policy: "card.use-active-effect" };
      }
      const remaining = unitRemainingHealth(target);
      // Stack layers are future health bars, not healing on the current bar.
      const missingHealth = Math.max(0, target.damage);
      const threat = unitThreatValue(target);
      const effect = observation.state.activeEffects?.find(
        (candidate) => candidate.id === action.effectId,
      );
      const expertContinuation = Boolean(
        effect?.healRound?.expert &&
          effect.healRound.round === observation.state.combat?.round,
      );
      const inReactionWindow = Boolean(observation.state.reactionWindow);

      // Danger includes legal move-and-attacks, blocked shooters and paralysis.
      // A wounded body under a LETHAL threat
      // is the whole point of the Tent — save it; one merely under some threat
      // is worth mending; a safe unit is not urgent.
      const incoming = combat.context.kind === "player"
        ? coordinatedReplyDamage(combat, target, target.position, undefined,
          observation.state as unknown as GameState)
        : pendingIncomingDamage(combat, observation.playerId, target);

      // Efficiency (the First Aid Tent's once-per-round heal is a scarce charge):
      // a safe, barely-scratched, low-value body is NOT worth spending it on.
      // Hold the charge — score below the passive exits (END_ACTIVATION = 400 /
      // PASS_REACTION) so the AI does something real, or PASSes, instead. An
      // already-paid expert volley always continues.
      const worthwhile =
        missingHealth >= 2 || incoming > 0 || threat >= 25;
      if (!expertContinuation && action.mode !== "expert" && !worthwhile) {
        return { score: HOLD_FIRST_AID_SCORE, policy: "card.hold-first-aid" };
      }

      // Value-first target ranking (tier-weighted via `unitThreatValue`), with a
      // danger bonus so a threatened valuable unit outranks topping up safe
      // chaff. The old score lost to PASS_REACTION, so the AI owned the Tent but
      // never used it at the moment it could save a unit.
      const dangerBonus = incoming >= remaining ? 60 : incoming > 0 ? 25 : 0;
      let score =
        (inReactionWindow ? 1_080 : 640) +
        Math.min(30, missingHealth * 8) +
        Math.min(40, Math.round(threat / 3)) +
        dangerBonus;
      if (expertContinuation) {
        score += 25;
      } else if (action.mode === "expert") {
        // Do not spend a crown to heal a single scratch; basic wins that tie.
        score += missingHealth >= 2 ? 18 : -25;
      }
      return { score, policy: "card.use-active-effect-smart-target" };
    }
    case "SPEND_MORALE": {
      // Combat morale spends beat PASS. Prefer +Defense when a living ally is
      // under lethal pressure; +Attack / generic combat-bonus still high; token
      // cleanse when any own unit carries a negative combat token.
      if (action.benefit === "remove-token") {
        const combat = observation.state.combat;
        const allyHasNegative = combat
          ? Object.values(combat.units).some(
              (unit) =>
                unit.controllerId === observation.playerId &&
                unitRemainingHealth(unit) > 0 &&
                (unit.tokens ?? []).some((token) =>
                  token.kind === "weakness" ||
                  token.kind === "corrosion" ||
                  token.kind === "paralysis",
                ),
            )
          : false;
        return {
          score: allyHasNegative ? 1_100 : 1_070,
          policy: "card.spend-morale-remove-token",
        };
      }
      if (action.benefit === "combat-bonus") {
        const combat = observation.state.combat;
        let underFire = false;
        if (combat) {
          for (const unit of Object.values(combat.units)) {
            if (
              unit.controllerId !== observation.playerId ||
              unitRemainingHealth(unit) <= 0
            ) {
              continue;
            }
            const incoming = pendingIncomingDamage(
              combat,
              observation.playerId,
              unit,
            );
            if (incoming >= unitRemainingHealth(unit)) {
              underFire = true;
              break;
            }
          }
        }
        // Prefer spend when an ally is under lethal pressure; still always beat PASS.
        return {
          score: underFire ? 1_105 : 1_085,
          policy: "card.spend-morale-combat-bonus",
        };
      }
      if (action.benefit === "redraw") {
        return { score: 560, policy: "card.spend-morale-redraw" };
      }
      if (action.benefit === "repeat-search") {
        // Discard a junk Search reveal and re-run — strong when offered.
        return { score: 1_150, policy: "card.spend-morale-repeat-search" };
      }
      // "draw" — free card, good on map.
      return { score: 600, policy: "card.spend-morale-draw" };
    }
    case "USE_ABILITY_EMPOWER_TOKEN":
      // Permanent free Expert on a hand Ability — always worth taking.
      return { score: 720, policy: "card.use-ability-empower-token" };
    case "USE_UNIT_RESURRECTION":
      // Archangel-style lethal save ability — always take over PASS.
      return { score: 1_170, policy: "card.unit-resurrection" };
    case "USE_COMMANDER_CAST_REACTION":
      // Shield / Stone Skin reaction — buff defense before the hit.
      return { score: 1_130, policy: "card.commander-defense-reaction" };
    case "USE_HERO_SKILL_REACTION":
      // Anime Hero Grades Battle Focus / Iron Will (§3.11): a free once-per-combat
      // +Attack (your attack) / +Defense (incoming hit). Scored above PASS_REACTION
      // (1050) so the AI spends it rather than hoarding it — a simple "use it" policy.
      return { score: 1_080, policy: "card.hero-skill-reaction" };
    case "USE_UNIT_MAGIC_MIRROR":
      return { score: 1_155, policy: "combat.use-innate-magic-mirror" };
    case "USE_UNIT_DIE_IGNORE": {
      const defender = observation.state.combat?.units[action.defenderUnitId];
      const pending = pendingAttackValues(observation);
      const trigger = observation.state.reactionWindow?.triggerEvent;
      const roll = trigger?.type === "ATTACK_DIE_SETTLED" ? trigger.roll : 0;
      let marginal = 1_015;
      if (pending && defender) {
        const withoutDie = pending.damage;
        const withDie = withoutDie + Math.max(0, roll);
        const remaining = unitRemainingHealth(defender);
        if (withDie >= remaining && withoutDie < remaining) {
          // The discarded card preserves an entire stack.
          marginal = 1_190;
        } else if (withDie > withoutDie && unitThreatValue(defender) >= 25) {
          marginal = 1_115;
        } else if (withDie > withoutDie) {
          marginal = 1_060;
        }
      }
      // No `discardCardId` = the Community Balance Change's FREE Parry
      // (`halberdier-die-ignore-free`): there is no card to weigh, so the ignore
      // costs nothing and scores at its full marginal value.
      const discardKeep = action.discardCardId ? cardKeepValue(action.discardCardId, observation) : 0;
      const score = marginal - Math.round(discardKeep * 0.35);
      return { score, policy: "combat.discard-to-ignore-positive-die" };
    }
    case "USE_SCHOOL_FETCH_EXPERT":
      return { score: 1_125, policy: "card.use-school-expert-power" };
    case "USE_SCHOOL_PERMANENT_EXPERT": {
      // Committing (permanently discarding) an in-play School permanent is a
      // gamble: the +3 pays off only if the AI then PLAYS the enabled Spell,
      // and most reaction plays score below Pass — so outside the lethal-save
      // window (where the follow-up Resurrection is the point) the AI keeps
      // its permanent: a standing +1 forever beats a one-window +3 it would
      // usually let expire. The fetch twin above keeps its high score because
      // it is only offered with a guaranteed payoff already on the attack.
      const lethalWindow = observation.state.reactionWindow?.triggerEvent.type === "UNIT_LETHAL_HIT";
      return {
        score: lethalWindow ? 1_125 : 990,
        policy: "card.use-school-expert-power"
      };
    }
    case "HALL_OF_VALHALLA_BOOST":
      return {
        score: marginalAttackModifierScore(observation, "attack", true),
        policy: "town.use-free-attack-boost",
      };
    case "SPEND_TOWN_CUBE":
      return {
        score: action.boost
          ? marginalAttackModifierScore(observation, action.boost, false)
          : 1_085,
        policy: action.boost
          ? "town.spend-cube-for-decisive-combat-point"
          : "town.spend-cube-for-spell-power",
      };
    case "CONVERT_CARD_TO_ATTACK":
      return {
        score:
          marginalAttackModifierScore(observation, "attack", false) -
          Math.round(cardKeepValue(action.cardId, observation) * 0.65),
        policy: "card.convert-low-value-card-to-attack",
      };
    default:
      return null;
  }
}
