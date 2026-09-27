import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit } from "../adventure";
import type { GameAction, GameState } from "../state";
import { nextGoldLadderStep } from "./development";
import { scoreMapAction } from "./map-policy";
import { getComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";

// USER RULING (2026-09-27): the Gold ladder is level-7 Few, level-6 Few,
// level-7 Pack, level-6 Pack — "level-7 Pack as soon as possible". A lower
// Gold Pack may still go first when it does not delay the level-7 Pack.

type Stock = { gold: number; buildingMaterials: number; valuables: number };

function castleWithBothGoldFew(resources: Stock, production: Stock = { gold: 5, buildingMaterials: 0, valuables: 1 }, securedFar = 0): GameState {
  const state = createAdventureGameState({ seed: "gold-ladder-pack", difficulty: "impossible", events: false, rollFirstPlayer: false });
  state.round = 11;
  state.activePlayerId = "p1";
  const player = state.players.p1;
  expect(player.factionId).toBe("castle");
  const town = Object.values(state.towns).find(candidate => candidate.controllerId === "p1")!;
  town.buildings.push("castle.dwelling_silver", "castle.dwelling_gold");
  player.army = [];
  for (const id of ["castle.halberdiers", "castle.marksmen", "castle.griffins", "castle.crusaders"]) addArmyUnit(player, id, "pack");
  addArmyUnit(player, "castle.archangels", "few");
  addArmyUnit(player, "castle.champions", "few");
  player.resources = { ...resources };
  player.production = { ...production };
  player.townTokens.population = true;
  // Mines flagged on distinct Far tiles: the "both Gold bodies stand, take an
  // affordable first Pack" branch needs two secured Far tiles. Only the home
  // tiles are placed at setup, so two of p2's plain fields are re-homed onto
  // synthetic Far tiles and flagged by p1 as mines.
  const rivalTown = Object.values(state.towns).find(candidate => candidate.controllerId === "p2")!;
  const rivalTile = state.adventure!.fields[rivalTown.fieldId!].tileInstanceId!;
  const spare = Object.values(state.adventure!.fields).filter(field =>
    field.tileInstanceId === rivalTile && field.spaceId !== rivalTown.fieldId).slice(0, securedFar);
  expect(spare).toHaveLength(securedFar);
  spare.forEach((field, index) => {
    const id = `far_fixture_${index}`;
    state.adventure!.tiles[id] = { ...state.adventure!.tiles[rivalTile], group: "far" };
    Object.assign(field, { tileInstanceId: id, location: "mine", flagOwnerId: "p1" });
  });
  return state;
}

function championsPack(state: GameState): GameAction {
  const unit = state.players.p1.army.find(candidate => candidate.unitDefId === "castle.champions")!;
  return { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "reinforce", unitDefId: "castle.champions", armyUnitId: unit.id }] };
}

function observe(state: GameState): ComputerObservation {
  return { playerId: "p1", state: state as unknown as ComputerObservation["state"], legalActions: [], memory: getComputerMemory(state, "p1") };
}

// 22 gold / 1 valuable on +5 gold / +1 valuable: the Archangels Pack (30 gold,
// 2 valuables) lands in two Resource Rounds; the Champions Pack (20 gold,
// 1 valuable) is payable now and would push it past four.
const TIGHT: Stock = { gold: 22, buildingMaterials: 0, valuables: 1 };

describe("Gold ladder: level-7 Pack before the level-6 Pack", () => {
  it("holds the Champions Pack while the Archangels Pack is two Resource Rounds out", () => {
    const state = castleWithBothGoldFew(TIGHT);
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.archangels", kind: "reinforce", rank: 0 });
    expect(scoreMapAction(observe(state), championsPack(state))!.score).toBeLessThanOrEqual(240);
  });

  it("with two Far tiles secured the affordable-first-Pack step is still the Archangels Pack", () => {
    const state = castleWithBothGoldFew(TIGHT, undefined, 2);
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.archangels", kind: "reinforce", rank: 0 });
    expect(scoreMapAction(observe(state), championsPack(state))!.score).toBeLessThanOrEqual(240);
  });

  it("CONTROL: the Champions Pack goes through when it cannot delay the Archangels Pack", () => {
    // 60 gold / 4 valuables: both Packs are paid this round either way.
    const state = castleWithBothGoldFew({ gold: 60, buildingMaterials: 0, valuables: 4 }, undefined, 2);
    expect(scoreMapAction(observe(state), championsPack(state))!.score).toBeGreaterThan(300);
  });

  it("clarified ruling: with only the level-7 Few, a level-6 Few that would delay the level-7 Pack waits", () => {
    const state = castleWithBothGoldFew(TIGHT);
    // Only the Archangels Few stands: the Champions Few is not bought yet.
    state.players.p1.army = state.players.p1.army.filter(unit => unit.unitDefId !== "castle.champions");
    const recruitChampions: GameAction = { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: "castle.champions" }] };
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.archangels", kind: "reinforce", rank: 0 });
    expect(scoreMapAction(observe(state), recruitChampions)!.score).toBeLessThanOrEqual(240);
    // CONTROL: a purse that pays both leaves the Champions Few free to go first.
    state.players.p1.resources = { gold: 60, buildingMaterials: 0, valuables: 4 };
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.champions", kind: "recruit" });
    expect(scoreMapAction(observe(state), recruitChampions)!.score).toBeGreaterThan(300);
  });

  it("CONTROL: with no valuables income the Archangels Pack is beyond reach — the Champions Pack is the breakthrough", () => {
    const state = castleWithBothGoldFew(TIGHT, { gold: 5, buildingMaterials: 0, valuables: 0 }, 2);
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.champions", kind: "reinforce", rank: 1 });
  });
});
