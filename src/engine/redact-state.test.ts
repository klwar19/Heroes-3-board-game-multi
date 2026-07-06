import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  getPlayerView,
  OBSERVER_VIEWER_SEAT,
  redactStateForSeat,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Per-connection redaction (Phase 2). `redactStateForSeat` produces a
// GameState-shaped frame with another seat's hidden info stripped, so a
// transport can send each connection only what its seat may see — yet the
// existing client (which re-runs getPlayerView) renders identically.
//
// Two guarantees, each with a mutation CONTROL:
//   1. PRIVACY  — a foreign seat's real card ids never reach the frame.
//   2. FIDELITY — getPlayerView(redacted, seat) === getPlayerView(state, seat),
//                 so the redaction changes nothing the seated player sees.
// ---------------------------------------------------------------------------

function twoPlayerGame(): GameState {
  return createAdventureGameState({
    seed: "redact-fixture",
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

describe("redactStateForSeat — privacy", () => {
  it("strips a foreign seat's hand / deck ids but keeps the viewer's own (control)", () => {
    const state = twoPlayerGame();
    const p2Hand = state.players.p2.hand;
    const p1Hand = state.players.p1.hand;
    expect(p2Hand.length).toBeGreaterThan(0);

    const redacted = redactStateForSeat(state, "p1");
    const frame = JSON.stringify(redacted);

    // PRIVACY: none of p2's real hand ids survive in p1's frame…
    for (const cardId of p2Hand) {
      expect(redacted.players.p2.hand).not.toContain(cardId);
    }
    expect(redacted.players.p2.hand.every((c) => c === "hidden")).toBe(true);
    // …and the count is preserved (placeholder length == real hand size).
    expect(redacted.players.p2.hand).toHaveLength(p2Hand.length);

    // CONTROL: p1's OWN hand ids ARE present (the viewer must see their hand).
    expect(redacted.players.p1.hand).toEqual(p1Hand);
    for (const cardId of p1Hand) {
      expect(frame).toContain(cardId);
    }

    // Deck ORDER is hidden from everyone, including the owner — both decks are
    // placeholders of the right length, never real ids.
    expect(redacted.players.p1.deck.every((c) => c === "hidden")).toBe(true);
    expect(redacted.players.p1.deck).toHaveLength(state.players.p1.deck.length);
    expect(redacted.players.p2.deck.every((c) => c === "hidden")).toBe(true);
  });

  it("hides EVERY seat's hand from an observer frame", () => {
    const state = twoPlayerGame();
    const redacted = redactStateForSeat(state, OBSERVER_VIEWER_SEAT);
    expect(redacted.players.p1.hand.every((c) => c === "hidden")).toBe(true);
    expect(redacted.players.p2.hand.every((c) => c === "hidden")).toBe(true);
    // Counts still survive so the UI can show "N cards".
    expect(redacted.players.p1.hand).toHaveLength(state.players.p1.hand.length);
  });

  it("hides another seat's pending visit options while preserving the owner's prompt", () => {
    const state = twoPlayerGame();
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    state.players.p1.removed = [];
    state.players.p2.hand = ["stat.defense"];
    state.players.p2.deck = [];
    state.players.p2.discard = [];
    state.players.p2.removed = [];
    state.adventure!.pendingVisit = {
      heroId: "hero_p2",
      playerId: "p2",
      fieldId: state.heroes.hero_p2.spaceId!,
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Dancing Imp: empower one Statistic card",
          options: [
            {
              label: "Empower Defense (hand)",
              steps: [{ type: "EMPOWER_STATISTIC", cardId: "stat.defense", source: "hand" }]
            }
          ]
        }
      ]
    };

    const p1Frame = redactStateForSeat(state, "p1");
    const p2Frame = redactStateForSeat(state, "p2");

    expect(p1Frame.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(p1Frame.adventure?.pendingVisit?.steps).toEqual([]);
    expect(JSON.stringify(p1Frame)).not.toContain("Empower Defense");
    expect(JSON.stringify(p1Frame)).not.toContain("stat.defense");

    expect(p2Frame.adventure?.pendingVisit?.steps).toEqual(state.adventure!.pendingVisit.steps);
    expect(JSON.stringify(p2Frame)).toContain("Empower Defense");
    expect(JSON.stringify(p2Frame)).toContain("stat.defense");
  });
});

describe("redactStateForSeat — fidelity (the seated player sees no change)", () => {
  it("getPlayerView(redacted, seat) deep-equals getPlayerView(state, seat)", () => {
    const state = twoPlayerGame();
    for (const seat of ["p1", "p2"] as const) {
      const fromRedacted = getPlayerView(redactStateForSeat(state, seat), seat);
      const fromFull = getPlayerView(state, seat);
      // The client re-runs getPlayerView on whatever it receives; redaction must
      // be invisible to it — same hands, same counts, same everything.
      expect(fromRedacted).toEqual(fromFull);
    }
  });

  it("an observer's derived view is identical whether from the full or redacted state", () => {
    const state = twoPlayerGame();
    const fromRedacted = getPlayerView(redactStateForSeat(state, OBSERVER_VIEWER_SEAT), OBSERVER_VIEWER_SEAT);
    const fromFull = getPlayerView(state, OBSERVER_VIEWER_SEAT);
    expect(fromRedacted).toEqual(fromFull);
  });
});
