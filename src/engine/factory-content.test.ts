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
import { adventureCards } from "@/data/cards/adventure";
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

  // ---- A real, playable faction (&S1 starting tile) -------------------------

  it("is playable and registered with its &S1 starting tile", () => {
    expect(isPlayableFaction("factory")).toBe(true);
    expect(coreFactionDefinitions.factory.playable).not.toBe(false);
    expect(coreFactionDefinitions.factory.startingTileId).toBe("&S1");
    expect(startingTileByFaction.factory).toBe("&S1");
    // The &S1 tile exists, is a starting tile, and carries the Factory town.
    const tile = allTileDefinitions["&S1"];
    expect(tile, "&S1 tile is defined").toBeDefined();
    expect(tile.group).toBe("starting");
    expect(tile.fields[0]).toMatchObject({ location: "town", faction: "factory" });
    expect(tile.assets?.tileImage).toBe("/assets/board/tiles/sf1.webp");
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

  it("can start an adventure as Factory — the &S1 town and hero deck resolve", () => {
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

  it("the engine-wired unit abilities are registered, implemented ids on the right sides", () => {
    const u = coreUnitDefinitions;
    // Halflings roll-two-take-higher on BOTH faction sides.
    expect(u["factory.halflings"].few?.abilities, "halflings few").toEqual(["attack-roll-advantage"]);
    expect(u["factory.halflings"].pack?.abilities, "halflings pack").toEqual(["attack-roll-advantage"]);
    // Automatons: the Pack "Ignore Retaliation" and the single-cost NEUTRAL guard's
    // 1-damage on-death Detonate are wired. (The faction Few's cube-scaled Detonate
    // is not yet wired — display-only, pinned by the next test.)
    expect(u["factory.automatons"].pack?.abilities, "automatons pack").toEqual(["ignores-retaliation"]);
    expect(u["factory.automatons"].neutral?.abilities, "automatons neutral").toEqual(["automaton-detonate-1"]);
    for (const abilityId of ["attack-roll-advantage", "ignores-retaliation", "automaton-detonate-1"]) {
      expect(unitAbilities[abilityId]?.implementationStatus, `${abilityId} implemented`).toBe("implemented");
    }
    // The fabricated abilities the placeholder carried are GONE from every side.
    for (const id of FACTORY_UNITS) {
      for (const side of ["few", "pack", "neutral"] as const) {
        const abilities = coreUnitDefinitions[id][side]?.abilities ?? [];
        expect(abilities, `${id} ${side} has no fabricated ability`).not.toContain("armadillo-curl");
        expect(abilities, `${id} ${side} has no fabricated ability`).not.toContain("double-attack");
        expect(abilities, `${id} ${side} has no fabricated ability`).not.toContain("ignore-all-combat-penalties");
      }
    }
  });

  it("the not-yet-wired sides stay HONEST display-only stubs (abilities: [])", () => {
    // Each printed-but-unwired side must carry [] (real card text in abilityText,
    // engine effect not claimed). Wiring these is the remaining Factory work.
    const displayOnly: [string, ("few" | "pack" | "neutral")[]][] = [
      ["factory.mechanics", ["few", "pack", "neutral"]],
      ["factory.armadillos", ["few", "pack", "neutral"]],
      ["factory.automatons", ["few"]],
      ["factory.sandworms", ["few", "pack", "neutral"]],
      ["factory.gunslingers", ["few", "pack", "neutral"]],
      ["factory.couatls", ["few", "pack", "neutral"]],
      ["factory.dreadnoughts", ["few", "pack", "neutral"]]
    ];
    for (const [id, sides] of displayOnly) {
      for (const side of sides) {
        expect(coreUnitDefinitions[id][side]?.abilities, `${id} ${side}`).toEqual([]);
      }
    }
  });

  it("carries the physical-card stats/costs and single-cost Neutral sides (the redo)", () => {
    // Regression guard against the PC-guess placeholders: a few exact card values.
    expect(coreUnitDefinitions["factory.halflings"].few).toMatchObject({ attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 3 } });
    expect(coreUnitDefinitions["factory.automatons"].few).toMatchObject({ attack: 3, defense: 1, health: 4, initiative: 8, cost: { gold: 6 } });
    expect(coreUnitDefinitions["factory.dreadnoughts"].pack).toMatchObject({ attack: 5, defense: 3, health: 10, initiative: 7, cost: { gold: 32, valuables: 2 } });
    expect(coreUnitDefinitions["factory.couatls"].few).toMatchObject({ cost: { gold: 18, valuables: 1 } });
    // The gold ranged unit's printed name is Bounty Hunters (id kept as gunslingers).
    expect(coreUnitDefinitions["factory.gunslingers"].name).toBe("Bounty Hunters");
    // Every scanned unit gained its single-sided Neutral guard stat block.
    for (const id of ["factory.mechanics", "factory.automatons", "factory.armadillos", "factory.sandworms", "factory.gunslingers", "factory.couatls", "factory.dreadnoughts"]) {
      expect(coreUnitDefinitions[id].neutral, `${id} neutral side`).toBeDefined();
    }
  });

  it("Henrietta and Frederick ship real specialties (I/IV/VI) that resolve in the library", () => {
    for (const id of ["henrietta", "frederick"]) {
      const ids = coreHeroDefinitions[id].specialtyCardIds;
      expect(ids, `${id} specialtyCardIds`).toBeDefined();
      for (const level of [1, 4, 6] as const) {
        const cardId = ids![level];
        expect(cardId, `${id} level ${level}`).toBe(`specialty.${id}.${level}`);
        const card = adventureCards[cardId];
        expect(card, `${cardId} exists`).toBeTruthy();
        expect(card.implementationStatus, `${cardId} implemented`).toBe("implemented");
        // Face-less specialties must render natively (no missing art file).
        expect(card.assets?.cardImage, `${cardId} has no missing art`).toBeUndefined();
      }
    }
  });

  it("the other Factory heroes are still specialty-less stubs", () => {
    for (const id of FACTORY_HEROES.filter((h) => h !== "henrietta" && h !== "frederick")) {
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
