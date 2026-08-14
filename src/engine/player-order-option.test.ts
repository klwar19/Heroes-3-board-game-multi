import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  firstPlayerCeremonyPending,
  getLegalActions,
  resolveManualPlayerOrder,
  sanitizeManualPlayerOrder,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { computerDecisionOwner } from "./computer/window";

// ---------------------------------------------------------------------------
// WHO GOES FIRST (lobby option `playerOrderMode`, default "random").
//
// "random" (absent or explicit) is the shipped rulebook setup-step-22 Attack-die
// roll and its opening ceremony — pinned here by an EXACT-EQUALITY control, so
// legacy lobbies/snapshots are provably byte-identical.
//
// "manual" + a full `manualPlayerOrder` permutation uses that order verbatim:
// the die is never rolled, `openingFirstPlayerRollPending` never arms (a
// ceremony overlay for a roll that never happened is the frozen-table class),
// and the order is announced in the feed instead.
//
// Every claim asserts an OBSERVABLE outcome — the built game's turnOrder, who
// actually has legal actions when round 1 opens, who acts after an END_TURN,
// which events exist — never merely the stored option.
// ---------------------------------------------------------------------------

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

const SEAT_PICKS: { factionId: string; heroDefId: string }[] = [
  { factionId: "castle", heroDefId: "catherine" },
  { factionId: "necropolis", heroDefId: "sandro" },
  { factionId: "rampart", heroDefId: "mephala" },
  { factionId: "tower", heroDefId: "solmyr" }
];

/** Seat every open lobby seat with a distinct faction and start the adventure. */
function startGame(state: GameState): GameState {
  let next = state;
  const seats = state.setupLobby!.seats;
  seats.forEach((seat, index) => {
    const pick = SEAT_PICKS[index]!;
    next = apply(next, {
      type: "CHOOSE_FACTION",
      playerId: seat.playerId,
      factionId: pick.factionId as never,
      heroDefId: pick.heroDefId
    });
  });
  return apply(next, { type: "START_ADVENTURE", playerId: seats[0]!.playerId });
}

/**
 * Drain the opening starting-bonus rewards until the divider fires and round 1
 * really opens (phase "player-turn" with an active seat that owns actions).
 * Answers whatever window is open for whoever owns it, first offer wins.
 */
function openRoundOne(state: GameState): GameState {
  let next = state;
  for (let step = 0; step < 200; step += 1) {
    const owner =
      next.pendingChoice?.playerId ??
      next.adventure?.pendingVisit?.playerId ??
      null;
    if (!owner) {
      return next;
    }
    const offers = getLegalActions(next, owner);
    const legal =
      offers.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP") ??
      offers.find((entry) => entry.action.type === "CHOOSE_OPTION") ??
      offers[0];
    if (!legal) {
      return next;
    }
    next = apply(next, legal.action);
  }
  throw new Error("opening rewards never drained");
}

/** The seats that have at least one legal action right now (ordered play). */
function seatsWithActions(state: GameState): PlayerId[] {
  return state.turnOrder.filter((playerId) => getLegalActions(state, playerId).length > 0);
}

/** Play the active seat's owed steps until its turn actually ends. */
function endActiveTurn(state: GameState): GameState {
  let next = state;
  const acting = next.activePlayerId;
  for (let step = 0; step < 60; step += 1) {
    const offers = getLegalActions(next, acting);
    const end = offers.find((entry) => entry.action.type === "END_TURN");
    if (end) {
      return apply(next, end.action);
    }
    const legal =
      offers.find((entry) => entry.action.type === "REFRESH_HAND") ??
      offers.find((entry) => entry.action.type === "SET_TILE_ROTATION") ??
      offers.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP") ??
      offers.find((entry) => entry.action.type === "CHOOSE_OPTION") ??
      offers[0];
    if (!legal) {
      throw new Error(`no action for ${acting} (phase ${next.phase})`);
    }
    next = apply(next, legal.action);
  }
  throw new Error("turn never ended");
}

