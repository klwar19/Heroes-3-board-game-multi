import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANIME_ARTIFACT_ART_PLACEHOLDERS,
  animeArtifactArtPath,
  animeArtifactCards,
  animeXianxiaArtifactCardIds,
  animeXianxiaArtifactMajorIds,
  animeXianxiaArtifactMinorIds,
  animeXianxiaArtifactRelicIds
} from "./artifacts";
import { cardLibrary } from "@/data/cards/library";

const DECK_BACK = "/assets/player-deck-back.webp";
const assetPath = (src: string) => fileURLToPath(new URL(`../../../public${src}`, import.meta.url));
const slugOf = (id: string) => id.replace(/^anime\.artifact\./, "");

describe("Pháp Bảo artifact definitions", () => {
  it("the five V1 cards exist, are implemented, and carry a valid tier", () => {
    expect(Object.keys(animeArtifactCards).sort()).toEqual([...animeXianxiaArtifactCardIds].sort());
    for (const [id, card] of Object.entries(animeArtifactCards)) {
      expect(card.id).toBe(id);
      expect(card.kind).toBe("artifact");
      expect(card.implementationStatus, `${id} must be implemented`).toBe("implemented");
      expect(["minor", "major", "relic"]).toContain(card.artifactTier);
      // Original-content honesty: the printed text carries an "anime" tag so a
      // reader can see it is a mod card.
      expect(card.tags, `${id} tags`).toContain("anime");
    }
  });

  it("the tier deck lists partition the card set by their declared tier", () => {
    for (const id of animeXianxiaArtifactMinorIds) {
      expect(animeArtifactCards[id]?.artifactTier).toBe("minor");
    }
    for (const id of animeXianxiaArtifactMajorIds) {
      expect(animeArtifactCards[id]?.artifactTier).toBe("major");
    }
    for (const id of animeXianxiaArtifactRelicIds) {
      expect(animeArtifactCards[id]?.artifactTier).toBe("relic");
    }
    // The combined list is exactly minor ∪ major ∪ relic, no gaps/dupes.
    expect([...animeXianxiaArtifactCardIds].sort()).toEqual(
      [...animeXianxiaArtifactMinorIds, ...animeXianxiaArtifactMajorIds, ...animeXianxiaArtifactRelicIds].sort()
    );
  });

  it("registers every card into the shared card library", () => {
    for (const id of animeXianxiaArtifactCardIds) {
      expect(cardLibrary[id], `${id} must be in cardLibrary`).toBeTruthy();
    }
  });
});

describe("Pháp Bảo art placeholder contract (drop-art-later)", () => {
  it("a placeholder card routes to the deck back; a card with art routes to its own face on disk", () => {
    for (const [id, card] of Object.entries(animeArtifactCards)) {
      const slug = slugOf(id);
      const image = card.assets?.cardImage;
      expect(image, `${id} has a cardImage`).toBeTruthy();

      if (ANIME_ARTIFACT_ART_PLACEHOLDERS.has(slug)) {
        expect(image, `${id} is a placeholder ⇒ deck back`).toBe(DECK_BACK);
      } else {
        expect(image, `${id} names its own art path`).toBe(animeArtifactArtPath(slug));
        expect(existsSync(assetPath(image!)), `${id} art missing on disk at ${image}`).toBe(true);
      }
    }
  });

  it("registry hygiene: every placeholder is a real anime slug with NO art on disk yet", () => {
    const validSlugs = new Set(Object.keys(animeArtifactCards).map(slugOf));
    for (const slug of ANIME_ARTIFACT_ART_PLACEHOLDERS) {
      // No placeholder for a nonexistent card.
      expect(validSlugs.has(slug), `placeholder ${slug} must name a real anime artifact`).toBe(true);
      // A placeholder must NOT already have committed art (else it should be promoted).
      expect(
        existsSync(assetPath(animeArtifactArtPath(slug))),
        `placeholder ${slug} already has art on disk — remove it from ANIME_ARTIFACT_ART_PLACEHOLDERS`
      ).toBe(false);
    }
  });
});
