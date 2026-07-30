import { describe, expect, it } from "vitest";
import { createAdventureLobbyState } from "../adventure-setup";
import { computerStallRecoveryDecision } from "./stall-recovery";

/**
 * Last-resort stall recovery (see stall-recovery.ts): when the policy finds no
 * safe legal action for a computer-owned window, the runner takes the do-least
 * window-resolving action instead of freezing the table forever. The wiring
 * through settleComputerVisibleStep is pinned in
 * src/server/computer-runner.test.ts ("stall recovery").
 */
describe("computerStallRecoveryDecision", () => {
  function spState(seed: string) {
    return createAdventureLobbyState({
      seed,
      sessionMode: "single-player",
      computerOpponents: 1,
    });
  }

  it("answers a computer-owned option choice, preferring the skip-flavoured option", () => {
    const state = spState("stall-recovery-choice");
    state.pendingChoice = {
      id: "choice_bot",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Pick",
      options: [{ label: "Take the gold" }, { label: "Skip" }],
      context: "city-hall",
      returnPhase: "setup",
    } as typeof state.pendingChoice;
    const decision = computerStallRecoveryDecision(state);
    expect(decision).toMatchObject({
      playerId: "p2",
      policy: "stall-recovery.default-resolve",
      action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "choice_bot", optionIndex: 1 },
    });
  });

  it("passes a reaction window the computer holds priority in", () => {
    const state = spState("stall-recovery-reaction");
    state.reactionWindow = {
      id: "rw1",
      priorityPlayerId: "p2",
      legalReactions: {},
      triggerEvent: { type: "UNIT_ATTACK_DECLARED" },
    } as unknown as typeof state.reactionWindow;
    expect(computerStallRecoveryDecision(state)).toMatchObject({
      playerId: "p2",
      policy: "stall-recovery.pass-reaction",
      action: { type: "PASS_REACTION", playerId: "p2" },
    });
  });

  it("CONTROL: returns null for a human-owned window (the table must wait, never auto-answer the human)", () => {
    const state = spState("stall-recovery-human");
    state.pendingChoice = {
      id: "choice_human",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Pick",
      options: [{ label: "One" }],
      context: "city-hall",
      returnPhase: "setup",
    } as typeof state.pendingChoice;
    expect(computerStallRecoveryDecision(state)).toBeNull();
  });

  it("CONTROL: returns null when the owner's window offers nothing (genuinely stuck states stay visible)", () => {
    const state = spState("stall-recovery-empty");
    state.pendingChoice = {
      id: "choice_empty",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Pick",
      options: [],
      context: "city-hall",
      returnPhase: "setup",
    } as typeof state.pendingChoice;
    expect(computerStallRecoveryDecision(state)).toBeNull();
  });
});
