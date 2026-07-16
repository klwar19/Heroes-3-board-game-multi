import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { getTileBorderSegments } from "@/data/map/borders";
import {
  applyAction,
  canCrossEdge,
  canHeroDiscoverAdjacentTile,
  canHeroReachPlacedTile,
  canHeroReachPlacementCenter,
  createAdventureGameState,
  getLegalActions,
  isDesignedEdgeSealedBetween,
  isOuterEdgeSealed,
  isTileSlotOuterSealed,
  MAX_DESIGNED_BORDER_EDGES,
  normalizeDesignedBorderEdges,
  tileLatticeNeighbors,
  type CustomMapTilePlan,
  type GameState,
  type HexCoord,
  type MapFieldState,
  type MapTileState,
  type HeroMovementCapabilities
} from "./index";
import { instantiateTile, materializeTileFields } from "./adventure";
import {
  canonicalTileEdgeCode,
  hexDirectionBetween,
  hexEquals,
  hexNeighbor,
  hexSpaceId,
  parseHexSpaceId,
  slotDirection,
  tileFootprint
} from "./hex";
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

// ---------------------------------------------------------------------------
// PER-EDGE designer borders (the map designer's line-by-line yellow borders):
// each entry seals ONE hex edge (canonicalTileEdgeCode) — an outer edge OR an
// inner one between two of the tile's own fields — not a whole outer arc. The
// whole-arc tests above stay unchanged (legacy `extraBorders` is untouched);
// every claim below has a CONTROL that diverges when the wiring is removed.
// ---------------------------------------------------------------------------

/** Whether a tile centre is already occupied (avoid overlaps when instantiating). */
function centerTaken(state: GameState, c: HexCoord): boolean {
  return Object.values(adv(state).tiles).some((t) => t.centerRow === c.row && t.centerCol === c.col);
}

/** Rotation-0 footprint index of a board hex within a tile centred at `center`. */
function footprintIndexOf(center: HexCoord, coord: HexCoord): number {
  return tileFootprint(center, 0).findIndex((cell) => hexEquals(cell, coord));
}

/** Canonical `borderEdges` code for the edge of `field` (in `tile`) toward absolute `dir`. */
function edgeCodeFor(field: MapFieldState, tile: MapTileState, dir: number): number {
  const footprintIndex = field.slot === 0 ? 0 : slotDirection(field.slot, tile.rotation)! + 1;
  return canonicalTileEdgeCode(footprintIndex, dir);
}

/** The field of `aTile` that borders `tTile` across TWO edges (flower interlock guarantees one). */
function heroFieldFacing(
  adventure: AdventureState,
  aTile: MapTileState,
  tTile: MapTileState
): { field: MapFieldState; dirs: number[] } | null {
  const tHexes = new Set(tileFootprint({ row: tTile.centerRow, col: tTile.centerCol }, 0).map(hexSpaceId));
  for (const field of Object.values(adventure.fields)) {
    if (field.tileInstanceId !== aTile.id) {
      continue;
    }
    const coord = parseHexSpaceId(field.spaceId);
    if (!coord) {
      continue;
    }
    const dirs: number[] = [];
    for (let d = 0; d < 6; d += 1) {
      if (tHexes.has(hexSpaceId(hexNeighbor(coord, d)))) {
        dirs.push(d);
      }
    }
    if (dirs.length >= 2) {
      return { field, dirs };
    }
  }
  return null;
}

