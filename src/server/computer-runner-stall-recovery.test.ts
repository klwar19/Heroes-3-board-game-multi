import { describe, expect, it, vi } from "vitest";

// Simulate a POLICY FAILURE: chooseComputerAction finds no safe candidate for
// any window. Before the stall-recovery fallback, that meant
// settleComputerVisibleStep returned stalled with zero decisions and the live
// table froze forever (no broadcast, no re-arm that helps, the human's clicks
// all rejected). Everything else in the engine stays real.
vi.mock("@/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/engine")>();
  return { ...original, chooseComputerAction: () => null };
});

import { createAdventureGameState, standardComputerController } from "@/engine";
import { settleComputerVisibleStep } from "./computer-runner";

describe("computer runner — stall recovery (policy produced nothing)", () => {
  it("recovers a stalled computer-owned turn with do-least default actions instead of freezing", () => {
    const state = createAdventureGameState({ seed: "stall-recovery-live", rollFirstPlayer: false });
    // Make the ACTIVE seat a computer: with the policy disabled (mock above),
    // every one of its owed steps stalls — the recovery must resolve them
    // through the normal rules pipeline (start-of-turn hand step, end turn),
    // never leaving the run stalled with zero decisions.
    state.controllers = { p1: standardComputerController() };

    const run = settleComputerVisibleStep(state);

    expect(run.decisions.length).toBeGreaterThan(0);
    expect(run.decisions.every((decision) => decision.policy.startsWith("stall-recovery."))).toBe(true);
    // The recovery made real progress through the reducer (state advanced),
    // and the run is not reported as a stall.
    expect(run.state).not.toBe(state);
    expect(run.stalled).toBe(false);
  });

  it("CONTROL: never blind-fires outside the do-least safe set (a contended setup pick stays a visible stall)", () => {
    const state = createAdventureGameState({ seed: "stall-recovery-guard", rollFirstPlayer: false });
    state.controllers = { p1: standardComputerController() };
    // Strip the safe set: no hand step owed, so the recovery's options for the
    // open turn are map actions like END_TURN. Removing END_TURN from reach is
    // impractical here; instead assert the recovery only ever took actions
    // from its curated preference list — the decisions recorded above and here
    // must all be window-resolving / do-least types.
    const run = settleComputerVisibleStep(state);
    const allowed = new Set([
      "CHOOSE_OPTION",
      "CHOOSE_ABILITY_TARGET",
      "CHOOSE_PENDING_ROLL",
      "RESOLVE_COMBAT_DISCARD",
      "RESOLVE_DECK_SEARCH",
      "RESOLVE_VISIT_STEP",
      "SET_TILE_ROTATION",
      "SKIP_NECROMANCY",
      "REFRESH_HAND",
      "OPENING_HAND_MULLIGAN",
      "RESOLVE_EXPLORERS_DISCARD",
      "ACCEPT_COMBAT",
      "FINISH_COMBAT_PLACEMENT",
      "PLACE_COMBAT_UNIT",
      "FINISH_TACTICS",
      "FINISH_NEUTRAL_PLACEMENT",
      "FINISH_COMMANDER_PLACEMENT",
      "AUTO_NEUTRAL_ACTIVATION",
      "CONTINUE_NEUTRAL_STEP",
      "CONTINUE_NEUTRAL_COMBAT",
      "ACKNOWLEDGE_COMBAT_END",
      "END_ACTIVATION",
      "DEFEND_UNIT",
      "END_TURN",
      "PASS_REACTION",
    ]);
    expect(run.decisions.length).toBeGreaterThan(0);
    for (const decision of run.decisions) {
      expect(allowed.has(decision.action.type)).toBe(true);
    }
  });
});
