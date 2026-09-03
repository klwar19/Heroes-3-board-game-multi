import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createAdventureGameState } from "../adventure-setup";
import {
  canHeroReachPlacedTile,
  DESIGNER_BORDER_SEALING_ENABLED,
  farTilePlacementCenters,
  getAdjacentSpaceIds,
  instantiateTile,
  isOuterEdgeSealed,
  materializeTileFields,
  playerHasPlaceableFarTile,
} from "../adventure";
import { applyAction } from "../reducer";
import {
  canonicalTileEdgeCode,
  hexDirectionBetween,
  hexNeighbor,
  hexSpaceId,
  parseHexSpaceId,
  slotDirection,
  tileFootprint,
  tileLatticeNeighbors
} from "../hex";
import { getLegalActions } from "../legal-actions";
import { observeForComputer } from "./observation";
import { getPlayerView } from "../player-view";
import {
  canHeroDiscoverAdjacentTile,
  canHeroImmediatelyAccessAdjacentTile,
} from "../adventure-reducer";
import type {
  ArmyUnitState,
  GameAction,
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
} from "../state";
import { UNOPENED_FAR_TILE } from "../state";
import {
  canBeatGuardedField,
  collectMapObjectives,
  distanceFromHeroTo,
  farExpansionRouteRemains,
  freeSeizuresWithinReach,
  minPrintedGuardDifficultyForBand,
  objectiveDistanceField,
  primaryMapObjective,
  seatHoldsFarSupplyTile,
  startTileRotationOpensFarExpansion,
} from "./map-navigation";
import {
  armyEngagementTier,
  armyTierCoversGuardField,
  armyTierGuardCap,
  unitSideStrength,
} from "./army-strength";
import type { UnitTier } from "@/data/factions/types";
import { scoreMapAction } from "./map-policy";
import { chooseComputerAction } from "./policy";
import { emptyComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";

/**
 * The computer opponent's map navigation. The stock policy scored each adjacent
 * cell in isolation, so a hero wandered back and forth over equal-valued empty
 * fields and never walked into a fight. These tests pin the fix on a REAL
 * starting map (seed "nav-map") whose p2 home tile carries, around the p2 town
 * at h:10:7, two difficulty-1 guarded fields (the mine h:10:6 and the treasure
 * h:11:6) and an unguarded visitable (the resource symbol h:10:8) — every claim
 * fails if the objective-seeking / engagement wiring is removed.
 */

const TOWN: MapSpaceId = "h:10:7"; // p2's home town — the hero starts here
const MINE: MapSpaceId = "h:10:6"; // flaggable, difficulty 1 (guarded)
const TREASURE: MapSpaceId = "h:11:6"; // visitable, difficulty 1 (guarded)
const RESOURCE: MapSpaceId = "h:10:8"; // visitable, no guard
const EMPTY: MapSpaceId = "h:9:7"; // empty field beside the town

function game(): GameState {
  return createAdventureGameState({ startingBuildings: [],
    seed: "nav-map",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
  });
}

function p2Hero(state: GameState): HeroState {
  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
  );
  if (!hero) {
    throw new Error("expected a p2 main hero on the starting map");
  }
  return hero;
}

function establishP2PackCore(state: GameState): void {
  for (const unit of state.players.p2.army) {
    unit.side = "pack";
  }
}

/** scoreMapAction only reads observation.state + observation.playerId. */
function observe(state: GameState): ComputerObservation {
  return {
    playerId: "p2",
    state: state as unknown as ComputerObservation["state"],
    legalActions: [],
  };
}

describe("PvE module navigation objectives", () => {
  it("marches a viable army to the shared Dungeon gate but not a gutted army", () => {
    const state = game();
    const hero = p2Hero(state);
    establishP2PackCore(state);
    const field = state.adventure!.fields[RESOURCE];
    field.location = "dungeon_gate";
    field.blackCube = false;
    state.adventure!.dungeonSite = { fieldId: RESOURCE, maxFloor: 10 };

    expect(collectMapObjectives(state, hero)).toContainEqual({
      spaceId: RESOURCE,
      kind: "visitable"
    });

    state.players.p2.army = [];
    expect(collectMapObjectives(state, hero)).not.toContainEqual({
      spaceId: RESOURCE,
      kind: "visitable"
    });
  });

  it("marches a viable army to a live Rift and ignores a slain one", () => {
    const state = game();
    const hero = p2Hero(state);
    establishP2PackCore(state);
    const field = state.adventure!.fields[RESOURCE];
    field.location = "rift_lair";
    field.riftLair = "raid-nav";
    field.blackCube = false;
    state.adventure!.raidBosses = {
      "raid-nav": {
        defId: "goblin_king",
        fieldId: RESOURCE,
        layersLeft: 3,
        layerBreaks: {},
        spawnedRound: 5
      }
    };

    expect(collectMapObjectives(state, hero)).toContainEqual({
      spaceId: RESOURCE,
      kind: "visitable"
    });

    state.adventure!.raidBosses["raid-nav"].slainBy = "p2";
    state.adventure!.raidBosses["raid-nav"].layersLeft = 0;
    expect(collectMapObjectives(state, hero)).not.toContainEqual({
      spaceId: RESOURCE,
      kind: "visitable"
    });
  });
});

function parkAtOpenDiscoveryDoorway(state: GameState, hero: HeroState) {
  const faceDown = Object.values(state.adventure!.tiles).filter((tile) => tile.faceDown);
  for (const field of Object.values(state.adventure!.fields)) {
    const probe = { ...hero, spaceId: field.spaceId };
    const tile = faceDown.find((candidate) =>
      canHeroImmediatelyAccessAdjacentTile(state, probe, candidate),
    );
    if (tile) {
      hero.spaceId = field.spaceId;
      return tile;
    }
  }
  throw new Error("fixture should expose an open face-down-tile doorway");
}

function moveScoreTo(state: GameState, hero: HeroState, to: MapSpaceId): number {
  const scored = scoreMapAction(observe(state), {
    type: "MOVE_HERO",
    playerId: "p2",
    heroId: hero.id,
    to,
  });
  if (!scored) {
    throw new Error("expected MOVE_HERO to be scored by the map policy");
  }
  return scored.score;
}

describe("canBeatGuardedField (Quick-Combat grounded engagement)", () => {
  it("engages a guard at or below the hero's neutral-battle level", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Difficulty 1 vs level 1: an even fight the AI will take.
    expect(canBeatGuardedField(state, hero, state.adventure!.fields[MINE])).toBe(
      true,
    );
    hero.level = 3;
    // Level 3 > difficulty 1: a guaranteed Quick-Combat win.
    expect(canBeatGuardedField(state, hero, state.adventure!.fields[MINE])).toBe(
      true,
    );
  });

  it("CONTROL: stays away from a guard above the hero's level", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 4;
    expect(canBeatGuardedField(state, hero, state.adventure!.fields[MINE])).toBe(
      false,
    );
  });

  it("does not use an earned hero level to throw a rebuilt two-unit army into a high guard", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 5;
    const bronze = Object.values(coreUnitDefinitions).find(
      (definition) => definition.tier === "bronze",
    )!;
    state.players.p2.army = [
      { id: "survivor-a", unitDefId: bronze.id, side: "few" },
      { id: "survivor-b", unitDefId: bronze.id, side: "few" },
    ];
    const guard = state.adventure!.fields[MINE];
    guard.difficulty = 5;

    expect(canBeatGuardedField(state, hero, guard)).toBe(false);

    // A strict level advantage is still a guaranteed Quick Combat and remains
    // safe regardless of the depleted army.
    guard.difficulty = 4;
    expect(canBeatGuardedField(state, hero, guard)).toBe(true);
  });

  it("on Impossible, requires formation depth against a human with free neutral control", () => {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed: "human-neutral-impossible",
      difficulty: "impossible",
      rollFirstPlayer: false,
      events: false,
      pvpNeutralControl: true,
      pvpNeutralControlMustAttack: false,
    });
    const hero = p2Hero(state);
    state.controllers = {
      ...(state.controllers ?? {}),
      p1: { kind: "human" },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
    };
    hero.level = 3;
    state.round = 1;
    const silver = Object.values(coreUnitDefinitions).find(
      (definition) => definition.tier === "silver",
    )!;
    const gold = Object.values(coreUnitDefinitions).find(
      (definition) => definition.tier === "gold",
    )!;
    state.players.p2.army = [
      { id: "silver-a", unitDefId: silver.id, side: "few" },
      { id: "silver-b", unitDefId: silver.id, side: "few" },
    ];
    const guard = { ...state.adventure!.fields[MINE], tileInstanceId: "off-home", difficulty: 3 };

    // Printed Impossible curve says Silver covers level 3, but two bodies are
    // too shallow against unrestricted Wait/Defend/focus. A third body makes a
    // screen-and-carry formation possible. Only public controller data is read.
    expect(canBeatGuardedField(state, hero, guard)).toBe(false);
    state.players.p2.army.push({ id: "gold-a", unitDefId: gold.id, side: "few" });
    expect(canBeatGuardedField(state, hero, guard)).toBe(true);

    // CONTROL: forced-attack human guards remain on the printed strength curve.
    state.players.p2.army.pop();
    state.adventure!.pvpNeutralControlMustAttack = true;
    expect(canBeatGuardedField(state, hero, guard)).toBe(true);
  });

  it("lets a secondary take free Quick Combat, but requires Silver for a real cleanup fight", () => {
    const state = game();
    const main = p2Hero(state);
    main.level = 1;
    const secondary = {
      ...main,
      id: "p2-secondary",
      kind: "secondary" as const,
    };
    state.heroes[secondary.id] = secondary;

    const lowGuard = state.adventure!.fields[MINE];
    lowGuard.difficulty = 1;
    expect(canBeatGuardedField(state, main, lowGuard)).toBe(true);
    expect(canBeatGuardedField(state, secondary, lowGuard)).toBe(false);

    // The Secondary borrows the Main Hero's neutral-battle level. A strict
    // advantage is a no-battle Quick Combat and needs no premium unit.
    main.level = 2;
    expect(canBeatGuardedField(state, secondary, lowGuard)).toBe(true);
    main.level = 1;

    const silver = Object.values(coreUnitDefinitions).find(
      (definition) => definition.tier === "silver",
    )!;
    state.players.p2.army.push({
      id: "cleanup-silver",
      unitDefId: silver.id,
      side: "few",
    });
    expect(canBeatGuardedField(state, secondary, lowGuard)).toBe(true);

    lowGuard.difficulty = 3;
    expect(canBeatGuardedField(state, secondary, lowGuard)).toBe(false);
  });

  it("lets a strong secondary clean a low Far bank, never a Near bank", () => {
    const state = game();
    const main = p2Hero(state);
    const secondary = {
      ...main,
      id: "p2-bank-cleaner",
      kind: "secondary" as const,
    };
    const azure = Object.values(coreUnitDefinitions).find(
      (definition) => definition.tier === "azure",
    )!;
    state.players.p2.army = Array.from({ length: 12 }, (_, index) => ({
      id: `azure-${index}`,
      unitDefId: azure.id,
      side: "neutral" as const,
    }));
    const farBank = {
      ...state.adventure!.fields[MINE],
      location: "creature_bank",
      bankId: "imp_cache",
      difficulty: undefined,
    };
    const nearBank = { ...farBank, bankId: "derelict_ship" };
    expect(canBeatGuardedField(state, secondary, farBank)).toBe(true);
    expect(canBeatGuardedField(state, secondary, nearBank)).toBe(false);
  });
});

describe("computer exploration requires immediate open-border access", () => {
  it("does not reveal a face-down tile behind a yellow border even when Legacy humans may", () => {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed: "test-seed",
      difficulty: "normal",
      ruleset: "legacy",
      houseRules: { "discovery-border-gate": false },
      rollFirstPlayer: false,
      events: false,
    });
    state.activePlayerId = "p1";
    state.players.p1.needsHandRefresh = false;
    state.players.p1.canMulligan = false;
    const hero = state.heroes.hero_p1;
    hero.spaceId = "h:8:3";
    hero.movementPoints = 3;
    const tile = Object.values(state.adventure!.tiles).find(
      (candidate) => candidate.centerRow === 9 && candidate.centerCol === 4
    )!;
    const discover = {
      type: "DISCOVER_TILE" as const,
      playerId: "p1" as const,
      heroId: hero.id,
      tileInstanceId: tile.id,
    };
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === tile.id
      ),
      "Legacy human control: adjacency-only discovery remains legal"
    ).toBe(true);

    const observation: ComputerObservation = {
      playerId: "p1",
      state: state as unknown as ComputerObservation["state"],
      legalActions: [
        { label: "reveal sealed tile", action: discover },
        { label: "end", action: { type: "END_TURN", playerId: "p1" } },
      ],
    };
    expect(scoreMapAction(observation, discover)).toEqual({
      score: 100,
      policy: "map.discover-inaccessible-skip",
    });
    expect(chooseComputerAction(observation)?.action.type).toBe("END_TURN");
    expect(
      collectMapObjectives(state, hero).some(
        (objective) => objective.kind === "explore" && objective.spaceId === hero.spaceId
      )
    ).toBe(false);
  });

  it("does not place/open a Far tile from a sealed edge when the human toggle is off", () => {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed: "nav-map",
      difficulty: "normal",
      ruleset: "legacy",
      houseRules: { "discovery-border-gate": false },
      rollFirstPlayer: false,
      events: false,
    });
    state.activePlayerId = "p2";
    state.players.p2.needsHandRefresh = false;
    state.players.p2.canMulligan = false;
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [UNOPENED_FAR_TILE],
    };
    if ((state.adventure!.farTilePool?.length ?? 0) === 0) {
      state.adventure!.farTilePool = ["F1"];
    }
    const hero = p2Hero(state);
    hero.movementPoints = 3;
    let blockedCenter: { row: number; col: number } | undefined;
    for (const field of Object.values(state.adventure!.fields)) {
      hero.spaceId = field.spaceId;
      const humanCenters = farTilePlacementCenters(state, hero);
      const aiCenters = new Set(
        farTilePlacementCenters(state, hero, undefined, { requireImmediateAccess: true }).map(
          (center) => `${center.row}:${center.col}`
        )
      );
      blockedCenter = humanCenters.find((center) => !aiCenters.has(`${center.row}:${center.col}`));
      if (blockedCenter) break;
    }
    expect(blockedCenter, "fixture should expose a Legacy-only sealed placement notch").toBeDefined();
    const place = {
      type: "PLACE_TILE" as const,
      playerId: "p2" as const,
      heroId: hero.id,
      supplyIndex: 0,
      centerRow: blockedCenter!.row,
      centerCol: blockedCenter!.col,
    };
    expect(scoreMapAction(observe(state), place)).toEqual({
      score: 100,
      policy: "map.place-inaccessible-skip",
    });
    expect(
      chooseComputerAction({
        ...observe(state),
        legalActions: [
          { label: "place behind seal", action: place },
          { label: "end", action: { type: "END_TURN", playerId: "p2" } },
        ],
      })?.action.type
    ).toBe("END_TURN");
  });
});

