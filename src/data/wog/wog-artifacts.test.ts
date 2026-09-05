import { describe, expect, it } from "vitest";
import { hasMediaFile } from "@/lib/media-manifest";
import {
  wogArtifactArtPath,
  wogArtifactCards,
  wogArtifactCardIds,
  wogArtifactMajorIds,
  wogArtifactMinorIds,
  wogArtifactRelicIds
} from "./artifacts";
import { cardLibrary } from "@/data/cards/library";

const slugOf = (id: string) => id.replace(/^wog\.artifact\./, "");

describe("Wake of Gods artifact definitions", () => {
  it("the five cards exist, are implemented, carry a valid tier and a 'wog' tag", () => {
    expect(Object.keys(wogArtifactCards).sort()).toEqual([...wogArtifactCardIds].sort());
    for (const [id, card] of Object.entries(wogArtifactCards)) {
      expect(card.id).toBe(id);
      expect(card.kind).toBe("artifact");
      expect(card.implementationStatus, `${id} must be implemented`).toBe("implemented");
      expect(["minor", "major", "relic"]).toContain(card.artifactTier);
      // Original-content honesty: the printed text carries a "wog" tag so a
      // reader can see it is a mod card.
      expect(card.tags, `${id} tags`).toContain("wog");
    }
  });

  it("the tier deck lists partition the card set by their declared tier", () => {
    for (const id of wogArtifactMinorIds) {
      expect(wogArtifactCards[id]?.artifactTier).toBe("minor");
    }
    for (const id of wogArtifactMajorIds) {
      expect(wogArtifactCards[id]?.artifactTier).toBe("major");
    }
    for (const id of wogArtifactRelicIds) {
      expect(wogArtifactCards[id]?.artifactTier).toBe("relic");
    }
    // The combined list is exactly minor ∪ major ∪ relic, no gaps/dupes.
    expect([...wogArtifactCardIds].sort()).toEqual(
      [...wogArtifactMinorIds, ...wogArtifactMajorIds, ...wogArtifactRelicIds].sort()
    );
  });

  it("registers every card into the shared card library", () => {
    for (const id of wogArtifactCardIds) {
      expect(cardLibrary[id], `${id} must be in cardLibrary`).toBeTruthy();
    }
  });

  it("art hygiene: every card names its own committed face on disk under public/", () => {
    for (const [id, card] of Object.entries(wogArtifactCards)) {
      const slug = slugOf(id);
      const image = card.assets?.cardImage;
      expect(image, `${id} has a cardImage`).toBeTruthy();
      // No placeholder registry for WOG — every card ships with real art, so the
      // path must be its own slug face AND that file must exist on disk.
      expect(image, `${id} names its own art path`).toBe(wogArtifactArtPath(slug));
      expect(
        hasMediaFile(image!),
        `${id} art unpublished at ${image} (run \`npm run media:publish\`)`
      ).toBe(true);
    }
  });
});
