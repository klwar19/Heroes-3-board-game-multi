import { describe, expect, it } from "vitest";
import type { MapFieldState } from "./state";
import {
  beginFieldVisit,
  DRAGON_UTOPIA_AZURE_SLOT_IDS,
  DRAGON_UTOPIA_GUARD_IDS,
  dragonUtopiaDifficultyGuardCount,
  drawGuardArmy,
  getMainHero,
  makeCombatUnitFromNeutral,
  NEUTRAL_DECK_IDS
} from "./adventure";
import type { GameDifficulty } from "./state";
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
  // Difficulty-7 Neutral-army totals (NEUTRAL_ARMY_TABLE) — the counts the
  // Utopia scales to when `dragon-utopia-by-difficulty` is ON (the BINH default).
  const COUNT_BY_DIFFICULTY: Record<GameDifficulty, number> = {
    easy: 1,
    normal: 2,
    hard: 3,
    impossible: 4
  };

  function utopiaDraws(seed: string, difficulty: GameDifficulty, mutate?: (state: ReturnType<typeof createAdventureGameState>) => void) {
    const state = createAdventureGameState({ seed, difficulty, rollFirstPlayer: false });
    mutate?.(state);
    const azureBefore = state.decks[NEUTRAL_DECK_IDS.azure].drawPile.length;
    const draws = drawGuardArmy(state, fieldWith("dragon_utopia"), 7);
    return { state, draws, azureBefore };
  }

  it("ALWAYS leads with exactly one azure slot (Azure/Rust/Crystal), minted, never touching the azure deck", () => {
    const { state, draws, azureBefore } = utopiaDraws("utopia", "normal");

    // The lead guard is the azure slot — one of Azure/Rust/Crystal, never fixed
    // to Azure alone. (The other dragons are also azure-TIER, so this is about
    // the featured lead, not tier uniqueness.)
    expect([...DRAGON_UTOPIA_AZURE_SLOT_IDS]).toContain(draws[0]!.unitDefId);
    // No duplicate dragons in the party (the azure-slot swap stays distinct).
    expect(new Set(draws.map((d) => d.unitDefId)).size).toBe(draws.length);

    expect(draws.every((draw) => draw.bankGuard === true)).toBe(true);
    expect(draws.every((draw) => draw.tier === "azure")).toBe(true);
    // Bank guards are minted, never drawn — the azure deck is untouched.
    expect(state.decks[NEUTRAL_DECK_IDS.azure].drawPile.length).toBe(azureBefore);
    expect(state.decks[NEUTRAL_DECK_IDS.azure].discardPile.length).toBe(0);

    const unit = makeCombatUnitFromNeutral(draws[0]!, "u1", 0);
    expect(unit?.bankGuard).toBe(true);
  });

  it("scales the guard COUNT with the game difficulty (Easy 1 / Normal 2 / Hard 3 / Impossible 4)", () => {
    for (const difficulty of ["easy", "normal", "hard", "impossible"] as const) {
      const { draws } = utopiaDraws(`utopia-${difficulty}`, difficulty);
      expect(dragonUtopiaDifficultyGuardCount(
        createAdventureGameState({ seed: "x", difficulty, rollFirstPlayer: false }),
        7
      )).toBe(COUNT_BY_DIFFICULTY[difficulty]);
      expect(draws, `${difficulty} guard count`).toHaveLength(COUNT_BY_DIFFICULTY[difficulty]);
      // The azure slot is always present, even at Easy (a lone dragon).
      expect([...DRAGON_UTOPIA_AZURE_SLOT_IDS]).toContain(draws[0]!.unitDefId);
    }
  });

  it("CONTROL: with `dragon-utopia-by-difficulty` OFF, the full FOUR-dragon party stands on Normal", () => {
    const { draws } = utopiaDraws("utopia-fixed", "normal", (state) => {
      state.adventure!.houseRules!["dragon-utopia-by-difficulty"] = false;
    });
    expect(draws).toHaveLength(4);
    // The supporting dragons remain the four-dragon set minus the azure slot's
    // pick — Rust, Crystal and Faerie always appear alongside the lead.
    expect(draws.map((d) => d.unitDefId).sort()).toEqual(
      [...DRAGON_UTOPIA_GUARD_IDS].sort()
    );
  });

  it("CONTROL: `dragon-utopia-four-dragons` OFF → the rulebook THREE-dragon pool (Azure/Crystal/Black), still difficulty-scaled", () => {
    // By-difficulty OFF too, so the whole rulebook party is visible.
    const { draws } = utopiaDraws("utopia-rulebook", "normal", (state) => {
      state.adventure!.houseRules!["dragon-utopia-four-dragons"] = false;
      state.adventure!.houseRules!["dragon-utopia-by-difficulty"] = false;
    });
    expect(draws).toHaveLength(3);
    expect(draws.map((d) => d.unitDefId)).toContain("neutral.black_dragons");
    // The lead is still an azure slot; Black (the gold-tier dragon) never leads.
    expect([...DRAGON_UTOPIA_AZURE_SLOT_IDS]).toContain(draws[0]!.unitDefId);
    expect(draws[0]!.unitDefId).not.toBe("neutral.black_dragons");
    expect(new Set(draws.map((d) => d.unitDefId)).size).toBe(3);
  });

  it("randomises the azure slot per game — it is NOT hardcoded to the Azure Dragon", () => {
    const leads = new Set<string>();
    for (let i = 0; i < 16; i += 1) {
      const { draws } = utopiaDraws(`utopia-seed-${i}`, "impossible");
      const lead = draws[0]!.unitDefId;
      expect([...DRAGON_UTOPIA_AZURE_SLOT_IDS]).toContain(lead);
      leads.add(lead);
    }
    // Across many seeds the lead varies (mutation control: a hardcoded Azure lead
    // would give a single-element set).
    expect(leads.size).toBeGreaterThan(1);
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
