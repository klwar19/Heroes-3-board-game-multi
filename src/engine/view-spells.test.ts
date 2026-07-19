import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { spellDeckBinhBasic, spellDeckBinhExpert, spellDeckLegacy } from "@/data/cards/spells";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexDistance,
  parseHexSpaceId,
  type GameAction,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// View Air (Basic Air, Map) and View Earth (Basic Earth, Map).
//
// Cast-then-boost (like combat / Visions): play the spell first, then discard
// Power sources one at a time, then resolve at the final Power.
//
// View Air — "Gain: Power 0 -> 3 gold; Power 1 -> 2 Building Materials; Power 2
//   -> 1 Valuables."
//
// View Earth — "Choose enemy Mine within X fields: Power 0 -> 1; Power 1 -> 2;
//   Power 2 -> 3."
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "view-spells", difficulty: "normal", rollFirstPlayer: false });
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
  const next = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
  next.players.p1.hand = [...cards];
  return next;
}

function heroP1(state: GameState) {
  const hero = state.heroes.hero_p1;
  if (!hero?.spaceId) {
    throw new Error("missing p1 hero / position");
  }
  return hero;
}

/** Cast a map Power-tier spell (opens the boost window when Power can rise). */
function cast(state: GameState, cardId: string): GameState {
  return applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId,
    mode: "basic",
    target: { type: "none" }
  });
}

function choose(state: GameState, optionIndex: number): GameState {
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: state.pendingChoice!.id,
    optionIndex
  });
}

/** Discard a basic Power source mid-boost, or resolve-now when cardId is null. */
function boost(state: GameState, cardId: string | null, mode: "basic" | "expert" = "basic"): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "map-spell-boost" || !choice.mapSpellBoost) {
    throw new Error("expected a map-spell-boost choice");
  }
  if (cardId === null) {
    return choose(state, choice.mapSpellBoost.offers.length); // trailing "Resolve now"
  }
  const index = choice.mapSpellBoost.offers.findIndex(
    (offer) => offer.kind === "card" && offer.cardId === cardId && offer.mode === mode
  );
  expect(index, `boost offer for ${cardId} (${mode})`).toBeGreaterThanOrEqual(0);
  return choose(state, index);
}

/**
 * Legacy helper name used by older View Earth cases: cast + optional power
 * discards + resolve at that Power. costCardIds are discarded in order (basic).
 */
function play(state: GameState, cardId: string, _optionIndex: number, costCardIds: string[] = []): GameState {
  let next = cast(state, cardId);
  for (const costId of costCardIds) {
    next = boost(next, costId);
  }
  if (next.pendingChoice?.type === "OPTION_CHOICE" && next.pendingChoice.context === "map-spell-boost") {
    next = boost(next, null);
  }
  return next;
}

/** A field space at exactly `n` straight-line hexes east of `from`. */
function spaceAtDistance(from: string, n: number): string {
  const coord = parseHexSpaceId(from);
  if (!coord) {
    throw new Error(`bad space ${from}`);
  }
  // East (offset [0,+1] on any row) moves one hex per step in a straight line,
  // so n steps east lands exactly n hexes away.
  const target = { row: coord.row, col: coord.col + n };
  const id = `h:${target.row}:${target.col}`;
  expect(hexDistance(coord, target)).toBe(n); // guard the geometry assumption
  return id;
}

/**
 * Drops a Mine onto the map at `spaceId`, owned by `owner` (or unflagged when
 * null), producing `amount` of `resource`. An owned Mine also seeds the owner's
 * production so a capture can be seen to move it off them. Fields here are
 * synthetic (no real tile) — View Earth's code path never looks up the tile, it
 * only reads location / flagOwnerId / resource / amount / distance.
 */
function placeMine(
  state: GameState,
  spaceId: string,
  owner: "p1" | "p2" | null,
  resource: "gold" | "buildingMaterials" | "valuables",
  amount: number
): void {
  const adventure = state.adventure;
  if (!adventure) {
    throw new Error("no adventure");
  }
  adventure.fields[spaceId] = {
    spaceId,
    tileInstanceId: "test-mine",
    slot: 0,
    location: "mine",
    resource,
    amount,
    blackCube: false,
    flagOwnerId: owner,
    everFlagged: owner !== null,
    settlementResource: null
  };
  if (owner) {
    state.players[owner].production[resource] += amount;
  }
}

function viewAirCasts(state: GameState): number {
  return getLegalActions(state, "p1").filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air"
  ).length;
}

function viewEarthCasts(state: GameState): number {
  return getLegalActions(state, "p1").filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_earth"
  ).length;
}

