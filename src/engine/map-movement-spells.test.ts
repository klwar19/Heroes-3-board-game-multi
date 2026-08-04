import { describe, expect, it } from "vitest";
import { instantiateTile } from "./adventure";
import {
  applyAction,
  canCrossEdge,
  classifyHeroStep,
  createAdventureGameState,
  getAdjacentSpaceIds,
  getEndTurnMoveDestinations,
  getHeroMovementCapabilities,
  getHeroMoveDestinations,
  getLegalActions,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  hexDistance,
  isSeaField,
  parseHexSpaceId,
  seaStepHalts,
  tileLatticeNeighbors,
  type GameAction,
  type GameState
} from "./index";
import { cardLibrary } from "@/data/cards/library";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  const state = createAdventureGameState({ seed: "map-spells", difficulty: "normal", rollFirstPlayer: false });
  // The start-of-turn draw is mandatory before moving/casting; these fixtures
  // don't exercise it, so treat it as already taken (a no-op draw at the limit).
  for (const _pl of Object.values(state.players)) {
    _pl.canMulligan = false;
    _pl.needsHandRefresh = false;
  }
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * Cast a Power-tiered map spell, optionally discard power sources after cast
 * (cast-then-boost, like combat), then resolve at that Power.
 */
function castMapPowerSpell(state: GameState, cardId: string, powerCardIds: string[] = []): GameState {
  let next = applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId,
    mode: "basic",
    target: { type: "none" }
  });
  for (const powerId of powerCardIds) {
    const choice = next.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "map-spell-boost" || !choice.mapSpellBoost) {
      throw new Error(`expected map-spell-boost to spend ${powerId}`);
    }
    const index = choice.mapSpellBoost.offers.findIndex(
      (offer) => offer.kind === "card" && offer.cardId === powerId && offer.mode === "basic"
    );
    expect(index, `boost offer for ${powerId}`).toBeGreaterThanOrEqual(0);
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: index
    });
  }
  if (next.pendingChoice?.type === "OPTION_CHOICE" && next.pendingChoice.context === "map-spell-boost") {
    const choice = next.pendingChoice;
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.mapSpellBoost?.offers.length ?? choice.options.length - 1
    });
  }
  return next;
}

function expectError(state: GameState, action: GameAction): void {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
}

/** Refresh p1's opening hand, then replace it with exactly `cards`. */
function withHand(state: GameState, cards: string[]): GameState {
  const next = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
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

/** Turn a field into an open-sea (water) hex; `setField` clears it back to land. */
function makeSeaHex(state: GameState, spaceId: string): void {
  setField(state, spaceId, "empty_field");
  state.adventure!.fields[spaceId]!.terrain = "water";
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

    // Fly grants move-through for the turn (cast-then-boost: resolve at Power 0).
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      target: { type: "none" }
    });
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "map-spell-boost") {
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        optionIndex: state.pendingChoice.mapSpellBoost?.offers.length ?? state.pendingChoice.options.length - 1
      });
    }

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
      target: { type: "none" }
    });
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "map-spell-boost") {
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        optionIndex: state.pendingChoice.mapSpellBoost?.offers.length ?? state.pendingChoice.options.length - 1
      });
    }
    expect(hasModifier(state, "p1", "HERO_MOVE_THROUGH")).toBe(true);
    // Basic Fly is move-through only: movement is unchanged.
    expect(heroP1(state).movementPoints).toBe(3);

    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [blocked, beyond] });
    expect(heroP1(state).spaceId).toBe(beyond);
    expect(heroP1(state).movementPoints).toBe(1); // two hexes crossed, blocked one included
  });

  it("boosting to Power 4 grants +2 movement (discard power-source cards after cast)", () => {
    let state = withHand(makeGame(), ["spell.fly", "spell.haste", "spell.slow", "spell.bless", "spell.curse"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      target: { type: "none" }
    });
    // Discard four Spells (+1 each) to reach Power 4.
    for (const powerId of ["spell.haste", "spell.slow", "spell.bless", "spell.curse"]) {
      const choice = state.pendingChoice;
      expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("map-spell-boost");
      if (choice?.type !== "OPTION_CHOICE" || !choice.mapSpellBoost) {
        throw new Error("expected map-spell-boost");
      }
      const index = choice.mapSpellBoost.offers.findIndex(
        (offer) => offer.kind === "card" && offer.cardId === powerId && offer.mode === "basic"
      );
      expect(index).toBeGreaterThanOrEqual(0);
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: choice.id,
        optionIndex: index
      });
    }
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

  // The printed relic: "Chosen Hero gains +1 movement and can move through any
  // fields WITHOUT RESOLVING THEM. The last visited field must be resolved
  // normally." Before this, the card granted only the blocked-field walk-through,
  // so a guarded field mid-path still stopped the hero and started the fight.
  it("walks OVER a guarded field without fighting, and still fights when the walk ENDS there", () => {
    const base = withHand(makeGame(), ["artifact.angel_wings", "artifact.angel_wings"]);
    const footprint = heroTileFootprint(base);
    const guarded = footprint[1];
    const beyond = footprint[2];
    setField(base, guarded, "empty_field");
    setField(base, beyond, "empty_field");
    const guardedField = base.adventure!.fields[guarded]!;
    guardedField.difficulty = 1; // live neutral guards, nobody's flag

    // CONTROL: with no Angel Wings played, the guarded field is a hard stop — a
    // path THROUGH it is rejected outright.
    expect(classifyHeroStep(base, heroP1(base), guarded)).toBe("stop");
    expectError(base, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [guarded, beyond] });

    let state = applyOk(base, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.angel_wings",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(hasModifier(state, "p1", "HERO_PASS_ANY_FIELD")).toBe(true);
    expect(getHeroMovementCapabilities(state, heroP1(state)).passAnyField).toBe(true);
    expect(classifyHeroStep(state, heroP1(state), guarded, getHeroMovementCapabilities(state, heroP1(state)))).toBe(
      "encounter"
    );

    // Walk through the guarded field to the far side: no combat opens, the
    // guards are untouched, and the hero really is on the far hex.
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [guarded, beyond] });
    expect(state.combat, "no fight for a field merely flown over").toBeFalsy();
    expect(heroP1(state).spaceId).toBe(beyond);
    expect(state.adventure!.fields[guarded]!.difficulty).toBe(1); // guards still there

    // "The last visited field must be resolved normally": ENDING on the guarded
    // field starts the fight exactly as usual.
    const ending = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [guarded] });
    expect(ending.combat, "ending on the guarded field resolves it").toBeTruthy();
  });

  it("walks OVER an unvisited location and an enemy-flagged mine without resolving them", () => {
    let state = withHand(makeGame(), ["artifact.angel_wings"]);
    const footprint = heroTileFootprint(state);
    const treasure = footprint[1];
    const mine = footprint[2];
    const beyond = footprint[3];
    setField(state, treasure, "treasure_symbol");
    setField(state, mine, "mine");
    setField(state, beyond, "empty_field");
    state.adventure!.fields[mine]!.flagOwnerId = "p2";
    state.adventure!.fields[mine]!.resource = "gold";
    state.adventure!.fields[mine]!.amount = 1;
    heroP1(state).movementPoints = 5;

    // CONTROL: both are ordinary stops without the relic.
    expect(classifyHeroStep(state, heroP1(state), treasure)).toBe("stop");
    expect(classifyHeroStep(state, heroP1(state), mine)).toBe("stop");

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.angel_wings",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "MOVE_HERO_PATH",
      playerId: "p1",
      heroId: "hero_p1",
      path: [treasure, mine, beyond]
    });
    expect(heroP1(state).spaceId).toBe(beyond);
    // Nothing along the way was resolved: the chest is unused, the enemy keeps
    // its flag, and no visit/pending choice was opened.
    expect(state.adventure!.fields[treasure]!.blackCube ?? false).toBe(false);
    expect(state.adventure!.fields[mine]!.flagOwnerId).toBe("p2");
    expect(state.adventure!.pendingVisit).toBeFalsy();
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });

  it("CONTROL: Fly and Dessa's Logistics VI print blocked fields only — they do NOT pass over guards", () => {
    // Data half: only Angel Wings carries the pass-any-field flag. (A future card
    // gaining it must be a deliberate edit, not a copy-paste.)
    const flagged = (cardId: string): boolean => {
      const effect = cardLibrary[cardId]?.effect;
      const options = effect?.type === "CHOOSE_ONE" ? effect.options : [];
      return options.some(
        (option) => option.effect?.type === "GAIN_HERO_MOVEMENT" && option.effect.passAnyFieldThisTurn === true
      );
    };
    expect(flagged("artifact.angel_wings")).toBe(true);
    expect(flagged("spell.fly")).toBe(false);
    expect(flagged("specialty.dessa.6")).toBe(false);

    // Behaviour half: the blocked-field walk-through ALONE never turns a guarded
    // field into a walk-over — passAnyField is what does, and only Angel Wings
    // grants it.
    const state = makeGame();
    const guarded = heroTileFootprint(state)[1];
    setField(state, guarded, "empty_field");
    state.adventure!.fields[guarded]!.difficulty = 1;
    expect(classifyHeroStep(state, heroP1(state), guarded, { moveThrough: true, waterWalk: false })).toBe("stop");
    expect(
      classifyHeroStep(state, heroP1(state), guarded, { moveThrough: true, waterWalk: false, passAnyField: true })
    ).toBe("encounter");
  });
});

