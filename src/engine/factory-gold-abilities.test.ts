import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState } from "./index";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * Effect-level coverage for the five Factory GOLD-tier / cube abilities wired off
 * the physical card scans (Couatl invulnerability, Dreadnought splash, the
 * faction-cube subsystem behind the Automaton Few Detonate and the Sandworm Pack
 * extra attack, and the Bounty Hunter Neutral Preemptive Shot). Every test
 * asserts the OBSERVABLE combat outcome and carries a mutation CONTROL: strip the
 * ability and the effect vanishes. See CLAUDE.md rule #1/#1a.
 *
 * Battlefield is a 4-column grid: position p sits at row=floor(p/4), col=p%4;
 * orthogonal neighbours of pos 5 are 1, 4, 6, 9.
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

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

/**
 * Mark every unit but `nextId` as already-activated, set `starterId` active and
 * Defend it, so `nextId` comes up next — driving its "[activation]" choice opener
 * through a real activation transition.
 */
function makeNextActive(state: GameState, starterId: string, nextId: string): GameState {
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = unit.id !== starterId && unit.id !== nextId;
  }
  setActive(state, combat.units[starterId].controllerId, starterId);
  return applyOk(state, { type: "DEFEND_UNIT", playerId: combat.units[starterId].controllerId, unitId: starterId });
}

function triggeredAbilities(state: GameState, abilityId: string): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
      event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === abilityId
  );
}

// ===========================================================================
// Couatls (Few/Pack) — activated invulnerability ("ignore all damage & spell")
// ===========================================================================

