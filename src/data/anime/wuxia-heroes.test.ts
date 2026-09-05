import { describe, expect, it } from "vitest";

import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
import { SPECIALTY_ICON_BY_HERO, specialtyEffectText } from "@/components/specialty-card-data";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";

const NEW_HEROES = {
  jianxu: "azure_breeze",
  yulian: "azure_breeze",
  luohun: "heavenly_demon",
  shiyan: "heavenly_demon"
} as const;

describe("cultivation hero expansion", () => {
  it("registers four balanced starting heroes in the correct towns", () => {
    for (const [heroId, factionId] of Object.entries(NEW_HEROES)) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero?.faction, heroId).toBe(factionId);
      expect(coreFactionDefinitions[factionId].heroes, `${heroId} selectable`).toContain(heroId);
      expect(Object.values(hero.startingStats).reduce((sum, value) => sum + value, 0), `${heroId} stat budget`).toBe(6);
    }
  });

  it("gives every new hero three implemented, readable specialty cards", () => {
    for (const heroId of Object.keys(NEW_HEROES)) {
      for (const level of [1, 4, 6] as const) {
        const cardId = `specialty.${heroId}.${level}`;
        expect(cardLibrary[cardId]?.implementationStatus, cardId).toBe("implemented");
        expect(specialtyEffectText(cardId), `${cardId} rules text`).toContain("Innate");
      }
    }
  });

  it("ships a portrait and cultivation-specific specialty emblem for every new hero", () => {
    for (const heroId of Object.keys(NEW_HEROES)) {
      const portrait = coreHeroDefinitions[heroId].portrait!;
      const icon = SPECIALTY_ICON_BY_HERO[heroId];
      for (const asset of [portrait, icon]) {
        expect(hasMediaFile(asset), `${heroId}: ${asset} — run npm run media:publish`).toBe(true);
        expect(mediaFileInfo(asset)!.bytes, `${heroId}: ${asset}`).toBeGreaterThan(10_000);
      }
    }
  });
});
