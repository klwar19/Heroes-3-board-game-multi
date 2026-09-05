/**
 * Polish Set Artifacts art: the 11 set CARD faces and the 11 set ICONS.
 *
 * Asserts the FILES, not just the path strings: every set in `ARTIFACT_SETS`
 * resolves to a real webp of the right family size (743×1040 card faces, the
 * same as every other Artifact card face; 256×256 transparent icon badges), and
 * nothing is a stub. Rebuild with
 * `node scripts/build-set-artifact-art.mjs --src <author's asset drop>`.
 *
 * The masters are 2-3.5MB PNGs and are deliberately NOT committed; the raw
 * filename each set came from is recorded in that script's `SOURCES` table.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hasMediaFile, localMediaPath, mediaExtensionOf, mediaFileInfo } from "@/lib/media-manifest";
import { ARTIFACT_SETS, artifactSetCardImage, artifactSetIconImage } from "@/data/cards/artifact-sets";

describe("Polish Set Artifacts art", () => {
  it("ships a 743×1040 card face for every one of the 11 sets", () => {
    expect(ARTIFACT_SETS).toHaveLength(11);
    for (const set of ARTIFACT_SETS) {
      const url = artifactSetCardImage(set.id);
      expect(
        hasMediaFile(url),
        `missing set card face for ${set.id}: ${url} (publish it with \`npm run media:publish\`)`
      ).toBe(true);
      const info = mediaFileInfo(url)!;
      expect([set.id, mediaExtensionOf(url), info.width, info.height]).toEqual([set.id, "webp", 743, 1040]);
      // A real scan, never a 1KB placeholder.
      expect(info.bytes, `${set.id} card face looks like a stub`).toBeGreaterThan(40 * 1024);
    }
  });

  it("ships a 256×256 transparent icon badge for every one of the 11 sets", async () => {
    for (const set of ARTIFACT_SETS) {
      const url = artifactSetIconImage(set.id);
      expect(
        hasMediaFile(url),
        `missing set icon for ${set.id}: ${url} (publish it with \`npm run media:publish\`)`
      ).toBe(true);
      const info = mediaFileInfo(url)!;
      expect([set.id, mediaExtensionOf(url), info.width, info.height]).toEqual([set.id, "webp", 256, 256]);
      expect(info.bytes, `${set.id} icon looks like a stub`).toBeGreaterThan(2 * 1024);
      // The alpha channel needs the BYTES: checked only when the media tree is on this disk.
      const file = localMediaPath(url);
      if (!file) continue;
      const meta = await sharp(file).metadata();
      expect([set.id, Boolean(meta.hasAlpha)]).toEqual([set.id, true]);
    }
  });

  it("derives both paths from the set id, so a file can never drift from its set", () => {
    expect(artifactSetCardImage("golden_goose")).toBe("/assets/set-artifacts/cards/golden_goose.webp");
    expect(artifactSetIconImage("golden_goose")).toBe("/assets/set-artifacts/icons/golden_goose.webp");
  });
});
