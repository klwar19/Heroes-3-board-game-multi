import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectiveInitiative,
  getActivationOrder,
  getActivationStep,
  getLegalActions,
  CREATURE_BANK_ATTACKER_CELLS,
  CREATURE_BANK_GUARD_CORNERS,
  CREATURE_BANK_GUARD_OVERFLOW_CELLS,
  placementCellsFor,
  unitIsBerserk,
  type GameAction,
  type GameState
} from "./index";
import { getNeutralTargetTies, pickNeutralTarget } from "./neutral-ai";
import {
  buildCreatureBankCombatUnits,
  canCrossEdge,
  creatureBankTierForGroup,
  fieldCreatureBankId,
  getAdjacentSpaceIds,
  getMainHero,
  getTileFootprintSpaceIds,
  instantiateTile,
  isFieldGuarded,
  makeCombatUnitFromArmy,
  makeCombatUnitFromNeutral,
  placeCreatureBank,
  type NeutralDraw
} from "./adventure";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { hexSpaceId, tileFootprint } from "./hex";
import { finalizeAdventureCombat, getHeroMoveDestinations, setTileRotation, startNeutralEncounter } from "./adventure-reducer";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { applyUnitCurrentSide } from "./unit-transforms";
import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  STACK_TOKENS_BY_DIFFICULTY,
  stackTokenDelta,
  type CreatureBankId
} from "@/data/map/creature-banks";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatUnitState, GameDifficulty, UnitGrade, UnitType } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function chooseVisitOption(state: GameState, match: RegExp): GameState {
  const legal = getLegalActions(state, "p1").find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  return apply(state, legal!.action);
}

function chooseAttackStackTokenIfOffered(state: GameState): GameState {
  const offered = getLegalActions(state, "p1").some(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.label === "+1 Attack"
  );
  return offered ? chooseVisitOption(state, /^\+1 Attack$/) : state;
}

/** Drops a Creature Bank onto a fresh field the main hero is standing on. */
function placeBankUnderHero(state: GameState, bankId: CreatureBankId, level = 7): GameState {
  const hero = getMainHero(state, "p1")!;
  hero.level = level;
  hero.spaceId = "bank-field";
  state.adventure!.fields["bank-field"] = {
    spaceId: "bank-field",
    tileInstanceId: "t",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  placeCreatureBank(state, "bank-field", bankId);
  return state;
}

// ===========================================================================
// Placement
// ===========================================================================

describe("placeCreatureBank", () => {
  it("converts a Blocked Field into a guarded Creature Bank Location", () => {
    const state = createAdventureGameState({ seed: "bank-place", difficulty: "normal", rollFirstPlayer: false });
    state.adventure!.fields["x"] = {
      spaceId: "x",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      difficulty: 3,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    const field = placeCreatureBank(state, "x", "naga_bank");
    expect(field?.location).toBe("creature_bank");
    expect(field?.bankId).toBe("naga_bank");
    // The old Blocked-Field difficulty is wiped — banks have no Field Difficulty.
    expect(field?.difficulty).toBeUndefined();
    expect(fieldCreatureBankId(field)).toBe("naga_bank");

    // Guarded until the win marks the Black Cube, then treated as empty.
    expect(isFieldGuarded(field!)).toBe(true);
    field!.blackCube = true;
    expect(isFieldGuarded(field!)).toBe(false);

    expect(state.eventLog.some((event) => event.type === "CREATURE_BANK_PLACED")).toBe(true);
  });

  it("rejects unknown bank ids", () => {
    const state = createAdventureGameState({ seed: "bank-bad", difficulty: "normal", rollFirstPlayer: false });
    state.adventure!.fields["x"] = {
      spaceId: "x",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    expect(placeCreatureBank(state, "x", "not_a_bank" as CreatureBankId)).toBeNull();
  });
});

// ===========================================================================
// Placement: opt-in when discovering a Far/Near tile with a Blocked Field
// ===========================================================================

describe("Creature Bank token piles", () => {
  it("are set up shuffled and split by tier when enabled, and absent when disabled", () => {
    const on = createAdventureGameState({ seed: "piles", difficulty: "normal", rollFirstPlayer: false });
    expect(on.adventure!.creatureBankTokensFar).toHaveLength(6);
    expect(on.adventure!.creatureBankTokensNear).toHaveLength(6);
    for (const id of on.adventure!.creatureBankTokensFar!) {
      expect(CREATURE_BANKS[id as CreatureBankId].tier).toBe("far");
    }
    for (const id of on.adventure!.creatureBankTokensNear!) {
      expect(CREATURE_BANKS[id as CreatureBankId].tier).toBe("near");
    }

    const off = createAdventureGameState({
      seed: "piles",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: false
    });
    expect(off.adventure!.creatureBankTokensFar).toBeUndefined();
    expect(off.adventure!.creatureBankTokensNear).toBeUndefined();
  });
});

describe("Creature Bank placement on tile discovery", () => {
  /** Places + reveals a Far tile from p1's supply (mirrors adventure.test.ts geometry). */
  function discoverFarTile(creatureBanks = true): GameState {
    let state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false, creatureBanks });
    // The mandatory start-of-turn draw isn't under test here — treat it as taken.
    for (const _pl of Object.values(state.players)) {
      _pl.canMulligan = false;
      _pl.needsHandRefresh = false;
    }
    state.heroes.hero_p1.spaceId = "h:7:2";
    state.heroes.hero_p1.movementPoints = 3;
    // The supply tile's identity is rolled at the flip; force F1 — a Settlement
    // (no Mine) tile that auto-finalizes on the 1st opening AND carries a Blocked
    // Field (which is what the Creature Bank offer needs).
    state.adventure!.farTileScriptedDraws = ["F1"];
    state = apply(state, { type: "PLACE_TILE", playerId: "p1", heroId: "hero_p1", supplyIndex: 0, centerRow: 6, centerCol: 4 });
    const rotation = getLegalActions(state, "p1").find((entry) => entry.action.type === "SET_TILE_ROTATION");
    return apply(state, rotation!.action);
  }

  it("offers the discovering player a bank on a Far tile's Blocked Field", () => {
    const state = discoverFarTile();
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("place-creature-bank");
    expect(choice.playerId).toBe("p1");
    expect(choice.creatureBank?.tier).toBe("far");
    // The offered field is the tile's still-blocked field.
    const fieldId = choice.creatureBank!.fieldId;
    expect(state.adventure!.fields[fieldId].location).toBe("blocked_field");
  });

  it("converts the Blocked Field into a Far bank drawn from the pile when accepted", () => {
    let state = discoverFarTile();
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected a placement choice");
    const fieldId = choice.creatureBank!.fieldId;
    const pileBefore = state.adventure!.creatureBankTokensFar!.length;

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    const field = state.adventure!.fields[fieldId];
    expect(field.location).toBe("creature_bank");
    expect(field.bankId).toBeTruthy();
    expect(CREATURE_BANKS[field.bankId as CreatureBankId].tier).toBe("far");
    expect(state.adventure!.creatureBankTokensFar!.length).toBe(pileBefore - 1);
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("player-turn");
  });

  it("leaves the field blocked and the pile intact when declined", () => {
    let state = discoverFarTile();
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected a placement choice");
    const fieldId = choice.creatureBank!.fieldId;
    const pileBefore = state.adventure!.creatureBankTokensFar!.length;

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });

    expect(state.adventure!.fields[fieldId].location).toBe("blocked_field");
    expect(state.adventure!.creatureBankTokensFar!.length).toBe(pileBefore);
    expect(state.pendingChoice).toBeNull();
  });

  it("never offers a bank when the rule is disabled", () => {
    const state = discoverFarTile(false);
    expect(state.pendingChoice).toBeNull();
  });

  it("treats Far/Near/Subterranean tiles as bank tiers (the gate is the tile group)", () => {
    expect(creatureBankTierForGroup("far")).toBe("far");
    expect(creatureBankTierForGroup("near")).toBe("near");
    // BINH house rule: a cavern is a "deep" tile and draws from the Near pile.
    expect(creatureBankTierForGroup("subterranean")).toBe("near");
    // Sea/center/starting never bank, even a sea tile with a Blocked Field.
    expect(creatureBankTierForGroup("sea")).toBeNull();
    expect(creatureBankTierForGroup("center")).toBeNull();
    expect(creatureBankTierForGroup("starting")).toBeNull();
    expect(creatureBankTierForGroup(undefined)).toBeNull();
  });

  it("never offers a bank on a sea tile, even one with a Blocked Field (Cove tile W1)", () => {
    const state = createAdventureGameState({ seed: "sea-bank", difficulty: "normal", rollFirstPlayer: false });
    const adventure = state.adventure!;
    // W1 is a Cove sea tile that DOES carry a Blocked Field / impassable hex.
    const tile = instantiateTile(adventure, "W1", { row: -8, col: -8 }, 0, true);
    expect(tile.group).toBe("sea");
    tile.awaitingRotation = true;
    adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p1", kind: "place" };

    setTileRotation(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: tile.id, rotation: 0 });

    // The sea tile materialized its Blocked Field, but no bank was offered.
    const blocked = getTileFootprintSpaceIds(tile)
      .map((spaceId) => adventure.fields[spaceId])
      .find((field) => field?.location === "blocked_field");
    expect(blocked, "W1 should carry a Blocked Field").toBeTruthy();
    expect(state.pendingChoice).toBeNull();
  });
});

