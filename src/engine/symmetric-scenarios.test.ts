/**
 * ============================================================================
 *  Symmetric 2-player clash maps — land / sea / underground
 *  (src/data/map/scenarios.ts).
 * ============================================================================
 *
 * Mirror-symmetric duels: the map reflects onto itself across the axis through
 * the Ⅵ–Ⅶ hub, so both homes are identical. Homes sit on the OUTER EDGE and
 * march inward; the terrain shifts from land (edge) to the "deep" middle:
 *   • land:        Ⅱ–Ⅲ → Ⅳ–Ⅴ → Ⅵ–Ⅶ hub.
 *   • sea:         Ⅱ–Ⅲ LAND coast → SEA wave ring → Ⅵ–Ⅶ SEA hub.
 *   • underground: Ⅱ–Ⅲ LAND → two SUBTERRANEAN caverns → Ⅵ–Ⅶ LAND hub, reached
 *                  by delving. Each cavern touches ONLY Ⅱ–Ⅲ land, so its
 *                  Subterranean Gate carves the GATE on the land tile and the
 *                  ENTRANCE in the cavern.
 *
 * Every case asserts an OBSERVABLE property of the state the engine builds.
 */
import { describe, expect, it } from "vitest";
import { scenarioDefinitions, type ScenarioDefinition } from "@/data/map/scenarios";
import { coreFactionDefinitions } from "@/data/factions/core";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileLatticeColor,
  hexNeighbors,
  hexSpaceId,
  type GameAction,
  type GameState
} from "./index";
import {
  fieldLayer,
  getTileFootprintSpaceIds,
  materializeTileFields,
  recomputeSubterraneanGates,
  tileLayer
} from "./adventure";
import { canHeroDiscoverAdjacentTile } from "./adventure-reducer";
import { type HexCoord } from "./hex";
import type { MapTileState } from "./state";

// --- mirror transform about the hub (index-7 sublattice basis) --------------
const HUB: HexCoord = { row: 30, col: 30 };
function cube(c: HexCoord) {
  const q = c.col - (c.row - (c.row & 1)) / 2;
  return { q, r: c.row };
}
const fromAxial = (q: number, r: number): HexCoord => ({ row: r, col: q + (r - (r & 1)) / 2 });
/** Mirror that swaps NE↔NW (the map's symmetry), matrix [[-1,-1],[0,1]] in basis {A,-B}. */
function mirror(c: HexCoord): HexCoord {
  const O = cube(HUB);
  const dq = cube(c).q - O.q,
    dr = cube(c).r - O.r;
  const m = (dr + 3 * dq) / 7,
    n = 2 * m - dq;
  const m2 = -m - n,
    n2 = n;
  return fromAxial(2 * m2 - n2 + O.q, m2 + 3 * n2 + O.r);
}
const key = (c: HexCoord): string => `${c.row},${c.col}`;
const LATTICE_NEIGHBORS = [
  [2, 1],
  [1, -3],
  [3, -2],
  [-2, -1],
  [-1, 3],
  [-3, 2]
];

const ALL_FACTIONS = [
  "castle",
  "rampart",
  "inferno",
  "stronghold",
  "necropolis",
  "dungeon",
  "tower",
  "fortress",
  "conflux",
  "cove"
] as const;
const SYMMETRIC_IDS = ["land-2p", "sea-2p", "underground-2p"] as const;
const FACE_DOWN_PER_MAP = 13;
const TOTAL_TILES = 15;

function buildScenario(id: string, offset = 0): { state: GameState; scenario: ScenarioDefinition } {
  const scenario = scenarioDefinitions[id];
  const players = Array.from({ length: 2 }, (_, i) => {
    const f = ALL_FACTIONS[(i + offset) % ALL_FACTIONS.length];
    return { id: `p${i + 1}`, name: f, factionId: f as never, heroDefId: coreFactionDefinitions[f].heroes[0] };
  });
  const state = createAdventureGameState({
    seed: `sym-${id}-${offset}`,
    scenarioId: id,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: false,
    players
  });
  return { state, scenario };
}
const allTiles = (s: GameState): MapTileState[] => Object.values(s.adventure!.tiles);
const tileCenter = (t: MapTileState): HexCoord => ({ row: t.centerRow, col: t.centerCol });
function seatTiles(state: GameState): MapTileState[] {
  const townFieldIds = new Set(Object.values(state.towns).map((town) => town.fieldId));
  return allTiles(state).filter((t) => getTileFootprintSpaceIds(t).some((idx) => townFieldIds.has(idx)));
}
const faceDownTiles = (s: GameState): MapTileState[] => allTiles(s).filter((t) => t.faceDown);
const tileAtCenter = (s: GameState, c: HexCoord): MapTileState | undefined =>
  allTiles(s).find((t) => t.centerRow === c.row && t.centerCol === c.col);

