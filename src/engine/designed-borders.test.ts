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
  DESIGNER_BORDER_SEALING_ENABLED,
  getLegalActions,
  heroFieldSealedForDiscovery,
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
import { getAdjacentSpaceIds, instantiateTile, materializeTileFields } from "./adventure";
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

/**
 * Grant a player the Pathfinding movement effect (`crossSealedBorders`) for the
 * rest of the turn, exactly as playing the ability would. `expert: true` makes
 * `crossSealedBorders` true regardless of the `pathfinding-expert` house rule
 * (basic grants it under BINH; the printed-expert side grants it either way), so
 * the fixture is deterministic. Only `controllerId` + `modifiers` are read by
 * getHeroMovementCapabilities, hence the cast.
 */
function grantPathfinding(state: GameState, playerId: string): void {
  state.activeEffects.push({
    id: `pf-${playerId}`,
    name: "Pathfinding",
    scope: "player",
    modifiers: [{ type: "HERO_PATHFINDING", expert: true }],
    duration: { type: "current-turn" },
    controllerId: playerId,
    source: { kind: "card", cardId: "ability.pathfinding" },
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  } as unknown as GameState["activeEffects"][number]);
}

// Designer yellow borders are ON by default (DESIGNER_BORDER_SEALING_ENABLED).
// Suites that assert a designed border WALLS movement / discovery / placement
// run while the flag is on; pure rendering + normalizer suites always run.
// The "lock removed" suite below is the CONTROL for the off path (skipped when
// the flag is on).
const sealingDescribe = DESIGNER_BORDER_SEALING_ENABLED ? describe : describe.skip;

// CONTROL for the off path: when sealing is disabled a designed border neither
// seals movement nor is copied onto the live map. Skipped while the flag is on
// (the sealing suites above are the live spec).
const lockRemovedDescribe = DESIGNER_BORDER_SEALING_ENABLED ? describe.skip : describe;

lockRemovedDescribe("designer-border sealing DISABLED (lock removed)", () => {
  it("a designed outer-arc border no longer seals the edge (movement stays open)", () => {
    const state = cleanState("db-lock-off-move");
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adv(state).tiles).some((t) => t.centerRow === candidate.row && t.centerCol === candidate.col)
    )!;
    const b = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const { from, to } = sharedEdge(adv(state), a, b);

    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);
    // Draw a designed border right on the shared arc — it is now inert.
    a.extraBorders = [slotDirection(from.slot, a.rotation)!];
    b.borderEdges = normalizeDesignedBorderEdges([slotDirection(to.slot, b.rotation)! % 6]);
    expect(isOuterEdgeSealed(adv(state), from)).toBe(false);
    expect(isDesignedEdgeSealedBetween(adv(state), from.spaceId, from, to.spaceId, to)).toBe(false);
    expect(canCrossEdge(state, from.spaceId, to.spaceId, NONE)).toBe(true);
    expect(canCrossEdge(state, to.spaceId, from.spaceId, NONE)).toBe(true);
  });

  it("setup does NOT copy a plan's designed borders onto the live tile", () => {
    const TOWN: HexCoord = { row: 24, col: 12 };
    const state = createAdventureGameState({
      seed: "db-lock-off-setup",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [{ row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false, borderEdges: [9, 9, 0] }],
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const tile = Object.values(adv(state).tiles).find((t) => t.centerRow === TOWN.row && t.centerCol === TOWN.col)!;
    expect(tile.borderEdges).toBeUndefined();
    expect(tile.extraBorders).toBeUndefined();
  });
});

function cleanState(seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    // Yellow borders always block MOVEMENT; whether they also block TILE
    // DISCOVERY / placement is the opt-in `discovery-border-gate` house rule
    // (official rules need only adjacency). These fixtures cover both, so the
    // rule is ON here — the OFF default is pinned in adventure.test.ts.
    houseRules: { "discovery-border-gate": true }
  });
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

