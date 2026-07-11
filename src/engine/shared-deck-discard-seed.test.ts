import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./index";
import { SHARED_DECK_IDS } from "./decks";
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
