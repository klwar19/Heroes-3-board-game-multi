import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatState, GameState, PendingChoice, PlayerId } from "./state";

/**
 * PvP Neutral Control (OPTIONAL mode, multiplayer only,
 * `GameSetupOptions.pvpNeutralControl`): in every Neutral combat the NEXT live
 * player clockwise from the fighter becomes the Neutral commander — a human
 * plays the guards. They break the guards' activation-order ties, pick which
 * reachable enemy each guard attacks, choose the landing cell, and steer the
 * move (or hold) when no attack is possible. The Neutral rulebook constraints
 * still bind (a guard must attack when it can; an engaged ranged guard strikes
 * an adjacent enemy; Berserk overrides), and ability follow-ups (Lich splash
 * targets, rerolls, Magic Mirror) stay AI-resolved.
 *
 * This module holds only the pure "who commands / what counts as a command
 * choice" reads so parallel-turns.ts, reducer.ts and adventure-reducer.ts can
 * all consume them without import cycles.
 */

/**
 * The player commanding the Neutral side of `combat`, or null when the normal
 * Neutral AI plays it: the mode is off (or the snapshot predates it), the
 * combat is not a Neutral fight, or no OTHER live seat exists (solo table, or
 * everyone else eliminated — `turnOrder` holds live seats only, so the next
 * entry clockwise from the fighter is always a live commander). Derived fresh
 * on every read so a commander eliminated mid-fight hands the guards to the
 * next live seat (or back to the AI) automatically.
 */
export function neutralCombatControllerId(state: GameState, combat: CombatState): PlayerId | null {
  if (combat.context.kind !== "neutral" || !state.adventure?.pvpNeutralControl) {
    return null;
  }
  const order = state.turnOrder;
  const index = order.indexOf(combat.attackerPlayerId);
  if (index === -1 || order.length < 2) {
    return null;
  }
  const next = order[(index + 1) % order.length];
  return next && next !== combat.attackerPlayerId && next !== NEUTRAL_PLAYER_ID ? next : null;
}

/**
 * Whether an open pending choice is one of the Neutral side's COMMAND
 * decisions (activation-order tie of the Neutral side, attack-target pick,
 * move/landing-cell pick). Used by the parallel-turns bystander guard: the
 * commanding player answering one of these inside the open Neutral fight is
 * that interaction's own input, not a bystander intrusion.
 */
export function isNeutralCommandChoice(choice: PendingChoice): boolean {
  if (!choice) {
    return false;
  }
  if (choice.type === "ABILITY_TARGET_CHOICE") {
    return choice.kind === "neutral-target";
  }
  if (choice.type === "OPTION_CHOICE") {
    return (
      choice.context === "neutral-destination" ||
      (choice.context === "combat-activation-order" && choice.activationOrder?.side === NEUTRAL_PLAYER_ID)
    );
  }
  return false;
}
