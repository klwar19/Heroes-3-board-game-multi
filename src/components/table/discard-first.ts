import type { CardLibrary, CardPlayCost, GameAction } from "@/engine/state";
import type { CardBoardAction } from "./utils";

// ---------------------------------------------------------------------------
// "Discard first to use" (house rule) — pure decision helpers.
//
// A board-target card that also carries a printed discard cost (the Frost Ring
// specialties, Xyron's Inferno specialty, …) used to make the player pick the
// target FIRST and only then choose the discard — awkward, because you commit
// to a space before you know you can pay. These helpers move the discard to the
// moment the card is SELECTED: pay the discard, THEN aim. The chosen payment is
// remembered (an `ArmedCardPayment`) and re-attached when the board target is
// finally clicked, so the play reaches the engine already paid.
//
// The engine play itself is unchanged — it always receives one PLAY_CARD with
// `costCardIds`; only the ORDER in which the client collects the target and the
// payment differs. These functions are the client-side ordering logic, kept
// pure (no React) so they can be unit-tested directly.
// ---------------------------------------------------------------------------

/** The discard payment banked for a selected board-target card, awaiting its target. */
export type ArmedCardPayment = {
  cardId: string;
  /** The CHOOSE_ONE option the cost belongs to (undefined for a single-effect card). */
  optionIndex?: number;
  /** The hand card ids chosen to pay the discard. */
  costCardIds: string[];
};

/** Whether a cost object actually charges a card discard (exact or up-to). */
export function costChargesDiscard(cost: CardPlayCost | undefined): cost is CardPlayCost {
  return Boolean(cost) && (cost!.discardCards !== undefined || cost!.discardCardsUpTo !== undefined);
}

/**
 * The discard cost a board-target play must pay UP FRONT, or undefined when the
 * play has no such cost (so it needs no discard-first step). Only PLAY_CARD
 * options carry these discard costs; a CAST_SPELL never does.
 */
export function boardCardDiscardCost(
  action: CardBoardAction,
  cardLibrary: CardLibrary
): CardPlayCost | undefined {
  if (action.type !== "PLAY_CARD") {
    return undefined;
  }
  const card = cardLibrary[action.cardId];
  if (card?.effect.type !== "CHOOSE_ONE" || action.optionIndex === undefined) {
    return undefined;
  }
  const cost = card.effect.options[action.optionIndex]?.cost;
  return costChargesDiscard(cost) ? cost : undefined;
}

/**
 * The banked `costCardIds` to attach to a costed PLAY_CARD when its discard was
 * already paid at selection time, or undefined when nothing matching is armed
 * (so the caller falls back to opening the discard picker). A match requires the
 * same card AND the same CHOOSE_ONE option — a payment armed for one option must
 * never be spent on a different one.
 */
export function armedPaymentFor(
  armed: ArmedCardPayment | null,
  action: Extract<GameAction, { type: "PLAY_CARD" }>
): string[] | undefined {
  if (!armed || armed.cardId !== action.cardId || armed.optionIndex !== action.optionIndex) {
    return undefined;
  }
  return armed.costCardIds;
}

/**
 * "Click to discard, then aim": in discard-first arming mode, picking the FINAL
 * card of an EXACT discard cost should bank the payment and start aiming straight
 * away — no separate "Discard, then aim" confirm click. `nextPickCount` is the
 * number of cards that WILL be picked after this click. An `up-to` cost is never
 * auto-armed (the player may want to discard fewer than the maximum, so they must
 * confirm explicitly), and neither is a non-arming ("pay & play now") picker.
 */
export function shouldAutoArmOnPick(
  pending: { exact?: number; upTo?: number; armSelection?: unknown },
  nextPickCount: number
): boolean {
  return Boolean(pending.armSelection) && pending.exact !== undefined && nextPickCount === pending.exact;
}
