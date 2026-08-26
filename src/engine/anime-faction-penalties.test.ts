import { describe, expect, it } from "vitest";

import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { effectiveHandLimit, getMainHero, startAdventureRound } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { applyAzurLaneCombatStartPenalty } from "./anime-faction-penalties";
import { animeFactionPenaltyTitle } from "@/data/anime/faction-penalties";
import type { FactionId, GameState } from "./state";

function resourceState(factionId: FactionId): GameState {
  const state = createAdventureGameState({
    seed: `penalty-${factionId}`,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    players: [
      { id: "p1", name: "Anime", factionId, heroDefId: factionId === "mgq" ? "luka" : undefined },
      { id: "p2", name: "Control", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  state.pendingChoice = null;
  state.adventure!.rewardQueue = [];
  state.players.p1.resources = { gold: 10, buildingMaterials: 3, valuables: 0 };
  state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  state.round = 3;
  return state;
}

describe("anime faction Resource-round penalties", () => {
  it.each(["fuyuki", "azure_breeze", "heavenly_demon"] as const)("%s loses 4 gold after income without debt", (factionId) => {
    const state = resourceState(factionId);
    startAdventureRound(state);
    expect(state.players.p1.resources.gold).toBe(6);
    // Each town names its own penalty — never a shared "Otherworld Penalty".
    const title = animeFactionPenaltyTitle(factionId)!;
    expect(state.eventLog.some((event) => event.type === "EVENT_NOTE" && event.message.startsWith(`${title} — 4 gold`))).toBe(true);
    expect(state.eventLog.some((event) => event.type === "EVENT_NOTE" && event.message.includes("Otherworld Penalty"))).toBe(false);

    state.players.p1.resources.gold = 2;
    state.round = 5;
    startAdventureRound(state);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it.each(["hidden_leaf", "mgq"] as const)("%s loses exactly 1 hand limit on a Resource round, never stacking", (factionId) => {
    const state = resourceState(factionId);
    const base = effectiveHandLimit(state, "p1");
    // Resource round (round 3): −1 for this round only.
    startAdventureRound(state);
    expect(state.players.p1.otherworldHandLimitLoss).toBe(1);
    expect(effectiveHandLimit(state, "p1")).toBe(Math.max(1, base - 1));
    // A LATER Resource round re-applies −1 — it never accumulates to −2.
    state.round = 5;
    startAdventureRound(state);
    expect(state.players.p1.otherworldHandLimitLoss).toBe(1);
    expect(effectiveHandLimit(state, "p1")).toBe(Math.max(1, base - 1));
  });

  it("clears the round-scoped hand-limit penalty on a round that does not re-apply it", () => {
    const state = resourceState("hidden_leaf");
    startAdventureRound(state); // round 3 (resource): loss = 1
    expect(state.players.p1.otherworldHandLimitLoss).toBe(1);
    // The round-start clear reverts it for a round the penalty does not touch —
    // proven with a seat that no longer qualifies, since the clear runs for every
    // round kind (mutation: remove the clear and the loss stays 1).
    state.players.p1.factionId = "castle";
    state.round = 5;
    startAdventureRound(state);
    expect(state.players.p1.otherworldHandLimitLoss ?? 0).toBe(0);
  });

  it("Little Busters pays 5 gold and 1 material, floored at what is available", () => {
    const state = resourceState("little_busters");
    startAdventureRound(state);
    expect(state.players.p1.resources).toMatchObject({ gold: 5, buildingMaterials: 2 });
    state.players.p1.resources.gold = 2;
    state.players.p1.resources.buildingMaterials = 0;
    state.round = 5;
    startAdventureRound(state);
    expect(state.players.p1.resources).toMatchObject({ gold: 0, buildingMaterials: 0 });
  });

  it("leaves ordinary towns unchanged", () => {
    const state = resourceState("castle");
    startAdventureRound(state);
    expect(state.players.p1.resources).toMatchObject({ gold: 10, buildingMaterials: 3 });
    expect(state.players.p1.otherworldHandLimitLoss).toBeUndefined();
  });
});

describe("Azur Lane Fleet Maintenance", () => {
  it("damages exactly one real deployed army unit once per combat", () => {
    const state = createAdventureGameState({ seed: "azur-maintenance", rollFirstPlayer: false });
    state.players.p1.factionId = "azur_lane";
    state.combat = createInitialGameState("azur-maintenance-combat").combat;
    const own = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p1");
    own.forEach((unit, index) => { unit.armyUnitId = `azur_army_${index}`; });
    const before = own.reduce((sum, unit) => sum + unit.damage, 0);
    applyAzurLaneCombatStartPenalty(state);
    expect(own.reduce((sum, unit) => sum + unit.damage, 0) - before).toBe(1);
    expect(own.filter((unit) => unit.damage > 0)).toHaveLength(1);
    applyAzurLaneCombatStartPenalty(state);
    expect(own.reduce((sum, unit) => sum + unit.damage, 0) - before).toBe(1);
    expect(state.eventLog.filter((event) => event.type === "EVENT_NOTE" && event.message.startsWith("Fleet Maintenance —"))).toHaveLength(1);
  });

  it("fires through the real neutral-combat setup seam", () => {
    let state = createAdventureGameState({
      seed: "azur-maintenance-integration",
      ruleset: "binh",
      anime: { enabled: true, isekaiTowns: true },
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Enterprise", factionId: "azur_lane", heroDefId: "enterprise" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const refreshed = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(refreshed.errors).toEqual([]);
      state = refreshed.state;
    }
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!]!;
    field.difficulty = 1;
    startNeutralEncounter(state, hero, field);
    while (true) {
      const placement = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      if (!placement) break;
      const placed = applyAction(state, placement.action);
      expect(placed.errors).toEqual([]);
      state = placed.state;
    }
    const finished = applyAction(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    expect(finished.errors).toEqual([]);
    state = finished.state;
    const ownArmyUnits = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p1" && unit.armyUnitId && !unit.commanderSlug);
    expect(ownArmyUnits.reduce((sum, unit) => sum + unit.damage, 0)).toBe(1);
    expect(state.eventLog.some((event) => event.type === "EVENT_NOTE" && event.message.startsWith("Fleet Maintenance —"))).toBe(true);
  });
});
