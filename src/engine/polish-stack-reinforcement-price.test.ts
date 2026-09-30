import { describe, expect, it } from "vitest";

import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect } from "@/data/factions/types";
import { marketGoldValueOf } from "@/data/map/locations";

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
  polishStackGroupCost,
  polishStackLayerPrice,
  polishUnitStackCap,
  polishUnitStackCost
} from "./polish-unit-stacks";
import type { GameAction, GameState, ResourceCost } from "./state";

/**
 * USER RULING (2026-09-30) — supersedes the 2026-09-29 "Nth layer = N gold"
 * ladder and the 2026-08-12 "reinforcement + tier" price:
 *   a unit card's Nth Stack layer (N = its current Stacks + 1) costs that
 *   card's GROUP REINFORCEMENT cost + N gold.
 *   Gargoyles Group 4 gold → 1st Stack 5, 2nd 6, 3rd 7. Magi Group 11 → 12, 13.
 * The Group cost is the printed Pack side cost (= the undiscounted Few→Pack
 * reinforceCostFor, valuables included). A recruited Neutral card has no
 * Few→Pack reinforcement, so its own printed Neutral cost stands in. The tier
 * adds nothing. Settlements and free-Stack sources cover the Stack − Group
 * difference: the player pays N gold (no valuables), even on a settlement's
 * first flag. Settlement Few→Pack stays Pack − Few with Unit Stacks on.
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

function buyStack(state: GameState, armyUnitId = "u_magi", unitDefId = "tower.magi"): GameState {
  return applyOk(state, {
    type: "POPULATION_ACTION",
    playerId: "p1",
    purchases: [{ kind: "stack", unitDefId, armyUnitId }]
  });
}

/** Resource cost without zero entries, keys sorted — for structural comparison. */
function normalized(cost: ResourceCost | null | undefined): string {
  if (!cost) {
    return "null";
  }
  const entries = Object.entries(cost).filter(([, amount]) => (amount ?? 0) > 0);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries));
}

