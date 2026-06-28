import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getHeroMovementCapabilities,
  getLegalActions,
  getReachableHeroPaths,
  hexNeighbors,
  hexSpaceId,
  isSeaField,
  parseHexSpaceId,
  tileLatticeNeighbors,
  getTileFootprintSpaceIds,
  type GameAction,
  type GameState
} from "./index";
import { instantiateTile } from "./adventure";
import type { MapTileState } from "./state";

// ---------------------------------------------------------------------------
// The long-reported "Pathfinding / Water Walk still stops me at the sea" bug.
//
// The movement ENGINE was always right: with Water Walk active a coastline step
// never halts. The real defect was the ORDER players actually play in — they
// click the adjacent sea hex FIRST (the natural move), which halts the hero
// (correct: no buff yet), and only THEN cast Water Walk / play expert
// Pathfinding. The halt flag (`movementHaltedThisTurn`) was never cleared, so
// the hero stayed frozen for the rest of the turn — "can't keep moving / can't
// click to move after moving once". Gaining Water Walk now lifts that halt.
//
// Every assertion drives the live engine through real PLAY_CARD / MOVE_HERO
// actions, so removing the fix fails a test here.
// ---------------------------------------------------------------------------

function makeState(): GameState {
  const state = createAdventureGameState({ seed: "sea-crossing-repro", difficulty: "normal", rollFirstPlayer: false });
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function heroP1(state: GameState) {
  const hero = state.heroes.hero_p1;
  if (!hero) throw new Error("no hero");
  return hero;
}

function crossPairs(a: MapTileState, b: MapTileState): [string, string][] {
  const bHexes = new Set(getTileFootprintSpaceIds(b));
  const pairs: [string, string][] = [];
  for (const aId of getTileFootprintSpaceIds(a)) {
    const coord = parseHexSpaceId(aId);
    if (!coord) continue;
    for (const neighbor of hexNeighbors(coord)) {
      const neighborId = hexSpaceId(neighbor);
      if (bHexes.has(neighborId)) pairs.push([aId, neighborId]);
    }
  }
  return pairs;
}

/** Land tile (F1) next to an all-ocean sea tile (W7); the sea hexes are scrubbed
 *  to plain open water so a step onto one neither fights nor opens a visit. */
function placeLandAndSea(state: GameState): { land: string; sea: string } {
  const adv = state.adventure!;
  const landCenter = { row: 30, col: 14 };
  const seaCenter = tileLatticeNeighbors(landCenter)[0];
  const landTile = instantiateTile(adv, "F1", landCenter, 0, false);
  const seaTile = instantiateTile(adv, "W7", seaCenter, 0, false);
  for (const id of getTileFootprintSpaceIds(landTile)) {
    const f = adv.fields[id];
    if (!f) continue;
    f.location = "empty_field";
    delete f.terrain;
    delete f.difficulty;
    f.blackCube = false;
    f.flagOwnerId = null;
  }
  for (const id of getTileFootprintSpaceIds(seaTile)) {
    const f = adv.fields[id];
    if (!f || !isSeaField(state, id)) continue;
    f.location = "empty_field";
    delete f.difficulty;
    f.blackCube = false;
    f.flagOwnerId = null;
  }
  const pair = crossPairs(landTile, seaTile).find(([a, b]) => !isSeaField(state, a) && isSeaField(state, b));
  if (!pair) throw new Error("no land->sea cross-tile pair found");
  return { land: pair[0], sea: pair[1] };
}

function playWaterWalk(state: GameState): GameState {
  const legal = getLegalActions(state, "p1").find(
    (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "spell.water_walk"
  );
  expect(legal, "Water Walk must be offered").toBeTruthy();
  return applyOk(state, legal!.action);
}

function playExpertPathfinding(state: GameState): GameState {
  const offer = getLegalActions(state, "p1").find(
    (l) =>
      l.action.type === "PLAY_CARD" &&
      l.action.cardId === "ability.pathfinding" &&
      l.action.optionIndex === 1
  );
  expect(offer, "expert Pathfinding must be offered with a crown").toBeTruthy();
  return applyOk(state, offer!.action);
}

describe("sea crossing — the buff lets the hero KEEP moving, whichever order it is played", () => {
  it("CONTROL — no buff: wading onto the sea halts the hero (cannot keep moving)", () => {
    let state = makeState();
    const { land, sea } = placeLandAndSea(state);
    const hero = heroP1(state);
    hero.spaceId = land;
    hero.movementPoints = 6;
    hero.movementHaltedThisTurn = false;

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);
    expect(getReachableHeroPaths(state, heroP1(state)).size).toBe(0);
  });

  it("Water Walk played AFTER wading onto the sea LIFTS the halt — the hero keeps sailing", () => {
    let state = makeState();
    const { land, sea } = placeLandAndSea(state);
    state.players.p1.hand = ["spell.water_walk"];
    const hero = heroP1(state);
    hero.spaceId = land;
    hero.movementPoints = 6;
    hero.movementHaltedThisTurn = false;

    // Click-to-move onto the sea first (the natural order): this halts the hero.
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(heroP1(state).movementHaltedThisTurn, "wading without the buff halts").toBe(true);

    // Now cast Water Walk while standing — halted — on the sea.
    state = playWaterWalk(state);
    expect(getHeroMovementCapabilities(state, heroP1(state)).waterWalk).toBe(true);
    // The fix: the stale coastline halt is lifted, so the hero can move again.
    expect(heroP1(state).movementHaltedThisTurn, "Water Walk must lift the sea halt").toBe(false);
    expect(getReachableHeroPaths(state, heroP1(state)).size, "the hero can keep moving").toBeGreaterThan(0);
    expect(heroP1(state).movementPoints).toBe(5); // points were kept, not zeroed
  });

  it("expert Pathfinding played AFTER wading onto the sea LIFTS the halt", () => {
    let state = makeState();
    const { land, sea } = placeLandAndSea(state);
    state.players.p1.limits.expertUses = 1;
    state.players.p1.hand = ["ability.pathfinding"];
    const hero = heroP1(state);
    hero.spaceId = land;
    hero.movementPoints = 6;
    hero.movementHaltedThisTurn = false;

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);

    state = playExpertPathfinding(state);
    expect(getHeroMovementCapabilities(state, heroP1(state)).waterWalk).toBe(true);
    expect(heroP1(state).movementHaltedThisTurn, "expert Pathfinding must lift the sea halt").toBe(false);
    expect(getReachableHeroPaths(state, heroP1(state)).size).toBeGreaterThan(0);
  });

  it("CONTROL — basic Pathfinding does NOT grant Water Walk, so the sea halt STAYS", () => {
    let state = makeState();
    const { land, sea } = placeLandAndSea(state);
    state.players.p1.hand = ["ability.pathfinding"];
    const hero = heroP1(state);
    hero.spaceId = land;
    hero.movementPoints = 6;
    hero.movementHaltedThisTurn = false;

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);

    // Play the BASIC side (optionIndex 0): no Water Walk, so the halt is unchanged.
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.pathfinding",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(getHeroMovementCapabilities(state, heroP1(state)).waterWalk).toBe(false);
    expect(heroP1(state).movementHaltedThisTurn, "basic Pathfinding leaves the sea halt in place").toBe(true);
    expect(getReachableHeroPaths(state, heroP1(state)).size).toBe(0);
  });

  it("buff FIRST still works: Water Walk then a multi-step land->sea->sea walk never halts", () => {
    let state = makeState();
    const { land, sea } = placeLandAndSea(state);
    state.players.p1.hand = ["spell.water_walk"];
    const hero = heroP1(state);
    hero.spaceId = land;
    hero.movementPoints = 6;
    hero.movementHaltedThisTurn = false;

    state = playWaterWalk(state);
    const reachable = getReachableHeroPaths(state, heroP1(state));
    expect(reachable.get(sea)).toBeTruthy();
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(heroP1(state).movementHaltedThisTurn).toBeFalsy();
    expect(getReachableHeroPaths(state, heroP1(state)).size).toBeGreaterThan(0);
  });
});
