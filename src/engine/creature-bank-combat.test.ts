import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "./index";
import {
  buildCreatureBankCombatUnits,
  fieldCreatureBankId,
  getMainHero,
  isFieldGuarded,
  makeCombatUnitFromNeutral,
  placeCreatureBank,
  type NeutralDraw
} from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { applyUnitCurrentSide } from "./unit-transforms";
import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  STACK_TOKENS_BY_DIFFICULTY,
  stackTokenDelta,
  type CreatureBankId
} from "@/data/map/creature-banks";
import type { GameDifficulty } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
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

  it("places the rulebook number of Stack Tokens by difficulty, each on a different card", () => {
    const counts: Record<GameDifficulty, number> = { easy: 1, normal: 2, hard: 3, impossible: 4 };
    for (const difficulty of ["easy", "normal", "hard", "impossible"] as GameDifficulty[]) {
      const state = createAdventureGameState({ seed: `bank-${difficulty}`, difficulty, rollFirstPlayer: false });
      const { units, stackedCount } = buildCreatureBankCombatUnits(state, "crypt");
      expect(stackedCount).toBe(STACK_TOKENS_BY_DIFFICULTY[difficulty]);
      expect(stackedCount).toBe(counts[difficulty]);

      const stacked = units.filter((unit) => unit.stackToken);
      expect(stacked).toHaveLength(stackedCount);
      // Tokens sit on distinct cards.
      expect(new Set(stacked.map((unit) => unit.id)).size).toBe(stackedCount);
    }
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
    state = state.players.p1.needsHandRefresh
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
    expect(state.phase).toBe("combat");

    const stacked = state.combat?.context.kind === "neutral" ? (state.combat.context.bankStackCount ?? 0) : 0;
    expect(stacked).toBe(STACK_TOKENS_BY_DIFFICULTY.normal); // 2 on Normal

    const goldBefore = state.players.p1.resources.gold;

    // Force the win (all bank defenders down) and finalize.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // Crypt reward: 6 + 2 * X gold (X = 2 on Normal) = 10.
    expect(state.players.p1.resources.gold).toBe(goldBefore + 6 + 2 * stacked);
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
    // Creature Banks grant NO experience.
    const heroAfter = getMainHero(state, "p1")!;
    expect(heroAfter.experience).toBe(xpBefore);
    expect(heroAfter.level).toBe(levelBefore);
    expect(state.combat).toBeNull();
    expect(state.phase).toBe("player-turn");
  });

  it("has no Round limit: a drawn-out bank combat rolls into round 2 instead of pausing for MP", () => {
    let state = createAdventureGameState({ seed: "bank-rounds", difficulty: "easy", rollFirstPlayer: false });
    state = state.players.p1.needsHandRefresh
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
    while (state.combat && (state.combat.round ?? 1) < 2 && !state.combat.awaitingContinue && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const defend = actions.find((legal) => legal.action.type === "DEFEND_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = defend ?? pass ?? keepRoll ?? actions[0];
      if (!next) break;
      state = apply(state, next.action);
    }

    // A Creature Bank has no Round limit (rulebook p.66): the fight advanced into
    // round 2 on its own and never paused to spend MP to continue.
    expect(state.combat?.awaitingContinue ?? false).toBe(false);
    expect(state.combat?.round ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("still cubes the field on a win but grants no resources for a not-yet-implemented gain-a-unit reward", () => {
    expect(CREATURE_BANKS.dragon_fly_hive.rewardStatus).toBe("not-implemented");

    let state = createAdventureGameState({ seed: "bank-hive", difficulty: "normal", rollFirstPlayer: false });
    state = state.players.p1.needsHandRefresh
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    placeBankUnderHero(state, "dragon_fly_hive", 7);
    const hero = getMainHero(state, "p1")!;

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const before = { ...state.players.p1.resources };
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // The Hive's reward is "gain a Dragon Flies" (Gained Stacked Units, not yet
    // implemented): no resources change, but the win is still recorded.
    expect(state.players.p1.resources).toEqual(before);
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
    expect(state.combat).toBeNull();
  });
});