describe("registration", () => {
  it("registers exactly the 2-player symmetric maps, clearly labelled", () => {
    for (const id of SYMMETRIC_IDS) {
      const s = scenarioDefinitions[id];
      expect(s, id).toBeDefined();
      expect(s.minPlayers, id).toBe(2);
      expect(s.maxPlayers, id).toBe(2);
      expect(s.name).toContain("2P");
      expect(s.layout.starts.length).toBe(2);
    }
    // No 3p/4p maps yet (deferred until the 2p design is confirmed).
    expect(Object.keys(scenarioDefinitions).filter((k) => /-[34]p$/.test(k))).toEqual([]);
  });
});

describe.each(SYMMETRIC_IDS)("%s", (id) => {

  it("homes on the OUTER EDGE (perimeter, never adjacent to the hub)", () => {
    const { state } = buildScenario(id);
    const tileAt = new Set(allTiles(state).map((t) => key(tileCenter(t))));
    for (const seat of seatTiles(state)) {
      const c = tileCenter(seat);
      const occ = LATTICE_NEIGHBORS.map(([dq, dr]) => fromAxial(cube(c).q + dq, cube(c).r + dr)).filter((n) =>
        tileAt.has(key(n))
      ).length;
      expect(occ, `${id} home ${key(c)} on the edge`).toBeLessThanOrEqual(3);
      expect(tileCentersAdjacent(c, HUB), `${id} home ${key(c)} not next to hub`).toBe(false);
    }
  });

  it("interlocks gaplessly: one sublattice colour, no overlaps, fully connected", () => {
    const { state } = buildScenario(id);
    const centers = allTiles(state).map(tileCenter);
    expect(centers.length).toBe(TOTAL_TILES);
    expect(new Set(centers.map(tileLatticeColor)).size).toBe(1);
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        expect(tileCentersOverlap(centers[i], centers[j]), `${key(centers[i])} vs ${key(centers[j])}`).toBe(false);
      }
    }
    const adj = centers.map(() => [] as number[]);
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = 0; j < centers.length; j += 1) {
        if (i !== j && tileCentersAdjacent(centers[i], centers[j])) adj[i].push(j);
      }
    }
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of adj[x]) {
        if (!seen.has(y)) {
          seen.add(y);
          stack.push(y);
        }
      }
    }
    expect(seen.size, "connected").toBe(centers.length);
  });

  it("is mirror-symmetric: tile set invariant, the two homes swap", () => {
    const { state } = buildScenario(id);
    const centers = allTiles(state).map(tileCenter);
    const set = new Set(centers.map(key));
    for (const c of centers) expect(set.has(key(mirror(c))), `${key(c)} -> ${key(mirror(c))}`).toBe(true);
    expect(key(mirror(HUB))).toBe(key(HUB));
    const seats = seatTiles(state).map(tileCenter);
    expect(seats.length).toBe(2);
    expect(key(mirror(seats[0]))).toBe(key(seats[1]));
  });

  it("places the contested tiles FACE DOWN (homes face up)", () => {
    const { state } = buildScenario(id);
    expect(seatTiles(state).every((t) => !t.faceDown)).toBe(true);
    expect(faceDownTiles(state).length).toBe(FACE_DOWN_PER_MAP);
  });

  it("EVERY faction can begin exploring from EITHER home (no faction is walled in)", () => {
    // Each home borders Ⅱ–Ⅲ land at its NE and NW; every faction's start tile
    // has at least one of those edges open, so it can always discover a tile.
    for (let offset = 0; offset < ALL_FACTIONS.length; offset += 1) {
      const { state } = buildScenario(id, offset);
      const adv = state.adventure!;
      for (const seat of seatTiles(state)) {
        const hero = Object.values(state.heroes).find((h) => {
          const f = h.spaceId ? adv.fields[h.spaceId] : undefined;
          return f && f.tileInstanceId === seat.id;
        })!;
        const canBegin = getTileFootprintSpaceIds(seat).some((sf) =>
          faceDownTiles(state).some((fd) => canHeroDiscoverAdjacentTile(state, { ...hero, spaceId: sf }, fd))
        );
        const fac = ALL_FACTIONS[(Number(hero.controllerId.replace("p", "")) - 1 + offset) % ALL_FACTIONS.length];
        expect(canBegin, `${fac} at ${seat.centerRow},${seat.centerCol} can begin`).toBe(true);
      }
    }
  });

  it("LAND FIRST: a Ⅱ–Ⅲ land ring buffers the homes on every terrain", () => {
    const { state } = buildScenario(id);
    const far = faceDownTiles(state).filter((t) => t.group === "far");
    expect(far.length).toBeGreaterThanOrEqual(4);
    for (const t of far) expect(tileLayer(t)).toBe("surface");
  });
});

