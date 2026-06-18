import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { LOCATION_TOKEN_IMAGES } from "@/data/assets/homm-assets";
import { locationDefinitions } from "@/data/map/locations";
import {
  beginFieldVisit,
  fieldLayer,
  gateFieldsLinked,
  instantiateTile,
  recomputeSubterraneanGates,
  tileLayer
} from "./adventure";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  tileFootprint,
  tileLatticeNeighbors,
  type GameAction,
  type GameState
} from "./index";
import { openDimensionDoorChoice } from "./adventure-reducer";
import type { AdventureState, MapFieldState, MapTileState } from "./state";

// ---------------------------------------------------------------------------
// Subterranean Map Tiles & Gates (Stronghold expansion, rulebook p.34)
//
// A Subterranean Gate Token sacrifices the Surface tile's hex nearest the
// underground tile (the gate) and the underground tile's hex nearest that gate
// (the entrance, carved once the tile is revealed "when open"). The two halves
// are "one Field": the only Surface↔Subterranean crossing. Otherwise the two
// layers are sealed off from each other.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "subt-gates", difficulty: "normal", rollFirstPlayer: false });
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

/**
 * Places a Surface tile (F1) and an adjacent Subterranean tile (U1) on a patch
 * of empty lattice well clear of the skirmish layout, so the only gate the
 * recompute can find is the one between them.
 */
function placePair(
  state: GameState,
  options: { surfaceUp?: boolean; undergroundUp?: boolean } = {}
): { surface: MapTileState; underground: MapTileState } {
  const surfaceUp = options.surfaceUp ?? true;
  const undergroundUp = options.undergroundUp ?? true;
  const surfaceCenter = { row: 24, col: 12 };
  const undergroundCenter = tileLatticeNeighbors(surfaceCenter)[0];
  const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, !surfaceUp);
  const underground = instantiateTile(adv(state), "U1", undergroundCenter, 0, !undergroundUp);
  return { surface, underground };
}

function tileAllIds(tile: MapTileState): string[] {
  return tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 0).map(hexSpaceId);
}

function tileRingIds(tile: MapTileState): string[] {
  return tileAllIds(tile).slice(1);
}

