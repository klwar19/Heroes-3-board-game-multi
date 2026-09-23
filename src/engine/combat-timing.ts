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

import { houseRuleEnabled } from "./house-rules";
import type { CombatState, GameState } from "./state";

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

/**
 * The printed "at the start of a combat round" window: the current round is
 * unresolved and no unit has acted in it yet. Unlike `combatStartWindowOpen`,
 * this deliberately reopens after the round counters and unit activation flags
 * reset for round 2 and later.
 */
export function combatRoundStartWindowOpen(combat: CombatState): boolean {
  return !combat.outcome && !combatFightingHasBegun(combat);
}

/**
 * Intelligence (classic AND Polish reprint — USER RULING 2026-09-23, matching
 * the printed "before any unit activates"): the one-shot cast window is CLOSED
 * once a unit has acted in the current combat round. Outside combat: false.
 */
export function intelligenceCastWindowClosed(state: GameState): boolean {
  return Boolean(state.combat) && !combatRoundStartWindowOpen(state.combat!);
}

/**
 * Polish Balance Pack — the reprinted INTELLIGENCE: "At the start of a combat
 * round, Refresh 1 Spell, then Cast a Spell." The classic card grants a
 * combat-long timing freedom; the reprint scopes its one-shot cast to the start
 * of whichever combat round the card is played. TRUE means the freedom (and its
 * expert no-limit rider) is CLOSED right now.
 *
 * Outside combat there is no window to close, so this is false — the card is a
 * combat play and the freedom is only ever read mid-fight.
 */
export function balanceIntelligenceWindowClosed(state: GameState): boolean {
  if (!polishIntelligenceHandReadingActive(state)) {
    return false;
  }
  return Boolean(state.combat) && !combatRoundStartWindowOpen(state.combat!);
}

/**
 * Whether the POLISH pack owns the Intelligence card right now.
 *
 * Both balance packs reprint Intelligence, and the COMMUNITY reprint wins when
 * both are on (`balanceCardLibrary` applies community last). The community card
 * is not an active-effect play at all — it is a cast-from-your-discard enabler —
 * so every seam that reads "Intelligence sitting in hand" for the POLISH reading
 * (its combat-round-start timing freedom and the Polish-Book "Cast a Spell" waiver)
 * must go dark while the community pack is on, or a holder would get BOTH cards.
 *
 * ONE shared read, so `balanceIntelligenceWindowClosed` and the hand-reading
 * seams in `ruleset.ts` / `reducer.ts` / `legal-actions.ts` can never disagree.
 */
export function polishIntelligenceHandReadingActive(state: GameState): boolean {
  return (
    houseRuleEnabled(state, "polish-card-balance") && !houseRuleEnabled(state, "community-card-balance")
  );
}
