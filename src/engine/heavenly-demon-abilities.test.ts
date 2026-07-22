import { describe, expect, it } from "vitest";

import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState } from "./index";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, UnitId } from "./state";

/**
 * The Heavenly Demon Palace (Thiên Ma Cung) ships TWO dedicated NEW engine arms
 * — both pinned here with observable combat outcomes AND mutation CONTROLs:
 *
 *  (1) Blood Siphon (`heavenly-demon-blood-siphon`, HEAL_SELF_ON_DAMAGE_DEALT):
 *      after this unit's OWN attack DEALS damage, remove 1 damage from it. Unlike
 *      the Vampire's unconditional self-heal, an attack fully soaked to 0 heals
 *      NOTHING. Never on a Retaliation Attack.
 *  (2) Reap the Fallen (`heavenly-demon-reap`, ATTACK_BUFF_ON_ADJACENT_REMOVAL):
 *      whenever a unit ADJACENT to this unit is removed (any source), this unit
 *      gains +1 Attack for the rest of the Combat — escalating, and surviving a
 *      Pack→Few flip (baked onto `permanentAttackBonus`).
 *
 * Harness modelled on src/engine/after-attack-splash.test.ts: the combat sandbox
 * with empty hands and scripted "0" attack dice, so an attack's damage is simply
 * `attack − defense` (clamped ≥ 0). Board is 4 columns × 5 rows (positions 0–19),
 * orthogonal adjacency; position 9 = (row 2, col 1) with neighbours 5, 8, 10, 13.
 */

const SIPHON = "heavenly-demon-blood-siphon";
const REAP = "heavenly-demon-reap";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
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

type UnitOverrides = {
  position?: number;
  controllerId?: PlayerId;
  abilities?: string[];
  attack?: number;
  defense?: number;
  maxHealth?: number;
  damage?: number;
  type?: CombatUnitState["type"];
  variant?: CombatUnitState["variant"];
};

function freshCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: UnitOverrides): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, overrides);
  return unit;
}

function unitAt(state: GameState, id: string): CombatUnitState {
  return state.combat!.units[id];
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

function wasRemoved(state: GameState, id: UnitId): boolean {
  return state.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === id);
}