/** Wipes a tile's fields to plain empty land, so gate placement is unambiguous. */
function setAllEmpty(state: GameState, tile: MapTileState): void {
  for (const spaceId of getTileFootprintSpaceIds(tile)) {
    const field = adv(state).fields[spaceId];
    if (!field) {
      continue;
    }
    field.location = "empty_field";
    delete field.difficulty;
    delete field.resource;
    delete field.amount;
    delete field.faction;
    delete field.terrain;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

/** Adjacent (distance-1) hex pairs that straddle the boundary of two tiles. */
function crossPairs(a: MapTileState, b: MapTileState): [string, string][] {
  const bHexes = new Set(tileAllIds(b));
  const pairs: [string, string][] = [];
  for (const aId of tileAllIds(a)) {
    const coord = parseHexSpaceId(aId);
    if (!coord) {
      continue;
    }
    for (const neighbor of hexNeighbors(coord)) {
      const neighborId = hexSpaceId(neighbor);
      if (bHexes.has(neighborId)) {
        pairs.push([aId, neighborId]);
      }
    }
  }
  return pairs;
}

function gateHalfTo(state: GameState, towardTileId: string): MapFieldState | undefined {
  return Object.values(adv(state).fields).find(
    (field) => field.location === "subterranean_gate" && field.gateToTileId === towardTileId
  );
}

describe("subterranean gate token art", () => {
  it("ships the rulebook's Subterranean Gate token art and maps the gate location to it", () => {
    const path = LOCATION_TOKEN_IMAGES.subterranean_gate;
    expect(path).toBe("/assets/board/tokens/subterranean-gate.webp");
    // The cropped rulebook token is actually on disk under public/.
    expect(existsSync(`public${path}`)).toBe(true);
  });
});

describe("subterranean layer detection", () => {
  it("treats only group:subterranean tiles as the underground (not cave-themed Surface art)", () => {
    const state = makeGame();
    // F2 is a core Far tile with terrain:"subterranean" art but a Far back — it
    // lives on the Surface and must not be mistaken for the underground.
    const cave = instantiateTile(adv(state), "F2", { row: 30, col: 14 }, 0, false);
    expect(allTileDefinitions.F2.terrain).toBe("subterranean");
    expect(tileLayer(cave)).toBe("surface");
    expect(fieldLayer(state, hexSpaceId({ row: cave.centerRow, col: cave.centerCol }))).toBe("surface");

    const underground = instantiateTile(adv(state), "U1", { row: 36, col: 16 }, 0, false);
    expect(tileLayer(underground)).toBe("subterranean");
    expect(fieldLayer(state, hexSpaceId({ row: underground.centerRow, col: underground.centerCol }))).toBe("subterranean");
  });
});

describe("subterranean gate placement", () => {
  it("carves the gate on the closest Surface hex and the entrance on the adjacent underground hex, and links them", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);

    recomputeSubterraneanGates(adv(state));

    const surfaceGates = Object.values(adv(state).fields).filter(
      (field) => field.location === "subterranean_gate" && field.gateToTileId === underground.id
    );
    const undergroundGates = Object.values(adv(state).fields).filter(
      (field) => field.location === "subterranean_gate" && field.gateToTileId === surface.id
    );
    // Exactly one Token: one gate half on each tile.
    expect(surfaceGates).toHaveLength(1);
    expect(undergroundGates).toHaveLength(1);

    const gate = surfaceGates[0];
    const entrance = undergroundGates[0];

    // The gate sits on the Surface tile, the entrance on the underground tile.
    expect(getTileFootprintSpaceIds(surface)).toContain(gate.spaceId);
    expect(getTileFootprintSpaceIds(underground)).toContain(entrance.spaceId);

    // The two halves are edge-to-edge and linked as one Field.
    expect(hexDistance(parseHexSpaceId(gate.spaceId)!, parseHexSpaceId(entrance.spaceId)!)).toBe(1);
    expect(gateFieldsLinked(gate, entrance)).toBe(true);

    // "1 slot closest of the adjacent map to the subterranean tile": the gate is
    // the Surface ring hex nearest the underground centre (of those touching it).
    const undergroundCenter = { row: underground.centerRow, col: underground.centerCol };
    const undergroundHexes = new Set(tileAllIds(underground));
    const touching = tileRingIds(surface).filter((id) => {
      const coord = parseHexSpaceId(id);
      return coord !== null && hexNeighbors(coord).some((n) => undergroundHexes.has(hexSpaceId(n)));
    });
    const nearest = Math.min(...touching.map((id) => hexDistance(parseHexSpaceId(id)!, undergroundCenter)));
    expect(hexDistance(parseHexSpaceId(gate.spaceId)!, undergroundCenter)).toBe(nearest);
  });

  it("never sacrifices a Blocked Field, Mine, or Town to a gate", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    // Keep U1's real fields (it has a Mine and a Blocked Field) but clear the
    // Surface tile so the gate side is unconstrained.
    setAllEmpty(state, surface);

    recomputeSubterraneanGates(adv(state));

    const entrance = gateHalfTo(state, surface.id);
    expect(entrance, "an entrance should still be placeable around the forbidden fields").toBeDefined();

    // The entrance never lands on a forbidden slot of the underground tile.
    const def = allTileDefinitions[underground.tileDefId];
    const forbidden = new Set(["mine", "settlement", "town", "random_town", "grail", "dragon_utopia"]);
    const entranceLocation = def.fields[entrance!.slot].location;
    expect(forbidden.has(entranceLocation)).toBe(false);
    expect(locationDefinitions[entranceLocation]?.category).not.toBe("blocked");

    // The original Blocked Field and Mine are untouched (still themselves).
    for (const spaceId of getTileFootprintSpaceIds(underground)) {
      const field = adv(state).fields[spaceId]!;
      const original = def.fields[field.slot].location;
      if (original === "blocked_field" || original === "mine") {
        expect(field.location).toBe(original);
      }
    }
  });

  it("is idempotent: re-running never moves or duplicates a gate", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);

    recomputeSubterraneanGates(adv(state));
    const firstGate = gateHalfTo(state, underground.id)!.spaceId;
    const firstEntrance = gateHalfTo(state, surface.id)!.spaceId;

    recomputeSubterraneanGates(adv(state));
    recomputeSubterraneanGates(adv(state));

    const gates = Object.values(adv(state).fields).filter((field) => field.location === "subterranean_gate");
    expect(gates).toHaveLength(2);
    expect(gateHalfTo(state, underground.id)!.spaceId).toBe(firstGate);
    expect(gateHalfTo(state, surface.id)!.spaceId).toBe(firstEntrance);
  });
});

