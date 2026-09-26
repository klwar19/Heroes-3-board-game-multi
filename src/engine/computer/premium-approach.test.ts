import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { getAdjacentSpaceIds, isFieldGuarded, materializeTileFields } from "../adventure";
import { allTileDefinitions } from "@/data/map/tiles";
import { canBeatGuardedField, distanceFromHeroTo } from "./map-navigation";
import { emptyComputerMemory, getComputerMemory, noteComputerAction } from "./memory";
import { premiumCombatMovementReserve, scorePremiumApproach } from "./premium-approach";
import { premiumRotationRouteScore, scoreMapAction } from "./map-policy";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";
import type { GameAction, MapTileState } from "../state";

function fixture() {
  const state = createAdventureGameState({ seed: "premium-budget", difficulty: "normal", events: false, rollFirstPlayer: false });
  const hero = Object.values(state.heroes).find(h => h.controllerId === "p2" && h.kind === "main")!;
  state.round = 4;
  state.adventure!.houseRules = { ...state.adventure!.houseRules,
    "free-neutral-combat-extend": false, "polish-quick-combat": false };
  hero.spaceId = "h:10:7";
  hero.level = 3;
  hero.movementPoints = 1;
  hero.movementPointsMax = 3;
  for (const unit of state.players.p2.army) unit.side = "pack";
  state.adventure!.tiles = {};
  state.adventure!.playerFarTiles.p2 = [];
  state.adventure!.farTilePool = [];
  const template = Object.values(state.adventure!.fields)[0];
  state.adventure!.fields = {};
  for (const id of ["h:10:6", "h:10:7", "h:10:8"]) {
    state.adventure!.fields[id] = { ...template, spaceId: id, tileInstanceId: "route", location: "empty_field",
      flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined };
  }
  const target = state.adventure!.fields["h:10:6"];
  target.location = "settlement";
  target.difficulty = 3;
  const pickup = state.adventure!.fields["h:10:8"];
  pickup.location = "resource_symbol";
  const move = (to: string): Extract<GameAction, {type: "MOVE_HERO"}> => ({type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to});
  const observation = (): ComputerObservation => ({ playerId: "p2", state: state as unknown as ComputerObservation["state"], legalActions: [], memory: getComputerMemory(state, "p2") });
  expect(isFieldGuarded(target)).toBe(true);
  expect(canBeatGuardedField(state, hero, target)).toBe(true);
  return { state, hero, target, pickup, move, observation };
}

