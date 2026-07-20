import { describe, expect, it } from "vitest";
import {
  applyAction,
  checkCustomWinConditions,
  createAdventureGameState,
  createAdventureLobbyState,
  describeCustomMapPresetEntries,
  describeCustomWinCondition,
  getMainHero,
  MAX_CUSTOM_WIN_CONDITIONS,
  mergeCustomWinConditions,
  sanitizeCustomMapPreset,
  type CustomMapPreset,
  type CustomWinCondition,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, CombatUnitState, FactionId, MapFieldState } from "./state";

// ---------------------------------------------------------------------------
// Custom win conditions (map-designer / lobby authored). An ADDITIONAL early-end
// trigger on top of the normal victory mode: the FIRST live player (turnOrder)
// to satisfy ANY active condition wins immediately. Every engine claim asserts
// an observable outcome (winnerPlayerId / phase / the GAME_WON reason / a
// VP_SCORING event) and carries a CONTROL (no condition, below threshold, or a
// divergent input) that fails if the wiring is removed.
// ---------------------------------------------------------------------------

type SeatCfg = { id: string; name: string; factionId: FactionId; heroDefId: string };

const TWO_PLAYERS: SeatCfg[] = [
  { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
];
const THREE_PLAYERS: SeatCfg[] = [
  ...TWO_PLAYERS,
  { id: "p3", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
];

function makeGame(
  opts: {
    seed?: string;
    players?: SeatCfg[];
    customMapPreset?: CustomMapPreset | null;
    customWinConditions?: CustomWinCondition[];
  } = {}
): GameState {
  const state = createAdventureGameState({
    seed: opts.seed ?? "custom-win",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    victoryMode: "conquest",
    players: opts.players ?? TWO_PLAYERS,
    // Explicit +10 gold income each Resource round so the gold-crossing test is
    // deterministic regardless of the scenario's default production.
    startingProduction: { gold: 10, buildingMaterials: 0, valuables: 0 },
    ...(opts.customMapPreset !== undefined ? { customMapPreset: opts.customMapPreset } : {}),
    ...(opts.customWinConditions !== undefined ? { customWinConditions: opts.customWinConditions } : {})
  });
  clearHandGates(state);
  // Inert Astrologers proclamations so even rounds never open a choice/barrier.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers?.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** Clear the opening hand gates that otherwise block END_TURN. */
function clearHandGates(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
}

/** Force the effective condition list the engine reads (adventure.mapPreset). */
function setWinConditions(state: GameState, conditions: CustomWinCondition[] | null): void {
  const preset: CustomMapPreset = { ...(state.adventure!.mapPreset ?? {}) };
  if (conditions && conditions.length > 0) {
    preset.customWinConditions = conditions;
  } else {
    delete preset.customWinConditions;
  }
  state.adventure!.mapPreset = preset;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** The GAME_WON reason text, or null when no winner was declared. */
function wonReason(state: GameState): string | null {
  const won = state.eventLog.find((event) => event.type === "GAME_WON");
  return won?.type === "GAME_WON" ? won.reason : null;
}

/** Add a Mine/Settlement field flagged to a player (for flag-mines). */
function addFlaggedMine(state: GameState, spaceId: string, flagOwnerId: PlayerId | null): void {
  state.adventure!.fields[spaceId] = {
    spaceId,
    tileInstanceId: `t-${spaceId}`,
    slot: 0,
    location: "mine",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId,
    everFlagged: Boolean(flagOwnerId),
    settlementResource: null
  };
}

function unit(
  over: Partial<CombatUnitState> & { id: string; controllerId: PlayerId; armyUnitId: string }
): CombatUnitState {
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

/** Stage a finished (unacknowledged) PvP combat: `winnerId` beat `loserId`. */
function stagePvpDefeat(state: GameState, winnerId: PlayerId, loserId: PlayerId): void {
  const attacker = getMainHero(state, winnerId)!;
  const defender = getMainHero(state, loserId)!;
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
  state.combat = {
    id: "c1",
    round: 1,
    attackerPlayerId: winnerId,
    defenderPlayerId: loserId,
    activeUnitId: null,
    context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: field.spaceId },
    setup: null,
    awaitingContinue: false,
    outcome: { winnerPlayerId: winnerId, defeatedPlayerId: loserId, reason: "retreat" },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
    units: {
      a1: unit({ id: "a1", controllerId: winnerId, armyUnitId: `${winnerId}_a1`, damage: 0 }),
      b1: unit({ id: "b1", controllerId: loserId, armyUnitId: `${loserId}_b1`, damage: 2, maxHealth: 2 })
    }
  } as CombatState;
}

// ===========================================================================
// 1. END-TO-END wins for three kinds via a real action, each with a
//    no-conditions twin CONTROL and a below-threshold CONTROL.
// ===========================================================================

describe("End-to-end wins (real actions)", () => {
  it("gold: round-start income CROSSING the threshold wins on that action", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "gold", amount: 100 }]);
    state.players.p1.resources.gold = 95; // below the line at setup
    state.players.p2.resources.gold = 0;

    // r1 → r2 (Astrologers, no income): still below, no win.
    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });
    expect(next.round).toBe(2);
    expect(next.adventure?.winnerPlayerId ?? null, "no win before income lands").toBeNull();

    // r2 → r3 (Resource round): +10 income → p1 = 105 ≥ 100 → the income crossing wins.
    clearHandGates(next);
    next = apply(next, { type: "END_TURN", playerId: "p1" });
    clearHandGates(next);
    next = apply(next, { type: "END_TURN", playerId: "p2" });

    expect(next.players.p1.resources.gold).toBeGreaterThanOrEqual(100);
    expect(next.adventure?.winnerPlayerId).toBe("p1");
    expect(next.phase).toBe("game-over");
    expect(wonReason(next)).toBe("completed a custom win condition: reach 100 gold");
  });

  it("CONTROL (gold): with NO conditions the same income never ends the game", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 95;
    let next = apply(state, { type: "END_TURN", playerId: "p1" });
    next = apply(next, { type: "END_TURN", playerId: "p2" });
    clearHandGates(next);
    next = apply(next, { type: "END_TURN", playerId: "p1" });
    clearHandGates(next);
    next = apply(next, { type: "END_TURN", playerId: "p2" });
    expect(next.players.p1.resources.gold).toBeGreaterThanOrEqual(100); // income DID land
    expect(next.adventure?.winnerPlayerId ?? null).toBeNull(); // but no condition → no win
    expect(next.eventLog.some((event) => event.type === "GAME_WON")).toBe(false);
  });

  it("control-towns: controlling the required Towns wins (below-threshold CONTROL)", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "control-towns", count: 2 }]);
    // CONTROL first: p1 controls only its home Town (1 < 2) → the action does NOT win.
    const control = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();

    // Now flag the enemy Town's field for p1 → p1 controls 2 Towns → met.
    const enemyTownField = state.towns.town_p2.fieldId!;
    state.adventure!.fields[enemyTownField].flagOwnerId = "p1";
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: control 2 Towns");
  });

  it("flag-mines: holding the required flagged Mines/Settlements wins (below-threshold CONTROL)", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "flag-mines", count: 2 }]);
    addFlaggedMine(state, "20,20", "p1");
    // CONTROL: only 1 flagged mine (< 2) → no win.
    const control = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();

    addFlaggedMine(state, "21,21", "p1"); // now 2 → met
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: flag 2 Mines / Settlements");
  });

  it("hero-level (state-read): reaching the level wins (below-threshold CONTROL)", () => {
    const below = makeGame();
    setWinConditions(below, [{ kind: "hero-level", level: 4 }]);
    getMainHero(below, "p1")!.level = 3; // below
    const control = apply(below, { type: "END_TURN", playerId: "p1" });
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();

    const state = makeGame();
    setWinConditions(state, [{ kind: "hero-level", level: 4 }]);
    getMainHero(state, "p1")!.level = 4; // met
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: reach Hero level 4");
  });

  it("defeat-heroes (ledger-based): the recorded defeats win (below-threshold CONTROL)", () => {
    const state = makeGame({ players: THREE_PLAYERS });
    setWinConditions(state, [{ kind: "defeat-heroes", count: 2 }]);
    // CONTROL: only a single main-hero defeat recorded (1 < 2) → no win.
    state.adventure!.vpLedger = { p1: { mainHeroDefeats: ["p2"] } };
    const control = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();

    // main (once per opponent) + secondary combined ≥ 2 → met.
    state.adventure!.vpLedger = { p1: { mainHeroDefeats: ["p2"], secondaryHeroDefeats: 1 } };
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: defeat 2 enemy Heroes");
  });

  it("buildings (state-read): reaching the required Building count wins (below-threshold CONTROL)", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "buildings", count: 10 }]);
    // CONTROL: p1's home Town holds 9 Buildings (< 10) → the action does NOT win.
    // (The reader is controlledBuildingCount — the SAME sum VP scoring uses; the
    // actual ids are irrelevant, only the count matters.)
    state.towns.town_p1.buildings = Array.from({ length: 9 }, (_, i) => `castle.b${i}`);
    const control = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();

    // A 10th Building crosses the line → met on the next action.
    state.towns.town_p1.buildings = Array.from({ length: 10 }, (_, i) => `castle.b${i}`);
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: build 10 Buildings");
  });

  it("obelisks (grail-progress read): visiting the required Obelisks wins (below-threshold CONTROL)", () => {
    // Obelisk visits are tracked per player on grail.obelisksVisited — the SAME
    // tally the Holy-Grail dig unlock reads (grailObelisksVisitedCount). Seeded
    // directly here (like the defeat-heroes ledger above); real-game accrual is
    // grail-mode only, documented on CustomWinCondition.
    const state = makeGame();
    setWinConditions(state, [{ kind: "obelisks", count: 3 }]);
    // CONTROL: only 2 distinct Obelisks visited (< 3) → no win.
    state.adventure!.grail = { status: "uncollected", obelisksVisited: { p1: ["60,60", "61,61"] } };
    const control = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(control.adventure?.winnerPlayerId ?? null).toBeNull();

    // A third distinct Obelisk → met.
    state.adventure!.grail = {
      status: "uncollected",
      obelisksVisited: { p1: ["60,60", "61,61", "62,62"] }
    };
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: visit 3 Obelisks");
  });
});

