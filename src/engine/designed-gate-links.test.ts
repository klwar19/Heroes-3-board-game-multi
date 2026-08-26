import { describe, expect, it } from "vitest";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  getReachableHeroPaths,
  getLegalActions,
  getScenario,
  getTileFootprintSpaceIds,
  hexDistance,
  hexSpaceId,
  legalGateHexPairs,
  parseHexSpaceId,
  planSubterraneanGates,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  validateCustomMapPlan,
  type CustomMapTilePlan,
  type GameState,
  type HexCoord,
  type MapFieldState,
  type MapTileState
} from "./index";
import {
  fieldLayer,
  gateFieldsLinked,
  instantiateTile,
  isFieldGuarded,
  recomputeSubterraneanGates
} from "./adventure";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Designer-chosen Subterranean Gate links (map designer, map-scoped). USER RULE:
// a gate connects two TILES, not two fixed FIELDS —
//  - the designer connects a chosen underground tile to a chosen Surface tile,
//    incl. ONE cavern to SEVERAL Surface tiles (bypassing one-gate-per-tile);
//  - the editor gate/entrance position is DECORATIVE: at play the exact field is
//    chosen by the revealing player (pick-on-reveal), or carved at the automatic
//    nearest hex for a tile that is face-up from setup (no chooser fires there);
//  - a directly-seeded PINNED plan (legacy) still carves silently at its hex;
//  - two links to the SAME tile pair collapse to ONE gate.
// ---------------------------------------------------------------------------

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function twoPlayerGame(customMap: CustomMapTilePlan[]): GameState {
  return createAdventureGameState({
    seed: "designed-gate",
    difficulty: "normal",
    rollFirstPlayer: false,
    customMap,
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

function gateHalfTo(state: GameState, towardTileId: string): MapFieldState | undefined {
  return Object.values(adv(state).fields).find(
    (field) => field.location === "subterranean_gate" && field.gateToTileId === towardTileId
  );
}

function tileIdAt(state: GameState, center: HexCoord): string {
  const tile = Object.values(adv(state).tiles).find(
    (candidate) => candidate.centerRow === center.row && candidate.centerCol === center.col
  );
  if (!tile) {
    throw new Error(`no tile at ${center.row},${center.col}`);
  }
  return tile.id;
}

function gatesOnTile(state: GameState, center: HexCoord): MapFieldState[] {
  const tile = Object.values(adv(state).tiles).find(
    (candidate) => candidate.centerRow === center.row && candidate.centerCol === center.col
  );
  if (!tile) {
    return [];
  }
  return getTileFootprintSpaceIds(tile)
    .map((id) => adv(state).fields[id])
    .filter((field): field is MapFieldState => field?.location === "subterranean_gate");
}

// A cluster around row 24 sits clear of the skirmish seats (rows 6-12).
const TOWN = { row: 24, col: 12 };
const FAR = tileLatticeNeighbors(TOWN)[0];

/** A cavern position that touches FAR (with ≥2 legal boundary pairs) but not the town. */
function cavernNextToFar(): HexCoord {
  const touchingScan: HexCoord[] = [];
  for (let dRow = -4; dRow <= 4; dRow += 1) {
    for (let dCol = -4; dCol <= 4; dCol += 1) {
      const cand = { row: FAR.row + dRow, col: FAR.col + dCol };
      if (tileFootprintsTouch(FAR, cand) && !tileCentersAdjacent(FAR, cand)) {
        touchingScan.push(cand);
      }
    }
  }
  for (const cand of [...tileLatticeNeighbors(FAR), ...touchingScan]) {
    if (cand.row === TOWN.row && cand.col === TOWN.col) {
      continue;
    }
    if (tileCentersOverlap(cand, TOWN) || tileCentersOverlap(cand, FAR) || tileFootprintsTouch(cand, TOWN)) {
      continue;
    }
    if (legalGateHexPairs(FAR, cand).length >= 2) {
      return cand;
    }
  }
  throw new Error("no suitable cavern next to FAR");
}

type HexPair = { gateHex: HexCoord; entranceHex: HexCoord };

/** Two boundary pairs sharing NO hex (so both can carve their own gate), or null. */
function twoDisjointPairs(pairs: HexPair[]): [HexPair, HexPair] | null {
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = i + 1; j < pairs.length; j += 1) {
      const hexes = new Set([
        hexSpaceId(pairs[i].gateHex),
        hexSpaceId(pairs[i].entranceHex),
        hexSpaceId(pairs[j].gateHex),
        hexSpaceId(pairs[j].entranceHex)
      ]);
      if (hexes.size === 4) {
        return [pairs[i], pairs[j]];
      }
    }
  }
  return null;
}

/** A cavern touching FAR (clear of the town) whose shared edge has ≥2 DISJOINT pairs. */
function cavernNextToFarWithDisjointPairs(): { cavern: HexCoord; pairs: [HexPair, HexPair] } {
  const scan: HexCoord[] = [];
  for (let dRow = -4; dRow <= 4; dRow += 1) {
    for (let dCol = -4; dCol <= 4; dCol += 1) {
      const cand = { row: FAR.row + dRow, col: FAR.col + dCol };
      if (tileFootprintsTouch(FAR, cand) && !tileCentersAdjacent(FAR, cand)) {
        scan.push(cand);
      }
    }
  }
  for (const cand of [...tileLatticeNeighbors(FAR), ...scan]) {
    if (cand.row === TOWN.row && cand.col === TOWN.col) {
      continue;
    }
    if (tileCentersOverlap(cand, TOWN) || tileCentersOverlap(cand, FAR) || tileFootprintsTouch(cand, TOWN)) {
      continue;
    }
    const disjoint = twoDisjointPairs(legalGateHexPairs(FAR, cand));
    if (disjoint) {
      return { cavern: cand, pairs: disjoint };
    }
  }
  throw new Error("no cavern next to FAR with two disjoint boundary pairs");
}

describe("designed gate links — the editor position is DECORATIVE (gates connect tiles)", () => {
  it("connects the two tiles and a hero can cross; the editor pin is NOT honoured (auto position wins) — CONTROL for the old pinned behaviour", () => {
    const cavern = cavernNextToFar();

    // The position the game ACTUALLY uses for these two tiles (the automatic
    // nearest-hex pairing) — a face-up designer tile is carved here at setup.
    const autoGates = planSubterraneanGates([
      { row: TOWN.row, col: TOWN.col, group: "starting" },
      { row: FAR.row, col: FAR.col, group: "far" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ]);
    expect(autoGates).toHaveLength(1);
    const autoGateHexId = hexSpaceId(autoGates[0].gateHex);

    // A legal boundary pair whose gate hex DIFFERS from the auto default. USER RULE:
    // the editor position is decorative, so pinning it must make NO difference — the
    // gate still carves at the auto position (the mutation check: it fails if the
    // old "carve at the pin" behaviour returns).
    const pinned = legalGateHexPairs(FAR, cavern).find((pair) => hexSpaceId(pair.gateHex) !== autoGateHexId);
    expect(pinned, "a non-default legal boundary pair exists").toBeTruthy();
    const pinnedGateId = hexSpaceId(pinned!.gateHex);
    const pinnedEntranceId = hexSpaceId(pinned!.entranceHex);
    expect(pinnedGateId).not.toBe(autoGateHexId);

    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: [{ surface: { row: FAR.row, col: FAR.col }, gateHex: pinnedGateId, entranceHex: pinnedEntranceId }]
      }
    ];
    const state = twoPlayerGame(customMap);
    const surfaceId = tileIdAt(state, FAR);
    const cavernId = tileIdAt(state, cavern);

    const gate = gateHalfTo(state, cavernId); // surface half → cavern
    const entrance = gateHalfTo(state, surfaceId); // cavern half → surface
    expect(gate, "surface gate carved").toBeDefined();
    expect(entrance, "cavern entrance carved").toBeDefined();
    // The AUTOMATIC position — NOT the decorative editor pin.
    expect(gate!.spaceId).toBe(autoGateHexId);
    expect(gate!.spaceId).not.toBe(pinnedGateId);

    // What matters is that the two TILES are connected: the halves are one Field
    // and the divide is crossable both ways.
    expect(gateFieldsLinked(gate, entrance)).toBe(true);
    expect(canCrossEdge(state, gate!.spaceId, entrance!.spaceId)).toBe(true);
    expect(canCrossEdge(state, entrance!.spaceId, gate!.spaceId)).toBe(true);

    // A hero standing on the surface gate reaches the underground ONLY via the
    // crossing (the observable outcome).
    const hero = state.heroes.hero_p1;
    hero.spaceId = gate!.spaceId;
    hero.movementPoints = 8;
    hero.movementHaltedThisTurn = false;
    const reachable = getReachableHeroPaths(state, hero);
    const undergroundReached = [...reachable.keys()].filter((id) => fieldLayer(state, id) === "subterranean");
    expect(undergroundReached.length).toBeGreaterThan(0);
    for (const id of undergroundReached) {
      expect(reachable.get(id)!.path).toContain(entrance!.spaceId);
    }
  });
});

