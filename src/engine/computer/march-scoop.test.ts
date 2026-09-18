import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import type { GameState, HeroState, MapSpaceId, MapTileState } from "../state";
import {
  distanceFromHeroTo,
  freeSeizuresAlongMarch,
  freeSeizuresWithinReach,
  objectiveDistanceField,
  type MapObjective,
} from "./map-navigation";

/**
 * USER RULING (2026-09-17): the march to an objective must scoop the free
 * resource fields it passes, however many turns the march takes — the hero
 * must not walk past them and "come back later". Five open rows (8–12) so the
 * strict march graph (uncollected stops are walls) has room to walk AROUND
 * the symbols on row 10, exactly as it does on a real board.
 */
function openBoard(): { state: GameState; hero: HeroState } {
  const state = createAdventureGameState({
    seed: "march-scoop",
    difficulty: "normal",
    events: false,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Control", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Computer", factionId: "castle", heroDefId: "catherine" },
    ],
  });
  const hero = Object.values(state.heroes).find((h) => h.controllerId === "p2" && h.kind === "main")!;
  state.activePlayerId = "p2";
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  const template = Object.values(state.adventure!.fields)[0];
  state.adventure!.fields = {};
  state.adventure!.tiles = {
    home: { id: "home", tileDefId: "test-open", centerRow: 10, centerCol: 7, group: "starting", faceDown: false, rotation: 0 } as MapTileState,
  };
  for (let row = 8; row <= 12; row += 1) {
    for (let col = 4; col <= 10; col += 1) {
      const spaceId = `h:${row}:${col}`;
      state.adventure!.fields[spaceId] = {
        ...template, spaceId, tileInstanceId: "home", location: "empty_field",
        flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined,
      };
    }
  }
  const ownTown = Object.values(state.towns).find((t) => t.controllerId === "p2")!;
  const townField = state.adventure!.fields["h:12:10"];
  townField.location = "town"; townField.flagOwnerId = "p2"; ownTown.fieldId = townField.spaceId;
  const rivalTown = Object.values(state.towns).find((t) => t.controllerId === "p1")!;
  state.adventure!.fields[rivalTown.fieldId!] = {
    ...template, spaceId: rivalTown.fieldId!, location: "town", flagOwnerId: "p1", difficulty: undefined,
  };
  for (const other of Object.values(state.heroes)) {
    if (other.id !== hero.id) other.spaceId = other.controllerId === "p1" ? rivalTown.fieldId! : null;
  }
  hero.spaceId = "h:10:9"; hero.movementPoints = 3; hero.movementPointsMax = 3;
  const mark = (spaceId: MapSpaceId, location: string, extra: Partial<typeof template> = {}) =>
    Object.assign(state.adventure!.fields[spaceId], { location, ...extra });
  mark("h:10:4", "mine", { resource: "buildingMaterials" }); // P: the (unguarded) primary, 6 strict steps west
  mark("h:10:7", "resource_symbol"); // X: on the line, inside this turn's reach
  mark("h:10:5", "resource_symbol"); // Y: on the line, BEYOND this turn's reach
  mark("h:8:6", "resource_symbol"); // W: one step beside the route
  mark("h:10:10", "resource_symbol"); // Z: one step BEHIND the hero
  return { state, hero };
}

describe("march scoop — free pickups along the whole route (USER RULING 2026-09-17)", () => {
  it("adds on-route and one-step-beside pickups beyond this turn's reach, never a pickup behind the hero", () => {
    const { state, hero } = openBoard();
    const primary: MapObjective = { spaceId: "h:10:4", kind: "flaggable" };
    const objectives: MapObjective[] = [
      primary,
      { spaceId: "h:10:7", kind: "visitable" },
      { spaceId: "h:10:5", kind: "visitable" },
      { spaceId: "h:8:6", kind: "visitable" },
      { spaceId: "h:10:10", kind: "visitable" },
    ];
    // Geometry: the strict graph walks AROUND the symbols on the line.
    expect(distanceFromHeroTo(state, hero, "h:10:7")).toBe(2);
    expect(distanceFromHeroTo(state, hero, "h:10:5")).toBe(5);
    expect(distanceFromHeroTo(state, hero, "h:8:6")).toBe(4);
    const towardPrimary = objectiveDistanceField(state, hero, [primary]);
    expect(towardPrimary.get(hero.spaceId!)).toBe(6);
    expect(towardPrimary.get("h:10:5")).toBe(1);
    expect(towardPrimary.get("h:8:6")).toBe(3);
    expect(towardPrimary.get("h:10:10")).toBe(7);

    // CONTROL: the turn-reach scoop alone sees neither far symbol and would
    // even take the one behind the hero.
    const withinReach = freeSeizuresWithinReach(state, hero, objectives).map((o) => o.spaceId).sort();
    expect(withinReach).toEqual(["h:10:10", "h:10:7"]);

    const along = freeSeizuresAlongMarch(state, hero, objectives, primary, towardPrimary)
      .map((o) => o.spaceId).sort();
    expect(along).toEqual(["h:10:5", "h:10:7", "h:8:6"]);

    // Premium marches (slack 0, no turn-reach scoop): only pickups ON a
    // shortest path — the one-step-beside symbol costs an extra step and is out.
    const strict = freeSeizuresAlongMarch(state, hero, objectives, primary, towardPrimary, 0, false)
      .map((o) => o.spaceId).sort();
    expect(strict).toEqual(["h:10:5", "h:10:7"]);
  });
});
