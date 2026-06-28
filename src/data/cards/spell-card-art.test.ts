import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cardLibrary } from "./library";
import { SCANLESS_SPELLS } from "./spells";

/**
 * Every spell card's `cardImage` must resolve to something real:
 *   - a committed /assets/spells-<slug>.webp scan that exists on disk, OR
 *   - the deck-back placeholder, but ONLY for a slug declared in SCANLESS_SPELLS
 *     (the spells the fan wiki has no scan for — it shows the deck back too).
 *
 * Without this, a spell could reference a scan that was never committed (exactly
 * how spells-disrupting_ray.webp / view_air / view_earth / remove_obstacle and
 * the elemental/protection spells slipped through) and the game would render a
 * broken image with nothing failing in CI. This is the spell counterpart of
 * ability-war-machine-art.test.ts and the artifact scan checks.
 */

const DECK_BACK = "/assets/player-deck-back.webp";
const assetPath = (src: string) => fileURLToPath(new URL(`../../../public${src}`, import.meta.url));
const slugOf = (id: string) => id.replace(/^spell\./, "");

describe("spell card art is committed", () => {
  it("every spell cardImage points at a real scan, or the deck back iff scanless", () => {
    const realScans: string[] = [];
    const deckBacks: string[] = [];
    for (const [id, card] of Object.entries(cardLibrary)) {
      if (card.kind !== "spell") continue;
      const image = card.assets?.cardImage;
      expect(image, `${id} has a cardImage`).toBeTruthy();

      if (image === DECK_BACK) {
        // The deck back is allowed only as a consciously-declared placeholder.
        expect(SCANLESS_SPELLS.has(slugOf(id)), `${id} uses the deck back but is not declared in SCANLESS_SPELLS`).toBe(
          true
        );
        deckBacks.push(id);
        continue;
      }

      expect(image, `${id} cardImage path`).toMatch(/^\/assets\/spells-[a-z0-9_]+\.(webp|svg)$/);
      expect(existsSync(assetPath(image!)), `${id} scan missing on disk at ${image}`).toBe(true);
      // A scanless spell must NOT also name a real per-slug file.
      expect(SCANLESS_SPELLS.has(slugOf(id)), `${id} is scanless yet names a real scan ${image}`).toBe(false);
      realScans.push(id);
    }

    // Guard the guard: the freshly downloaded scans are exercised as REAL art,
    // not silently re-routed to the deck back.
    for (const id of [
      "spell.disrupting_ray",
      "spell.view_air",
      "spell.view_earth",
      "spell.remove_obstacle",
      "spell.summon_air_elemental",
      "spell.summon_earth_elemental",
      "spell.summon_fire_elemental",
      "spell.summon_water_elemental"
    ]) {
      expect(realScans, `${id} must use its real scan`).toContain(id);
    }
    expect(realScans.length).toBeGreaterThan(30);
  });

  it("SCANLESS_SPELLS are exactly the spells routed to the deck back", () => {
    for (const slug of SCANLESS_SPELLS) {
      const card = cardLibrary[`spell.${slug}`];
      expect(card, `spell.${slug} exists`).toBeTruthy();
      expect(card!.assets?.cardImage, `spell.${slug} routes to the deck back`).toBe(DECK_BACK);
    }
    // Sanity: a couple of the known-scanless spells are declared.
    expect(SCANLESS_SPELLS.has("magic_mirror")).toBe(true);
    expect(SCANLESS_SPELLS.has("summon_air_elemental")).toBe(false);
    expect(cardLibrary["spell.summon_air_elemental"]?.assets?.cardImage).toBe(
      "/assets/spells-summon_air_elemental.webp"
    );
    // Sanity: a spell WITH a real scan is not mislabelled scanless.
    expect(SCANLESS_SPELLS.has("disrupting_ray")).toBe(false);
  });
});