// ---------------------------------------------------------------------------
// Sea movement: coastline crossings halt; sea->sea is normal; Water Walk frees it
// ---------------------------------------------------------------------------

/**
 * Lays three consecutive open-sea ring hexes (sea1->sea2->sea3) on the hero's
 * starting (land) tile, leaving the centre as the dry town. Each sea hex is
 * adjacent to the next, and sea1 is adjacent to the land centre — a coastline.
 */
function seaSetup(state: GameState): { land: string; sea1: string; sea2: string; sea3: string } {
  const footprint = heroTileFootprint(state); // [center, r1..r6]; hero stands on the centre
  const hero = heroP1(state);
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
  makeSeaHex(state, footprint[1]);
  makeSeaHex(state, footprint[2]);
  makeSeaHex(state, footprint[3]);
  return { land: footprint[0], sea1: footprint[1], sea2: footprint[2], sea3: footprint[3] };
}

describe("sea hex identification (per-hex, not per-tile)", () => {
  it("treats island structures on a sea tile as land and the rest as open sea", () => {
    const state = makeGame();
    const tile = instantiateTile(state.adventure!, "W2", { row: 40, col: 20 }, 0, false);
    const ids = getTileFootprintSpaceIds(tile); // W2: [empty, mystical_garden, mine, buoy, sea_chest, shrine, survivor]
    expect(isSeaField(state, ids[0])).toBe(true); // empty field -> open sea
    expect(isSeaField(state, ids[3])).toBe(true); // buoy -> sea feature
    expect(isSeaField(state, ids[5])).toBe(true); // shrine stands in the water here
    expect(isSeaField(state, ids[2])).toBe(false); // mine -> island (land)
    expect(isSeaField(state, ids[1])).toBe(false); // mystical garden -> island (land)
  });

  it("a fabricated sea hex and a land hex coexist on the same tile", () => {
    const state = makeGame();
    const { land, sea1 } = seaSetup(state);
    expect(isSeaField(state, sea1)).toBe(true);
    expect(isSeaField(state, land)).toBe(false);
  });
});

