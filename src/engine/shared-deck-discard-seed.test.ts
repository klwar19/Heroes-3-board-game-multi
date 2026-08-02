import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getPlayerView } from "./index";
import { refillSharedDeckDiscards, SHARED_DECK_IDS } from "./decks";
import type { GameState } from "./state";
import { cardLibrary } from "@/data/cards/library";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import { spellDeckBinhBasic, spellDeckBinhExpert, spellDeckLegacy } from "@/data/cards/spells";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";

/**
 * First-round rule (as printed): each shared deck flips its top card face-up
 * onto its discard pile at game start, so every discard pile (Abilities, Spells,
 * Artifacts — and their BINH split variants) shows one card from round 1.
 *
 * These pin the OBSERVABLE outcome — a face-up card of the RIGHT kind sits on
 * each shared discard pile, and NO card is lost from the deck's total — each
 * failing if the seeding in makeSharedDecks is removed (a bare `discardPile: []`
 * would drop every discard count to 0).
 */
describe("shared decks — first-round face-up discard seed", () => {
  /** The card kind each shared deck holds ("spells"/"spells-expert" → spell …). */
  function deckKindFor(deckId: string): "spell" | "ability" | "artifact" {
    if (deckId.startsWith("spells")) return "spell";
    if (deckId === "abilities") return "ability";
    return "artifact";
  }

  /** The full ORIGINAL card list of a deck (draw + discard must sum to this). */
  const ORIGINAL_DECK_SIZES: Record<string, number> = {
    spells: spellDeckBinhBasic.length,
    "spells-expert": spellDeckBinhExpert.length,
    abilities: abilityDeckBinh.length,
    "artifacts-minor": artifactDeckBinhMinor.length,
    "artifacts-major": artifactDeckBinhMajor.length,
    "artifacts-relic": artifactDeckBinhRelic.length
  };

  it("puts exactly one face-up card of the right kind on every BINH shared discard pile", () => {
    const state = createAdventureGameState({
      seed: "discard-seed-binh",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });

    const sharedInPlay = SHARED_DECK_IDS.filter((deckId) => Boolean(state.decks[deckId]));
    // BINH split decks: spells, spells-expert, abilities, artifacts-{minor,major,relic}.
    expect(sharedInPlay.length).toBeGreaterThanOrEqual(6);

    for (const deckId of sharedInPlay) {
      const deck = state.decks[deckId]!;
      expect(deck.discardPile, `${deckId} discard pile`).toHaveLength(1);

      const top = deck.discardPile[0];
      const card = cardLibrary[top];
      expect(card, `${deckId} seeded card ${top} exists`).toBeTruthy();
      expect(card!.kind, `${deckId} seeded card kind`).toBe(deckKindFor(deckId));

      // No card is lost: draw pile + the one face-up discard sum to the deck's
      // full original size.
      const originalSize = ORIGINAL_DECK_SIZES[deckId];
      if (originalSize !== undefined) {
        expect(deck.drawPile.length + deck.discardPile.length).toBe(originalSize);
      }
    }
  });

  it("also seeds the three legacy (non-split) decks", () => {
    const state = createAdventureGameState({
      seed: "discard-seed-legacy",
      rollFirstPlayer: false,
      houseRules: { "split-decks": false },
      players: [
        { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });

    const legacyDecks: Record<string, number> = {
      spells: spellDeckLegacy.length,
      abilities: abilityDeckLegacy.length,
      artifacts: artifactDeckLegacy.length
    };

    for (const [deckId, originalSize] of Object.entries(legacyDecks)) {
      const deck = state.decks[deckId];
      expect(deck, `${deckId} deck exists in legacy mode`).toBeTruthy();
      expect(deck!.discardPile, `${deckId} discard pile`).toHaveLength(1);
      expect(cardLibrary[deck!.discardPile[0]]?.kind).toBe(deckKindFor(deckId));
      expect(deck!.drawPile.length + deck!.discardPile.length).toBe(originalSize);
    }
  });
});

// ---------------------------------------------------------------------------
// The face-up card is a STANDING invariant, not just a setup flourish: taking
// the last discarded card flips the deck's next card into its place.
// ---------------------------------------------------------------------------
describe("shared decks — the discard pile is refilled when its last card is taken", () => {
  /** A game whose shared discard piles were just emptied (the last card taken). */
  function gameWithEmptyDiscards(seed: string): { state: GameState } {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    // Simulate every shared discard pile being emptied at an action boundary.
    for (const deckId of SHARED_DECK_IDS) {
      const deck = state.decks[deckId];
      if (deck) {
        deck.discardPile = [];
      }
    }
    return { state };
  }

  it("flips one card of the right kind back onto EVERY emptied shared discard pile", () => {
    const { state } = gameWithEmptyDiscards("discard-refill");
    const drawBefore = Object.fromEntries(
      SHARED_DECK_IDS.filter((id) => state.decks[id]).map((id) => [id, state.decks[id]!.drawPile.length])
    );

    refillSharedDeckDiscards(state);

    for (const deckId of SHARED_DECK_IDS) {
      const deck = state.decks[deckId];
      if (!deck) {
        continue;
      }
      expect(deck.discardPile, `${deckId} refilled discard`).toHaveLength(1);
      expect(cardLibrary[deck.discardPile[0]], `${deckId} refilled card exists`).toBeTruthy();
      // The card came from THIS deck's own draw pile — nothing created or lost.
      expect(deck.drawPile.length).toBe(drawBefore[deckId] - 1);
    }
  });

  it("is idempotent, immediately repairs an already-empty pile, and handles an exhausted deck", () => {
    const { state } = gameWithEmptyDiscards("discard-refill-idempotent");
    refillSharedDeckDiscards(state);
    const snapshot = JSON.stringify(state.decks);
    refillSharedDeckDiscards(state);
    // CONTROL: a second pass moves nothing, so repeated enforcement can never
    // strip the draw pile card by card.
    expect(JSON.stringify(state.decks)).toBe(snapshot);

    // A pile that was already empty when the action started is still repaired.
    const abilities = state.decks.abilities!;
    const drawTop = abilities.drawPile[abilities.drawPile.length - 1];
    const drawLength = abilities.drawPile.length;
    abilities.discardPile = [];
    refillSharedDeckDiscards(state);
    expect(abilities.discardPile).toEqual([drawTop]);
    expect(abilities.drawPile).toHaveLength(drawLength - 1);

    // A deck with nothing left at all is left alone (no crash, no phantom card).
    abilities.discardPile = [];
    abilities.drawPile = [];
    refillSharedDeckDiscards(state);
    expect(abilities.discardPile).toEqual([]);
  });

  it("refills every split Artifact and Spell discard while a choice is open", () => {
    const state = createAdventureGameState({ seed: "discard-refill-open-choice", rollFirstPlayer: false });
    const requiredDeckIds = [
      "artifacts-minor",
      "artifacts-major",
      "artifacts-relic",
      "spells",
      "spells-expert"
    ] as const;
    const expectedTops = Object.fromEntries(
      requiredDeckIds.map((deckId) => {
        const deck = state.decks[deckId]!;
        const top = deck.drawPile.at(-1)!;
        deck.discardPile = [];
        return [deckId, top];
      })
    );
    state.pendingChoice = {
      id: "choice_discard_invariant",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Test choice",
      options: [{ label: "Continue" }],
      context: "deck-search-mode",
      returnPhase: "player-turn"
    };

    refillSharedDeckDiscards(state);

    for (const deckId of requiredDeckIds) {
      expect(state.decks[deckId]!.discardPile, `${deckId} discard`).toEqual([expectedTops[deckId]]);
    }
  });

  it("never renders an already-empty restored shared discard", () => {
    const state = createAdventureGameState({ seed: "discard-refill-restored-view", rollFirstPlayer: false });
    const major = state.decks["artifacts-major"]!;
    const expectedTop = major.drawPile.at(-1)!;
    major.discardPile = [];

    const view = getPlayerView(state, "p1");

    expect(view.decks["artifacts-major"]!.discardPile).toEqual([expectedTop]);
    expect(view.decks["artifacts-major"]!.drawCount).toBe(major.drawPile.length - 1);
    // Rendering is detached: the authoritative state is repaired at the next
    // action boundary, not mutated by a read.
    expect(major.discardPile).toEqual([]);
  });

  it("seeds an empty discard BEFORE Search (2), then reveals only the next two draw-pile cards", () => {
    const state = createInitialGameState("discard-seed-before-search");
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    const spells = state.decks.spells!;
    const abilities = state.decks.abilities!;
    spells.discardPile = [];
    abilities.discardPile = [];
    const originalTop = spells.drawPile.at(-1)!;
    const abilityTop = abilities.drawPile.at(-1)!;
    const expectedRevealed = [spells.drawPile.at(-2)!, spells.drawPile.at(-3)!];

    const opened = applyAction(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    expect(opened.errors.map((error) => error.message)).toEqual([]);
    const choice = opened.state.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    expect(opened.state.decks.spells!.discardPile).toEqual([originalTop]);
    // The transaction tail repairs every OTHER already-empty shared discard as
    // well, even though this action left a card-selection prompt open.
    expect(opened.state.decks.abilities!.discardPile).toEqual([abilityTop]);

    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds).toEqual(expectedRevealed);
      expect(choice.revealedCardIds).not.toContain(originalTop);
    }
    expect(opened.state.decks.spells!.discardPile).toEqual([originalTop]);
  });

  it("runs at the tail of a REAL action: taking the search's discard top leaves a NEW face-up card", () => {
    const state = createInitialGameState("discard-refill-action");
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    const spells = state.decks.spells!;
    // Exactly one card face-up on the pile — the state right after the previous
    // taker emptied it down to the last card.
    spells.discardPile = [spells.drawPile.pop() as string];
    const taken = spells.discardPile[0];
    const drawBefore = spells.drawPile.length;

    // A Search with a non-empty discard first offers "Search the deck, or take
    // its top discard?"; option 1 takes the discard top, emptying the pile.
    const searching = applyAction(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    expect(searching.errors.map((error) => error.message)).toEqual([]);
    const prompt = searching.state.pendingChoice;
    if (prompt?.type !== "OPTION_CHOICE" || prompt.context !== "deck-search-mode") {
      throw new Error("Expected the Search-or-take-discard choice.");
    }
    const took = applyAction(searching.state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: prompt.id,
      optionIndex: 1
    });
    expect(took.errors.map((error) => error.message)).toEqual([]);
    expect(took.state.players.p1.hand).toContain(taken);

    // The taken card left the pile — and the tail invariant immediately flipped
    // the deck's next card face-up in its place (never an empty discard pile).
    const after = took.state.decks.spells!;
    expect(after.discardPile).toHaveLength(1);
    expect(after.discardPile[0]).not.toBe(taken);
    expect(cardLibrary[after.discardPile[0]]?.kind).toBe("spell");
    expect(after.drawPile.length).toBe(drawBefore - 1);
  });
});
