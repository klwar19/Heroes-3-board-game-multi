import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  computerDecisionOwner,
  createCombatSandboxLobbyState,
  getLegalActions,
  standardComputerController,
  type CombatSandboxSeatConfig,
  type FactionId,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import { driveComputerPlayers } from "./computer-runner";

const LEGACY_SIM_TOWNS = [
  "castle",
  "rampart",
  "tower",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "conflux",
  "cove"
] as const satisfies readonly FactionId[];

const RIVALS = LEGACY_SIM_TOWNS.filter((factionId) => factionId !== "inferno");
const RIVAL_FILTER = process.env.INFERNO_SIM_RIVAL as (typeof RIVALS)[number] | undefined;
const ACTIVE_RIVALS = RIVAL_FILTER && RIVALS.includes(RIVAL_FILTER) ? [RIVAL_FILTER] : RIVALS;
const RUNS_PER_SEAT = Math.max(1, Math.floor(Number(process.env.INFERNO_SIM_RUNS_PER_SEAT ?? 1)) || 1);
const ATTACKER_BACKLINE = [16, 17, 18, 19];
const DEFENDER_BACKLINE = [0, 1, 2, 3];

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Exactly one reinforced Bronze, two reinforced Silver, and two reinforced Gold stacks. */
function fiveStackLineup(factionId: FactionId) {
  const roster = coreFactionDefinitions[factionId].units
    .map((id) => coreUnitDefinitions[id])
    .filter(Boolean);
  const bronze = roster.filter((unit) => unit.tier === "bronze" && unit.pack);
  const silver = roster.filter((unit) => unit.tier === "silver" && unit.pack);
  const gold = roster.filter((unit) => unit.tier === "gold" && unit.pack);
  expect(bronze.length, `${factionId} needs a third Bronze unit`).toBeGreaterThanOrEqual(3);
  expect(silver.length, `${factionId} needs two Silver units`).toBeGreaterThanOrEqual(2);
  expect(gold.length, `${factionId} needs two Gold units`).toBeGreaterThanOrEqual(2);
  return [bronze[2], ...silver.slice(0, 2), ...gold.slice(0, 2)].map((unit) => ({
    unitDefId: unit.id,
    side: "pack" as const
  }));
}

const DIVERSE_SPELLS = [
  "spell.magic_arrow",
  "spell.bloodlust",
  "spell.inferno",
  "spell.lightning_bolt",
  "spell.stone_skin",
  "spell.cure",
  "spell.fortune",
  "spell.sorrow",
  "spell.slayer"
] as const;
const DIVERSE_ARTIFACTS = [
  "artifact.centaurs_axe",
  "artifact.buckler_of_the_gnoll_king",
  "artifact.breastplate_of_petrified_wood",
  "artifact.ogres_club_of_havoc",
  "artifact.titans_gladius",
  "artifact.hourglass_of_the_evil_hour"
] as const;
const DIVERSE_ABILITIES = [
  "ability.offense",
  "ability.armorer",
  "ability.archery",
  "ability.resistance",
  "ability.sorcery",
  "ability.luck"
] as const;

function cycle<T>(items: readonly T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length];
}

function isCombatPlayable(cardId: string): boolean {
  const card = cardLibrary[cardId];
  return Boolean(
    card?.implementationStatus === "implemented" &&
    (card.phaseLimit?.includes("combat") || card.phaseLimit?.includes("reaction"))
  );
}

/**
 * A deterministic but diverse level-V kit. Across successive samples it uses
 * every hero, 0/1/2 available specialties, printed starting-stat proportions,
 * Magic Arrow and eight other spells, combat abilities, and legacy artifacts.
 */
