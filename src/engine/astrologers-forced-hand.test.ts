import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { drawAstrologersCard } from "./adventure";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * The forced-hand Astrologers proclamations — Big Cleanup (discard the whole
 * hand, redraw the same number) and Annoying Lizard (shuffle Spells+Artifacts
 * back, redraw the same number) — are MANDATORY and apply to every player the
 * instant the card is revealed.
 *
 * The bug this guards against: the reshuffle happened silently (no event), so a
 * player could not tell it had been forced on them — it looked like the optional
 * start-of-turn "draw new", reading as skippable. Each forced reshuffle now logs
 * an ASTROLOGERS_HAND_RESHUFFLED event (the player-facing notice). Deleting the
 * wiring — the resolveAstrologersCard case OR the appendEvent — fails a test.
 */

function makeGame(seed: string): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
}

function reshuffleEvents(state: GameState, playerId: PlayerId): Extract<GameEvent, { type: "ASTROLOGERS_HAND_RESHUFFLED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ASTROLOGERS_HAND_RESHUFFLED" }> =>
      event.type === "ASTROLOGERS_HAND_RESHUFFLED" && event.playerId === playerId
  );
}

describe("Astrologers — Big Cleanup (DISCARD_REDRAW_ALL)", () => {
  it("forcibly replaces every player's hand and logs the mandatory reshuffle", () => {
    const state = makeGame("big-cleanup");
    // Distinct hand vs. deck so a true replacement is provable; the deck is large
    // enough that the redraw never exhausts it (so the discard is never reshuffled
    // back and the OLD hand stays in the discard pile).
    state.players.p1.hand = ["stat.attack", "stat.defense", "stat.power"];
    state.players.p1.deck = Array.from({ length: 8 }, () => "spell.magic_arrow");
    state.players.p2.hand = ["stat.knowledge", "stat.knowledge"];
    state.players.p2.deck = Array.from({ length: 8 }, () => "spell.magic_arrow");
    state.decks.astrologers.drawPile = ["astrologers.big_cleanup"];

    drawAstrologersCard(state);

    // p1: the whole 3-card hand is gone to discard; 3 fresh cards drawn from deck.
    expect(state.players.p1.hand).toEqual(["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"]);
    expect(state.players.p1.hand).not.toContain("stat.attack");
    expect(state.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense", "stat.power"]));

    // The notice: a forced-reshuffle event for p1 with the real counts.
    const p1Events = reshuffleEvents(state, "p1");
    expect(p1Events).toHaveLength(1);
    expect(p1Events[0]).toMatchObject({ cardId: "astrologers.big_cleanup", mode: "discard-all", discarded: 3, drawn: 3 });

    // It is "each player": p2 is reshuffled and noticed too (multiplayer parity).
    expect(state.players.p2.discard).toEqual(expect.arrayContaining(["stat.knowledge", "stat.knowledge"]));
    const p2Events = reshuffleEvents(state, "p2");
    expect(p2Events).toHaveLength(1);
    expect(p2Events[0]).toMatchObject({ mode: "discard-all", discarded: 2, drawn: 2 });
  });

  it("does nothing (and logs nothing) for a player who already has an empty hand", () => {
    const state = makeGame("big-cleanup-empty");
    state.players.p1.hand = [];
    state.players.p1.deck = ["stat.attack", "stat.attack"];
    state.players.p2.hand = [];
    state.players.p2.deck = ["stat.attack", "stat.attack"];
    state.decks.astrologers.drawPile = ["astrologers.big_cleanup"];

    drawAstrologersCard(state);

    expect(state.players.p1.hand).toEqual([]);
    expect(reshuffleEvents(state, "p1")).toHaveLength(0);
  });
});

describe("Astrologers — Annoying Lizard (RESHUFFLE_ARTIFACTS_SPELLS)", () => {
  it("shuffles only Spells+Artifacts back, redraws as many, and logs the notice", () => {
    const state = makeGame("annoying-lizard");
    // One spell, one artifact, one statistic. Only the first two are reshuffled.
    state.players.p1.hand = ["spell.magic_arrow", "stat.attack", "stat.defense"];
    state.players.p1.deck = Array.from({ length: 8 }, () => "stat.knowledge");
    state.players.p2.hand = ["stat.power"]; // no spell/artifact → untouched, no notice
    state.players.p2.deck = ["stat.knowledge"];
    state.decks.astrologers.drawPile = ["astrologers.annoying_lizard"];

    drawAstrologersCard(state);

    // The non-spell statistics are untouched; the hand size is preserved.
    expect(state.players.p1.hand).toContain("stat.attack");
    expect(state.players.p1.hand).toContain("stat.defense");
    expect(state.players.p1.hand).toHaveLength(3);
    // The spell is conserved (shuffled into the deck, possibly redrawn) — never lost.
    const spellsLeft = [...state.players.p1.hand, ...state.players.p1.deck].filter((id) => id === "spell.magic_arrow");
    expect(spellsLeft).toHaveLength(1);
    // A fresh card was drawn from the deck (the hand changed): at least one Knowledge.
    expect(state.players.p1.hand).toContain("stat.knowledge");

    const p1Events = reshuffleEvents(state, "p1");
    expect(p1Events).toHaveLength(1);
    expect(p1Events[0]).toMatchObject({ cardId: "astrologers.annoying_lizard", mode: "reshuffle-spells", discarded: 1, drawn: 1 });

    // p2 held no Spell/Artifact, so nothing moved and nothing was noticed.
    expect(state.players.p2.hand).toEqual(["stat.power"]);
    expect(reshuffleEvents(state, "p2")).toHaveLength(0);
  });
});

describe("Astrologers — forced reshuffle through the real round transition", () => {
  it("fires at the start of round 2 for both seats when END_TURN flips the round", () => {
    let state = makeGame("forced-flow");
    state.decks.astrologers!.drawPile.push("astrologers.big_cleanup");
    state.players.p1.hand = ["stat.attack", "stat.defense"];
    state.players.p1.deck = Array.from({ length: 8 }, () => "spell.magic_arrow");
    state.players.p2.hand = ["stat.power", "stat.knowledge"];
    state.players.p2.deck = Array.from({ length: 8 }, () => "spell.magic_arrow");

    const apply = (s: GameState, action: GameAction): GameState => {
      const result = applyAction(s, action);
      expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
      return result.state;
    };

    // Play out round 1 (both seats draw + end) so END_TURN flips into round 2.
    for (let i = 0; i < 2; i += 1) {
      const active = state.activePlayerId;
      if (getLegalActions(state, active).some((l) => l.action.type === "REFRESH_HAND")) {
        state = apply(state, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] });
      }
      state = apply(state, { type: "END_TURN", playerId: active });
    }

    expect(state.round).toBe(2);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.big_cleanup");
    // Both players were force-reshuffled, and both got the notice event.
    expect(reshuffleEvents(state, "p1").length).toBeGreaterThanOrEqual(1);
    expect(reshuffleEvents(state, "p2").length).toBeGreaterThanOrEqual(1);
  });
});
