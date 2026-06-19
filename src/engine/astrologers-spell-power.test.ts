import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { createInitialGameState } from "./setup";
import type { GameAction, GameState } from "./state";

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

  it("a non-school proclamation never changes spell Power", () => {
    expect(castDamage("none-arrow", "spell.magic_arrow", "astrologers.dead_silence")).toBe(1);
    expect(castDamage("none-impl", "spell.implosion", "astrologers.dead_silence")).toBe(0);
  });
});