// A designer that has placed NO Town tiles keeps the scenario's DEFAULT SEATS as
// the Surface tiles (`hasDesignerStarts` false in the UI). Dragging the AUTOMATIC
// gate on such a seat writes a gate link whose `surface` IS the seat centre. The
// whole chain must accept that: validation keys off `scenario.layout.starts` when
// no starting plan is placed, and setup resolves the seat's own home tile so the
// designed gate carves at the pinned hexes — exactly like a link to a placed
// Surface tile. This case has no prior coverage (every other test places a Town).

/** A cavern touching `seat` with ≥2 legal boundary pairs, clear of the `avoid` seats. */
function cavernNextToSeat(seat: HexCoord, avoid: HexCoord[]): HexCoord {
  const touchingScan: HexCoord[] = [];
  for (let dRow = -4; dRow <= 4; dRow += 1) {
    for (let dCol = -4; dCol <= 4; dCol += 1) {
      const cand = { row: seat.row + dRow, col: seat.col + dCol };
      if (tileFootprintsTouch(seat, cand) && !tileCentersAdjacent(seat, cand)) {
        touchingScan.push(cand);
      }
    }
  }
  for (const cand of [...tileLatticeNeighbors(seat), ...touchingScan]) {
    if (tileCentersOverlap(cand, seat)) {
      continue;
    }
    // Steer clear of the other live seat so no competing auto-gate / overlap forms.
    if (avoid.some((other) => tileCentersOverlap(cand, other) || tileFootprintsTouch(cand, other))) {
      continue;
    }
    if (legalGateHexPairs(seat, cand).length >= 2) {
      return cand;
    }
  }
  throw new Error("no suitable cavern next to the seat");
}

describe("designed gate links — a scenario SEAT surface (no designer Town tiles)", () => {
  it("carves a seat↔cavern gate at the DESIGNED hexes when the surface is a default seat", () => {
    // Two players → seats 0 and 1 instantiate; link the cavern to seat 1 and keep
    // it clear of seat 0.
    const seats = getScenario("skirmish").layout.starts;
    const seat = seats[1];
    const cavern = cavernNextToSeat(seat, [seats[0]]);

    // The automatic seat↔cavern pairing WOULD carve here (no designed link) — the
    // control the pinned hexes must diverge from.
    const autoGates = planSubterraneanGates([
      { row: seat.row, col: seat.col, group: "starting" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ]);
    expect(autoGates).toHaveLength(1);
    const autoGateHexId = hexSpaceId(autoGates[0].gateHex);

    // A legal boundary pair whose gate hex DIFFERS from the auto default (the
    // mutation check: the assertions fail if the pinned seat link is ignored).
    const pinned = legalGateHexPairs(seat, cavern).find((pair) => hexSpaceId(pair.gateHex) !== autoGateHexId);
    expect(pinned, "a non-default legal boundary pair exists").toBeTruthy();
    const pinnedGateId = hexSpaceId(pinned!.gateHex);
    const pinnedEntranceId = hexSpaceId(pinned!.entranceHex);

    // NO starting plan — the seats come from scenario.layout.starts (the exact
    // state the designer is in before dragging any Town tile in). The cavern's
    // gate link names the SEAT centre as its Surface partner.
    const customMap: CustomMapTilePlan[] = [
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: [{ surface: { row: seat.row, col: seat.col }, gateHex: pinnedGateId, entranceHex: pinnedEntranceId }]
      }
    ];
    const state = twoPlayerGame(customMap);
    const surfaceId = tileIdAt(state, seat); // the seat's own home tile
    const cavernId = tileIdAt(state, cavern);

    const gate = gateHalfTo(state, cavernId); // seat (surface) half → cavern
    const entrance = gateHalfTo(state, surfaceId); // cavern half → seat
    expect(gate, "seat-surface gate carved").toBeDefined();
    expect(entrance, "cavern entrance carved").toBeDefined();
    // A face-up seat never passes through the reveal chooser, so its designed gate
    // is carved at setup — at the AUTOMATIC position, NOT the decorative editor pin.
    expect(gate!.spaceId).toBe(autoGateHexId);
    expect(gate!.spaceId).not.toBe(pinnedGateId);
    void pinnedEntranceId;

    // One Field, crossable both ways — the seat truly opens onto the cavern.
    expect(gateFieldsLinked(gate, entrance)).toBe(true);
    expect(canCrossEdge(state, gate!.spaceId, entrance!.spaceId)).toBe(true);
    expect(canCrossEdge(state, entrance!.spaceId, gate!.spaceId)).toBe(true);
  });
});

describe("designed gate links — one cavern to TWO Surface tiles", () => {
  it("carves BOTH gates (crossable); CONTROL: the same layout without links carves only ONE", () => {
    const cavernCenter = { row: 24, col: 12 };
    const [surfA, surfB] = tileLatticeNeighbors(cavernCenter);
    // Precondition: both surfaces touch the cavern (so a gate CAN form to each).
    expect(tileFootprintsTouch(cavernCenter, surfA)).toBe(true);
    expect(tileFootprintsTouch(cavernCenter, surfB)).toBe(true);

    const surfaceTiles: CustomMapTilePlan[] = [
      { row: surfA.row, col: surfA.col, group: "far", faceDown: false, tileDefId: "F1" },
      { row: surfB.row, col: surfB.col, group: "far", faceDown: false, tileDefId: "F2" }
    ];
    const cavernPlan: CustomMapTilePlan = {
      row: cavernCenter.row,
      col: cavernCenter.col,
      group: "subterranean",
      faceDown: false,
      tileDefId: "U1"
    };

    // CONTROL: no designed links → one-gate-per-tile leaves exactly one gate.
    const controlState = twoPlayerGame([...surfaceTiles, cavernPlan]);
    expect(gatesOnTile(controlState, cavernCenter), "one gate per tile without designed links").toHaveLength(1);

    // Designed: link the cavern to BOTH surfaces → two gate halves on the cavern.
    const linkedState = twoPlayerGame([
      ...surfaceTiles,
      {
        ...cavernPlan,
        gateLinks: [{ surface: { row: surfA.row, col: surfA.col } }, { surface: { row: surfB.row, col: surfB.col } }]
      }
    ]);
    const surfAId = tileIdAt(linkedState, surfA);
    const surfBId = tileIdAt(linkedState, surfB);

    // The cavern hosts TWO distinct entrance halves — one toward each surface.
    const cavernGates = gatesOnTile(linkedState, cavernCenter);
    expect(cavernGates, "designed links lift the one-gate-per-tile cap").toHaveLength(2);
    expect(new Set(cavernGates.map((field) => field.spaceId)).size).toBe(2);

    // Both crossings are real and linked — one gate half on each surface, its
    // partner among the cavern's two entrance halves.
    for (const [surface, surfaceId] of [
      [surfA, surfAId],
      [surfB, surfBId]
    ] as const) {
      const surfaceGate = gatesOnTile(linkedState, surface)[0];
      const entrance = cavernGates.find((field) => field.gateToTileId === surfaceId);
      expect(surfaceGate, `surface ${surface.row},${surface.col} carved a gate`).toBeDefined();
      expect(entrance, "cavern entrance toward that surface").toBeDefined();
      expect(gateFieldsLinked(surfaceGate, entrance)).toBe(true);
      expect(canCrossEdge(linkedState, surfaceGate.spaceId, entrance!.spaceId)).toBe(true);
    }
  });
});

