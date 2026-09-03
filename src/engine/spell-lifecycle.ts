import { astrologersCardDefinitions } from "@/data/cards/astrologers";
import { markEquipmentFirstSpellCast } from "./anime-equipment";
import { drawCardsForPlayer } from "./decks";
import { appendEvent } from "./events";
import { markPolishSpellRefreshedThisRound } from "./polish-spell-book";
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
 * Reserve Crazy Wizard for the Spell being played now. This deliberately marks
 * the FIRST play before its destination is known: an ongoing Spell, a cancelled
 * Spell, or one also recalled by Knowledge/Mysticism must still consume the
 * player's one Crazy Wizard return so a later Spell cannot receive it too.
 */
export function claimCrazyWizardFirstSpellReturn(
  state: GameState,
  playerId: PlayerId,
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

  astrologers.crazyWizardUsedBy.push(playerId);
  return true;
}

/** Move a previously claimed classic/old-Book Spell from discard to hand. */
export function returnCrazyWizardSpellFromDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
): boolean {
  const player = state.players[playerId];
  const discardIndex = player?.discard.lastIndexOf(cardId) ?? -1;
  if (!player || discardIndex === -1) {
    return false;
  }

  player.discard.splice(discardIndex, 1);
  player.hand.push(cardId);
  appendEvent(state, {
    type: "SPELL_RETURNED_TO_HAND",
    playerId,
    cardId,
    reason: "Crazy Wizard",
  });
  return true;
}

/** Hold a spent Polish Book Spell in play until all effects from this cast end. */
export function holdPolishBookOngoingSpell(
  state: GameState,
  playerId: PlayerId,
  spellCardId: CardId,
  ongoingEffectIds: readonly string[],
  returnTo: "spellBook" | "spellBookUsed",
): boolean {
  if (ongoingEffectIds.length === 0) {
    return false;
  }
  const player = state.players[playerId];
  const usedIndex = player?.spellBookUsed?.lastIndexOf(spellCardId) ?? -1;
  if (!player || usedIndex === -1) {
    return false;
  }
  player.spellBookUsed!.splice(usedIndex, 1);
  (player.ongoingCards ??= []).push({
    cardId: spellCardId,
    effectIds: [...ongoingEffectIds],
    returnTo,
    usedAtRound: state.round,
  });
  return true;
}

/**
 * Polish Spell Book equivalent of returning the played Spell card: return the
 * Cast-a-Spell enabler and refresh the cast Book Spell. Crazy Wizard replaces
 * the normal used/discard destination, so it is not blocked by the optional
 * mid-round refresh limit used by effects such as Mysticism.
 */
export function returnCrazyWizardPolishBookSpell(
  state: GameState,
  playerId: PlayerId,
  spellCardId: CardId,
  castEnablerCardId?: CardId,
  ongoingEffectIds: readonly string[] = [],
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  let moved = false;
  if (castEnablerCardId) {
    const enablerIndex = player.discard.lastIndexOf(castEnablerCardId);
    if (enablerIndex !== -1) {
      player.discard.splice(enablerIndex, 1);
      player.hand.push(castEnablerCardId);
      appendEvent(state, {
        type: "SPELL_RETURNED_TO_HAND",
        playerId,
        cardId: castEnablerCardId,
        reason: "Crazy Wizard",
      });
      moved = true;
    }
  }

  const usedIndex = player.spellBookUsed?.lastIndexOf(spellCardId) ?? -1;
  if (usedIndex !== -1 && ongoingEffectIds.length > 0) {
    holdPolishBookOngoingSpell(
      state,
      playerId,
      spellCardId,
      ongoingEffectIds,
      "spellBook",
    );
    // Reserve this physical copy's one mid-round refresh while it is held. It
    // reaches the refreshed Book only when the lasting effect actually ends.
    markPolishSpellRefreshedThisRound(player, spellCardId);
    return true;
  }
  if (usedIndex !== -1) {
    player.spellBookUsed!.splice(usedIndex, 1);
    player.spellBook.push(spellCardId);
    markPolishSpellRefreshedThisRound(player, spellCardId);
    appendEvent(state, {
      type: "SPELL_RETURNED_TO_HAND",
      playerId,
      cardId: spellCardId,
      reason: "Crazy Wizard (Spell Book refresh)",
    });
    moved = true;
  }
  return moved;
}