// ===========================================================================
// The Creature Bank is drawn (known) BEFORE the tile is rotated
// ===========================================================================

describe("Creature Bank — reserved (known) before the tile is rotated", () => {
  function apply(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
    return result.state;
  }

  /** Places a Far tile (F1 — a Settlement with a Blocked Field) from p1's supply
   *  and stops with it AWAITING rotation (rotation NOT yet chosen). */
  function placeFarTileAwaitingRotation(): { state: GameState; tileId: string } {
    let state = createAdventureGameState({
      seed: "bank-reserve",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: true
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.heroes.hero_p1.spaceId = "h:7:2";
    state.heroes.hero_p1.movementPoints = 3;
    state.adventure!.farTileScriptedDraws = ["F1"];
    state = apply(state, { type: "PLACE_TILE", playerId: "p1", heroId: "hero_p1", supplyIndex: 0, centerRow: 6, centerCol: 4 });
    const pending = state.adventure!.pendingTileChoice;
    expect(pending?.tileInstanceId, "the placed Far tile awaits rotation").toBeTruthy();
    return { state, tileId: pending!.tileInstanceId };
  }

  it("draws the bank face-up the moment the tile is revealed, BEFORE rotation (peek — pile intact)", () => {
    const { state, tileId } = placeFarTileAwaitingRotation();
    const tile = state.adventure!.tiles[tileId];
    // The rotation has NOT been chosen yet…
    expect(tile.awaitingRotation).toBe(true);
    const pile = state.adventure!.creatureBankTokensFar!;
    // …yet the bank is already known: reservedBankId is the pile's TOP token, and
    // the pile is untouched (peeked, not popped — nothing is consumed until the
    // player accepts the placement).
    expect(tile.reservedBankId, "the bank is reserved before rotation").toBeTruthy();
    expect(tile.reservedBankId).toBe(pile[pile.length - 1]);
    expect(pile).toHaveLength(6);
    expect(CREATURE_BANKS[tile.reservedBankId as CreatureBankId].tier).toBe("far");
  });

  it("carves EXACTLY the reserved bank on accept (pile −1, reservation cleared)", () => {
    const { state: placed, tileId } = placeFarTileAwaitingRotation();
    const reserved = placed.adventure!.tiles[tileId].reservedBankId;
    const pileBefore = placed.adventure!.creatureBankTokensFar!.length;

    const rotation = getLegalActions(placed, "p1").find((entry) => entry.action.type === "SET_TILE_ROTATION");
    let state = apply(placed, rotation!.action);

    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-creature-bank") {
      throw new Error("expected the creature-bank placement choice");
    }
    // The choice carries the SAME bank that was shown before rotation.
    expect(choice.creatureBank?.bankId).toBe(reserved);
    const fieldId = choice.creatureBank!.fieldId;

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    const field = state.adventure!.fields[fieldId];
    expect(field.location).toBe("creature_bank");
    // The bank placed is exactly the one the player was shown while rotating.
    expect(field.bankId).toBe(reserved);
    expect(state.adventure!.creatureBankTokensFar!.length).toBe(pileBefore - 1);
    expect(state.adventure!.tiles[tileId].reservedBankId).toBeUndefined();
  });

  it("declining leaves the field blocked, the pile intact, and clears the reservation", () => {
    const { state: placed, tileId } = placeFarTileAwaitingRotation();
    expect(placed.adventure!.tiles[tileId].reservedBankId).toBeTruthy();
    const pileBefore = placed.adventure!.creatureBankTokensFar!.length;

    const rotation = getLegalActions(placed, "p1").find((entry) => entry.action.type === "SET_TILE_ROTATION");
    let state = apply(placed, rotation!.action);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected a placement choice");
    const fieldId = choice.creatureBank!.fieldId;

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    expect(state.adventure!.fields[fieldId].location).toBe("blocked_field");
    // The peeked token was never consumed — the pile is unchanged.
    expect(state.adventure!.creatureBankTokensFar!.length).toBe(pileBefore);
    expect(state.adventure!.tiles[tileId].reservedBankId).toBeUndefined();
  });
});

// ===========================================================================
// Movement: enter from inside the tile, never a route to/from the outside
// ===========================================================================

describe("Creature Bank movement", () => {
  function twoTileState(inwardOnly = true): GameState {
    const state = createAdventureGameState({ seed: "bank-move", difficulty: "normal", rollFirstPlayer: false });
    const template = Object.values(state.adventure!.tiles)[0];
    // Two surface tiles with unknown defs (no internal borders, no sealed edges).
    state.adventure!.tiles["T1"] = { ...template, id: "T1", tileDefId: "fake-T1", group: "near" };
    state.adventure!.tiles["T2"] = { ...template, id: "T2", tileDefId: "fake-T2", group: "near" };
    const field = (spaceId: string, tileInstanceId: string, location: string, slot: number, bankId?: string) => ({
      spaceId,
      tileInstanceId,
      slot,
      location,
      ...(bankId ? { bankId } : {}),
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    });
    state.adventure!.fields["A"] = field("A", "T1", "empty_field", 1);
    state.adventure!.fields["B"] = field("B", "T1", "creature_bank", 2, "crypt");
    state.adventure!.fields["C"] = field("C", "T2", "empty_field", 1);
    state.adventure!.houseRules!["bank-interior-entry-only"] = inwardOnly;
    return state;
  }

  it("BINH: enters and exits on the host tile, never across the bank's outer tile edge", () => {
    const state = twoTileState();
    // Control: two ordinary fields on different tiles ARE crossable.
    expect(canCrossEdge(state, "C", "A")).toBe(true);

    // Same tile -> you can walk in to fight, and back out to a tile neighbour.
    expect(canCrossEdge(state, "A", "B")).toBe(true);
    expect(canCrossEdge(state, "B", "A")).toBe(true);

    expect(canCrossEdge(state, "C", "B")).toBe(false);
    expect(canCrossEdge(state, "B", "C")).toBe(false);
  });

  it("CONTROL: with the BINH entrance rule off, the old cross-tile bank edge stays open", () => {
    const state = twoTileState(false);
    expect(canCrossEdge(state, "C", "B")).toBe(true);
    expect(canCrossEdge(state, "B", "C")).toBe(true);
  });

  it("offers a bank carved from a real tile's Blocked Field as a move destination", () => {
    // End-to-end on real geometry: materialize a tile that has a Blocked Field,
    // carve a bank into it, and confirm a hero on a same-tile neighbour is
    // actually offered the step in (the user-visible "walk in to fight").
    const state = createAdventureGameState({ seed: "bank-walk-in", difficulty: "normal", rollFirstPlayer: false });
    const blockedSlot = coreTileDefinitions.S1.fields.findIndex((field) => field.location === "blocked_field");
    expect(blockedSlot).toBeGreaterThanOrEqual(0);

    const center = { row: 20, col: 20 };
    const tile = instantiateTile(state.adventure!, "S1", center, 0, false);

    const cells = tileFootprint(center, tile.rotation);
    const bankSpaceId = hexSpaceId(cells[blockedSlot]);
    expect(placeCreatureBank(state, bankSpaceId, "crypt")).not.toBeNull();
    expect(state.adventure!.fields[bankSpaceId].location).toBe("creature_bank");

    // Stand the hero on a same-tile neighbour of the bank and check the offer.
    const sibling = cells
      .map((coord) => hexSpaceId(coord))
      .find((spaceId) => spaceId !== bankSpaceId && getAdjacentSpaceIds(bankSpaceId).includes(spaceId));
    expect(sibling).toBeTruthy();
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = sibling!;
    hero.movementPoints = 3;
    hero.movementHaltedThisTurn = false;

    expect(getHeroMoveDestinations(state, hero)).toContain(bankSpaceId);
  });
});

// ===========================================================================
// Defenders + Stack Tokens
// ===========================================================================

describe("Creature Bank defenders", () => {
  it("fields the bank's own cards (its stats, not Few/Pack/Neutral) controlled by the neutrals", () => {
    const state = createAdventureGameState({ seed: "bank-army", difficulty: "easy", rollFirstPlayer: false });
    const { units } = buildCreatureBankCombatUnits(state, "naga_bank");
    expect(units).toHaveLength(4);
    const bankSide = CREATURE_BANK_UNIT_SIDES["neutral.nagas"];
    for (const unit of units) {
      expect(unit.controllerId).toBe("neutrals");
      expect(unit.bankUnit).toBe(true);
      expect(unit.unitDefId).toBe("neutral.nagas");
      expect(unit.assets?.cardImage).toBe(bankSide.cardImage);
      // An un-stacked Naga uses the bank card stats verbatim (4/1/5/6).
      if (!unit.stackToken) {
        expect([unit.attack, unit.defense, unit.maxHealth, unit.initiative]).toEqual([
          bankSide.attack,
          bankSide.defense,
          bankSide.health,
          bankSide.initiative
        ]);
      }
    }
  });

  it("official rule always Stacks exactly the difficulty count, each on a different card", () => {
    // The official difficulty count is fixed and every token lands.
    for (const difficulty of ["easy", "normal", "hard", "impossible"] as GameDifficulty[]) {
      const expected = STACK_TOKENS_BY_DIFFICULTY[difficulty];
      for (let trial = 0; trial < 50; trial += 1) {
        const state = createAdventureGameState({ seed: `bank-${difficulty}-${trial}`, difficulty, rollFirstPlayer: false });
        const { units, stackedCount } = buildCreatureBankCombatUnits(state, "crypt");
        expect(stackedCount).toBe(expected);

        const stacked = units.filter((unit) => unit.stackToken);
        expect(stacked).toHaveLength(expected);
        // Whatever lands, the tokens always sit on distinct cards.
        expect(new Set(stacked.map((unit) => unit.id)).size).toBe(expected);
      }
    }
  });

  it("never gives more than two bank defenders the same Stack Token statistic", () => {
    let sawExactPair = false;
    for (let trial = 0; trial < 250; trial += 1) {
      const state = createAdventureGameState({
        seed: `bank-token-cap-${trial}`,
        difficulty: "impossible",
        rollFirstPlayer: false
      });
      const { units } = buildCreatureBankCombatUnits(state, "crypt");
      const counts = new Map<string, number>();
      for (const token of units.map((unit) => unit.stackToken).filter(Boolean)) {
        counts.set(token!, (counts.get(token!) ?? 0) + 1);
      }
      // Impossible guarantees FOUR tokens — an empty counts map would make the
      // max() below read -Infinity and pass vacuously.
      expect([...counts.values()].reduce((sum, n) => sum + n, 0), `seed ${trial} places 4 tokens`).toBe(4);
      expect(Math.max(...counts.values()), `seed ${trial}`).toBeLessThanOrEqual(2);
      if ([...counts.values()].includes(2)) {
        sawExactPair = true;
      }
    }
    // The cap is TWO, not "all four distinct": across 250 seeds some trial must
    // legitimately field a pair, or an over-restrictive rewrite passes silently.
    expect(sawExactPair).toBe(true);
  });

  it("BINH house rule rolls each token at ~80%, so Impossible can have fewer than four", () => {
    // Run a wide sample at Impossible (4 rolls). A fixed-count implementation
    // would always return 4; the probabilistic one spreads across 0..4 and
    // averages near 4 * 0.80 = 3.2.
    const TRIALS = 600;
    const counts = [0, 0, 0, 0, 0];
    let total = 0;
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const state = createAdventureGameState({
        seed: `bank-spread-${trial}`,
        difficulty: "impossible",
        rollFirstPlayer: false,
        houseRules: { "bank-stack-chance-80": true }
      });
      const { stackedCount } = buildCreatureBankCombatUnits(state, "crypt");
      counts[stackedCount] += 1;
      total += stackedCount;
    }

    // The "lucky, all four Stacked" and "unlucky, none Stacked" outcomes both occur.
    expect(counts[4]).toBeGreaterThan(0);
    expect(counts[0]).toBeGreaterThan(0);
    // And it is NOT pinned to the maximum: plenty of partial outcomes appear.
    expect(counts[4]).toBeLessThan(TRIALS);
    // Empirical landing rate clusters around 80% per roll.
    const meanPerRoll = total / TRIALS / 4;
    expect(meanPerRoll).toBeGreaterThan(0.74);
    expect(meanPerRoll).toBeLessThan(0.86);
  });

  it("bakes the Stack Token bonus into the right statistic (+1 stat, +2 initiative)", () => {
    const state = createAdventureGameState({ seed: "bank-stat", difficulty: "impossible", rollFirstPlayer: false });
    const { units } = buildCreatureBankCombatUnits(state, "naga_bank");
    const base = CREATURE_BANK_UNIT_SIDES["neutral.nagas"];
    for (const unit of units) {
      const token = unit.stackToken;
      expect(unit.attack).toBe(base.attack + (token === "attack" ? 1 : 0));
      expect(unit.defense).toBe(base.defense + (token === "defense" ? 1 : 0));
      expect(unit.maxHealth).toBe(base.health + (token === "health" ? 1 : 0));
      expect(unit.initiative).toBe(base.initiative + (token === "initiative" ? stackTokenDelta("initiative") : 0));
    }
  });
});

