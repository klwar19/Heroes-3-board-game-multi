import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine coverage for the Anti-Magic spell (Basic Earth, `friendly-unit`,
 * effect CREATE_SPELL_IMMUNITY). Closes an audit gap: the cast path was wired
 * but UNTESTED — no test cast Anti-Magic and asserted the observable outcome
 * (an existing Fortress test hand-injects a UNIT_SPELL_IMMUNE effect and only
 * checks Dispel removing it; it never casts the spell).
 *
 * The card's printed rule (its `tags`):
 *   "Until the end of the Combat, the selected unit cannot be targeted by
 *    spells: Power 0: bronze; Power 2: bronze or silver; Power 4: bronze,
 *    silver, or gold."
 * i.e. the grade ladder gradeByPower = {0:bronze, 2:silver, 4:gold} — note the
 * 0/2/4 thresholds (UNLIKE Dispel/Blind's 0/1/2). The whole point of this file
 * is to pin that ladder and its observable consequence: a warded unit at/below
 * the warded grade FIZZLES (cannot even be targeted by) an incoming spell.
 *
 * Sandbox grades (createInitialGameState):
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
  let safety = 60;
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

/**
 * Casts Anti-Magic from p1 on one of p1's OWN units at the given Power, resolves
 * it, and returns the resulting state. Spare Power statistics open the caster's
 * Empower window so the cast waits on the stack, where we set the Power actually
 * paid (the standard spell-test idiom — see shield/blind/chain-lightning tests).
 */
function castAntiMagic(seed: string, targetUnitId: UnitId, power: number): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["spell.anti_magic", "stat.power", "stat.power"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";

  const cast = findCast(state, "p1", "spell.anti_magic", targetUnitId);
  expect(cast, "Anti-Magic should be a legal cast on a friendly unit").toBeTruthy();
  const casted = applyOk(state, cast!.action);
  casted.stack[0]!.modifiers.spellPowerBonus = power;
  return passAllReactions(casted);
}

/** The Anti-Magic UNIT_SPELL_IMMUNE effect on a given unit, if any was created. */
function spellImmuneEffect(state: GameState, unitId: UnitId) {
  return state.activeEffects.find(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unitId &&
      effect.modifiers.some((modifier) => modifier.type === "UNIT_SPELL_IMMUNE")
  );
}

function maxGradeOf(state: GameState, unitId: UnitId): string | undefined {
  const effect = spellImmuneEffect(state, unitId);
  const modifier = effect?.modifiers.find((m) => m.type === "UNIT_SPELL_IMMUNE");
  return modifier && modifier.type === "UNIT_SPELL_IMMUNE" ? modifier.maxGrade : undefined;
}

/**
 * The observable consequence: can p2 target the given p1 unit with an enemy
 * damaging Spell (Magic Arrow, an `enemy-unit` DEAL_DAMAGE spell)? A unit warded
 * by Anti-Magic up to its own grade "cannot be targeted by spells", so it is NOT
 * offered as a legal Magic Arrow target. An under-warded (higher-grade) unit IS.
 */
function magicArrowCanTarget(state: GameState, p1UnitId: UnitId): boolean {
  const probe: GameState = {
    ...state,
    activePlayerId: "p2",
    players: {
      ...state.players,
      p2: { ...state.players.p2, hand: ["spell.magic_arrow"] }
    },
    combat: { ...state.combat!, activeUnitId: "unit_p2_skeletons" }
  };
  return findCast(probe, "p2", "spell.magic_arrow", p1UnitId) !== undefined;
}

describe("Anti-Magic spell", () => {
  // -------------------------------------------------------------------------
  // (1) The cast creates a UNIT_SPELL_IMMUNE ward whose maxGrade follows the
  //     0/2/4 ladder, AND that ward has the observable targeting consequence.
  // -------------------------------------------------------------------------

  it("Power 0 wards a bronze unit (maxGrade bronze) and that bronze unit cannot be targeted by an enemy spell", () => {
    // Baseline: with NO ward, a bronze p1 unit is a legal Magic Arrow target.
    const open = createInitialGameState("anti-magic-baseline");
    expect(magicArrowCanTarget(open, "unit_p1_marksmen")).toBe(true);

    const state = castAntiMagic("anti-magic-bronze-0", "unit_p1_marksmen", 0);
    // The effect exists with the correct (bronze) ceiling…
    expect(maxGradeOf(state, "unit_p1_marksmen")).toBe("bronze");
    // …and its real consequence: the bronze unit can no longer be targeted.
    expect(magicArrowCanTarget(state, "unit_p1_marksmen")).toBe(false);
  });

  it("Power 4 reaches gold and protects a gold unit", () => {
    // p1 has no native gold unit, so promote crusaders (silver) to gold to prove
    // the top of the ladder. Below Power 4 a gold unit must stay exposed.
    const baseSeed = "anti-magic-gold";
    const underWarded = createInitialGameState(`${baseSeed}-under`);
    underWarded.combat!.units.unit_p1_crusaders.grade = "gold";
    // (re-run the cast helper but on a board where crusaders is gold)
    const lowState = (() => {
      const s = underWarded;
      s.players.p1.hand = ["spell.anti_magic", "stat.power", "stat.power"];
      s.players.p2.hand = [];
      s.activePlayerId = "p1";
      s.combat!.activeUnitId = "unit_p1_marksmen";
      const cast = findCast(s, "p1", "spell.anti_magic", "unit_p1_crusaders");
      expect(cast).toBeTruthy();
      const casted = applyOk(s, cast!.action);
      casted.stack[0]!.modifiers.spellPowerBonus = 2; // silver ceiling — below gold
      return passAllReactions(casted);
    })();
    // Silver ward on a gold unit: the resolution gate refuses to create it.
    expect(spellImmuneEffect(lowState, "unit_p1_crusaders")).toBeUndefined();
    expect(magicArrowCanTarget(lowState, "unit_p1_crusaders")).toBe(true);

    // Power 4 reaches gold: the ward lands and the gold unit is protected.
    const highBoard = createInitialGameState(`${baseSeed}-high`);
    highBoard.combat!.units.unit_p1_crusaders.grade = "gold";
    highBoard.players.p1.hand = ["spell.anti_magic", "stat.power", "stat.power"];
    highBoard.players.p2.hand = [];
    highBoard.activePlayerId = "p1";
    highBoard.combat!.activeUnitId = "unit_p1_marksmen";
    const goldCast = findCast(highBoard, "p1", "spell.anti_magic", "unit_p1_crusaders");
    const goldCasted = applyOk(highBoard, goldCast!.action);
    goldCasted.stack[0]!.modifiers.spellPowerBonus = 4;
    const highState = passAllReactions(goldCasted);
    expect(maxGradeOf(highState, "unit_p1_crusaders")).toBe("gold");
    expect(magicArrowCanTarget(highState, "unit_p1_crusaders")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (2) The ward's OWN grade gate: a bronze ward leaves a higher-grade unit
  //     unprotected (still targetable), a higher ward protects it.
  // -------------------------------------------------------------------------

  it("a Power-0 bronze ward does NOT protect a silver unit (the gate refuses the over-grade ward)", () => {
    const state = castAntiMagic("anti-magic-bronze-on-silver", "unit_p1_crusaders", 0);
    // crusaders is silver (rank 1) > bronze ward (rank 0): no ward is created.
    expect(spellImmuneEffect(state, "unit_p1_crusaders")).toBeUndefined();
    // Consequence: the silver unit is still a legal enemy-spell target.
    expect(magicArrowCanTarget(state, "unit_p1_crusaders")).toBe(true);
  });

  it("Power 2 reaches silver: the same silver unit is now warded and untargetable", () => {
    const state = castAntiMagic("anti-magic-silver-2", "unit_p1_crusaders", 2);
    expect(maxGradeOf(state, "unit_p1_crusaders")).toBe("silver");
    expect(magicArrowCanTarget(state, "unit_p1_crusaders")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (3) THE KEY DISTINGUISHING ASSERTION: 0/2/4 vs a 0/1/2 mis-wiring.
  //     At Power 1 the silver threshold (2) is NOT yet met, so the ladder must
  //     still resolve to BRONZE — a silver unit stays UNPROTECTED. Were the
  //     ladder wrongly wired 0/1/2, Power 1 would reach silver and protect it.
  // -------------------------------------------------------------------------

  it("Power 1 stays BRONZE (silver threshold is 2, not 1): a silver unit is left unprotected", () => {
    const state = castAntiMagic("anti-magic-power1-control", "unit_p1_crusaders", 1);
    // Correct 0/2/4 ladder: Power 1 → bronze ceiling → no ward on a silver unit.
    expect(spellImmuneEffect(state, "unit_p1_crusaders")).toBeUndefined();
    expect(magicArrowCanTarget(state, "unit_p1_crusaders")).toBe(true);

    // CONTROL that the cast itself works at Power 1: a BRONZE unit IS warded at
    // Power 1 (so the silver miss above is the ladder, not a dead cast).
    const onBronze = castAntiMagic("anti-magic-power1-bronze", "unit_p1_marksmen", 1);
    expect(maxGradeOf(onBronze, "unit_p1_marksmen")).toBe("bronze");
    expect(magicArrowCanTarget(onBronze, "unit_p1_marksmen")).toBe(false);
  });
});
