import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction } from "@/engine/state";
import type { CardBoardAction } from "./utils";
import { armedPaymentFor, boardCardDiscardCost, costChargesDiscard } from "./discard-first";

type PlayCardAction = Extract<GameAction, { type: "PLAY_CARD" }>;

// ---------------------------------------------------------------------------
// "Discard first to use" — the pure client-ordering helpers. These decide WHEN
// the discard for a board-target play (Frost Ring / Xyron's Inferno specialties)
// is collected: up front at selection, then aim. Real card fixtures are used so
// a data change that drops the discard cost is caught here too.
// ---------------------------------------------------------------------------

/** A board-target PLAY_CARD for `cardId`'s option `optionIndex`, on space 9. */
function ringPlay(cardId: string, optionIndex: number): PlayCardAction {
  return {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId,
    mode: "basic",
    optionIndex,
    target: { type: "space", position: 9 }
  };
}

describe("costChargesDiscard", () => {
  it("is true only when a card discard is actually charged", () => {
    expect(costChargesDiscard(undefined)).toBe(false);
    expect(costChargesDiscard({})).toBe(false);
    expect(costChargesDiscard({ resources: { gold: 1 } })).toBe(false);
    expect(costChargesDiscard({ discardCards: 1 })).toBe(true);
    expect(costChargesDiscard({ discardCardsUpTo: 2 })).toBe(true);
  });
});

describe("boardCardDiscardCost — the discard a board-target play pays up front", () => {
  it("returns the Frost Ring specialty's 1-card discard (Glacius I / Adelaide I)", () => {
    // Guard the fixture: option 0 really carries the discard cost.
    for (const id of ["specialty.glacius.1", "specialty.adelaide.1"] as const) {
      const effect = cardLibrary[id].effect;
      expect(effect.type).toBe("CHOOSE_ONE");
      const cost = boardCardDiscardCost(ringPlay(id, 0), cardLibrary);
      expect(cost?.discardCards, `${id} pays a 1-card discard up front`).toBe(1);
    }
  });

  it("returns undefined for a board-target play with no discard cost (Luna's Fire Wall I)", () => {
    // Fire Wall I places a token on an empty space — a board-target play, but no
    // discard cost, so it must NOT trigger the discard-first picker.
    expect(boardCardDiscardCost(ringPlay("specialty.luna.1", 0), cardLibrary)).toBeUndefined();
  });

  it("returns undefined for a non-CHOOSE_ONE / missing option / CAST_SPELL", () => {
    // A CAST_SPELL never carries a printed discard cost of this kind.
    const cast: GameAction = { type: "CAST_SPELL", playerId: "p1", cardId: "spell.frost_ring", target: { type: "space", position: 9 } };
    expect(boardCardDiscardCost(cast as CardBoardAction, cardLibrary)).toBeUndefined();
    // A PLAY_CARD with no optionIndex can't resolve to a costed option.
    expect(
      boardCardDiscardCost({ type: "PLAY_CARD", playerId: "p1", cardId: "specialty.glacius.1", mode: "basic" }, cardLibrary)
    ).toBeUndefined();
  });
});

describe("armedPaymentFor — re-attaching a banked discard to the right play", () => {
  const armed = { cardId: "specialty.glacius.1", optionIndex: 0, costCardIds: ["stat.attack"] };

  it("returns the banked payment for the matching card AND option", () => {
    expect(armedPaymentFor(armed, ringPlay("specialty.glacius.1", 0))).toEqual(["stat.attack"]);
  });

  it("never spends a payment armed for a different card or option", () => {
    expect(armedPaymentFor(armed, ringPlay("specialty.adelaide.1", 0)), "different card").toBeUndefined();
    expect(armedPaymentFor(armed, ringPlay("specialty.glacius.1", 1)), "different option").toBeUndefined();
    expect(armedPaymentFor(null, ringPlay("specialty.glacius.1", 0)), "nothing armed").toBeUndefined();
  });
});
