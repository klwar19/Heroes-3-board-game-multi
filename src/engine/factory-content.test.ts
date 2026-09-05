import { describe, expect, it } from "vitest";

import { hasMediaFile } from "@/lib/media-manifest";

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
import { townBoardSpecs, townBoardTileArt, townBoardUnbuiltTileArt } from "@/data/towns/boards";
import { specialtyIconSrc } from "@/components/specialty-card-data";
import { unitAbilities } from "@/data/units/abilities";
import { adventureCards } from "@/data/cards/adventure";
import { allTileDefinitions } from "@/data/map/tiles";
import { PLAYABLE_FACTIONS } from "./adventure";
import { applyAction, createAdventureGameState, createAdventureLobbyState } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Factory is a PLAYABLE Expansion faction with its own &S1 starting tile. This
 * file is the "done" bar for the art import (every town/unit/hero/building image
 * resolves to a file on disk) AND for the playable wiring (registered faction,
 * &S1 starting tile carrying the Factory town, Random-Town defender pool, lobby
 * pick, real adventure start). Each claim carries a mutation control (castle is
 * the twin) so a test fails if the wiring is removed.
 *
 * The Factory unit abilities and combat rules are pinned in their own files
 * (factory-unit-abilities.test.ts / factory-combat.test.ts / factory-gold-
 * abilities.test.ts); this file covers the art + the faction/tile wiring.
 */

/** Published in media-manifest.json (the CDN truth) — `npm run media:publish` after adding art. */
const assetExists = (url: string) => hasMediaFile(url);

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

// The six kept Factory heroes — each an engine-wired unit specialist. The other
// 13 placeholder heroes were removed.
const FACTORY_HEROES = ["henrietta", "sam", "tancred", "celestine", "agar", "frederick"];