// ===========================================================================
// Battlefield formation: guards in the corners, attacker in the center
// ===========================================================================

describe("Creature Bank battlefield formation", () => {
  /** Runs the bank Combat Setup up to the point the guards have deployed. */
  function startBankCombat(seed: string, bankId: CreatureBankId): GameState {
    let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, bankId, 7);
    const hero = getMainHero(state, "p1")!;
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    return state;
  }

  /** Starts the reported size-III Shipwreck opening with a Pack of Orcs. */
  function startShipwreckInitiativeTie(): GameState {
    let state = createAdventureGameState({
      seed: "bank-ammo-cart-opening",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true }
    });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    state.players.p1.army = [{ id: "orcs", unitDefId: "stronghold.orcs", side: "pack" }];
    state.players.p1.permanents = ["war_machine.ammo_cart"];
    placeBankUnderHero(state, "shipwreck", 7);
    state.adventure!.fields["bank-field"].bankSize = 3;

    startNeutralEncounter(state, getMainHero(state, "p1")!, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  }

  it("pins the four guardians to the four board corners (not a backline/frontline)", () => {
    let state = startBankCombat("bank-corners", "naga_bank");

    // Deploy one unit centrally, lock placement: the guards reveal at the corners.
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const guardPositions = Object.values(state.combat!.units)
      .filter((unit) => unit.controllerId === "neutrals")
      .map((unit) => unit.position)
      .sort((left, right) => left - right);
    expect(guardPositions).toEqual([...CREATURE_BANK_GUARD_CORNERS].sort((left, right) => left - right));
  });

  it("gives Ammo-Cart-boosted Orcs attacker priority over a tied initiative-Stacked bank Wraith", () => {
    const state = startShipwreckInitiativeTie();

    const orcs = Object.values(state.combat!.units).find((unit) => unit.armyUnitId === "orcs");
    const wraith = Object.values(state.combat!.units).find(
      (unit) => unit.unitDefId === "neutral.wraiths" && unit.stackToken === "initiative"
    );
    expect(state.combat?.context.kind === "neutral" ? state.combat.context.bankStackCount : undefined).toBe(3);
    // Pack 5 + Ammo Cart 2. The cart's +2 is a live RANGED_INITIATIVE_BONUS on
    // its player-scoped effect (never baked into the printed `unit.initiative`
    // cache, which applyUnitCurrentSide rebuilds mid-combat), so read it the way
    // the activation order does.
    expect(effectiveInitiative(orcs!, state.activeEffects, state.combat)).toBe(7);
    expect(wraith?.initiative).toBe(7); // Wraith 5 + its +2 Initiative Stack Token.
    expect(getActivationOrder(state.combat!, state.activeEffects)[0]?.id).toBe(orcs?.id);
    expect(state.combat!.activeUnitId).toBe(orcs?.id);
  });

  it("asks which allied unit activates first when Ammo Cart ties Pack Evil Eyes with Pack Harpies in a bank", () => {
    let state = createAdventureGameState({
      seed: "bank-ammo-cart-allied-tie",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    state.players.p1.army = [
      { id: "harpies", unitDefId: "dungeon.harpies", side: "pack" },
      { id: "evil-eyes", unitDefId: "dungeon.evil_eyes", side: "pack" }
    ];
    state.players.p1.permanents = ["war_machine.ammo_cart"];
    placeBankUnderHero(state, "imp_cache", 7);
    startNeutralEncounter(state, getMainHero(state, "p1")!, state.adventure!.fields["bank-field"]);
    while (true) {
      const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      if (!place) {
        break;
      }
      state = apply(state, place!.action);
    }
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("combat-activation-order");
    expect(choice.options.map((option) => option.label)).toEqual(
      expect.arrayContaining([expect.stringContaining("Harpies"), expect.stringContaining("Evil Eyes")])
    );
    expect(state.combat!.activeUnitId).toBeNull();
  });

  it("CONTROL: the same initiative-Stacked Wraith starts when the Orcs have no Ammo Cart", () => {
    const state = startShipwreckInitiativeTie();
    const orcs = Object.values(state.combat!.units).find((unit) => unit.armyUnitId === "orcs");
    const wraith = Object.values(state.combat!.units).find(
      (unit) => unit.unitDefId === "neutral.wraiths" && unit.stackToken === "initiative"
    );
    // Dropping the cart's own active effect drops its +2 with it (the bonus is
    // a modifier ON that effect, not a write into `unit.initiative`), isolating
    // the same bank opening's no-Cart ordering.
    state.activeEffects = state.activeEffects.filter(
      (effect) => !(effect.source.type === "card" && effect.source.cardId === "war_machine.ammo_cart")
    );
    orcs!.activationInitiative = undefined;
    state.combat!.activeUnitId = null;

    expect(orcs?.initiative).toBe(5);
    expect(wraith?.initiative).toBe(7);
    expect(getActivationOrder(state.combat!, state.activeEffects)[0]?.id).toBe(wraith?.id);
    expect(getActivationStep(state.combat!, state.activeEffects)?.candidates[0]?.id).toBe(wraith?.id);
  });

  it.each([
    ["crypt", "neutral.skeletons"],
    ["dragon_utopia", "neutral.black_dragons"]
  ] as const)("randomizes %s unit identities across the corners instead of fixing their slots", (bankId, unitDefId) => {
    const observed = new Set<number>();
    for (let index = 0; index < 8; index += 1) {
      let state = startBankCombat(`bank-random-${bankId}-${index}`, bankId);
      const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      state = apply(state, place!.action);
      state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
      const guard = Object.values(state.combat!.units).find((unit) => unit.unitDefId === unitDefId);
      expect(guard, `${unitDefId} must be present`).toBeTruthy();
      expect(CREATURE_BANK_GUARD_CORNERS).toContain(guard!.position);
      observed.add(guard!.position);
    }
    expect(observed.size, `${unitDefId} must not be pinned to one corner`).toBeGreaterThan(1);
  });

  it("uses the same randomized corner formation for a Dragon Utopia objective field", () => {
    const observedFaerieDragonCorners = new Set<number>();
    for (let index = 0; index < 8; index += 1) {
      let state = createAdventureGameState({
        seed: `objective-utopia-corners-${index}`,
        difficulty: "normal",
        rollFirstPlayer: false,
        dragonUtopiaGuards: "four"
      });
      state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
        ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
        : state;
      placeBankUnderHero(state, "dragon_utopia", 7);
      const field = state.adventure!.fields["bank-field"];
      field.location = "dragon_utopia";
      field.difficulty = 7;
      delete field.bankId;
      delete field.bankSize;

      startNeutralEncounter(state, getMainHero(state, "p1")!, field);
      expect(state.combat?.context).toMatchObject({ kind: "neutral", bankFormation: true });
      expect(placementCellsFor(state, "p1").sort((a, b) => a - b)).toEqual(
        [...CREATURE_BANK_ATTACKER_CELLS].sort((a, b) => a - b)
      );
      const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      state = apply(state, place!.action);
      state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

      const guards = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "neutrals");
      expect(guards.map((unit) => unit.position).sort((a, b) => a - b)).toEqual(
        [...CREATURE_BANK_GUARD_CORNERS].sort((a, b) => a - b)
      );
      const faerieDragon = guards.find((unit) => unit.unitDefId === "neutral.faerie_dragons");
      expect(faerieDragon).toBeTruthy();
      observedFaerieDragonCorners.add(faerieDragon!.position);
    }
    expect(observedFaerieDragonCorners.size).toBeGreaterThan(1);
  });

  it("seats a Dragon Utopia guard party larger than four corners without a cell-0 collision", () => {
    // A designer center-hex exact army (and the by-difficulty grail-utopia draw
    // at higher difficulties) can field FIVE+ Dragon Utopia guards. The bank
    // corner formation has only four corners, so the extras must spill onto free
    // cells and never keep their minted default cell 0 (which parked the fifth
    // guard on top of a corner guard — a corrupt board).
    let state = createAdventureGameState({
      seed: "utopia-overflow",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "dragon_utopia", 7);
    const field = state.adventure!.fields["bank-field"];
    field.location = "dragon_utopia";
    field.difficulty = 7;
    delete field.bankId;
    delete field.bankSize;
    field.customGuardUnits = [
      "neutral.gold_dragons",
      "neutral.black_dragons",
      "neutral.faerie_dragons",
      "neutral.rust_dragons",
      "neutral.crystal_dragons"
    ];

    startNeutralEncounter(state, getMainHero(state, "p1")!, field);
    expect(state.combat?.context).toMatchObject({ kind: "neutral", bankFormation: true });
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const guards = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "neutrals");
    expect(guards).toHaveLength(5);
    const positions = guards.map((unit) => unit.position);
    // Every guard on a DISTINCT cell — the bug parked the fifth on cell 0.
    expect(new Set(positions).size).toBe(5);
    // All four corners are used, plus one overflow cell (never a corner/attacker).
    for (const corner of CREATURE_BANK_GUARD_CORNERS) {
      expect(positions).toContain(corner);
    }
    expect(positions.filter((pos) => CREATURE_BANK_GUARD_OVERFLOW_CELLS.includes(pos))).toHaveLength(1);
  });

  it("lets the attacker deploy only in the central six squares", () => {
    const state = startBankCombat("bank-center", "naga_bank");

    // The engine source of truth for legal deploy cells.
    expect(placementCellsFor(state, "p1").sort((left, right) => left - right)).toEqual(
      [...CREATURE_BANK_ATTACKER_CELLS].sort((left, right) => left - right)
    );

    // Every offered placement lands in the centre — never a corner or back row.
    const placePositions = getLegalActions(state, "p1")
      .filter((entry) => entry.action.type === "PLACE_COMBAT_UNIT")
      .map((entry) => (entry.action as Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }>).position);
    expect(placePositions.length).toBeGreaterThan(0);
    for (const position of placePositions) {
      expect(CREATURE_BANK_ATTACKER_CELLS).toContain(position);
    }
    // Guards' corners are explicitly NOT offered to the attacker.
    for (const corner of CREATURE_BANK_GUARD_CORNERS) {
      expect(placePositions).not.toContain(corner);
    }
  });
});

