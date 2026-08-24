/**
 * CO-OP MODE — step 1: the ENGINE FOUNDATION.
 *
 * What this file pins (later steps own the server pump, the victory
 * objectives, the match report and every UI surface — none of that is here):
 *
 *  1. `GameSetupOptions.gameMode` ("clash" | "coop", ABSENT = clash): sanitized
 *     at the lobby seam and FROZEN onto the built game as `GameState.gameMode`.
 *  2. Computer opponents in an ORDINARY MULTIPLAYER lobby (not just the private
 *     single-player room): SET_COMPUTER_OPPONENTS appends/removes TRAILING
 *     computer seats and `state.controllers` carries entries for exactly those
 *     seats — never an orphan, never a human seat.
 *  3. Nobody may take or be assigned a computer seat, in ANY session mode.
 *  4. A co-op build stamps `playerTeams` (humans → "coop-humans", computers →
 *     "coop-ai"), which turns on every EXISTING `playersAreAllied` gate.
 *  5. The ally protections themselves: no PvP against an ally, and no stealing
 *     an ally's flag (walk-in, forged `flagField`, View Earth remote capture).
 *
 * Every claim carries a CONTROL on the SAME setup with the mode OFF (clash /
 * no gameMode / single-player), so each test fails if the wiring is removed.
 * The default (no `gameMode`, no computer seat in a multiplayer lobby) is
 * asserted byte-identical: neither `gameMode` nor `playerTeams` nor
 * `controllers` appears on the built state.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  classifyHeroStep,
  COOP_AI_TEAM_ID,
  COOP_HUMAN_TEAM_ID,
  createAdventureGameState,
  createAdventureLobbyState,
  controllerOf,
  fieldFlaggedByAlly,
  flagField,
  getLegalActions,
  getMainHero,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  playersAreAllied,
  readyCheckConfirmers,
  type GameAction,
  type GameState,
  type MapFieldState,
  type PlayerController,
  type PlayerId
} from "./index";
import { startPlayerCombat } from "./adventure-reducer";
import { capturableEnemyMinesWithin } from "./adventure";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function reject(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be refused").toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

/** A fresh MULTIPLAYER map-setup lobby (no room record → open-table rules). */
function lobby(seed = "coop-lobby"): GameState {
  return createAdventureLobbyState({ seed, scenarioId: "skirmish" });
}

function computerSeatIds(state: GameState): PlayerId[] {
  return (state.setupLobby?.seats ?? [])
    .filter((seat) => controllerOf(state, seat.playerId).kind === "computer")
    .map((seat) => seat.playerId);
}

/**
 * A started 2-seat adventure. `gameMode: "coop"` makes p1 and p2 ALLIES (both
 * human seats join "coop-humans"); omitting it is the clash CONTROL.
 */
function game(opts: { coop: boolean; seed?: string; houseRules?: Record<string, boolean> } ): GameState {
  const state = createAdventureGameState({
    seed: opts.seed ?? `coop-${opts.coop}`,
    ruleset: "binh",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ...(opts.houseRules ? { houseRules: opts.houseRules } : {}),
    ...(opts.coop ? { gameMode: "coop" as const } : {}),
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  const hero = getMainHero(state, "p1")!;
  hero.movementPoints = 6;
  hero.movementHaltedThisTurn = false;
  return state;
}

/** Repaint an unused field adjacent to hero_p1 (mine-army-defense.test.ts recipe). */
const used = new WeakMap<GameState, Set<string>>();
function paintNextTo(state: GameState, location: string, extra: Partial<MapFieldState> = {}): string {
  const hero = getMainHero(state, "p1")!;
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) throw new Error("hero_p1 is not on the map");
  const seen = used.get(state) ?? new Set<string>();
  used.set(state, seen);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !seen.has(candidate.spaceId));
  if (!field) throw new Error("no free adjacent field for hero_p1");
  seen.add(field.spaceId);
  field.location = location;
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.bankId;
  Object.assign(field, extra);
  return field.spaceId;
}

