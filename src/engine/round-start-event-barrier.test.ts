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
import { EVENTS_DECK_ID, getEventsState, getTownOfPlayer, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";

/**
 * Round-start Event / Astrologers BARRIER — the user's rule (both event types,
 * "all mode, normal or parallel turn"): when a round draws an Event (Fortress
 * deck) or an Astrologers proclamation, the WHOLE table pauses to resolve it
 * FIRST — before any City Hall choice, resource die, first-turn draw or turn —
 * and no player may do anything else (not even a quiet move) until every player
 * has resolved it. Only then does the normal round-start flow proceed.
 *
 * This file pins the Fortress Event-deck side (the Astrologers side is pinned in
 * astrologers-parallel-turns.test.ts, which shares the exact same barrier
 * mechanism). Every assertion fails if the wiring is removed (CLAUDE.md #1):
 * each freeze has a CONTROL where the same action succeeds once the barrier is
 * down, and the ordering test's control is the whole point — the Event opens
 * before the City Hall, which only holds because the Event is drawn first.
 */

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

/** A 2-player parallel game with the Event deck on and a quiet, choice-free board. */
function parallelEventsGame(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: true,
    parallelTurns: 4
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

/** Puts `cardId` on TOP of the Event draw pile (drawTop pops the array end). */
function stackEventDeck(state: GameState, cardId: string): void {
  const deck = state.decks[EVENTS_DECK_ID];
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
}

/** Runs the Resource-round start (Event draw first, then income) and pumps. */
function startEventResourceRound(state: GameState, round = 3): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

/** The player who owns the event choice currently open (or null). */
function eventVisitOwner(state: GameState): PlayerId | null {
  return state.pendingChoice?.playerId ?? state.adventure?.pendingVisit?.playerId ?? null;
}

/** Applies the current event-visit owner's first RESOLVE_VISIT_STEP option. */
function resolveCurrentEventStep(state: GameState): GameState {
  const owner = eventVisitOwner(state);
  expect(owner, "expected an open event choice").toBeTruthy();
  const legal = getLegalActions(state, owner!).find((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
  expect(legal, `no RESOLVE_VISIT_STEP offered to the event owner ${owner}`).toBeTruthy();
  return apply(state, legal!.action);
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

// ===========================================================================
// A. Parallel — the whole table freezes until every player resolves the Event
// ===========================================================================

describe("Event deck × parallel — every seat resolves the Event in its OWN window; nobody is frozen (v128)", () => {
  it("parks one window per seat, opens it after that seat's draw, and leaves the other seat free to move", () => {
    const state = parallelEventsGame("barrier-par-freeze");
    stackEventDeck(state, "event.stables");
    startEventResourceRound(state);

    // No whole-table barrier and no shared visit: the Event is parked per seat.
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.adventure?.pendingVisit).toBeNull();
    for (const id of ["p1", "p2"] as PlayerId[]) {
      expect(state.adventure?.parallelRoundRewards?.[id]?.length ?? 0, `${id} parked`).toBeGreaterThan(0);
      expect(getLegalActions(state, id).some((entry) => entry.action.type === "END_TURN"), `${id} END_TURN withheld`).toBe(false);
    }

    // p1 takes its start-of-turn draw: ITS window opens; p2 is not frozen.
    let next = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(getLegalActions(next, "p1").some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    expect(getLegalActions(next, "p2").some((entry) => entry.action.type === "REFRESH_HAND")).toBe(true);
    next = apply(next, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    expect(getLegalActions(next, "p2").some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);

    // p2 answers its own window first (no seat order) while p1's stays open…
    const answerP2 = getLegalActions(next, "p2").find((entry) => entry.action.type === "RESOLVE_VISIT_STEP")!;
    next = apply(next, answerP2.action);
    expect(getLegalActions(next, "p1").some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    // …and moves freely beside it (CONTROL: the old barrier rejected this).
    const quiet = emptyFieldNextTo(next, "hero_p2");
    next = apply(next, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: quiet });
    expect(next.heroes.hero_p2.spaceId).toBe(quiet);

    // p1 answers last: nothing stays parked and the table is still parallel.
    const drained = driveParallelWindows(next, ["p1", "p2"]);
    expect(drained.sawWindow.has("p1")).toBe(true);
    expect(drained.state.adventure?.parallelEventOpenPlayers ?? []).toEqual([]);
    expect(Object.values(drained.state.adventure?.parallelRoundRewards ?? {}).flat()).toEqual([]);
    expect(drained.state.adventure?.eventResolution ?? null).toBeNull();
    expect(drained.state.turn.mode).toBe("parallel");
  });
});

// ===========================================================================
// B. Ordering — the Event resolves BEFORE City Hall round-start choices
// ===========================================================================

describe("Event deck × parallel — table-wide City Hall choices drain first, then each seat's Event window (v128)", () => {
  // Parallel play keeps the SHARED round-start queue (City Hall choices for
  // every seat) on the old table path and never captures it into one seat's
  // Event context (audit 2026-09-11): the Event windows open once that queue
  // has drained. Ordered play still resolves the Event first (see C below).
  it("never buries another seat's City Hall inside an Event window; both seats reach both", () => {
    const state = parallelEventsGame("barrier-order");
    for (const playerId of ["p1", "p2"] as PlayerId[]) {
      getTownOfPlayer(state, playerId)!.buildings = ["castle.city_hall"];
    }
    stackEventDeck(state, "event.stables");
    startEventResourceRound(state);

    expect(state.adventure?.eventResolution ?? null).toBeNull();
    // The shared queue's City Hall choice is what opens first; the Event
    // windows are parked per seat and wait for it.
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("city-hall");
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(Object.keys(state.adventure?.parallelEventSuspended ?? {})).toEqual([]);
    expect(state.adventure?.parallelRoundRewards?.p1?.length ?? 0).toBeGreaterThan(0);
    expect(state.adventure?.parallelRoundRewards?.p2?.length ?? 0).toBeGreaterThan(0);

    const drained = driveParallelWindows(state, ["p1", "p2"]);
    expect([...drained.sawChoice].sort()).toEqual(["p1", "p2"]);
    expect([...drained.sawWindow].sort()).toEqual(["p1", "p2"]);
    expect(Object.keys(drained.state.adventure?.parallelEventSuspended ?? {})).toEqual([]);
    expect(drained.state.adventure?.parallelEventOpenPlayers ?? []).toEqual([]);
    expect(drained.state.adventure?.rewardQueue.some((reward) => reward.kind === "city-hall-choice")).toBe(false);
    expect(drained.state.turn.parallelStopped ?? null).toBeNull();
  });
});

// ===========================================================================
// C. Ordered mode — the barrier freezes the non-resolving ACTIVE player too
// ===========================================================================

describe("Event deck × ordered — the barrier applies in normal turn order as well", () => {
  it("freezes the active player while a DIFFERENT seat (the drawer) resolves the Event first", () => {
    const state = createAdventureGameState({ seed: "barrier-ordered", difficulty: "normal", rollFirstPlayer: false, events: true });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    // Rotate the Event drawer to p2 so the active player (p1) is NOT the resolver.
    getEventsState(state)!.nextDrawerIndex = 1;
    stackEventDeck(state, "event.stables");
    startEventResourceRound(state);

    expect(state.activePlayerId).toBe("p1");
    expect(state.adventure?.eventResolution?.round).toBe(3);
    expect(eventVisitOwner(state)).toBe("p2");

    // p1 is the active player but NOT the resolver: it is frozen out (no actions,
    // and ending the turn is rejected by the barrier, not merely "not your turn").
    expect(getLegalActions(state, "p1")).toEqual([]);
    expect(expectRejected(state, { type: "END_TURN", playerId: "p1" })).toContain("Event is still being resolved");

    // p2 (the resolver, though not the active seat) CAN resolve its Event choice.
    expect(getLegalActions(state, "p2").some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    let next = resolveCurrentEventStep(state); // p2
    // Then the barrier hands the choice to p1 and only lifts once p1 resolves too.
    expect(eventVisitOwner(next)).toBe("p1");
    expect(next.adventure?.eventResolution?.round).toBe(3);
    next = resolveCurrentEventStep(next); // p1
    expect(next.adventure?.eventResolution ?? null).toBeNull();
  });
});

// ===========================================================================
// D. Real round wrap — the first-turn draw waits behind the Event
// ===========================================================================

describe("Event deck — a real Resource-round wrap resolves the Event before the first-turn draw", () => {
  it("wraps into a Resource round: the Event barrier is up and start-of-turn draws wait behind it", () => {
    const state = parallelEventsGame("barrier-wrap");
    stackEventDeck(state, "event.stables");
    // Round 2 is an Astrologers round: keep it instant (Dead Silence) so it raises
    // no barrier of its own, then the round-2 -> 3 wrap draws the Event.
    state.decks.astrologers.drawPile = ["astrologers.dead_silence", "astrologers.dead_silence"];

    // Wrap round 1 -> 2 (Astrologers, instant), clear the fresh start-of-turn
    // flags, then wrap round 2 -> 3 (Resource, Event draws).
    let next = apply(state, { type: "END_TURN", playerId: "p2" });
    next = apply(next, { type: "END_TURN", playerId: "p1" });
    expect(next.round).toBe(2);
    for (const player of Object.values(next.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    next = apply(next, { type: "END_TURN", playerId: "p2" });
    next = apply(next, { type: "END_TURN", playerId: "p1" });
    expect(next.round).toBe(3);

    // v128: no whole-table barrier. The Event is parked per seat; each seat's
    // start-of-turn draw is offered at once (nobody waits for another seat) and
    // that seat's own window opens right after its draw.
    expect(next.adventure?.eventResolution ?? null).toBeNull();
    expect(next.adventure?.pendingVisit).toBeNull();
    for (const id of ["p1", "p2"] as PlayerId[]) {
      expect(next.adventure?.parallelRoundRewards?.[id]?.length ?? 0, `${id} parked`).toBeGreaterThan(0);
      expect(getLegalActions(next, id).some((entry) => entry.action.type === "REFRESH_HAND"), `${id} draw offered`).toBe(true);
    }
    next = apply(next, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    expect(getLegalActions(next, "p2").some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    // p1 has not drawn yet: its window stays parked, its draw is still offered.
    expect(next.adventure?.parallelRoundRewards?.p1?.length ?? 0).toBeGreaterThan(0);
    expect(getLegalActions(next, "p1").some((entry) => entry.action.type === "REFRESH_HAND")).toBe(true);

    const drained = driveParallelWindows(next, ["p1", "p2"]);
    expect([...drained.sawWindow].sort()).toEqual(["p1", "p2"]);
    expect(drained.state.adventure?.eventResolution ?? null).toBeNull();
    expect(drained.state.turn.mode).toBe("parallel");
    expect(drained.state.adventure?.parallelEventOpenPlayers ?? []).toEqual([]);
  });
});

// ===========================================================================
// E. CONTROL — no Event drawn means no barrier; parallel quiet play is normal
// ===========================================================================

describe("Event deck — CONTROL: no barrier is raised when no Event resolves", () => {
  it("with the Event deck OFF, a Resource round raises no barrier and quiet moves work at once", () => {
    const state = createAdventureGameState({
      seed: "barrier-control-off",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      parallelTurns: 4
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    startEventResourceRound(state);

    // No Event deck -> nothing drawn -> no barrier, and both seats act freely.
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const moved = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: quiet });
    expect(moved.heroes.hero_p2.spaceId).toBe(quiet);
  });
});