describe("land-2p gradient", () => {
  it("Ⅳ–Ⅴ ring touches the hub, Ⅱ–Ⅲ is further out, Ⅵ–Ⅶ at the centre", () => {
    const { state } = buildScenario("land-2p");
    const hub = tileAtCenter(state, HUB)!;
    expect(hub.group).toBe("center");
    const downs = faceDownTiles(state);
    for (const t of downs) expect(tileLayer(t)).toBe("surface");
    for (const t of downs.filter((d) => d.group === "near")) {
      expect(tileCentersAdjacent(tileCenter(t), HUB), `Ⅳ–Ⅴ ${key(tileCenter(t))} touches hub`).toBe(true);
    }
    for (const t of downs.filter((d) => d.group === "far")) {
      expect(tileCentersAdjacent(tileCenter(t), HUB), `Ⅱ–Ⅲ ${key(tileCenter(t))} is outer`).toBe(false);
    }
  });
});

describe("sea-2p gradient", () => {
  it("land coast (Ⅱ–Ⅲ) on the edge, the whole middle is sea", () => {
    const { state } = buildScenario("sea-2p");
    const hub = tileAtCenter(state, HUB)!;
    expect(hub.group).toBe("sea");
    const downs = faceDownTiles(state);
    for (const t of downs) expect(tileLayer(t)).toBe("surface");
    // The middle (hub + the ring touching it) is sea; the outer buffer is land.
    for (const t of downs.filter((d) => tileCentersAdjacent(tileCenter(d), HUB))) {
      expect(t.group, `inner ${t.tileDefId}`).toBe("sea");
    }
    expect(downs.some((t) => t.group === "far"), "a Ⅱ–Ⅲ land coast exists").toBe(true);
  });
});