// ===========================================================================
// 2. Any-of: several conditions, only one met → wins with THAT condition's
//    reason (evaluated in list order).
// ===========================================================================

describe("Any-of semantics", () => {
  it("two conditions, only the SECOND met → wins with the second's reason", () => {
    const state = makeGame();
    setWinConditions(state, [
      { kind: "gold", amount: 500 }, // NOT met
      { kind: "hero-level", level: 3 } // met
    ]);
    state.players.p1.resources.gold = 10;
    getMainHero(state, "p1")!.level = 3;
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(won)).toBe("completed a custom win condition: reach Hero level 3");
  });
});

// ===========================================================================
// 3. Combat deferral: a crossing while a combat is open never wins mid-battle;
//    the first post-combat action lands it.
// ===========================================================================

describe("Combat deferral", () => {
  it("GUARD: a met condition does NOT win while state.combat is open (cleared → wins)", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "hero-level", level: 3 }]);
    getMainHero(state, "p1")!.level = 3; // condition met
    // Open combat present → the check defers (never ends the game mid-battle).
    state.combat = { id: "x" } as unknown as CombatState;
    checkCustomWinConditions(state);
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
    // CONTROL: with no open combat the SAME state wins.
    state.combat = null;
    checkCustomWinConditions(state);
    expect(state.adventure?.winnerPlayerId).toBe("p1");
  });

  it("the first post-combat action (ACKNOWLEDGE_COMBAT_END) lands the win", () => {
    // 3 players so acknowledging a defeat does not last-faction-standing.
    const state = makeGame({ players: THREE_PLAYERS });
    setWinConditions(state, [{ kind: "gold", amount: 100 }]);
    state.players.p1.resources.gold = 200; // condition met, independent of the fight
    stagePvpDefeat(state, "p1", "p2");
    expect(state.adventure?.winnerPlayerId ?? null, "no win while the combat is open").toBeNull();

    // Closing the combat is the first post-combat action → the tail check fires.
    const next = apply(state, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
    expect(next.combat ?? null).toBeNull();
    expect(next.adventure?.winnerPlayerId).toBe("p1");
    expect(wonReason(next)).toBe("completed a custom win condition: reach 100 gold");
  });

  it("CONTROL: closing the combat with NO condition crossed fires nothing", () => {
    const state = makeGame({ players: THREE_PLAYERS });
    setWinConditions(state, [{ kind: "gold", amount: 100 }]);
    state.players.p1.resources.gold = 10; // below the line
    stagePvpDefeat(state, "p1", "p2");
    const next = apply(state, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
    expect(next.combat ?? null).toBeNull();
    expect(next.adventure?.winnerPlayerId ?? null).toBeNull();
  });
});

