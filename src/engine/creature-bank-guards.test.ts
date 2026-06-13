import { describe, expect, it } from "vitest";
import type { MapFieldState } from "./state";
import {
  DRAGON_UTOPIA_GUARD_IDS,
  drawGuardArmy,
  makeCombatUnitFromNeutral,
  NEUTRAL_DECK_IDS
} from "./adventure";
import { createAdventureGameState } from "./index";

function fieldWith(location: string, difficulty = 7): MapFieldState {
  return {
    spaceId: "0,0",
    tileInstanceId: "t",
    slot: 0,
    location,
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
}

describe("Dragon Utopia guards", () => {
  it("fields a fixed party of the four dragons without touching the azure deck", () => {
    const state = createAdventureGameState({ seed: "utopia", difficulty: "normal", rollFirstPlayer: false });
    const azureBefore = state.decks[NEUTRAL_DECK_IDS.azure].drawPile.length;

    const draws = drawGuardArmy(state, fieldWith("dragon_utopia"), 7);

    expect(draws.map((draw) => draw.unitDefId)).toEqual([...DRAGON_UTOPIA_GUARD_IDS]);
    expect(draws.every((draw) => draw.bankGuard === true)).toBe(true);
    expect(draws.every((draw) => draw.tier === "azure")).toBe(true);
    // Bank guards are minted, never drawn — the azure deck is untouched.
    expect(state.decks[NEUTRAL_DECK_IDS.azure].drawPile.length).toBe(azureBefore);
    expect(state.decks[NEUTRAL_DECK_IDS.azure].discardPile.length).toBe(0);

    // Minted combat units carry the bankGuard flag through to the board.
    const unit = makeCombatUnitFromNeutral(draws[0], "u1", 0);
    expect(unit?.bankGuard).toBe(true);
  });
});

describe("Cyclops Stockpile guards", () => {
  it("adds two golden Cyclopes on top of the normal Field Difficulty draw", () => {
    const state = createAdventureGameState({ seed: "stockpile", difficulty: "normal", rollFirstPlayer: false });

    const normal = drawGuardArmy(state, fieldWith("empty_field"), 7);
    const fresh = createAdventureGameState({ seed: "stockpile", difficulty: "normal", rollFirstPlayer: false });
    const stockpile = drawGuardArmy(fresh, fieldWith("cyclops_stockpile"), 7);

    const cyclopes = stockpile.filter((draw) => draw.unitDefId === "neutral.cyclopes");
    expect(cyclopes).toHaveLength(2);
    expect(cyclopes.every((draw) => draw.bankGuard === true && draw.tier === "gold")).toBe(true);
    // The two Cyclopes are added on top of the difficulty-table army.
    expect(stockpile.length).toBe(normal.length + 2);
  });
});
