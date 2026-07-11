import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./index";
import { applyAction } from "./index";
import { getUnitAttackRerollSources } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "./state";

/**
 * The board game's `[unit_attack]` trigger fires when a unit makes its OWN
 * declared attack — it is a DISTINCT symbol from the retaliation trigger (per the
 * rules legend: "Attack — triggers when unit is attacking"; "Retaliation —
 * triggers when unit is retaliating"). So every `[unit_attack]` ability must DROP
 * on a Retaliation Attack. Each test proves the ability fires on the unit's own
 * attack (control) but NOT on its retaliation, driving the real engine to the
 * observable damage / card-draw / reroll-offer outcome so it fails if the
 * retaliation gate is removed.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

/** p1 attacker hits a NON-adjacent p2 defender (no retaliation): the attacker's
 * own declared attack. Returns the defender's damage. */
function ownAttackDamage(options: {
  attackerAbilities: string[];
  attackerAttack: number;
  rolls: number[];
  mutateAttacker?: (unit: CombatUnitState) => void;
}): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.attackerAbilities;
  // Left RANGED (the marksmen default) so it can hit the non-adjacent defender
  // with a single, penalty-free die — no advantage/disadvantage to skew the math.
  attacker.attack = options.attackerAttack;
  attacker.position = 1;
  options.mutateAttacker?.(attacker);
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13; // non-adjacent → no retaliation
  defender.defense = 0;
  defender.maxHealth = 40;
  defender.damage = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, options.rolls);
  setActive(state, "p1", "unit_p1_marksmen");
  return passAllReactions(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
  );
}

/** p1 attacker hits an ADJACENT p2 defender that RETALIATES. The defender carries
 * the ability under test; the p1 attacker is a plain melee unit. */
function retaliation(options: {
  defenderAbilities: string[];
  defenderAttack: number;
  rolls: number[];
  mutateDefender?: (unit: CombatUnitState) => void;
}): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = [];
  attacker.type = "ground";
  attacker.attack = 3;
  attacker.position = 1;
  attacker.maxHealth = 40;
  attacker.damage = 0;
  attacker.defense = 0;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = options.defenderAbilities;
  defender.attack = options.defenderAttack;
  defender.type = "ground";
  defender.position = 5; // adjacent (directly below the attacker)
  defender.defense = 0;
  defender.maxHealth = 40;
  defender.damage = 0;
  options.mutateDefender?.(defender);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, options.rolls);
  setActive(state, "p1", "unit_p1_marksmen");
  return passAllReactions(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
  );
}

const skeletonDamage = (s: GameState) => s.combat!.units.unit_p2_skeletons.damage;
const marksmenDamage = (s: GameState) => s.combat!.units.unit_p1_marksmen.damage;

describe("Ghost Dragons [unit_attack] '+1 to Attack die result'", () => {
  it("adds +1 on the unit's own attack", () => {
    // attack 4 + die-result bonus 1 + die 0 = 5 damage.
    expect(skeletonDamage(ownAttackDamage({ attackerAbilities: ["ghost-dragon-attack-die"], attackerAttack: 4, rolls: [0] }))).toBe(5);
  });
  it("does NOT add +1 on a Retaliation Attack", () => {
    // Retaliation: attack 4 + die 0 = 4 damage (no +1). Bug would give 5.
    expect(marksmenDamage(retaliation({ defenderAbilities: ["ghost-dragon-attack-die"], defenderAttack: 4, rolls: [0, 0] }))).toBe(4);
  });
});

describe("Dread Knights [unit_attack] 'Death Blow' (+1 on a 0/+1 die)", () => {
  it("adds +1 on the unit's own attack that resolves 0", () => {
    // attack 4 + Death Blow 1 + die 0 = 5 damage.
    expect(skeletonDamage(ownAttackDamage({ attackerAbilities: ["dread-knight-death-blow"], attackerAttack: 4, rolls: [0] }))).toBe(5);
  });
  it("does NOT add +1 on a Retaliation Attack resolving 0", () => {
    // Retaliation: attack 4 + die 0 = 4 (no Death Blow). Bug would give 5.
    expect(marksmenDamage(retaliation({ defenderAbilities: ["dread-knight-death-blow"], defenderAttack: 4, rolls: [0, 0] }))).toBe(4);
  });
});

describe("Cove Haspids [unit_attack] 'Vengeance' (+2 once flipped)", () => {
  const flip = (unit: CombatUnitState) => {
    unit.flippedDownThisCombat = true;
  };
  it("adds +2 on the flipped unit's own attack", () => {
    // attack 4 + Vengeance 2 + die 0 = 6 damage.
    expect(
      skeletonDamage(ownAttackDamage({ attackerAbilities: ["haspid-vengeance"], attackerAttack: 4, rolls: [0], mutateAttacker: flip }))
    ).toBe(6);
  });
  it("does NOT add +2 on a Retaliation Attack", () => {
    // Retaliation: attack 4 + die 0 = 4 (no Vengeance). Bug would give 6.
    expect(
      marksmenDamage(retaliation({ defenderAbilities: ["haspid-vengeance"], defenderAttack: 4, rolls: [0, 0], mutateDefender: flip }))
    ).toBe(4);
  });
});

describe("Dungeon Minotaurs [unit_attack] 'draw a card on a -1'", () => {
  it("draws on the unit's own attack that resolves -1", () => {
    const after = ownAttackDamage({ attackerAbilities: ["minotaur-draw-on-miss"], attackerAttack: 4, rolls: [-1] });
    // The attacking Minotaur's controller (p1) drew one card.
    expect(after.players.p1.hand.length).toBe(1);
  });
  it("does NOT draw on a Retaliation Attack that resolves -1", () => {
    const after = retaliation({ defenderAbilities: ["minotaur-draw-on-miss"], defenderAttack: 4, rolls: [0, -1] });
    // The retaliating Minotaur's controller (p2) drew nothing. Bug would draw 1.
    expect(after.players.p2.hand.length).toBe(0);
  });
});

describe("[unit_attack] Attack-die reroll abilities are own-attack-only", () => {
  it("Crusaders' 'reroll every 0' is offered on the own attack but NOT on a retaliation", () => {
    const crusader = unitWith(["attack-die-reroll"]);
    expect(getUnitAttackRerollSources(crusader, false, false).length).toBe(1);
    expect(getUnitAttackRerollSources(crusader, false, true)).toEqual([]);
  });
  it("neutral Minotaurs' 'reroll a -1' is offered on the own attack but NOT on a retaliation", () => {
    const minotaur = unitWith(["minotaur-reroll"]);
    expect(getUnitAttackRerollSources(minotaur, false, false).length).toBe(1);
    expect(getUnitAttackRerollSources(minotaur, false, true)).toEqual([]);
  });
});