function heroKit(
  factionId: FactionId,
  playerId: PlayerId,
  sample: number,
  seatSalt: number
): CombatSandboxSeatConfig {
  const faction = coreFactionDefinitions[factionId];
  const hero = coreHeroDefinitions[cycle(faction.heroes, sample + seatSalt)];
  expect(hero, `${factionId} needs a hero`).toBeTruthy();
  const weightedStats = Object.entries(hero.startingStats).flatMap(([stat, count]) =>
    Array.from({ length: count }, () => `stat.${stat}`)
  );
  const primarySpell = sample % 4 === 0
    ? "spell.magic_arrow"
    : cycle(DIVERSE_SPELLS, sample * 3 + seatSalt);
  const secondarySpell = cycle(DIVERSE_SPELLS, sample * 5 + seatSalt + 1);
  const printedAbility = isCombatPlayable(hero.startingAbilityCardId)
    ? hero.startingAbilityCardId
    : cycle(DIVERSE_ABILITIES, sample + seatSalt);
  const specialtyCount = sample % 4 === 0 ? 0 : sample % 4 === 3 ? 2 : 1;
  const specialties = hero.specialtyCardIds
    ? [hero.specialtyCardIds[1], hero.specialtyCardIds[4]].slice(
        specialtyCount === 1 && sample % 2 === 0 ? 1 : 0,
        specialtyCount === 1 && sample % 2 === 0 ? 2 : specialtyCount
      )
    : [];
  const required = [
    primarySpell,
    cycle(weightedStats, sample + seatSalt),
    printedAbility,
    cycle(DIVERSE_ARTIFACTS, sample * 7 + seatSalt)
  ];
  const extras = [
    ...specialties,
    secondarySpell,
    cycle(weightedStats, sample * 2 + seatSalt + 1),
    cycle(DIVERSE_ABILITIES, sample * 3 + seatSalt + 1),
    cycle(DIVERSE_ARTIFACTS, sample * 5 + seatSalt + 1)
  ];
  const hand = [...required];
  for (const cardId of extras) {
    if (hand.length >= 6) break;
    if (!hand.includes(cardId)) hand.push(cardId);
  }
  for (let offset = 0; hand.length < 6; offset += 1) {
    const fallback = cycle(DIVERSE_SPELLS, sample + seatSalt + offset);
    if (!hand.includes(fallback)) hand.push(fallback);
  }
  for (const cardId of hand) expect(cardLibrary[cardId], cardId).toBeTruthy();
  return {
    playerId,
    name: `${hero.name} (${faction.name})`,
    factionId,
    heroDefId: hero.id,
    heroLevel: 5,
    units: fiveStackLineup(factionId),
    hand,
    deck: [],
    morale: 0,
    moraleCards: { positive: [], negative: [] },
    commanderGrades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 },
    commanderGradePoints: 0
  };
}

function prepareBattle(seed: string, p1Faction: FactionId, p2Faction: FactionId, sample: number): GameState {
  let state = createCombatSandboxLobbyState(seed);
  state.sessionMode = "single-player";
  state.controllers = { p1: standardComputerController(), p2: standardComputerController() };
  state = applyOk(state, {
    type: "SANDBOX_SET_OPTIONS",
    playerId: "p1",
    options: {
      playMode: "legacy",
      boardArtId: "classic",
      obstacles: [],
      moraleCards: false,
      wog: { enabled: false, commanders: false, artifacts: false, newObjects: false }
    }
  });
  for (const [playerId, factionId] of [["p1", p1Faction], ["p2", p2Faction]] as const) {
    const { playerId: _seatPlayerId, ...seat } = heroKit(
      factionId,
      playerId,
      sample,
      playerId === "p1" ? 0 : 11
    );
    state = applyOk(state, {
      type: "SANDBOX_CONFIGURE_SEAT",
      playerId: "p1",
      seatId: playerId,
      ...seat
    });
  }
  return applyOk(state, { type: "SANDBOX_BEGIN_COMBAT", playerId: "p1" });
}

