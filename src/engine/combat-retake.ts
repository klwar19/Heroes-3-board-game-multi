import type { EngineResult, GameAction, GameState } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import { houseRuleEnabled } from "./house-rules";
import { appendEvent } from "./events";

/** One exclusive PvP activation only; never rewind another player's map work. */
export function combatRetakeParticipants(state: GameState): string[] {
  const combat = state.combat;
  if (!houseRuleEnabled(state, "combat-retake") || !combat || combat.context?.kind !== "player" || combat.setup ||
      combat.outcome || Object.keys(state.parallelCombats ?? {}).length > 0) return [];
  const ids = [combat.attackerPlayerId, combat.defenderPlayerId];
  if (ids.some(id => !id || id === NEUTRAL_PLAYER_ID || !state.players[id] ||
      state.controllers?.[id]?.kind === "computer") || ids[0] === ids[1]) return [];
  return ids as string[];
}

function activationKey(state: GameState): string | null {
  const combat = state.combat;
  return combat?.activeUnitId ? `${combat.id}:${combat.round}:${combat.activeUnitId}` : null;
}

function snapshot(state: GameState): GameState {
  const { combatRetakeCheckpoint: _checkpoint, combatRetakeVote: _vote, ...rest } = state;
  return JSON.parse(JSON.stringify(rest)) as GameState;
}

/** Called only for successful actions. Invalid actions never move the rewind point. */
export function trackCombatRetake(before: GameState, after: GameState, action: GameAction): void {
  if (action.type === "REQUEST_COMBAT_RETAKE" || action.type === "ANSWER_COMBAT_RETAKE") return;
  const participants = combatRetakeParticipants(after);
  if (!participants.length || !("playerId" in action) || !participants.includes(action.playerId)) {
    delete after.combatRetakeCheckpoint;
    delete after.combatRetakeVote;
    return;
  }
  const beforeKey = activationKey(before);
  const afterKey = activationKey(after);
  // Completing an attack can automatically select the next unit. Keep the
  // completed activation available until that next unit actually takes an action.
  if (beforeKey && beforeKey !== before.combatRetakeCheckpoint?.key && combatRetakeParticipants(before).length) {
    after.combatRetakeCheckpoint = { key: beforeKey, snapshot: snapshot(before) };
  } else if (!before.combat && afterKey) {
    after.combatRetakeCheckpoint = { key: afterKey, snapshot: snapshot(after) };
  }
}

/** Seat ownership is checked by the reducer before this handler is reached. */
export function applyCombatRetake(state: GameState, action: GameAction): EngineResult {
  const reject = (message: string): EngineResult => ({ state, events: [], errors: [{ code: "ACTION_NOT_LEGAL", message }] });
  if (action.type !== "REQUEST_COMBAT_RETAKE" && action.type !== "ANSWER_COMBAT_RETAKE") {
    return reject("Wait for the combat retake vote to be answered.");
  }
  const participants = combatRetakeParticipants(state);
  if (!participants.includes(action.playerId)) return reject("Only the two combat participants may retake a turn, with the house rule enabled.");
  const checkpoint = state.combatRetakeCheckpoint;
  if (!checkpoint || checkpoint.snapshot.combat?.id !== state.combat?.id) {
    return reject("There is no combat activation to retake.");
  }
  const next = snapshot(state);
  next.combatRetakeCheckpoint = checkpoint;
  if (action.type === "REQUEST_COMBAT_RETAKE") {
    if (state.combatRetakeVote) return reject("A combat retake request is already open.");
    next.combatRetakeVote = {
      requestedBy: action.playerId,
      opponentId: participants.find(id => id !== action.playerId)!,
      combatId: state.combat!.id,
    };
    appendEvent(next, { type: "EVENT_NOTE", message: `${state.players[action.playerId].name} requests a combat turn retake. The other participant must agree.` });
  } else {
    const vote = state.combatRetakeVote;
    if (!vote || vote.combatId !== state.combat!.id ||
        (action.playerId !== vote.opponentId && (action.agree || action.playerId !== vote.requestedBy))) {
      return reject("Only the other combat participant can approve this retake.");
    }
    if (action.agree) {
      const restored = snapshot(checkpoint.snapshot);
      // Membership/chat and the public audit trail belong to the current timeline.
      restored.room = next.room;
      restored.eventLog = next.eventLog;
      restored.eventCounter = next.eventCounter;
      appendEvent(restored, { type: "EVENT_NOTE", message: "Both combat participants agreed: the unit's activation has been restarted." });
      return { state: restored, events: restored.eventLog.slice(-1), errors: [] };
    }
    appendEvent(next, { type: "EVENT_NOTE", message: "Combat retake declined or cancelled. Combat continues without changes." });
  }
  return { state: next, events: next.eventLog.slice(-1), errors: [] };
}
