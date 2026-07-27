import { describe, expect, it } from "vitest";
import type { MapFieldState } from "./state";
import {
  beginFieldVisit,
  DRAGON_UTOPIA_AZURE_SLOT_IDS,
  DRAGON_UTOPIA_GUARD_IDS,
  dragonUtopiaDifficultyGuardCount,
  drawGuardArmy,
  getMainHero,
  makeCombatUnitFromNeutral
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