describe("Far-tile opening and Bronze-rush tempo", () => {
  it("scores opening a II–III tile above an otherwise identical later tile", () => {
    const state = game();
    const hero = p2Hero(state);
    // Expansion priority is evaluated after the mandatory tile-I route.
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[MINE].everFlagged = true;
    delete state.adventure!.fields[MINE].difficulty;
    state.adventure!.fields[TREASURE].blackCube = true;
    delete state.adventure!.fields[TREASURE].difficulty;
    state.adventure!.fields[RESOURCE].blackCube = true;
    const tile = parkAtOpenDiscoveryDoorway(state, hero);
    tile.group = "near";
    const later = scoreMapAction(observe(state), {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId: hero.id,
      tileInstanceId: tile.id,
    })!;
    tile.group = "far";
    const far = scoreMapAction(observe(state), {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId: hero.id,
      tileInstanceId: tile.id,
    })!;
    expect(far.score).toBeGreaterThan(later.score);
  });

  it("commits the main hero to a reachable conquest win from round 3", () => {
    const state = game();
    const hero = p2Hero(state);
    establishP2PackCore(state);
    hero.movementPoints = 3;
    // Home tile must already be drained — conquest never interrupts the tile-Ⅰ
    // sweep of all three opening payoffs.
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[MINE].everFlagged = true;
    delete state.adventure!.fields[MINE].difficulty;
    // TREASURE is a visitable (not flaggable) — blackCube is what retires it.
    state.adventure!.fields[TREASURE].blackCube = true;
    delete state.adventure!.fields[TREASURE].difficulty;
    state.adventure!.fields[RESOURCE].blackCube = true;
    const target = state.adventure!.fields[EMPTY];
    target.location = state.adventure!.fields[TOWN].location;
    target.flagOwnerId = "p1";
    target.difficulty = undefined;
    for (const enemy of Object.values(state.heroes)) {
      if (enemy.controllerId === "p1") enemy.spaceId = null;
    }
    const tile = Object.values(state.adventure!.tiles).find(
      (candidate) => candidate.faceDown,
    )!;
    tile.group = "far";
    const discover = {
      type: "DISCOVER_TILE" as const,
      playerId: "p2",
      heroId: hero.id,
      tileInstanceId: tile.id,
    };

    state.round = 2;
    const developFirst = scoreMapAction(observe(state), discover)!;
    expect(developFirst.score).toBeGreaterThan(700);

    state.round = 3;
    const rush = scoreMapAction(observe(state), discover)!;
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(EMPTY);
    expect(primaryMapObjective(state, hero)?.kind).toBe("victory");
    // The FAR-TILE HUNT outranks even the rush commit as an ACTION while the
    // seat has no Far economy (the guaranteed settlement funds everything) —
    // but the win itself stays the march target (primary above), and entering
    // it (980) still beats the flip.
    expect(rush.policy).toBe("map.discover-far-economy");
    expect(rush.score).toBeLessThan(950);
    // CONTROL: with the seat's own Far economy open, the hunt is over — the
    // flip loses its dedicated policy and drops well below the hunt score.
    state.adventure!.farSettlementOpenedByPlayer = { p2: true };
    const afterEconomy = scoreMapAction(observe(state), discover)!;
    expect(afterEconomy.policy).toBe("map.discover-tile");
    expect(afterEconomy.score).toBeLessThan(rush.score);
    state.adventure!.farSettlementOpenedByPlayer = undefined;
  });

  it("does not bleed the three-Pack rush into a hard side neutral (diff ≥ 2)", () => {
    const state = game();
    const hero = p2Hero(state);
    establishP2PackCore(state);
    hero.level = 1;
    state.round = 2;
    // Off home tile — a non-premium materials mine elsewhere.
    const offHome = state.adventure!.fields[EMPTY];
    offHome.tileInstanceId = "tile_off_home_side";
    offHome.flagOwnerId = null;
    offHome.difficulty = 2;
    offHome.location = "mine";
    offHome.resource = "buildingMaterials";
    hero.spaceId = EMPTY;
    // No Far economy yet → bronze rush refuses difficulty-2+ side neutrals
    // (army-bleed risk). Difficulty-1 level-covered fights are taken (no park).
    expect(canBeatGuardedField(state, hero, offHome)).toBe(false);

    // Easy difficulty-1 the level covers: take it mid-rush (no multi-turn wait).
    offHome.difficulty = 1;
    expect(canBeatGuardedField(state, hero, offHome)).toBe(true);

    // A strict level advantage resolves as QUICK COMBAT before a battle opens
    // — free XP/loot even mid-rush on harder fields too.
    offHome.difficulty = 2;
    hero.level = 3;
    expect(canBeatGuardedField(state, hero, offHome)).toBe(true);
    hero.level = 1;

    // Once THIS player has opened its own Far (II-III) economy, equal fights
    // the level covers on difficulty-2 become engageable again (if army covers).
    state.adventure!.farSettlementOpenedByPlayer = { p2: true };
    // Level 1 does not cover difficulty 2 → still false via level/army gates.
    expect(canBeatGuardedField(state, hero, offHome)).toBe(false);

    // CONTROL (finding #1): a RIVAL (p1) opening Far economy must NOT lift p2's
    // rush refusal on hard side neutrals.
    state.adventure!.farSettlementOpenedByPlayer = { p1: true };
    expect(canBeatGuardedField(state, hero, offHome)).toBe(false);

    // With our own economy opened, a difficulty-3 field still exceeds the bronze
    // core (the tier gate, not the rush gate, refuses it).
    state.adventure!.farSettlementOpenedByPlayer = { p2: true };
    offHome.difficulty = 3;
    expect(canBeatGuardedField(state, hero, offHome)).toBe(false);
  });

  it("still hits a lv3 settlement / gold / valuables mine during bronze rush with 3 Packs + 1 silver", () => {
    // Premium Far economy is the point of expanding — the rush must NOT refuse
    // these, and 3 bronze Packs + 1 silver is enough for difficulty 3.
    const state = game();
    state.adventure!.difficulty = "impossible";
    state.adventure!.victoryMode = "conquest";
    const hero = p2Hero(state);
    hero.level = 1;
    state.round = 3;
    const silverId = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === "silver",
    )!;
    const bronzeId = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === "bronze",
    )!;
    state.players.p2.army = [
      { id: "bp-0", unitDefId: bronzeId, side: "pack" },
      { id: "bp-1", unitDefId: bronzeId, side: "pack" },
      { id: "bp-2", unitDefId: bronzeId, side: "pack" },
      { id: "sv-0", unitDefId: silverId, side: "few" },
    ];
    // Drain home tile so premium Far can become the primary.
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[MINE].everFlagged = true;
    delete state.adventure!.fields[MINE].difficulty;
    state.adventure!.fields[TREASURE].blackCube = true;
    delete state.adventure!.fields[TREASURE].difficulty;
    state.adventure!.fields[RESOURCE].blackCube = true;

    for (const setup of [
      { location: "settlement" as const, resource: undefined },
      { location: "mine" as const, resource: "gold" as const },
      { location: "mine" as const, resource: "valuables" as const },
    ]) {
      const field = state.adventure!.fields[EMPTY];
      field.location = setup.location;
      field.resource = setup.resource;
      field.flagOwnerId = null;
      field.difficulty = 3;
      expect(
        canBeatGuardedField(state, hero, field),
        `${setup.location}/${setup.resource ?? "n/a"} must engage at lv3`,
      ).toBe(true);
      expect(
        collectMapObjectives(state, hero).some(
          (o) => o.spaceId === EMPTY && o.kind === "guard",
        ),
      ).toBe(true);
    }

    // CONTROL: plain materials mine at lv3 still refused (not premium, bronze
    // rush + no army-tier cover for materials alone without silver? Wait - we
    // HAVE silver so armyTier covers lv3 regardless of field type). The rush
    // gate only refused non-premium; with silver the level-extension still
    // engages a materials mine. So CONTROL is a bare difficulty-4 instead.
    const materials = state.adventure!.fields[EMPTY];
    materials.location = "mine";
    materials.resource = "buildingMaterials";
    materials.difficulty = 4;
    expect(canBeatGuardedField(state, hero, materials)).toBe(false);
  });

  it("hard/normal/easy: 3 bronze Packs alone take lv3 premium economy ASAP (no silver required)", () => {
    // Field-3 parties mix silver on hard/normal/easy, so the STRICT tier gate
    // would wait — the premium Pack-core rush must engage on hard with just
    // three bronze Packs so the AI hits gold/valuables/settlement ASAP.
    const bronzeId = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === "bronze",
    )!;
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const state = game();
      state.adventure!.difficulty = difficulty;
      state.adventure!.victoryMode = "dragon-hunt";
      const hero = p2Hero(state);
      hero.level = 1;
      state.round = 3;
      state.players.p2.army = [
        { id: "bp-0", unitDefId: bronzeId, side: "pack" },
        { id: "bp-1", unitDefId: bronzeId, side: "pack" },
        { id: "bp-2", unitDefId: bronzeId, side: "pack" },
      ];
      // Drain home so premium can surface.
      state.adventure!.fields[MINE].flagOwnerId = "p2";
      state.adventure!.fields[MINE].everFlagged = true;
      delete state.adventure!.fields[MINE].difficulty;
      state.adventure!.fields[TREASURE].blackCube = true;
      delete state.adventure!.fields[TREASURE].difficulty;
      state.adventure!.fields[RESOURCE].blackCube = true;

      const field = state.adventure!.fields[EMPTY];
      field.location = "mine";
      field.resource = "gold";
      field.flagOwnerId = null;
      field.difficulty = 3;
      expect(
        canBeatGuardedField(state, hero, field),
        `${difficulty}: 3 Packs alone must engage lv3 gold mine`,
      ).toBe(true);

      field.location = "settlement";
      delete field.resource;
      expect(
        canBeatGuardedField(state, hero, field),
        `${difficulty}: 3 Packs alone must engage lv3 settlement`,
      ).toBe(true);

      // CONTROL: same force does NOT charge a materials lv3 (not premium).
      field.location = "mine";
      field.resource = "buildingMaterials";
      expect(
        canBeatGuardedField(state, hero, field),
        `${difficulty}: materials lv3 stays refused without silver`,
      ).toBe(false);
    }
  });

  it("when valuables are short, prioritizes a valuables mine over gold at equal distance", () => {
    const state = game();
    state.adventure!.difficulty = "hard";
    state.adventure!.victoryMode = "dragon-hunt";
    const hero = p2Hero(state);
    hero.level = 1;
    state.round = 3;
    const bronzeId = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === "bronze",
    )!;
    state.players.p2.army = [
      { id: "bp-0", unitDefId: bronzeId, side: "pack" },
      { id: "bp-1", unitDefId: bronzeId, side: "pack" },
      { id: "bp-2", unitDefId: bronzeId, side: "pack" },
    ];
    // Treasury needs valuables for the next dwelling — zero held.
    state.players.p2.resources = {
      gold: 30,
      buildingMaterials: 6,
      valuables: 0,
    };
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[MINE].everFlagged = true;
    delete state.adventure!.fields[MINE].difficulty;
    state.adventure!.fields[TREASURE].blackCube = true;
    delete state.adventure!.fields[TREASURE].difficulty;
    state.adventure!.fields[RESOURCE].blackCube = true;
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };

    // Two equal-distance premium mines off-home: gold vs valuables.
    const arm = (() => {
      // Local mini-arm so both sit 1 step from hero on EMPTY after park.
      const fields = state.adventure!.fields;
      hero.spaceId = EMPTY;
      const goldId = getAdjacentSpaceIds(EMPTY).find((id) => !fields[id]);
      expect(goldId).toBeDefined();
      fields[goldId!] = {
        ...fields[EMPTY],
        spaceId: goldId!,
        location: "mine",
        resource: "gold",
        difficulty: 3,
        flagOwnerId: null,
        tileInstanceId: "tile_prem_a",
        blackCube: false,
      };
      const valsId = getAdjacentSpaceIds(EMPTY).find(
        (id) => id !== goldId && !fields[id],
      );
      expect(valsId).toBeDefined();
      fields[valsId!] = {
        ...fields[EMPTY],
        spaceId: valsId!,
        location: "mine",
        resource: "valuables",
        difficulty: 3,
        flagOwnerId: null,
        tileInstanceId: "tile_prem_b",
        blackCube: false,
      };
      return { goldId: goldId!, valsId: valsId! };
    })();

    expect(canBeatGuardedField(state, hero, state.adventure!.fields[arm.valsId])).toBe(
      true,
    );
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(arm.valsId);

    // CONTROL: with surplus valuables, gold mine wins the equal-distance pick.
    state.players.p2.resources.valuables = 4;
    state.players.p2.resources.gold = 5;
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(arm.goldId);
  });
});

describe("army-tier guard engagement reference (Step 5)", () => {
  function unitDefOfTier(tier: UnitTier): string {
    const id = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === tier,
    );
    if (!id) throw new Error(`fixture has no ${tier}-tier unit`);
    return id;
  }
  function setArmyTiers(state: GameState, tiers: UnitTier[]): void {
    state.players.p2.army = tiers.map((tier, index) => ({
      id: `au-${index}`,
      unitDefId: unitDefOfTier(tier),
      side: "few" as const,
    }));
  }

  it("derives the whole table from the real guard-draw table (anchors: silver→3, gold→5 @ impossible)", () => {
    // Anchors (user's hard requirements) at Impossible — the worst case, since a
    // guard field draws strictly stronger parties as the scenario difficulty rises.
    expect(armyTierGuardCap("impossible", "silver")).toBe(3);
    expect(armyTierGuardCap("impossible", "gold")).toBe(5);
    // Easier scenario difficulties draw weaker parties, so the same army tier
    // safely takes an equal-or-higher field difficulty.
    expect(armyTierGuardCap("easy", "silver")).toBe(4);
    expect(armyTierGuardCap("normal", "silver")).toBe(4);
    expect(armyTierGuardCap("hard", "silver")).toBe(4);
    expect(armyTierGuardCap("easy", "gold")).toBe(6);
    expect(armyTierGuardCap("normal", "gold")).toBe(6);
    expect(armyTierGuardCap("hard", "gold")).toBe(6);
    // Bronze caps (derived, though the wiring keeps bronze on the level gate).
    expect(armyTierGuardCap("impossible", "bronze")).toBe(1);
    expect(armyTierGuardCap("normal", "bronze")).toBe(2);
    // Azure outranks every guard tier — the apex army takes any field.
    expect(armyTierGuardCap("impossible", "azure")).toBe(7);
    expect(armyTierGuardCap("easy", "azure")).toBe(7);
  });

  it("a silver-bearing army engages difficulty-3 at Impossible; a bronze-only army does NOT (CONTROL)", () => {
    const state = game();
    state.adventure!.difficulty = "impossible";
    const hero = p2Hero(state);
    hero.level = 1; // level does NOT cover difficulty 3 — army tier is the only lever
    state.adventure!.fields[MINE].difficulty = 3;

    // CONTROL: a bronze-only army stays on the level gate — no extension.
    setArmyTiers(state, ["bronze", "bronze", "bronze"]);
    expect(armyEngagementTier(state, "p2")).toBe("bronze");
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(false);

    // Two silver bodies unlock the silver cap (3 @ Impossible).
    setArmyTiers(state, ["silver", "silver", "bronze"]);
    expect(armyEngagementTier(state, "p2")).toBe("silver");
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(true);
    // ...and the guard becomes a march objective for the qualifying army.
    expect(
      collectMapObjectives(state, hero).some(
        (o) => o.spaceId === MINE && o.kind === "guard",
      ),
    ).toBe(true);
  });

  it("silver stops at 3 while a gold-bearing army reaches difficulty-5 @ Impossible", () => {
    const state = game();
    state.adventure!.difficulty = "impossible";
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 5;

    // A silver army does NOT over-reach to difficulty 5 (CONTROL for the cap).
    setArmyTiers(state, ["silver", "silver", "silver"]);
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(false);

    // Two gold bodies unlock the gold cap (5 @ Impossible).
    setArmyTiers(state, ["gold", "gold", "silver"]);
    expect(armyEngagementTier(state, "p2")).toBe("gold");
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(true);
  });

  it("guard rail: one lone silver WITHOUT a Pack core refuses lv3; three bronze Packs + one silver take it", () => {
    const state = game();
    state.adventure!.difficulty = "impossible";
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 3;

    // A single silver body with bronze Fews (no Pack core) still falls short —
    // soft unlock requires three bronze PACKS. Bronze count still qualifies the
    // army as "bronze", but bronze never extends the level gate to difficulty 3.
    setArmyTiers(state, ["silver", "bronze", "bronze"]);
    for (const unit of state.players.p2.army) unit.side = "few";
    expect(armyEngagementTier(state, "p2")).toBe("bronze");
    expect(armyTierCoversGuardField(state, "p2", 3)).toBe(false);
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(false);

    // User bar: 3 bronze Packs + even just 1 silver → MUST hit lv3.
    state.players.p2.army = [
      { id: "bp-0", unitDefId: unitDefOfTier("bronze"), side: "pack" },
      { id: "bp-1", unitDefId: unitDefOfTier("bronze"), side: "pack" },
      { id: "bp-2", unitDefId: unitDefOfTier("bronze"), side: "pack" },
      { id: "sv-0", unitDefId: unitDefOfTier("silver"), side: "few" },
    ];
    expect(armyEngagementTier(state, "p2")).toBe("silver");
    expect(armyTierCoversGuardField(state, "p2", 3)).toBe(true);
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(true);

    // Two silvers still unlock without needing the Pack core (classic path).
    setArmyTiers(state, ["silver", "silver", "bronze"]);
    expect(armyTierCoversGuardField(state, "p2", 3)).toBe(true);
  });

  it("seizes an Astrologers 'Rulebook' window: guards draw one level easier, so the caps stretch", () => {
    const state = game();
    state.adventure!.difficulty = "impossible";
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 4;
    setArmyTiers(state, ["silver", "silver", "bronze"]);

    // CONTROL: at plain Impossible a silver army stops at the cap of 3.
    expect(armyTierCoversGuardField(state, "p2", 4)).toBe(false);

    // With the Rulebook proclamation face-up the guard army is DRAWN as if the
    // difficulty were one lower (engine neutralArmyDifficulty), so the same
    // army correctly takes the difficulty-4 camp during that window.
    state.adventure!.astrologers = {
      ...(state.adventure!.astrologers ?? {}),
      activeCardId: "astrologers.rulebook",
    } as NonNullable<GameState["adventure"]>["astrologers"];
    expect(armyTierCoversGuardField(state, "p2", 4)).toBe(true);
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(true);
  });

  it("REGRESSION: a fight the hero level already covers still engages with no qualifying army", () => {
    const state = game();
    state.adventure!.difficulty = "impossible";
    const hero = p2Hero(state);
    hero.level = 5; // level >= difficulty 3 → Quick-Combat reference alone suffices
    state.adventure!.fields[MINE].difficulty = 3;
    setArmyTiers(state, ["bronze", "bronze", "bronze"]);
    // No silver/gold to extend engagement, yet the level gate still engages.
    expect(armyTierCoversGuardField(state, "p2", 3)).toBe(false);
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[MINE]),
    ).toBe(true);
  });
});

describe("collectMapObjectives", () => {
  it("treats an owned town as a normal corridor when it shortens the route", () => {
    const state = game();
    const hero = p2Hero(state);
    establishP2PackCore(state);
    hero.spaceId = RESOURCE;
    // The hero has already collected the resource it is standing on; otherwise
    // the opening sweep correctly keeps that current-cell payoff as primary.
    state.adventure!.fields[RESOURCE]!.blackCube = true;
    // Keep a concrete march target on the opposite side of the home town.
    // RESOURCE -> TOWN -> MINE is the direct route.
    const memory = emptyComputerMemory(state.round);
    memory.stickyObjectiveSpaceId = MINE;
    const scored = scoreMapAction(
      { ...observe(state), memory },
      { type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to: TOWN },
    );

    expect(scored?.policy).toBe("map.move-to-objective");
    // Ordinary progress lives at 700+. The former owned-town detour penalty
    // lowered this exact step and caused equal routes to avoid the town.
    expect(scored!.score).toBeGreaterThanOrEqual(700);
  });

  it("counts beatable guards and unowned locations, not owned or enemy fields", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Park the enemy hero away from its town so h:8:2 is a bare enemy holding.
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = null;
    const objectives = collectMapObjectives(state, hero);
    const spaces = objectives.map((o) => o.spaceId);
    // Both difficulty-1 guards and the unguarded visitable are objectives.
    expect(spaces).toContain(MINE);
    expect(spaces).toContain(TREASURE);
    expect(spaces).toContain(RESOURCE);
    // p2's own town is never an objective.
    expect(spaces).not.toContain(TOWN);
    // Conquest win condition: an enemy faction town IS a victory objective
    // (even with no hero parked on it). Bare non-town enemy holdings stay out.
    const enemyTown = Object.values(state.adventure!.fields).find(
      (field) =>
        field.flagOwnerId === "p1" &&
        field.location &&
        // town category fields only
        spaces.includes(field.spaceId) &&
        objectives.some(
          (o) => o.spaceId === field.spaceId && o.kind === "victory",
        ),
    );
    expect(enemyTown, "conquest elevates the enemy town to victory").toBeTruthy();
    // Bare enemy mines re-flag free (no garrison fight) — they ARE objectives.
    const bareEnemyMine = Object.values(state.adventure!.fields).find(
      (field) =>
        field.flagOwnerId === "p1" &&
        field.spaceId !== enemyTown?.spaceId &&
        field.location &&
        // flaggable category (mine/sawmill/etc.)
        !objectives.some(
          (o) => o.spaceId === field.spaceId && o.kind === "victory",
        ),
    );
    if (bareEnemyMine) {
      // Plant is optional by map layout; when present it must be takeable.
      const kind = objectives.find((o) => o.spaceId === bareEnemyMine.spaceId)?.kind;
      if (kind) {
        expect(["flaggable", "town", "visitable"]).toContain(kind);
      }
    }
  });

  it("values visitable locations by their actual effect (Hill Fort > trinket)", () => {
    const state = game();
    const hero = p2Hero(state);
    // Silence the home-tile guards so the two visitables compete on value.
    state.adventure!.fields[MINE].difficulty = 5;
    state.adventure!.fields[TREASURE].difficulty = 5;
    // Both candidate fields sit adjacent to the town (distance 1 from the
    // hero). The HIGH-value location goes on the LARGER spaceId (h:9:7 sorts
    // after h:10:8): with the value table removed both tie at the flat 600 and
    // the smaller-spaceId tie-break flips the pick — the assertion fails.
    state.adventure!.fields[EMPTY].location = "hill_fort";
    state.adventure!.fields[RESOURCE].location = "temple";
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(EMPTY);

    // CONTROL: swap the two locations and the march target follows the
    // LOCATION, not the field id.
    state.adventure!.fields[EMPTY].location = "temple";
    state.adventure!.fields[RESOURCE].location = "hill_fort";
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(RESOURCE);
  });

  it("discounts fought guards for a secondary because it cannot gain Experience", () => {
    const state = game();
    const main = p2Hero(state);
    main.level = 1;
    const secondary: HeroState = {
      ...main,
      id: "p2-xp-aware-secondary",
      kind: "secondary",
    };
    const silver = Object.values(coreUnitDefinitions).find(
      (definition) => definition.tier === "silver",
    )!;
    state.players.p2.army.push({
      id: "xp-aware-silver",
      unitDefId: silver.id,
      side: "few",
    });
    state.adventure!.fields[MINE].difficulty = 1;
    // Keep this assertion about XP-aware strategic scoring. Friendly towns are
    // now valid transit corridors, so block through-routing across the town;
    // otherwise the separate opening-route optimizer deliberately runs first.
    const opposingHero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId !== main.controllerId,
    )!;
    opposingHero.spaceId = TOWN;
    const choices = [
      { spaceId: MINE, kind: "guard" as const },
      { spaceId: RESOURCE, kind: "visitable" as const },
    ];

    expect(primaryMapObjective(state, main, choices)?.spaceId).toBe(MINE);
    expect(primaryMapObjective(state, secondary, choices)?.spaceId).toBe(RESOURCE);
  });

  it("seeks Obelisks first, then elevates the grail dig site once 2 are visited (Holy Grail)", () => {
    const state = game();
    const hero = p2Hero(state);
    // Mark a public grail dig on an empty field and switch victory mode.
    state.adventure!.victoryMode = "grail";
    state.adventure!.grail = { status: "uncollected", obelisksVisited: {} };
    state.adventure!.fields[RESOURCE].grailDiggable = true;
    // Two distinct, unvisited Obelisks (the Holy Grail dig prerequisite).
    for (const id of [MINE, TREASURE]) {
      state.adventure!.fields[id].location = "obelisk";
      state.adventure!.fields[id].difficulty = undefined;
      state.adventure!.fields[id].flagOwnerId = null;
    }

    // Dig LOCKED (0 Obelisks visited): the Grail dig site is NOT a march target,
    // but the unvisited Obelisks ARE the victory objectives to seek first.
    let objectives = collectMapObjectives(state, hero);
    expect(objectives.find((o) => o.spaceId === RESOURCE)?.kind).not.toBe("victory");
    expect(objectives.find((o) => o.spaceId === MINE)?.kind).toBe("victory");
    expect(objectives.find((o) => o.spaceId === TREASURE)?.kind).toBe("victory");

    // Visit both Obelisks -> the dig UNLOCKS: the Grail becomes the victory
    // objective and the already-visited Obelisks are no longer elevated.
    state.adventure!.grail!.obelisksVisited = { p2: [MINE, TREASURE] };
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[TREASURE].flagOwnerId = "p2";
    objectives = collectMapObjectives(state, hero);
    expect(objectives.find((o) => o.spaceId === RESOURCE)?.kind).toBe("victory");
    expect(objectives.find((o) => o.spaceId === MINE)?.kind).not.toBe("victory");

    // CONTROL: under conquest the same diggable field is not a victory site.
    state.adventure!.victoryMode = "conquest";
    delete state.adventure!.fields[RESOURCE].grailDiggable;
    const conquest = collectMapObjectives(state, hero).find(
      (o) => o.spaceId === RESOURCE,
    );
    expect(conquest?.kind).not.toBe("victory");

    // Dragon hunt elevates the utopia location.
    state.adventure!.victoryMode = "dragon-hunt";
    // Plant a utopia on the treasure field for the test.
    state.adventure!.fields[TREASURE].location = "dragon_utopia";
    state.adventure!.fields[TREASURE].difficulty = 0;
    const dragon = collectMapObjectives(state, hero).find(
      (o) => o.spaceId === TREASURE,
    );
    expect(dragon?.kind).toBe("victory");
  });

  it("understands designer-marked encounters and scoreable VP objectives", () => {
    const state = game();
    const hero = p2Hero(state);
    state.adventure!.victoryMode = "conquest";
    state.adventure!.mapPreset = {
      victoryPoints: {
        enabled: true,
        objectives: [
          { kind: "flag-mines", count: 2, vp: 2 },
          { kind: "defeat-dragon-utopia", vp: 4 }
        ]
      }
    };
    state.adventure!.fields[RESOURCE].designerWinCondition = true;
    state.adventure!.fields[MINE].location = "mine";
    state.adventure!.fields[MINE].flagOwnerId = null;
    state.adventure!.fields[TREASURE].location = "dragon_utopia";
    state.adventure!.fields[TREASURE].difficulty = 0;

    const objectives = collectMapObjectives(state, hero);
    expect(objectives.find((objective) => objective.spaceId === RESOURCE)?.kind).toBe("victory");
    expect(objectives.find((objective) => objective.spaceId === MINE)?.kind).toBe("victory");
    expect(objectives.find((objective) => objective.spaceId === TREASURE)?.kind).toBe("victory");
  });

  it("drops a guard from the objective set once the hero can no longer beat it", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 6;
    const spaces = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(spaces).not.toContain(MINE);
    // The other, still-beatable guard remains.
    expect(spaces).toContain(TREASURE);
  });

  it("treats a designer-VP field as a victory objective only while VP mode is enabled", () => {
    const state = game();
    const hero = p2Hero(state);
    // A designer VP bonus on an otherwise-plain visitable field.
    state.adventure!.fields[RESOURCE].location = "temple";
    state.adventure!.fields[RESOURCE].centerHexVp = 5;

    // VP mode OFF: the bonus scores nothing, so the field is a plain visitable,
    // never a top-priority "victory" march. CONTROL for the VP-enabled case.
    expect(
      collectMapObjectives(state, hero).find((o) => o.spaceId === RESOURCE)?.kind,
    ).not.toBe("victory");

    // VP mode ON: the designer VP now makes it a victory objective.
    state.adventure!.mapPreset = { victoryPoints: { enabled: true } };
    expect(
      collectMapObjectives(state, hero).find((o) => o.spaceId === RESOURCE)?.kind,
    ).toBe("victory");
  });

  it("gates a non-conquest control-towns enemy-town assault by army strength", () => {
    const state = game();
    const hero = p2Hero(state);
    // Non-conquest victory with a control-towns VP objective.
    state.adventure!.victoryMode = "grail";
    state.adventure!.mapPreset = {
      victoryPoints: { enabled: true, objectives: [{ kind: "control-towns", count: 3, vp: 3 }] },
    };
    // A bare enemy-flagged town: no neutral guard, no hero occupying it.
    const enemyTown = Object.values(state.adventure!.fields).find(
      (f) => locationDefinitions[f.location]?.category === "town" && f.flagOwnerId === "p1",
    );
    expect(enemyTown, "default map should have an enemy town").toBeTruthy();
    enemyTown!.difficulty = undefined;
    for (const h of Object.values(state.heroes)) {
      if (h.spaceId === enemyTown!.spaceId) h.spaceId = null;
    }
    // A gold unit that actually has a `few` side with real strength (some
    // catalogue entries — e.g. WOG summons — have no standard side).
    const gold = Object.values(coreUnitDefinitions).find(
      (d) => d.tier === "gold" && unitSideStrength({ id: "probe", unitDefId: d.id, side: "few" } as ArmyUnitState) > 0,
    )!;

    // UNBEATABLE: p1 fields a gold stack, p2 is empty -> the AI must NOT march
    // to a certain-loss garrison fight just because control-towns elevated it.
    state.players.p2.army = [];
    state.players.p1.army = [{ id: "enemy-gold", unitDefId: gold.id, side: "few" }];
    expect(
      collectMapObjectives(state, hero).find((o) => o.spaceId === enemyTown!.spaceId)?.kind,
      "unbeatable enemy town is not a victory march target in a non-conquest game",
    ).not.toBe("victory");

    // CONTROL: a defenceless owner (0 strength) makes the town beatable -> it IS
    // a victory objective again.
    state.players.p1.army = [];
    expect(
      collectMapObjectives(state, hero).find((o) => o.spaceId === enemyTown!.spaceId)?.kind,
    ).toBe("victory");

    // CONTROL: conquest mode elevates the enemy town regardless of strength
    // (the strength gate is scoped to non-conquest modes).
    state.players.p1.army = [{ id: "enemy-gold-2", unitDefId: gold.id, side: "few" }];
    state.players.p2.army = [];
    state.adventure!.victoryMode = "conquest";
    expect(
      collectMapObjectives(state, hero).find((o) => o.spaceId === enemyTown!.spaceId)?.kind,
    ).toBe("victory");
  });
});

