import { describe, expect, it } from "vitest";
import { reconnectRoundStartCues } from "./utils";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  pumpAdventureQueues,
  redactStateForSeat
} from "@/engine";
import { startAdventureRound } from "@/engine/adventure";
import type { GameAction, GameState } from "@/engine";

/**
 * "One player sees the event, the other doesn't": a client that (re)connects
 * while the table is mid-resolution of the round's Astrologers proclamation /
 * Event primes every seen-set with the already-logged draw event, so the
 * overlay never popped for them — they sat frozen behind the barrier with no
 * context. `reconnectRoundStartCues` rebuilds the overlay cue from live state
 * for EXACTLY that window (barrier up), and stays silent once resolution is
 * done so ordinary reloads never replay history.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Two-seat game frozen mid-resolution of the round-2 Dancing Imp draw. */
function midAstrologersBarrier(): GameState {
  const state = createAdventureGameState({
    seed: "reconnect-cue-astro",
    difficulty: "normal",
    rollFirstPlayer: false
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.players.p1.hand = ["stat.attack"];
  state.players.p1.discard = [];
  state.players.p2.hand = ["stat.defense"];
  state.players.p2.discard = [];
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;

  const deck = state.decks.astrologers;
  deck.drawPile = deck.drawPile.filter((id) => id !== "astrologers.dancing_imp");
  deck.drawPile.push("astrologers.dancing_imp");
  state.round = 2;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  expect(state.adventure?.eventResolution?.round).toBe(2);
  return state;
}

/** Resolves every open Dancing Imp prompt until the barrier lifts. */
function resolveWholeTable(initial: GameState): GameState {
  let state = initial;
  for (let guard = 0; guard < 6 && state.adventure?.eventResolution; guard += 1) {
    const owner = state.adventure?.pendingVisit?.playerId;
    expect(owner, "a resolver should be open while the barrier is up").toBeTruthy();
    const done = getLegalActions(state, owner!).find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Done|Empower/.test(legal.label)
    );
    expect(done).toBeTruthy();
    state = apply(state, done!.action);
  }
  return state;
}

describe("reconnectRoundStartCues — Astrologers side (even rounds)", () => {
  it("rebuilds the proclamation cue while the barrier is up, for any seat's frame", () => {
    const state = midAstrologersBarrier();

    // The resolver's own seat, the waiting seat, and a hosted redacted frame
    // all get the cue — nobody depends on having watched the draw live.
    for (const viewer of ["p1", "p2"] as const) {
      const cues = reconnectRoundStartCues(state, viewer);
      expect(cues.event).toBeNull();
      expect(cues.astrologers).toMatchObject({
        cardId: "astrologers.dancing_imp",
        name: "Dancing Imp",
        round: 2
      });
      expect(cues.astrologers?.text).toContain("Statistic");
    }

    const redacted = redactStateForSeat(state, "p2");
    expect(reconnectRoundStartCues(redacted, "p2")?.astrologers?.name).toBe("Dancing Imp");
  });

  it("CONTROL: goes silent the moment the whole table has resolved (no replay on ordinary reloads)", () => {
    const state = resolveWholeTable(midAstrologersBarrier());
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    // The card is still face up (ongoing proclamations stay until the next
    // Astrologers round) — but resolution is over, so a reconnect shows nothing.
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dancing_imp");
    expect(reconnectRoundStartCues(state, "p1")).toEqual({ astrologers: null, event: null });
  });
});

describe("reconnectRoundStartCues — Event side (odd Resource rounds)", () => {
  function midEventBarrier(): GameState {
    const state = createAdventureGameState({
      seed: "reconnect-cue-event",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: true
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.rewardQueue = [];
    state.adventure!.pendingVisit = null;
    state.pendingChoice = null;

    const deck = state.decks.events!;
    deck.drawPile = deck.drawPile.filter((id) => id !== "event.stables");
    deck.drawPile.push("event.stables");
    state.adventure!.events!.nextDrawerIndex = 1; // p2 draws this round
    state.round = 3;
    startAdventureRound(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.eventResolution?.round).toBe(3);
    return state;
  }

  it("rebuilds the Event cue naming the drawer, flagged for the drawer's own seat", () => {
    const state = midEventBarrier();

    const drawerView = reconnectRoundStartCues(state, "p2");
    expect(drawerView.astrologers).toBeNull();
    expect(drawerView.event).toMatchObject({
      cardId: "event.stables",
      round: 3,
      viewerIsDrawer: true
    });

    const waiterView = reconnectRoundStartCues(state, "p1");
    expect(waiterView.event).toMatchObject({ cardId: "event.stables", viewerIsDrawer: false });
    expect(waiterView.event?.drawerName).toBe(state.players.p2.name);
  });
});
