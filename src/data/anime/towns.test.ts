import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canRenderSpecialtyCard, specialtyIconSrc } from "@/components/specialty-card-data";
import { cardLibrary } from "@/data/cards/library";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs, townIconUrl } from "@/data/towns/boards";
import { unitAbilities } from "@/data/units/abilities";

const MOD_FACTIONS = ["fuyuki", "azure_breeze"] as const;

describe("playable Anime Realms towns", () => {
  it.each(MOD_FACTIONS)("registers a complete playable %s faction", (factionId) => {
    const faction = coreFactionDefinitions[factionId];
    expect(faction).toBeDefined();
    expect(faction.units).toHaveLength(7);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.heroes).toHaveLength(2);
    expect(allTileDefinitions[faction.startingTileId]?.fields[0]).toMatchObject({
      location: "town",
      faction: factionId
    });
    expect(townBoardSpecs[factionId]?.bars).toHaveLength(7);
    expect(townBoardSpecs[factionId]?.panoramaImage).toBe(faction.townImage);
    expect(existsSync(join(process.cwd(), "public", faction.townImage!.replace(/^\//, "")))).toBe(true);

    // The dock/window town icon follows the same convention as every classic
    // faction (a real square-ish capitol crop, scripts/build-anime-town-icons.mjs).
    expect(existsSync(join(process.cwd(), "public", townIconUrl(factionId).replace(/^\//, "")))).toBe(true);

    for (const heroId of faction.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero?.faction).toBe(factionId);
      expect(hero?.portrait && existsSync(join(process.cwd(), "public", hero.portrait.replace(/^\//, "")))).toBe(true);
      // Each hero owns its OWN specialty set (no borrowed Castle/Rampart ids —
      // a borrowed unit-specialist set carried clauses that could never fire,
      // e.g. Gelu IV's "discard a Pack of Elves").
      for (const level of [1, 4, 6] as const) {
        const cardId = hero?.specialtyCardIds?.[level];
        expect(cardId, `${heroId} level ${level}`).toBe(`specialty.${heroId}.${level}`);
        expect(cardLibrary[cardId ?? ""]?.implementationStatus, cardId).toBe("implemented");
      }
    }

    for (const unitId of faction.units) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit?.faction).toBe(factionId);
      for (const side of [unit.few, unit.pack]) {
        expect(side?.cardImage && existsSync(join(process.cwd(), "public", side.cardImage.replace(/^\//, "")))).toBe(true);
        for (const abilityId of side?.abilities ?? []) {
          expect(unitAbilities[abilityId]?.implementationStatus, `${unitId}/${abilityId}`).toBe("implemented");
        }
      }
    }

    for (const buildingId of faction.buildings) {
      const building = coreBuildingDefinitions[buildingId];
      expect(building?.implementationStatus, `${buildingId} must be wired`).toBe("implemented");
      const stripPrefix = factionId === "azure_breeze" ? "azure-breeze" : factionId;
      expect(building?.assets?.image, `${buildingId} needs real strip art`).toMatch(
        new RegExp(`/assets/town-board/${stripPrefix}-bar-[1-7]\\.webp$`)
      );
      expect(
        existsSync(join(process.cwd(), "public", building.assets!.image!.replace(/^\//, ""))),
        `${buildingId} art must exist`
      ).toBe(true);
    }
  });

  it("gates each town behind the correct Anime module flag", () => {
    expect(isPlayableFaction("fuyuki")).toBe(false);
    expect(isPlayableFaction("azure_breeze")).toBe(false);
    expect(isPlayableFaction("fuyuki", { enabled: false, isekaiTowns: true })).toBe(false);
    expect(isPlayableFaction("fuyuki", { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction("fuyuki", { enabled: true, isekaiTowns: true })).toBe(true);
    expect(isPlayableFaction("azure_breeze", { enabled: true, xianxiaTowns: false })).toBe(false);
    expect(isPlayableFaction("azure_breeze", { enabled: true, xianxiaTowns: true })).toBe(true);
    expect(isPlayableFaction("castle", { enabled: false })).toBe(true);
  });

  it("might specialists double on a unit of their OWN faction (mutation control: the borrowed sets never could)", () => {
    for (const [heroId, factionId] of [
      ["bin", "fuyuki"],
      ["qingyun", "azure_breeze"]
    ] as const) {
      const card = cardLibrary[`specialty.${heroId}.1`];
      const effect = card?.effect;
      expect(effect?.type).toBe("CHOOSE_ONE");
      const doubled =
        effect?.type === "CHOOSE_ONE" &&
        effect.options[0]?.effect?.type === "ADD_COMBAT_STAT" &&
        effect.options[0].effect.doubleForUnitName;
      expect(doubled, heroId).toBeTruthy();
      const factionUnitNames = coreFactionDefinitions[factionId].units.map(
        (unitId) => coreUnitDefinitions[unitId]?.name
      );
      expect(factionUnitNames, `${heroId} doubles for a unit it can actually field`).toContain(doubled);
    }
  });

  it.each(MOD_FACTIONS)("gives %s a themed, fully registered commander", (factionId) => {
    const slug = COMMANDER_SLUG_BY_FACTION[factionId];
    const commander = commanderDefinitions[slug];
    expect(commander).toBeDefined();
    expect(existsSync(join(process.cwd(), "public", commander.cardImage.replace(/^\//, "")))).toBe(true);
    expect(unitAbilities[commander.cast.abilityId]?.implementationStatus).toBe("implemented");
  });

  it("Azure Breeze roster is exactly 3 bronze / 2 silver / 2 gold (not 2/2/3)", () => {
    const units = Object.values(coreUnitDefinitions).filter((unit) => unit.faction === "azure_breeze");
    expect(units).toHaveLength(7);
    const byTier = { bronze: 0, silver: 0, gold: 0, azure: 0 };
    for (const unit of units) {
      byTier[unit.tier] += 1;
    }
    expect(byTier).toEqual({ bronze: 3, silver: 2, gold: 2, azure: 0 });
    // Gold: True Inheritors + Mountain Guardian (never demote the mountain tank).
    expect(coreUnitDefinitions["azure_breeze.true_inheritors"]?.tier).toBe("gold");
    expect(coreUnitDefinitions["azure_breeze.mountain_guardian"]?.tier).toBe("gold");
    // Bronze early flyer; silver formation support.
    expect(coreUnitDefinitions["azure_breeze.spirit_crane"]?.tier).toBe("bronze");
    expect(coreUnitDefinitions["azure_breeze.core_master"]?.tier).toBe("silver");
  });

  it("Lingxi specialties are art-less native cards with the dedicated First-Aid medallion (not Gem's scan)", () => {
    for (const level of [1, 4, 6] as const) {
      const id = `specialty.lingxi.${level}`;
      const card = cardLibrary[id];
      expect(card?.name).toMatch(/^Healing Arts /);
      expect(card?.assets?.cardImage, id).toBeUndefined();
      expect(canRenderSpecialtyCard(id), id).toBe(true);
      const icon = specialtyIconSrc(id);
      expect(icon).toBe("/assets/specialty-card/icon-first_aid.webp");
      expect(existsSync(join(process.cwd(), "public", icon!.replace(/^\//, "")))).toBe(true);
    }
    // Portrait used by the native specialty frame is the hero's own art.
    const portrait = coreHeroDefinitions.lingxi?.portrait;
    expect(portrait).toBe("/assets/anime/heroes/lingxi.png");
    expect(existsSync(join(process.cwd(), "public", portrait!.replace(/^\//, "")))).toBe(true);
  });
});
