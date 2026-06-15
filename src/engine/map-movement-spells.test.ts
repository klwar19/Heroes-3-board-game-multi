import { describe, expect, it } from "vitest";
import { instantiateTile } from "./adventure";
import {
  applyAction,
  canCrossEdge,
  classifyHeroStep,
  createAdventureGameState,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  getHeroMoveDestinations,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexDistance,
  isSeaField,
  parseHexSpaceId,
  tileLatticeNeighbors,
  type GameAction,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "map-spells", difficulty: "normal", rollFirstPlayer: false });
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function expectError(state: GameState, action: GameAction): void {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
}

/** Refresh p1's opening hand, then replace it with exactly `cards`. */
function withHand(state: GameState, cards: string[]): GameState {
  const next = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  next.players.p1.hand = [...cards];
  return next;
}

function heroP1(state: GameState) {
  const hero = state.heroes.hero_p1;
  if (!hero) {
    throw new Error("missing p1 hero");
  }
  return hero;
}

/** The 7 footprint space ids of the tile the hero currently stands on. */
function heroTileFootprint(state: GameState): string[] {
  const hero = heroP1(state);
  const field = state.adventure?.fields[hero.spaceId ?? ""];
  const tile = field ? state.adventure?.tiles[field.tileInstanceId] : undefined;
  if (!tile) {
    throw new Error("hero is not on a materialized tile");
  }
  return getTileFootprintSpaceIds(tile);
}

/** Overwrite a field to a clean, unguarded location for deterministic tests. */
function setField(state: GameState, spaceId: string, location: string): void {
  const field = state.adventure?.fields[spaceId];
  if (!field) {
    throw new Error(`no field ${spaceId}`);
  }
  field.location = location;
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  field.blackCube = false;
  field.flagOwnerId = null;
  field.everFlagged = false;
}

function hasModifier(state: GameState, playerId: string, type: string): boolean {
  return state.activeEffects.some(
    (effect) => effect.controllerId === playerId && effect.modifiers.some((modifier) => modifier.type === type)
  );
}

// ---------------------------------------------------------------------------
// Pathfinding: move through blocked fields (Fly / Angel Wings / Dessa)
// ---------------------------------------------------------------------------

describe("pathfinding: move through blocked fields", () => {
  it("blocks a normal hero but lets a move-through hero pass over (never stop)", () => {
    const state = makeGame();
    const hero = heroP1(state);
    const center = hero.spaceId as string;
    const footprint = heroTileFootprint(state);
    // Two consecutive ring hexes: the blocker (adjacent to the hero) and a
    // clean field beyond it (adjacent to the blocker). Same tile, so the only
    // gate is the blocked-field rule itself.
    const blocked = footprint[1];
    const beyond = footprint[2];
    expect(getAdjacentSpaceIds(center)).toContain(blocked);
    expect(getAdjacentSpaceIds(blocked)).toContain(beyond);
    setField(state, blocked, "blocked_field");
    setField(state, beyond, "empty_field");

    const fly = { moveThrough: true, waterWalk: false };

    // Without the effect the blocked field is impassable and un-stoppable.
    expect(canCrossEdge(state, center, blocked)).toBe(false);
    expect(classifyHeroStep(state, hero, blocked)).toBe("block");

    // With move-through the edge opens, but the field is only "pass-only" —
    // you fly over it, you never land on it.
    expect(canCrossEdge(state, center, blocked, fly)).toBe(true);
    expect(classifyHeroStep(state, hero, blocked, fly)).toBe("pass-only");
  });

  it("getReachableHeroPaths reaches a walled-off field only with move-through", () => {
    let state = withHand(makeGame(), ["spell.fly"]);
    const { heroField, blockers, beyond } = setupTwoTileGap(state);
    const hero = heroP1(state);
    hero.spaceId = heroField;
    hero.movementPoints = 5;

    // The far tile is sealed behind blocked border fields: unreachable on foot.
    const grounded = getReachableHeroPaths(state, hero);
    expect(grounded.has(beyond)).toBe(false);
    for (const blocker of blockers) {
      expect(grounded.has(blocker)).toBe(false);
    }

    // Fly grants move-through for the turn.
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });

    const flying = getReachableHeroPaths(state, heroP1(state));
    expect(flying.has(beyond)).toBe(true); // reached by flying over a blocker
    for (const blocker of blockers) {
      expect(flying.has(blocker)).toBe(false); // passed over, never a valid stop
    }
  });
});

