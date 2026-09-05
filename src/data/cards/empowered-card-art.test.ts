import { describe, expect, it } from "vitest";
import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
import {
  EMPOWERED_ABILITY_ART_SLUGS,
  EMPOWERED_STATISTIC_ART_SLUGS,
  cardFaceImage,
  empoweredCardImage
} from "./empowered-card-art";
import { cardLibrary } from "@/data/cards/library";

describe("empowered card art registry", () => {
  it("every registered empowered face is real art on disk", () => {
    const paths = [
      ...EMPOWERED_ABILITY_ART_SLUGS.map((slug) => `/assets/abilities-${slug}-empowered.webp`),
      ...EMPOWERED_STATISTIC_ART_SLUGS.map((stat) => `/assets/statistics-${stat}-empowered.webp`)
    ];
    expect(paths.length).toBe(36);
    for (const path of paths) {
      expect(hasMediaFile(path), `${path} must be published (run \`npm run media:publish\`)`).toBe(true);
      const bytes = mediaFileInfo(path)!.bytes;
      expect(bytes, `${path} must be real art`).toBeGreaterThan(10_000);
      // Budget from the task brief: keep every scan comfortably shippable.
      expect(bytes, `${path} must stay under 250KB`).toBeLessThan(250 * 1024);
    }
  });

  it("every registered slug has its BASE face too (the pair a swap needs)", () => {
    for (const slug of EMPOWERED_ABILITY_ART_SLUGS) {
      expect(
        hasMediaFile(`/assets/abilities-${slug}.webp`),
        `abilities-${slug}.webp (run \`npm run media:publish\`)`
      ).toBe(true);
    }
    for (const stat of EMPOWERED_STATISTIC_ART_SLUGS) {
      expect(
        hasMediaFile(`/assets/statistics-${stat}.webp`),
        `statistics-${stat}.webp (run \`npm run media:publish\`)`
      ).toBe(true);
    }
  });

  it("maps an ability card to its empowered face, and leaves cards without one alone", () => {
    expect(empoweredCardImage("ability.offense")).toBe("/assets/abilities-offense-empowered.webp");
    expect(empoweredCardImage("ability.estates")).toBe("/assets/abilities-estates-empowered.webp");
    expect(empoweredCardImage("ability.basic_fire_magic")).toBe(
      "/assets/abilities-basic_fire_magic-empowered.webp"
    );
    // A card whose printed face is ALREADY the empowered scan has nothing to swap.
    expect(empoweredCardImage("stat.attack.empowered")).toBeUndefined();
    expect(empoweredCardImage("ability.diplomacy")).toBe(
      "/assets/abilities-diplomacy-empowered.webp"
    );
    // CONTROL: a card family with no empowered scan at all.
    expect(empoweredCardImage("spell.magic_arrow")).toBeUndefined();
    expect(empoweredCardImage(undefined)).toBeUndefined();
    expect(empoweredCardImage("no.such.card")).toBeUndefined();
  });

  it("cardFaceImage swaps only when the card is shown as empowered", () => {
    expect(cardFaceImage("ability.offense", true)).toBe(
      "/assets/abilities-offense-empowered.webp"
    );
    // CONTROL: not empowered → the base face, unchanged.
    expect(cardFaceImage("ability.offense", false)).toBe("/assets/abilities-offense.webp");
    expect(cardFaceImage("ability.diplomacy", false)).toBe("/assets/abilities-diplomacy.webp");
    expect(cardFaceImage("ability.diplomacy", true)).toBe(
      "/assets/abilities-diplomacy-empowered.webp"
    );
  });

  it("never wires an ordinary Ability card directly to an Empowered face", () => {
    const wrong = Object.values(cardLibrary)
      .filter((card) => card.kind === "ability" && card.assets?.cardImage?.includes("-empowered."))
      .map((card) => `${card.id} -> ${card.assets?.cardImage}`);
    expect(wrong).toEqual([]);
  });

  it("EVERY ability card whose face is an /assets/abilities-*.webp scan is registered", () => {
    // Registry hygiene: a new ability card with a base scan must either get its
    // empowered face imported (and listed) or be a conscious exclusion. Without
    // this, an added ability would silently render its plain face while
    // Empowered.
    const registered = new Set<string>(EMPOWERED_ABILITY_ART_SLUGS);
    const missing: string[] = [];
    let seen = 0;
    for (const card of Object.values(cardLibrary)) {
      const img = card.assets?.cardImage;
      if (!img) continue;
      const match = /^\/assets\/abilities-([a-z0-9_]+)\.webp$/.exec(img);
      if (!match) continue;
      seen += 1;
      if (!registered.has(match[1])) {
        missing.push(`${card.id} -> ${img}`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(30);
    expect(missing).toEqual([]);
  });
});
