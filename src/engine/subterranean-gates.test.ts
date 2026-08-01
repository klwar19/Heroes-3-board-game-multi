import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { SUBTERRANEAN_GATE_TOKEN_IMAGES } from "@/data/assets/homm-assets";
import {
  beginFieldVisit,
  fieldLayer,
  gateFieldsLinked,
  instantiateTile,
  recomputeSubterraneanGates,
  subterraneanTileBand,
  tileLayer
} from "./adventure";
import {
  applyAction,
  canCrossEdge,
  classifyHeroStep,
  createAdventureGameState,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  tileCentersAdjacent,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  type GameAction,
  type GameState,
  type HexCoord
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
  // These tests pin the DETERMINISTIC nearest-hex carve (the pick-on-reveal
  // choice OFF) — they exercise the crossing/linking mechanics and double as the
  // mutation control for `subterranean-gate-choice.test.ts`, which drives the
  // default (choice ON) flow where the revealing player picks the hex.
  return createAdventureGameState({
    seed: "subt-gates",
    difficulty: "normal",
    rollFirstPlayer: false,
    chooseSubterraneanGate: false,
    // Isolate the gate crossing/linking mechanic: with the reveal chain now
    // bank-then-gate, a Blocked-Field tile would open a Creature Bank prompt
    // ahead of the gate step. Banks are irrelevant here (the bank↔gate ordering
    // is covered in subterranean-gate-choice.test.ts via revealPastBank), so
    // turn them off to pin the deterministic nearest-hex gate carve.
    creatureBanks: false
  });
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
  it("ships both halves of the page-35 Subterranean Gate Token (surface + underground)", () => {
    // The illustration shows two connecting hexes; each half is its own crop.
    expect(SUBTERRANEAN_GATE_TOKEN_IMAGES.surface).not.toBe(SUBTERRANEAN_GATE_TOKEN_IMAGES.subterranean);
    for (const path of Object.values(SUBTERRANEAN_GATE_TOKEN_IMAGES)) {
      expect(existsSync(`public${path}`)).toBe(true);
    }
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

  it("sacrifices whatever Field is closest — even a Blocked Field or Mine — for both halves", () => {
    const state = makeGame();
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);

    // Bury the entire shared seam under Blocked Fields and a Mine, so the only
    // hexes the token can possibly use are "forbidden" ones. The gate must still
    // form: it covers whatever is closest (the gate IS the field now).
    const seamSurface = [...new Set(crossPairs(surface, underground).map(([s]) => s))];
    const seamUnderground = [...new Set(crossPairs(surface, underground).map(([, u]) => u))];
    expect(seamSurface.length).toBeGreaterThan(0);
    expect(seamUnderground.length).toBeGreaterThan(0);
    seamSurface.forEach((spaceId) => {
      adv(state).fields[spaceId]!.location = "blocked_field";
    });
    seamUnderground.forEach((spaceId, index) => {
      adv(state).fields[spaceId]!.location = index === 0 ? "mine" : "blocked_field";
    });

    recomputeSubterraneanGates(adv(state));

    const gate = gateHalfTo(state, underground.id);
    const entrance = gateHalfTo(state, surface.id);
    expect(gate, "the gate forms even when every seam hex is forbidden").toBeDefined();
    expect(entrance).toBeDefined();
    // Each half landed on a formerly-forbidden seam hex and is now the gate.
    expect(seamSurface).toContain(gate!.spaceId);
    expect(seamUnderground).toContain(entrance!.spaceId);
    expect(gate!.location).toBe("subterranean_gate");
    expect(entrance!.location).toBe("subterranean_gate");
    expect(gateFieldsLinked(gate, entrance)).toBe(true);
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
  it("offers two same-band tiles on gate entry, then rotates and carves the chosen exit", () => {
    let state = makeGame();
    const { surface, underground } = placePair(state, { undergroundUp: false });
    setAllEmpty(state, surface);
    underground.gateTileChoiceEligible = true;
    const currentDef = allTileDefinitions[underground.tileDefId]!;
    const alternate = Object.values(allTileDefinitions).find(
      (def) =>
        def.group === "subterranean" &&
        def.id !== currentDef.id &&
        subterraneanTileBand(def) === subterraneanTileBand(currentDef)
    );
    expect(alternate).toBeDefined();
    adv(state).subterraneanTilePool = [alternate!.id];
    recomputeSubterraneanGates(adv(state));
    const gate = gateHalfTo(state, underground.id)!;

    const hero = state.heroes.hero_p1;
    hero.spaceId = gate.spaceId;
    beginFieldVisit(state, hero.id, gate.spaceId, false);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("subterranean-tile-pick");
    expect(choice?.type === "OPTION_CHOICE" ? choice.subterraneanTilePick?.candidates : null).toEqual([
      currentDef.id,
      alternate!.id
    ]);
    expect(adv(state).tiles[underground.id].faceDown).toBe(true);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: 1
    });
    expect(adv(state).tiles[underground.id].tileDefId).toBe(alternate!.id);
    expect(adv(state).subterraneanTilePool).toContain(currentDef.id);
    expect(adv(state).tiles[underground.id].awaitingRotation).toBe(true);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(underground.id);

    state = applyOk(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: underground.id,
      rotation: 3
    });
    expect(adv(state).tiles[underground.id].rotation).toBe(3);
    const entrance = gateHalfTo(state, surface.id);
    expect(entrance).toBeDefined();
    expect(gateFieldsLinked(adv(state).fields[gate.spaceId], entrance)).toBe(true);
  });

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

    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
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

  it("discovers an adjacent Subterranean tile normally from the Subterranean layer (no gate)", () => {
    // "When under a Subterranean Tile you discover Subterranean Tiles normally":
    // two underground tiles share an ordinary border — no divide, no gate token.
    let state = makeGame();
    const here = instantiateTile(adv(state), "U1", { row: 24, col: 12 }, 0, false);
    const target = instantiateTile(adv(state), "U2", tileLatticeNeighbors({ row: 24, col: 12 })[0], 0, true);
    setAllEmpty(state, here);

    const heroStart = crossPairs(here, target)[0][0];
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    const hero = state.heroes.hero_p1;
    hero.spaceId = heroStart;
    hero.movementPoints = 5;
    expect(fieldLayer(state, hero.spaceId!)).toBe("subterranean");

    const revealed = applyOk(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: hero.id,
      tileInstanceId: target.id
    });
    expect(revealed.adventure!.pendingTileChoice?.tileInstanceId).toBe(target.id);

    const after = applyOk(revealed, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: target.id,
      rotation: 0
    });
    // Two Subterranean tiles never spawn a Subterranean Gate between them.
    expect(Object.values(after.adventure!.fields).some((field) => field.location === "subterranean_gate")).toBe(false);
  });
});

