import { describe, expect, it } from "vitest";
import { locationDefinitions } from "@/data/map/locations";
import { createAdventureGameState } from "../adventure-setup";
import { getAdjacentSpaceIds, isOuterEdgeSealed } from "../adventure";
import { hexDistance, parseHexSpaceId } from "../hex";
import { standardComputerController } from "./control";
import { shouldAssaultEnemyHolding, shouldEngageEnemy } from "./army-strength";
import {
  alliedComputerSeatCloser,
  collectMapObjectives,
  coopHumanHuntBonus,
  distanceFromHeroTo,
  primaryMapObjective,
} from "./map-navigation";
import type { GameState, HeroState, MapSpaceId } from "../state";

/**
 * ALLIANCE-AWARE AI (reported 2026-08-25: "make sure AI opponents cooperate
 * better if they are allied and understand the human enemy"). Pinned here,
 * each claim with a no-alliance CONTROL on the same setup:
 *  - an ALLY's town / flagged mine is never a march objective (the engine's
 *    ally flag gate makes arriving there a no-op, so the old listing committed
 *    allied AI seats to marches that could never resolve);
 *  - `shouldAssaultEnemyHolding` refuses an allied owner on its own;
 *  - allied computer seats DEDUP collectible objectives (the strictly-closer
 *    seat claims it; the other picks its next-best target);
 *  - a co-op computer seat presses the humans once ready (`coopHumanHuntBonus`
 *    — zero on clash tables and for human seats).
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

function mainHeroOf(state: GameState, playerId: string): HeroState {
  const hero = Object.values(state.heroes).find(
    (candidate) =>
      candidate.controllerId === playerId && candidate.kind === "main",
  );
  if (!hero) throw new Error(`expected a ${playerId} main hero`);
  return hero;
}

function townSpaceOf(state: GameState, playerId: string): MapSpaceId {
  const field = Object.values(state.adventure!.fields).find(
    (candidate) =>
      locationDefinitions[candidate.location]?.category === "town" &&
      candidate.flagOwnerId === playerId,
  );
  if (!field) throw new Error(`expected a ${playerId} town`);
  return field.spaceId;
}

/** Stamp both seats as one allied computer team (the co-op AI-team shape). */
function allyBothSeats(state: GameState): void {
  state.playerTeams = { p1: "coop-ai", p2: "coop-ai" };
  state.controllers = {
    p1: standardComputerController(),
    p2: standardComputerController(),
  };
}

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

function homeDoorways(state: GameState, hero: HeroState): MapSpaceId[] {
  const homeTileId = state.adventure!.fields[hero.spaceId!].tileInstanceId;
  return Object.values(state.adventure!.fields)
    .filter(
      (field) =>
        field.tileInstanceId === homeTileId &&
        field.slot !== 0 &&
        field.location === "empty_field" &&
        !isOuterEdgeSealed(state.adventure!, field),
    )
    .map((field) => field.spaceId);
}

function homeDoorway(state: GameState, hero: HeroState): MapSpaceId {
  const doorway = homeDoorways(state, hero)[0];
  if (!doorway) throw new Error("expected an open empty arc");
  return doorway;
}

/**
 * Extend a corridor of fresh empty fields into open lattice off `root`.
 * `steerAwayFrom` picks each step to maximise hex distance from that cell, so
 * two arms off the same doorway can genuinely diverge (the default first-free
 * ordering makes them snake in parallel).
 */
