import { astrologersCardDefinitions } from "@/data/cards/astrologers";
import { markEquipmentFirstSpellCast } from "./anime-equipment";
import { drawCardsForPlayer } from "./decks";
import { appendEvent } from "./events";
import type { CardId, GameState, PlayerId } from "./state";

/**
 * Map-safe spell bookkeeping. Map casts count as spells this player turn, consume
 * first-spell equipment, and trigger after-cast draws, but deliberately do not
 * touch combat-round spell limits or first-spell-this-combat-round markers.
 */
export function noteMapSpellCast(
  state: GameState,
  playerId: PlayerId,
  inFlightCardIds: readonly CardId[]
): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  markEquipmentFirstSpellCast(state, playerId);
  player.combatStats.spellsCastThisTurn = (player.combatStats.spellsCastThisTurn ?? 0) + 1;

  let draws = 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "DRAW_ON_SPELL_CAST") {
        draws += modifier.amount;
      }
    }
  }
  if (draws > 0) {
    drawCardsForPlayer(state, playerId, draws, { inFlightCardIds });
  }
}

/**
 * Astrologers — Crazy Wizard: the first resolved spell card each player would
 * leave in their discard returns to hand. Ongoing cards are already held out of
 * discard, so they are not moved prematurely.
 */
export function maybeReturnFirstSpellToHand(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId
): boolean {
  const astrologers = state.adventure?.astrologers;
  const active = astrologers?.activeCardId
    ? astrologersCardDefinitions[astrologers.activeCardId]
    : undefined;
  if (!astrologers || active?.effect.type !== "FIRST_SPELL_RETURNS") {
    return false;
  }
  if (astrologers.crazyWizardUsedBy.includes(playerId)) {
    return false;
  }

  const player = state.players[playerId];
  const discardIndex = player?.discard.lastIndexOf(cardId) ?? -1;
  if (!player || discardIndex === -1) {
    return false;
  }

  player.discard.splice(discardIndex, 1);
  player.hand.push(cardId);
  astrologers.crazyWizardUsedBy.push(playerId);
  appendEvent(state, {
    type: "SPELL_RETURNED_TO_HAND",
    playerId,
    cardId,
    reason: "Crazy Wizard"
  });
  return true;
}
