import { describe, expect, it, vi } from "vitest";
import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { expansionTileDefinitions } from "@/data/map/expansion-tiles";
import { allTileDefinitions, ALL_TILE_CONTENT, DEFAULT_TILE_CONTENT, tilePoolIds } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
import { getTileBorderSegments } from "@/data/map/borders";
import {
  classifyHeroStep,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  applyAction,
  slotDirection,
  tileCentersOverlap,
  tileFootprint,
  tileLatticeNeighbors,
  type GameState,
  type GameAction,
  type MapFieldState
} from "./index";
import {
  hillFortCost,
  observatoryDiscoverTargets,
  observatoryPlacementCenters,
  observatoryRevealTargets,
  pumpAdventureQueues,
  removableHandCards
} from "./adventure-reducer";
import { beginFieldVisit, instantiateTile, startAdventureRound } from "./adventure";
import { hexEquals, hexNeighbor, hexSpaceId, type HexCoord } from "./hex";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("expansion tile data", () => {
  it("defines structurally sound tiles for every entry", () => {
    for (const [key, tile] of Object.entries(allTileDefinitions)) {
      expect(tile.fields, `${key} field count`).toHaveLength(7);
      expect(tile.outerImpassable, `${key} border arity`).toHaveLength(6);
      expect(tile.content, `${key} content`).toBeTruthy();
      for (const field of tile.fields) {
        expect(locationDefinitions[field.location], `${key} location ${field.location}`).toBeDefined();
        if (field.location === "mine") {
          expect(field.resource, `${key} mine resource`).toBeTruthy();
          expect(field.amount, `${key} mine amount`).toBeGreaterThan(0);
        }
        if (field.location === "settlement") {
          expect(field.faction, `${key} settlement faction`).toBeTruthy();
        }
      }
      // Border segments derive without throwing for every tile.
      expect(getTileBorderSegments(tile).length).toBeGreaterThanOrEqual(0);
    }
  });

  it("labels every tile's back numeral to bracket its field guards (no flipped/mismatched tiers)", () => {
    // INVARIANT over ALL tiles, every group: the printed back band a tile shows
    // (Ⅰ / Ⅱ–Ⅲ / Ⅳ–Ⅴ / Ⅵ–Ⅶ) must contain every guarded field on it. A tile
    // guarded Ⅳ/Ⅴ can never read Ⅴ–Ⅵ, a Ⅵ/Ⅶ tile can never read Ⅳ–Ⅴ, etc. This
    // is the guard that catches a flipped-scan / transcription tier error for any
    // tile — far, near, center, sea or underground — not just the one audited.
    const BAND_RANGE: Record<string, [number, number]> = {
      "Ⅰ": [1, 1],
      "Ⅱ–Ⅲ": [2, 3],
      "Ⅳ–Ⅴ": [4, 5],
      "Ⅵ–Ⅶ": [6, 7]
    };
    const adventure = createAdventureGameState({ seed: "tier-invariant", rollFirstPlayer: false }).adventure!;
    let index = 0;
    for (const def of Object.values(allTileDefinitions)) {
      // Spread the probes far apart (9 rows each) so their footprints never overlap.
      const tile = instantiateTile(adventure, def.id, { row: 400 + index * 9, col: 400 }, 0, true);
      index += 1;
      const range = BAND_RANGE[tile.backLabel ?? ""];
      expect(range, `${def.id} shows an unexpected back band "${tile.backLabel}"`).toBeDefined();
      for (const guard of def.fields.map((field) => field.difficulty ?? 0).filter((value) => value > 0)) {
        expect(
          guard >= range![0] && guard <= range![1],
          `${def.id} (group ${def.group}) has a field guarded ${guard} but its back band ` +
            `"${tile.backLabel}" only covers ${range![0]}–${range![1]} — the printed tier is wrong`
        ).toBe(true);
      }
    }
  });

  it("keeps the boxed sets and expansions disjoint and complete", () => {
    const coreIds = new Set(Object.keys(coreTileDefinitions));
    for (const id of Object.keys(expansionTileDefinitions)) {
      expect(coreIds.has(id), `${id} duplicated`).toBe(false);
    }
    // 41 boxed tiles + 66 wiki expansion tiles + the Bulwark S10 starting tile.
    expect(Object.keys(allTileDefinitions)).toHaveLength(108);
  });

  it("keeps the default pools exactly as before the expansion data landed", () => {
    expect(new Set(tilePoolIds("far", DEFAULT_TILE_CONTENT))).toEqual(
      new Set(Object.values(coreTileDefinitions).filter((tile) => tile.group === "far").map((tile) => tile.id))
    );
    expect(new Set(tilePoolIds("near", DEFAULT_TILE_CONTENT))).toEqual(
      new Set(Object.values(coreTileDefinitions).filter((tile) => tile.group === "near").map((tile) => tile.id))
    );
    // C5 (Random Town) stays out of the default center pool.
    expect(new Set(tilePoolIds("center", DEFAULT_TILE_CONTENT))).toEqual(new Set(["C1", "C2", "C3", "C4"]));
  });

  it("excludes Random Town tiles from pools even with everything enabled", () => {
    const center = tilePoolIds("center", ALL_TILE_CONTENT);
    expect(center).not.toContain("C5");
    expect(center).not.toContain("#C3");
    expect(center).not.toContain("#C4");
    // Sea and subterranean tiles only come through their own groups.
    expect(tilePoolIds("far", ALL_TILE_CONTENT).every((id) => allTileDefinitions[id].group === "far")).toBe(true);
    expect(tilePoolIds("sea", ALL_TILE_CONTENT).length).toBeGreaterThan(0);
  });

  it("derives sea-tile groups and water terrain from the wiki data", () => {
    for (const id of ["#N8", "#N9", "#N10", "#N11", "#C4", "#C5", "W1", "W7"]) {
      const tile = allTileDefinitions[id];
      expect(tile, `${id} defined`).toBeDefined();
      expect(tile.group).toBe("sea");
      expect(tile.terrain).toBe("water");
    }
  });

  it("ships local art for every boxed tile and the covered expansions", () => {
    for (const tile of Object.values(coreTileDefinitions)) {
      expect(tile.assets?.tileImage).toBe(`/assets/board/tiles/${tile.id.toLowerCase()}.webp`);
    }
    // Every tile is now art-backed — the 9 subterranean hold-outs (U1/U3/U7,
    // #N4-#N7, #C2/#C3) were cropped from the community subterranean map scans.
    const withArt = Object.values(allTileDefinitions).filter((tile) => tile.assets?.tileImage);
    expect(withArt).toHaveLength(Object.keys(allTileDefinitions).length);
    expect(withArt).toHaveLength(108);
  });
});

