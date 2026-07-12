import { isComputerPlayer, NEUTRAL_PLAYER_ID } from "@/engine";
import type { GameEvent, GameState, PlayerId } from "@/engine";

/**
 * Single-player presentation: a computer opponent's battles resolve IMMEDIATELY
 * and off-screen inside the human's action transaction (see settleComputerWork)
 * — the human never watches an AI fight or waits on a dice roll. But the human
 * SHOULD be told what happened, so this module turns the settled event log into
 * a short, honest report of each AI battle: who fought, whether they won or lost,
 * and the reward they claimed. It is pure and testable; the page renders the
 * cues in an overlay and the reward text is assembled straight from the reward
 * events the engine already emitted (no re-derivation of rules).
 */

export type ComputerBattleCue = {
  /** The battle-result event id (stable de-dupe key). */
  id: string;
  playerId: PlayerId;
  playerName: string;
  won: boolean;
  /** A Quick-Combat win (the fight was skipped outright), vs a fought battle. */
  quick: boolean;
  /** Who they fought, in plain words ("the neutral guards" / an opponent name). */
  opponentLabel: string;
  /** One-line reward summary, or null when nothing was gained. */
  rewardText: string | null;
};

const RESULT_TYPES = new Set<GameEvent["type"]>([
  "COMBAT_ENDED",
  "QUICK_COMBAT_WON",
]);

function playerName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

function opponentLabel(state: GameState, otherId: PlayerId): string {
  if (otherId === NEUTRAL_PLAYER_ID) {
    return "the neutral guards";
  }
  return playerName(state, otherId);
}

const LOCATION_WORDS: Record<string, string> = {
  mine: "a mine",
  town: "a town",
  treasure_symbol: "a treasure",
  resource_symbol: "a resource",
};

/**
 * Assemble the reward line for the battle whose result sits at `resultIndex`,
 * from the reward events that player collected between this result and the next
 * one (the post-combat field visit / income resolve in event order).
 */
function rewardText(
  state: GameState,
  events: ReadonlyArray<GameEvent>,
  resultIndex: number,
  playerId: PlayerId,
): string | null {
  let end = events.length;
  for (let index = resultIndex + 1; index < events.length; index += 1) {
    if (RESULT_TYPES.has(events[index].type)) {
      end = index;
      break;
    }
  }

  const parts: string[] = [];
  let gold = 0;
  let materials = 0;
  let valuables = 0;
  for (let index = resultIndex + 1; index < end; index += 1) {
    const event = events[index];
    if ("playerId" in event && event.playerId !== playerId) {
      continue;
    }
    if (event.type === "FIELD_FLAGGED") {
      parts.push(`claimed ${LOCATION_WORDS[event.location] ?? "a field"}`);
    } else if (event.type === "RESOURCES_GAINED") {
      gold += event.gold;
      materials += event.buildingMaterials;
      valuables += event.valuables;
    } else if (event.type === "EXPERIENCE_GAINED") {
      parts.push(`hero reached level ${event.level}`);
    }
  }
  const resourceBits: string[] = [];
  if (gold > 0) resourceBits.push(`+${gold} gold`);
  if (materials > 0) resourceBits.push(`+${materials} materials`);
  if (valuables > 0) resourceBits.push(`+${valuables} valuables`);
  if (resourceBits.length > 0) {
    parts.push(resourceBits.join(", "));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Build the battle report for the COMPUTER battles among `freshEvents` (results
 * not yet reported this session). A neutral fight names the guards; an AI-vs-AI
 * fight yields a won cue for the winner and a lost cue for the loser. Returns []
 * when no computer battle is present (every ordinary multiplayer snapshot and
 * any human-only combat), so the caller can cheaply skip.
 */
export function buildComputerBattleReport(
  state: GameState,
  freshEvents: ReadonlyArray<GameEvent>,
): ComputerBattleCue[] {
  const cues: ComputerBattleCue[] = [];
  freshEvents.forEach((event, index) => {
    if (event.type === "QUICK_COMBAT_WON") {
      if (!isComputerPlayer(state, event.playerId)) {
        return;
      }
      cues.push({
        id: event.id,
        playerId: event.playerId,
        playerName: playerName(state, event.playerId),
        won: true,
        quick: true,
        opponentLabel: "the neutral guards",
        rewardText: rewardText(state, freshEvents, index, event.playerId),
      });
      return;
    }
    if (event.type !== "COMBAT_ENDED") {
      return;
    }
    for (const participant of [event.winnerPlayerId, event.defeatedPlayerId]) {
      if (participant === NEUTRAL_PLAYER_ID || !isComputerPlayer(state, participant)) {
        continue;
      }
      const won = participant === event.winnerPlayerId;
      const otherId = won ? event.defeatedPlayerId : event.winnerPlayerId;
      cues.push({
        id: `${event.id}:${participant}`,
        playerId: participant,
        playerName: playerName(state, participant),
        won,
        quick: false,
        opponentLabel: opponentLabel(state, otherId),
        // Losers reap nothing; only summarise a winner's spoils.
        rewardText: won ? rewardText(state, freshEvents, index, participant) : null,
      });
    }
  });
  return cues;
}