describe("Factory Couatls — activated invulnerability", () => {
  it("activating it at the Couatl's turn sets the ward, and it fades on its NEXT activation", () => {
    const state = createInitialGameState("couatl-lifecycle");
    Object.assign(state.combat!.units.unit_p1_griffins, {
      name: "Couatls",
      cardName: "Couatls",
      type: "flying",
      variant: "pack",
      abilities: ["couatl-invulnerability-pack"]
    });
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const opened = makeNextActive(state, "unit_p1_marksmen", "unit_p1_griffins");
    const choice = opened.pendingChoice;
    expect(choice?.type, "the invulnerability choice opens on the Couatl's activation").toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.kind).toBe("couatl-invulnerability");

    const warded = applyOk(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_griffins"
    });
    expect(warded.combat!.units.unit_p1_griffins.invulnerableUntilActivation, "ward is up").toBe(true);
    expect(warded.combat!.units.unit_p1_griffins.usedInvulnerabilityThisCombat, "spent once per combat").toBe(true);
    // The ability fires its UNIT_ABILITY_TRIGGERED (drives the shield FX cue).
    expect(triggeredAbilities(warded, "couatl-invulnerability-pack").length, "invuln FX event fires").toBeGreaterThanOrEqual(1);

    // The ward lasts "until its next activation": drive that next activation.
    const next = makeNextActive(warded, "unit_p1_marksmen", "unit_p1_griffins");
    expect(next.combat!.units.unit_p1_griffins.invulnerableUntilActivation, "ward faded as it re-activates").toBeFalsy();
  });

  it("CONTROL: skipping the choice leaves the ward down", () => {
    const state = createInitialGameState("couatl-skip");
    Object.assign(state.combat!.units.unit_p1_griffins, {
      name: "Couatls",
      type: "flying",
      variant: "pack",
      abilities: ["couatl-invulnerability-pack"]
    });
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const opened = makeNextActive(state, "unit_p1_marksmen", "unit_p1_griffins");
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("no choice");
    const skipped = applyOk(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "skip"
    });
    expect(skipped.combat!.units.unit_p1_griffins.invulnerableUntilActivation).toBeFalsy();
    expect(skipped.combat!.units.unit_p1_griffins.usedInvulnerabilityThisCombat).toBeFalsy();
  });

  it("the Few's activation of it ENDS the turn; the Pack's is free (still active)", () => {
    for (const [ability, endsTurn] of [
      ["couatl-invulnerability-few", true],
      ["couatl-invulnerability-pack", false]
    ] as const) {
      const state = createInitialGameState(`couatl-turn-${ability}`);
      Object.assign(state.combat!.units.unit_p1_griffins, {
        name: "Couatls",
        type: "flying",
        variant: ability === "couatl-invulnerability-few" ? "few" : "pack",
        abilities: [ability]
      });
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      const opened = makeNextActive(state, "unit_p1_marksmen", "unit_p1_griffins");
      const choice = opened.pendingChoice;
      if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("no choice");
      const warded = applyOk(opened, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: choice.id,
        targetUnitId: "unit_p1_griffins"
      });
      expect(warded.combat!.units.unit_p1_griffins.activatedThisRound, `${ability} ends-turn=${endsTurn}`).toBe(endsTurn);
    }
  });

  it("an invulnerable Couatl takes ZERO damage from an attack; a bare one takes the hit", () => {
    function couatlUnderAttack(invuln: boolean): GameState {
      const state = createInitialGameState(`couatl-attack-${invuln}`);
      Object.assign(state.combat!.units.unit_p1_griffins, {
        name: "Couatls",
        type: "flying",
        defense: 0,
        maxHealth: 20,
        damage: 0,
        position: 5,
        abilities: ["couatl-invulnerability-few"],
        invulnerableUntilActivation: invuln
      });
      Object.assign(state.combat!.units.unit_p2_skeletons, {
        attack: 6,
        defense: 0,
        defenseToken: false,
        maxHealth: 20,
        damage: 0,
        abilities: [],
        position: 1 // adjacent to pos 5
      });
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      script(state, [0, 0, 0, 0, 0, 0]);
      setActive(state, "p2", "unit_p2_skeletons");
      return settle(
        applyOk(state, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "unit_p2_skeletons",
          defenderId: "unit_p1_griffins"
        })
      );
    }
    expect(couatlUnderAttack(true).combat!.units.unit_p1_griffins.damage, "warded ⇒ 0 damage").toBe(0);
    expect(couatlUnderAttack(false).combat!.units.unit_p1_griffins.damage, "bare ⇒ attack 6 − def 0 lands").toBe(6);
  });

  it("an invulnerable Couatl ignores spell damage too; a bare one takes it", () => {
    function couatlUnderSpell(invuln: boolean): GameState {
      const state = createInitialGameState(`couatl-spell-${invuln}`);
      Object.assign(state.combat!.units.unit_p2_skeletons, {
        name: "Couatls",
        type: "flying",
        defense: 0,
        maxHealth: 20,
        damage: 0,
        abilities: ["couatl-invulnerability-few"],
        invulnerableUntilActivation: invuln,
        position: 13
      });
      // Give p1 a Magic Arrow to cast at the Couatl.
      const arrow = state.players.p1.hand.find((id) => id.includes("magic_arrow"));
      state.players.p2.hand = [];
      setActive(state, "p1", "unit_p1_marksmen");
      if (!arrow) return state;
      const cast = getLegalActions(state, "p1").find(
        (entry) =>
          entry.action.type === "CAST_SPELL" &&
          entry.action.cardId === arrow &&
          entry.action.target?.type === "unit" &&
          entry.action.target.unitId === "unit_p2_skeletons"
      );
      if (!cast) return state;
      return settle(applyOk(state, cast.action));
    }
    const warded = couatlUnderSpell(true).combat!.units.unit_p2_skeletons.damage;
    const bare = couatlUnderSpell(false).combat!.units.unit_p2_skeletons.damage;
    expect(warded, "warded Couatl ignores the Magic Arrow").toBe(0);
    expect(bare, "a bare Couatl takes the Magic Arrow").toBeGreaterThan(0);
  });

  it("an invulnerable Couatl ignores an Automaton's Detonate blast; a bare neighbour takes it", () => {
    function couatlNextToBlast(invuln: boolean): number {
      const state = createInitialGameState(`couatl-blast-${invuln}`);
      const automaton = state.combat!.units.unit_p1_griffins;
      Object.assign(automaton, {
        unitDefId: "factory.automatons",
        cardName: "Automatons",
        abilities: ["automaton-detonate"],
        variant: "few",
        position: 5,
        maxHealth: 6,
        damage: 0
      });
      const couatl = state.combat!.units.unit_p2_skeletons;
      Object.assign(couatl, {
        name: "Couatls",
        type: "flying",
        maxHealth: 20,
        damage: 0,
        abilities: ["couatl-invulnerability-few"],
        invulnerableUntilActivation: invuln,
        position: 1 // adjacent to pos 5
      });
      // Park the rest away.
      for (const id of ["unit_p1_crusaders", "unit_p1_marksmen", "unit_p2_vampires", "unit_p2_dread_knights"]) {
        state.combat!.units[id].position = 19;
      }
      state.combat!.units.unit_p2_dread_knights.position = 18;
      automaton.damage = automaton.maxHealth;
      markUnitRemovedIfNeeded(state, automaton);
      return couatl.damage;
    }
    expect(couatlNextToBlast(true), "warded ⇒ blast ignored").toBe(0);
    expect(couatlNextToBlast(false), "bare ⇒ takes the 2-damage blast").toBe(2);
  });
});