// ===========================================================================
// 4. Victory-Points interplay: with VP mode ON a completion SCORES the table.
// ===========================================================================

describe("Victory Points interplay", () => {
  it("VP ON + a condition met → VP_SCORING with the completer credited", () => {
    const state = makeGame();
    // VP mode ON + a custom condition p1 will complete.
    state.adventure!.mapPreset = {
      victoryPoints: { enabled: true, victoryConditionVp: 3 },
      customWinConditions: [{ kind: "hero-level", level: 3 }]
    };
    // Clean scoring surface, then p1 clearly out-scores p2.
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
    getMainHero(state, "p1")!.level = 3; // meets the condition AND is the VP leader

    const next = apply(state, { type: "END_TURN", playerId: "p1" });

    // Completion routed through endGameByVictoryPoints (viaVictoryCondition): the
    // table is SCORED, not instantly won by the raw completion reason.
    const scoring = next.eventLog.find((event) => event.type === "VP_SCORING");
    expect(scoring, "VP_SCORING emitted").toBeTruthy();
    expect(scoring?.type === "VP_SCORING" && scoring.completerPlayerId).toBe("p1");
    expect(next.adventure?.winnerPlayerId).toBe("p1");
    expect(next.phase).toBe("game-over");
    // p1 really earned the completion VP row.
    const p1Row =
      scoring?.type === "VP_SCORING" ? scoring.breakdown.find((row) => row.playerId === "p1") : undefined;
    expect(p1Row?.rows.some((row) => row.label === "Completed the victory condition" && row.vp === 3)).toBe(true);
  });
});

