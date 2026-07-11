import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  instantiateTile,
  recomputeSubterraneanGates
} from "./adventure";
import { openDimensionDoorChoice } from "./adventure-reducer";
import {
  applyAction,
  canCrossEdge,
  classifyHeroStep,
  createAdventureGameState,
  fieldLayer,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  getHeroMoveDestinations,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  seaStepHalts,
  tileLatticeNeighbors,
  type GameAction,
  type GameState,
  type HeroMovementCapabilities
} from "./index";
import type { AdventureState, MapTileState } from "./state";

// ---------------------------------------------------------------------------
// Pathfinding ability (Clancy's starting skill) — BINH house rule.
//
//   Basic  → this turn the Hero may move over yellow borders & blocked fields
//            (never ending on a blocked field) and THROUGH fields holding
//            Neutral Units / enemy Heroes (Combat begins only if it ENDS there).
//   Expert → all of Basic PLUS cross the coastline (land↔sea) with no halt, and
//            step directly between the Surface and a Subterranean Tile with no
//            Gate — which Dimension Door and Fly cannot do. Spends a crown.
//
// Every assertion drives the live engine (canCrossEdge / classifyHeroStep /
// move reducers) through the played card, so removing any wired branch fails a
// test here.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "pathfinding-ability", difficulty: "normal", rollFirstPlayer: false });
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
  const next = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
    ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : state;
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
  delete field.terrain;
  field.blackCube = false;
  field.flagOwnerId = null;
  field.everFlagged = false;
}

/** Turn a field into an open-sea (water) hex. */
function makeSeaHex(state: GameState, spaceId: string): void {
  setField(state, spaceId, "empty_field");
  state.adventure!.fields[spaceId]!.terrain = "water";
}

function hasModifier(state: GameState, playerId: string, type: string): boolean {
  return state.activeEffects.some(
    (effect) => effect.controllerId === playerId && effect.modifiers.some((modifier) => modifier.type === type)
  );
}

/** Plays Clancy's Pathfinding card; expert spends a crown (set expertUses first). */
function playPathfinding(state: GameState, mode: "basic" | "expert"): GameState {
  return applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "ability.pathfinding",
    mode,
    optionIndex: mode === "expert" ? 1 : 0,
    target: { type: "none" }
  });
}

// --- Subterranean scaffolding (mirrors subterranean-gates.test.ts) ----------

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function tileAllIds(tile: MapTileState): string[] {
  return getTileFootprintSpaceIds(tile);
}

/** Places a Surface tile (F1) and an adjacent Subterranean tile (U1) on empty lattice. */
function placePair(state: GameState): { surface: MapTileState; underground: MapTileState } {
  const surfaceCenter = { row: 24, col: 12 };
  const undergroundCenter = tileLatticeNeighbors(surfaceCenter)[0];
  const surface = instantiateTile(adv(state), "F1", surfaceCenter, 0, false);
  const underground = instantiateTile(adv(state), "U1", undergroundCenter, 0, false);
  return { surface, underground };
}

function setAllEmpty(state: GameState, tile: MapTileState): void {
  for (const spaceId of getTileFootprintSpaceIds(tile)) {
    const field = adv(state).fields[spaceId];
    if (!field) {
      continue;
    }
    field.location = "empty_field";
    delete field.difficulty;
    delete field.resource;
    delete field.amount;
    delete field.faction;
    delete field.terrain;
    field.blackCube = false;
    field.flagOwnerId = null;
    field.everFlagged = false;
  }
}

/** Adjacent (distance-1) hex pairs that straddle the boundary of two tiles. */
function crossPairs(a: MapTileState, b: MapTileState): [string, string][] {
  const bHexes = new Set(tileAllIds(b));
  const pairs: [string, string][] = [];
  for (const aId of tileAllIds(a)) {
    const coord = parseHexSpaceId(aId);
    if (!coord) {
      continue;
    }
    for (const neighbor of hexNeighbors(coord)) {
      const neighborId = hexSpaceId(neighbor);
      if (bHexes.has(neighborId)) {
        pairs.push([aId, neighborId]);
      }
    }
  }
  return pairs;
}

function gateHalfTo(state: GameState, towardTileId: string) {
  return Object.values(adv(state).fields).find(
    (field) => field.location === "subterranean_gate" && field.gateToTileId === towardTileId
  );
}

// ---------------------------------------------------------------------------

describe("Pathfinding ability — card definition", () => {
  it("is implemented (no longer a needs-implementation stub)", () => {
    const card = cardLibrary["ability.pathfinding"];
    expect(card).toBeDefined();
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
  });

  it("is the starting ability of Clancy (Rampart Ranger)", () => {
    expect(coreHeroDefinitions.clancy?.startingAbilityCardId).toBe("ability.pathfinding");
  });
});

