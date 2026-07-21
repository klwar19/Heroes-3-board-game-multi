import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  type AdventureSetupOptions,
  type AnimeModOptions,
  type GameEvent,
} from "@/engine";
import { coreFactionDefinitions } from "@/data/factions/core";
import { playUntilRound, type SoakRunResult } from "./single-player-soak-helpers";

/**
 * Live-play coverage for Azur Lane Naval Base (`azur_lane`), the FOURTH playable
 * Anime Realms town (Step 4 of the town rollout). The content test
 * (src/data/anime/azur-lane-content.test.ts) pins the ROSTER/wiring by data plus
 * one combat spot-check; THIS file proves the town survives a real, fixed-seed
 * single-player game driven by the computer runner — the "no weird behaviour
 * under AI play" guarantee.
 *
 * Both seats are forced onto azur_lane (the human p1 AND the computer p2) via an
 * explicit `players` payload, with anime.isekaiTowns on so the town's module
 * machinery (its WOG commander Belfast, forced on for anime towns) is exactly
 * what a real game would build. The driver is the shared scripted-human + settle-
 * computers harness (single-player-soak-helpers.ts).
 *
 * HARD guarantees (fail the build): the runner never stalls, no live seat holds
 * a negative resource, and the game reaches the target round (or ends cleanly).
 *
 * SOFT observations (the town is genuinely LIVE, not silently inert under AI
 * play): an azur_lane unit is recruited from its dwellings, and its Belfast
 * commander earns/spends grade points in the fights the AI walks into. These are
 * aggregated across the seeds since any single seed's map/AI luck varies. Nothing
 * here reaches into COMBAT deployment: the guaranteed-win smoothing resolves the
 * AI's opening guard fights at combat-start, so an "azur_lane unit placed on the
 * board" signal is unreliable — the recruit + commander signals are.
 *
 * Runtime: ~1s for the file (each round-5 run settles in ~90-130ms).
 */

const ANIME: AnimeModOptions = {
  ...DEFAULT_ANIME_OPTIONS,
  enabled: true,
  isekaiTowns: true,
  // Equipment is cheap to leave on (the AI declines the optional outfitter shop
  // by policy — a documented limit — so it changes no behaviour here), but it
  // exercises the kansen equipment line's deck-join under an all-azur_lane table
  // without a separate variant.
  equipment: true,
};

const AZUR_LANE_UNIT_IDS = new Set(coreFactionDefinitions.azur_lane.units);

function azurLaneSetup(seed: string): AdventureSetupOptions {
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    anime: ANIME,
    // Force BOTH seats onto the new town — the human p1 and the computer p2
    // (single-player auto-assigns p1 human / p2 computer). A direct setup payload
    // seats factions verbatim, so the table is all Azur Lane.
    players: [
      { id: "p1", name: "Enterprise of the Base", factionId: "azur_lane", heroDefId: "enterprise" },
      { id: "p2", name: "Bismarck of the Base", factionId: "azur_lane", heroDefId: "bismarck" },
    ],
  };
}

type LiveActivity = {
  azurLaneRecruits: string[];
  azurLaneBuilds: string[];
  commanderEvents: number;
};

function runAzurLaneSoak(
  seed: string,
  targetRound: number,
  maxLoops: number,
): { result: SoakRunResult; activity: LiveActivity } {
  const events = new Map<string, GameEvent>();
  const result = playUntilRound(createAdventureGameState(azurLaneSetup(seed)), targetRound, {
    maxLoops,
    onLoop: (state) => {
      for (const event of state.eventLog) events.set(event.id, event);
    },
  });
  const azurLaneRecruits: string[] = [];
  const azurLaneBuilds: string[] = [];
  let commanderEvents = 0;
  for (const event of events.values()) {
    if (event.type === "UNIT_RECRUITED" && event.unitDefId.startsWith("azur_lane.")) {
      azurLaneRecruits.push(event.unitDefId);
    }
    if (event.type === "STRUCTURE_BUILT" && event.buildingId.startsWith("azur_lane.")) {
      azurLaneBuilds.push(event.buildingId);
    }
    if (event.type.startsWith("COMMANDER")) commanderEvents += 1;
  }
  return { result, activity: { azurLaneRecruits, azurLaneBuilds, commanderEvents } };
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

describe("Azur Lane Naval Base — live AI play never stalls and the town is LIVE", () => {
  it("both seats azur_lane, single-player to round 5: no stall, no negative resources, systems live (2 seeds)", () => {
    const totals: LiveActivity = { azurLaneRecruits: [], azurLaneBuilds: [], commanderEvents: 0 };
    for (const seed of ["azur-lane-live-a", "azur-lane-live-b"]) {
      const { result, activity } = runAzurLaneSoak(seed, 5, 900);
      assertHardInvariants(`[${seed}]`, result, 5);
      totals.azurLaneRecruits.push(...activity.azurLaneRecruits);
      totals.azurLaneBuilds.push(...activity.azurLaneBuilds);
      totals.commanderEvents += activity.commanderEvents;
    }

    // SOFT: the roster is genuinely recruited during play (its dwellings are
    // built and its units bought), and every recruited id is a real Azur Lane
    // unit — not some fallback.
    expect(
      totals.azurLaneRecruits.length,
      "the AI should recruit at least one Azur Lane unit across the soak",
    ).toBeGreaterThan(0);
    for (const id of totals.azurLaneRecruits) {
      expect(AZUR_LANE_UNIT_IDS.has(id), `recruited ${id} is a real Azur Lane unit`).toBe(true);
    }

    // SOFT: Belfast (the town's WOG commander, forced on because an anime town is
    // in play) is genuinely on the field — it earns/spends grade points in the
    // fights the AI marches into. azur_lane building construction is a weaker
    // signal (the starting board already stands its opener; dwelling upgrades
    // land only on some seeds), so it rides the OR rather than being required.
    expect(
      totals.commanderEvents + totals.azurLaneBuilds.length,
      "Belfast commander activity or an Azur Lane building upgrade should fire under all-azur_lane play",
    ).toBeGreaterThan(0);
  });

  it("breadth: a third seed also reaches round 5 with no stall or invariant violation", () => {
    const { result } = runAzurLaneSoak("azur-lane-live-c", 5, 900);
    assertHardInvariants("[azur-lane-live-c]", result, 5);
  });
});
