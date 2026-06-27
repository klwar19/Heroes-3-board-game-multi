import { describe, expect, it } from "vitest";
import { deleteSharedMap, listSharedMaps, saveSharedMap } from "./shared-map-store";
import type { SharedMapRecord } from "./map-registry";

/**
 * The built-in (non-PartyKit) shared-map store, the Node counterpart of the
 * PartyKit maps Durable Object. Tests share one process-global registry + disk
 * file, so each case uses a fresh id and asserts only against its own maps —
 * exactly the isolation pattern game-room-store.test.ts uses for rooms.
 */

function uniqueId(name: string): string {
  return `test-map-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function findMap(id: string): SharedMapRecord | undefined {
  return listSharedMaps().find((map) => map.id === id);
}

describe("shared-map store (built-in backend)", () => {
  it("saves a map and reads it back from the library", () => {
    const id = uniqueId("save");
    const result = saveSharedMap({
      id,
      name: "Frontier",
      scenarioId: "skirmish",
      players: 3,
      tiles: [{ row: 9, col: 4, group: "near", faceDown: true }]
    });
    expect(result.ok).toBe(true);
    const stored = findMap(id);
    expect(stored?.name).toBe("Frontier");
    expect(stored?.players).toBe(3);
    expect(stored?.tiles).toHaveLength(1);
  });

  it("edits in place by id — saving the same id overwrites, never duplicates", () => {
    const id = uniqueId("edit");
    saveSharedMap({ id, name: "First", scenarioId: "skirmish", players: 2, tiles: [] });
    saveSharedMap({ id, name: "Edited", scenarioId: "skirmish", players: 4, tiles: [] });

    const mine = listSharedMaps().filter((map) => map.id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Edited");
    expect(mine[0].players).toBe(4);
  });

  it("keeps the original creation stamp across an edit", () => {
    const id = uniqueId("stamp");
    const first = saveSharedMap({ id, name: "v1", scenarioId: "skirmish", players: 2, tiles: [] });
    const createdAt = first.ok ? first.map.createdAt : 0;
    const second = saveSharedMap({ id, name: "v2", scenarioId: "skirmish", players: 2, tiles: [] });
    expect(second.ok && second.map.createdAt).toBe(createdAt);
  });

  it("clamps an over-range player count to the map's scenario", () => {
    const id = uniqueId("clamp");
    // land-2p tops out at 2 seats — a saved 4 must come back as 2.
    saveSharedMap({ id, name: "Duel", scenarioId: "land-2p", players: 4, tiles: [] });
    expect(findMap(id)?.players).toBe(2);
  });

  it("rejects input that isn't a map (no tiles array)", () => {
    const result = saveSharedMap({ id: uniqueId("bad"), name: "no tiles" });
    expect(result.ok).toBe(false);
  });

  it("deletes a map so it stops listing (anyone may delete)", () => {
    const id = uniqueId("delete");
    saveSharedMap({ id, name: "Doomed", scenarioId: "skirmish", players: 2, tiles: [] });
    expect(findMap(id)).toBeDefined();
    deleteSharedMap(id);
    expect(findMap(id)).toBeUndefined();
  });
});