describe("subterranean gate: reverse direction (Subterranean tile up, Surface tile face-down)", () => {
  // The mirror of the forward flow: the entrance is sacrificed on the
  // Subterranean tile first, and the Surface gate is carved only once the
  // Surface tile is revealed (by entering the entrance) and rotated.
  function placeUndergroundUpSurfaceDown(state: GameState): { surface: MapTileState; underground: MapTileState } {
    const undergroundCenter = { row: 24, col: 12 };
    const surfaceCenter = tileLatticeNeighbors(undergroundCenter)[0];
    const underground = instantiateTile(adv(state), "U1", undergroundCenter, 0, false);
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, true);
    return { surface, underground };
  }

  it("carves the entrance toward the still-hidden Surface tile, with no gate half yet", () => {
    const state = makeGame();
    const { surface, underground } = placeUndergroundUpSurfaceDown(state);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));

    const entrance = gateHalfTo(state, surface.id);
    expect(entrance).toBeDefined();
    expect(getTileFootprintSpaceIds(underground)).toContain(entrance!.spaceId);
    expect(entrance!.gateLinkSpaceId).toBeUndefined();
    expect(gateHalfTo(state, underground.id)).toBeUndefined();
    expect(adv(state).tiles[surface.id].faceDown).toBe(true);
  });

  it("reveals the Surface tile for free when a hero enters the entrance, then carves and links the gate", () => {
    const state = makeGame();
    const { surface, underground } = placeUndergroundUpSurfaceDown(state);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));
    const entrance = gateHalfTo(state, surface.id)!;

    const hero = state.heroes.hero_p1;
    hero.spaceId = entrance.spaceId;
    expect(fieldLayer(state, hero.spaceId!)).toBe("subterranean");
    beginFieldVisit(state, hero.id, entrance.spaceId, false);

    // The far (Surface) tile flips up for free, rotation pending.
    expect(adv(state).tiles[surface.id].faceDown).toBe(false);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(surface.id);

    // Lock the first legal rotation; the Surface gate is then carved next to the
    // entrance — even onto F1's Blocked Field / settlement on this seam — and the
    // two halves link into the one crossing.
    let after: GameState | null = null;
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const result = applyAction(state, {
        type: "SET_TILE_ROTATION",
        playerId: "p1",
        tileInstanceId: surface.id,
        rotation
      });
      if (result.errors.length === 0) {
        after = result.state;
        break;
      }
    }
    expect(after, "a legal rotation must complete the gate").not.toBeNull();
    const gate = gateHalfTo(after!, underground.id);
    expect(gate).toBeDefined();
    expect(getTileFootprintSpaceIds(after!.adventure!.tiles[surface.id])).toContain(gate!.spaceId);
    const entranceAfter = after!.adventure!.fields[entrance.spaceId];
    expect(gateFieldsLinked(gate, entranceAfter)).toBe(true);
  });

  it("runs the ore-mine reroll when the Gate reveals a Ⅱ–Ⅲ ore-Mine tile (no dangling visit)", () => {
    const state = makeGame();
    // A face-down Ⅱ–Ⅲ ORE-MINE tile (#F4) waits on the far side of the gate.
    const undergroundCenter = { row: 24, col: 12 };
    const surfaceCenter = tileLatticeNeighbors(undergroundCenter)[0];
    const underground = instantiateTile(adv(state), "U1", undergroundCenter, 0, false);
    const surface = instantiateTile(adv(state), "#F4", surfaceCenter, 0, true);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));
    adv(state).farTilePool = ["F1"]; // a no-mine Settlement is available to reroll into
    adv(state).farTileScriptedDraws = ["F1"];

    const entrance = gateHalfTo(state, surface.id)!;
    const hero = state.heroes.hero_p1;
    hero.spaceId = entrance.spaceId;
    beginFieldVisit(state, hero.id, entrance.spaceId, false);

    // The Ⅱ–Ⅲ tile flips up and the one-time material-mine reroll is offered —
    // exactly like an on-foot discovery — and the completed gate visit is gone
    // (no empty pending visit lingering behind the choice).
    const flip = adv(state).pendingFarTileFlip!;
    expect(flip.via).toBe("reveal");
    expect(flip.offerMode).toBe("mine");
    expect(flip.candidate).toBe("#F4");
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(adv(state).pendingVisit).toBeNull();

    // Reroll once → F1 (no Mine) lands on the SAME slot; the mined def returns to
    // the pool, and the gate carving flow then proceeds as usual.
    const rerolled = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });
    expect(rerolled.adventure!.tiles[surface.id].tileDefId).toBe("F1");
    expect(rerolled.adventure!.farTilePool).toContain("#F4");
    expect(rerolled.adventure!.pendingTileChoice?.tileInstanceId).toBe(surface.id);

    // The freshly chosen tile rotates and the gate completes, as in the plain reveal.
    let after: GameState | null = null;
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const result = applyAction(rerolled, {
        type: "SET_TILE_ROTATION",
        playerId: "p1",
        tileInstanceId: surface.id,
        rotation
      });
      if (result.errors.length === 0) {
        after = result.state;
        break;
      }
    }
    expect(after, "a legal rotation must complete the gate").not.toBeNull();
    expect(gateHalfTo(after!, underground.id)).toBeDefined();
  });
});

