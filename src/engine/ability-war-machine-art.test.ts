import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cardLibrary } from "@/data/cards/library";

/**
 * Every ability and war-machine card whose definition names a `cardImage` must
 * have that file on disk. Without this, a card can reference a scan that was
 * never committed (the Diplomacy / Artillery / Ballistics / Pathfinding cards
 * each pointed at a missing /assets/abilities-*.webp) and the game would render
 * a broken image with nothing failing in CI. This is the abilities/war-machines
 * counterpart of the existing astrologers / Cove / hero-specialty art checks.
 */

const assetPath = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

describe("ability & war-machine card art is committed", () => {
  it("every ability/war-machine cardImage points at a file that exists", () => {
    const checked: string[] = [];
    for (const card of Object.values(cardLibrary)) {
      if (card.kind !== "ability" && card.kind !== "war-machine") {
        continue;
      }
      const image = card.assets?.cardImage;
      if (!image) {
        // Catapult ships with no card art (the fan wiki has no scan for it — it
        // falls back to the deck back), so there is nothing to verify on disk.
        // (Cannon now carries a placeholder cardImage and IS verified below.)
        continue;
      }
      expect(image, `${card.id} cardImage path`).toMatch(/^\/assets\/[a-z0-9_/-]+\.webp$/);
      expect(existsSync(assetPath(image)), `${card.id} art file missing at ${image}`).toBe(true);
      checked.push(card.id);
    }
    // Guard the guard: the Diplomacy fix (and the rest) is actually exercised.
    expect(checked).toContain("ability.diplomacy");
    expect(checked).toContain("ability.artillery");
    expect(checked).toContain("ability.ballistics");
    expect(checked).toContain("ability.pathfinding");
    expect(checked).toContain("war_machine.first_aid_tent");
    expect(checked).toContain("war_machine.cannon");
    expect(checked.length).toBeGreaterThan(20);
  });
});
