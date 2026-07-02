import { describe, expect, it } from "vitest";

import { coreFactionDefinitions } from "@/data/factions/core";
import { TOWN_TRACK_VALUES, townBoardBarIndex, townBoardSpecs, townBoardTileArt } from "./boards";

describe("town board manifest", () => {
  it("ships a board spec for every faction", () => {
    for (const faction of Object.values(coreFactionDefinitions)) {
      expect(townBoardSpecs[faction.id], `${faction.id} has no town board spec`).toBeTruthy();
    }
  });

  it("lays out each faction's 8 buildings on 7 bars with exactly one shared bar", () => {
    for (const faction of Object.values(coreFactionDefinitions)) {
      const spec = townBoardSpecs[faction.id];
      expect(spec.bars).toHaveLength(7);
      const flat = spec.bars.flat();
      // The bars carry the faction's buildings exactly once each.
      expect([...flat].sort()).toEqual([...faction.buildings].sort());
      const shared = spec.bars.filter((bar) => bar.length === 2);
      expect(shared, `${faction.id} must have exactly one two-building bar`).toHaveLength(1);
      expect(spec.bars.every((bar) => bar.length === 1 || bar.length === 2)).toBe(true);
    }
  });

  it("every board has an art source (scan or panorama) and sane geometry", () => {
    for (const spec of Object.values(townBoardSpecs)) {
      expect(
        Boolean(spec.emptyImage || spec.panoramaImage),
        `${spec.factionId} board needs an empty scan or a panorama`
      ).toBe(true);
      // A fully-built scan only makes sense on top of an empty scan.
      if (spec.fullImage) {
        expect(spec.emptyImage).toBeTruthy();
      }
      const { window, tracks, tokens, definitions, aspect } = spec.geometry;
      expect(aspect[0]).toBeGreaterThan(aspect[1]);
      expect(window.left).toBeGreaterThan(0);
      expect(window.top).toBeGreaterThan(0);
      expect(window.bottom).toBeGreaterThan(window.top);
      expect(window.bottom).toBeLessThan(1);
      // Seven bars fit inside the board.
      expect(window.left + 7 * window.barPitch).toBeLessThanOrEqual(1);
      expect(definitions.right).toBeGreaterThan(definitions.left);
      expect(definitions.bottom).toBeGreaterThan(definitions.top);
      expect(tracks.rows).toHaveLength(3);
      for (const row of tracks.rows) {
        expect(row.values).toEqual(TOWN_TRACK_VALUES[row.resource]);
        expect(row.y).toBeGreaterThan(window.bottom);
        expect(row.y).toBeLessThan(1);
      }
      // The last track cell stays on the board.
      expect(tracks.firstCellX + 7 * tracks.cellPitchX).toBeLessThan(1);
      expect(tokens.slots.map((slot) => slot.kind)).toEqual(["build", "population", "spellBook"]);
      for (const slot of tokens.slots) {
        expect(slot.x).toBeGreaterThan(0.5);
        expect(slot.y).toBeGreaterThan(window.bottom);
      }
    }
  });

  it("the printed tracks step exactly like the engine's resource-gain levels (+5/+2/+1)", () => {
    const steps = (values: readonly number[]) => values.slice(1).map((value, index) => value - values[index]);
    expect(new Set(steps(TOWN_TRACK_VALUES.gold))).toEqual(new Set([5]));
    expect(new Set(steps(TOWN_TRACK_VALUES.buildingMaterials))).toEqual(new Set([2]));
    expect(new Set(steps(TOWN_TRACK_VALUES.valuables))).toEqual(new Set([1]));
  });

  it("townBoardBarIndex / townBoardTileArt resolve building ids", () => {
    const spec = townBoardSpecs.inferno;
    expect(townBoardBarIndex(spec, "inferno.city_hall")).toBe(0);
    expect(townBoardBarIndex(spec, "inferno.brimstone_stormclouds")).toBe(2);
    expect(townBoardBarIndex(spec, "castle.city_hall")).toBe(-1);
    expect(townBoardTileArt("conflux.city_hall")).toBe("/assets/town-board/conflux-city_hall.webp");
  });
});
