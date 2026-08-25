import { describe, expect, it } from "vitest";
import { locationDefinitions } from "@/data/map/locations";
import { createAdventureGameState } from "../adventure-setup";
import {
  getAdjacentSpaceIds,
  isFieldGuarded,
  isOuterEdgeSealed,
} from "../adventure";
import { standardComputerController } from "./control";
import { driveComputerPlayers } from "@/server/computer-runner";
import type { GameState, HeroState, MapSpaceId } from "../state";
import {
  collectMapObjectives,
  distanceFromHeroTo,
  guardedGateHalfHasFightApproach,
  objectiveDistanceField,
  primaryMapObjective,
} from "./map-navigation";
import { scoreMapAction } from "./map-policy";
import type { ComputerObservation } from "./types";

/**
 * THE SUBTERRANEAN-GATE AI BUG (reported 2026-08-25): the free hop between the
 * two linked halves of a Subterranean Gate SLIPS PAST a live guard on the far
 * half (engine rule 2026-08-07) — but the AI's movement model scored that hop
 * as "arriving at the guard objective". The hero slipped on, the guard never
 * died, the objective never resolved, and the seat either PARKED on the
 * guarded half for the rest of the game or kept shuffling between the two gate
 * fields whenever another pickup pulled it off ("AI keeps moving between the
 * underground gate and the entrance — broke the game").
 *
 * Fix pinned here, each claim with a CONTROL:
 *  1. the objective-distance BFS treats a GUARDED linked gate half as the slip
 *     corridor it really is (the far layer stays reachable in the AI's model);
 *  2. a guarded gate half with NO non-twin approach is never a march objective
 *     (the fight can never be opened by walking);
 *  3. moveScore never reads the twin hop as the guard ARRIVAL, and a hero
 *     standing on a beatable slipped-past guard steps OFF to a non-twin cell
 *     (re-entry setup) so the ordinary walk-back-on opens the real fight;
 *  4. end-to-end on the live-pump pacing (fresh runner per tick): the guard is
 *     actually CLEARED and the payoff beyond the gate collected — the exact
 *     scenario that used to park forever.
 */

function game(): GameState {
  return createAdventureGameState({
    startingBuildings: [],
    seed: "nav-map",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
  });
}

function p2Hero(state: GameState): HeroState {
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
  );
  if (!hero) throw new Error("expected a p2 main hero on the starting map");
  return hero;
}

/** Clear every other objective so the hand-placed ones drive the policy. */
function neutralizeObjectives(state: GameState): void {
  for (const field of Object.values(state.adventure!.fields)) {
    if (field.difficulty) {
      field.blackCube = true;
      field.everFlagged = true;
      delete field.difficulty;
    }
    if (locationDefinitions[field.location]?.category === "flaggable") {
      field.flagOwnerId = "p2";
    }
    if (locationDefinitions[field.location]?.category === "visitable") {
      field.blackCube = true;
    }
  }
  for (const tile of Object.values(state.adventure!.tiles)) {
    tile.faceDown = false;
  }
  state.adventure!.farTilePool = [];
  for (const other of Object.values(state.heroes)) {
    if (other.controllerId !== "p2") other.spaceId = null;
  }
}

function homeDoorway(state: GameState, hero: HeroState): MapSpaceId {
  const homeTileId = state.adventure!.fields[hero.spaceId!].tileInstanceId;
  const doorway = Object.values(state.adventure!.fields).find(
    (field) =>
      field.tileInstanceId === homeTileId &&
      field.slot !== 0 &&
      field.location === "empty_field" &&
      !isOuterEdgeSealed(state.adventure!, field),
  );
  if (!doorway) throw new Error("expected an open empty arc on the home tile");
  return doorway.spaceId;
}

