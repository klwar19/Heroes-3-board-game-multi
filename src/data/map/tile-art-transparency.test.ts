import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allTileDefinitions } from "@/data/map/tiles";

/**
 * Every face-up tile is drawn as a single rectangular <image> stretched over the
 * flower-shaped (3 × 5√3) hex bounding box (see screen.tsx `renderTileArt`). The
 * four corners of that rectangle fall OUTSIDE the flower, so the art MUST carry
 * an alpha channel that cuts them away — otherwise the corners render opaque and
 * the tile no longer blends with the board around it.
 *
 * The Bulwark starting tile (S10, /assets/board/tiles/s10.webp) originally
 * shipped as a flat lossy WebP ("VP8 ", no alpha): its corners were solid white
 * and stood out against the surrounding tiles. This test parses the WebP RIFF
 * header of every committed tile art and fails if any of them lacks an alpha
 * channel, so a flattened (white-background) tile can't be shipped again.
 *
 * We read the container header directly rather than decode pixels: no image
 * library is available in the test runtime, and the alpha flag lives in the
 * RIFF/WebP header.
 */

const assetPath = (src: string) => fileURLToPath(new URL(`../../../public${src}`, import.meta.url));

/** Decode whether a WebP file declares an alpha channel from its RIFF header. */
function webpHasAlpha(buffer: Buffer): { hasAlpha: boolean; format: string } {
  // Bytes 0-3 "RIFF", 8-11 "WEBP", 12-15 chunk fourcc.
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || webp !== "WEBP") {
    return { hasAlpha: false, format: "not-webp" };
  }
  const fourcc = buffer.toString("ascii", 12, 16);
  if (fourcc === "VP8X") {
    // Extended format: the flags byte sits right after the 4-byte chunk size.
    // Bit 0x10 is the alpha flag.
    const flags = buffer.readUInt8(20);
    return { hasAlpha: (flags & 0x10) !== 0, format: fourcc };
  }
  if (fourcc === "VP8L") {
    // Lossless: stream starts at byte 20 with the 0x2f signature, then 14b
    // width-1, 14b height-1, then the alpha_is_used bit (bit 28).
    if (buffer.readUInt8(20) !== 0x2f) {
      return { hasAlpha: false, format: fourcc };
    }
    const bits = buffer.readUInt32LE(21);
    return { hasAlpha: ((bits >> 28) & 1) === 1, format: fourcc };
  }
  // "VP8 " (trailing space) is the simple lossy format and can never carry alpha.
  return { hasAlpha: false, format: fourcc };
}

describe("tile art carries a transparent (flower-shaped) background", () => {
  it("every tile with committed art declares an alpha channel", () => {
    const checked: string[] = [];
    for (const def of Object.values(allTileDefinitions)) {
      const image = def.assets?.tileImage;
      if (!image) {
        continue;
      }
      expect(image, `${def.id} tileImage path`).toMatch(/^\/assets\/[a-z0-9/_-]+\.webp$/);
      const { hasAlpha, format } = webpHasAlpha(readFileSync(assetPath(image)));
      expect(
        hasAlpha,
        `${def.id} art ${image} has no alpha channel (WebP ${format}); its corners ` +
          `would render opaque and not blend with the board`
      ).toBe(true);
      checked.push(def.id);
    }
    // Guard the guard: the Bulwark starting tile (the one this regression
    // targets) is actually among the tiles exercised.
    expect(checked).toContain("S10");
    expect(checked.length).toBeGreaterThan(10);
  });
});