describe("per-edge designer borders — movement", () => {
  it("a single per-edge line blocks exactly that crossing both ways; a sibling edge stays open", () => {
    const state = cleanState("db-edge-move");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find((candidate) => !centerTaken(state, candidate))!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const { from, to } = sharedEdge(adv(state), a, b);
    const dir = hexDirectionBetween(parseHexSpaceId(from.spaceId)!, parseHexSpaceId(to.spaceId)!)!;

    // A sibling: an INTERNAL step of tile A from the same field (a different edge).
    const fromCoord = parseHexSpaceId(from.spaceId)!;
    let internalTo: MapFieldState | undefined;
    for (let d = 0; d < 6; d += 1) {
      const candidate = adv(state).fields[hexSpaceId(hexNeighbor(fromCoord, d))];
      if (candidate && candidate.tileInstanceId === a.id) {
        internalTo = candidate;
        break;
      }
    }

    // CONTROL: both crossings open.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);
    expect(internalTo && canCrossEdge(state, from.spaceId, internalTo.spaceId, NONE)).toBe(true);

    // Seal ONLY the from→to edge (one code, from-side canonical).
    a.borderEdges = [edgeCodeFor(from, a, dir)];
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(false);
    expect(canCrossEdge(state, to.spaceId, from.spaceId, NONE)).toBe(false);
    // The sibling internal edge is untouched — only the coded edge is sealed.
    expect(internalTo && canCrossEdge(state, from.spaceId, internalTo.spaceId, NONE)).toBe(true);
    // Fly is blocked (parity with a printed line); Expert Pathfinding crosses it.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, FLY)).toBe(false);
    expect(canCrossEdge(state, from.spaceId, to.spaceId, PATHFINDING)).toBe(true);
  });

  it("a same-tile INNER per-edge line blocks that internal step; another inner edge stays open", () => {
    const state = cleanState("db-edge-inner");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const centerId = hexSpaceId(O);
    const ring0Id = hexSpaceId(hexNeighbor(O, 0));
    const ring1Id = hexSpaceId(hexNeighbor(O, 1));

    // CONTROL: both internal steps open.
    expect(canCrossEdge(state, centerId, ring0Id, NONE)).toBe(true);
    expect(canCrossEdge(state, centerId, ring1Id, NONE)).toBe(true);

    // Seal the centre↔ring[0] inner edge (canonical code for footprint 0, dir 0).
    a.borderEdges = [canonicalTileEdgeCode(0, 0)];
    expect(canCrossEdge(state, centerId, ring0Id, NONE)).toBe(false);
    expect(canCrossEdge(state, ring0Id, centerId, NONE)).toBe(false);
    // CONTROL: the centre↔ring[1] inner edge is untouched.
    expect(canCrossEdge(state, centerId, ring1Id, NONE)).toBe(true);
    // Expert Pathfinding still crosses the sealed inner line.
    expect(canCrossEdge(state, centerId, ring0Id, PATHFINDING)).toBe(true);
  });

  it("a LINKED Subterranean Gate crossing beats a per-edge line on that edge (precedence)", () => {
    const state = cleanState("db-edge-gate");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find((candidate) => !centerTaken(state, candidate))!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const { from, to } = sharedEdge(adv(state), a, b);
    const dir = hexDirectionBetween(parseHexSpaceId(from.spaceId)!, parseHexSpaceId(to.spaceId)!)!;

    from.location = "subterranean_gate";
    to.location = "subterranean_gate";
    from.gateLinkSpaceId = to.spaceId;
    to.gateLinkSpaceId = from.spaceId;
    a.borderEdges = [edgeCodeFor(from, a, dir)];

    // gateFieldsLinked is checked BEFORE the per-edge seal, so the tunnel opens.
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);

    // CONTROL: break the link — the same per-edge line now blocks the step.
    from.gateLinkSpaceId = undefined;
    to.gateLinkSpaceId = undefined;
    from.location = "empty_field";
    to.location = "empty_field";
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(false);
  });
});

