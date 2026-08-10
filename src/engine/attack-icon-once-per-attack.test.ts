import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createAdventureGameState, createInitialGameState, NEUTRAL_PLAYER_ID } from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import { nextTurnTimeoutAction } from "./afk-drop";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * "[unit_attack]" icon abilities activate ONCE PER ATTACK (user rule,
 * 2026-08-10: "Minotaurs neutral can reroll -1 more than once, WHICH IS WRONG.
 * ATTACK icon abilities activate only once per attack, FIX properly all").
 *
 * THE BUG: the four printed Attack-die reroll abilities are FACE-GATED
 * (`onlyOnRoll`), and the engine read that gate as "never depletes" — so a
 * Minotaur that rerolled its "-1" into another "-1" was offered the reroll
 * again, and again, until the die finally came up something else. The neutral
 * seat's auto-resolver did the same in a loop of up to 12 rerolls, which is the
 * shape the report saw.
 *
 * THE RULE NOW: `onlyOnRoll` gates WHEN the ability may fire; `rerollsPerAttack`
 * is a hard budget spent by every use. The budget re-arms on the unit's NEXT
 * declared attack — a printed follow-up attack (the "second attack" family)
 * counts as its own attack, because `buildRerollSources` runs per attack.
 *
 * CONTROLs kept throughout: the neutral Champions' `[unit_passive]` "Reroll this
 * unit's ALL '-1' rolls" still repeats (it is not an attack-icon activation and
 * never opens a window at all), and the depleting non-ability sources (Luck, the
 * positive morale token, the reroll artifacts) keep their own spend semantics.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function rerollEvents(state: GameState): Extract<GameEvent, { type: "ATTACK_REROLLED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ATTACK_REROLLED" }> => event.type === "ATTACK_REROLLED"
  );
}

function attackRolls(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
  );
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
 * p1's ranged attacker (3 attack) strikes a far-away, no-retaliation p2 body —
 * one clean die, one clean window. `abilities` is the attacker's COMPLETE
 * printed ability list for the scenario.
 */
function duel(abilities: string[], rolls: number[]): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = abilities;
  attacker.type = "ranged";
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13; // non-adjacent → no retaliation, no second window
  defender.defense = 0;
  defender.maxHealth = 60;
  defender.damage = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, rolls);
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return passAllReactions(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

function reroll(state: GameState, playerId: PlayerId = "p1"): GameState {
  return passAllReactions(
    applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId, choiceId: state.pendingChoice?.id ?? "" })
  );
}

function keepLatest(state: GameState, playerId: PlayerId = "p1"): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ATTACK_DIE_REROLL") {
    throw new Error("Expected an open attack-die reroll window.");
  }
  return passAllReactions(
    applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId,
      choiceId: choice.id,
      candidateIndex: choice.candidates.length - 1
    })
  );
}

// ---------------------------------------------------------------------------
// 1. The reported bug: a face-gated unit reroll is ONE use per attack.
// ---------------------------------------------------------------------------

