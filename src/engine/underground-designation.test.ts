import { describe, expect, it } from "vitest";
import { fieldLayer, gateFieldsLinked, instantiateTile, tileLayer } from "./adventure";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  getLegalActions,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  planIsUnderground,
  recomputeSubterraneanGates,
  tileLatticeNeighbors,
  type CustomMapGateLink,
  type CustomMapTilePlan,
  type GameState,
  type HexCoord,
  type MapFieldState,
  type MapTileState
} from "./index";

// ---------------------------------------------------------------------------
// Per-tile UNDERGROUND designation (map designer): a far/near/center/sea tile
// the designer marks `underground` behaves TOPOLOGICALLY like a printed cavern
// — reachable only through a Subterranean Gate, sealed from the Surface at
// every other edge — while KEEPING its band identity (group/back/pools). The
// whole feature rides ONE seam: `planIsUnderground` / `tileLayer`. Every claim
// below carries a CONTROL (the same tile without the flag = plain Surface).
// ---------------------------------------------------------------------------

function adv(state: GameState) {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function makeGame(seed = "underground-designation"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    chooseSubterraneanGate: false
  });
}

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
    delete field.terrain;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

/** A flagged UNDERGROUND far tile — the exact shape setup produces for `plan.underground`. */
function flagUnderground(tile: MapTileState): MapTileState {
  tile.underground = true;
  return tile;
}

function gateHalfTo(state: GameState, towardTileId: string): MapFieldState | undefined {
  return Object.values(adv(state).fields).find(
    (field) => field.location === "subterranean_gate" && field.gateToTileId === towardTileId
  );
}