describe("premium capture movement budget", () => {
  it("collects a nearby reward on the last MP only when it keeps the guard in reach", () => {
    const {state, hero, target, pickup, move, observation} = fixture();
    expect(premiumCombatMovementReserve(state, hero, target)).toBe(1);
    expect(scoreMapAction(observation(), move(target.spaceId))!.score).toBeLessThan(300);
    // The reward BEHIND the hero (h:10:8) lengthens the route to the guard
    // (return walk 2 > the current 1): never walk away from the guard for it.
    expect(scoreMapAction(observation(), move(pickup.spaceId))!.policy).not.toBe("map.premium-pickup-before-next-turn");
    // A reward beside BOTH the hero and the guard keeps the route intact — take it.
    const beside = getAdjacentSpaceIds(hero.spaceId!).find(id =>
      id !== target.spaceId && getAdjacentSpaceIds(target.spaceId).includes(id))!;
    state.adventure!.fields[beside] = { ...pickup, spaceId: beside };
    expect(scoreMapAction(observation(), move(beside))!.policy).toBe("map.premium-pickup-before-next-turn");
    const probe = { ...hero, spaceId: beside };
    expect(distanceFromHeroTo(state, probe, target.spaceId)! + 1).toBeLessThanOrEqual(hero.movementPointsMax);
  });

  it("captures immediately with entry plus continuation available, before taking side loot", () => {
    const {hero, target, pickup, move, observation} = fixture();
    hero.movementPoints = 2;
    expect(scoreMapAction(observation(), move(target.spaceId))!.policy).toBe("map.premium-capture-now");
    expect(scoreMapAction(observation(), move(target.spaceId))!.score)
      .toBeGreaterThan(scoreMapAction(observation(), move(pickup.spaceId))!.score);
  });

  it("does not reserve movement for automatic wins or free continuations", () => {
    const {state, hero, target, move, observation} = fixture();
    hero.level = 4;
    expect(premiumCombatMovementReserve(state, hero, target)).toBe(0);
    expect(scoreMapAction(observation(), move(target.spaceId))!.policy).toBe("map.premium-capture-now");
    hero.level = 3;
    state.adventure!.houseRules!["free-neutral-combat-extend"] = true;
    expect(premiumCombatMovementReserve(state, hero, target)).toBe(0);
  });

  it("allows a purposeful return next round but still blocks a same-round circuit", () => {
    const {state, hero, target, pickup, move, observation} = fixture();
    // The old fixture left a beatable settlement ahead: returning toward it
    // was productive and failed even on the unchanged baseline. Empty the
    // circuit by removing the payoff location, then re-arm it as CONTROL.
    // Location/difficulty are deliberately NOT part of the route-progress key
    // (flags are), so both halves compare the SAME progress hash and the pass
    // genuinely exercises the returns-toward-payoff exemption, not a key change.
    target.location = "empty_field";
    target.difficulty = undefined;
    hero.spaceId = pickup.spaceId;
    pickup.blackCube = true;
    Object.assign(state, noteComputerAction(state, "p2", move("h:10:7")));
    hero.movementPoints = 3;
    const choose = () => chooseComputerAction({ ...observation(), legalActions: [
      { action: move("h:10:7"), label: "Return" },
      { action: { type: "END_TURN", playerId: "p2" }, label: "End" },
    ] } as ComputerObservation);
    expect(choose()?.action.type).toBe("END_TURN");
    state.round += 1;
    target.location = "settlement";
    target.difficulty = 3;
    expect(choose()?.action.type).toBe("MOVE_HERO");
  });

  it("spends waiting movement on a safe level-2 side fight that keeps next turn's attack", () => {
    const setup = (dangerousSide: boolean) => {
      const f = fixture();
      const { state, hero } = f;
      // Continuations are free here, so the premium guard needs no reserve: two
      // steps with one point left is a next-turn capture, not a capture now.
      state.adventure!.houseRules = { ...state.adventure!.houseRules, "free-neutral-combat-extend": true };
      hero.spaceId = "h:10:8";
      hero.movementPoints = 1;
      hero.level = 2;
      state.adventure!.fields["h:10:7"].location = "empty_field";
      const sideId = getAdjacentSpaceIds("h:10:8").find(id =>
        id !== "h:10:7" && getAdjacentSpaceIds("h:10:7").includes(id))!;
      state.adventure!.fields[sideId] = { ...state.adventure!.fields["h:10:7"], spaceId: sideId,
        location: "treasure_symbol", difficulty: 2,
        ...(dangerousSide ? { customGuardUnits: ["castle.archangels", "castle.archangels", "castle.archangels", "castle.archangels"] } : {}) };
      state.players.p2.army = state.players.p2.army.map(unit => ({ ...unit, unitDefId: "castle.archangels", side: "pack" }));
      return { ...f, sideId };
    };
    const strong = setup(false);
    expect(canBeatGuardedField(strong.state, strong.hero, strong.target)).toBe(true);
    const side = scoreMapAction(strong.observation(), strong.move(strong.sideId))!;
    expect(side.policy).toBe("map.premium-side-fight-before-next-turn");
    // CONTROL: the same army and premium commitment, but a side guard the
    // forecast cannot clear in the one affordable round — keep the route.
    const risky = setup(true);
    expect(canBeatGuardedField(risky.state, risky.hero, risky.target)).toBe(true);
    expect(scoreMapAction(risky.observation(), risky.move(risky.sideId))!.policy)
      .not.toBe("map.premium-side-fight-before-next-turn");
  });

  it("reads the level shortcut as 'no battle' only where Quick Combat really applies", () => {
    const setup = (customGuard: boolean) => {
      const f = fixture();
      const { state, hero } = f;
      state.adventure!.houseRules = { ...state.adventure!.houseRules, "free-neutral-combat-extend": true };
      hero.spaceId = "h:10:8";
      hero.movementPoints = 1;
      hero.level = 3; // strictly above the side guard's difficulty 2
      state.adventure!.fields["h:10:7"].location = "empty_field";
      const sideId = getAdjacentSpaceIds("h:10:8").find(id =>
        id !== "h:10:7" && getAdjacentSpaceIds("h:10:7").includes(id))!;
      state.adventure!.fields[sideId] = { ...state.adventure!.fields["h:10:7"], spaceId: sideId,
        location: "treasure_symbol", difficulty: 2,
        ...(customGuard ? { customGuardUnits: Array.from({ length: 4 }, () => "pack:castle.archangels") } : {}) };
      state.players.p2.army = state.players.p2.army.map(unit => ({ ...unit, unitDefId: "castle.archangels", side: "pack" }));
      return { ...f, sideId };
    };
    // CONTROL: a printed level-2 guard under a level-3 hero is a Quick Combat.
    const quick = setup(false);
    expect(scoreMapAction(quick.observation(), quick.move(quick.sideId))!.policy)
      .toBe("map.premium-side-fight-before-next-turn");
    // A designer's exact army is never Quick-Combat skipped: the same level lead
    // is a real battle against four Archangel Packs, which the forecast refuses
    // even though the generic beatability read still passes it.
    const exact = setup(true);
    expect(canBeatGuardedField(exact.state, exact.hero, exact.state.adventure!.fields[exact.sideId])).toBe(true);
    expect(scoreMapAction(exact.observation(), exact.move(exact.sideId))!.policy)
      .not.toBe("map.premium-side-fight-before-next-turn");
  });

  it("never walks onto an enemy hero on the way to a two-step side fight", () => {
    // Hero on h:10:9 (3 steps from the settlement, 2 MP now, 3 next turn, free
    // continuations): the level-2 side guard on h:9:7 is two steps away, via
    // the route field h:10:8 or via h:9:8. map-policy returns the side-fight
    // step score without its ordinary safety read, so the step itself must
    // refuse a field an enemy hero (here a far stronger one) stands on.
    const setup = (enemyOnStep: boolean) => {
      const f = fixture();
      const { state, hero } = f;
      state.adventure!.houseRules = { ...state.adventure!.houseRules, "free-neutral-combat-extend": true };
      for (const id of ["h:10:9", "h:9:8"]) {
        state.adventure!.fields[id] = { ...state.adventure!.fields["h:10:7"], spaceId: id, location: "empty_field" };
      }
      state.adventure!.fields["h:10:8"].location = "empty_field";
      state.adventure!.fields["h:9:7"] = { ...state.adventure!.fields["h:10:7"], spaceId: "h:9:7",
        location: "treasure_symbol", difficulty: 2 };
      hero.spaceId = "h:10:9";
      hero.movementPoints = 2;
      hero.level = 2;
      state.players.p2.army = state.players.p2.army.map(unit => ({ ...unit, unitDefId: "castle.archangels", side: "pack" }));
      if (enemyOnStep) {
        const enemy = Object.values(state.heroes).find(h => h.controllerId !== "p2")!;
        enemy.spaceId = "h:9:8";
        state.players[enemy.controllerId].army = state.players[enemy.controllerId].army.map(unit =>
          ({ ...unit, unitDefId: "neutral.azure_dragons", side: "neutral" }));
      }
      return f;
    };
    const open = setup(false);
    expect(distanceFromHeroTo(open.state, open.hero, "h:9:7")).toBe(2);
    // CONTROL: with both steps free, each leads to the side fight.
    expect(scoreMapAction(open.observation(), open.move("h:9:8"))!.policy)
      .toBe("map.premium-side-fight-before-next-turn");
    const blocked = setup(true);
    expect(scoreMapAction(blocked.observation(), blocked.move("h:9:8"))!.policy)
      .not.toBe("map.premium-side-fight-before-next-turn");
    // The free route step is unaffected.
    expect(scoreMapAction(blocked.observation(), blocked.move("h:10:8"))!.policy)
      .toBe("map.premium-side-fight-before-next-turn");
  });

  it("does not commit an unbeatable army to the premium fight", () => {
    const {state, hero, target, move} = fixture();
    state.players.p2.army = [];
    hero.level = 1;
    expect(scorePremiumApproach(state, move(target.spaceId), emptyComputerMemory())).toBeNull();
  });

  it("rotates toward a short capture route with a combat point left, without mutating the board", () => {
    const { state, hero } = fixture();
    hero.spaceId = "h:10:8";
    hero.movementPoints = 3;
    state.adventure!.fields[hero.spaceId].location = "empty_field";
    const defId = "TEST_PREMIUM_BUDGET_ROTATION";
    allTileDefinitions[defId] = {
      id: defId, group: "far", content: "core_game", terrain: "grass",
      fields: Array.from({length: 7}, (_, slot) => slot === 1
        ? { location: "mine", resource: "gold", difficulty: 3 }
        : { location: "empty_field" }),
      outerImpassable: [false, false, false, false, false, false],
      source: { product: "test", credit: "test" },
    } as (typeof allTileDefinitions)[string];
    const tile: MapTileState = { id: "budget-tile", tileDefId: defId, group: "far",
      centerRow: 10, centerCol: 10, rotation: 0, faceDown: false, awaitingRotation: true };
    state.adventure!.tiles[tile.id] = tile;
    state.adventure!.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p2", heroId: hero.id, kind: "place" };
    const before = JSON.stringify(state);
    try {
      const choices = [0,1,2,3,4,5].map(rotation => {
        const routeScore = premiumRotationRouteScore(state, tile, rotation, "p2");
        const rotated = {...tile, rotation, awaitingRotation: false};
        const adventure = {...state.adventure!, fields: {...state.adventure!.fields}, tiles: {...state.adventure!.tiles, [tile.id]: rotated}};
        materializeTileFields(adventure, rotated);
        const target = Object.values(adventure.fields).find(field => field.tileInstanceId === tile.id && field.location === "mine")!;
        const score = scoreMapAction({ playerId: "p2", state: state as unknown as ComputerObservation["state"], legalActions: [] },
          {type: "SET_TILE_ROTATION", playerId: "p2", tileInstanceId: tile.id, rotation})!.score;
        return { rotation, routeScore, score, distance: distanceFromHeroTo({...state, adventure}, hero, target.spaceId)! };
      });
      expect(JSON.stringify(state)).toBe(before);
      choices.sort((a,b) => b.routeScore-a.routeScore);
      expect(choices[0].distance).toBeLessThan(choices.at(-1)!.distance);
      expect(choices[0].distance + 1).toBeLessThanOrEqual(hero.movementPoints);
      choices.sort((a,b) => b.score-a.score);
      expect(choices[0].distance + 1).toBeLessThanOrEqual(hero.movementPoints);
    } finally {
      delete allTileDefinitions[defId];
    }
  });

  it("plans next turn from where this turn's remaining steps can park the hero", () => {
    // 2-MP turns (entry + one continuation) with 1 step left now: a guard two
    // steps away is attackable NEXT turn after parking beside it tonight; one
    // three steps away is not. Reading next turn from the current cell (old
    // rule) gave neither rotation the next-turn credit.
    const { state, hero } = fixture();
    hero.spaceId = "h:10:8";
    hero.movementPoints = 1;
    hero.movementPointsMax = 2;
    state.adventure!.fields[hero.spaceId].location = "empty_field";
    const defId = "TEST_PREMIUM_NEXT_TURN_ROTATION";
    allTileDefinitions[defId] = {
      id: defId, group: "far", content: "core_game", terrain: "grass",
      fields: Array.from({length: 7}, (_, slot) => slot === 1
        ? { location: "mine", resource: "gold", difficulty: 3 }
        : { location: "empty_field" }),
      outerImpassable: [false, false, false, false, false, false],
      source: { product: "test", credit: "test" },
    } as (typeof allTileDefinitions)[string];
    const tile: MapTileState = { id: "next-turn-tile", tileDefId: defId, group: "far",
      centerRow: 10, centerCol: 10, rotation: 0, faceDown: false, awaitingRotation: true };
    state.adventure!.tiles[tile.id] = tile;
    state.adventure!.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p2", heroId: hero.id, kind: "place" };
    try {
      const choices = [0,1,2,3,4,5].map(rotation => {
        const rotated = {...tile, rotation, awaitingRotation: false};
        const adventure = {...state.adventure!, fields: {...state.adventure!.fields}, tiles: {...state.adventure!.tiles, [tile.id]: rotated}};
        materializeTileFields(adventure, rotated);
        const target = Object.values(adventure.fields).find(field => field.tileInstanceId === tile.id && field.location === "mine")!;
        const probe = {...state, adventure};
        return { routeScore: premiumRotationRouteScore(state, tile, rotation, "p2"),
          distance: distanceFromHeroTo(probe, hero, target.spaceId, true)!,
          reserve: premiumCombatMovementReserve(probe, hero, target) };
      });
      const two = choices.find(choice => choice.distance === 2)!;
      const three = choices.find(choice => choice.distance === 3)!;
      expect(two).toBeDefined();
      expect(three).toBeDefined();
      expect(two.reserve).toBe(1);
      // Plain one-step distance difference is 30; the next-turn capture adds 65.
      expect(two.routeScore - three.routeScore).toBeGreaterThan(60);
    } finally {
      delete allTileDefinitions[defId];
    }
  });
});
