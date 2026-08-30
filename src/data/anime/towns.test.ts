import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canRenderSpecialtyCard, specialtyIconSrc } from "@/components/specialty-card-data";
import { AZURE_BREEZE_UNIT_ORDER } from "@/data/anime/towns";
import { cardLibrary } from "@/data/cards/library";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs, townIconUrl } from "@/data/towns/boards";
import { unitAbilities } from "@/data/units/abilities";

const MOD_FACTIONS = ["fuyuki", "azure_breeze", "hidden_leaf", "azur_lane", "little_busters"] as const;

describe("playable Anime Realms towns", () => {
  it("pins Fuyuki EMIYA and Heracles Speed on both card sides", () => {
    expect(coreUnitDefinitions["fuyuki.archers"]!.few!.initiative).toBe(9);
    expect(coreUnitDefinitions["fuyuki.archers"]!.pack!.initiative).toBe(9);
    expect(coreUnitDefinitions["fuyuki.berserkers"]!.few!.initiative).toBe(7);
    expect(coreUnitDefinitions["fuyuki.berserkers"]!.pack!.initiative).toBe(7);
  });

  it.each(MOD_FACTIONS)("registers a complete playable %s faction", (factionId) => {
    const faction = coreFactionDefinitions[factionId];
    expect(faction).toBeDefined();
    expect(faction.units).toHaveLength(factionId === "hidden_leaf" ? 8 : 7);
    expect(faction.buildings).toHaveLength(8);
    // Fuyuki and Hidden Leaf each ship a six-hero canonical roster.
    expect(faction.heroes.length).toBeGreaterThanOrEqual(2);
    if (factionId === "fuyuki") {
      expect(faction.heroes).toEqual(expect.arrayContaining([
        "shirou_emiya", "rin_tohsaka", "illyasviel", "kiritsugu_emiya", "kirei_kotomine", "sakura_matou"
      ]));
      expect(faction.heroes).toHaveLength(6);
    } else if (factionId === "hidden_leaf") {
      expect(faction.heroes).toEqual(expect.arrayContaining([
        "naruto", "sasuke", "tsunade", "kakashi_hatake", "shikamaru_nara", "jiraiya"
      ]));
      expect(faction.heroes).toHaveLength(6);
    } else if (factionId === "azur_lane") {
      expect(faction.heroes).toEqual(
        expect.arrayContaining(["enterprise", "bismarck", "nagato", "akashi", "sirius"])
      );
      expect(faction.heroes).toHaveLength(5);
    } else if (factionId === "little_busters") {
      expect(faction.heroes).toEqual(expect.arrayContaining([
        "sasami_sasasegawa", "riki_naoe", "rin_natsume", "yuiko_kurugaya", "kudryavka_noumi", "komari_kamikita"
      ]));
      expect(faction.heroes).toHaveLength(6);
    } else if (factionId === "azure_breeze") {
      expect(faction.heroes).toEqual(expect.arrayContaining(["qingyun", "lingxi", "jianxu", "yulian"]));
      expect(faction.heroes).toHaveLength(4);
    } else if (factionId === "heavenly_demon") {
      expect(faction.heroes).toEqual(expect.arrayContaining([
        "xuedao", "guiyan", "xuanming", "yaoji", "molian", "luohun", "shiyan"
      ]));
      expect(faction.heroes).toHaveLength(7);
    } else {
      expect(faction.heroes).toHaveLength(2);
    }
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
      const stripPrefix =
        factionId === "azure_breeze"
          ? "azure-breeze"
          : factionId === "hidden_leaf"
            ? "hidden-leaf"
            : factionId === "azur_lane"
              ? "azur-lane"
              : factionId === "little_busters"
                ? "little-busters"
              : factionId;
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
    // Hidden Leaf gates on the SAME isekaiTowns flag as Fuyuki.
    expect(isPlayableFaction("hidden_leaf")).toBe(false);
    expect(isPlayableFaction("hidden_leaf", { enabled: false, isekaiTowns: true })).toBe(false);
    expect(isPlayableFaction("hidden_leaf", { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction("hidden_leaf", { enabled: true, isekaiTowns: true })).toBe(true);
    // CONTROL: the xianxia flag alone never unlocks an isekai town.
    expect(isPlayableFaction("hidden_leaf", { enabled: true, xianxiaTowns: true })).toBe(false);
    // Azur Lane gates on the SAME isekaiTowns flag as Fuyuki / Hidden Leaf.
    expect(isPlayableFaction("azur_lane")).toBe(false);
    expect(isPlayableFaction("azur_lane", { enabled: false, isekaiTowns: true })).toBe(false);
    expect(isPlayableFaction("azur_lane", { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction("azur_lane", { enabled: true, isekaiTowns: true })).toBe(true);
    expect(isPlayableFaction("little_busters")).toBe(false);
    expect(isPlayableFaction("little_busters", { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction("little_busters", { enabled: true, isekaiTowns: true })).toBe(true);
    // CONTROL: the xianxia flag alone never unlocks an isekai town.
    expect(isPlayableFaction("azur_lane", { enabled: true, xianxiaTowns: true })).toBe(false);
    expect(isPlayableFaction("castle", { enabled: false })).toBe(true);
  });

  it("might specialists double on a unit of their OWN faction (mutation control: the borrowed sets never could)", () => {
    // Enterprise left this list in the 2026-07 upgrade (bespoke "Lucky E").
    // The 2026-08-25 specialty redesign removed the other Fuyuki / Hidden Leaf /
    // Azure Breeze / Heavenly Demon might heroes from it too: only Illyasviel
    // (Heracles IS her Servant) and Naruto (the Nine-Tails bond) keep the
    // unit-specialist trio, plus Azur Lane's Bismarck / Nagato. The redesigned
    // sets are pinned in anime-specialty-redesign.test.ts.
    for (const [heroId, factionId] of [
      ["illyasviel", "fuyuki"],
      ["naruto", "hidden_leaf"],
      ["bismarck", "azur_lane"],
      ["nagato", "azur_lane"]
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

  it("Azure Breeze unit order is fixed LV1→LV7 with correct tiers and art paths", () => {
    const faction = coreFactionDefinitions.azure_breeze;
    expect(faction.units).toEqual([...AZURE_BREEZE_UNIT_ORDER]);
    expect(AZURE_BREEZE_UNIT_ORDER).toEqual([
      "azure_breeze.outer_disciples",
      "azure_breeze.inner_swordsmen",
      "azure_breeze.spirit_crane",
      "azure_breeze.sect_protectors",
      "azure_breeze.true_inheritors",
      "azure_breeze.core_master",
      "azure_breeze.mountain_guardian"
    ]);

    const expected: Array<{ tier: "bronze" | "silver" | "gold"; art: string }> = [
      { tier: "bronze", art: "bronze-outer-sect-disciples" }, // LV1
      { tier: "bronze", art: "bronze-inner-sect-swordsmen" }, // LV2
      { tier: "bronze", art: "bronze-spirit-crane" }, // LV3
      { tier: "silver", art: "silver-sect-protectors" }, // LV4
      { tier: "silver", art: "silver-true-inheritors" }, // LV5
      { tier: "gold", art: "golden-core-formation-master" }, // LV6
      { tier: "gold", art: "golden-mountain-guardian" } // LV7
    ];

    for (let i = 0; i < AZURE_BREEZE_UNIT_ORDER.length; i++) {
      const id = AZURE_BREEZE_UNIT_ORDER[i];
      const unit = coreUnitDefinitions[id];
      expect(unit, id).toBeDefined();
      expect(unit.tier, id).toBe(expected[i].tier);
      expect(unit.few!.cardImage, id).toContain(expected[i].art);
      expect(unit.pack!.cardImage, id).toContain(expected[i].art);
      expect(existsSync(join(process.cwd(), "public", unit.few!.cardImage!.replace(/^\//, ""))), unit.few!.cardImage).toBe(
        true
      );
      expect(existsSync(join(process.cwd(), "public", unit.pack!.cardImage!.replace(/^\//, ""))), unit.pack!.cardImage).toBe(
        true
      );
    }

    const byTier = { bronze: 0, silver: 0, gold: 0, azure: 0 };
    for (const id of AZURE_BREEZE_UNIT_ORDER) {
      byTier[coreUnitDefinitions[id].tier] += 1;
    }
    expect(byTier).toEqual({ bronze: 3, silver: 2, gold: 2, azure: 0 });

    // Silver dwelling name must not claim the bronze crane.
    expect(coreBuildingDefinitions["azure_breeze.dwelling_silver"]?.name).toBe("Inheritance Pavilion");
    expect(coreBuildingDefinitions["azure_breeze.dwelling_gold"]?.name).toBe("Golden Core Summit");

    // LV5 silver must not outstat LV6 gold (few side raw A+D+H budget).
    const lv5 = coreUnitDefinitions["azure_breeze.true_inheritors"]!.few!;
    const lv6 = coreUnitDefinitions["azure_breeze.core_master"]!.few!;
    const budget = (s: { attack: number; defense: number; health: number }) => s.attack + s.defense + s.health;
    expect(budget(lv5), "LV5 few A+D+H").toBeLessThan(budget(lv6));
    expect(lv5.attack, "LV5 attack").toBeLessThan(lv6.attack);
    expect(lv6.cost.valuables ?? 0, "LV6 gold costs valuables").toBeGreaterThan(0);
    expect(lv5.cost.valuables ?? 0, "LV5 silver no valuables").toBe(0);
  });

  it("Azure Breeze engine art paths exist for printed LV tiers", () => {
    // LV3 bronze crane · LV5 silver True Inheritors · LV6 gold Golden Core Elders.
    // A bad copy once put swordsmen into bronze Spirit Crane — real crane art
    // must stay on the bronze path the engine uses.
    const publicRoot = join(process.cwd(), "public");
    const azure = join(publicRoot, "assets/anime/units/azure-breeze");
    for (const side of ["few", "pack"] as const) {
      const bronze = readFileSync(join(azure, `units-azure-breeze-bronze-spirit-crane-${side}.webp`));
      expect(bronze.byteLength).toBeLessThan(250_000);
      expect(bronze.byteLength).toBeGreaterThan(50_000);
      expect(existsSync(join(azure, `units-azure-breeze-silver-true-inheritors-${side}.webp`))).toBe(true);
      expect(existsSync(join(azure, `units-azure-breeze-golden-core-formation-master-${side}.webp`))).toBe(true);
    }

    // Qingyun must not be a byte-copy of Core Formation Master OR True Inheritors.
    const qingyun = readFileSync(join(publicRoot, "assets/anime/heroes/qingyun.webp"));
    const formationMaster = readFileSync(join(azure, "units-azure-breeze-golden-core-formation-master-few.webp"));
    const trueInheritors = readFileSync(join(azure, "units-azure-breeze-silver-true-inheritors-few.webp"));
    expect(qingyun.equals(formationMaster)).toBe(false);
    expect(qingyun.equals(trueInheritors)).toBe(false);
    expect(coreHeroDefinitions.qingyun?.portrait).toBe("/assets/anime/heroes/qingyun.webp");
    expect(qingyun.byteLength).toBeGreaterThan(100_000);
  });

  it("Lingxi specialties are art-less native cards with the dedicated First-Aid medallion (not Gem's scan)", () => {
    for (const level of [1, 4, 6] as const) {
      const id = `specialty.lingxi.${level}`;
      const card = cardLibrary[id];
      expect(card?.name).toMatch(/^Healing Arts /);
      expect(card?.assets?.cardImage, id).toBeUndefined();
      expect(canRenderSpecialtyCard(id), id).toBe(true);
      const icon = specialtyIconSrc(id);
      expect(icon).toBe("/assets/anime/icons/cultivation/specialty-lingxi-healing-arts.webp");
      expect(existsSync(join(process.cwd(), "public", icon!.replace(/^\//, "")))).toBe(true);
    }
    // Portrait used by the native specialty frame is the hero's own art.
    const portrait = coreHeroDefinitions.lingxi?.portrait;
    expect(portrait).toBe("/assets/anime/heroes/lingxi.webp");
    expect(existsSync(join(process.cwd(), "public", portrait!.replace(/^\//, "")))).toBe(true);
  });
});
