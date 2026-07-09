import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pandoraCards, pandoraDeckCardIds } from "./pandora";

/**
 * Every Pandora's Box card that names a `cardImage` must resolve to a committed
 * /assets/pandora/<slug>.webp file that actually exists on disk — otherwise the
 * game renders a broken image with nothing failing in CI (the same trap the
 * spell / artifact scan checks guard). The one card without provided art
 * (pandora.power_or_morale, card 178) is allowed to omit cardImage and render as
 * a text frame; every other card MUST carry real art.
 */

const assetPath = (src: string) => fileURLToPath(new URL(`../../../public${src}`, import.meta.url));

/** The only Pandora card the provided art set has no scan for (renders as text). */
const ARTLESS = new Set(["pandora.power_or_morale"]);

describe("Pandora's Box card art is committed", () => {
  it("every Pandora card names real art on disk (except the one artless card)", () => {
    for (const [id, card] of Object.entries(pandoraCards)) {
      const image = card.assets?.cardImage;
      if (ARTLESS.has(id)) {
        expect(image, `${id} is the artless card and must omit cardImage`).toBeUndefined();
        continue;
      }
      expect(image, `${id} must name a cardImage`).toBeTruthy();
      expect(image, `${id} cardImage path`).toMatch(/^\/assets\/pandora\/[a-z0-9_]+\.webp$/);
      expect(existsSync(assetPath(image!)), `${id} art missing on disk at ${image}`).toBe(true);
    }
  });

  it("every decked Pandora card is defined and (art-wise) accounted for", () => {
    for (const id of pandoraDeckCardIds) {
      expect(pandoraCards[id], `${id} in the deck list must be defined`).toBeTruthy();
    }
    // The deck holds every implemented card; the artless one is still decked.
    expect(pandoraDeckCardIds).toContain("pandora.power_or_morale");
  });
});
