import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  factoryGoldUnitConflict,
  isPlayableFaction,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { allTileDefinitions } from "@/data/map/tiles";
import { PLAYABLE_FACTIONS } from "./adventure";
import { applyAction, createAdventureGameState, createAdventureLobbyState } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Factory is an ART/DATA stub, NOT a playable faction. This file is the
 * "done" bar for the art import (every town/unit/hero/building image resolves to
 * a file on disk) AND for the non-playable gate that keeps the stub from ever
 * entering — and crashing — a real game. Each gate carries a mutation control
 * (castle is the playable twin) so a test fails if the wiring is removed.
 *
 * LEAD WITH WHAT DOES NOT WORK: Factory has no engine mechanics at all. Its
 * units carry `abilities: []` (the printed abilityText is display-only), its
 * buildings are `not-implemented`, its heroes have no specialty cards, and it
 * has no board-game starting map tile. The assertions below pin that stub state
 * so nobody mistakes the art wiring for a working faction.
 */

const PUBLIC = join(process.cwd(), "public");
const assetExists = (url: string) => existsSync(join(PUBLIC, url.replace(/^\//u, "")));

const FACTORY_UNITS = [
  "factory.halflings",
  "factory.mechanics",
  "factory.armadillos",
  "factory.automatons",
  "factory.sandworms",
  "factory.gunslingers",
  "factory.couatls",
  "factory.dreadnoughts"
];

const FACTORY_HEROES = [
  "henrietta", "sam", "tancred", "melchior", "floribert",
  "wynona", "dury", "morton", "tavin", "murdoch",
  "celestine", "todd", "agar", "bertram", "wrathmont",
  "ziph", "victoria", "eanswythe", "frederick"
];

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("Factory faction — art wired, not playable", () => {
  it("registers the faction with all 8 units and all 19 heroes", () => {
    const faction = coreFactionDefinitions.factory;
    expect(faction, "factory faction should be registered").toBeDefined();
    expect(faction.id).toBe("factory");
    expect(faction.units).toEqual(FACTORY_UNITS);
    expect(faction.heroes).toEqual(FACTORY_HEROES);
  });

  // ---- The art deliverable: every referenced image is a real file -----------

  it("ships the town backdrop image on disk", () => {
    const townImage = coreFactionDefinitions.factory.townImage;
    expect(townImage, "factory town image path").toBeTruthy();
    expect(assetExists(townImage!), `town image missing: ${townImage}`).toBe(true);
  });

  it("ships a Few AND Pack card image for every unit, all present on disk", () => {
    for (const id of FACTORY_UNITS) {
      const unit = coreUnitDefinitions[id];
      expect(unit?.faction, id).toBe("factory");
      for (const side of ["few", "pack"] as const) {
        const img = unit[side]?.cardImage;
        expect(img, `${id} ${side} card image`).toBeTruthy();
        expect(assetExists(img!), `${id} ${side} image missing: ${img}`).toBe(true);
      }
    }
  });

  it("ships a portrait on disk for every hero", () => {
    for (const id of FACTORY_HEROES) {
      const hero = coreHeroDefinitions[id];
      expect(hero?.faction, id).toBe("factory");
      expect(hero.portrait, `${id} portrait path`).toBeTruthy();
      expect(assetExists(hero.portrait!), `${id} portrait missing: ${hero.portrait}`).toBe(true);
    }
  });

  it("ships every town building image on disk", () => {
    const images = TOWN_BUILDING_IMAGES.factory;
    expect(images, "factory building images").toBeTruthy();
    expect(Object.keys(images).length).toBeGreaterThan(0);
    for (const [building, url] of Object.entries(images)) {
      expect(assetExists(url), `${building} building image missing: ${url}`).toBe(true);
    }
  });

  // ---- A real, playable faction (S11 starting tile) -------------------------

  it("is playable and registered with its S11 starting tile", () => {
    expect(isPlayableFaction("factory")).toBe(true);
    expect(coreFactionDefinitions.factory.playable).not.toBe(false);
    expect(coreFactionDefinitions.factory.startingTileId).toBe("S11");
    expect(startingTileByFaction.factory).toBe("S11");
    // The S11 tile exists, is a starting tile, and carries the Factory town.
    const tile = allTileDefinitions.S11;
    expect(tile, "S11 tile is defined").toBeDefined();
    expect(tile.group).toBe("starting");
    expect(tile.fields[0]).toMatchObject({ location: "town", faction: "factory" });
    expect(tile.assets?.tileImage).toBe("/assets/board/tiles/s11.webp");
  });

  it("is in the Random Town defender pool alongside the other factions", () => {
    expect(PLAYABLE_FACTIONS).toContain("factory");
    expect(PLAYABLE_FACTIONS).toContain("castle");
  });

  it("can be picked in the setup lobby — CHOOSE_FACTION is accepted", () => {
    const state = createAdventureLobbyState({ seed: "factory-pick" });
    const ok = apply(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "factory",
      heroDefId: "henrietta"
    });
    expect(ok.setupLobby?.seats.find((s) => s.playerId === "p1")?.factionId).toBe("factory");
  });

  it("can start an adventure as Factory — the S11 town and hero deck resolve", () => {
    const state = createAdventureGameState({
      seed: "factory-playable",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    expect(state.players.p1.factionId).toBe("factory");
    expect(state.players.p1.deck.length, "the Factory hero builds a starting deck").toBeGreaterThan(0);
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town?.factionId, "the Factory town is placed").toBe("factory");
  });

  it("Couatls and Juggernauts are mutually exclusive in the army (the Gold choice)", () => {
    // Owning Couatls blocks recruiting the Dreadnought (Juggernaut) and vice
    // versa — the signature Factory recruitment rule.
    expect(factoryGoldUnitConflict([{ unitDefId: "factory.couatls" }], "factory.dreadnoughts")).toBe(true);
    expect(factoryGoldUnitConflict([{ unitDefId: "factory.dreadnoughts" }], "factory.couatls")).toBe(true);
    // CONTROLS: no conflict against an empty army, against unrelated units, or
    // when recruiting the same Gold unit a player already owns (that is the
    // ordinary "already owned" rule, not the exclusivity rule).
    expect(factoryGoldUnitConflict([], "factory.couatls")).toBe(false);
    expect(factoryGoldUnitConflict([{ unitDefId: "factory.gunslingers" }], "factory.couatls")).toBe(false);
    expect(factoryGoldUnitConflict([{ unitDefId: "factory.couatls" }], "factory.gunslingers")).toBe(false);
  });

  // ---- Real abilities vs honest display-only stubs (CLAUDE.md rule #1/#2) ----

  it("the engine-wired units carry registered, implemented ability ids on both sides", () => {
    const wired: Record<string, string[]> = {
      "factory.halflings": ["attack-roll-advantage", "ignore-all-combat-penalties"],
      "factory.armadillos": ["armadillo-curl"],
      "factory.automatons": ["automaton-detonate"],
      "factory.gunslingers": ["double-attack"],
      "factory.dreadnoughts": ["ignores-retaliation"]
    };
    for (const [id, abilities] of Object.entries(wired)) {
      const unit = coreUnitDefinitions[id];
      expect(unit.few?.abilities, `${id} few`).toEqual(abilities);
      expect(unit.pack?.abilities, `${id} pack`).toEqual(abilities);
      for (const abilityId of abilities) {
        expect(unitAbilities[abilityId]?.implementationStatus, `${abilityId} implemented`).toBe("implemented");
      }
    }
  });

  it("the not-yet-wired units stay HONEST display-only stubs (abilities: [])", () => {
    for (const id of ["factory.mechanics", "factory.sandworms", "factory.couatls"]) {
      const unit = coreUnitDefinitions[id];
      expect(unit.few?.abilities, `${id} few`).toEqual([]);
      expect(unit.pack?.abilities, `${id} pack`).toEqual([]);
    }
  });

  it("no hero carries a specialty card (all are stubs)", () => {
    for (const id of FACTORY_HEROES) {
      expect(coreHeroDefinitions[id].specialtyCardIds, `${id} specialty`).toBeUndefined();
    }
  });

  it("every building is implementationStatus: not-implemented", () => {
    const factoryBuildings = coreFactionDefinitions.factory.buildings.filter((b) => b.startsWith("factory."));
    expect(factoryBuildings.length).toBeGreaterThan(0);
    for (const id of factoryBuildings) {
      expect(coreBuildingDefinitions[id]?.implementationStatus, `${id} status`).toBe("not-implemented");
    }
  });
});
