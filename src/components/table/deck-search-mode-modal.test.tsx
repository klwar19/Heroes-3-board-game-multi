// @vitest-environment jsdom
/**
 * Search-or-take-discard (deck-search-mode) modal: Search shows the deck's card
 * back; take-discard shows the face of the top discard card — same search-modal
 * vibe as Search(X), not bare text buttons.
 */
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeckSearchModeModal, SearchModal } from "./overlays";
import { CardZoomProvider } from "./zoom";
import { PromptTray } from "@/components/adventure/screen";
import {
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameState
} from "@/engine";
import { cardLibrary } from "@/data/cards/library";
import { CARD_BACK_IMAGES } from "@/data/decks";

afterEach(cleanup);

function wrap(ui: ReactElement) {
  return render(<CardZoomProvider>{ui}</CardZoomProvider>);
}

/** Force an open Search-or-take-discard choice with a known discard top. */
function openDeckSearchMode(discardTopId: string): GameState {
  const state = createAdventureGameState({
    seed: "deck-search-mode-ui",
    rollFirstPlayer: false
  });
  state.activePlayerId = "p1";
  state.decks.abilities.discardPile = [discardTopId];
  state.pendingChoice = {
    id: "choice_search_mode",
    type: "OPTION_CHOICE",
    playerId: "p1",
    prompt: "Search the abilities deck, or take its top discard?",
    options: [
      { label: "Search (2) — look at the top cards and keep one" },
      { label: `Take the top discard (${cardLibrary[discardTopId]?.name ?? discardTopId})` }
    ],
    context: "deck-search-mode",
    deckSearchMode: {
      deckId: "abilities",
      count: 2,
      hasDiscardTop: true
    },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = "p1";
  return state;
}

describe("DeckSearchModeModal — search back + discard face", () => {
  it("shows the deck card back for Search and the discard top face for take-discard", () => {
    const abilityId =
      Object.keys(cardLibrary).find(
        (id) => id.startsWith("ability.") && cardLibrary[id]?.assets?.cardImage
      ) ?? "ability.attack";
    const state = openDeckSearchMode(abilityId);
    const view = getPlayerView(state, "p1");
    const legalActions = getLegalActions(state, "p1");
    const onAction = vi.fn();

    wrap(
      <DeckSearchModeModal
        legalActions={legalActions}
        onAction={onAction}
        state={state}
        view={view}
        viewerPlayerId="p1"
      />
    );

    expect(screen.getByRole("dialog", { name: /Search the abilities deck/i })).toBeTruthy();

    const searchBtn = screen.getByRole("button", { name: /Search \(2\)/i });
    const discardBtn = screen.getByRole("button", {
      name: new RegExp(`Take the top discard \\(${cardLibrary[abilityId]?.name ?? abilityId}\\)`, "i")
    });

    // Search option: deck back art (M&M back for Ability deck).
    const searchImg = searchBtn.querySelector("img");
    expect(searchImg, "Search shows a card-back image").toBeTruthy();
    expect(searchImg!.getAttribute("src") ?? "").toContain(
      CARD_BACK_IMAGES.mm.replace(/^\//, "").split("/").pop()!.replace(/\.[^.]+$/, "")
    );

    // Discard option: the face-up top card.
    const discardImg = discardBtn.querySelector("img");
    expect(discardImg, "Discard shows the top card face").toBeTruthy();
    expect(discardImg!.getAttribute("alt") ?? "").toMatch(
      new RegExp(cardLibrary[abilityId]?.name ?? abilityId, "i")
    );
    expect(discardBtn.className).toMatch(/discardPick/);

    fireEvent.click(searchBtn);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CHOOSE_OPTION", optionIndex: 0, choiceId: "choice_search_mode" })
    );
  });

  it("multi-pick Spell takes render EACH pick's OWN card face — not the pile top for every option", () => {
    // Two acquirable discarded spells; the pile TOP is Haste, but option 1 maps
    // onto discardPickCardIds[0] = Bless (pile order, bottom first).
    const state = createAdventureGameState({ seed: "deck-search-mode-multi", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    state.decks.spells.discardPile = ["spell.bless", "spell.haste"];
    state.pendingChoice = {
      id: "choice_search_mode_multi",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Search the Spell deck, or take a discarded spell (pick which one)?",
      options: [
        { label: "Search (2) — look at the top cards and keep one" },
        { label: "Take discarded Bless" },
        { label: "Take discarded Haste (face-up top)" }
      ],
      context: "deck-search-mode",
      deckSearchMode: {
        deckId: "spells",
        count: 2,
        hasDiscardTop: true,
        discardPickCardIds: ["spell.bless", "spell.haste"]
      },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    wrap(
      <DeckSearchModeModal
        legalActions={getLegalActions(state, "p1")}
        onAction={vi.fn()}
        state={state}
        view={getPlayerView(state, "p1")}
        viewerPlayerId="p1"
      />
    );

    const blessBtn = screen.getByRole("button", { name: /Take discarded Bless/i });
    const hasteBtn = screen.getByRole("button", { name: /Take discarded Haste/i });
    // Each take renders ITS pick's face (alt names the card), styled as a discard pick.
    expect(blessBtn.querySelector("img")?.getAttribute("alt") ?? "").toMatch(/Bless/i);
    expect(hasteBtn.querySelector("img")?.getAttribute("alt") ?? "").toMatch(/Haste/i);
    expect(blessBtn.className).toMatch(/discardPick/);
    expect(hasteBtn.className).toMatch(/discardPick/);
  });

  it("renders nothing for a non-owner (waiting strip only, no modal)", () => {
    const state = openDeckSearchMode("ability.attack");
    const view = getPlayerView(state, "p2");
    wrap(
      <DeckSearchModeModal
        legalActions={[]}
        onAction={vi.fn()}
        state={state}
        view={view}
        viewerPlayerId="p2"
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/choosing how to search/i);
  });
});

describe("SearchModal — zoom out for Search(3+)", () => {
  it("defaults compact when more than 2 revealed cards and toggles zoom", () => {
    const state = createAdventureGameState({ seed: "search-zoom", rollFirstPlayer: false });
    const cards = Object.keys(cardLibrary)
      .filter((id) => id.startsWith("ability.") && cardLibrary[id]?.assets?.cardImage)
      .slice(0, 4);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    state.pendingChoice = {
      id: "choice_search_4",
      type: "DECK_SEARCH",
      playerId: "p1",
      deckId: "abilities",
      revealedCardIds: cards.slice(0, 4),
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    const view = getPlayerView(state, "p1");

    const { container } = wrap(
      <SearchModal onAction={vi.fn()} state={state} view={view} viewerPlayerId="p1" />
    );

    expect(container.querySelector(".searchCards--compact")).toBeTruthy();
    expect(container.querySelector(".searchModal--compact")).toBeTruthy();

    const toggle = screen.getByRole("button", { name: /Zoom in cards/i });
    fireEvent.click(toggle);
    expect(container.querySelector(".searchCards--compact")).toBeNull();
    expect(screen.getByRole("button", { name: /Zoom out cards/i })).toBeTruthy();
  });

  it("renders the Tournament Morale Search-again offer and dispatches it (CONTROL: absent without the offer)", () => {
    const state = createAdventureGameState({ seed: "search-repeat-ui", rollFirstPlayer: false });
    const cards = Object.keys(cardLibrary)
      .filter((id) => id.startsWith("ability."))
      .slice(0, 2);
    state.pendingChoice = {
      id: "choice_search_repeat",
      type: "DECK_SEARCH",
      playerId: "p1",
      deckId: "abilities",
      revealedCardIds: cards,
      baseCount: 2,
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    const view = getPlayerView(state, "p1");
    const onAction = vi.fn();
    const repeatOffer = {
      label: "Spend Morale token — discard all revealed, Search (2) again",
      action: { type: "SPEND_MORALE" as const, playerId: "p1" as const, benefit: "repeat-search" as const }
    };

    wrap(
      <SearchModal
        legalActions={[repeatOffer]}
        onAction={onAction}
        state={state}
        view={view}
        viewerPlayerId="p1"
      />
    );
    const button = screen.getByRole("button", { name: /Spend Morale token — discard all revealed/i });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(repeatOffer.action);

    cleanup();
    // CONTROL: no repeat offer in the legal actions → no such button.
    wrap(
      <SearchModal legalActions={[]} onAction={vi.fn()} state={state} view={view} viewerPlayerId="p1" />
    );
    expect(screen.queryByRole("button", { name: /Spend Morale token/i })).toBeNull();
  });

  it("keeps the large layout for Search(2) with no zoom toggle", () => {
    const state = createAdventureGameState({ seed: "search-two", rollFirstPlayer: false });
    const cards = Object.keys(cardLibrary)
      .filter((id) => id.startsWith("ability."))
      .slice(0, 2);
    state.pendingChoice = {
      id: "choice_search_2",
      type: "DECK_SEARCH",
      playerId: "p1",
      deckId: "abilities",
      revealedCardIds: cards,
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    const view = getPlayerView(state, "p1");

    const { container } = wrap(
      <SearchModal onAction={vi.fn()} state={state} view={view} viewerPlayerId="p1" />
    );

    expect(container.querySelector(".searchCards--compact")).toBeNull();
    expect(screen.queryByRole("button", { name: /Zoom/i })).toBeNull();
  });
});

describe("discard-pick PromptTray — card faces for get-from-discard", () => {
  it("shows each discard candidate's face art, not text-only buttons", () => {
    const cardA =
      Object.keys(cardLibrary).find((id) => id.startsWith("spell.") && cardLibrary[id]?.assets?.cardImage) ??
      "spell.magic_arrow";
    const cardB =
      Object.keys(cardLibrary).find(
        (id) => id.startsWith("ability.") && cardLibrary[id]?.assets?.cardImage && id !== cardA
      ) ?? "ability.attack";
    const state = createAdventureGameState({ seed: "discard-pick-ui", rollFirstPlayer: false });
    state.pendingChoice = {
      id: "choice_discard_pick",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Take a card from your discard pile",
      options: [
        { label: `Take ${cardLibrary[cardA]?.name ?? cardA}` },
        { label: `Take ${cardLibrary[cardB]?.name ?? cardB}` }
      ],
      context: "discard-pick",
      discardPick: {
        cardIds: [cardA, cardB],
        remaining: 1
      },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    const legalActions = [
      {
        label: `Take ${cardLibrary[cardA]?.name ?? cardA}`,
        action: { type: "CHOOSE_OPTION" as const, playerId: "p1" as const, choiceId: "choice_discard_pick", optionIndex: 0 }
      },
      {
        label: `Take ${cardLibrary[cardB]?.name ?? cardB}`,
        action: { type: "CHOOSE_OPTION" as const, playerId: "p1" as const, choiceId: "choice_discard_pick", optionIndex: 1 }
      }
    ];

    render(
      <PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    const tray = screen.getByRole("dialog", { name: /Take a card from your discard pile/i });
    expect(tray.className).toMatch(/withRewardCards/);
    const rewardCards = tray.querySelectorAll(".promptRewardCard");
    expect(rewardCards.length).toBe(2);
    const imgs = tray.querySelectorAll(".promptRewardCard img");
    expect(imgs.length).toBe(2);
  });
});
