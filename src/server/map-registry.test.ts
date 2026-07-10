import { describe, expect, it } from "vitest";
import {
  clampMapPlayers,
  MAX_STORED_MAPS,
  MapRegistry,
  sanitizeSharedMap,
  type SharedMapRecord
} from "./map-registry";

/** A minimal valid map record for the registry (real designer tile shape). */
function makeMap(overrides: Partial<SharedMapRecord> & { id: string }): SharedMapRecord {
  return {
    name: `Map ${overrides.id}`,
    scenarioId: "skirmish",
    players: 4,
    tiles: [{ row: 9, col: 4, group: "near", faceDown: true }],
    createdByClientId: null,
    createdByName: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe("clampMapPlayers", () => {
  it("clamps a request into the scenario's seat range (skirmish allows 2–4)", () => {
    expect(clampMapPlayers("skirmish", 1)).toBe(2);
    expect(clampMapPlayers("skirmish", 3)).toBe(3);
    expect(clampMapPlayers("skirmish", 4)).toBe(4);
    expect(clampMapPlayers("skirmish", 9)).toBe(4);
  });

  it("pins a 2-player-only scenario to 2 even when 4 is asked for", () => {
    // land-2p is a symmetric duel map: maxPlayers 2. The control above proves the
    // clamp is scenario-driven, not a blanket cap.
    expect(clampMapPlayers("land-2p", 4)).toBe(2);
    expect(clampMapPlayers("land-2p", 2)).toBe(2);
  });

  it("defaults an unknown scenario to the floor instead of throwing", () => {
    expect(clampMapPlayers("does-not-exist", 4)).toBe(2);
  });
});

describe("sanitizeSharedMap", () => {
  it("keeps a valid map and stamps a fresh updatedAt", () => {
    const record = sanitizeSharedMap(
      { id: "m1", name: "Frontier", scenarioId: "skirmish", players: 3, tiles: [{ row: 9, col: 4, group: "near" }] },
      5000
    );
    expect(record).not.toBeNull();
    expect(record!.players).toBe(3);
    expect(record!.scenarioId).toBe("skirmish");
    expect(record!.tiles).toHaveLength(1);
    expect(record!.updatedAt).toBe(5000);
  });

  it("clamps an out-of-range player count to the scenario (4-seat ask on a 2P map → 2)", () => {
    const record = sanitizeSharedMap({ id: "m", scenarioId: "land-2p", players: 4, tiles: [] }, 1);
    expect(record!.players).toBe(2);
  });

  it("drops malformed tiles but keeps the well-formed ones", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "far" }, // good
          { row: 1.5, col: 2, group: "far" }, // non-integer row → dropped
          { row: 2, col: 2, group: "bogus" }, // unknown group → dropped
          "nonsense" // not an object → dropped
        ]
      },
      1
    );
    expect(record!.tiles).toHaveLength(1);
    expect(record!.tiles[0]).toMatchObject({ row: 1, col: 1, group: "far" });
  });

  it("preserves a tile's guard band — sea AND underground — through sanitization", () => {
    // Regression: sanitizeTile rebuilds each plan from an allow-list of fields,
    // so a newly added band field must be carried explicitly or a saved
    // "Underground Ⅵ–Ⅶ" / "Sea Ⅵ–Ⅶ" slot silently loses its band on reload and
    // reverts to drawing any tile from the pool.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "sea", faceDown: true, seaBand: "vi-vii" },
          { row: 2, col: 2, group: "subterranean", faceDown: true, subBand: "vi-vii" },
          { row: 3, col: 3, group: "subterranean", faceDown: true, subBand: "iv-v" },
          { row: 4, col: 4, group: "subterranean", faceDown: true, subBand: "bogus" } // invalid → dropped
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({ group: "sea", seaBand: "vi-vii" });
    expect(record!.tiles[1]).toMatchObject({ group: "subterranean", subBand: "vi-vii" });
    expect(record!.tiles[2]).toMatchObject({ group: "subterranean", subBand: "iv-v" });
  });

  it("preserves a tile's Monolith/Whirlpool token through sanitization (malformed tokens dropped)", () => {
    // sanitizeTile rebuilds each plan from an allow-list, so the designed token
    // must be carried explicitly or a saved map silently loses its Monoliths/
    // Whirlpools on reload — the teleport network would vanish from the game.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 0 } },
          { row: 2, col: 2, group: "sea", faceDown: true, token: { kind: "whirlpool" } },
          { row: 3, col: 3, group: "far", faceDown: true, token: { kind: "wormhole" } }, // unknown kind → token dropped
          { row: 4, col: 4, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 9 } } // bad slot → slot dropped
        ]
      },
      1
    );
    expect(record!.tiles[0].token).toEqual({ kind: "monolith", slot: 0 });
    expect(record!.tiles[1].token).toEqual({ kind: "whirlpool" });
    expect(record!.tiles[2].token).toBeUndefined();
    expect(record!.tiles[3].token).toEqual({ kind: "monolith" });
    // A malformed band is stripped, not stored.
    expect(record!.tiles[3]).not.toHaveProperty("subBand");
  });

  it("falls back to the default scenario when the id is unknown", () => {
    const record = sanitizeSharedMap({ id: "m", scenarioId: "ghost", tiles: [] }, 1);
    expect(record!.scenarioId).toBe("skirmish");
  });

  it("rejects input that isn't a map (no tile array)", () => {
    expect(sanitizeSharedMap({ id: "m", name: "no tiles" }, 1)).toBeNull();
    expect(sanitizeSharedMap(null, 1)).toBeNull();
    expect(sanitizeSharedMap("string", 1)).toBeNull();
  });
});

