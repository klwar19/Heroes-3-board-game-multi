/**
 * CO-OP MODE — step 2: the AI seats actually PLAY on a multiplayer table.
 *
 * The engine half of step 2 (the server-transport half lives in
 * `src/server/coop-live.test.ts`). What this file pins:
 *
 *  1. TIME CONTROLS never punish a computer seat: no AFK idle stamp, never a
 *     vote / 30-minute auto-kick target, never counted among the voters a kick
 *     vote needs (a computer never votes, so counting it made an otherwise
 *     legitimate vote unresolvable), and no running 10-minute turn clock — the
 *     server pump is the AI seat's clock. Human seats keep every time control.
 *  2. "Nobody controls the computer enemy": in a `gameMode: "coop"` game BOTH
 *     manual-neutral-control modes return null always, so the Neutral AI plays
 *     every guard. Clash-with-AI is UNCHANGED.
 *  3. PARALLEL TURNS × computer seats is REFUSED at the lobby, both directions.
 *  4. ADVANCE_COMPUTER (the lost-tick watchdog) is gated on "this game HAS a
 *     computer seat", not on the private single-player room.
 *  5. The conscious NON-changes, pinned so a later edit is deliberate: the
 *     computer guaranteed-win and the temp Empowered Attack/Defense boost stay
 *     SINGLE-PLAYER-ONLY, and `computerDecisionOwner` (which reads controllers,
 *     never sessionMode) names the AI seat on a multiplayer co-op table.
 *
 * Every claim carries a CONTROL on the SAME setup that diverges (the human
 * seat, the clash table, the single-player twin, the all-human lobby).
 */
import { describe, expect, it } from "vitest";
import {
  AFK_AUTO_KICK_MS,
  AFK_IDLE_MS,
  applyAction,
  computerDecisionOwner,
  createAdventureGameState,
  createAdventureLobbyState,
  getAfkState,
  getLegalActions,
  idleMillis,
  NEUTRAL_PLAYER_ID,
  TURN_TIME_LIMIT_MS,
  turnClockRunningSeats,
  type GameAction,
  type GameState,
  type PlayerController,
  type PlayerId
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import {
  combatUnitDecisionOwnerId,
  coopDisablesManualNeutralControl,
  manualGuardControllerId,
  neutralCombatControllerId,
  pvpNeutralControllerId
} from "./neutral-control";
import { combatQualifiesForComputerGuaranteedWin } from "./computer/guaranteed-wins";
import { combatQualifiesForComputerBoost } from "./computer/combat-boost";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const T0 = 1_000_000_000;

const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };

function applyOk(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function reject(state: GameState, action: GameAction, now?: number): string {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors.length, "expected the action to be refused").toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const THREE_SEATS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Computer 1", factionId: "dungeon" as const, heroDefId: "alamar" }
];

/**
 * A started MULTIPLAYER adventure: p1 + p2 human, p3 a COMPUTER seat (exactly
 * what SET_COMPUTER_OPPONENTS builds — trailing seat, controller entry only for
 * it). `coop` stamps the two alliance teams; omitting it is the clash CONTROL.
 * `hosted` is what turns the time controls on at all.
 */
function mpGame(
  seed: string,
  options: {
    coop?: boolean;
    computer?: boolean;
    pvpNeutralControl?: boolean;
    manualGuardControl?: boolean;
    singlePlayer?: boolean;
  } = {}
): GameState {
  const computer = options.computer ?? true;
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ...(options.coop ? { gameMode: "coop" as const } : {}),
    ...(options.pvpNeutralControl ? { pvpNeutralControl: true } : {}),
    ...(options.manualGuardControl ? { manualGuardControl: true } : {}),
    ...(options.singlePlayer ? { sessionMode: "single-player" as const } : {}),
    ...(computer ? { controllers: { p3: COMPUTER } } : {}),
    players: THREE_SEATS
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // The AFK vote / auto-kick / turn timer run only on a CLOSED (hosted) table.
  state.room = { hosted: true, hostClientId: "host", members: [] };
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.rewardQueue = [];
  state.activePlayerId = "p1";
  return state;
}

