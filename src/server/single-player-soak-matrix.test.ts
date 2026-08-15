import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  EVENTS_DECK_ID,
  type AdventureSetupOptions,
  type GameState,
} from "@/engine";
import { playUntilRound, type SoakRunResult } from "./single-player-soak-helpers";

/**
 * EXTENDED SOAK MATRIX (Step 7). Seeded whole-game single-player runs across
 * option combinations, proving the improved computer plays complete games
 * without stalling. Mirrors single-player-soak.test.ts but sweeps the OPTION
 * space (WOG commanders, morale cards, events, difficulty, opponent count) — the
 * axis single-player-soak.test.ts does not cover.
 *
 * Every run asserts: the runner never stalls (reason surfaced on failure), no
 * seat ever holds a negative resource, and the game reaches the target round OR
 * ends cleanly (a real winner / game-over). Because computers are fully settled
 * after every human action, "no stall" also means every computer turn
 * terminated. Kept CI-bounded: short seed lists, 6-round targets (8 for the
 * clean 1-opponent baseline), split across independent `it`s so no single test
 * approaches the 20s timeout.
 *
 * This suite is the regression guard for the two Step-7 stall fixes:
 *  - legal-actions.ts — a WOG commander that CAST (movement-locked) may HOLD, so
 *    an isolated cast-locked commander is never handed an empty combat menu
 *    (deadlock). Behaviour pinned in wog-commander-casts.test.ts.
 *  - computer/window.ts — a HUMAN pre-activation reaction pause is owned by the
 *    human even when the paused-on unit is the computer's, so a computer→human
 *    PvP fight never claims a computer owes an impossible move. Pinned in
 *    computer/window.test.ts.
 * The "all options on" and "3 opponents Impossible" runs below FAIL (stall) if
 * either fix is reverted.
 */

function newGame(seed: string, setup: Partial<AdventureSetupOptions>): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    sessionMode: "single-player",
    ...setup,
  });
}

function runSoak(
  label: string,
  seed: string,
  setup: Partial<AdventureSetupOptions>,
  targetRound: number,
  maxLoops = 600,
): SoakRunResult {
  const result = playUntilRound(newGame(seed, setup), targetRound, { maxLoops });
  expect(result.stalled, `${label} [${seed}] STALLED: ${result.reason}`).toBe(false);
  expect(
    result.violations,
    `${label} [${seed}] invariant violations: ${result.violations.join("; ")}`,
  ).toEqual([]);
  // Clean termination: reached the target round, or the game genuinely ended.
  const terminatedCleanly =
    result.state.round >= targetRound ||
    result.state.phase === "game-over" ||
    Boolean(result.state.adventure?.winnerPlayerId);
  expect(
    terminatedCleanly,
    `${label} [${seed}] only reached round ${result.state.round} (phase ${result.state.phase})`,
  ).toBe(true);
  return result;
}