function moveOnto(state: GameState, to: string): GameState {
  return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to });
}

// ===========================================================================
// 1. The option: sanitize + freeze
// ===========================================================================

describe("co-op step 1 — the gameMode option", () => {
  it("SET_GAME_OPTIONS accepts the two literals and REFUSES anything else", () => {
    let state = lobby("coop-option");
    expect(state.setupLobby?.options.gameMode, "absent by default").toBeUndefined();

    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "coop" } });
    expect(state.setupLobby?.options.gameMode).toBe("coop");

    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "clash" } });
    expect(state.setupLobby?.options.gameMode).toBe("clash");

    const message = reject(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      // A forged / out-of-date client value must be refused whole, never coerced.
      options: { gameMode: "team-battle" as unknown as "coop" }
    });
    expect(message).toMatch(/Unknown table mode/);
    expect(state.setupLobby?.options.gameMode, "the refused action changed nothing").toBe("clash");
  });

  it('a built co-op game freezes gameMode "coop" AND the two alliance teams', () => {
    const state = createAdventureGameState({
      seed: "coop-build",
      gameMode: "coop",
      controllers: { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } as PlayerController },
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" },
        { id: "p3", name: "Computer 1", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });

    expect(state.gameMode).toBe("coop");
    expect(state.playerTeams).toEqual({
      p1: COOP_HUMAN_TEAM_ID,
      p2: COOP_HUMAN_TEAM_ID,
      p3: COOP_AI_TEAM_ID
    });
    // The OBSERVABLE consequence, not just the field: the two humans are allies
    // and neither is allied with the computer seat.
    expect(playersAreAllied(state, "p1", "p2")).toBe(true);
    expect(playersAreAllied(state, "p1", "p3")).toBe(false);
    expect(playersAreAllied(state, "p2", "p3")).toBe(false);
  });

  it("CONTROL — clash (and an ABSENT gameMode) stamps neither field, and nobody is allied", () => {
    for (const options of [{ gameMode: "clash" as const }, {}]) {
      const state = createAdventureGameState({
        seed: "coop-control",
        ...options,
        controllers: { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } as PlayerController },
        players: [
          { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
          { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" },
          { id: "p3", name: "Computer 1", factionId: "dungeon", heroDefId: "alamar" }
        ]
      });
      expect(state.gameMode, "absent = clash").toBeUndefined();
      expect(state.playerTeams, "no alliance on a clash table").toBeUndefined();
      expect(playersAreAllied(state, "p1", "p2")).toBe(false);
    }
  });

  it("CONTROL — a plain (no gameMode, no computer) build carries none of the three new keys", () => {
    const state = createAdventureGameState({
      seed: "coop-plain",
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
      ]
    });
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    expect(Object.hasOwn(raw, "gameMode"), "gameMode is never serialized on a clash table").toBe(false);
    expect(Object.hasOwn(raw, "playerTeams")).toBe(false);
    expect(Object.hasOwn(raw, "controllers")).toBe(false);
  });

  it("CONTROL — the single-player allied-computers map preset still stamps its own team id", () => {
    const state = createAdventureGameState({
      seed: "coop-solo-control",
      sessionMode: "single-player",
      controllers: {
        p1: { kind: "human" },
        p2: { kind: "computer", difficulty: "standard", policyVersion: 1 } as PlayerController
      },
      customMapPreset: { computerDiplomacy: "allied" },
      players: [
        { id: "p1", name: "You", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Computer 1", factionId: "rampart", heroDefId: "gelu" }
      ]
    });
    expect(state.gameMode, "single-player allied is NOT co-op mode").toBeUndefined();
    expect(state.playerTeams).toEqual({ p2: "solo-computers" });
  });
});

// ===========================================================================
// 2. Computer opponents in a MULTIPLAYER lobby
// ===========================================================================

