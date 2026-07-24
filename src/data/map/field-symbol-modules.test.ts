import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { allTileDefinitions } from "@/data/map/tiles";
import {
  FIELD_SYMBOL_MINE,
  FIELD_SYMBOL_RESOURCE,
  FIELD_SYMBOL_TREASURE,
  fieldSymbolOverlayFor
} from "./field-symbol-modules";

function assertRealArt(assetPath: string, minBytes = 2_000) {
  expect(assetPath.startsWith("/assets/")).toBe(true);
  const file = fileURLToPath(new URL(`../../../public${assetPath}`, import.meta.url));
  expect(existsSync(file), `${assetPath} missing`).toBe(true);
  expect(statSync(file).size, `${assetPath} empty`).toBeGreaterThan(minBytes);
}

describe("field symbol modules (attach, not whole-tile bake)", () => {
  it("ships real transparent modules for resource, treasure, and each mine resource", () => {
    assertRealArt(FIELD_SYMBOL_RESOURCE, 1_000);
    assertRealArt(FIELD_SYMBOL_TREASURE);
    for (const path of Object.values(FIELD_SYMBOL_MINE)) {
      assertRealArt(path);
    }
  });

  it("uses the canonical field glyphs", () => {
    expect(FIELD_SYMBOL_RESOURCE).toBe("/assets/glyphs/resource-yellow.svg");
    expect(FIELD_SYMBOL_MINE.buildingMaterials).toBe("/assets/glyphs/building_materials.svg");
  });

  it("maps standard starting-package fields to the right modules", () => {
    expect(fieldSymbolOverlayFor({ location: "resource_symbol" })).toEqual({
      kind: "resource",
      image: FIELD_SYMBOL_RESOURCE
    });
    expect(fieldSymbolOverlayFor({ location: "treasure_symbol", difficulty: 1 })).toEqual({
      kind: "treasure",
      image: FIELD_SYMBOL_TREASURE,
      difficulty: 1
    });
    expect(
      fieldSymbolOverlayFor({
        location: "mine",
        difficulty: 1,
        resource: "buildingMaterials",
        amount: 2
      })
    ).toEqual({
      kind: "mine",
      image: FIELD_SYMBOL_MINE.buildingMaterials,
      difficulty: 1,
      amount: 2
    });
  });

  it("CONTROL: empty / blocked / town / learning stone attach nothing", () => {
    for (const location of ["empty_field", "blocked_field", "town", "learning_stone"]) {
      expect(fieldSymbolOverlayFor({ location }), location).toBeNull();
    }
  });

  it("anime seats bake icons into tile art — no runtime attach double", () => {
    expect(allTileDefinitions["A-S1"]?.assets?.attachFieldSymbols).toBeFalsy();
    expect(allTileDefinitions["W-S1"]?.assets?.attachFieldSymbols).toBeFalsy();
    // CONTROL: classic printed seats never attach.
    expect(allTileDefinitions.S4?.assets?.attachFieldSymbols).toBeFalsy();
    expect(allTileDefinitions.S3?.assets?.attachFieldSymbols).toBeFalsy();
  });

  it("anime starting tiles carry the standard starting bonus package", () => {
    for (const id of ["A-S1", "W-S1"] as const) {
      const fields = allTileDefinitions[id].fields;
      const locations = fields.map((field) => field.location);
      expect(locations).toContain("town");
      expect(locations).toContain("resource_symbol");
      expect(locations).toContain("treasure_symbol");
      expect(locations).toContain("mine");
      expect(locations).toContain("blocked_field");
      expect(locations.filter((location) => location === "empty_field").length).toBe(2);
      expect(locations).not.toContain("learning_stone");
      const mine = fields.find((field) => field.location === "mine")!;
      expect(mine.difficulty).toBe(1);
      expect(mine.resource).toBe("buildingMaterials");
      expect(mine.amount).toBe(2);
      const treasure = fields.find((field) => field.location === "treasure_symbol")!;
      expect(treasure.difficulty).toBe(1);
    }
  });
});