describe("per-edge designer borders — absolute frame (rotation-independent)", () => {
  it("seals the SAME board edge whatever the tile's rotation (different slot each time)", () => {
    const state = cleanState("db-edge-rot");
    const O: HexCoord = { row: 40, col: 30 };
    const neighbor = tileLatticeNeighbors(O).find((candidate) => !centerTaken(state, candidate))!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);

    // Read the physical shared edge + its code from a rotation-0 A, then remove A.
    const a0 = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const { from, to } = sharedEdge(adv(state), a0, b);
    const fromSpace = from.spaceId;
    const toSpace = to.spaceId;
    const dir = hexDirectionBetween(parseHexSpaceId(fromSpace)!, parseHexSpaceId(toSpace)!)!;
    const code = canonicalTileEdgeCode(footprintIndexOf(O, parseHexSpaceId(fromSpace)!), dir);
    clearTile(adv(state), a0);

    for (const rotation of [0, 3]) {
      const existing = Object.values(adv(state).tiles).find((t) => t.centerRow === O.row && t.centerCol === O.col);
      if (existing) {
        clearTile(adv(state), existing);
      }
      const a = instantiateTile(adv(state), OPEN_TILE, O, rotation, false);
      const fromSlot = adv(state).fields[fromSpace].slot;
      a.borderEdges = [code];
      // Same board hexes (footprint is rotation-invariant); the field's SLOT differs
      // each rotation, so a tile-frame (local) code would seal a different edge here.
      expect(canCrossEdge(state, fromSpace, toSpace, NONE), `sealed at rotation ${rotation} (slot ${fromSlot})`).toBe(false);
      // CONTROL: drop the code → the same edge reopens.
      a.borderEdges = [];
      expect(canCrossEdge(state, fromSpace, toSpace, NONE), `open at rotation ${rotation}`).toBe(true);
    }
  });
});

describe("per-edge designer borders — face-down + random draw", () => {
  it("carries borderEdges from setup (any tile drawn) and seals an inner edge on reveal at any rotation", () => {
    const TOWN: HexCoord = { row: 24, col: 12 };
    const FAR = tileLatticeNeighbors(TOWN)[0];
    const INNER = canonicalTileEdgeCode(0, 0); // centre↔ring[0]
    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: true, borderEdges: [INNER] }
    ];
    const state = createAdventureGameState({
      seed: "db-edge-facedown",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap,
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const tile = Object.values(adv(state).tiles).find((t) => t.centerRow === FAR.row && t.centerCol === FAR.col)!;

    // BEFORE reveal: the placed instance is face-down (random tile) yet already
    // carries the per-edge border as normalized data (applyDesignedBorders copied it).
    expect(tile.faceDown).toBe(true);
    expect(tile.borderEdges).toEqual([INNER]);

    const centerId = hexSpaceId(FAR);
    for (const rotation of [0, 1]) {
      clearFieldsOf(adv(state), tile);
      tile.faceDown = false;
      tile.rotation = rotation;
      materializeTileFields(adv(state), tile);
      const center = adv(state).fields[centerId];
      const ring0 = adv(state).fields[hexSpaceId(hexNeighbor(FAR, 0))];
      const ring1 = adv(state).fields[hexSpaceId(hexNeighbor(FAR, 1))];
      expect(
        isDesignedEdgeSealedBetween(adv(state), center.spaceId, center, ring0.spaceId, ring0),
        `inner edge sealed after reveal at rotation ${rotation}`
      ).toBe(true);
      // CONTROL: a different inner edge is NOT sealed.
      expect(isDesignedEdgeSealedBetween(adv(state), center.spaceId, center, ring1.spaceId, ring1)).toBe(false);
    }
  });

  it("applyDesignedBorders copies normalized borderEdges onto a face-UP starting tile too", () => {
    const TOWN: HexCoord = { row: 24, col: 12 };
    // Mirror code 9 (fp1,dir3) folds to the centre↔ring[0] canonical code 0.
    const state = createAdventureGameState({
      seed: "db-edge-startplan",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [
        { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false, borderEdges: [9, 9, 0] }
      ],
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const tile = Object.values(adv(state).tiles).find((t) => t.centerRow === TOWN.row && t.centerCol === TOWN.col)!;
    expect(tile.borderEdges).toEqual([0]); // canonicalized + deduped
  });
});

describe("per-edge designer borders — tile discovery", () => {
  function discoveryFixture(): {
    state: GameState;
    aTile: MapTileState;
    target: MapTileState;
    facing: { field: MapFieldState; dirs: number[] };
  } {
    const state = cleanState("test-seed");
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const res = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(res.errors).toHaveLength(0);
      Object.assign(state, res.state);
    }
    const O: HexCoord = { row: 40, col: 30 };
    const aTile = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const nb = tileLatticeNeighbors(O).find((candidate) => !centerTaken(state, candidate))!;
    const target = instantiateTile(adv(state), OPEN_TILE, nb, 0, true); // face-down target
    const facing = heroFieldFacing(adv(state), aTile, target);
    if (!facing) {
      throw new Error("no A field with two edges into the target");
    }
    state.heroes.hero_p1.spaceId = facing.field.spaceId;
    state.heroes.hero_p1.movementPoints = 3;
    return { state, aTile, target, facing };
  }

  it("blocks discovery only when EVERY shared edge is sealed; one open edge allows it", () => {
    const { state, aTile, target, facing } = discoveryFixture();
    const hero = state.heroes.hero_p1;

    // CONTROL: no borders → discoverable + offered.
    expect(canHeroDiscoverAdjacentTile(state, hero, target)).toBe(true);
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === target.id
      )
    ).toBe(true);

    // Seal EVERY shared edge (hero side) → not discoverable, not offered, rejected.
    aTile.borderEdges = facing.dirs.map((d) => edgeCodeFor(facing.field, aTile, d));
    expect(canHeroDiscoverAdjacentTile(state, hero, target)).toBe(false);
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === target.id
      )
    ).toBe(false);
    const rejected = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: target.id
    });
    expect(rejected.errors).toHaveLength(1);
    expect(rejected.errors[0].message).toContain("yellow border");
    expect(rejected.state.adventure!.tiles[target.id].faceDown).toBe(true);

    // CONTROL: reopen ONE of the two shared edges → discoverable again (per-edge,
    // not per-field — a single open doorway is enough).
    aTile.borderEdges = facing.dirs.slice(1).map((d) => edgeCodeFor(facing.field, aTile, d));
    expect(canHeroDiscoverAdjacentTile(state, hero, target)).toBe(true);
  });
});

