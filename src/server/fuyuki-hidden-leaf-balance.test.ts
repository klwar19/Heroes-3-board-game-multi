import { describe, expect, it } from "vitest";

import { coreFactionDefinitions } from "@/data/factions/core";
import type { CreatureBankId } from "@/data/map/creature-banks";
import {
  createInitialGameState,
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  applyAction,
  getLegalActions,
  makeCombatUnitFromArmy,
  standardComputerController,
  type FactionId,
  type GameState,
  type PlayerId,
} from "@/engine";
import { getMainHero, placeCreatureBank } from "@/engine/adventure";
import { startNeutralEncounter } from "@/engine/adventure-reducer";
import { driveComputerPlayers } from "./computer-runner";
import { playUntilRound } from "./single-player-soak-helpers";

const FEATURED: Record<"fuyuki" | "hidden_leaf", string[]> = {
  // One upper-bronze, one upper-silver and one upper-gold Pack: the smallest
  // lineup that exercises each town's combat identity without deployment noise.
  fuyuki: ["fuyuki.lancers", "fuyuki.archers", "fuyuki.berserkers"],
  hidden_leaf: [
    "hidden_leaf.anbu",
    "hidden_leaf.jonin",
    "hidden_leaf.hokage_vanguard",
  ],
};

const P1_IDS = ["unit_p1_marksmen", "unit_p1_griffins", "unit_p1_crusaders"];
const P2_IDS = [
  "unit_p2_skeletons",
  "unit_p2_vampires",
  "unit_p2_dread_knights",
];
const P1_POSITIONS = [1, 7, 13];
const P2_POSITIONS = [6, 12, 18];

function lineup(factionId: FactionId): string[] {
  if (factionId === "fuyuki" || factionId === "hidden_leaf")
    return FEATURED[factionId];
  const ids = coreFactionDefinitions[factionId].units;
  return [ids[2], ids[4], ids[6]];
}

function installLineup(
  state: GameState,
  playerId: PlayerId,
  factionId: FactionId,
  unitIds: string[],
  positions: number[],
  definitionIds = lineup(factionId),
): void {
  state.players[playerId].factionId = factionId;
  const units = definitionIds.map((unitDefId, index) => {
    const unit = makeCombatUnitFromArmy(
      { id: `army-${playerId}-${index}`, unitDefId, side: "pack" },
      playerId,
      unitIds[index],
      positions[index],
      "binh",
    );
    expect(unit, unitDefId).toBeTruthy();
    return unit!;
  });
  for (const unit of units) state.combat!.units[unit.id] = unit;
}

function runBattle(
  seed: string,
  p1Faction: FactionId,
  p2Faction: FactionId,
  p1Definitions = lineup(p1Faction),
  p2Definitions = lineup(p2Faction),
) {
  const state = createInitialGameState(seed);
  state.sessionMode = "single-player";
  state.controllers = {
    p1: standardComputerController(),
    p2: standardComputerController(),
  };
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.morale = 0;
  state.players.p2.morale = 0;
  installLineup(state, "p1", p1Faction, P1_IDS, P1_POSITIONS, p1Definitions);
  installLineup(state, "p2", p2Faction, P2_IDS, P2_POSITIONS, p2Definitions);
  for (const unit of Object.values(state.combat!.units))
    unit.activatedThisRound = false;
  const first = Object.values(state.combat!.units).sort(
    (left, right) =>
      right.initiative - left.initiative || left.id.localeCompare(right.id),
  )[0];
  state.combat!.activeUnitId = first.id;
  state.activePlayerId = first.controllerId;

  let current = state;
  let decisions = 0;
  for (
    let roundGuard = 0;
    roundGuard < 20 && !current.combat?.outcome;
    roundGuard += 1
  ) {
    const result = driveComputerPlayers(current);
    expect(result.stalled, `${seed}: ${result.reason ?? "stalled"}`).toBe(
      false,
    );
    current = result.state;
    decisions += result.decisions.length;
    if (current.combat?.outcome) break;
    const owner = current.activePlayerId;
    const nextRound = getLegalActions(current, owner).find(
      (entry) => entry.action.type === "END_COMBAT_ROUND",
    );
    expect(
      nextRound,
      `${seed}: round ${current.combat?.round} has no continuation`,
    ).toBeTruthy();
    const advanced = applyAction(current, nextRound!.action);
    expect(
      advanced.errors,
      `${seed}: ${advanced.errors.map((error) => error.message).join("; ")}`,
    ).toEqual([]);
    current = advanced.state;
  }
  const outcome = current.combat?.outcome;
  expect(
    outcome,
    `${seed}: combat must reach an outcome ${JSON.stringify({
      phase: current.phase,
      activePlayerId: current.activePlayerId,
      activeUnitId: current.combat?.activeUnitId,
      round: current.combat?.round,
      decisions,
    })}`,
  ).toBeTruthy();
  return { winner: outcome!.winnerPlayerId, decisions, state: current };
}

