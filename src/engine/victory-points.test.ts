import { describe, expect, it } from "vitest";
import {
  applyAction,
  computeVictoryPoints,
  createAdventureGameState,
  createAdventureLobbyState,
  declareAdventureWinner,
  describeCustomMapPresetEntries,
  describeVictoryPointObjective,
  eliminatePlayer,
  endGameByVictoryPoints,
  getMainHero,
  MAX_VICTORY_POINT_OBJECTIVES,
  sanitizeCustomMapPreset,
  victoryPointsConfig,
  victoryPointsModeActive,
  type CustomMapPreset,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { beginFieldVisit } from "./adventure";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, CombatUnitState, FactionId, MapFieldState, VictoryPointObjective } from "./state";

type SeatCfg = { id: string; name: string; factionId: FactionId; heroDefId: string };

// ---------------------------------------------------------------------------
// Victory Points mode (designer-toggleable scenario scoring). Every engine
// claim asserts an observable outcome (winnerPlayerId / a scored VP row / the
// VP_SCORING event) and carries a CONTROL (VP off, or a divergent input) that
// fails if the wiring is removed.
//
//   - Round-limit AND victory-condition END triggers (ordered + parallel).
//   - Last-faction-standing: with VP on the game ends SCORED immediately
//     (survivor completes the condition); with VP off it stays an instant win.
//   - The rulebook VP table components (hero defeats, surrenders, buildings,
//     hero level, flagged mines, artifacts) + designer objectives.
//   - Deterministic tie-break; the pure scorer; sanitize/describe.
// ---------------------------------------------------------------------------