describe("Stronghold content", () => {
  it("wires the faction to its eight town buildings, heroes, units, cards, and art slots", () => {
    const faction = coreFactionDefinitions.stronghold;
    expect(faction).toBeDefined();
    expect(faction.startingTileId).toBe("S7");
    expect(faction.buildings).toEqual([
      "stronghold.city_hall",
      "stronghold.citadel",
      "stronghold.mage_guild",
      "stronghold.dwelling_bronze",
      "stronghold.dwelling_silver",
      "stronghold.dwelling_gold",
      "stronghold.hall_of_valhalla",
      "stronghold.freelancers_guild"
    ]);
    expect(Object.keys(TOWN_BUILDING_IMAGES.stronghold ?? {})).toHaveLength(8);
    for (const building of faction.buildings) {
      expect(coreBuildingDefinitions[building].assets?.image, `${building} art`).toContain("/assets/town/stronghold_");
    }

    const cityHall = coreBuildingDefinitions["stronghold.city_hall"];
    expect(cityHall.effect).toMatchObject({
      type: "RESOURCE_ROUND_CHOICE",
      options: [{ drawCards: 2 }, { buildingMaterials: 2 }]
    });
    // Wiki-verified cost: 2 gold / 2 building materials / 1 valuables.
    expect(coreBuildingDefinitions["stronghold.freelancers_guild"].cost).toEqual({
      gold: 2,
      buildingMaterials: 2,
      valuables: 1
    });
    // HOUSE RULE: the neutral-win bounty is buffed from 1 to 2 gold.
    expect(coreBuildingDefinitions["stronghold.freelancers_guild"].effect).toMatchObject({
      type: "FREELANCERS_GUILD",
      winGold: 2
    });
    expect(coreBuildingDefinitions["stronghold.hall_of_valhalla"].effect).toMatchObject({
      type: "HALL_OF_VALHALLA",
      amount: 1
    });
    expect(faction.heroes).toEqual(["crag_hack", "dessa", "gundula", "shiva", "tarnum_stronghold", "yog"]);

    for (const heroId of faction.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, heroId).toBeDefined();
      expect(hero.portrait, `${heroId} portrait`).toBe(`/assets/hero_boardart-${heroId}.webp`);
      expect(hero.boardScan, `${heroId} board`).toContain("/assets/heroes-stronghold-");
      expect(cardLibrary[hero.startingAbilityCardId], `${heroId} ability`).toBeDefined();
      for (const specialtyId of Object.values(hero.specialtyCardIds)) {
        expect(cardLibrary[specialtyId], `${heroId} specialty ${specialtyId}`).toBeDefined();
        expect(cardLibrary[specialtyId].assets?.cardImage, `${specialtyId} art`).toContain("/assets/hero_specialties-");
      }
    }

    expect(faction.units).toEqual([
      "stronghold.goblins",
      "stronghold.wolf_raiders",
      "stronghold.orcs",
      "stronghold.ogres",
      "stronghold.thunderbirds",
      "stronghold.cyclopes",
      "stronghold.behemoths"
    ]);
    for (const unitId of faction.units) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit.few?.cardImage, `${unit.id} few art`).toContain("/assets/units-stronghold-");
      expect(unit.pack?.cardImage, `${unit.id} pack art`).toContain("/assets/units-stronghold-");
    }
    expect(coreUnitDefinitions["stronghold.wolf_raiders"].pack?.abilities).toContain("wolf-raiders-strike-twice");
    expect(coreUnitDefinitions["stronghold.thunderbirds"].pack?.abilities).toContain("thunderbirds-lightning");
    expect(coreUnitDefinitions["stronghold.behemoths"].pack?.abilities).toContain("behemoth-defense-crush-pack");
    expect(unitAbilities["wolf-raiders-strike-twice"].implementationStatus).toBe("implemented");
    expect(unitAbilities["thunderbirds-lightning"].implementationStatus).toBe("implemented");
    expect(unitAbilities["behemoth-defense-crush-pack"].implementationStatus).toBe("implemented");
  });
});