sealingDescribe("designer-placed yellow borders — movement", () => {
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

  it("a step THROUGH a linked Subterranean Gate marks HERO_MOVED.teleport (cave-visit sfx)", () => {
    // The tunnel between the two gate halves is the only Surface↔Underground
    // walk that should play adventure/cave-visit instead of horse footsteps.
    let state = cleanState("db-gate-teleport-sfx");
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      const result = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      expect(result.errors).toHaveLength(0);
      state = result.state;
    }
    const O: HexCoord = { row: 40, col: 30 };
    const tileA = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adv(state).tiles).some((t) => t.centerRow === candidate.row && t.centerCol === candidate.col)
    )!;
    const tileB = instantiateTile(adv(state), OPEN_TILE, neighbor, 0, false);
    const edge = sharedEdge(adv(state), tileA, tileB);
    const fromId = edge.from.spaceId;
    const toId = edge.to.spaceId;
    edge.from.location = "subterranean_gate";
    edge.to.location = "subterranean_gate";
    edge.from.gateLinkSpaceId = toId;
    edge.to.gateLinkSpaceId = fromId;
    delete edge.from.difficulty;
    delete edge.to.difficulty;

    state.heroes.hero_p1.spaceId = fromId;
    state.heroes.hero_p1.movementPoints = 3;
    state.heroes.hero_p1.movementHaltedThisTurn = false;

    const moved = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: toId
    });
    expect(moved.errors, moved.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    state = moved.state;
    expect(state.heroes.hero_p1.spaceId).toBe(toId);

    const hop = state.eventLog
      .filter((event): event is Extract<(typeof state.eventLog)[number], { type: "HERO_MOVED" }> => event.type === "HERO_MOVED")
      .find((event) => event.from === fromId && event.to === toId);
    expect(hop?.teleport).toBe("subterranean");

    // CONTROL: an ordinary adjacent walk between the same hexes (link broken)
    // is NOT a teleport. Re-read fields from the post-move state (applyAction
    // clones; the earlier `edge` objects are stale).
    const fromField = adv(state).fields[fromId]!;
    const toField = adv(state).fields[toId]!;
    fromField.gateLinkSpaceId = undefined;
    toField.gateLinkSpaceId = undefined;
    fromField.location = "empty_field";
    toField.location = "empty_field";
    state.heroes.hero_p1.spaceId = fromId;
    state.heroes.hero_p1.movementPoints = 3;
    const logBefore = state.eventLog.length;
    const plain = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: toId
    });
    expect(plain.errors).toHaveLength(0);
    // Only the NEW hop (after logBefore) — the earlier teleport move stays in the log.
    const plainHop = plain.state.eventLog
      .slice(logBefore)
      .filter((event): event is Extract<(typeof plain.state.eventLog)[number], { type: "HERO_MOVED" }> => event.type === "HERO_MOVED")
      .find((event) => event.from === fromId && event.to === toId);
    expect(plainHop?.teleport).toBeUndefined();
  });
});