describe("objectiveDistanceField", () => {
  it("is zero at objectives and one step out at the hero's cell", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const objectives = collectMapObjectives(state, hero);
    const distance = objectiveDistanceField(state, hero, objectives);
    expect(distance.get(MINE)).toBe(0);
    expect(distance.get(TREASURE)).toBe(0);
    // The town is adjacent to all three objectives — one step to the nearest.
    expect(distance.get(TOWN)).toBe(1);
  });
});

describe("moveScore uses objectives (fixes wander + never-fights)", () => {
  it("spends Population on the same-tier unit with the larger combat gain", () => {
    const state = game();
    const faction = coreFactionDefinitions[state.players.p2.factionId!];
    const bronze = faction.units.filter(
      (unitDefId) => coreUnitDefinitions[unitDefId]?.tier === "bronze",
    );
    expect(bronze.length).toBeGreaterThanOrEqual(2);
    const value = (unitDefId: string) => {
      const side = coreUnitDefinitions[unitDefId]!.few!;
      return (
        side.attack * 3 +
        side.health * 2 +
        side.defense +
        Math.round(side.initiative / 2)
      );
    };
    const candidates = bronze
      .map((unitDefId) => ({ unitDefId, value: value(unitDefId) }))
      .sort((a, b) => b.value - a.value);
    expect(candidates[0].value).toBeGreaterThan(candidates.at(-1)!.value);
    const weaker = candidates.at(-1)!.unitDefId;
    const stronger = candidates[0].unitDefId;
    const actions = [weaker, stronger].map((unitDefId) => ({
      label: `recruit ${unitDefId}`,
      action: {
        type: "POPULATION_ACTION" as const,
        playerId: "p2",
        purchases: [{ kind: "recruit" as const, unitDefId }],
      },
    }));

    const decision = chooseComputerAction({
      ...observe(state),
      legalActions: actions,
    });
    expect(decision?.action.type).toBe("POPULATION_ACTION");
    expect(
      (decision?.action as Extract<GameAction, { type: "POPULATION_ACTION" }>)
        .purchases[0].unitDefId,
    ).toBe(stronger);
  });

  it("collects a known payoff before spending more movement on exploration", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    establishP2PackCore(state);
    // Remove the distant conquest-town override. The opening route deliberately
    // takes the free Resource first, before either guarded payoff.
    state.adventure!.victoryMode = "dragon-hunt";
    const discoverTile = Object.values(state.adventure!.tiles).find(
      (tile) => tile.faceDown,
    );
    expect(discoverTile).toBeDefined();
    const actions = [
      {
        label: "open more map",
        action: {
          type: "DISCOVER_TILE",
          playerId: "p2",
          heroId: hero.id,
          tileInstanceId: discoverTile!.id,
        } as const,
      },
      {
        label: "claim opening resource",
        action: {
          type: "MOVE_HERO",
          playerId: "p2",
          heroId: hero.id,
          to: RESOURCE,
        } as const,
      },
      {
        label: "end",
        action: { type: "END_TURN", playerId: "p2" } as const,
      },
    ];
    const decision = chooseComputerAction({
      ...observe(state),
      legalActions: actions,
    });
    expect(decision?.action.type).toBe("MOVE_HERO");
    expect(decision?.policy).toBe("map.move-to-objective");
  });

  it("steps ONTO a beatable guard well above ending the turn", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    establishP2PackCore(state);
    state.adventure!.fields[RESOURCE].blackCube = true;
    // Entering the beatable guard outranks END_TURN (300) by a wide margin, so
    // the AI walks into the fight instead of turtling.
    expect(moveScoreTo(state, hero, TREASURE)).toBeGreaterThan(700);
  });

  it("CONTROL: refuses to step onto a guard it cannot beat (below END_TURN)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.fields[MINE].difficulty = 6;
    // An unbeatable guard scores below END_TURN (300) — the AI stops instead.
    expect(moveScoreTo(state, hero, MINE)).toBeLessThan(300);
  });

  it("hunts a beatable enemy hero: steps onto it above ending the turn", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    establishP2PackCore(state);
    // Park the human's hero on a field adjacent to the AI's hero. Equal starting
    // armies → the AI engages.
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = RESOURCE;
    const objectives = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(objectives).toContain(RESOURCE);
    expect(moveScoreTo(state, hero, RESOURCE)).toBeGreaterThan(700);
  });

  it("CONTROL: avoids an enemy hero its army cannot take (below END_TURN band)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = RESOURCE;
    // Gut the AI's own army so it is clearly outmatched: no engagement.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    const objectives = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(objectives).not.toContain(RESOURCE);
    // The enemy-occupied field falls back to the blind-PvP avoid score (200).
    expect(moveScoreTo(state, hero, RESOURCE)).toBeLessThan(300);
  });

  it("stops wandering: with no objective left every step scores below END_TURN", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const fields = state.adventure!.fields;
    // Neutralise every nearby objective: flag the guarded fields to p2 and use
    // up the visitable, so nothing is worth marching toward.
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    // Also hide face-down tiles so explore objectives do not keep the hero marching.
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    // A move onto a plain empty neighbour now makes no progress → below END_TURN,
    // so the hero ends its turn rather than shuffling back and forth.
    expect(moveScoreTo(state, hero, EMPTY)).toBeLessThan(300);
  });
});

describe("sticky primary + explore objectives", () => {
  it("opening home-tile sweep starts the route at the free resource", () => {
    // The route begins Resource → Treasure, leaving the open-edge Mine for
    // turn two so the hero can take it, open land, and enter the new tile.
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.victoryMode = "dragon-hunt"; // drop the distant conquest-town override

    const developing = primaryMapObjective(state, hero);
    expect(developing?.kind).toBe("visitable");
    expect(developing?.spaceId).toBe(RESOURCE);
    // All three home payoffs remain objectives, including both guarded fields.
    const objectives = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(objectives).toEqual(expect.arrayContaining([MINE, TREASURE, RESOURCE]));

    // A ready army keeps the same tempo route.
    establishP2PackCore(state);
    const battleReady = primaryMapObjective(state, hero);
    expect(battleReady?.kind).toBe("visitable");
    expect(battleReady?.spaceId).toBe(RESOURCE);
  });

  it("home tile drains all three items even under conquest bronze-rush pressure", () => {
    // User: get all 3 items on tile 1 EVERY game before expanding. Conquest
    // victory scoring used to yank the hero off mid-sweep — the pool restriction
    // keeps primary inside tile Ⅰ until MINE, TREASURE, and RESOURCE are gone.
    const state = game();
    const hero = p2Hero(state);
    establishP2PackCore(state);
    hero.level = 1;
    state.round = 3;
    state.adventure!.victoryMode = "conquest";
    // Plant a juicy enemy-town victory one step away.
    state.adventure!.fields[EMPTY].location = state.adventure!.fields[TOWN].location;
    state.adventure!.fields[EMPTY].flagOwnerId = "p1";
    delete state.adventure!.fields[EMPTY].difficulty;
    for (const enemy of Object.values(state.heroes)) {
      if (enemy.controllerId === "p1") enemy.spaceId = null;
    }

    const primary = primaryMapObjective(state, hero);
    expect([MINE, TREASURE, RESOURCE]).toContain(primary?.spaceId);
    expect(primary?.spaceId).not.toBe(EMPTY);

    // After two guards are claimed, the free resource is still forced before leaving.
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[MINE].everFlagged = true;
    delete state.adventure!.fields[MINE].difficulty;
    state.adventure!.fields[TREASURE].blackCube = true;
    delete state.adventure!.fields[TREASURE].difficulty;
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(RESOURCE);

    // Only once the home tile is empty may conquest / Far become primary.
    state.adventure!.fields[RESOURCE].blackCube = true;
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(EMPTY);
    expect(primaryMapObjective(state, hero)?.kind).toBe("victory");
  });

  it("still drains all three home-tile items even past the old round-3 window", () => {
    // Home-tile drain is no longer round-capped: while the hero stands on tile Ⅰ
    // with remaining local payoffs, it finishes them (all three, every game)
    // before expanding — even on round 4+ with a still-developing army.
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.victoryMode = "dragon-hunt";
    state.round = 4;
    const developing = primaryMapObjective(state, hero);
    expect(developing?.kind).toBe("visitable");
    expect(developing?.spaceId).toBe(RESOURCE);
    const objectives = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(objectives).toEqual(expect.arrayContaining([MINE, TREASURE, RESOURCE]));
  });

  it("commits to one primary objective (no multi-source thrash)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    const primary = primaryMapObjective(state, hero);
    expect(primary).not.toBeNull();
    // With multiple nearby objectives, the sticky pick is deterministic and
    // the distance field for ONLY that target is what moveScore uses — so
    // mid-turn dropouts cannot reverse the hero through home town.
    const again = primaryMapObjective(state, hero, collectMapObjectives(state, hero));
    expect(again?.spaceId).toBe(primary!.spaceId);
  });

  it("treats face-down-tile doorways as explore objectives", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Neutralise local prizes so only explore can remain.
    const fields = state.adventure!.fields;
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    const explore = collectMapObjectives(state, hero).filter((o) => o.kind === "explore");
    // Starting maps place face-down Far/Near tiles — if none exist this seed
    // simply has no explore targets (not a failure of the wiring).
    const faceDown = Object.values(state.adventure!.tiles).some((t) => t.faceDown);
    if (faceDown) {
      expect(explore.length).toBeGreaterThan(0);
    }
  });

  it("offers PLACE_TILE in legal actions and scores it above END_TURN (Ⅱ–Ⅲ expand)", () => {
    // The "stare at VI–VII" stall: face-down high-tier tiles stay sealed, and
    // without PLACE_TILE in the legal set the AI never opens a new Ⅱ–Ⅲ notch.
    const state = game();
    state.activePlayerId = "p2";
    state.players.p2.needsHandRefresh = false;
    state.players.p2.canMulligan = false;
    state.adventure!.pendingTileChoice = null;
    state.adventure!.pendingVisit = null;
    const hero = p2Hero(state);
    hero.level = 1;
    hero.movementPoints = 3;
    // Give p2 an unopened Far supply tile and a non-empty pool.
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [UNOPENED_FAR_TILE],
    };
    if ((state.adventure!.farTilePool?.length ?? 0) === 0) {
      state.adventure!.farTilePool = ["F1", "F2", "F3"];
    }
    expect(playerHasPlaceableFarTile(state, "p2")).toBe(true);

    // Park the hero on a cell that actually has a legal place slot (reuse the
    // same lattice helper legal-actions uses).
    let parked = false;
    for (const field of Object.values(state.adventure!.fields)) {
      hero.spaceId = field.spaceId;
      if (farTilePlacementCenters(state, hero).length > 0) {
        parked = true;
        break;
      }
    }
    expect(parked, "fixture map should expose at least one placeable Far slot").toBe(
      true,
    );

    const placeOffers = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "PLACE_TILE",
    );
    expect(
      placeOffers.length,
      "PLACE_TILE must be engine-offered so the computer can expand",
    ).toBeGreaterThan(0);

    const placeAction = placeOffers[0].action;
    const scored = scoreMapAction(observe(state), placeAction);
    expect(scored?.policy).toBe("map.place-far-tile");
    // END_TURN foundation is 300; place must win or the hero parks forever.
    expect(scored!.score).toBeGreaterThan(300);

    // Explore objectives include place-capable doorways (not only face-down
    // discovery cells), so the march still seeks a notch when high-tier faces
    // are sealed.
    const fields = state.adventure!.fields;
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    const explore = collectMapObjectives(state, hero).filter((o) => o.kind === "explore");
    expect(
      explore.length,
      "place-capable fields remain explore objectives when supply is held",
    ).toBeGreaterThan(0);
  });

  it("CONTROL: no PLACE_TILE offer when the seat has no Far supply", () => {
    const state = game();
    state.activePlayerId = "p2";
    state.players.p2.needsHandRefresh = false;
    state.players.p2.canMulligan = false;
    state.adventure!.pendingTileChoice = null;
    state.adventure!.pendingVisit = null;
    const hero = p2Hero(state);
    hero.movementPoints = 3;
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    // Even if the hero sits on a geometric notch, empty supply → no offer.
    for (const field of Object.values(state.adventure!.fields)) {
      hero.spaceId = field.spaceId;
      if (farTilePlacementCenters(state, hero).length > 0) {
        break;
      }
    }
    const placeOffers = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "PLACE_TILE",
    );
    expect(placeOffers).toHaveLength(0);
  });

  it("marches to a Trading Post only when resources need rebalance", () => {
    const state = game();
    state.round = 5;
    const hero = p2Hero(state);
    hero.level = 1;
    // Neutralise other nearby prizes so the market can surface. Empty Far
    // supply + face-up tiles so place/discover explore doorways do not claim
    // EMPTY and mask the market-only CONTROL.
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const fields = state.adventure!.fields;
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    // Plant a trading post on the empty neighbour.
    fields[EMPTY].location = "trading_post";
    delete fields[EMPTY].difficulty;
    fields[EMPTY].flagOwnerId = null;

    // Broke with materials → market is an objective.
    state.players.p2.resources = {
      gold: 2,
      buildingMaterials: 7,
      valuables: 0,
    };
    const needy = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(needy).toContain(EMPTY);

    // CONTROL: treasury already covers the next dwelling AND the recruit
    // cushion — no rebalance, so the market is not a detour. (A mid-tier
    // "looks balanced" pile can still trip assessDwellingRush.feasible and
    // wrongly keep the market as an objective.)
    state.players.p2.resources = {
      gold: 40,
      buildingMaterials: 12,
      valuables: 6,
    };
    const flush = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(flush).not.toContain(EMPTY);
  });

  it("takes an early Factory detour only for a funded First Aid Tent", () => {
    const state = game();
    state.round = 3;
    const hero = p2Hero(state);
    establishP2PackCore(state);
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const fields = state.adventure!.fields;
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    fields[EMPTY].location = "war_machine_factory";
    delete fields[EMPTY].difficulty;

    state.players.p2.resources.gold = 50;
    expect(collectMapObjectives(state, hero).map((o) => o.spaceId)).toContain(
      EMPTY,
    );

    state.players.p2.resources.gold = 20;
    expect(
      collectMapObjectives(state, hero).map((o) => o.spaceId),
    ).not.toContain(EMPTY);
  });
});