describe("MapRegistry", () => {
  it("stores a map and lists it back", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "a" }));
    expect(registry.list().map((m) => m.id)).toEqual(["a"]);
  });

  it("edits in place by id — saving the same id overwrites, never duplicates", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "a", name: "First", players: 2, updatedAt: 1 }));
    registry.upsert(makeMap({ id: "a", name: "Edited", players: 4, updatedAt: 2 }));

    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Edited");
    expect(list[0].players).toBe(4);
  });

  it("deletes a map so it stops listing", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "a" }));
    registry.upsert(makeMap({ id: "b" }));
    expect(registry.remove("a")).toBe(true);
    expect(registry.list().map((m) => m.id)).toEqual(["b"]);
    // Removing something already gone is a harmless false.
    expect(registry.remove("a")).toBe(false);
  });

  it("lists newest-saved first regardless of insertion order", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "old", updatedAt: 100 }));
    registry.upsert(makeMap({ id: "new", updatedAt: 300 }));
    registry.upsert(makeMap({ id: "mid", updatedAt: 200 }));
    expect(registry.list().map((m) => m.id)).toEqual(["new", "mid", "old"]);
  });

  it("evicts the oldest-touched maps once it exceeds the cap", () => {
    const registry = new MapRegistry();
    // Fill to the cap, then add one more — the single oldest must fall out.
    for (let index = 0; index < MAX_STORED_MAPS; index += 1) {
      registry.upsert(makeMap({ id: `m${index}`, updatedAt: index + 1 }));
    }
    expect(registry.size).toBe(MAX_STORED_MAPS);
    registry.upsert(makeMap({ id: "fresh", updatedAt: MAX_STORED_MAPS + 1 }));
    expect(registry.size).toBe(MAX_STORED_MAPS);
    expect(registry.has("fresh")).toBe(true);
    expect(registry.has("m0")).toBe(false); // the oldest (updatedAt 1) was evicted
  });

  it("rehydrates from stored records (Durable Object / disk round-trip)", () => {
    const seed = [makeMap({ id: "a" }), makeMap({ id: "b" })];
    const registry = new MapRegistry(seed);
    expect(registry.list().map((m) => m.id).sort()).toEqual(["a", "b"]);
  });
});