describe("designed gate links — one cavern to FIVE Surface tiles (over the old cap of 4)", () => {
  it("carves ALL FIVE gates (fails if the 4-link cap returns)", () => {
    // A cavern far from the fixed town, linking five of its six interlocking
    // neighbours — all touch it, none overlap each other or the town. The retired
    // cap of 4 would have trimmed the 5th link; here every one must carve.
    const cavernCenter = { row: 40, col: 24 };
    expect(tileFootprintsTouch(cavernCenter, TOWN)).toBe(false);
    const neighbors = tileLatticeNeighbors(cavernCenter).filter(
      (neighbor) => !tileCentersOverlap(neighbor, TOWN) && !tileFootprintsTouch(neighbor, TOWN)
    );
    expect(neighbors.length, "≥5 touching surfaces clear of the town").toBeGreaterThanOrEqual(5);
    const surfaces = neighbors.slice(0, 5);
    for (const surface of surfaces) {
      expect(tileFootprintsTouch(cavernCenter, surface)).toBe(true);
    }

    const surfaceTiles: CustomMapTilePlan[] = surfaces.map((surface, index) => ({
      row: surface.row,
      col: surface.col,
      group: "far",
      faceDown: false,
      tileDefId: `F${index + 1}`
    }));
    const state = twoPlayerGame([
      ...surfaceTiles,
      {
        row: cavernCenter.row,
        col: cavernCenter.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: surfaces.map((surface) => ({ surface: { row: surface.row, col: surface.col } }))
      }
    ]);

    const cavernId = tileIdAt(state, cavernCenter);
    const cavernGates = gatesOnTile(state, cavernCenter);
    expect(cavernGates, "all five designed links carve — the 5th is NOT trimmed").toHaveLength(5);
    expect(new Set(cavernGates.map((field) => field.spaceId)).size, "five distinct entrance hexes").toBe(5);
    // Each surface carries its own gate, linked to a distinct cavern entrance.
    for (const surface of surfaces) {
      const surfaceId = tileIdAt(state, surface);
      const surfaceGate = gatesOnTile(state, surface)[0];
      const entrance = cavernGates.find((field) => field.gateToTileId === surfaceId);
      expect(surfaceGate, `surface ${surface.row},${surface.col} carved a gate`).toBeDefined();
      expect(entrance, `cavern entrance toward ${surface.row},${surface.col}`).toBeDefined();
      expect(surfaceGate.gateToTileId).toBe(cavernId);
      expect(gateFieldsLinked(surfaceGate, entrance)).toBe(true);
      expect(canCrossEdge(state, surfaceGate.spaceId, entrance!.spaceId)).toBe(true);
    }
  });
});

describe("designed gate links — the SAME Surface tile linked twice collapses to ONE gate", () => {
  it("two links to the same surface produce ONE gate (positions decorative); CONTROL: unpinned duplicates also collapse", () => {
    const { cavern, pairs } = cavernNextToFarWithDisjointPairs();
    const [first, second] = pairs;
    const base: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" }
    ];
    const cavernPlan = { row: cavern.row, col: cavern.col, group: "subterranean" as const, faceDown: false, tileDefId: "U1" };

    // USER RULE: a gate connects two TILES, so at most one gate per tile pair. Two
    // links to the SAME surface — even at distinct editor positions — collapse to
    // ONE gate (the old "two gates on one edge" behaviour is gone).
    const twoGateState = twoPlayerGame([
      ...base,
      {
        ...cavernPlan,
        gateLinks: [
          { surface: { row: FAR.row, col: FAR.col }, gateHex: hexSpaceId(first.gateHex), entranceHex: hexSpaceId(first.entranceHex) },
          { surface: { row: FAR.row, col: FAR.col }, gateHex: hexSpaceId(second.gateHex), entranceHex: hexSpaceId(second.entranceHex) }
        ]
      }
    ]);
    const surfaceId = tileIdAt(twoGateState, FAR);
    const cavernId = tileIdAt(twoGateState, cavern);
    const surfaceGates = gatesOnTile(twoGateState, FAR);
    const cavernGates = gatesOnTile(twoGateState, cavern);
    expect(surfaceGates, "one gate on the shared surface edge").toHaveLength(1);
    expect(cavernGates, "one entrance on the cavern").toHaveLength(1);
    // The one gate is a real, linked crossing between the two tiles.
    expect(surfaceGates[0].gateToTileId).toBe(cavernId);
    expect(cavernGates[0].gateToTileId).toBe(surfaceId);
    expect(gateFieldsLinked(surfaceGates[0], cavernGates[0])).toBe(true);
    expect(canCrossEdge(twoGateState, surfaceGates[0].spaceId, cavernGates[0].spaceId)).toBe(true);

    // CONTROL: two UNPINNED links to the same surface also collapse to ONE gate.
    const mergedState = twoPlayerGame([
      ...base,
      {
        ...cavernPlan,
        gateLinks: [{ surface: { row: FAR.row, col: FAR.col } }, { surface: { row: FAR.row, col: FAR.col } }]
      }
    ]);
    expect(gatesOnTile(mergedState, cavern), "two unpinned same-surface links merge to one gate").toHaveLength(1);
  });

  it("drops the sibling whose pinned pair COLLIDES, keeps the first, and reports it", () => {
    const scenario = getScenario("skirmish");
    const cavern = cavernNextToFar();
    const first = legalGateHexPairs(FAR, cavern)[0];
    const gateHex = hexSpaceId(first.gateHex);
    const entranceHex = hexSpaceId(first.entranceHex);
    const { accepted, problems, warnings } = validateCustomMapPlan(
      [
        { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
        {
          row: cavern.row,
          col: cavern.col,
          group: "subterranean",
          faceDown: false,
          tileDefId: "U1",
          gateLinks: [
            { surface: { row: FAR.row, col: FAR.col }, gateHex, entranceHex }, // kept
            { surface: { row: FAR.row, col: FAR.col }, gateHex, entranceHex } // same editor hex → overlap → dropped
          ]
        }
      ],
      scenario
    );
    const cav = accepted.find((plan) => plan.group === "subterranean");
    expect(cav?.gateLinks, "the sibling still carves; the overlapping one is dropped").toHaveLength(1);
    expect(cav!.gateLinks![0].gateHex).toBe(gateHex);
    // USER RULE: gate-link issues are non-fatal WARNINGS (the map still plays), never
    // blocking problems — the editor position is decorative, so an overlap is harmless.
    expect(problems, "no blocking problem").toHaveLength(0);
    expect(warnings.some((message) => /overlaps another gate/i.test(message))).toBe(true);
    expect(warnings.some((message) => message.includes(gateHex)), "the warning names the overlapping hex").toBe(true);
  });
});

describe("designed gate links — validation", () => {
  it("drops a link to a non-touching / absent Surface tile with a problem, keeping the rest", () => {
    const scenario = getScenario("skirmish");
    const cavernCenter = { row: 24, col: 12 };
    const touching = tileLatticeNeighbors(cavernCenter)[0];
    const faraway = { row: cavernCenter.row + 14, col: cavernCenter.col + 9 };
    expect(tileFootprintsTouch(cavernCenter, faraway)).toBe(false);
    const absent = { row: 40, col: 40 };

    const { accepted, problems, warnings } = validateCustomMapPlan(
      [
        { row: touching.row, col: touching.col, group: "far", faceDown: false, tileDefId: "F1" },
        // A real Surface tile that is placed but does NOT touch the cavern.
        { row: faraway.row, col: faraway.col, group: "far", faceDown: false, tileDefId: "F2" },
        {
          row: cavernCenter.row,
          col: cavernCenter.col,
          group: "subterranean",
          faceDown: false,
          tileDefId: "U1",
          gateLinks: [
            { surface: { row: touching.row, col: touching.col } }, // valid — touches
            { surface: { row: faraway.row, col: faraway.col } }, // placed but not touching → drop
            { surface: { row: absent.row, col: absent.col } } // no tile there at all → drop
          ]
        }
      ],
      scenario
    );

    const cavern = accepted.find((plan) => plan.group === "subterranean");
    expect(cavern, "the cavern plan is still accepted").toBeDefined();
    // Only the touching link survives.
    expect(cavern!.gateLinks).toHaveLength(1);
    expect(cavern!.gateLinks![0].surface).toEqual({ row: touching.row, col: touching.col });
    // USER RULE: both bad links are NON-FATAL WARNINGS (the cavern tile still makes
    // it into the game), never blocking problems.
    expect(problems, "no blocking problem").toHaveLength(0);
    expect(warnings.some((message) => /do not touch/i.test(message))).toBe(true);
    expect(warnings.some((message) => /no Surface tile is placed/i.test(message))).toBe(true);
  });
});