describe("subterranean layer movement", () => {
  it("crosses only through the linked gate, never any other Surface↔Subterranean edge", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));

    const gate = gateHalfTo(state, underground.id)!;
    const entrance = gateHalfTo(state, surface.id)!;

    // The gate edge is crossable in both directions.
    expect(canCrossEdge(state, gate.spaceId, entrance.spaceId)).toBe(true);
    expect(canCrossEdge(state, entrance.spaceId, gate.spaceId)).toBe(true);

    // Every other hex pair that straddles the two tiles is sealed.
    const otherCrossings = crossPairs(surface, underground).filter(
      ([a, b]) => !(a === gate.spaceId && b === entrance.spaceId)
    );
    expect(otherCrossings.length).toBeGreaterThan(0);
    for (const [a, b] of otherCrossings) {
      expect(canCrossEdge(state, a, b), `${a} -> ${b} must be sealed`).toBe(false);
    }

    // Same-layer movement is unaffected: two adjacent Surface hexes still cross.
    const surfaceCenter = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });
    const surfaceRing = tileRingIds(surface)[0];
    expect(canCrossEdge(state, surfaceCenter, surfaceRing)).toBe(true);
  });

  it("lets a hero walk from the Surface into the underground, but only via the gate", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));

    const gate = gateHalfTo(state, underground.id)!;
    const entrance = gateHalfTo(state, surface.id)!;

    const hero = state.heroes.hero_p1;
    hero.spaceId = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });
    hero.movementPoints = 8;
    hero.movementHaltedThisTurn = false;

    const reachable = getReachableHeroPaths(state, hero);

    // The entrance is reachable, and the only way there runs through the gate.
    const toEntrance = reachable.get(entrance.spaceId);
    expect(toEntrance).toBeDefined();
    expect(toEntrance!.path).toContain(gate.spaceId);

    // Every reachable underground field was reached by crossing the gate, and
    // the hero actually gets past the entrance into the underground proper.
    const undergroundReached = [...reachable.keys()].filter((spaceId) => fieldLayer(state, spaceId) === "subterranean");
    expect(undergroundReached.length).toBeGreaterThan(1);
    for (const spaceId of undergroundReached) {
      expect(reachable.get(spaceId)!.path).toContain(gate.spaceId);
    }
  });
});