describe("opening home-tile sweep — development gate scoped to tile Ⅰ", () => {
  /** Drain home payoffs, face-down explore, and free map loot so a test can isolate one prize. */
  function neutralizeMapPayoffs(state: GameState): void {
    const fields = state.adventure!.fields;
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].blackCube = true;
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    for (const field of Object.values(fields)) {
      const cat = locationDefinitions[field.location]?.category;
      if (cat === "flaggable" && field.flagOwnerId !== "p2") {
        field.flagOwnerId = "p2";
        field.everFlagged = true;
        delete field.difficulty;
      }
      if (cat === "visitable" && !field.blackCube) {
        field.blackCube = true;
      }
    }
  }

  /** A walkable ghost arm on its OWN tile (never the hero's home tile). */
  function buildGhostArm(state: GameState, length: number): MapSpaceId[] {
    const fields = state.adventure!.fields;
    let root: MapSpaceId | undefined;
    for (const field of Object.values(fields)) {
      if (getAdjacentSpaceIds(field.spaceId).some((id) => !fields[id])) {
        root = field.spaceId;
        break;
      }
    }
    expect(root, "fixture map should expose an open frontier").toBeDefined();
    const template = fields[root!];
    let cursor = root!;
    const arm: MapSpaceId[] = [];
    while (arm.length < length) {
      const next = getAdjacentSpaceIds(cursor).find(
        (id) => !fields[id] && !arm.includes(id),
      );
      expect(next, "ghost arm should keep extending").toBeDefined();
      fields[next!] = {
        ...template,
        spaceId: next!,
        location: "empty_field",
        tileInstanceId: "tile_ghost_ctrl_arm",
        flagOwnerId: null,
        blackCube: false,
      };
      delete fields[next!].difficulty;
      arm.push(next!);
      cursor = next!;
    }
    return arm;
  }

  it("after the free resource, a fresh Few army marches onto the planned guard", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.victoryMode = "dragon-hunt";
    state.adventure!.fields[RESOURCE].blackCube = true;
    // With the free Resource retired, the guarded Treasure is the next route
    // stop and remains well above END_TURN even for the fresh Few-only army.
    expect(moveScoreTo(state, hero, TREASURE)).toBeGreaterThan(700);
  });

  it("sweeps the home guards even with the guaranteed-win house rule EXHAUSTED", () => {
    // The opening aggression is justified by the level-vs-difficulty reference
    // alone, NOT the guaranteed-win smoothing rule. Even with both guaranteed
    // slots already spent (the AI would have to win the fight on the dice), the
    // fresh hero still picks a home guard — the sweep decision never reads the
    // house-rule counter.
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.victoryMode = "dragon-hunt";
    state.computerGuaranteedWins = { p2: 2 }; // both slots used up (limit is 2)
    state.adventure!.fields[RESOURCE].blackCube = true;
    const primary = primaryMapObjective(state, hero);
    expect(primary?.kind).toBe("guard");
    expect([MINE, TREASURE]).toContain(primary?.spaceId);
  });

  it("takes a level-covered difficulty-1 off the home tile (no multi-turn park)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Off home, weak Few army: difficulty-1 the level covers must still engage.
    // Parking several turns for Packs was the "stands still waiting" bug.
    const fields = state.adventure!.fields;
    neutralizeMapPayoffs(state);
    const arm = buildGhostArm(state, 3);
    hero.spaceId = arm[1];
    fields[arm[2]].difficulty = 1; // guard, 1 step
    expect(canBeatGuardedField(state, hero, fields[arm[2]])).toBe(true);
    const objectives = collectMapObjectives(state, hero);
    expect(objectives.some((o) => o.spaceId === arm[2] && o.kind === "guard")).toBe(
      true,
    );
    // Forced list: only this fight (no free-seize noise from the rest of the map).
    const primary = primaryMapObjective(state, hero, [
      { spaceId: arm[2], kind: "guard" },
    ]);
    expect(primary?.spaceId).toBe(arm[2]);
    // With the map neutralized, moveScore's live objective list is just this fight.
    expect(moveScoreTo(state, hero, arm[2])).toBeGreaterThan(300);
  });

  it("CONTROL: difficulty-2 off-home still waits while the core is thin", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.round = 2;
    const arm = buildGhostArm(state, 3);
    hero.spaceId = arm[1];
    state.adventure!.fields[arm[0]].location = "windmill";
    state.adventure!.fields[arm[2]].difficulty = 2;
    // Level 1 does not cover difficulty 2; establish-core refuses the fair fight.
    expect(
      canBeatGuardedField(state, hero, state.adventure!.fields[arm[2]]),
    ).toBe(false);
    const primary = primaryMapObjective(state, hero, [
      { spaceId: arm[2], kind: "guard" },
      { spaceId: arm[0], kind: "visitable" },
    ]);
    // Safe visitable wins when the hard guard is not engageable.
    expect(primary?.spaceId).toBe(arm[0]);
  });

  it("seizes free objects this turn before trekking to a fair fight", () => {
    // Map is full of free paths: an unguarded mine within MP must outrank a
    // farther fair fight. Tunnel-visioning the fight while walking past free
    // loot was the dumb "only fight / stand still" loop.
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    hero.movementPoints = 3;
    establishP2PackCore(state);
    state.adventure!.victoryMode = "dragon-hunt";
    neutralizeMapPayoffs(state);
    const fields = state.adventure!.fields;
    // Corridor: fair fight at the end. Free mine on a SIDE branch so it does
    // not seal the corridor (flaggable is a "stop" hex).
    const arm = buildGhostArm(state, 4);
    hero.spaceId = arm[0];
    const farFight = arm[3];
    fields[farFight].difficulty = 1;
    fields[farFight].location = "mine";
    fields[farFight].resource = "buildingMaterials";
    fields[farFight].flagOwnerId = null;
    const freeSide = getAdjacentSpaceIds(arm[0]).find(
      (id) => id !== arm[1] && !fields[id],
    );
    expect(freeSide, "need a side cell for free seize").toBeDefined();
    const freeMine = freeSide!;
    fields[freeMine] = {
      ...fields[arm[0]],
      spaceId: freeMine,
      location: "mine",
      resource: "buildingMaterials",
      tileInstanceId: "tile_ghost_ctrl_arm",
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[freeMine].difficulty;
    expect(distanceFromHeroTo(state, hero, freeMine)).toBe(1);
    expect(distanceFromHeroTo(state, hero, farFight)).toBeGreaterThan(1);
    expect(canBeatGuardedField(state, hero, fields[farFight])).toBe(true);

    const freeNow = freeSeizuresWithinReach(
      state,
      hero,
      collectMapObjectives(state, hero),
    );
    expect(freeNow.some((o) => o.spaceId === freeMine)).toBe(true);

    // Sticky fight commit still yields to free seize this turn.
    const primary = primaryMapObjective(
      state,
      hero,
      collectMapObjectives(state, hero),
      farFight,
    );
    expect(primary?.spaceId).toBe(freeMine);
    expect(primary?.kind).toBe("flaggable");
    expect(moveScoreTo(state, hero, freeMine)).toBeGreaterThan(300);
  });

  it("values a Settlement distinctly above a generic flaggable (economy rush)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.adventure!.victoryMode = "dragon-hunt";
    // Past the opening window so the Settlement's own premium — not the home
    // sweep bonus — is what ranks it above a bare mine at the same distance.
    state.round = 4;
    const fields = state.adventure!.fields;
    for (const id of [MINE, TREASURE]) {
      fields[id].flagOwnerId = "p2";
      fields[id].everFlagged = true;
      delete fields[id].difficulty;
    }
    fields[RESOURCE].location = "settlement";
    fields[RESOURCE].flagOwnerId = null;
    delete fields[RESOURCE].difficulty;
    fields[EMPTY].location = "mine";
    fields[EMPTY].flagOwnerId = null;
    delete fields[EMPTY].difficulty;
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(RESOURCE);

    // CONTROL: the premium follows the Settlement LOCATION, not the field id.
    fields[RESOURCE].location = "mine";
    fields[EMPTY].location = "settlement";
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(EMPTY);
  });

  it("marches 3 turns toward a lv3 gold mine / settlement before round 6 with 3 Packs + 1 silver", () => {
    // User: not afraid of unit losses; prepare a multi-turn hit before r6 (even
    // r5). Once home is drained, a coverable lv3 premium economy outranks a
    // closer generic leftover so the sticky march can commit 3+ steps out.
    const state = game();
    state.adventure!.difficulty = "normal";
    state.adventure!.victoryMode = "dragon-hunt";
    const hero = p2Hero(state);
    hero.level = 1;
    state.round = 3;
    const silverId = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === "silver",
    )!;
    const bronzeId = Object.keys(coreUnitDefinitions).find(
      (key) => coreUnitDefinitions[key]?.tier === "bronze",
    )!;
    state.players.p2.army = [
      { id: "bp-0", unitDefId: bronzeId, side: "pack" },
      { id: "bp-1", unitDefId: bronzeId, side: "pack" },
      { id: "bp-2", unitDefId: bronzeId, side: "pack" },
      { id: "sv-0", unitDefId: silverId, side: "few" },
    ];
    const fields = state.adventure!.fields;
    fields[MINE].flagOwnerId = "p2";
    fields[MINE].everFlagged = true;
    delete fields[MINE].difficulty;
    fields[TREASURE].blackCube = true;
    delete fields[TREASURE].difficulty;
    fields[RESOURCE].blackCube = true;
    // Silence face-down explore so only the two hand-placed prizes compete.
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    state.adventure!.playerFarTiles = { ...(state.adventure!.playerFarTiles ?? {}), p2: [] };

    // Open ghost corridor: intermediate cells stay EMPTY so the BFS walks
    // THROUGH them (a guarded field is a "stop" and seals the corridor).
    const arm = buildGhostArm(state, 4);
    hero.spaceId = arm[0];
    const goldMine = arm[3];
    fields[goldMine].location = "mine";
    fields[goldMine].resource = "gold";
    fields[goldMine].difficulty = 3;
    // Near leftover fight on a SIDE branch — guarded materials, not free seize.
    // Premium gold must still win primary (free multi-source scoops free loot
    // without dropping the economy commit).
    const nearOpen = getAdjacentSpaceIds(arm[0]).find(
      (id) => id !== arm[1] && !fields[id],
    );
    expect(nearOpen, "need a side cell for the near leftover").toBeDefined();
    const nearLeftover = nearOpen!;
    fields[nearLeftover] = {
      ...fields[arm[0]],
      spaceId: nearLeftover,
      location: "mine",
      resource: "buildingMaterials",
      tileInstanceId: "tile_ghost_ctrl_arm",
      flagOwnerId: null,
      blackCube: false,
      difficulty: 1,
    };
    // Flag any other free map flaggables so they cannot steal primary.
    for (const field of Object.values(fields)) {
      if (
        field.spaceId !== goldMine &&
        field.spaceId !== nearLeftover &&
        locationDefinitions[field.location]?.category === "flaggable" &&
        !field.flagOwnerId
      ) {
        field.flagOwnerId = "p2";
        field.everFlagged = true;
      }
      if (
        field.spaceId !== goldMine &&
        field.spaceId !== nearLeftover &&
        locationDefinitions[field.location]?.category === "visitable" &&
        !field.blackCube
      ) {
        field.blackCube = true;
      }
    }

    expect(distanceFromHeroTo(state, hero, goldMine)).toBe(3);
    expect(distanceFromHeroTo(state, hero, nearLeftover)).toBe(1);
    expect(canBeatGuardedField(state, hero, fields[goldMine])).toBe(true);
    const primary = primaryMapObjective(state, hero);
    expect(primary?.spaceId).toBe(goldMine);
    expect(primary?.kind).toBe("guard");

    // Settlement at the same distance is also a primary-class target.
    fields[goldMine].location = "settlement";
    delete fields[goldMine].resource;
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(goldMine);
  });

  it("marches THROUGH its own cleared guard fields (keep-clear is LIVE guards only)", () => {
    // The corridor to an objective is often paved with fields the hero already
    // cleared (own flagged mine, black-cubed treasure) that KEEP their printed
    // difficulty stamp. A raw-difficulty keep-clear walled the hero off behind
    // its own beaten guards — measured as a multi-round park on the Impossible
    // premium-rush seeds.
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeMapPayoffs(state);
    const fields = state.adventure!.fields;
    const arm = buildGhostArm(state, 3);
    hero.spaceId = arm[0];
    fields[arm[2]].difficulty = 1; // the easy objective at the corridor's end
    // Corridor cell: a guard field ALREADY cleared (black cube), stamp kept.
    fields[arm[1]].location = "treasure_symbol";
    fields[arm[1]].difficulty = 5;
    fields[arm[1]].blackCube = true;
    const primary = primaryMapObjective(state, hero, [
      { spaceId: arm[2], kind: "guard" },
    ]);
    expect(primary?.spaceId).toBe(arm[2]);
    // The cleared field is an ordinary corridor cell — the march step scores.
    expect(moveScoreTo(state, hero, arm[1])).toBeGreaterThan(300);
    // CONTROL: the SAME field with a LIVE guard keeps the keep-clear penalty.
    fields[arm[1]].blackCube = false;
    expect(moveScoreTo(state, hero, arm[1])).toBe(250);
  });

  it("an idle secondary parked in the main's one-lane corridor sidesteps out", () => {
    // Single-step moves can never END on an allied hero, so a secondary parked
    // one cell ahead of the main inside a one-lane corridor deadlocks the march
    // for good (measured: nine straight parked rounds on the premium-rush
    // seeds). The blocker's step OFF the lane must outrank idle parking.
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeMapPayoffs(state);
    const fields = state.adventure!.fields;
    const arm = buildGhostArm(state, 3);
    hero.spaceId = arm[0];
    fields[arm[2]].difficulty = 1; // the main's easy objective, 2 steps out
    const secondary: HeroState = {
      ...hero,
      id: "sec_block",
      kind: "secondary",
      spaceId: arm[1],
      movementPoints: 3,
    };
    state.heroes[secondary.id] = secondary;
    // A side cell off the lane for the sidestep.
    const side = getAdjacentSpaceIds(arm[1]).find((id) => !fields[id]);
    expect(side, "need a side cell for the sidestep").toBeDefined();
    fields[side!] = {
      ...fields[arm[1]],
      spaceId: side!,
      location: "empty_field",
      tileInstanceId: "tile_ghost_ctrl_arm",
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[side!].difficulty;
    // The blocker's sidestep off the lane beats END_TURN and the dev noise…
    expect(moveScoreTo(state, secondary, side!)).toBeGreaterThanOrEqual(600);
    // …but stays below a real march/enter step of its own.
    expect(moveScoreTo(state, secondary, side!)).toBeLessThan(700);
    // CONTROL: with the main hero elsewhere (no blockade) the same step is
    // ordinary idle wandering.
    hero.spaceId = TOWN;
    expect(moveScoreTo(state, secondary, side!)).toBeLessThan(300);
  });

  it("a free pickup BEHIND the hero never reverses a committed premium march", () => {
    // The multi-source scoop must only add pickups ALONG the march. A nearer
    // free mine in the OPPOSITE direction used to dominate the BFS gradient and
    // reverse the premium commit (measured: the settlement was never fought).
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    hero.movementPoints = 3;
    establishP2PackCore(state);
    state.adventure!.victoryMode = "dragon-hunt";
    neutralizeMapPayoffs(state);
    const fields = state.adventure!.fields;
    const arm = buildGhostArm(state, 4);
    hero.spaceId = arm[1];
    const premium = arm[3];
    fields[premium].difficulty = 3;
    fields[premium].location = "mine";
    fields[premium].resource = "gold";
    fields[premium].flagOwnerId = null;
    // Free mine directly BEHIND the hero (opposite the march).
    const behind = arm[0];
    fields[behind].location = "mine";
    fields[behind].resource = "buildingMaterials";
    fields[behind].flagOwnerId = null;
    delete fields[behind].difficulty;
    expect(canBeatGuardedField(state, hero, fields[premium])).toBe(true);
    // The premium keeps primary (free seize defers to the economy commit)…
    const primary = primaryMapObjective(
      state,
      hero,
      collectMapObjectives(state, hero),
      premium,
    );
    expect(primary?.spaceId).toBe(premium);
    // …and the MARCH itself never bends backward: the step toward the premium
    // progresses, the step back onto the free mine does not.
    expect(moveScoreTo(state, hero, arm[2])).toBeGreaterThan(300);
    expect(moveScoreTo(state, hero, behind)).toBeLessThan(300);
  });

  it("HARD INVARIANT: the map policy never reads the guaranteed-win house rule", () => {
    // The AI must justify a fight ONLY by the level-vs-difficulty reference, so
    // the map objective/scoring layer must never read state.computerGuaranteedWins
    // nor import guaranteed-wins.ts (CLAUDE.md: it must not seek fights to exploit
    // the guaranteed-win smoothing rule).
    const layer = [
      "map-navigation.ts",
      "map-policy.ts",
      "development.ts",
      "army-strength.ts",
      "memory.ts",
    ];
    for (const file of layer) {
      const src = readFileSync(`src/engine/computer/${file}`, "utf8");
      expect(src, `${file} must not read computerGuaranteedWins`).not.toContain(
        "computerGuaranteedWins",
      );
      // The module path (guaranteed-wins.ts) — matches any import of the rule.
      expect(src, `${file} must not import guaranteed-wins`).not.toContain(
        "guaranteed-wins",
      );
    }
  });
});

describe("current-tile sweep — drain the tile's payoffs before marching on", () => {
  /**
   * A walkable off-tile arm: plain fields cloned outward from `root`, then
   * re-stamped onto a ghost tile instance. An unknown tileInstanceId reads as
   * unsealed everywhere (isOuterEdgeSealed → false), so as long as the root's
   * own outer arc is open the whole corridor stays walkable while genuinely
   * being a DIFFERENT tile from the hero's.
   */
  function buildOffTileArm(
    state: GameState,
    root: MapSpaceId,
    length: number,
  ): MapSpaceId[] {
    const fields = state.adventure!.fields;
    const template = fields[root];
    let cursor: MapSpaceId = root;
    const arm: MapSpaceId[] = [];
    while (arm.length < length) {
      const next = getAdjacentSpaceIds(cursor).find(
        (id) => !fields[id] && !arm.includes(id),
      );
      expect(next, "arm should keep extending into open lattice").toBeDefined();
      fields[next!] = {
        ...template,
        spaceId: next!,
        location: "empty_field",
        tileInstanceId: "tile_ghost_offmap",
        flagOwnerId: null,
        blackCube: false,
      };
      delete fields[next!].difficulty;
      arm.push(next!);
      cursor = next!;
    }
    return arm;
  }

  function sweepFixture(): {
    state: GameState;
    hero: HeroState;
    localPayoff: MapSpaceId;
    distantPrize: MapSpaceId;
    arm: MapSpaceId[];
  } {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Silence the fixture's own payoffs and the enemy hero so the two
    // hand-placed visitables are the only reachable objectives.
    state.adventure!.fields[MINE].flagOwnerId = "p2";
    state.adventure!.fields[MINE].everFlagged = true;
    delete state.adventure!.fields[MINE].difficulty;
    // The treasure/resource symbols are VISITABLES — a black cube (already
    // visited) is what takes them off the objective list.
    state.adventure!.fields[TREASURE].blackCube = true;
    delete state.adventure!.fields[TREASURE].difficulty;
    state.adventure!.fields[RESOURCE].blackCube = true;
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = null;

    // The home tile is rotated at setup, so pick a ring field whose OUTER arc
    // is genuinely open (S1 seals 4 of its 6 arcs) — the arm must be walkable.
    // It stays a plain corridor field: a visitable is a "stop" the march BFS
    // never routes THROUGH, so the payoff goes on a DIFFERENT ring field.
    const homeTileId = state.adventure!.fields[TOWN].tileInstanceId;
    const doorway = Object.values(state.adventure!.fields).find(
      (field) =>
        field.tileInstanceId === homeTileId &&
        field.slot !== 0 &&
        field.location === "empty_field" &&
        !isOuterEdgeSealed(state.adventure!, field),
    );
    expect(doorway, "home tile should have an open empty arc").toBeDefined();
    const payoffField = Object.values(state.adventure!.fields).find(
      (field) =>
        field.tileInstanceId === homeTileId &&
        field.slot !== 0 &&
        field.spaceId !== doorway!.spaceId &&
        field.location === "empty_field",
    );
    expect(payoffField, "home tile should have a second empty ring field").toBeDefined();

    const arm = buildOffTileArm(state, doorway!.spaceId, 4);
    // Local trinket ON the hero's tile (distance 1): plain temple, base 600.
    // Distant prize OFF the tile (distance 4): Hill Fort, base 670 — the
    // globally better pick without the sweep bonus (670-72=598 > 600-18=582).
    payoffField!.location = "temple";
    state.adventure!.fields[arm[2]].location = "hill_fort";
    expect(distanceFromHeroTo(state, hero, arm[2])).toBe(4);
    expect(distanceFromHeroTo(state, hero, payoffField!.spaceId)).toBe(1);
    return {
      state,
      hero,
      localPayoff: payoffField!.spaceId,
      distantPrize: arm[2],
      arm,
    };
  }

  it("a same-tile payoff outranks a better prize on another tile", () => {
    const { state, hero, localPayoff } = sweepFixture();
    const primary = primaryMapObjective(state, hero);
    expect(primary?.spaceId).toBe(localPayoff);
  });

  it("the sweep also overrides a sticky commit to the distant prize", () => {
    const { state, hero, localPayoff, distantPrize } = sweepFixture();
    const primary = primaryMapObjective(
      state,
      hero,
      collectMapObjectives(state, hero),
      distantPrize,
    );
    // Without the same-tile bonus the sticky +90 hysteresis would keep the
    // Hill Fort march (598 + 90 > 582) — the sweep must break the commit.
    expect(primary?.spaceId).toBe(localPayoff);
  });

  it("CONTROL: standing on the OTHER tile, the bonus follows the hero", () => {
    const { state, hero, distantPrize, arm } = sweepFixture();
    // Same map, hero now stands on the ghost tile: the Hill Fort is the
    // same-tile payoff and the temple is the off-tile one.
    hero.spaceId = arm[0];
    const primary = primaryMapObjective(state, hero);
    expect(primary?.spaceId).toBe(distantPrize);
  });
});

