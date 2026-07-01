import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState, tokenDefenseDelta } from "./index";
import { effectiveInitiative, makeActiveEffect } from "./active-effects";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * Effect-level coverage for the Factory board-game unit abilities wired from the
 * physical card scans (Wave 1: abilities that reuse an already-proven engine
 * effect). Each test asserts the OBSERVABLE combat outcome (a unit's damage or
 * effective Defense actually moved) and carries a mutation CONTROL: strip the
 * ability and the effect must vanish. See CLAUDE.md rule #1a.
 *
 * Battlefield is a 4-column grid: position p sits at row=floor(p/4), col=p%4;
 * pos 9 (row2,col1) — pos 13 (row3,col1) — pos 17 (row4,col1) is a straight
 * vertical line, so 13 is adjacent to 9 and 17 is "directly behind" 13.
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

/** Pass every instant window and always decline attack-die rerolls (keep the scripted roll). */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
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
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

/**
 * Mark every unit but `nextId` as already-activated, set `starterId` active and
 * Defend it, so `nextId` comes up next — driving the "[activation]" choice opener
 * through a real activation transition (mirrors binh-activation-abilities.test.ts).
 */
function makeNextActive(state: GameState, starterId: string, nextId: string): GameState {
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = unit.id !== starterId && unit.id !== nextId;
  }
  setActive(state, combat.units[starterId].controllerId, starterId);
  return applyOk(state, { type: "DEFEND_UNIT", playerId: combat.units[starterId].controllerId, unitId: starterId });
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function declaredAttacks(state: GameState): Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event.type === "UNIT_ATTACK_DECLARED"
  );
}

function attackRolls(
  state: GameState,
  attackerId: string
): Extract<GameEvent, { type: "ATTACK_ROLLED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && event.attackerId === attackerId
  );
}

// ---------------------------------------------------------------------------
// Mechanics — "Attack 2 spaces in a line" (SECOND_ATTACK_BEHIND_TARGET)
// ---------------------------------------------------------------------------

/**
 * A melee Mechanic (p1, pos 9) attacks the target directly below it (pos 13),
 * with a bystander "behind" the target (pos 17). All dice are scripted to 0, so
 * every attack deals exactly attack−defense; the behind unit only takes damage
 * if the line attack fires. The Mechanic and both enemies are fattened so nobody
 * dies mid-sequence.
 */
