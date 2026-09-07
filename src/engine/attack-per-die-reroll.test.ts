import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { AttackRollMode, GameState } from "./state";

function fixture(mode: AttackRollMode = "advantage", wholeRoll = false): GameState {
  const state = createInitialGameState();
  state.phase = "choice";
  state.priorityPlayerId = "p1";
  state.reactionWindow = null;
  state.combat!.dice.scriptedRolls = [0, -1, 1];
  state.combat!.dice.rollCount = 0;
  state.pendingChoice = {
    id: "test-reroll", type: "ATTACK_DIE_REROLL", playerId: "p1",
    stackItemId: "attack", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons",
    isRetaliation: false, attackKind: "ranged", rollMode: mode,
    attackBonus: 0, defenseBonus: 0, candidates: [{ rolls: [1, -1], roll: mode === "advantage" ? 1 : -1 }],
    remainingRerolls: 2, sourceEffectIds: [],
    rerollSources: [{ name: "Test reroll", remaining: 2, used: 0, rerollsWholeRoll: wholeRoll }],
  };
  return state;
}

function reroll(state: GameState, dieIndex?: number) {
  const offered = getLegalActions(state, "p1").find(({ action }) =>
    action.type === "REROLL_PENDING_CHOICE" && action.dieIndex === dieIndex);
  expect(offered).toBeDefined();
  const result = applyAction(state, offered!.action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function choice(state: GameState) {
  if (state.pendingChoice?.type !== "ATTACK_DIE_REROLL") throw new Error("Missing choice");
  return state.pendingChoice;
}

describe("Attack rolls reroll individual dice", () => {
  it.each(["advantage", "disadvantage"] as const)("reveals each reroll before the next choice (%s)", (mode) => {
    let state = reroll(fixture(mode), 1);
    expect(choice(state).candidates.at(-1)?.rolls).toEqual([1, 0]);
    expect(choice(state).candidates.at(-1)?.roll).toBe(mode === "advantage" ? 1 : 0);
    expect(choice(state).remainingRerolls).toBe(1);
    expect(state.combat!.dice.rollCount).toBe(1);
    state = reroll(state, 0);
    expect(choice(state).candidates.at(-1)?.rolls).toEqual([-1, 0]);
    expect(choice(state).candidates.at(-1)?.roll).toBe(mode === "advantage" ? 0 : -1);
    expect(choice(state).remainingRerolls).toBe(0);
    expect(state.combat!.dice.rollCount).toBe(2);
  });

  it("allows the same die to be chosen again after seeing its result", () => {
    const state = reroll(reroll(fixture(), 1), 1);
    expect(choice(state).candidates.at(-1)?.rolls).toEqual([1, -1]);
  });

  it("applies forced rerolls only to the newly thrown die", () => {
    const initial = fixture();
    initial.activeEffects.push({
      id: "hourglass", name: "Hourglass of the Evil Hour", controllerId: "p2",
      source: { type: "card", cardId: "artifact.hourglass_of_the_evil_hour", controllerId: "p2" },
      scope: "global", modifiers: [{ type: "REROLL_ENEMY_PLUS_ONE" }],
      duration: { type: "current-combat-round" }, startedRound: initial.round,
      usedChoiceIds: [], usedRollEventIds: [], usedCombatRoundNumbers: [],
    });
    initial.combat!.dice.scriptedRolls = [1, 0, -1];
    const state = reroll(initial, 1);
    expect(choice(state).candidates.at(-1)?.rolls).toEqual([1, 0]);
    expect(choice(state).candidates.at(-1)?.rerollBeats).toEqual([{ index: 1, from: 1, to: 0 }]);
    expect(state.combat!.dice.rollCount).toBe(2);
  });

  it("preserves the whole-roll exception", () => {
    const state = reroll(fixture("advantage", true));
    expect(choice(state).candidates.at(-1)?.rolls).toEqual([0, -1]);
    expect(state.combat!.dice.rollCount).toBe(2);
    expect(choice(state).remainingRerolls).toBe(1);
  });

  it("rejects requests that omit the die or select a nonexistent die", () => {
    for (const dieIndex of [undefined, -1, 2]) {
      const result = applyAction(fixture(), { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: "test-reroll", dieIndex });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.state.combat!.dice.rollCount).toBe(0);
    }
  });
});
