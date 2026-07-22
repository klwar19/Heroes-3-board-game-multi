import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  type AdventureSetupOptions,
  type AnimeModOptions,
  type GameEvent,
} from "@/engine";
import { coreFactionDefinitions } from "@/data/factions/core";
import {
  playUntilRound,
  type SoakRunResult,
} from "./single-player-soak-helpers";

/**
 * Fixed-seed live-play coverage for Heavenly Demon Palace. Content and focused
 * combat tests pin the roster and bespoke abilities; this suite proves that a
 * real single-player room can build, recruit, fight, advance its shared anime
 * tracks, and settle computer turns without stalling.
 */

const ANIME: AnimeModOptions = {
  ...DEFAULT_ANIME_OPTIONS,
  enabled: true,
  xianxiaTowns: true,
  cultivation: true,
  heroGrades: true,
  equipment: true,
};

const HEAVENLY_DEMON_UNIT_IDS = new Set(
  coreFactionDefinitions.heavenly_demon.units,
);

function heavenlyDemonSetup(seed: string): AdventureSetupOptions {
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    anime: ANIME,
    players: [
      {
        id: "p1",
        name: "Xuedao of the Palace",
        factionId: "heavenly_demon",
        heroDefId: "xuedao",
      },
      {
        id: "p2",
        name: "Guiyan of the Palace",
        factionId: "heavenly_demon",
        heroDefId: "guiyan",
      },
    ],
  };
}

type LiveActivity = {
  recruits: string[];
  builds: string[];
  commanderEvents: number;
  progressionEvents: number;
};

function runHeavenlyDemonSoak(
  seed: string,
  targetRound: number,
  maxLoops: number,
): { result: SoakRunResult; activity: LiveActivity } {
  const events = new Map<string, GameEvent>();
  const result = playUntilRound(
    createAdventureGameState(heavenlyDemonSetup(seed)),
    targetRound,
    {
      maxLoops,
      onLoop: (state) => {
        for (const event of state.eventLog) events.set(event.id, event);
      },
    },
  );
  const recruits: string[] = [];
  const builds: string[] = [];
  let commanderEvents = 0;
  let progressionEvents = 0;
  for (const event of events.values()) {
    if (
      event.type === "UNIT_RECRUITED" &&
      event.unitDefId.startsWith("heavenly_demon.")
    ) {
      recruits.push(event.unitDefId);
    }
    if (
      event.type === "STRUCTURE_BUILT" &&
      event.buildingId.startsWith("heavenly_demon.")
    ) {
      builds.push(event.buildingId);
    }
    if (event.type.startsWith("COMMANDER")) commanderEvents += 1;
    if (
      event.type === "CULTIVATION_REALM_ADVANCED" ||
      event.type === "HERO_GRADE_ADVANCED"
    ) {
      progressionEvents += 1;
    }
  }
  return {
    result,
    activity: { recruits, builds, commanderEvents, progressionEvents },
  };
}

function assertHardInvariants(
  label: string,
  result: SoakRunResult,
  targetRound: number,
): void {
  expect(result.stalled, `${label} STALLED: ${result.reason}`).toBe(false);
  expect(
    result.violations,
    `${label} invariants: ${result.violations.join("; ")}`,
  ).toEqual([]);
  const completed =
    result.state.round >= targetRound ||
    result.state.phase === "game-over" ||
    Boolean(result.state.adventure?.winnerPlayerId);
  expect(
    completed,
    `${label} only reached round ${result.state.round} (${result.state.phase})`,
  ).toBe(true);
}

describe("Heavenly Demon Palace — live AI play", () => {
  it("runs both Heavenly Demon seats to round 5 with live roster and commander/progression systems", () => {
    const totals: LiveActivity = {
      recruits: [],
      builds: [],
      commanderEvents: 0,
      progressionEvents: 0,
    };
    for (const seed of ["heavenly-demon-live-a", "heavenly-demon-live-b"]) {
      const { result, activity } = runHeavenlyDemonSoak(seed, 5, 900);
      assertHardInvariants(`[${seed}]`, result, 5);
      totals.recruits.push(...activity.recruits);
      totals.builds.push(...activity.builds);
      totals.commanderEvents += activity.commanderEvents;
      totals.progressionEvents += activity.progressionEvents;
    }

    expect(
      totals.recruits.length,
      "the live runs should recruit Heavenly Demon units",
    ).toBeGreaterThan(0);
    for (const id of totals.recruits) {
      expect(
        HEAVENLY_DEMON_UNIT_IDS.has(id),
        `${id} belongs to the Heavenly Demon roster`,
      ).toBe(true);
    }
    expect(
      totals.commanderEvents + totals.progressionEvents + totals.builds.length,
      "Demon Ancestor, faction construction, or anime progression should become active",
    ).toBeGreaterThan(0);
  });

  it("reaches round 5 on a third seed without a stall or invariant violation", () => {
    const { result } = runHeavenlyDemonSoak("heavenly-demon-live-c", 5, 900);
    assertHardInvariants("[heavenly-demon-live-c]", result, 5);
  });
});