describe("expansion push — open/place Ⅱ–Ⅲ before a long march to a leftover", () => {
  /** Neutralise the home-tile prizes so the fixture controls the payoff set. */
  function clearLocalPrizes(state: GameState): void {
    const fields = state.adventure!.fields;
    fields[MINE].flagOwnerId = "p2";
    fields[MINE].everFlagged = true;
    delete fields[MINE].difficulty;
    fields[TREASURE].blackCube = true;
    delete fields[TREASURE].difficulty;
    fields[RESOURCE].blackCube = true;
  }

  /**
   * Extend a walkable corridor of plain fields outward from `from` so a
   * genuinely long distance exists on the fixture map (the starting tiles
   * alone max out at 2 steps). Returns the added fields nearest-first.
   */
  function buildCorridor(
    state: GameState,
    from: MapSpaceId,
    length: number,
  ): MapSpaceId[] {
    const fields = state.adventure!.fields;
    const template = fields[from];
    let cursor: MapSpaceId = from;
    const corridor: MapSpaceId[] = [];
    while (corridor.length < length) {
      const next = getAdjacentSpaceIds(cursor).find(
        (id) => !fields[id] && !corridor.includes(id),
      );
      expect(next, "corridor should keep extending into open lattice").toBeDefined();
      fields[next!] = { ...template, spaceId: next!, flagOwnerId: null, blackCube: false };
      delete fields[next!].difficulty;
      corridor.push(next!);
      cursor = next!;
    }
    return corridor;
  }

  it("flips the tile when the only known payoff sits behind unexplored land", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    hero.movementPoints = 3;
    establishP2PackCore(state);
    state.adventure!.victoryMode = "dragon-hunt";
    clearLocalPrizes(state);
    // NARROWED (Ⅱ–Ⅲ-first opening rule): the doorway this fixture parks at is a
    // Ⅳ–Ⅴ / Ⅵ–Ⅶ tile, which a level-1 hero can fight nothing on. With a Ⅱ–Ⅲ
    // supply tile still in hand the AI now expands THAT way first
    // (`map.discover-high-band-defer`), so the anti-park claim this test exists
    // for is pinned with the Ⅱ–Ⅲ route already spent. The deferral itself is
    // pinned in "computer opening: tile Ⅰ rotation and Ⅱ–Ⅲ-first discovery".
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    // Neutralise every remaining REACHABLE payoff so only out-of-reach ones stay.
    for (const objective of collectMapObjectives(state, hero)) {
      if (
        objective.kind === "explore" ||
        distanceFromHeroTo(state, hero, objective.spaceId) === undefined
      ) {
        continue;
      }
      const field = state.adventure!.fields[objective.spaceId];
      field.flagOwnerId = "p2";
      field.everFlagged = true;
      field.blackCube = true;
      delete field.difficulty;
    }

    // Every known payoff sits on a field the hero cannot reach yet (locked
    // behind still-face-down tiles) — the realistic "leftover prize on another
    // arm of the map" situation. Add a beatable level-1 guard there too.
    const unreachable = Object.values(state.adventure!.fields).find(
      (field) =>
        !field.flagOwnerId &&
        !field.difficulty &&
        !field.blackCube &&
        distanceFromHeroTo(state, hero, field.spaceId) === undefined,
    );
    expect(unreachable, "fixture map should have an unreachable field").toBeDefined();
    unreachable!.difficulty = 1;
    const payoffs = collectMapObjectives(state, hero).filter(
      (objective) => objective.kind !== "explore",
    );
    expect(payoffs.length).toBeGreaterThan(0);
    for (const payoff of payoffs) {
      expect(distanceFromHeroTo(state, hero, payoff.spaceId)).toBeUndefined();
    }

    const discoverTile = Object.values(state.adventure!.tiles).find(
      (tile) => tile.faceDown,
    );
    expect(discoverTile).toBeDefined();
    const scored = scoreMapAction(observe(state), {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId: hero.id,
      tileInstanceId: discoverTile!.id,
    });
    // Above every march-progress score (OBJECTIVE_PROGRESS_BASE 700 + ≤10):
    // the AI opens new land instead of parking on an unreachable commitment.
    expect(scored?.policy).toBe("map.discover-tile");
    expect(scored!.score).toBeGreaterThan(710);
  });

  it("flips the tile when the known payoff is beyond this turn's walking reach", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    establishP2PackCore(state);
    state.adventure!.victoryMode = "dragon-hunt";
    clearLocalPrizes(state);
    // NARROWED for the same reason as the sibling above: Ⅱ–Ⅲ expansion outranks
    // flipping a band this hero cannot fight, so the Ⅱ–Ⅲ route is spent first.
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };

    // Park the hero on a ring field and guard another ring field 2 steps away;
    // with 1 movement point left the payoff is out of reach this turn.
    const discoverTile = parkAtOpenDiscoveryDoorway(state, hero);
    hero.movementPoints = 1;
    const twoSteps = Object.values(state.adventure!.fields).find(
      (field) =>
        !field.flagOwnerId &&
        !field.difficulty &&
        !field.blackCube &&
        distanceFromHeroTo(state, hero, field.spaceId) === 2,
    );
    expect(twoSteps, "fixture map should have a field 2 steps out").toBeDefined();
    twoSteps!.difficulty = 1;

    const action = {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId: hero.id,
      tileInstanceId: discoverTile.id,
    } as const;
    const scored = scoreMapAction(observe(state), action);
    expect(scored!.score).toBeGreaterThan(710);

    // CONTROL within the same fixture: with the movement to actually get
    // there this turn, the close prize is collected before exploring.
    hero.movementPoints = 3;
    const flush = scoreMapAction(observe(state), action);
    expect(flush!.score).toBeLessThan(700);
  });

  it("CONTROL: a payoff within this turn's reach is collected before exploring", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    hero.movementPoints = 3;
    establishP2PackCore(state);
    state.adventure!.victoryMode = "dragon-hunt";
    // The adjacent guarded MINE stays live — a close, beatable payoff.
    const discoverTile = Object.values(state.adventure!.tiles).find(
      (tile) => tile.faceDown,
    );
    expect(discoverTile).toBeDefined();
    const scored = scoreMapAction(observe(state), {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId: hero.id,
      tileInstanceId: discoverTile!.id,
    });
    // Below OBJECTIVE_PROGRESS_BASE (700): the close prize is banked first.
    expect(scored!.score).toBeLessThan(700);
  });

  it("prefers an adjacent doorway over a distant leftover as the march target", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    clearLocalPrizes(state);
    // No Ⅱ–Ⅲ supply → the plain explore value (500) is what must win here.
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const corridor = buildCorridor(state, EMPTY, 7);
    // The leftover lives on ANOTHER arm of the map: re-stamp the synthetic
    // corridor onto its own tile so the opening home-tile sweep (which rightly
    // favours SAME-tile pickups, and lifts a home guard's readiness gate) stays
    // out of this off-tile comparison. buildCorridor clones EMPTY's fields, so
    // the corridor otherwise inherits the home tile id and the sweep would leak.
    // An unknown tileInstanceId reads as unsealed, so the arm stays walkable.
    for (const id of corridor) {
      state.adventure!.fields[id].tileInstanceId = "tile_ghost_leftover_arm";
    }
    const farField = corridor[corridor.length - 1];
    expect(distanceFromHeroTo(state, hero, farField)).toBeGreaterThanOrEqual(7);
    // A (weak-army) fight is also listed so the no-fight explore boost stays
    // out of this comparison — the PLAIN explore value is what must win.
    const farGuard = corridor[corridor.length - 2];
    state.adventure!.fields[farGuard].difficulty = 1;
    const primary = primaryMapObjective(state, hero, [
      { spaceId: farField, kind: "visitable" },
      { spaceId: farGuard, kind: "guard" },
      { spaceId: EMPTY, kind: "explore" },
    ]);
    // 500 - 18·1 (adjacent doorway) beats 600 - 18·8 (distant leftover); with
    // the old 430 explore value the leftover would still win the march.
    expect(primary?.spaceId).toBe(EMPTY);
    expect(primary?.kind).toBe("explore");
  });

  it("explores harder when nothing on the board is beatable (post-loss recovery)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    clearLocalPrizes(state);
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const corridor = buildCorridor(state, EMPTY, 7);
    // The leftover payoff lives on ANOTHER arm of the map: re-stamp the
    // synthetic corridor onto its own tile so the hero-tile sweep bonus (which
    // rightly favors SAME-tile pickups) stays out of this off-tile comparison.
    // An unknown tileInstanceId reads as unsealed, so the arm stays walkable.
    for (const id of corridor) {
      state.adventure!.fields[id].tileInstanceId = "tile_ghost_leftover_arm";
    }
    const nearVisitable = corridor[2]; // 4 steps out
    const farGuardField = corridor[6]; // 8 steps out

    // NO fight anywhere (the just-lost-army situation): open new land next
    // door instead of trekking 4 fields to a leftover.
    const noFight = primaryMapObjective(state, hero, [
      { spaceId: nearVisitable, kind: "visitable" },
      { spaceId: EMPTY, kind: "explore" },
    ]);
    expect(noFight?.kind).toBe("explore");
    expect(noFight?.spaceId).toBe(EMPTY);

    // CONTROL: with a beatable fight anywhere on the list, the plain explore
    // value applies and the closer real payoff wins again.
    state.adventure!.fields[farGuardField].difficulty = 1;
    const withFight = primaryMapObjective(state, hero, [
      { spaceId: nearVisitable, kind: "visitable" },
      { spaceId: EMPTY, kind: "explore" },
      { spaceId: farGuardField, kind: "guard" },
    ]);
    expect(withFight?.kind).toBe("visitable");
    expect(withFight?.spaceId).toBe(nearVisitable);
  });

  it("CONTROL: a nearby real payoff still outranks the doorway (home objects first)", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    clearLocalPrizes(state);
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [UNOPENED_FAR_TILE],
    };
    // RESOURCE sits 1 step out: even with held Ⅱ–Ⅲ supply (explore 530) the
    // close visitable (600 - 18·1) wins — the home-tile objects are hit first.
    const primary = primaryMapObjective(state, hero, [
      { spaceId: RESOURCE, kind: "visitable" },
      { spaceId: EMPTY, kind: "explore" },
    ]);
    expect(primary?.spaceId).toBe(RESOURCE);
    expect(primary?.kind).toBe("visitable");
  });
});

describe("hiring a second hero waits for a developed, funded army", () => {
  const hireAction = (): { label: string; action: GameAction } => ({
    label: "Hire Secondary Hero (10 gold)",
    action: {
      type: "HIRE_SECONDARY_HERO",
      playerId: "p2",
      heroDefId: "any-faction-hero",
    } as GameAction,
  });
  const endTurn = (): { label: string; action: GameAction } => ({
    label: "end",
    action: { type: "END_TURN", playerId: "p2" } as GameAction,
  });

  it("hires once the Pack core stands and gold keeps its cushion", () => {
    const state = game();
    establishP2PackCore(state);
    state.players.p2.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    const decision = chooseComputerAction({
      ...observe(state),
      legalActions: [hireAction(), endTurn()],
    });
    expect(decision?.action.type).toBe("HIRE_SECONDARY_HERO");
    expect(decision?.policy).toBe("map.hire-secondary-hero");
  });

  it("CONTROL: a thin (pre-core) army keeps the Population Token instead", () => {
    const state = game();
    // Army still on Few sides — the fighting core is not established.
    state.players.p2.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    const decision = chooseComputerAction({
      ...observe(state),
      legalActions: [hireAction(), endTurn()],
    });
    expect(decision?.action.type).toBe("END_TURN");
  });

  it("CONTROL: hiring never eats the last gold cushion", () => {
    const state = game();
    establishP2PackCore(state);
    // 10-gold hire would leave only 2 — below the reserve; hold the offer.
    state.players.p2.resources = { gold: 12, buildingMaterials: 0, valuables: 0 };
    const decision = chooseComputerAction({
      ...observe(state),
      legalActions: [hireAction(), endTurn()],
    });
    expect(decision?.action.type).toBe("END_TURN");
  });
});

describe("computer tile rotation never blocks itself in", () => {
  it("avoids an entrance the tile's interior walls into a pocket", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;

    // Park the hero on a real placeable notch and take its legal center.
    let center: { row: number; col: number } | undefined;
    for (const field of Object.values(state.adventure!.fields)) {
      hero.spaceId = field.spaceId;
      center = farTilePlacementCenters(state, hero)[0];
      if (center) {
        break;
      }
    }
    expect(center, "the starting map exposes a placeable outer notch").toBeDefined();

    // Every ring field is an identical open empty field (so the plain
    // entrance grade ties across rotations and the doorway counts are
    // rotation-invariant), but printed internal borders isolate slots 4/5/6
    // into one-cell pockets while slots 1-2-3 + center form an open cluster.
    const testDefId = "TEST_AI_POCKET_ROTATION";
    allTileDefinitions[testDefId] = {
      id: testDefId,
      group: "far",
      content: "core_game",
      terrain: "grass",
      fields: Array.from({ length: 7 }, () => ({ location: "empty_field" })),
      outerImpassable: [false, false, false, false, false, false],
      internalBorders: [
        [3, 4], [4, 5], [0, 4],
        [5, 6], [0, 5],
        [6, 1], [0, 6],
      ],
      source: { product: "test", credit: "test" },
    };

    try {
      const tile = {
        id: "ai-pocket-rotation-tile",
        tileDefId: testDefId,
        centerRow: center!.row,
        centerCol: center!.col,
        rotation: 0,
        faceDown: false,
        group: "far" as const,
        awaitingRotation: true,
      };
      state.adventure!.tiles[tile.id] = tile;
      state.adventure!.pendingTileChoice = {
        tileInstanceId: tile.id,
        playerId: "p2",
        kind: "place",
        heroId: hero.id,
      };

      const heroNeighbors = new Set(getAdjacentSpaceIds(hero.spaceId!));
      const adjacentSlots = (rotation: number): number[] =>
        tileFootprint(center!, rotation)
          .map((cell, slot) => ({ id: hexSpaceId(cell), slot }))
          .filter((entry) => heroNeighbors.has(entry.id))
          .map((entry) => entry.slot);
      const rotations = [0, 1, 2, 3, 4, 5].filter((rotation) =>
        canHeroReachPlacedTile(state, hero, testDefId, center!, rotation),
      );
      // A rotation whose every hero-facing slot is a walled pocket, and one
      // that offers a cluster entrance the hero can keep walking from.
      const pocketRotation = rotations.find((rotation) =>
        adjacentSlots(rotation).every((slot) => slot >= 4),
      );
      const openRotation = rotations.find((rotation) =>
        adjacentSlots(rotation).some((slot) => slot >= 1 && slot <= 3),
      );
      expect(pocketRotation).toBeDefined();
      expect(openRotation).toBeDefined();

      const scoreOf = (rotation: number) =>
        scoreMapAction(observe(state), {
          type: "SET_TILE_ROTATION",
          playerId: "p2",
          tileInstanceId: tile.id,
          rotation,
        })!.score;
      // The onward-reach term is what separates them (pocket −60 vs cluster
      // +9); remove it and the two identical empty entrances tie within the
      // ±0.06 rotation tiebreak.
      expect(scoreOf(openRotation!) - scoreOf(pocketRotation!)).toBeGreaterThan(50);
    } finally {
      delete allTileDefinitions[testDefId];
    }
  });

  it("points its one open arc at future land instead of dead rock", () => {
    const state = game();
    // A tile with a SINGLE open outer arc (slot 1), revealed on foot far from
    // everything; one synthetic face-down tile sits nearby. The rotation that
    // faces the open arc at the face-down footprint keeps expanding; facing
    // empty off-map lattice is the self-blocking pick.
    const testDefId = "TEST_AI_DOORWAY_ROTATION";
    allTileDefinitions[testDefId] = {
      id: testDefId,
      group: "far",
      content: "core_game",
      terrain: "grass",
      fields: Array.from({ length: 7 }, () => ({ location: "empty_field" })),
      outerImpassable: [false, true, true, true, true, true],
      source: { product: "test", credit: "test" },
    };

    try {
      const center = { row: 30, col: 30 };
      const footprint = new Set(
        tileFootprint(center, 0).map((cell) => hexSpaceId(cell)),
      );
      // Find a face-down neighbor center whose footprint touches ours without
      // overlapping it.
      let fdCenter: { row: number; col: number } | undefined;
      outer: for (let dRow = -4; dRow <= 4; dRow += 1) {
        for (let dCol = -4; dCol <= 4; dCol += 1) {
          const candidate = { row: 30 + dRow, col: 30 + dCol };
          const cells = tileFootprint(candidate, 0).map((cell) => hexSpaceId(cell));
          if (cells.some((cell) => footprint.has(cell))) continue;
          const touches = cells.some((cell) =>
            getAdjacentSpaceIds(cell).some((id) => footprint.has(id)),
          );
          if (touches) {
            fdCenter = candidate;
            break outer;
          }
        }
      }
      expect(fdCenter, "an adjacent non-overlapping center exists").toBeDefined();

      const tile = {
        id: "ai-doorway-rotation-tile",
        tileDefId: testDefId,
        centerRow: center.row,
        centerCol: center.col,
        rotation: 0,
        faceDown: false,
        group: "far" as const,
        awaitingRotation: true,
      };
      state.adventure!.tiles[tile.id] = tile;
      state.adventure!.tiles["ai-fd-neighbor"] = {
        id: "ai-fd-neighbor",
        tileDefId: "N1",
        centerRow: fdCenter!.row,
        centerCol: fdCenter!.col,
        rotation: 0,
        faceDown: true,
        group: "near" as const,
      };
      state.adventure!.pendingTileChoice = {
        tileInstanceId: tile.id,
        playerId: "p2",
        kind: "reveal",
      };

      const fdCells = new Set(
        tileFootprint(fdCenter!, 0).map((cell) => hexSpaceId(cell)),
      );
      const arcCell = (rotation: number) =>
        hexSpaceId(tileFootprint(center, rotation)[1]);
      const facesFrontier = (rotation: number) =>
        getAdjacentSpaceIds(arcCell(rotation)).some(
          (id) => fdCells.has(id) && !footprint.has(id),
        );
      const facesNothing = (rotation: number) =>
        getAdjacentSpaceIds(arcCell(rotation)).every(
          (id) =>
            footprint.has(id) ||
            (!fdCells.has(id) && !state.adventure!.fields[id]),
        );
      const rotations = [0, 1, 2, 3, 4, 5];
      const frontierRotation = rotations.find(facesFrontier);
      const blankRotation = rotations.find(facesNothing);
      expect(frontierRotation).toBeDefined();
      expect(blankRotation).toBeDefined();

      const scoreOf = (rotation: number) =>
        scoreMapAction(observe(state), {
          type: "SET_TILE_ROTATION",
          playerId: "p2",
          tileInstanceId: tile.id,
          rotation,
        })!.score;
      // Only the frontier-doorway term separates them (+6 vs 0, within the
      // ±0.06 rotation tiebreak) — remove it and this fails.
      expect(scoreOf(frontierRotation!) - scoreOf(blankRotation!)).toBeGreaterThan(5);

      // Revealed land counts even harder: drop a walkable field beside a
      // third (initially blank) rotation's arc, away from the blank control's
      // arc. Its margin over blank is the +30 connectivity reward PLUS the +9
      // revealed-doorway term — the ≥35 bound fails when the doorway term
      // alone is removed.
      const revealedRotation = rotations.find(
        (rotation) =>
          rotation !== frontierRotation &&
          rotation !== blankRotation &&
          facesNothing(rotation),
      );
      if (revealedRotation !== undefined) {
        const blankArcNeighbors = new Set(
          getAdjacentSpaceIds(arcCell(blankRotation!)),
        );
        const beside = getAdjacentSpaceIds(arcCell(revealedRotation)).find(
          (id) =>
            !footprint.has(id) &&
            !fdCells.has(id) &&
            !blankArcNeighbors.has(id) &&
            !state.adventure!.fields[id],
        );
        expect(beside).toBeDefined();
        state.adventure!.fields[beside!] = {
          spaceId: beside!,
          tileInstanceId: "tile_ghost_revealed",
          slot: 1,
          location: "empty_field",
        } as MapFieldState;
        expect(scoreOf(revealedRotation) - scoreOf(blankRotation!)).toBeGreaterThan(35);
      }
    } finally {
      delete allTileDefinitions[testDefId];
    }
  });
});

