import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pandoraCards, pandoraDeckCardIds } from "./pandora";

/**
 * Every Pandora's Box card must name a `cardImage` resolving to a committed
 * /assets/pandora/<slug>.webp file that actually exists on disk — otherwise the
 * game renders a broken image with nothing failing in CI (the same trap the
 * spell / artifact scan checks guard). The one card the scan set had no face
 * for (pandora.power_or_morale, card 178) now ships a composited face built by
 * scripts/build-pandora-power-card.mjs, so NO artless card remains.
 */

const assetPath = (src: string) => fileURLToPath(new URL(`../../../public${src}`, import.meta.url));

describe("Pandora's Box card art is committed", () => {
  it("every Pandora card names real art on disk (no artless card remains)", () => {
    for (const [id, card] of Object.entries(pandoraCards)) {
      const image = card.assets?.cardImage;
      expect(image, `${id} must name a cardImage`).toBeTruthy();
      expect(image, `${id} cardImage path`).toMatch(/^\/assets\/pandora\/[a-z0-9_]+\.webp$/);
      expect(existsSync(assetPath(image!)), `${id} art missing on disk at ${image}`).toBe(true);
    }
  });

  it("every decked Pandora card is defined and (art-wise) accounted for", () => {
    for (const id of pandoraDeckCardIds) {
      expect(pandoraCards[id], `${id} in the deck list must be defined`).toBeTruthy();
    }
    // The deck holds every implemented card, the once-artless one included.
    expect(pandoraDeckCardIds).toContain("pandora.power_or_morale");
  });
});
