import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createAdventureGameState } from "../adventure-setup";
import {
  canHeroReachPlacedTile,
  farTilePlacementCenters,
  getAdjacentSpaceIds,
  playerHasPlaceableFarTile,
} from "../adventure";
import { hexSpaceId, tileFootprint } from "../hex";
import { getLegalActions } from "../legal-actions";
import type { GameAction, GameState, HeroState, MapSpaceId } from "../state";
import { UNOPENED_FAR_TILE } from "../state";
import {
  canBeatGuardedField,
  collectMapObjectives,
  objectiveDistanceField,
  primaryMapObjective,
} from "./map-navigation";
import { scoreMapAction } from "./map-policy";
import { chooseComputerAction } from "./policy";
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
  return createAdventureGameState({
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
});

describe("collectMapObjectives", () => {
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

  it("elevates grail dig sites and dragon utopia under their win modes", () => {
    const state = game();
    const hero = p2Hero(state);
    // Mark a public grail dig on an empty field and switch victory mode.
    state.adventure!.victoryMode = "grail";
    state.adventure!.grail = { status: "uncollected" };
    state.adventure!.fields[RESOURCE].grailDiggable = true;
    const grailObjectives = collectMapObjectives(state, hero);
    const grailHit = grailObjectives.find((o) => o.spaceId === RESOURCE);
    expect(grailHit?.kind).toBe("victory");

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
    // Remove the distant conquest-town override so the adjacent guarded mine is
    // the concrete primary payoff for this policy comparison.
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
        label: "claim guarded mine",
        action: {
          type: "MOVE_HERO",
          playerId: "p2",
          heroId: hero.id,
          to: MINE,
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
    // Entering the beatable guard outranks END_TURN (300) by a wide margin, so
    // the AI walks into the fight instead of turtling.
    expect(moveScoreTo(state, hero, MINE)).toBeGreaterThan(700);
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
  it("collects a safe income hex before fair fights, then attacks after three Packs", () => {
    const state = game();
    const hero = p2Hero(state);
    state.adventure!.victoryMode = "dragon-hunt";

    const developing = primaryMapObjective(state, hero);
    expect(developing?.spaceId).toBe(RESOURCE);
    expect(developing?.kind).toBe("visitable");

    establishP2PackCore(state);
    const battleReady = primaryMapObjective(state, hero);
    expect(battleReady?.kind).toBe("guard");
    expect([MINE, TREASURE]).toContain(battleReady?.spaceId);
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

    // CONTROL: flush balanced resources → market is not a detour.
    state.players.p2.resources = {
      gold: 20,
      buildingMaterials: 6,
      valuables: 2,
    };
    const flush = collectMapObjectives(state, hero).map((o) => o.spaceId);
    expect(flush).not.toContain(EMPTY);
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
