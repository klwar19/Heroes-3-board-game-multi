import { describe, expect, it } from "vitest";
import type { MapFieldState } from "./state";
import {
  beginFieldVisit,
  DRAGON_UTOPIA_GUARD_IDS,
  drawGuardArmy,
  getMainHero,
  makeCombatUnitFromNeutral,
  NEUTRAL_DECK_IDS
} from "./adventure";
import { coreUnitDefinitions } from "@/data/factions/units";
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

describe("Random Town", () => {
  it("is defended by an unused faction's Packs: 1 bronze, 2 silver, 2 gold", () => {
    // Default players are Castle and Necropolis, so the town faction differs.
    const state = createAdventureGameState({ seed: "town", difficulty: "normal", rollFirstPlayer: false });
    const field = fieldWith("random_town");

    const draws = drawGuardArmy(state, field, 7);
    expect(field.faction).toBeTruthy();
    expect(["castle", "necropolis"]).not.toContain(field.faction);

    expect(draws.every((draw) => draw.factionPack && draw.bankGuard)).toBe(true);
    expect(draws.every((draw) => coreUnitDefinitions[draw.unitDefId]?.faction === field.faction)).toBe(true);
    const byTier = (tier: string) => draws.filter((draw) => draw.tier === tier).length;
    expect(byTier("bronze")).toBe(1);
    expect(byTier("silver")).toBe(2);
    expect(byTier("gold")).toBe(2);

    // The defenders fight on their Pack side, controlled by the neutrals.
    const unit = makeCombatUnitFromNeutral(draws[0], "rt1", 0);
    expect(unit?.variant).toBe("pack");
    expect(unit?.controllerId).toBe("neutrals");
  });

  it("grants +10 gold income and 10 gold when first captured", () => {
    const state = createAdventureGameState({ seed: "town2", difficulty: "normal", rollFirstPlayer: false });
    const field = fieldWith("random_town");
    field.everFlagged = false;
    state.adventure!.fields[field.spaceId] = field;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;

    const goldBefore = state.players.p1.resources.gold;
    const productionBefore = state.players.p1.production.gold;

    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect(field.flagOwnerId).toBe("p1");
    expect(state.players.p1.production.gold).toBe(productionBefore + 10);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 10);
  });
});
