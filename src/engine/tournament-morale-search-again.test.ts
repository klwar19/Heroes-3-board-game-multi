/**
 * Tournament Book p.54 — Additional Morale token action:
 * while a Search is open, spend the positive Morale token to discard all
 * revealed cards and perform Search (X) again.
 *
 * Each claim mutation-checked with a non-tournament CONTROL.
 */
import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { createAdventureGameState } from "./adventure-setup";
import { tournamentMoraleSearchAgainEnabled } from "./adventure";
import { openSharedDeckSearch } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function makeTournamentGame(
  seed: string,
  extras?: { tournament?: boolean; moraleCards?: boolean; moraleSearchAgain?: boolean }
): GameState {
  const tournament = extras?.tournament !== false;
  return createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    // Tournament master + second-player morale freeze the tournament flags.
    tournamentMode: tournament,
    tournamentBanDiplomacy: tournament,
    tournamentBanHourglass: tournament,
    tournamentSecondPlayerMorale: tournament,
    ...(extras?.moraleSearchAgain !== undefined
      ? { tournamentMoraleSearchAgain: extras.moraleSearchAgain }
      : {}),
    moraleCards: extras?.moraleCards ?? false
  });
}

/** Open a Search that lands on DECK_SEARCH with revealed cards (skip Scouting / discard-top menus). */
function openRevealedSearch(
  state: GameState,
  playerId: "p1" | "p2",
  deckId: string,
  count: number,
  allowRemove = false
): GameState {
  // Empty discard so the search does not open the "take discard top?" branch.
  const deck = state.decks[deckId];
  if (deck) {
    deck.drawPile = [...deck.discardPile, ...deck.drawPile];
    deck.discardPile = [];
  }
  // Strip Scouting from hand so the Scouting prompt never opens.
  const player = state.players[playerId];
  if (player) {
    player.hand = player.hand.filter((id) => !id.includes("scouting") && !id.includes("Scout"));
  }
  openSharedDeckSearch(state, playerId, deckId, count, true, allowRemove);
  let next = state;
  // Drain any remaining mode/scouting CHOICE until DECK_SEARCH is up.
  for (let i = 0; i < 6 && next.pendingChoice?.type === "OPTION_CHOICE"; i += 1) {
    const choice = next.pendingChoice;
    if (choice.type !== "OPTION_CHOICE") break;
    // Prefer the "Search the deck" branch (index 0 or label match).
    let optionIndex = 0;
    const searchIdx = choice.options.findIndex((o) => /search/i.test(o.label) && !/discard/i.test(o.label));
    if (searchIdx >= 0) optionIndex = searchIdx;
    // Decline Scouting if present.
    const declineIdx = choice.options.findIndex((o) => /not play|skip|without|decline|no scouting/i.test(o.label));
    if (choice.context === "scouting-prompt" && declineIdx >= 0) optionIndex = declineIdx;
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId,
      choiceId: choice.id,
      optionIndex
    });
  }
  return next;
}

describe("tournamentMoraleSearchAgainEnabled", () => {
  it("is true when tournament flags are frozen, false otherwise", () => {
    const on = makeTournamentGame("t-morale-gate-on");
    expect(tournamentMoraleSearchAgainEnabled(on)).toBe(true);

    const off = makeTournamentGame("t-morale-gate-off", { tournament: false });
    expect(tournamentMoraleSearchAgainEnabled(off)).toBe(false);

    const granularOff = makeTournamentGame("t-morale-gate-granular-off", { moraleSearchAgain: false });
    expect(tournamentMoraleSearchAgainEnabled(granularOff)).toBe(false);
  });
});

describe("Tournament Morale token — Search again", () => {
  it("offers SPEND_MORALE repeat-search while a DECK_SEARCH is open and the player has +morale", () => {
    let state = makeTournamentGame("t-morale-search-offer");
    state.players.p1.morale = 1;
    state = openRevealedSearch(state, "p1", "abilities", 2);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") return;
    expect(state.pendingChoice.revealedCardIds.length).toBeGreaterThan(0);

    const legal = getLegalActions(state, "p1");
    const repeat = legal.find(
      (l) => l.action.type === "SPEND_MORALE" && l.action.benefit === "repeat-search"
    );
    expect(repeat, "Tournament + morale should offer Search again").toBeTruthy();
    expect(repeat!.label).toMatch(/Search/i);
  });

  it("spending the token discards revealed cards, spends morale, and re-opens Search (X)", () => {
    let state = makeTournamentGame("t-morale-search-spend");
    state.players.p1.morale = 1;
    state = openRevealedSearch(state, "p1", "abilities", 2);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") return;

    const firstRevealed = [...state.pendingChoice.revealedCardIds];
    expect(firstRevealed.length).toBe(2);
    const discardBefore = state.decks.abilities?.discardPile.length ?? 0;

    state = applyOk(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "repeat-search" });

    expect(state.players.p1.morale).toBe(0);
    // First reveal discarded.
    const discardAfter = state.decks.abilities?.discardPile ?? [];
    expect(discardAfter.length).toBe(discardBefore + firstRevealed.length);
    for (const id of firstRevealed) {
      expect(discardAfter).toContain(id);
    }
    // A new Search is open (or deck-search-mode before the next reveal).
    const choice = state.pendingChoice;
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds.length).toBeGreaterThan(0);
      for (const id of firstRevealed) {
        expect(choice.revealedCardIds).not.toContain(id);
      }
    } else if (choice?.type === "OPTION_CHOICE") {
      expect(choice.context === "scouting-prompt" || choice.context === "deck-search-mode").toBe(true);
    } else {
      expect(choice).toBeNull();
    }
  });

  it("the re-run keeps the Tarnum allowRemove privilege", () => {
    let state = makeTournamentGame("t-morale-search-remove");
    state.players.p1.morale = 1;
    state = openRevealedSearch(state, "p1", "abilities", 2, true);
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") return;
    expect(state.pendingChoice.allowRemove).toBe(true);

    state = applyOk(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "repeat-search" });

    // The re-run may pass through the Search-or-take-discard menu (the
    // discarded reveal now tops the discard pile) — commit to Searching.
    for (let i = 0; i < 4 && state.pendingChoice?.type === "OPTION_CHOICE"; i += 1) {
      const choice = state.pendingChoice;
      state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    }
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type === "DECK_SEARCH") {
      expect(state.pendingChoice.allowRemove, "the repeated Search keeps the Remove privilege").toBe(true);
    }
  });

  it("CONTROL: non-tournament tables do not offer Search-again with the morale token", () => {
    let state = makeTournamentGame("t-morale-search-control", { tournament: false });
    state.players.p1.morale = 1;
    state = openRevealedSearch(state, "p1", "abilities", 2);
    if (state.pendingChoice?.type !== "DECK_SEARCH") return;
    const legal = getLegalActions(state, "p1");
    expect(
      legal.some((l) => l.action.type === "SPEND_MORALE" && l.action.benefit === "repeat-search")
    ).toBe(false);
  });

  it("CONTROL: without a positive morale token the offer is absent", () => {
    let state = makeTournamentGame("t-morale-search-no-token");
    state.players.p1.morale = 0;
    state.players.p1.moraleOverflow = 0;
    state = openRevealedSearch(state, "p1", "abilities", 2);
    if (state.pendingChoice?.type !== "DECK_SEARCH") return;
    const legal = getLegalActions(state, "p1");
    expect(
      legal.some((l) => l.action.type === "SPEND_MORALE" && l.action.benefit === "repeat-search")
    ).toBe(false);
  });
});
