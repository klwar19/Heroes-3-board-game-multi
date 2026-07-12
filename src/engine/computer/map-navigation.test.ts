import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import type { GameState, HeroState, MapSpaceId } from "../state";
import {
  canBeatGuardedField,
  collectMapObjectives,
  objectiveDistanceField,
} from "./map-navigation";
import { scoreMapAction } from "./map-policy";
import type { ComputerObservation } from "./types";

/**
 * The computer opponent's map navigation. The stock policy scored each adjacent
 * cell in isolation, so a hero wandered back and forth over equal-valued empty
 * fields and never walked into a fight. These tests pin the fix on a REAL
 * starting map (seed "nav-map") whose p2 home tile carries, around the p2 town
 * at h:10:7, two difficulty-1 guarded fields (the mine h:10:6 and the treasure
 * h:11:6) and an unguarded visitable (the resource symbol h:10:8) — every claim
 * fails if the objective-seeking / engagement wiring is removed.
 */

const TOWN: MapSpaceId = "h:10:7"; // p2's home town — the hero starts here
const MINE: MapSpaceId = "h:10:6"; // flaggable, difficulty 1 (guarded)
const TREASURE: MapSpaceId = "h:11:6"; // visitable, difficulty 1 (guarded)
const RESOURCE: MapSpaceId = "h:10:8"; // visitable, no guard
const EMPTY: MapSpaceId = "h:9:7"; // empty field beside the town

function game(): GameState {
  return createAdventureGameState({
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
  if (!hero) {
    throw new Error("expected a p2 main hero on the starting map");
  }
  return hero;
}

/** scoreMapAction only reads observation.state + observation.playerId. */
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

describe("canBeatGuardedField (Quick-Combat grounded engagement)", () => {
  it("engages a guard at or below the hero's neutral-battle level", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Difficulty 1 vs level 1: an even fight the AI will take.
    expect(canBeatGuardedField(state, hero, state.adventure!.fields[MINE])).toBe(
      true,
    );
    hero.level = 3;
    // Level 3 > difficulty 1: a guaranteed Quick-Combat win.
    expect(canBeatGuardedField(state, hero, state.adventure!.fields[MINE])).toBe(
      true,
    );
  });

  it("CONTROL: stays away from a guard above the hero's level", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 4;
    expect(canBeatGuardedField(state, hero, state.adventure!.fields[MINE])).toBe(
      false,
    );
  });
});

describe("collectMapObjectives", () => {
  it("counts beatable guards and unowned locations, not owned or enemy fields", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Park the enemy hero away from its town so h:8:2 is a bare enemy holding.
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = null;
    const spaces = collectMapObjectives(state, hero).map((o) => o.spaceId);
    // Both difficulty-1 guards and the unguarded visitable are objectives.
    expect(spaces).toContain(MINE);
    expect(spaces).toContain(TREASURE);
    expect(spaces).toContain(RESOURCE);
    // p2's own town is never an objective.
    expect(spaces).not.toContain(TOWN);
    // A bare enemy (p1) holding with no hero on it is never an objective.
    expect(spaces).not.toContain("h:8:2");
  });

  it("drops a guard from the objective set once the hero can no longer beat it", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 6;
    const spaces = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(spaces).not.toContain(MINE);
    // The other, still-beatable guard remains.
    expect(spaces).toContain(TREASURE);
  });
});

describe("objectiveDistanceField", () => {
  it("is zero at objectives and one step out at the hero's cell", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const objectives = collectMapObjectives(state, hero);
    const distance = objectiveDistanceField(state, hero, objectives);
    expect(distance.get(MINE)).toBe(0);
    expect(distance.get(TREASURE)).toBe(0);
    // The town is adjacent to all three objectives — one step to the nearest.
    expect(distance.get(TOWN)).toBe(1);
  });
});

describe("moveScore uses objectives (fixes wander + never-fights)", () => {
  it("steps ONTO a beatable guard well above ending the turn", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Entering the beatable guard outranks END_TURN (300) by a wide margin, so
    // the AI walks into the fight instead of turtling.
    expect(moveScoreTo(state, hero, MINE)).toBeGreaterThan(700);
  });

  it("CONTROL: refuses to step onto a guard it cannot beat (below END_TURN)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 6;
    // An unbeatable guard scores below END_TURN (300) — the AI stops instead.
    expect(moveScoreTo(state, hero, MINE)).toBeLessThan(300);
  });

  it("hunts a beatable enemy hero: steps onto it above ending the turn", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Park the human's hero on a field adjacent to the AI's hero. Equal starting
    // armies → the AI engages.
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = RESOURCE;
    const objectives = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(objectives).toContain(RESOURCE);
    expect(moveScoreTo(state, hero, RESOURCE)).toBeGreaterThan(700);
  });

  it("CONTROL: avoids an enemy hero its army cannot take (below END_TURN band)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = RESOURCE;
    // Gut the AI's own army so it is clearly outmatched: no engagement.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    const objectives = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(objectives).not.toContain(RESOURCE);
    // The enemy-occupied field falls back to the blind-PvP avoid score (200).
    expect(moveScoreTo(state, hero, RESOURCE)).toBeLessThan(300);
  });

  it("stops wandering: with no objective left every step scores below END_TURN", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const fields = state.adventure!.fields;
    // Neutralise every nearby objective: flag the guarded fields to p2 and use
    // up the visitable, so nothing is worth marching toward.
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    // A move onto a plain empty neighbour now makes no progress → below END_TURN,
    // so the hero ends its turn rather than shuffling back and forth.
    expect(moveScoreTo(state, hero, EMPTY)).toBeLessThan(300);
  });
});