function buildArm(
  state: GameState,
  root: MapSpaceId,
  length: number,
  steerAwayFrom?: MapSpaceId,
): MapSpaceId[] {
  const fields = state.adventure!.fields;
  const template = fields[root];
  const avoid = steerAwayFrom ? parseHexSpaceId(steerAwayFrom) : null;
  let cursor = root;
  const arm: MapSpaceId[] = [];
  while (arm.length < length) {
    const options = getAdjacentSpaceIds(cursor).filter(
      (id) => !fields[id] && !arm.includes(id),
    );
    const next = avoid
      ? [...options].sort(
          (a, b) =>
            hexDistance(parseHexSpaceId(b)!, avoid) -
            hexDistance(parseHexSpaceId(a)!, avoid),
        )[0]
      : options[0];
    if (!next) throw new Error("arm should extend into open lattice");
    fields[next] = {
      ...template,
      spaceId: next,
      location: "empty_field",
      tileInstanceId: "tile_ghost_offmap",
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[next].difficulty;
    arm.push(next);
    cursor = next;
  }
  return arm;
}

describe("ally holdings are never march objectives", () => {
  it("drops an ALLY's town from the objective list (conquest 'victory' hole); CONTROL: enemy town stays", () => {
    const state = game();
    const hero = mainHeroOf(state, "p2");
    const p1Town = townSpaceOf(state, "p1");

    // CONTROL first (no alliance): the enemy town is a conquest target.
    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.spaceId === p1Town,
      ),
    ).toBe(true);

    // Allied: the same town drops off the list entirely.
    allyBothSeats(state);
    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.spaceId === p1Town,
      ),
    ).toBe(false);
  });

  it("drops an ALLY's flagged mine (the free re-flag objective); CONTROL: enemy-flagged is taken", () => {
    const state = game();
    const hero = mainHeroOf(state, "p2");
    const mine = Object.values(state.adventure!.fields).find(
      (field) => locationDefinitions[field.location]?.category === "flaggable",
    );
    if (!mine) throw new Error("expected a flaggable field");
    // Its guard (if any) is long beaten — a bare flagged mine re-flags free.
    mine.blackCube = true;
    mine.everFlagged = true;
    delete mine.difficulty;
    mine.flagOwnerId = "p1";

    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.spaceId === mine.spaceId,
      ),
    ).toBe(true);

    allyBothSeats(state);
    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.spaceId === mine.spaceId,
      ),
    ).toBe(false);
  });

  it("shouldAssaultEnemyHolding refuses an allied owner on its own; CONTROL: unallied follows the strength gate", () => {
    const state = game();
    const p1Town = state.adventure!.fields[townSpaceOf(state, "p1")];
    // Make the assault clearly favourable so the CONTROL is discriminating.
    state.players.p1.army = [];

    const unallied = shouldAssaultEnemyHolding(state, "p2", p1Town);
    expect(unallied).toBe(shouldEngageEnemy(state, "p2", "p1"));
    expect(unallied).toBe(true);

    allyBothSeats(state);
    expect(shouldAssaultEnemyHolding(state, "p2", p1Town)).toBe(false);
  });
});

describe("allied computer seats dedup collectible objectives", () => {
  it("the strictly-closer allied AI seat claims a free mine; this seat picks its next-best; CONTROL: a human ally is never read", () => {
    const state = game();
    const hero = mainHeroOf(state, "p2");
    const ally = mainHeroOf(state, "p1");
    neutralizeObjectives(state);
    // Two branches forked off the one open doorway (a "stop" field like a
    // mine walls a single-file corridor for the BFS, so each mine gets its
    // own approach). Mine A sits on branch A with the allied hero camped right
    // beside it; mine B is picked on branch B where the ally is NOT closer.
    const doorway = homeDoorway(state, hero);
    const armA = buildArm(state, doorway, 3);
    const armB = buildArm(state, doorway, 6, armA[2]);
    const mineA = armA[1];
    // The allied computer's main hero camps right beside mine A (one cell
    // DEEPER on branch A, so it is closer to A but not to branch B). Alliance
    // is stamped in BOTH phases so the parked p1 hero is never an "enemy-hero"
    // objective distorting the comparison.
    ally.spaceId = armA[2];
    state.playerTeams = { p1: "coop-ai", p2: "coop-ai" };
    state.controllers = {
      p1: standardComputerController(),
      p2: standardComputerController(),
    };
    const dA = distanceFromHeroTo(state, hero, mineA)!;
    // Pick mine B on branch B: farther than A (so A is the natural pick), the
    // ally NOT closer to it, and within the 7-step value window of the −140
    // claim penalty. Straight-line hex reads snake with the lattice, so the
    // cell is selected rather than hardcoded.
    const mineB = [...armB]
      .reverse()
      .find((cell) => {
        const d = distanceFromHeroTo(state, hero, cell);
        return (
          d !== undefined &&
          d > dA &&
          d - dA <= 7 &&
          !alliedComputerSeatCloser(state, hero, cell)
        );
      });
    if (!mineB) throw new Error("expected a branch-B cell outside the ally's reach");
    for (const spaceId of [mineA, mineB]) {
      state.adventure!.fields[spaceId].location = "mine";
      state.adventure!.fields[spaceId].resource = "buildingMaterials";
      state.adventure!.fields[spaceId].flagOwnerId = null;
    }
    // No movement points: this pins the strategic MARCH dedup, not the
    // free-seize-this-turn shortcut (a grab within reach is never deduped).
    hero.movementPoints = 0;

    // CONTROL (ally is a HUMAN seat — no controller entry): human allies'
    // plans are unknowable, so the dedup never reads them — nearest free mine
    // (A) stays the pick.
    state.controllers = { p2: standardComputerController() };
    expect(alliedComputerSeatCloser(state, hero, mineA)).toBe(false);
    const before = primaryMapObjective(state, hero);
    expect(before?.spaceId).toBe(mineA);

    // Allied COMPUTERS: A is claimed by the closer AI ally, p2 goes for B.
    state.controllers = {
      p1: standardComputerController(),
      p2: standardComputerController(),
    };
    expect(alliedComputerSeatCloser(state, hero, mineA)).toBe(true);
    expect(alliedComputerSeatCloser(state, hero, mineB)).toBe(false);
    const after = primaryMapObjective(state, hero);
    expect(after?.spaceId).toBe(mineB);
  });
});

