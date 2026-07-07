import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { eliminatePlayer } from "./adventure";
import { openSharedDeckSearch, pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Round-start Astrologers barrier — RECOVERY paths (the "event freezes and
 * can't resolve" reports). The barrier freezes every seat behind the current
 * resolver, so anything that leaves the resolver slot unanswerable strands the
 * whole table:
 *
 *  1. A seat ELIMINATED mid-resolution (their proclamation prompt open, or
 *     still queued) must not keep owning the slot — resolution hands on to the
 *     next seat in order and the barrier still lifts after the last live seat.
 *  2. `eliminatePlayer` must drop an OPEN pendingChoice the eliminated seat
 *     owns (and return any cards the choice lifted out of a shared deck) — an
 *     orphaned choice is unanswerable by construction: only its owner is ever
 *     offered CHOOSE_OPTION, and under the barrier everyone else is frozen.
 *  3. A round-start City Hall choice whose every option got context-filtered
 *     away must be SKIPPED, not opened as an empty prompt with zero legal
 *     answers (which not even the AFK-drop driver could resolve).
 *
 * Each test fails if its guard is removed (CLAUDE.md #1).
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Resolves the mandatory start-of-turn draw (keep everything) if pending. */
function takeStartOfTurnDraw(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player.needsHandRefresh || player.canMulligan) {
    return apply(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] });
  }
  return state;
}

function endTurn(state: GameState, playerId: PlayerId): GameState {
  return apply(takeStartOfTurnDraw(state, playerId), { type: "END_TURN", playerId });
}

/** Picks the pending visit-step option whose label matches `match`. */
function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  return apply(state, legal!.action);
}

/**
 * Ordered 3-player game whose round-2 Astrologers draw is Dancing Imp; every
 * seat holds one plain Statistic so all three get an empower prompt queued.
 */
function threeSeatImpGame(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.decks.astrologers.drawPile = ["astrologers.dancing_imp"];
  return state;
}

describe("Astrologers barrier — a seat eliminated mid-resolution never strands the table", () => {
  it("hands the open slot to the next seat in order and still lifts the barrier after the last live seat", () => {
    let state = threeSeatImpGame("astro-barrier-elim");

    // Round 1 plays out normally; the wrap into round 2 draws the proclamation.
    expect(state.round).toBe(1);
    state = endTurn(state, "p1");
    state = endTurn(state, "p2");
    // Every seat holds exactly one empowerable Statistic when the round wraps.
    for (const playerId of ["p1", "p2", "p3"] as const) {
      state.players[playerId].hand = ["stat.attack"];
      state.players[playerId].discard = [];
    }
    state = endTurn(state, "p3");
    expect(state.round).toBe(2);

    // The barrier is up and resolution starts from the FIRST seat in order.
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dancing_imp");
    expect(state.adventure?.eventResolution?.round).toBe(2);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    // Every other seat is fully frozen while seat 1 resolves.
    expect(getLegalActions(state, "p2")).toEqual([]);
    expect(getLegalActions(state, "p3")).toEqual([]);

    // Seat 1 resolves; the slot moves to seat 2 in seat order.
    state = chooseVisitOption(state, "p1", /Empower Attack \(hand\)/);
    expect(state.players.p1.hand).toContain("stat.attack.empowered");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(state.adventure?.eventResolution?.round).toBe(2);

    // Seat 2 — the CURRENT resolver — is eliminated (kick/concede path).
    eliminatePlayer(state, "p2", "removed mid-resolution", false);
    pumpAdventureQueues(state);

    // Their open prompt is gone, the slot moved on to seat 3, barrier still up.
    expect(state.players.p2.eliminated).toBe(true);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p3");
    expect(state.adventure?.eventResolution?.round).toBe(2);

    // The last live seat resolves — the barrier lifts and play continues.
    state = chooseVisitOption(state, "p3", /Empower Attack \(hand\)/);
    expect(state.players.p3.hand).toContain("stat.attack.empowered");
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.adventure?.pendingVisit).toBeNull();
    // The eliminated seat never got (and never blocks on) its empower.
    expect(state.players.p2.hand).not.toContain("stat.attack.empowered");
    // Normal turn flow resumed for the first player (their mandatory draw).
    expect(state.activePlayerId).toBe("p1");
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });

  it("drops a QUEUED (not yet open) prompt of an eliminated seat the moment the queue reaches it", () => {
    let state = threeSeatImpGame("astro-barrier-elim-queued");
    state = endTurn(state, "p1");
    state = endTurn(state, "p2");
    for (const playerId of ["p1", "p2", "p3"] as const) {
      state.players[playerId].hand = ["stat.attack"];
      state.players[playerId].discard = [];
    }
    state = endTurn(state, "p3");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    // Seat 2's prompt is still QUEUED when they are eliminated.
    eliminatePlayer(state, "p2", "left the game", false);
    pumpAdventureQueues(state);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    // Seat 1 resolves → the queue skips the dead seat straight to seat 3.
    state = chooseVisitOption(state, "p1", /Empower Attack \(hand\)/);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p3");
    state = chooseVisitOption(state, "p3", /Done/);
    expect(state.adventure?.eventResolution ?? null).toBeNull();
  });
});