/**
 * Two land tiles placed as gapless lattice neighbours, with every field of the
 * far tile walled off behind the two blocked border fields — so the far tile is
 * reachable only by a hero that can move through blocked fields.
 */
function setupTwoTileGap(state: GameState): { heroField: string; blockers: string[]; beyond: string } {
  const adventure = state.adventure;
  if (!adventure) {
    throw new Error("no adventure");
  }
  const nearCenter = { row: 40, col: 20 };
  const nearTile = instantiateTile(adventure, "F23", nearCenter, 0, false); // grass, all edges open
  const farTile = instantiateTile(adventure, "F19", tileLatticeNeighbors(nearCenter)[0], 0, false); // rough, open
  const nearIds = getTileFootprintSpaceIds(nearTile);
  const farIds = getTileFootprintSpaceIds(farTile);

  const borderPairs: { near: string; far: string }[] = [];
  for (const near of nearIds) {
    for (const far of farIds) {
      if (getAdjacentSpaceIds(near).includes(far)) {
        borderPairs.push({ near, far });
      }
    }
  }
  const blockers = [...new Set(borderPairs.map((pair) => pair.far))];
  const heroField = borderPairs[0]?.near;
  // A far-tile field that touches a border field but no near-tile field: only
  // reachable by crossing one of the (blocked) border fields.
  const beyond = farIds.find(
    (id) => !blockers.includes(id) && getAdjacentSpaceIds(id).some((neighbour) => blockers.includes(neighbour))
  );
  if (!heroField || blockers.length === 0 || !beyond) {
    throw new Error("could not build a two-tile gap");
  }

  setField(state, heroField, "empty_field");
  setField(state, beyond, "empty_field");
  for (const blocker of blockers) {
    setField(state, blocker, "blocked_field");
  }
  return { heroField, blockers, beyond };
}

// ---------------------------------------------------------------------------
// Fly spell (map): wires move-through + power-scaled movement
// ---------------------------------------------------------------------------

describe("Fly spell", () => {
  it("grants move-through this turn so a path may cross a blocked field", () => {
    let state = withHand(makeGame(), ["spell.fly"]);
    const footprint = heroTileFootprint(state);
    const blocked = footprint[1];
    const beyond = footprint[2];
    setField(state, blocked, "blocked_field");
    setField(state, beyond, "empty_field");

    // Before Fly: a path through the blocked hex is rejected.
    expectError(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [blocked, beyond] });

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(hasModifier(state, "p1", "HERO_MOVE_THROUGH")).toBe(true);
    // Basic Fly is move-through only: movement is unchanged.
    expect(heroP1(state).movementPoints).toBe(3);

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [blocked, beyond] });
    expect(heroP1(state).spaceId).toBe(beyond);
    expect(heroP1(state).movementPoints).toBe(1); // two hexes crossed, blocked one included
  });

  it("the Power 4 side also grants +2 movement (paid with power-source cards)", () => {
    let state = withHand(makeGame(), ["spell.fly", "spell.haste", "spell.slow", "spell.bless", "spell.curse"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      optionIndex: 2,
      target: { type: "none" },
      costCardIds: ["spell.haste", "spell.slow", "spell.bless", "spell.curse"]
    });
    expect(hasModifier(state, "p1", "HERO_MOVE_THROUGH")).toBe(true);
    expect(heroP1(state).movementPoints).toBe(5); // 3 + 2
  });
});

// ---------------------------------------------------------------------------
// Angel Wings artifact: the shipped relic whose move-through was decorative
// until the pathfinding read HERO_MOVE_THROUGH. This pins that it now works.
// ---------------------------------------------------------------------------

