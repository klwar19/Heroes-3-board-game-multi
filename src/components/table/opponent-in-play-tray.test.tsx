// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpponentsInPlayTray } from "./seats";
import { CardZoomProvider } from "./zoom";
import { createAdventureGameState, redactStateForSeat, type GameState } from "@/engine";

// ---------------------------------------------------------------------------
// "When an opponent plays something that is ongoing it should be visible for
// ALL players." The card is face up on the table and the engine never masks
// `ongoingCards` (pinned in src/engine/ongoing-cards-public-view.test.ts) — the
// gap was that the Permanents & Ongoing tray was rendered for the viewer's OWN
// seat only. This pins the read-only opponent tray both trays now carry (map
// panel + the compact combat strip).
//
// jsdom cannot compute CSS: DOM contract only.
// ---------------------------------------------------------------------------

afterEach(cleanup);

function twoPlayerGame(): GameState {
  return createAdventureGameState({
    seed: "opp-in-play-tray",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

/** p2 has Mirth in play; the frame is the REDACTED one p1's client receives. */
function bobPlaysMirth(): GameState {
  const state = twoPlayerGame();
  state.players.p2.ongoingCards = [{ cardId: "spell.mirth", effectIds: ["fx-1"], returnTo: "discard" }];
  state.players.p2.hand = ["spell.magic_arrow"];
  return redactStateForSeat(state, "p1");
}

function renderTray(state: GameState, compact = false) {
  return render(
    <CardZoomProvider>
      <OpponentsInPlayTray compact={compact} seatIds={["p1", "p2"]} state={state} viewerPlayerId="p1" />
    </CardZoomProvider>
  );
}

describe("Opponents' cards in play — visible to every seat", () => {
  it("renders the opponent's ongoing card face, named, for the viewing seat", () => {
    const { container } = renderTray(bobPlaysMirth());

    const tray = container.querySelector(".opponentInPlayTray");
    expect(tray, "the opponent in-play tray must render").toBeTruthy();
    // The seat it belongs to is named…
    expect(within(tray as HTMLElement).getByText(/Bob — in play/)).toBeTruthy();
    // …and the ongoing card is a real card face, not a text stub.
    const tile = tray!.querySelector(".permanentSlot.ongoing img.permanentCardImage");
    expect(tile, "the opponent's ongoing card shows its face").toBeTruthy();
    // The card is identified by name (Mirth), so a player can read what it is.
    expect(screen.getByRole("button", { name: /Mirth actions/i })).toBeTruthy();
  });

  it("is READ-ONLY: a viewer gets the card reader, never the owner's end-effect control", () => {
    renderTray(bobPlaysMirth());
    fireEvent.click(screen.getByRole("button", { name: /Mirth actions/i }));
    expect(screen.getByRole("menuitem", { name: /View card/i })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Discard from play/i })).toBeNull();
  });

  it("CONTROL: renders NOTHING when no opponent has a card in play", () => {
    const { container } = renderTray(redactStateForSeat(twoPlayerGame(), "p1"));
    expect(container.querySelector(".opponentInPlayTray")).toBeNull();
  });

  it("CONTROL: the VIEWER's own ongoing card is not repeated here (it has its own tray)", () => {
    const state = twoPlayerGame();
    state.players.p1.ongoingCards = [{ cardId: "spell.mirth", effectIds: ["fx-1"], returnTo: "discard" }];
    const { container } = renderTray(redactStateForSeat(state, "p1"));
    expect(container.querySelector(".opponentInPlayTray")).toBeNull();
  });

  it("compact (the combat strip) renders the same opponent card", () => {
    const { container } = renderTray(bobPlaysMirth(), true);
    expect(container.querySelector(".opponentInPlayTray.compact")).toBeTruthy();
    expect(container.querySelector(".permanentSlot.ongoing img.permanentCardImage")).toBeTruthy();
  });
});