describe("Player order option — MANUAL order is honoured exactly", () => {
  it("uses the host's order for turnOrder, the opening turn AND the round wrap — and never rolls", () => {
    let state = createAdventureLobbyState({ seed: "order-manual", playerCount: 3 });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p3", "p1", "p2"] }
    });
    expect(state.setupLobby!.options.manualPlayerOrder).toEqual(["p3", "p1", "p2"]);

    const started = startGame(state);
    // The built game seats the order verbatim from the very first frame.
    expect(started.turnOrder).toEqual(["p3", "p1", "p2"]);
    expect(started.activePlayerId).toBe("p3");
    // No roll happened: no seed was baked, no roll was ever published, and the
    // ceremony gate is not armed.
    expect(started.adventure!.openingFirstPlayerSeed).toBeUndefined();
    expect(started.adventure!.firstPlayerRoll ?? null).toBeNull();
    expect(started.adventure!.openingFirstPlayerRollPending ?? false).toBe(false);
    // The feed announces the fixed order INSTEAD of a roll.
    expect(
      started.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.message.includes("Player order chosen by the host")
      )
    ).toBe(true);

    // Round 1 really opens on the chosen first player, and nobody else may act.
    const round1 = openRoundOne(started);
    expect(round1.adventure!.firstPlayerRoll ?? null).toBeNull();
    expect(round1.adventure!.openingFirstPlayerRollPending ?? false).toBe(false);
    expect(round1.turnOrder).toEqual(["p3", "p1", "p2"]);
    expect(round1.activePlayerId).toBe("p3");
    expect(seatsWithActions(round1)).toEqual(["p3"]);
    expect(round1.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(false);

    // The ROUND WRAP follows the same order: p3 → p1.
    const afterFirstTurn = endActiveTurn(round1);
    expect(afterFirstTurn.activePlayerId).toBe("p1");
  });

  it("CONTROL: the same seed on RANDOM order rolls, publishes the roll and does NOT seat p3 first", () => {
    const started = startGame(createAdventureLobbyState({ seed: "order-manual", playerCount: 3 }));

    // The die really rolled and its winner leads — nothing the host chose.
    const roll = started.adventure!.firstPlayerRoll;
    expect(roll).toBeTruthy();
    expect(started.turnOrder[0]).toBe(roll!.winnerPlayerId);
    expect(started.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(true);
    expect(
      started.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.message.includes("Player order chosen by the host")
      )
    ).toBe(false);
  });

  it("survives the STARTING-BONUS phase: the divider opens round 1 on the chosen seat, still unrolled", () => {
    // Impossible (the lobby default) has no starting bonus, so the divider fires
    // during START_ADVENTURE. Normal queues a bonus per seat, so this drives the
    // real "divider waits behind every bonus, THEN opens round 1" path.
    let state = createAdventureLobbyState({ seed: "order-bonus", playerCount: 3 });
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { difficulty: "normal" } });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p2", "p3", "p1"] }
    });

    const started = startGame(state);
    // The divider really is still queued behind the bonuses here.
    expect(started.adventure!.rewardQueue.some((reward) => reward.kind === "opening-first-player-roll")).toBe(true);

    const round1 = openRoundOne(started);
    expect(round1.turnOrder).toEqual(["p2", "p3", "p1"]);
    expect(round1.activePlayerId).toBe("p2");
    expect(round1.adventure!.firstPlayerRoll ?? null).toBeNull();
    expect(round1.adventure!.openingFirstPlayerRollPending ?? false).toBe(false);
    expect(round1.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(false);
  });

  it("the chosen first player also takes MAP position 1 (exactly as a rolled winner would)", () => {
    // A roll-free seat-order build is the reference frame: position 1 is p1's
    // home, position 2 is p2's.
    const players = [
      { id: "p1", name: "One", factionId: "castle" as const, heroDefId: "catherine" },
      { id: "p2", name: "Two", factionId: "necropolis" as const, heroDefId: "sandro" }
    ];
    const seatOrder = createAdventureGameState({
      seed: "order-positions",
      rollFirstPlayer: false,
      players
    });
    const manual = createAdventureGameState({
      seed: "order-positions",
      playerOrderMode: "manual",
      manualPlayerOrder: ["p2", "p1"],
      players
    });

    // p2 leads, so p2 now stands where p1 stood, and p1 where p2 stood.
    expect(manual.towns.town_p2!.fieldId).toBe(seatOrder.towns.town_p1!.fieldId);
    expect(manual.towns.town_p1!.fieldId).toBe(seatOrder.towns.town_p2!.fieldId);
    // In-test CONTROL: the two positions really are different, so the swap above
    // is not vacuously true.
    expect(seatOrder.towns.town_p1!.fieldId).not.toBe(seatOrder.towns.town_p2!.fieldId);
  });

  it("a manual order that puts the LAST seat first still opens that seat's turn (not seat order)", () => {
    let state = createAdventureLobbyState({ seed: "order-manual-last", playerCount: 2 });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p2", "p1"] }
    });
    const round1 = openRoundOne(startGame(state));
    expect(round1.turnOrder).toEqual(["p2", "p1"]);
    expect(seatsWithActions(round1)).toEqual(["p2"]);
  });
});

