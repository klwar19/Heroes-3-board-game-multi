import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { getTileBorderSegments } from "@/data/map/borders";
import {
  applyAction,
  canCrossEdge,
  canHeroDiscoverAdjacentTile,
  canHeroReachPlacementCenter,
  createAdventureGameState,
  getLegalActions,
  isOuterEdgeSealed,
  isTileSlotOuterSealed,
  tileLatticeNeighbors,
  type CustomMapTilePlan,
  type GameState,
  type HexCoord,
  type MapFieldState,
  type MapTileState,
  type HeroMovementCapabilities
} from "./index";
import { instantiateTile, materializeTileFields } from "./adventure";
import { hexNeighbor, hexSpaceId, parseHexSpaceId, slotDirection } from "./hex";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Designer-placed yellow borders (map designer): a deliberate impassable OUTER
// ARC on a placed tile, absolute board direction (0-5), stored on
// `tile.extraBorders`. Mechanically identical to a printed `outerImpassable`
// arc — every claim below has a CONTROL (same layout minus the border) that
// diverges, so removing the wiring fails the test.
// ---------------------------------------------------------------------------

const NONE: HeroMovementCapabilities = { moveThrough: false, waterWalk: false };
const FLY: HeroMovementCapabilities = { moveThrough: true, waterWalk: true };
const PATHFINDING: HeroMovementCapabilities = {
  moveThrough: true,
  waterWalk: false,
  passEncounters: true,
  crossSealedBorders: true
};

// F23 is a fully-open tile: no printed outerImpassable, no blocked field, no
// internal border — a clean canvas so any seal seen is the DESIGNED one.
const OPEN_TILE = "F23";

function cleanState(seed: string): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, events: false });
}

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure");
  }
  return state.adventure;
}

/** Drop a tile instance and all its materialized fields (reset between rotations). */
function clearTile(adventure: AdventureState, tile: MapTileState): void {
  for (const id of Object.keys(adventure.fields)) {
    if (adventure.fields[id].tileInstanceId === tile.id) {
      delete adventure.fields[id];
    }
  }
  delete adventure.tiles[tile.id];
}

/** A first field of tile `a` adjacent to a field of tile `b` (their shared doorway). */
function sharedEdge(
  adventure: AdventureState,
  a: MapTileState,
  b: MapTileState
): { from: MapFieldState; to: MapFieldState } {
  for (const from of Object.values(adventure.fields)) {
    if (from.tileInstanceId !== a.id) {
      continue;
    }
    const coord = parseHexSpaceId(from.spaceId);
    if (!coord) {
      continue;
    }
    for (let direction = 0; direction < 6; direction += 1) {
      const to = adventure.fields[hexSpaceId(hexNeighbor(coord, direction))];
      if (to && to.tileInstanceId === b.id) {
        return { from, to };
      }
    }
  }
  throw new Error("no shared edge between the two tiles");
}

describe("designer-placed yellow borders — movement", () => {
  it("blocks an ordinary step across the arc; Pathfinding crosses it, Fly does not", () => {
    const state = cleanState("db-move");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adv(state).tiles).some((t) => t.centerRow === candidate.row && t.centerCol === candidate.col)
    )!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const { from, to } = sharedEdge(adv(state), a, b);

    // CONTROL: both arcs open — the step is legal for a plain walker.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);

    // Seal the FROM field's outer arc with a designed border (absolute frame).
    a.extraBorders = [slotDirection(from.slot, a.rotation)!];
    expect(isOuterEdgeSealed(adv(state), from)).toBe(true);

    // Ordinary movement can no longer cross — either direction (either side sealed blocks).
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(false);
    expect(canCrossEdge(state, to.spaceId, from.spaceId, NONE)).toBe(false);
    // Fly (moveThrough only) is blocked exactly like a printed border.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, FLY)).toBe(false);
    // Expert Pathfinding (crossSealedBorders) traverses it — parity with printed.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, PATHFINDING)).toBe(true);
  });

  it("sealing the TO side alone also blocks the shared edge", () => {
    const state = cleanState("db-move-to");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adv(state).tiles).some((t) => t.centerRow === candidate.row && t.centerCol === candidate.col)
    )!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const { from, to } = sharedEdge(adv(state), a, b);

    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);
    b.extraBorders = [slotDirection(to.slot, b.rotation)!];
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(false);
  });

  it("a LINKED Subterranean Gate crossing beats a designed border on that arc (precedence)", () => {
    const state = cleanState("db-gate");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adv(state).tiles).some((t) => t.centerRow === candidate.row && t.centerCol === candidate.col)
    )!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const { from, to } = sharedEdge(adv(state), a, b);

    // Make the two fields a mutually-linked Subterranean Gate pair and seal the
    // FROM arc with a designed border.
    from.location = "subterranean_gate";
    to.location = "subterranean_gate";
    from.gateLinkSpaceId = to.spaceId;
    to.gateLinkSpaceId = from.spaceId;
    a.extraBorders = [slotDirection(from.slot, a.rotation)!];
    expect(isOuterEdgeSealed(adv(state), from)).toBe(true);

    // gateFieldsLinked is checked BEFORE the seal, so the tunnel still opens.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);

    // CONTROL: break the link — now the same designed border blocks the step.
    from.gateLinkSpaceId = undefined;
    to.gateLinkSpaceId = undefined;
    from.location = "empty_field";
    to.location = "empty_field";
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(false);
  });
});