describe("co-op step 1 — computer seats in a multiplayer lobby", () => {
  it("appends TRAILING computer seats and stamps controllers for exactly those seats", () => {
    let state = lobby("coop-seats");
    expect(state.setupLobby?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2"]);
    expect(state.controllers, "a plain multiplayer lobby carries no controller map").toBeUndefined();

    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });

    expect(state.setupLobby?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(computerSeatIds(state)).toEqual(["p3", "p4"]);
    // Entries exist ONLY for the computer seats — a human seat is left absent.
    expect(Object.keys(state.controllers ?? {}).sort()).toEqual(["p3", "p4"]);
    expect(state.controllers?.p3).toMatchObject({ kind: "computer" });
    expect(state.setupLobby?.seats[2].name).toBe("Computer 1");
    expect(state.setupLobby?.seats[3].name).toBe("Computer 2");
    expect(state.turnOrder).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("removing them trims the seats AND deletes the controller map (no orphan entries)", () => {
    let state = lobby("coop-remove");
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });
    expect(Object.keys(state.controllers ?? {})).toHaveLength(2);

    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 0 });

    expect(state.setupLobby?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2"]);
    expect(Object.keys(state.players)).toEqual(["p1", "p2"]);
    expect(state.controllers, "the whole map is deleted, so the lobby is byte-identical again").toBeUndefined();
  });

  it("a SEAT-COUNT resize reconciles the controllers map — a trimmed computer leaves no entry", () => {
    let state = lobby("coop-resize");
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });
    expect(Object.keys(state.controllers ?? {}).sort()).toEqual(["p3", "p4"]);

    // The generic resize path (SET_GAME_OPTIONS.playerCount) must not leave p4
    // behind in the controller map after its seat is gone.
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { playerCount: 3 } });
    expect(state.setupLobby?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2", "p3"]);
    expect(Object.keys(state.controllers ?? {})).toEqual(["p3"]);

    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { playerCount: 2 } });
    expect(state.controllers).toBeUndefined();
  });

  it("the total is capped at the scenario capacity (6 seats on skirmish)", () => {
    let state = lobby("coop-cap");
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 9 });
    expect(state.setupLobby?.seats).toHaveLength(6);
    expect(computerSeatIds(state)).toEqual(["p3", "p4", "p5", "p6"]);
  });

  it("is refused once the start check is open, and for a player who is not seated", () => {
    let state = lobby("coop-refuse");
    expect(reject(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p9", count: 1 })).toMatch(
      /Only seated players/
    );

    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
    state.setupLobby!.startCheck = {
      startedByPlayerId: "p1",
      startedAt: 0,
      deadline: 30_000,
      confirmations: ["p1"]
    };
    expect(reject(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 })).toMatch(
      /can only be changed during setup/
    );
    expect(computerSeatIds(state), "the refused action changed nothing").toEqual(["p3"]);
  });

  it("SET_COMPUTER_SEAT_FACTION picks a MULTIPLAYER computer seat's town, and is offered to a seated human", () => {
    let state = lobby("coop-seat-faction");
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });

    const offers = getLegalActions(state, "p1").filter(
      (offer) => offer.action.type === "SET_COMPUTER_SEAT_FACTION"
    );
    expect(offers.length, "the pick is OFFERED in a multiplayer lobby too").toBeGreaterThan(0);

    state = apply(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: { factionId: "necropolis", heroDefId: "sandro" }
    });
    expect(state.setupLobby?.seats[2]).toMatchObject({ factionId: "necropolis", heroDefId: "sandro" });

    // CONTROL: a HUMAN seat is never writable through this action.
    expect(
      reject(state, {
        type: "SET_COMPUTER_SEAT_FACTION",
        playerId: "p1",
        seatPlayerId: "p2",
        choice: { factionId: "tower", heroDefId: "solmyr" }
      })
    ).toMatch(/computer opponent/i);
  });

  it("a computer seat is READY without confirming — the start check only counts seated members", () => {
    let state = lobby("coop-ready");
    state = apply(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = apply(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });

    // p3/p4 are computer seats: they hold no member, so they are never asked.
    expect(readyCheckConfirmers(state)).toEqual(["p1"]);
  });

  it("END TO END: a co-op lobby with a computer seat starts and builds the two alliances", () => {
    let state = lobby("coop-start");
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "coop" } });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" });
    state = apply(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: { factionId: "dungeon", heroDefId: "alamar" }
    });

    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    expect(state.phase, "the adventure really started").not.toBe("setup");
    expect(state.gameMode).toBe("coop");
    expect(state.playerTeams).toEqual({
      p1: COOP_HUMAN_TEAM_ID,
      p2: COOP_HUMAN_TEAM_ID,
      p3: COOP_AI_TEAM_ID
    });
    expect(controllerOf(state, "p3").kind, "the computer seat survives the build").toBe("computer");
    expect(controllerOf(state, "p2").kind).toBe("human");
  });

  it("CONTROL — single-player SET_COMPUTER_OPPONENTS is untouched (seat 0 human, the rest named computers)", () => {
    let state = createAdventureLobbyState({
      seed: "coop-solo",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 3 });
    expect(Object.keys(state.controllers ?? {})).toEqual(["p1", "p2", "p3", "p4"]);
    expect(state.controllers?.p1).toEqual({ kind: "human" });
    expect(computerSeatIds(state)).toEqual(["p2", "p3", "p4"]);
  });
});