describe("eliminatePlayer — an OPEN pendingChoice owned by the eliminated seat is dropped safely", () => {
  // Three seats, so eliminating one never ends the game ("last faction
  // standing") — the assertions below are about the surviving table's state.
  function quietGame(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    return state;
  }

  it("clears the choice, restores the phase and returns DECK_SEARCH reveals to the deck (no card loss)", () => {
    const state = quietGame("elim-open-choice");
    const deck = state.decks.abilities;
    const totalBefore = deck.drawPile.length + deck.discardPile.length;

    openSharedDeckSearch(state, "p2", "abilities", 2);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(state.pendingChoice?.playerId).toBe("p2");
    expect(state.phase).toBe("choice");
    // The two revealed cards are currently lifted OUT of the deck.
    expect(deck.drawPile.length + deck.discardPile.length).toBe(totalBefore - 2);

    eliminatePlayer(state, "p2", "gave up mid-search", true);

    // The orphaned choice is gone, play state is restored…
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("player-turn");
    expect(state.priorityPlayerId).toBeNull();
    // …and the lifted cards are back in the shared deck (conservation).
    expect(deck.drawPile.length + deck.discardPile.length).toBe(totalBefore);
  });

  it("drops a plain OPTION_CHOICE owned by the eliminated seat too", () => {
    const state = quietGame("elim-open-option");
    state.pendingChoice = {
      id: "choice_test",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Test choice",
      options: [{ label: "A" }, { label: "B" }],
      context: "city-hall",
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p2";

    eliminatePlayer(state, "p2", "removed", false);

    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("player-turn");
    expect(state.priorityPlayerId).toBeNull();
  });

  it("CONTROL: another seat's open choice is untouched by the elimination", () => {
    const state = quietGame("elim-other-choice");
    openSharedDeckSearch(state, "p1", "abilities", 2);
    expect(state.pendingChoice?.playerId).toBe("p1");

    eliminatePlayer(state, "p2", "removed", false);

    expect(state.pendingChoice?.playerId).toBe("p1");
    expect(state.phase).toBe("choice");
  });
});

describe("round-start City Hall choice — an all-filtered option list is skipped, never opened empty", () => {
  const TEST_BUILDING = "test.conditional_city_hall";

  // Function boundary keeps TS from narrowing `state.pendingChoice` to null in
  // the test body (pumpAdventureQueues mutates it behind TS's back).
  function clearOpenInteractions(state: GameState): void {
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;
  }

  function withConditionalBuilding<T>(run: () => T): T {
    coreBuildingDefinitions[TEST_BUILDING] = {
      id: TEST_BUILDING,
      name: "Conditional Hall",
      faction: "cove",
      cost: { gold: 1 },
      // The ONLY option requires holding an Artifact card — a player with none
      // filters the list down to zero options.
      effect: {
        type: "ASTROLOGERS_ROUND_CHOICE",
        options: [
          {
            label: "Remove 1 Artifact card from your hand to gain 1 experience",
            experience: 1,
            removeArtifactFromHand: true
          }
        ]
      },
      implementationStatus: "implemented",
      source: coreBuildingDefinitions["cove.city_hall"].source
    } as (typeof coreBuildingDefinitions)[string];
    try {
      return run();
    } finally {
      delete coreBuildingDefinitions[TEST_BUILDING];
    }
  }

  it("skips the zero-option choice and still lifts the round-start barrier behind it", () => {
    withConditionalBuilding(() => {
      const state = createAdventureGameState({ seed: "empty-city-hall", difficulty: "normal", rollFirstPlayer: false });
      clearOpenInteractions(state);
      state.players.p1.hand = []; // no Artifact → every option filters away

      state.adventure!.eventResolution = { round: state.round };
      state.adventure!.rewardQueue.push({ playerId: "p1", kind: "city-hall-choice", buildingId: TEST_BUILDING });
      state.adventure!.rewardQueue.push({ playerId: "p1", kind: "round-start-events-resolved" });

      pumpAdventureQueues(state);

      // Without the guard this opens an OPTION_CHOICE with zero options — a
      // prompt nobody (not even the AFK driver) can answer, freezing the table
      // behind the barrier. With it, the reward is skipped and the barrier lifts.
      expect(state.pendingChoice).toBeNull();
      expect(state.adventure?.eventResolution ?? null).toBeNull();
      expect(state.adventure?.rewardQueue).toEqual([]);
    });
  });

  it("CONTROL: holding an Artifact keeps the option and the choice opens normally", () => {
    withConditionalBuilding(() => {
      const state = createAdventureGameState({ seed: "empty-city-hall-ctl", difficulty: "normal", rollFirstPlayer: false });
      clearOpenInteractions(state);
      state.players.p1.hand = ["artifact.tome_of_air"];

      state.adventure!.rewardQueue.push({ playerId: "p1", kind: "city-hall-choice", buildingId: TEST_BUILDING });

      pumpAdventureQueues(state);

      expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
      expect(state.pendingChoice?.playerId).toBe("p1");
      expect(
        state.pendingChoice?.type === "OPTION_CHOICE" &&
          state.pendingChoice.options.some((option) => /Remove 1 Artifact/.test(option.label))
      ).toBe(true);
    });
  });
});