// Which Factory unit each kept hero's I/IV/VI specialty buffs.
const FACTORY_HERO_SPECIALTY_UNIT: Record<string, string> = {
  henrietta: "Halflings",
  sam: "Mechanics",
  tancred: "Bounty Hunters",
  celestine: "Armadillos",
  agar: "Sandworms",
  frederick: "Automatons"
};

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("Factory faction — art wired and playable (&S1 starting tile)", () => {
  it("registers the faction with all 8 units and the 6 kept heroes", () => {
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
    expect(assetExists(townImage!), `town image not published (npm run media:publish): ${townImage}`).toBe(true);
  });

  it("ships a Few AND Pack card image for every unit, all present on disk", () => {
    for (const id of FACTORY_UNITS) {
      const unit = coreUnitDefinitions[id];
      expect(unit?.faction, id).toBe("factory");
      for (const side of ["few", "pack"] as const) {
        const img = unit[side]?.cardImage;
        expect(img, `${id} ${side} card image`).toBeTruthy();
        expect(assetExists(img!), `${id} ${side} image not published (npm run media:publish): ${img}`).toBe(true);
      }
    }
  });

  it("ships a portrait on disk for every hero", () => {
    for (const id of FACTORY_HEROES) {
      const hero = coreHeroDefinitions[id];
      expect(hero?.faction, id).toBe("factory");
      expect(hero.portrait, `${id} portrait path`).toBeTruthy();
      expect(assetExists(hero.portrait!), `${id} portrait not published (npm run media:publish): ${hero.portrait}`).toBe(true);
    }
  });

  it("every Factory unit-specialist shows the unit's clean PORTRAIT (on disk), not the card art", () => {
    // The specialty picture is the unit's own creature portrait
    // (units-factory-<unit>-portrait.webp), matching every other unit specialist —
    // NOT the full unit card (…-few.webp), which rendered as a shrunk, framed card.
    for (const id of FACTORY_HEROES) {
      const icon = specialtyIconSrc(`specialty.${id}.1`);
      expect(icon, `${id} specialty icon`).toBeTruthy();
      expect(icon!, `${id} uses a -portrait crop`).toMatch(/units-factory-[a-z_]+-portrait\.webp$/u);
      expect(icon!, `${id} does not borrow the full unit card`).not.toMatch(/-(few|pack|neutral)\.webp$/u);
      expect(assetExists(icon!), `${id} specialty portrait not published (npm run media:publish): ${icon}`).toBe(true);
    }
  });

  it("ships every town building image on disk", () => {
    const images = TOWN_BUILDING_IMAGES.factory;
    expect(images, "factory building images").toBeTruthy();
    expect(Object.keys(images).length).toBeGreaterThan(0);
    for (const [building, url] of Object.entries(images)) {
      expect(assetExists(url), `${building} building image not published (npm run media:publish): ${url}`).toBe(true);
    }
  });

  it("renders the real printed BUILDING TILES (built art + name/cost plaque) — not the panorama reveal", () => {
    const spec = townBoardSpecs.factory;
    expect(spec.realTileArt, "factory board uses the real printed tiles").toBe(true);
    // The muddy fullImage panorama-reveal is gone, so nothing overlays the tiles.
    expect(spec.fullImage, "no panorama-reveal image").toBeUndefined();
    // Every building with a real printed scan ships BOTH tile states on disk; the
    // built art carries NO cost banner, the "-unbuilt" plaque carries the cost.
    for (const building of ["city_hall", "citadel", "mage_guild", "bank", "dwelling_bronze", "dwelling_silver", "dwelling_gold"]) {
      const id = `factory.${building}`;
      expect(assetExists(townBoardTileArt(id)), `${id} built tile not published (npm run media:publish)`).toBe(true);
      expect(assetExists(townBoardUnbuiltTileArt(id)), `${id} unbuilt plaque not published (npm run media:publish)`).toBe(true);
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

  it("&S1 fields follow the real sf1.webp scan (not the Stronghold-S7 rotation)", () => {
    // Ring slots 1-6 = NE, E, SE, SW, W, NW. Read off the printed art: campfire +
    // crossed-pick resource (NE), open pine-desert (E) and rocky outcrop (SE),
    // the "I" treasure cabin (SW), the "loop 2" materials mine "I" (W), and the
    // "&S1" tar-chasm anchor (NW). This diverges from the old S7-clone rotation
    // (which put the mine at NE and the blocked field at E), so a regression back
    // to it fails here.
    const f = allTileDefinitions["&S1"].fields;
    expect(f[1]).toMatchObject({ location: "resource_symbol" }); // NE
    expect(f[2]).toMatchObject({ location: "empty_field" }); // E
    expect(f[3]).toMatchObject({ location: "empty_field" }); // SE
    expect(f[4]).toMatchObject({ location: "treasure_symbol", difficulty: 1 }); // SW
    expect(f[5]).toMatchObject({
      location: "mine",
      resource: "buildingMaterials",
      amount: 2,
      difficulty: 1
    }); // W
    expect(f[6]).toMatchObject({ location: "blocked_field" }); // NW
    // The blocked-field anchor's outer edge is sealed (best-fit borders).
    expect(allTileDefinitions["&S1"].outerImpassable[5]).toBe(true);
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
    const state = createAdventureGameState({ startingBuildings: [],
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
    // Halflings roll-two-take-higher on BOTH faction sides; the Pack ALSO drops a
    // Corrosion token on a "+1" roll (halfling-precise-shot).
    expect(u["factory.halflings"].few?.abilities, "halflings few").toEqual(["attack-roll-advantage"]);
    expect(u["factory.halflings"].pack?.abilities, "halflings pack").toEqual(["attack-roll-advantage", "halfling-precise-shot"]);
    // Mechanics: the "Attack 2 spaces in a line" reach on all three sides (Few/
    // Neutral at attack 1, Pack at attack 2), plus the Field Repair on the two
    // faction sides (Few remove-1, Pack remove-2-or-+1-Attack). The Neutral guard
    // prints only the reach.
    expect(u["factory.mechanics"].few?.abilities, "mechanics few").toEqual(["mechanics-repair-1", "mechanics-line-attack-1"]);
    expect(u["factory.mechanics"].pack?.abilities, "mechanics pack").toEqual(["mechanics-repair-2", "mechanics-line-attack-2"]);
    expect(u["factory.mechanics"].neutral?.abilities, "mechanics neutral").toEqual(["mechanics-line-attack-1"]);
    // Automatons: the Pack "Ignore Retaliation" and the single-cost NEUTRAL guard's
    // 1-damage on-death Detonate are wired. (The faction Few's cube-scaled Detonate
    // is not yet wired — display-only, pinned by the next test.)
    expect(u["factory.automatons"].pack?.abilities, "automatons pack").toEqual(["ignores-retaliation"]);
    expect(u["factory.automatons"].neutral?.abilities, "automatons neutral").toEqual(["automaton-detonate-1"]);
    // Sandworms: printed wing icon → flying; NEUTRAL guard strikes adjacent again.
    expect(u["factory.sandworms"].type, "sandworms flying").toBe("flying");
    expect(u["factory.sandworms"].neutral?.abilities, "sandworms neutral").toEqual(["sandworm-strike-again"]);
    // Armadillos PACK amplifies any Initiative increase by +1 (Few/Neutral bare).
    expect(u["factory.armadillos"].pack?.abilities, "armadillos pack").toEqual(["armadillo-initiative-amplify"]);
    // Bounty Hunters Mark on both faction sides (Few +1, Pack +2 vs Marked).
    expect(u["factory.gunslingers"].few?.abilities, "bounty hunters few").toEqual(["bounty-hunter-mark-1"]);
    expect(u["factory.gunslingers"].pack?.abilities, "bounty hunters pack").toEqual(["bounty-hunter-mark-2"]);
    for (const abilityId of [
      "attack-roll-advantage", "halfling-precise-shot", "mechanics-line-attack-1", "mechanics-line-attack-2",
      "mechanics-repair-1", "mechanics-repair-2", "ignores-retaliation", "automaton-detonate-1",
      "sandworm-strike-again", "armadillo-initiative-amplify", "bounty-hunter-mark-1", "bounty-hunter-mark-2"
    ]) {
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

  it("the only bare sides are the ones with NO printed ability (abilities: [])", () => {
    // Every printed Factory ability is now engine-wired. The sides that still
    // carry [] do so because their physical card prints no ability at all — NOT
    // because an ability is stubbed. (All the former stubs — Automaton Few cube
    // Detonate, Sandworm Pack cube attack, Bounty Hunter Neutral Preemptive Shot,
    // Couatl Few/Pack invulnerability, Dreadnought splash — are wired below.)
    const genuinelyBare: [string, ("few" | "pack" | "neutral")[]][] = [
      ["factory.armadillos", ["few", "neutral"]],
      ["factory.sandworms", ["few"]],
      ["factory.couatls", ["neutral"]]
    ];
    for (const [id, sides] of genuinelyBare) {
      for (const side of sides) {
        expect(coreUnitDefinitions[id][side]?.abilities, `${id} ${side}`).toEqual([]);
      }
    }
  });

  it("every former Factory display-only stub is now an implemented, engine-wired ability", () => {
    const u = coreUnitDefinitions;
    // The exact ids that replaced each stub, pinned to their side.
    expect(u["factory.automatons"].few?.abilities, "automaton few cube Detonate").toEqual([
      "automaton-place-cube",
      "automaton-detonate-cubes"
    ]);
    expect(u["factory.sandworms"].pack?.abilities, "sandworm pack cube attack").toEqual([
      "sandworm-cube-gain",
      "sandworm-cube-attack"
    ]);
    expect(u["factory.gunslingers"].neutral?.abilities, "bounty hunter neutral preemptive").toEqual([
      "bounty-hunter-preemptive"
    ]);
    expect(u["factory.couatls"].few?.abilities, "couatl few invuln").toEqual(["couatl-invulnerability-few"]);
    expect(u["factory.couatls"].pack?.abilities, "couatl pack invuln").toEqual(["couatl-invulnerability-pack"]);
    expect(u["factory.dreadnoughts"].few?.abilities, "dreadnought few splash").toEqual(["dreadnought-splash-1"]);
    expect(u["factory.dreadnoughts"].pack?.abilities, "dreadnought pack splash").toEqual(["dreadnought-splash-2"]);
    expect(u["factory.dreadnoughts"].neutral?.abilities, "dreadnought neutral splash").toEqual(["dreadnought-splash-2"]);
    for (const abilityId of [
      "automaton-place-cube", "automaton-detonate-cubes", "sandworm-cube-gain", "sandworm-cube-attack",
      "bounty-hunter-preemptive", "couatl-invulnerability-few", "couatl-invulnerability-pack",
      "dreadnought-splash-1", "dreadnought-splash-2"
    ]) {
      expect(unitAbilities[abilityId]?.implementationStatus, `${abilityId} implemented`).toBe("implemented");
    }
  });

  it("carries the physical-card stats/costs and single-cost Neutral sides (the redo)", () => {
    // Regression guard against the PC-guess placeholders: a few exact card values.
    // House-rule rebalance: the three bronze units' Few recruit cost is 2/3/4 gold
    // (Halflings lv1 / Mechanics lv2 / Armadillos lv3).
    expect(coreUnitDefinitions["factory.halflings"].few).toMatchObject({ attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 2 } });
    expect(coreUnitDefinitions["factory.mechanics"].few).toMatchObject({ cost: { gold: 3 } });
    expect(coreUnitDefinitions["factory.armadillos"].few).toMatchObject({ cost: { gold: 4 } });
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

  it("every kept Factory hero ships a real I/IV/VI unit specialty that resolves in the library", () => {
    for (const id of FACTORY_HEROES) {
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
        // The I-level card is the unit-specialist card for this hero's unit.
        if (level === 1) {
          expect(card.name, `${id} specialty unit`).toContain(FACTORY_HERO_SPECIALTY_UNIT[id]);
        }
      }
    }
  });

  it("the 13 placeholder heroes are gone from the faction and the hero library", () => {
    const removed = [
      "melchior", "floribert", "wynona", "dury", "morton", "tavin", "murdoch",
      "todd", "bertram", "wrathmont", "ziph", "victoria", "eanswythe"
    ];
    for (const id of removed) {
      expect(coreHeroDefinitions[id], `${id} removed from library`).toBeUndefined();
      expect(coreFactionDefinitions.factory.heroes, `${id} not in roster`).not.toContain(id);
    }
    expect(coreFactionDefinitions.factory.heroes).toHaveLength(6);
  });

  it("ships the 8 board-game buildings, each wired to its archetype effect", () => {
    const b = coreBuildingDefinitions;
    const factoryBuildings = coreFactionDefinitions.factory.buildings.filter((id) => id.startsWith("factory."));
    expect([...factoryBuildings].sort()).toEqual([
      "factory.artifact_merchants",
      "factory.bank",
      "factory.citadel",
      "factory.city_hall",
      "factory.dwelling_bronze",
      "factory.dwelling_gold",
      "factory.dwelling_silver",
      "factory.mage_guild"
    ]);
    for (const id of factoryBuildings) {
      expect(b[id]?.implementationStatus, `${id} implemented`).toBe("implemented");
      expect(b[id]?.effect?.type, `${id} has a real effect`).not.toBe("NOT_IMPLEMENTED");
    }
    // City Hall is the "classic" gold-or-Armadillo variant (the +1 Movement guess
    // is gone); the reinforce-a-bronze option is what recruits/upgrades Armadillos.
    expect(b["factory.city_hall"]).toMatchObject({ cost: { gold: 10, buildingMaterials: 4 }, effect: { type: "RESOURCE_ROUND_CHOICE" } });
    const cityHallEffect = b["factory.city_hall"].effect;
    expect(cityHallEffect?.type === "RESOURCE_ROUND_CHOICE" && cityHallEffect.options.some((o) => o.gold)).toBe(true);
    expect(cityHallEffect?.type === "RESOURCE_ROUND_CHOICE" && cityHallEffect.options.some((o) => o.reinforceBronzeFree)).toBe(true);
    expect(cityHallEffect?.type === "RESOURCE_ROUND_CHOICE" && cityHallEffect.options.some((o) => o.movement)).toBe(false);
    expect(b["factory.citadel"]).toMatchObject({ cost: { gold: 8, buildingMaterials: 5, valuables: 1 }, effect: { type: "UNLOCK_REINFORCE" } });
    // The spell building keeps id mage_guild (default-setup slot) but is the
    // printed "Mana Generator" card.
    expect(b["factory.mage_guild"]).toMatchObject({ name: "Mana Generator", cost: { gold: 4, buildingMaterials: 2, valuables: 1 }, effect: { type: "MAGE_GUILD" } });
    // The two special buildings per the article: the Bank is a GOLD engine (a
    // per-Resource-round gold income), the Artifact Merchants is the buy/sell
    // Blacksmith archetype. (The earlier data put ARTIFACT_SMITH on the Bank.)
    expect(b["factory.bank"]).toMatchObject({ name: "Bank", effect: { type: "RESOURCE_ROUND_CHOICE" } });
    const bankEffect = b["factory.bank"].effect;
    expect(bankEffect?.type === "RESOURCE_ROUND_CHOICE" && bankEffect.options.every((o) => o.gold)).toBe(true);
    expect(b["factory.artifact_merchants"]).toMatchObject({ name: "Artifact Merchants", effect: { type: "ARTIFACT_SMITH" } });
    expect(b["factory.dwelling_bronze"]).toMatchObject({ name: "Remote Settlement", cost: { gold: 5, buildingMaterials: 3, valuables: 1 }, effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" } });
    expect(b["factory.dwelling_silver"]).toMatchObject({ name: "Industrialized Catacombs", effect: { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, prerequisites: ["factory.dwelling_bronze"] });
    expect(b["factory.dwelling_gold"]).toMatchObject({ name: "Gantry under Serpent Hill", effect: { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, prerequisites: ["factory.dwelling_silver"] });
    // The PC-only fabricated stub buildings with no board-game card stay removed.
    for (const id of ["factory.mana_generator", "factory.pen", "factory.lightning_rod"]) {
      expect(b[id], `${id} removed`).toBeUndefined();
    }
  });

  it("builds Factory dwellings and enforces the tier order in a real game", () => {
    // Effect-level guard (not just data): the engine actually builds Remote
    // Settlement (bronze) and Industrialized Catacombs (silver), and refuses the
    // silver dwelling until the bronze stands — the UNLOCK_RECRUIT_TIER chain.
    let state = createAdventureGameState({ startingBuildings: [],
      seed: "factory-build",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const townId = Object.entries(state.towns).find(([, t]) => t.controllerId === "p1")![0];
    const ready = (s: GameState) => {
      s.players.p1.townTokens.build = true;
      s.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
    };

    ready(state);
    // Silver (Industrialized Catacombs) refuses to build before Bronze.
    expect(
      applyAction(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId, buildingId: "factory.dwelling_silver" }).errors.length,
      "silver dwelling rejected before bronze"
    ).toBeGreaterThan(0);

    // Bronze (Remote Settlement) builds; then Silver builds on top of it.
    state = apply(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId, buildingId: "factory.dwelling_bronze" });
    expect(state.towns[townId].buildings, "bronze dwelling stands").toContain("factory.dwelling_bronze");
    ready(state);
    state = apply(state, { type: "BUILD_STRUCTURE", playerId: "p1", townId, buildingId: "factory.dwelling_silver" });
    expect(state.towns[townId].buildings, "silver dwelling stands after bronze").toContain("factory.dwelling_silver");
  });

  it("ships the full Factory '&' tile set (start + 2 near + 3 far + 1 center)", () => {
    const t = allTileDefinitions;
    const expected: Record<string, "starting" | "near" | "far" | "center"> = {
      "&S1": "starting",
      "&N1": "near",
      "&N2": "near",
      "&F1": "far",
      "&F2": "far",
      "&F3": "far",
      "&C1": "center"
    };
    for (const [id, group] of Object.entries(expected)) {
      expect(t[id], `${id} defined`).toBeDefined();
      expect(t[id].group, `${id} group`).toBe(group);
      expect(t[id].content, `${id} content`).toBe("regular_stretch_goals");
      expect(t[id].fields, `${id} has 7 fields`).toHaveLength(7);
      expect(t[id].assets?.tileImage, `${id} art`).toMatch(/^\/assets\/board\/tiles\/[a-z0-9]+\.webp$/);
    }
    // &S1 centre carries the Factory town; &C1 centre is the Airship Yard
    // (Factory rulebook p.8 — NOT a War Machine Factory).
    expect(t["&S1"].fields[0]).toMatchObject({ location: "town", faction: "factory" });
    expect(t["&C1"].fields[0]).toMatchObject({ location: "airship_yard", difficulty: 7 });
    // Every resource-bearing Factory tile has a mine with a real resource + amount.
    for (const id of ["&N1", "&N2", "&F2", "&F3"]) {
      const mine = t[id].fields.find((f) => f.location === "mine");
      expect(mine, `${id} mine`).toBeDefined();
      expect(mine!.resource, `${id} mine resource`).toBeTruthy();
      expect(mine!.amount ?? 0, `${id} mine amount`).toBeGreaterThan(0);
    }
  });

  it("Factory tile objects match the rulebook art (not the old misreads)", () => {
    const t = allTileDefinitions;
    // &C1: Airship Yard centre; Prospector SW; Tree of Knowledge NW (VI).
    expect(t["&C1"].fields.map((f) => f.location)).toEqual([
      "airship_yard",
      "temple",
      "shrine_of_magic_incantation",
      "blocked_field",
      "prospector",
      "magic_spring",
      "tree_of_knowledge"
    ]);
    // &F1: Trailblazer teepee (not Stables); Derrick (not generic water_wheel id).
    expect(t["&F1"].fields.map((f) => f.location)).toEqual([
      "blocked_field",
      "empty_field",
      "temple",
      "treasure_symbol",
      "derrick",
      "trailblazer",
      "obelisk"
    ]);
    // &F2: Prospector centre; NE lookout-tower is a Redwood Observatory (its
    // tower-on-a-tall-tree + "?" art matches F24's observatory — there is NO
    // treasure chest on ff2.webp, so the old treasure_symbol wrongly made visits
    // roll the treasure die instead of revealing an adjacent tile); Factory Grave
    // (not Cove grave); E cabin is Trading Post (also once wrongly treasure_symbol).
    expect(t["&F2"].fields.map((f) => f.location)).toEqual([
      "prospector",
      "redwood_observatory",
      "trading_post",
      "blocked_field",
      "factory_grave",
      "empty_field",
      "mine"
    ]);
    expect(t["&F2"].fields.some((f) => f.location === "grave")).toBe(false);
    // The NE field is the Redwood Observatory, never a treasure field: ff2.webp
    // shows a lookout hut on a tall tree, not a chest. Guards the exact regression
    // reported (observatory wrongly giving treasure).
    expect(t["&F2"].fields.some((f) => f.location === "redwood_observatory")).toBe(true);
    expect(t["&F2"].fields.some((f) => f.location === "treasure_symbol")).toBe(false);
    // &F3: Watering Hole well (not Magic Spring).
    expect(t["&F3"].fields.some((f) => f.location === "watering_hole")).toBe(true);
    expect(t["&F3"].fields.some((f) => f.location === "magic_spring")).toBe(false);
    // &N2: Warlock's Lab (not Mystical Garden); Fountain of Youth (not Magic Spring).
    expect(t["&N2"].fields.some((f) => f.location === "warlock_lab")).toBe(true);
    expect(t["&N2"].fields.some((f) => f.location === "mystical_garden")).toBe(false);
    expect(t["&N2"].fields.some((f) => f.location === "fountain_of_youth")).toBe(true);
    expect(t["&N2"].fields.some((f) => f.location === "magic_spring")).toBe(false);
    // &N1: Derrick + Excavation present.
    expect(t["&N1"].fields.some((f) => f.location === "derrick")).toBe(true);
    expect(t["&N1"].fields.some((f) => f.location === "artifact_dig")).toBe(true);
  });
});
