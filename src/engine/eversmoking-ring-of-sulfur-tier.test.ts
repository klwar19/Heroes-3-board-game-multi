import { EVERSMOKING_RING_OF_SULFUR_ID } from "@/data/cards/artifacts";
import { cardLibrary } from "@/data/cards/library";
import { describe, expect, it } from "vitest";
import { createAdventureGameState, eligibleArtifactDecks, getMainHero } from "./index";
import { ARTIFACT_DECK_MAJOR, ARTIFACT_DECK_MINOR, effectiveArtifactTier } from "./ruleset";
import type { GameRuleset, GameState, HouseRuleId } from "./state";

const RING = EVERSMOKING_RING_OF_SULFUR_ID;

function makeGame(
  overrides: { ruleset?: GameRuleset; houseRules?: Partial<Record<HouseRuleId, boolean>> } = {}
): GameState {
  return createAdventureGameState({
    seed: "ring-of-sulfur-tier",
    ruleset: overrides.ruleset ?? "binh",
    rollFirstPlayer: false,
    houseRules: overrides.houseRules,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Gelu", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
}

function deckHas(state: GameState, deckId: string, cardId: string): boolean {
  const deck = state.decks[deckId];
  return Boolean(deck) && (deck!.drawPile.includes(cardId) || deck!.discardPile.includes(cardId));
}

describe("eversmoking-ring-of-sulfur-major house rule", () => {
  it("keeps the printed card tier Minor while BINH defaults its effective tier and deck to Major", () => {
    const state = makeGame();

    expect(cardLibrary[RING]?.artifactTier).toBe("minor");
    expect(state.adventure?.houseRules?.["eversmoking-ring-of-sulfur-major"]).toBe(true);
    expect(effectiveArtifactTier(state, RING)).toBe("major");
    expect(deckHas(state, ARTIFACT_DECK_MAJOR, RING)).toBe(true);
    expect(deckHas(state, ARTIFACT_DECK_MINOR, RING)).toBe(false);
  });

  it("leaves Legacy on the printed Minor tier", () => {
    const state = makeGame({ ruleset: "legacy" });

    expect(state.adventure?.houseRules?.["eversmoking-ring-of-sulfur-major"]).toBe(false);
    expect(effectiveArtifactTier(state, RING)).toBe("minor");
    expect(deckHas(state, "artifacts", RING)).toBe(true);
  });

  it("moves the Ring back to BINH Minor when the house rule is disabled", () => {
    const state = makeGame({ houseRules: { "eversmoking-ring-of-sulfur-major": false } });

    expect(effectiveArtifactTier(state, RING)).toBe("minor");
    expect(deckHas(state, ARTIFACT_DECK_MINOR, RING)).toBe(true);
    expect(deckHas(state, ARTIFACT_DECK_MAJOR, RING)).toBe(false);
  });

  it("keeps the re-tiered Ring out of a fresh hero's Minor-only artifact access", () => {
    const on = makeGame();
    const off = makeGame({ houseRules: { "eversmoking-ring-of-sulfur-major": false } });

    expect(eligibleArtifactDecks(on, "p1", getMainHero(on, "p1"), false)).toEqual([ARTIFACT_DECK_MINOR]);
    expect(deckHas(on, ARTIFACT_DECK_MINOR, RING)).toBe(false);
    expect(eligibleArtifactDecks(off, "p1", getMainHero(off, "p1"), false)).toEqual([ARTIFACT_DECK_MINOR]);
    expect(deckHas(off, ARTIFACT_DECK_MINOR, RING)).toBe(true);
  });
});
