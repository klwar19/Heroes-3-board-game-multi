import { describe, expect, it } from "vitest";

import {
  MGQ_NEW_ABILITY_IDS,
  MGQ_GOLD_CONTRACT_PICK_COUNT,
  MGQ_TOWN_BOARD_BARS,
  MGQ_UNIT_ORDER,
  mgqUnitDefinitions
} from "@/data/anime/mgq";
import {
  ANIME_EQUIPMENT_ART_PLACEHOLDERS,
  ANIME_EQUIPMENT_DEFINITIONS,
  EQUIPMENT_IDS,
  equipmentPackagesForFaction
} from "@/data/anime/equipment";
import {
  BESPOKE_FACTION_GRADE_REGISTERS,
  HERO_GRADE_NODES,
  HERO_GRADE_REGISTER_NODES,
  HERO_GRADE_REGISTERS,
  MGQ_JOB_MASTERY_NODE,
  factionGradeRegister
} from "@/data/anime/hero-grades";
import { COMMANDER_SLUG_BY_FACTION, commanderDefinitions } from "@/data/commanders";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions, isPlayableFaction } from "@/data/factions/core";
import type { UnitSideDefinition } from "@/data/factions/types";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs } from "@/data/towns/boards";
import { unitAbilities } from "@/data/units/abilities";

type SideSignature = readonly [attack: number, defense: number, health: number, initiative: number, gold: number, valuables: number];

const signature = (side: UnitSideDefinition): SideSignature => [
  side.attack,
  side.defense,
  side.health,
  side.initiative,
  side.cost.gold ?? 0,
  side.cost.valuables ?? 0
];

const EXPECTED_STATS: Record<string, { tier: string; type: string; few: SideSignature; pack: SideSignature }> = {
  "mgq.pochi": { tier: "bronze", type: "ground", few: [2, 0, 2, 6, 2, 0], pack: [2, 0, 2, 8, 4, 0] },
  "mgq.shesta": { tier: "bronze", type: "ground", few: [2, 0, 3, 5, 3, 0], pack: [3, 0, 3, 6, 5, 0] },
  "mgq.gigi": { tier: "bronze", type: "ground", few: [2, 1, 3, 4, 3, 0], pack: [3, 1, 3, 5, 5, 0] },
  "mgq.kamuro_kitsu": { tier: "bronze", type: "ground", few: [2, 0, 4, 7, 4, 0], pack: [3, 0, 4, 8, 6, 0] },
  "mgq.fleesia": { tier: "bronze", type: "ground", few: [2, 1, 3, 3, 3, 0], pack: [2, 2, 3, 4, 5, 0] },
  "mgq.sofia": { tier: "bronze", type: "ground", few: [2, 1, 3, 4, 3, 0], pack: [3, 1, 3, 5, 5, 0] },
  "mgq.miyabi": { tier: "bronze", type: "flying", few: [2, 1, 3, 4, 1, 0], pack: [3, 1, 3, 5, 5, 0] },
  "mgq.eater": { tier: "bronze", type: "ground", few: [2, 1, 4, 2, 3, 0], pack: [3, 1, 4, 3, 6, 0] },
  "mgq.hild": { tier: "silver", type: "ranged", few: [3, 1, 4, 6, 7, 0], pack: [4, 1, 7, 10, 7, 1] },
  "mgq.chrome_frederica": { tier: "silver", type: "ground", few: [3, 1, 5, 4, 7, 0], pack: [4, 1, 5, 5, 11, 0] },
  "mgq.shizuku": { tier: "silver", type: "ground", few: [4, 1, 5, 4, 8, 0], pack: [5, 1, 5, 5, 12, 0] },
  "mgq.regina": { tier: "silver", type: "ground", few: [3, 2, 4, 5, 7, 0], pack: [4, 2, 4, 6, 11, 0] },
  "mgq.maiden": { tier: "silver", type: "ground", few: [3, 1, 5, 5, 7, 0], pack: [4, 1, 5, 6, 10, 0] },
  "mgq.seraphy": { tier: "silver", type: "ground", few: [3, 1, 4, 5, 7, 0], pack: [4, 1, 4, 6, 11, 0] },
  "mgq.lisa": { tier: "silver", type: "flying", few: [3, 1, 4, 6, 7, 0], pack: [3, 1, 4, 7, 11, 0] },
  "mgq.tama": { tier: "silver", type: "ground", few: [3, 0, 4, 7, 7, 0], pack: [4, 0, 4, 8, 11, 0] },
  "mgq.maya": { tier: "silver", type: "ranged", few: [3, 1, 4, 5, 7, 0], pack: [4, 1, 4, 6, 11, 0] },
  "mgq.matis": { tier: "silver", type: "ground", few: [3, 1, 5, 6, 8, 0], pack: [4, 1, 5, 7, 12, 0] },
  "mgq.ooma": { tier: "silver", type: "ground", few: [3, 1, 5, 4, 7, 0], pack: [4, 1, 5, 5, 11, 0] },
  "mgq.jessie": { tier: "silver", type: "ground", few: [4, 2, 5, 5, 8, 0], pack: [5, 2, 5, 6, 12, 1] },
  "mgq.aria": { tier: "silver", type: "ground", few: [3, 2, 5, 4, 7, 0], pack: [4, 2, 5, 5, 11, 0] },
  "mgq.carmilla": { tier: "gold", type: "ground", few: [5, 2, 7, 8, 13, 1], pack: [6, 2, 7, 9, 21, 1] },
  "mgq.giga": { tier: "gold", type: "ground", few: [5, 2, 8, 5, 14, 1], pack: [6, 2, 9, 6, 20, 1] },
  "mgq.lucretia": { tier: "gold", type: "flying", few: [5, 2, 6, 10, 13, 0], pack: [6, 2, 7, 12, 21, 1] },
  "mgq.cupi": { tier: "gold", type: "ranged", few: [5, 1, 6, 9, 11, 0], pack: [6, 1, 6, 11, 17, 1] },
  "mgq.sphinx": { tier: "gold", type: "ground", few: [5, 3, 8, 7, 20, 1], pack: [6, 3, 8, 8, 29, 2] },
  "mgq.lucifina_chan": { tier: "gold", type: "flying", few: [5, 3, 7, 10, 14, 1], pack: [6, 3, 7, 12, 22, 2] },
  "mgq.spider_princess": { tier: "gold", type: "ground", few: [5, 2, 7, 6, 13, 1], pack: [6, 3, 7, 7, 21, 1] },
  "mgq.emily": { tier: "gold", type: "ground", few: [4, 1, 6, 9, 10, 0], pack: [5, 1, 6, 11, 15, 2] }
};