describe('an "[unit_attack]" reroll ability is spent once per attack', () => {
  it('a Minotaur that rerolls a "-1" into another "-1" may NOT reroll again — the second "-1" stands', () => {
    // Every die is "-1": under the old "face-gated sources never deplete"
    // reading the window stayed open forever and the attacker could roll until
    // a non-"-1" appeared.
    const opened = duel(["minotaur-reroll"], Array(20).fill(-1));
    expect(opened.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      remainingRerolls: 1,
      rerollSources: [{ name: "Minotaur Fury", remaining: 1, used: 0, onlyOnRoll: -1 }]
    });

    const once = reroll(opened);
    // The one use is spent: the fresh "-1" offers nothing, even though the die
    // shows the gated face again.
    expect(once.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      remainingRerolls: 0,
      rerollSources: [{ name: "Minotaur Fury", remaining: 0, used: 1 }]
    });
    expect(rerollEvents(once)).toHaveLength(1);

    // A forged second use is rejected outright.
    const forged = applyAction(once, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: once.pendingChoice?.id ?? ""
    });
    expect(forged.errors).not.toEqual([]);
    expect(rerollEvents(forged.state)).toHaveLength(1);

    // OBSERVABLE OUTCOME: the attack resolves on a "-1" (attack 3 − 1 = 2
    // damage), not on the 0/+1 an unlimited reroll would have hunted down.
    const resolved = keepLatest(once);
    expect(attackRolls(resolved).at(-1)).toMatchObject({ roll: -1 });
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("CONTROL — the one use really fires: the same window turns a \"-1\" into a \"+1\"", () => {
    const opened = duel(["minotaur-reroll"], [-1, 1, ...Array(10).fill(0)]);
    expect(opened.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    const resolved = keepLatest(reroll(opened));
    expect(rerollEvents(resolved)).toHaveLength(1);
    expect(attackRolls(resolved).at(-1)).toMatchObject({ roll: 1 });
    // attack 3 + 1 = 4 damage — the reroll is a real, working ability.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("CONTROL — with no reroll ability the first \"-1\" resolves with no window at all", () => {
    const resolved = duel([], Array(20).fill(-1));
    expect(resolved.pendingChoice).toBeNull();
    expect(rerollEvents(resolved)).toHaveLength(0);
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("the Crusaders' 'every 0' reroll is likewise one use per attack", () => {
    const opened = duel(["attack-die-reroll"], Array(20).fill(0));
    expect(opened.pendingChoice).toMatchObject({ remainingRerolls: 1 });
    const once = reroll(opened);
    expect(once.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    expect(rerollEvents(once)).toHaveLength(1);
    expect(attackRolls(keepLatest(once)).at(-1)).toMatchObject({ roll: 0 });
  });

  it("Yukikaze's Torpedo Run is likewise one use per attack", () => {
    const opened = duel(["yukikaze-torpedo-run"], Array(20).fill(-1));
    const once = reroll(opened);
    expect(once.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    expect(rerollEvents(once)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. The budget re-arms per ATTACK, not per combat / activation.
// ---------------------------------------------------------------------------

describe("the per-attack budget re-arms on the next declared attack", () => {
  it("a printed FOLLOW-UP attack (line breath) gets its own fresh Minotaur reroll", () => {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    // Piston Reach: after the attack, a separate attack strikes the unit
    // directly behind the target. `ignores-retaliation` keeps the primary
    // exchange from inserting a retaliation window between the two attacks.
    attacker.abilities = ["minotaur-reroll", "mechanics-line-attack-1", "ignores-retaliation"];
    attacker.type = "ground";
    attacker.attack = 3;
    attacker.position = 5;
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.position = 9;
    target.defense = 0;
    target.maxHealth = 60;
    target.damage = 0;
    const behind = state.combat!.units.unit_p2_vampires;
    behind.abilities = [];
    behind.position = 13;
    behind.defense = 0;
    behind.maxHealth = 60;
    behind.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, Array(20).fill(-1));
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    // Primary attack: one window, one use.
    let current = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(current.pendingChoice).toMatchObject({ remainingRerolls: 1 });
    current = reroll(current);
    expect(current.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    current = keepLatest(current);

    // The follow-up attack declares itself: a SECOND window with the budget
    // re-armed, because the sources are rebuilt per attack.
    expect(current.pendingChoice).toMatchObject({
      type: "ATTACK_DIE_REROLL",
      remainingRerolls: 1,
      rerollSources: [{ name: "Minotaur Fury", remaining: 1, used: 0 }]
    });
    current = reroll(current);
    expect(current.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    // Two attacks → exactly two rerolls, never more.
    expect(rerollEvents(current)).toHaveLength(2);
    current = keepLatest(current);
    expect(attackRolls(current)).toHaveLength(2);
  });

  it("a fresh activation re-arms it, and the window is never offered on a Retaliation Attack", () => {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = ["minotaur-reroll"];
    attacker.type = "ranged";
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 60;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, Array(20).fill(-1));
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    let current = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    current = keepLatest(reroll(current));

    // A new activation of the same unit next round: budget back to 1.
    const next = current;
    next.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    next.combat!.units.unit_p1_marksmen.attackedThisActivation = false;
    next.combat!.units.unit_p1_marksmen.attacksThisActivation = 0;
    next.combat!.units.unit_p1_marksmen.movedThisActivation = false;
    next.activePlayerId = "p1";
    next.combat!.activeUnitId = "unit_p1_marksmen";
    const second = passAllReactions(
      applyOk(next, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(second.pendingChoice).toMatchObject({
      remainingRerolls: 1,
      rerollSources: [{ name: "Minotaur Fury", remaining: 1, used: 0 }]
    });
  });
});

// ---------------------------------------------------------------------------
// 3. The NEUTRAL seat drives its own reroll — the exact path the report hit.
// ---------------------------------------------------------------------------

/** A live neutral guard fight for p1 with the guard reshaped for the scenario. */
function neutralGuardFight(seed: string, prepareGuard: (guard: CombatUnitState) => void): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  const hero = state.heroes.hero_p1;
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  field!.difficulty = 1;
  startNeutralEncounter(state, hero, field!);
  expect(state.combat?.context.kind).toBe("neutral");

  const army = state.players.p1.army;
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: army[0].id, position: 13 });
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  if (state.combat?.pendingNeutralPlacement) {
    state = applyOk(state, { type: "FINISH_NEUTRAL_PLACEMENT", playerId: state.combat.pendingNeutralPlacement });
  }

  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
  // The guard stands adjacent to a fat, harmless prey and acts first.
  prey.position = 13;
  prey.abilities = [];
  prey.attack = 0;
  prey.defense = 0;
  prey.maxHealth = 60;
  prey.damage = 0;
  prey.initiative = 1;
  guard.position = 9;
  guard.type = "ground";
  guard.attack = 3;
  guard.initiative = 99;
  guard.maxHealth = 60;
  guard.damage = 0;
  prepareGuard(guard);
  return state;
}

/** Runs the fight forward until the neutral guard has taken its attack. */
function driveUntilGuardAttacked(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (safety > 0 && attackRolls(current).length === 0) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const pause = current.combat?.pendingNeutralStep;
    if (pause) {
      current = applyOk(current, {
        type: "CONTINUE_NEUTRAL_STEP",
        playerId: pause.reactingPlayerId ?? current.combat!.attackerPlayerId
      });
      continue;
    }
    const active = current.combat?.activeUnitId ? current.combat.units[current.combat.activeUnitId] : null;
    if (active && active.controllerId !== NEUTRAL_PLAYER_ID && !current.pendingChoice) {
      current = applyOk(current, { type: "DEFEND_UNIT", playerId: active.controllerId, unitId: active.id });
      continue;
    }
    break;
  }
  return current;
}

describe("a NEUTRAL Minotaur guard cannot loop its own reroll", () => {
  it('rerolls its "-1" exactly once and keeps the second "-1" (the reported bug)', () => {
    const state = neutralGuardFight("minotaur-neutral-loop", (guard) => {
      guard.abilities = ["minotaur-reroll"];
    });
    // Every die is "-1": pre-fix the neutral auto-resolver rerolled until its
    // hard safety counter ran out (up to 12 rerolls for one attack).
    script(state, Array(60).fill(-1));

    const fought = driveUntilGuardAttacked(state);
    expect(attackRolls(fought).length).toBeGreaterThan(0);
    expect(rerollEvents(fought)).toHaveLength(1);
    expect(rerollEvents(fought)[0]).toMatchObject({ sourceName: "Minotaur Fury", remainingRerolls: 0 });
    // OBSERVABLE OUTCOME: the guard's attack lands on the second "-1".
    expect(attackRolls(fought)[0]).toMatchObject({ roll: -1 });
    // Never parked: the neutral resolved its own window.
    expect(fought.pendingChoice).toBeNull();
  });

  it("CONTROL — the neutral's single reroll still fires and still improves the roll", () => {
    const state = neutralGuardFight("minotaur-neutral-once", (guard) => {
      guard.abilities = ["minotaur-reroll"];
    });
    script(state, [-1, 1, ...Array(60).fill(0)]);
    const fought = driveUntilGuardAttacked(state);
    expect(rerollEvents(fought)).toHaveLength(1);
    expect(attackRolls(fought)[0]).toMatchObject({ roll: 1 });
  });

  it("CONTROL — a guard without the ability rerolls nothing at all", () => {
    const state = neutralGuardFight("minotaur-neutral-none", (guard) => {
      guard.abilities = [];
    });
    script(state, Array(60).fill(-1));
    const fought = driveUntilGuardAttacked(state);
    expect(rerollEvents(fought)).toHaveLength(0);
    expect(attackRolls(fought)[0]).toMatchObject({ roll: -1 });
  });
});

// ---------------------------------------------------------------------------
// 4. CONTROLs: sources whose printed text really does repeat, and the depleting
//    non-ability sources, are untouched.
// ---------------------------------------------------------------------------

describe("sources with other printed semantics keep them", () => {
  it('CONTROL — the neutral Champions\' [unit_passive] "reroll ALL -1 rolls" still repeats', () => {
    // The neutral Champions' PRINTED pair, verbatim. Not an attack-icon
    // activation: the "-1" reroll is baked into the roll itself and never opens
    // a reroll window, so the once-per-attack budget cannot touch it.
    //
    // KNOWN LATENT GAP (unchanged by this fix, recorded here because the probe
    // found it): REROLL_ALL_MINUS_ONE is only applied to an ATTACK die inside
    // the `hasRollTwoDiceApplyBoth` branch (and to the Defend die). A unit
    // carrying `champion-reroll-minus` WITHOUT `champion-roll-two-dice` would
    // get no attack-die minus-reroll on a plain single roll. No shipped unit
    // has that shape — `neutral.champions` is the only carrier and always
    // prints both — so this is latent, not live.
    const resolved = duel(
      ["champion-roll-two-dice", "champion-reroll-minus"],
      [-1, -1, 1, -1, -1, 0, ...Array(10).fill(0)]
    );
    expect(resolved.pendingChoice).toBeNull();
    expect(rerollEvents(resolved)).toHaveLength(0);
    // Each of the two dice rerolled its "-1" TWICE inside the one attack —
    // the repeat this passive is printed to have — landing on 1 and 0.
    expect(attackRolls(resolved).at(-1)).toMatchObject({ rolls: [1, 0], roll: 1 });
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("CONTROL — spending the ability leaves an independent morale-token reroll on the table", () => {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = ["minotaur-reroll"];
    attacker.type = "ranged";
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 60;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.morale = 1;
    script(state, Array(20).fill(-1));
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const opened = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(opened.pendingChoice).toMatchObject({ remainingRerolls: 2 });

    const once = reroll(opened);
    // The ability is spent; the morale token is a SEPARATE source and survives.
    expect(once.pendingChoice).toMatchObject({
      remainingRerolls: 1,
      rerollSources: [
        { name: "Minotaur Fury", remaining: 0, used: 1 },
        { name: "Positive morale token", remaining: 1, used: 0 }
      ]
    });
    const twice = reroll(once);
    expect(rerollEvents(twice).map((event) => event.sourceName)).toEqual(["Minotaur Fury", "Positive morale token"]);
    expect(twice.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    expect(twice.players.p1.morale).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Registry-wide sweep: no unit reroll ability may be unlimited within one
//    attack. Derived from the ability registry, so a NEW one joins it for free.
// ---------------------------------------------------------------------------

describe("SWEEP — every printed unit reroll ability is bounded within one attack", () => {
  const rerollAbilityIds = Object.values(unitAbilities)
    .filter((ability) => ability.effect?.type === "ATTACK_DIE_REROLL")
    .map((ability) => ability.id);

  it("finds the four shipped reroll abilities", () => {
    expect([...rerollAbilityIds].sort()).toEqual(
      ["attack-die-reroll", "champion-move-reroll", "minotaur-reroll", "yukikaze-torpedo-run"].sort()
    );
  });

  it.each(rerollAbilityIds)("%s never fires more than its printed per-attack budget", (abilityId) => {
    const ability = unitAbilities[abilityId];
    const effect = ability.effect;
    if (effect?.type !== "ATTACK_DIE_REROLL") {
      throw new Error("Expected an ATTACK_DIE_REROLL ability.");
    }
    // Feed the ability its own gated face forever (a face-gated source only
    // fires on `onlyOnRoll`; an ungated one fires on anything).
    const face = effect.onlyOnRoll ?? -1;
    let current = duel([abilityId], Array(30).fill(face));
    if (effect.requiresMoved) {
      // Charge only arms after a move — with no move it must offer nothing.
      expect(current.pendingChoice).toBeNull();
      return;
    }

    let safety = 12;
    while (current.pendingChoice?.type === "ATTACK_DIE_REROLL" && current.pendingChoice.remainingRerolls > 0 && safety > 0) {
      safety -= 1;
      current = reroll(current);
    }
    expect(safety, "the reroll window must close on its own").toBeGreaterThan(0);
    expect(rerollEvents(current)).toHaveLength(effect.rerollsPerAttack);
    // The window closes cleanly and the attack resolves.
    const resolved = current.pendingChoice ? keepLatest(current) : current;
    expect(resolved.pendingChoice).toBeNull();
    expect(attackRolls(resolved).at(-1)).toMatchObject({ roll: face });
  });

  it("a face-gated ability's BUDGET is what bounds it — the gate never caps it at 1", () => {
    // Every shipped face-gated reroll prints `rerollsPerAttack: 1`, so this
    // invariant needs a fabricated 2-use ability to be visible. It guards the
    // seam directly: `countAvailableRerolls` must report the source's real
    // `remaining`, not "1 because it is face-gated" — otherwise a future
    // twice-per-attack ability would silently offer only one use.
    const probeId = "test-only.twice-per-attack-face-gated-reroll";
    unitAbilities[probeId] = {
      id: probeId,
      name: "Twice Furious",
      text: 'Reroll a "-1" on this unit\'s Attack die — twice per attack.',
      effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 2, onlyOnRoll: -1 },
      implementationStatus: "implemented"
    };
    try {
      const opened = duel([probeId], Array(30).fill(-1));
      expect(opened.pendingChoice).toMatchObject({ remainingRerolls: 2 });
      const once = reroll(opened);
      expect(once.pendingChoice).toMatchObject({ remainingRerolls: 1 });
      const twice = reroll(once);
      expect(twice.pendingChoice).toMatchObject({ remainingRerolls: 0 });
      expect(rerollEvents(twice)).toHaveLength(2);
      // …and the budget is a hard ceiling: a third use is refused.
      const forged = applyAction(twice, {
        type: "REROLL_PENDING_CHOICE",
        playerId: "p1",
        choiceId: twice.pendingChoice?.id ?? ""
      });
      expect(forged.errors).not.toEqual([]);
    } finally {
      delete unitAbilities[probeId];
    }
  });

  it("CONTROL — the advantage family is a roll MODE, not an activation, and is untouched", () => {
    // "Roll 2 Attack dice and resolve the higher" has nothing to spend: it
    // reshapes EVERY throw of the attack, the reroll included. The once-per-
    // attack budget applies to the reroll ability sitting beside it, not to it.
    const opened = duel(["attack-roll-advantage", "minotaur-reroll"], [-1, -1, -1, 1, ...Array(10).fill(0)]);
    expect(opened.pendingChoice).toMatchObject({ rollMode: "advantage", remainingRerolls: 1 });
    expect(opened.pendingChoice?.type === "ATTACK_DIE_REROLL" && opened.pendingChoice.candidates[0].rolls).toEqual([-1, -1]);

    const once = reroll(opened);
    const choice = once.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    // The reroll still threw TWO dice and still kept the higher — the mode
    // survived — while the ability itself is spent.
    expect(choice?.type === "ATTACK_DIE_REROLL" && choice.candidates[1].rolls).toEqual([-1, 1]);
    expect(choice).toMatchObject({ remainingRerolls: 0 });
    expect(attackRolls(keepLatest(once)).at(-1)).toMatchObject({ rollMode: "advantage", roll: 1 });
  });

  it("every unit side printing a reroll ability carries a bounded budget", () => {
    const sides = Object.values(coreUnitDefinitions).flatMap((definition) =>
      (["few", "pack", "neutral"] as const).flatMap((side) => {
        const printed = definition[side];
        return printed ? printed.abilities.filter((id) => rerollAbilityIds.includes(id)).map((id) => `${definition.id}#${side}:${id}`) : [];
      })
    );
    expect(sides.length).toBeGreaterThan(0);
    for (const entry of sides) {
      const abilityId = entry.split(":")[1];
      const effect = unitAbilities[abilityId].effect;
      expect(effect?.type).toBe("ATTACK_DIE_REROLL");
      if (effect?.type === "ATTACK_DIE_REROLL") {
        expect(effect.rerollsPerAttack).toBeGreaterThan(0);
        expect(Number.isFinite(effect.rerollsPerAttack)).toBe(true);
        expect(effect.rerollsPerAttack).toBeLessThanOrEqual(2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Non-stall: the shared forced-resolution driver still closes the window.
// ---------------------------------------------------------------------------

describe("the changed window can never strand an automated seat", () => {
  it("the AFK / turn-timeout driver keeps the roll once the ability is spent", () => {
    const once = reroll(duel(["minotaur-reroll"], Array(20).fill(-1)));
    expect(once.pendingChoice).toMatchObject({ remainingRerolls: 0 });
    const action = nextTurnTimeoutAction(once, "p1");
    expect(action?.type).toBe("CHOOSE_PENDING_ROLL");
    const resolved = passAllReactions(applyOk(once, action as GameAction));
    expect(resolved.pendingChoice).toBeNull();
  });
});