// ===========================================================================
// Dreadnoughts (Few/Pack/Neutral) — "instead of attacking, allocate splash"
// ===========================================================================

describe("Factory Dreadnoughts — splash allocation", () => {
  /** Stage a Dreadnought (pos 5) ringed by three enemies (1, 4, 6). */
  function dreadnoughtBoard(seed: string, ability: string): GameState {
    const state = createInitialGameState(seed);
    Object.assign(state.combat!.units.unit_p1_griffins, {
      name: "Dreadnoughts",
      cardName: "Dreadnoughts",
      type: "ground",
      unitDefId: "factory.dreadnoughts",
      variant: ability === "dreadnought-splash-1" ? "few" : "pack",
      attack: 5,
      position: 5,
      abilities: [ability]
    });
    Object.assign(state.combat!.units.unit_p2_skeletons, { defense: 0, maxHealth: 20, damage: 0, defenseToken: false, abilities: [], position: 1 });
    Object.assign(state.combat!.units.unit_p2_vampires, { defense: 0, maxHealth: 20, damage: 0, defenseToken: false, abilities: [], position: 4 });
    Object.assign(state.combat!.units.unit_p2_dread_knights, { defense: 0, maxHealth: 20, damage: 0, defenseToken: false, abilities: [], position: 6 });
    state.combat!.units.unit_p1_crusaders.position = 19;
    state.combat!.units.unit_p1_marksmen.position = 18;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  it("the Pack allocates 2/1/1 across three chosen adjacent units, in order", () => {
    let state = dreadnoughtBoard("dread-pack", "dreadnought-splash-2");
    const useSplash = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === "dreadnought-splash-2"
    );
    expect(useSplash, "the splash 'other action' is offered").toBeDefined();
    state = applyOk(state, useSplash!.action);

    // First pick takes 2, second and third take 1 each.
    const order = ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"];
    for (const targetUnitId of order) {
      const choice = state.pendingChoice;
      expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
      if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
      expect(choice.kind).toBe("dreadnought-splash");
      state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId });
    }
    expect(state.combat!.units.unit_p2_skeletons.damage, "first selected takes 2").toBe(2);
    expect(state.combat!.units.unit_p2_vampires.damage, "second takes 1").toBe(1);
    expect(state.combat!.units.unit_p2_dread_knights.damage, "third takes 1").toBe(1);
    // Each pick fires the splash FX event (per-target, drives the shockwave cue).
    expect(triggeredAbilities(state, "dreadnought-splash-2").length, "splash FX events fire").toBe(3);
    // "Instead of attacking": the splash ends the Dreadnought's turn.
    expect(state.combat!.units.unit_p1_griffins.activatedThisRound, "splash replaced the attack").toBe(true);
  });

  it("the Few allocates 1/1 across up to TWO units (never a third)", () => {
    let state = dreadnoughtBoard("dread-few", "dreadnought-splash-1");
    const useSplash = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && entry.action.abilityId === "dreadnought-splash-1"
    );
    expect(useSplash).toBeDefined();
    state = applyOk(state, useSplash!.action);
    let picks = 0;
    let safety = 6;
    while (state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && safety > 0) {
      safety -= 1;
      const choice = state.pendingChoice;
      const targetUnitId = choice.candidateUnitIds[0];
      state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId });
      picks += 1;
    }
    expect(picks, "the Few allocates exactly its two 1-damage values").toBe(2);
    const totalDamage =
      state.combat!.units.unit_p2_skeletons.damage +
      state.combat!.units.unit_p2_vampires.damage +
      state.combat!.units.unit_p2_dread_knights.damage;
    expect(totalDamage, "1 + 1 dealt, never a 2").toBe(2);
  });

  it("CONTROL: with the ability stripped, no splash 'other action' is offered", () => {
    const state = dreadnoughtBoard("dread-none", "dreadnought-splash-2");
    state.combat!.units.unit_p1_griffins.abilities = [];
    const useSplash = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "USE_UNIT_ABILITY" && String((entry.action as { abilityId?: string }).abilityId).startsWith("dreadnought-splash")
    );
    expect(useSplash, "no splash without the ability").toBeUndefined();
  });
});

