import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, NEUTRAL_PLAYER_ID } from "./index";
import { chooseComputerAction } from "./computer/policy";
import { observeForComputer } from "./computer/observation";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Bowstring of the Unicorn's Mane (option A) inside an ADVENTURE combat — the
 * reported bug: "no instant window show to use it before a unit move". The
 * standalone-combat coverage (unicorn-artifacts.test.ts) never runs the
 * adventure pump; here the pump either parked its pacing pause first (the
 * pre-activation window then refused to open over it) or ran the guard's whole
 * activation, so the window never surfaced before a Neutral guard acted. The
 * pump now offers the window once per activation, before the pacing pause.
 *
 * Board: p1 (Castle) fights the level-I mine guard at (9,1) with Halberdiers
 * (act first) and Marksmen (ranged, act last); the guard sits between them in
 * initiative, so its activation comes up right after the Halberdiers.
 */

const BOWSTRING = "artifact.bowstring_of_the_unicorns_mane";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

type Fight = { state: GameState; guard: UnitId; halberdiers: UnitId; marksmen: UnitId };

function neutralFight(): Fight {
  let state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  const [halberdierArmy, marksmenArmy] = state.players.p1.army;
  expect(halberdierArmy.unitDefId).toBe("castle.halberdiers");
  expect(marksmenArmy.unitDefId).toBe("castle.marksmen");
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: halberdierArmy.id, position: 13 });
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: marksmenArmy.id, position: 14 });
  const halberdiers = Object.values(state.combat!.units).find((unit) => unit.unitDefId === "castle.halberdiers")!;
  const marksmen = Object.values(state.combat!.units).find((unit) => unit.unitDefId === "castle.marksmen")!;
  halberdiers.initiative = 99;
  marksmen.initiative = 2;
  // Nothing to interject with at the Halberdiers' own activation.
  state.players.p1.hand = [];
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  guard.initiative = 50;
  expect(state.combat!.activeUnitId).toBe(halberdiers.id);
  expect(state.reactionWindow).toBeNull();
  return { state, guard: guard.id, halberdiers: halberdiers.id, marksmen: marksmen.id };
}

/** The Halberdiers defend, so the guard's activation comes up next. */
function toGuardActivation(fight: Fight, hand: string[]): GameState {
  fight.state.players.p1.hand = [...hand];
  return applyOk(fight.state, { type: "DEFEND_UNIT", playerId: "p1", unitId: fight.halberdiers });
}

function bowstringPlay(state: GameState, targetUnitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === BOWSTRING &&
      legal.action.optionIndex === 0 &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === targetUnitId
  );
}

function guardHasAttacked(state: GameState, guard: UnitId): boolean {
  return state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === guard);
}

