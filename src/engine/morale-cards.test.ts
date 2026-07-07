import { describe, expect, it } from "vitest";
import { MORALE_NEGATIVE_DECK_ID, MORALE_POSITIVE_DECK_ID } from "@/data/cards/morale";
import { applyAction, changeMorale, createAdventureGameState, type GameAction, type GameState } from "./index";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("Morale Cards optional rule", () => {
  it("draws a Positive Morale card instead of storing a positive morale token", () => {
    const state = createAdventureGameState({ seed: "morale-positive", moraleCards: true, rollFirstPlayer: false });
    const before = state.decks[MORALE_POSITIVE_DECK_ID].drawPile.length;

    changeMorale(state, "p1", 1);

    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.moraleOverflow ?? 0).toBe(0);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(1);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile).toHaveLength(before - 1);
  });

  it("positive morale discards one held Negative Morale card before drawing positive", () => {
    const state = createAdventureGameState({ seed: "morale-cancel", moraleCards: true, rollFirstPlayer: false });

    changeMorale(state, "p1", -1);
    const negative = state.players.p1.moraleCards?.negative[0];
    expect(negative).toBeTruthy();

    changeMorale(state, "p1", 1);

    expect(state.players.p1.moraleCards?.negative).toHaveLength(0);
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_NEGATIVE_DECK_ID].discardPile).toContain(negative);
  });

  it("caps held Positive Morale cards at two through a discard choice", () => {
    let state = createAdventureGameState({ seed: "morale-cap", moraleCards: true, rollFirstPlayer: false });
    state.decks[MORALE_POSITIVE_DECK_ID].drawPile = [
      "morale.positive.redraw_hand",
      "morale.positive.reroll_die",
      "morale.positive.combat_draw"
    ];

    changeMorale(state, "p1", 1);
    changeMorale(state, "p1", 1);
    changeMorale(state, "p1", 1);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("morale-positive-limit");
    expect(state.players.p1.moraleCards?.positive).toHaveLength(3);

    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: 1
    });

    expect(state.players.p1.moraleCards?.positive).toHaveLength(2);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].discardPile).toHaveLength(1);
    expect(state.pendingChoice).toBeNull();
  });

  it("reshuffles a morale discard pile when the matching morale deck is empty", () => {
    const state = createAdventureGameState({ seed: "morale-reshuffle", moraleCards: true, rollFirstPlayer: false });
    state.decks[MORALE_POSITIVE_DECK_ID].drawPile = [];
    state.decks[MORALE_POSITIVE_DECK_ID].discardPile = ["morale.positive.reroll_die"];

    changeMorale(state, "p1", 1);

    expect(state.players.p1.moraleCards?.positive).toEqual(["morale.positive.reroll_die"]);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].discardPile).toHaveLength(0);
    expect(
      state.eventLog.some((event) => event.type === "MORALE_CARD_DRAWN" && event.reshuffledDiscard)
    ).toBe(true);
  });

  it("uses the Positive Morale redraw card and returns it to the deck bottom", () => {
    let state = createAdventureGameState({ seed: "morale-redraw", moraleCards: true, rollFirstPlayer: false });
    state.players.p1.moraleCards = { positive: ["morale.positive.redraw_hand"], negative: [] };
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.deck = ["stat.defense"];

    state = apply(state, {
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "redraw",
      discardCardIds: ["stat.attack"]
    });

    expect(state.players.p1.hand).toEqual(["stat.defense"]);
    expect(state.players.p1.discard).toContain("stat.attack");
    expect(state.players.p1.moraleCards?.positive).toHaveLength(0);
    expect(state.decks[MORALE_POSITIVE_DECK_ID].drawPile[0]).toBe("morale.positive.redraw_hand");
  });
});
