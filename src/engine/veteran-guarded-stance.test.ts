/**
 * Guarded Stance — the most-granted Unit Experience reward (rank 1 for 63 units,
 * rank 2 for 43 more) — is a REAL +1 Defense on every incoming attack.
 *
 * It used to reuse `DEFEND_BONUS` (Mammoths' Thick Hide), which `resolveDefendBonus`
 * only pays while the unit holds a Defense token — so the printed
 * "[unit_passive] +1 Defense whenever it is attacked" did nothing for a unit that
 * never defends, and nothing at all for a neutral guard (which never holds a
 * token). It now carries its own `FLAT_DEFENSE_WHEN_ATTACKED` arm, folded next to
 * the conditional defence bonuses in getAttackStackDetails — OUTSIDE the token gate.
 *
 * Every assertion here is a DAMAGE DELTA (attack − effective defense with a
 * scripted "0" die), never a field read, and Thick Hide keeps a CONTROL proving
 * it is still token-gated.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { makeCombatUnitFromNeutral } from "./adventure";
import { neutralBankMirrorXp } from "./unit-experience";
import { applyUnitCurrentSide } from "./unit-transforms";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
    }
  }
  return current;
}

function freshCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  // Park every sandbox body far from cells 9/10 so nothing else interferes.
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], attack: 0, defense: 0, maxHealth: 60, damage: 0, position: 0 });
  }
  return state;
}

function place(state: GameState, id: string, overrides: Partial<CombatUnitState>): void {
  Object.assign(state.combat!.units[id], overrides);
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId as PlayerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

const ATTACKER = "unit_p1_marksmen";
const DEFENDER = "unit_p2_skeletons";

/** Attack 4 into printed Defense 1 with a scripted "0" die ⇒ 3 damage bare. */
function damageAgainst(
  seed: string,
  defenderAbilities: string[],
  defenderOverrides: Partial<CombatUnitState> = {}
): number {
  const state = freshCombat(seed);
  place(state, ATTACKER, { position: 9, controllerId: "p1", abilities: [], attack: 4, defense: 0, type: "ground" });
  place(state, DEFENDER, {
    position: 10,
    controllerId: "p2",
    abilities: defenderAbilities,
    attack: 0,
    defense: 1,
    maxHealth: 60,
    damage: 0,
    type: "ground",
    ...defenderOverrides
  });
  return attack(state, ATTACKER, DEFENDER).combat!.units[DEFENDER].damage;
}

describe("Guarded Stance is a real +1 Defense on every incoming attack", () => {
  it("cuts an Attack-4-vs-Defense-1 blow from 3 to 2 with NO Defense token [MUTATION-CHECK]", () => {
    // CONTROL: the identical unit without the ability.
    expect(damageAgainst("gs-control", [])).toBe(3);
    // CONTROL: an unrelated ability changes nothing (proves it is this arm).
    expect(damageAgainst("gs-control-other", ["ignores-retaliation"])).toBe(3);
    // The reward: +1 effective Defense, with no token anywhere in sight.
    expect(damageAgainst("gs-live", ["veteran-guarded-stance"])).toBe(2);
    // Remove the FLAT_DEFENSE_WHEN_ATTACKED fold from getAttackStackDetails and
    // the line above reads 3 again.
  });

  it("also protects against a RETALIATION Attack (it is an attack on this unit)", () => {
    function retaliationDamage(seed: string, attackerAbilities: string[]): number {
      const state = freshCombat(seed);
      place(state, ATTACKER, {
        position: 9,
        controllerId: "p1",
        abilities: attackerAbilities,
        attack: 1,
        defense: 1,
        maxHealth: 60,
        damage: 0,
        type: "ground"
      });
      place(state, DEFENDER, {
        position: 10,
        controllerId: "p2",
        abilities: [],
        attack: 4,
        defense: 0,
        maxHealth: 60,
        damage: 0,
        type: "ground"
      });
      return attack(state, ATTACKER, DEFENDER).combat!.units[ATTACKER].damage;
    }
    expect(retaliationDamage("gs-retal-control", [])).toBe(3);
    expect(retaliationDamage("gs-retal-live", ["veteran-guarded-stance"])).toBe(2);
  });

  it("CONTROL: Mammoths' Thick Hide is UNCHANGED — still pays only while defending", () => {
    // Same board, same numbers: Thick Hide with no Defense token does nothing…
    expect(damageAgainst("gs-hide-untokened", ["bulwark-thick-hide"])).toBe(3);
    // …and still pays its flat +1 the moment the unit really is defending
    // (scripted "0" Defend die, so the shield's own +1 never fires — the whole
    // 1-point drop is the DEFEND_BONUS ability).
    expect(damageAgainst("gs-hide-tokened", ["bulwark-thick-hide"], { defenseToken: true })).toBe(2);
    // The two arms are independent: Guarded Stance needs no token, Thick Hide does.
    expect(damageAgainst("gs-stance-tokened", ["veteran-guarded-stance"], { defenseToken: true })).toBe(2);
  });
});

describe("Neutral Rank-Up inherits the fix (a ranked guard really is harder to hit)", () => {
  it("a Near-bank Naga at Seasoned (round 6) takes 1 less damage than the unranked CONTROL", () => {
    const draw = { unitDefId: "neutral.nagas", tier: "bronze" as const, bankUnit: true };

    function bankNagaDamage(seed: string, options: { neutralRankUp: boolean }): number {
      const state = freshCombat(seed);
      const guard = makeCombatUnitFromNeutral(draw, "nru_guard", 10, "legacy")!;
      // With the module ON the bank builder mirrors the Near-band round rank
      // (Seasoned at round 6) onto `unitExperience`; OFF, it never mirrors XP.
      if (options.neutralRankUp) {
        guard.unitExperience = neutralBankMirrorXp("neutral.nagas", "near", 6);
      }
      applyUnitCurrentSide(guard, "legacy", options.neutralRankUp ? { neutralRankUp: true } : undefined);
      Object.assign(state.combat!.units[DEFENDER], guard, {
        id: DEFENDER,
        controllerId: "p2",
        position: 10,
        damage: 0,
        attack: 0
      });
      place(state, ATTACKER, {
        position: 9,
        controllerId: "p1",
        abilities: [],
        attack: 8,
        defense: 0,
        type: "ground"
      });
      return attack(state, ATTACKER, DEFENDER).combat!.units[DEFENDER].damage;
    }

    // neutral.nagas' rank-1 reward IS Guarded Stance, so the module's whole
    // observable effect on this guard is the extra point of Defense.
    const off = bankNagaDamage("nru-gs-off", { neutralRankUp: false });
    const on = bankNagaDamage("nru-gs-on", { neutralRankUp: true });
    expect(off).toBeGreaterThan(0);
    expect(on).toBe(off - 1);
  });
});