const TWO_PLAYERS: SeatCfg[] = [
  { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
];
const THREE_PLAYERS: SeatCfg[] = [
  ...TWO_PLAYERS,
  { id: "p3", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
];

type VpConfig = NonNullable<CustomMapPreset["victoryPoints"]>;

function makeGame(
  opts: {
    seed?: string;
    victoryMode?: "conquest" | "grail" | "dragon-hunt" | "dragon-conqueror";
    players?: SeatCfg[];
    parallelTurns?: number;
    /** Lobby Victory-Points toggle (default absent = off). */
    victoryPoints?: boolean;
    /** Lobby Victory-Points round limit (only meaningful with victoryPoints on). */
    victoryPointsRoundLimit?: number;
    /** A designed map preset carried into the build (for preset-authoritative cases). */
    customMapPreset?: CustomMapPreset | null;
  } = {}
): GameState {
  const state = createAdventureGameState({
    seed: opts.seed ?? "victory-points",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    victoryMode: opts.victoryMode ?? "conquest",
    parallelTurns: opts.parallelTurns ?? 0,
    players: opts.players ?? TWO_PLAYERS,
    ...(opts.victoryPoints !== undefined ? { victoryPoints: opts.victoryPoints } : {}),
    ...(opts.victoryPointsRoundLimit !== undefined
      ? { victoryPointsRoundLimit: opts.victoryPointsRoundLimit }
      : {}),
    ...(opts.customMapPreset !== undefined ? { customMapPreset: opts.customMapPreset } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Inert Astrologers proclamations so even rounds never open a choice/barrier.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers?.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** Force the VP config the engine reads (adventure.mapPreset). */
function setVictoryPoints(state: GameState, config: VpConfig | null, roundLimit?: number): void {
  const preset: CustomMapPreset = { ...(state.adventure!.mapPreset ?? {}) };
  if (config) {
    preset.victoryPoints = config;
  } else {
    delete preset.victoryPoints;
  }
  if (roundLimit !== undefined) {
    preset.roundLimit = roundLimit;
  }
  state.adventure!.mapPreset = preset;
}

/**
 * Strip every base VP confounder so a test's own inputs are the ONLY score
 * source: no town buildings, no artifacts in any card zone, main hero level 1.
 */
function zeroBaseVp(state: GameState): void {
  for (const town of Object.values(state.towns)) {
    town.buildings = [];
  }
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.deck = [];
    player.discard = [];
    player.spellBook = [];
    player.removed = [];
    player.permanents = [];
  }
  for (const hero of Object.values(state.heroes)) {
    if (hero.kind === "main") {
      hero.level = 1;
    }
  }
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function unit(over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }): CombatUnitState {
  return {
    name: "Pikemen",
    cardName: "Few Pikemen",
    variant: "few",
    grade: "bronze",
    type: "ground",
    attack: 1,
    defense: 1,
    maxHealth: 2,
    damage: 0,
    initiative: 1,
    position: 0,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [],
    unitDefId: "castle.pikemen",
    assets: { cardImage: "", imageAlt: "" },
    ...over
  } as CombatUnitState;
}

/**
 * Stage a finished PvP fight (winner attacker, loser defender) and hand it to
 * `finalizeAdventureCombat`. `loserKind` sets whether the beaten hero is a Main
 * or Secondary hero (drives which VP row it grants).
 */
function stagePvpDefeat(
  state: GameState,
  winnerId: PlayerId,
  loserId: PlayerId,
  reason: "all-enemy-units-defeated" | "retreat" | "surrender" | "surrender-secondary",
  loserKind: "main" | "secondary" = "main"
): void {
  const attacker = getMainHero(state, winnerId)!;
  const defender = getMainHero(state, loserId)!;
  defender.kind = loserKind;
  const field: MapFieldState = {
    spaceId: "99,99",
    tileInstanceId: "test-tile",
    slot: 0,
    location: "empty_field",
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  attacker.spaceId = field.spaceId;
  defender.spaceId = field.spaceId;
  state.players[winnerId].army = [{ id: `${winnerId}_a1`, unitDefId: "castle.pikemen", side: "few" }];
  state.players[loserId].army = [{ id: `${loserId}_b1`, unitDefId: "castle.pikemen", side: "few" }];
  state.players[winnerId].resources.gold = 50;
  state.players[loserId].resources.gold = 50;

  state.combat = {
    id: "c1",
    round: 1,
    attackerPlayerId: winnerId,
    defenderPlayerId: loserId,
    activeUnitId: null,
    context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: winnerId, defeatedPlayerId: loserId, reason },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: winnerId, armyUnitId: `${winnerId}_a1`, damage: 0 }),
      b1: unit({ id: "b1", controllerId: loserId, armyUnitId: `${loserId}_b1`, damage: 2, maxHealth: 2 })
    }
  } as CombatState;
}

/** VP row value for a player, or 0 when the label is absent. */
function rowVp(state: GameState, playerId: PlayerId, label: string, completerId: PlayerId | null = null): number {
  const breakdown = computeVictoryPoints(state, { completerId }).breakdown.find((row) => row.playerId === playerId);
  return breakdown?.rows.find((row) => row.label === label)?.vp ?? 0;
}

function totalVp(state: GameState, playerId: PlayerId, completerId: PlayerId | null = null): number {
  return computeVictoryPoints(state, { completerId }).breakdown.find((row) => row.playerId === playerId)?.total ?? 0;
}

const VP_ON: VpConfig = { enabled: true, victoryConditionVp: 3 };

// ===========================================================================
// 1 + 2. END triggers: the round limit (ordered AND parallel wrap).
// ===========================================================================

describe("Round-limit end trigger", () => {
  it("ORDERED: the wrap of the round limit ends the game and scores VP (winner via the real machinery)", () => {
    const state = makeGame();
    setVictoryPoints(state, VP_ON, 1);
    zeroBaseVp(state);
    // p1's main hero is the strongest → p1 is the VP leader at the round limit.
    getMainHero(state, "p1")!.level = 4;

    // Round 1 wraps after both seats end → round 2 starts → VP scoring fires.
    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.adventure?.winnerPlayerId).toBe("p1");
    expect(next.phase).toBe("game-over");
    const scoring = next.eventLog.find((event) => event.type === "VP_SCORING");
    expect(scoring, "VP_SCORING emitted at the round limit").toBeTruthy();
    // The reported winner (match-report seam) IS the VP winner.
    expect(next.eventLog.some((event) => event.type === "GAME_WON" && event.playerId === "p1")).toBe(true);
  });

  it("CONTROL: VP OFF keeps the same round limit a mere suggested length — play continues into round 2", () => {
    const state = makeGame();
    setVictoryPoints(state, null, 1);

    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(next.round).toBe(2);
    expect(next.eventLog.some((event) => event.type === "VP_SCORING")).toBe(false);
  });

  it("PARALLEL: the parallel round wrap at the limit also ends the game by scoring", () => {
    const state = makeGame({ parallelTurns: 6 });
    setVictoryPoints(state, VP_ON, 1);
    zeroBaseVp(state);
    getMainHero(state, "p2")!.level = 5;

    // Both open parallel turns end → the round wraps → scoring fires.
    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.adventure?.winnerPlayerId).toBe("p2");
    expect(next.eventLog.some((event) => event.type === "VP_SCORING")).toBe(true);
  });

  it("CONTROL: with no round limit set, the round wrap does NOT end the game (completion is the only trigger)", () => {
    const state = makeGame();
    setVictoryPoints(state, VP_ON); // no roundLimit

    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(next.round).toBe(2);
  });
});

