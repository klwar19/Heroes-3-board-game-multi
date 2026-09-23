import { describe, expect, it } from "vitest";
import type { GameAction, GameState } from "../state";
import { createAdventureGameState } from "../adventure-setup";
import { coreFactionDefinitions } from "@/data/factions/core";
import { addArmyUnit } from "../adventure";
import { scoreMapAction } from "./map-policy";
import { goldMilestoneConversionGold } from "./development";
import { observeForComputer } from "./observation";

describe("gold milestone deadline spending", () => {
  function castleSeat(round: number, resources: GameState["players"][string]["resources"]) {
    const castle = coreFactionDefinitions.castle;
    const state = createAdventureGameState({
      seed: "conversion-reserve", difficulty: "impossible", events: false, rollFirstPlayer: false, sessionMode: "single-player",
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: castle.heroes[0] },
        { id: "p2", name: "P2", factionId: "castle", heroDefId: castle.heroes[0] },
      ],
      controllers: {
        p1: { kind: "computer", difficulty: "standard", policyVersion: 1 },
        p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
      },
    } as Parameters<typeof createAdventureGameState>[0]) as GameState;
    state.round = round;
    const player = state.players.p2;
    player.resources = resources;
    player.production = { gold: 20, buildingMaterials: 4, valuables: 1 };
    player.army = [];
    for (const [id, side] of [["castle.halberdiers", "pack"], ["castle.marksmen", "pack"], ["castle.griffins", "pack"],
      ["castle.crusaders", "few"]] as const) addArmyUnit(player, id, side);
    const town = Object.values(state.towns).find(t => t.controllerId === "p2")!;
    for (const id of ["castle.dwelling_bronze", "castle.dwelling_silver", "castle.mage_guild"]) {
      if (!town.buildings.includes(id)) town.buildings.push(id);
    }
    return state;
  }

  it("prices the missing valuables in gold after surplus materials are exchanged", () => {
    // Milestone: Gold dwelling 10g/9m/4v + Archangels 20g/1v. R7 → one payout (R9).
    // Valuables 1 + 1 - 5 = -3; materials 10 + 4 - 9 = +5 → one 3:1 exchange → 2 valuables × 6 gold.
    const state = castleSeat(7, { gold: 26, buildingMaterials: 10, valuables: 1 });
    expect(goldMilestoneConversionGold(state, "p2")).toBe(12);
    // CONTROL: with the valuables in stock nothing needs converting.
    const flush = castleSeat(7, { gold: 26, buildingMaterials: 10, valuables: 4 });
    expect(goldMilestoneConversionGold(flush, "p2")).toBe(0);
  });

  it("skips a Mage Guild spell purchase that eats the gold still needed to buy valuables", () => {
    const action = { type: "SPELL_BOOK_ACTION", playerId: "p2" } as GameAction;
    // No real Magic Arrow owned, so only the gold reserve can stop the search.
    const short = castleSeat(7, { gold: 45, buildingMaterials: 10, valuables: 1 });
    const flush = castleSeat(7, { gold: 45, buildingMaterials: 10, valuables: 5 });
    for (const seat of [short, flush]) { seat.players.p2.hand = []; seat.players.p2.spellBook = []; }
    expect(scoreMapAction(observeForComputer(short, "p2"), action)?.policy).toBe("town.skip-spell-buy-fund-army");
    // CONTROL: valuables in stock → the same gold is spare and the search is bought.
    expect(scoreMapAction(observeForComputer(flush, "p2"), action)?.policy).not.toBe("town.skip-spell-buy-fund-army");
  });
  it("declines paid visits and Neutral recruits that would make the Gold milestone miss R9", () => {
    const visit = (state: GameState, step: unknown) => {
      (state.adventure as unknown as { pendingVisit: unknown }).pendingVisit = { playerId: "p2", fieldId: "x", steps: [step] };
      return scoreMapAction(observeForComputer(state, "p2"), { type: "RESOLVE_VISIT_STEP", playerId: "p2", optionIndex: 0 } as GameAction)?.score ?? 0;
    };
    const tree = { type: "PAY_TO", costOptions: [{ gold: 10 }], steps: [{ type: "GAIN_EXPERIENCE", amount: 2 }] };
    const conflux = { type: "CHOOSE_ONE", options: [
      { label: "Recruit Ice Elementals", steps: [{ type: "ELEMENTAL_RECRUIT_ONE", unitDefId: "neutral.ice_elementals", tier: "silver" }] },
      { label: "Decline", steps: [] }] };
    // R9, Gold dwelling standing: 16 gold is already short of the 20-gold Archangels.
    const short = castleSeat(9, { gold: 16, buildingMaterials: 12, valuables: 6 });
    Object.values(short.towns).find(t => t.controllerId === "p2")!.buildings.push("castle.dwelling_gold");
    // CONTROL: a flush seat still buys the experience and the recruit.
    const flush = castleSeat(9, { gold: 70, buildingMaterials: 12, valuables: 6 });
    // Bronze-only armies: the Silver-army Bronze rule must not be what declines the recruit.
    for (const seat of [short, flush]) seat.players.p2.army = seat.players.p2.army.filter(unit => unit.unitDefId !== "castle.crusaders");
    expect(visit(flush, tree)).toBeGreaterThan(1_050);
    expect(visit(flush, conflux)).toBeGreaterThan(1_050);
    expect(visit(short, tree)).toBeLessThan(1_050);
    expect(visit(short, conflux)).toBeLessThan(1_050);
  });
});
