import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { EVENTS_DECK_ID, eliminatePlayer, getEventsState, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { roundStartEventResolver } from "./parallel-turns";

/**
 * AUDIT — Events / Astrologers proclamations under PARALLEL TURNS.
 *
 * The round-start Event barrier (`adventure.eventResolution`) is documented as
 * freezing the WHOLE table — "even the quiet set is off, no seat may move / draw
 * / build until every player has resolved it". These specs probe whether that
 * really holds for every kind of round-start work the barrier is raised over,
 * and whether the barrier always lifts with every live seat's parallel turn
 * open again.
 */

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

/** Repaints an empty, trigger-free field next to a hero and returns its id. */
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) {
    throw new Error(`${heroId} is not on the map`);
  }
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town");
  if (!field) {
    throw new Error(`no adjacent field for ${heroId}`);
  }
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}


/**
 * v128 parallel round events: every seat's Event/Astrologers window is parked
 * per seat and opens in that seat's own context after its start-of-turn draw.
 * Drives each seat through draw → choice/window until nothing is offered.
 */
function driveParallelWindows(
  state: GameState,
  seats: PlayerId[]
): { state: GameState; sawWindow: Set<PlayerId>; sawChoice: Set<PlayerId> } {
  const sawWindow = new Set<PlayerId>();
  const sawChoice = new Set<PlayerId>();
  for (let guard = 0; guard < 40; guard += 1) {
    let progressed = false;
    for (const id of seats) {
      const offers = getLegalActions(state, id);
      if (offers.some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")) sawWindow.add(id);
      if (offers.some((entry) => entry.action.type === "CHOOSE_OPTION")) sawChoice.add(id);
      const next =
        offers.find((entry) => entry.action.type === "CHOOSE_OPTION") ??
        offers.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP") ??
        offers.find((entry) => entry.action.type === "REFRESH_HAND");
      if (!next) continue;
      state = apply(state, next.action);
      progressed = true;
      // Never a whole-table barrier, never a stop of parallel play.
      expect(state.adventure?.eventResolution ?? null).toBeNull();
      expect(state.turn.mode).toBe("parallel");
    }
    if (!progressed) break;
  }
  return { state, sawWindow, sawChoice };
}

function eventOwner(state: GameState): PlayerId | null {
  return state.pendingChoice?.playerId ?? state.adventure?.pendingVisit?.playerId ?? null;
}

function resolveCurrentEventStep(state: GameState): GameState {
  const owner = eventOwner(state);
  expect(owner, "expected an open event choice").toBeTruthy();
  const legal = getLegalActions(state, owner!).find((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
  expect(legal, `no RESOLVE_VISIT_STEP offered to ${owner}`).toBeTruthy();
  return apply(state, legal!.action);
}

function stackEventDeck(state: GameState, cardId: string): void {
  const deck = state.decks[EVENTS_DECK_ID];
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
}

// ===========================================================================
// 1. Wave assaults ride the SAME round-start barrier — but do they freeze the
//    table in parallel mode?
// ===========================================================================

describe("AUDIT — Calamity Wave assaults behind the round-start barrier (parallel)", () => {
  /** 2-player PARALLEL game with Calamity Waves on cadence 3 (waves on 3, 6…). */
  function parallelWavesGame(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      parallelTurns: 8,
      wog: { enabled: true, monsterWaves: true, waveCadence: 3 }
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    return state;
  }

  it("freezes a bystander's quiet move while another seat's wave assault is open under the barrier", () => {
    const state = parallelWavesGame("audit-wave-barrier");
    state.round = 3;
    startAdventureRound(state);
    pumpAdventureQueues(state);

    // The barrier is up and seat 1's wave combat is the open interaction.
    expect(state.adventure?.eventResolution?.round).toBe(3);
    expect(state.combat?.attackerPlayerId).toBe("p1");
    expect(state.turn.mode).toBe("parallel");

    // ROOT CAUSE: with the barrier's current work being a COMBAT (not a
    // pendingChoice / pendingVisit),  reports NOBODY,
    // so both the legal-actions gate and the applyAction backstop skip the
    // whole-table freeze and fall back to the ordinary parallel bystander
    // rules (quiet moves allowed).
    expect(roundStartEventResolver(state)).toBe("p1");
    // p2 is a bystander behind the WHOLE-TABLE round-start barrier: it must be
    // frozen out entirely, exactly as it is while another seat resolves an
    // Event or an Astrologers prompt.
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const message = expectRejected(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: quiet
    });
    expect(message).toContain("Event is still being resolved");
    expect(state.heroes.hero_p2.spaceId).not.toBe(quiet);
    expect(getLegalActions(state, "p2")).toEqual([]);
  });
});

// ===========================================================================
// 2. A per-player Event resolves for every parallel seat, income first, and the
//    barrier lifts with every seat's turn open again.
// ===========================================================================

describe("AUDIT — a per-player Event across three parallel seats", () => {
  function parallelEventsGame(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      events: true,
      parallelTurns: 8,
      players: THREE_PLAYERS
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    return state;
  }

  it("pays income BEFORE the Event, parks one window per seat, and freezes nobody (v128)", () => {
    let state = parallelEventsGame("audit-event-three");
    stackEventDeck(state, "event.stables");
    // Round 2 is an Astrologers round: keep it instant so only the round-3
    // Event parks per-seat work.
    state.decks.astrologers.drawPile = ["astrologers.dead_silence", "astrologers.dead_silence"];

    // REAL parallel round wraps: 1 -> 2 (instant Astrologers), 2 -> 3 (Event).
    const seats: PlayerId[] = ["p1", "p2", "p3"];
    for (const id of ["p3", "p2", "p1"] as PlayerId[]) {
      state = apply(state, { type: "END_TURN", playerId: id });
    }
    expect(state.round).toBe(2);
    const goldBefore = {
      p1: state.players.p1.resources.gold,
      p2: state.players.p2.resources.gold,
      p3: state.players.p3.resources.gold
    };
    for (const id of ["p3", "p2", "p1"] as PlayerId[]) {
      state = apply(state, { type: "END_TURN", playerId: id });
    }
    expect(state.round).toBe(3);

    // Income (rulebook: income, THEN Event) already paid for every seat while
    // the Event work is still parked and unresolved. No whole-table barrier.
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    for (const id of seats) {
      expect(state.players[id].resources.gold, id + " income").toBeGreaterThan(
        goldBefore[id as "p1"]
      );
      expect(state.adventure?.parallelRoundRewards?.[id]?.length ?? 0, id + " parked").toBeGreaterThan(0);
      // Nobody is frozen: every seat's own start-of-turn draw is offered…
      expect(state.players[id].canMulligan, id + " start-of-turn draw").toBe(true);
      expect(
        getLegalActions(state, id).some((entry) => entry.action.type === "REFRESH_HAND"),
        id + " REFRESH_HAND offered"
      ).toBe(true);
      // …but the turn cannot be ended around the parked Event.
      expect(getLegalActions(state, id).some((entry) => entry.action.type === "END_TURN"), id + " END_TURN").toBe(false);
    }

    // Every seat draws and answers its OWN window, in any order.
    const drained = driveParallelWindows(state, seats);
    expect([...drained.sawWindow].sort()).toEqual(["p1", "p2", "p3"]);
    const next = drained.state;
    expect(next.adventure?.parallelEventOpenPlayers ?? []).toEqual([]);
    expect(Object.values(next.adventure?.parallelRoundRewards ?? {}).flat()).toEqual([]);
    expect(next.turn.mode).toBe("parallel");
    expect(next.turn.completedPlayerIds).toEqual([]);
    for (const id of seats) {
      expect(getLegalActions(next, id).some((entry) => entry.action.type === "END_TURN"), id + " END_TURN").toBe(true);
    }
  });

  it("rotates the Event drawer clockwise across successive parallel Resource rounds", () => {
    const state = parallelEventsGame("audit-event-drawer");
    state.round = 3;
    startAdventureRound(state);
    pumpAdventureQueues(state);
    const firstDrawer = getEventsState(state)!.lastDrawerId;
    // v128: each seat answers its own parked window (after its draw).
    let next = driveParallelWindows(state, ["p1", "p2", "p3"]).state;

    next.round = 5;
    startAdventureRound(next);
    pumpAdventureQueues(next);
    const secondDrawer = getEventsState(next)!.lastDrawerId;

    const seating = ["p1", "p2", "p3"];
    expect(secondDrawer).toBe(seating[(seating.indexOf(firstDrawer!) + 1) % 3]);
  });
});

// ===========================================================================
// 3. Elimination of the CURRENT resolver mid-barrier, in parallel mode.
// ===========================================================================

describe("AUDIT — elimination mid-barrier never strands a parallel table", () => {
  it("hands the open Astrologers slot on and still lifts the barrier with parallel turns open", () => {
    let state = createAdventureGameState({
      seed: "audit-par-elim",
      difficulty: "normal",
      rollFirstPlayer: false,
      parallelTurns: 8,
      players: THREE_PLAYERS
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.decks.astrologers.drawPile = ["astrologers.dancing_imp"];

    // REAL round wrap 1 -> 2 (the Astrologers round) through parallel END_TURNs.
    for (const id of ["p3", "p2", "p1"] as PlayerId[]) {
      state.players[id].hand = ["stat.attack"];
      state.players[id].discard = [];
      state = apply(state, { type: "END_TURN", playerId: id });
    }
    expect(state.round).toBe(2);
    // v128: the Dancing Imp empowers are parked per seat; no whole-table barrier.
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    for (const id of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(state.adventure?.parallelRoundRewards?.[id]?.length ?? 0, id + " parked").toBeGreaterThan(0);
    }

    // A seat is removed while its work is still parked (AFK-kick path).
    eliminatePlayer(state, "p1", "removed mid-resolution", false);
    pumpAdventureQueues(state);

    // The survivors resolve their own windows; the departed seat's parked work
    // is dropped and never strands the table.
    const drained = driveParallelWindows(state, ["p2", "p3"]);
    const next = drained.state;
    expect([...drained.sawWindow].sort()).toEqual(["p2", "p3"]);
    expect(next.adventure?.parallelRoundRewards?.p1 ?? []).toEqual([]);
    expect(next.adventure?.parallelEventPlayers ?? []).not.toContain("p1");
    expect(next.adventure?.parallelEventOpenPlayers ?? []).toEqual([]);
    expect(next.adventure?.eventResolution ?? null).toBeNull();
    expect(next.turn.mode).toBe("parallel");
    expect(next.turn.completedPlayerIds).toEqual([]);
    for (const id of ["p2", "p3"] as PlayerId[]) {
      expect(getLegalActions(next, id).length, id + " can act").toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// 4. A designer timed `choice` event raises the barrier in parallel too.
// ===========================================================================

describe("AUDIT — designer timed `choice` event under parallel turns", () => {
  it("freezes every non-resolving seat and lifts once all seats have chosen", () => {
    const state = createAdventureGameState({
      seed: "audit-timed-choice",
      difficulty: "normal",
      rollFirstPlayer: false,
      parallelTurns: 8,
      customMapPreset: {
        timedEvents: [
          {
            round: 3,
            effect: {
              kind: "choice",
              prompt: "Pick your boon",
              options: [
                { kind: "resources", gold: 3, buildingMaterials: 0, valuables: 0 },
                { kind: "morale", amount: 1 }
              ]
            }
          }
        ]
      }
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;

    state.round = 3;
    startAdventureRound(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.eventResolution?.round).toBe(3);
    const owner = eventOwner(state);
    expect(owner).toBeTruthy();
    const bystander: PlayerId = owner === "p1" ? "p2" : "p1";
    expect(getLegalActions(state, bystander)).toEqual([]);

    let next = resolveCurrentEventStep(state);
    next = resolveCurrentEventStep(next);
    expect(next.adventure?.eventResolution ?? null).toBeNull();
    expect(next.turn.mode).toBe("parallel");
  });
});

// ===========================================================================
// 5. Explorers (mandatory draw-then-discard) under parallel turns.
// ===========================================================================

describe("AUDIT — Explorers hand step across parallel seats", () => {
  it("makes the draw-then-discard mandatory for EVERY open parallel turn, not just seat 1", () => {
    const state = createAdventureGameState({
      seed: "audit-par-explorers",
      difficulty: "normal",
      rollFirstPlayer: false,
      parallelTurns: 8
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    state.decks.astrologers.drawPile = ["astrologers.explorers"];

    state.round = 2;
    startAdventureRound(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.explorers");

    let next = state;
    for (const id of ["p2", "p1"] as PlayerId[]) {
      next.players[id].canMulligan = true;
      // End turn is refused while the mandatory Explorers draw is owed.
      expect(expectRejected(next, { type: "END_TURN", playerId: id })).toContain("Explorers");
      next = apply(next, { type: "REFRESH_HAND", playerId: id, discardCardIds: [] });
      expect(next.players[id].explorersDiscardPending, `${id} owes the discard step`).toBe(true);
      expect(expectRejected(next, { type: "END_TURN", playerId: id })).toContain("Explorers");
      next = apply(next, { type: "RESOLVE_EXPLORERS_DISCARD", playerId: id, discardCardIds: [] });
      expect(next.players[id].explorersDiscardPending).toBe(false);
    }
    expect(next.turn.mode).toBe("parallel");
  });
});

// ===========================================================================
// 6. A wave round wrapped in PARALLEL mode must leave every seat's turn open
//    (the wave branch of finalizeAdventureCombat rewrites activePlayerId).
// ===========================================================================

describe("AUDIT — a parallel wave round hands every seat its turn back", () => {
  it("keeps parallel mode with both turns open and both start-of-turn draws after the assaults", () => {
    let state = createAdventureGameState({
      seed: "audit-wave-wrap",
      difficulty: "normal",
      rollFirstPlayer: false,
      parallelTurns: 8,
      wog: { enabled: true, monsterWaves: true, waveCadence: 3 }
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.decks.astrologers.drawPile = ["astrologers.dead_silence", "astrologers.dead_silence"];

    // REAL parallel wraps 1 -> 2 -> 3 (the wave round).
    for (let round = 0; round < 2; round += 1) {
      for (const id of ["p2", "p1"] as PlayerId[]) {
        state = apply(state, { type: "END_TURN", playerId: id });
      }
    }
    expect(state.round).toBe(3);
    expect(state.adventure?.eventResolution?.round).toBe(3);
    expect(state.combat?.attackerPlayerId).toBe("p1");

    for (const seat of ["p1", "p2"] as PlayerId[]) {
      expect(state.combat?.attackerPlayerId, `${seat} assault open`).toBe(seat);
      state.combat!.outcome = {
        winnerPlayerId: seat,
        defeatedPlayerId: "neutrals",
        reason: "all-enemy-units-defeated"
      };
      const settled = applyAction(state, { type: "ACKNOWLEDGE_COMBAT_END", playerId: seat });
      expect(settled.errors.map((error) => error.message).join("; ")).toBe("");
      state = settled.state;
    }

    expect(state.combat).toBeNull();
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    expect(state.turn.completedPlayerIds).toEqual([]);
    for (const id of ["p1", "p2"] as PlayerId[]) {
      expect(state.players[id].canMulligan, `${id} draw`).toBe(true);
      expect(
        getLegalActions(state, id).some((entry) => entry.action.type === "REFRESH_HAND"),
        `${id} may act`
      ).toBe(true);
    }
  });
});

// ===========================================================================
// 7. Isra's Friends — one half-cost reinforce offer per parallel seat.
// ===========================================================================

describe("AUDIT — Isra's Friends reaches every parallel seat", () => {
  it("parks one offer per live seat; each resolves in its own window with no barrier (v128)", () => {
    let state = createAdventureGameState({
      seed: "audit-isra-parallel",
      difficulty: "normal",
      rollFirstPlayer: false,
      parallelTurns: 8,
      players: THREE_PLAYERS
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
      player.resources.gold += 40;
    }
    state.decks.astrologers.drawPile = ["astrologers.isras_friends"];

    for (const id of ["p3", "p2", "p1"] as PlayerId[]) {
      state = apply(state, { type: "END_TURN", playerId: id });
    }
    expect(state.round).toBe(2);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.isras_friends");
    expect(state.adventure?.eventResolution ?? null).toBeNull();

    const seats: PlayerId[] = ["p1", "p2", "p3"];
    for (const id of seats) {
      expect(state.adventure?.parallelRoundRewards?.[id]?.length ?? 0, `${id} parked`).toBeGreaterThan(0);
      expect(state.players[id].canMulligan, `${id} draw`).toBe(true);
      expect(getLegalActions(state, id).some((entry) => entry.action.type === "REFRESH_HAND"), `${id} not frozen`).toBe(true);
    }
    const drained = driveParallelWindows(state, seats);
    expect([...drained.sawWindow].sort()).toEqual(["p1", "p2", "p3"]);
    expect(drained.state.adventure?.parallelEventOpenPlayers ?? []).toEqual([]);
    expect(drained.state.turn.mode).toBe("parallel");
  });
});
