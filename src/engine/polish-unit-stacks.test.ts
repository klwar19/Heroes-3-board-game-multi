import { describe, expect, it } from "vitest";

import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  NEUTRAL_PLAYER_ID,
  polishArmyUnitCanBuyStack,
  polishUnitStackCap,
  polishUnitStackCost,
  unitSideRuleOverrides
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { processPendingVisit } from "./adventure";
import { attackIsLethal, unitRemainingHealth } from "./computer/score";
import { getUnitAbilityDefinitions } from "./unit-abilities";
import type { CombatState, GameAction, GameState } from "./state";

function makeState(enabled = true, seed = "polish-unit-stacks"): GameState {
  let state = createAdventureGameState({ startingBuildings: [],
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "legacy",
    houseRules: { "polish-unit-stacks": enabled }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.townTokens.population = true;
  state.players.p1.resources = { gold: 500, buildingMaterials: 100, valuables: 100 };
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function addCitadel(state: GameState): void {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
  if (!town.buildings.includes("castle.citadel")) {
    town.buildings.push("castle.citadel");
  }
}

const griffin = { id: "stack_griffins", unitDefId: "castle.griffins", side: "pack" as const };

describe("Polish Unit Stacks — cost, eligibility, and purchase", () => {
  it("uses Pack gold + tier-gold cost plus the Pack's printed valuables (the Few→Pack fee)", () => {
    // Valuables = the side's printed valuables (same as a Few→Pack reinforce):
    // a Pack that prints no valuables adds none; a Gold Dragon Pack prints 2.
    expect(polishUnitStackCost("rampart.centaurs"), "Centaur: 3 Pack gold + tier 1, no valuables").toEqual({
      gold: 4
    });
    expect(polishUnitStackCost("castle.griffins")).toEqual({ gold: 7 });
    expect(polishUnitStackCost("castle.crusaders")).toEqual({ gold: 12 });
    expect(
      polishUnitStackCost("rampart.gold_dragons"),
      "Gold Dragon: 30 Pack gold + tier 3, + the Pack's 2 valuables"
    ).toEqual({ gold: 33, valuables: 2 });
    expect(
      polishUnitStackCost("castle.archangels"),
      "Archangel: 30 Pack gold + tier 3, + the Pack's 2 valuables"
    ).toEqual({ gold: 33, valuables: 2 });
    expect(polishUnitStackCap("castle.griffins")).toBe(3);
    expect(polishUnitStackCap("castle.crusaders")).toBe(2);
    expect(polishUnitStackCap("castle.archangels")).toBe(1);
  });

  it("reflects each side's printed RECRUITMENT valuables for every tier — gold LV6 and azure Neutrals too", () => {
    // A gold LV6 faction Pack prints 1 valuable to reinforce Few→Pack, so its
    // Stack also costs 1 valuable — the same fee, not only the LV7 (2 valuables)
    // Packs. (Champions: 20 Pack gold + tier 3 = 23, + the Pack's 1 valuable.)
    expect(
      polishUnitStackCost("castle.champions", "pack"),
      "gold LV6 Pack (Champions): 20 + 3 gold, + the Pack's 1 valuable"
    ).toEqual({ gold: 23, valuables: 1 });
    expect(polishUnitStackCost("necropolis.dread_knights", "pack")).toEqual({ gold: 23, valuables: 1 });

    // Recruited NEUTRALS (incl. AZURE, which has no Pack side) mirror the
    // Neutral card's own printed recruitment cost: charge valuables iff its
    // recruit cost lists them, exactly like buying that Neutral.
    expect(
      polishUnitStackCost("neutral.azure_dragons", "neutral"),
      "azure Neutral recruits for 2 valuables → Stack costs 2"
    ).toEqual({ gold: 48, valuables: 2 });
    expect(
      polishUnitStackCost("neutral.rust_dragons", "neutral"),
      "azure Neutral recruits for 1 valuable → Stack costs 1"
    ).toEqual({ gold: 41, valuables: 1 });
    // Azure Neutrals whose recruit cost lists NO valuables charge none.
    expect(polishUnitStackCost("neutral.titans", "neutral")).toEqual({ gold: 42 });
    expect(polishUnitStackCost("neutral.gold_dragons", "neutral")).toEqual({ gold: 45 });
    // Gold LV6 Neutral (cheaper recruit cost, no printed valuables) charges none.
    expect(polishUnitStackCost("neutral.champions", "neutral")).toEqual({ gold: 21 });

    // Azure counts as gold for the cap (human cap 1).
    expect(polishUnitStackCap("neutral.azure_dragons", "neutral")).toBe(1);
    expect(polishUnitStackCap("neutral.titans", "neutral")).toBe(1);
  });

  it("offers a Citadel Pack purchase and can buy several layers in one validated batch", () => {
    let state = makeState();
    addCitadel(state);
    state.players.p1.army = [{ ...griffin }];
    const beforeGold = state.players.p1.resources.gold;

    const offered = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
    );
    expect(offered?.label).toContain("Add Stack to Griffins");

    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [
        { kind: "stack", unitDefId: griffin.unitDefId, armyUnitId: griffin.id },
        { kind: "stack", unitDefId: griffin.unitDefId, armyUnitId: griffin.id }
      ]
    });

    expect(state.players.p1.army[0].stacks).toBe(2);
    // Two bronze Griffin Stacks: 2 × 7 gold (the Griffin Pack prints no valuables).
    expect(state.players.p1.resources.gold).toBe(beforeGold - 14);
    expect(state.players.p1.townTokens.population, "the normal multi-purchase window stays open").toBe(true);
    expect(state.eventLog.filter((event) => event.type === "ARMY_STACK_PURCHASED")).toHaveLength(2);
  });

  it("charges the Pack's printed valuables (the Few→Pack fee) in real valuables", () => {
    let state = makeState();
    addCitadel(state);
    const dragon = { id: "stack_gd", unitDefId: "rampart.gold_dragons", side: "pack" as const };
    state.players.p1.army = [{ ...dragon }];
    const beforeGold = state.players.p1.resources.gold;
    const beforeValuables = state.players.p1.resources.valuables;

    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: dragon.unitDefId, armyUnitId: dragon.id }]
    });

    // Gold Dragon Pack: 30 gold + 2 valuables → one Stack = 33 gold + 2 valuables.
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(beforeGold - 33);
    expect(state.players.p1.resources.valuables).toBe(beforeValuables - 2);
  });

  it("enforces the cap across a batch and leaves state unchanged on rejection", () => {
    const state = makeState();
    addCitadel(state);
    state.players.p1.army = [{ ...griffin, stacks: 2 }];
    const result = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [
        { kind: "stack", unitDefId: griffin.unitDefId, armyUnitId: griffin.id },
        { kind: "stack", unitDefId: griffin.unitDefId, armyUnitId: griffin.id }
      ]
    });
    expect(result.errors[0]?.message).toContain("Stack cap");
    expect(result.state.players.p1.army[0].stacks).toBe(2);
  });

  it("requires the rule and Citadel; Few cards never receive an offer (Neutrals may)", () => {
    const off = makeState(false, "polish-stacks-off");
    addCitadel(off);
    off.players.p1.army = [{ ...griffin }];
    expect(
      getLegalActions(off, "p1").some(
        (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
      )
    ).toBe(false);
    expect(
      applyAction(off, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "stack", unitDefId: griffin.unitDefId, armyUnitId: griffin.id }]
      }).errors[0]?.message
    ).toContain("not enabled");

    const noCitadel = makeState(true, "polish-stacks-no-citadel");
    noCitadel.players.p1.army = [{ ...griffin }];
    expect(
      applyAction(noCitadel, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "stack", unitDefId: griffin.unitDefId, armyUnitId: griffin.id }]
      }).errors[0]?.message
    ).toContain("Citadel");

    const few = makeState(true, "polish-stacks-few");
    addCitadel(few);
    few.players.p1.army = [{ ...griffin, side: "few" }];
    expect(
      getLegalActions(few, "p1").some(
        (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
      )
    ).toBe(false);
  });

  it("lets recruited Neutrals buy Stacks using neutral gold + army caps (bronze 3 / silver 2 / gold 1)", () => {
    // CONTROL: Pack griffin cost/cap unchanged (gold 6 + bronze 1 = 7, no valuables; cap 3).
    expect(polishUnitStackCost("castle.griffins", "pack")).toEqual({ gold: 7 });
    expect(polishUnitStackCap("castle.griffins", "pack")).toBe(3);

    // Bronze neutral: cost = 7 gold + 1; human army cap is always bronze 3
    // (bank combat punch-up does NOT apply once the unit is player-owned).
    const neutralGriffin = {
      id: "army_neutral_griffins",
      unitDefId: "neutral.griffins",
      side: "neutral" as const
    };
    expect(polishUnitStackCost("neutral.griffins", "neutral")).toEqual({ gold: 8 });
    expect(polishUnitStackCap("neutral.griffins", "neutral")).toBe(3);
    expect(polishArmyUnitCanBuyStack(neutralGriffin)).toBe(true);

    // Gold Neutral (Nagas): human cap is 1. Nagas print no valuables.
    expect(polishUnitStackCap("neutral.nagas", "neutral")).toBe(1);
    expect(polishUnitStackCost("neutral.nagas", "neutral")).toEqual({ gold: 16 + 3 });

    // CONTROL: Pack gold unit still uses army cap 1.
    expect(polishUnitStackCap("castle.archangels", "pack")).toBe(1);

    let state = makeState(true, "polish-stacks-neutral-buy");
    addCitadel(state);
    state.players.p1.army = [{ ...neutralGriffin }];
    const beforeGold = state.players.p1.resources.gold;

    const offered = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "POPULATION_ACTION" &&
        legal.action.purchases[0]?.kind === "stack" &&
        legal.action.purchases[0].armyUnitId === neutralGriffin.id
    );
    expect(offered?.label).toContain("Add Stack to Griffins");

    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "neutral.griffins", armyUnitId: neutralGriffin.id }]
    });
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(beforeGold - 8);

    // Combat: neutral stacks grant +1 Attack and peel full health layers.
    const combatUnit = makeCombatUnitFromArmy(
      { ...neutralGriffin, stacks: 2 },
      "p1",
      "combat_n_griffins",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    const baseAtk = combatUnit.attack - 1;
    expect(combatUnit.variant).toBe("neutral");
    expect(combatUnit.armyStacks).toBe(2);
    expect(combatUnit.attack).toBe(baseAtk + 1);

    combatUnit.damage = combatUnit.maxHealth;
    markUnitRemovedIfNeeded(state, combatUnit);
    expect(combatUnit.armyStacks).toBe(1);
    expect(combatUnit.damage).toBe(0);
    expect(combatUnit.attack).toBe(baseAtk + 1);
  });

  it("polish-bank-sizes alone does NOT activate army Unit Stacks (they are a polish-unit-stacks feature)", () => {
    // Army Unit Stack layers belong to polish-unit-stacks. Polish Bank Sizes now
    // uses the standard Creature Bank Stack Tokens and grants the classic reward
    // (a plain Pack), so with ONLY polish-bank-sizes on a Pack card that happens
    // to carry `stacks` gets NO +1 Attack and NO layer peel, and the Citadel
    // offers no Stack purchase.
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "polish-bank-only-no-army-stacks",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      ruleset: "legacy",
      creatureBanks: true,
      houseRules: { "polish-unit-stacks": false, "polish-bank-sizes": true }
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.townTokens.population = true;
    state.players.p1.resources = { gold: 500, buildingMaterials: 100, valuables: 100 };
    addCitadel(state);
    const carded = {
      id: "carded_flies",
      unitDefId: "fortress.dragon_flies",
      side: "pack" as const,
      stacks: 2
    };
    state.players.p1.army = [{ ...carded }];

    // PURCHASE control: no Citadel Stack offer without polish-unit-stacks.
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
      )
    ).toBe(false);

    // COMBAT: the layers are INERT — no armyStacks, no +1 Attack, and a lethal
    // hit downgrades the Pack to Few instead of peeling a layer.
    const twin = makeCombatUnitFromArmy(
      { ...carded, id: "carded_twin", stacks: 0 },
      "p1",
      "combat_twin",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    const inert = makeCombatUnitFromArmy(
      { ...carded },
      "p1",
      "combat_inert",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    expect(inert.armyStacks ?? 0).toBe(0);
    expect(inert.attack).toBe(twin.attack);
    inert.damage = inert.maxHealth;
    markUnitRemovedIfNeeded(state, inert);
    expect(inert.variant).toBe("few");

    // CONTROL: with polish-unit-stacks ON the SAME card's layers are live —
    // +1 Attack over the stack-less twin, and a lethal hit peels one layer.
    const on = createAdventureGameState({ startingBuildings: [],
      seed: "polish-unit-stacks-live",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      ruleset: "legacy",
      creatureBanks: true,
      houseRules: { "polish-unit-stacks": true, "polish-bank-sizes": false }
    });
    const live = makeCombatUnitFromArmy(
      { ...carded },
      "p1",
      "combat_live",
      0,
      "legacy",
      unitSideRuleOverrides(on)
    )!;
    expect(live.armyStacks).toBe(2);
    expect(live.attack).toBe(twin.attack + 1);
    live.damage = live.maxHealth;
    markUnitRemovedIfNeeded(on, live);
    expect(live.armyStacks).toBe(1);
    expect(live.damage).toBe(0);
  });
});

