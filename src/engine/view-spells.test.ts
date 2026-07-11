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
// View Air — "Gain: Power 0 -> 3 gold; Power 1 -> 2 Building Materials; Power 2
//   -> 1 Valuables. — OR — +1 Power." A pure economy spell. There is no Hero
//   Power statistic on the map, so the higher tiers are paid the board-game way:
//   each option discards power-source cards (Power 0/1/2 -> 0/1/2 discards).
//
// View Earth — "Choose enemy Mine within X fields. Replace the owner's cube with
//   yours: Power 0 -> 1; Power 1 -> 2; Power 2 -> 3." Captures a nearby enemy
//   Mine, transferring its ongoing production to the caster (no first-flag
//   income — it was already flagged). Reach scales with the Power paid, again via
//   each option's power-source discard cost.
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

function play(state: GameState, cardId: string, optionIndex: number, costCardIds: string[] = []): GameState {
  return applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId,
    mode: "basic",
    optionIndex,
    target: { type: "none" },
    ...(costCardIds.length > 0 ? { costCardIds } : {})
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

function viewAirPlays(state: GameState): number[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air")
    .map((legal) => (legal.action.type === "PLAY_CARD" ? (legal.action.optionIndex ?? -1) : -1))
    .sort();
}

function viewEarthPlays(state: GameState): number[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_earth")
    .map((legal) => (legal.action.type === "PLAY_CARD" ? (legal.action.optionIndex ?? -1) : -1))
    .sort();
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

describe("View Air resource gains", () => {
  it("Power 0 gains 3 gold for free (no cards beyond View Air discarded)", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste"]);
    const goldBefore = state.players.p1.resources.gold;
    state = play(state, "spell.view_air", 0);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    // View Air went to discard; the unrelated Spell stayed in hand.
    expect(state.players.p1.discard).toContain("spell.view_air");
    expect(state.players.p1.hand).toEqual(["spell.haste"]);
    expect(state.pendingChoice).toBeNull();
  });

  it("Power 1 gains 2 Building Materials and discards exactly one power-source Spell", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste"]);
    const before = state.players.p1.resources.buildingMaterials;
    state = play(state, "spell.view_air", 1, ["spell.haste"]);
    expect(state.players.p1.resources.buildingMaterials).toBe(before + 2);
    // Both View Air and the spent Spell are in the discard; hand is empty.
    expect(state.players.p1.discard).toEqual(expect.arrayContaining(["spell.view_air", "spell.haste"]));
    expect(state.players.p1.hand).toHaveLength(0);
  });

  it("Power 2 gains 1 Valuables and discards exactly two power-source Spells", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste", "spell.slow"]);
    const before = state.players.p1.resources.valuables;
    state = play(state, "spell.view_air", 2, ["spell.haste", "spell.slow"]);
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
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      optionIndex: 2,
      target: { type: "none" },
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
    expect(state.players.p1.resources.valuables).toBe(before + 1);
    expect(state.players.p1.discard).toEqual(expect.arrayContaining(["spell.view_air", "stat.power"]));
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: Expert Power payment without a crown is rejected", () => {
    const state = withHand(makeGame(), ["spell.view_air", "stat.power"]);
    state.players.p1.limits.expertUses = 0;
    expectError(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      optionIndex: 2,
      target: { type: "none" },
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
  });

  it("rejects a Power 1 play that does not pay its Power cost", () => {
    const state = withHand(makeGame(), ["spell.view_air", "spell.haste"]);
    // No costCardIds supplied for an option that demands 1 Power.
    expectError(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      optionIndex: 1,
      target: { type: "none" }
    });
  });

  it("Knowledge can retake View Air after a Power-paid tier (basic, no crown)", () => {
    let state = withHand(makeGame(), ["spell.view_air", "spell.haste", "stat.knowledge"]);
    state.players.p1.limits.expertUses = 0;
    state = play(state, "spell.view_air", 1, ["spell.haste"]);
    // Knowledge offer is queued after the cast.
    expect(state.adventure?.pendingVisit?.steps[0]).toMatchObject({ type: "CHOOSE_ONE" });
    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.hand).toContain("spell.view_air");
    expect(state.players.p1.hand).not.toContain("stat.knowledge");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });
});

describe("View Air legal map plays", () => {
  it("offers only the free gold tier with no spare power-source card", () => {
    const state = withHand(makeGame(), ["spell.view_air"]);
    expect(viewAirPlays(state)).toEqual([0]); // Power 0 only
  });

  it("offers all three tiers once two extra power-source Spells are in hand", () => {
    const state = withHand(makeGame(), ["spell.view_air", "spell.haste", "spell.slow"]);
    expect(viewAirPlays(state)).toEqual([0, 1, 2]);
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
  it("a Mine two fields away is out of Power 0's reach but inside Power 1's", () => {
    // Two spare power-source Spells so affordability never masks the range gate.
    let state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    const farMine = spaceAtDistance(hero.spaceId!, 2);
    placeMine(state, farMine, "p2", "gold", 1);

    // Legal plays: Power 0 (range 1) is NOT offered; Power 1 (range 2) and
    // Power 2 (range 3) are — the mine sits at distance 2.
    expect(viewEarthPlays(state)).toEqual([1, 2]);

    // Casting Power 1 (discard one Spell) reaches it.
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

    expect(viewEarthPlays(state)).toEqual([2]); // only range-3 reaches distance 3

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
});

describe("View Earth only targets enemy Mines", () => {
  it("does not offer the spell when the nearby Mine is unowned or already yours", () => {
    const state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    placeMine(state, spaceAtDistance(hero.spaceId!, 1), null, "gold", 1); // unflagged
    placeMine(state, spaceAtDistance(hero.spaceId!, 2), "p1", "gold", 1); // already ours

    // No enemy Mine in reach -> no View Earth play is offered at all.
    expect(viewEarthPlays(state)).toEqual([]);
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

  it("offers no View Earth play at all when the only enemy Mine is out of every tier's reach", () => {
    // A four-fields-away enemy Mine is beyond even Power 2 (range 3): the engine
    // refuses to offer the spell, so it can never be wasted on an unreachable Mine.
    const state = withHand(makeGame(), ["spell.view_earth", "spell.haste", "spell.slow"]);
    const hero = heroP1(state);
    placeMine(state, spaceAtDistance(hero.spaceId!, 4), "p2", "gold", 1);
    expect(viewEarthPlays(state)).toEqual([]);
  });
});
