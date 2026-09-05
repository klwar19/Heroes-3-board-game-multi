import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * USER RULE (2026-09-05) — "Death Stare must happen BEFORE the retaliation; if
 * the target dies, it does not retaliate; only then comes the retaliation roll."
 *
 * Printed card (`src/data/factions/units.ts`): the neutral Gorgons and the
 * Fortress Pack of Gorgons both read "[unit_attack] After the attack, roll 2
 * Attack dice. On two "-1" results, reduce the target's [health_points] to 0."
 * The engine models it as `DEATH_STARE_ON_DICE`, step 2 of the post-attack
 * follow-up table (`runPostAttackFollowUps`, reducer.ts) — and the parked
 * Retaliation Attack is declared only by `resumeAttackSequence` AFTER the whole
 * table has run. Two seams carry the rule and each is mutation-checked below:
 *
 *  - the ORDER of the table vs. `resumeAttackSequence` (the stare's dice and
 *    its petrification are logged before any retaliation event), and
 *  - `shouldRetaliate`'s `isUnitAlive(defender)` re-check, which is what makes
 *    a petrified Few/Neutral target stay silent.
 *
 * READING of the Pack case (test C): a Pack reduced to 0 Health does not leave
 * the board — `markUnitRemovedIfNeeded` flips it to its Few side, which is a
 * LIVING unit that has not retaliated yet. It therefore retaliates, and the
 * stare still reads first. That is the printed Pack→Few flip, not a widening.
 *
 * The Gorgon ability is put on the melee Crusaders so a real Retaliation Attack
 * is provoked (the shipped Gorgon fixtures in the other suites shoot at range,
 * where no retaliation exists at all).
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
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

/**
 * The p1 Crusaders (given the Gorgons' Death Stare) hit the adjacent p2
 * Skeletons in melee. `rolls` scripts the combat dice stream: the attack die
 * first, then the stare's two dice, then the retaliation's die.
 */
function stareMelee(options: {
  rolls: number[];
  /** "few" is really REMOVED by a landed stare; "pack" flips to its Few side. */
  variant: "few" | "pack";
  /** Give p1 the positive morale token so the stare opens its reroll window. */
  morale?: boolean;
  /** Ability tag under test (defaults to the neutral Gorgons' stare). */
  abilities?: string[];
}): GameState {
  const state = createInitialGameState("death-stare-before-retaliation");
  const attacker = state.combat!.units.unit_p1_crusaders;
  attacker.abilities = options.abilities ?? ["gorgon-death-stare"];
  attacker.attack = 1;
  attacker.position = 9;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 0;
  defender.attack = 3;
  defender.maxHealth = 20;
  defender.damage = 0;
  defender.variant = options.variant;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.morale = options.morale ? 1 : 0;
  state.players.p2.morale = 0;
  state.combat!.dice.scriptedRolls = options.rolls;
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_crusaders";
  return passAllReactions(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    })
  );
}

function indexOfEvent(state: GameState, match: (event: GameEvent) => boolean): number {
  return state.eventLog.findIndex(match);
}

const stareLanded = (event: GameEvent) =>
  event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "gorgon-death-stare";
const stareRolled = (event: GameEvent) =>
  event.type === "UNIT_ABILITY_TRIGGERED" &&
  (event.abilityId === "gorgon-death-stare" || event.abilityId === "gorgon-death-stare-roll");
const retaliationDeclared = (event: GameEvent) =>
  event.type === "UNIT_ATTACK_DECLARED" && event.isRetaliation;
const retaliationRolled = (event: GameEvent) =>
  event.type === "ATTACK_ROLLED" && event.isRetaliation;

/** Keep the newest candidate of the open ATTACK_DIE_REROLL window. */
function keepOpenRoll(state: GameState): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type, "an open reroll window").toBe("ATTACK_DIE_REROLL");
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    throw new Error("no reroll window");
  }
  return passAllReactions(
    applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: choice.playerId,
      choiceId: choice.id,
      candidateIndex: choice.candidates.length - 1
    })
  );
}

