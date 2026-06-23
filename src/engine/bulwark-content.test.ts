import { describe, expect, it } from "vitest";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions } from "@/data/map/tiles";
import { createAdventureGameState } from "./index";

/**
 * Bulwark faction registration end-to-end. Behavioural rune coverage lives in
 * bulwark-runes.test.ts (the mechanic), bulwark-units.test.ts (abilities) and
 * bulwark-heroes.test.ts (specialties); this file proves the faction is wired
 * together and actually playable.
 */
describe("Bulwark faction wiring", () => {
  it("registers the faction with its S10 starting tile, eight buildings, six heroes and seven units", () => {
    const faction = coreFactionDefinitions.bulwark;
    expect(faction).toBeDefined();
    expect(faction.id).toBe("bulwark");
    expect(faction.color).toBeTruthy();
    expect(faction.startingTileId).toBe("S10");
    expect(startingTileByFaction.bulwark).toBe("S10");

    expect(faction.heroes).toEqual(["dhuin", "creyle", "glacius", "kriv", "eikthurn", "oidana"]);
    expect(faction.units).toEqual([
      "bulwark.kobolds",
      "bulwark.mountain_rams",
      "bulwark.snow_elves",
      "bulwark.yetis",
      "bulwark.shamans",
      "bulwark.mammoths",
      "bulwark.jotunns"
    ]);
    expect(faction.buildings).toHaveLength(8);
    expect(faction.buildings).toEqual(expect.arrayContaining(["bulwark.sieidi", "bulwark.altar", "bulwark.city_hall"]));
  });

  it("ties the faction to the Rune mechanic via its Sieidi/Altar buildings", () => {
    expect(coreBuildingDefinitions["bulwark.sieidi"].effect).toMatchObject({ type: "RUNE_ALTAR", levelCap: 2 });
    expect(coreBuildingDefinitions["bulwark.altar"].effect).toMatchObject({ type: "RUNE_ALTAR", levelCap: 3 });
  });

  it("defines the S10 Snow starting tile carrying the Bulwark town", () => {
    const tile = allTileDefinitions.S10;
    expect(tile, "S10 should be defined").toBeDefined();
    expect(tile.group).toBe("starting");
    expect(tile.terrain).toBe("snow");
    expect(tile.content).toBe("bulwark_expansion");
    expect(tile.fields[0]).toMatchObject({ location: "town", faction: "bulwark" });
  });

  it("registers all seven units under the bulwark faction", () => {
    for (const id of coreFactionDefinitions.bulwark.units) {
      expect(coreUnitDefinitions[id]?.faction, id).toBe("bulwark");
    }
  });

  it("registers all six heroes under the bulwark faction with a portrait", () => {
    for (const id of coreFactionDefinitions.bulwark.heroes) {
      const hero = coreHeroDefinitions[id];
      expect(hero?.faction, id).toBe("bulwark");
      expect(hero.portrait, `${id} portrait`).toBeTruthy(); // placeholder path; UI falls back to the initial
    }
  });

  it("can start an adventure as Bulwark (S10, hero deck and town all resolve)", () => {
    const state = createAdventureGameState({
      seed: "bulwark-playable",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Dhuin", factionId: "bulwark", heroDefId: "dhuin" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    expect(state.players.p1.factionId).toBe("bulwark");
    expect(state.players.p1.deck.length, "the Bulwark hero builds a starting deck").toBeGreaterThan(0);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town?.factionId, "the Bulwark town is placed").toBe("bulwark");
  });
});
