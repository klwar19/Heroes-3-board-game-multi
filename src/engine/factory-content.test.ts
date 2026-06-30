import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  isPlayableFaction,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
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

  // ---- The non-playable gate (mutation-controlled against castle) -----------

  it("is flagged non-playable, unlike a real faction", () => {
    expect(coreFactionDefinitions.factory.playable).toBe(false);
    expect(isPlayableFaction("factory")).toBe(false);
    // CONTROL: a real faction is playable.
    expect(isPlayableFaction("castle")).toBe(true);
    expect(coreFactionDefinitions.castle.playable).not.toBe(false);
  });

  it("is excluded from the Random Town defender pool, despite having a unit roster", () => {
    // Factory HAS units (so the old units.length>0 rule would have included it)
    // — the playable flag is the only thing keeping it out.
    expect(coreFactionDefinitions.factory.units.length).toBeGreaterThan(0);
    expect(PLAYABLE_FACTIONS).not.toContain("factory");
    // CONTROL: castle has units and IS in the pool.
    expect(PLAYABLE_FACTIONS).toContain("castle");
  });

  it("cannot be picked in the setup lobby — CHOOSE_FACTION is rejected", () => {
    const state = createAdventureLobbyState({ seed: "factory-pick" });
    const result = applyAction(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "factory",
      heroDefId: "henrietta"
    });
    expect(result.errors.length, "picking Factory must be rejected").toBeGreaterThan(0);
    // CONTROL: the same flow accepts a real faction.
    const ok = apply(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
    expect(ok.setupLobby?.seats.find((s) => s.playerId === "p1")?.factionId).toBe("castle");
  });

  it("crashes loudly (not cryptically) if forced into a game — no real game can reach this", () => {
    // The direct programmatic constructor bypasses the lobby gate; the missing
    // starting tile guard makes a forced Factory setup fail with a CLEAR error
    // rather than a confusing downstream crash.
    expect(() =>
      createAdventureGameState({
        seed: "factory-forced",
        rollFirstPlayer: false,
        players: [
          { id: "p1", name: "H", factionId: "factory", heroDefId: "henrietta" },
          { id: "p2", name: "S", factionId: "necropolis", heroDefId: "sandro" }
        ]
      })
    ).toThrow(/Unknown map tile/u);
  });

  // ---- Honest stub markers (CLAUDE.md rule #1/#2) ---------------------------

  it("every unit is a pure stub: abilities: [] on BOTH sides", () => {
    for (const id of FACTORY_UNITS) {
      const unit = coreUnitDefinitions[id];
      expect(unit.few?.abilities, `${id} few abilities`).toEqual([]);
      expect(unit.pack?.abilities, `${id} pack abilities`).toEqual([]);
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