describe("subterranean gate: a covered Field becomes unusable — it is the gate now", () => {
  it("turns a guarded gold Mine on the seam into a plain walk-through gate (no guard, resource, flag or income)", () => {
    let state = makeGame();
    const { surface, underground } = placePair(state, { undergroundUp: false });
    setAllEmpty(state, surface);
    // Bury every Surface seam hex under a guarded gold Mine, so the gate has no
    // choice but to cover one of them.
    const seam = [...new Set(crossPairs(surface, underground).map(([surfaceHex]) => surfaceHex))];
    expect(seam.length).toBeGreaterThan(0);
    for (const spaceId of seam) {
      const field = adv(state).fields[spaceId]!;
      field.location = "mine";
      field.difficulty = 5;
      field.resource = "gold";
      field.amount = 5;
    }

    recomputeSubterraneanGates(adv(state));

    const gate = gateHalfTo(state, underground.id)!;
    expect(gate).toBeDefined();
    expect(seam).toContain(gate.spaceId);
    // The Mine is gone: nothing of the old Location survives on the field.
    expect(gate.location).toBe("subterranean_gate");
    expect(gate.difficulty).toBeUndefined();
    expect(gate.resource).toBeUndefined();
    expect(gate.amount).toBeUndefined();
    expect(gate.flagOwnerId).toBeNull();

    // It is an open, walk-through step — not a guard stop.
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    const hero = state.heroes.hero_p1;
    hero.spaceId = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });
    hero.movementPoints = 8;
    hero.movementHaltedThisTurn = false;
    expect(classifyHeroStep(state, hero, gate.spaceId)).toBe("open");

    // Walking onto it does the GATE thing (reveals the far tile) and NONE of the
    // Mine thing: no combat, no flag, no income.
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: hero.id, path: [gate.spaceId] });
    expect(state.combat).toBeFalsy();
    expect(adv(state).fields[gate.spaceId]!.flagOwnerId).toBeNull();
    expect(state.players.p1.resources.gold).toBe(goldBefore);
    expect(adv(state).tiles[underground.id].faceDown).toBe(false);
  });
});