// ===========================================================================
// 3. Victory-condition completion → SCORING (not an instant win).
// ===========================================================================

describe("Victory-condition completion trigger", () => {
  it("scores the table (completer earns the completion VP) — a DIFFERENT, higher-VP seat wins", () => {
    const state = makeGame({ victoryMode: "grail" });
    setVictoryPoints(state, VP_ON, 20);
    zeroBaseVp(state);
    // p1 will COMPLETE the victory condition (+3), but p2 has a stronger hero.
    getMainHero(state, "p1")!.level = 1; // 1 base + 3 completion = 4
    getMainHero(state, "p2")!.level = 7; // 7 base

    declareAdventureWinner(state, "p1", "carried the Grail home", { viaVictoryCondition: true });

    // Completion did NOT win outright: the most-VP seat (p2) wins.
    expect(state.adventure?.winnerPlayerId).toBe("p2");
    const scoring = state.eventLog.find((event) => event.type === "VP_SCORING");
    expect(scoring?.type === "VP_SCORING" && scoring.completerPlayerId).toBe("p1");
    expect(scoring?.type === "VP_SCORING" && scoring.winnerPlayerId).toBe("p2");
    // p1 really did earn the completion VP row.
    expect(rowVp(state, "p1", "Completed the victory condition", "p1")).toBe(3);
    expect(totalVp(state, "p1", "p1")).toBe(4);
    expect(totalVp(state, "p2", "p1")).toBe(7);
  });

  it("CONTROL: VP OFF → the completer wins INSTANTLY (today's behaviour, no scoring)", () => {
    const state = makeGame({ victoryMode: "grail" });
    zeroBaseVp(state);
    getMainHero(state, "p2")!.level = 7; // would out-score p1 IF scored

    declareAdventureWinner(state, "p1", "carried the Grail home", { viaVictoryCondition: true });

    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.eventLog.some((event) => event.type === "VP_SCORING")).toBe(false);
  });
});

// ===========================================================================
// 4. Last-faction-standing: with VP on the game ends by SCORING right away.
// ===========================================================================

describe("Last-faction-standing under VP mode", () => {
  it("with VP on, defeating every opponent ends the game SCORED — no waiting out the round limit", () => {
    const state = makeGame();
    setVictoryPoints(state, VP_ON, 20);
    zeroBaseVp(state);
    // The dead seat's stats must NOT be scored (it left the table); the survivor
    // is the only live seat and wins with a full breakdown + completion VP.
    getMainHero(state, "p2")!.level = 7;
    getMainHero(state, "p1")!.level = 2;

    eliminatePlayer(state, "p2", "gave up", true);

    expect(state.adventure?.winnerPlayerId).toBe("p1");
    const scoring = state.eventLog.find((event) => event.type === "VP_SCORING");
    expect(scoring, "the table is scored the moment the last opponent falls").toBeTruthy();
    expect(scoring?.type === "VP_SCORING" && scoring.winnerPlayerId).toBe("p1");
    expect(scoring?.type === "VP_SCORING" && scoring.completerPlayerId).toBe("p1");
    if (scoring?.type === "VP_SCORING") {
      // Only the live seat is scored; the eliminated seat's 7 levels are gone.
      expect(scoring.breakdown.map((row) => row.playerId)).toEqual(["p1"]);
      // 2 hero levels + 3 completion VP = 5.
      expect(scoring.breakdown[0].total).toBe(5);
      expect(scoring.breakdown[0].rows).toContainEqual({ label: "Completed the victory condition", vp: 3 });
    }
    expect(state.eventLog.some((event) => event.type === "GAME_WON" && event.playerId === "p1")).toBe(true);
  });

  it("CONTROL: VP OFF → the classic instant last-standing win, no scoring", () => {
    const state = makeGame();
    zeroBaseVp(state);
    getMainHero(state, "p2")!.level = 7;

    eliminatePlayer(state, "p2", "gave up", true);

    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.eventLog.some((event) => event.type === "VP_SCORING")).toBe(false);
    expect(state.eventLog.some((event) => event.type === "GAME_WON" && event.playerId === "p1")).toBe(true);
  });
});

// ===========================================================================
// 5. Rulebook VP table rows, each with a CONTROL.
// ===========================================================================