describe("Angel Wings artifact", () => {
  it("grants +1 movement and lets the hero walk through a blocked field", () => {
    let state = withHand(makeGame(), ["artifact.angel_wings"]);
    const footprint = heroTileFootprint(state);
    const blocked = footprint[1];
    const beyond = footprint[2];
    setField(state, blocked, "blocked_field");
    setField(state, beyond, "empty_field");

    expectError(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [blocked, beyond] });

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.angel_wings",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(hasModifier(state, "p1", "HERO_MOVE_THROUGH")).toBe(true);
    expect(heroP1(state).movementPoints).toBe(4); // 3 + 1

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [blocked, beyond] });
    expect(heroP1(state).spaceId).toBe(beyond);
    expect(heroP1(state).movementPoints).toBe(2); // 4 - 2 steps
  });
});

// ---------------------------------------------------------------------------
// Water Walk spell (map): wires sea-crossing + power-scaled movement
// ---------------------------------------------------------------------------

/**
 * Builds a coastline far from the starting map: a grass tile and a water tile
 * placed as gapless lattice neighbours, both with open outer edges. Returns one
 * land field, an adjacent sea field, and a deeper sea field adjacent to that
 * one (only reachable by continuing across the sea). The hero stands on land.
 */
function setupCoast(state: GameState): { land: string; sea: string; seaDeep: string } {
  const adventure = state.adventure;
  if (!adventure) {
    throw new Error("no adventure");
  }
  const landCenter = { row: 40, col: 20 };
  const landTile = instantiateTile(adventure, "F23", landCenter, 0, false); // grass, all edges open
  const waterCenter = tileLatticeNeighbors(landCenter)[0];
  const waterTile = instantiateTile(adventure, "W2", waterCenter, 0, false); // water terrain, all edges open

  const landIds = getTileFootprintSpaceIds(landTile);
  const waterIds = getTileFootprintSpaceIds(waterTile);
  let land: string | undefined;
  let sea: string | undefined;
  for (const candidate of landIds) {
    const neighbour = waterIds.find((waterId) => getAdjacentSpaceIds(candidate).includes(waterId));
    if (neighbour) {
      land = candidate;
      sea = neighbour;
      break;
    }
  }
  const seaDeep = sea ? waterIds.find((id) => id !== sea && getAdjacentSpaceIds(sea).includes(id)) : undefined;
  if (!land || !sea || !seaDeep) {
    throw new Error("no land/sea adjacency found");
  }

  setField(state, land, "empty_field");
  setField(state, sea, "empty_field"); // clean, unguarded sea fields on the water tile
  setField(state, seaDeep, "empty_field");
  const hero = heroP1(state);
  hero.spaceId = land;
  hero.movementPoints = 3;
  return { land, sea, seaDeep };
}

describe("sea movement without Water Walk", () => {
  it("lets a land hero step onto the sea, but that halts movement (points kept)", () => {
    let state = makeGame();
    const { land, sea } = setupCoast(state);
    const hero = heroP1(state);

    expect(isSeaField(state, sea)).toBe(true);
    expect(isSeaField(state, land)).toBe(false);

    // Entering the sea is allowed, but it is a forced stop (you cannot continue).
    expect(canCrossEdge(state, land, sea)).toBe(true);
    expect(classifyHeroStep(state, hero, sea)).toBe("stop");
    expect(getHeroMoveDestinations(state, hero)).toContain(sea);

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(heroP1(state).spaceId).toBe(sea);
    // The remaining move points are kept (not zeroed) — but the hero is halted.
    expect(heroP1(state).movementPoints).toBe(2);
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);
    expect(getHeroMoveDestinations(state, heroP1(state))).toEqual([]);
    expectError(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: land });
  });

  it("keeps the move points available for a neutral combat on the sea field", () => {
    let state = makeGame();
    const { sea } = setupCoast(state);
    state.adventure!.fields[sea].difficulty = 1; // undefended guards on the sea

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea });
    expect(state.combat).not.toBeNull();
    // Movement halted, yet the point is kept so the fight can be continued.
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);
    expect(heroP1(state).movementPoints).toBe(2);
  });

  it("never needs Water Walk to step from the sea back onto land (no stranding)", () => {
    const state = makeGame();
    const { land, sea } = setupCoast(state);
    const hero = heroP1(state);
    hero.spaceId = sea; // as if the turn began on the sea
    hero.movementHaltedThisTurn = false;

    expect(canCrossEdge(state, sea, land)).toBe(true);
    const moved = applyAction(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: land });
    expect(moved.errors).toHaveLength(0);
    expect(moved.state.heroes.hero_p1.spaceId).toBe(land);
    expect(moved.state.heroes.hero_p1.movementHaltedThisTurn).toBeFalsy();
  });
});

