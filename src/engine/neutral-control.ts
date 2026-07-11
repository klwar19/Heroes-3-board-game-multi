import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatState, GameState, PendingChoice, PlayerId } from "./state";

/**
 * PvP Neutral Control (OPTIONAL mode, multiplayer only,
 * `GameSetupOptions.pvpNeutralControl`): in every Neutral combat the NEXT live
 * player clockwise from the fighter becomes the NEUTRAL CONTROLLER — a human
 * plays the guards like a PvP side. The engine stops on each guard's
 * activation and the controller drives it with the normal combat actions
 * (move, attack, defend, hold), answers the guards' ability follow-ups
 * (activation choices, splash targets, attack-die rerolls) and breaks their
 * activation-order ties. NOT related to the WOG Commanders module — this is
 * purely "which SEAT plays the Neutral units".
 *
 * The `pvpNeutralControlMustAttack` sub-toggle (default ON) keeps the rulebook
 * spirit: a guard must attack when it can reach an enemy, may not Defend, and
 * may only approach (never wander) when no attack is reachable. Toggled OFF,
 * the controller plays the guards with no constraint at all.
 *
 * This module holds only the pure "who controls / what counts as a
 * neutral-side decision" reads so parallel-turns.ts, afk.ts, reducer.ts and
 * adventure-reducer.ts can all consume them without import cycles.
 */

/**
 * The player controlling the Neutral side of `combat`, or null when the normal
 * Neutral AI plays it: the mode is off (or the snapshot predates it), the
 * combat is not a Neutral fight, or no OTHER live seat exists (solo table, or
 * everyone else eliminated — `turnOrder` holds live seats only, so the next
 * entry clockwise from the fighter is always a live controller). Derived fresh
 * on every read so a controller eliminated mid-fight hands the guards to the
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
 * The "must attack" sub-toggle of PvP Neutral Control (default ON): a
 * controlled guard must attack whenever it can, may not Defend, and may only
 * approach when no attack is reachable. OFF lets the controller play the
 * guards entirely freely. Only meaningful while a controller exists.
 */
export function neutralControlMustAttack(state: GameState): boolean {
  return state.adventure?.pvpNeutralControlMustAttack ?? true;
}

/**
 * Whether an open pending choice is one of the NEUTRAL SIDE's own combat
 * decisions — a decision that under PvP Neutral Control belongs to the
 * controlling player rather than a bystander:
 *  - the guards' activation-order tie (side NEUTRAL_PLAYER_ID);
 *  - the AI-mode fighter picks (neutral-target tie, neutral-destination);
 *  - a neutral unit's ability follow-up (ABILITY_TARGET_CHOICE whose source
 *    unit is neutral: splash targets, Magic Mirror redirect, activation
 *    choices) or its attack-die reroll window (ATTACK_DIE_REROLL whose
 *    attacker is neutral).
 *
 * Used by the parallel-turns bystander guard (the controller answering one of
 * these inside the open fight is that interaction's own input) and by
 * eliminatePlayer (a dead controller's open neutral-side choice is handed back
 * to the NEUTRAL seat instead of being dropped, so the fight never strands).
 */
export function isNeutralSideCombatChoice(combat: CombatState, choice: PendingChoice): boolean {
  if (!choice) {
    return false;
  }
  if (choice.type === "ABILITY_TARGET_CHOICE") {
    if (choice.kind === "neutral-target") {
      return true;
    }
    const source = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
    return source?.controllerId === NEUTRAL_PLAYER_ID;
  }
  if (choice.type === "ATTACK_DIE_REROLL") {
    return combat.units[choice.attackerId]?.controllerId === NEUTRAL_PLAYER_ID;
  }
  if (choice.type === "OPTION_CHOICE") {
    return (
      choice.context === "neutral-destination" ||
      (choice.context === "combat-activation-order" && choice.activationOrder?.side === NEUTRAL_PLAYER_ID)
    );
  }
  return false;
}