// ===========================================================================
// Automaton (Few) — the faction-cube subsystem: place cubes → cube-scaled blast
// ===========================================================================

describe("Factory Automaton (Few) — cube-scaled Detonate", () => {
  it("placing a cube at activation raises factionCubes and the Detonate scales with it", () => {
    // Drive the place-cube activation choice, bank a cube, and confirm the blast.
    const state = createInitialGameState("automaton-cube");
    const automaton = state.combat!.units.unit_p1_griffins;
    Object.assign(automaton, {
      name: "Automatons",
      cardName: "Automatons",
      unitDefId: "factory.automatons",
      type: "ground",
      variant: "few",
      maxHealth: 6,
      damage: 0,
      position: 5,
      abilities: ["automaton-place-cube", "automaton-detonate-cubes"]
    });
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const opened = makeNextActive(state, "unit_p1_marksmen", "unit_p1_griffins");
    const choice = opened.pendingChoice;
    expect(choice?.type, "the place-cube choice opens").toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.kind).toBe("automaton-cube");
    const banked = applyOk(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_griffins"
    });
    expect(banked.combat!.units.unit_p1_griffins.factionCubes, "one cube banked").toBe(1);
    expect(triggeredAbilities(banked, "automaton-place-cube").length, "place-cube FX event fires").toBe(1);
    // Placing a cube is free — the Automaton is still active afterwards.
    expect(banked.combat!.units.unit_p1_griffins.activatedThisRound).toBeFalsy();
  });

  it("Detonate deals factionCubes damage to each neighbour — 0 cubes fizzle, 2 cubes hit for 2", () => {
    function detonateWith(cubes: number): number {
      const state = createInitialGameState(`automaton-detonate-${cubes}`);
      const automaton = state.combat!.units.unit_p1_griffins;
      Object.assign(automaton, {
        unitDefId: "factory.automatons",
        cardName: "Automatons",
        type: "ground",
        variant: "few",
        maxHealth: 6,
        damage: 0,
        position: 5,
        abilities: ["automaton-place-cube", "automaton-detonate-cubes"],
        factionCubes: cubes
      });
      const enemy = state.combat!.units.unit_p2_skeletons;
      Object.assign(enemy, { maxHealth: 10, damage: 0, abilities: [], position: 1 });
      for (const id of ["unit_p1_crusaders", "unit_p1_marksmen", "unit_p2_vampires"]) state.combat!.units[id].position = 19;
      state.combat!.units.unit_p2_dread_knights.position = 18;
      automaton.damage = automaton.maxHealth;
      markUnitRemovedIfNeeded(state, automaton);
      return enemy.damage;
    }
    expect(detonateWith(0), "no cubes ⇒ no blast").toBe(0);
    expect(detonateWith(1), "one cube ⇒ 1 damage").toBe(1);
    expect(detonateWith(2), "two cubes ⇒ 2 damage").toBe(2);
  });

  it("CONTROL: without the cube-Detonate ability, a removed Automaton harms no neighbour", () => {
    const state = createInitialGameState("automaton-detonate-ctrl");
    const automaton = state.combat!.units.unit_p1_griffins;
    Object.assign(automaton, {
      unitDefId: "factory.automatons",
      type: "ground",
      variant: "few",
      maxHealth: 6,
      damage: 6,
      position: 5,
      abilities: [],
      factionCubes: 2
    });
    const enemy = state.combat!.units.unit_p2_skeletons;
    Object.assign(enemy, { maxHealth: 10, damage: 0, abilities: [], position: 1 });
    markUnitRemovedIfNeeded(state, automaton);
    expect(enemy.damage).toBe(0);
  });
});