/** Seed every seat's idle clock the way the first stamped action would. */
function stampIdleClocks(state: GameState, at: number): void {
  const afk = getAfkState(state);
  for (const playerId of state.turnOrder) {
    afk.lastActionAt[playerId] = at;
  }
}

/** Open `playerId`'s turn clock at `at` (what applyTurnClockBookkeeping does). */
function openTurnClock(state: GameState, playerId: PlayerId, at: number): void {
  const afk = getAfkState(state);
  afk.turnOpenSince = { [playerId]: at };
}

// ===========================================================================
// 1. Time controls never punish a computer seat
// ===========================================================================

describe("co-op step 2 — time controls never target a computer seat", () => {
  it("the first stamped human action bootstraps ONLY the human seats' idle clocks", () => {
    const state = applyOk(mpGame("coop2-bootstrap"), { type: "END_TURN", playerId: "p1" }, T0);
    expect(Object.keys(state.afk?.lastActionAt ?? {}).sort()).toEqual(["p1", "p2"]);
    // …so the AI seat can never age into "away" at all.
    expect(idleMillis(state, "p3", T0 + AFK_AUTO_KICK_MS + 60_000)).toBe(0);
  });

  it("a COMPUTER seat's own action stamps no idle clock (the pump is not player activity)", () => {
    const base = mpGame("coop2-computer-actor");
    base.activePlayerId = "p3";
    base.turn.completedPlayerIds = ["p1", "p2"];
    const result = applyAction(base, { type: "END_TURN", playerId: "p3" }, {
      computerActorPlayerId: "p3",
      now: T0
    });
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    expect(result.state.afk?.lastActionAt?.p3).toBeUndefined();

    // CONTROL: the same END_TURN by a HUMAN seat DOES stamp its clock.
    const control = mpGame("coop2-human-actor");
    const stamped = applyOk(control, { type: "END_TURN", playerId: "p1" }, T0);
    expect(stamped.afk?.lastActionAt?.p1).toBe(T0);
  });

  it("an AFK vote can never be opened against a computer seat (a human CONTROL opens)", () => {
    const state = mpGame("coop2-vote-target");
    stampIdleClocks(state, T0);
    state.activePlayerId = "p3";
    expect(
      reject(state, { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p3" }, T0 + AFK_IDLE_MS)
    ).toMatch(/never AFK/);
    expect(state.afk?.vote ?? null).toBeNull();

    // CONTROL: the same vote against the awaited HUMAN seat is accepted (with
    // only one other human seat p1's implicit "kick" also RESOLVES it at once,
    // so the observable is the started event + the drop, not an open vote).
    const control = mpGame("coop2-vote-control");
    stampIdleClocks(control, T0);
    control.activePlayerId = "p2";
    const opened = applyOk(
      control,
      { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p2" },
      T0 + AFK_IDLE_MS
    );
    expect(
      opened.eventLog.some(
        (event) => event.type === "AFK_VOTE_STARTED" && event.targetPlayerId === "p2"
      )
    ).toBe(true);
  });

  it("a kick vote RESOLVES on the human voters alone — the AI seat is not a required voter", () => {
    // p1 + p2 human, p3 computer. p1's implicit "kick" is the only vote there
    // can ever be; counting p3 among the voters left the vote open forever.
    const state = mpGame("coop2-vote-resolve");
    stampIdleClocks(state, T0);
    state.activePlayerId = "p2";
    const voted = applyOk(
      state,
      { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p2" },
      T0 + AFK_IDLE_MS
    );
    expect(voted.afk?.vote ?? null, "the vote resolved immediately").toBeNull();
    expect(voted.afk?.droppingPlayerId).toBe("p2");

    // CONTROL: with p3 a HUMAN seat the same vote stays OPEN until p3 answers.
    const control = mpGame("coop2-vote-resolve-control", { computer: false });
    stampIdleClocks(control, T0);
    control.activePlayerId = "p2";
    const pending = applyOk(
      control,
      { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p2" },
      T0 + AFK_IDLE_MS
    );
    expect(pending.afk?.vote?.targetPlayerId).toBe("p2");
    expect(pending.afk?.droppingPlayerId ?? null).toBeNull();
  });

  it("the 30-minute auto-kick can never target a computer seat (a human CONTROL is kicked)", () => {
    const state = mpGame("coop2-autokick");
    stampIdleClocks(state, T0);
    expect(
      reject(
        state,
        { type: "FORCE_AFK_KICK", playerId: "p1", targetPlayerId: "p3" },
        T0 + AFK_AUTO_KICK_MS
      )
    ).toMatch(/never AFK/);

    const control = mpGame("coop2-autokick-control");
    stampIdleClocks(control, T0);
    const kicked = applyOk(
      control,
      { type: "FORCE_AFK_KICK", playerId: "p1", targetPlayerId: "p2" },
      T0 + AFK_AUTO_KICK_MS
    );
    expect(kicked.afk?.droppingPlayerId).toBe("p2");
  });

  it("no turn clock runs on a computer seat's turn (it runs on the human seat's)", () => {
    const state = mpGame("coop2-turn-clock");
    state.activePlayerId = "p3";
    expect(turnClockRunningSeats(state)).toEqual([]);

    state.activePlayerId = "p2";
    expect(turnClockRunningSeats(state)).toEqual(["p2"]);
  });

  it("FORCE_TURN_TIMEOUT is refused against a computer seat even with a fully burned clock", () => {
    const state = mpGame("coop2-turn-timeout");
    state.activePlayerId = "p3";
    stampIdleClocks(state, T0);
    openTurnClock(state, "p3", T0);
    expect(
      reject(
        state,
        { type: "FORCE_TURN_TIMEOUT", playerId: "p1", targetPlayerId: "p3" },
        T0 + TURN_TIME_LIMIT_MS
      )
    ).toMatch(/never AFK/);
    expect(state.afk?.turnTimeoutPlayerId ?? null).toBeNull();

    // CONTROL: the identical burned clock on the HUMAN seat DOES arm the shift.
    const control = mpGame("coop2-turn-timeout-control");
    control.activePlayerId = "p2";
    stampIdleClocks(control, T0);
    openTurnClock(control, "p2", T0);
    const armed = applyOk(
      control,
      { type: "FORCE_TURN_TIMEOUT", playerId: "p1", targetPlayerId: "p2" },
      T0 + TURN_TIME_LIMIT_MS
    );
    expect(armed.afk?.turnTimeoutPlayerId).toBe("p2");
  });
});

// ===========================================================================
// 2. Co-op: nobody controls the computer enemy
// ===========================================================================

/** A plain guard-FIELD fight (the recipe from the PvE-exempt suite). */
function guardFight(state: GameState, heroId = "hero_p1", difficulty = 2): GameState {
  const hero = state.heroes[heroId];
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => (candidate.difficulty ?? 0) > 0
  );
  expect(field, "the map should hold a guarded field").toBeTruthy();
  field!.difficulty = difficulty;
  hero.spaceId = field!.spaceId;
  startNeutralEncounter(state, hero, field!);
  expect(state.combat?.context.kind).toBe("neutral");
  return state;
}

/** Place one unit and finish placement, so the neutral army is REVEALED. */
function revealArmy(state: GameState): GameState {
  const fighter = state.combat!.attackerPlayerId;
  const placement = getLegalActions(state, fighter).find(
    (entry) => entry.action.type === "PLACE_COMBAT_UNIT"
  );
  expect(placement, "expected a unit placement offer").toBeTruthy();
  let next = applyOk(state, placement!.action);
  next = applyOk(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: fighter });
  return next;
}

describe("co-op step 2 — co-op disables BOTH manual neutral-control modes", () => {
  it("the shared read is true only in co-op", () => {
    expect(coopDisablesManualNeutralControl(mpGame("coop2-read", { coop: true }))).toBe(true);
    expect(coopDisablesManualNeutralControl(mpGame("coop2-read-control"))).toBe(false);
  });

  for (const mode of ["pvpNeutralControl", "manualGuardControl"] as const) {
    // Who the mode WOULD hand the guards to on a clash table: PvP Neutral
    // Control gives them to the next seat clockwise, Manual to the fighter.
    const wouldBe: PlayerId = mode === "pvpNeutralControl" ? "p2" : "p1";

    it(`${mode}: a co-op guard fight has NO controller (clash CONTROL keeps ${wouldBe})`, () => {
      const coop = revealArmy(guardFight(mpGame(`coop2-${mode}`, { coop: true, [mode]: true })));
      const combat = coop.combat!;
      expect(neutralCombatControllerId(coop, combat)).toBeNull();
      expect(pvpNeutralControllerId(coop, combat)).toBeNull();
      expect(manualGuardControllerId(coop, combat)).toBeNull();
      const guards = Object.values(combat.units).filter(
        (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
      );
      expect(guards.length).toBeGreaterThan(0);
      for (const guard of guards) {
        // The observable: every guard's INPUT stays with the Neutral seat, so
        // the neutral AI plays it exactly as in a game with the mode off.
        expect(combatUnitDecisionOwnerId(coop, combat, guard)).toBe(NEUTRAL_PLAYER_ID);
      }
      // …and the controller-only pre-battle formation SORT never opens.
      expect(combat.pendingNeutralPlacement).toBeFalsy();

      const clash = revealArmy(guardFight(mpGame(`coop2-${mode}-control`, { [mode]: true })));
      const clashCombat = clash.combat!;
      expect(neutralCombatControllerId(clash, clashCombat)).toBe(wouldBe);
      for (const guard of Object.values(clashCombat.units).filter(
        (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
      )) {
        expect(combatUnitDecisionOwnerId(clash, clashCombat, guard)).toBe(wouldBe);
      }
      expect(clashCombat.pendingNeutralPlacement).toBe(wouldBe);
    });
  }
});

// ===========================================================================
// 3. Parallel turns × computer seats — refused BOTH directions
// ===========================================================================

function lobby(seed: string): GameState {
  return createAdventureLobbyState({ seed, scenarioId: "skirmish" });
}

describe("parallel turns with multiplayer computer seats", () => {
  it("adds computer seats while parallel turns are on", () => {
    let state = applyOk(lobby("coop2-par-a"), {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { parallelTurns: 3 }
    });
    expect(state.setupLobby?.options.parallelTurns).toBe(3);

    state = applyOk(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
    expect(Object.keys(state.controllers ?? {})).toEqual(["p3"]);

    // Removing computers is never blocked, so a lobby can never wedge.
    state = applyOk(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 0 });
    expect(state.setupLobby?.options.parallelTurns).toBe(3);

    // CONTROL: with parallel turns OFF the same call adds the seat.
    let control = applyOk(lobby("coop2-par-a-control"), {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { parallelTurns: 0 }
    });
    control = applyOk(control, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
    expect(Object.keys(control.controllers ?? {})).toEqual(["p3"]);
  });

  it("enables parallel turns while multiplayer computer seats exist", () => {
    let state = applyOk(lobby("coop2-par-b"), {
      type: "SET_COMPUTER_OPPONENTS",
      playerId: "p1",
      count: 1
    });
    expect(Object.keys(state.controllers ?? {})).toEqual(["p3"]);

    state = applyOk(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { parallelTurns: 4 } });
    expect(state.setupLobby?.options.parallelTurns).toBe(4);

    // Turning it OFF is always legal (0 rounds is never the blocked value).
    state = applyOk(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { parallelTurns: 0 } });
    expect(Object.keys(state.controllers ?? {})).toEqual(["p3"]);

    // …and once the computers are gone the option is accepted.
    state = applyOk(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 0 });
    state = applyOk(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { parallelTurns: 4 } });
    expect(state.setupLobby?.options.parallelTurns).toBe(4);
  });

  it("CONTROL: an all-human lobby still takes parallel turns exactly as before", () => {
    const state = applyOk(lobby("coop2-par-control"), {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { parallelTurns: 12 }
    });
    expect(state.setupLobby?.options.parallelTurns).toBe(12);
  });
});

// ===========================================================================
// 4. ADVANCE_COMPUTER: gated on "the game HAS a computer seat"
// ===========================================================================

describe("co-op step 2 — the ADVANCE_COMPUTER watchdog on a multiplayer table", () => {
  it("is offered to a human and applies while an AI seat owns the map turn", () => {
    const state = mpGame("coop2-advance", { coop: true });
    state.activePlayerId = "p3";
    expect(computerDecisionOwner(state)).toBe("p3");

    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "ADVANCE_COMPUTER"
    );
    expect(offered, "the human watchdog offer reaches a multiplayer co-op table").toBe(true);
    const advanced = applyOk(state, { type: "ADVANCE_COMPUTER", playerId: "p1" });
    expect(
      advanced.eventLog.some((event) => event.type === "COMPUTER_ADVANCE_REQUESTED")
    ).toBe(true);
  });

  it("CONTROL: an ALL-HUMAN multiplayer game neither offers nor accepts it", () => {
    const state = mpGame("coop2-advance-control", { computer: false });
    state.activePlayerId = "p3";
    expect(computerDecisionOwner(state)).toBeNull();
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "ADVANCE_COMPUTER")
    ).toBe(false);
    expect(reject(state, { type: "ADVANCE_COMPUTER", playerId: "p1" })).toMatch(
      /only legal in a game with computer seats/
    );
  });
});

