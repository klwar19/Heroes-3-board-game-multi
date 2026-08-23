import { balanceCard } from "./community-balance-cards";
import type { CardPlayCost, GameAction, GameState } from "./state";

/**
 * The printed extra price of the OPTION a `PLAY_CARD` action names — read
 * through the BALANCE libraries, i.e. exactly the definition the reducer will
 * charge (`payOptionCardCost` runs off `balanceCardLibrary`).
 *
 * WHY THIS EXISTS (2026-08-23 bug batch): the client opened its discard picker
 * from the RAW printed `cardLibrary`. Under the Community Balance pack the
 * reprint's cost and the printed cost disagree, so the picker asked for the
 * WRONG number of cards — or, when the printed side had no cost at all, never
 * opened. The play was then submitted with no `costCardIds` and the engine
 * rejected it ("… needs exactly 1 card as payment"), which is what the pack's
 * playtesters reported as "you can't discard a card and resolve" (Endless Purse
 * of Gold A), "doesn't work at all" (Everflowing Crystal Cloak, both sides) and
 * "nothing happens" (Loins of Legion B).
 *
 * ONE read shared by every surface that has to know the price BEFORE the play is
 * dispatched, so a picker can never disagree with the charge.
 */
export function balancedPlayOptionCost(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_CARD" }>
): CardPlayCost | undefined {
  const card = balanceCard(state, action.cardId);
  if (card?.effect.type !== "CHOOSE_ONE" || action.optionIndex === undefined) {
    return undefined;
  }
  return card.effect.options[action.optionIndex]?.cost;
}

/** True when this price must be paid with CARDS the player picks first. */
export function costNeedsCardPicker(cost: CardPlayCost | undefined): cost is CardPlayCost {
  return Boolean(
    cost &&
      (cost.discardCards !== undefined || cost.discardCardsUpTo !== undefined || cost.powerCost !== undefined)
  );
}
