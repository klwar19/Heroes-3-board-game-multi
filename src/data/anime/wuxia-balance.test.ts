import { describe, expect, it } from "vitest";

import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { UnitSideDefinition } from "@/data/factions/types";

const CLASSIC_TOWNS = [
  "castle",
  "rampart",
  "necropolis",
  "inferno",
  "tower",
  "dungeon",
  "stronghold",
  "fortress"
] as const;
const CULTIVATION_TOWNS = ["azure_breeze", "heavenly_demon"] as const;

/** Mirrors the real AI threat read before ability value is added. */
function rawCombatValue(side: UnitSideDefinition): number {
  return side.attack * 3 + side.health * 2 + side.defense + Math.round(side.initiative / 2);
}

function effectiveCost(side: UnitSideDefinition): number {
  return (side.cost.gold ?? 0) + (side.cost.valuables ?? 0) * 6;
}

describe("cultivation towns — original-game balance comparison", () => {
  it("keeps every printed side at or below the classic peer ceiling before faction mechanics", () => {
    for (const factionId of CULTIVATION_TOWNS) {
      coreFactionDefinitions[factionId].units.forEach((unitId, levelIndex) => {
        const unit = coreUnitDefinitions[unitId];
        for (const variant of ["few", "pack"] as const) {
          const value = rawCombatValue(unit[variant]!);
          const peers = CLASSIC_TOWNS.map((classicId) => {
            const peerId = coreFactionDefinitions[classicId].units[levelIndex]!;
            return rawCombatValue(coreUnitDefinitions[peerId][variant]!);
          });
          // Up to four raw points below the lightest peer is intentional on the
          // level-7 lines: Soul Banner/Reap and Sect Qi/healing supply the rest.
          expect(value, `${unitId} ${variant} too weak before its town engine`).toBeGreaterThanOrEqual(Math.min(...peers) - 4);
          expect(value, `${unitId} ${variant} exceeds every classic peer before abilities`).toBeLessThanOrEqual(Math.max(...peers));
        }
      });
    }
  });

  it("prices the two rosters within 80–100% of classic raw efficiency, leaving room for their mechanics", () => {
    const efficiency = (factionId: string): number => {
      const values = coreFactionDefinitions[factionId].units.map((unitId) => {
        const side = coreUnitDefinitions[unitId].pack!;
        return rawCombatValue(side) / effectiveCost(side);
      });
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    const classicAverage = CLASSIC_TOWNS.reduce((sum, factionId) => sum + efficiency(factionId), 0) / CLASSIC_TOWNS.length;
    for (const factionId of CULTIVATION_TOWNS) {
      expect(efficiency(factionId), `${factionId} base efficiency floor`).toBeGreaterThanOrEqual(classicAverage * 0.8);
      expect(efficiency(factionId), `${factionId} must pay for its faction engine`).toBeLessThanOrEqual(classicAverage);
    }
  });

  it("pins the requested final corrections and the level-3 crane order", () => {
    expect(coreFactionDefinitions.azure_breeze.units[2]).toBe("azure_breeze.spirit_crane");
    expect(coreUnitDefinitions["azure_breeze.spirit_crane"].tier).toBe("bronze");
    expect(coreUnitDefinitions["azure_breeze.sect_protectors"].few).toMatchObject({ defense: 2 });
    expect(coreUnitDefinitions["azure_breeze.sect_protectors"].pack).toMatchObject({ defense: 2, cost: { gold: 13 } });
    expect(coreUnitDefinitions["azure_breeze.core_master"]).toMatchObject({
      name: "Golden Core Elders",
      type: "ranged",
      few: { defense: 2 },
      pack: { defense: 2, cost: { gold: 22, valuables: 1 } }
    });
    expect(coreUnitDefinitions["heavenly_demon.shadow_wraiths"]).toMatchObject({
      name: "Shadow Sabre Disciples",
      pack: { attack: 3 }
    });
    expect(coreUnitDefinitions["heavenly_demon.corpse_puppets"]).toMatchObject({
      few: { defense: 2 },
      pack: { defense: 2 }
    });
  });
});
