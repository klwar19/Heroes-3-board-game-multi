// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { getLegalActions } from "@/engine";
import { getEventsState } from "@/engine/adventure";
import { cardLibrary } from "@/data/cards/library";
import { eventsGame, stackEventDeck, startResourceRound } from "@/engine/event-deck.test";

afterEach(cleanup);

/**
 * A Shady Auction bug: the bidder could not see WHICH artifact was on the block.
 * The bid runs during the round-start Event barrier, and the tray title was
 * forced to the generic "Event: A Shady Auction", dropping the lot-naming prompt
 * (and never rendering the artifact card). The fix surfaces the lot as its own
 * preview element (name + card art) so nobody bids blind. This test fails if
 * that wiring is removed — the `auction-lot` element only exists with the fix.
 */
describe("A Shady Auction — the bidder can see the artifact on the block", () => {
  it("shows the lot artifact's name (and card art) in the bid tray, not just 'Event: A Shady Auction'", () => {
    const state = eventsGame("auction-ui");
    stackEventDeck(state, "event.a_shady_auction");
    for (const id of ["p1", "p2"] as const) {
      state.players[id].resources = { gold: 30, buildingMaterials: 10, valuables: 10 };
    }
    startResourceRound(state); // round 3 (odd) → the round-start EVENT barrier is up

    const auction = getEventsState(state)!.auction!;
    const lotName = cardLibrary[auction.lotCardId]!.name;

    // The buggy condition: the round-start Event barrier is active, which used to
    // override the tray title to "Event: A Shady Auction" and hide the lot.
    expect(state.adventure!.eventResolution, "the round-start event barrier is active").toBeTruthy();
    // p1 holds the first secret bid.
    expect(state.adventure!.pendingVisit?.playerId).toBe("p1");

    const legal = getLegalActions(state, "p1");
    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // The lot's artifact is surfaced in its own preview element, naming it.
    const lotPreview = screen.getByTestId("auction-lot");
    expect(lotPreview.textContent).toContain(lotName);
    // The card art is rendered too (alt = the artifact name) when the card has one.
    if (cardLibrary[auction.lotCardId]?.assets?.cardImage) {
      expect(screen.getByRole("img", { name: lotName })).toBeTruthy();
    }
    // The secret-bid buttons are still there.
    expect(screen.getByRole("button", { name: /No bid/i })).toBeTruthy();
  });
});