// ===========================================================================
// Stack Token: lethal-hit absorption (the signature mechanic)
// ===========================================================================

describe("Stacked defender lethal absorption", () => {
  function bankNaga() {
    const draw: NeutralDraw = { unitDefId: "neutral.nagas", tier: "bronze", bankUnit: true };
    return makeCombatUnitFromNeutral(draw, "u1", 0, "legacy")!;
  }

  it("discards the Stack Token instead of dying, carrying leftover damage to the new Health", () => {
    const state = createAdventureGameState({ seed: "absorb", difficulty: "normal", rollFirstPlayer: false });
    const unit = bankNaga();
    unit.stackToken = "health";
    applyUnitCurrentSide(unit, "legacy");
    expect(unit.maxHealth).toBe(6); // 5 base + 1 health token

    unit.damage = 8; // lethal (>= 6), 2 excess over the stacked Health
    markUnitRemovedIfNeeded(state, unit);

    // Token discarded, stats reverted to the bare bank card, excess carried over.
    expect(unit.stackToken).toBeNull();
    expect(unit.maxHealth).toBe(5);
    expect(unit.damage).toBe(2);
    expect(state.eventLog.some((event) => event.type === "STACK_TOKEN_DISCARDED" && event.unitId === "u1")).toBe(true);
    expect(state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "u1")).toBe(false);
  });

  it("is defeated normally by the next lethal blow once the token is gone", () => {
    const state = createAdventureGameState({ seed: "absorb2", difficulty: "normal", rollFirstPlayer: false });
    const unit = bankNaga();
    unit.stackToken = "attack";
    applyUnitCurrentSide(unit, "legacy");

    unit.damage = unit.maxHealth; // first lethal blow -> token discarded, survives at 0
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.stackToken).toBeNull();
    expect(unit.damage).toBeLessThan(unit.maxHealth);

    unit.damage = unit.maxHealth; // second lethal blow -> removed
    markUnitRemovedIfNeeded(state, unit);
    expect(state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "u1")).toBe(true);
  });

  it("removes an un-stacked bank defender on the first lethal blow", () => {
    const state = createAdventureGameState({ seed: "absorb3", difficulty: "normal", rollFirstPlayer: false });
    const unit = bankNaga();
    expect(unit.stackToken).toBeUndefined();
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "u1")).toBe(true);
  });
});