function runBattle(seed: string, p1Faction: FactionId, p2Faction: FactionId, sample: number) {
  let state = prepareBattle(seed, p1Faction, p2Faction, sample);
  let decisions = 0;
  let batchLimitHits = 0;

  // Let both computer seats deploy one decision at a time so the settled
  // formation can be inspected before the first activation changes it.
  for (let guard = 0; guard < 80 && state.phase === "combat-setup"; guard += 1) {
    const result = driveComputerPlayers(state, undefined, { maxSteps: 1 });
    expect(result.decisions.length, `${seed}: deployment stalled: ${result.reason ?? "unknown"}`).toBe(1);
    state = result.state;
    decisions += 1;
  }
  expect(["combat", "reaction"], `${seed}: deployment did not finish`).toContain(state.phase);
  expect(state.ruleset).toBe("legacy");
  expect(state.heroes.hero_p1.level).toBe(5);
  expect(state.heroes.hero_p2.level).toBe(5);

  const deployed = Object.values(state.combat!.units).map((unit) => ({
    controllerId: unit.controllerId,
    type: unit.type,
    position: unit.position
  }));
  for (const playerId of ["p1", "p2"] as const) {
    const backline = playerId === state.combat!.attackerPlayerId ? ATTACKER_BACKLINE : DEFENDER_BACKLINE;
    const shooters = deployed.filter((unit) => unit.controllerId === playerId && unit.type === "ranged");
    for (const shooter of shooters) {
      expect(backline, `${seed}: ${playerId} left a shooter exposed at ${shooter.position}`).toContain(shooter.position);
    }
    if (shooters.length <= 2) {
      for (const shooter of shooters) {
        expect(shooter.position % 4 === 0 || shooter.position % 4 === 3,
          `${seed}: ${playerId} shooter should occupy a protected corner`).toBe(true);
      }
    }
  }

  for (let roundGuard = 0; roundGuard < 200 && !state.combat?.outcome; roundGuard += 1) {
    // Large Monte Carlo batches occasionally produce a long chain of legal
    // reactions/secondary attacks. Keep the engine's cycle guards, but allow
    // more than the live server's conservative one-batch action budget.
    const result = driveComputerPlayers(state, undefined, { maxSteps: 1024 });
    const reachedBatchLimit =
      result.stalled &&
      result.decisions.length === 1024 &&
      result.reason?.includes("action safety limit");
    const stalledState = result.state;
    const decisionOwner = computerDecisionOwner(stalledState);
    const ownerActions = decisionOwner ? getLegalActions(stalledState, decisionOwner).map((entry) => entry.action) : [];
    expect(result.stalled && !reachedBatchLimit, `${seed}: ${result.reason ?? "computer stalled"} ${JSON.stringify({
      phase: stalledState.phase,
      activePlayerId: stalledState.activePlayerId,
      priorityPlayerId: stalledState.priorityPlayerId,
      decisionOwner,
      activeUnitId: stalledState.combat?.activeUnitId,
      outcome: stalledState.combat?.outcome,
      pendingNeutralStep: stalledState.combat?.pendingNeutralStep,
      awaitingContinue: stalledState.combat?.awaitingContinue,
      setup: stalledState.combat?.setup,
      pendingTacticsSwaps: stalledState.combat?.pendingTacticsSwaps,
      pendingCommanderPlacement: stalledState.combat?.pendingCommanderPlacement,
      pendingNeutralPlacement: stalledState.combat?.pendingNeutralPlacement,
      pendingCoverOfDarkness: stalledState.combat?.pendingCoverOfDarkness,
      pendingShackles: stalledState.combat?.pendingShackles,
      pendingChoice: stalledState.pendingChoice?.type,
      reactionWindow: stalledState.reactionWindow?.id,
      ownerActions,
      acceptedActions: result.decisions.slice(-20).map((decision) => decision.action)
    })}`).toBe(false);
    state = result.state;
    decisions += result.decisions.length;
    if (state.combat?.outcome) break;
    // A safety-limit result still contains 1,024 valid, progressive actions.
    // Continue it in a fresh guarded batch rather than misclassifying the
    // unusually long battle as a loss or dropping the sample.
    if (reachedBatchLimit) {
      batchLimitHits += 1;
      const actionCounts = Object.entries(result.decisions.reduce<Record<string, number>>((counts, decision) => {
        const action = decision.action as GameAction & { cardId?: string };
        const key = `${action.type}${action.cardId ? `:${action.cardId}` : ""}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}));
      expect(batchLimitHits, `${seed}: repeated 1,024-action batches indicate a policy cycle ${JSON.stringify({
        phase: state.phase,
        round: state.combat?.round,
        activeUnitId: state.combat?.activeUnitId,
        actionCounts
      })}`).toBeLessThan(4);
      continue;
    }
    const owner = state.activePlayerId;
    const nextRound = getLegalActions(state, owner).find(
      (entry) => entry.action.type === "END_COMBAT_ROUND"
    );
    expect(nextRound, `${seed}: round ${state.combat?.round} has no continuation`).toBeTruthy();
    state = applyOk(state, nextRound!.action);
  }

  const cardsPlayed = state.eventLog.filter((event) => event.type === "CARD_PLAYED");
  const spellsCast = state.eventLog.filter((event) => event.type === "SPELL_CAST_RESOLVED");
  const defends = state.eventLog.filter((event) => event.type === "UNIT_DEFENDED");
  return {
    // A player-vs-player fight can be a mathematical stalemate when the last
    // surviving stacks cannot pierce one another's Defense. After 200 complete
    // rounds classify it as a draw; never award it to either side.
    winner: state.combat?.outcome?.winnerPlayerId ?? null,
    decisions,
    rounds: state.combat!.round,
    cardsPlayed: cardsPlayed.length,
    spellsCast: spellsCast.length,
    defends: defends.length,
    heroes: [state.players.p1.heroDefId, state.players.p2.heroDefId].filter(
      (heroId): heroId is string => Boolean(heroId)
    )
  };
}

describe("Inferno legacy five-stack battle simulation", () => {
  it("fights every other classic town from both seats with proper armies, formations, heroes, and card play", () => {
    const wins = Object.fromEntries(LEGACY_SIM_TOWNS.map((town) => [town, 0])) as Record<FactionId, number>;
    const matchup = Object.fromEntries(
      ACTIVE_RIVALS.map((rival) => [rival, {
        battles: 0,
        infernoWins: 0,
        draws: 0,
        attackingWins: 0,
        defendingWins: 0,
        totalRounds: 0,
        totalDecisions: 0,
        cardsPlayed: 0,
        spellsCast: 0,
        defends: 0,
        heroes: new Set<string>()
      }])
    ) as Record<(typeof RIVALS)[number], {
      battles: number;
      infernoWins: number;
      draws: number;
      attackingWins: number;
      defendingWins: number;
      totalRounds: number;
      totalDecisions: number;
      cardsPlayed: number;
      spellsCast: number;
      defends: number;
      heroes: Set<string>;
    }>;
    let totalCardsPlayed = 0;
    let totalSpellsCast = 0;

    for (const rival of ACTIVE_RIVALS) {
      for (const swapped of [false, true]) {
        for (let sample = 0; sample < RUNS_PER_SEAT; sample += 1) {
          const p1Faction = swapped ? rival : "inferno";
          const p2Faction = swapped ? "inferno" : rival;
          const result = runBattle(
            `inferno-legacy-${rival}-${swapped ? "away" : "home"}-${sample}`,
            p1Faction,
            p2Faction,
            sample
          );
          const winningFaction = result.winner === "p1" ? p1Faction : result.winner === "p2" ? p2Faction : null;
          if (winningFaction) wins[winningFaction] += 1;
          totalCardsPlayed += result.cardsPlayed;
          totalSpellsCast += result.spellsCast;
          matchup[rival].battles += 1;
          matchup[rival].totalRounds += result.rounds;
          matchup[rival].totalDecisions += result.decisions;
          matchup[rival].cardsPlayed += result.cardsPlayed;
          matchup[rival].spellsCast += result.spellsCast;
          matchup[rival].defends += result.defends;
          result.heroes.forEach((heroId) => matchup[rival].heroes.add(heroId));
          if (!winningFaction) matchup[rival].draws += 1;
          if (winningFaction === "inferno") {
            matchup[rival].infernoWins += 1;
            if (swapped) matchup[rival].defendingWins += 1;
            else matchup[rival].attackingWins += 1;
          }
        }
      }
    }

    const totalBattles = ACTIVE_RIVALS.length * RUNS_PER_SEAT * 2;
    expect(Object.values(matchup).reduce((sum, row) => sum + row.battles, 0)).toBe(totalBattles);
    expect(totalCardsPlayed, "heroes should use their specialties/abilities/artifacts when tactically useful").toBeGreaterThan(0);
    expect(totalSpellsCast, "level-V heroes should actually cast spells").toBeGreaterThan(0);
    // Stable, compact output for a human-requested simulation run.
    console.info("INFERNO_LEGACY_SIMULATION", JSON.stringify({
      runsPerSeat: RUNS_PER_SEAT,
      totalBattles,
      matchup: Object.fromEntries(Object.entries(matchup).map(([rival, row]) => [rival, {
        ...row,
        heroes: [...row.heroes].sort()
      }])),
      wins,
      totalCardsPlayed,
      totalSpellsCast
    }));
  }, 900_000);
});
