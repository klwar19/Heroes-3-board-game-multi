import { describe, expect, it } from "vitest";

import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingEffect } from "@/data/factions/types";
import { marketGoldValueOf } from "@/data/map/locations";

import { queueNecromancyReinforce, reinforceCostFor } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { POLISH_UNIT_STACK_RULES, polishUnitStackCost } from "./polish-unit-stacks";
import type { GameAction, GameState, ResourceCost } from "./state";

/**
 * USER RULING (2026-08-12, verbatim):
 *   "Cost of stack should be: cost of reinforsment + nr of tier. fe. for Magi:
 *    11 + 2 = 13 (but now in game is 6+1) - so wrong"
 *
 * LEAD WITH THE FINDING: the price half of that report did NOT reproduce. HEAD
 * already charges a Tower Magi Stack 13 gold at the Citadel — the Pack (i.e.
 * REINFORCEMENT) price 11 plus the silver tier number 2 — and has since
 * 9a443726 (2026-07-16). What was missing is any test tying the Stack price to
 * the REINFORCEMENT price: the shipped cases pinned per-unit literals, so a
 * future edit could have re-based the price on the Few (recruit) side — the
 * "6 + 1" shape the report describes — with every existing test still green.
 * That is what this file closes, as an INVARIANT over the whole unit catalog
 * (CLAUDE.md rule #1a habit 5) rather than N more one-offs.
 *
 * The reading, stated once:
 *   one Stack = reinforceCostFor(no discounts)  +  the tier number in gold
 *   bronze 1 · silver 2 · gold 3 · azure counts as gold (3) — the same
 *   azure→gold convention the cap uses (POLISH_UNIT_STACK_RULES has no azure
 *   row). A recruited NEUTRAL card has no Few→Pack reinforcement at all, so its
 *   base is its own printed (recruit) cost — documented at the seam.
 */

/** The "nr of tier" the ruling names. Literal on purpose: an edit to the
 *  engine's POLISH_UNIT_STACK_RULES surcharges must fail this file. */
const TIER_NUMBER = { bronze: 1, silver: 2, gold: 3 } as const;

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

/** A Tower table with the Citadel + silver dwelling, ready to reinforce/stack Magi. */
function towerGame(seed: string, stacksOn = true): GameState {
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
    houseRules: { "polish-unit-stacks": stacksOn }
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
  state.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "few" }];
  return state;
}

function label(state: GameState, text: string): string | undefined {
  return getLegalActions(state, "p1").find((legal) => legal.label.includes(text))?.label;
}