describe("VP table rows", () => {
  it("defeating a Main hero = 3 VP, ONCE per opponent; a different opponent's main adds another 3", () => {
    const state = makeGame({ players: THREE_PLAYERS });
    zeroBaseVp(state);

    stagePvpDefeat(state, "p1", "p2", "all-enemy-units-defeated", "main");
    finalizeAdventureCombat(state);
    expect(rowVp(state, "p1", "Main Heroes defeated")).toBe(3);

    // Beat the SAME opponent's main again → still 3 (once per opponent).
    stagePvpDefeat(state, "p1", "p2", "retreat", "main");
    finalizeAdventureCombat(state);
    expect(rowVp(state, "p1", "Main Heroes defeated")).toBe(3);

    // A DIFFERENT opponent's main → +3 (now 6).
    stagePvpDefeat(state, "p1", "p3", "all-enemy-units-defeated", "main");
    finalizeAdventureCombat(state);
    expect(rowVp(state, "p1", "Main Heroes defeated")).toBe(6);
    expect(state.adventure?.vpLedger?.p1?.mainHeroDefeats).toEqual(["p2", "p3"]);
  });

  it("defeating a Secondary hero = 1 VP each (CONTROL: a main defeat is not in this row)", () => {
    const state = makeGame();
    zeroBaseVp(state);

    stagePvpDefeat(state, "p1", "p2", "all-enemy-units-defeated", "secondary");
    finalizeAdventureCombat(state);

    expect(rowVp(state, "p1", "Secondary Heroes defeated")).toBe(1);
    expect(rowVp(state, "p1", "Main Heroes defeated")).toBe(0);
  });

  it("a surrender grants the non-surrenderer 1 VP (CONTROL: a real defeat grants the 3-VP main row, not this one)", () => {
    const surrenderGame = makeGame();
    zeroBaseVp(surrenderGame);
    stagePvpDefeat(surrenderGame, "p1", "p2", "surrender", "main");
    finalizeAdventureCombat(surrenderGame);
    expect(rowVp(surrenderGame, "p1", "Heroes surrendered to you")).toBe(1);
    expect(rowVp(surrenderGame, "p1", "Main Heroes defeated")).toBe(0);

    const defeatGame = makeGame();
    zeroBaseVp(defeatGame);
    stagePvpDefeat(defeatGame, "p1", "p2", "retreat", "main");
    finalizeAdventureCombat(defeatGame);
    expect(rowVp(defeatGame, "p1", "Heroes surrendered to you")).toBe(0);
    expect(rowVp(defeatGame, "p1", "Main Heroes defeated")).toBe(3);
  });

  it("buildings in controlled Towns = 1 VP each, capped at 8 (9 buildings → 8)", () => {
    const state = makeGame();
    zeroBaseVp(state);
    // 9 distinct building ids in p1's home Town.
    state.towns.town_p1.buildings = [
      "castle.city_hall",
      "castle.citadel",
      "castle.mage_guild",
      "castle.marketplace",
      "castle.blacksmith",
      "castle.tavern",
      "castle.resource_silo",
      "castle.dwelling_bronze",
      "castle.dwelling_silver"
    ];
    expect(rowVp(state, "p1", "Buildings in controlled Towns")).toBe(8);

    // CONTROL: 3 buildings → 3 (uncapped below the ceiling).
    state.towns.town_p1.buildings = ["castle.city_hall", "castle.citadel", "castle.tavern"];
    expect(rowVp(state, "p1", "Buildings in controlled Towns")).toBe(3);
  });

  it("hero Experience Levels = 1 VP per level (level L → L VP)", () => {
    const state = makeGame();
    zeroBaseVp(state);
    getMainHero(state, "p1")!.level = 5;
    expect(rowVp(state, "p1", "Hero Experience Levels")).toBe(5);
    getMainHero(state, "p1")!.level = 2;
    expect(rowVp(state, "p1", "Hero Experience Levels")).toBe(2);
  });

  it("flagged Mines / Settlements = 1 VP each (CONTROL: an unflagged / enemy-flagged one does not count)", () => {
    const state = makeGame();
    zeroBaseVp(state);
    const addField = (spaceId: string, location: string, flagOwnerId: PlayerId | null) => {
      state.adventure!.fields[spaceId] = {
        spaceId,
        tileInstanceId: `t-${spaceId}`,
        slot: 0,
        location,
        difficulty: undefined,
        blackCube: false,
        flagOwnerId,
        everFlagged: Boolean(flagOwnerId),
        settlementResource: null
      };
    };
    addField("10,10", "mine", "p1");
    addField("11,11", "settlement", "p1");
    addField("12,12", "mine", null); // unflagged — not counted
    addField("13,13", "mine", "p2"); // enemy-flagged — not counted for p1

    expect(rowVp(state, "p1", "Flagged Mines / Settlements")).toBe(2);
    expect(rowVp(state, "p2", "Flagged Mines / Settlements")).toBe(1);
  });

  it("artifacts = 1 VP per 2 (floor), counting both owned zones AND removed-from-play", () => {
    const state = makeGame();
    zeroBaseVp(state);
    // 3 artifacts across owned zones → floor(3/2) = 1.
    state.players.p1.hand = ["artifact.centaurs_axe", "artifact.titans_gladius"];
    state.players.p1.discard = ["artifact.armor_of_wonder"];
    expect(rowVp(state, "p1", "Artifacts (1 VP per 2)")).toBe(1);

    // A 4th artifact REMOVED FROM PLAY still counts → floor(4/2) = 2 (seam test).
    state.players.p1.removed = ["artifact.dragon_wing_tabard"];
    expect(rowVp(state, "p1", "Artifacts (1 VP per 2)")).toBe(2);

    // CONTROL: a non-artifact card in the same zone does NOT count.
    state.players.p1.hand = ["artifact.centaurs_axe"];
    state.players.p1.discard = [];
    state.players.p1.removed = [];
    expect(rowVp(state, "p1", "Artifacts (1 VP per 2)")).toBe(0);
  });
});