describe("computer Far-tile rotation prefers the easiest entrance", () => {
  it("rotates the new tile toward the hero's easy field, not a hard guard", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;

    // Park the hero on a real placeable notch and take its legal center.
    let center: { row: number; col: number } | undefined;
    for (const field of Object.values(state.adventure!.fields)) {
      hero.spaceId = field.spaceId;
      center = farTilePlacementCenters(state, hero)[0];
      if (center) {
        break;
      }
    }
    expect(center, "the starting map exposes a placeable outer notch").toBeDefined();
    expect(hero.spaceId).toBeTruthy();

    // A test tile whose ring slot 1 is a safe empty field and every other ring
    // slot is an avoidable level-V guard — so the "easiest entrance" is the one
    // rotation that puts slot 1 against the hero.
    const testDefId = "TEST_AI_EASY_ROTATION";
    allTileDefinitions[testDefId] = {
      id: testDefId,
      group: "far",
      content: "core_game",
      terrain: "grass",
      fields: [
        { location: "empty_field" },
        { location: "empty_field" },
        ...Array.from({ length: 5 }, () => ({ location: "mine", difficulty: 5 })),
      ],
      outerImpassable: [false, false, false, false, false, false],
      source: { product: "test", credit: "test" },
    };

    try {
      const tile = {
        id: "ai-easy-rotation-tile",
        tileDefId: testDefId,
        centerRow: center!.row,
        centerCol: center!.col,
        rotation: 0,
        faceDown: false,
        group: "far" as const,
        awaitingRotation: true,
      };
      state.adventure!.tiles[tile.id] = tile;
      state.adventure!.pendingTileChoice = {
        tileInstanceId: tile.id,
        playerId: "p2",
        kind: "place",
        heroId: hero.id,
      };

      const heroNeighbors = new Set(getAdjacentSpaceIds(hero.spaceId!));
      const rotations = [0, 1, 2, 3, 4, 5].filter((rotation) =>
        canHeroReachPlacedTile(state, hero, testDefId, center!, rotation),
      );
      // Slot 1 (the safe field) faces the hero on the "easy" rotation; a "hard"
      // rotation reaches the tile but only exposes a level-V guard to the hero.
      const easyRotation = rotations.find((rotation) =>
        heroNeighbors.has(hexSpaceId(tileFootprint(center!, rotation)[1])),
      );
      const hardRotation = rotations.find(
        (rotation) => !heroNeighbors.has(hexSpaceId(tileFootprint(center!, rotation)[1])),
      );
      expect(easyRotation).toBeDefined();
      expect(hardRotation).toBeDefined();

      const easy = scoreMapAction(observe(state), {
        type: "SET_TILE_ROTATION",
        playerId: "p2",
        tileInstanceId: tile.id,
        rotation: easyRotation!,
      });
      const hard = scoreMapAction(observe(state), {
        type: "SET_TILE_ROTATION",
        playerId: "p2",
        tileInstanceId: tile.id,
        rotation: hardRotation!,
      });
      // The entrance-grading term (tileHeroEntryScore) is what separates them —
      // remove it and both rotations tie on the binary reachability reward.
      expect(easy!.score).toBeGreaterThan(hard!.score);
    } finally {
      delete allTileDefinitions[testDefId];
    }
  });
});

/**
 * Navigation across TERRAIN the engine gates through `canCrossEdge` /
 * `classifyHeroStep` — open water and the Surface↔Subterranean divide — plus the
 * Monolith/Whirlpool teleport destination router and the Spell-Book stash. The
 * AI delegates every crossing rule to the engine, so the objective-distance BFS
 * already reaches sea and underground objectives; these pin that it does (and
 * that a teleport/stash advances the plan), each with a CONTROL that fails if the
 * wiring is removed.
 */
describe("navigation across sea / underground, teleport routing, Spell-Book stash", () => {
  /** Clear every OTHER objective so a single hand-placed one is the primary. */
  function neutralizeObjectives(state: GameState): void {
    for (const field of Object.values(state.adventure!.fields)) {
      if (field.difficulty) {
        field.blackCube = true;
        field.everFlagged = true;
        delete field.difficulty;
      }
      // Bare mines / settlements → flag ours so they are not flaggable targets.
      if (locationDefinitions[field.location]?.category === "flaggable") {
        field.flagOwnerId = "p2";
      }
      // Visited visitables drop off the objective list.
      if (locationDefinitions[field.location]?.category === "visitable") {
        field.blackCube = true;
      }
    }
    // No face-down tiles / far-tile supply ⇒ no "explore" doorways compete.
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    state.adventure!.farTilePool = [];
    // Remove the enemy hero so no enemy-hero objective competes.
    for (const other of Object.values(state.heroes)) {
      if (other.controllerId !== "p2") other.spaceId = null;
    }
  }

  /** Extend a corridor of fresh fields into open lattice, optionally water. */
  function buildArm(
    state: GameState,
    root: MapSpaceId,
    length: number,
    water: boolean,
  ): MapSpaceId[] {
    const fields = state.adventure!.fields;
    const template = fields[root];
    let cursor = root;
    const arm: MapSpaceId[] = [];
    while (arm.length < length) {
      const next = getAdjacentSpaceIds(cursor).find(
        (id) => !fields[id] && !arm.includes(id),
      );
      expect(next, "arm should extend into open lattice").toBeDefined();
      fields[next!] = {
        ...template,
        spaceId: next!,
        location: "empty_field",
        tileInstanceId: "tile_ghost_offmap",
        flagOwnerId: null,
        blackCube: false,
        ...(water ? { terrain: "water" as const } : {}),
      };
      delete fields[next!].difficulty;
      arm.push(next!);
      cursor = next!;
    }
    return arm;
  }

  /** An open (unsealed) empty ring field on the hero's home tile. */
  function homeDoorway(state: GameState, hero: HeroState): MapSpaceId {
    const homeTileId = state.adventure!.fields[hero.spaceId!].tileInstanceId;
    const doorway = Object.values(state.adventure!.fields).find(
      (field) =>
        field.tileInstanceId === homeTileId &&
        field.slot !== 0 &&
        field.location === "empty_field" &&
        !isOuterEdgeSealed(state.adventure!, field),
    );
    expect(doorway, "home tile should have an open empty arc").toBeDefined();
    return doorway!.spaceId;
  }

  it("routes the objective-distance field THROUGH open water to a sea objective", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeObjectives(state);
    const doorway = homeDoorway(state, hero);
    // A water corridor off the land doorway, with a sea visitable at its end.
    const arm = buildArm(state, doorway, 4, true);
    const seaObj = arm[arm.length - 1];
    state.adventure!.fields[seaObj].location = "hill_fort";
    state.adventure!.fields[seaObj].blackCube = false;

    // The BFS crosses the coastline with a clean decreasing gradient over water.
    const df = objectiveDistanceField(state, hero, [
      { spaceId: seaObj, kind: "visitable" },
    ]);
    expect(df.get(seaObj)).toBe(0);
    expect(df.get(arm[arm.length - 2])).toBe(1);
    expect(df.get(doorway)).toBe(arm.length); // land shore reaches across the sea
    // The sea site is a real objective, and it is the primary the hero marches to.
    expect(
      collectMapObjectives(state, hero).some((o) => o.spaceId === seaObj),
    ).toBe(true);
    expect(primaryMapObjective(state, hero)?.spaceId).toBe(seaObj);
  });

  it("marches toward a sea objective — embarking scores as progress; CONTROL: a visited sea site does not", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    hero.movementPoints = 5;
    neutralizeObjectives(state);
    const doorway = homeDoorway(state, hero);
    const arm = buildArm(state, doorway, 4, true);
    const seaObj = arm[arm.length - 1];
    state.adventure!.fields[seaObj].location = "hill_fort";
    state.adventure!.fields[seaObj].blackCube = false;

    // Stand the hero on the land shore; the step onto the first sea hex (embark)
    // shrinks the walk to the sea objective, so it scores as real march progress.
    hero.spaceId = doorway;
    const embark = moveScoreTo(state, hero, arm[0]);
    expect(embark).toBeGreaterThan(500);

    // CONTROL: the sea site is already visited (black cube) → no objective across
    // the water, so the identical embark step is no longer progress.
    state.adventure!.fields[seaObj].blackCube = true;
    const embarkNoObjective = moveScoreTo(state, hero, arm[0]);
    expect(embark).toBeGreaterThan(embarkNoObjective + 100);
  });

  it("marches to an underground objective THROUGH a Subterranean Gate; CONTROL: an unlinked gate is unreachable", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeObjectives(state);
    const fields = state.adventure!.fields;
    const tiles = state.adventure!.tiles;
    const doorway = homeDoorway(state, hero);
    // Surface gate on the home (surface) tile, at an open outward cell.
    const surfaceGate = getAdjacentSpaceIds(doorway).find((id) => !fields[id])!;
    fields[surfaceGate] = {
      ...fields[doorway],
      spaceId: surfaceGate,
      location: "subterranean_gate",
      tileInstanceId: fields[doorway].tileInstanceId,
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[surfaceGate].difficulty;
    // A subterranean tile, with its gate half EDGE-ADJACENT to the surface gate
    // (hexDistance 1 — the engine's own linkage rule).
    tiles["tile_under"] = {
      ...tiles[fields[doorway].tileInstanceId],
      id: "tile_under",
      group: "subterranean",
      faceDown: false,
    } as (typeof tiles)[string];
    const uGate = getAdjacentSpaceIds(surfaceGate).find((id) => !fields[id])!;
    fields[uGate] = {
      ...fields[doorway],
      spaceId: uGate,
      location: "subterranean_gate",
      tileInstanceId: "tile_under",
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[uGate].difficulty;
    fields[surfaceGate].gateLinkSpaceId = uGate;
    fields[uGate].gateLinkSpaceId = surfaceGate;
    // Underground objective adjacent to the underground gate.
    const uObj = getAdjacentSpaceIds(uGate).find((id) => !fields[id])!;
    fields[uObj] = {
      ...fields[doorway],
      spaceId: uObj,
      location: "hill_fort",
      tileInstanceId: "tile_under",
      flagOwnerId: null,
      blackCube: false,
    };
    delete fields[uObj].difficulty;

    // The BFS crosses the Surface↔Subterranean divide via the linked gate.
    expect(distanceFromHeroTo(state, hero, uObj)).toBeDefined();
    const df = objectiveDistanceField(state, hero, [
      { spaceId: uObj, kind: "visitable" },
    ]);
    expect(df.get(uGate)).toBe(1);
    expect(df.get(surfaceGate)).toBe(2); // the surface side reaches across the gate
    expect(
      collectMapObjectives(state, hero).some((o) => o.spaceId === uObj),
    ).toBe(true);

    // CONTROL: break the gate link. The two layers can only be crossed through a
    // linked gate, so the underground objective becomes unreachable and the BFS
    // no longer routes there.
    delete fields[surfaceGate].gateLinkSpaceId;
    delete fields[uGate].gateLinkSpaceId;
    expect(distanceFromHeroTo(state, hero, uObj)).toBeUndefined();
  });

  it("routes the objective-distance field THROUGH a colored Gate pair; CONTROL: unlinked color / removed pair is longer", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeObjectives(state);
    const doorway = homeDoorway(state, hero);
    // Pure-walk corridor of EMPTY fields (no stops) so the long path stays open.
    // Gates sit OFF the corridor, adjacent to the near and far ends, so the jump
    // is a shortcut without blocking the walk-around CONTROL path.
    const arm = buildArm(state, doorway, 8, false);
    const nearJoin = arm[0];
    const farJoin = arm[arm.length - 2];
    const objField = arm[arm.length - 1];
    state.adventure!.fields[objField].location = "hill_fort";
    state.adventure!.fields[objField].blackCube = false;

    const placeSideGate = (join: MapSpaceId, pair: 1 | 2 | 3 | 4): MapSpaceId => {
      const side = getAdjacentSpaceIds(join).find((id) => !state.adventure!.fields[id]);
      expect(side, "side gate cell").toBeDefined();
      state.adventure!.fields[side!] = {
        ...state.adventure!.fields[join],
        spaceId: side!,
        location: "gate",
        gatePair: pair,
        flagOwnerId: null,
        blackCube: false,
        tileInstanceId: "tile_ghost_gate",
      };
      delete state.adventure!.fields[side!].difficulty;
      return side!;
    };
    const nearPortal = placeSideGate(nearJoin, 1);
    const farPortal = placeSideGate(farJoin, 1);

    const viaGate = distanceFromHeroTo(state, hero, objField);
    expect(viaGate).toBeDefined();
    const df = objectiveDistanceField(state, hero, [
      { spaceId: objField, kind: "visitable" },
    ]);
    expect(df.get(objField)).toBe(0);
    expect(df.get(farPortal)).toBeDefined();
    expect(df.get(nearPortal)).toBeDefined();
    // Reverse teleport: near portal is exactly one hop beyond the far landing.
    expect(df.get(nearPortal)).toBe(df.get(farPortal)! + 1);
    // Jump-assisted path is strictly shorter than pure walk along the arm.
    const noPortalDist = (() => {
      // Snapshot distances without any gate network (pure corridor).
      delete state.adventure!.fields[nearPortal];
      delete state.adventure!.fields[farPortal];
      const pure = distanceFromHeroTo(state, hero, objField);
      // Restore for CONTROLs below.
      state.adventure!.fields[nearPortal] = {
        ...state.adventure!.fields[nearJoin],
        spaceId: nearPortal,
        location: "gate",
        gatePair: 1,
        flagOwnerId: null,
        blackCube: false,
        tileInstanceId: "tile_ghost_gate",
      };
      delete state.adventure!.fields[nearPortal].difficulty;
      state.adventure!.fields[farPortal] = {
        ...state.adventure!.fields[farJoin],
        spaceId: farPortal,
        location: "gate",
        gatePair: 1,
        flagOwnerId: null,
        blackCube: false,
        tileInstanceId: "tile_ghost_gate",
      };
      delete state.adventure!.fields[farPortal].difficulty;
      return pure;
    })();
    expect(noPortalDist).toBeDefined();
    expect(viaGate!).toBeLessThan(noPortalDist!);

    // CONTROL 1: different colors — no cross-pair jump; near portal must walk.
    const linkedNear = df.get(nearPortal)!;
    state.adventure!.fields[farPortal].gatePair = 2;
    const dfSplit = objectiveDistanceField(state, hero, [
      { spaceId: objField, kind: "visitable" },
    ]);
    expect(dfSplit.get(nearPortal)).toBeGreaterThan(linkedNear);
    state.adventure!.fields[farPortal].gatePair = 1;

    // CONTROL 2: remove the far gate — network size 1 is inert; distance rises.
    delete state.adventure!.fields[farPortal];
    const noJump = distanceFromHeroTo(state, hero, objField);
    expect(noJump).toBeDefined();
    expect(noJump!).toBeGreaterThan(viaGate!);
  });

  it("one-way monolith shortens entrance→exit only; CONTROL: exit does not reverse to entrance", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeObjectives(state);
    const doorway = homeDoorway(state, hero);
    const arm = buildArm(state, doorway, 6, false);
    const nearJoin = arm[0];
    const farJoin = arm[arm.length - 2];
    const objField = arm[arm.length - 1];
    state.adventure!.fields[objField].location = "hill_fort";
    state.adventure!.fields[objField].blackCube = false;

    const placeSide = (join: MapSpaceId, location: "oneway_entrance" | "oneway_exit"): MapSpaceId => {
      const side = getAdjacentSpaceIds(join).find((id) => !state.adventure!.fields[id]);
      expect(side, "side one-way cell").toBeDefined();
      state.adventure!.fields[side!] = {
        ...state.adventure!.fields[join],
        spaceId: side!,
        location,
        gatePair: 3,
        flagOwnerId: null,
        blackCube: false,
        tileInstanceId: "tile_ghost_oneway",
      };
      delete state.adventure!.fields[side!].difficulty;
      return side!;
    };
    const entrance = placeSide(nearJoin, "oneway_entrance");
    const exit = placeSide(farJoin, "oneway_exit");

    const df = objectiveDistanceField(state, hero, [
      { spaceId: objField, kind: "visitable" },
    ]);
    expect(df.get(exit)).toBeDefined();
    expect(df.get(entrance)).toBeDefined();
    // Reverse edge exit → entrance: entrance is exactly one hop beyond the exit.
    expect(df.get(entrance)).toBe(df.get(exit)! + 1);

    // CONTROL: objective beside the entrance only — exit cannot jump back.
    state.adventure!.fields[objField].location = "empty_field";
    state.adventure!.fields[objField].blackCube = true;
    state.adventure!.fields[nearJoin].location = "hill_fort";
    state.adventure!.fields[nearJoin].blackCube = false;
    const dfBack = objectiveDistanceField(state, hero, [
      { spaceId: nearJoin, kind: "visitable" },
    ]);
    expect(dfBack.get(entrance)).toBeDefined();
    // Exit is NOT entrance+1 via reverse teleport (one-way); pure walk is longer.
    expect(dfBack.get(exit)).toBeGreaterThan(dfBack.get(entrance)! + 1);
  });

  it("routes a Monolith/Whirlpool teleport to the destination NEAREST the march objective; CONTROL: no objective ⇒ first-index tie", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    neutralizeObjectives(state);
    const doorway = homeDoorway(state, hero);
    // A corridor with the objective at the FAR end; a token near it, one far.
    const arm = buildArm(state, doorway, 6, false);
    const objField = arm[arm.length - 1];
    state.adventure!.fields[objField].location = "hill_fort";
    state.adventure!.fields[objField].blackCube = false;
    const nearToken = arm[arm.length - 2]; // distance 1 from the objective
    const farToken = arm[0]; // distance 5 from the objective

    // The token-travel CHOOSE_ONE the engine opens: option 0 = far, option 1 = near.
    state.adventure!.pendingVisit = {
      playerId: "p2",
      heroId: hero.id,
      fieldId: hero.spaceId!,
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Monolith — choose where to travel",
          options: [
            {
              label: "far",
              steps: [
                { type: "TELEPORT_HERO", heroId: hero.id, spaceId: farToken },
              ],
            },
            {
              label: "near",
              steps: [
                { type: "TELEPORT_HERO", heroId: hero.id, spaceId: nearToken },
              ],
            },
          ],
        },
      ],
    } as NonNullable<GameState["adventure"]>["pendingVisit"];

    const scoreOpt = (optionIndex: number): number => {
      const scored = scoreMapAction(observe(state), {
        type: "RESOLVE_VISIT_STEP",
        playerId: "p2",
        optionIndex,
      });
      if (!scored) throw new Error("teleport option should be scored");
      return scored.score;
    };
    // The near token lands closer to the objective, so it outranks the far one —
    // NOT the engine's first-listed (far) option.
    expect(scoreOpt(1)).toBeGreaterThan(scoreOpt(0));

    // CONTROL: remove the objective. With no plan to advance, both destinations
    // score identically, so the engine's first-index token wins by order alone —
    // proving objective proximity, not the fix's presence, ordered the picks.
    state.adventure!.fields[objField].blackCube = true;
    state.adventure!.fields[objField].location = "empty_field";
    expect(scoreOpt(0)).toBe(scoreOpt(1));
  });

  it("stashes a high-tier combat Spell into the Spell Book; CONTROL: junk (D-tier) and map Spells are not", () => {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    // Uncrowded hand: isolate the tier/combat-only signal from hand-slot relief,
    // so a map Spell falls to the plain "keep ready" path (not crowded relief).
    state.players.p2.hand = [];
    const stash = (cardId: string) => {
      const scored = scoreMapAction(observe(state), {
        type: "MOVE_SPELL_TO_SPELL_BOOK",
        playerId: "p2",
        cardId,
      });
      if (!scored) throw new Error("stash should be scored");
      return scored;
    };
    // An S-tier combat-only Spell (Berserk) is the prime Book candidate — bank it
    // crown-free for the next fight.
    const berserk = stash("spell.berserk");
    expect(berserk.policy).toBe("card.stash-high-tier-spell-crown-free");

    // CONTROL 1: a D-tier junk Spell (Inferno) the AI would never cast is NOT
    // stashed — kept out of the Book, scored far below the high-tier stash.
    const inferno = stash("spell.inferno");
    expect(inferno.policy).toBe("card.dont-stash-junk-spell");
    expect(berserk.score).toBeGreaterThan(inferno.score + 100);

    // CONTROL 2: an S-tier MAP Spell (Town Portal) the AI could cast THIS turn is
    // left ready in hand (an uncrowded hand), not buried in the Book.
    const townPortal = stash("spell.town_portal");
    expect(townPortal.policy).toBe("card.keep-spell-ready");
    expect(berserk.score).toBeGreaterThan(townPortal.score);
  });
});

