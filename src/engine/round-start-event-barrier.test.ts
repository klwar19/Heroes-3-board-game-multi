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

describe("Event deck × parallel — the whole table freezes until every player resolves it", () => {
  it("opens the drawer's Event choice; every other player is frozen (no quiet move, no draw, no End Turn)", () => {
    const state = parallelEventsGame("barrier-par-freeze");
    stackEventDeck(state, "event.stables");
    startEventResourceRound(state);

    // The Event resolves FIRST: its barrier is up and the drawer's choice is open.
    expect(state.adventure?.eventResolution?.round).toBe(3);
    const drawer = eventVisitOwner(state);
    expect(drawer).toBeTruthy();
    const bystander: PlayerId = drawer === "p1" ? "p2" : "p1";

    // The bystander is FULLY frozen — no legal action at all, and every attempt
    // (quiet move, ending the turn) is rejected with the barrier message.
    expect(getLegalActions(state, bystander)).toEqual([]);
    const quiet = emptyFieldNextTo(state, `hero_${bystander}`);
    expect(
      expectRejected(state, { type: "MOVE_HERO", playerId: bystander, heroId: `hero_${bystander}`, to: quiet })
    ).toContain("Event is still being resolved");
    expect(expectRejected(state, { type: "END_TURN", playerId: bystander })).toContain("Event is still being resolved");
    // The blocked move never happened.
    expect(state.heroes[`hero_${bystander}`].spaceId).not.toBe(quiet);

    // The drawer resolves; the barrier hands the choice to the next seat and is
    // STILL up — so now the former drawer is the one frozen out.
    let next = resolveCurrentEventStep(state);
    expect(next.adventure?.eventResolution?.round).toBe(3);
    expect(eventVisitOwner(next)).toBe(bystander);
    const drawerQuiet = emptyFieldNextTo(next, `hero_${drawer}`);
    expect(
      expectRejected(next, { type: "MOVE_HERO", playerId: drawer!, heroId: `hero_${drawer}`, to: drawerQuiet })
    ).toContain("Event is still being resolved");

    // The last seat resolves: the barrier LIFTS, and the quiet move it rejected a
    // moment ago now succeeds (CONTROL — the freeze was temporary and Event-scoped).
    next = resolveCurrentEventStep(next);
    expect(next.adventure?.eventResolution ?? null).toBeNull();
    expect(next.turn.mode).toBe("parallel");
    const nowQuiet = emptyFieldNextTo(next, `hero_${bystander}`);
    next = apply(next, { type: "MOVE_HERO", playerId: bystander, heroId: `hero_${bystander}`, to: nowQuiet });
    expect(next.heroes[`hero_${bystander}`].spaceId).toBe(nowQuiet);
  });
});

// ===========================================================================
// B. Ordering — the Event resolves BEFORE City Hall round-start choices
// ===========================================================================

describe("Event deck — resolves BEFORE City Hall choices, not after", () => {
  it("keeps the City Hall choice queued behind the whole Event; it only opens once the Event is done", () => {
    const state = parallelEventsGame("barrier-order");
    // Give both seats a City Hall (a RESOURCE_ROUND_CHOICE round-start reward).
    for (const playerId of ["p1", "p2"] as PlayerId[]) {
      getTownOfPlayer(state, playerId)!.buildings = ["castle.city_hall"];
    }
    stackEventDeck(state, "event.stables");
    startEventResourceRound(state);

    // The FIRST thing open is the Event (a pendingVisit), NOT a City Hall choice
    // (a pendingChoice) — and the City Hall reward is still parked in the queue.
    expect(state.adventure?.eventResolution?.round).toBe(3);
    expect(state.adventure?.pendingVisit).toBeTruthy();
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.rewardQueue.some((reward) => reward.kind === "city-hall-choice")).toBe(true);

    // Resolve the Event for every seat.
    let next = resolveCurrentEventStep(state); // drawer
    next = resolveCurrentEventStep(next); // other seat

    // NOW — and only now — the barrier is down and the City Hall choice opens.
    expect(next.adventure?.eventResolution ?? null).toBeNull();
    const choice = next.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("city-hall");
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

    // The Event resolves first as a whole-table barrier — the start-of-turn draw
    // that the wrap queued for every seat is still parked behind it.
    expect(next.adventure?.eventResolution?.round).toBe(3);
    const owner = eventVisitOwner(next);
    expect(owner).toBeTruthy();
    const other: PlayerId = owner === "p1" ? "p2" : "p1";
    // The non-resolving seat cannot take its first-turn draw yet (it is frozen).
    expect(expectRejected(next, { type: "REFRESH_HAND", playerId: other, discardCardIds: [] })).toContain(
      "Event is still being resolved"
    );

    // Resolve the Event for the whole table; the barrier lifts and normal play
    // (including the deferred start-of-turn draw) becomes available again.
    next = resolveCurrentEventStep(next);
    next = resolveCurrentEventStep(next);
    expect(next.adventure?.eventResolution ?? null).toBeNull();
    expect(next.turn.mode).toBe("parallel");
    // The start-of-turn draw the barrier blocked is now takeable.
    expect(getLegalActions(next, other).some((entry) => entry.action.type === "REFRESH_HAND")).toBe(true);
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
