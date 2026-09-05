import { getBattlefieldDistance, isAdjacent } from "./battlefield";
import type { CombatState, CombatUnitState, EffectDefinition, PlayerId } from "./state";

/**
 * Azur Lane Naval Base hero specialties (Bismarck / Nagato / Sirius) — the PURE
 * reads shared by the offer gate (legal-actions.ts) and the resolution
 * (reducer.ts). Keeping them in one leaf module is what stops the two sides
 * disagreeing (the "an offer's number can never disagree with the damage" rule
 * the Conflux Elementals fix records).
 *
 * A unit is alive while its damage is below its max Health — repeated here
 * rather than imported so this module stays a LEAF (legal-actions imports it).
 */
function alive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

/**
 * Bismarck "Concentrated Fire": how many OTHER living friendly units of the
 * attacker stand orthogonally adjacent to the TARGET. The attacker itself is
 * never counted (it is adjacent to its own melee target, which would hand every
 * melee blow a free +1).
 */
export function alliesAdjacentToTarget(
  combat: CombatState | null | undefined,
  attacker: CombatUnitState | undefined,
  defender: CombatUnitState | undefined,
): number {
  if (!combat || !attacker || !defender) {
    return 0;
  }
  return Object.values(combat.units).filter(
    (unit) =>
      unit.id !== attacker.id &&
      unit.id !== defender.id &&
      unit.controllerId === attacker.controllerId &&
      alive(unit) &&
      isAdjacent(unit.position, defender.position),
  ).length;
}

/**
 * The Attack bonus a `perAllyAdjacentToTarget` reaction actually pays: one step
 * per qualifying ally, capped by the card's printed `maxAmount` (I +1 / IV +2 /
 * VI +3). ONE read for the offer gate and the fold.
 */
export function concentratedFireBonus(
  effect: Extract<EffectDefinition, { type: "ADD_COMBAT_STAT" }>,
  combat: CombatState | null | undefined,
  attacker: CombatUnitState | undefined,
  defender: CombatUnitState | undefined,
): number {
  const perAlly = effect.perAllyAdjacentToTarget ?? 0;
  if (perAlly <= 0) {
    return 0;
  }
  const raw = perAlly * alliesAdjacentToTarget(combat, attacker, defender);
  return effect.maxAmount === undefined ? raw : Math.min(raw, effect.maxAmount);
}

/**
 * Nagato "Big Seven Bombardment": whether this unit's attacks resolve as RANGED
 * right now. Either it is a printed ranged unit, or the specialty armed the
 * bombardment for this activation. THE shared read behind `getAttackKind` and
 * the ranged combat penalty, so a bombarding battleship takes exactly the
 * penalties a printed shooter would.
 */
export function unitAttacksAsRanged(unit: CombatUnitState): boolean {
  return unit.type === "ranged" || unit.bombardment !== undefined;
}

/**
 * Whether an armed bombardment reaches `defender`. `range` absent = anywhere on
 * the board (levels IV/VI); a number is the maximum orthogonal board distance
 * (level I's 2 spaces). Returns false for a unit with no bombardment armed.
 */
export function bombardmentReaches(
  attacker: CombatUnitState,
  defender: CombatUnitState,
): boolean {
  const bombardment = attacker.bombardment;
  if (!bombardment) {
    return false;
  }
  if (bombardment.range === undefined) {
    return true;
  }
  return (
    getBattlefieldDistance(attacker.position, defender.position) <=
    bombardment.range
  );
}

/**
 * Sirius "Royal Maid's Cover": the friendly units that may step in front of the
 * declared attack — a living ally of the ORIGINAL target, adjacent to IT, never
 * the target itself and never the attacker's side.
 *
 * This is EXACTLY Masato's `adjacentBodyguardFor` rule (adjacency to the
 * DEFENDER, nothing else). It is deliberately NOT filtered by
 * `canUnitAttack(attacker, interceptor)`: on an orthogonal board no space is
 * adjacent to both an attacker and the adjacent unit it is striking, so such a
 * filter would make the card literally unplayable against a melee attacker.
 * Like Masato's, the redirected blow therefore reaches a maid the attacker was
 * not adjacent to — and, being a non-adjacent melee attack, provokes no
 * Retaliation Attack from her.
 */
export function interceptCandidates(
  combat: CombatState | null | undefined,
  attacker: CombatUnitState | undefined,
  defender: CombatUnitState | undefined,
  playerId: PlayerId,
): CombatUnitState[] {
  if (!combat || !attacker || !defender) {
    return [];
  }
  if (defender.controllerId !== playerId || attacker.controllerId === playerId) {
    return [];
  }
  return Object.values(combat.units)
    .filter(
      (unit) =>
        unit.id !== defender.id &&
        unit.id !== attacker.id &&
        unit.controllerId === defender.controllerId &&
        alive(unit) &&
        isAdjacent(unit.position, defender.position),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}