// ===========================================================================
// 6. Designer objectives (state-checked + event-based), each met vs unmet.
// ===========================================================================

describe("Designer objectives", () => {
  it("control-towns is scored only when met (met vs unmet CONTROL)", () => {
    const objective: VictoryPointObjective = { kind: "control-towns", vp: 4, count: 2 };
    const label = `${describeVictoryPointObjective(objective)} (objective)`;

    const state = makeGame();
    setVictoryPoints(state, { enabled: true, victoryConditionVp: 0, objectives: [objective] });
    zeroBaseVp(state);
    // p1 controls its home Town + flags an enemy Town field → 2 towns → met.
    const enemyTownField = state.towns.town_p2.fieldId!;
    state.adventure!.fields[enemyTownField].flagOwnerId = "p1";
    expect(rowVp(state, "p1", label)).toBe(4);

    // CONTROL: give the enemy Town's field back → p1 controls only 1 town → unmet.
    state.adventure!.fields[enemyTownField].flagOwnerId = null;
    expect(rowVp(state, "p1", label)).toBe(0);
  });

  it("defeat-dragon-utopia (event-based) scores its recorded defeater, end-to-end", () => {
    const objective: VictoryPointObjective = { kind: "defeat-dragon-utopia", vp: 5 };
    const label = `${describeVictoryPointObjective(objective)} (objective)`;

    // Conquest mode: the Utopia is a plain bank, so its defeat is a real,
    // distinct objective (not the win condition). Drive the real visit.
    const state = makeGame({ victoryMode: "conquest" });
    setVictoryPoints(state, { enabled: true, victoryConditionVp: 0, objectives: [objective] });
    zeroBaseVp(state);
    expect(rowVp(state, "p1", label)).toBe(0); // CONTROL: nobody has defeated one yet

    const hero = getMainHero(state, "p1")!;
    const field: MapFieldState = {
      spaceId: "40,40",
      tileInstanceId: "utopia-tile",
      slot: 0,
      location: "dragon_utopia",
      difficulty: 7,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[field.spaceId] = field;
    hero.spaceId = field.spaceId;
    // The real visit path (after the Utopia's dragons fell) → handleDragonUtopiaVisit.
    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect(state.adventure?.vpLedger?.p1?.utopiaDefeated).toBe(true);
    expect(rowVp(state, "p1", label)).toBe(5);
    expect(rowVp(state, "p2", label)).toBe(0); // p2 defeated none
  });
});

// ===========================================================================
// 7. Deterministic tie-break.
// ===========================================================================

describe("Tie-break", () => {
  it("a tie at the top goes to the victory-condition completer", () => {
    const state = makeGame();
    // Completion VP 0 so the completion itself cannot break the tie.
    setVictoryPoints(state, { enabled: true, victoryConditionVp: 0 });
    zeroBaseVp(state); // both seats identical → exactly tied

    expect(totalVp(state, "p1")).toBe(totalVp(state, "p2"));
    // p2 (second in turn order) completed the condition → p2 wins the tie.
    expect(computeVictoryPoints(state, { completerId: "p2" }).winnerId).toBe("p2");
  });

  it("with no completer, a tie goes to the earliest seat in turn order", () => {
    const state = makeGame();
    setVictoryPoints(state, { enabled: true, victoryConditionVp: 0 });
    zeroBaseVp(state);

    expect(computeVictoryPoints(state, { completerId: null }).winnerId).toBe("p1");
    // End-flow parity: a round-limit end (no completer) declares p1.
    endGameByVictoryPoints(state, { completerId: null, completionReason: "round limit" });
    expect(state.adventure?.winnerPlayerId).toBe("p1");
  });
});

// ===========================================================================
// 8. The pure scorer on a hand-computed case.
// ===========================================================================

describe("computeVictoryPoints (pure)", () => {
  it("matches a hand-computed breakdown across every component", () => {
    const state = makeGame({ players: THREE_PLAYERS });
    const objectives: VictoryPointObjective[] = [
      { kind: "hero-level", vp: 2, level: 3 },
      { kind: "flag-mines", vp: 4, count: 2 }
    ];
    setVictoryPoints(state, { enabled: true, victoryConditionVp: 3, objectives });
    zeroBaseVp(state);

    // p1's components:
    getMainHero(state, "p1")!.level = 4; // 4 (hero levels) + meets hero-level obj (2)
    state.towns.town_p1.buildings = ["castle.city_hall", "castle.citadel"]; // 2 (buildings)
    state.players.p1.hand = ["artifact.centaurs_axe", "artifact.titans_gladius"]; // floor(2/2)=1
    state.adventure!.vpLedger = { p1: { mainHeroDefeats: ["p2"], surrenders: 1 } }; // 3 + 1
    const mine = (spaceId: string) => {
      state.adventure!.fields[spaceId] = {
        spaceId,
        tileInstanceId: `t-${spaceId}`,
        slot: 0,
        location: "mine",
        difficulty: undefined,
        blackCube: false,
        flagOwnerId: "p1",
        everFlagged: true,
        settlementResource: null
      };
    };
    mine("20,20");
    mine("21,21"); // 2 flagged mines → 2 + meets flag-mines obj (4)

    // Hand total for p1 as the completer:
    //   3 (main defeat) + 1 (surrender) + 2 (buildings) + 4 (hero levels)
    //   + 2 (flagged mines) + 1 (artifacts) + 2 (hero-level obj) + 4 (mines obj)
    //   + 3 (completion) = 22
    expect(totalVp(state, "p1", "p1")).toBe(22);

    const row = computeVictoryPoints(state, { completerId: "p1" }).breakdown.find((r) => r.playerId === "p1");
    expect(row?.rows).toEqual(
      expect.arrayContaining([
        { label: "Main Heroes defeated", vp: 3 },
        { label: "Heroes surrendered to you", vp: 1 },
        { label: "Buildings in controlled Towns", vp: 2 },
        { label: "Hero Experience Levels", vp: 4 },
        { label: "Flagged Mines / Settlements", vp: 2 },
        { label: "Artifacts (1 VP per 2)", vp: 1 },
        { label: "Reach Hero level 3 (objective)", vp: 2 },
        { label: "Flag 2 Mines / Settlement (objective)", vp: 4 },
        { label: "Completed the victory condition", vp: 3 }
      ])
    );
    // The rows sum to the total (no hidden components).
    expect(row?.rows.reduce((sum, entry) => sum + entry.vp, 0)).toBe(22);
    // Breakdown is winner-first.
    expect(computeVictoryPoints(state, { completerId: "p1" }).breakdown[0]?.playerId).toBe("p1");
  });
});

// ===========================================================================
// 9. Sanitize / describe.
// ===========================================================================

describe("Sanitize + describe", () => {
  it("round-trips a valid config, clamps, caps at 4 objectives, and drops unknown kinds", () => {
    const preset = sanitizeCustomMapPreset({
      victoryPoints: {
        enabled: true,
        victoryConditionVp: 99, // clamps to 10
        objectives: [
          { kind: "control-towns", vp: 3, count: 9 }, // count clamps to 4
          { kind: "flag-mines", vp: 40, count: 5 }, // vp clamps to 10
          { kind: "hero-level", vp: 2, level: 1 }, // level clamps to 2
          { kind: "defeat-dragon-utopia", vp: 5 },
          { kind: "bogus-kind", vp: 3 }, // dropped
          { kind: "control-towns", vp: 1, count: 1 } // 6th survivor → past the cap
        ]
      }
    });
    const vp = preset?.victoryPoints;
    expect(vp?.enabled).toBe(true);
    expect(vp?.victoryConditionVp).toBe(10);
    expect(vp?.objectives).toEqual([
      { kind: "control-towns", vp: 3, count: 4 },
      { kind: "flag-mines", vp: 10, count: 5 },
      { kind: "hero-level", vp: 2, level: 2 },
      { kind: "defeat-dragon-utopia", vp: 5 }
    ]);
    expect(vp?.objectives?.length).toBeLessThanOrEqual(MAX_VICTORY_POINT_OBJECTIVES);
  });

  it("garbage / not-enabled → the block is dropped (enabled:false collapses)", () => {
    expect(sanitizeCustomMapPreset({ victoryPoints: { enabled: false, victoryConditionVp: 5 } })?.victoryPoints).toBeUndefined();
    expect(sanitizeCustomMapPreset({ victoryPoints: "nonsense" })?.victoryPoints).toBeUndefined();
    // A vp of 0 on an objective drops that objective (no-op reward).
    const preset = sanitizeCustomMapPreset({
      victoryPoints: { enabled: true, objectives: [{ kind: "hero-level", vp: 0, level: 5 }] }
    });
    expect(preset?.victoryPoints?.objectives).toBeUndefined();
    expect(preset?.victoryPoints?.victoryConditionVp).toBe(3); // default
  });

  it("describe: a 🎖️ line names the mode + goal, and the round-limit line flips to the HARD meaning when VP is on", () => {
    const entries = describeCustomMapPresetEntries({
      roundLimit: 8,
      victoryPoints: { enabled: true, victoryConditionVp: 4, objectives: [{ kind: "control-towns", vp: 2, count: 3 }] }
    });
    const texts = entries.map((entry) => entry.text);
    // The round-limit line now says the HARD meaning.
    expect(texts.some((text) => text.includes("Game ends at round 8"))).toBe(true);
    expect(texts.some((text) => text.startsWith("Suggested length"))).toBe(false);
    // The VP headline + objective line.
    expect(entries.some((entry) => entry.icon === "🎖️" && entry.text.includes("Victory Points"))).toBe(true);
    expect(entries.some((entry) => entry.icon === "🎖️" && entry.text.includes("Control 3 Towns"))).toBe(true);
  });

  it("CONTROL: with VP OFF the round-limit line stays 'Suggested length'", () => {
    const texts = describeCustomMapPresetEntries({ roundLimit: 8 }).map((entry) => entry.text);
    expect(texts.some((text) => text.startsWith("Suggested length: 8 rounds"))).toBe(true);
    expect(texts.some((text) => text.includes("Game ends at round"))).toBe(false);
  });

  it("victoryPointsConfig reads the enabled block off the live adventure (null when off)", () => {
    const state = makeGame();
    expect(victoryPointsConfig(state)).toBeNull();
    setVictoryPoints(state, VP_ON);
    expect(victoryPointsConfig(state)?.victoryConditionVp).toBe(3);
  });
});

// ===========================================================================
// 10. Lobby Victory-Points game option (turn VP on from normal setup, on ANY
//     map — no designed preset needed). The lobby toggle injects an
//     `{ enabled: true }` block into the EFFECTIVE map preset at build time, so
//     the same downstream scoring system lights up. Each claim asserts an
//     observable outcome (mode active / a scored round-limit end) with a CONTROL.
// ===========================================================================

describe("Lobby Victory-Points game option", () => {
  it("the lobby toggle ON activates VP and its round limit ends the game by scoring", () => {
    const state = makeGame({ victoryPoints: true, victoryPointsRoundLimit: 1 });
    // The toggle lit up the whole VP system with no designed preset.
    expect(victoryPointsModeActive(state)).toBe(true);
    expect(state.adventure?.mapPreset?.victoryPoints?.enabled).toBe(true);
    expect(state.adventure?.mapPreset?.roundLimit).toBe(1);

    zeroBaseVp(state);
    getMainHero(state, "p1")!.level = 4; // p1 out-scores p2 at the round limit

    // Round 1 wraps after both seats end → round 2 → the round-limit scored end.
    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.adventure?.winnerPlayerId).toBe("p1");
    expect(next.phase).toBe("game-over");
    expect(next.eventLog.some((event) => event.type === "VP_SCORING")).toBe(true);
    expect(next.eventLog.some((event) => event.type === "GAME_WON" && event.playerId === "p1")).toBe(true);
  });

  it("CONTROL: the toggle absent leaves VP inactive — the SAME round-limit value never ends the game", () => {
    // victoryPointsRoundLimit is passed but the toggle is OFF: the number alone
    // must not arm anything (the injection is gated on victoryPoints === true).
    const state = makeGame({ victoryPointsRoundLimit: 1 });
    expect(victoryPointsModeActive(state)).toBe(false);
    expect(state.adventure?.mapPreset?.roundLimit).toBeUndefined();

    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(next.round).toBe(2);
    expect(next.eventLog.some((event) => event.type === "VP_SCORING")).toBe(false);
  });

  it("a designed preset that enables VP stays authoritative when the lobby toggle is OFF/absent", () => {
    const state = makeGame({
      customMapPreset: { victoryPoints: { enabled: true, victoryConditionVp: 7 } },
      victoryPoints: false
    });
    // An explicit lobby OFF does NOT disable a preset's VP.
    expect(victoryPointsModeActive(state)).toBe(true);
    expect(victoryPointsConfig(state)?.victoryConditionVp).toBe(7);
  });

  it("with BOTH the preset AND the lobby on, the PRESET's config wins (never a lobby default-overwrite)", () => {
    const objectives: VictoryPointObjective[] = [{ kind: "hero-level", vp: 5, level: 3 }];
    const state = makeGame({
      customMapPreset: { victoryPoints: { enabled: true, victoryConditionVp: 7, objectives }, roundLimit: 12 },
      victoryPoints: true,
      victoryPointsRoundLimit: 3
    });
    // The preset's completion VP + objectives survive (not overwritten by the
    // lobby's `{ enabled: true }` default), and the preset's roundLimit wins over
    // the lobby's 3.
    expect(victoryPointsConfig(state)?.victoryConditionVp).toBe(7);
    expect(victoryPointsConfig(state)?.objectives).toEqual(objectives);
    expect(state.adventure?.mapPreset?.roundLimit).toBe(12);
  });

  it("the full lobby → build path arms VP scoring (buildAdventureFromLobby wiring)", () => {
    let lobby = createAdventureLobbyState({ seed: "vp-lobby" });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { victoryPoints: true, victoryPointsRoundLimit: 15 }
    });
    expect(lobby.setupLobby?.options.victoryPoints).toBe(true);
    expect(lobby.setupLobby?.options.victoryPointsRoundLimit).toBe(15);

    let built = apply(lobby, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    built = apply(built, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "dungeon", heroDefId: "alamar" });
    built = apply(built, { type: "START_ADVENTURE", playerId: "p1" });

    // The lobby fields reached the build (cherry-picked in buildAdventureFromLobby).
    expect(victoryPointsModeActive(built)).toBe(true);
    expect(built.adventure?.mapPreset?.victoryPoints?.enabled).toBe(true);
    expect(built.adventure?.mapPreset?.roundLimit).toBe(15);
  });

  it("CONTROL: a lobby built WITHOUT the toggle is inactive (proves the toggle is what arms it)", () => {
    let lobby = createAdventureLobbyState({ seed: "vp-lobby-off" });
    lobby = apply(lobby, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    lobby = apply(lobby, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "dungeon", heroDefId: "alamar" });
    const built = apply(lobby, { type: "START_ADVENTURE", playerId: "p1" });

    expect(victoryPointsModeActive(built)).toBe(false);
    expect(built.adventure?.mapPreset?.victoryPoints).toBeUndefined();
  });

  it("setGameOptions sets, clears and clamps both fields and emits GAME_OPTIONS_CHANGED", () => {
    let lobby = createAdventureLobbyState({ seed: "vp-set-options" });

    // Turn VP on.
    lobby = apply(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { victoryPoints: true } });
    expect(lobby.setupLobby?.options.victoryPoints).toBe(true);
    expect(
      lobby.eventLog.some(
        (event) => event.type === "GAME_OPTIONS_CHANGED" && event.message.includes("Victory points on")
      )
    ).toBe(true);

    // A garbage-but-finite round limit clamps to the 30 ceiling (mirrors the preset bounds).
    lobby = apply(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { victoryPointsRoundLimit: 999 } });
    expect(lobby.setupLobby?.options.victoryPointsRoundLimit).toBe(30);

    // 0 clears it.
    lobby = apply(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { victoryPointsRoundLimit: 0 } });
    expect(lobby.setupLobby?.options.victoryPointsRoundLimit).toBeUndefined();

    // Turn VP back off.
    lobby = apply(lobby, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { victoryPoints: false } });
    expect(lobby.setupLobby?.options.victoryPoints).toBe(false);
    expect(
      lobby.eventLog.some(
        (event) => event.type === "GAME_OPTIONS_CHANGED" && event.message.includes("Victory points off")
      )
    ).toBe(true);

    // A non-finite round limit is rejected (untrusted client value).
    const rejected = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { victoryPointsRoundLimit: Number.NaN }
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
  });
});