// ===========================================================================
// 5. Idempotency + liveness.
// ===========================================================================

describe("Idempotency + liveness", () => {
  it("after a win, re-running the check appends no second GAME_WON", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "hero-level", level: 3 }]);
    getMainHero(state, "p1")!.level = 3;
    const next = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(next.adventure?.winnerPlayerId).toBe("p1");
    const wonCount = next.eventLog.filter((event) => event.type === "GAME_WON").length;
    expect(wonCount).toBe(1);
    // Re-running the check on the already-won state is a no-op (winnerPlayerId guard).
    checkCustomWinConditions(next);
    expect(next.eventLog.filter((event) => event.type === "GAME_WON").length).toBe(1);
  });

  it("an ELIMINATED player meeting a condition never wins (live CONTROL wins)", () => {
    const state = makeGame({ players: THREE_PLAYERS });
    setWinConditions(state, [{ kind: "hero-level", level: 3 }]);
    getMainHero(state, "p1")!.level = 1;
    getMainHero(state, "p2")!.level = 3; // p2 meets it…
    getMainHero(state, "p3")!.level = 1;
    state.players.p2.eliminated = true; // …but is eliminated → skipped
    const next = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(next.adventure?.winnerPlayerId ?? null).toBeNull();

    // CONTROL: the SAME state with p2 live → p2 wins (second in turnOrder, only it meets).
    const live = makeGame({ players: THREE_PLAYERS });
    setWinConditions(live, [{ kind: "hero-level", level: 3 }]);
    getMainHero(live, "p1")!.level = 1;
    getMainHero(live, "p2")!.level = 3;
    getMainHero(live, "p3")!.level = 1;
    const won = apply(live, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p2");
  });

  it("tie-break is turnOrder: with two seats meeting, the earlier seat wins", () => {
    const state = makeGame();
    setWinConditions(state, [{ kind: "hero-level", level: 3 }]);
    getMainHero(state, "p1")!.level = 3;
    getMainHero(state, "p2")!.level = 3; // both meet → p1 (earlier in turnOrder) wins
    const won = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(won.adventure?.winnerPlayerId).toBe("p1");
  });
});

// ===========================================================================
// 6. Early-out safety (doubles as the legacy-snapshot control).
// ===========================================================================

describe("Early-out safety", () => {
  it("a game WITHOUT conditions passes through applyAction unchanged (no GAME_WON)", () => {
    const state = makeGame();
    // p1 would trivially meet a gold/level condition — but none is set.
    state.players.p1.resources.gold = 99999;
    getMainHero(state, "p1")!.level = 7;
    const next = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(next.eventLog.some((event) => event.type === "GAME_WON")).toBe(false);
    expect(next.adventure?.winnerPlayerId ?? null).toBeNull();
  });

  it("the check itself is a no-op when no condition list is present", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 99999;
    checkCustomWinConditions(state); // no mapPreset.customWinConditions
    expect(state.adventure?.winnerPlayerId ?? null).toBeNull();
  });
});

// ===========================================================================
// 7. Lobby plumbing: SET_GAME_OPTIONS sanitize + emit, and the build-time union.
// ===========================================================================

