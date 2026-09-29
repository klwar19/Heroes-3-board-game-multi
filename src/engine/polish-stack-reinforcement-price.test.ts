import { describe, expect, it } from "vitest";

import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import type { TownBuildingEffect } from "@/data/factions/types";

import {
  markNecromancyUnitSpent,
  necromancyUnitSpent,
  queueNecromancyReinforce,
  reinforceCostFor,
  settlementReinforceCostFor
} from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import {
  polishArmyUnitCanBuyStack,
  polishFreeStackTopUpGold,
  polishStackLayerPrice,
  polishUnitStackCap,
  polishUnitStackCost
} from "./polish-unit-stacks";
import type { GameAction, GameState } from "./state";

/**
 * USER RULING (2026-09-29) — supersedes the 2026-08-12 "reinforcement + tier"
 * price: "Each stack cost +1 gold more then previous. So 1st cost 1 gold,
 * second 2 gold etc." Counted PER UNIT CARD, tier and valuables ignored.
 * New Polish test rule "polish-unlimited-stacks" removes the tier cap and adds
 * two anti-farming limits (one Necromancy per unit per combat; one Pit Lords
 * summoning per player per combat). Free Stack sources cover 1 gold. With Unit
 * Stacks on, a Settlement's Few→Pack reinforcement costs Pack − Few.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function buildingWith(
  state: GameState,
  playerId: string,
  predicate: (effect: TownBuildingEffect) => boolean
): string {
  const factionId = state.players[playerId].factionId!;
  const buildingId = coreFactionDefinitions[factionId].buildings.find((id) => {
    const effect = coreBuildingDefinitions[id]?.effect;
    return effect ? predicate(effect) : false;
  });
  if (!buildingId) {
    throw new Error("fixture faction is missing a required building");
  }
  return buildingId;
}

/** A Tower table with the Citadel + silver dwelling and a Pack of Magi. */
function towerGame(
  seed: string,
  rules: { stacks?: boolean; unlimited?: boolean } = { stacks: true }
): GameState {
  let state = createAdventureGameState({
    seed,
    startingBuildings: [],
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "legacy",
    players: [
      { id: "p1", name: "Solmyr", factionId: "tower", heroDefId: "solmyr" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ],
    houseRules: {
      "polish-unit-stacks": rules.stacks ?? false,
      "polish-unlimited-stacks": rules.unlimited ?? false
    }
  });
  state.pendingChoice = null;
  if (state.adventure) {
    state.adventure.rewardQueue = [];
  }
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
  town.buildings = [
    buildingWith(state, "p1", (effect) => effect.type === "UNLOCK_REINFORCE"),
    buildingWith(state, "p1", (effect) => effect.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver")
  ];
  state.players.p1.townTokens.population = true;
  state.players.p1.resources = { gold: 500, buildingMaterials: 100, valuables: 100 };
  state.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "pack" }];
  return state;
}

function label(state: GameState, text: string): string | undefined {
  return getLegalActions(state, "p1").find((legal) => legal.label.includes(text))?.label;
}

function buyStack(state: GameState): GameState {
  return applyOk(state, {
    type: "POPULATION_ACTION",
    playerId: "p1",
    purchases: [{ kind: "stack", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
  });
}

describe("Polish Unit Stacks — escalating price (1st layer 1 gold, 2nd 2 gold …)", () => {
  it("charges 1 then 2 gold for a silver Pack's two layers (not the old 13 = 11 + 2)", () => {
    let state = towerGame("stack-ladder-magi");
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (1 gold)");
    let gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(gold - state.players.p1.resources.gold).toBe(1);

    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (2 gold)");
    gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(state.players.p1.army[0].stacks).toBe(2);
    expect(gold - state.players.p1.resources.gold).toBe(2);

    // Silver cap 2 in the capped rule: no third layer is sold.
    expect(label(state, "Add Stack to Magi")).toBeUndefined();
  });

  it("prices per unit card, ignoring tier and printed valuables", () => {
    expect(polishStackLayerPrice(0)).toBe(1);
    expect(polishStackLayerPrice(4)).toBe(5);
    // A gold-tier Pack that prints valuables: still just 1 gold for layer 1.
    expect(polishUnitStackCost("castle.archangels", "pack")).toEqual({ gold: 1 });
    expect(polishUnitStackCost("castle.griffins", "pack", 2)).toEqual({ gold: 3 });
    expect(polishUnitStackCost("neutral.magi", "neutral")).toEqual({ gold: 1 });
    // CONTROL: no Pack side on a Neutral-only card → no price at all.
    expect(polishUnitStackCost("neutral.azure_dragons", "pack")).toBeNull();
  });

  it("a Legion voucher still comes off the ladder price (min 0)", () => {
    let state = towerGame("stack-ladder-legion");
    state.players.p1.army[0].stacks = 1;
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 1, target: { kind: "stack", armyUnitId: "u_magi" } }
    ];
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (1 gold)");
    const gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(gold - state.players.p1.resources.gold).toBe(1);
    expect(state.players.p1.recruitDiscounts).toHaveLength(0);
  });

  it("Necromancy halves the ladder price (rounded down) for an Undead card", () => {
    let state = towerGame("stack-ladder-necromancy");
    state.players.p1.army = [{ id: "u_wraiths", unitDefId: "necropolis.wraiths", side: "pack", stacks: 2 }];
    state.players.p1.hand = ["ability.necromancy"];
    queueNecromancyReinforce(state, "p1", "basic", "ability.necromancy");
    pumpAdventureQueues(state);
    // Wraiths are bronze (cap 3): layer 3 costs 3 → floor(3 / 2) = 1.
    const pick = getLegalActions(state, "p1").find((legal) =>
      legal.label.includes("Add a Stack to Wraiths (1 gold)")
    );
    expect(pick).toBeTruthy();
    const gold = state.players.p1.resources.gold;
    state = applyOk(state, pick!.action);
    expect(state.players.p1.army[0].stacks).toBe(3);
    expect(gold - state.players.p1.resources.gold).toBe(1);
  });

  it("free Stack sources cover 1 gold: layer 1 free, layer 2 pays 1, layer 3 pays 2", () => {
    expect(polishFreeStackTopUpGold({ stacks: 0 })).toBe(0);
    expect(polishFreeStackTopUpGold({ stacks: 1 })).toBe(1);
    expect(polishFreeStackTopUpGold({ stacks: 2 })).toBe(2);
  });

  it("CONTROL: with the rule off no Stack is priced or sold at all", () => {
    const off = towerGame("stack-ladder-off", { stacks: false });
    expect(label(off, "Add Stack to Magi")).toBeUndefined();
    expect(
      applyAction(off, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "stack", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
      }).errors[0]?.message
    ).toContain("not enabled");
  });
});