// ===========================================================================
// View Air
// ===========================================================================

describe("View Air card definition", () => {
  it("is an implemented Basic Air Map spell with three resource tiers", () => {
    const card = cardLibrary["spell.view_air"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.kind).toBe("spell");
    expect(card.timing).toBe("map");
    expect(card.spellLevel).toBe("basic");
    expect(card.spellSchools).toEqual(["air"]);
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      throw new Error("expected CHOOSE_ONE");
    }
    const [gold, materials, valuables] = card.effect.options;
    // Power 0: 3 gold, free.
    expect(gold.effect).toEqual({ type: "GAIN_RESOURCES", gain: { gold: 3 } });
    expect(gold.cost).toBeUndefined();
    expect(gold.mapOnly).toBe(true);
    // Power 1: 2 building materials, pay 1 Power value (Spells / Power cards).
    expect(materials.effect).toEqual({ type: "GAIN_RESOURCES", gain: { buildingMaterials: 2 } });
    expect(materials.cost).toEqual({ powerCost: 1, costCardFilter: "power-source" });
    // Power 2: 1 valuables, pay 2 Power value.
    expect(valuables.effect).toEqual({ type: "GAIN_RESOURCES", gain: { valuables: 1 } });
    expect(valuables.cost).toEqual({ powerCost: 2, costCardFilter: "power-source" });
  });

  it("is reachable: in the legacy and BINH-basic Spell decks", () => {
    expect(spellDeckLegacy).toContain("spell.view_air");
    expect(spellDeckBinhBasic).toContain("spell.view_air");
    expect(spellDeckBinhExpert).not.toContain("spell.view_air"); // it is a Basic spell
  });
});

describe("View Air resource gains (cast, then add Power)", () => {
  it("cast opens a boost window; Resolve now at Power 0 gains 3 gold", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste"]);
    const goldBefore = state.players.p1.resources.gold;
    state = cast(state, "spell.view_air");
    expect(state.players.p1.discard).toContain("spell.view_air");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("map-spell-boost");
    // Haste is still available to boost — decline and resolve at Power 0.
    state = boost(state, null);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.hand).toEqual(["spell.haste"]);
    expect(state.pendingChoice).toBeNull();
  });

  it("discarding one Power source then resolving gains 2 Building Materials", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste"]);
    const before = state.players.p1.resources.buildingMaterials;
    state = cast(state, "spell.view_air");
    state = boost(state, "spell.haste");
    // At Power 1 with no more sources left, auto-resolves (no window).
    expect(state.players.p1.resources.buildingMaterials).toBe(before + 2);
    expect(state.players.p1.discard).toEqual(expect.arrayContaining(["spell.view_air", "spell.haste"]));
    expect(state.players.p1.hand).toHaveLength(0);
  });

  it("discarding two Power sources then resolving gains 1 Valuables", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste", "spell.slow"]);
    const before = state.players.p1.resources.valuables;
    state = cast(state, "spell.view_air");
    state = boost(state, "spell.haste");
    state = boost(state, "spell.slow");
    expect(state.players.p1.resources.valuables).toBe(before + 1);
    expect(state.players.p1.discard).toEqual(
      expect.arrayContaining(["spell.view_air", "spell.haste", "spell.slow"])
    );
    expect(state.players.p1.hand).toHaveLength(0);
  });

  it("Power 2 can be paid with one Expert Power card and one crown", () => {
    let state = withHand(makeGame(), ["spell.view_air", "stat.power"]);
    state.players.p1.limits.expertUses = 1;
    const before = state.players.p1.resources.valuables;
    state = cast(state, "spell.view_air");
    state = boost(state, "stat.power", "expert");
    expect(state.players.p1.resources.valuables).toBe(before + 1);
    expect(state.players.p1.discard).toEqual(expect.arrayContaining(["spell.view_air", "stat.power"]));
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: Expert Power offer is absent without a crown", () => {
    const state = withHand(makeGame(), ["spell.view_air", "stat.power"]);
    state.players.p1.limits.expertUses = 0;
    const casted = cast(state, "spell.view_air");
    const choice = casted.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("map-spell-boost");
    if (choice?.type === "OPTION_CHOICE" && choice.mapSpellBoost) {
      expect(
        choice.mapSpellBoost.offers.some((offer) => offer.kind === "card" && offer.mode === "expert")
      ).toBe(false);
      // Basic Power (+1) is still offered — reaches materials, not valuables.
      expect(
        choice.mapSpellBoost.offers.some(
          (offer) => offer.kind === "card" && offer.cardId === "stat.power" && offer.mode === "basic"
        )
      ).toBe(true);
    }
  });

  it("CONTROL: resolving at Power 0 never spends held Power sources", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste", "spell.slow"]);
    const goldBefore = state.players.p1.resources.gold;
    state = cast(state, "spell.view_air");
    state = boost(state, null); // resolve now
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.hand).toEqual(expect.arrayContaining(["spell.haste", "spell.slow"]));
  });

  it("Knowledge can retake View Air after a Power-paid cast (basic, no crown)", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste", "stat.knowledge"]);
    state.players.p1.limits.expertUses = 0;
    state = play(state, "spell.view_air", 1, ["spell.haste"]);
    // Knowledge offer is queued after the cast resolves.
    expect(state.adventure?.pendingVisit?.steps[0]).toMatchObject({ type: "CHOOSE_ONE" });
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).toContain("spell.view_air");
    expect(state.players.p1.hand).not.toContain("stat.knowledge");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });
});