describe("designer-placed yellow borders — absolute frame (rotation-independent)", () => {
  it("seals the SAME absolute edge at two different rotations of the placed tile", () => {
    const state = cleanState("db-rot");
    const O: HexCoord = { row: 40, col: 30 };
    const D = 0; // absolute NE
    const sealedHex = hexSpaceId(hexNeighbor(O, D)); // ring[D] — the arc's field, always
    const otherHex = hexSpaceId(hexNeighbor(O, 2)); // a different absolute edge — never

    for (const rotation of [0, 2]) {
      const tile = instantiateTile(adv(state), OPEN_TILE, O, rotation, false);
      tile.extraBorders = [D];
      const sealed = adv(state).fields[sealedHex];
      const other = adv(state).fields[otherHex];
      // Different LOCAL slot each rotation, but the SAME absolute hex is sealed —
      // a tile-frame (local) indexing bug would seal a different hex at rotation 2.
      expect(isOuterEdgeSealed(adv(state), sealed), `rotation ${rotation} sealed slot ${sealed.slot}`).toBe(true);
      expect(isOuterEdgeSealed(adv(state), other), `rotation ${rotation} other slot ${other.slot}`).toBe(false);
      clearTile(adv(state), tile);
    }
  });
});

describe("designer-placed yellow borders — face-down + random draw", () => {
  it("carries the seal from setup and applies on reveal at any rotation, whatever tile was drawn", () => {
    const TOWN: HexCoord = { row: 24, col: 12 };
    const FAR = tileLatticeNeighbors(TOWN)[0];
    const D = 3; // absolute SW
    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: true, extraBorders: [D] }
    ];
    const state = createAdventureGameState({
      seed: "db-facedown",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap,
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const tile = Object.values(adv(state).tiles).find((t) => t.centerRow === FAR.row && t.centerCol === FAR.col)!;

    // BEFORE reveal: the placed instance is face-down (a random tile was drawn)
    // yet already carries the designed border as data.
    expect(tile.faceDown).toBe(true);
    expect(tile.extraBorders).toEqual([D]);

    const sealedHex = hexSpaceId(hexNeighbor(FAR, D));
    for (const rotation of [0, 1]) {
      clearFieldsOf(adv(state), tile);
      tile.faceDown = false;
      tile.rotation = rotation;
      materializeTileFields(adv(state), tile);
      const sealed = adv(state).fields[sealedHex];
      expect(sealed, `field exists after reveal at rotation ${rotation}`).toBeTruthy();
      expect(isOuterEdgeSealed(adv(state), sealed), `sealed after reveal at rotation ${rotation}`).toBe(true);
    }
  });
});

function clearFieldsOf(adventure: AdventureState, tile: MapTileState): void {
  for (const id of Object.keys(adventure.fields)) {
    if (adventure.fields[id].tileInstanceId === tile.id) {
      delete adventure.fields[id];
    }
  }
}

describe("designer-placed yellow borders — tile discovery", () => {
  // makeGame seed "test-seed": h:10:6 is S1 slot 5 (an OPEN printed arc, absolute
  // direction 4) and borders the face-down center hub at (9,4) — the exact open
  // vantage the printed-border discovery tests use as their control.
  function discoveryFixture(): { state: GameState; hub: MapTileState; heroSpace: "h:10:6" } {
    const state = cleanState("test-seed");
    // Resolve the mandatory opening hand refresh so p1's turn is actionable.
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const res = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(res.errors).toHaveLength(0);
      Object.assign(state, res.state);
    }
    state.heroes.hero_p1.spaceId = "h:10:6";
    state.heroes.hero_p1.movementPoints = 3;
    const hub = Object.values(adv(state).tiles).find((t) => t.centerRow === 9 && t.centerCol === 4)!;
    return { state, hub, heroSpace: "h:10:6" };
  }

  it("a hero on a field inside a designed arc cannot discover the adjacent face-down tile across it", () => {
    const { state, hub } = discoveryFixture();
    const heroTile = adv(state).tiles[adv(state).fields["h:10:6"].tileInstanceId];
    expect(isTileSlotOuterSealed(heroTile.tileDefId, adv(state).fields["h:10:6"].slot)).toBe(false); // printed arc open

    // CONTROL: with no designed border the open arc allows discovery.
    expect(canHeroDiscoverAdjacentTile(state, state.heroes.hero_p1, hub)).toBe(true);
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === hub.id
      )
    ).toBe(true);

    // Draw a designed border on the hero's tile at the arc facing the hub (abs 4).
    heroTile.extraBorders = [4];
    expect(canHeroDiscoverAdjacentTile(state, state.heroes.hero_p1, hub)).toBe(false);
    // Not offered…
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === hub.id
      )
    ).toBe(false);
    // …and rejected if forced, with the movement point untouched and the tile face-down.
    const result = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: hub.id
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("yellow border");
    expect(result.state.heroes.hero_p1.movementPoints).toBe(3);
    expect(result.state.adventure!.tiles[hub.id].faceDown).toBe(true);
  });
});

