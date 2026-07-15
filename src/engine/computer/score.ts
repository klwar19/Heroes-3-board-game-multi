import { unitAbilities } from "@/data/units/abilities";
import { getBattlefieldDistance, isAdjacent } from "../battlefield";
import type { CombatState, CombatUnitState, PlayerId, UnitGrade } from "../state";

/**
 * Shared strategic estimators used by the combat policy. Every helper reads
 * only PUBLIC combat statistics (all combat units are visible to both sides in
 * `getPlayerView`), never a hidden hand or deck, so a decision built from these
 * is unchanged by an opponent's private information.
 *
 * The estimators are deliberately conservative approximations of the engine's
 * real resolution (`applyAttackDamageFromCandidate` in reducer.ts): they ignore
 * the ±1 attack die (expected value 0 across its six [-1,-1,0,0,1,1] faces) and
 * any per-attack ability rider. They only ORDER already-legal actions, so an
 * approximation error can never produce an illegal or state-corrupting move — at
 * worst a slightly sub-optimal (but still legal) target choice.
 */

/** Remaining health of a combat unit: max health minus accumulated wounds. */
export function unitRemainingHealth(unit: CombatUnitState): number {
  return Math.max(0, unit.maxHealth - unit.damage);
}

/**
 * Expected damage of a melee/base attack: `max(0, attack - defense)`, matching
 * the engine's `rawDamage = max(0, attackValue - defenseValue)` with the die at
 * its expected value 0. Ability splashes, caps and elemental defense-ignores are
 * intentionally not modeled here.
 */
export function expectedAttackDamage(
  attacker: CombatUnitState,
  defender: CombatUnitState,
): number {
  return Math.max(0, attacker.attack - defender.defense);
}

/**
 * Whether `attacker`'s expected hit removes `defender` outright — the engine's
 * lethal test is `defender.damage + damage >= defender.maxHealth`, i.e. the hit
 * meets the defender's remaining health. Guarded on positive damage so a fully
 * blocked (0-damage) attack is never counted as lethal.
 */
export function attackIsLethal(
  attacker: CombatUnitState,
  defender: CombatUnitState,
): boolean {
  const damage = expectedAttackDamage(attacker, defender);
  return damage > 0 && damage >= unitRemainingHealth(defender);
}

/**
 * Extra target value by unit tier (bronze < silver < gold < azure). A gold body
 * is a bigger prize to remove than a bronze one of the same raw stats, and an
 * Azure Dragon is the top of the board. Bronze is 0 so a plain core unit's
 * threat is exactly the old attack/health/initiative sum (keeps existing
 * orderings intact); the weights only ever ADD, ordering targets of otherwise
 * similar stats by their rarity.
 */
const TIER_WEIGHT: Record<UnitGrade, number> = {
  bronze: 0,
  silver: 8,
  gold: 20,
  azure: 36,
};

export function tierWeight(grade: UnitGrade): number {
  return TIER_WEIGHT[grade] ?? 0;
}

/**
 * Effect types of the "[activation]" / caster-style abilities that make a unit a
 * priority to remove: an Enchanter heal, a Faerie Bolt, a Magi power boost, a
 * Genie Wish, and the multi-target splash/second-attack/death-stare families
 * (Magog, Lich, Cerberi, Magic Elemental, Gorgon). Read data-driven off the
 * ability definition's effect `type`, so a renamed id or a new caster unit is
 * classified without touching this list. It only ORDERS legal actions, so a
 * miss can never produce an illegal move — at worst a slightly sub-optimal (but
 * legal) target.
 */
const THREAT_ABILITY_EFFECT_TYPES = new Set<string>([
  "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF",
  "ON_ACTIVATION_DAMAGE_SPELL",
  "ON_ACTIVATION_SPELL_POWER_FIRST_CAST",
  "DECK_DISCARD_TAKE_SPELL",
  "FLAT_DAMAGE_ADJACENT_TO_TARGET",
  "FLAT_DAMAGE_ADJACENT_TO_SELF",
  "SECOND_ATTACK_ADJACENT_TO_TARGET",
  "SECOND_ATTACK_ALL_ADJACENT_TO_SELF",
  "DEATH_STARE_ON_DICE",
]);

