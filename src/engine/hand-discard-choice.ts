/**
 * "Discard N card(s) from your hand" — the shared hand-discard window.
 *
 * Extracted from `reducer.ts` (unchanged behaviour) so the ADVENTURE side can
 * open it too: the Polish Balance Pack's Dragon Wing Tabard / Spirit of
 * Oppression print "+1 Power, draw 1 card then discard 1 card", and one of the
 * surfaces that resolves that Power side is the map-spell-boost tray in
 * `adventure-reducer.ts` — which cannot import `reducer.ts` (the dependency runs
 * the other way). ONE implementation, so no surface can resolve the draw without
 * the discard.
 *
 * Two-option-per-card shape, so the generic AI option scorer and the
 * AFK/turn-timeout driver's `CHOOSE_OPTION` path answer it with no bespoke
 * policy and it can never stall.
 */

import { cardLibrary } from "@/data/cards/library";
import { nextEventNumber } from "./events";
import type { CardId, GameState, PlayerId } from "./state";

/**
 * Charm of Mana / Shackles of War / the Balance-Pack "then discard 1" riders:
 * open a "discard M cards from hand" choice. `candidates` are the cards the
 * player may discard (the whole hand, or only the cards just drawn). With
 * nothing to discard the choice is skipped.
 */
export function openHandDiscardChoice(
  state: GameState,
  playerId: PlayerId,
  remaining: number,
  candidates: CardId[],
  drawnOnly: boolean,
  cardName: string
): void {
  if (remaining <= 0 || candidates.length === 0) {
    return;
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${cardName}: discard ${remaining} card${remaining === 1 ? "" : "s"}.`,
    options: candidates.map((cardId) => ({ label: `Discard ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "hand-discard",
    handDiscard: { cardIds: candidates, remaining, drawnOnly },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}
