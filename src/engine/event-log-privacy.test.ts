/**
 * Event-log card-id privacy (the single-player history feature). Draw/discard
 * events now carry exact card ids so a solo player gets a real personal
 * history — and those ids are HIDDEN INFORMATION everywhere else. Pins, with
 * CONTROLs that fail if the redaction (player-view.ts) or the display filter
 * (formatLoggedCards in components/table/utils.ts) is removed:
 * - single-player: the OWNER keeps their own exact ids (the feature), while an
 *   AI seat's ids are replaced by same-length "hidden" placeholders;
 * - multiplayer: EVERY viewer — the owner included — gets placeholders;
 * - the feed/log formatter drops placeholders entirely, so multiplayer lines
 *   read exactly as they did before ids were logged (never "hidden card").
 */
import { describe, expect, it } from "vitest";
import { appendEvent, createAdventureGameState, getPlayerView } from "@/engine";
import type { GameEvent, GameState } from "@/engine";
import { formatEvent } from "@/components/table/utils";

function seedEvents(state: GameState): void {
  appendEvent(state, {
    type: "CARDS_DRAWN",
    playerId: "p1",
    count: 2,
    requested: 2,
    reshuffledDiscard: false,
    cardIds: ["ability.tactics", "spell.magic_arrow"]
  });
  appendEvent(state, {
    type: "CARDS_DRAWN",
    playerId: "p2",
    count: 2,
    requested: 2,
    reshuffledDiscard: false,
    cardIds: ["ability.offense", "spell.haste"]
  });
  appendEvent(state, {
    type: "HAND_REFRESHED",
    playerId: "p2",
    discarded: 1,
    drawn: 1,
    discardedCardIds: ["ability.wisdom"]
  });
  appendEvent(state, {
    type: "DECK_SEARCH_RESOLVED",
    playerId: "p2",
    deckId: "spells",
    choiceId: "c1",
    pick: "revealed",
    discardedCardIds: ["spell.slow", "spell.bless"]
  });
  appendEvent(state, {
    type: "HAND_MULLIGAN",
    playerId: "p2",
    remaining: 0,
    discardedCardIds: ["ability.armorer"]
  });
}

function eventOf<T extends GameEvent["type"]>(state: GameState, type: T, playerId: string) {
  // LAST match: game setup itself logs draws (opening hands), so the events
  // seeded by this test are the most recent of their kind.
  return [...state.eventLog]
    .reverse()
    .find((event) => event.type === type && "playerId" in event && event.playerId === playerId) as Extract<
    GameEvent,
    { type: T }
  >;
}

function singlePlayerState(seed: string): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    rollFirstPlayer: false,
    sessionMode: "single-player",
    computerOpponents: 1
  });
}

function multiplayerState(seed: string): GameState {
  return createAdventureGameState({ seed, scenarioId: "skirmish", playerCount: 2, rollFirstPlayer: false });
}

describe("event-log card ids — player-view redaction", () => {
  it("single-player: the owner keeps their OWN exact ids (CONTROL) while the AI seat's are hidden", () => {
    const state = singlePlayerState("log-privacy-sp");
    seedEvents(state);
    const view = getPlayerView(state, "p1");

    // The feature itself: the owner's personal history keeps real ids.
    const ownDraw = eventOf(view as unknown as GameState, "CARDS_DRAWN", "p1");
    expect(ownDraw.cardIds).toEqual(["ability.tactics", "spell.magic_arrow"]);

    // The AI seat's details are placeholders of the SAME length (counts stay).
    const aiDraw = eventOf(view as unknown as GameState, "CARDS_DRAWN", "p2");
    expect(aiDraw.cardIds).toEqual(["hidden", "hidden"]);
    const aiRefresh = eventOf(view as unknown as GameState, "HAND_REFRESHED", "p2");
    expect(aiRefresh.discardedCardIds).toEqual(["hidden"]);
    const aiSearch = eventOf(view as unknown as GameState, "DECK_SEARCH_RESOLVED", "p2");
    expect(aiSearch.discardedCardIds).toEqual(["hidden", "hidden"]);
    const aiMulligan = eventOf(view as unknown as GameState, "HAND_MULLIGAN", "p2");
    expect(aiMulligan.discardedCardIds).toEqual(["hidden"]);
  });

  it("multiplayer: EVERY viewer gets placeholders — the drawing player's own view included", () => {
    const state = multiplayerState("log-privacy-mp");
    seedEvents(state);

    for (const viewer of ["p1", "p2"] as const) {
      const view = getPlayerView(state, viewer) as unknown as GameState;
      expect(eventOf(view, "CARDS_DRAWN", "p1").cardIds).toEqual(["hidden", "hidden"]);
      expect(eventOf(view, "CARDS_DRAWN", "p2").cardIds).toEqual(["hidden", "hidden"]);
      expect(eventOf(view, "HAND_REFRESHED", "p2").discardedCardIds).toEqual(["hidden"]);
      expect(eventOf(view, "DECK_SEARCH_RESOLVED", "p2").discardedCardIds).toEqual(["hidden", "hidden"]);
      expect(eventOf(view, "HAND_MULLIGAN", "p2").discardedCardIds).toEqual(["hidden"]);
    }
    // CONTROL: the raw engine state still carries the real ids (the redaction
    // lives in the view, not in the engine events).
    expect(eventOf(state, "CARDS_DRAWN", "p1").cardIds).toEqual(["ability.tactics", "spell.magic_arrow"]);
  });
});

describe("event-log card ids — feed/log formatting", () => {
  it("drops hidden placeholders entirely: the multiplayer line reads exactly as before ids were logged", () => {
    const state = multiplayerState("log-format-mp");
    seedEvents(state);
    const view = getPlayerView(state, "p1") as unknown as GameState;
    const p1Name = state.players.p1.name;
    const p2Name = state.players.p2.name;

    expect(formatEvent(eventOf(view, "CARDS_DRAWN", "p1"), view)).toBe(`${p1Name} draws 2 cards.`);
    expect(formatEvent(eventOf(view, "HAND_REFRESHED", "p2"), view)).toBe(
      `${p2Name} refreshes their hand (discarded 1, drew 1).`
    );
    expect(formatEvent(eventOf(view, "DECK_SEARCH_RESOLVED", "p2"), view)).toBe(
      `${p2Name} keeps a spells card; 2 discarded.`
    );
  });

  it("CONTROL: real ids (the solo owner's history) DO name the cards", () => {
    const state = singlePlayerState("log-format-sp");
    seedEvents(state);
    const view = getPlayerView(state, "p1") as unknown as GameState;
    const line = formatEvent(eventOf(view, "CARDS_DRAWN", "p1"), view);
    expect(line).toContain(": ");
    expect(line).not.toContain("hidden");
  });

  it("renders the ASTROLOGERS_DISCARDED history line", () => {
    const state = singlePlayerState("log-format-astro");
    appendEvent(state, {
      type: "ASTROLOGERS_DISCARDED",
      cardId: "astrologers.week_of_training",
      name: "Week of Training",
      round: 3
    });
    const event = state.eventLog[state.eventLog.length - 1];
    expect(formatEvent(event, state)).toBe("Astrologers discard: Week of Training (round 3).");
  });
});