describe("Water Walk spell", () => {
  it("lets the hero keep moving across the sea (no halt)", () => {
    let state = makeGame();
    const { sea, seaDeep } = setupCoast(state);
    state.players.p1.hand = ["spell.water_walk"];

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.water_walk",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(hasModifier(state, "p1", "HERO_WATER_WALK")).toBe(true);
    expect(getHeroMovementCapabilities(state, heroP1(state)).waterWalk).toBe(true);
    // With Water Walk the sea is normal terrain, not a forced stop.
    expect(classifyHeroStep(state, heroP1(state), sea, { moveThrough: false, waterWalk: true })).toBe("open");

    // The hero crosses onto the sea AND continues to a second sea field.
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [sea, seaDeep] });
    expect(heroP1(state).spaceId).toBe(seaDeep);
    expect(heroP1(state).movementPoints).toBe(1); // 3 - 2 steps
    expect(heroP1(state).movementHaltedThisTurn).toBeFalsy();
  });

  it("the Power 2 side also grants +2 movement", () => {
    let state = makeGame();
    setupCoast(state);
    state.players.p1.hand = ["spell.water_walk", "spell.haste", "spell.slow"];
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.water_walk",
      mode: "basic",
      optionIndex: 2,
      target: { type: "none" },
      costCardIds: ["spell.haste", "spell.slow"]
    });
    expect(hasModifier(state, "p1", "HERO_WATER_WALK")).toBe(true);
    expect(heroP1(state).movementPoints).toBe(5); // 3 + 2
  });
});

// ---------------------------------------------------------------------------
// Dimension Door spell (map): teleport ignoring obstacles, resolve destination
// ---------------------------------------------------------------------------

/** Moves the hero to a ring hex so that fields at hex distance 1 and 2 exist. */
function dimensionDoorSetup(state: GameState): {
  hero: ReturnType<typeof heroP1>;
  near: string[];
  far: string[];
  footprint: string[];
} {
  const hero = heroP1(state);
  const footprint = heroTileFootprint(state);
  hero.spaceId = footprint[1];
  hero.movementPoints = 3;
  const origin = parseHexSpaceId(hero.spaceId);
  if (!origin) {
    throw new Error("bad origin");
  }
  const near: string[] = [];
  const far: string[] = [];
  for (const spaceId of footprint) {
    if (spaceId === hero.spaceId) {
      continue;
    }
    const coord = parseHexSpaceId(spaceId);
    const distance = coord ? hexDistance(origin, coord) : 99;
    if (distance === 1) {
      near.push(spaceId);
    } else if (distance === 2) {
      far.push(spaceId);
    }
  }
  return { hero, near, far, footprint };
}

function playDimensionDoor(state: GameState, optionIndex: number, costCardIds: string[] = []): GameState {
  return applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "spell.dimension_door",
    mode: "basic",
    optionIndex,
    target: { type: "none" },
    ...(costCardIds.length > 0 ? { costCardIds } : {})
  });
}

function dimensionDoorDestinations(state: GameState): string[] {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "dimension-door") {
    throw new Error("no dimension-door choice open");
  }
  return choice.dimensionDoor?.destinations ?? [];
}