describe("sea movement without Water Walk", () => {
  it("steps onto the sea but then halts (move points kept for combat)", () => {
    let state = makeGame();
    const { land, sea1 } = seaSetup(state);

    // The sea hex is enterable and not a forced stop by itself; crossing the
    // coastline is what halts the hero.
    expect(canCrossEdge(state, land, sea1)).toBe(true);
    expect(classifyHeroStep(state, heroP1(state), sea1)).toBe("open");

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea1 });
    expect(heroP1(state).spaceId).toBe(sea1);
    expect(heroP1(state).movementPoints).toBe(2); // kept, not zeroed
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);
    expect(getHeroMoveDestinations(state, heroP1(state))).toEqual([]);
    expectError(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: land });
  });

  it("moves freely within the sea (sea->sea does not halt)", () => {
    let state = makeGame();
    const { sea1, sea2, sea3 } = seaSetup(state);
    const hero = heroP1(state);
    hero.spaceId = sea1; // start the turn out on the sea

    expect(classifyHeroStep(state, hero, sea2)).toBe("open");
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [sea2, sea3] });
    expect(heroP1(state).spaceId).toBe(sea3);
    expect(heroP1(state).movementPoints).toBe(1); // two sea steps, no halt
    expect(heroP1(state).movementHaltedThisTurn).toBeFalsy();
  });

  it("wading off the sea onto land reaches the shore (no stranding) but halts", () => {
    const state = makeGame();
    const { land, sea1 } = seaSetup(state);
    const hero = heroP1(state);
    hero.spaceId = sea1; // as if the turn began on the sea

    expect(canCrossEdge(state, sea1, land)).toBe(true);
    expect(getHeroMoveDestinations(state, hero)).toContain(land);
    const moved = applyAction(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: land });
    expect(moved.errors).toHaveLength(0);
    expect(moved.state.heroes.hero_p1.spaceId).toBe(land);
    expect(moved.state.heroes.hero_p1.movementHaltedThisTurn).toBe(true);
  });

  it("a walk cannot cross the coastline and keep going", () => {
    const state = makeGame();
    const { land, sea1, sea2 } = seaSetup(state);
    expect(land).toBe(heroP1(state).spaceId); // hero on the land centre
    // land -> sea1 halts, so it cannot be a non-final step of a path.
    expectError(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [sea1, sea2] });
  });

  it("keeps the move points available for a neutral combat on the sea", () => {
    let state = makeGame();
    const { sea1 } = seaSetup(state);
    state.adventure!.fields[sea1].difficulty = 1; // undefended guards on the sea hex

    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: sea1 });
    expect(state.combat).not.toBeNull();
    expect(heroP1(state).movementHaltedThisTurn).toBe(true);
    expect(heroP1(state).movementPoints).toBe(2); // kept so the fight can continue
  });
});

describe("Water Walk spell", () => {
  it("removes the coastline halt — the hero crosses onto and across the sea", () => {
    let state = makeGame();
    const { sea1, sea2 } = seaSetup(state);
    state.players.p1.hand = ["spell.water_walk"];

    // Without the spell, crossing the coastline halts.
    expect(seaStepHalts(state, heroP1(state).spaceId!, sea1)).toBe(true);

    state = castMapPowerSpell(state, "spell.water_walk");
    expect(hasModifier(state, "p1", "HERO_WATER_WALK")).toBe(true);
    expect(getHeroMovementCapabilities(state, heroP1(state)).waterWalk).toBe(true);
    expect(seaStepHalts(state, heroP1(state).spaceId!, sea1, { moveThrough: false, waterWalk: true })).toBe(false);

    // land -> sea1 -> sea2 in one walk, no halt.
    state = applyOk(state, { type: "MOVE_HERO_PATH", playerId: "p1", heroId: "hero_p1", path: [sea1, sea2] });
    expect(heroP1(state).spaceId).toBe(sea2);
    expect(heroP1(state).movementPoints).toBe(1); // 3 - 2 steps
    expect(heroP1(state).movementHaltedThisTurn).toBeFalsy();
  });

  it("the Power 2 side also grants +2 movement", () => {
    let state = makeGame();
    seaSetup(state);
    state.players.p1.hand = ["spell.water_walk", "spell.haste", "spell.slow"];
    state = castMapPowerSpell(state, "spell.water_walk", ["spell.haste", "spell.slow"]);
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

/** Deploys a Secondary Hero for p1 on a footprint hex; returns its space id. */
function addSecondaryHero(state: GameState, footprint: string[], at?: string): string {
  const main = heroP1(state);
  const spaceId = at ?? footprint[2];
  expect(spaceId, "the home tile needs a spare hex for the Secondary Hero").toBeTruthy();
  state.heroes.hero_p1_secondary = {
    ...main,
    id: "hero_p1_secondary",
    kind: "secondary",
    level: 1,
    experience: 0,
    movementPoints: 2,
    spaceId: spaceId!
  };
  return spaceId!;
}

/**
 * Answers the WHO-travels window every Dimension Door cast now opens: pick the
 * Hero whose label matches, or the trailing "Cancel (no teleport)".
 */
function pickDimensionDoorHero(state: GameState, label: RegExp | "cancel"): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "dimension-door-hero") {
    throw new Error("no dimension-door-hero choice open");
  }
  const optionIndex =
    label === "cancel"
      ? choice.dimensionDoorHero!.heroIds.length
      : choice.options.findIndex((option) => label.test(option.label));
  expect(optionIndex, `no Dimension Door hero option for ${String(label)}`).toBeGreaterThanOrEqual(0);
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: choice.id,
    optionIndex
  });
}

/**
 * Cast Dimension Door at a Power tier (0 → no cost, 1+ → pay power cards) and
 * answer the WHO-travels window with the Main Hero, leaving the map-hex
 * destination pick open. The window itself is pinned by its own tests below.
 */
function playDimensionDoor(state: GameState, optionIndex: number, costCardIds: string[] = []): GameState {
  return pickDimensionDoorHero(castMapPowerSpell(state, "spell.dimension_door", costCardIds), /Main Hero/i);
}

function dimensionDoorDestinations(state: GameState): string[] {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "dimension-door") {
    throw new Error("no dimension-door choice open");
  }
  return choice.dimensionDoor?.destinations ?? [];
}

