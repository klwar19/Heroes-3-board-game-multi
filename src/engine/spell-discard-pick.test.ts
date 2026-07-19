import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, eliminatePlayer, type GameAction, type GameState } from "./index";
import { openSharedDeckSearch } from "./adventure-reducer";
import { MORALE_CARD_IDS } from "@/data/cards/morale";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function mapHand(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

describe("Spell search — pick which discarded spell to take (not only top)", () => {
  it("offers every acquirable discarded spell as a take option (CONTROL: abilities stay top-only)", () => {
    const state = mapHand("spell-discard-pick");
    // Seed three distinct basic spells in the spell discard; any may be taken.
    state.decks.spells.discardPile = ["spell.bless", "spell.haste", "spell.curse"];
    state.decks.spells.drawPile = ["spell.magic_arrow", "spell.protection_from_air"];
    // Clear Scouting so the search-mode choice opens immediately.
    state.players.p1.hand = state.players.p1.hand.filter((id) => id !== "ability.scouting");

    openSharedDeckSearch(state, "p1", "spells", 2);

    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected deck-search-mode");
    }
    expect(state.pendingChoice.context).toBe("deck-search-mode");
    const labels = state.pendingChoice.options.map((o) => o.label);
    expect(labels[0]).toMatch(/Search \(2\)/);
    // All three discarded spells are offered (order follows discard pile).
    expect(labels.some((l) => /Bless/i.test(l))).toBe(true);
    expect(labels.some((l) => /Haste/i.test(l))).toBe(true);
    expect(labels.some((l) => /Curse/i.test(l))).toBe(true);
    expect(state.pendingChoice.deckSearchMode?.discardPickCardIds?.length).toBe(3);

    // Take Haste (not necessarily the top).
    const hasteIndex = labels.findIndex((l) => /Haste/i.test(l));
    const after = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: hasteIndex
    });
    expect(after.players.p1.hand).toContain("spell.haste");
    expect(after.decks.spells.discardPile).not.toContain("spell.haste");
  });

  it("after a Spell Search with 2+ unkept cards, the searcher picks the face-up discard top", () => {
    let state = mapHand("spell-discard-top");
    state.players.p1.hand = state.players.p1.hand.filter((id) => id !== "ability.scouting");
    // Empty discard so openSharedDeckSearch goes straight to reveal.
    // Use the split basic spell deck id the adventure actually ships.
    const spellDeckId = state.decks["spells-basic"] ? "spells-basic" : "spells";
    const deck = state.decks[spellDeckId]!;
    deck.discardPile = [];
    deck.drawPile = ["spell.bless", "spell.haste", "spell.curse"];

    openSharedDeckSearch(state, "p1", spellDeckId, 3);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected DECK_SEARCH");
    }
    const choiceId = state.pendingChoice.id;
    // Keep the first revealed card; the other two need a face-up pick.
    const keptId = state.pendingChoice.revealedCardIds[0];
    state = applyOk(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId,
      pick: { kind: "revealed", index: 0 }
    });
    expect(state.players.p1.hand).toContain(keptId);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected spell-discard-top");
    }
    expect(state.pendingChoice.context).toBe("spell-discard-top");
    expect(state.pendingChoice.options.length).toBe(2);

    // Choose the second unkept card as face-up top.
    const faceUpId = state.pendingChoice.spellDiscardTopPick!.cardIds[1];
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 1
    });
    const discard = state.decks[spellDeckId]!.discardPile;
    expect(discard[discard.length - 1], "chosen card is face-up on top").toBe(faceUpId);
    expect(discard).toHaveLength(2);
  });

  it("the face-up pick INTERPOSES before the morale repeat-search offer — the offer still opens after the pick resolves", () => {
    let state = createAdventureGameState({
      seed: "spell-discard-top-morale",
      difficulty: "normal",
      rollFirstPlayer: false,
      moraleCards: true
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = state.players.p1.hand.filter((id) => id !== "ability.scouting");
    state.players.p1.moraleCards = { positive: [MORALE_CARD_IDS.repeatSearch], negative: [] };
    const spellDeckId = state.decks["spells-basic"] ? "spells-basic" : "spells";
    const deck = state.decks[spellDeckId]!;
    deck.discardPile = [];
    deck.drawPile = ["spell.bless", "spell.haste", "spell.curse"];

    openSharedDeckSearch(state, "p1", spellDeckId, 3);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    state = applyOk(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      pick: { kind: "revealed", index: 0 }
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("spell-discard-top");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    // The morale "repeat the Search" offer opens AFTER the pick — never swallowed.
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe(
      "morale-repeat-search"
    );
  });

  it("eliminating the picker mid-face-up-pick destroys NO shared-deck cards (they return to the discard pile)", () => {
    let state = createAdventureGameState({ seed: "spell-discard-top-elim", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.hand = state.players.p1.hand.filter((id) => id !== "ability.scouting");
    const spellDeckId = state.decks["spells-basic"] ? "spells-basic" : "spells";
    const deck = state.decks[spellDeckId]!;
    deck.discardPile = [];
    deck.drawPile = ["spell.bless", "spell.haste", "spell.curse"];

    openSharedDeckSearch(state, "p1", spellDeckId, 3);
    state = applyOk(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      pick: { kind: "revealed", index: 0 }
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("spell-discard-top");
    const parked =
      state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.spellDiscardTopPick?.cardIds ?? [] : [];
    expect(parked).toHaveLength(2);

    eliminatePlayer(state, "p1", "conceded", true);

    // The two parked spells are back in the shared discard — nothing destroyed.
    const after = state.decks[spellDeckId]!;
    for (const cardId of parked) {
      expect(after.discardPile, `${cardId} returned to the shared discard`).toContain(cardId);
    }
    expect(state.pendingChoice).toBeNull();
  });
});
