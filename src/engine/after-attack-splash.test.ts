import { describe, expect, it } from "vitest";

import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState } from "./index";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, UnitId } from "./state";

/**
 * Jinchuriki "Chakra Burst" (`jinchuriki-chakra-burst`, effect AFTER_ATTACK_SPLASH):
 * after an attack MADE BY this unit resolves, deal 1 EFFECT damage to EVERY OTHER
 * unit adjacent to this unit — friend AND foe. Effect damage is NOT an attack:
 *   • no Retaliation,
 *   • not reduced by the target's Defense,
 *   • not subject to per-attack damage caps (Nix / Casters),
 *   • a lethal splash routes through the normal removal path.
 * It fires on the unit's OWN declared attacks ONLY (never on a Retaliation
 * Attack, never once-per-follow-up of the multi-attack queue), at most once per
 * declared attack. Each claim below fails if the wiring is removed; every CONTROL
 * flips the tag off (or the mechanic under test) to prove the opposite.
 *
 * Board: 4 columns × 5 rows (positions 0–19), orthogonal adjacency. The attacker
 * sits at position 9 (row 2, col 1); its four neighbours are 5, 8, 10 and 13.
 */

const SPLASH = "jinchuriki-chakra-burst";

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

/** Drain reaction windows and attack-die reroll prompts until the sequence rests. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
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

/**
 * A fresh combat-sandbox game with empty hands (no reaction cards) and a long
 * run of scripted "0" attack dice, so every attack's die outcome is 0 and the
 * damage formula is simply `attack − defense` (clamped ≥ 0). Callers then place
 * the six units (`unit_p1_marksmen/griffins/crusaders`,
 * `unit_p2_skeletons/vampires/dread_knights`) via `place`.
 */
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

/** Set the active fighter and declare a melee attack, then settle the sequence. */
function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

function splashEvents(state: GameState): GameEvent[] {
  return state.eventLog.filter(
    (event: GameEvent) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === SPLASH
  );
}

function wasRemoved(state: GameState, id: UnitId): boolean {
  return state.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === id);
}