describe("Polish Unit Stacks — a Stack costs the REINFORCEMENT price + the tier number", () => {
  it("WORKED EXAMPLE (the ruling): Magi reinforce 11 gold, then a Stack 13 = 11 + 2", () => {
    let state = towerGame("stack-price-magi");

    // (a) The reinforcement price the ruling names, from the engine's own
    //     reinforcement pricing (no discounts in this fixture).
    expect(
      reinforceCostFor(state, "p1", "u_magi", false, false, false),
      "Tower Magi Few→Pack reinforcement = the printed Pack cost"
    ).toEqual({ gold: 11 });

    // ...and it is really CHARGED as 11 through the normal Population action.
    expect(label(state, "Reinforce Magi to a pack")).toBeTruthy();
    let gold = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
    });
    expect(state.players.p1.army[0].side).toBe("pack");
    expect(gold - state.players.p1.resources.gold, "reinforcement really costs 11 gold").toBe(11);

    // (b) One Stack on that same card = that 11 + the silver tier number 2.
    expect(label(state, "Add Stack to Magi"), "the offer names the real price").toBe(
      "Add Stack to Magi (13 gold)"
    );
    gold = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
    });
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold, "one Stack really costs 13 gold").toBe(gold - 13);
    expect(11 + TIER_NUMBER.silver, "the ruling's arithmetic").toBe(13);
  });

  it("CONTROL: the price is NOT built from the Few (recruit) side — not 6+1, not 6+2", () => {
    // The reported "6+1" shape: Magi's FEW card prints 6 gold and bronze's tier
    // number is 1. Neither the Few cost nor the bronze surcharge may enter the
    // price of a silver Pack's Stack. This case fails the moment anyone re-bases
    // the Stack price on the recruit side.
    const state = towerGame("stack-price-magi-control");
    expect(coreUnitDefinitions["tower.magi"].few!.cost, "the Few (recruit) cost the report quotes").toEqual({
      gold: 6
    });
    const stack = polishUnitStackCost("tower.magi", "pack");
    expect(stack).toEqual({ gold: 13 });
    expect(stack!.gold).not.toBe(7); // few 6 + bronze 1
    expect(stack!.gold).not.toBe(8); // few 6 + silver 2
    expect(stack!.gold).not.toBe(19); // few 6 + pack 11 + silver 2 (the retired 2026-07-16 reading)

    // ...and no OTHER surface prices it off the Few side either: with the rule
    // on and the card still a Few, no Stack is sold at all.
    expect(label(state, "Add Stack to Magi")).toBeUndefined();
  });

  it("INVARIANT: every unit's Stack price is its reinforcement cost + the tier number", () => {
    // Derived from the engine's OWN reinforcement pricing (reinforceCostFor),
    // not a hand-copied table, so a change to either side fails here.
    const state = towerGame("stack-price-invariant");
    let checked = 0;
    const wrong: string[] = [];
    for (const [unitDefId, def] of Object.entries(coreUnitDefinitions)) {
      if (!def.pack) {
        continue;
      }
      const tier = def.tier === "azure" ? "gold" : def.tier;
      const tierNumber = TIER_NUMBER[tier as keyof typeof TIER_NUMBER];
      if (!tierNumber) {
        continue;
      }
      state.players.p1.army = [{ id: "probe", unitDefId, side: "few" }];
      const reinforce = reinforceCostFor(state, "p1", "probe", false, false, false);
      if (!reinforce) {
        continue;
      }
      const expected: ResourceCost = { ...reinforce, gold: (reinforce.gold ?? 0) + tierNumber };
      const actual = polishUnitStackCost(unitDefId, "pack");
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        wrong.push(`${unitDefId}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);
      }
      checked += 1;
    }
    expect(wrong).toEqual([]);
    expect(checked, "non-vacuity: the whole faction catalog is swept").toBeGreaterThan(100);
  });

  it("the engine's tier surcharge IS the tier number (bronze 1 · silver 2 · gold 3, azure→gold)", () => {
    expect(POLISH_UNIT_STACK_RULES.bronze?.goldSurcharge).toBe(TIER_NUMBER.bronze);
    expect(POLISH_UNIT_STACK_RULES.silver?.goldSurcharge).toBe(TIER_NUMBER.silver);
    expect(POLISH_UNIT_STACK_RULES.gold?.goldSurcharge).toBe(TIER_NUMBER.gold);
    // Azure has no row of its own: it is priced (and capped) as gold. A literal
    // "nr of tier" reading would be 4 — the azure→gold convention is the
    // shipped reading and is pinned here so a change is a conscious one.
    expect(POLISH_UNIT_STACK_RULES.azure).toBeUndefined();
    expect(
      polishUnitStackCost("neutral.azure_dragons", "neutral"),
      "azure Neutral: printed 45 gold + 3 (gold tier), + its printed 2 valuables"
    ).toEqual({ gold: 48, valuables: 2 });
  });

  it("a recruited NEUTRAL card has no reinforcement, so its base is its own printed cost", () => {
    // Documented reading (there is no Few→Pack for a Neutral card): the printed
    // recruit cost stands in for "the reinforcement cost". Neutral Magi prints
    // the same 11 gold as the Tower Pack, so it prices identically: 11 + 2.
    expect(coreUnitDefinitions["neutral.magi"].neutral!.cost).toEqual({ gold: 11 });
    expect(polishUnitStackCost("neutral.magi", "neutral")).toEqual({ gold: 13 });
    // CONTROL: asking for the (nonexistent) Pack side of a Neutral-only card
    // must yield no price at all rather than a silently wrong one.
    expect(polishUnitStackCost("neutral.azure_dragons", "pack")).toBeNull();
  });

  it("every discounted Stack offer derives from that base (Necromancy half of 13 = 6)", () => {
    // The half-price surfaces are NOT a second pricing: they halve the ruled
    // base. This is also the ONE place in the game a Magi Stack can read "6".
    let state = towerGame("stack-price-necromancy");
    state.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "pack" }];
    state.players.p1.hand = ["ability.necromancy"];
    queueNecromancyReinforce(state, "p1", "basic", "ability.necromancy");
    pumpAdventureQueues(state);

    expect(label(state, "Add a Stack to Magi"), "half of the 13 base, rounded down").toBe(
      "Add a Stack to Magi (6 gold)"
    );
    const gold = state.players.p1.resources.gold;
    const pick = getLegalActions(state, "p1").find((legal) =>
      legal.label.includes("Add a Stack to Magi (6 gold)")
    )!;
    state = applyOk(state, pick.action);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(gold - 6);
  });

  it("a reserved Legion voucher still comes off the ruled base (13 − 4 = 9)", () => {
    let state = towerGame("stack-price-legion");
    state.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "pack" }];
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "stack", armyUnitId: "u_magi" } }
    ];
    expect(label(state, "Add Stack to Magi")).toBe("Add Stack to Magi (9 gold)");
    const gold = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
    });
    expect(state.players.p1.resources.gold).toBe(gold - 9);
    expect(state.players.p1.recruitDiscounts, "the voucher is single-use").toHaveLength(0);
  });

  it("the ruled price is paid through the recruit path (Freelancer's Guild substitution)", () => {
    // 13 gold owed, only 10 in the treasury: the Guild substitutes materials /
    // valuables for the missing 3, exactly like any recruit purchase.
    let state = towerGame("stack-price-guild");
    state.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "pack" }];
    state.players.p1.resources = { gold: 10, buildingMaterials: 10, valuables: 10 };
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings = [...town.buildings, "stronghold.freelancers_guild"];
    const before = { ...state.players.p1.resources };
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "tower.magi", armyUnitId: "u_magi" }]
    });
    const after = state.players.p1.resources;
    const spentGold = before.gold - after.gold;
    // The Guild substitutes at MARKET rates in whole lots (1 material = 1 gold,
    // 1 valuable = 3 gold), so count the gold EQUIVALENT, not raw resource units.
    const substituted =
      (before.buildingMaterials - after.buildingMaterials) * marketGoldValueOf("buildingMaterials") +
      (before.valuables - after.valuables) * marketGoldValueOf("valuables");
    expect(state.players.p1.army[0].stacks, "the Stack was bought without 13 gold in hand").toBe(1);
    expect(spentGold, "every gold coin is spent first").toBe(10);
    expect(spentGold + substituted, "the full ruled price is still paid").toBe(13);
  });

  it("CONTROL: with the rule off no Stack is priced or sold at all", () => {
    const off = towerGame("stack-price-off", false);
    off.players.p1.army = [{ id: "u_magi", unitDefId: "tower.magi", side: "pack" }];
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