/** Pass every open window / resolve rerolls until combat is idle again. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
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
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

describe("Bowstring of the Unicorn's Mane — pre-activation window in an adventure (Neutral) combat", () => {
  it("opens BEFORE the guard acts — ahead of the pacing pause — and offers your fresh ranged unit", () => {
    const fight = neutralFight();
    const state = toGuardActivation(fight, [BOWSTRING]);

    expect(state.combat!.activeUnitId).toBe(fight.guard);
    const opened = state.reactionWindow;
    expect(opened, "the pre-activation window is open before the guard moves").toBeTruthy();
    expect(opened!.triggerEvent).toMatchObject({ type: "UNIT_ACTIVATION_STARTED", unitId: fight.guard });
    expect(opened!.priorityPlayerId).toBe("p1");
    // The window comes first: no pacing pause parked, and the guard has not acted.
    expect(state.combat!.pendingNeutralStep ?? null).toBeNull();
    expect(state.combat!.units[fight.guard].activatedThisRound).toBe(false);
    expect(guardHasAttacked(state, fight.guard)).toBe(false);
    expect(bowstringPlay(state, fight.marksmen), "the Marksmen are the Bowstring target").toBeTruthy();
  });

  it("playing it activates the ranged unit now; the interrupted guard acts afterwards", () => {
    const fight = neutralFight();
    let state = toGuardActivation(fight, [BOWSTRING]);
    state = applyOk(state, bowstringPlay(state, fight.marksmen)!.action);

    // The Marksmen take the out-of-order activation; the guard is not consumed.
    expect(state.combat!.activeUnitId).toBe(fight.marksmen);
    expect(state.players.p1.hand).not.toContain(BOWSTRING);
    expect(state.reactionWindow, "no re-prompt right after the use").toBeNull();
    expect(state.combat!.units[fight.guard].activatedThisRound).toBe(false);
    expect(guardHasAttacked(state, fight.guard)).toBe(false);

    // The Marksmen end their turn: the interrupted guard resumes (pacing pause
    // first, as before) and then acts — no unit activated twice.
    state = settle(applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: fight.marksmen }));
    expect(state.combat!.units[fight.marksmen].activatedThisRound).toBe(true);
    expect(state.combat!.activeUnitId).toBe(fight.guard);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    state = settle(applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" }));
    expect(guardHasAttacked(state, fight.guard), "the guard acts after the Marksmen").toBe(true);
  });

  it("passing continues normally: the pacing pause follows, and the window is offered once per activation", () => {
    const fight = neutralFight();
    let state = toGuardActivation(fight, [BOWSTRING]);
    expect(state.reactionWindow).toBeTruthy();
    state = applyOk(state, { type: "PASS_REACTION", playerId: "p1" });

    // Still the guard's activation: the ordinary pause opens, the window does
    // not re-open although the Bowstring and the fresh Marksmen remain.
    expect(state.reactionWindow).toBeNull();
    expect(state.combat!.activeUnitId).toBe(fight.guard);
    expect(state.combat!.pendingNeutralStep).toMatchObject({ kind: "pre-activation", unitId: fight.guard });
    expect(state.players.p1.hand).toContain(BOWSTRING);

    state = settle(applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" }));
    expect(guardHasAttacked(state, fight.guard)).toBe(true);
    expect(state.players.p1.hand, "the passed Bowstring is never spent").toContain(BOWSTRING);
  });

  it("CONTROL: with no fresh ranged unit the guard gets only the pacing pause", () => {
    const fight = neutralFight();
    fight.state.combat!.units[fight.marksmen].activatedThisRound = true;
    const state = toGuardActivation(fight, [BOWSTRING]);
    expect(state.reactionWindow).toBeNull();
    expect(state.combat!.pendingNeutralStep).toMatchObject({ kind: "pre-activation", unitId: fight.guard });
  });

  it("queued Blue Archive combat-start abilities still resolve before the window opens", () => {
    // The applyAction tail drains the Kivotos combat-start queue BEFORE it opens
    // the pre-activation window; the pump's earlier call must not jump it.
    const fight = neutralFight();
    fight.state.combat!.kivotosCombatStartQueue = [
      {
        kind: "own-deck-pick",
        sourceUnitId: fight.halberdiers,
        playerId: "p1",
        abilityId: "test-combat-start-pick",
        abilityName: "Prophetic Dream",
        count: 2
      }
    ];
    expect(fight.state.players.p1.deck.length).toBeGreaterThanOrEqual(2);
    let state = toGuardActivation(fight, [BOWSTRING]);
    expect(state.combat!.activeUnitId).toBe(fight.guard);
    expect(state.reactionWindow, "no interrupt window ahead of the combat-start pick").toBeNull();
    const pick = state.pendingChoice;
    expect(pick?.type === "OPTION_CHOICE" && pick.context).toBe("kivotos-prophetic-dream");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: pick!.id, optionIndex: 0 });
    expect(state.pendingChoice).toBeNull();

    // The guard still has not acted; once its pause is resumed the Bowstring
    // window opens before it moves.
    expect(state.combat!.pendingNeutralStep).toMatchObject({ kind: "pre-activation", unitId: fight.guard });
    state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(state.reactionWindow?.triggerEvent).toMatchObject({ type: "UNIT_ACTIVATION_STARTED", unitId: fight.guard });
    expect(guardHasAttacked(state, fight.guard)).toBe(false);
    expect(bowstringPlay(state, fight.marksmen)).toBeTruthy();
    state = settle(applyOk(state, { type: "PASS_REACTION", playerId: "p1" }));
    expect(guardHasAttacked(state, fight.guard)).toBe(true);
  });

  it("a computer fighter answers the window (plays or passes) instead of stalling", () => {
    const fight = neutralFight();
    fight.state.controllers = {
      ...fight.state.controllers,
      p1: { kind: "computer", difficulty: "standard", policyVersion: 1 }
    };
    let state = toGuardActivation(fight, [BOWSTRING]);
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    const decision = chooseComputerAction(observeForComputer(state, "p1"));
    expect(decision?.playerId).toBe("p1");
    expect(["PLAY_REACTION", "PASS_REACTION"]).toContain(decision!.action.type);
    state = applyOk(state, decision!.action);
    expect(state.reactionWindow?.triggerEvent.type === "UNIT_ACTIVATION_STARTED" &&
      state.reactionWindow.triggerEvent.unitId === fight.guard, "the window never re-opens on the same activation").toBe(false);
  });
});