// ===========================================================================
// Sandworm (Pack) — the faction-cube subsystem: gain on kill → spend to reattack
// ===========================================================================

describe("Factory Sandworm (Pack) — cube-fuelled extra attack", () => {
  /** A melee Sandworm (pos 5) adjacent to two weak enemies (1, 6). */
  function sandwormBoard(seed: string, abilities: string[]): GameState {
    const state = createInitialGameState(seed);
    Object.assign(state.combat!.units.unit_p1_griffins, {
      name: "Sandworms",
      cardName: "Sandworms",
      unitDefId: "factory.sandworms",
      type: "ground",
      variant: "pack",
      attack: 5,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      position: 5,
      abilities
    });
    // variant "few" (the lowest side) + no unitDefId ⇒ a lethal hit REMOVES them
    // outright (no Pack→Few flip), so the Sandworm's strike is a real kill.
    Object.assign(state.combat!.units.unit_p2_skeletons, { attack: 1, defense: 0, defenseToken: false, variant: "few", unitDefId: undefined, maxHealth: 3, damage: 0, abilities: [], position: 1 });
    Object.assign(state.combat!.units.unit_p2_vampires, { attack: 1, defense: 0, defenseToken: false, variant: "few", unitDefId: undefined, maxHealth: 3, damage: 0, abilities: [], position: 6 });
    state.combat!.units.unit_p2_dread_knights.position = 19;
    state.combat!.units.unit_p1_crusaders.position = 18;
    state.combat!.units.unit_p1_marksmen.position = 17;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0, 0, 0, 0, 0, 0, 0, 0]);
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  it("defeating an enemy banks a faction cube, which can be spent to attack a second enemy", () => {
    let state = sandwormBoard("sandworm-chain", ["sandworm-cube-gain", "sandworm-cube-attack"]);
    // First attack removes the 3-HP Skeleton (attack 5 − def 0 = 5), banking a cube.
    state = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    expect(state.combat!.units.unit_p2_skeletons.damage, "skeleton removed").toBeGreaterThanOrEqual(3);
    expect(state.combat!.units.unit_p1_griffins.factionCubes, "a cube was banked on the kill").toBe(1);
    expect(triggeredAbilities(state, "sandworm-cube-gain").length, "Devour FX event fires on the kill").toBeGreaterThanOrEqual(1);
    expect(state.combat!.units.unit_p1_griffins.activatedThisRound, "still active — a cube remains").toBeFalsy();

    // The extra attack is offered; spending the cube attacks the second enemy.
    const again = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "ATTACK_UNIT" && entry.action.defenderId === "unit_p2_vampires"
    );
    expect(again, "the cube attack-again is offered").toBeDefined();
    state = settle(applyOk(state, again!.action));
    expect(state.combat!.units.unit_p2_vampires.damage, "the second enemy is struck").toBeGreaterThanOrEqual(3);
    // Spent that cube; but the second kill banked another, so it is 1 again.
    expect(state.combat!.units.unit_p1_griffins.factionCubes, "spent one, banked one from the 2nd kill").toBe(1);
    expect(
      triggeredAbilities(state, "sandworm-cube-attack").length,
      "the spend-a-cube attack fired once"
    ).toBe(1);
  });

  it("CONTROL: with no cube, the Sandworm cannot attack again — one strike only", () => {
    let state = sandwormBoard("sandworm-nocube", ["sandworm-cube-attack"]); // no cube-GAIN, so a kill banks nothing
    state = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    expect(state.combat!.units.unit_p1_griffins.factionCubes ?? 0, "no cube banked (no gain ability)").toBe(0);
    // With no cube the activation concluded — the Sandworm is no longer active.
    const again = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "ATTACK_UNIT" && entry.action.attackerId === "unit_p1_griffins"
    );
    expect(again, "no attack-again without a cube").toBeUndefined();
  });

  it("CONTROL: a kill without the cube-GAIN ability banks nothing", () => {
    let state = sandwormBoard("sandworm-gain-ctrl", []);
    state = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    expect(state.combat!.units.unit_p1_griffins.factionCubes ?? 0).toBe(0);
  });
});