describe("Monster Girl Quest: Paradox static town contract", () => {
  it("registers all 29 cards in the requested 8/13/8 tier split with exact sides", () => {
    expect(Object.keys(EXPECTED_STATS)).toEqual([...MGQ_UNIT_ORDER]);
    expect(Object.values(mgqUnitDefinitions).filter((unit) => !unit.summonOnly).map((unit) => unit.id)).toEqual([...MGQ_UNIT_ORDER]);
    expect(coreFactionDefinitions.mgq.units).toEqual([...MGQ_UNIT_ORDER]);

    const tiers = { bronze: 0, silver: 0, gold: 0 };
    for (const id of MGQ_UNIT_ORDER) {
      const unit = mgqUnitDefinitions[id];
      const expected = EXPECTED_STATS[id];
      expect(unit.faction, id).toBe("mgq");
      expect(unit.tier, id).toBe(expected.tier);
      expect(unit.type, id).toBe(expected.type);
      expect(signature(unit.few!), `${id} Few`).toEqual(expected.few);
      expect(signature(unit.pack!), `${id} Pack`).toEqual(expected.pack);
      expect(unit.few!.cardImage, id).toMatch(/^\/assets\/anime\/units\/mgq\/units-mgq-(bronze|silver|golden)-.+-few\.webp$/);
      expect(unit.pack!.cardImage, id).toMatch(/^\/assets\/anime\/units\/mgq\/units-mgq-(bronze|silver|golden)-.+-pack\.webp$/);
      tiers[unit.tier as keyof typeof tiers] += 1;
    }
    expect(tiers).toEqual({ bronze: 8, silver: 13, gold: 8 });
    expect(MGQ_GOLD_CONTRACT_PICK_COUNT).toBe(3);
    expect(mgqUnitDefinitions["mgq.lisa"].few?.cost.buildingMaterials).toBe(1);
    expect(mgqUnitDefinitions["mgq.lisa"].pack?.cost.buildingMaterials).toBe(1);
  });

  it("uses implemented reuse ids or an explicitly declared MGQ mechanics id", () => {
    const newIds = new Set<string>(MGQ_NEW_ABILITY_IDS);
    const referencedNew = new Set<string>();
    for (const unit of Object.values(mgqUnitDefinitions)) {
      for (const side of [unit.few!, unit.pack!]) {
        for (const abilityId of side.abilities) {
          if (abilityId.startsWith("mgq-")) {
            expect(newIds.has(abilityId), `${unit.id}/${abilityId}`).toBe(true);
            referencedNew.add(abilityId);
          } else {
            expect(unitAbilities[abilityId]?.implementationStatus, `${unit.id}/${abilityId}`).toBe("implemented");
          }
        }
      }
    }
    expect([...referencedNew].sort()).toEqual([...MGQ_NEW_ABILITY_IDS].sort());
  });

  it("registers five heroes with owned I/IV/VI specialty ids", () => {
    const heroes = ["luka", "alice", "ilias", "granberia", "promestein"];
    expect(coreFactionDefinitions.mgq.heroes).toEqual(heroes);
    for (const heroId of heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero.faction, heroId).toBe("mgq");
      expect(hero.portrait, heroId).toBe(`/assets/anime/heroes/mgq-${heroId}.webp`);
      expect(hero.specialtyCardIds).toEqual({
        1: `specialty.${heroId}.1`,
        4: `specialty.${heroId}.4`,
        6: `specialty.${heroId}.6`
      });
    }
  });

  it("removes the old Spirit contracts and gives the Shrine a balanced resource-round effect", () => {
    const faction = coreFactionDefinitions.mgq;
    const spec = townBoardSpecs.mgq;
    expect(faction.buildings).toHaveLength(9);
    expect(spec.bars).toEqual(MGQ_TOWN_BOARD_BARS);
    expect(spec.bars).toHaveLength(7);
    expect(spec.bars.filter((bar) => bar.length > 1)).toHaveLength(2);
    expect([...spec.bars.flat()].sort()).toEqual([...faction.buildings].sort());

    for (const buildingId of faction.buildings) {
      const building = coreBuildingDefinitions[buildingId];
      const bar = spec.bars.findIndex((entries) => entries.includes(buildingId)) + 1;
      expect(building.implementationStatus, buildingId).toBe("implemented");
      expect(building.assets?.image, buildingId).toBe(`/assets/town-board/mgq-bar-${bar}.webp`);
    }

    expect(coreBuildingDefinitions["mgq.city_hall"].effect).toMatchObject({
      type: "RESOURCE_ROUND_CHOICE",
      options: [{ gold: 4 }, { freeJobReassign: true }]
    });
    expect(coreBuildingDefinitions["mgq.spirit_shrine"].effect).toEqual({ type: "RESOURCE_ROUND_RESOURCE_DIE" });
    expect(faction.buildings.some((id) => id.startsWith("mgq.contract_"))).toBe(false);
    expect(faction.buildings).toEqual(expect.arrayContaining(["mgq.colosseum", "mgq.amiras_shop"]));
  });

  it("registers the starting seat, board asset contract, visual register gate and commander", () => {
    const faction = coreFactionDefinitions.mgq;
    expect(faction.startingTileId).toBe("MGQ-S1");
    expect(allTileDefinitions["MGQ-S1"].fields[0]).toEqual({ location: "town", faction: "mgq" });
    expect(allTileDefinitions["MGQ-S1"].assets).toMatchObject({ attachFieldSymbols: true, fieldSymbolScale: 0.62 });
    expect(townBoardSpecs.mgq.panoramaImage).toBe(faction.townImage);
    expect(townBoardSpecs.mgq.fullImage).toBe("/assets/anime/towns/mgq-paradox-town-full.webp");
    expect(townBoardSpecs.mgq.barTileImages).toHaveLength(7);
    expect(isPlayableFaction("mgq")).toBe(false);
    expect(isPlayableFaction("mgq", { enabled: true, isekaiTowns: false })).toBe(false);
    expect(isPlayableFaction("mgq", { enabled: true, isekaiTowns: true })).toBe(true);

    expect(COMMANDER_SLUG_BY_FACTION.mgq).toBe("sonya");
    expect(commanderDefinitions.sonya.cast.abilityId).toBe("commander-cast-shaman");
    expect(commanderDefinitions.sonya.cast.effect).toMatchObject({ kind: "initiative-shift", amountByPower: [2, 3, 4] });
    expect(commanderDefinitions.sonya.specialty.id).toBe("unbreakable-bond");
  });

  it("registers the three-item MGQ equipment line and Job Rank labels", () => {
    const equipmentIds = [
      EQUIPMENT_IDS.mgqAngelHalo,
      EQUIPMENT_IDS.mgqHeavenlyKnightsAegis,
      EQUIPMENT_IDS.mgqMonsterLordsRing
    ];
    expect(equipmentPackagesForFaction("mgq")).toEqual(["mgq"]);
    expect(equipmentIds.map((id) => ANIME_EQUIPMENT_DEFINITIONS[id].package)).toEqual(["mgq", "mgq", "mgq"]);
    expect(equipmentIds.map((id) => ANIME_EQUIPMENT_DEFINITIONS[id].grade)).toEqual(["I", "II", "III"]);
    expect(equipmentIds.map((id) => ANIME_EQUIPMENT_DEFINITIONS[id].slot)).toEqual(["weapon", "armor", "accessory"]);
    expect(equipmentIds.every((id) => ANIME_EQUIPMENT_ART_PLACEHOLDERS.has(id))).toBe(false);

    expect(factionGradeRegister("mgq")).toBe("mgq");
    expect(BESPOKE_FACTION_GRADE_REGISTERS.mgq).toBe("mgq");
    expect(HERO_GRADE_REGISTERS.mgq.map((grade) => grade.en)).toEqual([
      "Apprentice",
      "Journeyman",
      "Advanced Job",
      "Awakened"
    ]);
    expect(MGQ_JOB_MASTERY_NODE).toMatchObject({ id: "mgq-job-mastery", tier: 3, kind: "passive" });
    expect(HERO_GRADE_NODES[MGQ_JOB_MASTERY_NODE.id]).toBeUndefined();
    expect(HERO_GRADE_REGISTER_NODES.mgq).toEqual([MGQ_JOB_MASTERY_NODE]);
  });
});