describe("single-player soak matrix — option combos never stall", () => {
  // 60s on the two heaviest cases (8 rounds / Impossible): the 2026-08-16
  // instant-specialty batch (protocol v35) legitimately added actions per AI
  // turn — idle-gold Drills anywhere plus more pass-able instant windows — and
  // tipped both just past the global 20s budget (~21-24s isolated, more under a
  // full parallel run). Stall detection is `terminatedCleanly` + the runner's
  // step cap, not the timeout.
  it("1 opponent, defaults, 8 rounds (2 seeds)", () => {
    for (const seed of ["matrix-1opp-a", "matrix-1opp-b"]) {
      runSoak("1opp", seed, { playerCount: 2 }, 8);
    }
  }, 60_000);

  it("3 opponents, defaults, 6 rounds", () => {
    runSoak("3opp", "matrix-3opp-a", { playerCount: 4 }, 6);
  });

  it("WOG Commanders ON, 6 rounds (2 seeds)", () => {
    for (const seed of ["matrix-wog-a", "matrix-wog-b"]) {
      runSoak(
        "wog-commanders",
        seed,
        { playerCount: 2, ruleset: "binh", wog: { enabled: true, commanders: true } },
        6,
      );
    }
  });

  it("Morale Cards ON, 6 rounds (2 seeds)", () => {
    for (const seed of ["matrix-morale-a", "matrix-morale-b"]) {
      runSoak("morale", seed, { playerCount: 3, moraleCards: true }, 6);
    }
  });

  it("Events deck ON — the deck IS active in single-player (2+ seats) and never stalls", () => {
    // CLAUDE.md's "even switched On, a solo table never gets the deck" means a
    // genuine SOLO (1-player) table: the engine gate is `events && seats >= 2`
    // (adventure-setup.ts), NOT session mode. A single-player game with a human
    // + a computer therefore DOES receive the Fortress Event deck. Pin that
    // conscious reality, then soak with it on.
    const withEvents = newGame("matrix-events-probe", { playerCount: 2, events: true });
    expect(
      Boolean(withEvents.decks[EVENTS_DECK_ID]),
      "single-player 2-seat table with events:true must carry the Event deck",
    ).toBe(true);
    const soloDefault = newGame("matrix-events-probe", { playerCount: 2 });
    expect(
      Boolean(soloDefault.decks[EVENTS_DECK_ID]),
      "events default OFF: no deck",
    ).toBe(false);

    for (const seed of ["matrix-events-a", "matrix-events-b"]) {
      runSoak("events", seed, { playerCount: 3, events: true }, 6);
    }
  });

  it("Easy difficulty, 6 rounds", () => {
    runSoak("easy", "matrix-easy-a", { playerCount: 2, difficulty: "easy" }, 6);
  });

  it("Impossible difficulty, 6 rounds (2 seeds)", () => {
    for (const seed of ["matrix-imp-a", "matrix-imp-b"]) {
      runSoak("impossible", seed, { playerCount: 2, difficulty: "impossible" }, 6);
    }
  }, 60_000);

  it("Creature Banks + Spell Book default ON, 6 rounds", () => {
    // Both default on (creatureBanks default true; spellBook default true in
    // BINH). Assert they are actually enabled in this build, then soak.
    const game = newGame("matrix-banks-a", { playerCount: 2 });
    expect(game.adventure?.spellBook, "spell book house rule on by default").toBe(true);
    expect(
      (game.adventure?.creatureBankTokensFar?.length ?? 0) > 0,
      "creature-bank token piles present by default",
    ).toBe(true);
    runSoak("banks+book", "matrix-banks-a", { playerCount: 2 }, 6);
  });

  it("ALL options on (3 opp + Impossible + Morale + Events + WOG Commanders) — the ex-stall combo, 6 rounds (2 seeds)", () => {
    // This is the exact combination that deadlocked before the Step-7 fixes
    // (empty commander combat menu + PvP pre-activation pause mis-ownership).
    // It now plays clean; it stalls again if EITHER fix is reverted.
    const setup: Partial<AdventureSetupOptions> = {
      playerCount: 3,
      difficulty: "impossible",
      moraleCards: true,
      events: true,
      ruleset: "binh",
      wog: { enabled: true, commanders: true },
    };
    for (const seed of ["matrix-all-a", "matrix-all-b"]) {
      runSoak("all-on", seed, setup, 6);
    }
  });

  it("tracks the guaranteed-win house rule and computer memory in production-shape single-player", () => {
    // The soak construction is the production path (createAdventureGameState +
    // sessionMode single-player builds the same computer controllers the lobby
    // does), so the guaranteed-win smoothing rule and computerMemory both behave
    // as live. Confirm the seat actually recorded them over a real run.
    const result = runSoak("house-rules", "matrix-house-a", { playerCount: 2 }, 6);
    const state = result.state;
    // A computer seat took at least its guaranteed opening wins.
    const anyGuaranteed = Object.values(state.computerGuaranteedWins ?? {}).some(
      (count) => (count ?? 0) >= 1,
    );
    expect(anyGuaranteed, "a computer seat should have used a guaranteed win").toBe(true);
    // Multi-round economy memory was written for the computer seat.
    expect(
      (state.computerMemory?.p2?.resourceTrail.length ?? 0) > 0,
      "computer memory resource trail should be populated",
    ).toBe(true);
  });
});