// --- Reveal flow: a fully-pinned designed link opens NO pick-on-reveal choice --
// Reuses the harness shape from subterranean-gate-choice.test.ts.

function makeChoiceGame(): GameState {
  let state = createAdventureGameState({
    seed: "designed-gate-reveal",
    difficulty: "normal",
    rollFirstPlayer: false,
    chooseSubterraneanGate: true,
    // Isolate the designed-gate reveal/choice: the reveal chain is now
    // bank-then-gate, so a Blocked-Field tile would open a Creature Bank prompt
    // ahead of the gate step. Banks are irrelevant to designed-link carving
    // (the bank↔gate ordering is covered in subterranean-gate-choice.test.ts),
    // so turn them off to reach the gate step directly.
    creatureBanks: false
  });
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    const result = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state = result.state;
  }
  return state;
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
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

function revealTile(state: GameState, tileId: string, playerId = "p1"): GameState {
  const tile = adv(state).tiles[tileId];
  tile.faceDown = false;
  tile.awaitingRotation = true;
  adv(state).pendingTileChoice = { tileInstanceId: tileId, playerId, kind: "reveal" };
  for (const rotation of [0, 1, 2, 3, 4, 5]) {
    const result = applyAction(state, { type: "SET_TILE_ROTATION", playerId, tileInstanceId: tileId, rotation });
    if (result.errors.length === 0) {
      return result.state;
    }
  }
  throw new Error(`no legal rotation revealed ${tileId}`);
}

const gatePlacementChoice = (state: GameState): boolean =>
  state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "subterranean-gate-placement";

describe("designed gate links — reveal opens NO pick-on-reveal choice", () => {
  /** Face-DOWN surface + face-up cavern, plus the non-default gate hex pair. */
  function setup(): { surface: MapTileState; cavern: MapTileState; pinnedGateId: string; state: GameState } {
    const state = makeChoiceGame();
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, true); // face-down
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, false); // face-up
    setAllEmpty(state, cavern);

    const pairs = legalGateHexPairs(surfaceCenter, cavernCenter);
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    // The nearest gate hex the auto path would use, so we pin a DIFFERENT one.
    const autoGateId = hexSpaceId(
      planSubterraneanGates([
        { row: surfaceCenter.row, col: surfaceCenter.col, group: "starting" },
        { row: cavernCenter.row, col: cavernCenter.col, group: "subterranean" }
      ])[0].gateHex
    );
    const pinned = pairs.find((pair) => hexSpaceId(pair.gateHex) !== autoGateId)!;
    return { surface, cavern, pinnedGateId: hexSpaceId(pinned.gateHex), state };
  }

  it("a pinned designed link carves silently at the DESIGNED hex; CONTROL: no link → the choice opens", () => {
    // CONTROL: with the choice ON and no designed link, revealing the surface
    // opens the pick-on-reveal gate choice.
    const control = setup();
    const controlRevealed = revealTile(control.state, control.surface.id);
    expect(gatePlacementChoice(controlRevealed), "no designed link → the player is asked").toBe(true);

    // Designed: seed a designed plan pinning the surface gate hex.
    const pinnedGame = setup();
    adv(pinnedGame.state).gatePlans = [
      {
        surfaceTileId: pinnedGame.surface.id,
        undergroundTileId: pinnedGame.cavern.id,
        gateHex: pinnedGame.pinnedGateId,
        designed: true
      }
    ];
    const revealed = revealTile(pinnedGame.state, pinnedGame.surface.id);
    // No choice — the designer decided.
    expect(gatePlacementChoice(revealed), "a pinned designed link opens NO choice").toBe(false);
    // …and the gate carved on the DESIGNED hex (not the auto nearest).
    const gate = gateHalfTo(revealed, pinnedGame.cavern.id);
    expect(gate, "the gate carved automatically").toBeDefined();
    expect(gate!.spaceId).toBe(pinnedGame.pinnedGateId);
    // The crossing is complete and linked (the cavern was already face-up).
    const entrance = gateHalfTo(revealed, pinnedGame.surface.id);
    expect(entrance).toBeDefined();
    expect(gateFieldsLinked(gate, entrance)).toBe(true);
    expect(hexDistance(parseHexSpaceId(gate!.spaceId)!, parseHexSpaceId(entrance!.spaceId)!)).toBe(1);
  });

  it("TWO same-surface pinned designed gates collapse to ONE gate on reveal — no choice opens", () => {
    const state = makeChoiceGame();
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, true); // face-down
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, false); // face-up
    setAllEmpty(state, cavern);

    const disjoint = twoDisjointPairs(legalGateHexPairs(surfaceCenter, cavernCenter));
    expect(disjoint, "the shared edge has two disjoint boundary pairs").toBeTruthy();
    const [first, second] = disjoint!;
    adv(state).gatePlans = [
      {
        surfaceTileId: surface.id,
        undergroundTileId: cavern.id,
        gateHex: hexSpaceId(first.gateHex),
        entranceHex: hexSpaceId(first.entranceHex),
        designed: true
      },
      {
        surfaceTileId: surface.id,
        undergroundTileId: cavern.id,
        gateHex: hexSpaceId(second.gateHex),
        entranceHex: hexSpaceId(second.entranceHex),
        designed: true
      }
    ];

    const revealed = revealTile(state, surface.id);
    // Both pinned — no pick-on-reveal choice opens.
    expect(gatePlacementChoice(revealed), "a pinned designed gate opens NO choice").toBe(false);
    // USER RULE: a gate connects two TILES, so two plans for the SAME pair collapse
    // to ONE gate — at the FIRST plan's hex. (The second is a redundant duplicate.)
    const surfaceGates = getTileFootprintSpaceIds(surface)
      .map((id) => adv(revealed).fields[id])
      .filter((field): field is MapFieldState => field?.location === "subterranean_gate");
    expect(surfaceGates, "same-pair duplicates collapse to one gate").toHaveLength(1);
    expect(surfaceGates[0].spaceId).toBe(hexSpaceId(first.gateHex));
    void second;
    // It is a real linked crossing to the cavern.
    const gate = surfaceGates[0];
    expect(gate.gateToTileId).toBe(cavern.id);
    const entrance = adv(revealed).fields[gate.gateLinkSpaceId ?? ""];
    expect(entrance?.location).toBe("subterranean_gate");
    expect(canCrossEdge(revealed, gate.spaceId, entrance!.spaceId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// USER RULE — a designer gate is POSITIONED AT PLAY: when a linked tile is
// discovered face-down, the revealing player fixes the gate field (pick-on-reveal),
// and a tile linked to SEVERAL tiles fixes EACH gate in turn (goal 7). These are
// the tests that fail if the play-time positioning / draining is removed.
// ---------------------------------------------------------------------------

function resolveGateChoice(state: GameState, optionIndex: number, playerId = "p1"): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "subterranean-gate-placement") {
    throw new Error("no gate placement choice open");
  }
  const result = applyAction(state, { type: "CHOOSE_OPTION", playerId, choiceId: choice.id, optionIndex });
  expect(result.errors, "resolving the gate choice is legal").toHaveLength(0);
  return result.state;
}