describe("Pathfinding — movement capabilities granted", () => {
  it("basic grants move-through, pass-encounters and border-crossing — but NOT sea/layer crossing", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    state = playPathfinding(state, "basic");
    expect(hasModifier(state, "p1", "HERO_PATHFINDING")).toBe(true);

    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(caps.moveThrough).toBe(true);
    expect(caps.passEncounters).toBe(true);
    expect(caps.crossSealedBorders).toBe(true);
    expect(caps.waterWalk).toBe(false);
    expect(caps.crossLayers ?? false).toBe(false);
  });

  it("expert is a strict superset: also water-walk + layer crossing, and spends a crown", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    state.players.p1.limits.expertUses = 1;
    state = playPathfinding(state, "expert");

    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(caps.moveThrough).toBe(true);
    expect(caps.passEncounters).toBe(true);
    expect(caps.crossSealedBorders).toBe(true);
    expect(caps.waterWalk).toBe(true);
    expect(caps.crossLayers).toBe(true);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("the expert side is refused with no crown available", () => {
    const state = withHand(makeGame(), ["ability.pathfinding"]);
    expect(state.players.p1.limits.expertUses).toBe(0);
    expectError(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.pathfinding",
      mode: "expert",
      optionIndex: 1,
      target: { type: "none" }
    });
  });
});

describe("basic Pathfinding — through Neutral Units (guarded fields)", () => {
  function guardSetup(state: GameState): { center: string; guard: string; beyond: string } {
    const footprint = heroTileFootprint(state);
    const center = footprint[0];
    const guard = footprint[1];
    const beyond = footprint[2];
    expect(center).toBe(heroP1(state).spaceId);
    expect(getAdjacentSpaceIds(center)).toContain(guard);
    expect(getAdjacentSpaceIds(guard)).toContain(beyond);
    setField(state, guard, "empty_field");
    setField(state, beyond, "empty_field");
    adv(state).fields[guard]!.difficulty = 1; // undefeated neutral guards
    heroP1(state).movementPoints = 5;
    return { center, guard, beyond };
  }

  it("a guarded field is a hard stop for a normal hero — the walk cannot pass through it", () => {
    const state = withHand(makeGame(), ["ability.pathfinding"]);
    const { guard, beyond } = guardSetup(state);
    expect(classifyHeroStep(state, heroP1(state), guard)).toBe("stop");
    // A path that tries to continue past the guard is rejected.
    expectError(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [guard, beyond] });
  });

  it("Pathfinding walks THROUGH the guard to the field beyond, with no Combat (guards remain)", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    const { guard, beyond } = guardSetup(state);
    state = playPathfinding(state, "basic");
    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(classifyHeroStep(state, heroP1(state), guard, caps)).toBe("encounter");

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [guard, beyond] });
    expect(heroP1(state).spaceId).toBe(beyond);
    expect(state.combat).toBeNull();
    expect(adv(state).fields[guard]!.difficulty).toBe(1); // never fought, still guarded
  });

  it("ENDING the walk on the guarded field starts the neutral Combat", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    const { guard } = guardSetup(state);
    state = playPathfinding(state, "basic");
    // A path whose final step is the encounter resolves it.
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [guard] });
    expect(state.combat).not.toBeNull();
    expect(heroP1(state).spaceId).toBe(guard);
  });
});

describe("basic Pathfinding — through an enemy Hero", () => {
  it("walks through an enemy hero's field without fighting; a normal hero is stopped", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    const footprint = heroTileFootprint(state);
    const enemySpace = footprint[1];
    const beyond = footprint[2];
    setField(state, enemySpace, "empty_field");
    setField(state, beyond, "empty_field");
    const enemy = state.heroes.hero_p2;
    if (!enemy) {
      throw new Error("expected a p2 hero");
    }
    enemy.spaceId = enemySpace; // enemy hero stands in the way
    heroP1(state).movementPoints = 5;

    // Without Pathfinding the enemy hero is a hard stop.
    expect(classifyHeroStep(state, heroP1(state), enemySpace)).toBe("stop");
    expectError(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [enemySpace, beyond] });

    state = playPathfinding(state, "basic");
    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(classifyHeroStep(state, heroP1(state), enemySpace, caps)).toBe("encounter");

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [enemySpace, beyond] });
    expect(heroP1(state).spaceId).toBe(beyond);
    expect(state.combat).toBeNull(); // passed straight through, no PvP combat
  });
});

