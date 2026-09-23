import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createAdventureGameState } from "../adventure-setup";
import { applyAction } from "../reducer";
import { getPlayerView } from "../player-view";
import { getLegalActions } from "../legal-actions";
import type { GameAction, GameState, MapTileState } from "../state";
import { canBeatGuardedField, primaryMapObjective, type MapObjective } from "./map-navigation";
import { chooseComputerAction } from "./policy";
import { emptyComputerMemory, getComputerMemory, repeatsFailedFight } from "./memory";
import type { ComputerObservation } from "./types";
import { driveComputerPlayers } from "../../server/computer-runner";
import { pickHumanAction } from "../../server/single-player-soak-helpers";
import { openingCorePackTarget, preferredOpeningPacks } from "./development";
import { upcomingFight } from "./card-planning";
import { updateDevelopmentPlan } from "./development-plan";
import { securedFarTileIds } from "./far-sweep";

const difficulties = ["easy", "normal", "hard", "impossible"] as const;
const factions = ["castle", "rampart", "inferno", "dungeon", "tower", "fortress", "stronghold", "conflux", "cove", "factory", "bulwark", "forge"] as const;
function fixture(difficulty: typeof difficulties[number], faction: typeof factions[number] = "castle") {
  const state = createAdventureGameState({ seed: `far-sweep-${faction}`, difficulty, events: false, rollFirstPlayer: false,
    players: [{ id: "p1", name: "Control", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Computer", factionId: faction, heroDefId: coreFactionDefinitions[faction].heroes[0] }] });
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

function prepareCore(f: ReturnType<typeof fixture>) {
  const preferred = preferredOpeningPacks(f.state, "p2");
  f.state.players.p2.army.forEach((unit, index) => {
    unit.side = preferred.length ? preferred.includes(unit.unitDefId) ? "pack" : "few"
      : index < openingCorePackTarget(f.state, "p2") ? "pack" : "few";
  });
}

describe("town strategy focused", () => {
  it("round four attacks the reachable Far guard before a delayed sticky capture", () => {
    const f = fixture("impossible", "rampart"); prepareCore(f);
    f.first.flagOwnerId = null; f.first.everFlagged = false; f.first.difficulty = 3;
    // A separate branch reaches the second guard without crossing the first.
    delete f.state.adventure!.fields[f.second.spaceId];
    f.second.spaceId = "h:9:5";
    f.state.adventure!.fields[f.second.spaceId] = f.second;
    f.state.adventure!.fields["h:9:6"] = { ...f.loot, spaceId:"h:9:6", location:"empty_field", tileInstanceId:"far1" };
    const candidates: MapObjective[] = [{spaceId:f.first.spaceId,kind:"guard"}, {spaceId:f.second.spaceId,kind:"guard"}];
    expect(primaryMapObjective(f.state,f.hero,candidates,f.second.spaceId)?.spaceId).toBe(f.first.spaceId);
    const pick = chooseComputerAction(f.observe([f.move(f.first.spaceId),{type:"END_TURN",playerId:"p2"}]))!;
    const result = applyAction(f.state,pick.action);
    expect(result.errors).toEqual([]);
    expect(result.state.combat?.context.kind).toBe("neutral");
    // CONTROL: with one extra MP, both guards fit and the sticky route stays.
    f.hero.movementPoints = 4;
    expect(primaryMapObjective(f.state,f.hero,candidates,f.second.spaceId)?.spaceId).toBe(f.second.spaceId);
  });
  it.each(difficulties)("%s keeps the first/second Far distinction for each town", difficulty => {
    for (const faction of factions) {
      const f = fixture(difficulty, faction); prepareCore(f);
      f.first.flagOwnerId = null; f.first.everFlagged = false; f.first.difficulty = 3;
      expect(canBeatGuardedField(f.state, f.hero, f.first), `${faction} first`).toBe(true);
      // CONTROL: one required Pack still missing cannot open a real Far III.
      const required = f.state.players.p2.army.find(unit => unit.side === "pack")!;
      required.side = "few";
      expect(canBeatGuardedField(f.state, f.hero, f.first), `${faction} incomplete core`).toBe(false);
      required.side = "pack";
      f.first.flagOwnerId = "p2"; f.first.difficulty = undefined;
      f.hero.spaceId = f.first.spaceId;
      expect(canBeatGuardedField(f.state, f.hero, f.second), `${faction} second`).toBe(false);
      const silver = coreFactionDefinitions[faction].units.find(id => coreUnitDefinitions[id]?.tier === "silver")!;
      f.state.players.p2.army.push({id:"silver",unitDefId:silver,side:"few"});
      const entry = f.move(f.second.spaceId);
      const pick = chooseComputerAction(f.observe([entry,{type:"END_TURN",playerId:"p2"}]))!;
      expect(pick.action, `${faction} prepared second`).toEqual(entry);
      const result = applyAction(f.state,pick.action);
      expect(result.errors).toEqual([]);
      expect(result.state.combat?.context.kind).toBe("neutral");
    }
  });
  it.each(factions)("%s first Far III opens with paid Bronze, second waits for Silver", faction => {
    const f = fixture("impossible", faction);
    prepareCore(f);
    f.first.flagOwnerId = null; f.first.everFlagged = false; f.first.difficulty = 3;
    expect(canBeatGuardedField(f.state, f.hero, f.first)).toBe(true);
    const move = f.move(f.first.spaceId);
    const decision = chooseComputerAction(f.observe([move, { type: "END_TURN", playerId: "p2" }]))!;
    expect(decision.action).toEqual(move);
    const result = applyAction(f.state, decision.action);
    expect(result.errors).toEqual([]);
    expect(result.state.combat?.context.kind).toBe("neutral");
    expect(result.state.round).toBe(4);
    // CONTROL: opening income on another tile has been captured.
    f.first.flagOwnerId = "p2"; f.first.difficulty = undefined;
    expect(canBeatGuardedField(f.state, f.hero, f.second)).toBe(false);
    const silver = coreFactionDefinitions[faction].units.find(id => coreUnitDefinitions[id]?.tier === "silver")!;
    f.state.players.p2.army.push({ id: "silver", unitDefId: silver, side: "few" });
    expect(canBeatGuardedField(f.state, f.hero, f.second)).toBe(true);
  });

  it.each(["rampart", "inferno", "dungeon"] as const)("%s purchases the requested two Packs", faction => {
    const f = fixture("hard", faction);
    const expected = { rampart: ["rampart.elves", "rampart.dwarves"], inferno: ["inferno.cerberi", "inferno.familiars"], dungeon: ["dungeon.harpies", "dungeon.evil_eyes"] }[faction];
    let state = f.state;
    state.players.p2.army.forEach(unit => unit.side = "few");
    state.players.p2.resources = { gold: 30, buildingMaterials: 0, valuables: 0 };
    state.players.p2.hand = [];
    for (const id of expected) {
      state.players.p2.townTokens.population = true;
      const legal = getLegalActions(state, "p2").filter(({ action }) => action.type === "POPULATION_ACTION" || action.type === "END_TURN");
      const pick = chooseComputerAction({ playerId: "p2", state: getPlayerView(state, "p2"), legalActions: legal, memory: getComputerMemory(state, "p2") })!;
      expect(pick.action.type).toBe("POPULATION_ACTION");
      const before = state.players.p2.resources.gold;
      const result = applyAction(state, pick.action);
      expect(result.errors).toEqual([]); state = result.state;
      expect(state.players.p2.army.find(unit => unit.unitDefId === id)?.side).toBe("pack");
      expect(state.players.p2.resources.gold).toBeLessThan(before);
    }
    expect(state.players.p2.army.filter(unit => unit.side === "pack").map(unit => unit.unitDefId).sort()).toEqual([...expected].sort());
  });

  it.each(factions)("%s buys a real Silver before second Far III without needing a loss", faction => {
    const f = fixture("hard", faction); prepareCore(f);
    const town = Object.values(f.state.towns).find(t => t.controllerId === "p2")!;
    const silverBuilding = coreFactionDefinitions[faction].buildings.find(id => {
      const effect = coreBuildingDefinitions[id]?.effect;
      return effect?.type === "UNLOCK_RECRUIT_TIER" && effect.tier === "silver";
    })!;
    town.buildings.push(silverBuilding);
    f.state.players.p2.resources = { gold: 20, buildingMaterials: 3, valuables: 2 };
    f.state.players.p2.hand = [];
    const actions = getLegalActions(f.state, "p2").filter(({ action }) => action.type === "END_TURN" ||
      (action.type === "POPULATION_ACTION" && action.purchases.length === 1 &&
        coreUnitDefinitions[action.purchases[0].unitDefId]?.tier === "silver"));
    const pick = chooseComputerAction({ ...f.observe(), legalActions: actions })!;
    expect(pick.action.type).toBe("POPULATION_ACTION");
    const result = applyAction(f.state, pick.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2.army.some(unit => coreUnitDefinitions[unit.unitDefId]?.tier === "silver")).toBe(true);
    expect(canBeatGuardedField(result.state, result.state.heroes[f.hero.id], result.state.adventure!.fields[f.second.spaceId])).toBe(true);
  });

  it("prepares the hand while the second Far guard still requires Silver", () => {
    const f = fixture("hard", "rampart"); prepareCore(f);
    f.hero.spaceId = f.first.spaceId;
    f.state.players.p2.canMulligan = true;
    f.state.players.p2.hand = ["ability.resistance"];
    f.state.players.p2.deck = Array(12).fill("spell.magic_arrow");
    f.state.players.p2.discard = [];
    expect(canBeatGuardedField(f.state, f.hero, f.second)).toBe(false);
    const pick = chooseComputerAction(f.observe())!;
    expect(pick.action.type).toBe("REFRESH_HAND");
    expect((pick.action as Extract<GameAction, {type:"REFRESH_HAND"}>).discardCardIds).toContain("ability.resistance");
    const result = applyAction(f.state, pick.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2.hand).toContain("spell.magic_arrow");
    expect(result.state.players.p2.hand).not.toContain("ability.resistance");
    f.second.difficulty = undefined;
    expect(upcomingFight(f.observe())).toBeNull();
  });

  it("after two Far tiles picks the missing Gold input before a sticky trinket", () => {
    const f = fixture("hard", "rampart"); prepareCore(f);
    f.second.flagOwnerId = "p2"; f.second.difficulty = undefined;
    f.state.players.p2.army.push({ id: "silver", unitDefId: coreFactionDefinitions.rampart.units.find(id => coreUnitDefinitions[id]?.tier === "silver")!, side: "few" });
    const town = Object.values(f.state.towns).find(t => t.controllerId === "p2")!;
    town.buildings.push("rampart.dwelling_silver");
    f.state.players.p2.resources = { gold: 30, buildingMaterials: 0, valuables: 0 };
    const source = f.loot;
    source.location = "mine"; source.resource = "valuables"; source.flagOwnerId = null;
    const trinket = f.state.adventure!.fields["h:10:4"];
    trinket.location = "resource_symbol";
    const candidates: MapObjective[] = [{spaceId: source.spaceId, kind: "flaggable"}, {spaceId: trinket.spaceId, kind: "visitable"}];
    expect(updateDevelopmentPlan(f.state, "p2").goal).toBe("gold");
    expect(primaryMapObjective(f.state, f.hero, candidates, trinket.spaceId)?.spaceId).toBe(source.spaceId);
  });

  it("protects the next Gold Pack from optional building and Silver spending", () => {
    const f = fixture("hard", "inferno");
    f.second.flagOwnerId = "p2"; f.second.difficulty = undefined;
    const town = Object.values(f.state.towns).find(t => t.controllerId === "p2")!;
    town.buildings.push("inferno.dwelling_silver", "inferno.dwelling_gold");
    for (const id of ["inferno.arch_devils", "inferno.efreet", "inferno.demons"]) {
      f.state.players.p2.army.push({ id, unitDefId:id, side:"few" });
    }
    // Enough to buy optional extras but not the Gold upgrade yet.
    f.state.players.p2.resources = {gold:20,buildingMaterials:10,valuables:2};
    f.state.players.p2.hand = [];
    const choices = getLegalActions(f.state,"p2").filter(({action}) => action.type === "END_TURN" ||
      (action.type === "BUILD_STRUCTURE" && action.buildingId === "inferno.castle_gate") ||
      (action.type === "POPULATION_ACTION" && action.purchases.length===1 &&
        action.purchases[0].kind === "reinforce" && action.purchases[0].unitDefId === "inferno.demons"));
    expect(choices.some(({action})=>action.type === "BUILD_STRUCTURE")).toBe(true);
    expect(choices.some(({action})=>action.type === "POPULATION_ACTION")).toBe(true);
    expect(chooseComputerAction({...f.observe(),legalActions:choices})!.action.type).toBe("END_TURN");
    // CONTROL: the funded Gold step must spend, not hoard its own reserve.
    f.state.players.p2.resources.gold = 35;
    const funded = getLegalActions(f.state,"p2").filter(({action}) => action.type === "END_TURN" || action.type === "POPULATION_ACTION");
    const pick = chooseComputerAction({...f.observe(),legalActions:funded})!;
    const result = applyAction(f.state,pick.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2.army.find(unit=>unit.unitDefId === "inferno.arch_devils")?.side).toBe("pack");
  });

  it("buys an affordable first Gold Pack when the preferred upgrade lacks valuables", () => {
    const f = fixture("hard", "conflux");
    f.second.flagOwnerId = "p2"; f.second.difficulty = undefined;
    const town = Object.values(f.state.towns).find(t => t.controllerId === "p2")!;
    town.buildings.push("conflux.dwelling_silver", "conflux.dwelling_gold");
    for (const id of ["conflux.phoenixes", "conflux.magic_elementals"]) {
      f.state.players.p2.army.push({id, unitDefId: id, side: "few"});
    }
    f.state.players.p2.hand = [];
    const buy = (gold: number, valuables: number) => {
      f.state.players.p2.resources = {gold, buildingMaterials: 18, valuables};
      const legal = getLegalActions(f.state, "p2").filter(({action}) =>
        action.type === "POPULATION_ACTION" || action.type === "END_TURN");
      const result = applyAction(f.state, chooseComputerAction({...f.observe(), legalActions: legal})!.action);
      expect(result.errors).toEqual([]);
      return result.state.players.p2;
    };
    const affordable = buy(23, 1);
    expect(affordable.army.find(u => u.unitDefId === "conflux.magic_elementals")?.side).toBe("pack");
    expect(affordable.resources).toEqual({gold: 4, buildingMaterials: 18, valuables: 0});
    // CONTROL: with both upgrades funded, retain the preferred Phoenix Pack.
    const preferred = buy(40, 3);
    expect(preferred.army.find(u => u.unitDefId === "conflux.phoenixes")?.side).toBe("pack");
  });

  it("finishes the first Gold Pack before an optional deep guard", () => {
    const f = fixture("hard","factory");
    f.second.flagOwnerId = "p2"; f.second.difficulty = undefined;
    const town = Object.values(f.state.towns).find(t=>t.controllerId==="p2")!;
    town.buildings.push("factory.dwelling_silver","factory.dwelling_gold");
    const gold = ["factory.dreadnoughts", "factory.gunslingers"];
    gold.forEach(id=>f.state.players.p2.army.push({id,unitDefId:id,side:"few"}));
    f.loot.location = "mine"; f.loot.resource="gold"; f.loot.difficulty=5;
    expect(canBeatGuardedField(f.state,f.hero,f.loot)).toBe(false);
    const before = chooseComputerAction(f.observe([f.move(f.loot.spaceId),{type:"END_TURN",playerId:"p2"}]))!;
    expect(before.action.type).toBe("END_TURN");
    // CONTROL: the upgraded Gold army can now take this same real fight.
    f.state.players.p2.army.find(unit=>unit.unitDefId===gold[0])!.side="pack";
    expect(canBeatGuardedField(f.state,f.hero,f.loot)).toBe(true);
    const after = chooseComputerAction(f.observe([f.move(f.loot.spaceId),{type:"END_TURN",playerId:"p2"}]))!;
    expect(after.action.type).toBe("MOVE_HERO");
    const result = applyAction(f.state,after.action);
    expect(result.errors).toEqual([]);
    expect(result.state.combat?.context.kind).toBe("neutral");
  });

  it.each(["factory.dreadnoughts","factory.couatls"])("upgrades %s without saving for its mutually exclusive alternative", top => {
    const f=fixture("hard","factory");
    f.second.flagOwnerId="p2"; f.second.difficulty=undefined;
    const town=Object.values(f.state.towns).find(t=>t.controllerId==="p2")!;
    town.buildings.push("factory.dwelling_silver","factory.dwelling_gold");
    for (const id of [top,"factory.gunslingers"]) f.state.players.p2.army.push({id,unitDefId:id,side:"few"});
    f.state.players.p2.resources={gold:60,buildingMaterials:10,valuables:8};
    f.state.players.p2.hand=[];
    const legal=getLegalActions(f.state,"p2").filter(({action})=>action.type==="POPULATION_ACTION" || action.type==="END_TURN");
    const pick=chooseComputerAction({...f.observe(),legalActions:legal})!;
    const result=applyAction(f.state,pick.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2.army.find(unit=>unit.unitDefId===top)?.side).toBe("pack");
  });
});

function drive(initial: GameState, label: string, stop: (state: GameState) => boolean, maxRound = 14) {
  let state = initial;
  const trail: Array<{round: number; action: GameAction; policy: string; resources: typeof state.players.p2.resources}> = [];
  const entries: Array<{round: number; difficulty?: number; fieldId: string; army: typeof state.players.p2.army; hand: string[]}> = [];
  const seen = new Set<string>();
  for (let step = 0; step < 2600 && state.round <= maxRound && !stop(state); step++) {
    if (state.phase === "game-over" && !state.combat) break;
    const before = state;
    const run = driveComputerPlayers(state, undefined, { maxSteps: 1 });
    state = run.state;
    // Preserve the existing single-player rule for the first two I/II
    // guards. The Far III battles under test must never receive that shortcut.
    expect(state.eventLog.some(event => event.type === "COMPUTER_GUARANTEED_WIN" && Number(event.difficulty) >= 3)).toBe(false);
    for (const decision of run.decisions) {
      trail.push({round: before.round, action: decision.action, policy: decision.policy, resources: {...before.players.p2.resources}});
    }
    if (state.combat && !seen.has(state.combat.id) && state.combat.context.kind === "neutral") {
      seen.add(state.combat.id);
      entries.push({round: state.round, difficulty: state.combat.context.difficulty, fieldId: state.combat.context.fieldId, army: structuredClone(state.players.p2.army), hand: [...state.players.p2.hand]});
    }
    if (!run.decisions.length) {
      const action = pickHumanAction(state);
      expect(action, JSON.stringify(trail.slice(-8))).not.toBeNull();
      const result = applyAction(state, action!);
      expect(result.errors).toEqual([]); state = result.state;
    }
  }
  const suffix = process.env.TOWN_STRATEGY_MUTATION ? `-${process.env.TOWN_STRATEGY_MUTATION}` : "";
  writeFileSync(`artifacts/town-${label}${suffix}.json`, JSON.stringify({round: state.round, trail, entries, army: state.players.p2.army, resources: state.players.p2.resources}, null, 2));
  writeFileSync(`artifacts/town-${label}${suffix}-state.json`, JSON.stringify(state));
  return { state, trail, entries };
}

describe("town strategy combat", () => {
  it.each(["rampart", "inferno", "dungeon"] as const)("%s retreats from armored elemental guards and preserves units", faction => {
    const f = fixture("hard", faction); prepareCore(f);
    f.state.controllers = {p1: {kind:"human"}, p2: {kind:"computer", difficulty:"standard", policyVersion:1}};
    f.state.sessionMode = "single-player";
    f.state.players.p2.hand = [];
    f.state.players.p2.resources = {gold:0, buildingMaterials:0, valuables:0};
    f.state.computerGuaranteedWins = {p2: 2};
    f.first.flagOwnerId = null; f.first.everFlagged = false; f.first.difficulty = 3;
    f.first.customGuardUnits = ["neutral.earth_elementals", "neutral.magma_elementals", "neutral.storm_elementals"];
    const entered = applyAction(f.state, f.move(f.first.spaceId));
    expect(entered.errors).toEqual([]);
    const result = drive(entered.state, `retreat-${faction}`, state => !state.combat && state.phase !== "combat-setup", 4);
    expect(result.trail.some(entry => entry.action.type === "RETREAT_FROM_COMBAT")).toBe(true);
    expect(result.state.players.p2.army.length).toBeGreaterThanOrEqual(2);
    expect(repeatsFailedFight(result.state, "p2", f.first.spaceId)).toBe(true);
    // CONTROL: harmless guards should be fought out, not abandoned.
    const weak = fixture("hard", faction); prepareCore(weak);
    weak.state.controllers = f.state.controllers;
    weak.state.sessionMode = "single-player";
    weak.first.flagOwnerId = null; weak.first.everFlagged = false; weak.first.difficulty = 3;
    weak.first.customGuardUnits = ["neutral.sprites", "neutral.sprites"];
    const weakEntered = applyAction(weak.state, weak.move(weak.first.spaceId));
    expect(weakEntered.errors).toEqual([]);
    const control = drive(weakEntered.state, `weak-${faction}`, state => !state.combat && state.phase !== "combat-setup" &&
      !state.adventure?.pendingVisit && !state.pendingChoice, 4);
    expect(control.trail.some(entry => entry.action.type === "RETREAT_FROM_COMBAT")).toBe(false);
    expect(control.state.adventure!.fields[weak.first.spaceId].flagOwnerId).toBe("p2");
  });
});

describe("town strategy actual games", () => {
  it.each(factions)("%s reaches Far III by round four, brings Silver next, and upgrades Gold", faction => {
    const state = createAdventureGameState({seed: `town-strategy-${faction}`, difficulty:"hard", events:false, rollFirstPlayer:false,
      sessionMode:"single-player", controllers:{p1:{kind:"human"},p2:{kind:"computer",difficulty:"standard",policyVersion:1}},
      players:[{id:"p1",name:"Control",factionId:"castle",heroDefId:"catherine"},
        {id:"p2",name:faction,factionId:faction,heroDefId:coreFactionDefinitions[faction].heroes[0]}]});
    const result = drive(state, `game-${faction}`, state => state.players.p2.army.some(unit =>
      coreUnitDefinitions[unit.unitDefId]?.tier === "gold" && unit.side === "pack"), 16);
    const farIII = result.entries.filter(entry => {
      const field = result.state.adventure!.fields[entry.fieldId];
      const tile = field?.tileInstanceId && result.state.adventure!.tiles[field.tileInstanceId];
      return tile && tile.group === "far" && entry.difficulty === 3;
    });
    expect(farIII[0]?.round).toBeLessThanOrEqual(4);
    // No real Magic Arrow required in hand: the AI is granted a phantom
    // Power + Magic Arrow in every fight (established ruling), so holding the
    // paper copy is not part of a competent Far III entry.
    const firstTile = result.state.adventure!.fields[farIII[0].fieldId].tileInstanceId;
    const second = farIII.find(entry => result.state.adventure!.fields[entry.fieldId].tileInstanceId !== firstTile);
    expect(second, "must fight on a second Far tile").toBeDefined();
    expect(second!.army.some(unit => ["silver","gold","azure"].includes(coreUnitDefinitions[unit.unitDefId]?.tier))).toBe(true);
    expect(securedFarTileIds(result.state,"p2").size).toBeGreaterThanOrEqual(2);
    expect(result.state.players.p2.army.some(unit => coreUnitDefinitions[unit.unitDefId]?.tier === "gold" && unit.side === "pack")).toBe(true);
    expect(result.state.eventLog.some(event => event.type === "COMPUTER_GUARANTEED_WIN" && Number(event.difficulty) >= 3)).toBe(false);
  });
});
