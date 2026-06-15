import { describe, expect, it } from "vitest";
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
 * Every fully-implemented Artifact, Spell and Ability must be reachable in a
 * game — i.e. present in at least one shared draw deck (legacy or BINH).
 * Statistics (built into hero starting decks), hero specialties (dealt per
 * hero), war machines (bought at the Factory/Trading Post) and Pandora cards
 * (their own deck) are acquired through other channels and are excluded.
 *
 * This guards against the "implemented but orphaned" trap: a card whose effect
 * runs and is tested, yet can never be drawn because nobody added it to a deck.
 */
describe("deck coverage", () => {
  const decked = new Set<string>([
    ...artifactDeckLegacy,
    ...artifactDeckBinhMinor,
    ...artifactDeckBinhMajor,
    ...artifactDeckBinhRelic,
    ...spellDeckLegacy,
    ...spellDeckBinhBasic,
    ...spellDeckBinhExpert,
    ...abilityDeckLegacy,
    ...abilityDeckBinh
  ]);

  const DECK_KINDS = new Set(["artifact", "spell", "ability"]);

  it("places every implemented artifact, spell and ability in a draw deck", () => {
    const orphaned = Object.entries(cardLibrary)
      .filter(([, card]) => card.implementationStatus === "implemented" && DECK_KINDS.has(card.kind))
      .map(([id]) => id)
      .filter((id) => !decked.has(id))
      .sort();

    expect(orphaned).toEqual([]);
  });

  it("references only known cards from the deck lists", () => {
    const unknown = [...decked].filter((id) => !cardLibrary[id]).sort();
    expect(unknown).toEqual([]);
  });

  it("never deals a not-implemented card into a deck", () => {
    const inert = [...decked]
      .filter((id) => cardLibrary[id] && cardLibrary[id].implementationStatus !== "implemented")
      .sort();
    expect(inert).toEqual([]);
  });
});
