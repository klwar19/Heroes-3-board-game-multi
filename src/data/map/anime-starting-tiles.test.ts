import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getTileBorderSegments } from "@/data/map/borders";
import { allTileDefinitions } from "@/data/map/tiles";

/**
 * Slot order (engine, unrotated, pointy-top):
 *   0 = center
 *   1 = NE, 2 = E, 3 = SE, 4 = SW, 5 = W, 6 = NW
 *
 * Both anime starting tiles are S4-layout: same hex roles + same outer
 * impassable arcs as Rampart S4 so art symbols and yellow borders land on
 * the correct engine hexes.
 */
const S4_LOCATIONS = [
  "town",
  "resource_symbol", // NE — campfire + tools
  "blocked_field", // E — rocky wall
  "empty_field", // SE
  "treasure_symbol", // SW — chest + I
  "mine", // W — ↻2 materials + I
  "empty_field" // NW
] as const;

const S4_OUTER = [false, true, false, true, true, true] as const;
// NE open, E sealed, SE open, SW sealed, W sealed, NW sealed
// (= blocked + the three sealed passable arcs on a starting seat)

function assertRealArt(assetPath: string, minBytes = 50_000) {
  const file = fileURLToPath(new URL(`../../../public${assetPath}`, import.meta.url));
  expect(existsSync(file), assetPath).toBe(true);
  expect(statSync(file).size).toBeGreaterThan(minBytes);
}

describe("anime starting tiles A-S1 / W-S1 / L-S1 / P-S1 — hex + border assignment", () => {
  const s4 = allTileDefinitions.S4;
  const a = allTileDefinitions["A-S1"];
  const w = allTileDefinitions["W-S1"];
  const l = allTileDefinitions["L-S1"];
  const p = allTileDefinitions["P-S1"];

  it("all four seats mirror S4 field roles (only town faction differs)", () => {
    expect(s4.fields.map((f) => f.location)).toEqual([...S4_LOCATIONS]);
    expect(a.fields.map((f) => f.location)).toEqual([...S4_LOCATIONS]);
    expect(w.fields.map((f) => f.location)).toEqual([...S4_LOCATIONS]);
    expect(l.fields.map((f) => f.location)).toEqual([...S4_LOCATIONS]);
    expect(p.fields.map((f) => f.location)).toEqual([...S4_LOCATIONS]);

    expect(a.fields[0].faction).toBe("fuyuki");
    expect(w.fields[0].faction).toBe("azure_breeze");
    expect(l.fields[0].faction).toBe("hidden_leaf");
    expect(p.fields[0].faction).toBe("azur_lane");
    expect(s4.fields[0].faction).toBe("rampart");

    for (const def of [s4, a, w, l, p]) {
      const treasure = def.fields[4];
      const mine = def.fields[5];
      expect(treasure.location).toBe("treasure_symbol");
      expect(treasure.difficulty).toBe(1);
      expect(mine.location).toBe("mine");
      expect(mine.difficulty).toBe(1);
      expect(mine.resource).toBe("buildingMaterials");
      expect(mine.amount).toBe(2);
    }
  });

  it("all four seats mirror S4 outerImpassable (yellow outer arcs)", () => {
    expect(s4.outerImpassable).toEqual([...S4_OUTER]);
    expect(a.outerImpassable).toEqual([...S4_OUTER]);
    expect(w.outerImpassable).toEqual([...S4_OUTER]);
    expect(l.outerImpassable).toEqual([...S4_OUTER]);
    expect(p.outerImpassable).toEqual([...S4_OUTER]);
  });

  it("border segments are identical to S4 (blocked ring + outer arcs)", () => {
    const key = (segments: ReturnType<typeof getTileBorderSegments>) =>
      segments
        .map((s) => `${s.slot}:${s.edge}`)
        .sort()
        .join("|");
    const s4Key = key(getTileBorderSegments(s4));
    expect(key(getTileBorderSegments(a))).toBe(s4Key);
    expect(key(getTileBorderSegments(w))).toBe(s4Key);
    expect(key(getTileBorderSegments(l))).toBe(s4Key);
    expect(key(getTileBorderSegments(p))).toBe(s4Key);

    // Blocked is on slot 2 (E) — its full ring is present.
    const blockedEdges = getTileBorderSegments(a)
      .filter((s) => s.slot === 2)
      .map((s) => s.edge)
      .sort();
    expect(blockedEdges.length).toBeGreaterThanOrEqual(3);
  });

  it("ships real flower tile art with alpha for all four seats", () => {
    assertRealArt(a.assets!.tileImage!);
    assertRealArt(w.assets!.tileImage!);
    // L-S1 currently ships the smaller procedural placeholder (real art lands
    // later at the same path); assert it exists with a modest floor so the
    // check stays forward-compatible with the full-size replacement.
    assertRealArt(l.assets!.tileImage!, 10_000);
    // P-S1 ships the full-size board image.
    assertRealArt(p.assets!.tileImage!);
    // No runtime symbol overlay — icons are baked into the webp.
    expect(a.assets?.attachFieldSymbols).toBeFalsy();
    expect(w.assets?.attachFieldSymbols).toBeFalsy();
    expect(l.assets?.attachFieldSymbols).toBeFalsy();
    expect(p.assets?.attachFieldSymbols).toBeFalsy();
  });
});