describe("Dimension Door spell", () => {
  it("is not offered when no tier has a valid landing field", () => {
    const state = withHand(makeGame(), [
      "spell.dimension_door",
      "spell.haste",
      "spell.slow",
      "stat.power",
      "ability.sorcery"
    ]);
    const hero = heroP1(state);
    for (const field of Object.values(state.adventure!.fields)) {
      if (field.spaceId !== hero.spaceId) {
        setField(state, field.spaceId, "blocked_field");
      }
    }

    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "spell.dimension_door"
      )
    ).toBe(false);
  });

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

    // The trailing option is "Cancel (no teleport)" — the Spell is already spent,
    // so cancelling moves nobody and refunds nothing.
    const destinationChoice = state.pendingChoice;
    if (destinationChoice?.type !== "OPTION_CHOICE") {
      throw new Error("missing Dimension Door destination choice");
    }
    expect(destinationChoice.options.at(-1)!.label).toBe("Cancel (no teleport)");
    const heroSpaceBefore = heroP1(state).spaceId;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: reachOne.length
    });
    expect(heroP1(state).spaceId).toBe(heroSpaceBefore);
    expect(state.pendingChoice).toBeNull();
    // NO refund: the card stays spent in the discard, out of hand.
    expect(state.players.p1.discard).toContain("spell.dimension_door");
    expect(state.players.p1.hand).not.toContain("spell.dimension_door");
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

  it("lets the caster choose a Secondary Hero before choosing its destination", () => {
    let state = withHand(makeGame(), ["spell.dimension_door"]);
    const { hero: main, footprint } = dimensionDoorSetup(state);
    const mainStart = main.spaceId;
    const secondaryStart = addSecondaryHero(state, footprint);

    state = castMapPowerSpell(state, "spell.dimension_door", []);
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "dimension-door-hero"
    });
    state = pickDimensionDoorHero(state, /Secondary Hero/i);

    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "dimension-door",
      dimensionDoor: { heroId: "hero_p1_secondary" }
    });
    const destinations = dimensionDoorDestinations(state);
    const target = destinations.find((spaceId) => spaceId !== mainStart);
    expect(target).toBeTruthy();
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: destinations.indexOf(target!)
    });

    // CONTROL: the Main Hero is untouched when the Secondary travels.
    expect(state.heroes.hero_p1_secondary.spaceId).toBe(target);
    expect(state.heroes.hero_p1.spaceId).toBe(mainStart);
    expect(secondaryStart).not.toBe(target);
  });

  // The user-requested shape (2026-08-04): "a window with Main Hero / Secondary
  // Hero / Cancel. Then you select location from the map accordingly."
  describe("the WHO-travels window", () => {
    it("opens for EVERY cast — Main Hero, Secondary Hero, Cancel — before any destination", () => {
      let state = withHand(makeGame(), ["spell.dimension_door"]);
      const { footprint } = dimensionDoorSetup(state);
      addSecondaryHero(state, footprint);

      state = castMapPowerSpell(state, "spell.dimension_door", []);
      const choice = state.pendingChoice;
      if (choice?.type !== "OPTION_CHOICE" || choice.context !== "dimension-door-hero") {
        throw new Error("missing the Dimension Door hero window");
      }
      // Exactly one option per eligible hero plus the trailing Cancel — never a
      // destination list at this step.
      expect(choice.options.map((option) => option.label)).toEqual([
        "Main Hero",
        "Secondary Hero",
        "Cancel (no teleport)"
      ]);
      expect(choice.dimensionDoorHero!.heroIds).toEqual(["hero_p1", "hero_p1_secondary"]);
      expect(choice.dimensionDoor).toBeUndefined();
      // Hidden info: the labels name public map heroes only, no card/hand data.
      expect(choice.options.every((option) => !/spell\.|stat\./.test(option.label))).toBe(true);
    });

    it("CONTROL: a lone Main Hero still gets the window (Main Hero + Cancel only)", () => {
      let state = withHand(makeGame(), ["spell.dimension_door"]);
      dimensionDoorSetup(state);

      state = castMapPowerSpell(state, "spell.dimension_door", []);
      const choice = state.pendingChoice;
      if (choice?.type !== "OPTION_CHOICE" || choice.context !== "dimension-door-hero") {
        throw new Error("the hero window must open even with one eligible hero");
      }
      expect(choice.options.map((option) => option.label)).toEqual(["Main Hero", "Cancel (no teleport)"]);
      expect(choice.dimensionDoorHero!.heroIds).toEqual(["hero_p1"]);
    });

    it("omits a Hero with no legal destination at the resolved Power", () => {
      let state = withHand(makeGame(), ["spell.dimension_door"]);
      const { footprint } = dimensionDoorSetup(state);
      const mainSpace = heroP1(state).spaceId!;
      const mainCoord = parseHexSpaceId(mainSpace)!;
      const spaceIds = Object.keys(state.adventure!.fields);
      // Wall the Secondary in while leaving the Main Hero exactly one landing:
      // find a Secondary spot and a keep-open field adjacent to the Main but
      // OUT of the Secondary's Power-0 reach, then block everything else.
      let plan: { secondary: string; keep: string } | null = null;
      for (const candidate of footprint) {
        if (candidate === mainSpace) {
          continue;
        }
        const candidateCoord = parseHexSpaceId(candidate)!;
        const keep = spaceIds.find((spaceId) => {
          const coord = parseHexSpaceId(spaceId);
          return (
            coord !== null &&
            spaceId !== mainSpace &&
            spaceId !== candidate &&
            hexDistance(mainCoord, coord) === 1 &&
            hexDistance(candidateCoord, coord) >= 2
          );
        });
        if (keep) {
          plan = { secondary: candidate, keep };
          break;
        }
      }
      expect(plan, "the home tile should allow a walled-in Secondary Hero").toBeTruthy();
      addSecondaryHero(state, footprint, plan!.secondary);
      setField(state, plan!.keep, "empty_field");
      for (const spaceId of spaceIds) {
        if (spaceId === mainSpace || spaceId === plan!.secondary || spaceId === plan!.keep) {
          continue;
        }
        setField(state, spaceId, "blocked_field");
      }

      state = castMapPowerSpell(state, "spell.dimension_door", []);
      const choice = state.pendingChoice;
      if (choice?.type !== "OPTION_CHOICE" || choice.context !== "dimension-door-hero") {
        throw new Error("missing the Dimension Door hero window");
      }
      expect(choice.dimensionDoorHero!.heroIds).toEqual(["hero_p1"]);
      expect(choice.options.some((option) => /Secondary/i.test(option.label))).toBe(false);
    });

    it("Cancel at the hero step moves nobody and does NOT refund the Spell", () => {
      let state = withHand(makeGame(), ["spell.dimension_door"]);
      const { footprint } = dimensionDoorSetup(state);
      const secondaryStart = addSecondaryHero(state, footprint);
      const mainStart = heroP1(state).spaceId;

      state = castMapPowerSpell(state, "spell.dimension_door", []);
      state = pickDimensionDoorHero(state, "cancel");

      expect(state.pendingChoice).toBeNull();
      expect(state.phase).toBe("player-turn");
      expect(heroP1(state).spaceId).toBe(mainStart);
      expect(state.heroes.hero_p1_secondary.spaceId).toBe(secondaryStart);
      // The Spell was cast before the window opened: spent, never refunded.
      expect(state.players.p1.discard).toContain("spell.dimension_door");
      expect(state.players.p1.hand).not.toContain("spell.dimension_door");
    });

    it("lands the chosen Hero on the EXACT hex picked, not the first listed one", () => {
      let state = withHand(makeGame(), ["spell.dimension_door", "spell.haste", "spell.slow"]);
      dimensionDoorSetup(state);
      state = playDimensionDoor(state, 1, ["spell.haste", "spell.slow"]);
      const destinations = dimensionDoorDestinations(state);
      // Pick the LAST candidate: a resolver that ignored the clicked index (or
      // used destinations[0]) would land somewhere else and fail here.
      expect(destinations.length).toBeGreaterThan(1);
      const picked = destinations[destinations.length - 1]!;
      expect(picked).not.toBe(destinations[0]);
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice!.id,
        optionIndex: destinations.length - 1
      });
      expect(heroP1(state).spaceId).toBe(picked);
      expect(state.pendingChoice).toBeNull();
    });
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
// Knowledge on the map: the map play path bypasses the combat stack, so it
// needs its own explicit take-back decision after the Spell resolves. The map
// has no spell limit, so regular Knowledge never needs its expert side here.
// ---------------------------------------------------------------------------

