import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { openSharedDeckSearch } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

/**
 * Pendant of Courage (major artifact): "Play immediately AFTER you perform a
 * Search action and perform that action again. — OR — Gain 1 expert use."
 *
 * The repeat-Search side is a POST-Search choice, not a pre-armed modifier you
 * click before searching: right after a Search(X) resolves, its holder is
 * offered to discard the Pendant and run the SAME Search(X) again — and keeps
 * the card the first Search gained. Each test fails if that wiring is removed.
 */

const PENDANT = "artifact.pendant_of_courage";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

// Isolate a Spell-deck Search from the first-round face-up seed on the Spell
// discards, so the Search opens straight onto its DECK_SEARCH reveal instead of
// the incidental "Search, or take the top discard?" mode prompt.
function clearSpellDiscardSeed(state: GameState): void {
  state.decks.spells.discardPile = [];
  if (state.decks["spells-expert"]) {
    state.decks["spells-expert"].discardPile = [];
  }
}

function resolveSearch(state: GameState): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type).toBe("DECK_SEARCH");
  if (choice?.type !== "DECK_SEARCH") {
    return state;
  }
  return apply(state, {
    type: "RESOLVE_DECK_SEARCH",
    playerId: "p1",
    choiceId: choice.id,
    pick: { kind: "revealed", index: 0 }
  });
}

describe("Pendant of Courage — repeat a Search as a post-Search choice", () => {
  it("after a Search resolves, the holder is offered to discard the Pendant and repeat the SAME Search — keeping the gained card", () => {
    let state = makeGame("pendant-repeat");
    state.players.p1.hand = [PENDANT];
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);

    const searchChoice = state.pendingChoice;
    const gained = searchChoice?.type === "DECK_SEARCH" ? searchChoice.revealedCardIds[0] : "";
    state = resolveSearch(state);
    // The card the first Search picked is in hand (the Pendant, unlike the
    // morale card, does NOT trade it away).
    expect(state.players.p1.hand).toContain(gained);

    // The post-Search offer opened.
    const offer = state.pendingChoice;
    expect(offer?.type).toBe("OPTION_CHOICE");
    if (offer?.type !== "OPTION_CHOICE") {
      return;
    }
    expect(offer.context).toBe("pendant-repeat-search");

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: offer.id, optionIndex: 0 });

    // The Pendant was spent (discarded), the gained card stays in hand…
    expect(state.players.p1.hand).not.toContain(PENDANT);
    expect(state.players.p1.discard).toContain(PENDANT);
    expect(state.players.p1.hand).toContain(gained);

    // …and the SAME Search (2) runs again. The first search's leftover now sits
    // in the spells discard, so the re-run opens the Search-or-take-discard-top
    // mode prompt first — commit to Searching.
    const mode = state.pendingChoice;
    expect(mode?.type === "OPTION_CHOICE" ? mode.context : mode?.type).toBe("deck-search-mode");
    if (mode?.type === "OPTION_CHOICE") {
      state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: mode.id, optionIndex: 0 });
    }
    const repeat = state.pendingChoice;
    expect(repeat?.type).toBe("DECK_SEARCH");
    if (repeat?.type === "DECK_SEARCH") {
      expect(repeat.revealedCardIds).toHaveLength(2); // the SAME Search (2)
    }
  });

  it("declining keeps the Pendant and does NOT re-run the Search", () => {
    let state = makeGame("pendant-decline");
    state.players.p1.hand = [PENDANT];
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    state = resolveSearch(state);

    const offer = state.pendingChoice;
    expect(offer?.type === "OPTION_CHOICE" ? offer.context : null).toBe("pendant-repeat-search");
    if (offer?.type !== "OPTION_CHOICE") {
      return;
    }
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: offer.id, optionIndex: 1 });

    // The Pendant is still in hand, unspent; no new Search opened.
    expect(state.players.p1.hand).toContain(PENDANT);
    expect(state.players.p1.discard).not.toContain(PENDANT);
    expect(state.pendingChoice).toBeNull();
  });

  it("CONTROL: with no Pendant in hand, a Search resolves with NO repeat offer", () => {
    let state = makeGame("pendant-control");
    state.players.p1.hand = []; // no Pendant
    clearSpellDiscardSeed(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    state = resolveSearch(state);

    // No offer — the Search just resolves.
    expect(state.pendingChoice).toBeNull();
  });

  it("CONTROL: the repeat-Search side is never offered as a hand play (pre-activation is gone)", () => {
    const state = makeGame("pendant-no-preactivation");
    state.players.p1.hand = [PENDANT];
    const optionZeroPlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === PENDANT &&
        legal.action.optionIndex === 0
    );
    expect(optionZeroPlay, "the repeat-Search side must not be a hand play").toBeFalsy();
    // But the expert-use side (option 1) still is.
    const optionOnePlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === PENDANT &&
        legal.action.optionIndex === 1
    );
    expect(optionOnePlay, "the expert-use side is still a normal hand play").toBeTruthy();
  });
});