describe("Player order option — RANDOM (default) is byte-identical", () => {
  it("EXACT EQUALITY: option absent vs explicit \"random\" build the identical game", () => {
    const absent = startGame(createAdventureLobbyState({ seed: "order-equal", playerCount: 3 }));
    let explicitLobby = createAdventureLobbyState({ seed: "order-equal", playerCount: 3 });
    explicitLobby = apply(explicitLobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "random" }
    });
    const explicit = startGame(explicitLobby);

    // The lobby option write adds a GAME_OPTIONS_CHANGED line, so compare the
    // built ADVENTURE state (setup, map, decks, order) rather than the log.
    const strip = (state: GameState) =>
      JSON.stringify({
        turnOrder: state.turnOrder,
        activePlayerId: state.activePlayerId,
        adventure: state.adventure,
        players: state.players,
        towns: state.towns,
        heroes: state.heroes,
        decks: state.decks,
        map: state.map
      });
    expect(strip(explicit)).toBe(strip(absent));
  });

  it("EXACT EQUALITY: a leftover manualPlayerOrder is INERT while the mode is random", () => {
    // Flipping to manual and back must not leave a booby trap: the stored order
    // survives in the lobby (so the picker remembers it) but the built game must
    // be indistinguishable from one that never had a list at all.
    const plain = startGame(createAdventureLobbyState({ seed: "order-inert", playerCount: 3 }));
    let leftoverLobby = createAdventureLobbyState({ seed: "order-inert", playerCount: 3 });
    leftoverLobby = apply(leftoverLobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p3", "p2", "p1"] }
    });
    leftoverLobby = apply(leftoverLobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "random" }
    });
    expect(leftoverLobby.setupLobby!.options.manualPlayerOrder).toEqual(["p3", "p2", "p1"]);
    const leftover = startGame(leftoverLobby);

    const strip = (state: GameState) =>
      JSON.stringify({
        turnOrder: state.turnOrder,
        activePlayerId: state.activePlayerId,
        adventure: state.adventure,
        players: state.players,
        towns: state.towns,
        heroes: state.heroes,
        map: state.map
      });
    expect(strip(leftover)).toBe(strip(plain));
  });

  it("CONTROL: a LEGACY lobby (no player-order field at all) still rolls exactly as before", () => {
    const lobby = createAdventureLobbyState({ seed: "order-legacy", playerCount: 2 });
    expect(lobby.setupLobby!.options.playerOrderMode).toBeUndefined();
    expect(lobby.setupLobby!.options.manualPlayerOrder).toBeUndefined();

    const started = startGame(lobby);
    // The roll ran and published exactly as it always has.
    expect(started.adventure!.firstPlayerRoll).toBeTruthy();
    expect(started.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(true);
    expect(started.turnOrder[0]).toBe(started.adventure!.firstPlayerRoll!.winnerPlayerId);
  });
});

