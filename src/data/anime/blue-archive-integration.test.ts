import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adventureCards } from "@/data/cards/adventure";
import { commanderDefinitions, COMMANDER_SLUG_BY_FACTION } from "@/data/commanders";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { unitSoundKey } from "@/data/unit-sounds";
import { unitAbilities } from "@/data/units/abilities";
import { unitRankAbilityIcon } from "@/data/units/experience-rank-abilities";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs, townIconUrl } from "@/data/towns/boards";
import { createAdventureGameState, tierOfLevel } from "@/engine";
import { blueArchiveCharacters } from "./blue-archive-content";
import { animeTownFactionDefinitions, animeTownHeroDefinitions, blueArchiveUnitDefinitions } from "./towns";

describe("Blue Archive live faction integration", () => {
  it("registers every unit, inherits only exact wired effects, and never substitutes pending mechanics", () => {
    const exactWired = new Set([
      "kivotos-piercing-judgment",
      "kivotos-kyrie-eleison",
      "kivotos-tea-party-order",
      "kivotos-abyssal-shield",
      "kivotos-royal-artillery",
      "kivotos-railgun-charge",
      "kivotos-hero-mode",
      "kivotos-system-intrusion",
      "kivotos-perfect-balance",
      "kivotos-calculated-cover",
      "kivotos-outlaw-shot",
      "kivotos-hardboiled-boss",
      "kivotos-cqc-overdrive",
      "kivotos-abi-eshuh",
      "kivotos-mode-change",
      "kivotos-prophetic-dream",
      "kivotos-cycle-scout",
      "kivotos-arius-ambush",
      "kivotos-explosive-prank",
      "kivotos-drone-support",
      "kivotos-iron-horus",
      "kivotos-future-sight",
      "kivotos-key-authority",
      "kivotos-cleaner-rush",
      "kivotos-end-of-vacation",
      "kivotos-prefect-barrage",
      "kivotos-silent-faith",
      "kivotos-sagitta-mortis",
      "kivotos-trick-mine",
      "kivotos-foxfire-mark",
      "kivotos-crimson-calamity",
      "kivotos-cartographers-plan",
      "kivotos-eagle-eye",
      "kivotos-winged-pursuit",
      "kivotos-survey-route",
      "kivotos-vanitas",
      "kivotos-prefect-snipe",
      "kivotos-rapid-reposition"
    ]);
    for (const authored of blueArchiveCharacters) {
      const unit = blueArchiveUnitDefinitions[authored.id]!;
      expect(unit.pack?.abilityText).toContain(authored.few.abilityName);
      expect(unit.pack?.abilityText).toContain(authored.pack.abilityName);
      for (const abilityId of [authored.few.ability, authored.pack.ability]) {
        const expectedStatus = exactWired.has(abilityId) ? "implemented" : "not-implemented";
        expect(unitAbilities[abilityId]?.implementationStatus, abilityId).toBe(expectedStatus);
        expect(unit.pack?.abilities.includes(abilityId), abilityId).toBe(expectedStatus === "implemented");
      }
    }
  });

  it("ships seven strips, eight functional buildings, and one shared strip", () => {
    const faction = animeTownFactionDefinitions.blue_archive!;
    const board = townBoardSpecs.blue_archive!;
    expect(faction.buildings).toHaveLength(8);
    expect(board.bars).toHaveLength(7);
    expect(board.bars.filter((bar) => bar.length === 2)).toHaveLength(1);
    expect(allTileDefinitions["BA-S1"]?.assets).toMatchObject({
      tileImage: "/assets/anime/tiles/ba-s1-v2.webp"
    });
    expect(allTileDefinitions["BA-S1"]?.assets?.attachFieldSymbols).not.toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "public", "assets/anime/tiles/ba-s1-v2.webp"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "public", townIconUrl("blue_archive").slice(1)))).toBe(true);
    const council = coreBuildingDefinitions["blue_archive.city_hall"];
    expect(council.effect?.type).toBe("RESOURCE_ROUND_CHOICE");
    if (council.effect?.type === "RESOURCE_ROUND_CHOICE") {
      expect(council.effect.options).toEqual(expect.arrayContaining([
        expect.objectContaining({ gold: 5 }),
        expect.objectContaining({ drawCards: 3 })
      ]));
    }
  });

  it("draws Blue Archive level slots randomly inside the unchanged bronze/silver/gold grades", () => {
    const make = (seed: string) => createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      startingUnits: [1, 2, 3, 4, 5, 6, 7].map((level) => ({
        level: level as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        side: "few" as const
      })),
      players: [
        { id: "p1", name: "Sensei", factionId: "blue_archive", heroDefId: "mika_blue_archive" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    }).players.p1.startingArmy;

    const first = make("blue-archive-random-start-a");
    const replay = make("blue-archive-random-start-a");
    const second = make("blue-archive-random-start-b");
    expect(first).toEqual(replay);
    expect(new Set(first.map((unit) => unit.unitDefId)).size).toBe(7);
    first.forEach((unit, index) => {
      expect(blueArchiveUnitDefinitions[unit.unitDefId]?.tier).toBe(tierOfLevel((index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7));
    });
    expect(second.map((unit) => unit.unitDefId)).not.toEqual(first.map((unit) => unit.unitDefId));
  });

  it("ships Ibuki plus five distinct non-unit specialty sets", () => {
    expect(COMMANDER_SLUG_BY_FACTION.blue_archive).toBe("ibuki");
    expect(commanderDefinitions.ibuki.cast.name).toBe("Executive Order");
    expect(commanderDefinitions.ibuki.cast.effect.kind).toBe("reactivate");
    expect(commanderDefinitions.ibuki.specialty.id).toBe("mission-briefing");
    expect(animeTownFactionDefinitions.blue_archive?.heroes).toEqual([
      "mika_blue_archive",
      "yuuka_blue_archive",
      "seia_blue_archive",
      "chise_blue_archive",
      "kei_blue_archive"
    ]);
    for (const heroId of [
      "mika_blue_archive",
      "yuuka_blue_archive",
      "seia_blue_archive",
      "chise_blue_archive",
      "kei_blue_archive"
    ]) {
      const hero = animeTownHeroDefinitions[heroId]!;
      expect(hero.portrait).toBeTruthy();
      expect(fs.existsSync(path.join(process.cwd(), "public", hero.portrait!))).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const cardId = hero.specialtyCardIds?.[level];
        expect(cardId).toBe(`specialty.${heroId}.${level}`);
        expect(adventureCards[cardId!]?.implementationStatus).toBe("implemented");
      }
    }
  });

  it("uses the generated veterancy emblem and complete local voice sets", () => {
    const icon = unitRankAbilityIcon("veteran-attack-1", "blue_archive.mika");
    expect(icon).toBe("/assets/anime/icons/blue-archive/rank-shared.webp");
    expect(fs.existsSync(path.join(process.cwd(), "public", icon))).toBe(true);
    for (const unit of blueArchiveCharacters) {
      for (const action of ["attack", "shoot", "defend", "hurt", "death", "move"] as const) {
        const key = unitSoundKey(unit.id, action);
        expect(key, `${unit.id}:${action}`).toBeTruthy();
      }
    }
    for (const action of ["attack", "shoot", "defend", "hurt", "death", "move"] as const) {
      expect(unitSoundKey("commander:ibuki", action), `ibuki:${action}`).toBeTruthy();
    }
  });
});
