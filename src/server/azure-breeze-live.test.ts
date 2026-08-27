import { describe, expect, it } from "vitest";

import { coreFactionDefinitions } from "@/data/factions/core";
import {
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  type AdventureSetupOptions,
  type AnimeModOptions,
  type GameEvent
} from "@/engine";
import { playUntilRound, type SoakRunResult } from "./single-player-soak-helpers";

const ANIME: AnimeModOptions = {
  ...DEFAULT_ANIME_OPTIONS,
  enabled: true,
  xianxiaTowns: true,
  cultivation: true,
  heroGrades: true,
  equipment: true,
  unitExperience: true
};

const AZURE_UNITS = new Set(coreFactionDefinitions.azure_breeze.units);

function setup(seed: string): AdventureSetupOptions {
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    anime: ANIME,
    players: [
      { id: "p1", name: "Qingyun", factionId: "azure_breeze", heroDefId: "qingyun" },
      { id: "p2", name: "Lingxi", factionId: "azure_breeze", heroDefId: "lingxi" }
    ]
  };
}

function run(seed: string): { result: SoakRunResult; recruits: string[]; activity: number } {
  const events = new Map<string, GameEvent>();
  const result = playUntilRound(createAdventureGameState(setup(seed)), 8, {
    maxLoops: 900,
    onLoop: (state) => {
      for (const event of state.eventLog) events.set(event.id, event);
    }
  });
  const recruits: string[] = [];
  let activity = 0;
  for (const event of events.values()) {
    if (event.type === "UNIT_RECRUITED" && event.unitDefId.startsWith("azure_breeze.")) {
      recruits.push(event.unitDefId);
    }
    if (
      event.type === "STRUCTURE_BUILT" ||
      event.type === "CULTIVATION_REALM_ADVANCED" ||
      event.type === "HERO_GRADE_ADVANCED" ||
      event.type === "HERO_SKILL_USED"
    ) activity += 1;
  }
  return { result, recruits, activity };
}

describe("Azure Breeze Sect — live AI play", () => {
  it("plays two fixed-seed games through round 8 without stalls or invariant violations", () => {
    let totalRecruits = 0;
    let totalActivity = 0;
    for (const seed of ["azure-breeze-live-a", "azure-breeze-live-b"]) {
      const { result, recruits, activity } = run(seed);
      expect(result.stalled, `[${seed}] ${result.reason}`).toBe(false);
      expect(result.violations, `[${seed}] ${result.violations.join("; ")}`).toEqual([]);
      expect(
        result.state.round >= 8 || result.state.phase === "game-over" || Boolean(result.state.adventure?.winnerPlayerId),
        `[${seed}] only reached round ${result.state.round}`
      ).toBe(true);
      for (const unitId of recruits) expect(AZURE_UNITS.has(unitId), unitId).toBe(true);
      totalRecruits += recruits.length;
      totalActivity += activity;
    }
    expect(totalRecruits, "live games should recruit Azure Breeze units").toBeGreaterThan(0);
    expect(totalActivity, "town construction, cultivation, grade, or skill activity should occur").toBeGreaterThan(0);
  });
});
