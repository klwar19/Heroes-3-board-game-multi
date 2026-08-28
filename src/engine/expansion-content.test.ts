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
    // 41 boxed tiles + 66 wiki expansion tiles + the Bulwark S10 and Factory &S1
    // starting tiles + the full Factory "&" set: &N1/&N2 near, &F1/&F2/&F3 far,
    // &C1 center (transcribed from the physical tile scans) + the 5 anime starting
    // tiles A-S1 (Fuyuki) / W-S1 (Azure Breeze) / L-S1 (Hidden Leaf) / P-S1 (Azur
    // Lane) / D-S1 (Heavenly Demon Palace), plus LB-S1 (Little Busters) and
    // MGQ-S1 (Monster Girl Quest: Paradox).
    expect(Object.keys(allTileDefinitions)).toHaveLength(122);
  });

  it("default pools include every tile of that group (all content sets + Random Town)", () => {
    // DEFAULT is the full catalog — expansion / stretch-goal land tiles are not
    // gated behind a lobby toggle. Starting (Ⅰ) tiles stay faction-fixed.
    expect(DEFAULT_TILE_CONTENT).toEqual(ALL_TILE_CONTENT);

    for (const group of ["far", "near", "center", "sea", "subterranean"] as const) {
      const expected = new Set(
        Object.values(allTileDefinitions)
          .filter((tile) => tile.group === group)
          .map((tile) => tile.id)
      );
      expect(new Set(tilePoolIds(group, DEFAULT_TILE_CONTENT)), `${group} pool`).toEqual(expected);
    }

    // Random Town tiles are pool-eligible; the engine assigns the defending
    // faction when the field is fought (ensureRandomTownFaction).
    expect(tilePoolIds("center", DEFAULT_TILE_CONTENT)).toContain("C5");
    expect(tilePoolIds("subterranean", DEFAULT_TILE_CONTENT)).toContain("#C3");
    expect(tilePoolIds("sea", DEFAULT_TILE_CONTENT)).toContain("#C4");

    // Group isolation: a far pool never contains a sea/near/… id.
    expect(tilePoolIds("far", DEFAULT_TILE_CONTENT).every((id) => allTileDefinitions[id].group === "far")).toBe(
      true
    );
    expect(tilePoolIds("sea", DEFAULT_TILE_CONTENT).length).toBeGreaterThan(0);
  });

  it("a live default adventure draws far/near/center from the full catalog", () => {
    const state = createAdventureGameState({
      seed: "full-tile-catalog",
      difficulty: "normal",
      scenarioId: "land-2p",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "A", factionId: "castle" },
        { id: "p2", name: "B", factionId: "necropolis" }
      ]
    });
    // Remaining far pool + every face-down far already on the layout together
    // must be exactly the full far catalog MINUS the Obelisk-bearing far tiles
    // (house rule: the Ⅱ–Ⅲ Far supply never springs an Obelisk — Obelisks live
    // on Ⅳ–Ⅴ Near; see far-pool-no-obelisk.test.ts). No other tile is dropped.
    const onMapFar = Object.values(state.adventure!.tiles)
      .map((tile) => tile.tileDefId)
      .filter((id) => allTileDefinitions[id]?.group === "far");
    const remainingFar = state.adventure!.farTilePool ?? [];
    const farInPlay = new Set([...onMapFar, ...remainingFar]);
    const allFar = new Set(
      tilePoolIds("far", DEFAULT_TILE_CONTENT).filter(
        (id) => !allTileDefinitions[id]?.fields.some((field) => field.location === "obelisk")
      )
    );
    expect(farInPlay).toEqual(allFar);

    const allNear = new Set(tilePoolIds("near", DEFAULT_TILE_CONTENT));
    const onMapNear = Object.values(state.adventure!.tiles)
      .map((tile) => tile.tileDefId)
      .filter((id) => allTileDefinitions[id]?.group === "near");
    // land-2p places 6 of the full near pool — every placed id must be a pool member.
    expect(onMapNear.length).toBe(6);
    expect(onMapNear.every((id) => allNear.has(id))).toBe(true);
    expect(allNear.size).toBeGreaterThan(12);
    expect(allFar.size).toBeGreaterThan(18);

    // Control: expansion far tiles are actually present in the shuffled pool
    // (proves DEFAULT is not still the old core-only filter).
    const expansionFar = ["#F1", "F19", "F22", "F25", "&F1"];
    expect(expansionFar.some((id) => farInPlay.has(id))).toBe(true);
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
    expect(withArt).toHaveLength(122);
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
      for (const specialtyId of Object.values(hero.specialtyCardIds!)) {
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

  it("F10 E field is Fountain of Youth (printed bird+horse), not Magic Spring", () => {
    // Physical f10.webp: slot 2 (E) is the face waterfall with bird+horse icons
    // and Ⅱ — Fountain of Youth. Fan wiki still lists Magic Spring; data must
    // follow the printed icons (same correction class as Factory &N2).
    const f10 = coreTileDefinitions.F10;
    expect(f10.fields[2].location).toBe("fountain_of_youth");
    expect(f10.fields[2].difficulty).toBe(2);
    expect(f10.fields.some((f) => f.location === "magic_spring")).toBe(false);
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

  it("runs the settlement guarantee when the Observatory reveals a Ⅱ–Ⅲ tile (player's 2nd opening)", () => {
    const { state, adventure, O, rings } = setupObservatory();
    const open = rings.find((ring) => !ring.sealed && ring.neighborCenter);
    if (!open?.neighborCenter) {
      throw new Error("no open ring neighbour");
    }
    // A face-down Ⅱ–Ⅲ Mine tile (F4: no Settlement) sits next to the observatory,
    // and this is the player's 2nd Ⅱ–Ⅲ opening — so the same settlement guarantee
    // as an on-foot discovery must fire, even though the reveal runs inside the
    // Observatory's DISCOVER_ADJACENT_TILE visit step.
    const faceDown = instantiateTile(adventure, "F4", open.neighborCenter, 0, true);
    adventure.farTilesOpenedByPlayer = { p1: 1 };
    adventure.farTilePool = ["F1"]; // a Settlement is available to reroll into
    adventure.farTileScriptedDraws = ["F1"];
    openObservatoryVisit(state, hexSpaceId(O));

    const reveal = getLegalActions(state, "p1").find((legal) =>
      legal.label.startsWith("Discover the face-down tile")
    );
    expect(reveal, "the Observatory should offer the Ⅱ–Ⅲ neighbour").toBeTruthy();
    const offered = apply(state, reveal!.action);

    // The keep/reroll choice is open and the Observatory visit was consumed — the
    // flip's reveal finalize never has to touch it.
    const flip = offered.adventure!.pendingFarTileFlip!;
    expect(flip.via).toBe("reveal");
    expect(flip.tileInstanceId).toBe(faceDown.id);
    expect(flip.offerMode).toBe("settlement");
    expect(offered.adventure!.pendingVisit).toBeNull();
    expect(offered.pendingChoice?.type).toBe("OPTION_CHOICE");

    // Reroll until the Settlement, then pick it: it lands on the SAME slot, free
    // to rotate, and the rerolled-away Mine tile returns to the pool.
    const rerolled = apply(offered, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: offered.pendingChoice!.id,
      optionIndex: 1
    });
    const placed = apply(rerolled, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: rerolled.pendingChoice!.id,
      optionIndex: 0
    });
    expect(placed.adventure!.tiles[faceDown.id].tileDefId).toBe("F1");
    expect(placed.adventure!.pendingTileChoice?.kind).toBe("reveal");
    expect(placed.adventure!.pendingTileChoice?.heroId).toBeUndefined();
    expect(placed.adventure!.farTilePool).toContain("F4");
    expect(placed.adventure!.farTilesOpenedByPlayer!.p1).toBe(2);
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
    // One opaque UNOPENED supply marker; force the flip to draw F1 (a Settlement,
    // no-Mine tile) so it auto-finalizes with no keep/reroll choice.
    adventure.playerFarTiles.p1 = ["?"];
    adventure.farTileScriptedDraws = ["F1"];
    // Stand on the flower's CENTRE field: placement needs no border access either.
    openObservatoryVisit(state, hexSpaceId(O));

    const centers = observatoryPlacementCenters(state, state.heroes.hero_p1, obsTile, adventure.playerFarTiles.p1[0]);
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
    // The border CONTRAST below (ordinary discovery refused at a sealed field) is
    // the opt-in `discovery-border-gate` house rule since 2026-07-25 — officially
    // adjacency alone discovers — so this case runs with it ON to keep proving
    // that Speculum is a SEPARATE, border-ignoring path.
    const state = createAdventureGameState({ seed: "speculum", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
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

  it("Speculum also discovers a tile adjacent only to the Secondary Hero", () => {
    const state = createAdventureGameState({ seed: "speculum-secondary", difficulty: "normal", rollFirstPlayer: false });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    const adventure = state.adventure!;
    const center: HexCoord = { row: 40, col: 30 };
    instantiateTile(adventure, "F7", center, 0, false);
    const anchor = f7Rings(center).find((ring) => ring.neighborCenter)!;
    const faceDown = instantiateTile(adventure, "N1", anchor.neighborCenter!, 0, true);
    const main = state.heroes.hero_p1;
    state.heroes.hero_p1_secondary = {
      ...main,
      id: "hero_p1_secondary",
      kind: "secondary",
      spaceId: hexSpaceId(anchor.ringHex)
    };

    state.players.p1.hand = ["artifact.speculum"];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.speculum" &&
        legal.action.optionIndex === 0
    );
    expect(play).toBeTruthy();
    const opened = apply(state, play!.action);
    const reveal = getLegalActions(opened, "p1").find((legal) =>
      legal.label.includes(`(${faceDown.centerRow}, ${faceDown.centerCol})`)
    );
    expect(reveal, "the secondary Hero's adjacent tile must be offered").toBeTruthy();
    const revealed = apply(opened, reveal!.action);
    expect(revealed.adventure!.tiles[faceDown.id].faceDown).toBe(false);
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

  // USER RULE 2026-08-25: "Cast a Spell card — should be: cannot be sold in
  // market (similar to Magic Arrows)." Both are starting-only Spell cards
  // (`MARKET_UNSELLABLE_CARD_IDS`); the Trading Post is the ONLY sell surface a
  // Spell card can reach, and its offer builder and handler share one filter.
  it("never sells a Cast a Spell card at the Trading Post, exactly like Magic Arrows", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rotateStartTiles: false });
    for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure;
    const player = state.players.p1;
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    if (!adventure || !player || !hero) {
      throw new Error("setup failed");
    }

    // Hand indices: 0 = the enabler under test, 1 = its already-excluded
    // sibling, 2 = the CONTROL card that must still sell on this same setup.
    player.hand = ["spell.cast_a_spell", "spell.magic_arrow", "spell.lightning_bolt"];
    const field = Object.values(adventure.fields)[0];
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: field.spaceId,
      steps: [{ type: "TRADING_POST" }]
    };

    // The shared filter drops both starting-only Spells and keeps the control.
    expect(removableHandCards(state, "p1", "sellable").map((entry) => entry.cardId)).toEqual([
      "spell.lightning_bolt"
    ]);

    // OFFER: no "Sell Cast a Spell" (nor Magic Arrows) button exists.
    const sellActions = getLegalActions(state, "p1").filter((legal) => legal.label.startsWith("Sell "));
    expect(sellActions.some((legal) => legal.label.includes("Cast a Spell"))).toBe(false);
    expect(sellActions.some((legal) => legal.label.includes("Magic Arrow"))).toBe(false);
    expect(sellActions).toHaveLength(1);
    expect(sellActions[0].label).toContain("Lightning Bolt");

    // FORGED sell of hand index 0 (Cast a Spell) is REFUSED — no gold, the card
    // stays in hand and nothing is removed from the game.
    const goldBefore = player.resources.gold;
    const forged = applyAction(state, {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex: 0
    } as GameAction);
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.players.p1.resources.gold).toBe(goldBefore);
    expect(forged.state.players.p1.hand).toContain("spell.cast_a_spell");
    expect(forged.state.players.p1.removed).not.toContain("spell.cast_a_spell");

    // FORGED sell of the Magic Arrows sibling (index 1) is refused the same way.
    const forgedArrow = applyAction(state, {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex: 1
    } as GameAction);
    expect(forgedArrow.errors.length).toBeGreaterThan(0);
    expect(forgedArrow.state.players.p1.hand).toContain("spell.magic_arrow");

    // CONTROL: the ordinary Spell on the SAME setup really does sell for 1 gold.
    const sold = apply(state, sellActions[0].action);
    expect(sold.players.p1.resources.gold).toBe(goldBefore + 1);
    expect(sold.players.p1.removed).toEqual(["spell.lightning_bolt"]);
    expect(sold.players.p1.hand).toEqual(["spell.cast_a_spell", "spell.magic_arrow"]);
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
    // HOUSE RULE: the catalog is per-player and never depletes — buying leaves it
    // available so other players can still buy their own.
    expect(next.adventure?.warMachineSupply).toContain("war_machine.first_aid_tent");
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
    // Isolate this search from the first-round face-up seed on the Spell discard,
    // which would otherwise open a "search deck / take top discard" choice first.
    state.decks.spells.discardPile = [];
    if (state.decks["spells-expert"]) state.decks["spells-expert"].discardPile = [];
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

  // The Hill Fort's own −3 gold is pinned through the REAL visit (both
  // readings, gold-only and floored at zero) in map-tile-effects-audit.test.ts.
  // The old `hillFortCost` pure-helper assertions that lived here were deleted
  // with the helper: Hill Fort now prices through `reinforceCostFor(…, 3)`, so
  // asserting the dead helper proved nothing about the game.
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
    for (const cardId of Object.values(zydar.specialtyCardIds!)) {
      expect(cardLibrary[cardId], `${cardId} exists`).toBeTruthy();
    }
    // Level I is implemented (no dead starting card) — a self-spell-cast choice.
    const levelOne = cardLibrary[zydar.specialtyCardIds![1]];
    expect(levelOne.implementationStatus).toBe("implemented");
    expect(levelOne.effect.type).toBe("CHOOSE_ONE");
  });
});