describe("designed gate links — positioned at PLAY, each gate in turn", () => {
  it("a designed link discovered FACE-DOWN opens the pick-on-reveal choice; CONTROL: chooser off → auto-carve, no prompt", () => {
    const surfaceCenter = { row: 24, col: 12 };
    const cavernCenter = tileLatticeNeighbors(surfaceCenter)[0];
    expect(legalGateHexPairs(cavernCenter, surfaceCenter).length, "≥2 boundary positions").toBeGreaterThanOrEqual(2);

    // Surface face-up, cavern face-down: revealing the cavern lets the player fix
    // the entrance field. The link is UNPINNED (positions decorative).
    const state = makeChoiceGame();
    const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false); // face-up
    setAllEmpty(state, surface);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true); // face-down
    adv(state).gatePlans = [{ surfaceTileId: surface.id, undergroundTileId: cavern.id, designed: true }];

    const revealed = revealTile(state, cavern.id);
    expect(gatePlacementChoice(revealed), "the player is asked where the gate goes").toBe(true);
    const placed = resolveGateChoice(revealed, 0);
    expect(gatePlacementChoice(placed), "no further prompt after the single gate").toBe(false);
    const entrance = gateHalfTo(placed, surface.id); // cavern half → surface
    const gate = gateHalfTo(placed, cavern.id); // surface half → cavern
    expect(entrance, "entrance carved at the chosen field").toBeDefined();
    expect(gate, "surface gate completed").toBeDefined();
    expect(gateFieldsLinked(gate, entrance)).toBe(true);
    expect(canCrossEdge(placed, entrance!.spaceId, gate!.spaceId)).toBe(true);

    // CONTROL: with the chooser OFF the same link auto-carves at the nearest hex
    // with NO prompt (the deterministic path).
    const controlState = makeChoiceGame();
    const cSurface = instantiateTile(adv(controlState), "F1", surfaceCenter, 0, false);
    setAllEmpty(controlState, cSurface);
    const cCavern = instantiateTile(adv(controlState), "U1", cavernCenter, 0, true);
    adv(controlState).chooseGatePlacement = false;
    adv(controlState).gatePlans = [{ surfaceTileId: cSurface.id, undergroundTileId: cCavern.id, designed: true }];
    const cRevealed = revealTile(controlState, cCavern.id);
    expect(gatePlacementChoice(cRevealed), "chooser off → no prompt").toBe(false);
    expect(gateHalfTo(cRevealed, cSurface.id), "auto-carved entrance").toBeDefined();
  });

  it("a cavern linked to TWO surfaces positions EACH gate in turn (goal 7)", () => {
    const cavernCenter = { row: 24, col: 12 };
    const [surfA, surfB] = tileLatticeNeighbors(cavernCenter);
    expect(legalGateHexPairs(cavernCenter, surfA).length).toBeGreaterThanOrEqual(2);
    expect(legalGateHexPairs(cavernCenter, surfB).length).toBeGreaterThanOrEqual(2);

    const state = makeChoiceGame();
    const sa = instantiateTile(adv(state), "F1", surfA, 0, false); // face-up
    const sb = instantiateTile(adv(state), "F2", surfB, 0, false); // face-up
    setAllEmpty(state, sa);
    setAllEmpty(state, sb);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true); // face-down
    adv(state).gatePlans = [
      { surfaceTileId: sa.id, undergroundTileId: cavern.id, designed: true },
      { surfaceTileId: sb.id, undergroundTileId: cavern.id, designed: true }
    ];

    // Reveal the cavern → the FIRST gate choice opens.
    let s = revealTile(state, cavern.id);
    expect(gatePlacementChoice(s), "first gate choice opens").toBe(true);
    // Resolving it opens the SECOND gate choice — each gate positioned in turn.
    s = resolveGateChoice(s, 0);
    expect(gatePlacementChoice(s), "second gate choice opens after the first is fixed").toBe(true);
    // Resolving the second leaves NO further prompt.
    s = resolveGateChoice(s, 0);
    expect(gatePlacementChoice(s), "both gates positioned — no third prompt").toBe(false);

    // Two entrance halves on the cavern, one toward each surface, both crossable.
    const cavernGates = gatesOnTile(s, cavernCenter);
    expect(cavernGates, "both designed gates positioned at play").toHaveLength(2);
    for (const surfaceId of [sa.id, sb.id]) {
      const entrance = cavernGates.find((field) => field.gateToTileId === surfaceId);
      expect(entrance, `entrance toward ${surfaceId}`).toBeDefined();
      const surfaceGate = adv(s).fields[entrance!.gateLinkSpaceId ?? ""];
      expect(surfaceGate?.location, "linked surface gate").toBe("subterranean_gate");
      expect(canCrossEdge(s, entrance!.spaceId, surfaceGate!.spaceId)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// USER RULE 2026-08-26 — "When I enter the tile that has 2 gates (and both can
// be positioned) I should ALSO be able to place the exit of MY Gate — then I
// choose the other gate." A cavern designer-linked to two Surface tiles that BOTH
// already carry their gate half owes TWO *completing* entrances. Before the fix
// only the first (by partner tile centre) was offered: the recompute that carved
// that pick auto-carved the sibling entrance at the nearest hex, so half the
// crossings were never the player's — and the one offered was not necessarily the
// gate the hero had walked through.
// ---------------------------------------------------------------------------

describe("designed gate links — a tile owing TWO completing gates positions BOTH, own gate first", () => {
  const CAVERN: HexCoord = { row: 24, col: 12 };

  /** Surface gate hexes toward `cavernCenter` that have ≥2 cavern-side partners. */
  function multiEntranceGateHexes(surfaceCenter: HexCoord, cavernCenter: HexCoord): Map<string, string[]> {
    const byGate = new Map<string, Set<string>>();
    for (const pair of legalGateHexPairs(surfaceCenter, cavernCenter)) {
      const gate = hexSpaceId(pair.gateHex);
      if (!byGate.has(gate)) {
        byGate.set(gate, new Set());
      }
      byGate.get(gate)!.add(hexSpaceId(pair.entranceHex));
    }
    const out = new Map<string, string[]>();
    for (const [gate, entrances] of byGate) {
      if (entrances.size >= 2) {
        out.set(gate, [...entrances]);
      }
    }
    return out;
  }

  /**
   * Two Surface centres touching {@link CAVERN}, each with a PINNED gate hex whose
   * cavern-side partners number two — so each COMPLETING "path up" really is a
   * choice — and whose partner sets are disjoint, so the second pick is never
   * squeezed out by the first carve.
   */
  function twoCompletingLayout(): [{ center: HexCoord; gateHex: string }, { center: HexCoord; gateHex: string }] {
    const options: { center: HexCoord; gateHex: string; entrances: string[] }[] = [];
    for (let dRow = -5; dRow <= 5; dRow += 1) {
      for (let dCol = -5; dCol <= 5; dCol += 1) {
        const center = { row: CAVERN.row + dRow, col: CAVERN.col + dCol };
        if (tileCentersOverlap(center, CAVERN) || !tileFootprintsTouch(CAVERN, center)) {
          continue;
        }
        for (const [gateHex, entrances] of multiEntranceGateHexes(center, CAVERN)) {
          options.push({ center, gateHex, entrances });
        }
      }
    }
    for (let i = 0; i < options.length; i += 1) {
      for (let j = i + 1; j < options.length; j += 1) {
        const [a, b] = [options[i], options[j]];
        if (tileCentersOverlap(a.center, b.center) || a.gateHex === b.gateHex) {
          continue;
        }
        if (a.entrances.some((hex) => b.entrances.includes(hex))) {
          continue;
        }
        return [
          { center: a.center, gateHex: a.gateHex },
          { center: b.center, gateHex: b.gateHex }
        ];
      }
    }
    throw new Error("no two-completing-gate layout found");
  }

  /**
   * Cavern face-DOWN between two face-up Surface tiles, each designer-linked to it
   * and each already carrying its own gate half at a PINNED hex (as it would after
   * those tiles were revealed and their gates positioned). Revealing the cavern
   * therefore owes two "path up" exits, each with two legal hexes.
   */
  function twoCompletingSetup(chooser: boolean): {
    state: GameState;
    sa: MapTileState;
    sb: MapTileState;
    cavern: MapTileState;
    cavernCenter: HexCoord;
  } {
    const [planA, planB] = twoCompletingLayout();
    const state = makeChoiceGame();
    if (!chooser) {
      adv(state).chooseGatePlacement = false;
    }
    const sa = instantiateTile(adv(state), "F1", planA.center, 0, false); // face-up
    const sb = instantiateTile(adv(state), "F2", planB.center, 0, false); // face-up
    setAllEmpty(state, sa);
    setAllEmpty(state, sb);
    const cavern = instantiateTile(adv(state), "U1", CAVERN, 0, true); // face-down
    adv(state).gatePlans = [
      { surfaceTileId: sa.id, undergroundTileId: cavern.id, designed: true, gateHex: planA.gateHex },
      { surfaceTileId: sb.id, undergroundTileId: cavern.id, designed: true, gateHex: planB.gateHex }
    ];
    // Both Surface halves carve at their pinned hexes; the cavern is face-down so
    // neither "path up" exists yet.
    recomputeSubterraneanGates(adv(state));
    for (const [surface, pinned] of [
      [sa, planA.gateHex],
      [sb, planB.gateHex]
    ] as const) {
      const halves = gatesOnTile(state, { row: surface.centerRow, col: surface.centerCol }).filter(
        (field) => field.gateToTileId === cavern.id
      );
      expect(halves.map((field) => field.spaceId), `${surface.id} carries its designed gate half`).toEqual([pinned]);
    }
    expect(gatesOnTile(state, CAVERN), "no path up before the cavern is revealed").toHaveLength(0);
    return { state, sa, sb, cavern, cavernCenter: CAVERN };
  }

  /** The cavern's entrance half pointing at `surfaceTileId`, if it exists. */
  function entranceToward(state: GameState, cavernCenter: HexCoord, surfaceTileId: string): MapFieldState | undefined {
    return gatesOnTile(state, cavernCenter).find((field) => field.gateToTileId === surfaceTileId);
  }

  function gateChoiceData(state: GameState) {
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "subterranean-gate-placement") {
      throw new Error("no gate placement choice open");
    }
    return choice.subterraneanGate!;
  }

  it("offers a pick for EACH gate — the one the hero came through first — and both exits land on the player's hexes", () => {
    // CONTROL (chooser OFF): the same layout auto-carves BOTH entrances at their
    // nearest hexes with no prompt at all. Those hexes are the defaults each of the
    // choice run's picks must diverge from.
    const control = twoCompletingSetup(false);
    const controlRevealed = revealTile(control.state, control.cavern.id);
    expect(gatePlacementChoice(controlRevealed), "chooser off → no prompt").toBe(false);
    const autoEntrance = new Map<string, string>();
    for (const surfaceId of [control.sa.id, control.sb.id]) {
      const entrance = entranceToward(controlRevealed, control.cavernCenter, surfaceId);
      expect(entrance, `auto entrance toward ${surfaceId}`).toBeDefined();
      autoEntrance.set(surfaceId, entrance!.spaceId);
    }

    // The hero stands on surface B's gate half — that is "my Gate".
    const { state, sa, sb, cavern, cavernCenter } = twoCompletingSetup(true);
    const myGate = gatesOnTile(state, { row: sb.centerRow, col: sb.centerCol }).find(
      (field) => field.gateToTileId === cavern.id
    )!;
    state.heroes.hero_p1.spaceId = myGate.spaceId;

    let s = revealTile(state, cavern.id);
    expect(gatePlacementChoice(s), "the first path-up pick opens").toBe(true);
    const first = gateChoiceData(s);
    expect(
      first.candidates.every((candidate) => candidate.surfaceTileId === sb.id),
      "the gate the hero walked through is positioned FIRST"
    ).toBe(true);
    const firstPick = first.candidates.findIndex((candidate) => candidate.hex !== autoEntrance.get(sb.id));
    expect(firstPick, "a non-default candidate for my own gate").toBeGreaterThanOrEqual(0);
    const myHex = first.candidates[firstPick].hex;
    s = resolveGateChoice(s, firstPick);

    // THE FIX: the OTHER gate is offered too, instead of being carved at the nearest hex.
    expect(gatePlacementChoice(s), "the second gate is offered as well").toBe(true);
    const second = gateChoiceData(s);
    expect(
      second.candidates.every((candidate) => candidate.surfaceTileId === sa.id),
      "the second pick is the other gate"
    ).toBe(true);
    const secondPick = second.candidates.findIndex((candidate) => candidate.hex !== autoEntrance.get(sa.id));
    expect(secondPick, "a non-default candidate for the other gate").toBeGreaterThanOrEqual(0);
    const otherHex = second.candidates[secondPick].hex;
    s = resolveGateChoice(s, secondPick);
    expect(gatePlacementChoice(s), "both gates positioned — no third prompt").toBe(false);

    // Both entrances sit on the hexes the PLAYER chose (neither on the auto default)…
    const mine = entranceToward(s, cavernCenter, sb.id);
    const other = entranceToward(s, cavernCenter, sa.id);
    expect(mine!.spaceId, "my gate's exit is on my pick").toBe(myHex);
    expect(other!.spaceId, "the other gate's exit is on my pick").toBe(otherHex);
    expect(otherHex).not.toBe(autoEntrance.get(sa.id));
    expect(myHex).not.toBe(autoEntrance.get(sb.id));
    // …and both are real, crossable crossings.
    for (const [surfaceTileId, entrance] of [
      [sa.id, other],
      [sb.id, mine]
    ] as const) {
      const surfaceGate = adv(s).fields[entrance!.gateLinkSpaceId ?? ""];
      expect(surfaceGate?.location, `linked surface gate on ${surfaceTileId}`).toBe("subterranean_gate");
      expect(canCrossEdge(s, entrance!.spaceId, surfaceGate!.spaceId)).toBe(true);
    }
    expect(gatesOnTile(s, cavernCenter), "two entrances on the cavern").toHaveLength(2);
  });

  it("CONTROL: with the hero on the OTHER gate, that one is positioned first", () => {
    const { state, sa, cavern } = twoCompletingSetup(true);
    const myGate = gatesOnTile(state, { row: sa.centerRow, col: sa.centerCol }).find(
      (field) => field.gateToTileId === cavern.id
    )!;
    state.heroes.hero_p1.spaceId = myGate.spaceId;
    const s = revealTile(state, cavern.id);
    expect(gatePlacementChoice(s)).toBe(true);
    expect(gateChoiceData(s).candidates.every((candidate) => candidate.surfaceTileId === sa.id)).toBe(true);
  });

  it("CONTROL: a LONE completing designed gate is still positioned in one pick and carved (no stranding)", () => {
    const [planA] = twoCompletingLayout();
    const cavernCenter = CAVERN;
    const state = makeChoiceGame();
    const sa = instantiateTile(adv(state), "F1", planA.center, 0, false);
    setAllEmpty(state, sa);
    const cavern = instantiateTile(adv(state), "U1", cavernCenter, 0, true);
    adv(state).gatePlans = [
      { surfaceTileId: sa.id, undergroundTileId: cavern.id, designed: true, gateHex: planA.gateHex }
    ];
    recomputeSubterraneanGates(adv(state));

    let s = revealTile(state, cavern.id);
    expect(gatePlacementChoice(s), "the lone completing gate is offered").toBe(true);
    const chosen = gateChoiceData(s).candidates[0].hex;
    s = resolveGateChoice(s, 0);
    expect(gatePlacementChoice(s), "no second prompt for a single gate").toBe(false);
    const entrance = entranceToward(s, cavernCenter, sa.id);
    expect(entrance, "the entrance really carved — the defer never strands it").toBeDefined();
    expect(entrance!.spaceId).toBe(chosen);
    const surfaceGate = adv(s).fields[entrance!.gateLinkSpaceId ?? ""];
    expect(surfaceGate?.location).toBe("subterranean_gate");
    expect(canCrossEdge(s, entrance!.spaceId, surfaceGate!.spaceId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Designer guards on the two gate halves: fight to step ON from your own layer,
// SLIP PAST when crossing OUT through the linked half — a per-travel bonus that
// leaves the guard standing (2026-08-07 user rule: "no combat on the other side
// -> true, but it's a one time bonus. If you stay and then enter later (or
// someone else) there is a fight"). It used to clearCustomGuard the exit, so
// the first traveller destroyed a designer guard for the whole table forever.
// ---------------------------------------------------------------------------

describe("designed gate links — guarded halves", () => {
  function guardedGateGame(): {
    state: GameState;
    gate: MapFieldState;
    entrance: MapFieldState;
  } {
    const cavern = cavernNextToFar();
    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: [
          {
            surface: { row: FAR.row, col: FAR.col },
            gateGuard: { level: 4 },
            entranceGuard: { units: ["neutral.troglodytes"] }
          }
        ]
      }
    ];
    const state = twoPlayerGame(customMap);
    const surfaceId = tileIdAt(state, FAR);
    const cavernId = tileIdAt(state, cavern);
    const gate = gateHalfTo(state, cavernId)!;
    const entrance = gateHalfTo(state, surfaceId)!;
    expect(gate, "surface gate carved").toBeDefined();
    expect(entrance, "cavern entrance carved").toBeDefined();
    return { state, gate, entrance };
  }

  it("carve stamps BOTH designed guards (level on the gate, exact army on the entrance)", () => {
    const { gate, entrance } = guardedGateGame();
    expect(gate.difficulty).toBe(4);
    expect(entrance.customGuardUnits).toEqual(["neutral.troglodytes"]);
    expect(entrance.difficulty).toBe(1); // one bronze body → Ⅰ
  });

  /** Clear the opening hand gates so MOVE_HERO is legal for `activeId`. */
  function openTable(state: GameState, activeId: string): void {
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = activeId as typeof state.activePlayerId;
  }

  /** Park `heroId` on `spaceId` with a full stride, ready to step. */
  function park(state: GameState, heroId: string, spaceId: string, movement = 4): void {
    const hero = state.heroes[heroId]!;
    hero.spaceId = spaceId as NonNullable<typeof hero.spaceId>;
    hero.movementPoints = movement;
    hero.movementHaltedThisTurn = false;
  }

  function move(state: GameState, playerId: string, heroId: string, to: string): GameState {
    const result = applyAction(state, {
      type: "MOVE_HERO",
      playerId: playerId as never,
      heroId: heroId as never,
      to: to as never
    });
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    return result.state;
  }

  /** An open, unguarded same-layer hex on the gate's own tile, adjacent to it. */
  function approachHexFor(state: GameState, gateSpaceId: string): string {
    const tile = Object.values(adv(state).tiles).find(
      (candidate) => candidate.id === adv(state).fields[gateSpaceId]!.tileInstanceId
    )!;
    const neighbor = getTileFootprintSpaceIds(tile).find((spaceId) => {
      const field = adv(state).fields[spaceId];
      return (
        field &&
        spaceId !== gateSpaceId &&
        field.location === "empty_field" &&
        !field.difficulty &&
        canCrossEdge(state, spaceId, gateSpaceId)
      );
    });
    expect(neighbor, "an open approach hex next to the gate").toBeTruthy();
    return neighbor!;
  }

  function hasSweptAsideNote(state: GameState): boolean {
    return state.eventLog.some(
      (event) => event.type === "EVENT_NOTE" && /swept aside/i.test((event as { message?: string }).message ?? "")
    );
  }

  function hasSlipsPastNote(state: GameState): boolean {
    return state.eventLog.some(
      (event) => event.type === "EVENT_NOTE" && /slips past the guards/i.test((event as { message?: string }).message ?? "")
    );
  }

  function visitedEvents(state: GameState, fieldId: string): unknown[] {
    return state.eventLog.filter(
      (event) => event.type === "FIELD_VISITED" && (event as { fieldId?: string }).fieldId === fieldId
    );
  }

  /**
   * The hero stands on the CAVERN entrance half with its own designer guard
   * already beaten (cleared by hand — the earlier win is not what is under
   * test), ready to cross OUT onto the still-guarded surface half.
   */
  function readyToCross(): { state: GameState; gate: MapFieldState; entrance: MapFieldState } {
    const { state, gate, entrance } = guardedGateGame();
    openTable(state, "p1");
    delete entrance.difficulty;
    delete entrance.customGuardUnits;
    park(state, "hero_p1", entrance.spaceId);
    return { state, gate, entrance };
  }

  it("(a) crossing OUT slips past the far guard — no Combat, and the guard is STILL LIVE", () => {
    const { state, gate } = readyToCross();

    const crossed = move(state, "p1", "hero_p1", gate.spaceId);

    // Arrived, no battle, no experience…
    expect(crossed.heroes.hero_p1.spaceId).toBe(gate.spaceId);
    expect(crossed.combat, "the pass opens no Combat").toBeNull();
    // …and the guard is UNTOUCHED. This is the mutation control: restoring the
    // clearCustomGuard sweep leaves difficulty undefined here.
    const after = adv(crossed).fields[gate.spaceId]!;
    expect(after.difficulty, "the designed guard survives the pass").toBe(4);
    expect(isFieldGuarded(after)).toBe(true);
    expect(hasSweptAsideNote(crossed), "no automatic-victory note any more").toBe(false);
    expect(hasSlipsPastNote(crossed), "the pass announces itself").toBe(true);
  });

  it("(f) the guarded exit is NOT visited during the pass (an unguarded exit IS — control)", () => {
    const { state, gate } = readyToCross();
    const crossed = move(state, "p1", "hero_p1", gate.spaceId);
    // A guarded field is never visited on arrival — the pass must not collect
    // the gate's own visit either.
    expect(visitedEvents(crossed, gate.spaceId), "no visit while the guard stands").toHaveLength(0);
    expect(
      adv(crossed).lastVisitedField.hero_p1,
      "lastVisitedField stays at the origin, so a later retreat bounces there"
    ).not.toBe(gate.spaceId);

    // CONTROL: the SAME crossing onto an UNGUARDED far half visits normally.
    const { state: open, gate: openGate } = readyToCross();
    delete adv(open).fields[openGate.spaceId]!.difficulty;
    delete adv(open).fields[openGate.spaceId]!.customGuardLevel;
    const walked = move(open, "p1", "hero_p1", openGate.spaceId);
    expect(walked.combat).toBeNull();
    expect(visitedEvents(walked, openGate.spaceId), "an unguarded exit is visited").not.toHaveLength(0);
    expect(adv(walked).lastVisitedField.hero_p1).toBe(openGate.spaceId);
    expect(hasSlipsPastNote(walked), "nothing to slip past").toBe(false);
  });

  it("(b) the SAME hero stepping off and back on fights the guard it slipped past", () => {
    const { state, gate } = readyToCross();
    const crossed = move(state, "p1", "hero_p1", gate.spaceId);
    expect(crossed.combat).toBeNull();

    const approach = approachHexFor(crossed, gate.spaceId);
    const off = move(crossed, "p1", "hero_p1", approach);
    expect(off.heroes.hero_p1.spaceId).toBe(approach);
    expect(off.combat, "walking away opens nothing").toBeNull();

    const back = move(off, "p1", "hero_p1", gate.spaceId);
    expect(back.combat?.context.kind, "re-entering the ordinary way FIGHTS").toBe("neutral");
    if (back.combat?.context.kind === "neutral") {
      expect(back.combat.context.fieldId).toBe(gate.spaceId);
    }
  });

  it("(c) a DIFFERENT player's hero walking in fights the guard the traveller slipped past", () => {
    const { state, gate } = readyToCross();
    const crossed = move(state, "p1", "hero_p1", gate.spaceId);
    expect(adv(crossed).fields[gate.spaceId]?.difficulty).toBe(4);

    // p1's hero leaves the hex (otherwise p2 walking in is a PvP battle), then
    // p2's hero walks onto the same still-guarded gate.
    const approach = approachHexFor(crossed, gate.spaceId);
    const cleared = move(crossed, "p1", "hero_p1", approach);
    // Park p1 far away (back through the tunnel) so it neither blocks the hex
    // nor occupies p2's approach.
    park(cleared, "hero_p1", adv(cleared).fields[gate.spaceId]!.gateLinkSpaceId!);
    openTable(cleared, "p2");
    park(cleared, "hero_p2", approach);

    const other = move(cleared, "p2", "hero_p2", gate.spaceId);
    expect(other.combat?.context.kind, "someone else's entry FIGHTS").toBe("neutral");
    if (other.combat?.context.kind === "neutral") {
      expect(other.combat.context.fieldId).toBe(gate.spaceId);
    }
  });

  it("(d) travelling through the gate AGAIN is fight-free again — the bonus is per travel, and never clears the guard", () => {
    const { state, gate, entrance } = readyToCross();
    const first = move(state, "p1", "hero_p1", gate.spaceId);
    expect(first.combat).toBeNull();

    // Back down the tunnel (the entrance's own guard was already beaten)…
    const backDown = move(first, "p1", "hero_p1", entrance.spaceId);
    expect(backDown.combat).toBeNull();
    expect(backDown.heroes.hero_p1.spaceId).toBe(entrance.spaceId);

    // …and out again: still no Combat, and the guard is still standing.
    const secondPass = move(backDown, "p1", "hero_p1", gate.spaceId);
    expect(secondPass.combat, "a second travel passes fight-free too").toBeNull();
    expect(secondPass.heroes.hero_p1.spaceId).toBe(gate.spaceId);
    expect(adv(secondPass).fields[gate.spaceId]?.difficulty, "and the guard is STILL there").toBe(4);
    expect(isFieldGuarded(adv(secondPass).fields[gate.spaceId]!)).toBe(true);
  });

  it("(e) CONTROL: an UNGUARDED linked half behaves exactly as before — free 0-MP crossing, no note", () => {
    const { state, gate } = readyToCross();
    delete adv(state).fields[gate.spaceId]!.difficulty;
    delete adv(state).fields[gate.spaceId]!.customGuardLevel;
    const before = state.heroes.hero_p1.movementPoints;

    const crossed = move(state, "p1", "hero_p1", gate.spaceId);
    expect(crossed.heroes.hero_p1.spaceId).toBe(gate.spaceId);
    expect(crossed.combat).toBeNull();
    expect(crossed.heroes.hero_p1.movementPoints, "the crossing is still free (one Field)").toBe(before);
    expect(hasSlipsPastNote(crossed)).toBe(false);
    expect(hasSweptAsideNote(crossed)).toBe(false);
  });

  it("stepping ON the guarded half from the hero's OWN layer still FIGHTS (control)", () => {
    const { state, gate } = guardedGateGame();
    openTable(state, "p1");
    park(state, "hero_p1", approachHexFor(state, gate.spaceId));
    const walked = move(state, "p1", "hero_p1", gate.spaceId);
    expect(walked.combat?.context.kind).toBe("neutral");
    expect(adv(walked).fields[gate.spaceId]?.difficulty).toBe(4);
  });

  it("standing on the slipped-past guard strands nobody: the hero can still act and end the turn", () => {
    const { state, gate } = readyToCross();
    const crossed = move(state, "p1", "hero_p1", gate.spaceId);
    const legal = getLegalActions(crossed, "p1");
    // No Resolve/Revisit is offered for the guarded hex (that would hand out
    // the field without the fight); a move away and END_TURN always are.
    expect(legal.some((entry) => entry.action.type === "REVISIT_FIELD"), "no Resolve while the guard stands").toBe(
      false
    );
    expect(legal.some((entry) => entry.action.type === "MOVE_HERO")).toBe(true);
    const ended = applyAction(crossed, { type: "END_TURN", playerId: "p1" });
    expect(ended.errors, ended.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  });
});

describe("subterranean gate crossing is one Field (0 MP)", () => {
  it("stepping between the two linked halves spends NO movement (a normal step spends 1)", () => {
    const cavern = cavernNextToFar();
    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: [{ surface: { row: FAR.row, col: FAR.col } }]
      }
    ];
    const state = twoPlayerGame(customMap);
    const surfaceId = tileIdAt(state, FAR);
    const cavernId = tileIdAt(state, cavern);
    const gate = gateHalfTo(state, cavernId); // surface half → cavern
    const entrance = gateHalfTo(state, surfaceId); // cavern half → surface
    expect(gate, "surface gate carved").toBeDefined();
    expect(entrance, "cavern entrance carved").toBeDefined();
    expect(gateFieldsLinked(gate, entrance)).toBe(true);

    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    const hero = state.heroes.hero_p1;
    hero.spaceId = gate!.spaceId;
    hero.movementPoints = 4;
    hero.movementHaltedThisTurn = false;

    // Crossing the gate to its linked entrance is the tunnel travel — FREE.
    const crossed = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: entrance!.spaceId
    });
    expect(crossed.errors, crossed.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    expect(crossed.state.heroes.hero_p1.spaceId).toBe(entrance!.spaceId);
    // 0 MP spent — the two halves are one Field (fails if the throughGate guard is removed).
    expect(crossed.state.heroes.hero_p1.movementPoints).toBe(4);
    expect(
      crossed.state.eventLog.some(
        (event) => event.type === "HERO_MOVED" && (event as { teleport?: string }).teleport === "subterranean"
      )
    ).toBe(true);

    // CONTROL: a plain adjacent step inside the cavern spends its 1 MP as usual.
    const cavernTile = Object.values(adv(crossed.state).tiles).find((tile) => tile.id === cavernId)!;
    const openNeighbor = getTileFootprintSpaceIds(cavernTile).find((spaceId) => {
      const field = adv(crossed.state).fields[spaceId];
      return (
        field &&
        spaceId !== entrance!.spaceId &&
        field.location === "empty_field" &&
        !field.difficulty &&
        canCrossEdge(crossed.state, entrance!.spaceId, spaceId)
      );
    });
    expect(openNeighbor, "an open cavern hex next to the entrance").toBeTruthy();
    const stepped = applyAction(crossed.state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: openNeighbor!
    });
    expect(stepped.errors, stepped.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    expect(stepped.state.heroes.hero_p1.movementPoints).toBe(3);
  });

  it("a hero with ZERO movement left can still take the free crossing (and the preview offers it at cost 0)", () => {
    const cavern = cavernNextToFar();
    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: [{ surface: { row: FAR.row, col: FAR.col } }]
      }
    ];
    const state = twoPlayerGame(customMap);
    const surfaceId = tileIdAt(state, FAR);
    const cavernId = tileIdAt(state, cavern);
    const gate = gateHalfTo(state, cavernId)!;
    const entrance = gateHalfTo(state, surfaceId)!;

    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    const hero = state.heroes.hero_p1;
    hero.spaceId = gate.spaceId;
    hero.movementPoints = 0; // fully spent — the walk ended ON the gate
    hero.movementHaltedThisTurn = false;

    // The click-to-move preview still offers the twin, at 0 movement cost
    // (fails if the free-hop closure or the 0-MP relax is removed).
    const reachable = getReachableHeroPaths(state, hero);
    expect(reachable.get(entrance.spaceId)?.cost).toBe(0);

    // And the crossing executes: the halves are "one Field".
    const crossed = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: entrance.spaceId
    });
    expect(crossed.errors, crossed.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    expect(crossed.state.heroes.hero_p1.spaceId).toBe(entrance.spaceId);
    expect(crossed.state.heroes.hero_p1.movementPoints).toBe(0);

    // CONTROL: with 0 MP a NORMAL step off the entrance is still rejected.
    const cavernTile = Object.values(adv(crossed.state).tiles).find((tile) => tile.id === cavernId)!;
    const openNeighbor = getTileFootprintSpaceIds(cavernTile).find((spaceId) => {
      const field = adv(crossed.state).fields[spaceId];
      return (
        field &&
        spaceId !== entrance.spaceId &&
        field.location === "empty_field" &&
        !field.difficulty &&
        canCrossEdge(crossed.state, entrance.spaceId, spaceId)
      );
    });
    expect(openNeighbor, "an open cavern hex next to the entrance").toBeTruthy();
    const refused = applyAction(crossed.state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: openNeighbor!
    });
    expect(refused.errors.length).toBeGreaterThan(0);
    expect(refused.state.heroes.hero_p1.spaceId).toBe(entrance.spaceId);
  });

  it("a click-to-move walk whose LAST step is the free crossing walks all the way through (cost excludes the hop)", () => {
    const cavern = cavernNextToFar();
    const customMap: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
      {
        row: cavern.row,
        col: cavern.col,
        group: "subterranean",
        faceDown: false,
        tileDefId: "U1",
        gateLinks: [{ surface: { row: FAR.row, col: FAR.col } }]
      }
    ];
    const state = twoPlayerGame(customMap);
    const surfaceId = tileIdAt(state, FAR);
    const cavernId = tileIdAt(state, cavern);
    const gate = gateHalfTo(state, cavernId)!;
    const entrance = gateHalfTo(state, surfaceId)!;

    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    const hero = state.heroes.hero_p1;
    // Stand one open step BEFORE the gate with exactly 1 MP: the paid step onto
    // the gate spends it, and the free hop must still carry the walk through.
    const surfaceTile = Object.values(adv(state).tiles).find((tile) => tile.id === surfaceId)!;
    const before = getTileFootprintSpaceIds(surfaceTile).find((spaceId) => {
      const field = adv(state).fields[spaceId];
      return (
        field &&
        spaceId !== gate.spaceId &&
        field.location === "empty_field" &&
        !field.difficulty &&
        canCrossEdge(state, spaceId, gate.spaceId)
      );
    });
    expect(before, "an open surface hex next to the gate").toBeTruthy();
    hero.spaceId = before!;
    hero.movementPoints = 1;
    hero.movementHaltedThisTurn = false;

    // Preview: the entrance across the tunnel costs 1 (the paid step only).
    const reachable = getReachableHeroPaths(state, hero);
    expect(reachable.get(entrance.spaceId)?.cost).toBe(1);
    expect(reachable.get(entrance.spaceId)?.path).toEqual([gate.spaceId, entrance.spaceId]);

    const walked = applyAction(state, {
      type: "MOVE_HERO_PATH",
      playerId: "p1",
      heroId: "hero_p1",
      path: [gate.spaceId, entrance.spaceId]
    });
    expect(walked.errors, walked.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    // The walk crossed the tunnel even though the paid step drained the pool
    // (fails if the exec-loop free-step relax is removed).
    expect(walked.state.heroes.hero_p1.spaceId).toBe(entrance.spaceId);
    expect(walked.state.heroes.hero_p1.movementPoints).toBe(0);
  });
});