describe("Stronghold City Hall resource-round choice", () => {
  // Regression: the City Hall options used to live in a module-level variable
  // outside game state. After a reload / reconnect / server restart that
  // variable reset to null, so choosing an option threw "That City Hall option
  // does not exist", the action failed, and the pending choice was never
  // cleared — the player stayed stuck in the "choice" phase and could no longer
  // draw or discard. The options now ride in the pending choice (game state),
  // so resolution survives a full serialization round-trip.
  function openStrongholdCityHallChoice(): GameState {
    const state = createAdventureGameState({ seed: "stronghold-cityhall", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.towns.town_p1.factionId = "stronghold";
    state.towns.town_p1.buildings = ["stronghold.city_hall"];
    state.adventure!.rewardQueue = [];
    state.round = 3; // a resource round → the City Hall offers its choice
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  it("carries the option payloads in game state so they survive serialization", () => {
    const state = openStrongholdCityHallChoice();
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the City Hall choice");
    }
    expect(choice.context).toBe("city-hall");
    // Option 0 = draw 2 cards; option 1 = gain 2 building materials.
    expect(choice.cityHall?.options[0]).toMatchObject({ drawCards: 2 });
    expect(choice.cityHall?.options[1]).toMatchObject({ buildingMaterials: 2 });

    // A serialized state keeps the payloads (nothing depends on an off-state cache).
    const reloaded: GameState = JSON.parse(JSON.stringify(state));
    const reloadedChoice = reloaded.pendingChoice;
    if (reloadedChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the City Hall choice to survive the round-trip");
    }
    expect(reloadedChoice.cityHall?.options[0]).toMatchObject({ drawCards: 2 });
  });

  // Resolves a City Hall choice through a freshly re-imported engine, after
  // round-tripping the state through JSON. vi.resetModules() re-initializes the
  // engine module, so any module-level cache (the old `cityHallChoiceBeing
  // Resolved` variable) is null — exactly the off-process condition (page
  // reload / reconnect / server restart) that used to make the pick throw and
  // strand the player in the choice phase. Resolution must rely on game state
  // alone, so this fails if the option payloads stop riding in the choice.
  async function resolveAfterReload(opened: GameState, optionIndex: number) {
    const choiceId = opened.pendingChoice?.id;
    expect(choiceId).toBeTruthy();
    const serialized = JSON.stringify(opened);

    vi.resetModules();
    const fresh = await import("./index");
    const before: GameState = JSON.parse(serialized);
    const result = fresh.applyAction(JSON.parse(serialized), {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choiceId!,
      optionIndex
    });
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return { before, after: result.state };
  }

  it("resolves the draw-2-cards option after a reload and frees the stuck choice", async () => {
    const opened = openStrongholdCityHallChoice();
    expect(opened.players.p1.deck.length).toBeGreaterThanOrEqual(2);

    const { before, after } = await resolveAfterReload(opened, 0);

    // The draw actually happened, the choice is cleared, and the player is no
    // longer trapped in the choice phase (can draw / discard again).
    expect(after.players.p1.hand.length).toBe(before.players.p1.hand.length + 2);
    expect(after.players.p1.deck.length).toBe(before.players.p1.deck.length - 2);
    expect(after.pendingChoice).toBeNull();
    expect(after.phase).not.toBe("choice");
  });

  it("resolves the building-materials option after a reload", async () => {
    const opened = openStrongholdCityHallChoice();
    const { before, after } = await resolveAfterReload(opened, 1);

    expect(after.players.p1.resources.buildingMaterials).toBe(
      before.players.p1.resources.buildingMaterials + 2
    );
    expect(after.pendingChoice).toBeNull();
    expect(after.phase).not.toBe("choice");
  });
});

describe("Fountain of Youth / Magic Spring effects", () => {
  // Effects per the fan wiki (https://en.homm3bg.wiki/fields/):
  //   Fountain of Youth → gain a positive Morale token AND +1 movement.
  //   Magic Spring      → look at the top 3 cards of your discard pile and
  //                       return one to hand (engine step type MAGIC_SPRING).
  // These tests fail if either definition is swapped to the other effect.
  function injectVisitable(state: GameState, location: string, spaceId = "77,77"): MapFieldState {
    const field: MapFieldState = {
      spaceId,
      tileInstanceId: "swap-test-tile",
      slot: 0,
      location,
      difficulty: 0,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[spaceId] = field;
    return field;
  }

  it("Fountain of Youth grants a morale token and +1 movement", () => {
    const state = createAdventureGameState({ seed: "field-swap-fountain", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const field = injectVisitable(state, "fountain_of_youth");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const moraleBefore = state.players.p1.morale;
    const movementBefore = hero.movementPoints;

    beginFieldVisit(state, hero.id, field.spaceId, false);

    // The morale + movement sequence resolves with no further input needed.
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.players.p1.morale).toBe(moraleBefore + 1);
    expect(state.heroes[hero.id].movementPoints).toBe(movementBefore + 1);
  });

  it("Magic Spring returns a card from the discard pile to hand", () => {
    const state = createAdventureGameState({ seed: "field-swap-spring", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const field = injectVisitable(state, "magic_spring");
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;

    // Seed three known cards in the discard pile; the top is the last element.
    state.players.p1.discard = ["fy_bottom", "fy_middle", "fy_top"];
    const handBefore = state.players.p1.hand.length;

    beginFieldVisit(state, hero.id, field.spaceId, false);

    // The Magic Spring runs the discard-recovery step, awaiting the player's pick.
    expect(state.adventure?.pendingVisit?.steps[0]?.type).toBe("MAGIC_SPRING");

    // optionIndex 0 = the top of the discard pile ("fy_top").
    const next = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(next.players.p1.hand).toContain("fy_top");
    expect(next.players.p1.hand.length).toBe(handBefore + 1);
    expect(next.players.p1.discard).not.toContain("fy_top");
    expect(next.adventure?.pendingVisit).toBeNull();
  });
});

describe("rulebook conformance fixes", () => {
  it("lets friendly heroes pass through enemies standing in a Sanctuary", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }

    const sanctuaryField = Object.values(adventure.fields).find((field) => field.location === "sanctuary");
    // The skirmish layout reveals no sanctuary at setup; fabricate one.
    const anyField = sanctuaryField ?? Object.values(adventure.fields).find((field) => field.location === "empty_field");
    if (!anyField) {
      throw new Error("no field to test on");
    }
    anyField.location = "sanctuary";

    const heroes = Object.values(state.heroes);
    const p1Hero = heroes.find((hero) => hero.controllerId === "p1");
    const p2Hero = heroes.find((hero) => hero.controllerId === "p2");
    if (!p1Hero || !p2Hero) {
      throw new Error("missing heroes");
    }
    p2Hero.spaceId = anyField.spaceId;

    expect(classifyHeroStep(state, p1Hero, anyField.spaceId)).toBe("pass-only");
  });

  it("only lets the Observatory flip tiles whose flowers actually touch", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }
    const anchor = Object.values(adventure.tiles).find((tile) => !tile.faceDown);
    if (!anchor) {
      throw new Error("no revealed tile");
    }
    // A face-down tile six columns away matched the old Manhattan check.
    adventure.tiles["test-far-away"] = {
      id: "test-far-away",
      tileDefId: "N1",
      centerRow: anchor.centerRow,
      centerCol: anchor.centerCol + 6,
      rotation: 0,
      faceDown: true
    };
    const targets = observatoryDiscoverTargets(adventure, anchor);
    expect(targets.map((tile) => tile.id)).not.toContain("test-far-away");
  });

  // --- Redwood Observatory: opening adjacent maps --------------------------
  //
  // Rulebook: the Observatory lets you "choose 1 tile adjacent to this one that
  // doesn't have a Hero on it", then rotate it freely under the standard Map
  // Tile Placement rules. There is NO "stand at an open border" / "be able to
  // step onto it" access rule — yellow borders, and where on the flower the
  // hero stands, are irrelevant. Only the Surface/Subterranean divide limits it.
  // F7's slot-1 ring field is yellow-sealed; its other ring fields are open.

  /** Per-ring-slot geometry of an F7 observatory flower centred at O. */
  function f7Rings(O: HexCoord) {
    const def = coreTileDefinitions.F7;
    const footprint = tileFootprint(O, 0);
    const neighbors = tileLatticeNeighbors(O);
    return [1, 2, 3, 4, 5, 6].map((slot) => {
      const ringHex = footprint[slot];
      const dir = slotDirection(slot, 0) as number;
      const outerHex = hexNeighbor(ringHex, dir);
      const neighborCenter = neighbors.find((n) => tileFootprint(n, 0).some((c) => hexEquals(c, outerHex)));
      return { slot, ringHex, neighborCenter, sealed: Boolean(def.outerImpassable[slot - 1]) };
    });
  }

  function setupObservatory() {
    const state = createAdventureGameState({ seed: "obs-open", difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }
    state.players.p1.needsHandRefresh = false;
    // A clear region far from the scenario layout so nothing overlaps.
    const O: HexCoord = { row: 40, col: 30 };
    const obsTile = instantiateTile(adventure, "F7", O, 0, false);
    return { state, adventure, O, obsTile, rings: f7Rings(O) };
  }

  function openObservatoryVisit(state: GameState, fieldSpaceId: string) {
    const adventure = state.adventure!;
    state.heroes.hero_p1.spaceId = fieldSpaceId;
    adventure.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: fieldSpaceId,
      steps: [{ type: "DISCOVER_ADJACENT_TILE" }]
    };
  }

  it("flips an adjacent face-down tile even from the flower's centre field", () => {
    const { state, adventure, obsTile, O, rings } = setupObservatory();
    const open = rings.find((ring) => !ring.sealed && ring.neighborCenter);
    if (!open?.neighborCenter) {
      throw new Error("no open ring neighbour");
    }
    const faceDown = instantiateTile(adventure, "N1", open.neighborCenter, 0, true);
    // Stand on the flower's CENTRE field — it touches no neighbour flower, so the
    // old "be at an open border" rule wrongly refused to open anything from here.
    openObservatoryVisit(state, hexSpaceId(O));

    expect(observatoryRevealTargets(state, state.heroes.hero_p1, obsTile).map((tile) => tile.id)).toContain(
      faceDown.id
    );

    const reveal = getLegalActions(state, "p1").find((legal) =>
      legal.label.startsWith("Discover the face-down tile")
    );
    expect(reveal).toBeTruthy();

    const next = apply(state, reveal!.action);
    expect(next.adventure!.tiles[faceDown.id].faceDown).toBe(false);
    expect(next.adventure!.tiles[faceDown.id].awaitingRotation).toBe(true);
    expect(next.adventure!.pendingTileChoice?.kind).toBe("reveal");
    // No opening hero is recorded: the tile rotates freely (no hero-cross gate).
    expect(next.adventure!.pendingTileChoice?.heroId).toBeUndefined();
    expect(next.adventure!.pendingVisit).toBeNull();
  });

  it("flips an adjacent face-down tile across a yellow border (no access needed)", () => {
    const { state, adventure, obsTile, rings } = setupObservatory();
    const sealed = rings.find((ring) => ring.sealed && ring.neighborCenter);
    if (!sealed?.neighborCenter) {
      throw new Error("no sealed ring neighbour");
    }
    const faceDown = instantiateTile(adventure, "N1", sealed.neighborCenter, 0, true);
    // Stand on the yellow-sealed ring field — the old rule wrongly sealed the
    // map shut here; the Observatory does not care about borders.
    openObservatoryVisit(state, hexSpaceId(sealed.ringHex));

    expect(observatoryRevealTargets(state, state.heroes.hero_p1, obsTile).map((tile) => tile.id)).toContain(
      faceDown.id
    );
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels.some((label) => label.startsWith("Discover the face-down tile"))).toBe(true);
  });

  it("drops a Far (Ⅱ–Ⅲ) supply tile into an empty adjacent slot for free", () => {
    const { state, adventure, obsTile, O, rings } = setupObservatory();
    const open = rings.find((ring) => !ring.sealed && ring.neighborCenter);
    if (!open?.neighborCenter) {
      throw new Error("no open ring neighbour");
    }
    const target = open.neighborCenter; // empty slot adjacent to the observatory
    // The slot must nest against >=2 tiles: the observatory plus one more.
    const second = tileLatticeNeighbors(target).find(
      (candidate) =>
        !hexEquals(candidate, O) &&
        !Object.values(adventure.tiles).some((tile) =>
          tileCentersOverlap({ row: tile.centerRow, col: tile.centerCol }, candidate)
        )
    );
    if (!second) {
      throw new Error("no second anchor tile for the placement slot");
    }
    instantiateTile(adventure, "N1", second, 0, true);
    adventure.playerFarTiles.p1 = ["F4"];
    // Stand on the flower's CENTRE field: placement needs no border access either.
    openObservatoryVisit(state, hexSpaceId(O));

    const centers = observatoryPlacementCenters(state, state.heroes.hero_p1, obsTile, "F4");
    expect(centers.some((center) => hexEquals(center, target))).toBe(true);

    const place = getLegalActions(state, "p1").find((legal) => legal.label.startsWith("Place a Far"));
    expect(place).toBeTruthy();

    const mpBefore = state.heroes.hero_p1.movementPoints;
    const next = apply(state, {
      type: "PLACE_OBSERVATORY_TILE",
      playerId: "p1",
      supplyIndex: 0,
      centerRow: target.row,
      centerCol: target.col
    });

    // Supply shrank, no movement spent, and the placed tile awaits rotation.
    expect(next.adventure!.playerFarTiles.p1).toHaveLength(0);
    expect(next.heroes.hero_p1.movementPoints).toBe(mpBefore);
    expect(next.adventure!.pendingTileChoice?.kind).toBe("place");
    // No opening hero recorded — rotate freely, no hero-cross gate.
    expect(next.adventure!.pendingTileChoice?.heroId).toBeUndefined();
    expect(next.adventure!.pendingVisit).toBeNull();
    const placed = next.adventure!.tiles[next.adventure!.pendingTileChoice!.tileInstanceId];
    expect(placed.centerRow).toBe(target.row);
    expect(placed.centerCol).toBe(target.col);
  });

  it("still cannot open a tile that does not touch the observatory's flower", () => {
    const { state, adventure, obsTile, O } = setupObservatory();
    // A face-down tile two lattice steps away — not adjacent to the observatory.
    const near = tileLatticeNeighbors(O)[0];
    const far = tileLatticeNeighbors(near).find(
      (candidate) =>
        !hexEquals(candidate, O) &&
        !tileLatticeNeighbors(O).some((adj) => hexEquals(adj, candidate)) &&
        !Object.values(adventure.tiles).some((tile) =>
          tileCentersOverlap({ row: tile.centerRow, col: tile.centerCol }, candidate)
        )
    );
    if (!far) {
      throw new Error("no non-adjacent slot found");
    }
    const faceDown = instantiateTile(adventure, "N1", far, 0, true);
    openObservatoryVisit(state, hexSpaceId(O));

    expect(observatoryRevealTargets(state, state.heroes.hero_p1, obsTile).map((tile) => tile.id)).not.toContain(
      faceDown.id
    );
  });

  // --- Speculum: discover an adjacent tile ignoring borders -----------------
  //
  // Speculum (minor artifact): "Discover any Map tile adjacent to the Map tile
  // your Hero is currently on." Like the Redwood Observatory, it does NOT need
  // the hero to be at the tile's edge nor at an open (unsealed) border — that
  // is the whole point of the card. The hero's CURRENT tile is the anchor.
  it("Speculum reveals an adjacent face-down tile across a sealed border (no edge/border gate)", () => {
    const state = createAdventureGameState({ seed: "speculum", difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }
    state.players.p1.needsHandRefresh = false;

    // The hero stands on its OWN F7 tile, on a yellow-sealed ring field, with a
    // face-down tile across that sealed edge. Ordinary discovery is impossible
    // from here; Speculum ignores the border.
    const O: HexCoord = { row: 40, col: 30 };
    instantiateTile(adventure, "F7", O, 0, false);
    const rings = f7Rings(O);
    const sealed = rings.find((ring) => ring.sealed && ring.neighborCenter);
    if (!sealed?.neighborCenter) {
      throw new Error("no sealed ring neighbour");
    }
    const faceDown = instantiateTile(adventure, "N1", sealed.neighborCenter, 0, true);
    state.heroes.hero_p1.spaceId = hexSpaceId(sealed.ringHex);

    // Contrast: the ordinary movement-driven discovery is refused at this
    // sealed-border field — proving the two paths are separate.
    const ordinary = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: faceDown.id
    });
    expect(ordinary.errors).toHaveLength(1);
    expect(ordinary.errors[0].message).toContain("yellow border");

    // Now play Speculum's "discover" option from hand.
    state.players.p1.hand = ["artifact.speculum"];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.speculum" &&
        legal.action.optionIndex === 0
    );
    expect(play, "Speculum discover option should be a legal map play").toBeTruthy();
    const opened = apply(state, play!.action);

    // A DISCOVER_ADJACENT_TILE visit is open, anchored on the hero's tile, and
    // it offers the face-down neighbour even though its border is sealed.
    const step = opened.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("DISCOVER_ADJACENT_TILE");
    const reveal = getLegalActions(opened, "p1").find((legal) =>
      legal.label.startsWith("Discover the face-down tile")
    );
    expect(reveal, "Speculum should offer the sealed-border neighbour").toBeTruthy();

    const revealed = apply(opened, reveal!.action);
    expect(revealed.adventure!.tiles[faceDown.id].faceDown).toBe(false);
    expect(revealed.adventure!.tiles[faceDown.id].awaitingRotation).toBe(true);
    // Freely rotated — no opening hero recorded (no hero-cross gate).
    expect(revealed.adventure!.pendingTileChoice?.heroId).toBeUndefined();
  });

  it("sells one Trading Post card for 1 gold, excluding statistics and Magic Arrow", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.hand = ["spell.magic_arrow", "stat.attack", "spell.lightning_bolt"];
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "TRADING_POST" }]
    };

    // Magic Arrow and Statistic cards stay out of the sell list.
    const sellActions = getLegalActions(state, "p1").filter((legal) => legal.label.startsWith("Sell "));
    expect(sellActions).toHaveLength(1);
    expect(sellActions[0].label).toContain("Lightning Bolt");

    const before = player.resources.gold;
    const next = apply(state, sellActions[0].action);
    expect(next.players.p1.resources.gold).toBe(before + 1);
    expect(next.players.p1.hand).toHaveLength(2);
    expect(next.players.p1.removed).toEqual(["spell.lightning_bolt"]);
    // Selling is the visit's one action: the visit ends with it.
    expect(next.adventure?.pendingVisit).toBeNull();
  });

  it("locks Trading Post selling and buying once resources were traded", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.hand = ["spell.lightning_bolt"];
    player.resources.gold = 20;
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "TRADING_POST" }]
    };

    const beforeActions = getLegalActions(state, "p1");
    expect(beforeActions.some((legal) => legal.label.startsWith("Sell "))).toBe(true);
    expect(beforeActions.some((legal) => legal.action.type === "BUY_WAR_MACHINE")).toBe(true);

    const trade = beforeActions.find((legal) => legal.action.type === "TRADE_RESOURCES");
    expect(trade).toBeDefined();
    const next = apply(state, trade!.action);

    // More trades stay open; selling cards and buying machines do not.
    const afterActions = getLegalActions(next, "p1");
    expect(afterActions.some((legal) => legal.action.type === "TRADE_RESOURCES")).toBe(true);
    expect(afterActions.some((legal) => legal.label.startsWith("Sell "))).toBe(false);
    expect(afterActions.some((legal) => legal.action.type === "BUY_WAR_MACHINE")).toBe(false);
  });

  it("buys a war machine at the Trading Post price and ends the visit", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.resources.gold = 10;
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "TRADING_POST" }]
    };

    const buy = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "BUY_WAR_MACHINE" && legal.action.cardId === "war_machine.first_aid_tent"
    );
    expect(buy).toBeDefined();
    expect(buy?.label).toContain("6 gold");

    const next = apply(state, buy!.action);
    expect(next.players.p1.resources.gold).toBe(4);
    expect(next.players.p1.hand).toContain("war_machine.first_aid_tent");
    expect(next.adventure?.warMachineSupply).not.toContain("war_machine.first_aid_tent");
    expect(next.adventure?.pendingVisit).toBeNull();
  });

  it("sells war machines cheaper at the War Machine Factory", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.resources.gold = 7;
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "WAR_MACHINE_SHOP" }]
    };

    const buy = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "BUY_WAR_MACHINE" && legal.action.cardId === "war_machine.ballista"
    );
    expect(buy).toBeDefined();
    expect(buy?.label).toContain("7 gold");

    const next = apply(state, buy!.action);
    expect(next.players.p1.resources.gold).toBe(0);
    expect(next.players.p1.hand).toContain("war_machine.ballista");
  });

  it("resolves the Faerie Ring by searching the removed card's own deck", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    player.hand = ["spell.magic_arrow", "stat.attack"];
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [
        {
          type: "REMOVE_HAND_CARD",
          prompt: "Faerie Ring: remove a card, then search its deck",
          filter: "removable",
          then: "search-same-deck"
        }
      ]
    };

    // Statistic cards are not removable here - only the spell qualifies.
    expect(removableHandCards(state, "p1", "removable").map((entry) => entry.cardId)).toEqual([
      "spell.magic_arrow"
    ]);

    const actions = getLegalActions(state, "p1").filter((legal) => legal.label.startsWith("Remove "));
    expect(actions).toHaveLength(1);
    const next = apply(state, actions[0].action);
    expect(next.players.p1.removed).toEqual(["spell.magic_arrow"]);
    // The follow-up queued a spells-deck search (it may already have been
    // pumped into the pending deck-search choice).
    const queued = next.adventure?.rewardQueue.some(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
    );
    const choosing = next.pendingChoice?.type === "DECK_SEARCH";
    expect(queued || choosing).toBe(true);
  });

  it("lets multiple players flag an Obelisk while keeping the first cube", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    if (!adventure) {
      throw new Error("no adventure");
    }
    const field = Object.values(adventure.fields)[0];
    field.location = "obelisk";
    field.difficulty = undefined;

    const heroes = Object.values(state.heroes);
    const p1Hero = heroes.find((hero) => hero.controllerId === "p1");
    const p2Hero = heroes.find((hero) => hero.controllerId === "p2");
    if (!p1Hero || !p2Hero) {
      throw new Error("missing heroes");
    }

    // Visits resolve through the engine helper both times.
    state.adventure!.pendingVisit = null;
    beginFieldVisit(state, p1Hero.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    beginFieldVisit(state, p2Hero.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    expect(field.extraFlagOwnerIds).toEqual(["p2"]);
  });

  it("discounts Hill Fort reinforcement by 3 gold to a minimum of zero", () => {
    expect(hillFortCost({ gold: 5, valuables: 1 })).toEqual({ gold: 2, valuables: 1 });
    expect(hillFortCost({ gold: 2 })).toEqual({});
    expect(hillFortCost({ buildingMaterials: 2 })).toEqual({ buildingMaterials: 2 });
  });
});

describe("Zydar (Inferno hero)", () => {
  it("is a selectable Inferno magic hero with a valid starting ability and specialty", () => {
    const zydar = coreHeroDefinitions.zydar;
    expect(zydar, "Zydar hero definition").toBeTruthy();
    expect(zydar.faction).toBe("inferno");
    expect(zydar.type).toBe("magic");
    expect(coreFactionDefinitions.inferno.heroes).toContain("zydar");
    // Starting ability and every specialty card must resolve in the library.
    expect(cardLibrary[zydar.startingAbilityCardId]).toBeTruthy();
    for (const cardId of Object.values(zydar.specialtyCardIds)) {
      expect(cardLibrary[cardId], `${cardId} exists`).toBeTruthy();
    }
    // Level I is implemented (no dead starting card) — a self-spell-cast choice.
    const levelOne = cardLibrary[zydar.specialtyCardIds[1]];
    expect(levelOne.implementationStatus).toBe("implemented");
    expect(levelOne.effect.type).toBe("CHOOSE_ONE");
  });
});