describe("subterranean gate: crossing it with the real move action", () => {
  it("reveals on entry, then carries a hero Surface→gate→entrance→underground in one path", () => {
    let state = makeGame();
    const { surface, underground } = placePair(state, { undergroundUp: false });
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));
    const gate = gateHalfTo(state, underground.id)!;

    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    const surfaceCenter = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });
    const hero = state.heroes.hero_p1;
    hero.spaceId = surfaceCenter;
    hero.movementPoints = 8;
    hero.movementHaltedThisTurn = false;

    // Stepping onto the gate (an ordinary empty field) reveals the far tile for
    // free and pauses the walk for the rotation, exactly like a discovery.
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: hero.id, path: [gate.spaceId] });
    expect(state.heroes.hero_p1.spaceId).toBe(gate.spaceId);
    expect(adv(state).tiles[underground.id].faceDown).toBe(false);
    expect(adv(state).pendingTileChoice?.tileInstanceId).toBe(underground.id);

    state = applyOk(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: underground.id,
      rotation: 0
    });
    const entrance = gateHalfTo(state, surface.id)!;
    expect(entrance).toBeDefined();

    // With the token linked, the hero crosses the whole divide in a single walk.
    state.heroes.hero_p1.spaceId = surfaceCenter;
    state.heroes.hero_p1.movementPoints = 8;
    state.heroes.hero_p1.movementHaltedThisTurn = false;
    const reachable = getReachableHeroPaths(state, state.heroes.hero_p1);
    const dest = [...reachable.keys()].find(
      (spaceId) => fieldLayer(state, spaceId) === "subterranean" && spaceId !== entrance.spaceId
    )!;
    const path = reachable.get(dest)!.path;
    expect(path).toContain(gate.spaceId);
    expect(path).toContain(entrance.spaceId);

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: hero.id, path });
    expect(state.heroes.hero_p1.spaceId).toBe(dest);
    expect(fieldLayer(state, dest)).toBe("subterranean");
  });
});

