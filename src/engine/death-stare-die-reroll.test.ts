import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * USER RULE (2026-08-22) — "Death Stare: you should roll 2 SEPARATE dice. Then
 * after the roll you can reroll the 1st OR the second (not both) with e.g.
 * Morale. Only 1 artifact in the game lets you reroll both dice."
 *
 * Death Stare (`gorgon-death-stare`, `DEATH_STARE_ON_DICE` diceCount 2) rolls
 * its own two-die ability roll and opens an ATTACK_DIE_REROLL window carrying
 * `abilityRoll`. Before this rule a single reroll press RE-THREW BOTH dice, so
 * a lucky "-1" already showing was thrown away with the bad one.
 *
 * The artifact: **Diplomat's Ring** is the ONE card printed "Reroll any die OR
 * ANY ROLL" (base `src/data/cards/artifacts.ts` and its Community/Polish
 * reprint, which keeps that wording). Cards of Prophecy prints "Reroll any
 * die" and Ambassador's Sash "Reroll a die" — one die each. The engine marks
 * only the Ring `rerollsWholeRoll`.
 *
 * Every spec below is scripted so a whole-roll reroll and a single-die reroll
 * land on DIFFERENT faces and a DIFFERENT observable outcome (the target
 * petrified or not), so it fails if the one-die rule is removed.
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

/** Keep the latest candidate of the currently open ATTACK_DIE_REROLL window. */
function keepOpenRoll(state: GameState): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type, "an open reroll window").toBe("ATTACK_DIE_REROLL");
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    throw new Error("no reroll window");
  }
  return applyOk(state, {
    type: "CHOOSE_PENDING_ROLL",
    playerId: choice.playerId,
    choiceId: choice.id,
    candidateIndex: choice.candidates.length - 1
  });
}

function openAbilityWindow(state: GameState) {
  const choice = state.pendingChoice;
  expect(choice?.type, "an open reroll window").toBe("ATTACK_DIE_REROLL");
  if (choice?.type !== "ATTACK_DIE_REROLL") {
    throw new Error("no reroll window");
  }
  expect(choice.abilityRoll, "an ability-roll window").toBeTruthy();
  return choice;
}

/**
 * The p1 Marksmen shoot the p2 Skeletons (Few, so a petrified target is really
 * REMOVED) from range with scripted dice, pausing at each window.
 * `morale` gives p1 the positive morale token — an ORDINARY reroll source.
 */
function startStareDuel(options: {
  abilities?: string[];
  hand?: string[];
  morale?: boolean;
  rolls: number[];
}): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.abilities ?? ["gorgon-death-stare"];
  attacker.attack = 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;
  defender.variant = "few";
  state.players.p1.hand = options.hand ?? [];
  state.players.p2.hand = [];
  state.players.p1.morale = options.morale ? 1 : 0;
  state.combat!.dice.scriptedRolls = options.rolls;
  state.combat!.dice.rollCount = 0;
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

