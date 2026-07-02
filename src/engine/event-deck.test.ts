import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getPlayerView } from "./index";
import { eventCardDefinitions, eventsDeckCardIds, EVENTS_NOT_IMPLEMENTED } from "@/data/cards/events";
import { drawEventCard, EVENTS_DECK_ID, getEventsState, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Event deck (Fortress expansion, optional rule) — the DECK FLOW, distinct
 * from the Astrologers Proclaim system:
 *
 *   - multiplayer only, optional (events: false disables it),
 *   - drawn at the start of each Resource Round after income,
 *   - the drawer rotates clockwise per draw,
 *   - effects resolve clockwise starting with the drawer,
 *   - secret information (face-down pool cards, auction bids) is masked in
 *     other players' views.
 *
 * Every assertion fails if the wiring it covers is deleted (CLAUDE.md #1).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Fresh 2-player game with a quiet board: no queued rewards, no mulligans. */
export function eventsGame(seed = "events", options: { events?: boolean } = {}): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, ...options });
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
export function stackEventDeck(state: GameState, cardId: string): void {
  const deck = state.decks[EVENTS_DECK_ID];
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
}

/** Runs the Resource-round start (income + Event draw) and pumps the queues. */
export function startResourceRound(state: GameState, round = 3): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

export function visitOptionLabels(state: GameState, playerId: PlayerId): string[] {
  return getLegalActions(state, playerId)
    .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
    .map((entry) => entry.label);
}

export function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match} — saw: ${visitOptionLabels(state, playerId).join(" | ")}`).toBeTruthy();
  return applyOk(state, legal!.action);
}

describe("Event card data", () => {
  it("ships 20 Fortress Events, every one engine-wired and with its real card scan on disk", () => {
    expect(eventsDeckCardIds).toHaveLength(20);
    for (const cardId of eventsDeckCardIds) {
      const card = eventCardDefinitions[cardId];
      expect(card, cardId).toBeTruthy();
      expect(card.expansion).toBe("Fortress Expansion");
      expect(card.effect.type, cardId).toBeTruthy();
      expect(card.image, cardId).toMatch(/^\/assets\/events-.+\.webp$/);
      expect(existsSync(join(process.cwd(), "public", card.image)), `${cardId} scan missing on disk`).toBe(true);
    }
    // No display-only Events exist; the registry stays the (empty) declared home.
    expect(EVENTS_NOT_IMPLEMENTED).toEqual([]);
  });
});

describe("Event deck flow", () => {
  it("a 2-player game gets the shuffled deck by default; events:false or a solo game gets none", () => {
    const on = createAdventureGameState({ seed: "flow-on", rollFirstPlayer: false });
    expect(on.decks[EVENTS_DECK_ID]?.drawPile).toHaveLength(20);
    expect(on.adventure?.events).toBeTruthy();

    const off = createAdventureGameState({ seed: "flow-off", rollFirstPlayer: false, events: false });
    expect(off.decks[EVENTS_DECK_ID]).toBeUndefined();
    expect(off.adventure?.events).toBeUndefined();

    const solo = createAdventureGameState({
      seed: "flow-solo",
      rollFirstPlayer: false,
      players: [{ id: "p1", name: "Solo", factionId: "castle", heroDefId: "catherine" }]
    });
    expect(solo.decks[EVENTS_DECK_ID]).toBeUndefined();
  });

  it("draws at Resource rounds only, rotating the drawer clockwise; Astrologers rounds draw no Event", () => {
    const state = eventsGame("flow-rotate");
    stackEventDeck(state, "event.stables");

    state.round = 2; // Astrologers round: no Event.
    startAdventureRound(state);
    expect(state.eventLog.filter((event) => event.type === "EVENT_CARD_DRAWN")).toHaveLength(0);

    state.pendingChoice = null;
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;

    state.round = 3; // Resource round: the starting player (p1) draws first.
    startAdventureRound(state);
    let draws = state.eventLog.filter((event) => event.type === "EVENT_CARD_DRAWN");
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ cardId: "event.stables", drawerId: "p1", round: 3 });
    expect(state.adventure?.events?.activeCardId).toBe("event.stables");

    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    stackEventDeck(state, "event.stables");

    state.round = 5; // Next Resource round: the drawer rotates to p2.
    startAdventureRound(state);
    draws = state.eventLog.filter((event) => event.type === "EVENT_CARD_DRAWN");
    expect(draws).toHaveLength(2);
    expect(draws[1]).toMatchObject({ drawerId: "p2", round: 5 });
    // The previous Event went face-down onto the discard pile.
    expect(state.decks[EVENTS_DECK_ID].discardPile).toContain("event.stables");
  });

  it("resolves effects in clockwise order starting with the drawer", () => {
    const state = eventsGame("flow-order");
    stackEventDeck(state, "event.stables");
    // Rotate the drawer to p2 first (as if one Event had already been drawn).
    getEventsState(state)!.nextDrawerIndex = 1;

    startResourceRound(state);
    // p2 (the drawer) resolves first…
    expect(state.adventure?.pendingVisit?.playerId).toBe("p2");
    const afterP2 = chooseVisitOption(state, "p2", /Main hero gains \+1 movement/);
    // …then p1.
    expect(afterP2.adventure?.pendingVisit?.playerId).toBe("p1");
  });

  it("CONTROL: with the deck disabled a Resource round draws nothing", () => {
    const state = createAdventureGameState({ seed: "flow-none", rollFirstPlayer: false, events: false });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.round = 3;
    startAdventureRound(state);
    expect(state.eventLog.filter((event) => event.type === "EVENT_CARD_DRAWN")).toHaveLength(0);
  });

  it("reshuffles the discard pile once the draw pile runs dry", () => {
    const state = eventsGame("flow-reshuffle");
    const deck = state.decks[EVENTS_DECK_ID];
    deck.discardPile = deck.drawPile;
    deck.drawPile = [];

    drawEventCard(state);
    expect(state.adventure?.events?.activeCardId).toBeTruthy();
    expect(deck.drawPile.length).toBe(19);
    expect(deck.discardPile).toEqual([]);
  });
});

describe("Event secrecy in player views", () => {
  it("masks a face-down pool card for everyone and an auction bid for everyone but its bidder", () => {
    const state = eventsGame("view-mask");
    const events = getEventsState(state)!;
    events.pool.push({ cardId: "spell.magic_arrow", deckId: "spells", faceUp: false });
    events.pool.push({ cardId: "spell.magic_arrow", deckId: "spells", faceUp: true });
    events.auction = { lotCardId: "artifact.rib_cage", lotDeckId: "artifacts-minor", bids: { p1: 3, p2: 5 } };

    const p1View = getPlayerView(state, "p1");
    const pool = p1View.adventure!.events!.pool;
    expect(pool[0].cardId).toBe("hidden");
    expect(pool[1].cardId).toBe("spell.magic_arrow");
    expect(p1View.adventure!.events!.auction!.bids).toEqual({ p1: 3 });

    const p2View = getPlayerView(state, "p2");
    expect(p2View.adventure!.events!.auction!.bids).toEqual({ p2: 5 });
  });
});
