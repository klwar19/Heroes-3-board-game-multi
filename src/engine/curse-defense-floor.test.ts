import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Curse / Weakness-style defense debuffs print "(to a minimum of 0)". The engine
 * must therefore floor the defender's effective Defense at 0: a Curse larger than
 * the target's printed Defense lowers it to 0, never below — otherwise a negative
 * effective Defense inflates the strike ABOVE the attacker's full Attack, which
 * no card allows. This mirrors the Corrosion-token sibling, which already caps its
 * reduction at the unit's Defense.
 *
 * Each test fails if the floor in getAttackDamagePreview (reducer.ts) is removed.
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

/**
 * p1 griffins (attack 5, no abilities) attacks p2 skeletons (the given defense,
 * no resistance) and casts Curse boosted to Power 2 (-3 defense) into its own
 * attack window via a Power statistic + a Magic Arrow discarded for +1 Power.
 * The Attack die is scripted to "0" so the resolved damage is deterministic.
 */
function curseThenAttack(defenderDefense: number): GameState {
  const state = createInitialGameState("curse-defense-floor");
  state.players.p1.hand = ["spell.curse", "stat.power", "spell.magic_arrow"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";

  const griffins = state.combat!.units.unit_p1_griffins;
  griffins.activatedThisRound = false;
  griffins.abilities = [];
  griffins.attack = 5;
  griffins.position = 17;

  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.abilities = [];
  skeletons.defense = defenderDefense;
  skeletons.maxHealth = 20;
  skeletons.damage = 0;
  skeletons.position = 18;

  // Every die the strike + retaliation consumes resolves to "0".
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;

  const declared = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });

  // Curse + Power statistic + "discard Magic Arrow: +1 Power" => Power 2 => -3 defense.
  const empowered = applyOk(declared, {
    type: "PLAY_REACTIONS",
    playerId: "p1",
    plays: [
      { cardId: "spell.curse", mode: "basic" },
      { cardId: "stat.power", mode: "basic" },
      { cardId: "spell.magic_arrow", mode: "basic", asPowerBoost: true }
    ]
  });

  return passAllReactions(empowered);
}

describe("Curse defense floor (to a minimum of 0)", () => {
  it("a Power-2 Curse (-3) on a Defense-1 unit floors Defense at 0, not -2", () => {
    const resolved = curseThenAttack(1);
    // Effective Defense = max(0, 1 - 3) = 0, so 5 Attack lands exactly 5 — NEVER
    // 7 (which an un-floored Defense of -2 would produce, exceeding full Attack).
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(5);
  });

  it("the same Curse still lowers a Defense-4 unit by the full 3 (floor only clamps at 0)", () => {
    const resolved = curseThenAttack(4);
    // Effective Defense = max(0, 4 - 3) = 1, so 5 Attack lands 4 — the floor does
    // not neuter a Curse that stays within the target's Defense.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });
});