// The designer-border sealing "lock" is disabled for now
// (DESIGNER_BORDER_SEALING_ENABLED), so a designed border no longer
// severs the AI's pathing — this spec runs only when the lock is re-armed.
(DESIGNER_BORDER_SEALING_ENABLED ? describe : describe.skip)("computer pathing respects designer-placed yellow borders", () => {
  // The march / distance field walks via canCrossEdge, so a designed border it
  // inherits automatically — this pins it: the AI cannot route a step across a
  // designer-placed yellow border (CONTROL: the same layout without the border
  // is a direct one-step reach).
  const OPEN = "F23"; // fully-open tile (no printed seals / blocked / internal)

  function twoTileField(): {
    state: GameState;
    hero: HeroState;
    from: MapFieldState;
    to: MapFieldState;
    a: ReturnType<typeof instantiateTile>;
  } {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "nav-designed-border",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
    });
    const adventure = state.adventure!;
    const O = { row: 40, col: 30 };
    const a = instantiateTile(adventure, OPEN, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adventure.tiles).some(
          (t) => t.centerRow === candidate.row && t.centerCol === candidate.col,
        ),
    )!;
    const b = instantiateTile(adventure, OPEN, neighbor, 0, false);
    // Find a field of A adjacent to a field of B — the shared doorway.
    let from: MapFieldState | undefined;
    let to: MapFieldState | undefined;
    for (const candidate of Object.values(adventure.fields)) {
      if (candidate.tileInstanceId !== a.id) {
        continue;
      }
      const coord = parseHexSpaceId(candidate.spaceId)!;
      for (let direction = 0; direction < 6; direction += 1) {
        const other = adventure.fields[hexSpaceId(hexNeighbor(coord, direction))];
        if (other && other.tileInstanceId === b.id) {
          from = candidate;
          to = other;
          break;
        }
      }
      if (from) {
        break;
      }
    }
    const hero: HeroState = { ...Object.values(state.heroes)[0], spaceId: from!.spaceId, controllerId: "p1" };
    return { state, hero, from: from!, to: to!, a };
  }

  it("the distance field does not route the march across a designed border", () => {
    // CONTROL: with both arcs open the objective is one step from the hero.
    const control = twoTileField();
    expect(distanceFromHeroTo(control.state, control.hero, control.to.spaceId)).toBe(1);

    // With a designed border sealing the hero's outgoing arc, the direct step is
    // gone — the objective is no longer a 1-step reach (here fully cut off).
    const blocked = twoTileField();
    blocked.a.extraBorders = [slotDirection(blocked.from.slot, blocked.a.rotation)!];
    expect(distanceFromHeroTo(blocked.state, blocked.hero, blocked.to.spaceId)).not.toBe(1);

    // And the objective cell itself is still a valid source (distance 0), so the
    // change is the SEVERED edge, not a broken objective set.
    const field = objectiveDistanceField(blocked.state, blocked.hero, [
      { spaceId: blocked.to.spaceId, kind: "visitable" },
    ]);
    expect(field.get(blocked.to.spaceId)).toBe(0);
    expect(field.get(blocked.from.spaceId)).not.toBe(1);
  });

  it("the distance field does not route the march across a single per-EDGE border", () => {
    // The per-edge system (the designer's forward path) also flows through
    // canCrossEdge, so the AND pathing inherits it with no separate logic.
    // CONTROL: with the edge open the objective is one step from the hero.
    const control = twoTileField();
    expect(distanceFromHeroTo(control.state, control.hero, control.to.spaceId)).toBe(1);

    // Seal EXACTLY the from→to hex edge with a per-edge border (one canonical
    // code) — the direct step is gone.
    const blocked = twoTileField();
    const dir = hexDirectionBetween(
      parseHexSpaceId(blocked.from.spaceId)!,
      parseHexSpaceId(blocked.to.spaceId)!,
    )!;
    const footprintIndex = slotDirection(blocked.from.slot, blocked.a.rotation)! + 1;
    blocked.a.borderEdges = [canonicalTileEdgeCode(footprintIndex, dir)];
    expect(distanceFromHeroTo(blocked.state, blocked.hero, blocked.to.spaceId)).not.toBe(1);
  });
});

describe("computer pathing respects the UNDERGROUND layer divide", () => {
  // The march / distance field walks via canCrossEdge, which enforces the
  // Surface↔Underground divide (a designer-flagged tile is on the cavern layer).
  // Without a gate, the AI cannot route a step across a flagged↔Surface boundary
  // — same inheritance as the yellow-border case above.
  const OPEN = "F23"; // fully-open tile (no printed seals / blocked / internal)

  function twoTiles(flagUnderground: boolean): {
    state: GameState;
    hero: HeroState;
    to: MapFieldState;
  } {
    const state = createAdventureGameState({ startingBuildings: [],
      seed: "nav-underground-divide",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
    });
    const adventure = state.adventure!;
    const O = { row: 40, col: 30 };
    const a = instantiateTile(adventure, OPEN, O, 0, false);
    const neighbor = tileLatticeNeighbors(O).find(
      (candidate) =>
        !Object.values(adventure.tiles).some(
          (t) => t.centerRow === candidate.row && t.centerCol === candidate.col,
        ),
    )!;
    const b = instantiateTile(adventure, OPEN, neighbor, 0, false);
    if (flagUnderground) {
      // Exactly what setup writes for a designer `plan.underground` flag: tile B
      // moves onto the cavern layer, so the shared boundary is a sealed divide.
      b.underground = true;
    }
    // The shared doorway: a field of A adjacent to a field of B.
    let from: MapFieldState | undefined;
    let to: MapFieldState | undefined;
    for (const candidate of Object.values(adventure.fields)) {
      if (candidate.tileInstanceId !== a.id) {
        continue;
      }
      const coord = parseHexSpaceId(candidate.spaceId)!;
      for (let direction = 0; direction < 6; direction += 1) {
        const other = adventure.fields[hexSpaceId(hexNeighbor(coord, direction))];
        if (other && other.tileInstanceId === b.id) {
          from = candidate;
          to = other;
          break;
        }
      }
      if (from) {
        break;
      }
    }
    const hero: HeroState = { ...Object.values(state.heroes)[0], spaceId: from!.spaceId, controllerId: "p1" };
    return { state, hero, to: to! };
  }

  it("the distance field does not route the march across a sealed flagged↔Surface boundary (CONTROL: one step when unflagged)", () => {
    // CONTROL: both tiles Surface → the objective is one step from the hero.
    const control = twoTiles(false);
    expect(distanceFromHeroTo(control.state, control.hero, control.to.spaceId)).toBe(1);

    // Flag tile B underground → the boundary is a layer divide with no gate, so
    // the AND pathing (via canCrossEdge) cannot step across it — no 1-step reach.
    const blocked = twoTiles(true);
    expect(distanceFromHeroTo(blocked.state, blocked.hero, blocked.to.spaceId)).not.toBe(1);
  });
});

describe("computer tile rotation chases the NEEDED resource payoff", () => {
  /**
   * A test tile split by internal borders into two pockets — cluster A
   * (center + slots 1-3) carrying the payoff field at slot 2, cluster B
   * (slots 4-6) all empty. A rotation whose hero-facing slots are all in
   * cluster A can reach the payoff; one facing only cluster B cannot. The
   * NEED-weighting claim: the payoff rotation's edge over the empty rotation
   * must GROW when the seat actually lacks that resource
   * (premiumEconomyResourceBonus / the materials-short branch in
   * tileHeroEntryScore). Removing the payoff loop or its need term makes the
   * two deltas equal and fails these tests.
   */
  function rotationDeltaWith(
    payoffField: Record<string, unknown>,
    setResources: (state: GameState) => void,
  ): number {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    setResources(state);

    let center: { row: number; col: number } | undefined;
    for (const field of Object.values(state.adventure!.fields)) {
      hero.spaceId = field.spaceId;
      center = farTilePlacementCenters(state, hero)[0];
      if (center) break;
    }
    expect(center, "the starting map exposes a placeable outer notch").toBeDefined();

    const testDefId = "TEST_AI_RESOURCE_ROTATION";
    allTileDefinitions[testDefId] = {
      id: testDefId,
      group: "far",
      content: "core_game",
      terrain: "grass",
      fields: Array.from({ length: 7 }, (_, slot) =>
        slot === 2 ? { location: "mine", ...payoffField } : { location: "empty_field" },
      ),
      outerImpassable: [false, false, false, false, false, false],
      // Wall cluster B (4-6) off from cluster A (0-3): the payoff at slot 2 is
      // reachable only through a cluster-A entrance.
      internalBorders: [
        [3, 4], [6, 1], [0, 4], [0, 5], [0, 6],
      ],
      source: { product: "test", credit: "test" },
    } as (typeof allTileDefinitions)[string];

    try {
      const tile = {
        id: "ai-resource-rotation-tile",
        tileDefId: testDefId,
        centerRow: center!.row,
        centerCol: center!.col,
        rotation: 0,
        faceDown: false,
        group: "far" as const,
        awaitingRotation: true,
      };
      state.adventure!.tiles[tile.id] = tile;
      state.adventure!.pendingTileChoice = {
        tileInstanceId: tile.id,
        playerId: "p2",
        kind: "place",
        heroId: hero.id,
      };

      const heroNeighbors = new Set(getAdjacentSpaceIds(hero.spaceId!));
      const adjacentSlots = (rotation: number): number[] =>
        tileFootprint(center!, rotation)
          .map((cell, slot) => ({ id: hexSpaceId(cell), slot }))
          .filter((entry) => heroNeighbors.has(entry.id))
          .map((entry) => entry.slot);
      const rotations = [0, 1, 2, 3, 4, 5].filter((rotation) =>
        canHeroReachPlacedTile(state, hero, testDefId, center!, rotation),
      );
      const payoffRotation = rotations.find((rotation) => {
        const slots = adjacentSlots(rotation);
        return (
          slots.length > 0 && slots.every((slot) => slot >= 1 && slot <= 3)
        );
      });
      const emptyRotation = rotations.find((rotation) => {
        const slots = adjacentSlots(rotation);
        return slots.length > 0 && slots.every((slot) => slot >= 4);
      });
      expect(payoffRotation).toBeDefined();
      expect(emptyRotation).toBeDefined();

      const scoreOf = (rotation: number) =>
        scoreMapAction(observe(state), {
          type: "SET_TILE_ROTATION",
          playerId: "p2",
          tileInstanceId: tile.id,
          rotation,
        })!.score;
      return scoreOf(payoffRotation!) - scoreOf(emptyRotation!);
    } finally {
      delete allTileDefinitions[testDefId];
    }
  }

  it("a valuables ('crystal') mine pulls the rotation harder while valuables are SHORT", () => {
    const valuablesMine = { resource: "valuables", difficulty: 1 };
    const deltaNeed = rotationDeltaWith(valuablesMine, (state) => {
      state.players.p2.resources = { gold: 30, buildingMaterials: 5, valuables: 0 };
    });
    const deltaFlush = rotationDeltaWith(valuablesMine, (state) => {
      state.players.p2.resources = { gold: 30, buildingMaterials: 5, valuables: 20 };
    });
    expect(deltaNeed).toBeGreaterThan(deltaFlush);
    // The payoff rotation must dominate outright when the resource is needed.
    expect(deltaNeed).toBeGreaterThan(40);
  });

  it("an ordinary materials mine counts too while the next dwelling still needs materials", () => {
    const materialsMine = { resource: "buildingMaterials", difficulty: 1 };
    const deltaNeed = rotationDeltaWith(materialsMine, (state) => {
      state.players.p2.resources = { gold: 30, buildingMaterials: 0, valuables: 2 };
    });
    const deltaFlush = rotationDeltaWith(materialsMine, (state) => {
      state.players.p2.resources = { gold: 30, buildingMaterials: 20, valuables: 2 };
    });
    expect(deltaNeed).toBeGreaterThan(deltaFlush);
  });
});

describe("fallback staging — the hero never just stands still when outmatched", () => {
  /**
   * Surgery on the real nav-map: every payoff is exhausted (visitables
   * black-cubed, flaggables/towns already ours, no face-down tile, no Ⅱ–Ⅲ
   * supply) and every remaining guard is difficulty 6 — far above a level-1
   * hero with no army. The OLD objective list came back empty, so the hero
   * ended every turn in place. The staging fallback must list those future
   * fights, march the hero adjacent, and still refuse the hopeless entry.
   */
  function exhaustedMap(): { state: GameState; hero: HeroState } {
    const state = game();
    const hero = p2Hero(state);
    hero.level = 1;
    state.round = 2;
    state.players.p2.army = [];
    state.players.p2.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    for (const field of Object.values(state.adventure!.fields)) {
      const category = locationDefinitions[field.location]?.category;
      if (isFieldGuardedForTest(field)) {
        field.difficulty = 6;
        continue;
      }
      if (category === "visitable" || category === "revisitable") {
        field.blackCube = true;
      }
      if (category === "town" && field.flagOwnerId !== "p2") {
        // Neutralize foreign/unowned towns (a conquest victory objective
        // would keep the pool non-empty) WITHOUT reflagging them — a second
        // p2-flagged town would confuse homeTileInstanceId.
        field.location = "empty_field";
        field.flagOwnerId = null;
        continue;
      }
      if (category === "flaggable" && field.flagOwnerId !== "p2") {
        field.flagOwnerId = "p2";
        field.everFlagged = true;
      }
    }
    for (const tile of Object.values(state.adventure!.tiles)) {
      tile.faceDown = false;
    }
    state.adventure!.playerFarTiles.p2 = [];
    state.adventure!.farTilePool = [];
    return { state, hero };
  }

  function isFieldGuardedForTest(field: MapFieldState): boolean {
    return Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
  }

  it("lists the unbeatable guards as staging targets instead of an empty plan", () => {
    const { state, hero } = exhaustedMap();
    const objectives = collectMapObjectives(state, hero);
    expect(objectives.length).toBeGreaterThan(0);
    expect(objectives.every((objective) => objective.kind === "guard")).toBe(true);
    expect(primaryMapObjective(state, hero, objectives)).not.toBeNull();
  });

  it("marches toward the staged fight but refuses the hopeless entry", () => {
    const { state, hero } = exhaustedMap();
    // Two steps out from the difficulty-6 home mine: the march step (via the
    // town) must beat END_TURN (300); the entry itself stays blocked (250).
    hero.spaceId = RESOURCE;
    expect(moveScoreTo(state, hero, TOWN)).toBeGreaterThan(300);
    hero.spaceId = TOWN;
    expect(moveScoreTo(state, hero, MINE)).toBeLessThanOrEqual(250);
  });

  it("CONTROL: one beatable guard suppresses staging entirely", () => {
    const { state, hero } = exhaustedMap();
    const mine = state.adventure!.fields[MINE];
    mine.difficulty = 1; // level-1 hero covers it again
    const objectives = collectMapObjectives(state, hero);
    expect(objectives.some((objective) => objective.spaceId === MINE)).toBe(true);
    expect(objectives.some((objective) => objective.spaceId === TREASURE)).toBe(false);
  });

  it("CONTROL: a secondary hero never stages at fights it will not take", () => {
    const { state } = exhaustedMap();
    const hero = p2Hero(state);
    const secondary: HeroState = { ...hero, id: "sec1", kind: "secondary" };
    state.heroes[secondary.id] = secondary;
    expect(collectMapObjectives(state, secondary)).toEqual([]);
  });
});

describe("enter-first-opened-tile boost — safe entries only", () => {
  /**
   * The 930 `map.enter-first-opened-tile` boost bypasses moveScore's whole
   * objective/can-beat read, so it must never point the opening hero at a
   * fight it cannot cover: a beaten hero falls back to the home town, where
   * the same boost re-arms next turn — a repeated-suicide loop for the whole
   * rounds-≤3 window. An unsafe entry falls through to the normal scoring
   * (which refuses an unbeatable guard below END_TURN).
   */
  function placedTileEntry(seed: string) {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
    });
    const hero = p2Hero(state);
    hero.level = 1;
    hero.spaceId = TOWN; // on the home tile
    const homeTile = state.adventure!.fields[TOWN].tileInstanceId;
    const center = tileLatticeNeighbors(
      parseHexSpaceId(
        hexSpaceId({
          row: state.adventure!.tiles[homeTile].centerRow,
          col: state.adventure!.tiles[homeTile].centerCol,
        }),
      )!,
    ).find(
      (candidate) =>
        !Object.values(state.adventure!.tiles).some(
          (tile) => tile.centerRow === candidate.row && tile.centerCol === candidate.col,
        ),
    )!;
    const placed = instantiateTile(state.adventure!, "F23", center, 0, false);
    state.eventLog.push({
      id: "evt_test_tile_placed",
      type: "TILE_PLACED",
      playerId: "p2",
      tileInstanceId: placed.id,
      tileDefId: placed.tileDefId,
      centerRow: center.row,
      centerCol: center.col,
      rotation: 0,
    } as GameState["eventLog"][number]);
    const entry = hexSpaceId(center);
    return { state, hero, entry };
  }

  it("boosts stepping into the freshly placed tile (unguarded entry)", () => {
    const { state, hero, entry } = placedTileEntry("enter-opened-safe");
    const scored = scoreMapAction(observe(state), {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: hero.id,
      to: entry,
    });
    expect(scored?.policy).toBe("map.enter-first-opened-tile");
    expect(scored?.score).toBe(930);
  });

  it("never boosts onto an entry guard the hero cannot beat (falls back to moveScore)", () => {
    const { state, hero, entry } = placedTileEntry("enter-opened-guarded");
    state.adventure!.fields[entry].difficulty = 5; // far above a level-1 hero
    const scored = scoreMapAction(observe(state), {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: hero.id,
      to: entry,
    });
    expect(scored?.policy).not.toBe("map.enter-first-opened-tile");
    // The normal objective scoring refuses the unbeatable fight below END_TURN.
    expect(scored!.score).toBeLessThan(300);
  });

  it("never boosts onto an enemy hero standing on the entry hex", () => {
    const { state, hero, entry } = placedTileEntry("enter-opened-enemy");
    const enemy = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main",
    )!;
    enemy.spaceId = entry;
    const scored = scoreMapAction(observe(state), {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: hero.id,
      to: entry,
    });
    expect(scored?.policy).not.toBe("map.enter-first-opened-tile");
  });

  it("CONTROL: a BEATABLE entry guard keeps the boost", () => {
    const { state, hero, entry } = placedTileEntry("enter-opened-beatable");
    state.adventure!.fields[entry].difficulty = 1; // the level covers it
    const scored = scoreMapAction(observe(state), {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: hero.id,
      to: entry,
    });
    expect(scored?.policy).toBe("map.enter-first-opened-tile");
  });
});

/**
 * USER REPORT (single-player opening): "pls make AI always rotate tile I so that
 * they can access and open tile II-III next … right now still stupid and flip
 * tiles they can't get in after tile I (like flip tile IV-V or VI-VII)."
 *
 * Two independent gaps, both reproduced before the fix:
 *  1. the round-1 home rotation was scored BAND-BLIND — `tileRotationDoorwayScore`
 *     rewards an open arc facing ANY face-down tile, so a Ⅵ–Ⅶ frontier counted
 *     exactly like a Ⅱ–Ⅲ one, and the Ⅱ–Ⅲ SUPPLY placement was invisible to it;
 *  2. `map.discover-tile` scored a Ⅵ–Ⅶ CENTER tile at 640 for a LEVEL-2 hero —
 *     measured on 6 of 8 fixed seeds (round 2 placed a Ⅱ–Ⅲ tile, round 3 flipped
 *     a center tile), which is the reported behaviour verbatim.
 */
