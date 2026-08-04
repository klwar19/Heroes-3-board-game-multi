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
  // Utopia scales to when its guards are "by-difficulty" (the default).
  const COUNT_BY_DIFFICULTY: Record<GameDifficulty, number> = {
    easy: 1,
    normal: 2,
    hard: 3,
    impossible: 4
  };
  const TIERS_BY_DIFFICULTY: Record<GameDifficulty, string[]> = {
    easy: ["azure"],
    normal: ["azure", "azure"],
    hard: ["azure", "azure", "gold"],
    impossible: ["azure", "azure", "gold", "gold"]
  };

  function utopiaDraws(seed: string, difficulty: GameDifficulty, mutate?: (state: ReturnType<typeof createAdventureGameState>) => void) {
    const state = createAdventureGameState({ seed, difficulty, rollFirstPlayer: false });
    mutate?.(state);
    const draws = drawGuardArmy(state, fieldWith("dragon_utopia"), 7);
    return { state, draws };
  }

  it("uses the full difficulty-table tier composition in the default mode", () => {
    const { draws } = utopiaDraws("utopia-hard-table", "hard");
    expect(draws.map((draw) => draw.tier).sort()).toEqual(["azure", "azure", "gold"]);
    expect(draws.every((draw) => !draw.bankGuard)).toBe(true);
  });

  it("uses every difficulty row's count and tiers", () => {
    for (const difficulty of ["easy", "normal", "hard", "impossible"] as const) {
      const { draws } = utopiaDraws(`utopia-${difficulty}`, difficulty);
      expect(dragonUtopiaDifficultyGuardCount(
        createAdventureGameState({ seed: "x", difficulty, rollFirstPlayer: false }),
        7
      )).toBe(COUNT_BY_DIFFICULTY[difficulty]);
      expect(draws, `${difficulty} guard count`).toHaveLength(COUNT_BY_DIFFICULTY[difficulty]);
      expect(draws.map((draw) => draw.tier).sort()).toEqual(TIERS_BY_DIFFICULTY[difficulty]!.slice().sort());
    }
  });

  it("conserves the Neutral decks: the table draw LEAVES them, the minted party never enters them", () => {
    // The two modes MUST disagree about `bankGuard`, because that flag is what
    // the combat-end recycle reads (finalizeAdventureCombat). Getting it wrong
    // either way corrupts the decks: a drawn guard flagged bankGuard would be
    // consumed forever, and a MINTED dragon left unflagged would be pushed into
    // the azure discard at combat end — creating a card that never existed.

    // "by-difficulty" draws real cards: hard Ⅶ takes 2 azure + 1 gold OUT of
    // the piles, and nothing is flagged, so the recycle hands them back.
    const drawn = createAdventureGameState({ seed: "utopia-conserve", difficulty: "hard", rollFirstPlayer: false });
    const azureBefore = drawn.decks[NEUTRAL_DECK_IDS.azure]!.drawPile.length;
    const goldBefore = drawn.decks[NEUTRAL_DECK_IDS.gold]!.drawPile.length;
    const draws = drawGuardArmy(drawn, fieldWith("dragon_utopia"), 7);
    expect(azureBefore - drawn.decks[NEUTRAL_DECK_IDS.azure]!.drawPile.length).toBe(2);
    expect(goldBefore - drawn.decks[NEUTRAL_DECK_IDS.gold]!.drawPile.length).toBe(1);
    expect(draws.every((draw) => !draw.bankGuard)).toBe(true);

    // "four" MINTS its dragons: the azure pile is untouched (nothing drawn, so
    // nothing to give back) and every guard is flagged so the recycle skips it.
    const minted = createAdventureGameState({ seed: "utopia-conserve", difficulty: "hard", rollFirstPlayer: false });
    minted.adventure!.dragonUtopiaGuards = "four";
    const mintedAzureBefore = minted.decks[NEUTRAL_DECK_IDS.azure]!.drawPile.length;
    const party = drawGuardArmy(minted, fieldWith("dragon_utopia"), 7);
    expect(minted.decks[NEUTRAL_DECK_IDS.azure]!.drawPile.length).toBe(mintedAzureBefore);
    expect(minted.decks[NEUTRAL_DECK_IDS.azure]!.discardPile).toHaveLength(0);
    expect(party).toHaveLength(4);
    expect(party.every((draw) => draw.bankGuard === true)).toBe(true);
  });

  it("CONTROL: with guards set to `four`, the full FOUR-dragon party stands whatever the difficulty", () => {
    // On Easy the by-difficulty count would be 1; "four" keeps the whole party.
    const { draws } = utopiaDraws("utopia-fixed", "easy", (state) => {
      state.adventure!.dragonUtopiaGuards = "four";
    });
    expect(draws).toHaveLength(4);
    // The four-dragon set — Azure, Rust, Crystal and Faerie — always stands, the
    // featured lead being one of Azure/Rust after the slot swap.
    expect(draws.map((d) => d.unitDefId).sort()).toEqual(
      [...DRAGON_UTOPIA_GUARD_IDS].sort()
    );
    expect([...DRAGON_UTOPIA_AZURE_SLOT_IDS]).toContain(draws[0]!.unitDefId);
  });

  it("randomises the azure slot in the explicit four-dragon mode", () => {
    const leads = new Set<string>();
    for (let i = 0; i < 16; i += 1) {
      const { draws } = utopiaDraws(`utopia-seed-${i}`, "impossible", (state) => {
        state.adventure!.dragonUtopiaGuards = "four";
      });
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
  it("is defended by the printed card: 1 bronze Pack + 2 silver Packs + 2 gold Fews", () => {
    // Default players are Castle and Necropolis, so the town faction differs.
    const state = createAdventureGameState({ seed: "town", difficulty: "normal", rollFirstPlayer: false });
    const field = fieldWith("random_town");

    const draws = drawGuardArmy(state, field, 7);
    expect(field.faction).toBeTruthy();
    expect(["castle", "necropolis"]).not.toContain(field.faction);

    expect(draws.every((draw) => draw.bankGuard)).toBe(true);
    expect(draws.every((draw) => coreUnitDefinitions[draw.unitDefId]?.faction === field.faction)).toBe(true);
    const packs = draws.filter((draw) => draw.factionPack);
    const fews = draws.filter((draw) => draw.factionFew);
    expect(packs.map((draw) => draw.tier).sort()).toEqual(["bronze", "silver", "silver"]);
    expect(fews.map((draw) => draw.tier)).toEqual(["gold", "gold"]);
    // The choosable slot is exactly the ONE bronze Pack.
    const choosable = draws.filter((draw) => draw.randomTownChoice);
    expect(choosable).toHaveLength(1);
    expect(choosable[0]!.tier).toBe("bronze");
    expect(choosable[0]!.factionPack).toBe(true);
    // CONTROL against the old composition (2 gold PACKS): the gold bodies are Fews.
    expect(packs.some((draw) => draw.tier === "gold")).toBe(false);

    // The Pack slots fight on their Pack side, the Few slots on their Few side.
    const packUnit = makeCombatUnitFromNeutral(packs[0]!, "rt1", 0);
    expect(packUnit?.variant).toBe("pack");
    expect(packUnit?.controllerId).toBe("neutrals");
    const fewUnit = makeCombatUnitFromNeutral(fews[0]!, "rt2", 1);
    expect(fewUnit?.variant).toBe("few");
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