describe("Chakra Burst — registration", () => {
  it("is an implemented AFTER_ATTACK_SPLASH { amount: 1 } arm", () => {
    const ability = unitAbilities[SPLASH];
    expect(ability).toBeDefined();
    expect(ability.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({ type: "AFTER_ATTACK_SPLASH", amount: 1 });
  });
});

describe("Chakra Burst — splashes every adjacent unit, friend AND foe", () => {
  /**
   * Attacker @9 attacks the foe @10 (Defense 50 → the attack itself deals 0, so
   * each adjacent unit's damage is purely the splash). Adjacent: ally @5,
   * target @10, foe2 @13. Non-adjacent: @18 and the friendly @2.
   */
  function layout(state: GameState, attackerAbilities: string[]): void {
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: attackerAbilities,
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p1_griffins", { position: 5, controllerId: "p1", abilities: [], defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], defense: 50, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 13, controllerId: "p2", abilities: [], defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
  }

  it("deals exactly 1 to each adjacent unit (friend + foe) after the attack; non-adjacent untouched", () => {
    const state = freshCombat("chakra-burst-friend-foe");
    layout(state, [SPLASH]);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    expect(unitAt(after, "unit_p1_griffins").damage).toBe(1); // adjacent friend
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(1); // adjacent foe (attack soaked → pure splash)
    expect(unitAt(after, "unit_p2_vampires").damage).toBe(1); // adjacent foe
    expect(unitAt(after, "unit_p2_dread_knights").damage).toBe(0); // non-adjacent foe
    expect(unitAt(after, "unit_p1_crusaders").damage).toBe(0); // non-adjacent friend
    expect(splashEvents(after)).toHaveLength(3); // one per adjacent unit
  });

  it("CONTROL: identical setup without the tag deals no splash", () => {
    const state = freshCombat("chakra-burst-friend-foe-control");
    layout(state, []);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    expect(unitAt(after, "unit_p1_griffins").damage).toBe(0);
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(0);
    expect(unitAt(after, "unit_p2_vampires").damage).toBe(0);
    expect(unitAt(after, "unit_p2_dread_knights").damage).toBe(0);
    expect(splashEvents(after)).toHaveLength(0);
  });
});

describe("Chakra Burst — only the unit's OWN attack, never being attacked or retaliating", () => {
  it("a tagged DEFENDER splashes neither when attacked nor when it retaliates", () => {
    // Untagged attacker @9 hits the TAGGED skeletons @10; the skeletons then
    // retaliate. Bystander @11 is adjacent to the tagged unit but NOT to the
    // attacker — if the tag fired on either event it would take 1.
    const state = freshCombat("chakra-burst-defender-noop");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [], // NO tag on the attacker
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [SPLASH], // tag on the unit that is merely attacked / retaliates
      attack: 4,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_vampires", { position: 11, controllerId: "p2", abilities: [], defense: 0, maxHealth: 30, damage: 0 });
    place(state, "unit_p1_griffins", { position: 2, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 18, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(5); // it took the attack…
    expect(unitAt(after, "unit_p1_marksmen").damage).toBe(4); // …and its Retaliation Attack landed
    expect(unitAt(after, "unit_p2_vampires").damage).toBe(0); // but neither event splashed the bystander
    expect(splashEvents(after)).toHaveLength(0);
  });

  it("an attacker felled by Fire Shield during its own attack does not splash (isUnitAlive guard)", () => {
    // Documented death-ordering decision: the splash fires immediately after the
    // attack resolves, BEFORE the parked Retaliation (like every other
    // post-attack follow-up), so a later retaliation can never pre-empt it. The
    // only way the attacker is dead at splash time is a recoil during its OWN
    // attack (Fire Shield here) — the `isUnitAlive(attacker)` guard then skips it.
    const state = freshCombat("chakra-burst-attacker-dies");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [SPLASH],
      attack: 5,
      defense: 0,
      maxHealth: 1, // one point of Fire-Shield recoil is lethal
      damage: 0,
      type: "ground",
      variant: "few" // a `few` attacker is REMOVED by the lethal recoil (no Pack→Few flip that would leave it alive)
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: ["wog-fire-shield-1"], // burns an adjacent attacker for 1
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p1_griffins", { position: 5, controllerId: "p1", abilities: [], defense: 0, maxHealth: 20, damage: 0 }); // adjacent friend
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    const attacker = unitAt(after, "unit_p1_marksmen");
    expect(attacker.damage).toBeGreaterThanOrEqual(attacker.maxHealth); // Fire Shield felled it
    expect(splashEvents(after)).toHaveLength(0); // dead attacker → no splash
    expect(unitAt(after, "unit_p1_griffins").damage).toBe(0); // adjacent friend untouched
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(5); // the target took only the attack (no +1 splash)
  });
});

describe("Chakra Burst — effect damage ignores Defense and the per-attack caps", () => {
  it("lands 1 on a target whose Defense soaks the attack (CONTROL: no tag → 0)", () => {
    function run(attackerAbilities: string[]): number {
      const state = freshCombat(`chakra-burst-defense-${attackerAbilities.join(",") || "none"}`);
      place(state, "unit_p1_marksmen", {
        position: 9,
        controllerId: "p1",
        abilities: attackerAbilities,
        attack: 3,
        defense: 0,
        maxHealth: 100,
        damage: 0,
        type: "ground"
      });
      place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], defense: 50, maxHealth: 20, damage: 0 });
      place(state, "unit_p1_griffins", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
      place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
      place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
      place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
      const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
      return unitAt(after, "unit_p2_skeletons").damage;
    }

    expect(run([SPLASH])).toBe(1); // Defense 50 soaks the attack to 0; splash still lands 1
    expect(run([])).toBe(0); // CONTROL: soaked attack, no splash
  });

  /**
   * The cap carrier IS the target: its per-attack cap clamps the ATTACK, then the
   * splash adds 1 MORE (effect damage is a separate instance, uncapped). Attack 8
   * vs Defense 0 = 8 damage before the cap.
   */
  function cappedTargetDamage(targetAbility: string, attackerAbilities: string[], seed: string): number {
    const state = freshCombat(seed);
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: attackerAbilities,
      attack: 8,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [targetAbility],
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p1_griffins", { position: 2, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    return unitAt(after, "unit_p2_skeletons").damage;
  }

  it("a casters-damage-cap carrier takes the splash 1 ON TOP of its capped-to-1 attack (total 2)", () => {
    // Attack 8 → capped to 1 by Leyline Barrier; splash +1 → 2.
    expect(cappedTargetDamage("casters-damage-cap", [SPLASH], "chakra-burst-cap-casters")).toBe(2);
    // CONTROL: same cap, NO splash → the capped attack alone is 1.
    expect(cappedTargetDamage("casters-damage-cap", [], "chakra-burst-cap-casters-control")).toBe(1);
  });

  it("a nix-damage-cap carrier takes the splash 1 ON TOP of its capped-to-4 attack (total 5)", () => {
    // Attack 8 → capped to 4 by Hardened Shell (attacks only); splash +1 → 5.
    expect(cappedTargetDamage("nix-damage-cap", [SPLASH], "chakra-burst-cap-nix")).toBe(5);
    // CONTROL: same cap, NO splash → the capped attack alone is 4.
    expect(cappedTargetDamage("nix-damage-cap", [], "chakra-burst-cap-nix-control")).toBe(4);
  });
});

describe("Chakra Burst — a lethal splash removes through the normal path, granting no retaliation", () => {
  it("kills a 1-Health adjacent unit via removal and it never retaliates", () => {
    const state = freshCombat("chakra-burst-kill");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [SPLASH],
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    // dread_knights is the `few` variant — a lethal hit removes it outright
    // (no Pack→Few flip). Defense 50 soaks the attack; the splash is the killer.
    const victim = place(state, "unit_p2_dread_knights", {
      position: 10,
      controllerId: "p2",
      abilities: [],
      attack: 5, // would hurt the attacker IF it retaliated
      defense: 50,
      maxHealth: 1,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p1_griffins", { position: 2, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_skeletons", { position: 18, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });
    place(state, "unit_p2_vampires", { position: 19, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_dread_knights");

    const deadVictim = unitAt(after, "unit_p2_dread_knights");
    expect(deadVictim.damage).toBeGreaterThanOrEqual(deadVictim.maxHealth); // not alive
    expect(wasRemoved(after, victim.id)).toBe(true); // routed through markUnitRemovedIfNeeded → UNIT_REMOVED
    expect(splashEvents(after)).toHaveLength(1); // the victim was the only adjacent unit
    expect(unitAt(after, "unit_p1_marksmen").damage).toBe(0); // splash kill grants no retaliation
  });
});

describe("Chakra Burst — interplay with the multi-attack queue (magic-elemental-attack-all-enemies)", () => {
  it("splashes once per declared attack while the second-attack queue still runs", () => {
    const state = freshCombat("chakra-burst-plus-attack-all");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [SPLASH, "magic-elemental-attack-all-enemies"],
      attack: 5,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], defense: 0, maxHealth: 30, damage: 0, type: "ground" }); // primary target
    place(state, "unit_p1_griffins", { position: 5, controllerId: "p1", abilities: [], defense: 0, maxHealth: 30, damage: 0 }); // adjacent friend
    place(state, "unit_p2_vampires", { position: 13, controllerId: "p2", abilities: [], defense: 0, maxHealth: 30, damage: 0, type: "ground" }); // adjacent foe (not the target)
    place(state, "unit_p2_dread_knights", { position: 18, controllerId: "p2", abilities: [], maxHealth: 30, damage: 0 }); // non-adjacent foe
    place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 30, damage: 0 });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    // Splash fires exactly ONCE for the declared attack: one hit on each of the
    // three adjacent units, NOT re-fired per queued follow-up attack.
    expect(splashEvents(after)).toHaveLength(3);
    // The friend took the splash only — the enemies-only queue skips it.
    expect(unitAt(after, "unit_p1_griffins").damage).toBe(1);
    // The primary target: attack 5 + splash 1 (the queue excludes the defender).
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(6);
    // The other adjacent enemy: splash 1 + the queue's full follow-up attack (5),
    // proving the second-attack queue still ran on top of the single splash.
    const foe2 = unitAt(after, "unit_p2_vampires");
    expect(foe2.damage).toBe(6);
    expect(foe2.damage).toBeGreaterThan(unitAt(after, "unit_p1_griffins").damage);
    // The queue itself fired (a real follow-up attack was declared).
    expect(
      after.eventLog.some(
        (event: GameEvent) =>
          event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "magic-elemental-attack-all-enemies"
      )
    ).toBe(true);
    expect(unitAt(after, "unit_p2_dread_knights").damage).toBe(0);
  });
});