describe("computer opening: tile Ⅰ rotation and Ⅱ–Ⅲ-first discovery", () => {
  /** A synthetic tile def with exactly ONE open outer arc (slot 1). */
  function oneArcDef(
    id: string,
    group: "starting" | "far" | "near",
    /** Optional printed internal lines — used to POCKET the open arc's hex. */
    internalBorders?: Array<[number, number]>,
  ) {
    return {
      id,
      group,
      content: "core_game" as const,
      terrain: "grass" as const,
      fields: Array.from({ length: 7 }, () => ({ location: "empty_field" })),
      outerImpassable: [false, true, true, true, true, true],
      ...(internalBorders ? { internalBorders } : {}),
      source: { product: "test", credit: "test" },
    };
  }

  /** Lattice centers that TOUCH `center` without overlapping it or each other. */
  function touchingCenters(
    center: { row: number; col: number },
    count: number,
  ): Array<{ row: number; col: number }> {
    const footprint = new Set(
      tileFootprint(center, 0).map((cell) => hexSpaceId(cell)),
    );
    const found: Array<{ row: number; col: number }> = [];
    const taken = new Set<string>();
    for (let dRow = -4; dRow <= 4 && found.length < count; dRow += 1) {
      for (let dCol = -4; dCol <= 4 && found.length < count; dCol += 1) {
        const candidate = { row: center.row + dRow, col: center.col + dCol };
        const cells = tileFootprint(candidate, 0).map((cell) => hexSpaceId(cell));
        if (cells.some((cell) => footprint.has(cell) || taken.has(cell))) continue;
        if (
          !cells.some((cell) =>
            getAdjacentSpaceIds(cell).some((id) => footprint.has(id)),
          )
        ) {
          continue;
        }
        for (const cell of cells) taken.add(cell);
        found.push(candidate);
      }
    }
    return found;
  }

  /**
   * A p2 home (Ⅰ) tile with ONE open arc, awaiting its round-1 rotation, in an
   * empty corner of the map so nothing else touches it. `neighbourGroups` are
   * dropped as face-down tiles of those bands. No Ⅱ–Ⅲ supply, so ONLY the
   * "discover a Ⅱ–Ⅲ tile" half can qualify a rotation.
   */
  function homeRotationFixture(
    neighbourGroups: Array<"far" | "near">,
    internalBorders?: Array<[number, number]>,
  ) {
    const state = game();
    const hero = p2Hero(state);
    const defId = "TEST_AI_HOME_ROTATION_DOORWAY";
    allTileDefinitions[defId] = oneArcDef(defId, "starting", internalBorders) as never;
    const center = { row: 30, col: 30 };
    const tile = {
      id: "ai-home-rotation-tile",
      tileDefId: defId,
      centerRow: center.row,
      centerCol: center.col,
      rotation: 0,
      faceDown: false,
      group: "starting" as const,
      awaitingRotation: true,
    };
    state.adventure!.tiles[tile.id] = tile;
    materializeTileFields(state.adventure!, tile);
    hero.spaceId = hexSpaceId(center);
    state.adventure!.pendingTileChoice = {
      tileInstanceId: tile.id,
      playerId: "p2",
      kind: "starting",
    };
    // No Ⅱ–Ⅲ supply tile: the placement half of the doorway test is off, so the
    // ONLY way a rotation qualifies is an open arc facing a face-down Ⅱ–Ⅲ tile.
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const spots = touchingCenters(center, neighbourGroups.length);
    expect(spots.length).toBe(neighbourGroups.length);
    const neighbours = neighbourGroups.map((group, index) => {
      const neighbour = {
        id: `ai-rotation-neighbour-${index}`,
        tileDefId: "N1",
        centerRow: spots[index].row,
        centerCol: spots[index].col,
        rotation: 0,
        faceDown: true,
        group,
      };
      state.adventure!.tiles[neighbour.id] = neighbour;
      return neighbour;
    });
    /** The one open arc's hex at `rotation`. */
    const arcCell = (rotation: number) =>
      hexSpaceId(tileFootprint(center, rotation)[1]);
    const facesTile = (rotation: number, neighbour: (typeof neighbours)[number]) => {
      const cells = new Set(
        tileFootprint(
          { row: neighbour.centerRow, col: neighbour.centerCol },
          0,
        ).map((cell) => hexSpaceId(cell)),
      );
      return getAdjacentSpaceIds(arcCell(rotation)).some((id) => cells.has(id));
    };
    const scoreOf = (rotation: number) =>
      scoreMapAction(observe(state), {
        type: "SET_TILE_ROTATION",
        playerId: "p2",
        tileInstanceId: tile.id,
        rotation,
      })!.score;
    return { state, hero, tile, neighbours, facesTile, scoreOf, defId };
  }

  it("rotates tile Ⅰ so a Ⅱ–Ⅲ tile can be opened next, not a Ⅳ–Ⅴ one", () => {
    const fixture = homeRotationFixture(["far", "near"]);
    try {
      const { state, hero, tile, neighbours, facesTile, scoreOf } = fixture;
      const rotations = [0, 1, 2, 3, 4, 5];
      const farRotation = rotations.find((rotation) =>
        facesTile(rotation, neighbours[0]),
      );
      const nearRotation = rotations.find(
        (rotation) =>
          facesTile(rotation, neighbours[1]) && !facesTile(rotation, neighbours[0]),
      );
      expect(farRotation, "a rotation must face the Ⅱ–Ⅲ neighbour").toBeDefined();
      expect(nearRotation, "a rotation must face the Ⅳ–Ⅴ neighbour only").toBeDefined();

      // The DOORWAY PROPERTY itself: only the Ⅱ–Ⅲ-facing rotation lets the hero
      // open Ⅱ–Ⅲ land next — decided by the LIVE discovery gate, not a copy.
      expect(
        startTileRotationOpensFarExpansion(state, tile, farRotation!, hero),
      ).toBe(true);
      expect(
        startTileRotationOpensFarExpansion(state, tile, nearRotation!, hero),
      ).toBe(false);

      // And the POLICY follows it: the gap dwarfs the whole band-blind doorway
      // spread (max 45), so the Ⅱ–Ⅲ rotation is picked, not merely preferred.
      expect(scoreOf(farRotation!) - scoreOf(nearRotation!)).toBeGreaterThan(200);
      const best = rotations.reduce((a, b) => (scoreOf(b) > scoreOf(a) ? b : a));
      expect(facesTile(best, neighbours[0])).toBe(true);
    } finally {
      delete allTileDefinitions[fixture.defId];
    }
  });

  it("CONTROL: with no Ⅱ–Ⅲ route at all, the old tiebreaks still decide (no stall)", () => {
    const fixture = homeRotationFixture(["near"]);
    try {
      const { state, hero, tile, scoreOf } = fixture;
      const rotations = [0, 1, 2, 3, 4, 5];
      // Nothing qualifies — no Ⅱ–Ⅲ neighbour, no supply tile.
      for (const rotation of rotations) {
        expect(
          startTileRotationOpensFarExpansion(state, tile, rotation, hero),
        ).toBe(false);
      }
      // …so the new term contributes nothing and the pre-existing tiebreaks
      // decide: the whole spread stays far below the 240 doorway bonus.
      const scores = rotations.map(scoreOf);
      expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(240);
      // NEVER a stall: a rotation is still legal and the engine accepts it.
      const best = rotations.reduce((a, b) => (scoreOf(b) > scoreOf(a) ? b : a));
      expect(() =>
        applyAction(state, {
          type: "SET_TILE_ROTATION",
          playerId: "p2",
          tileInstanceId: tile.id,
          rotation: best,
        }),
      ).not.toThrow();
    } finally {
      delete allTileDefinitions[fixture.defId];
    }
  });

  it("CONTROL: a doorway the hero cannot WALK to does not count", () => {
    // The one open arc is pocketed off by printed internal lines, so the hex is
    // a doorway on paper the hero can never stand on. Sealing centre↔1, 1↔2 and
    // 1↔6 isolates it inside the flower.
    const fixture = homeRotationFixture(
      ["far", "near"],
      [
        [0, 1],
        [1, 2],
        [1, 6],
      ],
    );
    try {
      const { state, hero, tile, neighbours, facesTile, scoreOf } = fixture;
      const rotations = [0, 1, 2, 3, 4, 5];
      const farRotation = rotations.find((rotation) =>
        facesTile(rotation, neighbours[0]),
      )!;
      for (const rotation of rotations) {
        expect(
          startTileRotationOpensFarExpansion(state, tile, rotation, hero),
          `rotation ${rotation} should not count a pocketed arc`,
        ).toBe(false);
      }
      const nearRotation = rotations.find(
        (rotation) =>
          facesTile(rotation, neighbours[1]) && !facesTile(rotation, neighbours[0]),
      )!;
      expect(scoreOf(farRotation) - scoreOf(nearRotation)).toBeLessThan(240);
    } finally {
      delete allTileDefinitions[fixture.defId];
    }
  });

  it("CONTROL: when EVERY rotation qualifies the term cannot decide anything", () => {
    // The stock map: a Ⅱ–Ⅲ supply tile can be dropped from some home hex in any
    // orientation, so the bonus is a constant and the old tiebreak still picks.
    const state = game();
    const hero = p2Hero(state);
    const homeTileId = state.adventure!.fields[hero.spaceId!].tileInstanceId;
    const tile = state.adventure!.tiles[homeTileId];
    state.adventure!.pendingTileChoice = {
      tileInstanceId: tile.id,
      playerId: "p2",
      kind: "starting",
    };
    const rotations = [0, 1, 2, 3, 4, 5];
    for (const rotation of rotations) {
      expect(
        startTileRotationOpensFarExpansion(state, tile, rotation, hero),
        `rotation ${rotation} should keep a Ⅱ–Ⅲ doorway on the stock map`,
      ).toBe(true);
    }
    const scores = rotations.map(
      (rotation) =>
        scoreMapAction(observe(state), {
          type: "SET_TILE_ROTATION",
          playerId: "p2",
          tileInstanceId: tile.id,
          rotation,
        })!.score,
    );
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(240);
  });

  it("CONTROL: a NON-starting tile rotation is untouched by the Ⅱ–Ⅲ term", () => {
    // A placed/revealed Ⅱ–Ⅲ or Ⅳ–Ⅴ tile keeps its easiest-entrance + payoff
    // ordering: the bonus is scoped to `pendingTileChoice.kind === "starting"`.
    const fixture = homeRotationFixture(["far", "near"]);
    try {
      const { state, hero, tile, neighbours, facesTile, scoreOf } = fixture;
      const rotations = [0, 1, 2, 3, 4, 5];
      const farRotation = rotations.find((rotation) =>
        facesTile(rotation, neighbours[0]),
      )!;
      const nearRotation = rotations.find(
        (rotation) =>
          facesTile(rotation, neighbours[1]) && !facesTile(rotation, neighbours[0]),
      )!;
      // The doorway PROPERTY is true either way (a pure geometric read)…
      expect(startTileRotationOpensFarExpansion(state, tile, farRotation, hero)).toBe(
        true,
      );
      // …and on the round-1 home rotation it is worth the full bonus…
      const startingGap = scoreOf(farRotation) - scoreOf(nearRotation);
      expect(startingGap).toBeGreaterThan(200);
      // …but flipping the SAME tile to a plain reveal removes it entirely, so a
      // placed/revealed tile keeps its own easiest-entrance + payoff ordering.
      state.adventure!.pendingTileChoice = {
        tileInstanceId: tile.id,
        playerId: "p2",
        kind: "reveal",
      };
      const revealGap = scoreOf(farRotation) - scoreOf(nearRotation);
      expect(startingGap - revealGap).toBeGreaterThan(200);
    } finally {
      delete allTileDefinitions[fixture.defId];
    }
  });

  /**
   * Park the hero where an EXISTING face-down Ⅳ–Ⅴ / Ⅵ–Ⅶ tile is discoverable and
   * drop a synthetic face-down Ⅱ–Ⅲ tile so BOTH are discoverable from there.
   */
  function bothBandsDiscoverable(state: GameState) {
    const hero = p2Hero(state);
    // Home objectives out of the way so `map.finish-home-before-discover` (100)
    // cannot mask the band rule.
    for (const field of Object.values(state.adventure!.fields)) {
      const category = locationDefinitions[field.location]?.category;
      if (category === "flaggable" && field.flagOwnerId !== "p2") {
        field.flagOwnerId = "p2";
        field.everFlagged = true;
        delete field.difficulty;
      }
      if (category === "visitable" && !field.blackCube) field.blackCube = true;
    }
    state.round = 5;
    const highBand = parkAtOpenDiscoveryDoorway(state, hero);
    expect(highBand.group).not.toBe("far");
    const heroCoord = parseHexSpaceId(hero.spaceId!)!;
    let farTile: MapTileState | undefined;
    for (let dRow = -4; dRow <= 4 && !farTile; dRow += 1) {
      for (let dCol = -4; dCol <= 4 && !farTile; dCol += 1) {
        const candidate = { row: heroCoord.row + dRow, col: heroCoord.col + dCol };
        const cells = tileFootprint(candidate, 0).map((cell) => hexSpaceId(cell));
        if (cells.some((cell) => state.adventure!.fields[cell])) continue;
        if (
          Object.values(state.adventure!.tiles).some((other) =>
            tileFootprint({ row: other.centerRow, col: other.centerCol }, 0).some(
              (cell) => cells.includes(hexSpaceId(cell)),
            ),
          )
        ) {
          continue;
        }
        if (!cells.some((cell) => getAdjacentSpaceIds(cell).includes(hero.spaceId!))) {
          continue;
        }
        farTile = {
          id: "ai-band-far-tile",
          tileDefId: "N1",
          centerRow: candidate.row,
          centerCol: candidate.col,
          rotation: 0,
          faceDown: true,
          group: "far",
        };
        state.adventure!.tiles[farTile.id] = farTile;
      }
    }
    expect(farTile, "a free lattice slot beside the hero should exist").toBeDefined();
    return { state, hero, highBand, farTile: farTile! };
  }

  const discoverScore = (state: GameState, heroId: string, tileId: string) =>
    scoreMapAction(observe(state), {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId,
      tileInstanceId: tileId,
    })!;

  it("flips the Ⅱ–Ⅲ tile, never the Ⅳ+ tile it cannot fight yet", () => {
    const { state, hero, highBand, farTile } = bothBandsDiscoverable(game());
    hero.level = 2; // below every Ⅳ–Ⅴ (4) and Ⅵ–Ⅶ (6) printed guard
    // Fixture sanity: the engine really offers BOTH discoveries right now.
    expect(canHeroDiscoverAdjacentTile(state, hero, highBand)).toBe(true);
    expect(canHeroDiscoverAdjacentTile(state, hero, farTile)).toBe(true);

    const high = discoverScore(state, hero.id, highBand.id);
    const far = discoverScore(state, hero.id, farTile.id);
    expect(high.policy).toBe("map.discover-high-band-defer");
    expect(high.score).toBe(100);
    expect(far.score).toBeGreaterThan(high.score);
    // Observable pick: of the two discoveries the engine offers, the AI takes Ⅱ–Ⅲ.
    const best = [
      { tile: highBand, score: high.score },
      { tile: farTile, score: far.score },
    ].sort((a, b) => b.score - a.score)[0];
    expect(best.tile.id).toBe(farTile.id);
  });

  it("CONTROL: with NO Ⅱ–Ⅲ route left the Ⅳ+ discovery happens normally", () => {
    const { state, hero, highBand, farTile } = bothBandsDiscoverable(game());
    hero.level = 2;
    delete state.adventure!.tiles[farTile.id];
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const scored = discoverScore(state, hero.id, highBand.id);
    expect(scored.policy).not.toBe("map.discover-high-band-defer");
    expect(scored.score).toBeGreaterThan(300); // above END_TURN — it really flips it
  });

  it("CONTROL: a hero that OUT-LEVELS the band flips it even with Ⅱ–Ⅲ left", () => {
    const { state, hero, highBand } = bothBandsDiscoverable(game());
    hero.level = 7; // beats every printed guard in every band
    const scored = discoverScore(state, hero.id, highBand.id);
    expect(scored.policy).not.toBe("map.discover-high-band-defer");
    expect(scored.score).toBeGreaterThan(300);
  });

  it("orders simultaneous reveals II–III before IV–V and IV–V before VI–VII without hard-blocking", () => {
    const { state, hero, highBand, farTile } = bothBandsDiscoverable(game());
    // Re-purpose the two simultaneously reachable public backs as Near and
    // Center. No Far supply remains, so the older Far safety rule is inactive.
    highBand.group = "center";
    farTile.group = "near";
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    hero.level = 7; // readiness cannot be the reason Center loses this choice

    const center = discoverScore(state, hero.id, highBand.id);
    const near = discoverScore(state, hero.id, farTile.id);
    expect(center.policy).toBe("map.discover-lower-band-first");
    expect(center.score).toBeGreaterThan(300); // preference, never a stall
    expect(near.score).toBeGreaterThan(center.score);

    // If IV–V is no longer immediately available, VI–VII resumes normally.
    delete state.adventure!.tiles[farTile.id];
    const unblocked = discoverScore(state, hero.id, highBand.id);
    expect(unblocked.policy).not.toBe("map.discover-lower-band-first");
    expect(unblocked.score).toBeGreaterThan(300);
  });

  it("CONTROL: a Ⅱ–Ⅲ tile is NEVER deferred by the band rule", () => {
    const { state, hero, farTile } = bothBandsDiscoverable(game());
    hero.level = 1; // below the Ⅱ–Ⅲ band's own printed guard (2) as well
    const scored = discoverScore(state, hero.id, farTile.id);
    expect(scored.policy).not.toBe("map.discover-high-band-defer");
    expect(scored.score).toBeGreaterThan(300);
  });

  it("reads the band's cheapest printed guard from the shipped catalog", () => {
    // Ⅰ 1 · Ⅱ–Ⅲ 2 · Ⅳ–Ⅴ 4 · Ⅵ–Ⅶ 6 — the mapping the band rule gates on.
    expect(minPrintedGuardDifficultyForBand("starting")).toBe(1);
    expect(minPrintedGuardDifficultyForBand("far")).toBe(2);
    expect(minPrintedGuardDifficultyForBand("near")).toBe(4);
    expect(minPrintedGuardDifficultyForBand("center")).toBe(6);
    expect(minPrintedGuardDifficultyForBand(undefined)).toBe(0);
  });

  it("both rules survive the REDACTED frame the policy really scores against", () => {
    // observeForComputer scores `getPlayerView(state, seat)`, where EVERY
    // playerFarTiles entry — the owner's own included — reads "hidden". A
    // supply read that matches UNOPENED_FAR_TILE is silently false there, so
    // both rules would quietly switch off in real play while passing every
    // raw-state test. Drive them through the real redacted observation.
    const redacted = (state: GameState) => observeForComputer(state, "p2");

    // (1) discovery: the Ⅳ+ defer still fires on the frame the AI sees.
    const discovery = bothBandsDiscoverable(game());
    discovery.hero.level = 2;
    discovery.state.adventure!.playerFarTiles = {
      ...(discovery.state.adventure!.playerFarTiles ?? {}),
      p2: [UNOPENED_FAR_TILE],
    };
    const highBandScore = scoreMapAction(redacted(discovery.state), {
      type: "DISCOVER_TILE",
      playerId: "p2",
      heroId: discovery.hero.id,
      tileInstanceId: discovery.highBand.id,
    })!;
    expect(highBandScore.policy).toBe("map.discover-high-band-defer");

    // (2) rotation: the home tile's Ⅱ–Ⅲ doorway is still seen on that frame.
    const state = game();
    const hero = p2Hero(state);
    const tile =
      state.adventure!.tiles[state.adventure!.fields[hero.spaceId!].tileInstanceId];
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [UNOPENED_FAR_TILE],
    };
    state.adventure!.pendingTileChoice = {
      tileInstanceId: tile.id,
      playerId: "p2",
      kind: "starting",
    };
    const view = getPlayerView(state, "p2") as unknown as GameState;
    const viewHero = Object.values(view.heroes).find(
      (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
    )!;
    expect(
      startTileRotationOpensFarExpansion(
        view,
        view.adventure!.tiles[tile.id],
        0,
        viewHero,
      ),
      "the Ⅱ–Ⅲ supply doorway must be visible through the redacted frame",
    ).toBe(true);
  });

  it("reads the Ⅱ–Ⅲ supply through a REDACTED player view", () => {
    // getPlayerView rewrites every playerFarTiles entry — the owner's too — to
    // "hidden", so `playerHasPlaceableFarTile` is always false on the frame the
    // policy scores against. The mask-safe count is what the rule must use.
    const state = game();
    state.adventure!.playerFarTiles = {
      ...(state.adventure!.playerFarTiles ?? {}),
      p2: [UNOPENED_FAR_TILE],
    };
    const view = getPlayerView(state, "p2") as unknown as GameState;
    expect(playerHasPlaceableFarTile(view, "p2")).toBe(false); // the trap
    expect(seatHoldsFarSupplyTile(view, "p2")).toBe(true);
    expect(farExpansionRouteRemains(view, "p2")).toBe(true);
    // …and an EMPTY supply is false through the same view.
    const spent = game();
    spent.adventure!.playerFarTiles = {
      ...(spent.adventure!.playerFarTiles ?? {}),
      p2: [],
    };
    const spentView = getPlayerView(spent, "p2") as unknown as GameState;
    expect(seatHoldsFarSupplyTile(spentView, "p2")).toBe(false);
  });
});