// ===========================================================================
// 3. Nobody takes a computer seat
// ===========================================================================

describe("co-op step 1 — a computer seat is never sit-able", () => {
  function hostedWithComputers(seed: string): GameState {
    let state = lobby(seed);
    state = apply(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = apply(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    state = apply(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    return apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });
  }

  it("the HOST cannot seat a member onto a multiplayer computer seat", () => {
    const state = hostedWithComputers("coop-assign-host");
    expect(
      reject(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p3" })
    ).toMatch(/computer seat cannot be taken/i);
    expect(state.room?.members.find((member) => member.clientId === "c2")?.seat).toBe("observer");
  });

  it("a member cannot SELF-CLAIM a computer seat either", () => {
    const state = hostedWithComputers("coop-assign-self");
    expect(
      reject(state, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p4" })
    ).toMatch(/computer seat cannot be taken/i);
  });

  it("CONTROL — the same seat IS assignable while it is a human seat", () => {
    let state = lobby("coop-assign-control");
    state = apply(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = apply(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    state = apply(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    // Four HUMAN seats, no computers: p3 is free to take.
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { playerCount: 4 } });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p3" });
    expect(state.room?.members.find((member) => member.clientId === "c2")?.seat).toBe("p3");
  });

  it("a seat a MEMBER already holds is never converted into a computer seat", () => {
    // The interleaved case the guard exists for: computers on p3/p4, then the
    // host RAISES the seat count so p5/p6 open as HUMAN seats behind them and a
    // member sits on p5. Re-normalizing the computers to the trailing seats
    // would swallow Bob's seat — so the whole action is refused instead.
    let state = lobby("coop-occupied");
    state = apply(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = apply(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    state = apply(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { playerCount: 6 } });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p5" });
    expect(computerSeatIds(state)).toEqual(["p3", "p4"]);

    expect(reject(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 })).toMatch(
      /Move the players in the trailing seats/
    );
    expect(computerSeatIds(state), "the refused action changed nothing").toEqual(["p3", "p4"]);
    expect(state.room?.members.find((member) => member.clientId === "c2")?.seat).toBe("p5");

    // Bob steps down: the very same call now succeeds and normalizes the
    // computers onto the TRAILING seats.
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "observer" });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 2 });
    expect(computerSeatIds(state)).toEqual(["p5", "p6"]);
    expect(Object.keys(state.controllers ?? {}).sort()).toEqual(["p5", "p6"]);
  });
});

// ===========================================================================
// 4. Ally protection — no PvP between allies
// ===========================================================================