describe("Polish Unit Stacks — combat layers", () => {
  it("adds exactly +1 Attack and carries a large hit through several full Pack layers", () => {
    const state = makeState(true, "polish-stacks-layers");
    const unit = makeCombatUnitFromArmy(
      { ...griffin, stacks: 2 },
      "p1",
      "combat_griffins",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    expect(unit.attack).toBe(4); // printed Pack Attack 3 + one flat Stack bonus
    expect(unit.maxHealth).toBe(4);
    expect(unit.armyStacks).toBe(2);

    // Chip ONE layer first: the recompute after a layer loss must KEEP the +1
    // while a Stack remains (this pins the applyUnitCurrentSide branch — the
    // construction-time bonus above cannot stand in for it).
    unit.damage = 5;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.armyStacks).toBe(1);
    expect(unit.damage).toBe(1);
    expect(unit.attack, "the bonus persists while a Stack remains").toBe(4);

    unit.damage = 7;
    markUnitRemovedIfNeeded(state, unit);

    expect(unit.variant).toBe("pack");
    expect(unit.armyStacks).toBe(0);
    expect(unit.damage).toBe(3);
    expect(unit.attack, "the bonus drops with the final Stack").toBe(3);
    expect(state.eventLog.filter((event) => event.type === "ARMY_STACK_LOST")).toHaveLength(2);
    expect(state.eventLog.some((event) => event.type === "UNIT_REMOVED")).toBe(false);
  });

  it("keeps the Pack ability on every Stack layer and only switches to Few after the Pack itself falls", () => {
    const state = makeState(true, "polish-stacks-pack-ability");
    const unit = makeCombatUnitFromArmy(
      { id: "stack_crusaders", unitDefId: "castle.crusaders", side: "pack", stacks: 1 },
      "p1",
      "combat_crusaders",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;

    expect(unit.variant).toBe("pack");
    expect(unit.abilities).toContain("attack-die-reroll");

    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.armyStacks).toBe(0);
    expect(unit.variant, "losing the paid Stack reveals the original Pack layer").toBe("pack");
    expect(unit.abilities, "the exposed Pack keeps the printed Pack ability").toContain("attack-die-reroll");

    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.variant, "only lethal damage to the original Pack flips the card").toBe("few");
    expect(unit.abilities).not.toContain("attack-die-reroll");
  });

  it("lets Rebirth fire before spending a Stack", () => {
    const state = makeState(true, "polish-stacks-rebirth");
    const unit = makeCombatUnitFromArmy(
      { id: "phoenix", unitDefId: "conflux.phoenixes", side: "pack", stacks: 1 },
      "p1",
      "combat_phoenix",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.usedRebirthThisCombat).toBe(true);
    expect(unit.armyStacks).toBe(1);
    expect(unit.damage).toBe(unit.maxHealth - 1);

    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.armyStacks).toBe(0);
    expect(unit.variant).toBe("pack");
  });

  it("does not activate Creature Bank requiresStacked abilities", () => {
    const state = makeState(true, "polish-stacks-isolation");
    const unit = makeCombatUnitFromArmy(
      { ...griffin, stacks: 1 },
      "p1",
      "combat_isolation",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    unit.abilities = ["bank-black-dragon-stacked-attack"];
    expect(unit.armyStacks).toBe(1);
    expect(unit.stackToken).toBeUndefined();
    expect(getUnitAbilityDefinitions(unit)).toEqual([]);
  });

  it("CONTROL: with the rule off, a forged armyStacks field does not absorb lethal damage", () => {
    const state = makeState(false, "polish-stacks-combat-off");
    const unit = makeCombatUnitFromArmy(griffin, "p1", "combat_control", 0, "legacy", unitSideRuleOverrides(state))!;
    unit.armyStacks = 1;
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.armyStacks).toBeUndefined();
    expect(state.eventLog.some((event) => event.type === "ARMY_STACK_LOST")).toBe(false);
  });
});