describe("basic Pathfinding — yellow borders & blocked fields", () => {
  it("passes OVER a blocked field but can never end on it", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    const footprint = heroTileFootprint(state);
    const center = footprint[0];
    const blocked = footprint[1];
    const beyond = footprint[2];
    setField(state, blocked, "blocked_field");
    setField(state, beyond, "empty_field");
    heroP1(state).movementPoints = 5;

    expect(canCrossEdge(state, center, blocked)).toBe(false); // grounded: impassable

    state = playPathfinding(state, "basic");
    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(canCrossEdge(state, center, blocked, caps)).toBe(true);
    expect(classifyHeroStep(state, heroP1(state), blocked, caps)).toBe("pass-only");
    // Cannot stop on the blocked field…
    expectError(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: blocked });
    // …but may pass over it to the clear field beyond.
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [blocked, beyond] });
    expect(heroP1(state).spaceId).toBe(beyond);
  });

  it("crosses a printed yellow (internal) border on the hero's tile", () => {
    const state = withHand(makeGame(), ["ability.pathfinding"]);
    const hero = heroP1(state);
    const footprint = heroTileFootprint(state);
    const target = footprint[1];
    setField(state, target, "empty_field");
    expect(getAdjacentSpaceIds(hero.spaceId!)).toContain(target);

    const heroField = adv(state).fields[hero.spaceId!]!;
    const def = allTileDefinitions[adv(state).tiles[heroField.tileInstanceId]!.tileDefId]!;
    const saved = def.internalBorders;
    const targetSlot = adv(state).fields[target]!.slot;
    // Paint a yellow border between the hero's field and the target field.
    def.internalBorders = [[heroField.slot, targetSlot]];
    try {
      // A normal hero is walled in by the border.
      expectError(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
      expect(canCrossEdge(state, hero.spaceId!, target)).toBe(false);

      const withPath = playPathfinding(state, "basic");
      const caps = getHeroMovementCapabilities(withPath, heroP1(withPath));
      expect(canCrossEdge(withPath, heroP1(withPath).spaceId!, target, caps)).toBe(true);
      expect(getHeroMoveDestinations(withPath, heroP1(withPath))).toContain(target);

      const moved = applyOk(withPath, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
      expect(moved.heroes.hero_p1.spaceId).toBe(target);
    } finally {
      def.internalBorders = saved;
    }
  });
});

describe("basic Pathfinding does NOT grant the expert sea/underground perks", () => {
  it("the coastline still halts the hero and the underground stays sealed", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    const footprint = heroTileFootprint(state);
    const land = footprint[0];
    const sea = footprint[1];
    makeSeaHex(state, sea);
    state = playPathfinding(state, "basic");
    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(seaStepHalts(state, land, sea, caps)).toBe(true); // no water-walk
    expect(caps.crossLayers ?? false).toBe(false); // no layer crossing
  });
});

describe("expert Pathfinding — coastline without penalty", () => {
  it("crosses land→sea→sea in one walk with no halt", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    state.players.p1.limits.expertUses = 1;
    const footprint = heroTileFootprint(state);
    const sea1 = footprint[1];
    const sea2 = footprint[2];
    makeSeaHex(state, sea1);
    makeSeaHex(state, sea2);
    heroP1(state).movementPoints = 3;
    heroP1(state).movementHaltedThisTurn = false;

    state = playPathfinding(state, "expert");
    const caps = getHeroMovementCapabilities(state, heroP1(state));
    expect(seaStepHalts(state, heroP1(state).spaceId!, sea1, caps)).toBe(false);

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [sea1, sea2] });
    expect(heroP1(state).spaceId).toBe(sea2);
    expect(heroP1(state).movementHaltedThisTurn).toBeFalsy();
  });
});