describe("co-op step 1 — allies cannot fight one another", () => {
  it("a co-op human cannot open PvP combat against an allied human", () => {
    const state = game({ coop: true, seed: "coop-pvp" });
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;

    expect(() => startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0")).toThrow(
      /Allied players cannot attack/
    );
    expect(state.combat, "no battle opened").toBeFalsy();
  });

  it("CONTROL — the SAME setup on a clash table opens the fight", () => {
    const state = game({ coop: false, seed: "coop-pvp" });
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;

    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    expect(state.combat, "the clash table really fights").toBeTruthy();
  });
});

// ===========================================================================
// 5. Ally protection — no flag stealing
// ===========================================================================

describe("co-op step 1 — an ally's flag is never taken", () => {
  it("an ally's Mine is classified as an OWN field and a real walk-in leaves it alone", () => {
    const state = game({ coop: true, seed: "coop-mine" });
    const mine = paintNextTo(state, "mine", {
      resource: "gold",
      amount: 2,
      flagOwnerId: "p2",
      everFlagged: true
    });
    const hero = getMainHero(state, "p1")!;
    state.players.p2.production.gold = 12;
    const p1ProductionBefore = state.players.p1.production.gold;

    // OFFER half: the movement classification treats it like an own field.
    expect(classifyHeroStep(state, hero, mine)).toBe("open");
    expect(fieldFlaggedByAlly(state, "p1", state.adventure!.fields[mine])).toBe(true);

    // RESOLUTION half: a real MOVE_HERO onto it changes no ownership, no income.
    const next = moveOnto(state, mine);
    expect(next.adventure!.fields[mine].flagOwnerId, "the ally keeps the Mine").toBe("p2");
    expect(next.players.p2.production.gold, "the ally keeps the income").toBe(12);
    expect(next.players.p1.production.gold).toBe(p1ProductionBefore);
  });

  it("CONTROL — the SAME walk-in on a clash table steals the Mine and its income", () => {
    const state = game({ coop: false, seed: "coop-mine" });
    const mine = paintNextTo(state, "mine", {
      resource: "gold",
      amount: 2,
      flagOwnerId: "p2",
      everFlagged: true
    });
    const hero = getMainHero(state, "p1")!;
    state.players.p2.production.gold = 12;
    const p1ProductionBefore = state.players.p1.production.gold;

    expect(classifyHeroStep(state, hero, mine)).toBe("stop");

    const next = moveOnto(state, mine);
    expect(next.adventure!.fields[mine].flagOwnerId).toBe("p1");
    expect(next.players.p2.production.gold, "the loser drops the whole level").toBe(10);
    expect(next.players.p1.production.gold).toBe(p1ProductionBefore + 2);
  });

  it("an ally's Settlement opens no SETTLEMENT_CHOICE (clash CONTROL does)", () => {
    const coop = game({ coop: true, seed: "coop-settlement" });
    const coopField = paintNextTo(coop, "settlement", {
      flagOwnerId: "p2",
      everFlagged: true,
      settlementResource: "gold"
    });
    const afterCoop = moveOnto(coop, coopField);
    expect(afterCoop.pendingChoice, "no capture window against an ally").toBeNull();
    expect(afterCoop.adventure!.fields[coopField].flagOwnerId).toBe("p2");

    const clash = game({ coop: false, seed: "coop-settlement" });
    const clashField = paintNextTo(clash, "settlement", {
      flagOwnerId: "p2",
      everFlagged: true,
      settlementResource: "gold"
    });
    const afterClash = moveOnto(clash, clashField);
    expect(afterClash.pendingChoice?.type, "the clash table captures it").toBe("OPTION_CHOICE");
  });

  it("an ally's Town is not re-flagged (clash CONTROL flags it)", () => {
    const coop = game({ coop: true, seed: "coop-town" });
    const coopField = paintNextTo(coop, "town", { flagOwnerId: "p2", everFlagged: true });
    // p2's army is empty so no garrison window can intervene in either table.
    coop.players.p2.army = [];
    const afterCoop = moveOnto(coop, coopField);
    expect(afterCoop.adventure!.fields[coopField].flagOwnerId).toBe("p2");

    const clash = game({ coop: false, seed: "coop-town" });
    const clashField = paintNextTo(clash, "town", { flagOwnerId: "p2", everFlagged: true });
    clash.players.p2.army = [];
    const afterClash = moveOnto(clash, clashField);
    expect(afterClash.adventure!.fields[clashField].flagOwnerId).toBe("p1");
  });

  it("a FORGED flagField call cannot flip an ally's flag (clash CONTROL flips it)", () => {
    const coop = game({ coop: true, seed: "coop-forged" });
    const coopField = coop.adventure!.fields[paintNextTo(coop, "mine", { flagOwnerId: "p2" })];
    flagField(coop, "p1", coopField);
    expect(coopField.flagOwnerId, "the defensive early-return kept the flag").toBe("p2");
    expect(
      coop.eventLog.some((event) => event.type === "EVENT_NOTE" && /ally/i.test(event.message ?? "")),
      "and it is noted in the log"
    ).toBe(true);
    expect(coop.eventLog.some((event) => event.type === "FIELD_FLAGGED")).toBe(false);

    const clash = game({ coop: false, seed: "coop-forged" });
    const clashField = clash.adventure!.fields[paintNextTo(clash, "mine", { flagOwnerId: "p2" })];
    flagField(clash, "p1", clashField);
    expect(clashField.flagOwnerId).toBe("p1");
  });

  it("View Earth never lists an ALLY's Mine as a capture target (a third player's IS listed)", () => {
    const state = createAdventureGameState({
      seed: "coop-view-earth",
      gameMode: "coop",
      controllers: { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } as PlayerController },
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" },
        { id: "p3", name: "Computer 1", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });
    const hero = getMainHero(state, "p1")!;
    const coord = parseHexSpaceId(hero.spaceId ?? "")!;
    const [allyHex, enemyHex] = hexNeighbors(coord)
      .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
      .filter((field): field is MapFieldState => Boolean(field))
      .slice(0, 2);
    allyHex.location = "mine";
    allyHex.resource = "gold";
    allyHex.amount = 2;
    allyHex.flagOwnerId = "p2";
    enemyHex.location = "mine";
    enemyHex.resource = "gold";
    enemyHex.amount = 2;
    enemyHex.flagOwnerId = "p3";

    const capturable = capturableEnemyMinesWithin(state, "p1", 4);
    expect(capturable, "the AI alliance's Mine is a legal target").toContain(enemyHex.spaceId);
    expect(capturable, "the human ally's Mine is not").not.toContain(allyHex.spaceId);

    // CONTROL: with no alliance the very same ally Mine IS capturable.
    delete state.playerTeams;
    expect(capturableEnemyMinesWithin(state, "p1", 4)).toContain(allyHex.spaceId);
  });

  it("an ally's Mine never opens the mine-army-defense garrison window (clash CONTROL does)", () => {
    const coop = game({ coop: true, seed: "coop-garrison", houseRules: { "mine-army-defense": true } });
    coop.players.p2.resources.gold = 20;
    const coopMine = paintNextTo(coop, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });
    const afterCoop = moveOnto(coop, coopMine);
    expect(afterCoop.pendingChoice, "an ally is never asked to defend").toBeNull();
    expect(afterCoop.adventure!.pendingGarrison).toBeFalsy();
    expect(afterCoop.adventure!.fields[coopMine].flagOwnerId).toBe("p2");

    const clash = game({ coop: false, seed: "coop-garrison", houseRules: { "mine-army-defense": true } });
    clash.players.p2.resources.gold = 20;
    const clashMine = paintNextTo(clash, "mine", { resource: "gold", amount: 2, flagOwnerId: "p2", everFlagged: true });
    const afterClash = moveOnto(clash, clashMine);
    expect(afterClash.adventure!.pendingGarrison?.defenderPlayerId).toBe("p2");
  });
});
