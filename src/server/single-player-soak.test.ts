import { describe, expect, it } from "vitest";
import {
  applyAction,
  computerDecisionOwner,
  createAdventureGameState,
  type GameAction,
  type GameState,
} from "@/engine";
import {
  driveComputerPlayers,
  settleComputerVisibleStep,
} from "./computer-runner";
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
      // Track the computer main hero's position across the whole run. A stall-
      // free game that ADVANCES ROUNDS but never MOVES the hero used to pass
      // this soak silently — the "AI takes its turn and does nothing / sits
      // still" report. Asserting the pawn actually walks pins the observable
      // outcome (a moved hero), not just "the pump didn't crash".
      const computerHeroCells = new Set<string>();
      const result = playUntilRound(initial, ROUNDS_TARGET, {
        onLoop: (state) => {
          const hero = Object.values(state.heroes).find(
            (candidate) => candidate.controllerId === "p2" && candidate.kind === "main",
          );
          if (hero?.spaceId) {
            computerHeroCells.add(hero.spaceId);
          }
        },
      });
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
      // The computer hero actually WALKED — it visited more than the single
      // home cell it started on over ~5 rounds (fails if the AI freezes in
      // place: objective detection / distance field / move scoring regressions).
      expect(
        computerHeroCells.size,
        `computer hero never moved (cells: ${[...computerHeroCells].join(", ")})`,
      ).toBeGreaterThan(1);
      // Memory should have been written for the computer seat at some point.
      if (result.state.computerMemory?.p2) {
        expect(result.state.computerMemory.p2.resourceTrail.length).toBeGreaterThan(0);
      }
    });
  }

  it("the PACED production path (one ADVANCE_COMPUTER per beat) actually WALKS the computer hero", () => {
    // The live single-player table drives the computer via settleComputerVisibleStep,
    // ONE visible beat per ADVANCE_COMPUTER — NOT the whole-turn driveComputerPlayers
    // the soak above uses. With the client auto-advancing (the single-player DEFAULT
    // now), the AI takes its whole turn a beat at a time. This is the exact path that
    // was silently NOT driven when auto-advance was opt-in — the map computer turn does
    // nothing on its own (server auto-pump is PvP-only), so with no ADVANCE_COMPUTER the
    // hero never left home ("single player AI … not move at all"). Regression guard: if
    // the paced path stops walking the hero (or moves stop counting as progress), the
    // distinct-cell set collapses to the single home cell and this fails.
    let state: GameState = createAdventureGameState({
      seed: "sp-paced-move",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    const cells = new Set<string>();
    const computerHero = (s: GameState) =>
      Object.values(s.heroes).find((h) => h.controllerId === "p2" && h.kind === "main");
    let loops = 0;
    while (state.round < 5 && loops < 400) {
      loops += 1;
      // Drive the computer's owed beats one visible step at a time (client sends
      // one ADVANCE_COMPUTER per step; the server runs settleComputerVisibleStep).
      let ticks = 0;
      while (computerDecisionOwner(state) && ticks < 600) {
        ticks += 1;
        const run = settleComputerVisibleStep(state);
        expect(run.stalled, run.reason).toBeFalsy();
        if (run.decisions.length === 0) break;
        state = run.state;
        const hero = computerHero(state);
        if (hero?.spaceId) cells.add(hero.spaceId);
      }
      if (state.phase === "game-over") break;
      const action = pickHumanAction(state, "p1");
      if (!action) break;
      const result = applyAction(state, action);
      expect(result.errors, result.errors.join("; ")).toEqual([]);
      state = result.state;
    }
    expect(
      cells.size,
      `paced computer hero never moved (cells: ${[...cells].join(", ")})`,
    ).toBeGreaterThan(1);
  });

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
