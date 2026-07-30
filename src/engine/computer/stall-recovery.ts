import { getLegalActions } from "../legal-actions";
import type { GameAction, GameState, LegalAction, PlayerId } from "../state";
import { computerDecisionOwner } from "./window";
import type { ComputerDecision } from "./types";

/**
 * LAST-RESORT recovery for a stalled computer seat — the "frozen single-player
 * table" killer.
 *
 * When `driveComputerPlayers` stalls ("no safe legal action": the policy found
 * no candidate, or every candidate was rejected / made no measurable progress)
 * while `computerDecisionOwner` still names a computer seat, the table is
 * otherwise FROZEN FOREVER on a live room: inside a human-participant combat
 * the human's own legal set is empty, ADVANCE_COMPUTER is deliberately not
 * offered, no broadcast ever fires again, and every click comes back
 * "That action is not legal in the current game state." — with no AFK vote or
 * turn clock to break the deadlock in single player. Reported live ("round 6,
 * game crashes, Griffin cannot attack, hold is illegal").
 *
 * This helper is the AFK-drop driver's sibling (see afk-drop.ts): pick ONE
 * do-least legal action that RESOLVES the open window the computer owns —
 * pass the reaction, take the skip-flavoured choice option, hold the unit —
 * so the game continues through the normal rules pipeline. It never invents an
 * action (offers come from getLegalActions verbatim) and never reaches for
 * drastic plays (no retreat/surrender/card plays): if nothing in the safe set
 * is offered, it returns null and the stall stays visible in the logs.
 */

/**
 * Window-resolving / do-least action types the fallback may take, in strict
 * preference order. Mirrors afk-drop's RESOLVING_ACTION_TYPES plus the combat
 * sub-window closers and the do-nothing unit commands.
 */
const RECOVERY_TYPE_PREFERENCE: GameAction["type"][] = [
  // Resolve the open interaction window.
  "CHOOSE_OPTION",
  "CHOOSE_ABILITY_TARGET",
  "CHOOSE_PENDING_ROLL",
  "RESOLVE_COMBAT_DISCARD",
  "RESOLVE_DECK_SEARCH",
  "RESOLVE_VISIT_STEP",
  "SET_TILE_ROTATION",
  "SKIP_NECROMANCY",
  "REFRESH_HAND",
  "OPENING_HAND_MULLIGAN",
  "RESOLVE_EXPLORERS_DISCARD",
  // Close an open combat sub-window with its default.
  "ACCEPT_COMBAT",
  "FINISH_COMBAT_PLACEMENT",
  "PLACE_COMBAT_UNIT",
  "FINISH_TACTICS",
  "FINISH_NEUTRAL_PLACEMENT",
  "FINISH_COMMANDER_PLACEMENT",
  "AUTO_NEUTRAL_ACTIVATION",
  "CONTINUE_NEUTRAL_STEP",
  "CONTINUE_NEUTRAL_COMBAT",
  "ACKNOWLEDGE_COMBAT_END",
  // Do-least unit commands, in do-least order.
  "END_ACTIVATION",
  "DEFEND_UNIT",
  "END_TURN"
];

/** Prefer the do-nothing option so the recovery changes as little as possible. */
const SKIP_LABEL = /skip|decline|no thanks|keep|done|let it fall|cancel|nothing|hold|stay/i;

function pickRecoveryAction(offers: LegalAction[]): GameAction | null {
  for (const type of RECOVERY_TYPE_PREFERENCE) {
    const candidates = offers.filter((offer) => offer.action.type === type);
    if (candidates.length === 0) {
      continue;
    }
    return (candidates.find((offer) => SKIP_LABEL.test(offer.label)) ?? candidates[0]).action;
  }
  return null;
}

/**
 * The single default action that un-freezes a stalled computer-owned window,
 * or null when the stall is not a computer seat's (someone can act — no
 * recovery needed) or nothing in the safe set is offered (genuinely stuck —
 * the caller keeps its stall logging).
 */
export function computerStallRecoveryDecision(state: GameState): ComputerDecision | null {
  const owner: PlayerId | null = computerDecisionOwner(state);
  if (!owner) {
    return null;
  }
  // A reaction window where the computer holds priority: passing is always
  // legal for the priority holder, whatever the policy failed on.
  if (state.reactionWindow && state.reactionWindow.priorityPlayerId === owner) {
    return {
      playerId: owner,
      action: { type: "PASS_REACTION", playerId: owner },
      policy: "stall-recovery.pass-reaction",
      score: 0
    };
  }
  const action = pickRecoveryAction(getLegalActions(state, owner));
  if (!action) {
    return null;
  }
  return { playerId: owner, action, policy: "stall-recovery.default-resolve", score: 0 };
}