describe("Knowledge after a map Spell", () => {
  function openKnowledgeAfterDimensionDoor(): GameState {
    let state = withHand(makeGame(), ["spell.dimension_door", "stat.knowledge"]);
    state.players.p1.limits.expertUses = 1;
    dimensionDoorSetup(state);
    // RAW cast: the recall is offered before ANY Dimension Door window, so not
    // even the WHO-travels pick is open yet.
    state = castMapPowerSpell(state, "spell.dimension_door", []);

    // Dimension Door's teleport resolves through a destination pick that can
    // drop the hero into a fight, so the recall is offered BEFORE the teleport
    // (like a combat cast) — the Knowledge choice is pending immediately, and
    // the destination pick only opens once the recall is answered. It must NOT
    // be stranded behind the teleport/fight.
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.pendingVisit?.steps[0]).toMatchObject({ type: "CHOOSE_ONE" });
    return state;
  }

  it("basic Knowledge takes the map Spell back with NO crown (no outside-combat spell limit)", () => {
    let state = openKnowledgeAfterDimensionDoor();
    const prompt = state.adventure!.pendingVisit!.steps[0];
    expect(prompt.type === "CHOOSE_ONE" ? prompt.prompt : "").toMatch(/Knowledge/i);
    // Basic (no crown) first, decline last. No expert spell-limit option exists
    // on the map because map casts have no spell limit.
    expect(prompt.type === "CHOOSE_ONE" ? prompt.options.map((o) => o.label) : []).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Use Knowledge: return/i),
        expect.stringMatching(/Keep Knowledge/i)
      ])
    );

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).toContain("spell.dimension_door");
    expect(state.players.p1.hand).not.toContain("stat.knowledge");
    expect(state.players.p1.discard).toContain("stat.knowledge");
    expect(state.players.p1.discard).not.toContain("spell.dimension_door");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(state.players.p1.combatStats.spellLimitBonusThisRound).toBe(0);
  });

  it("does not offer Knowledge expert even when a crown is available", () => {
    const state = openKnowledgeAfterDimensionDoor();
    const prompt = state.adventure!.pendingVisit!.steps[0];
    expect(
      prompt.type === "CHOOSE_ONE"
        ? prompt.options.some((option) => /Knowledge expert/i.test(option.label))
        : true
    ).toBe(false);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("declining keeps Knowledge and its crown, leaving the map Spell spent", () => {
    let state = openKnowledgeAfterDimensionDoor();
    // Decline is the last option.
    const prompt = state.adventure!.pendingVisit!.steps[0];
    const declineIndex =
      prompt.type === "CHOOSE_ONE" ? prompt.options.findIndex((o) => /Keep Knowledge/i.test(o.label)) : -1;
    expect(declineIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: declineIndex });

    expect(state.players.p1.hand).toContain("stat.knowledge");
    expect(state.players.p1.hand).not.toContain("spell.dimension_door");
    expect(state.players.p1.discard).toContain("spell.dimension_door");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("basic Knowledge works with zero crowns (CONTROL: expert is not required)", () => {
    let state = withHand(makeGame(), ["spell.dimension_door", "stat.knowledge"]);
    state.players.p1.limits.expertUses = 0; // no crowns at all
    dimensionDoorSetup(state);
    state = castMapPowerSpell(state, "spell.dimension_door", []);
    // Recall is offered before the teleport (see openKnowledgeAfterDimensionDoor).
    expect(state.pendingChoice).toBeNull();
    // Only basic + decline — no expert arm without crowns.
    const prompt = state.adventure!.pendingVisit!.steps[0];
    expect(prompt.type === "CHOOSE_ONE" ? prompt.options.map((o) => o.label) : []).toEqual([
      expect.stringMatching(/Use Knowledge: return/i),
      expect.stringMatching(/Keep Knowledge/i)
    ]);
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).toContain("spell.dimension_door");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  // The reported bug: Dimension Door onto a guard opened the fight, and the
  // recall prompt only surfaced AFTER the whole fight was played out (its reward
  // was stranded behind the open combat). The recall must be offered — and be
  // resolvable — BEFORE the teleport opens the fight, exactly like a combat cast.
  it("offers the recall BEFORE the teleport fight, never stranded behind the combat", () => {
    let state = withHand(makeGame(), ["spell.dimension_door", "stat.knowledge"]);
    state.players.p1.limits.expertUses = 1;
    const { near } = dimensionDoorSetup(state);
    // Make a reachable (Power-0 range 1) landing a live neutral guard, so
    // teleporting there opens a fight.
    const guarded = near[0]!;
    setField(state, guarded, "empty_field");
    state.adventure!.fields[guarded]!.difficulty = 1; // live guards, nobody's flag

    state = castMapPowerSpell(state, "spell.dimension_door", []);

    // Immediately after the cast: recall is pending, no destination pick yet, no
    // fight yet. (Reverting the reorder makes the destination choice pending here
    // instead, so pendingChoice would be non-null — this discriminates the fix.)
    expect(state.combat).toBeFalsy();
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");

    // Recall Dimension Door back to hand — the whole point: done before the fight.
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).toContain("spell.dimension_door");

    // The WHO-travels window (and only then the destination pick) opens now;
    // teleport onto the guard to start the fight — the spell is already safely
    // recalled, and the combat is real.
    state = pickDimensionDoorHero(state, /Main Hero/i);
    const destinations = dimensionDoorDestinations(state);
    const guardedIndex = destinations.indexOf(guarded);
    expect(guardedIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: guardedIndex
    });
    expect(state.combat, "teleport onto a guard opens the fight").toBeTruthy();
    expect(state.players.p1.hand).toContain("spell.dimension_door");
  });

  it("marks a lasting map Spell to return after its effect ends instead of duplicating an active card", () => {
    let state = withHand(makeGame(), ["spell.fly", "stat.knowledge"]);
    state.players.p1.limits.expertUses = 1;
    // Knowledge can also pay Power — resolve at Power 0 so Knowledge stays for recall.
    state = castMapPowerSpell(state, "spell.fly");

    expect(state.players.p1.ongoingCards?.find((entry) => entry.cardId === "spell.fly")?.returnTo).toBe("discard");
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).not.toContain("spell.fly");
    expect(state.players.p1.ongoingCards?.find((entry) => entry.cardId === "spell.fly")?.returnTo).toBe("hand");
  });

  it("a Book map Spell (Fly) recalled is marked to return to the Spell Book, not the hand", () => {
    const base = createAdventureGameState({
      seed: "map-book-recall",
      difficulty: "normal",
      rollFirstPlayer: false,
      spellBook: true
    });
    for (const player of Object.values(base.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    let state = withHand(base, ["stat.knowledge"]);
    state.players.p1.spellBook = ["spell.fly"]; // Fly lives in the Book
    state.players.p1.limits.expertUses = 1;

    const fly = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "spell.fly" &&
        legal.action.fromSpellBook === true
    );
    expect(fly, "a Book Fly should be playable from the map").toBeTruthy();
    state = applyOk(state, fly!.action);
    // Resolve boost if Knowledge is offered as a Power source (keep it for recall).
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "map-spell-boost") {
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        optionIndex: state.pendingChoice.mapSpellBoost?.offers.length ?? state.pendingChoice.options.length - 1
      });
    }
    expect(state.players.p1.spellBook).not.toContain("spell.fly"); // held ongoing, out of the Book

    // Take it back with basic Knowledge → marked to return to the BOOK (a
    // private zone) when Fly's effect ends, never the public hand. No crown.
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.ongoingCards?.find((entry) => entry.cardId === "spell.fly")?.returnTo).toBe("spellBook");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Town Portal spell (map): teleport to a controlled town/settlement, with a
// Power-scaled movement bonus on arrival and the "occupied town" restriction.
// ---------------------------------------------------------------------------