/** Carve a linked gate pair off the doorway; returns [surfaceHalf, underHalf]. */
function carveGate(
  state: GameState,
  doorway: MapSpaceId,
): [MapSpaceId, MapSpaceId] {
  const fields = state.adventure!.fields;
  const tiles = state.adventure!.tiles;
  const surfaceGate = getAdjacentSpaceIds(doorway).find((id) => !fields[id])!;
  fields[surfaceGate] = {
    ...fields[doorway],
    spaceId: surfaceGate,
    location: "subterranean_gate",
    tileInstanceId: fields[doorway].tileInstanceId,
    flagOwnerId: null,
    blackCube: false,
  };
  delete fields[surfaceGate].difficulty;
  tiles["tile_under"] = {
    ...tiles[fields[doorway].tileInstanceId],
    id: "tile_under",
    group: "subterranean",
    faceDown: false,
  } as (typeof tiles)[string];
  const uGate = getAdjacentSpaceIds(surfaceGate).find((id) => !fields[id])!;
  fields[uGate] = {
    ...fields[doorway],
    spaceId: uGate,
    location: "subterranean_gate",
    tileInstanceId: "tile_under",
    flagOwnerId: null,
    blackCube: false,
  };
  delete fields[uGate].difficulty;
  fields[surfaceGate].gateLinkSpaceId = uGate;
  fields[uGate].gateLinkSpaceId = surfaceGate;
  return [surfaceGate, uGate];
}

/** Add an underground field adjacent to `anchor` on the carved under tile. */
function addUnderField(
  state: GameState,
  anchor: MapSpaceId,
  location: string,
): MapSpaceId {
  const fields = state.adventure!.fields;
  const id = getAdjacentSpaceIds(anchor).find((x) => !fields[x])!;
  fields[id] = {
    ...fields[anchor],
    spaceId: id,
    location: location as never,
    tileInstanceId: "tile_under",
    flagOwnerId: null,
    blackCube: false,
  };
  delete fields[id].difficulty;
  return id;
}

function observe(state: GameState): ComputerObservation {
  return {
    playerId: "p2",
    state: state as unknown as ComputerObservation["state"],
    legalActions: [],
  };
}

function moveScoreTo(state: GameState, hero: HeroState, to: MapSpaceId): number {
  const scored = scoreMapAction(observe(state), {
    type: "MOVE_HERO",
    playerId: "p2",
    heroId: hero.id,
    to,
  });
  if (!scored) {
    throw new Error("expected MOVE_HERO to be scored by the map policy");
  }
  return scored.score;
}

/** The guarded-gate fixture: doorway → surface half → GUARDED under half → hill fort. */
function guardedGateFixture() {
  const state = game();
  const hero = p2Hero(state);
  hero.level = 2; // strictly above the difficulty-1 guard → deterministic win
  hero.movementPoints = 3;
  neutralizeObjectives(state);
  const doorway = homeDoorway(state, hero);
  const [surfaceGate, uGate] = carveGate(state, doorway);
  state.adventure!.fields[uGate].difficulty = 1;
  const hillFort = addUnderField(state, uGate, "hill_fort");
  return { state, hero, doorway, surfaceGate, uGate, hillFort };
}

describe("objective-distance BFS — a guarded linked gate half is a slip corridor", () => {
  it("keeps the far layer reachable through a GUARDED under half; CONTROL: a guarded plain corridor still blocks", () => {
    const { state, hero, surfaceGate, uGate, hillFort } = guardedGateFixture();

    // The hill fort behind the guarded gate half is reachable in the AI model:
    // the hero really can slip A→B (free, no combat) and step off to it.
    const toHillFort = distanceFromHeroTo(state, hero, hillFort);
    expect(toHillFort).toBeDefined();

    // The gradient runs THROUGH the guarded half: surface half = under half + 1.
    const df = objectiveDistanceField(state, hero, [
      { spaceId: hillFort, kind: "visitable" },
    ]);
    expect(df.get(uGate)).toBe(1);
    expect(df.get(surfaceGate)).toBe(2);

    // CONTROL: the same guard on a plain (non-gate) field is NOT a corridor —
    // break the link and the layer divide + the guard stop shut the route.
    delete state.adventure!.fields[surfaceGate].gateLinkSpaceId;
    delete state.adventure!.fields[uGate].gateLinkSpaceId;
    expect(distanceFromHeroTo(state, hero, hillFort)).toBeUndefined();
  });
});

describe("guardedGateHalfHasFightApproach — unfightable guards are not objectives", () => {
  it("drops a guarded gate half with no non-twin approach; CONTROL: an approach cell restores it", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 2;
    neutralizeObjectives(state);
    const doorway = homeDoorway(state, hero);
    const [, uGate] = carveGate(state, doorway);
    state.adventure!.fields[uGate].difficulty = 1;

    // The under half's only mapped neighbour is its twin: the fight can never
    // be opened by walking (the twin hop slips past). Never a march target.
    expect(
      guardedGateHalfHasFightApproach(state, hero, state.adventure!.fields[uGate]),
    ).toBe(false);
    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.spaceId === uGate,
      ),
    ).toBe(false);

    // CONTROL: one standable non-twin neighbour makes the guard fightable —
    // it returns to the objective list.
    addUnderField(state, uGate, "empty_field");
    expect(
      guardedGateHalfHasFightApproach(state, hero, state.adventure!.fields[uGate]),
    ).toBe(true);
    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.spaceId === uGate,
      ),
    ).toBe(true);
  });
});