describe("underground-2p mechanics: caverns touch ONLY Ⅱ–Ⅲ land", () => {
  it("every Surface tile adjacent to a cavern is a Ⅱ–Ⅲ land tile (group far)", () => {
    const { state } = buildScenario("underground-2p");
    const caverns = faceDownTiles(state).filter((t) => tileLayer(t) === "subterranean");
    expect(caverns.length).toBe(2);
    const byCenter = new Map(allTiles(state).map((t) => [key(tileCenter(t)), t]));
    for (const cav of caverns) {
      const c = tileCenter(cav);
      for (const [dq, dr] of LATTICE_NEIGHBORS) {
        const neighbor = byCenter.get(key(fromAxial(cube(c).q + dq, cube(c).r + dr)));
        if (!neighbor) continue;
        if (tileLayer(neighbor) === "subterranean") continue; // cavern↔cavern is fine
        expect(neighbor.group, `cavern ${key(c)} neighbour ${neighbor.centerRow},${neighbor.centerCol} must be Ⅱ–Ⅲ`).toBe(
          "far"
        );
      }
    }
  });

  it("the Ⅵ–Ⅶ hub is a Surface LAND tile, not a cavern", () => {
    const { state } = buildScenario("underground-2p");
    const hub = tileAtCenter(state, HUB)!;
    expect(hub.group).toBe("center");
    expect(tileLayer(hub)).toBe("surface");
  });

  it("after reveal, the GATE half sits on a Ⅱ–Ⅲ land tile and the ENTRANCE on the cavern; the hub is reached only by delving", () => {
    const { state } = buildScenario("underground-2p");
    const adv = state.adventure!;
    const cavernIds = new Set(faceDownTiles(state).filter((t) => tileLayer(t) === "subterranean").map((t) => t.id));
    const farIds = new Set(allTiles(state).filter((t) => t.group === "far").map((t) => t.id));

    for (const t of allTiles(state)) {
      if (t.faceDown) {
        t.faceDown = false;
        materializeTileFields(adv, t);
      }
    }
    recomputeSubterraneanGates(adv);

    // Every gate field is either the ENTRANCE on a cavern, or the GATE on a Ⅱ–Ⅲ
    // land tile — never on the hub, a Ⅳ–Ⅴ tile, or a home.
    const gateFields = Object.values(adv.fields).filter((f) => f.location === "subterranean_gate");
    expect(gateFields.length).toBeGreaterThan(0);
    let gatesOnLand = 0;
    let entrancesOnCavern = 0;
    for (const g of gateFields) {
      if (cavernIds.has(g.tileInstanceId)) entrancesOnCavern += 1;
      else {
        expect(farIds.has(g.tileInstanceId), `gate half on a Ⅱ–Ⅲ land tile`).toBe(true);
        gatesOnLand += 1;
      }
    }
    expect(gatesOnLand).toBeGreaterThan(0);
    expect(entrancesOnCavern).toBeGreaterThan(0);

    // BFS from a home to the hub through canCrossEdge: reachable, only via a gate.
    const hub = tileAtCenter(state, HUB)!;
    const hubFields = new Set(getTileFootprintSpaceIds(hub));
    const home = seatTiles(state)[0];
    const q = [...getTileFootprintSpaceIds(home)];
    const seen = new Set(q);
    let reached = false;
    let viaGate = false;
    while (q.length) {
      const curId = q.shift()!;
      if (hubFields.has(curId)) {
        reached = true;
        break;
      }
      const m = /^h:(-?\d+):(-?\d+)$/.exec(curId)!;
      const cur = { row: Number(m[1]), col: Number(m[2]) };
      for (const nb of hexNeighbors(cur)) {
        const nid = hexSpaceId(nb);
        if (seen.has(nid) || !adv.fields[nid]) continue;
        if (canCrossEdge(state, curId, nid)) {
          if (fieldLayer(state, curId) !== fieldLayer(state, nid)) viaGate = true;
          seen.add(nid);
          q.push(nid);
        }
      }
    }
    expect(reached, "central land hub reachable from a home").toBe(true);
    expect(viaGate, "reaching the hub requires a Subterranean Gate (a delve)").toBe(true);
  });
});

describe("end-to-end reveal through the reducer", () => {
  function apply(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    return result.state;
  }
  for (const id of SYMMETRIC_IDS) {
    it(`${id}: a hero discovers an adjacent face-down tile (DISCOVER_TILE flips it)`, () => {
      for (let offset = 0; offset < ALL_FACTIONS.length; offset += 1) {
        let { state } = buildScenario(id, offset);
        const p = state.players.p1;
        if (p.needsHandRefresh || p.canMulligan) {
          state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
        }
        const seat = seatTiles(state).find((s) => {
          const hero = state.heroes.hero_p1;
          return hero.spaceId && getTileFootprintSpaceIds(s).includes(hero.spaceId);
        });
        if (!seat) continue;
        const hero = state.heroes.hero_p1;
        hero.movementPoints = 3;
        let target: MapTileState | undefined;
        for (const fd of faceDownTiles(state)) {
          for (const sf of getTileFootprintSpaceIds(seat)) {
            if (canHeroDiscoverAdjacentTile(state, { ...hero, spaceId: sf }, fd)) {
              hero.spaceId = sf;
              target = fd;
              break;
            }
          }
          if (target) break;
        }
        if (!target) continue;
        const next = apply(state, { type: "DISCOVER_TILE", playerId: "p1", heroId: "hero_p1", tileInstanceId: target.id });
        expect(next.adventure!.tiles[target.id].faceDown).toBe(false);
        return;
      }
      throw new Error(`no faction could discover from a home on ${id}`);
    });
  }
});