function petrified(state: GameState): boolean {
  return state.eventLog.some(
    (event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons"
  );
}

function rerollOffers(state: GameState) {
  return getLegalActions(state, "p1")
    .map((legal) => legal.action)
    .filter(
      (action): action is Extract<GameAction, { type: "REROLL_PENDING_CHOICE" }> =>
        action.type === "REROLL_PENDING_CHOICE" && action.useSetDie !== true
    );
}

// ---------------------------------------------------------------------------
// One ordinary reroll source rerolls ONE chosen Death Stare die
// ---------------------------------------------------------------------------

describe("Death Stare rolls two SEPARATE dice — an ordinary reroll takes one of them", () => {
  it("spending the Morale token on the 2nd die keeps the 1st and completes the kill", () => {
    // Scripted: attack +1, stare -1 / +1 (a miss), then -1, then +1.
    // Rerolling ONLY die 2 consumes one face (-1)  → [-1, -1] → petrified.
    // Rerolling BOTH (the old behaviour) would consume -1 AND +1 → [-1, +1]
    //   → still a miss and the target survives. The spec discriminates.
    let state = startStareDuel({ morale: true, rolls: [1, -1, 1, -1, 1] });

    state = keepOpenRoll(state); // the ATTACK die's own window
    const window = openAbilityWindow(state);
    expect(window.abilityRoll!.kind).toBe("death-stare");
    expect(window.candidates[0].rolls).toEqual([-1, 1]);

    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: window.id,
      dieIndex: 1
    });

    const rerolled = openAbilityWindow(state);
    const latest = rerolled.candidates.at(-1)!;
    // The UNTOUCHED first die is preserved verbatim; only die 2 moved.
    expect(latest.rolls[0]).toBe(-1);
    expect(latest.rolls).toEqual([-1, -1]);

    state = keepOpenRoll(state);
    expect(petrified(state)).toBe(true);
    // The token really was spent (one use, once).
    expect(state.players.p1.morale).toBe(0);
  });

  it("spending it on the 1st die instead keeps the 2nd — the player picks which", () => {
    // Same scene, the other pick: reroll die 1 (the -1) → it takes the next
    // scripted face 0, and die 2's "+1" is preserved untouched.
    let state = startStareDuel({ morale: true, rolls: [1, -1, 1, 0, -1] });

    state = keepOpenRoll(state);
    const window = openAbilityWindow(state);
    expect(window.candidates[0].rolls).toEqual([-1, 1]);

    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: window.id,
      dieIndex: 0
    });

    const latest = openAbilityWindow(state).candidates.at(-1)!;
    expect(latest.rolls).toEqual([0, 1]);
    // The second die is the SAME face it showed before the reroll.
    expect(latest.rolls[1]).toBe(1);

    state = keepOpenRoll(state);
    expect(petrified(state)).toBe(false);
  });

  it("offers one button PER DIE, and the token is a ONE-shot (budget still holds)", () => {
    let state = startStareDuel({ morale: true, rolls: [1, -1, 1, 1, 1] });
    state = keepOpenRoll(state);
    const window = openAbilityWindow(state);

    const offers = rerollOffers(state);
    expect(offers).toHaveLength(2);
    expect(new Set(offers.map((offer) => offer.dieIndex))).toEqual(new Set([0, 1]));
    // The die OUTSIDE the success window (the "+1") is offered first — the
    // face an AFK/AI seat takes.
    expect(offers[0].dieIndex).toBe(1);

    state = applyOk(state, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: window.id,
      dieIndex: 1
    });
    // One token = one reroll: the window offers no further reroll.
    const after = openAbilityWindow(state);
    expect(after.remainingRerolls).toBe(0);
    expect(rerollOffers(state)).toHaveLength(0);
  });

  it("an AFK / AI seat taking the FIRST offered reroll rerolls the die outside the window", () => {
    // The AFK driver and the AI both dispatch an OFFERED action, and the first
    // offer is the out-of-window die — so the "-1" is preserved and the stare
    // lands. (A both-dice throw on this script would miss.)
    let state = startStareDuel({ morale: true, rolls: [1, -1, 1, -1, 1] });
    state = keepOpenRoll(state);
    openAbilityWindow(state);

    state = applyOk(state, rerollOffers(state)[0]);

    expect(openAbilityWindow(state).candidates.at(-1)!.rolls).toEqual([-1, -1]);
    state = keepOpenRoll(state);
    expect(petrified(state)).toBe(true);
  });

  it("a reroll frame with NO die pick (or an out-of-range one) is REFUSED, never a both-dice throw", () => {
    // Fail-closed: `assertLegal` matches the offered frame exactly, so an
    // older client's dieIndex-less press is rejected (the out-of-date banner)
    // instead of silently re-throwing both dice like the old rule.
    const state = startStareDuel({ morale: true, rolls: [1, -1, 1, -1, 1] });
    const opened = keepOpenRoll(state);
    const window = openAbilityWindow(opened);

    for (const action of [
      { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: window.id } as GameAction,
      { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: window.id, dieIndex: 9 } as GameAction
    ]) {
      const result = applyAction(opened, action);
      expect(result.errors.map((error) => error.code)).toEqual(["ACTION_NOT_LEGAL"]);
      // The window is untouched — still one candidate, the token unspent.
      expect(result.state.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
      expect(result.state.players.p1.morale).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// CONTROL: the ONE both-dice artifact, and the single-die abilities
// ---------------------------------------------------------------------------

describe("CONTROL — Diplomat's Ring is the only source that rerolls BOTH dice", () => {
  it("its one reroll re-throws the whole roll, on the same script the token could not", () => {
    // The token spec's script: rerolling ONE die gives [-1, -1]; the Ring
    // consumes BOTH faces (-1 then +1) → [-1, +1], a different roll entirely.
    let state = startStareDuel({ hand: ["artifact.diplomats_ring"], rolls: [1, -1, 1, -1, 1] });

    state = keepOpenRoll(state);
    const window = openAbilityWindow(state);
    expect(window.candidates[0].rolls).toEqual([-1, 1]);

    // ONE whole-roll button — never a per-die pick.
    const offers = rerollOffers(state);
    expect(offers).toHaveLength(1);
    expect(offers[0].dieIndex).toBeUndefined();

    state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: window.id });
    const latest = openAbilityWindow(state).candidates.at(-1)!;
    expect(latest.rolls).toEqual([-1, 1]);
    // Both dice really were re-thrown: the stream advanced by TWO faces.
    expect(state.combat!.dice.rollCount).toBe(5);
    expect(state.players.p1.discard).toContain("artifact.diplomats_ring");
  });

  it("the Ring re-throws both into a kill where a one-die reroll could not", () => {
    // Scripted so ONLY a both-dice throw can land the stare: die 1 must move
    // off "+1" and die 2 off "+1" too.
    let state = startStareDuel({ hand: ["artifact.diplomats_ring"], rolls: [1, 1, 1, -1, -1] });
    state = keepOpenRoll(state);
    const window = openAbilityWindow(state);
    expect(window.candidates[0].rolls).toEqual([1, 1]);

    state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: window.id });
    expect(openAbilityWindow(state).candidates.at(-1)!.rolls).toEqual([-1, -1]);
    state = keepOpenRoll(state);
    expect(petrified(state)).toBe(true);
  });

  it("Ambassador's Sash and Cards of Prophecy print ONE die — they take a per-die pick", () => {
    for (const cardId of ["artifact.ambassadors_sash", "artifact.cards_of_prophecy"]) {
      let state = startStareDuel({ hand: [cardId], rolls: [1, -1, 1, -1, 1] });
      state = keepOpenRoll(state);
      const window = openAbilityWindow(state);

      const offers = rerollOffers(state);
      expect(offers, `${cardId} should offer a per-die pick`).toHaveLength(2);

      state = applyOk(state, {
        type: "REROLL_PENDING_CHOICE",
        playerId: "p1",
        choiceId: window.id,
        dieIndex: 1
      });
      expect(openAbilityWindow(state).candidates.at(-1)!.rolls, cardId).toEqual([-1, -1]);
      state = keepOpenRoll(state);
      expect(petrified(state), cardId).toBe(true);
    }
  });

  it("a SINGLE-die ability roll keeps the plain one-button reroll (Thunderbird die)", () => {
    // thunderbirds-lightning rolls ONE die: no per-die pick exists, and the
    // plain press re-throws it exactly as before.
    let state = startStareDuel({
      abilities: ["thunderbirds-lightning"],
      morale: true,
      rolls: [1, -1, 0]
    });
    state = keepOpenRoll(state); // the attack window
    const window = openAbilityWindow(state);
    expect(window.abilityRoll!.diceCount).toBe(1);
    expect(window.candidates[0].rolls).toEqual([-1]);

    const offers = rerollOffers(state);
    expect(offers).toHaveLength(1);
    expect(offers[0].dieIndex).toBeUndefined();

    state = applyOk(state, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: window.id });
    expect(openAbilityWindow(state).candidates.at(-1)!.rolls).toEqual([0]);
  });

  it("CONTROL: the ATTACK die's own window is untouched — no per-die offers there", () => {
    const state = startStareDuel({ morale: true, rolls: [0, -1, 1] });
    const attackWindow = state.pendingChoice;
    expect(attackWindow?.type).toBe("ATTACK_DIE_REROLL");
    expect(attackWindow?.type === "ATTACK_DIE_REROLL" && attackWindow.abilityRoll).toBeFalsy();
    const offers = rerollOffers(state);
    expect(offers).toHaveLength(1);
    expect(offers[0].dieIndex).toBeUndefined();
  });
});