function tileAllIds(tile: MapTileState): string[] {
  return getTileFootprintSpaceIds(tile);
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

function applyOk(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

// ===========================================================================
// 1) The layer seam: planIsUnderground + tileLayer
// ===========================================================================

describe("underground designation — the layer predicate", () => {
  it("planIsUnderground: flagged far is underground; a plain far twin is Surface (CONTROL)", () => {
    expect(planIsUnderground({ group: "far", underground: true })).toBe(true);
    expect(planIsUnderground({ group: "far" })).toBe(false); // CONTROL — no flag
    // A printed cavern is always underground; the flag is redundant there.
    expect(planIsUnderground({ group: "subterranean" })).toBe(true);
    // v1 exclusions: a starting seat tile is NEVER underground even if flagged.
    expect(planIsUnderground({ group: "starting", underground: true })).toBe(false);
    // near/center/sea all honour the flag.
    for (const group of ["near", "center", "sea"] as const) {
      expect(planIsUnderground({ group, underground: true })).toBe(true);
      expect(planIsUnderground({ group })).toBe(false);
    }
  });

  it("tileLayer reads the flag: a flagged far tile is subterranean, a plain far tile Surface, missing → Surface", () => {
    const state = makeGame();
    const flagged = flagUnderground(instantiateTile(adv(state), "F1", { row: 30, col: 14 }, 0, false));
    const plain = instantiateTile(adv(state), "F2", { row: 36, col: 16 }, 0, false);

    expect(tileLayer(flagged)).toBe("subterranean");
    expect(tileLayer(plain)).toBe("surface"); // CONTROL — same band, no flag
    // Legacy MapTileState without the field is Surface, byte-for-byte as before.
    expect(tileLayer({ group: "far" } as MapTileState)).toBe("surface");
    expect(tileLayer(undefined)).toBe("surface");

    // Field-level layer follows through the tile.
    expect(fieldLayer(state, hexSpaceId({ row: flagged.centerRow, col: flagged.centerCol }))).toBe("subterranean");
    expect(fieldLayer(state, hexSpaceId({ row: plain.centerRow, col: plain.centerCol }))).toBe("surface");
  });
});

// ===========================================================================
// 2) Setup materializes plan.underground onto the tile (face-up AND face-down)
// ===========================================================================

describe("underground designation — setup copies the plan flag onto the tile", () => {
  function tileAt(state: GameState, center: HexCoord): MapTileState {
    const tile = Object.values(adv(state).tiles).find(
      (candidate) => candidate.centerRow === center.row && candidate.centerCol === center.col
    );
    if (!tile) {
      throw new Error(`no tile at ${center.row},${center.col}`);
    }
    return tile;
  }

  it("a flagged far plan builds an underground tile; a plain far plan stays Surface (CONTROL)", () => {
    const start = { row: 24, col: 12 };
    const flaggedCenter = tileLatticeNeighbors(start)[0];
    const plainCenter = tileLatticeNeighbors(start)[1];
    const customMap: CustomMapTilePlan[] = [
      { row: start.row, col: start.col, group: "starting", faceDown: false },
      { row: flaggedCenter.row, col: flaggedCenter.col, group: "far", faceDown: false, tileDefId: "F1", underground: true },
      { row: plainCenter.row, col: plainCenter.col, group: "far", faceDown: false, tileDefId: "F2" }
    ];
    const state = createAdventureGameState({
      seed: "ug-setup",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap,
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });

    const flagged = tileAt(state, flaggedCenter);
    const plain = tileAt(state, plainCenter);
    expect(flagged.underground).toBe(true);
    expect(flagged.group, "keeps its BAND identity").toBe("far");
    expect(tileLayer(flagged)).toBe("subterranean");
    // CONTROL: the plain far twin never gains the flag or the layer.
    expect(plain.underground).toBeUndefined();
    expect(tileLayer(plain)).toBe("surface");
  });

  it("a FACE-DOWN flagged far plan already reads underground before it is discovered", () => {
    const start = { row: 24, col: 12 };
    const flaggedCenter = tileLatticeNeighbors(start)[0];
    const state = createAdventureGameState({
      seed: "ug-facedown",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [
        { row: start.row, col: start.col, group: "starting", faceDown: false },
        { row: flaggedCenter.row, col: flaggedCenter.col, group: "far", faceDown: true, tileDefId: "F1", underground: true }
      ],
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const flagged = tileAt(state, flaggedCenter);
    expect(flagged.faceDown).toBe(true);
    expect(flagged.underground).toBe(true);
    expect(tileLayer(flagged), "the layer holds while still face-down").toBe("subterranean");
  });
});

// ===========================================================================
// 3) Movement: canCrossEdge honours the flagged layer (sealed except a gate)
// ===========================================================================

describe("underground designation — movement obeys the layer divide", () => {
  it("a flagged far tile is sealed from a touching Surface tile except through the carved gate", () => {
    const state = makeGame("ug-move");
    const surfaceCenter = { row: 24, col: 12 };
    const undergroundCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const underground = flagUnderground(instantiateTile(adv(state), "F3", undergroundCenter, 0, false));
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));

    // A gate auto-carved between the flagged tile and the surface tile — exactly
    // as it would for a printed cavern.
    const gate = gateHalfTo(state, underground.id);
    const entrance = gateHalfTo(state, surface.id);
    expect(gate, "a flagged tile auto-pairs a gate like a cavern").toBeDefined();
    expect(entrance).toBeDefined();
    expect(gateFieldsLinked(gate, entrance)).toBe(true);

    // The gate edge crosses both ways…
    expect(canCrossEdge(state, gate!.spaceId, entrance!.spaceId)).toBe(true);
    expect(canCrossEdge(state, entrance!.spaceId, gate!.spaceId)).toBe(true);
    // …but every OTHER cross-layer edge is sealed.
    const others = crossPairs(surface, underground).filter(([a, b]) => !(a === gate!.spaceId && b === entrance!.spaceId));
    expect(others.length).toBeGreaterThan(0);
    for (const [a, b] of others) {
      expect(canCrossEdge(state, a, b), `${a} -> ${b} sealed by the layer divide`).toBe(false);
    }
  });

  it("CONTROL: without the flag the same two Far tiles share an open border (every edge crosses, no gate)", () => {
    const state = makeGame("ug-move-control");
    const surfaceCenter = { row: 24, col: 12 };
    const otherCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const a = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const b = instantiateTile(adv(state), "F3", otherCenter, 0, false); // NO underground flag
    setAllEmpty(state, a);
    setAllEmpty(state, b);
    recomputeSubterraneanGates(adv(state));

    // Two Surface tiles never spawn a gate, and every boundary edge crosses.
    expect(Object.values(adv(state).fields).some((f) => f.location === "subterranean_gate")).toBe(false);
    const pairs = crossPairs(a, b);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [x, y] of pairs) {
      expect(canCrossEdge(state, x, y), `${x} -> ${y} crosses freely`).toBe(true);
    }
  });

  it("flagged↔flagged and flagged↔printed-cavern are the SAME layer: every edge crosses, no gate", () => {
    // Two flagged far tiles.
    const twin = makeGame("ug-twin");
    const c0 = { row: 24, col: 12 };
    const c1 = tileLatticeNeighbors(c0)[0];
    const t0 = flagUnderground(instantiateTile(adv(twin), "F1", c0, 0, false));
    const t1 = flagUnderground(instantiateTile(adv(twin), "F3", c1, 0, false));
    setAllEmpty(twin, t0);
    setAllEmpty(twin, t1);
    recomputeSubterraneanGates(adv(twin));
    expect(Object.values(adv(twin).fields).some((f) => f.location === "subterranean_gate")).toBe(false);
    for (const [x, y] of crossPairs(t0, t1)) {
      expect(canCrossEdge(twin, x, y)).toBe(true);
    }

    // A flagged far tile next to a PRINTED cavern (U1) — also one layer.
    const mixed = makeGame("ug-mixed");
    const m0 = { row: 24, col: 12 };
    const m1 = tileLatticeNeighbors(m0)[0];
    const flagged = flagUnderground(instantiateTile(adv(mixed), "F1", m0, 0, false));
    const cavern = instantiateTile(adv(mixed), "U1", m1, 0, false);
    setAllEmpty(mixed, flagged);
    setAllEmpty(mixed, cavern);
    recomputeSubterraneanGates(adv(mixed));
    expect(Object.values(adv(mixed).fields).some((f) => f.location === "subterranean_gate")).toBe(false);
    // The printed cavern keeps its own outer-arc seals, so not every boundary
    // edge is open — but a layer DIVIDE would seal them ALL. At least one open
    // edge proves the flagged tile shares the cavern's layer (no divide).
    const mixedPairs = crossPairs(flagged, cavern);
    expect(mixedPairs.length).toBeGreaterThan(0);
    expect(mixedPairs.some(([x, y]) => canCrossEdge(mixed, x, y)), "same layer: at least one edge is open").toBe(true);
  });

  it("a hero walks Surface→underground only through the flagged tile's gate", () => {
    const state = makeGame("ug-walk");
    const surfaceCenter = { row: 24, col: 12 };
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    const underground = flagUnderground(instantiateTile(adv(state), "F3", tileLatticeNeighbors(surfaceCenter)[0], 0, false));
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));
    const gate = gateHalfTo(state, underground.id)!;

    const hero = state.heroes.hero_p1;
    hero.spaceId = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });
    hero.movementPoints = 10;
    hero.movementHaltedThisTurn = false;

    const reachable = getReachableHeroPaths(state, hero);
    const reachedUnderground = [...reachable.keys()].filter((id) => fieldLayer(state, id) === "subterranean");
    expect(reachedUnderground.length).toBeGreaterThan(0);
    for (const id of reachedUnderground) {
      expect(reachable.get(id)!.path).toContain(gate.spaceId);
    }
  });
});