// Park the four non-participating sandbox units far apart so nothing interferes.
function parkBystanders(state: GameState, ids: string[]): void {
  const corners = [0, 3, 16, 19, 12, 15];
  ids.forEach((id, index) => {
    place(state, id, {
      position: corners[index] ?? 0,
      controllerId: id.includes("_p1_") ? "p1" : "p2",
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
  });
}

// ---------------------------------------------------------------------------
// (1) Blood Siphon — HEAL_SELF_ON_DAMAGE_DEALT
// ---------------------------------------------------------------------------

describe("Blood Siphon — registration", () => {
  it("is an implemented HEAL_SELF_ON_DAMAGE_DEALT { amount: 1 } arm", () => {
    const ability = unitAbilities[SIPHON];
    expect(ability).toBeDefined();
    expect(ability.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({ type: "HEAL_SELF_ON_DAMAGE_DEALT", amount: 1 });
  });
});

describe("Blood Siphon — heals 1 ONLY when the attack deals damage", () => {
  /** Attacker (attack 5) starts with 3 damage; defender survives so we read the heal. */
  function attackerDamageAfter(attackerAbilities: string[], defenderDefense: number, seed: string): number {
    const state = freshCombat(seed);
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: attackerAbilities,
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 3,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [],
      attack: 0,
      defense: defenderDefense,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    parkBystanders(state, [
      "unit_p1_griffins",
      "unit_p1_crusaders",
      "unit_p2_vampires",
      "unit_p2_dread_knights"
    ]);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    return unitAt(after, "unit_p1_marksmen").damage;
  }

  it("a landing attack heals 1 (3 → 2); CONTROL: no tag never heals (stays 3)", () => {
    expect(attackerDamageAfter([SIPHON], 0, "blood-siphon-hit")).toBe(2);
    expect(attackerDamageAfter([], 0, "blood-siphon-hit-control")).toBe(3);
  });

  it("an attack fully SOAKED to 0 heals nothing (the distinction from the Vampire)", () => {
    // Defense 50 soaks the attack to 0 damage → Blood Siphon does NOT fire.
    expect(attackerDamageAfter([SIPHON], 50, "blood-siphon-soaked")).toBe(3);
    // CONTROL: the Vampire's unconditional self-heal WOULD heal on the same
    // 0-damage attack — proving Blood Siphon's damage-dealt gate is real.
    expect(attackerDamageAfter(["vampire-heal-on-attack"], 50, "blood-siphon-vampire-control")).toBe(1);
  });

  it("never fires on a Retaliation Attack", () => {
    // Untagged attacker hits a TAGGED, pre-damaged defender; the defender's
    // Retaliation Attack lands 5 but must NOT trigger Blood Siphon.
    const state = freshCombat("blood-siphon-no-retaliation");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [SIPHON],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 3,
      type: "ground"
    });
    parkBystanders(state, [
      "unit_p1_griffins",
      "unit_p1_crusaders",
      "unit_p2_vampires",
      "unit_p2_dread_knights"
    ]);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    // Defender took 5 (3 → 8); its retaliation landed on the attacker but the
    // Siphon did NOT heal it back to 7.
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(8);
    expect(unitAt(after, "unit_p1_marksmen").damage).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// (2) Reap the Fallen — ATTACK_BUFF_ON_ADJACENT_REMOVAL
// ---------------------------------------------------------------------------

describe("Reap the Fallen — registration", () => {
  it("is an implemented ATTACK_BUFF_ON_ADJACENT_REMOVAL { amount: 1 } arm", () => {
    const ability = unitAbilities[REAP];
    expect(ability).toBeDefined();
    expect(ability.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({ type: "ATTACK_BUFF_ON_ADJACENT_REMOVAL", amount: 1 });
  });
});

describe("Reap the Fallen — +1 Attack when an ADJACENT unit is removed", () => {
  it("a nearby death raises the reaper's Attack by 1 (baked on permanentAttackBonus); CONTROL: no tag → unchanged", () => {
    function reaperAttackAfterKill(reaperAbilities: string[], seed: string): CombatUnitState {
      const state = freshCombat(seed);
      // Reaper @9 attacks the 1-HP `few` victim @10 (adjacent) → the victim is
      // removed → Reap fires on the reaper (adjacent to the corpse).
      place(state, "unit_p1_marksmen", {
        position: 9,
        controllerId: "p1",
        abilities: reaperAbilities,
        attack: 5,
        defense: 0,
        maxHealth: 100,
        damage: 0,
        type: "ground"
      });
      const victim = place(state, "unit_p2_skeletons", {
        position: 10,
        controllerId: "p2",
        abilities: [],
        attack: 0,
        defense: 0,
        maxHealth: 1,
        damage: 0,
        type: "ground",
        variant: "few"
      });
      parkBystanders(state, [
        "unit_p1_griffins",
        "unit_p1_crusaders",
        "unit_p2_vampires",
        "unit_p2_dread_knights"
      ]);
      const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      expect(wasRemoved(after, victim.id)).toBe(true);
      return unitAt(after, "unit_p1_marksmen");
    }

    const reaped = reaperAttackAfterKill([REAP], "reap-adjacent-kill");
    expect(reaped.attack).toBe(6); // 5 base + 1 reap
    expect(reaped.permanentAttackBonus).toBe(1); // combat-scoped, flip-surviving field

    const control = reaperAttackAfterKill([], "reap-adjacent-kill-control");
    expect(control.attack).toBe(5);
    expect(control.permanentAttackBonus ?? 0).toBe(0);
  });

  it("CONTROL: a NON-adjacent death never buffs the reaper", () => {
    const state = freshCombat("reap-non-adjacent");
    // Reaper @0 is far from the fight; a killer @9 removes the 1-HP victim @10.
    place(state, "unit_p1_marksmen", {
      position: 0,
      controllerId: "p1",
      abilities: [REAP],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p1_griffins", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    const victim = place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 1,
      damage: 0,
      type: "ground",
      variant: "few"
    });
    parkBystanders(state, ["unit_p1_crusaders", "unit_p2_vampires", "unit_p2_dread_knights"]);
    const after = attack(state, "unit_p1_griffins", "unit_p2_skeletons");
    expect(wasRemoved(after, victim.id)).toBe(true);
    // Reaper @0 is NOT adjacent to the corpse @10 → no buff.
    expect(unitAt(after, "unit_p1_marksmen").attack).toBe(5);
    expect(unitAt(after, "unit_p1_marksmen").permanentAttackBonus ?? 0).toBe(0);
  });

  it("ESCALATES: two adjacent deaths raise the reaper's Attack by 2", () => {
    const state = freshCombat("reap-escalate");
    // Reaper @9. Its neighbours 8 and 10 each hold a 1-HP `few` victim.
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [REAP],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    const victim1 = place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 1,
      damage: 0,
      type: "ground",
      variant: "few"
    });
    const victim2 = place(state, "unit_p2_vampires", {
      position: 8,
      controllerId: "p2",
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 1,
      damage: 0,
      type: "ground",
      variant: "few"
    });
    // A second friendly killer @12 = (row 3, col 0), adjacent to victim2 @8.
    place(state, "unit_p1_crusaders", {
      position: 12,
      controllerId: "p1",
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    parkBystanders(state, ["unit_p1_griffins", "unit_p2_dread_knights"]);

    // Reaper kills victim1 (@10) → +1 (attack 6).
    let after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(wasRemoved(after, victim1.id)).toBe(true);
    expect(unitAt(after, "unit_p1_marksmen").attack).toBe(6);

    // Second killer kills victim2 (@8), also adjacent to the reaper @9 → +1 more.
    after = attack(after, "unit_p1_crusaders", "unit_p2_vampires");
    expect(wasRemoved(after, victim2.id)).toBe(true);
    expect(unitAt(after, "unit_p1_marksmen").attack).toBe(7);
    expect(unitAt(after, "unit_p1_marksmen").permanentAttackBonus).toBe(2);
  });
});
