import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { artifactCards, SCANLESS_ARTIFACTS } from "./artifacts";

const DECK_BACK = "/assets/player-deck-back.webp";
const assetPath = (src: string) =>
  fileURLToPath(new URL(`../../../public${src}`, import.meta.url));
const slugOf = (id: string) => id.replace(/^artifact\./, "");
const ORIGINAL_REPLACEMENT_SLUGS = [
  "bowstring_of_the_unicorns_mane",
  "celestial_necklace_of_bliss",
  "crown_of_the_five_seas",
  "diplomats_ring",
  "eversmoking_ring_of_sulfur",
  "lions_shield_of_courage",
  "necklace_of_dragonteeth",
  "necklace_of_swiftness",
  "orb_of_driving_rain",
  "orb_of_inhibition",
  "orb_of_silt",
  "orb_of_tempestuous_fire",
  "orb_of_the_firmament",
  "pendant_of_courage",
  "pendant_of_negativity",
  "pendant_of_second_sight",
  "plate_of_the_dying_light",
  "quiet_eye_of_the_dragon",
  "royal_armor_of_nix",
  "sandals_of_the_saint",
  "shamans_puppet",
  "shield_of_naval_glory",
  "skull_helmet",
  "thunder_helmet",
  "tome_of_air",
  "tome_of_earth",
  "tome_of_fire",
  "tome_of_water",
  "trident_of_dominion",
] as const;

describe("artifact card art is committed", () => {
  it("every artifact uses a real card face, or the deck back iff declared scanless", () => {
    const realCards: string[] = [];

    for (const [id, card] of Object.entries(artifactCards)) {
      const image = card.assets?.cardImage;
      expect(image, `${id} has a cardImage`).toBeTruthy();

      if (image === DECK_BACK) {
        expect(
          SCANLESS_ARTIFACTS.has(slugOf(id)),
          `${id} uses the deck back but is not declared in SCANLESS_ARTIFACTS`,
        ).toBe(true);
        continue;
      }

      expect(image, `${id} cardImage path`).toMatch(
        /^\/assets\/artifacts_(minor|major|relic)-[a-z0-9_]+\.webp$/,
      );
      expect(
        existsSync(assetPath(image!)),
        `${id} card face missing on disk at ${image}`,
      ).toBe(true);
      expect(
        SCANLESS_ARTIFACTS.has(slugOf(id)),
        `${id} is scanless yet names a real card face ${image}`,
      ).toBe(false);
      realCards.push(id);
    }

    for (const slug of ORIGINAL_REPLACEMENT_SLUGS) {
      const id = `artifact.${slug}`;
      expect(
        realCards,
        `${id} must use its original replacement card`,
      ).toContain(id);
    }
  });

  it("SCANLESS_ARTIFACTS is exactly the set routed to the deck back", () => {
    for (const slug of SCANLESS_ARTIFACTS) {
      const card = artifactCards[`artifact.${slug}`];
      expect(card, `artifact.${slug} exists`).toBeTruthy();
      expect(
        card!.assets?.cardImage,
        `artifact.${slug} routes to the deck back`,
      ).toBe(DECK_BACK);
    }

    expect(SCANLESS_ARTIFACTS.size).toBe(0);
  });
});
