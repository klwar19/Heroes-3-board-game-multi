import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { commanderDefinitions } from "@/data/commanders";
import { unitAbilities } from "@/data/units/abilities";
import { inferFlavour, rankScheduleFor } from "@/data/units/experience-rank-abilities";
import { imperiumBuildingDefinitions, imperiumFactionDefinition, imperiumHeroDefinitions, imperiumUnitDefinitions } from "./imperium";
import { imperiumSpecialtyCards } from "./imperium-specialties";

const root = process.cwd();
const publicAsset = (url: string) => path.join(root, "public", url.replace(/^\//, ""));

describe("Imperium component set", () => {
  it("has exactly 4 Heroes and the requested 3/2/2 seven-unit progression", () => {
    expect(Object.keys(imperiumHeroDefinitions)).toEqual([
      "emperor_of_mankind",
      "roboute_guilliman",
      "rogal_dorn",
      "sanguinius"
    ]);
    expect(imperiumFactionDefinition.units).toHaveLength(7);
    expect(imperiumFactionDefinition.units.map((id) => imperiumUnitDefinitions[id].tier)).toEqual([
      "bronze", "bronze", "bronze", "silver", "silver", "gold", "gold"
    ]);
  });

  it("uses seven differentiated, legacy-scale unit profiles", () => {
    const profiles = Object.fromEntries(Object.entries(imperiumUnitDefinitions).map(([id, unit]) => [
      id,
      {
        type: unit.type,
        few: [unit.few!.attack, unit.few!.defense, unit.few!.health, unit.few!.initiative, unit.few!.cost.gold, unit.few!.cost.valuables ?? 0],
        pack: [unit.pack!.attack, unit.pack!.defense, unit.pack!.health, unit.pack!.initiative, unit.pack!.cost.gold, unit.pack!.cost.valuables ?? 0]
      }
    ]));
    expect(profiles).toEqual({
      "imperium.astra_militarum": { type: "ranged", few: [2, 0, 2, 4, 3, 0], pack: [2, 0, 3, 6, 5, 0] },
      "imperium.apothecary": { type: "ground", few: [2, 1, 3, 4, 3, 0], pack: [2, 1, 4, 5, 6, 0] },
      "imperium.space_marines": { type: "flying", few: [3, 0, 3, 7, 4, 0], pack: [3, 1, 4, 9, 7, 0] },
      "imperium.rhino": { type: "ground", few: [3, 1, 5, 5, 6, 0], pack: [4, 1, 6, 6, 10, 0] },
      "imperium.terminators": { type: "ground", few: [4, 2, 4, 5, 8, 0], pack: [5, 2, 4, 7, 13, 0] },
      "imperium.dreadnought": { type: "ranged", few: [5, 1, 7, 6, 13, 0], pack: [5, 1, 8, 8, 21, 1] },
      "imperium.titan": { type: "ground", few: [6, 3, 9, 4, 20, 1], pack: [7, 3, 10, 6, 29, 2] }
    });
    expect(imperiumUnitDefinitions["imperium.titan"].type).not.toBe("ranged");
    expect(Object.values(imperiumUnitDefinitions).filter((unit) => unit.type === "flying")).toHaveLength(1);
  });

  it("wires every printed faction ability to an implemented engine mechanic", () => {
    const ids = Object.values(imperiumUnitDefinitions).flatMap((unit) => [
      ...(unit.few?.abilities ?? []),
      ...(unit.pack?.abilities ?? [])
    ]);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(13);
    for (const id of ids) {
      expect(id.startsWith("imperium-"), id).toBe(true);
      expect(unitAbilities[id]?.implementationStatus, id).toBe("implemented");
      expect(unitAbilities[id]?.effect, id).toBeTruthy();
    }
    expect(unitAbilities["imperium-god-engine-sweep-few"].effect).toEqual({
      type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF",
      baseAttack: 3
    });
    expect(imperiumUnitDefinitions["imperium.space_marines"].pack?.abilities).toEqual(["imperium-shock-assault"]);
    expect(imperiumUnitDefinitions["imperium.rhino"].few?.abilities).toEqual(["imperium-armoured-escort"]);
    expect(imperiumUnitDefinitions["imperium.rhino"].pack?.abilities).toEqual(["imperium-armoured-escort"]);
    expect(unitAbilities["imperium-armoured-escort"].effect).toEqual({
      type: "INTERCEPT_ADJACENT_ATTACK_ONCE",
      maxProtectedTier: "silver"
    });
  });

  it("gives the seven units role-appropriate four-rank experience tracks", () => {
    expect(inferFlavour("imperium.apothecary")).toBe("mystic");
    expect(inferFlavour("imperium.rhino")).toBe("machine");
    expect(inferFlavour("imperium.terminators")).toBe("warden");
    expect(inferFlavour("imperium.titan")).toBe("machine");
    for (const id of imperiumFactionDefinition.units) {
      expect(Object.keys(rankScheduleFor(id)), id).toEqual(["1", "2", "3", "4"]);
    }
  });

  it("has all eight town effects and the Bronze-to-Silver-to-Gold prerequisite chain", () => {
    expect(Object.keys(imperiumBuildingDefinitions)).toHaveLength(8);
    expect(imperiumBuildingDefinitions["imperium.city_hall"]!.effect!.type).toBe("RESOURCE_ROUND_CHOICE");
    expect(imperiumBuildingDefinitions["imperium.armoury"]!.effect!.type).toBe("ARTIFACT_SMITH");
    expect(imperiumBuildingDefinitions["imperium.apothecarion"]!.effect!.type).toBe("HALL_OF_VALHALLA");
    expect(imperiumBuildingDefinitions["imperium.mage_guild"]!.effect!.type).toBe("MAGE_GUILD");
    expect(imperiumBuildingDefinitions["imperium.citadel"]!.effect!.type).toBe("UNLOCK_REINFORCE");
    expect(imperiumBuildingDefinitions["imperium.dwelling_silver"].prerequisites).toEqual(["imperium.dwelling_bronze"]);
    expect(imperiumBuildingDefinitions["imperium.dwelling_gold"].prerequisites).toEqual(["imperium.dwelling_silver"]);
  });

  it("ships both physical faces for every unit at exactly 743x1040", async () => {
    for (const unit of Object.values(imperiumUnitDefinitions)) {
      for (const side of [unit.few, unit.pack]) {
        expect(side?.cardImage).toBeTruthy();
        const file = publicAsset(side!.cardImage!);
        expect(existsSync(file), side!.cardImage).toBe(true);
        const metadata = await sharp(file).metadata();
        expect([metadata.width, metadata.height], side!.cardImage).toEqual([743, 1040]);
      }
    }
  });

  it("uses the requested female anime Lion Commander and ships her real framed face", () => {
    const lion = commanderDefinitions.lion_el_jonson;
    expect(lion.faction).toBe("Imperium of Man");
    expect(lion.cast.effect).toEqual({ kind: "enemy-damage", damageByPower: [1, 2, 3] });
    expect(lion.cast.targeting.adjacentBelowPower).toBe(3);
    expect(lion.additionalCasts?.[0]).toMatchObject({
      abilityId: "commander-cast-lion-counterstroke",
      effect: { kind: "unlimited-retaliation", duration: "combat" },
      targeting: { maxTierByPower: ["bronze", "silver", "gold"] }
    });
    expect(lion.specialty).toMatchObject({ id: "lion-round-barrage" });
    expect(existsSync(publicAsset(lion.cardImage))).toBe(true);
    expect(existsSync(publicAsset(lion.cast.icon))).toBe(true);
  });

  it("uses twelve original, mechanically distinct Imperium specialty cards", () => {
    const cards = Object.values(imperiumSpecialtyCards);
    expect(cards).toHaveLength(12);
    expect(new Set(cards.map((card) => card.name)).size).toBe(12);
    expect(new Set(cards.map((card) => JSON.stringify(card.effect))).size).toBe(12);
    expect(cards.every((card) => card.implementationStatus === "implemented")).toBe(true);
    expect(cards.every((card) => card.source.credit.includes("Original specialty mechanics"))).toBe(true);

    expect(imperiumSpecialtyCards["specialty.emperor_of_mankind.6"]!.effect.type).toBe("CHOOSE_ONE");
    expect(imperiumSpecialtyCards["specialty.emperor_of_mankind.6"]!.tags.join(" ")).not.toContain("Defense");
    expect(imperiumSpecialtyCards["specialty.emperor_of_mankind.6"]!.tags.join(" ")).toContain("additional Spell");
    expect(imperiumSpecialtyCards["specialty.roboute_guilliman.1"]!.phaseLimit).toEqual(["map"]);
    expect(imperiumSpecialtyCards["specialty.roboute_guilliman.1"]!.tags.join(" ")).toContain("gain 1 Building Material");
    expect(imperiumSpecialtyCards["specialty.roboute_guilliman.1"]!.tags.join(" ")).not.toContain("Gold");
    expect(imperiumSpecialtyCards["specialty.rogal_dorn.6"]!.target).toEqual({ type: "none" });
    expect(imperiumSpecialtyCards["specialty.rogal_dorn.6"]!.tags.join(" ")).toContain("treated as having a Defense token");
    expect(imperiumSpecialtyCards["specialty.sanguinius.6"]!.tags.join(" ")).toContain("heals damage equal to half");

    for (const id of [
      "specialty.emperor_of_mankind.1", "specialty.emperor_of_mankind.4",
      "specialty.roboute_guilliman.4", "specialty.rogal_dorn.1",
      "specialty.sanguinius.1", "specialty.sanguinius.6"
    ]) {
      const card = imperiumSpecialtyCards[id]!;
      expect(card.timing, id).toBe("instant");
      expect(card.phaseLimit, id).toContain("reaction");
      expect(card.tags.at(-1), id).toMatch(/^Instant/);
      expect(card.tags.at(-1), id).not.toContain("reaction window");
    }
  });

  it("ships Castle-format tile geometry plus 7 empty and 7 built town strips", async () => {
    const tile = publicAsset("/assets/warhammer/tiles/imperium-s1.webp");
    const tileMetadata = await sharp(tile).metadata();
    expect([tileMetadata.width, tileMetadata.height, tileMetadata.hasAlpha]).toEqual([1024, 985, true]);
    for (const state of ["empty", "built"] as const) {
      for (let bar = 1; bar <= 7; bar += 1) {
        const file = publicAsset(`/assets/warhammer/town-bars/imperium-${state}-bar-${bar}.webp`);
        expect(existsSync(file), `${state} bar ${bar}`).toBe(true);
        const metadata = await sharp(file).metadata();
        expect(metadata.height, `${state} bar ${bar}`).toBe(941);
      }
    }
  });
});