// ---------------------------------------------------------------------------
// One gate per tile (BINH house rule): a single map tile hosts AT MOST one
// Subterranean Gate Token half. A tile that already opened a gate to one
// neighbour never accepts a second to another — the extra gate is simply never
// carved (and no orphan half is left on the other side either).
// ---------------------------------------------------------------------------
describe("one gate per tile", () => {
  const gatesOn = (state: GameState, tile: MapTileState): MapFieldState[] =>
    getTileFootprintSpaceIds(tile)
      .map((id) => adv(state).fields[id])
      .filter((f): f is MapFieldState => f?.location === "subterranean_gate");

  it("a Surface tile touching TWO caverns still hosts only ONE gate; the second neighbour stays sealed", () => {
    const state = makeGame();
    const a = adv(state);
    const surfaceCenter = { row: 24, col: 12 };
    const [n0, n1] = tileLatticeNeighbors(surfaceCenter);
    const surface = instantiateTile(a, "F1", surfaceCenter, 0, false);
    const cavernA = instantiateTile(a, "U1", n0, 0, false);
    const cavernB = instantiateTile(a, "U2", n1, 0, false);
    setAllEmpty(state, surface);
    setAllEmpty(state, cavernA);
    setAllEmpty(state, cavernB);

    recomputeSubterraneanGates(a);

    // The rule caps the surface tile at one gate even with two cavern neighbours
    // (without it, a distinct gate would carve per neighbour — this would be 2).
    expect(gatesOn(state, surface).length, "surface tile hosts exactly one gate").toBe(1);
    // Exactly one cavern received the matching entrance; the other is left sealed
    // — no orphan half-gate that crosses to nowhere.
    const withEntrance = [cavernA, cavernB].filter((c) => gatesOn(state, c).length > 0);
    const sealed = [cavernA, cavernB].filter((c) => gatesOn(state, c).length === 0);
    expect(withEntrance.length, "one cavern gets the entrance").toBe(1);
    expect(sealed.length, "the other cavern stays sealed").toBe(1);

    // The single carved pair is a real, crossable link both ways; the sealed
    // cavern cannot be entered from the surface tile at all.
    const sGate = gatesOn(state, surface)[0];
    const uGate = gatesOn(state, withEntrance[0])[0];
    expect(gateFieldsLinked(sGate, uGate)).toBe(true);
    expect(canCrossEdge(state, sGate.spaceId, uGate.spaceId)).toBe(true);
    expect(canCrossEdge(state, uGate.spaceId, sGate.spaceId)).toBe(true);
    for (const surfId of getTileFootprintSpaceIds(surface)) {
      for (const cavId of getTileFootprintSpaceIds(sealed[0])) {
        if (hexDistance(parseHexSpaceId(surfId)!, parseHexSpaceId(cavId)!) === 1) {
          expect(canCrossEdge(state, surfId, cavId), "sealed cavern is unreachable").toBe(false);
        }
      }
    }
  });

  it("a cavern touching TWO Surface tiles still hosts only ONE entrance", () => {
    const state = makeGame();
    const a = adv(state);
    const cavernCenter = { row: 24, col: 12 };
    const [n0, n1] = tileLatticeNeighbors(cavernCenter);
    const cavern = instantiateTile(a, "U1", cavernCenter, 0, false);
    const surfaceA = instantiateTile(a, "F1", n0, 0, false);
    const surfaceB = instantiateTile(a, "F2", n1, 0, false);
    setAllEmpty(state, cavern);
    setAllEmpty(state, surfaceA);
    setAllEmpty(state, surfaceB);

    recomputeSubterraneanGates(a);

    expect(gatesOn(state, cavern).length, "cavern hosts exactly one entrance").toBe(1);
    const gatedSurfaces = [surfaceA, surfaceB].filter((s) => gatesOn(state, s).length > 0);
    expect(gatedSurfaces.length, "only one surface tile receives a gate").toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gates form on the TOUCH relation, not the stricter gapless interlock. A
// hand-placed (map designer) cavern that merely shares an edge with a Surface
// tile — one of the 12 distance-3 offsets that touch but leave a hole — used to
// receive NO gate and stay forever unreachable, which is exactly the "I placed
// it next to a Surface tile but can't get in" bug. It must now get a gate.
// ---------------------------------------------------------------------------
describe("subterranean gate from a touching (non-interlocking) placement", () => {
  /** A position whose footprint TOUCHES `anchor` but is NOT an interlocking neighbour. */
  function touchingNonInterlocking(anchor: HexCoord, avoid: HexCoord[]): HexCoord {
    for (let dRow = -4; dRow <= 4; dRow += 1) {
      for (let dCol = -4; dCol <= 4; dCol += 1) {
        const cand = { row: anchor.row + dRow, col: anchor.col + dCol };
        if (avoid.some((other) => Math.abs(other.row - cand.row) < 3 && Math.abs(other.col - cand.col) < 3)) {
          continue;
        }
        if (tileFootprintsTouch(anchor, cand) && !tileCentersAdjacent(anchor, cand)) {
          return cand;
        }
      }
    }
    throw new Error("no touching-non-interlocking position found");
  }

  it("carves and links a gate, and a hero crosses it, even off the gapless sublattice", () => {
    const state = makeGame();
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = touchingNonInterlocking(surfaceCenter, []);
    // Precondition: the two tiles touch but are NOT interlocking neighbours.
    expect(tileFootprintsTouch(surfaceCenter, cavernCenter)).toBe(true);
    expect(tileCentersAdjacent(surfaceCenter, cavernCenter)).toBe(false);

    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const underground = instantiateTile(adv(state), "U1", cavernCenter, 0, false);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);

    recomputeSubterraneanGates(adv(state));

    const gate = gateHalfTo(state, underground.id);
    const entrance = gateHalfTo(state, surface.id);
    expect(gate, "a gate forms for a merely-touching cavern").toBeDefined();
    expect(entrance, "the entrance half forms too").toBeDefined();
    // Both halves sit on their own tiles, edge-to-edge, and are linked as one Field.
    expect(getTileFootprintSpaceIds(surface)).toContain(gate!.spaceId);
    expect(getTileFootprintSpaceIds(underground)).toContain(entrance!.spaceId);
    expect(hexDistance(parseHexSpaceId(gate!.spaceId)!, parseHexSpaceId(entrance!.spaceId)!)).toBe(1);
    expect(gateFieldsLinked(gate, entrance)).toBe(true);

    // The crossing works both ways and is the ONLY way across the divide.
    expect(canCrossEdge(state, gate!.spaceId, entrance!.spaceId)).toBe(true);
    expect(canCrossEdge(state, entrance!.spaceId, gate!.spaceId)).toBe(true);

    // A hero on the Surface tile reaches the underground only through the gate.
    const hero = state.heroes.hero_p1;
    hero.spaceId = hexSpaceId(surfaceCenter);
    hero.movementPoints = 10;
    hero.movementHaltedThisTurn = false;
    const reachable = getReachableHeroPaths(state, hero);
    const undergroundReached = [...reachable.keys()].filter((spaceId) => fieldLayer(state, spaceId) === "subterranean");
    expect(undergroundReached.length).toBeGreaterThan(0);
    for (const spaceId of undergroundReached) {
      expect(reachable.get(spaceId)!.path).toContain(gate!.spaceId);
    }
  });
});
