import { describe, expect, it } from "vitest";
import { classifyHeroStep, getAdjacentSpaceIds, getReachableHeroPaths } from "./adventure";
import { createAdventureGameState } from "./adventure-setup";
import { objectiveDistanceField } from "./computer/map-navigation";
import type { GameState, MapSpaceId } from "./state";

function corridor(location: "sanctuary" | "mine" | "settlement" | "town"): {
  state: GameState;
  origin: MapSpaceId;
  middle: MapSpaceId;
  target: MapSpaceId;
} {
  const state = createAdventureGameState({ seed: `friendly-transit-${location}`, rollFirstPlayer: false });
  const hero = state.heroes.hero_p1;
  const fields = state.adventure!.fields;
  const known = new Set(Object.keys(fields));
  let origin: MapSpaceId | undefined;
  let middle: MapSpaceId | undefined;
  let target: MapSpaceId | undefined;
  for (const candidateMiddle of known) {
    const neighbors = getAdjacentSpaceIds(candidateMiddle).filter((spaceId) => known.has(spaceId));
    for (const candidateOrigin of neighbors) {
      const candidateTarget = neighbors.find(
        (spaceId) => spaceId !== candidateOrigin && !getAdjacentSpaceIds(candidateOrigin).includes(spaceId)
      );
      if (candidateTarget) {
        origin = candidateOrigin;
        middle = candidateMiddle;
        target = candidateTarget;
        break;
      }
    }
    if (target) break;
  }
  expect(middle).toBeTruthy();
  expect(target).toBeTruthy();
  expect(origin).toBeTruthy();

  // Force a one-cell-wide route, so reaching the target proves the middle
  // location was expanded as a corridor rather than merely listed as a stop.
  for (const field of Object.values(fields)) {
    field.location = "blocked_field";
    delete field.difficulty;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
  fields[origin!].location = "empty_field";
  fields[middle!].location = location;
  fields[target!].location = "empty_field";
  if (location !== "sanctuary") {
    fields[middle!].flagOwnerId = "p1";
    fields[middle!].everFlagged = true;
  }
  hero.spaceId = origin!;
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
  return { state, origin: origin!, middle: middle!, target: target! };
}

describe("friendly map locations are pathfinding corridors", () => {
  it.each(["sanctuary", "mine", "settlement", "town"] as const)(
    "treats %s like an Empty Field for player and AI pathing",
    (location) => {
      const { state, origin, middle, target } = corridor(location);
      const hero = state.heroes.hero_p1;
      expect(classifyHeroStep(state, hero, middle)).toBe("open");
      expect(getReachableHeroPaths(state, hero).get(target)?.cost).toBe(2);
      expect(objectiveDistanceField(state, hero, [{ spaceId: target, kind: "visitable" }]).get(origin)).toBe(2);
    }
  );

  it("keeps an enemy-flagged Town as a stopping capture/garrison site", () => {
    const { state, middle } = corridor("town");
    state.adventure!.fields[middle].flagOwnerId = "p2";
    expect(classifyHeroStep(state, state.heroes.hero_p1, middle)).toBe("stop");
  });
});
