import { describe, expect, it } from "vitest";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  getReachableHeroPaths,
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
import { fieldLayer, gateFieldsLinked, instantiateTile } from "./adventure";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Designer-chosen Subterranean Gate links (map designer, map-scoped):
//  - the designer connects a chosen underground tile to a chosen Surface tile,
//    incl. ONE cavern to SEVERAL Surface tiles (bypassing one-gate-per-tile);
//  - the gate pair carves at the designer's pinned hexes (else the nearest);
//  - a fully-pinned designed link opens NO pick-on-reveal choice in play.
// Every assertion diverges from the automatic-pairing default (the control).
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

describe("designed gate links — pinned hexes carve where the designer chose", () => {
  it("carves BOTH halves at the DESIGNED hexes (not the auto nearest) and a hero can cross", () => {
    const cavern = cavernNextToFar();

    // What the automatic pairing WOULD carve with no designed link (the control).
    const autoGates = planSubterraneanGates([
      { row: TOWN.row, col: TOWN.col, group: "starting" },
      { row: FAR.row, col: FAR.col, group: "far" },
      { row: cavern.row, col: cavern.col, group: "subterranean" }
    ]);
    expect(autoGates).toHaveLength(1);
    const autoGateHexId = hexSpaceId(autoGates[0].gateHex);

    // Pick a legal boundary pair whose gate hex DIFFERS from the auto default, so
    // the assertions below fail if the pin is ignored (the mutation check).
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
    // The designer's hexes, NOT the automatic nearest hex.
    expect(gate!.spaceId).toBe(pinnedGateId);
    expect(entrance!.spaceId).toBe(pinnedEntranceId);
    expect(gate!.spaceId).not.toBe(autoGateHexId);

    // The two halves are one Field and the divide is crossable both ways.
    expect(gateFieldsLinked(gate, entrance)).toBe(true);
    expect(canCrossEdge(state, gate!.spaceId, entrance!.spaceId)).toBe(true);
    expect(canCrossEdge(state, entrance!.spaceId, gate!.spaceId)).toBe(true);

    // A hero standing on the surface gate reaches the underground ONLY via the
    // designed crossing (the observable outcome).
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
    // The DESIGNER's pinned hexes, not the automatic nearest.
    expect(gate!.spaceId).toBe(pinnedGateId);
    expect(entrance!.spaceId).toBe(pinnedEntranceId);
    expect(gate!.spaceId).not.toBe(autoGateHexId);

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

describe("designed gate links — the SAME Surface tile linked twice (several gates on one edge)", () => {
  it("carves BOTH gates at distinct pinned pairs; CONTROL: two UNPINNED same-surface links merge to ONE", () => {
    const { cavern, pairs } = cavernNextToFarWithDisjointPairs();
    const [first, second] = pairs;
    const base: CustomMapTilePlan[] = [
      { row: TOWN.row, col: TOWN.col, group: "starting", faceDown: false },
      { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" }
    ];
    const cavernPlan = { row: cavern.row, col: cavern.col, group: "subterranean" as const, faceDown: false, tileDefId: "U1" };

    // Designed: TWO pinned links to the SAME surface → two gate fields on the edge.
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
    expect(surfaceGates, "two gate halves on the shared surface edge").toHaveLength(2);
    expect(cavernGates, "two entrance halves on the cavern").toHaveLength(2);
    // Both carve at exactly the designer's pinned hexes.
    expect(new Set(surfaceGates.map((field) => field.spaceId))).toEqual(
      new Set([hexSpaceId(first.gateHex), hexSpaceId(second.gateHex)])
    );
    // Each surface gate links to its own cavern entrance and is crossable.
    for (const gate of surfaceGates) {
      expect(gate.gateToTileId).toBe(cavernId);
      const entrance = cavernGates.find((field) => field.spaceId === gate.gateLinkSpaceId);
      expect(entrance, "each gate is linked to a distinct cavern entrance").toBeDefined();
      expect(entrance!.gateToTileId).toBe(surfaceId);
      expect(canCrossEdge(twoGateState, gate.spaceId, entrance!.spaceId)).toBe(true);
    }

    // CONTROL: two UNPINNED links to the same surface are true duplicates → ONE gate.
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
    const { accepted, problems } = validateCustomMapPlan(
      [
        { row: FAR.row, col: FAR.col, group: "far", faceDown: false, tileDefId: "F1" },
        {
          row: cavern.row,
          col: cavern.col,
          group: "subterranean",
          faceDown: false,
          tileDefId: "U1",
          gateLinks: [
            { surface: { row: FAR.row, col: FAR.col }, gateHex, entranceHex }, // accepted
            { surface: { row: FAR.row, col: FAR.col }, gateHex, entranceHex } // same pin → collides → dropped
          ]
        }
      ],
      scenario
    );
    const cav = accepted.find((plan) => plan.group === "subterranean");
    expect(cav?.gateLinks, "the sibling still carves; the colliding one is dropped").toHaveLength(1);
    expect(cav!.gateLinks![0].gateHex).toBe(gateHex);
    expect(problems.some((message) => /collides with another gate/i.test(message))).toBe(true);
    expect(problems.some((message) => message.includes(gateHex)), "the problem names the colliding hex").toBe(true);
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

    const { accepted, problems } = validateCustomMapPlan(
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
    // Both bad links reported.
    expect(problems.some((message) => /do not touch/i.test(message))).toBe(true);
    expect(problems.some((message) => /no Surface tile is placed/i.test(message))).toBe(true);
  });
});

// --- Reveal flow: a fully-pinned designed link opens NO pick-on-reveal choice --
// Reuses the harness shape from subterranean-gate-choice.test.ts.

function makeChoiceGame(): GameState {
  let state = createAdventureGameState({
    seed: "designed-gate-reveal",
    difficulty: "normal",
    rollFirstPlayer: false,
    chooseSubterraneanGate: true
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

  it("TWO same-surface pinned designed gates BOTH carve silently on reveal — neither opens a choice", () => {
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
    // Both pinned — neither opens the pick-on-reveal choice.
    expect(gatePlacementChoice(revealed), "a fully-pinned pair of designed gates opens NO choice").toBe(false);
    // Both gates carved on the surface, at exactly the two designed hexes.
    const surfaceGates = getTileFootprintSpaceIds(surface)
      .map((id) => adv(revealed).fields[id])
      .filter((field): field is MapFieldState => field?.location === "subterranean_gate");
    expect(surfaceGates, "both same-surface designed gates carved").toHaveLength(2);
    expect(new Set(surfaceGates.map((field) => field.spaceId))).toEqual(
      new Set([hexSpaceId(first.gateHex), hexSpaceId(second.gateHex)])
    );
    // Each is a real linked crossing to the cavern.
    for (const gate of surfaceGates) {
      expect(gate.gateToTileId).toBe(cavern.id);
      const entrance = adv(revealed).fields[gate.gateLinkSpaceId ?? ""];
      expect(entrance?.location).toBe("subterranean_gate");
      expect(canCrossEdge(revealed, gate.spaceId, entrance!.spaceId)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Designer guards on the two gate halves: fight to step ON from your own layer,
// auto-win when crossing OUT through the linked half.
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

  it("crossing OUT through the linked half AUTO-WINS the far guard; stepping on from the own layer FIGHTS (control)", () => {
    const { state, gate, entrance } = guardedGateGame();
    // Clear the hand gates so MOVE_HERO is legal.
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";

    // The hero stands on the CAVERN entrance half (its own guard beaten — the
    // designer guard is on the field, so simulate the earlier win by clearing it).
    const hero = state.heroes.hero_p1;
    delete entrance.difficulty;
    delete entrance.customGuardUnits;
    hero.spaceId = entrance.spaceId;
    hero.movementPoints = 4;
    hero.movementHaltedThisTurn = false;

    const crossed = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: gate.spaceId
    });
    expect(crossed.errors, crossed.errors.map((error) => error.message).join("; ")).toHaveLength(0);

    // The crossing swept the surface guard aside: hero arrived, no battle, no XP.
    expect(crossed.state.heroes.hero_p1.spaceId).toBe(gate.spaceId);
    expect(crossed.state.combat).toBeNull();
    expect(crossed.state.adventure!.fields[gate.spaceId]?.difficulty).toBeUndefined();
    expect(
      crossed.state.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && /swept aside/i.test((event as { message?: string }).message ?? "")
      )
    ).toBe(true);

    // CONTROL: approaching the SAME guarded surface half from a plain surface
    // hex fights it — find an adjacent same-layer field and walk on.
    const { state: fresh, gate: freshGate } = guardedGateGame();
    for (const player of Object.values(fresh.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    fresh.activePlayerId = "p1";
    const freshHero = fresh.heroes.hero_p1;
    const neighbor = getTileFootprintSpaceIds(
      Object.values(adv(fresh).tiles).find((tile) => tile.id === freshGate.tileInstanceId)!
    ).find((spaceId) => {
      const field = adv(fresh).fields[spaceId];
      return (
        field &&
        spaceId !== freshGate.spaceId &&
        field.location === "empty_field" &&
        !field.difficulty &&
        canCrossEdge(fresh, spaceId, freshGate.spaceId)
      );
    });
    expect(neighbor, "an open approach hex next to the gate").toBeTruthy();
    freshHero.spaceId = neighbor!;
    freshHero.movementPoints = 4;
    freshHero.movementHaltedThisTurn = false;
    const walked = applyAction(fresh, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: freshGate.spaceId });
    expect(walked.errors, walked.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    expect(walked.state.combat?.context.kind).toBe("neutral");
    expect(walked.state.adventure!.fields[freshGate.spaceId]?.difficulty).toBe(4);
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
});