describe("View Air legal map plays", () => {
  it("offers a single Cast action (not per-tier options)", () => {
    const bare = withHand(makeGame(), ["spell.view_air"]);
    expect(viewAirCasts(bare)).toBe(1);
    const withPower = withHand(makeGame(), ["spell.view_air", "spell.haste", "spell.slow"]);
    expect(viewAirCasts(withPower)).toBe(1);
    // No optionIndex on the cast — Power is chosen after.
    const action = getLegalActions(withPower, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air"
    )?.action;
    expect(action && action.type === "PLAY_CARD" && action.optionIndex).toBeUndefined();
  });
});

// ===========================================================================
// View Earth
// ===========================================================================

describe("View Earth card definition", () => {
  it("is an implemented Basic Earth Map spell with three range tiers", () => {
    const card = cardLibrary["spell.view_earth"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.kind).toBe("spell");
    expect(card.timing).toBe("map");
    expect(card.spellLevel).toBe("basic");
    expect(card.spellSchools).toEqual(["earth"]);
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      throw new Error("expected CHOOSE_ONE");
    }
    const [r1, r2, r3] = card.effect.options;
    expect(r1.effect).toEqual({ type: "VIEW_EARTH", withinFields: 1 });
    expect(r1.cost).toBeUndefined();
    expect(r2.effect).toEqual({ type: "VIEW_EARTH", withinFields: 2 });
    expect(r2.cost).toEqual({ powerCost: 1, costCardFilter: "power-source" });
    expect(r3.effect).toEqual({ type: "VIEW_EARTH", withinFields: 3 });
    expect(r3.cost).toEqual({ powerCost: 2, costCardFilter: "power-source" });
  });

  it("is reachable: in the legacy and BINH-basic Spell decks", () => {
    expect(spellDeckLegacy).toContain("spell.view_earth");
    expect(spellDeckBinhBasic).toContain("spell.view_earth");
    expect(spellDeckBinhExpert).not.toContain("spell.view_earth");
  });
});

describe("View Earth captures an enemy Mine", () => {
  it("Power 0 takes an enemy Mine one field away: flag flips and production transfers, no first-flag income", () => {
    let state = withHand(makeGame(), ["spell.view_earth"]);
    const hero = heroP1(state);
    const mineSpace = spaceAtDistance(hero.spaceId!, 1);
    placeMine(state, mineSpace, "p2", "buildingMaterials", 2);

    const p1ProdBefore = state.players.p1.production.buildingMaterials;
    const p2ProdBefore = state.players.p2.production.buildingMaterials;
    const p1ResBefore = state.players.p1.resources.buildingMaterials;

    state = play(state, "spell.view_earth", 0);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a view-earth choice");
    }
    expect(choice.context).toBe("view-earth");
    const mineIds = choice.viewEarth?.mineSpaceIds ?? [];
    expect(mineIds).toEqual([mineSpace]);
    expect(choice.options[0]?.label).toMatch(/Building Materials Mine \(1 field away\)/i);
    expect(choice.options[0]?.label).not.toMatch(/h:-?\d+:-?\d+/);

    state = choose(state, mineIds.indexOf(mineSpace));

    // Ownership flipped to the caster, production moved off p2 onto p1.
    expect(state.adventure!.fields[mineSpace].flagOwnerId).toBe("p1");
    expect(state.players.p1.production.buildingMaterials).toBe(p1ProdBefore + 2);
    expect(state.players.p2.production.buildingMaterials).toBe(p2ProdBefore - 2);
    // Already-flagged Mine -> NO instant first-flag resource income.
    expect(state.players.p1.resources.buildingMaterials).toBe(p1ResBefore);
    expect(state.pendingChoice).toBeNull();
  });

  it("the Cancel option leaves the enemy Mine untouched", () => {
    let state = withHand(makeGame(), ["spell.view_earth"]);
    const hero = heroP1(state);
    const mineSpace = spaceAtDistance(hero.spaceId!, 1);
    placeMine(state, mineSpace, "p2", "gold", 1);

    state = play(state, "spell.view_earth", 0);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a view-earth choice");
    }
    // The trailing option is "Cancel (no capture)".
    const cancelIndex = choice.options.length - 1;
    state = choose(state, cancelIndex);

    expect(state.adventure!.fields[mineSpace].flagOwnerId).toBe("p2"); // still the enemy's
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.discard).toContain("spell.view_earth"); // card was still spent
  });
});

