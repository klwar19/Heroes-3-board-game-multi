import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs } from "@/data/towns/boards";
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

    for (const heroId of faction.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero?.faction).toBe(factionId);
      expect(hero?.portrait && existsSync(join(process.cwd(), "public", hero.portrait.replace(/^\//, "")))).toBe(true);
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

  it.each(MOD_FACTIONS)("gives %s a themed, fully registered commander", (factionId) => {
    const slug = COMMANDER_SLUG_BY_FACTION[factionId];
    const commander = commanderDefinitions[slug];
    expect(commander).toBeDefined();
    expect(existsSync(join(process.cwd(), "public", commander.cardImage.replace(/^\//, "")))).toBe(true);
    expect(unitAbilities[commander.cast.abilityId]?.implementationStatus).toBe("implemented");
  });
});