sealingDescribe("designer-placed yellow borders — absolute frame (rotation-independent)", () => {
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

sealingDescribe("designer-placed yellow borders — face-down + random draw", () => {
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

sealingDescribe("designer-placed yellow borders — tile discovery", () => {
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

sealingDescribe("designer-placed yellow borders — new tile placement", () => {
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

    const designed = getTileBorderSegments(openDef, undefined, { extraBorders: [D], rotation: 0 })
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
    const rot0 = getTileBorderSegments(openDef, undefined, { extraBorders: [D], rotation: 0 })
      .map((s) => `${s.slot}:${s.edge}`)
      .sort();
    expect(rot0).toEqual(["1:0", "1:1", "1:5"]);
    // rotation 2: local dir (0-2+6)%6 = 4 -> slot 5, edges 3,4,5. The draw loop
    // re-adds rotation 2 to each edge -> absolute 5,0,1 on the ring[0] hex again.
    const rot2 = getTileBorderSegments(openDef, undefined, { extraBorders: [D], rotation: 2 })
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

sealingDescribe("per-edge designer borders — movement", () => {
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

sealingDescribe("a FIXED yellow border is respected at a runtime border-free hex (USER RULE 2026-08-22)", () => {
  // SUPERSEDES the 2026-08-09 / protocol-v24 "designer edges are inert at a
  // border-free hex" reading. A Creature Bank / PvE Gate / Field Override hex
  // loses the HOST TILE'S PRINTED borders (it stays passable from all
  // directions — pinned by the printed CONTROL below and in
  // module-gate-reachability.test.ts), but a FIXED yellow border the designer
  // drew is never removed: it seals movement AND is still painted.
  // The fixture deliberately encodes the edge from the NEIGHBOUR (centre) frame,
  // because an inner edge's two encodings fold to ONE canonical code — the seal
  // must hold whichever side stored it.
  function sealedInnerEdges(seed: string) {
    const state = cleanState(seed);
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adv(state), OPEN_TILE, O, 0, false);
    // Seal centre↔ring[0] AND centre↔ring[1], both coded in the CENTRE frame.
    a.borderEdges = normalizeDesignedBorderEdges([
      canonicalTileEdgeCode(0, 0),
      canonicalTileEdgeCode(0, 1)
    ]);
    return {
      state,
      centerId: hexSpaceId(O),
      ring0Id: hexSpaceId(hexNeighbor(O, 0)),
      ring1Id: hexSpaceId(hexNeighbor(O, 1))
    };
  }

  const BORDER_FREE_LOCATIONS = [
    "creature_bank", // Blocked-Field carve — the user's named case ("even by the bank")
    "dungeon_gate", // PvE carve
    "calamity_gate", // PvE carve
    "wog.emerald_tower" // a Field Override hex (registry location)
  ] as const;

  for (const location of BORDER_FREE_LOCATIONS) {
    it(`${location}: a designer edge coded from the NEIGHBOUR frame STILL seals the crossing`, () => {
      const { state, centerId, ring0Id, ring1Id } = sealedInnerEdges(`db-borderfree-${location}`);
      // Baseline: on the plain field both designed edges seal the step.
      expect(canCrossEdge(state, centerId, ring0Id, NONE)).toBe(false);
      expect(canCrossEdge(state, centerId, ring1Id, NONE)).toBe(false);

      adv(state).fields[ring0Id].location = location as MapFieldState["location"];
      // The carve does NOT lift the fixed border — both directions stay walled...
      expect(canCrossEdge(state, centerId, ring0Id, NONE)).toBe(false);
      expect(canCrossEdge(state, ring0Id, centerId, NONE)).toBe(false);
      // ...and the sibling designed edge is untouched either way.
      expect(canCrossEdge(state, centerId, ring1Id, NONE)).toBe(false);

      // MUTATION CONTROL: drop the codes and the same carve hex is open again —
      // it is the designer border doing the sealing, not the location.
      adv(state).tiles[adv(state).fields[centerId].tileInstanceId].borderEdges = [];
      expect(canCrossEdge(state, centerId, ring0Id, NONE)).toBe(true);
      expect(canCrossEdge(state, ring0Id, centerId, NONE)).toBe(true);
    });
  }

  // The other half of the user rule: which line seals a CARVED hex. USER RULE
  // 2026-09-05 — "Bank: should respect the border. Only remove the INSIDE border
  // to get in. If there is no border outside, don't add a border." So the tile's
  // PRINTED outer arc survives the carve (slot 3 below), while a slot the tile
  // prints no arc for is open and only a DESIGNER line can seal it (slot 5).
  const PRINTED_BLOCKED_TILE = "F3"; // Ⅱ–Ⅲ tile: blocked field on slot 3 with a sealed printed arc
  const PRINTED_BLOCKED_SLOT = 3;
  /** The same tile's ring slot with NO printed outer arc. */
  const PRINTED_OPEN_SLOT = 5;

  function bankOnPrintedBlockedSlot(
    seed: string,
    slot: number = PRINTED_BLOCKED_SLOT
  ): {
    state: GameState;
    tile: MapTileState;
    bank: MapFieldState;
    outside: MapFieldState;
    dir: number;
  } {
    const state = cleanState(seed);
    const O: HexCoord = { row: 40, col: 30 };
    const tile = instantiateTile(adv(state), PRINTED_BLOCKED_TILE, O, 0, false);
    const bank = Object.values(adv(state).fields).find(
      (field) => field.tileInstanceId === tile.id && field.slot === slot
    )!;
    // Sanity: the two fixture slots really differ in their printed arc.
    expect(allTileDefinitions[PRINTED_BLOCKED_TILE].fields[PRINTED_BLOCKED_SLOT].location).toBe(
      "blocked_field"
    );
    expect(isTileSlotOuterSealed(PRINTED_BLOCKED_TILE, PRINTED_BLOCKED_SLOT)).toBe(true);
    expect(isTileSlotOuterSealed(PRINTED_BLOCKED_TILE, PRINTED_OPEN_SLOT)).toBe(false);
    bank.location = "creature_bank" as MapFieldState["location"];

    const bankCoord = parseHexSpaceId(bank.spaceId)!;
    let outside: MapFieldState | undefined;
    let dir = -1;
    for (const candidate of tileLatticeNeighbors(O)) {
      if (centerTaken(state, candidate)) {
        continue;
      }
      const other = instantiateTile(adv(state), OPEN_TILE, candidate, 0, false);
      for (let d = 0; d < 6; d += 1) {
        const found = adv(state).fields[hexSpaceId(hexNeighbor(bankCoord, d))];
        if (found && found.tileInstanceId === other.id) {
          outside = found;
          dir = d;
          break;
        }
      }
      if (outside) {
        break;
      }
      clearTile(adv(state), other);
    }
    if (!outside) {
      throw new Error("no cross-tile neighbour for the carved bank hex");
    }
    return { state, tile, bank, outside, dir };
  }

  // FLIPPED 2026-09-05: this used to run on the PRINTED-ARC slot and assert that
  // the printed line "still does not block" a carve. USER RULE 2026-09-05 keeps
  // the printed outer arc, so printed-vs-designer is now isolated on the slot
  // the tile prints NO arc for — which is exactly where "if there is no border
  // outside, don't add a border" means the designer line is the only wall.
  it("CONTROL: at an ARC-LESS carved slot the printed art does not block — the DESIGNER arc / edge on the same hex does", () => {
    const { state, tile, bank, outside, dir } = bankOnPrintedBlockedSlot(
      "db-bank-printed-vs-designed",
      PRINTED_OPEN_SLOT
    );

    // CONTROL: printed-only — the bank is enterable/leavable across the Tile edge
    // and the hero standing on it may still flip an adjacent face-down Tile.
    expect(canCrossEdge(state, outside.spaceId, bank.spaceId, NONE)).toBe(true);
    expect(canCrossEdge(state, bank.spaceId, outside.spaceId, NONE)).toBe(true);
    expect(heroFieldSealedForDiscovery(adv(state), bank)).toBe(false);

    // A designer PER-EDGE line on exactly that crossing seals it, both ways.
    tile.borderEdges = normalizeDesignedBorderEdges([edgeCodeFor(bank, tile, dir)]);
    expect(canCrossEdge(state, outside.spaceId, bank.spaceId, NONE)).toBe(false);
    expect(canCrossEdge(state, bank.spaceId, outside.spaceId, NONE)).toBe(false);
    // A per-EDGE line is not the slot's whole arc, so the discovery vantage is
    // still open here (the arc case below is what walls it).
    tile.borderEdges = [];
    expect(canCrossEdge(state, outside.spaceId, bank.spaceId, NONE)).toBe(true);

    // A designer WHOLE-ARC border (extraBorders) on the bank's slot seals the
    // crossing AND the discovery vantage.
    tile.extraBorders = [slotDirection(bank.slot, tile.rotation)!];
    expect(canCrossEdge(state, outside.spaceId, bank.spaceId, NONE)).toBe(false);
    expect(canCrossEdge(state, bank.spaceId, outside.spaceId, NONE)).toBe(false);
    expect(heroFieldSealedForDiscovery(adv(state), bank)).toBe(true);

    // MUTATION CONTROL: drop the designer arc → open again, printed art unchanged.
    tile.extraBorders = [];
    expect(canCrossEdge(state, outside.spaceId, bank.spaceId, NONE)).toBe(true);
    expect(heroFieldSealedForDiscovery(adv(state), bank)).toBe(false);
  });

  it("banks open printed far/near arcs and preserve starting/center arcs", () => {
    const { state, tile, bank, outside } = bankOnPrintedBlockedSlot("db-bank-printed-arc-band");
    // The same-tile route in is what the carve opens — measured against the
    // sealed tile edge below, so this is not a vacuously true pair.
    const inside = Object.values(adv(state).fields).find(
      (field) =>
        field.tileInstanceId === tile.id &&
        field.spaceId !== bank.spaceId &&
        getAdjacentSpaceIds(bank.spaceId).includes(field.spaceId) &&
        field.location !== "blocked_field"
    )!;
    expect(inside).toBeTruthy();

    for (const group of ["far", "near", "starting", "center"] as const) {
      tile.group = group as MapTileState["group"];
      const def = { ...allTileDefinitions[tile.tileDefId], group };
      const rendered = getTileBorderSegments(def, new Set([bank.slot]));
      expect(rendered.filter(segment => segment.slot === bank.slot)).toHaveLength(
        group === "far" || group === "near" ? 0 : 3,
      );
      expect(canCrossEdge(state, inside.spaceId, bank.spaceId, NONE), `${group}: walk in`).toBe(
        true
      );
      expect(
        canCrossEdge(state, outside.spaceId, bank.spaceId, NONE),
        `${group}: enter across the sealed tile edge`
      ).toBe(group === "far" || group === "near");
      expect(
        canCrossEdge(state, bank.spaceId, outside.spaceId, NONE),
        `${group}: leave across the sealed tile edge`
      ).toBe(group === "far" || group === "near");
      expect(heroFieldSealedForDiscovery(adv(state), bank), `${group}: discovery`).toBe(group !== "far" && group !== "near");
    }

    // MUTATION CONTROL: the SAME carve one slot over, where the tile prints no
    // arc, is open in every direction — so the seal above is really the printed
    // line and not "a carve is always sealed".
    const open = bankOnPrintedBlockedSlot("db-bank-printed-arc-band-open", PRINTED_OPEN_SLOT);
    expect(canCrossEdge(open.state, open.outside.spaceId, open.bank.spaceId, NONE)).toBe(true);
    expect(heroFieldSealedForDiscovery(adv(open.state), open.bank)).toBe(false);
  });

  it("RENDER agrees: the printed ring is suppressed at the bank hex while the designer line is still painted", () => {
    const def = allTileDefinitions[PRINTED_BLOCKED_TILE];
    // Raw code in the carved slot's OWN frame (footprint 3 == slot 3 at rotation 0).
    const designedEdge = PRINTED_BLOCKED_SLOT * 6 + 0;
    // ...and the SAME physical edge canonicalized into the NEIGHBOUR hex's frame,
    // which the old physical-adjacency filter also swallowed.
    const mirrorEdge = canonicalTileEdgeCode(PRINTED_BLOCKED_SLOT, 0);
    const carved = { borderlessSlots: new Set([PRINTED_BLOCKED_SLOT]) };

    // Printed at a carved slot (FLIPPED 2026-09-05, was "nothing drawn there"):
    // the OUTWARD three edges of the printed arc stay, the INWARD three open.
    // Slot 3 faces local direction 2, so its outward edges are 1, 2, 3.
    expect(
      getTileBorderSegments(def, new Set(), carved)
        .filter((segment) => segment.slot === PRINTED_BLOCKED_SLOT)
        .map((segment) => segment.edge)
        .sort()
    ).toEqual([1, 2, 3]);

    // The SAME carved slot with a designer per-edge line on an INWARD edge: the
    // line is painted, on top of the retained printed arc.
    const withDesigned = getTileBorderSegments(def, new Set(), {
      ...carved,
      borderEdges: [designedEdge],
      rotation: 0
    }).map((segment) => `${segment.slot}:${segment.edge}`);
    expect(withDesigned).toContain(`${PRINTED_BLOCKED_SLOT}:0`);
    // ...and nothing else beyond the retained arc: not the printed ring's six.
    expect(
      withDesigned.filter((key) => key.startsWith(`${PRINTED_BLOCKED_SLOT}:`)).sort()
    ).toEqual([
      `${PRINTED_BLOCKED_SLOT}:0`,
      `${PRINTED_BLOCKED_SLOT}:1`,
      `${PRINTED_BLOCKED_SLOT}:2`,
      `${PRINTED_BLOCKED_SLOT}:3`
    ]);

    // The mirror encoding of the same physical edge survives too (the old
    // adjacency filter dropped every line TOUCHING the carve, whichever hex
    // owned it). Measured on the ARC-LESS slot so the retained arc cannot mask
    // a regression here.
    const openCarved = { borderlessSlots: new Set([PRINTED_OPEN_SLOT]) };
    expect(getTileBorderSegments(def, new Set(), openCarved).length).toBe(
      getTileBorderSegments(def, new Set(), {
        ...openCarved,
        borderEdges: [canonicalTileEdgeCode(PRINTED_OPEN_SLOT, 0)],
        rotation: 0
      }).length - 1
    );
    const mirrored = getTileBorderSegments(def, new Set(), {
      ...carved,
      borderEdges: [mirrorEdge],
      rotation: 0
    });
    // The retained arc (3, on the carved slot) plus the designer mirror line
    // (1, canonicalized into the NEIGHBOUR slot's frame) — F3 prints no other
    // border, so the whole tile is exactly these four.
    expect(mirrored.length).toBe(4);
    expect(mirrored.some((segment) => segment.slot !== PRINTED_BLOCKED_SLOT)).toBe(true);

    // A designer WHOLE ARC on the carved slot is painted too (all three edges).
    const withArc = getTileBorderSegments(def, new Set([PRINTED_BLOCKED_SLOT]), {
      extraBorders: [PRINTED_BLOCKED_SLOT - 1],
      rotation: 0
    }).filter((segment) => segment.slot === PRINTED_BLOCKED_SLOT);
    expect(withArc.length).toBe(3);
  });
});

sealingDescribe("per-edge designer borders — absolute frame (rotation-independent)", () => {
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

sealingDescribe("per-edge designer borders — face-down + random draw", () => {
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

sealingDescribe("per-edge designer borders — tile discovery", () => {
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

  it("Pathfinding lets the hero DISCOVER a face-down tile across a fully-sealed border (house rule stays ON)", () => {
    const { state, aTile, target, facing } = discoveryFixture();
    const hero = state.heroes.hero_p1;

    // Seal EVERY shared edge (hero side) → not discoverable under the gate.
    aTile.borderEdges = facing.dirs.map((d) => edgeCodeFor(facing.field, aTile, d));
    expect(canHeroDiscoverAdjacentTile(state, hero, target)).toBe(false);

    // Pathfinding crosses yellow borders → discovery is offered AND succeeds,
    // even though `discovery-border-gate` is still ON (the gate itself unchanged).
    grantPathfinding(state, "p1");
    expect(canHeroDiscoverAdjacentTile(state, hero, target)).toBe(true);
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === target.id
      )
    ).toBe(true);
    const revealed = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: target.id
    });
    expect(revealed.errors).toHaveLength(0);
    expect(revealed.state.adventure!.tiles[target.id].faceDown).toBe(false);
  });
});

sealingDescribe("per-edge designer borders — new tile placement", () => {
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
    expect(getTileBorderSegments(openDef, undefined, { borderEdges: [] })).toEqual([]);

    // rotation 0: centre code → slot 0 edge 0; outer (fp2) → slot 2 edge 1.
    const rot0 = getTileBorderSegments(openDef, undefined, { borderEdges: [inner, outer], rotation: 0 }).map(
      (s) => `${s.slot}:${s.edge}`
    );
    expect(rot0).toContain("0:0");
    expect(rot0).toContain("2:1");

    // rotation 2: the draw loop re-adds rotation, so the LOCAL slot/edge shift but
    // (edge+rotation)%6 lands back on the same ABSOLUTE edge. centre → slot 0 edge
    // (0-2+6)%6 = 4; outer fp2 → slot ((2-1-2+6)%6)+1 = 6, edge (1-2+6)%6 = 5.
    const rot2 = getTileBorderSegments(openDef, undefined, { borderEdges: [inner, outer], rotation: 2 }).map(
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