describe("Town Portal spell", () => {
  /** A settlement field on the hero's tile, flagged for p1, away from the hero. */
  function flagSettlement(state: GameState, spaceId: string): void {
    setField(state, spaceId, "settlement");
    state.adventure!.fields[spaceId]!.flagOwnerId = "p1";
  }

  function townPortalOptions(state: GameState): { label: string }[] {
    const step = state.adventure?.pendingVisit?.steps[0];
    if (!step || step.type !== "CHOOSE_ONE") {
      throw new Error("no Town Portal destination choice open");
    }
    return step.options;
  }

  function townPortalDestinationIndex(state: GameState, spaceId: string): number {
    const step = state.adventure?.pendingVisit?.steps[0];
    if (!step || step.type !== "CHOOSE_ONE") {
      throw new Error("no Town Portal destination choice open");
    }
    return step.options.findIndex((option) =>
      option.steps.some((inner) => inner.type === "TELEPORT_HERO" && inner.spaceId === spaceId)
    );
  }

  function townPortalHeroDestinationIndex(state: GameState, heroId: string, spaceId: string): number {
    const step = state.adventure?.pendingVisit?.steps[0];
    if (!step || step.type !== "CHOOSE_ONE") {
      throw new Error("no Town Portal destination choice open");
    }
    return step.options.findIndex((option) =>
      option.steps.some(
        (inner) => inner.type === "TELEPORT_HERO" && inner.heroId === heroId && inner.spaceId === spaceId
      )
    );
  }

  it("is not offered without a controlled destination", () => {
    const state = withHand(makeGame(), [
      "spell.town_portal",
      "spell.haste",
      "spell.slow",
      "stat.power",
      "ability.sorcery"
    ]);
    for (const field of Object.values(state.adventure!.fields)) {
      if (field.location === "settlement") {
        field.flagOwnerId = null;
      }
    }
    for (const town of Object.values(state.towns)) {
      if (town.controllerId === "p1" && town.fieldId !== heroP1(state).spaceId) {
        town.controllerId = "p2";
      }
    }

    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "spell.town_portal"
      )
    ).toBe(false);
  });

  it("Power 0 teleports to a controlled settlement with no movement bonus", () => {
    let state = withHand(makeGame(), ["spell.town_portal"]);
    const hero = heroP1(state);
    hero.movementPoints = 2;
    const dest = heroTileFootprint(state)[4];
    flagSettlement(state, dest);

    state = castMapPowerSpell(state, "spell.town_portal");

    const destIndex = townPortalDestinationIndex(state, dest);
    expect(destIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: destIndex });

    expect(heroP1(state).spaceId).toBe(dest);
    expect(heroP1(state).movementPoints).toBe(2); // unchanged on the Power 0 side
  });

  it("the Power 2 side teleports AND grants +1 movement (paid with power-source cards)", () => {
    let state = withHand(makeGame(), ["spell.town_portal", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    hero.movementPoints = 1;
    const dest = heroTileFootprint(state)[4];
    flagSettlement(state, dest);

    state = castMapPowerSpell(state, "spell.town_portal", ["spell.haste", "spell.slow"]);

    const destIndex = townPortalDestinationIndex(state, dest);
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: destIndex });

    expect(heroP1(state).spaceId).toBe(dest);
    expect(heroP1(state).movementPoints).toBe(2); // 1 kept + 1 from the Power 2 side
  });

  it("withholds a destination already holding another hero when this hero can't move out", () => {
    let state = withHand(makeGame(), ["spell.town_portal"]);
    const hero = heroP1(state);
    hero.movementPoints = 0; // no movement to step back out after arriving
    const footprint = heroTileFootprint(state);
    const occupied = footprint[3];
    const free = footprint[4];
    flagSettlement(state, occupied);
    flagSettlement(state, free);
    // Park another hero on the occupied settlement.
    const otherHero = Object.values(state.heroes).find((entry) => entry.id !== hero.id);
    if (!otherHero) {
      throw new Error("expected a second hero in the default 2-player setup");
    }
    otherHero.spaceId = occupied;

    state = castMapPowerSpell(state, "spell.town_portal");

    expect(townPortalDestinationIndex(state, free)).toBeGreaterThanOrEqual(0); // free settlement offered
    expect(townPortalDestinationIndex(state, occupied)).toBe(-1); // occupied one withheld
  });

  it("offers the hero-occupied destination when the Power bonus lets the hero move out", () => {
    let state = withHand(makeGame(), ["spell.town_portal", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    hero.movementPoints = 0;
    const occupied = heroTileFootprint(state)[3];
    flagSettlement(state, occupied);
    const otherHero = Object.values(state.heroes).find((entry) => entry.id !== hero.id);
    if (!otherHero) {
      throw new Error("expected a second hero in the default 2-player setup");
    }
    otherHero.spaceId = occupied;

    // Power 2 grants +1 movement on arrival, so the hero could step out: the
    // occupied settlement becomes a legal destination again.
    state = castMapPowerSpell(state, "spell.town_portal", ["spell.haste", "spell.slow"]);

    expect(townPortalDestinationIndex(state, occupied)).toBeGreaterThanOrEqual(0);
    expect(townPortalOptions(state).some((option) => /h:-?\d+:-?\d+/.test(option.label))).toBe(false);
  });

  it("lets the player choose main or secondary hero and never targets a Random Town", () => {
    let state = withHand(makeGame(), ["spell.town_portal"]);
    const main = heroP1(state);
    const footprint = heroTileFootprint(state);
    const secondaryStart = footprint[2];
    const settlement = footprint[4];
    const randomTown = footprint[5];
    flagSettlement(state, settlement);
    setField(state, randomTown, "random_town");
    state.adventure!.fields[randomTown]!.flagOwnerId = "p1";
    // Regression: even a stale/hand-authored TownState may not make a Random
    // Town a Town Portal target.
    state.towns.random_town_record = {
      id: "random_town_record",
      controllerId: "p1",
      buildings: [],
      factionId: "castle",
      fieldId: randomTown
    };
    state.heroes.hero_p1_secondary = {
      id: "hero_p1_secondary",
      controllerId: "p1",
      kind: "secondary",
      level: 1,
      experience: 0,
      movementPoints: 2,
      movementPointsMax: 2,
      spaceId: secondaryStart
    };

    state = castMapPowerSpell(state, "spell.town_portal");

    const mainIndex = townPortalHeroDestinationIndex(state, main.id, settlement);
    const secondaryIndex = townPortalHeroDestinationIndex(state, "hero_p1_secondary", settlement);
    expect(mainIndex).toBeGreaterThanOrEqual(0);
    expect(secondaryIndex).toBeGreaterThanOrEqual(0);
    expect(townPortalDestinationIndex(state, randomTown)).toBe(-1);
    expect(townPortalOptions(state).some((option) => option.label.startsWith("Main Hero →"))).toBe(true);
    expect(townPortalOptions(state).some((option) => option.label.startsWith("Secondary Hero →"))).toBe(true);

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: secondaryIndex });
    expect(state.heroes.hero_p1_secondary.spaceId).toBe(settlement);
    expect(heroP1(state).spaceId).toBe(main.spaceId);
  });
});