describe("Dimension Door spell", () => {
  it("Power 0 offers only adjacent stoppable fields, and Cancel keeps the hero put", () => {
    let state = withHand(makeGame(), ["spell.dimension_door"]);
    const { near, far } = dimensionDoorSetup(state);
    const blocked = near[0];
    const reachableNear = near[1] ?? near[0];
    const beyond = far[0];
    setField(state, blocked, "blocked_field");
    setField(state, reachableNear, "empty_field");
    setField(state, beyond, "empty_field");

    state = playDimensionDoor(state, 0);
    const reachOne = dimensionDoorDestinations(state);
    expect(reachOne).toContain(reachableNear);
    expect(reachOne).not.toContain(blocked); // cannot land on a blocked field
    expect(reachOne).not.toContain(beyond); // out of range 1

    // The trailing option is "Cancel (stay)".
    const heroSpaceBefore = heroP1(state).spaceId;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: reachOne.length
    });
    expect(heroP1(state).spaceId).toBe(heroSpaceBefore);
    expect(state.pendingChoice).toBeNull();
  });

  it("higher Power reaches further, ignoring blocked fields in-between", () => {
    let state = withHand(makeGame(), ["spell.dimension_door", "spell.haste", "spell.slow"]);
    const { near, far } = dimensionDoorSetup(state);
    const blocked = near[0];
    const beyond = far[0];
    setField(state, blocked, "blocked_field");
    setField(state, beyond, "empty_field");

    // Power 2 → reach 2 (paid with two power-source cards): the distance-2 field
    // is offered even though a blocked hex sits between it and the hero.
    state = playDimensionDoor(state, 1, ["spell.haste", "spell.slow"]);
    expect(dimensionDoorDestinations(state)).toContain(beyond);
  });

  it("teleports the hero and resolves the destination field (visit)", () => {
    let state = withHand(makeGame(), ["spell.dimension_door"]);
    const { near } = dimensionDoorSetup(state);
    const target = near[0];
    setField(state, target, "windmill"); // visit gains +1 valuables, deterministically

    const valuablesBefore = state.players.p1.resources.valuables;
    state = playDimensionDoor(state, 0);
    const destinations = dimensionDoorDestinations(state);
    const optionIndex = destinations.indexOf(target);
    expect(optionIndex).toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex
    });

    expect(heroP1(state).spaceId).toBe(target);
    expect(state.adventure?.fields[target].blackCube).toBe(true);
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
  });

  it("starts a combat when the hero teleports onto a guarded field", () => {
    let state = withHand(makeGame(), ["spell.dimension_door"]);
    const { near } = dimensionDoorSetup(state);
    const target = near[0];
    setField(state, target, "treasure_symbol");
    state.adventure!.fields[target].difficulty = 1; // undefeated guards -> a fight

    state = playDimensionDoor(state, 0);
    const optionIndex = dimensionDoorDestinations(state).indexOf(target);
    expect(optionIndex).toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex
    });

    expect(heroP1(state).spaceId).toBe(target);
    expect(state.combat).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Logistics ability (map): end-of-turn step + expert +1 movement
// ---------------------------------------------------------------------------

describe("Logistics ability", () => {
  it("ongoing side offers a free step to an adjacent empty field at end of turn", () => {
    let state = withHand(makeGame(), ["ability.logistics"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.logistics",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(hasModifier(state, "p1", "END_TURN_ADJACENT_MOVE")).toBe(true);

    state = applyOk(state, { type: "END_TURN", playerId: "p1" });
    // The end-of-turn move opens as a choice for the player to resolve.
    const visit = state.adventure?.pendingVisit;
    expect(visit?.steps[0]?.type).toBe("CHOOSE_ONE");
    // The effect is consumed whether or not the player steps.
    expect(hasModifier(state, "p1", "END_TURN_ADJACENT_MOVE")).toBe(false);
  });

  it("expert side grants the hero +1 movement", () => {
    let state = withHand(makeGame(), ["ability.logistics"]);
    state.players.p1.limits.expertUses = 1; // make an expert use available on the map
    const before = heroP1(state).movementPoints;
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.logistics",
      mode: "expert",
      optionIndex: 1,
      target: { type: "none" }
    });
    expect(heroP1(state).movementPoints).toBe(before + 1);
  });
});