// ===========================================================================
// 4) Designed gate links on a flagged plan carve end-to-end
// ===========================================================================

describe("underground designation — designed gate links on a flagged plan", () => {
  function carvedGateHexes(underground: boolean): Set<string> {
    const cavernCenter = { row: 34, col: 20 };
    const surfaceCenter = tileLatticeNeighbors(cavernCenter)[0];
    const gateLinks: CustomMapGateLink[] = [{ surface: { row: surfaceCenter.row, col: surfaceCenter.col } }];
    const customMap: CustomMapTilePlan[] = [
      { row: 24, col: 12, group: "starting", faceDown: false },
      { row: surfaceCenter.row, col: surfaceCenter.col, group: "far", faceDown: false, tileDefId: "F1", rotation: 0 },
      {
        row: cavernCenter.row,
        col: cavernCenter.col,
        group: "far",
        faceDown: false,
        tileDefId: "F3",
        rotation: 0,
        gateLinks,
        ...(underground ? { underground: true } : {})
      }
    ];
    const state = createAdventureGameState({
      seed: "ug-designed-link",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap,
      players: [
        { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    return new Set(
      Object.values(adv(state).fields)
        .filter((field) => field.location === "subterranean_gate")
        .map((field) => field.spaceId)
    );
  }

  it("a flagged plan's gate link carves a real gate; the SAME plan without the flag carves nothing (CONTROL)", () => {
    const withFlag = carvedGateHexes(true);
    expect(withFlag.size, "one gate = two sacrificed hexes").toBe(2);

    // CONTROL: a plain far plan is Surface, so validateCustomMapPlan strips its
    // gateLinks (Surface tiles carry none) and NO gate carves — nothing is sealed.
    const control = carvedGateHexes(false);
    expect(control.size).toBe(0);
  });
});

// ===========================================================================
// 5) Discovery: cross-layer sealing for a face-down flagged tile
// ===========================================================================

describe("underground designation — discovery obeys the divide", () => {
  function refreshHand(state: GameState): GameState {
    return state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
  }

  it("a hero on the Surface cannot discover a face-down flagged tile (and it is not offered); a plain far twin IS", () => {
    let state = makeGame("ug-discover");
    const surfaceCenter = { row: 24, col: 12 };
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
    // The face-down FLAGGED tile and a plain face-down far CONTROL, each touching
    // the surface tile on a different side.
    const flaggedCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const plainCenter = tileLatticeNeighbors(surfaceCenter)[1];
    const flagged = flagUnderground(instantiateTile(adv(state), "F3", flaggedCenter, 0, true));
    const plain = instantiateTile(adv(state), "F5", plainCenter, 0, true);
    setAllEmpty(state, surface);
    recomputeSubterraneanGates(adv(state));

    state = refreshHand(state);
    // Park the hero on a Surface hex touching the flagged tile, but NOT the gate.
    const gateSpaceId = gateHalfTo(state, flagged.id)?.spaceId;
    const flaggedHexes = new Set(tileAllIds(flagged));
    const start = tileAllIds(surface).find((id) => {
      if (id === gateSpaceId) {
        return false;
      }
      const coord = parseHexSpaceId(id)!;
      return hexNeighbors(coord).some((n) => flaggedHexes.has(hexSpaceId(n)));
    })!;
    const hero = state.heroes.hero_p1;
    hero.spaceId = start;
    hero.movementPoints = 5;

    // The flagged tile is NOT offered as a discovery from the Surface.
    const offered = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === flagged.id
    );
    expect(offered, "flagged underground tile is not discoverable from the Surface").toHaveLength(0);

    // …and a forced DISCOVER_TILE is rejected with the layer-divide message.
    const rejected = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: hero.id,
      tileInstanceId: flagged.id
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.errors.some((error) => /Subterranean/i.test(error.message))).toBe(true);

    // CONTROL: a plain face-down far tile touching the same surface IS discoverable.
    const plainHexes = new Set(tileAllIds(plain));
    const nearPlain = tileAllIds(surface).find((id) => {
      const coord = parseHexSpaceId(id)!;
      return hexNeighbors(coord).some((n) => plainHexes.has(hexSpaceId(n)));
    })!;
    hero.spaceId = nearPlain;
    const plainOffered = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === plain.id
    );
    expect(plainOffered.length, "a plain far tile is discoverable from the Surface").toBeGreaterThan(0);
  });

  it("from the underground layer, an adjacent face-down flagged tile discovers normally (same layer, no gate)", () => {
    let state = makeGame("ug-discover-samelayer");
    const here = flagUnderground(instantiateTile(adv(state), "F1", { row: 24, col: 12 }, 0, false));
    const target = flagUnderground(instantiateTile(adv(state), "F3", tileLatticeNeighbors({ row: 24, col: 12 })[0], 0, true));
    setAllEmpty(state, here);

    state = refreshHand(state);
    const heroStart = crossPairs(here, target)[0][0];
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
    // Two underground tiles never spawn a gate between them.
    const after = applyOk(revealed, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: target.id, rotation: 0 });
    expect(Object.values(after.adventure!.fields).some((f) => f.location === "subterranean_gate")).toBe(false);
  });
});