describe("Polish Unlimited Stacks (test rule)", () => {
  it("removes the tier cap: a silver Pack buys a 3rd layer for 3 gold", () => {
    let state = towerGame("stack-unlimited", { stacks: true, unlimited: true });
    state.players.p1.army[0].stacks = 2;
    expect(polishUnitStackCap("tower.magi", "pack", state)).toBe(Number.POSITIVE_INFINITY);
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (3 gold)");
    const gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(state.players.p1.army[0].stacks).toBe(3);
    expect(gold - state.players.p1.resources.gold).toBe(3);
  });

  it("CONTROL: the capped rule stops the same card at 2 layers", () => {
    const state = towerGame("stack-capped", { stacks: true, unlimited: false });
    state.players.p1.army[0].stacks = 2;
    expect(polishArmyUnitCanBuyStack(state.players.p1.army[0], state)).toBe(false);
    expect(label(state, "Add Stack to Magi")).toBeUndefined();
  });

  it("CONTROL: Unlimited Stacks without Unit Stacks does nothing (cap stays printed)", () => {
    const state = towerGame("stack-unlimited-alone", { stacks: false, unlimited: true });
    expect(polishUnitStackCap("tower.magi", "pack", state)).toBe(2);
  });

  it("one Necromancy per unit per combat — only with Unlimited Stacks", () => {
    for (const unlimited of [true, false]) {
      const state = towerGame(`necro-once-${unlimited}`, { stacks: true, unlimited });
      state.players.p1.army = [{ id: "u_wraiths", unitDefId: "necropolis.wraiths", side: "pack", stacks: 0 }];
      state.players.p1.hand = ["ability.necromancy", "ability.necromancy"];
      state.adventure!.pendingNecromancy = { playerId: "p1", remaining: 2, discountIds: [] };
      markNecromancyUnitSpent(state, "p1", "u_wraiths");
      expect(necromancyUnitSpent(state, "p1", "u_wraiths")).toBe(unlimited);
      queueNecromancyReinforce(state, "p1", "basic", "ability.necromancy");
      pumpAdventureQueues(state);
      const offered = label(state, "Add a Stack to Wraiths");
      if (unlimited) {
        expect(offered, "the already-affected unit is not offered again").toBeUndefined();
      } else {
        expect(offered, "CONTROL: capped rule keeps today's behaviour").toBeTruthy();
      }
    }
  });
});

describe("Settlement Few→Pack reinforcement with Unit Stacks: Pack − Few", () => {
  it("Magi (Few 6, Pack 11) cost 5 gold instead of the half-Pack 6", () => {
    const on = towerGame("settle-diff");
    on.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "few" }];
    expect(settlementReinforceCostFor(on, "p1", "u_magi")).toEqual({ gold: 5 });

    // CONTROL: without Unit Stacks the settlement keeps half the Pack cost.
    const off = towerGame("settle-diff-off", { stacks: false });
    off.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "few" }];
    expect(settlementReinforceCostFor(off, "p1", "u_magi")).toEqual(
      reinforceCostFor(off, "p1", "u_magi", true, false, false)
    );
    expect(settlementReinforceCostFor(off, "p1", "u_magi")).toEqual({ gold: 6 });
  });
});
