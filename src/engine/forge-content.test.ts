import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { attackDieOutcomeMultiplier, getAttackDefenseReductionAbility, getSecondAttackAbility } from "./unit-abilities";
import { coreBuildingDefinitions, coreFactionDefinitions, startingTileByFaction } from "@/data/factions/core";
import { azureNeutralCounterpartId, neutralUnitIdsByTier } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { CombatUnitState, GameAction, GameState } from "./state";

/**
 * Forge (tmp/forge/FORGE-SPEC.md). Each block asserts an observable outcome
 * against a CONTROL where the old behaviour and the Forge rule diverge.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function unitWith(abilities: string[], defense = 0): CombatUnitState {
  return { id: "u", abilities, defense, movedThisActivation: false } as unknown as CombatUnitState;
}

function forgeGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    startingBuildings: [],
    rollFirstPlayer: false,
    events: false,
    difficulty: "normal",
    players: [
      { id: "p1", name: "Mullich", factionId: "forge", heroDefId: "dark_mullich" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

function startResourceRound(state: GameState, round: number): void {
  state.pendingChoice = null;
  if (state.adventure) {
    state.adventure.rewardQueue = [];
    state.adventure.pendingVisit = null;
  }
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

describe("Forge registration", () => {
  it("is a faction with 7 units, 8 buildings and the S12 starting tile", () => {
    const forge = coreFactionDefinitions.forge!;
    expect(forge.units).toHaveLength(7);
    expect(forge.buildings).toHaveLength(8);
    expect(startingTileByFaction.forge).toBe("S12");
    // Toxic Moat shares the Citadel bar: its prerequisite is the Citadel.
    expect(coreBuildingDefinitions["forge.toxic_moat"]!.prerequisites).toContain("forge.citadel");
  });

  it("never adds a Forge unit to the Neutral Units decks (Factory precedent)", () => {
    for (const ids of Object.values(neutralUnitIdsByTier)) {
      expect(ids.some((id) => id.startsWith("forge."))).toBe(false);
    }
  });
});

describe("Forge unit abilities (pure resolution helpers)", () => {
  it("Cyber Zombies double the Attack die outcome; CONTROL: a plain unit keeps x1", () => {
    expect(attackDieOutcomeMultiplier(unitWith(["forge-double-attack-die"]))).toBe(2);
    expect(attackDieOutcomeMultiplier(unitWith([]))).toBe(1);
  });

  it("Cyberbrute Few halves the target's effective Defense rounded up", () => {
    const brute = unitWith(["forge-cyberbrute-crush"]);
    expect(getAttackDefenseReductionAbility(brute, false, false, 5)?.amount).toBe(3);
    expect(getAttackDefenseReductionAbility(brute, false, false, 4)?.amount).toBe(2);
    expect(getAttackDefenseReductionAbility(brute, false, false, 0)?.amount).toBe(0);
    // CONTROL: the Behemoth's flat crush ignores the target's Defense value.
    const behemoth = unitWith(["behemoth-defense-crush-few"]);
    expect(getAttackDefenseReductionAbility(behemoth, false, false, 5)?.amount).toBe(1);
  });

  it("Cyberbrute Pack keeps the Few's halving (never on retaliation) plus the kill-heal", () => {
    const pack = coreUnitDefinitions["forge.cyberbrutes"]!.pack!;
    expect(pack.abilities).toEqual(["forge-cyberbrute-crush", "forge-cyberbrute-feast"]);
    const brute = unitWith(pack.abilities);
    expect(getAttackDefenseReductionAbility(brute, false, false, 7)).toMatchObject({ amount: 4, fraction: "half-round-up" });
    expect(getAttackDefenseReductionAbility(brute, false, true, 7)).toBeNull();
    // CONTROL: the removed Plasmatic Vomit follow-up is gone.
    expect(getSecondAttackAbility(brute)).toBeNull();
  });

  it("Cyberbrutes' Neutral card is the separate azure neutral.cyberbrutes (Titans precedent)", () => {
    expect(coreUnitDefinitions["forge.cyberbrutes"]!.neutral).toBeUndefined();
    expect(coreUnitDefinitions["neutral.cyberbrutes"]).toMatchObject({ tier: "azure", faction: "neutral" });
    expect(neutralUnitIdsByTier.azure).toContain("neutral.cyberbrutes");
    expect(azureNeutralCounterpartId("forge")).toBe("neutral.cyberbrutes");
  });

  it("Tanks' follow-up is optional; CONTROL: the Lich Death Cloud stays mandatory", () => {
    expect(getSecondAttackAbility(unitWith(["forge-tank-cannon-2"]))).toMatchObject({ baseAttack: 2, optional: true });
    expect(getSecondAttackAbility(unitWith(["lich-death-cloud"]))?.optional).toBeUndefined();
  });
});

describe("Forge City Hall — 3 gold OR the opponent discards two cards", () => {
  function hallGame(seed: string): GameState {
    const state = forgeGame(seed);
    state.towns.town_p1!.buildings = ["forge.city_hall"];
    state.towns.town_p2!.buildings = [];
    state.players.p2.hand = ["card.a", "card.b", "card.c", "card.d"] as GameState["players"][string]["hand"];
    return state;
  }

  it("the discard option removes exactly two cards from the opponent's hand", () => {
    let state = hallGame("forge-hall-discard");
    startResourceRound(state, 3);
    const legal = getLegalActions(state, "p1").find((candidate) => candidate.label.includes("discards two"));
    expect(legal).toBeTruthy();
    const before = state.players.p2.hand.length;
    state = applyOk(state, legal!.action);
    expect(state.players.p2.hand.length).toBe(before - 2);
    expect(state.players.p2.discard.length).toBeGreaterThanOrEqual(2);
  });

  it("CONTROL: the gold option leaves the opponent's hand intact and pays 3 gold", () => {
    let state = hallGame("forge-hall-gold");
    startResourceRound(state, 3);
    const legal = getLegalActions(state, "p1").find((candidate) => candidate.label.includes("Gain 3 gold"));
    const hand = state.players.p2.hand.length;
    const gold = state.players.p1.resources.gold;
    state = applyOk(state, legal!.action);
    expect(state.players.p2.hand.length).toBe(hand);
    expect(state.players.p1.resources.gold).toBe(gold + 3);
  });
});

describe("Forge Resource Silo — building materials are ignored", () => {
  // No morale / reroll cards: the die resolves on the direct (no-choice) path.
  function materialsAfterRound(seed: string, buildings: string[]): number {
    const state = forgeGame(seed);
    state.towns.town_p1!.buildings = buildings;
    state.towns.town_p2!.buildings = [];
    state.players.p1.morale = 0;
    state.players.p1.hand = [];
    startResourceRound(state, 3);
    return state.players.p1.resources.buildingMaterials;
  }

  it("never adds materials over the no-building baseline; CONTROL: Mystic-Pond style die does", () => {
    const silo = coreBuildingDefinitions["forge.resource_silo"]!;
    const original = silo.effect;
    let controlExtra = 0;
    for (let index = 0; index < 24; index += 1) {
      const seed = `forge-silo-${index}`;
      const baseline = materialsAfterRound(seed, []);
      expect(materialsAfterRound(seed, ["forge.resource_silo"])).toBe(baseline);
      silo.effect = { type: "RESOURCE_ROUND_RESOURCE_DIE" };
      try {
        controlExtra += materialsAfterRound(seed, ["forge.resource_silo"]) - baseline;
      } finally {
        silo.effect = original;
      }
    }
    expect(controlExtra).toBeGreaterThan(0);
  });
});

describe("Forge Toxic Moat — gains the Lightning Generator when built", () => {
  function built(buildingId: string): GameState {
    let state = forgeGame(`forge-moat-${buildingId}`);
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.towns.town_p1!.buildings = ["forge.citadel"];
    state.players.p1.resources.gold = 30;
    state.players.p1.resources.buildingMaterials = 20;
    state.players.p1.resources.valuables = 20;
    return applyOk(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId: "town_p1", buildingId });
  }

  it("Toxic Moat puts the Lightning Generator in hand", () => {
    expect(built("forge.toxic_moat").players.p1.hand).toContain("war_machine.lightning_generator");
  });

  it("CONTROL: another building grants no war machine", () => {
    expect(built("forge.mage_guild").players.p1.hand).not.toContain("war_machine.lightning_generator");
  });
});
