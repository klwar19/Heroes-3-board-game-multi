import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hasLocalMediaTree, hasMediaFile, localMediaPath, mediaFileInfo } from "@/lib/media-manifest";

// The two war machines whose fan-wiki entry is a deck-back/placeholder, so we
// build an original face from a generated illustration + the First Aid Tent
// frame. slug -> [source illustration, shipped card face].
const GENERATED = {
  cannon: ["war_machines-cannon-art.webp", "war_machines-cannon.webp"],
  catapult: ["war_machines-catapult-art.webp", "war_machines-catapult.webp"],
} as const;

/** The published URL of an asset in this family ("war_machines-cannon.webp" → "/assets/…"). */
function assetUrl(assetName: string): string {
  return `/assets/${assetName}`;
}

/** Absolute path of the asset when this checkout pulled the media tree, else null. */
function onDisk(assetName: string): string | null {
  return localMediaPath(assetUrl(assetName));
}

function repoFile(relative: string): string {
  return fileURLToPath(new URL(`../../../${relative}`, import.meta.url));
}

// Re-create the build script's illustration transform so the test can prove the
// committed face really contains the processed source art (and is not a blank,
// swapped, or garbled window). Must mirror preparedArt() in
// scripts/build-war-machine-cards.mjs.
async function preparedArt(sourceName: string): Promise<Buffer> {
  return sharp(onDisk(sourceName)!)
    .resize(611, 569, { fit: "cover", position: "centre" })
    .modulate({ saturation: 0.94, brightness: 0.96 })
    .sharpen({ sigma: 0.45 })
    .webp({ quality: 94, effort: 6 })
    .toBuffer();
}

describe("generated Cannon and Catapult card faces", () => {
  it("ships full-size portrait cards, compressed to the repo's q94 band", () => {
    for (const [, [, output]] of Object.entries(GENERATED)) {
      const url = assetUrl(output);
      expect(hasMediaFile(url), `${output} unpublished (run \`npm run media:publish\`)`).toBe(true);
      const info = mediaFileInfo(url)!;
      const size = info.bytes;
      // Real, full-bleed art (a tiny placeholder icon would be far smaller), but
      // lossy WebP at quality 94 — the repo standard for every committed card
      // face. The upper bound is what enforces the compression: the earlier q96
      // build shipped these at ~268–275KB and a lossless rebuild is far larger,
      // so a regression away from q94 fails here.
      expect(size, output).toBeGreaterThan(150_000);
      expect(size, output).toBeLessThan(260_000);
      expect(info.width, output).toBe(743);
      expect(info.height, output).toBe(1040);
    }
  });

  // Pixel comparison needs the BYTES of both the source art and the face:
  // runs only on a checkout that pulled the media tree.
  it.skipIf(!hasLocalMediaTree())("composites the real source illustration into each face (lossy re-encode stays within a tiny delta)", async () => {
    // The illustration window is placed at (66, 161) sized 611x569 by the build
    // script. Comparing it to a fresh preparedArt() render of the source proves
    // the committed face IS that illustration, only recompressed. Observed mean
    // absolute per-channel deltas are < 2; a wrong, blank, or corrupted window
    // would diverge by tens to hundreds, so this permits the compression yet
    // still fails if the art is swapped or lost.
    for (const [, [source, output]] of Object.entries(GENERATED)) {
      const face = onDisk(output);
      if (!face || !onDisk(source)) continue;
      const reference = await sharp(await preparedArt(source)).raw().toBuffer();
      const refMeta = await sharp(await preparedArt(source)).metadata();
      const faceMeta = await sharp(face).metadata();
      const window = await sharp(face)
        .extract({ left: 66, top: 161, width: 611, height: 569 })
        .raw()
        .toBuffer();
      const rc = refMeta.channels ?? 3;
      const fc = faceMeta.channels ?? 4;
      const pixels = 611 * 569;
      let total = 0;
      for (let p = 0; p < pixels; p += 1) {
        for (let c = 0; c < 3; c += 1) {
          total += Math.abs(reference[p * rc + c] - window[p * fc + c]);
        }
      }
      const meanAbsDiff = total / (pixels * 3);
      expect(meanAbsDiff, `${output} illustration delta`).toBeLessThan(4);
    }
  });

  it("keeps the source illustrations, compositor, and wiki glyphs reproducible", () => {
    for (const [, [source]] of Object.entries(GENERATED)) {
      expect(hasMediaFile(assetUrl(source)), `${source} unpublished (run \`npm run media:publish\`)`).toBe(true);
    }

    const builder = readFileSync(
      repoFile("scripts/build-war-machine-cards.mjs"),
      "utf8",
    );
    for (const slug of Object.keys(GENERATED)) {
      expect(builder).toContain(`slug: "${slug}"`);
    }
    // Glyphs live in scripts/card-glyphs — the same place every other card build
    // script reads from. building_materials + permanent are added for these
    // cards; expert + damage already existed.
    for (const glyph of ["permanent", "expert", "building_materials", "damage"]) {
      expect(
        existsSync(repoFile(`scripts/card-glyphs/${glyph}.svg`)),
        glyph,
      ).toBe(true);
      expect(builder).toContain(`name: "${glyph}"`);
    }
  });
});