describe("Player order option — sanitisation", () => {
  it("SET_GAME_OPTIONS drops unknown ids and duplicates, then appends the missing seats", () => {
    let state = createAdventureLobbyState({ seed: "order-sanitize", playerCount: 3 });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        playerOrderMode: "manual",
        manualPlayerOrder: ["p3", "p9", "p3", "p1"] as PlayerId[]
      }
    });
    // p9 unknown → dropped; the second p3 → dropped; p2 was never named → appended.
    expect(state.setupLobby!.options.manualPlayerOrder).toEqual(["p3", "p1", "p2"]);

    // And the SANITISED list is what the built game plays.
    const started = startGame(state);
    expect(started.turnOrder).toEqual(["p3", "p1", "p2"]);
  });

  it("switching to manual with no list seeds the current seat order (never an empty pick)", () => {
    let state = createAdventureLobbyState({ seed: "order-seed", playerCount: 3 });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual" }
    });
    expect(state.setupLobby!.options.manualPlayerOrder).toEqual(["p1", "p2", "p3"]);
  });

  it("a SEAT-COUNT change re-coerces the stored order (closed seats leave, new ones join)", () => {
    let state = createAdventureLobbyState({ seed: "order-resize", playerCount: 4 });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p4", "p3", "p2", "p1"] }
    });
    expect(state.setupLobby!.options.manualPlayerOrder).toEqual(["p4", "p3", "p2", "p1"]);

    // Shrink to 2 seats: p3/p4 are gone, the surviving relative order is kept.
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { playerCount: 2 } });
    expect(state.setupLobby!.options.manualPlayerOrder).toEqual(["p2", "p1"]);

    // Grow back to 3: the new seat joins at the end rather than being missing.
    state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { playerCount: 3 } });
    expect(state.setupLobby!.options.manualPlayerOrder).toEqual(["p2", "p1", "p3"]);

    // The still-valid order is what the game plays.
    const started = startGame(state);
    expect(started.turnOrder).toEqual(["p2", "p1", "p3"]);
  });

  it("an unknown mode is rejected and leaves the lobby on the random default", () => {
    const state = createAdventureLobbyState({ seed: "order-bad-mode", playerCount: 2 });
    const result = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "backwards" as never }
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.setupLobby!.options.playerOrderMode).toBeUndefined();
  });

  it("pure helpers: sanitize always yields a full permutation, resolve refuses a partial one", () => {
    expect(sanitizeManualPlayerOrder(["p1", "p2", "p3"], ["p2"])).toEqual(["p2", "p1", "p3"]);
    expect(sanitizeManualPlayerOrder(["p1", "p2"], undefined)).toEqual(["p1", "p2"]);
    expect(sanitizeManualPlayerOrder(["p1", "p2"], [7, "p2", "p2"] as never[])).toEqual(["p2", "p1"]);

    expect(resolveManualPlayerOrder(["p1", "p2"], "manual", ["p2", "p1"])).toEqual(["p2", "p1"]);
    // Off / partial / duplicated / unknown → null = "fall back to the roll".
    expect(resolveManualPlayerOrder(["p1", "p2"], "random", ["p2", "p1"])).toBeNull();
    expect(resolveManualPlayerOrder(["p1", "p2"], undefined, ["p2", "p1"])).toBeNull();
    expect(resolveManualPlayerOrder(["p1", "p2"], "manual", ["p1"])).toBeNull();
    expect(resolveManualPlayerOrder(["p1", "p2"], "manual", ["p1", "p1"])).toBeNull();
    expect(resolveManualPlayerOrder(["p1", "p2"], "manual", ["p1", "p9"])).toBeNull();
  });
});

