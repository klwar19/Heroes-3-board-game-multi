import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit, getAdjacentSpaceIds } from "../adventure";
import type { GameAction, GameState, HeroState, MapFieldState } from "../state";
import { nextGoldLadderStep } from "./development";
import { canBeatGuardedField } from "./map-navigation";
import { scoreMapAction } from "./map-policy";
import { getComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";

// USER RULING (2026-09-28): "Should a lv6 Few go first when the next fight
// needs it? — yeah". After the level-7 Few, a level-6 Few that would land the
// level-7 Pack a Resource Round later still goes first when the army's next
// fight is refused by the current army and taken with that Few.

type Fixture = { state: GameState; hero: HeroState; guard: MapFieldState };

function fixture(guardDifficulty: number): Fixture {
  const state = createAdventureGameState({ seed: "gold-ladder-pack", difficulty: "impossible", events: false, rollFirstPlayer: false });
  state.round = 11;
  state.activePlayerId = "p1";
  const player = state.players.p1;
  expect(player.factionId).toBe("castle");
  const town = Object.values(state.towns).find(candidate => candidate.controllerId === "p1")!;
  town.buildings.push("castle.dwelling_silver", "castle.dwelling_gold");
  player.army = [];
  for (const id of ["castle.halberdiers", "castle.marksmen", "castle.griffins", "castle.crusaders"]) addArmyUnit(player, id, "pack");
  // Only the level-7 Few stands: one Gold body is not yet a Gold-tier army.
  addArmyUnit(player, "castle.archangels", "few");
  // 22 gold / 1 valuable on +5 / +1: the Archangels Pack (30 gold, 2 valuables)
  // lands in two Resource Rounds; the 12-gold Champions Few (payable now)
  // pushes it to four.
  player.resources = { gold: 22, buildingMaterials: 0, valuables: 1 };
  player.production = { gold: 5, buildingMaterials: 0, valuables: 1 };
  player.townTokens.population = true;
  // Far economy opened (one flagged Far gold mine), so ordinary guards are
  // not held back for the opening rush.
  const rivalTown = Object.values(state.towns).find(candidate => candidate.controllerId === "p2")!;
  const rivalTile = state.adventure!.fields[rivalTown.fieldId!].tileInstanceId!;
  const spare = Object.values(state.adventure!.fields).find(field =>
    field.tileInstanceId === rivalTile && field.spaceId !== rivalTown.fieldId)!;
  state.adventure!.tiles.far_fixture = { ...state.adventure!.tiles[rivalTile], group: "far" };
  Object.assign(spare, { tileInstanceId: "far_fixture", location: "mine", resource: "gold", flagOwnerId: "p1", difficulty: undefined });
  const hero = Object.values(state.heroes).find(candidate => candidate.controllerId === "p1" && candidate.kind === "main")!;
  const adjacent = getAdjacentSpaceIds(hero.spaceId!).map(id => state.adventure!.fields[id]).filter(Boolean);
  // The home tile's opening mine is already ours and its free resource symbol
  // collected: the guarded treasure next to the hero is the next fight.
  for (const field of adjacent) {
    if (field.location === "mine") Object.assign(field, { flagOwnerId: "p1", everFlagged: true });
    if (field.location === "resource_symbol") field.location = "empty_field";
  }
  const guard = adjacent.find(field => field.location === "treasure_symbol")!;
  expect(guard).toBeDefined();
  guard.difficulty = guardDifficulty;
  return { state, hero, guard };
}

function recruitChampions(): GameAction {
  return { type: "POPULATION_ACTION", playerId: "p1", purchases: [{ kind: "recruit", unitDefId: "castle.champions" }] };
}

function observe(state: GameState): ComputerObservation {
  return { playerId: "p1", state: state as unknown as ComputerObservation["state"], legalActions: [], memory: getComputerMemory(state, "p1") };
}

describe("Gold ladder: the level-6 Few goes first when the next fight needs it", () => {
  it("buys the Champions Few for an adjacent level-IV guard only the two-Gold army takes", () => {
    const { state, hero, guard } = fixture(4);
    // The delay rule alone still says: save for the Archangels Pack.
    expect(nextGoldLadderStep(state, "p1", false)).toMatchObject({ unitDefId: "castle.archangels", kind: "reinforce", rank: 0 });
    // The current army refuses the guard; with the Champions Few it is taken.
    expect(canBeatGuardedField(state, hero, guard)).toBe(false);
    const withFew: GameState = { ...state, players: { ...state.players, p1: { ...state.players.p1,
      army: [...state.players.p1.army, { id: "probe", unitDefId: "castle.champions", side: "few" }] } } };
    expect(canBeatGuardedField(withFew, hero, guard)).toBe(true);
    // Every gate agrees: the ladder step and the Population purchase score.
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.champions", kind: "recruit", rank: 1 });
    expect(scoreMapAction(observe(state), recruitChampions())!.score).toBeGreaterThan(900);
  });

  it("CONTROL: a guard the current army already takes does not buy the Few early", () => {
    const { state, hero, guard } = fixture(3);
    expect(canBeatGuardedField(state, hero, guard)).toBe(true);
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.archangels", kind: "reinforce", rank: 0 });
    expect(scoreMapAction(observe(state), recruitChampions())!.score).toBeLessThanOrEqual(240);
  });

  it("CONTROL: a Few that is not payable now leaves the level-7 Pack as the step", () => {
    const { state } = fixture(4);
    state.players.p1.resources = { gold: 11, buildingMaterials: 0, valuables: 1 };
    expect(nextGoldLadderStep(state, "p1")).toMatchObject({ unitDefId: "castle.archangels", kind: "reinforce", rank: 0 });
  });
});