describe("designer-placed yellow borders — new tile placement", () => {
  it("a designed arc under the hero refuses placing/reaching a new supply tile across it", () => {
    const state = cleanState("test-seed");
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const res = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(res.errors).toHaveLength(0);
      Object.assign(state, res.state);
    }
    state.heroes.hero_p1.spaceId = "h:10:6";
    state.heroes.hero_p1.movementPoints = 5;
    // Free the (9,4) slot (a face-down center hub sits there in the fixture).
    const hubEntry = Object.entries(adv(state).tiles).find(([, t]) => t.centerRow === 9 && t.centerCol === 4)!;
    delete adv(state).tiles[hubEntry[0]];

    // CONTROL: from the open S1 arc at h:10:6 the placement centre (9,4) is reachable.
    expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, { row: 9, col: 4 })).toBe(true);

    // Seal the hero's own outer arc with a designed border (abs 4 = slot 5's arc).
    const heroTile = adv(state).tiles[adv(state).fields["h:10:6"].tileInstanceId];
    heroTile.extraBorders = [4];
    expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, { row: 9, col: 4 })).toBe(false);

    // PLACE_TILE is rejected without spending a movement point.
    const mpBefore = state.heroes.hero_p1.movementPoints;
    const placeResult = applyAction(state, {
      type: "PLACE_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      supplyIndex: 0,
      centerRow: 9,
      centerCol: 4
    });
    expect(placeResult.errors).toHaveLength(1);
    expect(placeResult.errors[0].message).toContain("yellow border");
    expect(placeResult.state.heroes.hero_p1.movementPoints).toBe(mpBefore);
  });
});

describe("designer-placed yellow borders — rendering (getTileBorderSegments)", () => {
  it("returns the same three-edge arc a printed outerImpassable would, and nothing by default", () => {
    const openDef = allTileDefinitions[OPEN_TILE];
    const D = 1; // absolute E

    // No borders by default — the open tile draws nothing.
    expect(getTileBorderSegments(openDef)).toEqual([]);

    const designed = getTileBorderSegments(openDef, undefined, false, { extraBorders: [D], rotation: 0 })
      .map((segment) => `${segment.slot}:${segment.edge}`)
      .sort();

    // CONTROL: the SAME function fed a PRINTED arc at the same direction — a def
    // clone with outerImpassable[D] set — yields the identical segment set, so a
    // designed border renders with the identical shape (and thus the same
    // `.tileBorderLine` styling class the single draw loop applies to all).
    const printedClone = {
      ...openDef,
      outerImpassable: openDef.outerImpassable.map((value, index) => (index === D ? true : value))
    };
    const printed = getTileBorderSegments(printedClone)
      .map((segment) => `${segment.slot}:${segment.edge}`)
      .sort();

    expect(designed).toEqual(printed);
    expect(designed.length).toBe(3); // a full outer arc: three edges
  });

  it("emits the arc in the local frame so a rotated tile keeps it on the same absolute edge", () => {
    const openDef = allTileDefinitions[OPEN_TILE];
    const D = 0; // absolute NE
    // rotation 0: local dir 0 -> slot 1, edges 5,0,1
    const rot0 = getTileBorderSegments(openDef, undefined, false, { extraBorders: [D], rotation: 0 })
      .map((s) => `${s.slot}:${s.edge}`)
      .sort();
    expect(rot0).toEqual(["1:0", "1:1", "1:5"]);
    // rotation 2: local dir (0-2+6)%6 = 4 -> slot 5, edges 3,4,5. The draw loop
    // re-adds rotation 2 to each edge -> absolute 5,0,1 on the ring[0] hex again.
    const rot2 = getTileBorderSegments(openDef, undefined, false, { extraBorders: [D], rotation: 2 })
      .map((s) => `${s.slot}:${s.edge}`)
      .sort();
    expect(rot2).toEqual(["5:3", "5:4", "5:5"]);
  });
});
