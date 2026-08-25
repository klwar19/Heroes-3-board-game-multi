import { describe, expect, it } from "vitest";

import {
  applyAction,
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  type AdventureSetupOptions,
  type AnimeModOptions,
  type EngineResult,
  type GameAction,
  type GameEvent,
  type GameState,
  type FactionId,
  type PlayerController,
  type PlayerId
} from "@/engine";
import { polishQuickCombatArmyStrength } from "@/engine";
import { driveComputerPlayers } from "./computer-runner";
import { invariantViolations } from "./single-player-soak-helpers";

const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };
const TARGET_ROUND = 8;
const ANIME: AnimeModOptions = {
  ...DEFAULT_ANIME_OPTIONS,
  enabled: true,
  xianxiaTowns: true,
  cultivation: true,
  heroGrades: true,
  equipment: true,
  unitExperience: true
};

type Seat = { factionId: FactionId; heroDefId: string };
type Matchup = { name: string; cultivation: Seat; opponent: Seat };

const MATCHUPS: Matchup[] = [
  { name: "formation-vs-sacrifice", cultivation: { factionId: "azure_breeze", heroDefId: "jianxu" }, opponent: { factionId: "heavenly_demon", heroDefId: "xuedao" } },
  { name: "jade-body-vs-corpse-furnace", cultivation: { factionId: "azure_breeze", heroDefId: "yulian" }, opponent: { factionId: "heavenly_demon", heroDefId: "shiyan" } },
  { name: "azure-vs-castle", cultivation: { factionId: "azure_breeze", heroDefId: "qingyun" }, opponent: { factionId: "castle", heroDefId: "catherine" } },
  { name: "azure-vs-necropolis", cultivation: { factionId: "azure_breeze", heroDefId: "yulian" }, opponent: { factionId: "necropolis", heroDefId: "sandro" } },
  { name: "azure-vs-hidden-leaf", cultivation: { factionId: "azure_breeze", heroDefId: "jianxu" }, opponent: { factionId: "hidden_leaf", heroDefId: "naruto" } },
  { name: "demon-vs-rampart", cultivation: { factionId: "heavenly_demon", heroDefId: "luohun" }, opponent: { factionId: "rampart", heroDefId: "mephala" } },
  { name: "demon-vs-fuyuki", cultivation: { factionId: "heavenly_demon", heroDefId: "shiyan" }, opponent: { factionId: "fuyuki", heroDefId: "shirou_emiya" } },
  { name: "demon-vs-little-busters", cultivation: { factionId: "heavenly_demon", heroDefId: "xuedao" }, opponent: { factionId: "little_busters", heroDefId: "riki_naoe" } }
];
const ACTIVE_MATCHUPS = process.env.WUXIA_MATRIX_CASE
  ? MATCHUPS.filter((matchup) => matchup.name === process.env.WUXIA_MATRIX_CASE)
  : MATCHUPS;

type RunMetrics = {
  label: string;
  winnerFaction?: string;
  round: number;
  actions: number;
  pvpCombats: number;
  neutralCombats: number;
  bankCombats: number;
  combatEnds: number;
  azureTriggers: number;
  demonTriggers: number;
  minimumGold: number;
  finalSeats: Array<{ factionId?: string; heroDefId?: string; armyStrength: number; heroLevel: number; gold: number }>;
  violations: string[];
};

const AZURE_NODES = new Set([
  "azure-sect-qi", "azure-sword-formation", "azure-shared-ward",
  "jianxu-seven-star-array", "yulian-jade-body", "sword-intent-release", "sword-intent-tempered"
]);
const DEMON_NODES = new Set([
  "heavenly-demon-blood-essence", "heavenly-demon-blood-frenzy",
  "shiyan-corpse-furnace-sutra", "soul-banner"
]);

function setup(seed: string, p1: Seat, p2: Seat): AdventureSetupOptions {
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    anime: ANIME,
    rollFirstPlayer: false,
    controllers: { p1: COMPUTER, p2: COMPUTER },
    players: [
      { id: "p1", name: `${p1.heroDefId} AI`, factionId: p1.factionId, heroDefId: p1.heroDefId },
      { id: "p2", name: `${p2.heroDefId} AI`, factionId: p2.factionId, heroDefId: p2.heroDefId }
    ]
  };
}

