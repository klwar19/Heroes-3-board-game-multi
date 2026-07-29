import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./index";
import {
  drawNeutralArmy,
  LEVEL_V_SIGNATURE_NEUTRAL_IDS,
  NEUTRAL_DECK_IDS
} from "./adventure";
import type { GameState } from "./state";

const SIGNATURES = new Set<string>(LEVEL_V_SIGNATURE_NEUTRAL_IDS);

function game(seed: string, enabled: boolean): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "level-v-signature-neutral": enabled }
  });
}

function setGoldDeck(state: GameState, drawPile: string[], discardPile: string[] = []): void {
  state.decks[NEUTRAL_DECK_IDS.gold]!.drawPile = [...drawPile];
  state.decks[NEUTRAL_DECK_IDS.gold]!.discardPile = [...discardPile];
}

describe("global house rule: Field-Difficulty V signature Neutral", () => {
  it("ON: replaces the level-V row's golden draw with an available signature guard", () => {
    const state = game("level-v-signature-on", true);
    // Top is Champions. The guarantee must deliberately pull Archangels rather
    // than relying on the ordinary top-card draw.
    setGoldDeck(state, ["neutral.archangels", "neutral.champions"]);

    const draws = drawNeutralArmy(state, 5);
    expect(draws).toHaveLength(4); // Normal V stays 1 bronze + 2 silver + 1 gold.
    expect(draws.filter((draw) => draw.tier === "gold")).toEqual([
      { unitDefId: "neutral.archangels", tier: "gold" }
    ]);
    expect(state.decks[NEUTRAL_DECK_IDS.gold]!.drawPile).toContain("neutral.champions");
  });

  it("ON: can recover a signature card from the golden discard without changing army size", () => {
    const state = game("level-v-signature-discard", true);
    setGoldDeck(state, ["neutral.champions"], ["neutral.ghost_dragons"]);

    const draws = drawNeutralArmy(state, 5);
    expect(draws).toHaveLength(4);
    expect(draws.some((draw) => draw.unitDefId === "neutral.ghost_dragons")).toBe(true);
    expect(state.decks[NEUTRAL_DECK_IDS.gold]!.discardPile).not.toContain("neutral.ghost_dragons");
  });

  it("ON: mints a temporary signature guard if all three unique cards are already outside the deck", () => {
    const state = game("level-v-signature-temporary", true);
    setGoldDeck(state, ["neutral.champions"]);

    const draws = drawNeutralArmy(state, 5);
    const gold = draws.find((draw) => draw.tier === "gold");
    expect(gold && SIGNATURES.has(gold.unitDefId)).toBe(true);
    expect(gold?.bankGuard, "temporary duplicate must never recycle into the shared deck").toBe(true);
    expect(draws).toHaveLength(4);
  });

  it("OFF and non-V controls keep the ordinary top-card draw unchanged", () => {
    const off = game("level-v-signature-off", false);
    setGoldDeck(off, ["neutral.archangels", "neutral.champions"]);
    const offDraws = drawNeutralArmy(off, 5);
    expect(offDraws.find((draw) => draw.tier === "gold")?.unitDefId).toBe("neutral.champions");

    const levelSix = game("level-v-signature-level-six", true);
    setGoldDeck(levelSix, [
      "neutral.archangels",
      "neutral.black_dragons",
      "neutral.ghost_dragons",
      "neutral.dread_knights",
      "neutral.champions"
    ]);
    const sixGold = drawNeutralArmy(levelSix, 6).filter((draw) => draw.tier === "gold");
    expect(sixGold.map((draw) => draw.unitDefId)).toEqual([
      "neutral.champions",
      "neutral.dread_knights"
    ]);
  });
});