describe("Lobby plumbing", () => {
  it("SET_GAME_OPTIONS sanitizes garbage (bad kind dropped, params clamped) + emits GAME_OPTIONS_CHANGED", () => {
    let lobby = createAdventureLobbyState({ seed: "cwc-set" });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customWinConditions: [
          { kind: "control-towns", count: 1 }, // clamps to 2
          { kind: "bogus-kind", count: 3 } as unknown as CustomWinCondition, // dropped
          { kind: "gold", amount: 9999 } // clamps to 500
        ]
      }
    });
    expect(lobby.setupLobby?.options.customWinConditions).toEqual([
      { kind: "control-towns", count: 2 },
      { kind: "gold", amount: 500 }
    ]);
    expect(
      lobby.eventLog.some(
        (event) => event.type === "GAME_OPTIONS_CHANGED" && event.message.includes("Custom win conditions")
      )
    ).toBe(true);
  });

  it("a list that sanitizes to empty CLEARS the lobby field", () => {
    let lobby = createAdventureLobbyState({ seed: "cwc-clear" });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "control-towns", count: 3 }] }
    });
    expect(lobby.setupLobby?.options.customWinConditions?.length).toBe(1);
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "nope" } as unknown as CustomWinCondition] }
    });
    expect(lobby.setupLobby?.options.customWinConditions).toBeUndefined();
  });

  it("build union: preset-only survives", () => {
    const state = makeGame({ customMapPreset: { customWinConditions: [{ kind: "control-towns", count: 3 }] } });
    expect(state.adventure?.mapPreset?.customWinConditions).toEqual([{ kind: "control-towns", count: 3 }]);
  });

  it("build union: lobby-only survives", () => {
    const state = makeGame({ customWinConditions: [{ kind: "gold", amount: 200 }] });
    expect(state.adventure?.mapPreset?.customWinConditions).toEqual([{ kind: "gold", amount: 200 }]);
  });

  it("build union: BOTH → preset-first, exact-duplicate deduped, capped at 4", () => {
    const state = makeGame({
      customMapPreset: {
        customWinConditions: [
          { kind: "control-towns", count: 3 },
          { kind: "gold", amount: 200 }
        ]
      },
      customWinConditions: [
        { kind: "gold", amount: 200 }, // exact duplicate of a preset one → deduped
        { kind: "hero-level", level: 6 }, // added
        { kind: "flag-mines", count: 5 }, // added
        { kind: "artifacts", count: 4 } // past the cap of 4 → dropped
      ]
    });
    expect(state.adventure?.mapPreset?.customWinConditions).toEqual([
      { kind: "control-towns", count: 3 },
      { kind: "gold", amount: 200 },
      { kind: "hero-level", level: 6 },
      { kind: "flag-mines", count: 5 }
    ]);
  });

  it("the full lobby → build path arms the conditions (buildAdventureFromLobby wiring)", () => {
    let lobby = createAdventureLobbyState({ seed: "cwc-lobby" });
    lobby = apply(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customWinConditions: [{ kind: "gold", amount: 250 }] }
    });
    let built = apply(lobby, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
    built = apply(built, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "dungeon", heroDefId: "alamar" });
    built = apply(built, { type: "START_ADVENTURE", playerId: "p1" });
    expect(built.adventure?.mapPreset?.customWinConditions).toEqual([{ kind: "gold", amount: 250 }]);
  });

  it("mergeCustomWinConditions is preset-first + dedup + cap (the shared UI/engine helper)", () => {
    expect(
      mergeCustomWinConditions(
        [{ kind: "control-towns", count: 3 }],
        [{ kind: "control-towns", count: 3 }, { kind: "gold", amount: 200 }]
      )
    ).toEqual([
      { kind: "control-towns", count: 3 },
      { kind: "gold", amount: 200 }
    ]);
  });
});

// ===========================================================================
// 8. Sanitizer unit cases (preset path).
// ===========================================================================