describe("Death Stare resolves BEFORE the parked Retaliation Attack", () => {
  it("A — a landed stare on a Few target removes it and NO retaliation happens", () => {
    // attack die 0, then the stare's two dice both "-1" (a landed stare).
    const state = stareMelee({ variant: "few", rolls: [0, -1, -1, 1, 1, 1] });

    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons"),
      "the petrified Few target leaves the board"
    ).toBe(true);
    // The observable rule: the dead defender never strikes back.
    expect(state.eventLog.some(retaliationDeclared)).toBe(false);
    expect(state.eventLog.some(retaliationRolled)).toBe(false);
    expect(state.combat!.units.unit_p1_crusaders.damage, "the attacker took no counter-blow").toBe(0);
    // And the stare really read before the activation moved on.
    expect(indexOfEvent(state, stareLanded)).toBeGreaterThan(0);
  });

  it("B — CONTROL: a MISSED stare lets the retaliation through, and reads first", () => {
    // Same setup, but the stare rolls "-1, +1" — no petrification.
    const state = stareMelee({ variant: "few", rolls: [0, -1, 1, 1, 1, 1] });

    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
    const stareAt = indexOfEvent(state, stareRolled);
    const retaliationAt = indexOfEvent(state, retaliationDeclared);
    expect(stareAt, "the stare's die read-out is logged").toBeGreaterThanOrEqual(0);
    expect(retaliationAt, "the surviving defender does strike back").toBeGreaterThanOrEqual(0);
    expect(stareAt, "the stare is logged BEFORE the retaliation").toBeLessThan(retaliationAt);
    expect(indexOfEvent(state, retaliationRolled)).toBeGreaterThan(stareAt);
    // The counter-blow really landed (attack 3 vs defense 0, die "+1").
    expect(state.combat!.units.unit_p1_crusaders.damage).toBeGreaterThan(0);
  });

  it("C — a landed stare on a PACK flips it to its Few side, which then retaliates", () => {
    const state = stareMelee({ variant: "pack", rolls: [0, -1, -1, 1, 1, 1] });

    const flipAt = indexOfEvent(
      state,
      (event) => event.type === "UNIT_FLIPPED" && event.unitId === "unit_p2_skeletons"
    );
    const stareAt = indexOfEvent(state, stareLanded);
    const retaliationAt = indexOfEvent(state, retaliationDeclared);
    expect(stareAt, "the stare landed").toBeGreaterThanOrEqual(0);
    expect(flipAt, "the Pack flipped instead of leaving the board").toBeGreaterThan(stareAt);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
    // The printed Pack→Few flip leaves a LIVING unit that has not retaliated.
    expect(retaliationAt, "the flipped Few side strikes back").toBeGreaterThan(flipAt);
    expect(state.combat!.units.unit_p2_skeletons.variant).toBe("few");
  });

  it("D — the stare's reroll window holds the retaliation, and a kept success cancels it", () => {
    // attack die 0 (kept), stare "-1, +1" (a miss), then the reroll lands "-1, -1".
    let state = stareMelee({ variant: "few", morale: true, rolls: [0, -1, 1, -1, -1, 1, 1] });
    // The attack die's own reroll window opens first (the morale token) — keep it.
    state = keepOpenRoll(state);

    const window = state.pendingChoice;
    expect(window?.type, "the stare's own reroll window is open").toBe("ATTACK_DIE_REROLL");
    if (window?.type !== "ATTACK_DIE_REROLL") {
      throw new Error("no stare window");
    }
    expect(window.abilityRoll?.kind).toBe("death-stare");
    // THE RULE: nothing of the retaliation has happened while the window waits.
    expect(state.eventLog.some(retaliationDeclared)).toBe(false);
    expect(state.eventLog.some(retaliationRolled)).toBe(false);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(0);

    const reroll = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .find((action) => action.type === "REROLL_PENDING_CHOICE");
    expect(reroll, "the morale token offers a reroll of the stare dice").toBeTruthy();
    state = passAllReactions(applyOk(state, reroll!));
    state = keepOpenRoll(state);

    // The rerolled stare landed after the window: still no retaliation at all.
    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
    expect(state.eventLog.some(retaliationDeclared)).toBe(false);
    expect(state.eventLog.some(retaliationRolled)).toBe(false);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(0);
  });

  it("CONTROL — a unit with no Death Stare is retaliated against immediately", () => {
    const state = stareMelee({ variant: "few", abilities: [], rolls: [0, 1, 1, 1] });

    expect(state.eventLog.some(stareRolled), "no stare was rolled at all").toBe(false);
    expect(state.eventLog.some(retaliationDeclared)).toBe(true);
    expect(state.combat!.units.unit_p1_crusaders.damage).toBeGreaterThan(0);
  });
});
