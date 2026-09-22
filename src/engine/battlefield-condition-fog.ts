import { createSeededRandom } from "./random";
import type { CombatState } from "./state";

/**
 * Dense Fog rolls in and lifts between combat rounds instead of blanketing the
 * whole battle: round 1 is always thick (the dice just summoned it), and every
 * later round re-derives thick-or-lifted from the combat's own STORED dice seed
 * with `{ salt: false }` — never the live per-action entropy — so
 * getLegalActions, the reducer, the AI estimators and every client agree on the
 * same answer for a given round. Ranged disadvantage (and the heavy fog
 * visuals) apply only while the fog is thick.
 */
export function denseFogThisRound(combat: CombatState | null | undefined): boolean {
  if (combat?.battlefieldCondition?.id !== "dense-fog") return false;
  if (combat.round <= 1) return true;
  const random = createSeededRandom(
    `${combat.dice.seed}#${combat.id}#dense-fog-round#${combat.round}`,
    { salt: false },
  );
  // Slightly fog-biased so the rolled condition still shapes most of the fight.
  return random.next() < 0.55;
}