describe("per-edge designer borders — new tile placement", () => {
  it("a per-edge line under the hero refuses reaching/placing a new tile across THAT edge; a non-facing edge does not", () => {
    const state = cleanState("test-seed");
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const res = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(res.errors).toHaveLength(0);
      Object.assign(state, res.state);
    }
    state.heroes.hero_p1.spaceId = "h:10:6";
    state.heroes.hero_p1.movementPoints = 5;
    // Free the (9,4) slot (a face-down centre hub sits there in the fixture).
    const hubEntry = Object.entries(adv(state).tiles).find(([, t]) => t.centerRow === 9 && t.centerCol === 4)!;
    delete adv(state).tiles[hubEntry[0]];

    const heroField = adv(state).fields["h:10:6"];
    const heroTile = adv(state).tiles[heroField.tileInstanceId];
    // The hero's field edges toward the (9,4) placement footprint.
    const targetHexes = new Set(tileFootprint({ row: 9, col: 4 }, 0).map(hexSpaceId));
    const heroCoord = parseHexSpaceId("h:10:6")!;
    const facingDirs: number[] = [];
    for (let d = 0; d < 6; d += 1) {
      if (targetHexes.has(hexSpaceId(hexNeighbor(heroCoord, d)))) {
        facingDirs.push(d);
      }
    }
    expect(facingDirs.length).toBeGreaterThan(0);

    // CONTROL: open — the centre is reachable (pre-draw) and the drawn tile opens.
    expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, { row: 9, col: 4 })).toBe(true);
    expect(canHeroReachPlacedTile(state, state.heroes.hero_p1, OPEN_TILE, { row: 9, col: 4 }, 0)).toBe(true);

    // CONTROL: sealing a NON-facing edge of the hero's field does NOT block placement.
    const nonFacing = [0, 1, 2, 3, 4, 5].find((d) => !facingDirs.includes(d));
    if (nonFacing !== undefined) {
      heroTile.borderEdges = [edgeCodeFor(heroField, heroTile, nonFacing)];
      expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, { row: 9, col: 4 })).toBe(true);
    }

    // Seal EVERY facing edge (hero side) → both reachability checks refuse.
    heroTile.borderEdges = facingDirs.map((d) => edgeCodeFor(heroField, heroTile, d));
    expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, { row: 9, col: 4 })).toBe(false);
    expect(canHeroReachPlacedTile(state, state.heroes.hero_p1, OPEN_TILE, { row: 9, col: 4 }, 0)).toBe(false);

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

