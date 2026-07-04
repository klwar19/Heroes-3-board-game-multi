import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { coreFactionDefinitions } from "@/data/factions/core";
import { TOWN_TRACK_VALUES, townBoardBarIndex, townBoardSpecs, townBoardTileArt } from "./boards";

/** Resolve an /assets path to its file on disk and assert it carries real art. */
function assertRealArt(assetPath: string, minBytes = 3000) {
  expect(assetPath.startsWith("/assets/"), `${assetPath} must be a local /assets path`).toBe(true);
  const file = fileURLToPath(new URL(`../../../public${assetPath}`, import.meta.url));
  expect(existsSync(file), `${assetPath} must exist on disk`).toBe(true);
  expect(statSync(file).size, `${assetPath} must contain real art`).toBeGreaterThan(minBytes);
}

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
      // A fully-built image only makes sense over an empty base to reveal from:
      // an empty scan (scan boards) OR the empty panorama (designed boards).
      if (spec.fullImage) {
        expect(Boolean(spec.emptyImage || spec.panoramaImage)).toBe(true);
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

  it("designed boards carry the authentic tracks/tokens panel at a rectangle that covers their printed geometry", () => {
    for (const spec of Object.values(townBoardSpecs)) {
      if (spec.emptyImage) {
        // Scan boards print their own panel — no pasted crop.
        expect(spec.panelImage, `${spec.factionId} is a scan board and needs no panelImage`).toBeUndefined();
        continue;
      }
      const panel = spec.geometry.panel;
      expect(spec.panelImage, `${spec.factionId} designed board must paste the authentic panel`).toBeTruthy();
      expect(panel, `${spec.factionId} needs the panel rectangle`).toBeTruthy();
      expect(panel!.left).toBeLessThan(panel!.right);
      expect(panel!.top).toBeLessThan(panel!.bottom);
      expect(panel!.right).toBeLessThanOrEqual(1);
      expect(panel!.bottom).toBeLessThanOrEqual(1);
      // The printed cells and wells the markers/buttons land on must all sit
      // INSIDE the pasted crop, or they would float on bare background.
      const { tracks, tokens } = spec.geometry;
      for (const row of tracks.rows) {
        expect(row.y).toBeGreaterThan(panel!.top);
        expect(row.y).toBeLessThan(panel!.bottom);
      }
      expect(tracks.firstCellX).toBeGreaterThan(panel!.left);
      expect(tracks.firstCellX + 7 * tracks.cellPitchX).toBeLessThan(panel!.right);
      for (const slot of tokens.slots) {
        expect(slot.x).toBeGreaterThan(panel!.left);
        expect(slot.x).toBeLessThan(panel!.right);
        expect(slot.y).toBeGreaterThan(panel!.top);
        expect(slot.y).toBeLessThan(panel!.bottom);
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

  describe("stronghold — real printed board-game tiles (no placeholders)", () => {
    const spec = townBoardSpecs.stronghold;

    it("ships a real printed built-art tile on disk for every single-building bar", () => {
      // The six one-building bars (City Hall, Fort under the Nest, Hall of
      // Valhalla, Citadel, Mage Guild, Mountain Caves) each overlay their own
      // printed tile — Citadel & Mage Guild were the last placeholders and are
      // now the real board scans too.
      const singles = spec.bars.filter((bar) => bar.length === 1).flat();
      expect(singles).toHaveLength(6);
      for (const buildingId of singles) {
        assertRealArt(townBoardTileArt(buildingId));
      }
    });

    it("draws the shared bar as a printed double-sided tile (one-built / both-built), both faces on disk", () => {
      // Exactly one two-building bar, and it is the Barracks Tower + Freelancer's
      // Guild pair the combined tile is authored for.
      const shared = spec.bars.filter((bar) => bar.length === 2);
      expect(shared).toHaveLength(1);
      expect([...shared[0]].sort()).toEqual(
        ["stronghold.dwelling_bronze", "stronghold.freelancers_guild"].sort()
      );
      // The combined-tile faces are wired and present as real art.
      expect(spec.combinedTile).toBeTruthy();
      expect(spec.combinedTile!.oneBuiltImage).toBe("/assets/town-board/stronghold-shared-one.webp");
      expect(spec.combinedTile!.bothBuiltImage).toBe("/assets/town-board/stronghold-shared-both.webp");
      assertRealArt(spec.combinedTile!.oneBuiltImage);
      assertRealArt(spec.combinedTile!.bothBuiltImage);
      // The two faces are genuinely different art (one shows a name/cost plate).
      expect(spec.combinedTile!.oneBuiltImage).not.toBe(spec.combinedTile!.bothBuiltImage);
    });

    it("is the only board that uses a combined shared tile (others still split)", () => {
      for (const [factionId, other] of Object.entries(townBoardSpecs)) {
        if (factionId === "stronghold") {
          continue;
        }
        expect(other.combinedTile, `${factionId} should not carry a combinedTile`).toBeUndefined();
      }
    });
  });
});
