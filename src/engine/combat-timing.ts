/**
 * "Has the fighting begun?" — the ONE shared read of the moment a combat stops
 * being at its BEGINNING.
 *
 * This existed twice by accident: `pvpEscapeWindowOpen` (combat-units.ts) had
 * the real predicate inline for the no-casualties PvP flee, while the Polish Set
 * Artifacts "at the beginning of the combat" tiers only checked
 * `combat.round === 1` — which in this engine is the WHOLE of a default neutral
 * fight (one round, extended a round at a time), so that gate let a player pick
 * "at the beginning of the combat" after every unit had already attacked.
 *
 * This module is a LEAF (types only), so both the heavy combat layer and the
 * leaf `artifact-sets.ts` can read the same predicate with no import cycle.
 */

import type { CombatState } from "./state";

/**
 * True once ANY unit in this combat has acted — moved, attacked, or finished an
 * activation. False during deployment and for the moment between the fight being
 * set up and the first unit doing something.
 *
 * Deliberately does NOT look at `combat.round`: a caller that means "the very
 * beginning of the whole fight" must check the round itself (round 2 has begun
 * by definition, but round 1 with a fought-out round behind it — the
 * continue-or-retreat window — reads as begun here too, which is the point).
 */
export function combatFightingHasBegun(combat: CombatState): boolean {
  return Object.values(combat.units).some(
    (unit) =>
      unit.activatedThisRound ||
      unit.movedThisActivation ||
      Boolean(unit.attackedThisActivation) ||
      (unit.attacksThisActivation ?? 0) > 0
  );
}

/**
 * The printed "at the beginning / at the start of the combat" window: combat
 * round 1, the fight not yet decided, and nobody has acted. Deployment
 * (`combat.setup`) is INSIDE the window — that is literally the beginning — and
 * the window closes for good the instant the first unit moves or strikes.
 */
export function combatStartWindowOpen(combat: CombatState): boolean {
  if (combat.outcome || combat.round !== 1) {
    return false;
  }
  return !combatFightingHasBegun(combat);
}
