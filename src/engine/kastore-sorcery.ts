import { drawCardsForPlayer } from "./decks";
import type { CardId, GameState, PlayerId } from "./state";

/** Draw after a cast and count cards actually drawn against each capped effect. */
export function drawAfterSpellCast(state: GameState, playerId: PlayerId, inFlightCardIds: readonly CardId[]): number {
  let uncapped = 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) continue;
    for (const modifier of effect.modifiers) {
      if (modifier.type === "DRAW_ON_SPELL_CAST" && modifier.maxPerCombat === undefined) {
        uncapped += modifier.amount;
      }
    }
  }
  let draws = uncapped > 0 ? drawCardsForPlayer(state, playerId, uncapped, { inFlightCardIds }) : 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) continue;
    for (const modifier of effect.modifiers) {
      if (modifier.type !== "DRAW_ON_SPELL_CAST" || modifier.maxPerCombat === undefined) continue;
      const available = Math.max(0, modifier.maxPerCombat - (effect.spellCastDrawsUsed ?? 0));
      const granted = Math.min(modifier.amount, available);
      const actual = drawCardsForPlayer(state, playerId, granted, { inFlightCardIds });
      draws += actual;
      effect.spellCastDrawsUsed = (effect.spellCastDrawsUsed ?? 0) + actual;
    }
  }
  return draws;
}