describe("subterranean layer: card movement effects cannot breach the divide", () => {
  it("Fly / Angel Wings cannot cross any non-gate Surface↔Subterranean edge, even onto a blocked hex", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));

    const gate = gateHalfTo(state, underground.id)!;
    const entrance = gateHalfTo(state, surface.id)!;
    const fly = { moveThrough: true, waterWalk: true };

    // The gate tunnel stays crossable; nothing else across the divide opens.
    expect(canCrossEdge(state, gate.spaceId, entrance.spaceId, fly)).toBe(true);
    const otherCrossings = crossPairs(surface, underground).filter(
      ([a, b]) => !(a === gate.spaceId && b === entrance.spaceId)
    );
    expect(otherCrossings.length).toBeGreaterThan(0);
    for (const [a, b] of otherCrossings) {
      expect(canCrossEdge(state, a, b, fly), `Fly must not cross ${a} -> ${b}`).toBe(false);
    }

    // Even a blocked hex on the far layer stays unreachable to a flyer (the
    // layer divide is checked before the move-through-blocked rule).
    const [surfaceHex, undergroundHex] = otherCrossings[0];
    adv(state).fields[undergroundHex]!.location = "blocked_field";
    expect(canCrossEdge(state, surfaceHex, undergroundHex, fly)).toBe(false);
  });

  it("Dimension Door cannot target a field on the other layer", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));

    const hero = state.heroes.hero_p1;
    hero.spaceId = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });

    // A generous range so the underground tile is comfortably within hex reach.
    openDimensionDoorChoice(state, "p1", 10);
    const choice = state.pendingChoice;
    const destinations = choice?.type === "OPTION_CHOICE" ? (choice.dimensionDoor?.destinations ?? []) : [];

    // Sanity: underground fields really are within straight-line range, so it is
    // the layer filter — not distance — that keeps them out.
    const undergroundHexes = getTileFootprintSpaceIds(underground);
    expect(
      undergroundHexes.some((id) => hexDistance(parseHexSpaceId(hero.spaceId!)!, parseHexSpaceId(id)!) <= 10)
    ).toBe(true);

    // Destinations exist, and every one stays on the hero's Surface layer.
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.every((spaceId) => fieldLayer(state, spaceId) === "surface")).toBe(true);
  });
});

describe("subterranean tile discovery", () => {
  it("discovers the far tile for free when a hero enters the gate, then carves the entrance", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state, { undergroundUp: false });
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));

    // The Surface gate exists already (closest hex to the still face-down tile),
    // but there is no entrance and no link yet — the underground tile is hidden.
    const gate = gateHalfTo(state, underground.id);
    expect(gate).toBeDefined();
    expect(gate!.gateLinkSpaceId).toBeUndefined();
    expect(gateHalfTo(state, surface.id)).toBeUndefined();
    expect(adv(state).tiles[underground.id].faceDown).toBe(true);

    // A hero enters the gate: the far tile is revealed for free (rotation pending).
    const hero = state.heroes.hero_p1;
    hero.spaceId = gate!.spaceId;
    beginFieldVisit(state, hero.id, gate!.spaceId, false);

    expect(adv(state).tiles[underground.id].faceDown).toBe(false);
    expect(adv(state).tiles[underground.id].awaitingRotation).toBe(true);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(underground.id);

    // Locking the rotation materializes the tile and carves the entrance.
    const after = applyOk(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: underground.id,
      rotation: 0
    });

    const entrance = gateHalfTo(after, surface.id);
    expect(entrance).toBeDefined();
    const gateAfter = after.adventure!.fields[gate!.spaceId];
    expect(gateFieldsLinked(gateAfter, entrance)).toBe(true);
  });

  it("forbids discovering a Subterranean tile while standing on the Surface (and vice versa)", () => {
    let state = makeGame();
    const { surface, underground } = placePair(state, { undergroundUp: false });
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));

    // A Surface hex sitting right against the face-down underground tile.
    const heroStart = crossPairs(surface, underground)[0][0];
    const undergroundId = underground.id;

    state = state.players.p1.needsHandRefresh
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    const hero = state.heroes.hero_p1;
    hero.spaceId = heroStart;
    hero.movementPoints = 5;

    const result = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: hero.id,
      tileInstanceId: undergroundId
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((error) => /Subterranean/i.test(error.message))).toBe(true);
  });
});