describe("expert Pathfinding — Surface↔Subterranean without a Gate (the BINH house rule)", () => {
  // Movement-capability fixtures matching what each effect grants.
  const none: HeroMovementCapabilities = { moveThrough: false, waterWalk: false };
  const fly: HeroMovementCapabilities = { moveThrough: true, waterWalk: true };
  const basicPath: HeroMovementCapabilities = {
    moveThrough: true,
    waterWalk: false,
    passEncounters: true,
    crossSealedBorders: true
  };
  const expertPath: HeroMovementCapabilities = { ...basicPath, waterWalk: true, crossLayers: true };

  function layeredMap(state: GameState) {
    const { surface, underground } = placePair(state);
    setAllEmpty(state, surface);
    setAllEmpty(state, underground);
    recomputeSubterraneanGates(adv(state));
    const gate = gateHalfTo(state, underground.id);
    const entrance = gateHalfTo(state, surface.id);
    if (!gate || !entrance) {
      throw new Error("subterranean gate did not form");
    }
    const nonGate = crossPairs(surface, underground).find(
      ([a, b]) => !(a === gate.spaceId && b === entrance.spaceId)
    );
    if (!nonGate) {
      throw new Error("expected a non-gate divide edge");
    }
    return { surface, underground, gate, entrance, nonGate };
  }

  it("only expert Pathfinding crosses a non-gate divide edge (a normal hero, Fly and basic Pathfinding cannot)", () => {
    const state = makeGame();
    const { gate, entrance, nonGate } = layeredMap(state);
    const [surf, under] = nonGate;

    // The Gate itself is always crossable, by everyone.
    expect(canCrossEdge(state, gate.spaceId, entrance.spaceId)).toBe(true);

    // The non-gate edge across the divide is sealed for…
    expect(canCrossEdge(state, surf, under, none)).toBe(false); // a normal hero
    expect(canCrossEdge(state, surf, under, fly)).toBe(false); // Fly / Angel Wings / Water Walk
    expect(canCrossEdge(state, surf, under, basicPath)).toBe(false); // basic Pathfinding

    // …and open only to expert Pathfinding's crossLayers.
    expect(canCrossEdge(state, surf, under, expertPath)).toBe(true);
  });

  it("a hero with expert Pathfinding active steps across a non-gate divide edge into the underground", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    state.players.p1.limits.expertUses = 1;
    const { gate, nonGate } = layeredMap(state);
    const [surf, under] = nonGate;

    const hero = heroP1(state);
    hero.spaceId = surf; // stand on the surface side of a NON-gate divide edge
    hero.movementPoints = 3;
    hero.movementHaltedThisTurn = false;

    // Grounded, the underground hex one step away is unreachable (sealed divide).
    expect(getHeroMoveDestinations(state, hero)).not.toContain(under);

    state = playPathfinding(state, "expert");
    // The BFS reaches it directly (a 1-step path that cannot involve the Gate).
    const reachable = getReachableHeroPaths(state, heroP1(state));
    const toUnder = reachable.get(under);
    expect(toUnder).toBeDefined();
    expect(toUnder!.path).toEqual([under]);
    expect(toUnder!.path).not.toContain(gate.spaceId);

    // And the move itself crosses the divide with no Gate.
    const moved = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: under });
    expect(moved.heroes.hero_p1.spaceId).toBe(under);
    expect(fieldLayer(moved, under)).toBe("subterranean");
  });

  it("Dimension Door STILL cannot breach the divide, even while expert Pathfinding is active", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    state.players.p1.limits.expertUses = 1;
    const { surface } = layeredMap(state);

    const hero = heroP1(state);
    hero.spaceId = hexSpaceId({ row: surface.centerRow, col: surface.centerCol });
    state = playPathfinding(state, "expert");

    openDimensionDoorChoice(state, "p1", 10);
    const choice = state.pendingChoice;
    const destinations =
      choice?.type === "OPTION_CHOICE" ? (choice.dimensionDoor?.destinations ?? []) : [];
    expect(destinations.length).toBeGreaterThan(0);
    expect(destinations.every((id) => fieldLayer(state, id) === "surface")).toBe(true);
  });
});

describe("pathfinding-expert toggle — the expert coastline/layer crossing is gated by the house rule", () => {
  it("OFF: expert Pathfinding grants no water-walk or layer crossing (same effect, gated away)", () => {
    let state = withHand(makeGame(), ["ability.pathfinding"]);
    state.players.p1.limits.expertUses = 1;
    state = playPathfinding(state, "expert");

    // Default (rule ON): the expert side grants the coastline + layer perks.
    const on = getHeroMovementCapabilities(state, heroP1(state));
    expect(on.waterWalk).toBe(true);
    expect(on.crossLayers).toBe(true);

    // Flip the frozen toggle OFF — the SAME active effect no longer grants them.
    state.adventure!.houseRules!["pathfinding-expert"] = false;
    const off = getHeroMovementCapabilities(state, heroP1(state));
    expect(off.waterWalk, "no water-walk without the rule").toBe(false);
    expect(off.crossLayers ?? false, "no layer crossing without the rule").toBe(false);
    // The basic Pathfinding set survives — only the expert perks are gated.
    expect(off.moveThrough).toBe(true);
    expect(off.passEncounters).toBe(true);
  });

  it("OFF: the expert Pathfinding side is not offered — only its basic side plays", () => {
    const offGame = createAdventureGameState({
      seed: "pathfinding-expert-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      ruleset: "binh",
      houseRules: { "pathfinding-expert": false }
    });
    const state = withHand(offGame, ["ability.pathfinding"]);
    state.players.p1.limits.expertUses = 1;

    // The basic side still plays…
    const basic = playPathfinding(state, "basic");
    expect(hasModifier(basic, "p1", "HERO_PATHFINDING")).toBe(true);

    // …but the expert side (crown-in-hand) is rejected: its option is dropped.
    expectError(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.pathfinding",
      mode: "expert",
      optionIndex: 1,
      target: { type: "none" }
    });
  });
});
