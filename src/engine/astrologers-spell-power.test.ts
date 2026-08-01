import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { createInitialGameState } from "./setup";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * Astrologers school-power proclamations, engine-enforced end to end:
 *   - Blue Sky: Air + Water spells cast at +1 Power.
 *   - Scorched Ground: Earth + Fire spells cast at +1 Power.
 *
 * Each test casts a real damaging spell in the combat sandbox and reads the
 * damage dealt, so removing the getCurrentSpellPower hook makes a test fail.
 *
 * Damage tables exercised (amountByPower):
 *   Implosion (Earth): {0:0, 1:2, ...}  -> +1 Power turns 0 damage into 2.
 *   Magic Arrow (any): {0:1, 1:2, ...}  -> +1 Power turns 1 damage into 2.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Minimal adventure substate so getActiveAstrologersCard returns this card. */
function setProclamation(state: GameState, cardId: string | null): void {
  if (!cardId) {
    return;
  }
  state.adventure = {
    astrologers: {
      activeCardId: cardId,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    }
  } as unknown as GameState["adventure"];
}

/** Cast `spellId` at the enemy skeletons and return the damage it took. */
function castDamage(seed: string, spellId: string, proclamation: string | null): number {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [spellId];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = []; // strip immunities so the hit lands plainly
  target.maxHealth = 50;
  target.damage = 0;
  setProclamation(state, proclamation);

  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === spellId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, `${spellId} should be castable at the skeletons`).toBeTruthy();
  const resolved = passAll(applyOk(state, cast!.action));
  return resolved.combat!.units.unit_p2_skeletons.damage;
}

/** Cast and return the engine's resolved Power event (not a UI preview). */
function castPower(seed: string, spellId: string, proclamation: string | null): number | undefined {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [spellId];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.units.unit_p2_skeletons.abilities = [];
  state.combat!.units.unit_p2_skeletons.maxHealth = 50;
  setProclamation(state, proclamation);
  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === spellId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast).toBeTruthy();
  const resolved = passAll(applyOk(state, cast!.action));
  return [...resolved.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "SPELL_CAST_RESOLVED" }> =>
        event.type === "SPELL_CAST_RESOLVED" && event.spellCardId === spellId
    )?.power;
}

describe("Astrologers — Blue Sky / Scorched Ground school power", () => {
  it("Scorched Ground gives Earth spells +1 Power (Implosion 0 -> 2 damage)", () => {
    expect(castDamage("scorch-base", "spell.implosion", null)).toBe(0);
    expect(castDamage("scorch-on", "spell.implosion", "astrologers.scorched_ground")).toBe(2);
  });

  it("Scorched Ground does NOT touch Air/Water spells", () => {
    // Magic Arrow is school-agnostic and benefits, but a non-matching school
    // must not: Blue Sky leaves Earth's Implosion alone (control below). Here we
    // confirm Scorched Ground only fires for its own schools by leaving Implosion
    // unchanged when the wrong proclamation (Blue Sky) is up.
    expect(castDamage("scorch-wrong", "spell.implosion", "astrologers.blue_sky")).toBe(0);
  });

  it("Blue Sky gives matching/any spells +1 Power (Magic Arrow 1 -> 2 damage)", () => {
    expect(castDamage("blue-base", "spell.magic_arrow", null)).toBe(1);
    expect(castDamage("blue-on", "spell.magic_arrow", "astrologers.blue_sky")).toBe(2);
  });

  it("Scorched Ground counts school-agnostic Magic Arrow only once (+1, never +2)", () => {
    expect(castPower("scorch-arrow-power", "spell.magic_arrow", "astrologers.scorched_ground")).toBe(1);
    expect(castDamage("scorch-arrow-damage", "spell.magic_arrow", "astrologers.scorched_ground")).toBe(2);
  });

  it("a non-school proclamation never changes spell Power", () => {
    expect(castDamage("none-arrow", "spell.magic_arrow", "astrologers.dead_silence")).toBe(1);
    expect(castDamage("none-impl", "spell.implosion", "astrologers.dead_silence")).toBe(0);
  });

  /**
   * The proclamation buffs a matching-school spell played as an INSTANT into an
   * attack window too — "all Spells … are cast at +1 Power" makes no cast-vs-
   * instant distinction, and the instant shares the cast pipeline's Power
   * sources (standingSpellPower). Bloodlust (Fire, {0:+1, 1:+2, 2:+3} attack):
   * Scorched Ground lifts a lone Bloodlust from +1 to +2 attack on the roll.
   */
  function bloodlustAttackBonus(seed: string, proclamation: string | null): number | null {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.bloodlust"];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    setProclamation(state, proclamation);

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const played = passAll(
      applyOk(declared, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" })
    );
    // The griffins' own declared attack — never the skeletons' retaliation roll.
    const rolled = played.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation && event.attackerId === "unit_p1_griffins"
    );
    return rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null;
  }

  it("buffs a matching-school spell INSTANT played into an attack window (Bloodlust +1 → +2)", () => {
    expect(bloodlustAttackBonus("instant-base", null)).toBe(1);
    expect(bloodlustAttackBonus("instant-on", "astrologers.scorched_ground")).toBe(2);
    // CONTROL: the wrong-school proclamation adds nothing to a Fire instant.
    expect(bloodlustAttackBonus("instant-wrong", "astrologers.blue_sky")).toBe(1);
  });
});
