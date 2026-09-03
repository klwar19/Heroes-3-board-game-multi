import { cardLibrary } from "@/data/cards/library";
import { unitAbilities } from "@/data/units/abilities";
import {
  getBattlefieldCoordinates,
  getOrthogonalNeighbors,
} from "../battlefield";
import { getSpellDamageAmount, getSpellDiceRollCount } from "../effects";
import { houseRuleEnabled } from "../house-rules";
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
import {
  expectedAttackDamage,
  livingEnemyUnits,
  pendingIncomingDamage,
  unitRemainingHealth,
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
    const positions = new Set([center, ...getOrthogonalNeighbors(center)]);
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
        return total - (55 + Math.min(35, threat) + (lethal ? 55 : 0));
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
  const printed = getSpellDamageAmount(card, card.power ?? 0);
  const damage = Math.max(1, printed);
  const combat = observation.state.combat;
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
  const armorLeverage =
    Math.min(30, defender.defense * 3) + (bestPhysicalDamage === 0 ? 28 : 0);
  let quality =
    Math.min(60, threat) +
    Math.round((Math.min(damage, remaining) / Math.max(1, remaining)) * 40) +
    armorLeverage;
  if (damage >= remaining) quality += 50;
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

function scoreStatReaction(
  observation: ComputerObservation,
  card: CardDefinition,
  mode: CardPlayMode | undefined,
  effect: EffectDefinition,
): number {
  // Attack/Defense statistic cards and similar combat-stat reactions. High
  // value because they only appear when legal (an attack window is open).
  const amount =
    mode === "expert"
      ? ("expertAmount" in effect ? (effect.expertAmount as number | undefined) : undefined) ??
        ("amount" in effect ? (effect.amount as number) : 1)
      : ("amount" in effect ? (effect.amount as number) : 1);

  if (effect.type === "ADD_SPELL_POWER" || card.statisticType === "power") {
    // Power boost mid-spell: always take when offered (legal only in the window).
    return 1_100 + amount * 10 + modeBonus(mode);
  }
  if (effect.type === "RECALL_SPELL") {
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
          const currentDamage = Math.max(
            0,
            attacker.attack + (top.modifiers.attackBonus ?? 0) -
              defender.defense - (top.modifiers.defenseBonus ?? 0),
          );
          // The Absolution–VuHy replay showed Offense + Sword of Hellfire
          // stacked onto Hydras even though Nix's Hardened Shell already capped
          // the hit at 4. Preserve every extra Attack card once the current hit
          // has reached the target's per-attack cap.
          if (Number.isFinite(cap) && currentDamage >= cap) {
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
          const attackValue = attacker.attack + (top.modifiers.attackBonus ?? 0);
          const defenseValue = defender.defense + (top.modifiers.defenseBonus ?? 0);
          const beforeDamage = Math.max(0, attackValue - defenseValue);
          const afterDamage = Math.max(0, attackValue - defenseValue - amount);
          const remaining = unitRemainingHealth(defender);
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
    const phase = armyDevelopmentProfile(state, observation.playerId).phase;
    if (phase === "establish-core") return 930 + effect.amount;
    // Legion vouchers are banked recruit gold in EVERY phase — silver/gold
    // bodies and reinforces keep coming all game, so a voucher rotting in
    // hand is pure waste.
    // The hold below is OLD-RULE ONLY: under `immediate-reinforcement-prompts`
    // Legion does not stack, so banking a second voucher on a unit forfeits the
    // first and the piece is worth keeping. Under the DEFAULT reading distinct
    // pieces ADD, and the engine already hides a piece that has banked its own
    // voucher — so holding it only wastes gold. Pinned in legion-learning.test.ts.
    const outstanding =
      houseRuleEnabled(state, "immediate-reinforcement-prompts") &&
      (state.players[observation.playerId]?.recruitDiscounts?.length ?? 0) > 0;
    return outstanding ? base + 35 : 800 + effect.amount;
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
    // One permanent in play is valuable; only offered when legal.
    return 640 + modeBonus(mode);
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

  // In an active combat activation, a pure map-economy / map-search play has NO
  // combat value. Worse, TAKE_FROM_DISCARD (Scholar's basic side is
  // `allowInCombat`) can retrieve the VERY card just played — the AI would then
  // replay it forever, an infinite loop the runner's no-progress guard cannot
  // catch because each half-step flips phase/eventCounter (play → discard-pick →
  // take-it-back → play …). Score these BELOW END_ACTIVATION (400) so the AI
  // ends its activation instead of cycling a map card mid-fight. Map turns (no
  // combat) and reaction windows keep the normal economy/search scores; combat
  // damage/buff/stat/save/enter-play/active families were already handled above,
  // and MAP_MOVEMENT is deliberately left alone (CONTINUE_NEUTRAL_FREE and the
  // continue-window movement-extend plays are genuinely useful in a fight).
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
    return scoreMapEconomy(observation, effect, 590 + modeBonus(mode));
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
): "lethal-already" | "no-ladder-step" | "kills" | "chips" | null {
  const combat = observation.state.combat;
  const top = observation.state.stack?.at(-1);
  if (!combat || !top || top.action.type !== "CAST_SPELL") return null;
  const spell = cardLibrary[top.action.cardId];
  const target = top.action.target;
  if (!spell || !target || target.type !== "unit") return null;
  if (!COMBAT_DAMAGE_EFFECTS.has(spell.effect.type)) return null;
  const defender = combat.units[target.unitId];
  if (!defender || defender.controllerId === observation.playerId) return null;
  const modifiers = top.modifiers as
    | {
        spellPowerBonus?: number;
        schoolPowerBonus?: number;
        townCubePowerBonus?: number;
      }
    | undefined;
  const power =
    (spell.power ?? 0) +
    (modifiers?.spellPowerBonus ?? 0) +
    (modifiers?.schoolPowerBonus ?? 0) +
    (modifiers?.townCubePowerBonus ?? 0);
  // Dice-roll spells (Inferno, Slayer): the ladder is the DICE count.
  const diceNow = getSpellDiceRollCount(spell, power);
  if (diceNow !== null) {
    const diceBoosted = getSpellDiceRollCount(spell, power + 1) ?? diceNow;
    return diceBoosted > diceNow ? "chips" : "no-ladder-step";
  }
  const now = getSpellDamageAmount(spell, power);
  const boosted = getSpellDamageAmount(spell, power + 1);
  const remaining = unitRemainingHealth(defender);
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
function asPowerBoostScore(
  observation: ComputerObservation,
  cardId: string,
): number {
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
  const effect = primaryEffect(card, optionIndex);
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
  const defenseValue = defender.defense + (item.modifiers.defenseBonus ?? 0);
  return {
    attacker,
    defender,
    damage: Math.max(0, attackValue - defenseValue),
  };
}

function marginalAttackModifierScore(
  observation: ComputerObservation,
  boost: "attack" | "defense",
  free: boolean,
): number {
  const pending = pendingAttackValues(observation);
  if (!pending) return 1_020;
  const { attacker, defender, damage } = pending;
  if (boost === "attack") {
    if (attacker.controllerId !== observation.playerId) return 900;
    const remaining = unitRemainingHealth(defender);
    if (damage < remaining && damage + 1 >= remaining) return 1_155;
    if (damage === 0) return 1_105;
    if (unitThreatValue(defender) >= 30) return free ? 1_080 : 1_060;
    return free ? 1_060 : 1_030;
  }
  if (defender.controllerId !== observation.playerId) return 900;
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
      const card = cardLibrary[action.cardId];
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
        return { score: 300, policy: "card.draw-rider-only" };
      }

      // Sorcery-style activation play banks Power for the next Spell and draws
      // a card. Once Power is already banked, replaying another copy is mostly
      // a cycle and can alternate forever with another draw-rider card. Hold it
      // below END_ACTIVATION; the bank clears after the intended Spell or when
      // this activation ends.
      const optionIndex = "optionIndex" in action ? action.optionIndex : undefined;
      const actionEffect = primaryEffect(card, optionIndex);
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
        (observation.state.players[observation.playerId]?.combatStats?.pendingDrawRiderSpellPower ?? 0) > 0
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
      const missingHealth = Math.max(0, target.maxHealth - remaining);
      const threat = unitThreatValue(target);
      const effect = observation.state.activeEffects?.find(
        (candidate) => candidate.id === action.effectId,
      );
      const expertContinuation = Boolean(
        effect?.healRound?.expert &&
          effect.healRound.round === observation.state.combat?.round,
      );
      const inReactionWindow = Boolean(observation.state.reactionWindow);

      // Danger: damage the enemies still to act this round could land on this
      // unit (adjacent melee + any ranged). A wounded body under a LETHAL threat
      // is the whole point of the Tent — save it; one merely under some threat
      // is worth mending; a safe unit is not urgent.
      const incoming = pendingIncomingDamage(combat, observation.playerId, target);

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