const HIDDEN_GOLD = [
  "hidden_leaf.jinchuriki",
  "hidden_leaf.susanoo",
  "hidden_leaf.hokage_vanguard",
] as const;

const FUYUKI_COMPETITIVE = ["fuyuki.riders", "fuyuki.casters", "fuyuki.sabers"];

const HIDDEN_GOLD_PAIRS = [
  [HIDDEN_GOLD[0], HIDDEN_GOLD[1]],
  [HIDDEN_GOLD[0], HIDDEN_GOLD[2]],
  [HIDDEN_GOLD[1], HIDDEN_GOLD[2]],
] as const;

const CLASSIC_RIVALS = [
  "castle",
  "rampart",
  "tower",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "conflux",
] as const;

function upperCoreLineup(factionId: FactionId): string[] {
  const ids = coreFactionDefinitions[factionId].units;
  return [ids[4], ids[5], ids[6]];
}

function hiddenPairLineup(pair: readonly [string, string]): string[] {
  return ["hidden_leaf.giant_toad", ...pair];
}

type CombatEndedEvent = Extract<
  GameState["eventLog"][number],
  { type: "COMBAT_ENDED" }
>;

function lastCombatEnd(state: GameState): CombatEndedEvent | undefined {
  for (let index = state.eventLog.length - 1; index >= 0; index -= 1) {
    const event = state.eventLog[index];
    if (event.type === "COMBAT_ENDED") return event;
  }
  return undefined;
}

function prepareHiddenLeafEncounter(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    playerCount: 2,
    sessionMode: "single-player",
    anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, isekaiTowns: true },
    controllers: { p1: standardComputerController() },
    players: [
      {
        id: "p1",
        name: "Naruto",
        factionId: "hidden_leaf",
        heroDefId: "naruto",
      },
      {
        id: "p2",
        name: "Catherine",
        factionId: "castle",
        heroDefId: "catherine",
      },
    ],
  });
  state.players.p1.hand = [];
  state.players.p1.needsHandRefresh = false;
  state.players.p1.canMulligan = false;
  state.players.p1.army = [
    { id: "leaf-anbu", unitDefId: "hidden_leaf.anbu", side: "pack" },
    { id: "leaf-jonin", unitDefId: "hidden_leaf.jonin", side: "pack" },
    {
      id: "leaf-hokage",
      unitDefId: "hidden_leaf.hokage_vanguard",
      side: "pack",
    },
  ];
  // Disable the general AI opening-fight assistance: these are genuine fights.
  state.computerGuaranteedWins = { p1: 2 };
  return state;
}

function runHiddenLeafEncounter(
  seed: string,
  encounter: { difficulty: number } | { bankId: CreatureBankId },
) {
  const state = prepareHiddenLeafEncounter(seed);
  const hero = getMainHero(state, "p1")!;
  hero.level = "difficulty" in encounter ? encounter.difficulty : 7;
  hero.spaceId = "balance-field";
  state.adventure!.fields["balance-field"] = {
    spaceId: "balance-field",
    tileInstanceId: "balance-tile",
    slot: 0,
    location: "blocked_field",
    ...("difficulty" in encounter
      ? {
          location: "treasure_symbol" as const,
          difficulty: encounter.difficulty,
        }
      : {}),
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
  };
  if ("bankId" in encounter) {
    expect(
      placeCreatureBank(state, "balance-field", encounter.bankId),
    ).toBeTruthy();
  }
  startNeutralEncounter(state, hero, state.adventure!.fields["balance-field"]);
  expect(state.combat?.context.kind).toBe("neutral");

  // Advance one computer decision at a time and stop as soon as the encounter's
  // own combat/reward pipeline settles. This prevents later map movement from
  // muddying assertions about the synthetic field placed under the hero.
  let current = state;
  let decisions = 0;
  let combatEnd: CombatEndedEvent | undefined;
  for (let guard = 0; guard < 700; guard += 1) {
    const result = driveComputerPlayers(current, undefined, { maxSteps: 1 });
    current = result.state;
    decisions += result.decisions.length;
    combatEnd = lastCombatEnd(current);
    const won = combatEnd?.winnerPlayerId === "p1";
    const fieldSettled =
      current.adventure!.fields["balance-field"].blackCube === won;
    const rewardSettled =
      !current.adventure?.pendingVisit &&
      current.adventure?.rewardQueue.length === 0;
    if (
      combatEnd &&
      !current.combat &&
      fieldSettled &&
      rewardSettled &&
      !current.pendingChoice
    )
      break;
    expect(
      result.decisions.length,
      `${seed}: ${result.reason ?? "no computer progress"}`,
    ).toBeGreaterThan(0);
  }
  expect(combatEnd, `${seed}: combat did not finish`).toBeTruthy();
  expect(current.combat, `${seed}: result was not acknowledged`).toBeNull();
  return {
    state: current,
    won:
      combatEnd?.type === "COMBAT_ENDED" && combatEnd.winnerPlayerId === "p1",
    decisions,
  };
}

