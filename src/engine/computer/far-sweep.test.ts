import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createAdventureGameState } from "../adventure-setup";
import { applyAction } from "../reducer";
import { getPlayerView } from "../player-view";
import { getLegalActions } from "../legal-actions";
import type { CombatState, GameAction, MapTileState } from "../state";
import { canBeatGuardedField, primaryMapObjective, type MapObjective } from "./map-navigation";
import { chooseComputerAction } from "./policy";
import { emptyComputerMemory, getComputerMemory, noteComputerAction, repeatsFailedFight } from "./memory";
import { needsPremiumSilverBreakthrough } from "./development";
import { premiumCombatMovementReserve } from "./combat-movement";
import { secondaryHeroOpportunity } from "./secondary-plan";
import type { ComputerObservation } from "./types";
import { driveComputerPlayers } from "../../server/computer-runner";
import { pickHumanAction } from "../../server/single-player-soak-helpers";

const difficulties = ["easy", "normal", "hard", "impossible"] as const;
const factions = ["necropolis", "castle", "conflux", "stronghold"] as const;
function fixture(difficulty: typeof difficulties[number], faction: typeof factions[number] = "castle") {
  const heroes: Record<string, string> = { castle: "catherine", necropolis: "vidomina", conflux: "ciele", stronghold: "crag_hack" };
  const state = createAdventureGameState({ seed: `far-sweep-${faction}`, difficulty, events: false, rollFirstPlayer: false,
    players: [{ id: "p1", name: "Control", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Computer", factionId: faction, heroDefId: heroes[faction] }] });
  const hero = Object.values(state.heroes).find(h => h.controllerId === "p2" && h.kind === "main")!;
  state.round = 4;
  state.activePlayerId = "p2";
  state.players.p2.factionId = faction;
  state.players.p2.army = coreFactionDefinitions[faction].units.filter(id => coreUnitDefinitions[id]?.tier === "bronze")
    .slice(0, 3).map((unitDefId, i) => ({ id: `core-${i}`, unitDefId, side: "pack" }));
  state.players.p2.needsHandRefresh = false;
  state.players.p2.canMulligan = false;
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.houseRules = { ...state.adventure!.houseRules, "free-neutral-combat-extend": false, "polish-quick-combat": false };
  hero.spaceId = "h:10:7"; hero.level = 2; hero.movementPoints = 3; hero.movementPointsMax = 3;
  const template = Object.values(state.adventure!.fields)[0];
  state.adventure!.fields = {};
  state.adventure!.tiles = {};
  state.adventure!.playerFarTiles.p2 = []; state.adventure!.farTilePool = [];
  for (const [id, col, group] of [["home", 9, "starting"], ["far1", 6, "far"], ["far2", 5, "far"]] as const) {
    state.adventure!.tiles[id] = { id, tileDefId: "test-corridor", centerRow: 10, centerCol: col, group, faceDown: false, rotation: 0 } as MapTileState;
  }
  for (let col = 4; col <= 10; col++) {
    const spaceId = `h:10:${col}`;
    state.adventure!.fields[spaceId] = { ...template, spaceId, tileInstanceId: col <= 5 ? "far2" : col <= 7 ? "far1" : "home",
      location: "empty_field", flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined };
  }
  const town = state.adventure!.fields["h:10:9"]; town.location = "town"; town.flagOwnerId = "p2";
  const ownedTown = Object.values(state.towns).find(t => t.controllerId === "p2")!; ownedTown.fieldId = town.spaceId;
  const rivalTown = Object.values(state.towns).find(t => t.controllerId === "p1")!;
  state.adventure!.fields[rivalTown.fieldId!] = { ...template, spaceId: rivalTown.fieldId!, location: "town", flagOwnerId: "p1", difficulty: undefined };
  const first = state.adventure!.fields["h:10:6"]; first.location = "settlement"; first.flagOwnerId = "p2"; first.everFlagged = true;
  const second = state.adventure!.fields["h:10:5"]; second.location = "mine"; second.resource = "buildingMaterials"; second.difficulty = 3;
  const loot = state.adventure!.fields["h:10:8"]; loot.location = "resource_symbol";
  state.computerMemory = { p2: emptyComputerMemory(4) };
  const observe = (actions?: GameAction[]): ComputerObservation => ({ playerId: "p2", state: getPlayerView(state, "p2"),
    memory: getComputerMemory(state, "p2"), legalActions: actions ? actions.map(action => ({ action, label: action.type })) : getLegalActions(state, "p2") });
  const move = (to: string): GameAction => ({ type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to });
  return { state, hero, first, second, loot, observe, move };
}

describe.each(difficulties)("Far opening on %s", difficulty => {
  it.each(factions)("%s takes the second Far material mine before a home pickup", faction => {
    const f = fixture(difficulty, faction);
    expect(canBeatGuardedField(f.state, f.hero, f.second)).toBe(true);
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(f.second.spaceId);
    const decision = chooseComputerAction(f.observe([f.move(f.first.spaceId), f.move(f.loot.spaceId), { type: "END_TURN", playerId: "p2" }]))!;
    expect(decision.action).toEqual(f.move(f.first.spaceId));
    // CONTROL: the opening exception must not open an ordinary Near mine.
    f.state.adventure!.tiles.far2.group = "near";
    expect(canBeatGuardedField(f.state, f.hero, f.second)).toBe(false);
    f.state.adventure!.tiles.far2.group = "far";
    // CONTROL: once Gold is owned the main hero resumes its existing policy.
    const gold = coreFactionDefinitions[faction].units.find(id => coreUnitDefinitions[id]?.tier === "gold")!;
    f.state.players.p2.army.push({ id: "scope-control", unitDefId: gold, side: "few" });
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(f.loot.spaceId);
    f.state.players.p2.army.pop();
    // CONTROL: both Far captures are finished; a real home leftover becomes useful.
    f.second.flagOwnerId = "p2"; f.second.everFlagged = true; f.second.difficulty = undefined;
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(f.loot.spaceId);
  });

  it("cycles a map-only card in a normal refresh and draws a real combat replacement", () => {
    const f = fixture(difficulty);
    f.hero.spaceId = f.first.spaceId;
    f.state.players.p2.canMulligan = true;
    f.state.players.p2.hand = ["spell.view_earth"];
    f.state.players.p2.deck = Array(12).fill("spell.magic_arrow");
    f.state.players.p2.discard = [];
    const decision = chooseComputerAction(f.observe())!;
    expect(decision.action.type).toBe("REFRESH_HAND");
    expect((decision.action as Extract<GameAction, { type: "REFRESH_HAND" }>).discardCardIds).toContain("spell.view_earth");
    const result = applyAction(f.state, decision.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2.hand).toContain("spell.magic_arrow");
    expect(result.state.players.p2.hand).not.toContain("spell.view_earth");
    // CONTROL: no premium fight on the route leaves the normal refresh unchanged.
    f.second.flagOwnerId = "p2"; f.second.difficulty = undefined;
    expect((chooseComputerAction(f.observe())!.action as Extract<GameAction, { type: "REFRESH_HAND" }>).discardCardIds).toEqual([]);
  });

  it("counts two distinct losses and seeks Silver funding instead of a third settlement attempt", () => {
    const f = fixture(difficulty);
    f.second.location = "settlement";
    const win = { winnerPlayerId: "neutrals" };
    for (const id of ["loss1", "loss1", "loss2"]) {
      f.state.combat = { id, context: { kind: "neutral", fieldId: f.second.spaceId, heroId: f.hero.id }, attackerPlayerId: "p2", outcome: win } as CombatState;
      Object.assign(f.state, noteComputerAction(f.state, "p2", { type: "DEFEND_UNIT", playerId: "p2", unitId: "core-0" }));
      if (id === "loss1") expect(getComputerMemory(f.state, "p2").settlementLossStreak).toBe(1);
    }
    f.state.combat = null;
    expect(repeatsFailedFight(f.state, "p2", f.second.spaceId)).toBe(true);
    expect(needsPremiumSilverBreakthrough(f.state, "p2")).toBe(true);
    f.loot.location = "windmill";
    f.state.players.p2.resources.valuables = 0;
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(f.loot.spaceId);
    // CONTROL: adding the actual Silver body reopens the settlement attempt.
    const silver = coreFactionDefinitions.castle.units.find(id => coreUnitDefinitions[id]?.tier === "silver")!;
    f.state.players.p2.army.push({ id: "breakthrough", unitDefId: silver, side: "few" });
    expect(repeatsFailedFight(f.state, "p2", f.second.spaceId)).toBe(false);
  });

  it("hires only after Gold for reachable leftovers, with the actual hire action", () => {
    const f = fixture(difficulty);
    f.second.difficulty = undefined;
    // The same two reachable jobs must exist BEFORE and AFTER Gold; otherwise
    // lack of work could hide a broken Gold-only hiring gate.
    f.state.adventure!.fields["h:10:10"].location = "resource_symbol";
    f.state.players.p2.resources = { gold: 100, buildingMaterials: 20, valuables: 20 };
    expect(secondaryHeroOpportunity(f.state, "p2").worthwhile).toBe(false);
    const gold = coreFactionDefinitions.castle.units.find(id => coreUnitDefinitions[id]?.tier === "gold")!;
    f.state.players.p2.army.push({ id: "gold", unitDefId: gold, side: "few" });
    expect(secondaryHeroOpportunity(f.state, "p2").worthwhile).toBe(true);
    const hires = getLegalActions(f.state, "p2").filter(a => a.action.type === "HIRE_SECONDARY_HERO");
    expect(hires.length).toBeGreaterThan(0);
    const decision = chooseComputerAction({ ...f.observe(), legalActions: [...hires, { label: "End", action: { type: "END_TURN", playerId: "p2" } }] })!;
    expect(decision.action.type).toBe("HIRE_SECONDARY_HERO");
    const result = applyAction(f.state, decision.action);
    expect(result.errors).toEqual([]);
    expect(Object.values(result.state.heroes).some(h => h.controllerId === "p2" && h.kind === "secondary")).toBe(true);
  });

  it("spends the Silver breakthrough fund on an actual recruit after two losses", () => {
    const f = fixture(difficulty);
    f.state.computerMemory!.p2.settlementLossStreak = 2;
    const town = Object.values(f.state.towns).find(t => t.controllerId === "p2")!;
    const building = coreFactionDefinitions.castle.buildings.find(id => {
      const effect = coreBuildingDefinitions[id]?.effect;
      return effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver";
    })!;
    town.buildings.push(building);
    const silver = coreFactionDefinitions.castle.units.find(id => coreUnitDefinitions[id]?.tier === "silver")!;
    f.state.players.p2.resources = { gold: 20, buildingMaterials: 3, valuables: 2 };
    const recruits = getLegalActions(f.state, "p2").filter(({ action }) => action.type === "POPULATION_ACTION" &&
      action.purchases.length === 1 && action.purchases[0].kind === "recruit" && action.purchases[0].unitDefId === silver);
    expect(recruits.length).toBeGreaterThan(0);
    const decision = chooseComputerAction({ ...f.observe(), legalActions: [...recruits, { label: "End", action: { type: "END_TURN", playerId: "p2" } }] })!;
    expect(decision.action.type).toBe("POPULATION_ACTION");
    const result = applyAction(f.state, decision.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2.army.some(unit => unit.unitDefId === silver && unit.side !== "bank")).toBe(true);
  });

  it("the Gold-era collector leaves the main target alone and actually collects a leftover", () => {
    const f = fixture(difficulty);
    const gold = coreFactionDefinitions.castle.units.find(id => coreUnitDefinitions[id]?.tier === "gold")!;
    f.state.players.p2.army.push({ id: "gold", unitDefId: gold, side: "few" });
    const scout = { ...f.hero, id: "collector", kind: "secondary" as const, spaceId: "h:10:9", movementPoints: 2, movementPointsMax: 2 };
    f.state.heroes[scout.id] = scout;
    const mainTarget = f.state.adventure!.fields["h:10:10"];
    mainTarget.location = "mine"; mainTarget.resource = "gold";
    f.state.computerMemory!.p2.stickyObjectiveSpaceId = mainTarget.spaceId;
    const objectives: MapObjective[] = [{ spaceId: mainTarget.spaceId, kind: "flaggable" }, { spaceId: f.loot.spaceId, kind: "visitable" }];
    expect(primaryMapObjective(f.state, scout, objectives, mainTarget.spaceId)?.spaceId).toBe(f.loot.spaceId);
    let result = applyAction(f.state, { type: "MOVE_HERO", playerId: "p2", heroId: scout.id, to: f.loot.spaceId });
    expect(result.errors).toEqual([]);
    for (let step = 0; step < 12 && (result.state.adventure?.pendingVisit || result.state.pendingChoice); step++) {
      const decision = chooseComputerAction({ playerId: "p2", state: getPlayerView(result.state, "p2"), legalActions: getLegalActions(result.state, "p2"), memory: getComputerMemory(result.state, "p2") });
      expect(decision).not.toBeNull();
      result = applyAction(result.state, decision!.action);
      expect(result.errors).toEqual([]);
    }
    expect(result.state.adventure!.fields[f.loot.spaceId].blackCube).toBe(true);
    expect(result.state.adventure!.fields[mainTarget.spaceId].flagOwnerId).not.toBe("p2");
  });
});

it("easier guards start this turn while Impossible saves the extra combat movement", () => {
  const starts = difficulties.map(difficulty => {
    const f = fixture(difficulty);
    f.hero.spaceId = f.first.spaceId; f.hero.movementPoints = 2;
    const decision = chooseComputerAction(f.observe([f.move(f.second.spaceId), { type: "END_TURN", playerId: "p2" }]))!;
    const startsNow = decision.action.type === "MOVE_HERO";
    expect(premiumCombatMovementReserve(f.state, f.hero, f.second)).toBe(difficulty === "impossible" ? 2 : 1);
    return startsNow;
  });
  expect(starts).toEqual([true, true, true, false]);
});

it.each(factions)("%s plays the same two-Far capture route through actual battles at every difficulty", faction => {
  const results: Array<{ difficulty: string; round: number; actions: number; captures: number }> = [];
  for (const difficulty of difficulties) {
    const f = fixture(difficulty, faction);
    let state = f.state;
    state.sessionMode = "single-player";
    state.controllers = { p1: { kind: "human" }, p2: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    state.computerGuaranteedWins = { p2: 2 };
    state.players.p2.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    f.first.flagOwnerId = null; f.first.everFlagged = false; f.first.difficulty = 3;
    f.hero.movementPoints = 2;
    const trail: string[] = [];
    let captures = 0;
    for (let step = 0; step < 800 && state.round <= 10 && !(state.phase === "game-over" && !state.combat); step++) {
      const run = driveComputerPlayers(state, undefined, { maxSteps: 1 });
      state = run.state;
      for (const decision of run.decisions) trail.push(`R${state.round} ${decision.action.type} ${decision.policy}`);
      captures = [f.first.spaceId, f.second.spaceId].filter(id => state.adventure!.fields[id].flagOwnerId === "p2").length;
      if (captures === 2) break;
      if (!run.decisions.length) {
        const action = pickHumanAction(state);
        expect(action, trail.slice(-20).join("\n")).not.toBeNull();
        const result = applyAction(state, action!);
        expect(result.errors).toEqual([]);
        state = result.state;
      }
    }
    results.push({ difficulty, round: state.round, actions: trail.length, captures });
    console.log(JSON.stringify({ faction, difficulty, round: state.round, captures, phase: state.phase, trail: trail.slice(-15) }));
    expect(captures, JSON.stringify(results)).toBe(2);
    expect(state.eventLog.some(event => event.type === "NEUTRAL_COMBAT_STARTED")).toBe(true);
    expect(state.eventLog.some(event => event.type === "COMPUTER_GUARANTEED_WIN")).toBe(false);
  }
  expect(results[0].round).toBeLessThanOrEqual(results[1].round);
  expect(results[1].round).toBeLessThanOrEqual(results[2].round);
  expect(results[2].round).toBeLessThanOrEqual(results[3].round);
  writeFileSync(`artifacts/far-sweep-capture-timing-${faction}.json`, JSON.stringify(results, null, 2));
}, 120000);

