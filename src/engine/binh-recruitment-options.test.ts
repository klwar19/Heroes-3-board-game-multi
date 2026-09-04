import { describe, expect, it } from "vitest";
import { coreFactionDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState, DEFAULT_ANIME_OPTIONS, getLegalActions, getMainHero } from "./index";
import { ensureSettlementRecruitFactions, flagField, legionDiscountTargets, playerCanRecruitFewNow, playerRecruitUnitIds } from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import type { GameAction, GameState, MapFieldState } from "./state";

function ready(copies = true, settlements = true): GameState {
  let state = createAdventureGameState({
    seed: "binh-recruitment-options", rollFirstPlayer: false, events: false, unitExperience: true,
    houseRules: { "duplicate-unit-recruitment": copies, "settlement-foreign-recruitment": settlements },
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = ok(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.army = [];
  state.players.p1.resources = { gold: 10000, buildingMaterials: 10000, valuables: 10000 };
  const town = Object.values(state.towns).find((town) => town.controllerId === "p1")!;
  town.buildings = ["castle.dwelling_bronze", "castle.dwelling_silver", "castle.dwelling_gold", "castle.citadel"];
  return state;
}

function ok(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors.map((error) => error.message)).toEqual([]);
  return result.state;
}

function settlement(state: GameState, id = "foreign-settlement"): MapFieldState {
  const field: MapFieldState = {
    spaceId: id, tileInstanceId: "test", slot: 0, location: "settlement",
    blackCube: false, flagOwnerId: null, everFlagged: false, settlementResource: null,
  };
  state.adventure!.fields[id] = field;
  return field;
}

function recruit(state: GameState, unitDefId: string): GameState {
  return ok(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId }] });
}

