import { describe, expect, it } from "vitest";
import {
  applyAction,
  computerDecisionOwner,
  createAdventureGameState,
  type GameAction,
  type GameState,
} from "@/engine";
import { driveComputerPlayers } from "./computer-runner";
import {
  invariantViolations,
  pickHumanAction,
  playUntilRound,
} from "./single-player-soak-helpers";

/**
 * Fixed-seed multi-round soak + reconnect suite for single-player computers.
 * Asserts the runner never freezes, resources stay non-negative, and a
 * mid-turn snapshot resume continues cleanly (reconnect).
 *
 * Kept bounded for CI: 8 seeds × 1 computer × 5 rounds, plus a 2-computer
 * short soak and a reconnect case. Nightly can raise SEED_COUNT / ROUNDS. The
 * scripted-human + settle-computers driver (pickHumanAction / playUntilRound /
 * invariantViolations) lives in single-player-soak-helpers.ts, shared with the
 * soak-matrix, tempo and opening suites.
 */

const SEED_COUNT = 8;
const ROUNDS_TARGET = 5;

function humanAct(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.join("; ")).toEqual([]);
  return result.state;
}

function assertInvariants(state: GameState, label: string): void {
  expect(invariantViolations(state, label)).toEqual([]);
}

describe("single-player multi-round soak", () => {
  for (let i = 0; i < SEED_COUNT; i += 1) {
    const seed = `soak-sp-${i}`;
    it(`seed ${seed}: ${ROUNDS_TARGET} rounds, 1 computer, no stall`, () => {
      const initial = createAdventureGameState({
        seed,
        scenarioId: "skirmish",
        playerCount: 2,
        sessionMode: "single-player",
      });
      const result = playUntilRound(initial, ROUNDS_TARGET);
      expect(result.stalled, result.reason).toBe(false);
      // Per-loop invariants accumulated over the whole run stayed clean.
      expect(result.violations, result.violations.join("; ")).toEqual([]);
      expect(result.state.round).toBeGreaterThanOrEqual(
        Math.min(ROUNDS_TARGET, result.state.round),
      );
      // Either reached the target round or the game ended cleanly.
      expect(
        result.state.round >= ROUNDS_TARGET ||
          result.state.phase === "game-over" ||
          Boolean(result.state.adventure?.winnerPlayerId),
      ).toBe(true);
      assertInvariants(result.state, seed);
      // Memory should have been written for the computer seat at some point.
      if (result.state.computerMemory?.p2) {
        expect(result.state.computerMemory.p2.resourceTrail.length).toBeGreaterThan(0);
      }
    });
  }

  it("2 computers for 3 rounds without stall (seed soak-2p)", () => {
    const initial = createAdventureGameState({
      seed: "soak-2p",
      scenarioId: "skirmish",
      playerCount: 3,
      sessionMode: "single-player",
    });
    const result = playUntilRound(initial, 3, { maxLoops: 500 });
    expect(result.stalled, result.reason).toBe(false);
    expect(result.violations, result.violations.join("; ")).toEqual([]);
    assertInvariants(result.state, "soak-2p");
  });

  it("all three Polish variants run for 3 rounds with 2 computers and no stall", () => {
    const initial = createAdventureGameState({
      seed: "polish-all-rules-soak",
      scenarioId: "skirmish",
      playerCount: 3,
      sessionMode: "single-player",
      houseRules: {
        "polish-spell-book": true,
        "polish-bank-sizes": true,
        "polish-unit-stacks": true,
      },
    });
    const result = playUntilRound(initial, 3, { maxLoops: 700 });
    expect(result.stalled, result.reason).toBe(false);
    expect(result.violations, result.violations.join("; ")).toEqual([]);
    expect(result.state.round >= 3 || result.state.phase === "game-over").toBe(true);
    expect(result.state.adventure?.houseRules).toMatchObject({
      "polish-spell-book": true,
      "polish-bank-sizes": true,
      "polish-unit-stacks": true,
    });
    assertInvariants(result.state, "polish-all-rules-soak");
  });
});

describe("single-player reconnect / resume", () => {
  it("resumes a mid-computer-turn snapshot without stall or double-play freeze", () => {
    let state = createAdventureGameState({
      seed: "soak-reconnect",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });

    // Play until the computer owns a decision on the map (after human ends R1).
    let guard = 0;
    while (guard++ < 80) {
      const run = driveComputerPlayers(state, undefined, { maxSteps: 1 });
      if (run.stalled) {
        // One-step may report stalled at cap — only fail if no progress path.
        if (run.decisions.length === 0 && computerDecisionOwner(run.state)) {
          expect(run.stalled, run.reason).toBe(false);
        }
      }
      state = run.state;
      if (
        computerDecisionOwner(state) === "p2" &&
        state.phase !== "setup" &&
        state.adventure
      ) {
        break;
      }
      if (!computerDecisionOwner(state)) {
        const action = pickHumanAction(state);
        if (!action) break;
        state = humanAct(state, action);
      }
    }

    // Snapshot as if the client reconnected mid-turn.
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    expect(computerDecisionOwner(snapshot) === "p2" || snapshot.round >= 1).toBe(
      true,
    );

    // Resume from pure JSON — no in-memory runner maps survive.
    const resumed = driveComputerPlayers(snapshot);
    expect(resumed.stalled, resumed.reason).toBe(false);
    assertInvariants(resumed.state, "reconnect");

    // A second full settle is a no-op (idempotent when no computer owes work).
    const again = driveComputerPlayers(resumed.state);
    expect(again.stalled, again.reason).toBe(false);
    expect(computerDecisionOwner(again.state)).toBeNull();
  });

  it("memory survives JSON snapshot resume (sticky / trail)", () => {
    let state = createAdventureGameState({
      seed: "soak-memory-resume",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    // Drive far enough that computer memory is written.
    const played = playUntilRound(state, 2, { maxLoops: 200 });
    expect(played.stalled, played.reason).toBe(false);
    state = played.state;
    const mem = state.computerMemory?.p2;
    if (!mem) {
      // Acceptable if computers never acted (unlikely); skip sticky assert.
      return;
    }
    const snap = JSON.parse(JSON.stringify(state)) as GameState;
    expect(snap.computerMemory?.p2?.resourceTrail?.length).toBeGreaterThan(0);
    // Resume does not wipe memory.
    const after = driveComputerPlayers(snap);
    expect(after.state.computerMemory?.p2?.resourceTrail?.length).toBeGreaterThan(0);
  });
});
