import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cardLibrary } from "@/data/cards/library";
import { moraleCardPolarity } from "@/data/cards/morale";

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
      // Morale cards carry kind "ability" but ship as their own committed
      // /assets/morale-cards/*.png scans, validated with the morale subsystem —
      // not the .webp ability/war-machine scans this guard covers.
      if (moraleCardPolarity(card.id) !== null) {
        continue;
      }
      const image = card.assets?.cardImage;
      if (!image) {
        // A few ability cards genuinely have no committed scan and fall back to
        // the deck back. Every war machine now ships a real face and is checked
        // explicitly below.
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
    expect(checked).toContain("war_machine.catapult");
    expect(checked).toContain("war_machine.cannon");
    expect(checked.length).toBeGreaterThan(20);
  });

  it("replaces both wiki-placeholder war machines with their own committed faces", () => {
    expect(cardLibrary["war_machine.catapult"]?.assets?.cardImage).toBe(
      "/assets/war_machines-catapult.webp"
    );
    expect(cardLibrary["war_machine.cannon"]?.assets?.cardImage).toBe(
      "/assets/war_machines-cannon.webp"
    );
    // Cannon no longer borrows the specialty-icon sprite as a stand-in.
    expect(cardLibrary["war_machine.cannon"]?.assets?.cardImage).not.toContain("specialty-card");
  });

  it("Interference uses its real printed-card scan, not the deck-back fallback", () => {
    const image = cardLibrary["ability.interference"]?.assets?.cardImage;
    expect(image).toBe("/assets/abilities-interference.webp");
    expect(image).not.toContain("player-deck-back");
    expect(existsSync(assetPath(image!))).toBe(true);
  });

  it("gives every Basic school-magic ability its own composed face", () => {
    // "an" before a vowel-sound school (Air, Earth), "a" otherwise (Fire, Water).
    const article = { air: "an", earth: "an", fire: "a", water: "a" } as const;
    for (const school of ["air", "earth", "fire", "water"] as const) {
      const card = cardLibrary[`ability.basic_${school}_magic`];
      const image = card?.assets?.cardImage;
      expect(image).toBe(`/assets/abilities-basic_${school}_magic.webp`);
      expect(image).not.toContain("player-deck-back");
      expect(existsSync(assetPath(image!)), `${school} face`).toBe(true);
      expect(
        existsSync(assetPath(`/assets/abilities-basic_${school}_magic-art.webp`)),
        `${school} generated art source`
      ).toBe(true);
      const schoolName = school.charAt(0).toUpperCase() + school.slice(1);
      const tags = card?.tags.join(" ") ?? "";
      // Article must agree with the school's leading sound: "an Air"/"an Earth",
      // "a Fire"/"a Water" — and never the wrong one ("a Air"/"a Earth").
      expect(tags).toContain(`${article[school]} ${schoolName} Magic`);
      const wrong = article[school] === "an" ? "a" : "an";
      expect(tags).not.toContain(`${wrong} ${schoolName} Magic`);
    }
    expect(existsSync(fileURLToPath(new URL("../../scripts/build-basic-magic-ability-cards.mjs", import.meta.url)))).toBe(true);
    for (const glyph of ["permanent", "instant", "spell", "power"] as const) {
      expect(
        existsSync(fileURLToPath(new URL(`../../scripts/card-glyphs/${glyph}.svg`, import.meta.url))),
        `${glyph} legend glyph`
      ).toBe(true);
    }
  });
});