// ---------------------------------------------------------------------------
// Fortune spell (map): rerolls the Treasure/Resource dice (the combat Attack-die
// reroll scales with Hero Power and is covered in reducer.test.ts).
// ---------------------------------------------------------------------------

describe("Fortune spell (map)", () => {
  function fortuneEffect(state: GameState) {
    return state.activeEffects.find((effect) => effect.name === "Fortune");
  }

  function adventureRerollBudget(state: GameState): number | undefined {
    const modifier = fortuneEffect(state)?.modifiers.find((m) => m.type === "ADVENTURE_DIE_REROLL");
    return modifier?.type === "ADVENTURE_DIE_REROLL" ? modifier.rerolls : undefined;
  }

  it("is offered on the adventure map (a Spell that is not a Map effect, yet useful there)", () => {
    const state = withHand(makeGame(), ["spell.fortune"]);
    const offered = getLegalActions(state, "p1").some(
      (entry) => entry.action.type === "PLAY_CARD" && entry.action.cardId === "spell.fortune"
    );
    expect(offered).toBe(true);
  });

  it("Power 0 (no power-source cards to spend) grants a single shared Treasure/Resource reroll", () => {
    let state = withHand(makeGame(), ["spell.fortune"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
    // Nothing left in hand to boost with, so the effect is created at Power 0.
    expect(state.pendingChoice).toBeNull();
    const fortune = fortuneEffect(state);
    expect(fortune).toBeTruthy();
    const adventureModifiers = fortune!.modifiers.filter((m) => m.type === "ADVENTURE_DIE_REROLL");
    expect(adventureModifiers).toHaveLength(2); // treasure + resource share one budget
    expect(adventureRerollBudget(state)).toBe(1);
  });

  it("scales the map reroll budget by discarding power-source cards (Power 0/1/2 -> 1/2/3)", () => {
    let state = withHand(makeGame(), ["spell.fortune", "spell.haste", "spell.slow"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
    // The boost opens: discard a power-source card for +1 reroll, or play now.
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("fortune-boost");
    // Discard the first card (option 0) -> Power 1.
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("fortune-boost");
    // Discard the second card (option 0, the only one left) -> Power 2 (max) -> effect created.
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.pendingChoice).toBeNull();
    expect(adventureRerollBudget(state)).toBe(3);
    expect(state.players.p1.hand).not.toContain("spell.haste");
    expect(state.players.p1.hand).not.toContain("spell.slow");
  });

  it("declining the boost plays Fortune now at the current Power", () => {
    let state = withHand(makeGame(), ["spell.fortune", "spell.haste"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("fortune-boost");
    // The trailing option is "Play now" — decline the boost, keep Haste.
    const playNowIndex = choice?.type === "OPTION_CHOICE" ? choice.options.length - 1 : 0;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: playNowIndex
    });
    expect(adventureRerollBudget(state)).toBe(1); // Power 0
    expect(state.players.p1.hand).toContain("spell.haste"); // not spent
  });

  it("offers and spends a Fortune reroll when a Resource die is rolled, then is used up", () => {
    let state = withHand(makeGame(), ["spell.fortune"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
    expect(adventureRerollBudget(state)).toBe(1);

    // Step onto an unguarded Resources field, which rolls a Resource die.
    const dest = heroTileFootprint(state)[1];
    setField(state, dest, "resource_symbol");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: dest });

    const step = state.adventure?.pendingVisit?.steps[0];
    if (!step || step.type !== "CHOOSE_ONE") {
      throw new Error("expected a resource-die choice with a Fortune reroll option");
    }
    const rerollIndex = step.options.findIndex((option) => option.label.includes("Fortune"));
    expect(rerollIndex).toBeGreaterThanOrEqual(0);

    // Spend the reroll: the single-reroll budget is now exhausted and the effect ends.
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: rerollIndex });
    expect(fortuneEffect(state)).toBeUndefined();
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

  it("enters and visits an adjacent Subterranean Gate so its hidden side can reveal", () => {
    let state = withHand(makeGame(), ["ability.logistics"]);
    const [gateId] = adjacentCrossableFields(state);
    const gate = state.adventure!.fields[gateId]!;
    gate.location = "subterranean_gate";
    gate.borderEdges = [0, 1, 2, 3, 4, 5];

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.logistics",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    state = applyOk(state, { type: "END_TURN", playerId: "p1" });

    const choose = state.adventure?.pendingVisit?.steps[0];
    expect(choose?.type).toBe("CHOOSE_ONE");
    const optionIndex =
      choose?.type === "CHOOSE_ONE"
        ? choose.options.findIndex((option) => {
            const step = option.steps[0];
            return step?.type === "TELEPORT_HERO" && step.spaceId === gateId;
          })
        : -1;
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    const gateStep = choose?.type === "CHOOSE_ONE" ? choose.options[optionIndex].steps[0] : undefined;
    expect(gateStep?.type === "TELEPORT_HERO" ? gateStep.visit : false).toBe(true);

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
    expect(heroP1(state).spaceId).toBe(gateId);
  });
});

// ---------------------------------------------------------------------------
// "Empty field" detection for the end-of-turn step (Logistics basic / Nomads).
// Rulebook: a field counts as empty when it can no longer trigger anything —
// truly empty fields, used (black-cube) visitables, and fields carrying THIS
// player's faction cube. Anything that can still trigger is excluded.
// ---------------------------------------------------------------------------

/** Adjacent fields the p1 hero can actually cross to, once each is a clean field. */
function adjacentCrossableFields(state: GameState): string[] {
  const heroSpace = heroP1(state).spaceId as string;
  return getAdjacentSpaceIds(heroSpace).filter((spaceId) => {
    if (!state.adventure?.fields[spaceId]) {
      return false;
    }
    setField(state, spaceId, "empty_field");
    return canCrossEdge(state, heroSpace, spaceId);
  });
}

describe("end-of-turn move: empty-field detection", () => {
  it("treats a carved Subterranean Gate as empty even when its old field edge was sealed", () => {
    const state = withHand(makeGame(), []);
    const [gateId] = adjacentCrossableFields(state);
    const heroSpace = heroP1(state).spaceId as string;
    const gate = state.adventure!.fields[gateId]!;
    gate.location = "subterranean_gate";
    gate.borderEdges = [0, 1, 2, 3, 4, 5];

    expect(canCrossEdge(state, heroSpace, gateId)).toBe(true);
    expect(getEndTurnMoveDestinations(state, "p1")).toContain(gateId);

    gate.location = "empty_field";
    expect(canCrossEdge(state, heroSpace, gateId)).toBe(false);
    expect(getEndTurnMoveDestinations(state, "p1")).not.toContain(gateId);
  });

  it("counts empty fields and used (black-cube) visitables, never ones that can still trigger", () => {
    const state = withHand(makeGame(), []);
    const fields = adjacentCrossableFields(state);
    // The hero sits at a tile centre, so all six ring hexes are reachable.
    expect(fields.length).toBeGreaterThanOrEqual(6);
    const [emptyF, usedVisitF, freshVisitF, myMineF, enemyMineF, guardedF] = fields;

    // 1) plain empty field — valid
    setField(state, emptyF, "empty_field");
    // 2) visitable that has been used (black cube) — "no longer provides an effect" — valid
    setField(state, usedVisitF, "resource_symbol");
    state.adventure!.fields[usedVisitF]!.blackCube = true;
    // 3) visitable not yet used — would still trigger — NOT valid
    setField(state, freshVisitF, "resource_symbol");
    // 4) mine flagged by this player (own faction cube) — valid
    setField(state, myMineF, "mine");
    state.adventure!.fields[myMineF]!.flagOwnerId = "p1";
    state.adventure!.fields[myMineF]!.everFlagged = true;
    // 5) mine flagged by the enemy — capturing it would trigger — NOT valid
    setField(state, enemyMineF, "mine");
    state.adventure!.fields[enemyMineF]!.flagOwnerId = "p2";
    state.adventure!.fields[enemyMineF]!.everFlagged = true;
    // 6) field still holding undefeated guards — NOT valid
    setField(state, guardedF, "resource_symbol");
    state.adventure!.fields[guardedF]!.difficulty = 1;

    const destinations = new Set(getEndTurnMoveDestinations(state, "p1"));
    expect(destinations.has(emptyF)).toBe(true);
    expect(destinations.has(usedVisitF)).toBe(true);
    expect(destinations.has(myMineF)).toBe(true);
    expect(destinations.has(freshVisitF)).toBe(false);
    expect(destinations.has(enemyMineF)).toBe(false);
    expect(destinations.has(guardedF)).toBe(false);
  });

  it("excludes blocked fields and fields occupied by another hero", () => {
    const state = withHand(makeGame(), []);
    const fields = adjacentCrossableFields(state);
    const [blockedF, occupiedF, openF] = fields;

    setField(state, openF, "empty_field");
    setField(state, blockedF, "blocked_field");
    setField(state, occupiedF, "empty_field");
    // Park the p1 Secondary hero on the occupied field.
    state.heroes.hero_p1_secondary = {
      id: "hero_p1_secondary",
      kind: "secondary",
      controllerId: "p1",
      heroDefId: heroP1(state).heroDefId,
      spaceId: occupiedF,
      movementPoints: 0
    } as (typeof state.heroes)[string];

    const destinations = new Set(getEndTurnMoveDestinations(state, "p1"));
    expect(destinations.has(openF)).toBe(true);
    expect(destinations.has(blockedF)).toBe(false);
    expect(destinations.has(occupiedF)).toBe(false);
  });
});
