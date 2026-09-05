import { describe, expect, it } from "vitest";
import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
import {
  CREATURE_BANK_FIELD_IMAGE,
  CREATURE_BANK_FIELD_IMAGES,
  creatureBankFieldImage
} from "./homm-assets";
import { CREATURE_BANK_IDS, POLISH_CREATURE_BANK_IDS } from "@/data/map/creature-banks";

/**
 * Locks the per-bank Creature Bank field-tile art. Before this, every bank hex
 * reused ONE generic montage, so a Crypt, a Pyramid and a Dragon Utopia looked
 * identical. These tests fail if anyone collapses the twelve banks back onto a
 * single shared image, points a bank at the wrong slug, or ships an entry whose
 * art file is not published (media-manifest.json).
 */
const assetBytes = (path: string): number => mediaFileInfo(path)!.bytes;

describe("Creature Bank field-tile art", () => {
  it("maps every one of the twelve banks to its own image", () => {
    expect(CREATURE_BANK_IDS).toHaveLength(12);
    for (const id of CREATURE_BANK_IDS) {
      expect(CREATURE_BANK_FIELD_IMAGES[id], `${id} must have its own field image`).toBe(
        `/assets/locations-${id}.webp`
      );
    }
    // The Polish set adds eight unique locations while reusing the matching
    // official art for its twelve shared structures.
    expect(Object.keys(CREATURE_BANK_FIELD_IMAGES).sort()).toEqual([...POLISH_CREATURE_BANK_IDS].sort());
  });

  it("ships distinct, compressed field art for every new Polish location", () => {
    const added = POLISH_CREATURE_BANK_IDS.filter((id) => !CREATURE_BANK_IDS.includes(id));
    expect(added).toHaveLength(8);
    const paths = added.map((id) => creatureBankFieldImage(id));
    expect(new Set(paths).size).toBe(8);
    for (const path of paths) {
      expect(path).toContain("/assets/polish-banks/location-");
      expect(hasMediaFile(path), `${path} — run npm run media:publish`).toBe(true);
      expect(assetBytes(path)).toBeLessThan(5_000);
    }
    expect(paths.reduce((sum, path) => sum + assetBytes(path), 0)).toBeLessThan(25_000);
  });

  it("gives each bank a DISTINCT image — none silently shares another's art or the generic token", () => {
    const paths = CREATURE_BANK_IDS.map((id) => creatureBankFieldImage(id));
    // Twelve banks, twelve different images: a regression to one-image-for-all
    // (the old bug) collapses this set and fails here.
    expect(new Set(paths).size).toBe(CREATURE_BANK_IDS.length);
    for (const path of paths) {
      expect(path).not.toBe(CREATURE_BANK_FIELD_IMAGE);
    }
  });

  it("resolves the bank id through creatureBankFieldImage()", () => {
    for (const id of CREATURE_BANK_IDS) {
      expect(creatureBankFieldImage(id)).toBe(CREATURE_BANK_FIELD_IMAGES[id]);
    }
  });

  it("falls back to the generic token only for a missing/unknown id", () => {
    expect(creatureBankFieldImage(undefined)).toBe(CREATURE_BANK_FIELD_IMAGE);
    expect(creatureBankFieldImage("not_a_bank")).toBe(CREATURE_BANK_FIELD_IMAGE);
  });

  it("ships a real, non-trivial art file for every bank (and the fallback)", () => {
    const files = [...Object.values(CREATURE_BANK_FIELD_IMAGES), CREATURE_BANK_FIELD_IMAGE];
    for (const path of files) {
      expect(hasMediaFile(path), `${path} must be published — run npm run media:publish`).toBe(true);
      // A truncated/placeholder download would be a few bytes; real scans are KBs.
      expect(assetBytes(path), `${path} must be a real image`).toBeGreaterThan(2000);
    }
  });
});