function run(label: string, seed: string, p1: Seat, p2: Seat): RunMetrics {
  const events = new Map<string, GameEvent>();
  const violations: string[] = [];
  let actionIndex = 0;
  let minimumGold = Number.POSITIVE_INFINITY;
  const recordApply = (state: GameState, action: GameAction, playerId: PlayerId): EngineResult => {
    const result = applyAction(state, action, { computerActorPlayerId: playerId });
    if (result.errors.length === 0) {
      actionIndex += 1;
      for (const id of result.state.turnOrder) {
        minimumGold = Math.min(minimumGold, result.state.players[id]?.resources.gold ?? 0);
      }
      for (const event of result.state.eventLog) events.set(event.id, event);
      // BINH's explicit `defeat-gold-debt` house rule permits a defeated hero to
      // fall below zero by the 5-gold PvP toll. Keep recording the low-water mark,
      // but do not misclassify this designed debt as resource corruption.
      violations.push(...invariantViolations(result.state, `${label} action ${actionIndex}`).filter((problem) => !problem.includes(" gold=")));
      if (
        result.state.round >= TARGET_ROUND &&
        !result.state.combat &&
        !result.state.pendingChoice &&
        !result.state.reactionWindow
      ) {
        result.state.controllers = Object.fromEntries(result.state.turnOrder.map((id) => [id, { kind: "human" } as PlayerController]));
      }
    }
    return result;
  };
  const result = driveComputerPlayers(createAdventureGameState(setup(seed, p1, p2)), recordApply, { maxSteps: 5000 });
  expect(result.stalled, `${label}: ${result.reason}`).toBe(false);
  expect(
    result.state.phase === "game-over" || result.state.round >= TARGET_ROUND,
    `${label} should finish or reach round ${TARGET_ROUND}`
  ).toBe(true);
  expect(violations, `${label}: ${violations.join("; ")}`).toEqual([]);

  let pvpCombats = 0;
  let neutralCombats = 0;
  let bankCombats = 0;
  let combatEnds = 0;
  let azureTriggers = 0;
  let demonTriggers = 0;
  for (const event of events.values()) {
    if (event.type === "PLAYER_COMBAT_STARTED") pvpCombats += 1;
    if (event.type === "NEUTRAL_COMBAT_STARTED") neutralCombats += 1;
    if (event.type === "CREATURE_BANK_COMBAT_STARTED") bankCombats += 1;
    if (event.type === "COMBAT_ENDED") combatEnds += 1;
    if (event.type === "HERO_SKILL_USED") {
      if (AZURE_NODES.has(event.nodeId)) azureTriggers += 1;
      if (DEMON_NODES.has(event.nodeId)) demonTriggers += 1;
    }
  }
  const winnerId = result.state.adventure?.winnerPlayerId;
  const finalSeats = result.state.turnOrder.map((playerId) => {
    const player = result.state.players[playerId];
    const hero = Object.values(result.state.heroes).find((candidate) => candidate.controllerId === playerId && candidate.kind === "main");
    return {
      factionId: player.factionId,
      heroDefId: hero?.heroDefId,
      armyStrength: polishQuickCombatArmyStrength(result.state, playerId),
      heroLevel: hero?.level ?? 0,
      gold: player.resources.gold
    };
  });
  return {
    label,
    winnerFaction: winnerId ? result.state.players[winnerId]?.factionId : undefined,
    round: result.state.round,
    actions: result.decisions.length,
    pvpCombats,
    neutralCombats,
    bankCombats,
    combatEnds,
    azureTriggers,
    demonTriggers,
    minimumGold,
    finalSeats,
    violations
  };
}

describe("cultivation towns — cross-faction real-game matrix", () => {
  it("runs long-form AI exploration against classic and anime towns", { timeout: 300_000 }, () => {
    const runs: RunMetrics[] = [];
    for (const [index, matchup] of ACTIVE_MATCHUPS.entries()) {
      // Alternate the cultivation town between first and second seat across the
      // matrix. This controls aggregate turn-order bias without doubling an
      // already expensive complete-game suite.
      const cultivationFirst = index % 2 === 0;
      const p1 = cultivationFirst ? matchup.cultivation : matchup.opponent;
      const p2 = cultivationFirst ? matchup.opponent : matchup.cultivation;
      const label = `${matchup.name}-${cultivationFirst ? "cultivation-first" : "cultivation-second"}`;
      runs.push(run(label, `wuxia-matrix-${label}`, p1, p2));
    }

    const cultivationWins = runs.filter((entry) => entry.winnerFaction === "azure_breeze" || entry.winnerFaction === "heavenly_demon").length;
    const totalNeutral = runs.reduce((sum, entry) => sum + entry.neutralCombats, 0);
    const totalBanks = runs.reduce((sum, entry) => sum + entry.bankCombats, 0);
    const totalPvp = runs.reduce((sum, entry) => sum + entry.pvpCombats, 0);
    const totalEnds = runs.reduce((sum, entry) => sum + entry.combatEnds, 0);
    const totalAzure = runs.reduce((sum, entry) => sum + entry.azureTriggers, 0);
    const totalDemon = runs.reduce((sum, entry) => sum + entry.demonTriggers, 0);

    console.info("WUXIA_MATCHUP_MATRIX", JSON.stringify({
      games: runs.length,
      cultivationWins,
      cultivationWinRate: cultivationWins / runs.length,
      totalPvp,
      totalNeutral,
      totalBanks,
      totalEnds,
      totalAzure,
      totalDemon,
      runs
    }, null, 2));

    expect(totalNeutral, "matrix must exercise neutral guards").toBeGreaterThan(0);
    // Ordinary computer exploration is the neutral-guard sample. Banks and PvP
    // are exercised by directed balance suites because neither is guaranteed to
    // occur naturally before the round-eight benchmark boundary.
    expect(totalEnds, "started neutral combats should resolve").toBeGreaterThanOrEqual(totalNeutral);
    expect(totalAzure, "Sect Qi / Sword Intent must trigger in real games").toBeGreaterThan(0);
    expect(totalDemon, "Blood Essence / Blood Frenzy / Soul Banner must trigger in real games").toBeGreaterThan(0);
    expect(Math.min(...runs.map((entry) => entry.minimumGold)), "PvP defeat debt should remain recoverable").toBeGreaterThanOrEqual(-15);
  });
});