describe("Fuyuki / Hidden Leaf — actual AI battle balance", () => {
  it("seat-swapped mixed-tier matches finish and neither town sweeps the series", () => {
    const wins = { fuyuki: 0, hidden_leaf: 0 };
    let commandSealEvents = 0;
    for (let index = 0; index < 12; index += 1) {
      const swapped = index % 2 === 1;
      const p1Faction = swapped ? "hidden_leaf" : "fuyuki";
      const p2Faction = swapped ? "fuyuki" : "hidden_leaf";
      const result = runBattle(
        `fuyuki-leaf-battle-${index}`,
        p1Faction,
        p2Faction,
      );
      expect(result.decisions).toBeGreaterThan(5);
      if (result.winner === "p1") wins[p1Faction] += 1;
      if (result.winner === "p2") wins[p2Faction] += 1;
      commandSealEvents += result.state.eventLog.filter(
        (event) =>
          event.type === "FACTION_MECHANIC_TRIGGERED" &&
          event.mechanicId.startsWith("command-seal."),
      ).length;
    }
    expect(wins.fuyuki, JSON.stringify(wins)).toBeGreaterThanOrEqual(3);
    expect(wins.hidden_leaf, JSON.stringify(wins)).toBeGreaterThanOrEqual(3);
    expect(
      commandSealEvents,
      "the Fuyuki AI should actually spend Command Seals",
    ).toBeGreaterThan(0);
  });

  it.each([
    ["fuyuki", "castle"],
    ["hidden_leaf", "castle"],
    ["fuyuki", "necropolis"],
    ["hidden_leaf", "necropolis"],
  ] as const)(
    "%s mixed-tier Pack lineup completes battles against %s from both seats",
    (animeFaction, coreFaction) => {
      for (const swapped of [false, true]) {
        const p1Faction = swapped ? coreFaction : animeFaction;
        const p2Faction = swapped ? animeFaction : coreFaction;
        const result = runBattle(
          `balance-${animeFaction}-${coreFaction}-${swapped}`,
          p1Faction,
          p2Faction,
        );
        expect(["p1", "p2"]).toContain(result.winner);
      }
    },
  );

  it("tests every legal two-Gold Hidden Leaf formation against every classic town from both seats", () => {
    let leafWins = 0;
    let battles = 0;
    const goldAppearances = new Map(HIDDEN_GOLD.map((id) => [id, 0]));
    for (const pair of HIDDEN_GOLD_PAIRS) {
      for (const id of pair)
        goldAppearances.set(id, (goldAppearances.get(id) ?? 0) + 1);
      for (const rival of CLASSIC_RIVALS) {
        for (const swapped of [false, true]) {
          const leafUnits = hiddenPairLineup(pair);
          const coreUnits = upperCoreLineup(rival);
          const result = swapped
            ? runBattle(
                `leaf-gold-${pair.join("-")}-${rival}-away`,
                rival,
                "hidden_leaf",
                coreUnits,
                leafUnits,
              )
            : runBattle(
                `leaf-gold-${pair.join("-")}-${rival}-home`,
                "hidden_leaf",
                rival,
                leafUnits,
                coreUnits,
              );
          battles += 1;
          if ((result.winner === "p1") !== swapped) leafWins += 1;
          expect(result.decisions).toBeGreaterThan(5);
        }
      }
    }

    expect(battles).toBe(54);
    expect([...goldAppearances.values()]).toEqual([2, 2, 2]);
    // A broad anti-regression gate: a legal premium formation must compete but
    // must not sweep the upper Silver + two-Gold formations of nine towns.
    expect(
      leafWins,
      `Hidden Leaf won ${leafWins}/${battles}`,
    ).toBeGreaterThanOrEqual(9);
    expect(
      leafWins,
      `Hidden Leaf won ${leafWins}/${battles}`,
    ).toBeLessThanOrEqual(45);
  });

  it("runs Fuyuki's mixed-tier Command Seal formation against every classic town from both seats", () => {
    let fuyukiWins = 0;
    for (const rival of CLASSIC_RIVALS) {
      for (const swapped of [false, true]) {
        const result = swapped
          ? runBattle(
              `fuyuki-classic-${rival}`,
              rival,
              "fuyuki",
              lineup(rival),
              FUYUKI_COMPETITIVE,
            )
          : runBattle(
              `fuyuki-classic-${rival}`,
              "fuyuki",
              rival,
              FUYUKI_COMPETITIVE,
              lineup(rival),
            );
        if ((result.winner === "p1") !== swapped) fuyukiWins += 1;
        expect(result.decisions).toBeGreaterThan(5);
      }
    }
    expect(fuyukiWins, `Fuyuki won ${fuyukiWins}/18`).toBeGreaterThanOrEqual(3);
    expect(fuyukiWins, `Fuyuki won ${fuyukiWins}/18`).toBeLessThanOrEqual(15);
  });

  it("exercises every Hidden Leaf unit in lower/mixed-tier formations", () => {
    const profiles = [
      [
        "hidden_leaf.genin_squad",
        "hidden_leaf.medical_nin",
        "hidden_leaf.anbu",
      ],
      ["hidden_leaf.anbu", "hidden_leaf.jonin", "hidden_leaf.giant_toad"],
      ["hidden_leaf.jonin", "hidden_leaf.jinchuriki", "hidden_leaf.susanoo"],
      [
        "hidden_leaf.giant_toad",
        "hidden_leaf.susanoo",
        "hidden_leaf.hokage_vanguard",
      ],
    ];
    const exercised = new Set<string>();
    for (const [index, leafUnits] of profiles.entries()) {
      leafUnits.forEach((id) => exercised.add(id));
      const rival = CLASSIC_RIVALS[index * 2];
      for (const swapped of [false, true]) {
        const result = swapped
          ? runBattle(
              `leaf-roster-${index}-away`,
              rival,
              "hidden_leaf",
              lineup(rival),
              leafUnits,
            )
          : runBattle(
              `leaf-roster-${index}-home`,
              "hidden_leaf",
              rival,
              leafUnits,
              lineup(rival),
            );
        expect(result.decisions).toBeGreaterThan(3);
      }
    }
    expect(exercised).toEqual(
      new Set(coreFactionDefinitions.hidden_leaf.units),
    );
  });

  it("exercises every Fuyuki unit, including both Silver and both Gold choices", () => {
    const profiles = [
      ["fuyuki.assassins", "fuyuki.riders", "fuyuki.lancers"],
      ["fuyuki.lancers", "fuyuki.archers", "fuyuki.sabers"],
      ["fuyuki.riders", "fuyuki.casters", "fuyuki.berserkers"],
      ["fuyuki.casters", "fuyuki.sabers", "fuyuki.berserkers"],
    ];
    const exercised = new Set<string>();
    for (const [index, fuyukiUnits] of profiles.entries()) {
      fuyukiUnits.forEach((id) => exercised.add(id));
      const rival = CLASSIC_RIVALS[index * 2 + 1];
      for (const swapped of [false, true]) {
        const result = swapped
          ? runBattle(
              `fuyuki-roster-${index}-away`,
              rival,
              "fuyuki",
              lineup(rival),
              fuyukiUnits,
            )
          : runBattle(
              `fuyuki-roster-${index}-home`,
              "fuyuki",
              rival,
              fuyukiUnits,
              lineup(rival),
            );
        expect(result.decisions).toBeGreaterThan(3);
      }
    }
    expect(exercised).toEqual(new Set(coreFactionDefinitions.fuyuki.units));
  });

  it("fights genuine Neutral guards across the full mission-point bands", () => {
    const expectedPoints = new Map([
      [1, 1],
      [3, 2],
      [5, 2],
      [6, 3],
      [7, 3],
    ]);
    let wins = 0;
    for (const difficulty of expectedPoints.keys()) {
      const result = runHiddenLeafEncounter(`leaf-neutral-${difficulty}`, {
        difficulty,
      });
      expect(result.decisions).toBeGreaterThan(2);
      const points = result.state.players.p1.hiddenLeafMissionPoints ?? 0;
      expect(points).toBe(result.won ? expectedPoints.get(difficulty) : 0);
      expect(result.state.adventure!.fields["balance-field"].blackCube).toBe(
        result.won,
      );
      if (result.won) wins += 1;
    }
    expect(
      wins,
      `Hidden Leaf won ${wins}/${expectedPoints.size} Neutral guard bands`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("resolves representative Near/Far Creature Banks with rewards and Mission Rank cleanup", () => {
    const banks: CreatureBankId[] = [
      "imp_cache",
      "crypt",
      "dragon_fly_hive",
      "shipwreck",
      "naga_bank",
      "dragon_utopia",
    ];
    let wins = 0;
    for (const bankId of banks) {
      const result = runHiddenLeafEncounter(`leaf-bank-${bankId}`, { bankId });
      expect(result.decisions).toBeGreaterThan(2);
      const field = result.state.adventure!.fields["balance-field"];
      expect(
        field.blackCube,
        `${bankId}: won=${result.won}, decisions=${result.decisions}`,
      ).toBe(result.won);
      expect(result.state.players.p1.hiddenLeafMissionPoints ?? 0).toBe(
        result.won ? 2 : 0,
      );
      expect(result.state.players.p1.bankWins ?? 0).toBe(result.won ? 1 : 0);
      if (result.won) wins += 1;
    }
    expect(
      wins,
      `Hidden Leaf won ${wins}/${banks.length} banks`,
    ).toBeGreaterThanOrEqual(1);
    expect(wins, `Hidden Leaf won ${wins}/${banks.length} banks`).toBeLessThan(
      banks.length,
    );
  });

  it("two seat-swapped adventure games reach round 5 without stalls or resource violations", () => {
    for (const swapped of [false, true]) {
      const result = playUntilRound(
        createAdventureGameState({
          seed: `fuyuki-leaf-game-${swapped}`,
          scenarioId: "skirmish",
          playerCount: 2,
          sessionMode: "single-player",
          ruleset: "binh",
          anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, isekaiTowns: true },
          players: swapped
            ? [
                {
                  id: "p1",
                  name: "Naruto",
                  factionId: "hidden_leaf",
                  heroDefId: "naruto",
                },
                {
                  id: "p2",
                  name: "Shirou",
                  factionId: "fuyuki",
                  heroDefId: "shirou_emiya",
                },
              ]
            : [
                {
                  id: "p1",
                  name: "Shirou",
                  factionId: "fuyuki",
                  heroDefId: "shirou_emiya",
                },
                {
                  id: "p2",
                  name: "Naruto",
                  factionId: "hidden_leaf",
                  heroDefId: "naruto",
                },
              ],
        }),
        5,
        { maxLoops: 900 },
      );
      expect(result.stalled, result.reason).toBe(false);
      expect(result.violations).toEqual([]);
      expect(
        result.state.round >= 5 ||
          result.state.phase === "game-over" ||
          Boolean(result.state.adventure?.winnerPlayerId),
      ).toBe(true);
    }
  });

  it.each([
    ["fuyuki", "shirou_emiya", "castle", "catherine"],
    ["fuyuki", "rin_tohsaka", "tower", "solmyr"],
    ["fuyuki", "kiritsugu_emiya", "dungeon", "mutare"],
    ["hidden_leaf", "naruto", "rampart", "gelu"],
    ["hidden_leaf", "sasuke", "necropolis", "sandro"],
    ["hidden_leaf", "kakashi_hatake", "stronghold", "crag_hack"],
  ] as const)(
    "%s and %s complete seat-swapped real games",
    (animeFaction, animeHero, coreFaction, coreHero) => {
      for (const swapped of [false, true]) {
        const players = swapped
          ? [
              {
                id: "p1" as const,
                name: "Core",
                factionId: coreFaction,
                heroDefId: coreHero,
              },
              {
                id: "p2" as const,
                name: "Anime",
                factionId: animeFaction,
                heroDefId: animeHero,
              },
            ]
          : [
              {
                id: "p1" as const,
                name: "Anime",
                factionId: animeFaction,
                heroDefId: animeHero,
              },
              {
                id: "p2" as const,
                name: "Core",
                factionId: coreFaction,
                heroDefId: coreHero,
              },
            ];
        const result = playUntilRound(
          createAdventureGameState({
            seed: `real-game-${animeFaction}-${coreFaction}-${swapped}`,
            scenarioId: "skirmish",
            playerCount: 2,
            sessionMode: "single-player",
            ruleset: "binh",
            anime: {
              ...DEFAULT_ANIME_OPTIONS,
              enabled: true,
              isekaiTowns: true,
            },
            players,
          }),
          5,
          { maxLoops: 900 },
        );
        expect(result.stalled, result.reason).toBe(false);
        expect(result.violations).toEqual([]);
        expect(
          result.state.round >= 5 ||
            result.state.phase === "game-over" ||
            Boolean(result.state.adventure?.winnerPlayerId),
        ).toBe(true);
      }
    },
  );
});