describe("Sanitize (preset path)", () => {
  it("allowlist + per-kind clamps + cap 4", () => {
    const preset = sanitizeCustomMapPreset({
      customWinConditions: [
        { kind: "control-towns", count: 1 }, // min 2
        { kind: "hero-level", level: 99 }, // max 7
        { kind: "gold", amount: 5 }, // min 20
        { kind: "defeat-heroes", count: 0 }, // min 1
        { kind: "bogus", count: 3 }, // dropped
        { kind: "artifacts", count: 3 } // 5th valid → past the cap of 4
      ]
    });
    expect(preset?.customWinConditions).toEqual([
      { kind: "control-towns", count: 2 },
      { kind: "hero-level", level: 7 },
      { kind: "gold", amount: 20 },
      { kind: "defeat-heroes", count: 1 }
    ]);
  });

  it("defeat-dragon-utopia carries NO param; flag-mines clamps to 12", () => {
    const preset = sanitizeCustomMapPreset({
      customWinConditions: [
        { kind: "defeat-dragon-utopia", count: 5 }, // count ignored
        { kind: "flag-mines", count: 99 } // max 12
      ]
    });
    expect(preset?.customWinConditions).toEqual([
      { kind: "defeat-dragon-utopia" },
      { kind: "flag-mines", count: 12 }
    ]);
  });

  it("buildings clamps to 8-15 (min 8 so starting Buildings can't instant-win); obelisks clamps to 1-4", () => {
    // Below-band inputs clamp UP to the floor…
    expect(
      sanitizeCustomMapPreset({
        customWinConditions: [
          { kind: "buildings", count: 3 }, // min 8
          { kind: "obelisks", count: 0 } // min 1
        ]
      })?.customWinConditions
    ).toEqual([
      { kind: "buildings", count: 8 },
      { kind: "obelisks", count: 1 }
    ]);
    // …and above-band inputs clamp DOWN to the ceiling; both kinds pass the allowlist.
    expect(
      sanitizeCustomMapPreset({
        customWinConditions: [
          { kind: "buildings", count: 99 }, // max 15
          { kind: "obelisks", count: 9 } // max 4
        ]
      })?.customWinConditions
    ).toEqual([
      { kind: "buildings", count: 15 },
      { kind: "obelisks", count: 4 }
    ]);
  });

  it("a non-array / all-garbage list drops the block; a legacy preset is untouched", () => {
    expect(sanitizeCustomMapPreset({ customWinConditions: "nope" })?.customWinConditions).toBeUndefined();
    expect(
      sanitizeCustomMapPreset({ customWinConditions: [{ kind: "bogus" }] })?.customWinConditions
    ).toBeUndefined();
    expect(sanitizeCustomMapPreset({ roundLimit: 8 })?.customWinConditions).toBeUndefined();
  });
});

// ===========================================================================
// 9. Banner + describe (single-source helper).
// ===========================================================================

describe("Banner + describe", () => {
  it("describeCustomMapPresetEntries emits one 🏁 line per condition", () => {
    const entries = describeCustomMapPresetEntries({
      customWinConditions: [
        { kind: "control-towns", count: 3 },
        { kind: "defeat-dragon-utopia" }
      ]
    });
    expect(entries.filter((entry) => entry.icon === "🏁").map((entry) => entry.text)).toEqual([
      "Custom win: control 3 Towns",
      "Custom win: defeat the Dragon Utopia"
    ]);
  });

  it("describeCustomWinCondition renders every kind", () => {
    expect(describeCustomWinCondition({ kind: "control-towns", count: 3 })).toBe("control 3 Towns");
    expect(describeCustomWinCondition({ kind: "flag-mines", count: 4 })).toBe("flag 4 Mines / Settlements");
    expect(describeCustomWinCondition({ kind: "hero-level", level: 5 })).toBe("reach Hero level 5");
    expect(describeCustomWinCondition({ kind: "gold", amount: 100 })).toBe("reach 100 gold");
    expect(describeCustomWinCondition({ kind: "artifacts", count: 2 })).toBe("own 2 Artifacts");
    expect(describeCustomWinCondition({ kind: "buildings", count: 10 })).toBe("build 10 Buildings");
    expect(describeCustomWinCondition({ kind: "obelisks", count: 3 })).toBe("visit 3 Obelisks");
    expect(describeCustomWinCondition({ kind: "obelisks", count: 1 })).toBe("visit 1 Obelisk");
    expect(describeCustomWinCondition({ kind: "defeat-heroes", count: 2 })).toBe("defeat 2 enemy Heroes");
    expect(describeCustomWinCondition({ kind: "defeat-dragon-utopia" })).toBe("defeat the Dragon Utopia");
    expect(
      describeCustomWinCondition({ kind: "hold-with-grail", rounds: 3, target: "starting-town" })
    ).toBe("control Starting Town with the Grail for 3 rounds");
  });

  it("MAX_CUSTOM_WIN_CONDITIONS is 4 (the shared cap)", () => {
    expect(MAX_CUSTOM_WIN_CONDITIONS).toBe(4);
  });
});