/** Whether the unit carries a caster / activation-threat ability (see above). */
export function hasThreatAbility(unit: CombatUnitState): boolean {
  return (unit.abilities ?? []).some((abilityId) => {
    const effectType = unitAbilities[abilityId]?.effect?.type;
    return effectType !== undefined && THREAT_ABILITY_EFFECT_TYPES.has(effectType);
  });
}

/** Bonus to a unit's threat for carrying a caster / activation-threat ability. */
const CASTER_THREAT_BONUS = 10;

/**
 * How valuable it is to remove / how dangerous a unit is: its offensive output
 * (weighted heaviest — its current Attack IS its damage output), durability and
 * initiative, with a premium for ranged units (they threaten damage without
 * provoking a retaliation), its TIER (gold > silver > bronze; azure highest) and
 * a caster/activation-threat premium. Used to rank candidate targets; the
 * absolute magnitude is unimportant, only the ordering.
 */
export function unitThreatValue(unit: CombatUnitState): number {
  let threat = unit.attack * 3 + unitRemainingHealth(unit) + unit.initiative;
  if (unit.type === "ranged") threat += 6;
  threat += tierWeight(unit.grade);
  if (hasThreatAbility(unit)) threat += CASTER_THREAT_BONUS;
  return threat;
}

/** Whether the unit currently carries a Paralysis token (skips its activation
 *  until the token is removed; ANY damage removes it). */
export function isParalyzed(unit: CombatUnitState): boolean {
  return (unit.tokens ?? []).some((token) => token.kind === "paralysis");
}

/**
 * How much a wounded unit is below this baseline remaining health — a "finish
 * premium": a nearly-dead body is a cheaper kill, so the army should converge on
 * it. Zero for a healthy unit.
 */
const WOUND_FOCUS_BASELINE = 6;

/**
 * Priority of removing this enemy: its full threat value PLUS a premium for
 * being nearly dead (a wounded high-value body is the best finish). Used to pick
 * the focus target the army marches onto — value primary, wounds the tiebreak.
 */
export function targetPriority(unit: CombatUnitState): number {
  return (
    unitThreatValue(unit) +
    Math.max(0, WOUND_FOCUS_BASELINE - unitRemainingHealth(unit))
  );
}

/**
 * Total damage the living enemies that can still strike `unit` this round would
 * deal it: enemies that have NOT acted yet (`activatedThisRound` false) and are
 * in reach — adjacent (melee) or ranged (from anywhere). Tells a wounded unit in
 * real danger from safe chaff; the estimate uses `expectedAttackDamage` (die at
 * EV 0), so it only orders decisions.
 */
export function pendingIncomingDamage(
  combat: CombatState,
  playerId: PlayerId,
  unit: CombatUnitState,
): number {
  return livingEnemyUnits(combat, playerId).reduce((sum, enemy) => {
    if (enemy.activatedThisRound) return sum;
    const reaches =
      enemy.type === "ranged" || isAdjacent(enemy.position, unit.position);
    return reaches ? sum + expectedAttackDamage(enemy, unit) : sum;
  }, 0);
}

/** Living enemy units of `playerId` on the combat board. */
export function livingEnemyUnits(
  combat: CombatState,
  playerId: PlayerId,
): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (unit) => unit.controllerId !== playerId && unitRemainingHealth(unit) > 0,
  );
}

/** Manhattan distance from `position` to the nearest living enemy unit. */
export function distanceToNearestEnemy(
  combat: CombatState,
  playerId: PlayerId,
  position: number,
): number | null {
  const enemies = livingEnemyUnits(combat, playerId);
  if (enemies.length === 0) return null;
  return enemies.reduce(
    (nearest, enemy) =>
      Math.min(nearest, getBattlefieldDistance(position, enemy.position)),
    Number.POSITIVE_INFINITY,
  );
}