// ===========================================================================
// The Dragon Fly Hive / Griffin Conservatory reward is its dedicated Creature
// Bank card carrying a REAL rulebook Stack Token (not a Neutral/faction card or
// Polish layer). These tests pin the token riding a PLAYER army card: folded
// into a later combat, absorbed like a bank defender, and synced back to it.
// ===========================================================================

describe("Creature Bank Stacked reward — the bank card carries a chosen Stack Token", () => {
  function refreshIfNeeded(state: GameState): GameState {
    return state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
  }

  it("makeCombatUnitFromArmy folds the Stack Token: +1 stat and +2 initiative, mirroring it onto the unit", () => {
    const plain = makeCombatUnitFromArmy(
      { id: "a-plain", unitDefId: "neutral.griffins", side: "bank" },
      "p1",
      "u-plain",
      1
    )!;
    expect(plain.stackToken).toBeUndefined();

    const attackTok = makeCombatUnitFromArmy(
      { id: "a-atk", unitDefId: "neutral.griffins", side: "bank", stackToken: "attack" },
      "p1",
      "u-atk",
      0
    )!;
    expect(attackTok.stackToken).toBe("attack");
    expect(attackTok.attack, "the token folds +1 Attack").toBe(plain.attack + 1);
    expect(attackTok.defense, "only Attack moved").toBe(plain.defense);
    expect(attackTok.maxHealth).toBe(plain.maxHealth);

    // The +2 Initiative variant (direct setup) folds initiative, nothing else.
    const iniTok = makeCombatUnitFromArmy(
      { id: "a-ini", unitDefId: "neutral.griffins", side: "bank", stackToken: "initiative" },
      "p1",
      "u-ini",
      0
    )!;
    expect(iniTok.stackToken).toBe("initiative");
    expect(iniTok.initiative, "the token folds +2 Initiative").toBe(plain.initiative + 2);
    expect(iniTok.attack).toBe(plain.attack);

    // +1 Health folds onto the health bar.
    const hpTok = makeCombatUnitFromArmy(
      { id: "a-hp", unitDefId: "neutral.griffins", side: "bank", stackToken: "health" },
      "p1",
      "u-hp",
      0
    )!;
    expect(hpTok.maxHealth).toBe(plain.maxHealth + 1);
  });

  // Deploys a single reward bank card carrying a `token` into a bank fight
  // the player then wins. Returns the settled state; the caller inspects the
  // army card's surviving `stackToken`.
  function fightWithRewardCard(
    seed: string,
    token: "attack" | "defense" | "health" | "initiative",
    absorbInCombat: boolean
  ): GameState {
    let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state = refreshIfNeeded(state);
    // Direct setup: the player's ONLY army card is the dedicated bank card.
    state.players.p1.army = [
      { id: "reward1", unitDefId: "neutral.dragon_flies", side: "bank", stackToken: token }
    ];
    placeBankUnderHero(state, "naga_bank", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const rewardUnit = Object.values(state.combat!.units).find((unit) => unit.armyUnitId === "reward1")!;
    expect(rewardUnit, "the Creature Bank reward deployed").toBeTruthy();
    expect(rewardUnit.bankUnit).toBe(true);
    expect(rewardUnit.stackToken, "the token mirrored onto the deployed unit").toBe(token);

    if (absorbInCombat) {
      // A lethal blow with 1 leftover: the token absorbs it (rulebook p.67) — the
      // unit is NOT removed; leftover carries to the now-lower Health.
      const foldedMax = rewardUnit.maxHealth;
      rewardUnit.damage = rewardUnit.maxHealth + 1;
      markUnitRemovedIfNeeded(state, rewardUnit);
      expect(rewardUnit.stackToken, "token discarded on absorb").toBeNull();
      expect(rewardUnit.damage, "the 1 leftover damage carried through").toBe(1);
      expect(rewardUnit.maxHealth, "stats revert to the plain card").toBeLessThan(foldedMax);
      expect(rewardUnit.damage, "and the unit survives").toBeLessThan(rewardUnit.maxHealth);
      expect(
        state.eventLog.some((event) => event.type === "STACK_TOKEN_DISCARDED" && event.unitId === rewardUnit.id),
        "the absorb announced itself on a PLAYER card too"
      ).toBe(true);
    }

    // Win: wipe the neutral guards (leaving the reward unit alive either way).
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    state.pendingChoice = null;
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    return state;
  }

  it("a lethal blow in combat is ABSORBED by the reward card's token — and afterwards the army card's token is GONE forever", () => {
    const state = fightWithRewardCard("reward-token-absorbed", "health", /* absorbInCombat */ true);
    const card = state.players.p1.army.find((unit) => unit.id === "reward1");
    expect(card, "the reward card survived the fight").toBeTruthy();
    expect(card!.side).toBe("bank");
    expect(card!.stackToken, "the absorbed token never comes back").toBeUndefined();
    expect(card!.stacks, "still never a Polish layer").toBeUndefined();
  });

  it("CONTROL: an un-absorbed survivor KEEPS the Stack Token on the army card after combat", () => {
    const state = fightWithRewardCard("reward-token-kept", "attack", /* absorbInCombat */ false);
    const card = state.players.p1.army.find((unit) => unit.id === "reward1");
    expect(card, "the reward card survived the fight").toBeTruthy();
    expect(card!.side).toBe("bank");
    expect(card!.stackToken, "an untouched token rides the card into the next fight").toBe("attack");
  });
});

// ===========================================================================
// Combat lifecycle: no Quick Combat, win reward, no experience
// ===========================================================================

describe("Creature Bank combat lifecycle", () => {
  it("never resolves as Quick Combat, even for a high-level hero", () => {
    const state = createAdventureGameState({ seed: "bank-qc", difficulty: "normal", rollFirstPlayer: false });
    placeBankUnderHero(state, "crypt", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);

    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(false);
    expect(state.phase).toBe("combat-setup");
    expect(state.combat?.context.kind).toBe("neutral");
    expect(state.combat?.context.kind === "neutral" && state.combat.context.bankId).toBe("crypt");
    // Not yet won — the Black Cube only goes on after the fight.
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(false);
  });

  it("grants the scaled reward and a Black Cube on a win, but no experience", () => {
    let state = createAdventureGameState({ seed: "bank-win", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "crypt", 7);
    const hero = getMainHero(state, "p1")!;
    const xpBefore = hero.experience;
    const levelBefore = hero.level;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);

    // Deploy one unit, then lock placement: the bank defenders reveal.
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    expect(place, "a unit must be placeable").toBeTruthy();
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    // The guaranteed Stack token changes the deterministic opening and may
    // immediately open a neutral target/ability choice; either is a live fight.
    expect(["combat", "choice"]).toContain(state.phase);

    // X (the reward multiplier) is the official fixed Normal count: 2.
    const stacked = state.combat?.context.kind === "neutral" ? (state.combat.context.bankStackCount ?? 0) : 0;
    expect(stacked).toBe(STACK_TOKENS_BY_DIFFICULTY.normal);

    const goldBefore = state.players.p1.resources.gold;

    // Force the win (all bank defenders down) and finalize.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // Crypt reward: 6 + 2 * X gold, where X is however many defenders Stacked.
    expect(state.players.p1.resources.gold).toBe(goldBefore + 6 + 2 * stacked);
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
    // Creature Banks grant NO experience.
    const heroAfter = getMainHero(state, "p1")!;
    expect(heroAfter.experience).toBe(xpBefore);
    expect(heroAfter.level).toBe(levelBefore);
    expect(state.combat).toBeNull();
    expect(state.phase).toBe("player-turn");
  });

  it("obeys the Round limit (house rule): a drawn-out bank combat pauses, and 1 MP extends it", () => {
    let state = createAdventureGameState({ seed: "bank-rounds", difficulty: "easy", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "crypt", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    expect(state.phase).toBe("combat");

    // Nobody can deal damage, so round 1 ends with every unit still alive.
    state.combat!.dice.scriptedRolls = Array(60).fill(-1);
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
    }

    let safety = 100;
    while (state.combat && !state.combat.awaitingContinue && !state.combat.outcome && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const defend = actions.find((legal) => legal.action.type === "DEFEND_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = defend ?? pass ?? keepRoll ?? actions[0];
      if (!next) break;
      state = apply(state, next.action);
    }

    // House rule: a Creature Bank obeys the one-round time limit like a normal
    // neutral fight — round 1 ends paused, waiting for the hero to spend MP.
    expect(state.combat?.awaitingContinue).toBe(true);
    expect(state.combat?.round).toBe(1);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "CONTINUE_NEUTRAL_COMBAT")).toBe(true);

    // Spending 1 MP extends the combat (the pause clears and a point is spent).
    getMainHero(state, "p1")!.movementPoints = 4;
    state = apply(state, { type: "CONTINUE_NEUTRAL_COMBAT", playerId: "p1" });
    expect(state.combat?.awaitingContinue ?? false).toBe(false);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(3);
    expect(state.combat?.outcome ?? null).toBeNull();
  });

  it("OFF (house rule 'bank-move-points'): a bank has NO Round limit — it rolls straight on (rulebook)", () => {
    let state = createAdventureGameState({
      seed: "bank-rounds-off",
      difficulty: "easy",
      rollFirstPlayer: false,
      houseRules: { "bank-move-points": false }
    });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "crypt", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    // Guaranteed Stack placement changes the deterministic opening and can
    // immediately open a neutral target/ability choice; either is a live fight.
    expect(["combat", "choice"]).toContain(state.phase);

    // Nobody can deal damage, so no side is ever destroyed.
    state.combat!.dice.scriptedRolls = Array(120).fill(-1);
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
    }

    // Drive round 1 to its end. With the rule OFF the fight never pauses — it
    // rolls straight into round 2 like an azure guard / a normal player fight.
    let safety = 300;
    while (state.combat && state.combat.round < 2 && !state.combat.outcome && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const defend = actions.find((legal) => legal.action.type === "DEFEND_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = defend ?? pass ?? keepRoll ?? actions[0];
      if (!next) break;
      state = apply(state, next.action);
    }

    expect(state.combat?.round, "rolled straight into round 2 — no Round limit").toBe(2);
    expect(state.combat?.awaitingContinue ?? false, "never paused for movement points").toBe(false);
    expect(
      getLegalActions(state, "p1").some((entry) => entry.action.type === "CONTINUE_NEUTRAL_COMBAT"),
      "no spend-MP-to-extend prompt"
    ).toBe(false);
  });

  it("cubes the field and adds the gained Dragon Flies card to the army on a win", () => {
    expect(CREATURE_BANKS.dragon_fly_hive.rewardStatus).toBe("implemented");

    let state = createAdventureGameState({ seed: "bank-hive", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "dragon_fly_hive", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // X (Stacked defenders) decides whether the bank card gets a Stack Token.
    const stacked = state.combat?.context.kind === "neutral" ? (state.combat.context.bankStackCount ?? 0) : 0;
    const resourcesBefore = { ...state.players.p1.resources };
    const armyIdsBefore = new Set(state.players.p1.army.map((unit) => unit.id));

    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // The reward grants a unit card, not resources. The Stacked token is now a
    // per-fight RANDOM roll (user rule 2026-08-18), so there is NO pick step — the
    // card joins the army immediately, flagged for a random token but carrying no
    // fixed stat between fights.
    expect(state.players.p1.resources).toEqual(resourcesBefore);
    expect(
      getLegalActions(state, "p1").some(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /Stack Token bonus|\+1 Attack/.test(entry.label)
      ),
      "the deliberate Stack Token pick is gone"
    ).toBe(false);

    // Exactly one dedicated Dragon Flies bank card joined the army.
    const gained = state.players.p1.army.filter((unit) => !armyIdsBefore.has(unit.id));
    expect(gained).toHaveLength(1);
    expect(gained[0].unitDefId).toBe("neutral.dragon_flies");
    expect(gained[0].side).toBe("bank");
    expect(gained[0].stacks).toBeUndefined();
    expect(gained[0].stackToken, "no FIXED token — it is rolled fresh each fight").toBeUndefined();
    if (stacked >= 2) {
      expect(gained[0].stackTokenRandom, "a Stacked reward rolls a random token each fight").toBe(true);
    } else {
      expect(gained[0].stackTokenRandom, "fewer than 2 Stacked → plain bank card, no token").toBeUndefined();
    }
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
    expect(state.combat).toBeNull();
  });

  it("Griffin Conservatory grants its bank card with a per-fight RANDOM Stack Token", () => {
    let state = createAdventureGameState({
      seed: "bank-conservatory-reward",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state = state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "griffin_conservatory", 7);
    const hero = getMainHero(state, "p1")!;
    const armyIdsBefore = new Set(state.players.p1.army.map((unit) => unit.id));

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Pin the reward threshold so this test covers the Stacked card as well as
    // its identity. The bank setup/roll tests cover how this count is produced.
    if (state.combat?.context.kind === "neutral") {
      state.combat.context.bankStackCount = 2;
    }
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // No deliberate pick anymore: the card joins the army at once, flagged for a
    // random per-fight token (rolled at combat start, not persisted).
    expect(state.adventure?.pendingVisit?.steps ?? []).not.toContainEqual(
      expect.objectContaining({ type: "CHOOSE_ONE", prompt: "Griffins: choose its Stack Token bonus" })
    );
    const gained = state.players.p1.army.filter((unit) => !armyIdsBefore.has(unit.id));
    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({
      unitDefId: "neutral.griffins",
      side: "bank",
      stackTokenRandom: true
    });
    expect(gained[0].stackToken, "no fixed token rides the card between fights").toBeUndefined();
    expect(gained[0].stacks, "the reward is never a Polish layer").toBeUndefined();

    // The factory itself adds NO token (the roll happens at combat start), so a
    // freshly built unit carries the plain bank-side initiative.
    const deployed = makeCombatUnitFromArmy(gained[0], "p1", "reward-griffins", 0)!;
    expect(deployed.bankUnit).toBe(true);
    expect(deployed.assets?.cardImage).toBe("/assets/units-creature-bank-griffins.webp");
    expect(deployed.cardName).toBe("Griffins (Creature Bank)");
    expect(deployed.initiative).toBe(CREATURE_BANK_UNIT_SIDES["neutral.griffins"].initiative);
  });

  it("rolls a RANDOM Stack Token at combat start (varies by fight), never persisted", () => {
    // A won reward card already in the army, flagged for a per-fight random token.
    function startFightWithRandomReward(seed: string): GameState {
      let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
      state = state.players.p1.needsHandRefresh || state.players.p1.canMulligan
        ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
        : state;
      state.players.p1.army = [
        { id: "reward-df", unitDefId: "neutral.dragon_flies", side: "bank", stackTokenRandom: true }
      ];
      placeBankUnderHero(state, "dragon_fly_hive", 7);
      const hero = getMainHero(state, "p1")!;
      startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
      const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      state = apply(state, place!.action);
      return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    }
    const rewardOf = (state: GameState) =>
      Object.values(state.combat!.units).find((unit) => unit.armyUnitId === "reward-df")!;

    const STATS = ["attack", "defense", "health", "initiative"];
    const seeds = ["rnd-a", "rnd-b", "rnd-c", "rnd-d", "rnd-e", "rnd-f", "rnd-g", "rnd-h"];
    const rolled = seeds.map((seed) => rewardOf(startFightWithRandomReward(seed)).stackToken);

    // Every fight lands SOME valid Stack Token — the roll actually fires.
    for (const token of rolled) {
      expect(STATS, "a random Stack Token is rolled onto the reward unit each fight").toContain(token);
    }
    // It is RANDOM, not constant: distinct fights produce distinct stats. (If the
    // roll were broken/hardcoded, all eight would match — this fails.)
    expect(new Set(rolled).size, "the token varies fight to fight").toBeGreaterThan(1);

    // Deterministic within a fight: the SAME seed reproduces the SAME roll (so
    // every client agrees — no desync).
    expect(rewardOf(startFightWithRandomReward("rnd-a")).stackToken).toBe(rolled[0]);

    // The rolled stat actually folds into the live stats (bakes off the bank side).
    const state = startFightWithRandomReward("rnd-a");
    const reward = rewardOf(state);
    const side = CREATURE_BANK_UNIT_SIDES["neutral.dragon_flies"];
    const delta = (stat: "attack" | "defense" | "health" | "initiative") =>
      reward.stackToken === stat ? stackTokenDelta(stat) : 0;
    expect(reward.attack).toBe(side.attack + delta("attack"));
    expect(reward.initiative).toBe(side.initiative + delta("initiative"));

    // NEVER persisted: after the fight the survivor's army card keeps the random
    // FLAG but carries no fixed token — the next fight rolls fresh.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    const card = state.players.p1.army.find((unit) => unit.id === "reward-df")!;
    expect(card.stackTokenRandom, "the random flag rides the card into the next fight").toBe(true);
    expect(card.stackToken, "no fixed token is ever written back").toBeUndefined();
  });

  it("Pyramid: a Stacked win grants the base Search plus a remove-a-card-then-Search(5) per Stacked defender", () => {
    expect(CREATURE_BANKS.pyramid.rewardStatus).toBe("implemented");

    let state = createAdventureGameState({ seed: "bank-pyramid", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "pyramid", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Force exactly one Stacked defender so the per-Stack extra runs once.
    if (state.combat?.context.kind === "neutral") {
      state.combat.context.bankStackCount = 1;
    }
    // Give the hero a removable Spell plus a Statistic, which must NOT be offered.
    state.players.p1.hand = ["spell.magic_arrow", "stat.attack"];
    state.players.p1.discard = [];

    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    // The force-kill shortcut can leave a moot activation-order tie open (the two
    // Diamond Golems share initiative); real combat resolves it as it plays out.
    state.pendingChoice = null;
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    state = chooseAttackStackTokenIfOffered(state);

    // The win cubed the field and queued the base Search (5) of the Spell deck.
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
    expect(
      state.adventure!.rewardQueue.some(
        (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells" && reward.count === 5
      )
    ).toBe(true);

    // The per-Stack extra is waiting for input: a remove-then-Search menu.
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    const actions = getLegalActions(state, "p1");
    const removeOptions = actions.filter((legal) => legal.label.startsWith("Remove "));
    // Only the Spell qualifies (the Statistic is excluded); a Done exit is offered.
    expect(removeOptions).toHaveLength(1);
    expect(removeOptions[0].label).toContain("Magic Arrow");
    expect(removeOptions[0].label).toContain("spells deck");
    expect(actions.some((legal) => legal.label === "Done")).toBe(true);

    state = apply(state, removeOptions[0].action);

    // The Spell left the game and a matching Search (5) of the Spell deck fired.
    expect(state.players.p1.removed).toContain("spell.magic_arrow");
    const searched = state.adventure?.rewardQueue.some(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells" && reward.count === 5
    );
    const choosing = state.pendingChoice?.type === "DECK_SEARCH";
    expect(searched || choosing).toBe(true);
  });

  it("Dragon Fly Hive: a win gains the unit AND an Ability Empower token (house rule)", () => {
    let state = createAdventureGameState({ seed: "bank-hive-empower", difficulty: "normal", rollFirstPlayer: false });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "dragon_fly_hive", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Give the hero an ability to Empower later with the token.
    state.players.p1.hand = ["ability.archery"];
    state.players.p1.empoweredAbilities = [];
    state.players.p1.abilityEmpowerToken = 0;
    const armyIdsBefore = new Set(state.players.p1.army.map((unit) => unit.id));

    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    // Clear the moot activation-order tie left by the force-kill shortcut (the
    // four identical Dragon Flies guards share initiative).
    state.pendingChoice = null;
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    state = chooseAttackStackTokenIfOffered(state);

    // The unit reward resolved first (a Dragon Flies card joined the army)...
    const gained = state.players.p1.army.filter((unit) => !armyIdsBefore.has(unit.id));
    expect(gained).toHaveLength(1);
    expect(gained[0].unitDefId).toBe("neutral.dragon_flies");
    expect(gained[0].side).toBe("bank");

    // ...then the house-rule bonus grants an Ability Empower token (not an
    // immediate empower pick). Spend anytime on a hand Ability.
    expect(state.players.p1.abilityEmpowerToken).toBe(1);
    expect(state.eventLog.some((event) => event.type === "ABILITY_EMPOWER_TOKEN_GAINED")).toBe(true);
    expect(state.players.p1.empoweredAbilities ?? []).not.toContain("ability.archery");

    const tokenOffer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.cardId === "ability.archery"
    );
    expect(tokenOffer, "token spend offered for Archery in hand").toBeTruthy();
    state = apply(state, tokenOffer!.action);
    expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);
    expect(state.players.p1.empoweredAbilities).toContain("ability.archery");
    expect(state.eventLog.some((event) => event.type === "ABILITY_EMPOWERED")).toBe(true);
  });

  it("OFF (house rule 'bank-empower-ability'): the win gains the unit but NO Ability Empower token", () => {
    let state = createAdventureGameState({
      seed: "bank-hive-empower-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "bank-empower-ability": false }
    });
    state = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "dragon_fly_hive", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    state.players.p1.hand = ["ability.archery"];
    state.players.p1.empoweredAbilities = [];
    state.players.p1.abilityEmpowerToken = 0;
    const armyIdsBefore = new Set(state.players.p1.army.map((unit) => unit.id));

    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    state.pendingChoice = null;
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    state = chooseAttackStackTokenIfOffered(state);

    // The unit reward still resolves — a Dragon Flies card joined the army…
    const gained = state.players.p1.army.filter((unit) => !armyIdsBefore.has(unit.id));
    expect(gained).toHaveLength(1);
    expect(gained[0].unitDefId).toBe("neutral.dragon_flies");
    expect(gained[0].side).toBe("bank");

    // …but the token bonus is gated off.
    expect(state.players.p1.abilityEmpowerToken ?? 0, "no token without the rule").toBe(0);
    expect(state.eventLog.some((event) => event.type === "ABILITY_EMPOWER_TOKEN_GAINED"), "no token event").toBe(
      false
    );
    expect(state.players.p1.empoweredAbilities ?? [], "nothing was empowered").toHaveLength(0);
    expect(state.eventLog.some((event) => event.type === "ABILITY_EMPOWERED"), "no empower event").toBe(false);
  });
});

// ===========================================================================
// Gradeless targeting: a bank card has NO tier, so guards hit the NEAREST enemy
// ===========================================================================

describe("Creature Bank guards are gradeless and target the nearest enemy", () => {
  // Board: 4 columns × 5 rows, position = row * 4 + column, Manhattan distance.
  // Each scenario below is run twice — once as an ordinary graded neutral guard
  // (the CONTROL) and once as a Creature Bank guard (bankUnit) — and the two
  // diverge ONLY because of the gradeless rule, so removing it fails the test.
  function place(
    state: GameState,
    id: string,
    controllerId: string,
    grade: UnitGrade,
    type: UnitType,
    position: number
  ): CombatUnitState {
    const unit = state.combat!.units[id];
    if (!unit) {
      throw new Error(`scenario expects unit ${id} in the initial combat`);
    }
    unit.controllerId = controllerId;
    unit.grade = grade;
    unit.type = type;
    unit.position = position;
    unit.activatedThisRound = false;
    unit.attackedThisActivation = false;
    return unit;
  }

  function onlyUnits(state: GameState, units: CombatUnitState[]): void {
    const map: Record<string, CombatUnitState> = {};
    for (const unit of units) {
      map[unit.id] = unit;
    }
    state.combat!.units = map;
    state.combat!.obstacles = [];
  }

  // A bronze melee guard in corner 0 with a same-tier enemy far away (pos 19)
  // and a higher-tier enemy right beside it (pos 1). A graded neutral prefers
  // the same tier (the far one); a gradeless bank guard takes the nearer one.
  function meleeScenario(bankUnit: boolean): GameState {
    const state = createInitialGameState(`bank-grade-${bankUnit}`);
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    guard.bankUnit = bankUnit;
    place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    place(state, "unit_p1_griffins", "p1", "azure", "ground", 1);
    onlyUnits(state, [
      state.combat!.units.unit_p2_skeletons,
      state.combat!.units.unit_p1_crusaders,
      state.combat!.units.unit_p1_griffins
    ]);
    return state;
  }

  it("CONTROL: a graded neutral guard obeys the same-tier rule (the FAR same-tier unit)", () => {
    const state = meleeScenario(false);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_crusaders");
  });

  it("a bank guard ignores tier and hits the NEAREST enemy regardless of its tier", () => {
    const state = meleeScenario(true);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_griffins");
  });

  it("a bank guard still attacks a CLOSE commander first (commanders are not buried as no-tier)", () => {
    // Bank guard at 0; far graded unit at 19; adjacent WOG commander at 1.
    // Pure distance: the commander is nearest, so the bank hits them first.
    // CONTROL: a graded neutral still prefers the far same-tier graded unit
    // over the no-tier commander.
    const bankState = createInitialGameState("bank-commander-close");
    const bankGuard = place(bankState, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    bankGuard.bankUnit = true;
    place(bankState, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    const commander = place(bankState, "unit_p1_griffins", "p1", "bronze", "ground", 1);
    commander.commanderSlug = "paladin";
    onlyUnits(bankState, [
      bankState.combat!.units.unit_p2_skeletons,
      bankState.combat!.units.unit_p1_crusaders,
      bankState.combat!.units.unit_p1_griffins
    ]);
    expect(
      pickNeutralTarget(bankState.combat!, bankState.combat!.units.unit_p2_skeletons)?.id,
      "bank hits the adjacent commander, not the far graded unit"
    ).toBe("unit_p1_griffins");

    const gradedState = createInitialGameState("graded-commander-last");
    place(gradedState, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    place(gradedState, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    const gradedCommander = place(gradedState, "unit_p1_griffins", "p1", "bronze", "ground", 1);
    gradedCommander.commanderSlug = "paladin";
    onlyUnits(gradedState, [
      gradedState.combat!.units.unit_p2_skeletons,
      gradedState.combat!.units.unit_p1_crusaders,
      gradedState.combat!.units.unit_p1_griffins
    ]);
    expect(
      pickNeutralTarget(gradedState.combat!, gradedState.combat!.units.unit_p2_skeletons)?.id,
      "CONTROL: graded neutral still hits the far graded unit, not the close commander"
    ).toBe("unit_p1_crusaders");
  });

  // A GRADED neutral attacker (bronze melee) facing two bronze melee enemies: a
  // graded one far away (pos 19) and a bank-guard card adjacent (pos 1). Same
  // tier and same type, so only distance and the no-tier rule differ. A bank
  // guard card carries NO tier ("grade 0"), so as a TARGET it sorts behind every
  // graded enemy — the attacker takes the FAR graded unit, not the adjacent bank
  // guard. The CONTROL (the adjacent unit graded, not a bank card) takes it.
  function targetedLastScenario(adjacentIsBankCard: boolean): GameState {
    const state = createInitialGameState(`bank-target-last-${adjacentIsBankCard}`);
    place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    const adjacent = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 1);
    adjacent.bankUnit = adjacentIsBankCard;
    onlyUnits(state, [
      state.combat!.units.unit_p2_skeletons,
      state.combat!.units.unit_p1_crusaders,
      state.combat!.units.unit_p1_griffins
    ]);
    return state;
  }

  it("CONTROL: a graded attacker takes the adjacent same-tier unit (nearest wins the tie)", () => {
    const state = targetedLastScenario(false);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_griffins");
  });

  it("a gradeless bank-guard card is targeted LAST — the attacker takes the far graded unit instead", () => {
    const state = targetedLastScenario(true);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_crusaders");
  });

  // A ranged guard with a distant ranged enemy (pos 19) and a nearer melee enemy
  // (pos 2 — two away, so NOT adjacent and therefore not "engaged"). The ranged
  // "hunt ranged first" rule is universal and is KEPT for bank guards, so even a
  // gradeless guard shoots the far ranged unit over the near melee one.
  function rangedPreferenceScenario(bankUnit: boolean): GameState {
    const state = createInitialGameState(`bank-ranged-pref-${bankUnit}`);
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ranged", 0);
    guard.bankUnit = bankUnit;
    place(state, "unit_p1_marksmen", "p1", "bronze", "ranged", 19);
    place(state, "unit_p1_crusaders", "p1", "azure", "ground", 2);
    onlyUnits(state, [
      state.combat!.units.unit_p2_skeletons,
      state.combat!.units.unit_p1_marksmen,
      state.combat!.units.unit_p1_crusaders
    ]);
    return state;
  }

  it("a ranged bank guard KEEPS the ranged-prefers-ranged rule (far ranged over near melee)", () => {
    const state = rangedPreferenceScenario(true);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_marksmen");
  });

  // Two RANGED enemies: a same-tier one far (pos 19) and a higher-tier one near
  // (pos 2). Both are inside the ranged-preferred pool, so this isolates the tier
  // ordering: a graded guard prefers its own tier (the far one); a gradeless bank
  // guard ignores tier and takes the nearest ranged unit.
  function rangedTierScenario(bankUnit: boolean): GameState {
    const state = createInitialGameState(`bank-ranged-tier-${bankUnit}`);
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ranged", 0);
    guard.bankUnit = bankUnit;
    place(state, "unit_p1_marksmen", "p1", "bronze", "ranged", 19);
    place(state, "unit_p1_crusaders", "p1", "azure", "ranged", 2);
    onlyUnits(state, [
      state.combat!.units.unit_p2_skeletons,
      state.combat!.units.unit_p1_marksmen,
      state.combat!.units.unit_p1_crusaders
    ]);
    return state;
  }

  it("CONTROL: a graded ranged neutral picks the same-tier ranged enemy (tier over distance)", () => {
    const state = rangedTierScenario(false);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_marksmen");
  });

  it("a ranged bank guard ignores tier and shoots the NEAREST ranged enemy", () => {
    const state = rangedTierScenario(true);
    expect(pickNeutralTarget(state.combat!, state.combat!.units.unit_p2_skeletons)?.id).toBe("unit_p1_crusaders");
  });

  // Two enemies the SAME distance from the guard but different tiers. A graded
  // attacker breaks the tie by tier (a single front-runner); a gradeless bank
  // guard ties them on distance, so the rulebook hands the choice to the player.
  function tieScenario(bankUnit: boolean): GameState {
    const state = createInitialGameState(`bank-tie-${bankUnit}`);
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 5);
    guard.bankUnit = bankUnit;
    place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 1); // distance 1
    place(state, "unit_p1_griffins", "p1", "azure", "ground", 9); // distance 1
    onlyUnits(state, [
      state.combat!.units.unit_p2_skeletons,
      state.combat!.units.unit_p1_crusaders,
      state.combat!.units.unit_p1_griffins
    ]);
    return state;
  }

  it("CONTROL: a graded neutral breaks an equal-distance tie by tier (one front-runner)", () => {
    const state = tieScenario(false);
    const ties = getNeutralTargetTies(state.combat!, state.combat!.units.unit_p2_skeletons);
    expect(ties.map((unit) => unit.id)).toEqual(["unit_p1_crusaders"]);
  });

  it("a bank guard ties equal-distance enemies regardless of tier (player chooses)", () => {
    const state = tieScenario(true);
    const ties = getNeutralTargetTies(state.combat!, state.combat!.units.unit_p2_skeletons);
    expect(ties.map((unit) => unit.id).sort()).toEqual(["unit_p1_crusaders", "unit_p1_griffins"]);
  });
});

// ===========================================================================
// Tier-gated spells/specialties cannot target a gradeless bank defender
// ===========================================================================

describe("Creature Bank defenders are exempt from tier-specific spells", () => {
  function passAllReactions(state: GameState): GameState {
    let current = state;
    let safety = 40;
    while (current.reactionWindow && safety > 0) {
      safety -= 1;
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
    }
    return current;
  }

  // p2 skeletons = the would-be Berserk target (bronze). Berserk is grade-gated
  // (Power 0 already reaches bronze), so the ONLY thing standing between it and
  // the skeletons is whether the skeletons are a tierless bank defender.
  function berserkScene(bankDefender: boolean): GameState {
    const state = createInitialGameState(`bank-berserk-${bankDefender}`);
    const combat = state.combat!;
    combat.obstacles = [];
    combat.units.unit_p2_skeletons.grade = "bronze";
    combat.units.unit_p2_skeletons.bankUnit = bankDefender;
    combat.units.unit_p1_marksmen.position = 3;
    state.players.p1.hand = ["spell.berserk", "stat.power", "stat.power", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    combat.activeUnitId = "unit_p1_marksmen";
    combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    combat.dice.rollCount = 0;
    return state;
  }

  function berserkTargetIds(state: GameState): string[] {
    return getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter(
        (action): action is Extract<GameAction, { type: "CAST_SPELL" }> =>
          action.type === "CAST_SPELL" && action.cardId === "spell.berserk" && action.target?.type === "unit"
      )
      .map((action) => (action.target as { type: "unit"; unitId: string }).unitId);
  }

  it("offers Berserk on a graded enemy but never on a bank defender of the same grade", () => {
    const bank = berserkScene(true);
    const bankTargets = berserkTargetIds(bank);
    expect(bankTargets).not.toContain("unit_p2_skeletons"); // tierless bank guard: not targetable
    expect(bankTargets).toContain("unit_p2_vampires"); // an ordinary graded enemy still is

    // The SAME skeletons, when not a bank defender, is a perfectly legal target.
    expect(berserkTargetIds(berserkScene(false))).toContain("unit_p2_skeletons");
  });

  it("never lands Berserk on a bank defender even if the cast is forced (resolution backstop)", () => {
    // The reducer does not re-validate spell targets against the legal list, so a
    // forced cast must still fizzle: the gradeless gate makes resolution a no-op.
    const state = berserkScene(true);
    const result = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.berserk",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    let next = result.state;
    if (result.errors.length === 0 && next.stack[0]) {
      next.stack[0].modifiers.spellPowerBonus = 4; // enough Power to reach any real grade
      next = passAllReactions(next);
    }
    expect(unitIsBerserk(next.activeEffects, next.combat!.units.unit_p2_skeletons)).toBe(false);
  });

  it("CONTROL: the same forced Berserk DOES land on a graded enemy", () => {
    const state = berserkScene(false);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.berserk" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Berserk should be castable on a graded enemy").toBeTruthy();
    let next = apply(state, cast!.action);
    next = passAllReactions(next); // Power 0 already reaches bronze
    expect(unitIsBerserk(next.activeEffects, next.combat!.units.unit_p2_skeletons)).toBe(true);
  });
});