// ===========================================================================
// 5. The conscious NON-changes (pinned so a later edit is deliberate)
// ===========================================================================

describe("co-op step 2 — what deliberately did NOT change", () => {
  it("computerDecisionOwner names the AI seat on a multiplayer co-op table (it reads controllers)", () => {
    const state = mpGame("coop2-owner", { coop: true });
    state.activePlayerId = "p3";
    expect(computerDecisionOwner(state)).toBe("p3");
    state.activePlayerId = "p1";
    expect(computerDecisionOwner(state), "a human seat's turn owes the pump nothing").toBeNull();
  });

  it("a multiplayer co-op AI seat gets NO guaranteed win (the single-player twin DOES)", () => {
    // The AI seat p3 itself fights a difficulty-I guard field — the shape the
    // smoothing house rule exists for.
    const coop = guardFight(mpGame("coop2-guaranteed", { coop: true }), "hero_p3", 1);
    expect(coop.combat!.attackerPlayerId).toBe("p3");
    expect(combatQualifiesForComputerGuaranteedWin(coop, coop.combat!)).toBe(false);

    // CONTROL: the SAME fight in a single-player session qualifies, so the
    // assertion above really measures the session gate and nothing else.
    const solo = guardFight(mpGame("coop2-guaranteed-control", { singlePlayer: true }), "hero_p3", 1);
    expect(combatQualifiesForComputerGuaranteedWin(solo, solo.combat!)).toBe(true);
  });

  it("a multiplayer co-op AI seat gets NO temp Empowered Attack/Defense boost (single-player DOES)", () => {
    const coop = guardFight(mpGame("coop2-boost", { coop: true }), "hero_p3", 1);
    expect(combatQualifiesForComputerBoost(coop, coop.combat!)).toBe(false);

    const solo = guardFight(mpGame("coop2-boost-control", { singlePlayer: true }), "hero_p3", 1);
    expect(combatQualifiesForComputerBoost(solo, solo.combat!)).toBe(true);
  });
});