describe("Polish Unit Stacks — Nth layer = Group reinforcement cost + N gold", () => {
  it("WORKED EXAMPLE: Magi reinforce 11 gold, then Stacks 12 and 13 (not 1/2, not 13 for the first)", () => {
    let state = towerGame("stack-group-magi");
    state.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "few" }];

    // (a) The Group reinforcement price from the engine's own pricing.
    expect(reinforceCostFor(state, "p1", "u_magi", false, false, false)).toEqual({ gold: 11 });
    let gold = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
    });
    expect(state.players.p1.army[0].side).toBe("pack");
    expect(gold - state.players.p1.resources.gold, "the reinforcement really costs 11").toBe(11);

    // (b) 1st Stack = 11 + 1, really charged.
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (12 gold)");
    gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(gold - state.players.p1.resources.gold).toBe(12);

    // (c) 2nd Stack = 11 + 2.
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (13 gold)");
    gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(state.players.p1.army[0].stacks).toBe(2);
    expect(gold - state.players.p1.resources.gold).toBe(13);

    // Silver cap 2 in the capped rule: no third layer is sold.
    expect(label(state, "Add Stack to Magi")).toBeUndefined();
  });

  it("the ruling's example: Gargoyles (Group 4) pay 5, 6, 7 for their three layers", () => {
    let state = towerGame("stack-group-gargoyles");
    state.players.p1.army = [{ id: "u_garg", unitDefId: "tower.gargoyles", side: "pack" }];
    expect(polishStackGroupCost("tower.gargoyles", "pack")).toEqual({ gold: 4 });
    for (const [layer, price] of [[1, 5], [2, 6], [3, 7]] as const) {
      expect(label(state, "Add Stack to Gargoyles")).toBe(`Add Stack to Gargoyles (${price} gold)`);
      const gold = state.players.p1.resources.gold;
      state = buyStack(state, "u_garg", "tower.gargoyles");
      expect(state.players.p1.army[0].stacks).toBe(layer);
      expect(gold - state.players.p1.resources.gold, `layer ${layer}`).toBe(price);
      // CONTROL: the retired ladder charged just the layer number.
      expect(gold - state.players.p1.resources.gold).not.toBe(layer);
    }
    // Bronze cap 3.
    expect(label(state, "Add Stack to Gargoyles")).toBeUndefined();
  });

  it("INVARIANT: every Pack's Stack price is its reinforceCostFor Group + N gold (N = 1..3)", () => {
    // Derived from the engine's OWN reinforcement pricing, not a hand-copied
    // table, so a change to either side of the equality fails here.
    const state = towerGame("stack-group-invariant");
    let checked = 0;
    let withValuables = 0;
    let withMaterials = 0;
    const wrong: string[] = [];
    for (const [unitDefId, def] of Object.entries(coreUnitDefinitions)) {
      if (!def.pack || !["bronze", "silver", "gold", "azure"].includes(def.tier)) {
        continue;
      }
      state.players.p1.army = [{ id: "probe", unitDefId, side: "few" }];
      const reinforce = reinforceCostFor(state, "p1", "probe", false, false, false);
      if (!reinforce) {
        continue;
      }
      if ((reinforce.valuables ?? 0) > 0) withValuables += 1;
      if ((reinforce.buildingMaterials ?? 0) > 0) withMaterials += 1;
      for (let stacks = 0; stacks < 3; stacks += 1) {
        const expected: ResourceCost = { ...reinforce, gold: (reinforce.gold ?? 0) + stacks + 1 };
        const actual = polishUnitStackCost(unitDefId, "pack", stacks);
        if (normalized(actual) !== normalized(expected)) {
          wrong.push(`${unitDefId}@${stacks}: got ${normalized(actual)} want ${normalized(expected)}`);
        }
      }
      checked += 1;
    }
    expect(wrong).toEqual([]);
    expect(checked, "non-vacuity: the whole faction catalog is swept").toBeGreaterThan(100);
    expect(withValuables, "non-vacuity: Packs that print valuables are swept").toBeGreaterThan(0);
    // Recorded, not asserted either way: no printed Pack side costs building
    // materials today, but if one ever does the Group (and so the Stack) carries it.
    expect(withMaterials).toBeGreaterThanOrEqual(0);
  });

  it("INVARIANT: every recruited Neutral card's Stack = its own printed Neutral cost + N gold", () => {
    let checked = 0;
    const wrong: string[] = [];
    for (const [unitDefId, def] of Object.entries(coreUnitDefinitions)) {
      if (!def.neutral || !["bronze", "silver", "gold", "azure"].includes(def.tier)) {
        continue;
      }
      for (let stacks = 0; stacks < 3; stacks += 1) {
        const expected: ResourceCost = { ...def.neutral.cost, gold: (def.neutral.cost.gold ?? 0) + stacks + 1 };
        const actual = polishUnitStackCost(unitDefId, "neutral", stacks);
        if (normalized(actual) !== normalized(expected)) {
          wrong.push(`${unitDefId}@${stacks}: got ${normalized(actual)} want ${normalized(expected)}`);
        }
      }
      checked += 1;
    }
    expect(wrong).toEqual([]);
    expect(checked, "non-vacuity").toBeGreaterThan(30);
    // Worked Neutral examples: Magi 11 → 12; azure dragons 45 gold + 2 valuables → 46 + 2v.
    expect(polishUnitStackCost("neutral.magi", "neutral")).toEqual({ gold: 12 });
    expect(polishUnitStackCost("neutral.azure_dragons", "neutral")).toEqual({ gold: 46, valuables: 2 });
    // CONTROL: no Pack side on a Neutral-only card → no price at all.
    expect(polishUnitStackCost("neutral.azure_dragons", "pack")).toBeNull();
  });

  it("the tier adds nothing: Stack − Group is exactly N gold on bronze, silver, gold and azure", () => {
    const cards: [string, "pack" | "neutral"][] = [
      ["tower.gargoyles", "pack"],
      ["tower.magi", "pack"],
      ["castle.archangels", "pack"],
      ["neutral.azure_dragons", "neutral"]
    ];
    for (const [unitDefId, side] of cards) {
      for (let stacks = 0; stacks < 3; stacks += 1) {
        const group = polishStackGroupCost(unitDefId, side)!;
        const stack = polishUnitStackCost(unitDefId, side, stacks)!;
        expect((stack.gold ?? 0) - (group.gold ?? 0), `${unitDefId}@${stacks}`).toBe(stacks + 1);
        expect(stack.valuables ?? 0, "valuables are the Group's, unchanged").toBe(group.valuables ?? 0);
      }
    }
    expect(polishStackLayerPrice(0)).toBe(1);
    expect(polishStackLayerPrice(4)).toBe(5);
    // Archangels print 30 gold + 2 valuables on the Pack: 31 + 2v (not the 2026-08-12 33 + 2v).
    expect(polishUnitStackCost("castle.archangels", "pack")).toEqual({ gold: 31, valuables: 2 });
  });

  it("a Legion voucher still comes off the full price (Magi layer 2: 13 − 4 = 9)", () => {
    let state = towerGame("stack-group-legion");
    state.players.p1.army[0].stacks = 1;
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "stack", armyUnitId: "u_magi" } }
    ];
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (9 gold)");
    const gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(gold - state.players.p1.resources.gold).toBe(9);
    expect(state.players.p1.recruitDiscounts, "the voucher is single-use").toHaveLength(0);
  });

  it("Necromancy halves the full price (rounded down) for an Undead card: Wraiths layer 3 = floor(9 / 2) = 4", () => {
    let state = towerGame("stack-group-necromancy");
    state.players.p1.army = [{ id: "u_wraiths", unitDefId: "necropolis.wraiths", side: "pack", stacks: 2 }];
    state.players.p1.hand = ["ability.necromancy"];
    queueNecromancyReinforce(state, "p1", "basic", "ability.necromancy");
    pumpAdventureQueues(state);
    // Wraiths Group 6 + 3 = 9 → 4. CONTROL: half the retired 3-gold ladder was 1.
    expect(label(state, "Add a Stack to Wraiths (1 gold)")).toBeUndefined();
    const pick = getLegalActions(state, "p1").find((legal) =>
      legal.label.includes("Add a Stack to Wraiths (4 gold)")
    );
    expect(pick).toBeTruthy();
    const gold = state.players.p1.resources.gold;
    state = applyOk(state, pick!.action);
    expect(state.players.p1.army[0].stacks).toBe(3);
    expect(gold - state.players.p1.resources.gold).toBe(4);
  });

  it("the full price is paid through the recruit path (Freelancer's Guild substitution)", () => {
    // 12 gold owed for Magi layer 1, only 10 in the treasury: the Guild
    // substitutes materials / valuables for the missing 2.
    let state = towerGame("stack-group-guild");
    state.players.p1.resources = { gold: 10, buildingMaterials: 10, valuables: 10 };
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings = [...town.buildings, "stronghold.freelancers_guild"];
    const before = { ...state.players.p1.resources };
    state = buyStack(state);
    const after = state.players.p1.resources;
    const spentGold = before.gold - after.gold;
    const substituted =
      (before.buildingMaterials - after.buildingMaterials) * marketGoldValueOf("buildingMaterials") +
      (before.valuables - after.valuables) * marketGoldValueOf("valuables");
    expect(state.players.p1.army[0].stacks, "the Stack was bought without 12 gold in hand").toBe(1);
    expect(spentGold, "every gold coin is spent first").toBe(10);
    expect(spentGold + substituted, "the full ruled price is still paid").toBeGreaterThanOrEqual(12);
    expect(spentGold + substituted, "whole-lot substitution overpays by less than one valuable").toBeLessThan(15);
  });

  it("free Stack sources and settlements charge the Stack − Group difference: N gold", () => {
    expect(polishFreeStackTopUpGold({ stacks: 0 })).toBe(1);
    expect(polishFreeStackTopUpGold({ stacks: 1 })).toBe(2);
    expect(polishFreeStackTopUpGold({ stacks: 2 })).toBe(3);
    // It IS the difference between the Stack and the Group for any card.
    for (let stacks = 0; stacks < 3; stacks += 1) {
      const stack = polishUnitStackCost("castle.archangels", "pack", stacks)!;
      const group = polishStackGroupCost("castle.archangels", "pack")!;
      expect(polishFreeStackTopUpGold({ stacks })).toBe((stack.gold ?? 0) - (group.gold ?? 0));
    }
  });

  it("CONTROL: with the rule off no Stack is priced or sold at all", () => {
    const off = towerGame("stack-group-off", { stacks: false });
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
  it("removes the tier cap: a silver Pack buys a 3rd layer for Group 11 + 3 = 14 gold", () => {
    let state = towerGame("stack-unlimited", { stacks: true, unlimited: true });
    state.players.p1.army[0].stacks = 2;
    expect(polishUnitStackCap("tower.magi", "pack", state)).toBe(Number.POSITIVE_INFINITY);
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (14 gold)");
    const gold = state.players.p1.resources.gold;
    state = buyStack(state);
    expect(state.players.p1.army[0].stacks).toBe(3);
    expect(gold - state.players.p1.resources.gold).toBe(14);
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
