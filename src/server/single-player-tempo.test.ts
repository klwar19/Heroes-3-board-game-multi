import { describe, expect, it } from "vitest";
import { createAdventureGameState, type GameState } from "@/engine";
import { armyDevelopmentProfile } from "@/engine/computer/development";
import { playUntilRound } from "./single-player-soak-helpers";

/**
 * TEMPO BENCHMARKS (Step 7). Loose regression floors on the single-player
 * computer's opening/economy tempo, so a future policy change cannot SILENTLY
 * regress it. Bounds were measured on the Step-7 policy (2026-07) across the
 * FIXED seed sets below and pinned CONSERVATIVELY (a margin under the measured
 * value) — they hold across every listed seed and protect against a real
 * regression without brittle exact-count flakiness.
 *
 * Benchmark 0 — "all three home-tile payoffs collected by end of round 2" — is
 * already pinned in single-player-opening.test.ts (3 seeds, measured 3/3 robust
 * across 8+ soak seeds). It is NOT duplicated here; this file adds the ECONOMY
 * floors (dwelling + recruits) that the opening test does not cover.
 *
 * The computer seat is always p2 (p1 is the scripted human). `playUntilRound`
 * settles every computer fully after each human action, so a stall here would
 * fail loudly rather than pass on a frozen game.
 */

const computerSeat = "p2";

function newGame(seed: string, playerCount = 2): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount,
    sessionMode: "single-player",
  });
}

describe("single-player tempo benchmarks — opening economy floors", () => {
  it("Benchmark 1: bronze dwelling built AND army >= 3 by end of round 3 (all seeds)", () => {
    // MEASURED (Step-7 policy) at end of round 3 (playUntilRound target 4) on
    // these 10 fixed seeds: bronze dwelling unlocked on ALL 10, army size
    // sorted [3,3,3,3,3,3,3,3,3,4] (min 3, one seed 4). Round 3 is the clean
    // floor: the establish-core phase targets 3 Pack stacks
    // (CORE_PACK_TARGET), and later rounds fluctuate as combat trims the army,
    // so a >=3 floor at round 3 is robust while a later-round army floor is not.
    // Far-tile priority and the round-3 conquest fallback must preserve this core.
    const seeds = ["tempo-a", "tempo-b", "tempo-c", "tempo-d", "tempo-e", "tempo-f", "tempo-g", "tempo-h", "tempo-i", "tempo-j"];
    for (const seed of seeds) {
      const result = playUntilRound(newGame(seed), 4);
      expect(result.stalled, `${seed}: ${result.reason}`).toBe(false);
      expect(result.violations, `${seed} invariants: ${result.violations.join("; ")}`).toEqual([]);
      const profile = armyDevelopmentProfile(result.state, computerSeat);
      expect(profile.bronzeUnlocked, `${seed}: bronze dwelling by end of round 3`).toBe(true);
      expect(
        profile.totalUnits,
        `${seed}: army size ${profile.totalUnits} at end of round 3`,
      ).toBeGreaterThanOrEqual(3);
    }
  }, 60_000);

  it("Benchmark 2: silver dwelling reached by round 9 on at least 4 of 12 seeds (measured 6/12)", () => {
    // MEASURED (Step-7 policy) silver-unlock round per seed:
    //   eco-2 → R5,  eco-4 → R7,  eco-5 → R8,  eco-9 → R9,  eco-10 → R8,
    //   eco-11 → R8   (6 seeds by round 9);   eco-6 → R10;   eco-0/1/3/7/8 never
    //   within the run. So 6/12 reach silver by round 9, 5/12 by round 8.
    // The floor is pinned at >= 4 (a margin of 2 under the measured 6) so a real
    // dwelling-rush regression (Step-5 trade planner / silver unlock priority)
    // trips it, while a single seed drifting a round does not cause flakiness.
    // Silver is genuinely late in this board game (one town, trickle income); a
    // higher/earlier floor would be dishonest.
    //
    // RUNTIME (2026-08-10). This ran to round 10 on every seed even after the
    // seed's silver round was already recorded — but once `silverRound` is set
    // the remaining rounds cannot change that seed's contribution, so they were
    // pure cost. The run now STOPS at the moment silver unlocks (`stopWhen`),
    // which asserts exactly the same thing for a fraction of the work; a seed
    // that never unlocks still plays out to round 10, which is what makes the
    // "never within the run" rows above real. Measured before the change: 98s of
    // CPU against this test's 120s cap, so any parallel/contended run blew the
    // cap on wall time alone.
    const seeds = ["eco-0", "eco-1", "eco-2", "eco-3", "eco-4", "eco-5", "eco-6", "eco-7", "eco-8", "eco-9", "eco-10", "eco-11"];
    let reachedByRound9 = 0;
    const reachedRounds: Array<number | null> = [];
    for (const seed of seeds) {
      let silverRound: number | null = null;
      const result = playUntilRound(newGame(seed), 10, {
        maxLoops: 600,
        onLoop: (state) => {
          if (
            silverRound === null &&
            armyDevelopmentProfile(state, computerSeat).silverUnlocked
          ) {
            silverRound = state.round;
          }
        },
        stopWhen: () => silverRound !== null,
      });
      expect(result.stalled, `${seed}: ${result.reason}`).toBe(false);
      reachedRounds.push(silverRound);
      if (silverRound !== null && silverRound <= 9) reachedByRound9 += 1;
    }
    expect(
      reachedByRound9,
      `silver by round 9 on only ${reachedByRound9}/12 seeds (rounds: ${reachedRounds.join(", ")})`,
    ).toBeGreaterThanOrEqual(4);
  }, 120_000);
});