describe("BINH settlement and duplicate recruitment options", () => {
  it("capture rolls a stable other-town roster, and all its tiers recruit at printed cost without dwellings", () => {
    let state = ready();
    const field = settlement(state);
    flagField(state, "p1", field);
    const faction = field.settlementRecruitFactionId!;
    expect(faction).toBeTruthy();
    expect(faction).not.toBe(state.players.p1.factionId);
    expect(isPlayableFaction(faction, state.anime)).toBe(true);
    Object.values(state.towns).find((town) => town.controllerId === "p1")!.buildings = ["castle.citadel"];
    const roster = coreFactionDefinitions[faction].units;
    for (const id of roster) {
      const before = state.players.p1.resources.gold;
      const allowed = playerCanRecruitFewNow(state, "p1", id);
      // Factory's mutually-exclusive Gold choice remains enforced.
      if (!allowed) continue;
      state = recruit(state, id);
      expect(state.players.p1.army.some((unit) => unit.unitDefId === id)).toBe(true);
      expect(before - state.players.p1.resources.gold).toBe(coreUnitDefinitions[id].few!.cost.gold ?? 0);
    }
    const saved = JSON.parse(JSON.stringify(state)) as GameState;
    ensureSettlementRecruitFactions(saved);
    expect(saved.adventure!.fields[field.spaceId].settlementRecruitFactionId).toBe(faction);
    saved.adventure!.fields[field.spaceId].flagOwnerId = "p2";
    ensureSettlementRecruitFactions(saved);
    expect(saved.adventure!.fields[field.spaceId].settlementRecruitFactionId).toBe(faction);
    expect(playerRecruitUnitIds(saved, "p1")).not.toContain(roster[0]);
    expect(playerRecruitUnitIds(saved, "p2")).toContain(roster[0]);
  });

  it("excludes disabled Anime and Wuxia towns, including when only one town module is enabled", () => {
    for (const anime of [
      { enabled: false, isekaiTowns: true, xianxiaTowns: true },
      { enabled: true, isekaiTowns: true, xianxiaTowns: false },
      { enabled: true, isekaiTowns: false, xianxiaTowns: true },
    ]) {
      const state = ready();
      state.anime = { ...DEFAULT_ANIME_OPTIONS, ...anime };
      for (let index = 0; index < 120; index++) settlement(state, `pool-${index}`).flagOwnerId = "p1";
      ensureSettlementRecruitFactions(state);
      const picks = Object.values(state.adventure!.fields).filter((field) => field.settlementRecruitFactionId);
      expect(picks).toHaveLength(120);
      for (const field of picks) {
        expect(isPlayableFaction(field.settlementRecruitFactionId!, state.anime)).toBe(true);
        expect(field.settlementRecruitFactionId).not.toBe(state.players.p1.factionId);
      }
    }
  });

  it("rule-off controls reject foreign and duplicate recruits with no resource or army changes", () => {
    let state = ready(false, false);
    const field = settlement(state);
    flagField(state, "p1", field);
    expect(field.settlementRecruitFactionId).toBeUndefined();
    state = recruit(state, "castle.marksmen");
    for (const id of ["castle.marksmen", "dungeon.black_dragons"]) {
      const before = structuredClone(state);
      const result = applyAction(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: id }] });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(state).toEqual(before);
      expect(playerCanRecruitFewNow(state, "p1", id)).toBe(false);
    }
  });

  it("copies pay independently, all expose upgrades, and upgrading one dilutes only its own experience", () => {
    let state = ready();
    for (let i = 0; i < 3; i++) state = recruit(state, "castle.marksmen");
    const army = state.players.p1.army;
    expect(new Set(army.map((unit) => unit.id)).size).toBe(3);
    expect(army.every((unit) => !unit.experience)).toBe(true);
    army[0].experience = 12;
    army[1].experience = 4;
    const targetId = army[0].id;
    const upgrades = getLegalActions(state, "p1").flatMap(({ action }) => action.type === "POPULATION_ACTION" ? action.purchases : [])
      .filter((purchase) => purchase.kind === "reinforce" && purchase.unitDefId === "castle.marksmen");
    expect(upgrades.map((purchase) => purchase.armyUnitId).sort()).toEqual(army.map((unit) => unit.id).sort());
    const beforeGold = state.players.p1.resources.gold;
    state = ok(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "reinforce", unitDefId: "castle.marksmen", armyUnitId: targetId }] });
    expect(state.players.p1.resources.gold).toBe(beforeGold - coreUnitDefinitions["castle.marksmen"].pack!.cost.gold!);
    expect(state.players.p1.army.map((unit) => [unit.side, unit.experience ?? 0])).toEqual([["pack", 6], ["few", 4], ["few", 0]]);
    state = recruit(state, "castle.marksmen");
    expect(state.players.p1.army[3].experience ?? 0).toBe(0);
  });

  it("deploys five Black Dragons together; a death removes just that slot and a new purchase restores it", () => {
    let state = ready();
    const field = settlement(state);
    field.flagOwnerId = "p1";
    field.settlementRecruitFactionId = "dungeon";
    for (let i = 0; i < 5; i++) {
      state = recruit(state, "dungeon.black_dragons");
      const id = state.players.p1.army.at(-1)!.id;
      state = ok(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "reinforce", unitDefId: "dungeon.black_dragons", armyUnitId: id }] });
    }
    const ids = state.players.p1.army.map((unit) => unit.id);
    const hero = getMainHero(state, "p1")!;
    // Stay below the field difficulty so the normal Quick Combat rule does not skip deployment.
    hero.level = 1;
    const guard = settlement(state, "battle-field");
    guard.location = "empty_field";
    guard.difficulty = 3;
    hero.spaceId = guard.spaceId;
    startNeutralEncounter(state, hero, guard);
    for (const id of ids) {
      const place = getLegalActions(state, "p1").find(({ action }) => action.type === "PLACE_COMBAT_UNIT" && action.armyUnitId === id);
      expect(place, `deployment for ${id}`).toBeTruthy();
      state = ok(state, place!.action);
    }
    const deployed = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p1");
    expect(deployed).toHaveLength(5);
    expect(new Set(deployed.map((unit) => unit.armyUnitId)).size).toBe(5);
    deployed[2].damage = deployed[2].maxHealth;
    const deadId = deployed[2].armyUnitId;
    getMainHero(state, "p1")!.level = 10;
    state.combat!.outcome = { winnerPlayerId: "p1", defeatedPlayerId: state.combat!.defenderPlayerId, reason: "all-enemy-units-defeated" };
    finalizeAdventureCombat(state);
    expect(state.players.p1.army).toHaveLength(4);
    expect(state.players.p1.army.map((unit) => unit.id)).toEqual(ids.filter((id) => id !== deadId));
    expect(state.players.p1.army.every((unit) => (unit.experience ?? 0) > 0)).toBe(true);
    state.pendingChoice = null;
    state.adventure!.pendingVisit = null;
    state.players.p1.townTokens.population = true;
    state = recruit(state, "dungeon.black_dragons");
    expect(state.players.p1.army).toHaveLength(5);
    expect(new Set(state.players.p1.army.map((unit) => unit.id)).size).toBe(5);
    expect(state.players.p1.army.at(-1)!.experience ?? 0).toBe(0);
  });

  it("rejects duplicate-type batches atomically so one reserved voucher cannot discount multiple copies", () => {
    const state = ready();
    const before = structuredClone(state);
    const result = applyAction(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [
      { kind: "recruit", unitDefId: "castle.marksmen" }, { kind: "recruit", unitDefId: "castle.marksmen" },
    ] });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(state).toEqual(before);
  });

  it("does not reuse a dead copy's ID after the last slot is removed and the save is reloaded", () => {
    let state = recruit(recruit(ready(), "castle.marksmen"), "castle.marksmen");
    const previousIds = state.players.p1.army.map((unit) => unit.id);
    state.players.p1.army.pop();
    state = recruit(JSON.parse(JSON.stringify(state)) as GameState, "castle.marksmen");
    expect(previousIds).not.toContain(state.players.p1.army.at(-1)!.id);
    state.players.p1.army = [];
    const nextOrdinal = state.players.p1.nextArmyUnitOrdinal!;
    state = recruit(state, "castle.marksmen");
    expect(state.players.p1.army[0].id).toBe(`army_p1_${nextOrdinal}`);
  });

  // A Legion voucher's TARGET LIST must be built from the same shared recruit
  // reads as every other recruit surface. It used to walk the OWN faction's
  // roster with a hard-coded "each card exists once" skip, so a
  // settlement-granted foreign unit and an extra copy could never be discounted
  // — and, because legal-actions withholds the discount SIDE when the list is
  // empty, a player holding one of every own-faction unit lost that side.
  it("Legion voucher targets include a settlement-granted foreign unit and an extra copy", () => {
    const state = ready();
    const field = settlement(state);
    field.flagOwnerId = "p1";
    field.settlementRecruitFactionId = "dungeon";
    const recruitNames = (current: GameState) =>
      legionDiscountTargets(current, "p1")
        .filter((target) => target.purchase.kind === "recruit")
        .map((target) => target.purchase.kind === "recruit" ? target.purchase.unitDefId : "");

    // The foreign roster is a legal Legion target with the rule ON.
    expect(recruitNames(state)).toContain("dungeon.black_dragons");
    // An extra COPY: owning one Marksmen no longer removes it from the list.
    const withCopy = recruit(state, "castle.marksmen");
    expect(playerCanRecruitFewNow(withCopy, "p1", "castle.marksmen")).toBe(true);
    expect(recruitNames(withCopy)).toContain("castle.marksmen");
  });

  it("CONTROL: with both house rules OFF the Legion target list is own-roster, one copy only", () => {
    const state = ready(false, false);
    const field = settlement(state);
    field.flagOwnerId = "p1";
    field.settlementRecruitFactionId = "dungeon";
    const recruitNames = (current: GameState) =>
      legionDiscountTargets(current, "p1")
        .filter((target) => target.purchase.kind === "recruit")
        .map((target) => target.purchase.kind === "recruit" ? target.purchase.unitDefId : "");

    expect(recruitNames(state)).not.toContain("dungeon.black_dragons");
    expect(recruitNames(state)).toContain("castle.marksmen");
    const withCopy = recruit(state, "castle.marksmen");
    expect(recruitNames(withCopy)).not.toContain("castle.marksmen");
  });

  it("consumes a recruit voucher on only the first copy and an upgrade voucher on only its targeted slot", () => {
    let state = ready();
    state.players.p1.recruitDiscounts = [{ cardId: "artifact.legs_of_legion", amount: 2, target: { kind: "recruit", unitDefId: "castle.marksmen" } }];
    const fewGold = coreUnitDefinitions["castle.marksmen"].few!.cost.gold!;
    const startGold = state.players.p1.resources.gold;
    state = recruit(state, "castle.marksmen");
    expect(state.players.p1.resources.gold).toBe(startGold - Math.max(0, fewGold - 2));
    expect(state.players.p1.recruitDiscounts).toEqual([]);
    const secondStart = state.players.p1.resources.gold;
    state = recruit(state, "castle.marksmen");
    expect(state.players.p1.resources.gold).toBe(secondStart - fewGold);
    const [first, second] = state.players.p1.army;
    state.players.p1.recruitDiscounts = [{ cardId: "artifact.legs_of_legion", amount: 2, target: { kind: "reinforce", armyUnitId: second.id } }];
    const packGold = coreUnitDefinitions["castle.marksmen"].pack!.cost.gold!;
    for (const [target, discount] of [[first, 0], [second, 2]] as const) {
      const before = state.players.p1.resources.gold;
      state = ok(state, { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "reinforce", unitDefId: target.unitDefId, armyUnitId: target.id }] });
      expect(state.players.p1.resources.gold).toBe(before - Math.max(0, packGold - discount));
    }
    expect(state.players.p1.recruitDiscounts).toEqual([]);
  });
});
