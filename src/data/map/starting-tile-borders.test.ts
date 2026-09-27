import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";

/**
 * Official starting-tile border rule (S1–S9 as printed): the blocked field and
 * the three ring fields OPPOSITE it are sealed; the two ring fields beside the
 * blocked field keep open outer approaches. The Factory / Bulwark / Forge
 * starting tiles (S10 / S11 / S12) must follow it too — their art is drawn from
 * the same rule by scripts/build-expansion-starting-tiles.mjs.
 */
const expectedSeal = (blockedSlot: number): boolean[] =>
  Array.from({ length: 6 }, (_, i) => {
    const offset = (i + 1 - blockedSlot + 6) % 6;
    return offset !== 1 && offset !== 5;
  });

describe("starting tiles seal the blocked field and the three fields opposite it", () => {
  const ids = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"];

  it.each(ids)("%s", (id) => {
    const tile = allTileDefinitions[id];
    expect(tile, id).toBeDefined();
    const blocked = tile.fields.findIndex((field) => field.location === "blocked_field");
    expect(blocked, `${id} has one ring blocked field`).toBeGreaterThan(0);
    expect(tile.outerImpassable).toEqual(expectedSeal(blocked));
  });

  it("puts the Factory, Bulwark and Forge blocked fields where the designer's tiles do", () => {
    const blockedSlot = (id: string) => allTileDefinitions[id].fields.findIndex((f) => f.location === "blocked_field");
    expect(blockedSlot("S10")).toBe(6); // NW
    expect(blockedSlot("S11")).toBe(2); // E
    expect(blockedSlot("S12")).toBe(3); // SE
    expect(allTileDefinitions.S10.fields[0]).toMatchObject({ location: "town", faction: "factory" });
    expect(allTileDefinitions.S11.fields[0]).toMatchObject({ location: "town", faction: "bulwark" });
    expect(allTileDefinitions.S12.fields[0]).toMatchObject({ location: "town", faction: "forge" });
  });
});
