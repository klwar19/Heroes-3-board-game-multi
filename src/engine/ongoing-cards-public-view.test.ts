import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./adventure-setup";
import { getPlayerView, redactStateForSeat, HIDDEN_CARD_ID } from "./player-view";
import type { GameState } from "./state";

// ---------------------------------------------------------------------------
// A card an opponent holds IN PLAY is face up on the table, so it is PUBLIC —
// both in the collapsed `getPlayerView` frame and in the redacted GameState a
// hosted table actually broadcasts. Their hand / deck / Spell Book contents stay
// hidden, and only the AMOUNTS of the Spell Book survive (used vs total).
//
// The Ongoing tray display half is pinned in
// `src/components/table/opponent-in-play-tray.test.tsx`; the Spell-Book counts
// reach the UI in `src/components/adventure/opponent-info.test.tsx`.
// ---------------------------------------------------------------------------

function twoPlayerGame(): GameState {
  const state = createAdventureGameState({
    seed: "ongoing-public-view",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  // p2 has an ongoing card in play, private cards in hand and deck, and a Spell
  // Book with one refreshed and two used Spells.
  state.players.p2.ongoingCards = [{ cardId: "spell.mirth", effectIds: ["fx-1"], returnTo: "discard" }];
  state.players.p2.hand = ["spell.magic_arrow", "ability.tactics"];
  state.players.p2.deck = ["spell.bless", "spell.haste", "spell.slow"];
  state.players.p2.spellBook = ["spell.fortune"];
  state.players.p2.spellBookUsed = ["spell.shield", "spell.weakness"];
  return state;
}

describe("An in-play ONGOING card is public to every seat", () => {
  it("getPlayerView keeps the opponent's ongoing card id (CONTROL: hand/deck/book are not)", () => {
    const view = getPlayerView(twoPlayerGame(), "p1");

    expect(view.players.p2.ongoingCards?.map((held) => held.cardId)).toEqual(["spell.mirth"]);

    // CONTROL: the private zones are collapsed to counts, never card ids.
    expect(view.players.p2.hand).toEqual([]);
    expect(view.players.p2.handCount).toBe(2);
    expect(view.players.p2.deck).toEqual([]);
    expect(view.players.p2.spellBook).toEqual([]);
    // …and the viewer's OWN zones are untouched.
    const own = getPlayerView(twoPlayerGame(), "p2");
    expect(own.players.p2.hand).toEqual(["spell.magic_arrow", "ability.tactics"]);
    expect(own.players.p2.spellBook).toEqual(["spell.fortune"]);
  });

  it("redactStateForSeat (the frame a hosted table broadcasts) keeps it too", () => {
    const frame = redactStateForSeat(twoPlayerGame(), "p1");

    expect(frame.players.p2.ongoingCards?.map((held) => held.cardId)).toEqual(["spell.mirth"]);

    // CONTROL: hand / deck / Book contents are same-length placeholders.
    expect(frame.players.p2.hand).toEqual([HIDDEN_CARD_ID, HIDDEN_CARD_ID]);
    expect(frame.players.p2.deck).toEqual([HIDDEN_CARD_ID, HIDDEN_CARD_ID, HIDDEN_CARD_ID]);
    expect(frame.players.p2.spellBook).toEqual([HIDDEN_CARD_ID]);
  });

  it("exposes the Spell Book AMOUNTS (used / total) with the identities hidden", () => {
    const frame = redactStateForSeat(twoPlayerGame(), "p1");
    const used = frame.players.p2.spellBookUsed ?? [];
    const held = frame.players.p2.spellBook ?? [];

    // Used Spells sit FACE UP on the table (Polish Book), so they keep their ids…
    expect(used).toEqual(["spell.shield", "spell.weakness"]);
    // …while the refreshed side is face down: the count is all that survives.
    expect(held).toHaveLength(1);
    expect(held.every((cardId) => cardId === HIDDEN_CARD_ID)).toBe(true);
    // The amount the UI shows: 2 used of 3 total.
    expect(`${used.length}/${used.length + held.length}`).toBe("2/3");
  });
});
