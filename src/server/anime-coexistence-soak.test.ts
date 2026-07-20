import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  cultivationRealmOf,
  heroGradeOf,
  heroGradeProgressOf,
  DEFAULT_ANIME_OPTIONS,
  type AdventureSetupOptions,
  type AnimeModOptions,
  type GameEvent,
} from "@/engine";
import { playUntilRound, type SoakRunResult } from "./single-player-soak-helpers";

/**
 * Cross-mod COEXISTENCE GATE (b) — the ALL-ON soak (plan §3.8).
 *
 * A fixed-seed single-player game with EVERY shipped anime module, EVERY WOG
 * module, Creature Banks, Polish Unit-Stacks + Bank-Sizes, Morale Cards and the
 * stash-style Spell Book (a SECOND variant swaps in the Polish Spell Book — the
 * two Spell Books are mutually exclusive) all ON at once, driven by the same
 * scripted-human + settle-computers driver the other soaks use
 * (single-player-soak-helpers.ts).
 *
 * HARD guarantees (fail the build): the runner never stalls, no seat holds a
 * negative resource, and every seed reaches round 6 (4 for the shorter Polish
 * Spell Book variant) or the game ends cleanly.
 *
 * SOFT observations (the anime systems are genuinely LIVE, not silently inert):
 * anime Field Overrides are carved on the map, and Merit / grade / realm
 * progression fires. These are aggregated across the seeds because any single
 * seed's map/AI luck varies. (The AI never buys equipment — an optional shop
 * purchase it declines by policy — so EQUIPMENT_EQUIPPED stays 0; that is a
 * documented limit, not a coexistence failure.)
 *
 * Runtime: ~2s for the whole file (each round-6 run settles in ~300-400ms).
 */

const ALL_ANIME: AnimeModOptions = {
  ...DEFAULT_ANIME_OPTIONS,
  enabled: true,
  combatEvents: true,
  xianxiaArtifacts: true,
  cultivation: true,
  heroGrades: true,
  equipment: true,
  // Unit Stacks shares the Polish machinery (also on in the soak — one pricing,
  // the OR seam composes); Unit Experience is a pure auto-grant.
  unitStacks: true,
  unitExperience: true,
  // Neutral Rank-Up: neutral guards + Stacked bank defenders fight ranked. A
  // pure combat-stat fold — harder fights, no new AI window — so all-on stays
  // stall-free (the guaranteed-win smoothing still carries the AI's opening).
  neutralRankUp: true,
};

function allOnSetup(seed: string, extra: Partial<AdventureSetupOptions>): AdventureSetupOptions {
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    anime: ALL_ANIME,
    fieldOverrides: true,
    creatureBanks: true,
    moraleCards: true,
    wog: { enabled: true, commanders: true, newObjects: true, newCreatures: true, artifacts: true },
    ...extra,
  };
}

type AnimeActivity = {
  animeFields: number;
  gradeEvents: number;
  realmEvents: number;
  meritTotal: number;
};

/** Run a soak, accumulating anime-system activity across every settled loop. */
function runAllOnSoak(
  setup: AdventureSetupOptions,
  targetRound: number,
  maxLoops: number,
): { result: SoakRunResult; activity: AnimeActivity } {
  const events = new Map<string, GameEvent>();
  const result = playUntilRound(createAdventureGameState(setup), targetRound, {
    maxLoops,
    onLoop: (state) => {
      for (const event of state.eventLog) events.set(event.id, event);
    },
  });
  const state = result.state;
  const animeFields = state.adventure
    ? Object.values(state.adventure.fields).filter((field) => String(field.location).startsWith("anime.")).length
    : 0;
  let gradeEvents = 0;
  let realmEvents = 0;
  for (const event of events.values()) {
    if (event.type === "HERO_GRADE_ADVANCED") gradeEvents += 1;
    if (event.type === "CULTIVATION_REALM_ADVANCED") realmEvents += 1;
  }
  let meritTotal = 0;
  for (const playerId of state.turnOrder) {
    meritTotal += heroGradeProgressOf(state, playerId) + cultivationRealmOf(state, playerId) + heroGradeOf(state, playerId);
  }
  return { result, activity: { animeFields, gradeEvents, realmEvents, meritTotal } };
}

function assertHardInvariants(label: string, result: SoakRunResult, targetRound: number): void {
  expect(result.stalled, `${label} STALLED: ${result.reason}`).toBe(false);
  expect(result.violations, `${label} invariants: ${result.violations.join("; ")}`).toEqual([]);
  const ok =
    result.state.round >= targetRound ||
    result.state.phase === "game-over" ||
    Boolean(result.state.adventure?.winnerPlayerId);
  expect(ok, `${label} only reached round ${result.state.round} (phase ${result.state.phase})`).toBe(true);
}

describe("anime coexistence — gate (b): the ALL-ON soak never stalls", () => {
  it("all shipped anime + WOG + Polish stacks/banks + Morale + stash Spell Book: round 6, no stall (3 seeds)", () => {
    const totals: AnimeActivity = { animeFields: 0, gradeEvents: 0, realmEvents: 0, meritTotal: 0 };
    for (const seed of ["all-on-a", "all-on-b", "all-on-c"]) {
      const { result, activity } = runAllOnSoak(
        allOnSetup(`anime-coexist-${seed}`, {
          houseRules: { "polish-unit-stacks": true, "polish-bank-sizes": true },
        }),
        6,
        900,
      );
      assertHardInvariants(`[${seed}]`, result, 6);
      totals.animeFields += activity.animeFields;
      totals.gradeEvents += activity.gradeEvents;
      totals.realmEvents += activity.realmEvents;
      totals.meritTotal += activity.meritTotal;
    }
    // SOFT: the anime systems were genuinely exercised across the run — overrides
    // carved AND Merit/grade/realm progression happened somewhere.
    expect(totals.animeFields, "anime Field Overrides should be carved during the soak").toBeGreaterThan(0);
    expect(
      totals.gradeEvents + totals.realmEvents + totals.meritTotal,
      "some Merit / grade / realm progression should fire under all-on play",
    ).toBeGreaterThan(0);
  });

  it("shorter variant: Polish Spell Book swapped in for the stash book (mutually exclusive): round 4, no stall (2 seeds)", () => {
    for (const seed of ["psb-a", "psb-b"]) {
      const setup = allOnSetup(`anime-coexist-${seed}`, {
        houseRules: {
          "polish-unit-stacks": true,
          "polish-bank-sizes": true,
          "polish-spell-book": true,
        },
      });
      const { result } = runAllOnSoak(setup, 4, 700);
      assertHardInvariants(`[${seed}]`, result, 4);
      // Enabling Polish Spell Book forces the stash-style book OFF (mutually
      // exclusive) — confirm the build honored that, so this really is the
      // other-book variant.
      expect(result.state.adventure?.houseRules?.["polish-spell-book"]).toBe(true);
      expect(result.state.adventure?.spellBook).toBe(false);
    }
  });

  it("breadth: 3 computer opponents, everything on: round 4, no stall", () => {
    const { result } = runAllOnSoak(
      allOnSetup("anime-coexist-3opp", {
        playerCount: 4,
        houseRules: { "polish-unit-stacks": true, "polish-bank-sizes": true },
      }),
      4,
      1200,
    );
    assertHardInvariants("[3opp]", result, 4);
  });
});