describe("View Earth reach scales with the Power paid", () => {
  it("a Mine two fields away is captured after boosting to Power 1", () => {
    let state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    const farMine = spaceAtDistance(hero.spaceId!, 2);
    placeMine(state, farMine, "p2", "gold", 1);

    // Cast is offered (some tier reaches); Power is added after cast.
    expect(viewEarthCasts(state)).toBe(1);

    // Boost once (Power 1 = range 2) then resolve.
    state = play(state, "spell.view_earth", 1, ["spell.haste"]);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a view-earth choice");
    }
    expect(choice.viewEarth?.mineSpaceIds).toEqual([farMine]);
    state = choose(state, 0);
    expect(state.adventure!.fields[farMine].flagOwnerId).toBe("p1");
  });

  it("Power 2 reaches a Mine three fields away", () => {
    let state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    const mine3 = spaceAtDistance(hero.spaceId!, 3);
    placeMine(state, mine3, "p2", "valuables", 1);

    expect(viewEarthCasts(state)).toBe(1);

    state = play(state, "spell.view_earth", 2, ["spell.haste", "spell.slow"]);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a view-earth choice");
    }
    expect(choice.viewEarth?.mineSpaceIds).toEqual([mine3]);
    state = choose(state, 0);
    expect(state.adventure!.fields[mine3].flagOwnerId).toBe("p1");
    expect(state.players.p1.production.valuables).toBeGreaterThan(0);
  });

  it("CONTROL: resolving at Power 0 cannot capture a Mine two fields away", () => {
    let state = withHand(makeGame(), ["spell.view_earth", "spell.haste"]);
    const hero = heroP1(state);
    const farMine = spaceAtDistance(hero.spaceId!, 2);
    placeMine(state, farMine, "p2", "gold", 1);
    // Cast + resolve now at Power 0 → range 1 → no mine in range → no view-earth choice.
    state = cast(state, "spell.view_earth");
    state = boost(state, null);
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure!.fields[farMine].flagOwnerId).toBe("p2");
  });
});

describe("View Earth only targets enemy Mines", () => {
  it("does not offer the spell when the nearby Mine is unowned or already yours", () => {
    const state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    placeMine(state, spaceAtDistance(hero.spaceId!, 1), null, "gold", 1); // unflagged
    placeMine(state, spaceAtDistance(hero.spaceId!, 2), "p1", "gold", 1); // already ours

    // No enemy Mine in reach -> no View Earth cast is offered at all.
    expect(viewEarthCasts(state)).toBe(0);
  });

  it("offers only the enemy Mine when an enemy and a friendly Mine sit side by side", () => {
    let state = withHand(makeGame(), ["spell.view_earth"]);
    const hero = heroP1(state);
    const ownMine = spaceAtDistance(hero.spaceId!, 1);
    // Two distinct distance-1 spaces (east vs the real NW neighbour of h:8:2).
    placeMine(state, ownMine, "p1", "gold", 1);
    const enemyMine = `h:${parseHexSpaceId(hero.spaceId!)!.row - 1}:${parseHexSpaceId(hero.spaceId!)!.col}`;
    expect(hexDistance(parseHexSpaceId(hero.spaceId!)!, parseHexSpaceId(enemyMine)!)).toBe(1);
    placeMine(state, enemyMine, "p2", "gold", 1);

    state = play(state, "spell.view_earth", 0);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a view-earth choice");
    }
    // Only the enemy's Mine is a candidate; the owned one is skipped.
    expect(choice.viewEarth?.mineSpaceIds).toEqual([enemyMine]);
  });

  it("offers no View Earth cast when the only enemy Mine is out of every tier's reach", () => {
    // A four-fields-away enemy Mine is beyond even Power 2 (range 3): the engine
    // refuses to offer the spell, so it can never be wasted on an unreachable Mine.
    const state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    placeMine(state, spaceAtDistance(hero.spaceId!, 4), "p2", "gold", 1);
    expect(viewEarthCasts(state)).toBe(0);
  });
});