function mechanicsLineAttack(abilities: string[], behindPosition = 17): GameState {
  const state = createInitialGameState("factory-mech");
  const mech = state.combat!.units.unit_p1_griffins;
  Object.assign(mech, {
    name: "Mechanics",
    cardName: "Mechanics",
    type: "ground",
    variant: "few",
    attack: 3,
    defense: 0,
    maxHealth: 30,
    damage: 0,
    position: 9,
    abilities
  });
  Object.assign(state.combat!.units.unit_p2_skeletons, {
    attack: 1,
    defense: 0,
    maxHealth: 30,
    damage: 0,
    defenseToken: false,
    abilities: [],
    position: 13
  });
  Object.assign(state.combat!.units.unit_p2_vampires, {
    attack: 1,
    defense: 0,
    maxHealth: 30,
    damage: 0,
    defenseToken: false,
    abilities: [],
    position: behindPosition
  });
  state.combat!.units.unit_p2_dread_knights.position = 19;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, [0, 0, 0, 0, 0, 0]);
  setActive(state, "p1", "unit_p1_griffins");
  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("Factory Mechanics — line attack (reach)", () => {
  it("Few reach strikes the unit directly behind the target for attack 1", () => {
    const state = mechanicsLineAttack(["mechanics-line-attack-1"]);
    const line = declaredAttacks(state).find((event) => event.abilityAttack?.abilityId === "mechanics-line-attack-1");
    expect(line, "the Few line attack is declared").toBeDefined();
    expect(line?.defenderId, "it targets the unit behind").toBe("unit_p2_vampires");
    expect(line?.abilityAttack?.baseAttack).toBe(1);
    // Observable outcome: the behind unit actually took the hit (attack 1 − def 0 = 1).
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
  });

  it("Pack reach hits harder — attack 2, so the behind unit takes 1 MORE than the Few", () => {
    const few = mechanicsLineAttack(["mechanics-line-attack-1"]);
    const pack = mechanicsLineAttack(["mechanics-line-attack-2"]);
    const packLine = declaredAttacks(pack).find((event) => event.abilityAttack?.abilityId === "mechanics-line-attack-2");
    expect(packLine?.abilityAttack?.baseAttack).toBe(2);
    // The "second has N attack" number actually drives the damage: 2 vs 1.
    expect(pack.combat!.units.unit_p2_vampires.damage).toBe(2);
    expect(pack.combat!.units.unit_p2_vampires.damage - few.combat!.units.unit_p2_vampires.damage).toBe(1);
  });

  it("CONTROL: without the reach ability, nothing behind the target is touched", () => {
    const state = mechanicsLineAttack([]);
    expect(
      declaredAttacks(state).some((event) => event.abilityAttack?.abilityId?.startsWith("mechanics-line-attack")),
      "no line attack is declared"
    ).toBe(false);
    expect(state.combat!.units.unit_p2_vampires.damage, "the behind unit is untouched").toBe(0);
  });

  it("CONTROL: with no unit standing behind the target, the reach fizzles", () => {
    const state = mechanicsLineAttack(["mechanics-line-attack-1"], 11 /* not behind the target */);
    expect(
      declaredAttacks(state).some((event) => event.abilityAttack?.abilityId?.startsWith("mechanics-line-attack")),
      "reach with nothing behind does not fire"
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Halflings (Pack) — "on a +1 roll, target suffers -1 Defense" (ON_ATTACK_DIE_TOKEN)
// ---------------------------------------------------------------------------

/**
 * The p1 Marksmen stand in for a Pack of Halflings shooting a non-adjacent
 * Skeleton (a ranged shot → no retaliation). `attack-roll-advantage` rolls two
 * dice and keeps the higher, so scripting both dice to the same face pins the
 * resolved roll. A "+1" resolved die should drop a Corrosion token (−1 Defense).
 */
function halflingShot(abilities: string[], rolls: number[]): GameState {
  const state = createInitialGameState("factory-halfling");
  Object.assign(state.combat!.units.unit_p1_marksmen, {
    name: "Halflings",
    cardName: "Pack of Halflings",
    type: "ranged",
    variant: "pack",
    attack: 3,
    position: 1,
    abilities
  });
  Object.assign(state.combat!.units.unit_p2_skeletons, {
    defense: 3,
    defenseToken: false,
    maxHealth: 30,
    damage: 0,
    abilities: [],
    position: 13 // non-adjacent → ranged, no retaliation
  });
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, rolls);
  setActive(state, "p1", "unit_p1_marksmen");
  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

function corrosionAmounts(state: GameState): number[] {
  return (state.combat!.units.unit_p2_skeletons.tokens ?? [])
    .filter((token) => token.kind === "corrosion")
    .map((token) => token.amount);
}

describe("Factory Halflings — Precise Shot (-1 Defense on a +1 roll)", () => {
  it("a +1 roll drops a Corrosion token that actually LOWERS the target's Defense by 1", () => {
    const state = halflingShot(["attack-roll-advantage", "halfling-precise-shot"], [1, 1, 1, 1]);
    expect(corrosionAmounts(state), "one -1 Corrosion token").toEqual([1]);
    // Assert the real effect, not just the token: effective Defense drops by 1.
    expect(tokenDefenseDelta(state.combat!.units.unit_p2_skeletons)).toBe(-1);
  });

  it("CONTROL: on a 0 roll no token is placed (Defense unchanged)", () => {
    const state = halflingShot(["attack-roll-advantage", "halfling-precise-shot"], [0, 0, 0, 0]);
    expect(corrosionAmounts(state)).toEqual([]);
    expect(Math.abs(tokenDefenseDelta(state.combat!.units.unit_p2_skeletons))).toBe(0);
  });

  it("CONTROL: the token comes from Precise Shot, not from Twin Dice — advantage alone places nothing", () => {
    const state = halflingShot(["attack-roll-advantage"], [1, 1, 1, 1]);
    expect(corrosionAmounts(state), "no Precise Shot ⇒ no Corrosion even on a +1").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sandworms (Neutral) — "attack an adjacent target again" (SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION)
// ---------------------------------------------------------------------------

/**
 * A melee Sandworm (p1, pos 10) attacks an adjacent Vampire (pos 11). The
 * Vampire is fat enough to survive the first hit and retaliate; the Sandworm is
 * fat enough to survive that retaliation, so its "attack this target again"
 * follow-up can resolve. All dice scripted to 0.
 */
function sandwormMelee(abilities: string[]): GameState {
  const state = createInitialGameState("factory-sandworm");
  Object.assign(state.combat!.units.unit_p1_griffins, {
    name: "Sandworms",
    cardName: "Sandworms",
    type: "ground",
    variant: "neutral",
    attack: 3,
    defense: 0,
    maxHealth: 30,
    damage: 0,
    position: 10,
    abilities
  });
  Object.assign(state.combat!.units.unit_p2_vampires, {
    attack: 1,
    defense: 0,
    maxHealth: 30,
    damage: 0,
    defenseToken: false,
    abilities: [],
    position: 11
  });
  state.combat!.units.unit_p2_skeletons.position = 19;
  state.combat!.units.unit_p2_dread_knights.position = 18;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, [0, 0, 0, 0, 0, 0]);
  setActive(state, "p1", "unit_p1_griffins");
  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    })
  );
}

describe("Factory Sandworms (Neutral) — strike an adjacent target twice", () => {
  it("attacks the same adjacent target a second time and deals two hits of damage", () => {
    const state = sandwormMelee(["sandworm-strike-again"]);
    const triggered = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "sandworm-strike-again"
    );
    expect(triggered, "the second strike is announced once").toHaveLength(1);
    // The Sandworm rolls its attack against the Vampire TWICE.
    expect(attackRolls(state, "unit_p1_griffins").length).toBe(2);
    // Two hits of (attack 3 − def 0) landed: 6 damage total.
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(6);
  });

  it("CONTROL: without the ability the Sandworm attacks only once", () => {
    const state = sandwormMelee([]);
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "sandworm-strike-again"
      )
    ).toBe(false);
    expect(attackRolls(state, "unit_p1_griffins").length).toBe(1);
    expect(state.combat!.units.unit_p2_vampires.damage, "a single hit").toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Armadillos (Pack) — amplify any Initiative increase by +1 (AMPLIFY_INITIATIVE_INCREASE)
// ---------------------------------------------------------------------------

/** Push a unit-scoped Initiative shift (Haste/Slow style) onto the state. */
function pushInitiativeEffect(state: GameState, unitId: string, amount: number): void {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      {
        name: amount >= 0 ? "Haste" : "Slow",
        scope: "unit",
        duration: { type: "combat" },
        polarity: amount >= 0 ? "positive" : "negative",
        modifiers: [{ type: "INITIATIVE_BONUS", amount }]
      },
      { type: "system" },
      "p1",
      { type: "unit", unitId }
    )
  );
}

describe("Factory Armadillos (Pack) — Gathering Momentum (amplify Initiative increases)", () => {
  it("a +2 Initiative effect becomes +3 on an Armadillo with the ability", () => {
    const state = createInitialGameState("factory-armadillo");
    const armadillo = state.combat!.units.unit_p1_griffins;
    Object.assign(armadillo, { type: "ground", initiative: 6, abilities: ["armadillo-initiative-amplify"] });
    const base = armadillo.initiative;

    expect(effectiveInitiative(armadillo, state.activeEffects), "no effect ⇒ no amplification").toBe(base);

    pushInitiativeEffect(state, armadillo.id, 2);
    expect(effectiveInitiative(armadillo, state.activeEffects), "+2 amplified to +3").toBe(base + 3);
  });

  it("CONTROL: the same +2 effect on a unit WITHOUT the ability is only +2", () => {
    const state = createInitialGameState("factory-armadillo-ctrl");
    const plain = state.combat!.units.unit_p1_griffins;
    Object.assign(plain, { type: "ground", initiative: 6, abilities: [] });
    pushInitiativeEffect(state, plain.id, 2);
    expect(effectiveInitiative(plain, state.activeEffects)).toBe(6 + 2);
  });

  it("CONTROL: a Slow (net-negative shift) is NOT amplified", () => {
    const state = createInitialGameState("factory-armadillo-slow");
    const armadillo = state.combat!.units.unit_p1_griffins;
    Object.assign(armadillo, { type: "ground", initiative: 6, abilities: ["armadillo-initiative-amplify"] });
    pushInitiativeEffect(state, armadillo.id, -2);
    // Only genuine increases get the +1; a decrease stays -2 (6 - 2 = 4), not -1.
    expect(effectiveInitiative(armadillo, state.activeEffects)).toBe(6 - 2);
  });
});

// ---------------------------------------------------------------------------
// Mechanics — "Field Repair" (heal an adjacent mechanical unit; Pack falls back to +Attack)
// ---------------------------------------------------------------------------

/**
 * Stage the p1 Marksmen as a Mechanic that will activate next, with a friendly
 * unit standing adjacent (pos 5 ↔ pos 6). The caller sets the Mechanic's
 * abilities, and the neighbour's unitDefId (mechanical or not), damage and
 * position, then reads the outcome after the activation transition.
 */
function mechanicRepairSandbox(options: {
  mechanicAbilities: string[];
  neighbourDefId: string;
  neighbourDamage: number;
  neighbourPosition?: number;
}): GameState {
  const state = createInitialGameState("factory-repair");
  const combat = state.combat!;
  Object.assign(combat.units.unit_p1_marksmen, {
    name: "Mechanics",
    cardName: "Mechanics",
    type: "ground",
    attack: 2,
    damage: 0,
    position: 5,
    abilities: options.mechanicAbilities
  });
  Object.assign(combat.units.unit_p1_crusaders, {
    unitDefId: options.neighbourDefId,
    damage: options.neighbourDamage,
    maxHealth: 10,
    position: options.neighbourPosition ?? 6 // adjacent to pos 5 by default
  });
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");
}

function selfAttackBuff(state: GameState, unitId: string): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unitId &&
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS")
  );
}

describe("Factory Mechanics — Field Repair", () => {
  it("Few repairs up to 1 damage off an adjacent mechanical unit (Automaton)", () => {
    const state = mechanicRepairSandbox({
      mechanicAbilities: ["mechanics-repair-1", "mechanics-line-attack-1"],
      neighbourDefId: "factory.automatons",
      neighbourDamage: 3
    });
    const choice = state.pendingChoice;
    expect(choice?.type, "the repair choice opens for the adjacent Automaton").toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.kind).toBe("enchanter-activation");
    expect(choice.candidateUnitIds).toEqual(["unit_p1_crusaders"]);
    const resolved = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });
    expect(resolved.combat!.units.unit_p1_crusaders.damage, "1 damage repaired (3 → 2)").toBe(2);
  });

  it("Pack repairs up to 2 damage off an adjacent mechanical unit (Dreadnought)", () => {
    const state = mechanicRepairSandbox({
      mechanicAbilities: ["mechanics-repair-2", "mechanics-line-attack-2"],
      neighbourDefId: "factory.dreadnoughts",
      neighbourDamage: 3
    });
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    const resolved = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });
    expect(resolved.combat!.units.unit_p1_crusaders.damage, "2 damage repaired (3 → 1)").toBe(1);
  });

  it("CONTROL: a NON-mechanical adjacent ally is not a repair target — the Few does nothing", () => {
    const state = mechanicRepairSandbox({
      mechanicAbilities: ["mechanics-repair-1", "mechanics-line-attack-1"],
      neighbourDefId: "castle.griffins", // living, not mechanical
      neighbourDamage: 3
    });
    // No candidate ⇒ no choice; the Few has no +Attack fallback, so nothing happens.
    expect(state.pendingChoice, "no repair choice for a non-mechanical ally").toBeNull();
    expect(state.combat!.units.unit_p1_crusaders.damage, "the living ally is NOT repaired").toBe(3);
    expect(selfAttackBuff(state, "unit_p1_marksmen"), "the Few gains no Attack buff").toBe(false);
  });

  it("CONTROL: a mechanical ally that is NOT adjacent cannot be repaired", () => {
    const state = mechanicRepairSandbox({
      mechanicAbilities: ["mechanics-repair-1", "mechanics-line-attack-1"],
      neighbourDefId: "factory.automatons",
      neighbourDamage: 3,
      neighbourPosition: 15 // far from the Mechanic at pos 5
    });
    expect(state.pendingChoice, "a distant Automaton is out of repair range").toBeNull();
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(3);
  });

  it("Pack with no mechanical unit to repair takes the +1 Attack fallback instead", () => {
    const state = mechanicRepairSandbox({
      mechanicAbilities: ["mechanics-repair-2", "mechanics-line-attack-2"],
      neighbourDefId: "castle.griffins", // nothing mechanical to repair
      neighbourDamage: 3
    });
    expect(state.pendingChoice, "no repair target ⇒ auto-resolve to the buff").toBeNull();
    expect(selfAttackBuff(state, "unit_p1_marksmen"), "the Pack gains its +1 Attack").toBe(true);
  });
});