describe("co-op human hunt — a computer seat presses the humans once ready", () => {
  it("coopHumanHuntBonus: co-op computer seat only; CONTROLs: clash table / human seat get zero", () => {
    const state = game();
    state.controllers = { p2: standardComputerController() };

    expect(coopHumanHuntBonus(state, "p2")).toBe(0); // clash (no gameMode)
    state.gameMode = "coop";
    expect(coopHumanHuntBonus(state, "p2")).toBeGreaterThan(0);
    expect(coopHumanHuntBonus(state, "p1")).toBe(0); // human seat
  });

  it("flips the primary from a nearby pickup to the human hero on a co-op table (same map, only gameMode differs)", () => {
    const state = game();
    const hero = mainHeroOf(state, "p2");
    const human = mainHeroOf(state, "p1");
    neutralizeObjectives(state);
    // Ready army (3 packs), weak human army so shouldEngageEnemy passes.
    for (const unit of state.players.p2.army) unit.side = "pack";
    state.players.p1.army = [];
    state.controllers = { p2: standardComputerController() };

    const doorway = homeDoorway(state, hero);
    const arm = buildArm(state, doorway, 9);
    // The university sits on a SIDE branch off the corridor (a "stop" field
    // in the corridor itself would wall the BFS off from the human beyond);
    // the human hero waits ~7 steps deeper — inside the value window where
    // only the co-op hunt bonus flips the choice. No movement points, so the
    // free-seize-this-turn shortcut cannot claim the university first.
    hero.movementPoints = 0;
    const fields = state.adventure!.fields;
    const side = getAdjacentSpaceIds(arm[1]).find(
      (id) => !fields[id] && !arm.includes(id),
    )!;
    fields[side] = {
      ...fields[arm[1]],
      spaceId: side,
      location: "university",
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[side].difficulty;
    human.spaceId = arm[8];
    const dUniversity = distanceFromHeroTo(state, hero, side)!;
    const dHuman = distanceFromHeroTo(state, hero, human.spaceId)!;
    // Sanity: the geometry really is inside the [6..9]-step flip window.
    expect(dHuman - dUniversity).toBeGreaterThanOrEqual(6);
    expect(dHuman - dUniversity).toBeLessThanOrEqual(9);

    const clashPick = primaryMapObjective(state, hero);
    state.gameMode = "coop";
    const coopPick = primaryMapObjective(state, hero);

    expect(clashPick?.spaceId).toBe(side);
    expect(coopPick?.spaceId).toBe(human.spaceId);
  });
});