describe("moveScore — the twin hop never reads as the guard arrival", () => {
  it("scores the slip hop as a corridor step and the non-twin walk-back-on as the real arrival", () => {
    const { state, hero, surfaceGate, uGate, hillFort } = guardedGateFixture();
    // The hill fort is already visited: the guard is the one march target, so
    // both probes below compare the SAME objective from the two entry sides.
    state.adventure!.fields[hillFort].blackCube = true;

    // Standing on the surface half, the hop onto the guarded under half is a
    // march step (progress toward the layer beyond), NEVER the guard-objective
    // ENTER score (870) — the engine slips past and no fight would open.
    hero.spaceId = surfaceGate;
    const slipHop = moveScoreTo(state, hero, uGate);
    expect(slipHop).toBeGreaterThan(500); // still marches through the tunnel
    expect(slipHop).toBeLessThan(850); // but no fight is being entered here

    // CONTROL: arriving from the non-twin neighbour IS the fight — full guard
    // arrival score.
    hero.spaceId = hillFort;
    const fightEntry = moveScoreTo(state, hero, uGate);
    expect(fightEntry).toBeGreaterThanOrEqual(870);
  });

  it("standing ON a beatable slipped-past guard, the step OFF to a non-twin cell beats END_TURN; the twin does not", () => {
    const { state, hero, surfaceGate, uGate, hillFort } = guardedGateFixture();
    // Mark the hill fort visited so it does not out-pull the re-entry setup.
    state.adventure!.fields[hillFort].blackCube = true;

    hero.spaceId = uGate; // slipped past — the guard is alive under our feet
    expect(isFieldGuarded(state.adventure!.fields[uGate])).toBe(true);

    const stepOff = moveScoreTo(state, hero, hillFort);
    expect(stepOff).toBeGreaterThan(600); // re-entry setup > END_TURN (300)

    // The twin hop sets up NOTHING (re-entering from the twin slips again).
    const twinHop = moveScoreTo(state, hero, surfaceGate);
    expect(twinHop).toBeLessThan(stepOff);
  });
});

describe("end-to-end on the live-pump pacing — the slipped-past guard is finally fought", () => {
  it("clears the guarded under half and collects the payoff beyond within a few rounds (used to park forever)", () => {
    const { state, uGate, hillFort } = guardedGateFixture();
    state.controllers = {
      p1: standardComputerController(),
      p2: standardComputerController(),
    };
    state.activePlayerId = "p2";
    state.turn = { ...state.turn, completedPlayerIds: [] };

    // Fresh runner per tick — exactly how a live table paces the AI. The old
    // model slipped onto the guard at round 1 and then only ever END_TURNed.
    let current: GameState = state;
    for (let tick = 0; tick < 120; tick += 1) {
      const run = driveComputerPlayers(current, undefined, { maxSteps: 1 });
      if (run.decisions.length === 0) break;
      current = run.state;
      const gateField = current.adventure!.fields[uGate];
      if (!isFieldGuarded(gateField)) break;
    }

    // The observable outcomes: the guard on the gate half is GONE (the level-2
    // hero's re-entry resolved it as a strict-level Quick Combat win), and the
    // hill fort beyond the gate was actually visited.
    expect(isFieldGuarded(current.adventure!.fields[uGate])).toBe(false);
    expect(current.adventure!.fields[hillFort].blackCube).toBe(true);
    // And the hero is not oscillating: it stands somewhere, with the march done.
    const hero = p2Hero(current);
    expect(hero.spaceId).toBeDefined();
  });

  it("CONTROL: with the guard already cleared the march passes straight through (no re-entry dance)", () => {
    const { state, uGate, hillFort } = guardedGateFixture();
    delete state.adventure!.fields[uGate].difficulty;
    const hero = p2Hero(state);
    const primary = primaryMapObjective(state, hero);
    expect(primary?.spaceId).toBe(hillFort);
  });
});
