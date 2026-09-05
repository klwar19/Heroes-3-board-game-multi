import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getPlayerView } from "./index";
import { eventCardDefinitions, eventsDeckCardIds, EVENTS_NOT_IMPLEMENTED } from "@/data/cards/events";
import { drawEventCard, eliminatePlayer, EVENTS_DECK_ID, getEventsState, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { hasMediaFile } from "@/lib/media-manifest";
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
  // The Event deck is opt-in (default OFF), so the event tests turn it ON
  // explicitly; a caller can still force it off via `options`.
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, events: true, ...options });
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
      expect(hasMediaFile(card.image), `${cardId} scan is not published (npm run media:publish)`).toBe(true);
    }
    // No display-only Events exist; the registry stays the (empty) declared home.
    expect(EVENTS_NOT_IMPLEMENTED).toEqual([]);
  });
});

describe("Event deck flow", () => {
  it("is OPT-IN: OFF by default; events:true adds the shuffled deck; a solo game never gets it", () => {
    // Default (no events option) is OFF — the deck is an optional Fortress rule.
    const off = createAdventureGameState({ seed: "flow-off", rollFirstPlayer: false });
    expect(off.decks[EVENTS_DECK_ID]).toBeUndefined();
    expect(off.adventure?.events).toBeUndefined();

    // Explicitly enabling it gives a 2-player game the full shuffled deck.
    const on = createAdventureGameState({ seed: "flow-on", rollFirstPlayer: false, events: true });
    expect(on.decks[EVENTS_DECK_ID]?.drawPile).toHaveLength(20);
    expect(on.adventure?.events).toBeTruthy();

    // Multiplayer only: a solo table skips the deck even when asked for it.
    const solo = createAdventureGameState({
      seed: "flow-solo",
      rollFirstPlayer: false,
      events: true,
      players: [{ id: "p1", name: "Solo", factionId: "castle", heroDefId: "catherine" }]
    });
    expect(solo.decks[EVENTS_DECK_ID]).toBeUndefined();
  });

  it("logs Resource income BEFORE the Event draw (rulebook p.15: income, then Event)", () => {
    const state = eventsGame("flow-order");
    startResourceRound(state);

    const eventIndex = state.eventLog.findIndex((event) => event.type === "EVENT_CARD_DRAWN");
    expect(eventIndex).toBeGreaterThan(-1);
    const incomeIndexes = state.eventLog
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === "RESOURCES_GAINED" && event.reason === "resource round income")
      .map(({ index }) => index);
    // Every seat's automatic income lands in the log (and thus the feed /
    // animation chronology) before the Event card is drawn — matching both the
    // printed order and the fact that the Event's markets already see the
    // fresh Resources.
    expect(incomeIndexes.length).toBeGreaterThan(0);
    for (const index of incomeIndexes) {
      expect(index).toBeLessThan(eventIndex);
    }
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

  it("keeps the clockwise drawer rotation correct across a player elimination", () => {
    // 3 seats. The rotation must be tracked by IDENTITY: with a bare index into
    // the live-player list, eliminating a seat shifts every later index — the
    // same player draws twice in a row, or a seat is skipped.
    const state = createAdventureGameState({
      seed: "flow-eliminate",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: true,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });
    const drawnBy = () => state.eventLog.filter((event) => event.type === "EVENT_CARD_DRAWN").map((event) => (event as { drawerId: PlayerId }).drawerId);
    const quietDraw = () => {
      state.adventure!.rewardQueue = [];
      state.adventure!.pendingVisit = null;
      state.pendingChoice = null;
      drawEventCard(state);
    };

    quietDraw(); // p1 draws first…
    quietDraw(); // …then p2.
    expect(drawnBy()).toEqual(["p1", "p2"]);

    // p2 (the LAST drawer) is eliminated: the next drawer is p2's clockwise
    // successor, p3 — never p1 again (a live-list index would wrap 2 % 2 → p1).
    // Elimination also purges p2's queued rewards (a dead seat must never hold
    // an open choice — it would freeze the table behind the event barrier).
    state.adventure!.rewardQueue.push({ playerId: "p2", kind: "visit-steps", steps: [] });
    eliminatePlayer(state, "p2", "test", false);
    expect(state.adventure!.rewardQueue.filter((reward) => reward.playerId === "p2")).toEqual([]);
    quietDraw();
    expect(drawnBy()).toEqual(["p1", "p2", "p3"]);

    // And from p3 the rotation wraps to p1 among the live seats.
    quietDraw();
    expect(drawnBy()).toEqual(["p1", "p2", "p3", "p1"]);
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

// ===========================================================================
// Mid-Event elimination (AFK kick / concede while an Event is resolving):
// shared bookkeeping queued on the eliminated seat must be handed to a live
// seat — dropping it would leak the displayed cards out of the game — and the
// seat's stakes in shared Event state (secret bids, an open deal) must vanish.
// ===========================================================================

/** Fresh 3-player events game with a quiet board (mirrors eventsGame). */
function eventsGame3(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: true,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources = { gold: 10, buildingMaterials: 5, valuables: 5 };
    player.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

/** Total card count (draw + discard) across the given shared decks. */
function deckFamilySize(state: GameState, deckIds: string[]): number {
  return deckIds.reduce((sum, deckId) => {
    const deck = state.decks[deckId];
    return sum + (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0);
  }, 0);
}

describe("Event resolution survives a mid-Event elimination", () => {
  it("Spell market: eliminating the drawer still returns the whole display to the decks (no card leak) and lifts the barrier", () => {
    const state = eventsGame3("elim-pool");
    stackEventDeck(state, "event.library_of_enlightenment");
    const spellsTotal = deckFamilySize(state, ["spells", "spells-expert"]);
    startResourceRound(state);
    expect(getEventsState(state)!.pool).toHaveLength(6); // 2 per player
    expect(state.adventure!.pendingVisit?.playerId).toBe("p1");

    // The drawer closes their tab and is kicked while their market menu is open.
    eliminatePlayer(state, "p1", "removed mid-event", false);
    pumpAdventureQueues(state);

    // The live seats finish their turns without buying.
    let after = chooseVisitOption(state, "p2", /Skip/);
    after = chooseVisitOption(after, "p3", /Skip/);

    // The pool cleanup (queued on the dead drawer) still ran: every displayed
    // spell went back into the Spell decks and the round-start barrier lifted.
    expect(getEventsState(after)!.pool).toHaveLength(0);
    expect(deckFamilySize(after, ["spells", "spells-expert"])).toBe(spellsTotal);
    expect(after.adventure!.eventResolution).toBeNull();
  });

  it("Shady Auction: a dead seat's secret bid can never win, the open lot still resolves, and the remaining lots still run", () => {
    const state = eventsGame3("elim-auction");
    stackEventDeck(state, "event.a_shady_auction");
    const artifactDecks = ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"];
    const artifactsTotal = deckFamilySize(state, artifactDecks);
    startResourceRound(state);

    // Lot 1 is on display; the drawer (p1) secretly bids 3 first.
    const lot1 = getEventsState(state)!.auction!.lotCardId;
    let after = chooseVisitOption(state, "p1", /^Bid 3 gold$/);
    expect(getEventsState(after)!.auction!.bids.p1).toBe(3);

    // Now the drawer (and current highest bidder) is eliminated mid-bidding.
    eliminatePlayer(after, "p1", "removed mid-auction", false);
    expect(getEventsState(after)!.auction!.bids.p1).toBeUndefined();
    pumpAdventureQueues(after);

    // The live seats bid on: p2's single gold now wins the lot.
    const goldBefore = after.players.p2.resources.gold;
    after = chooseVisitOption(after, "p2", /^Bid 1 gold$/);
    after = chooseVisitOption(after, "p3", /^No bid$/);
    expect(after.players.p2.hand).toContain(lot1);
    expect(after.players.p1.hand).not.toContain(lot1);
    expect(after.players.p2.resources.gold).toBe(goldBefore - 1);

    // Lots 2 and 3 (their open/resolve steps were queued on the dead drawer)
    // still run for the live seats; nobody bids, so they recycle.
    for (let lot = 0; lot < 2; lot += 1) {
      expect(getEventsState(after)!.auction, `lot ${lot + 2} opened`).toBeTruthy();
      after = chooseVisitOption(after, "p2", /^No bid$/);
      after = chooseVisitOption(after, "p3", /^No bid$/);
    }

    // No card leaked: only the won lot left the Artifact family, the auction
    // is closed and the round-start barrier lifted.
    expect(getEventsState(after)!.auction).toBeNull();
    expect(deckFamilySize(after, artifactDecks)).toBe(artifactsTotal - 1);
    expect(after.adventure!.eventResolution).toBeNull();
  });

  it("Marketplace: eliminating the proposer voids their open 1-for-1 deal — accepting it is a clean no-op", () => {
    const state = eventsGame3("elim-deal");
    stackEventDeck(state, "event.marketplace");
    startResourceRound(state);

    // The drawer proposes a 1-for-1 exchange; p2's answer menu opens.
    let after = chooseVisitOption(state, "p1", /Propose a 1-for-1 resource exchange/);
    after = chooseVisitOption(after, "p1", /Offer 1 gold for 1 valuables/);
    expect(getEventsState(after)!.deal?.proposerId).toBe("p1");

    // The proposer is eliminated before anyone answers: the deal is void.
    eliminatePlayer(after, "p1", "removed mid-deal", false);
    expect(getEventsState(after)!.deal).toBeNull();
    pumpAdventureQueues(after);

    // p2's already-open Accept button does nothing — no swap with a dead seat.
    const p2Before = { ...after.players.p2.resources };
    const p1Before = { ...after.players.p1.resources };
    after = chooseVisitOption(after, "p2", /^Accept — give 1 valuables, receive 1 gold$/);
    expect(after.players.p2.resources).toEqual(p2Before);
    expect(after.players.p1.resources).toEqual(p1Before);

    // The table is not stuck: p2 proceeds to their own Marketplace turn.
    after = chooseVisitOption(after, "p2", /Roll 1 resource die|Roll 1 Resource die/);
    expect(after.adventure!.pendingVisit?.playerId).toBe("p3");
  });
});
