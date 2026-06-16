import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for three spells imported from the fan wiki. Each rule is
 * engine-enforced; every test fails if the wiring is removed.
 *  - Implosion (Expert Earth)  — flat spell damage that scales with Power
 *                                (Power 1/3/5 → 2/4/6; Power 0 deals nothing).
 *  - Dispel    (Basic Water)   — strips every removable ongoing effect off a
 *                                unit, grade-gated like Anti-Magic/Blind.
 *  - Frenzy    (Expert Fire)   — the attack ignores the attacked unit's Defense,
 *                                cost-gated by the defender's grade.
 *
 * Sandbox grades/types (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findCast(state: GameState, playerId: "p1" | "p2", cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

// ---------------------------------------------------------------------------
// Implosion — flat spell damage scaling with Power (0:0, 1:2, 3:4, 5:6)
// ---------------------------------------------------------------------------

describe("Implosion spell", () => {
  function castImplosionAt(power: number): number {
    const state = createInitialGameState(`implosion-${power}`);
    // Spare Power statistics open the caster's Empower window so the cast waits
    // on the stack, where the test sets the Power actually paid (see Blind).
    state.players.p1.hand = ["spell.implosion", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = []; // no spell-damage reduction to muddy the count
    target.maxHealth = 30; // survive so the exact damage is readable

    const cast = findCast(state, "p1", "spell.implosion", "unit_p2_skeletons");
    expect(cast, "Implosion should be a legal cast on an enemy unit").toBeTruthy();
    const casted = applyOk(state, cast!.action);
    // Stand in for paying N Power into the cast (Empower / Power statistics).
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    const result = passAllReactions(casted);
    return result.combat!.units.unit_p2_skeletons.damage;
  }

  it("deals nothing at Power 0 (the card has no tier below Power 1)", () => {
    expect(castImplosionAt(0)).toBe(0);
  });

  it("scales 2 / 4 / 6 at Power 1 / 3 / 5", () => {
    expect(castImplosionAt(1)).toBe(2);
    expect(castImplosionAt(3)).toBe(4);
    expect(castImplosionAt(5)).toBe(6);
  });

  it("holds each tier between breakpoints (Power 2 → 2, Power 4 → 4, Power 6 → 6)", () => {
    expect(castImplosionAt(2)).toBe(2);
    expect(castImplosionAt(4)).toBe(4);
    expect(castImplosionAt(6)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Dispel — remove every removable ongoing effect from a unit, grade-gated.
// ---------------------------------------------------------------------------

describe("Dispel spell", () => {
  function pushEffect(
    state: GameState,
    id: string,
    unitId: UnitId,
    removable: boolean
  ): void {
    state.activeEffects.push({
      id,
      name: id,
      scope: "unit",
      duration: { type: "combat" },
      polarity: "positive",
      removable,
      modifiers: [{ type: "ATTACK_BONUS", amount: 2 }],
      source: { type: "system" },
      controllerId: state.combat!.units[unitId].controllerId,
      target: { type: "unit", unitId },
      startedRound: state.round,
      startedCombatRound: state.combat!.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });
  }

  function dispelState(
    seed: string,
    targetUnitId: UnitId,
    grade: "bronze" | "silver" | "gold"
  ): GameState {
    const state = createInitialGameState(seed);
    // Spare Power statistics open the caster's Empower window so the cast waits
    // on the stack, where the grade-gate test sets the Power actually paid.
    state.players.p1.hand = ["spell.dispel", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units[targetUnitId].grade = grade;
    return state;
  }

  function hasEffect(state: GameState, id: string): boolean {
    return state.activeEffects.some((effect) => effect.id === id);
  }

  it("removes a removable effect from a bronze enemy at Power 0", () => {
    const state = dispelState("dispel-bronze", "unit_p2_skeletons", "bronze");
    pushEffect(state, "effect_buff", "unit_p2_skeletons", true);
    const cast = findCast(state, "p1", "spell.dispel", "unit_p2_skeletons");
    expect(cast, "Dispel should be castable on any unit").toBeTruthy();
    const result = passAllReactions(applyOk(state, cast!.action));
    expect(hasEffect(result, "effect_buff")).toBe(false);
  });

  it("can strip a friendly unit's effect too (any-unit target)", () => {
    const state = dispelState("dispel-friendly", "unit_p1_griffins", "bronze");
    pushEffect(state, "effect_friendly_buff", "unit_p1_griffins", true);
    const cast = findCast(state, "p1", "spell.dispel", "unit_p1_griffins");
    expect(cast, "Dispel should target friendly units as well").toBeTruthy();
    const result = passAllReactions(applyOk(state, cast!.action));
    expect(hasEffect(result, "effect_friendly_buff")).toBe(false);
  });

  it("never removes a non-removable effect", () => {
    const state = dispelState("dispel-locked", "unit_p2_skeletons", "bronze");
    pushEffect(state, "effect_removable", "unit_p2_skeletons", true);
    pushEffect(state, "effect_locked", "unit_p2_skeletons", false);
    const cast = findCast(state, "p1", "spell.dispel", "unit_p2_skeletons");
    const result = passAllReactions(applyOk(state, cast!.action));
    expect(hasEffect(result, "effect_removable")).toBe(false);
    expect(hasEffect(result, "effect_locked")).toBe(true);
  });

  it("is grade-gated: Power 0 cannot dispel a gold unit, but Power 2 can", () => {
    // Power 0 against a gold unit: the gate blocks it, the effect survives.
    const gated = dispelState("dispel-gate", "unit_p2_dread_knights", "gold");
    pushEffect(gated, "effect_gold_buff", "unit_p2_dread_knights", true);
    const gatedCast = findCast(gated, "p1", "spell.dispel", "unit_p2_dread_knights");
    const gatedResult = passAllReactions(applyOk(gated, gatedCast!.action));
    expect(hasEffect(gatedResult, "effect_gold_buff")).toBe(true);

    // The same cast with 2 Power paid reaches gold and strips it.
    const powered = dispelState("dispel-power", "unit_p2_dread_knights", "gold");
    pushEffect(powered, "effect_gold_buff", "unit_p2_dread_knights", true);
    const poweredCast = findCast(powered, "p1", "spell.dispel", "unit_p2_dread_knights");
    const casted = applyOk(powered, poweredCast!.action);
    casted.stack[0]!.modifiers.spellPowerBonus = 2;
    const result = passAllReactions(casted);
    expect(hasEffect(result, "effect_gold_buff")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Frenzy — the attack ignores the attacked unit's Defense, gated by its grade.
// ---------------------------------------------------------------------------

describe("Frenzy spell", () => {
  function attackState(seed: string, defenderGrade: "bronze" | "silver" | "gold"): GameState {
    const state = createInitialGameState(seed);
    // 4 spare Power statistics cover the cost of the silver/gold options.
    state.players.p1.hand = ["spell.frenzy", "stat.power", "stat.power", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    const attacker = state.combat!.units.unit_p1_crusaders;
    const defender = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    defender.abilities = [];
    attacker.position = 9;
    defender.position = 13; // adjacent → a melee attack
    attacker.attack = 6;
    defender.defense = 4;
    attacker.maxHealth = 40;
    defender.maxHealth = 40;
    defender.grade = defenderGrade;
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  function declareAttack(state: GameState): GameState {
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
  }

  function frenzyOffered(state: GameState): boolean {
    return getLegalActions(state, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.frenzy" && !legal.action.asPowerBoost
    );
  }

  function playFrenzy(state: GameState): GameState {
    return applyOk(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.frenzy", mode: "basic" });
  }

  function payPower(state: GameState, times: number): GameState {
    let next = state;
    for (let i = 0; i < times; i += 1) {
      next = applyOk(next, { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.power", mode: "basic" });
    }
    return next;
  }

  it("baseline without Frenzy: 6 attack − 4 defense = 2 damage", () => {
    const attacked = declareAttack(attackState("frenzy-baseline", "bronze"));
    const result = passAllReactions(attacked);
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("at Power 0 it pierces a bronze defender's defense (6 damage)", () => {
    const attacked = declareAttack(attackState("frenzy-bronze", "bronze"));
    expect(frenzyOffered(attacked), "Frenzy is offered to the attacker").toBe(true);
    // Frenzy played with no Power pooled → Power 0 → pierces bronze.
    const result = passAllReactions(playFrenzy(attacked));
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(6);
  });

  it("at Power 0 it does NOT pierce a gold defender, but 4 pooled Power does", () => {
    // Power 0 against gold: bronze pierce only, the gold Defense stands → 2 damage.
    const noPower = passAllReactions(playFrenzy(declareAttack(attackState("frenzy-gate", "gold"))));
    expect(noPower.combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Four Power statistics pooled into the attack lift the pierce to gold → 6.
    const frenzied = playFrenzy(declareAttack(attackState("frenzy-gold", "gold")));
    const result = passAllReactions(payPower(frenzied, 4));
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(6);
  });

  it("Power paid AFTER Frenzy keeps lifting the pierced grade (caster keeps empowering)", () => {
    // Frenzy played first (Power 0 = bronze, would not pierce silver), then two
    // Power statistics paid into the same window lift it to silver → 6 damage.
    const frenzied = playFrenzy(declareAttack(attackState("frenzy-empower", "silver")));
    const result = passAllReactions(payPower(frenzied, 2));
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(6);
  });

  it("standing School-of-Magic Power feeds Frenzy's pool (Fire Magic + 1 Power → silver)", () => {
    // Fire Magic grants +1 standing Power to Frenzy (Fire). With one more Power
    // statistic the pool reaches 2 → silver pierce on a silver defender (6 damage).
    const withSchool = attackState("frenzy-school", "silver");
    withSchool.players.p1.permanents = ["ability.fire_magic"];
    const empowered = passAllReactions(payPower(playFrenzy(declareAttack(withSchool)), 1));
    expect(empowered.combat!.units.unit_p2_skeletons.damage).toBe(6);

    // Guard: without the permanent, one Power statistic only reaches Power 1 →
    // bronze pierce, so the silver Defense stands → 2 damage.
    const noSchool = attackState("frenzy-noschool", "silver");
    const plain = passAllReactions(payPower(playFrenzy(declareAttack(noSchool)), 1));
    expect(plain.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});