describe("per-edge designer borders — rendering (getTileBorderSegments)", () => {
  it("emits each coded edge as the right LOCAL slot/edge (round-tripping through rotation)", () => {
    const openDef = allTileDefinitions[OPEN_TILE];
    const inner = canonicalTileEdgeCode(0, 0); // centre↔ring[0] → code 0
    const outer = canonicalTileEdgeCode(2, 1); // ring[1] hex, outer dir 1 → code 13
    expect(inner).toBe(0);
    expect(outer).toBe(13);

    // No borderEdges → nothing (default open tile still draws nothing).
    expect(getTileBorderSegments(openDef, undefined, false, { borderEdges: [] })).toEqual([]);

    // rotation 0: centre code → slot 0 edge 0; outer (fp2) → slot 2 edge 1.
    const rot0 = getTileBorderSegments(openDef, undefined, false, { borderEdges: [inner, outer], rotation: 0 }).map(
      (s) => `${s.slot}:${s.edge}`
    );
    expect(rot0).toContain("0:0");
    expect(rot0).toContain("2:1");

    // rotation 2: the draw loop re-adds rotation, so the LOCAL slot/edge shift but
    // (edge+rotation)%6 lands back on the same ABSOLUTE edge. centre → slot 0 edge
    // (0-2+6)%6 = 4; outer fp2 → slot ((2-1-2+6)%6)+1 = 6, edge (1-2+6)%6 = 5.
    const rot2 = getTileBorderSegments(openDef, undefined, false, { borderEdges: [inner, outer], rotation: 2 }).map(
      (s) => `${s.slot}:${s.edge}`
    );
    expect(rot2).toContain("0:4");
    expect(rot2).toContain("6:5");
  });
});

describe("normalizeDesignedBorderEdges", () => {
  it("canonicalizes mirror codes, dedupes, drops garbage, and caps at 30", () => {
    // The centre↔ring[0] edge has two codes: 0 (fp0,dir0) and 9 (fp1,dir3) — both fold to 0.
    expect(normalizeDesignedBorderEdges([0])).toEqual([0]);
    expect(normalizeDesignedBorderEdges([9])).toEqual([0]);
    expect(normalizeDesignedBorderEdges([0, 9])).toEqual([0]);

    // Garbage dropped (out of range, non-integer, wrong type), survivors ascending.
    expect(normalizeDesignedBorderEdges([13, 42, -1, 3.5, "x", 0])).toEqual([0, 13]);
    expect(normalizeDesignedBorderEdges("nope")).toEqual([]);

    // All 42 codes fold to exactly the 30 distinct physical edges (the cap).
    const normalized = normalizeDesignedBorderEdges(Array.from({ length: 42 }, (_, index) => index));
    expect(normalized.length).toBe(30);
    expect(normalized.length).toBeLessThanOrEqual(MAX_DESIGNED_BORDER_EDGES);
    // Idempotent.
    expect(normalizeDesignedBorderEdges(normalized)).toEqual(normalized);
  });
});