describe("Polish Unit Stacks — post-combat persistence", () => {
  function finishLostNeutralCombat(state: GameState, unit: ReturnType<typeof makeCombatUnitFromArmy>): void {
    const hero = state.heroes.hero_p1;
    state.phase = "combat";
    state.combat = {
      attackerPlayerId: "p1",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      units: { [unit!.id]: unit! },
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId: hero.spaceId!,
        difficulty: 1,
        hasAzure: false
      },
      outcome: {
        winnerPlayerId: NEUTRAL_PLAYER_ID,
        defeatedPlayerId: "p1",
        reason: "all-enemy-units-defeated"
      }
    } as CombatState;
    finalizeAdventureCombat(state);
  }

  it("writes surviving Stack losses back to the army card", () => {
    const state = makeState(true, "polish-stacks-sync");
    state.players.p1.army = [{ ...griffin, stacks: 2 }, { id: "spare", unitDefId: "castle.marksmen", side: "few" }];
    const unit = makeCombatUnitFromArmy(
      state.players.p1.army[0],
      "p1",
      "combat_sync",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    unit.armyStacks = 1;
    finishLostNeutralCombat(state, unit);
    expect(state.players.p1.army.find((entry) => entry.id === griffin.id)?.stacks).toBe(1);
  });

  it("a defeated army card leaves the army with all purchased Stacks", () => {
    const state = makeState(true, "polish-stacks-death");
    state.players.p1.army = [{ ...griffin, stacks: 2 }, { id: "spare", unitDefId: "castle.marksmen", side: "few" }];
    const unit = makeCombatUnitFromArmy(
      state.players.p1.army[0],
      "p1",
      "combat_death",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    unit.armyStacks = 0;
    unit.variant = "few";
    unit.damage = unit.maxHealth;
    finishLostNeutralCombat(state, unit);
    expect(state.players.p1.army.some((entry) => entry.id === griffin.id)).toBe(false);
  });
});

describe("Polish Unit Stacks — co-composition fixes", () => {
  it("AI remaining-health counts army-stack layers so a layered Pack is not 'lethal' for one bar", () => {
    const state = makeState(true, "polish-stacks-ai-health");
    const unit = makeCombatUnitFromArmy(
      { ...griffin, stacks: 1 },
      "p1",
      "combat_ai",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    // One full bar of damage would kill an unstacked Pack but not a 1-stack Pack.
    expect(unitRemainingHealth(unit)).toBe(unit.maxHealth * 2);
    const attacker = {
      ...unit,
      id: "attacker",
      attack: unit.maxHealth,
      defense: 0
    };
    // Expected damage = max(0, attack - defense) = maxHealth — lethal without stacks.
    unit.armyStacks = 0;
    expect(attackIsLethal(attacker, unit)).toBe(true);
    unit.armyStacks = 1;
    expect(attackIsLethal(attacker, unit)).toBe(false);
  });

  it("RECRUIT_FREE.stacks is ignored when polish-unit-stacks is OFF (latent grant gate)", () => {
    const state = makeState(false, "polish-stacks-recruit-free-off");
    state.players.p1.army = [];
    const fieldId = Object.keys(state.adventure!.fields)[0];
    const heroId = Object.keys(state.heroes).find((id) => state.heroes[id]?.controllerId === "p1") ?? "hero_p1";
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId,
      fieldId,
      steps: [{ type: "RECRUIT_FREE", unitDefId: "castle.griffins", side: "pack", stacks: 2 }]
    };
    processPendingVisit(state);
    expect(state.players.p1.army).toHaveLength(1);
    expect(state.players.p1.army[0].stacks).toBeUndefined();
  });

  it("RECRUIT_FREE.stacks clamps to the tier cap when the rule is ON", () => {
    const state = makeState(true, "polish-stacks-recruit-free-on");
    state.players.p1.army = [];
    const fieldId = Object.keys(state.adventure!.fields)[0];
    const heroId = Object.keys(state.heroes).find((id) => state.heroes[id]?.controllerId === "p1") ?? "hero_p1";
    // Bronze cap is 3 — request 99, get 3.
    state.adventure!.pendingVisit = {
      playerId: "p1",
      heroId,
      fieldId,
      steps: [{ type: "RECRUIT_FREE", unitDefId: "castle.griffins", side: "pack", stacks: 99 }]
    };
    processPendingVisit(state);
    expect(state.players.p1.army[0].stacks).toBe(3);
  });

  it("Neutral stack Attack fold matches Pack (+1 while stacked)", () => {
    const state = makeState(true, "polish-stacks-neutral-atk-ui");
    const neutral = { id: "n_griff", unitDefId: "neutral.griffins", side: "neutral" as const, stacks: 1 };
    const combat = makeCombatUnitFromArmy(
      neutral,
      "p1",
      "combat_n",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    const unstacked = makeCombatUnitFromArmy(
      { ...neutral, stacks: 0 },
      "p1",
      "combat_n0",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    expect(combat.attack).toBe(unstacked.attack + 1);
  });
});