// ===========================================================================
// Bounty Hunters (Neutral) — Preemptive Shot (retaliate first + vs. ranged)
// ===========================================================================

describe("Factory Bounty Hunters (Neutral) — Preemptive Shot", () => {
  /**
   * A p2 Bounty Hunter (pos 5) is attacked by a p1 unit. `preemptive` decides
   * whether it carries the ability; `attackerPosition` places the attacker
   * adjacent (melee, pos 1) or far (ranged, pos 17). Dice scripted to 0.
   */
  function underAttack(options: {
    preemptive: boolean;
    attackerPosition: number;
    attackerType?: "ground" | "ranged";
    attackerHealth?: number;
    guardAttack?: number;
  }): GameState {
    const state = createInitialGameState(`bounty-preempt-${options.preemptive}-${options.attackerPosition}`);
    Object.assign(state.combat!.units.unit_p2_skeletons, {
      name: "Bounty Hunters",
      cardName: "Bounty Hunters",
      type: "ranged",
      variant: "neutral",
      attack: options.guardAttack ?? 5,
      defense: 0,
      maxHealth: 20,
      damage: 0,
      defenseToken: false,
      position: 5,
      abilities: options.preemptive ? ["bounty-hunter-preemptive"] : []
    });
    Object.assign(state.combat!.units.unit_p1_griffins, {
      type: options.attackerType ?? "ground",
      attack: 4,
      defense: 0,
      defenseToken: false,
      maxHealth: options.attackerHealth ?? 20,
      damage: 0,
      abilities: [],
      position: options.attackerPosition
    });
    // Park everyone else on the top row, far from BOTH the guard (pos 5) and a
    // ranged attacker (pos 17) — so a ranged attacker has no adjacent enemy that
    // would force it to shoot something nearer than the guard.
    const parkSpots: Record<string, number> = {
      unit_p1_crusaders: 8,
      unit_p1_marksmen: 11,
      unit_p2_vampires: 0,
      unit_p2_dread_knights: 3
    };
    for (const [id, pos] of Object.entries(parkSpots)) {
      state.combat!.units[id].position = pos;
    }
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0, 0, 0, 0, 0, 0, 0, 0]);
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

  it("retaliates BEFORE the attacker's blow — a lethal counter cancels the attack", () => {
    // A 1-HP melee attacker: the pre-emptive counter removes it before it can
    // strike (even the ranged-melee-penalised counter is ≥1), so the guard takes 0.
    const withAbility = underAttack({ preemptive: true, attackerPosition: 1, attackerHealth: 1, guardAttack: 5 });
    expect(
      withAbility.combat!.units.unit_p1_griffins.damage,
      "attacker felled by the pre-emptive shot"
    ).toBeGreaterThanOrEqual(withAbility.combat!.units.unit_p1_griffins.maxHealth);
    expect(withAbility.combat!.units.unit_p2_skeletons.damage, "guard took nothing — its counter fired first").toBe(0);
    expect(
      triggeredAbilities(withAbility, "bounty-hunter-preemptive").length,
      "the Preemptive Shot FX event fires"
    ).toBe(1);

    // CONTROL: without the ability the normal order applies — the attacker's blow
    // lands first (guard takes 4) and only then does the guard retaliate.
    const control = underAttack({ preemptive: false, attackerPosition: 1, attackerHealth: 1, guardAttack: 5 });
    expect(control.combat!.units.unit_p2_skeletons.damage, "bare guard takes the attacker's blow 4").toBe(4);
  });

  it("also retaliates against a NON-adjacent (ranged) attacker; a bare guard does not", () => {
    const withAbility = underAttack({
      preemptive: true,
      attackerPosition: 17,
      attackerType: "ranged",
      attackerHealth: 20,
      guardAttack: 5
    });
    expect(
      withAbility.combat!.units.unit_p1_griffins.damage,
      "the ranged attacker is shot back by the guard's counter"
    ).toBeGreaterThan(0);

    const control = underAttack({
      preemptive: false,
      attackerPosition: 17,
      attackerType: "ranged",
      attackerHealth: 20,
      guardAttack: 5
    });
    expect(control.combat!.units.unit_p1_griffins.damage, "a bare guard never retaliates against a shooter").toBe(0);
  });

  it("still only retaliates once — a second attack in the same round draws no counter", () => {
    // Fire one melee attack that the guard survives, then a second: the guard's
    // single retaliation was spent pre-emptively on the first.
    let state = createInitialGameState("bounty-once");
    Object.assign(state.combat!.units.unit_p2_skeletons, {
      name: "Bounty Hunters",
      type: "ranged",
      variant: "neutral",
      attack: 3,
      defense: 0,
      defenseToken: false,
      maxHealth: 30,
      damage: 0,
      position: 5,
      abilities: ["bounty-hunter-preemptive"]
    });
    Object.assign(state.combat!.units.unit_p1_griffins, { type: "ground", attack: 4, defense: 0, defenseToken: false, maxHealth: 30, damage: 0, abilities: [], position: 1 });
    Object.assign(state.combat!.units.unit_p1_crusaders, { type: "ground", attack: 4, defense: 0, defenseToken: false, maxHealth: 30, damage: 0, abilities: [], position: 6 });
    for (const id of ["unit_p1_marksmen", "unit_p2_vampires", "unit_p2_dread_knights"]) state.combat!.units[id].position = 19;
    state.combat!.units.unit_p2_dread_knights.position = 18;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, Array.from({ length: 12 }, () => 0));

    setActive(state, "p1", "unit_p1_griffins");
    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" }));
    const guardDamageAfterFirst = state.combat!.units.unit_p2_skeletons.damage;

    setActive(state, "p1", "unit_p1_crusaders");
    state = settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_crusaders", defenderId: "unit_p2_skeletons" }));
    // Second attacker takes no pre-emptive counter (retaliation already spent).
    expect(state.combat!.units.unit_p1_crusaders.damage, "no second retaliation this round").toBe(0);
    // Both attackers' blows landed on the guard (4 + 4 = 8, minus the first's pre-empt does not reduce damage dealt).
    expect(state.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(guardDamageAfterFirst);
  });
});