describe("Player order option — build-time fallback", () => {
  it("a PARTIAL manual order at build time falls back to the random roll WITH a feed note", () => {
    const built = createAdventureGameState({
      seed: "order-partial",
      playerOrderMode: "manual",
      manualPlayerOrder: ["p2"],
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });

    // Fell back: the die really rolled and its winner leads.
    expect(built.adventure!.firstPlayerRoll).toBeTruthy();
    expect(built.turnOrder[0]).toBe(built.adventure!.firstPlayerRoll!.winnerPlayerId);
    // Never silent: the table is told the chosen order was not usable.
    expect(
      built.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.message.includes("did not match this game's seats")
      )
    ).toBe(true);
  });

  it("manual mode with NO order at all also falls back to the roll (never a partial seating)", () => {
    const built = createAdventureGameState({
      seed: "order-none",
      playerOrderMode: "manual",
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    expect(built.adventure!.firstPlayerRoll).toBeTruthy();
    expect(built.turnOrder[0]).toBe(built.adventure!.firstPlayerRoll!.winnerPlayerId);
    expect(
      built.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.message.includes("did not match this game's seats")
      )
    ).toBe(true);
  });

  it("CONTROL: the same build with the FULL order uses it and skips the roll", () => {
    const built = createAdventureGameState({
      seed: "order-partial",
      playerOrderMode: "manual",
      manualPlayerOrder: ["p2", "p1"],
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });

    expect(built.turnOrder).toEqual(["p2", "p1"]);
    expect(built.activePlayerId).toBe("p2");
    expect(built.adventure!.openingFirstPlayerSeed).toBeUndefined();
    expect(built.adventure!.firstPlayerRoll ?? null).toBeNull();
    expect(built.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(false);
    expect(
      built.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.message.includes("did not match this game's seats")
      )
    ).toBe(false);
  });
});

describe("Player order option — single player", () => {
  it("the human may put a COMPUTER seat first, and that seat's turn opens (no ceremony)", () => {
    let state = createAdventureLobbyState({
      seed: "order-solo",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p2", "p1"] }
    });

    const started = startGame(state);
    expect(started.turnOrder).toEqual(["p2", "p1"]);
    expect(started.activePlayerId).toBe("p2");
    // The ceremony gate is what would otherwise strand a computer-won roll
    // behind a dismiss nobody sent; with no roll it must never arm.
    expect(started.adventure!.openingFirstPlayerRollPending ?? false).toBe(false);

    const round1 = openRoundOne(started);
    expect(round1.turnOrder).toEqual(["p2", "p1"]);
    expect(round1.activePlayerId).toBe("p2");
    expect(round1.adventure!.openingFirstPlayerRollPending ?? false).toBe(false);
    expect(round1.eventLog.some((event) => event.type === "FIRST_PLAYER_ROLLED")).toBe(false);
  });

  it("the AI is DRIVABLE from the first frame — the ceremony gate is what would freeze it", () => {
    let state = createAdventureLobbyState({
      seed: "order-solo-drive",
      sessionMode: "single-player",
      computerOpponents: 1
    });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerOrderMode: "manual", manualPlayerOrder: ["p2", "p1"] }
    });
    const round1 = openRoundOne(startGame(state));

    // The two reads that must stay in lockstep (legal-actions' gate and the
    // runner's owner read): with no ceremony armed, the computer seat that the
    // host put first genuinely owes the turn and the pump will drive it.
    expect(firstPlayerCeremonyPending(round1)).toBe(false);
    expect(computerDecisionOwner(round1)).toBe("p2");
    expect(getLegalActions(round1, "p2").length).toBeGreaterThan(0);

    // CONTROL — the discriminator: arming the flag by hand (what a roll would
    // have done) is exactly what strands the computer seat. So skipping the
    // roll is not cosmetic; it is what keeps this table moving.
    const armed: GameState = {
      ...round1,
      adventure: { ...round1.adventure!, openingFirstPlayerRollPending: true }
    };
    expect(firstPlayerCeremonyPending(armed)).toBe(true);
    expect(computerDecisionOwner(armed)).toBeNull();
  });
});
