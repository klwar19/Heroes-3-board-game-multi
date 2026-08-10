// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PermanentSlot } from "./seats";
import { CardZoomProvider } from "./zoom";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState
} from "@/engine";

// ---------------------------------------------------------------------------
// The "show ongoing cards in play" window (Permanents & Ongoing tray).
//
// The engine keeps a card whose lasting effect is live in `player.ongoingCards`
// (see ongoing-cards-in-play.test.ts). This pins the display half END TO END on
// a REAL map play: the card is a face in the tray while the effect runs, it can
// be opened full-size, every seat can see it (a public zone), and it leaves the
// tray for the discard pile only once the effect is gone.
// ---------------------------------------------------------------------------

afterEach(cleanup);

function makeMap(): GameState {
  const state = createAdventureGameState({
    seed: "ongoing-tray",
    difficulty: "normal",
    rollFirstPlayer: false
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Play a map ongoing card (Pathfinding: "this turn" movement) for p1. */
function playPathfinding(): GameState {
  const state = makeMap();
  state.players.p1.hand = ["ability.pathfinding"];
  const offer = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.pathfinding"
  );
  expect(offer, "Pathfinding must be map-playable").toBeTruthy();
  return applyOk(state, offer!.action);
}

function renderTray(state: GameState, viewerPlayerId: "p1" | "p2", ownerId: "p1" | "p2" = "p1") {
  const legalActions = getLegalActions(state, viewerPlayerId);
  return render(
    <CardZoomProvider>
      <PermanentSlot
        legalActions={legalActions}
        onAction={() => {}}
        playerId={ownerId}
        state={state}
        viewerPlayerId={viewerPlayerId}
      />
    </CardZoomProvider>
  );
}

describe("Ongoing tray — a live map effect shows its card in play", () => {
  it("renders the played card's face while the effect runs, and opens it full size", () => {
    const state = playPathfinding();
    expect(state.players.p1.ongoingCards?.map((held) => held.cardId)).toContain("ability.pathfinding");

    const { container } = renderTray(state, "p1");
    // The tray tile carries the card ART (not a text stub).
    const tile = container.querySelector(".permanentSlot.ongoing");
    expect(tile, "the ongoing card must have its own tray tile").toBeTruthy();
    expect(tile?.querySelector("img.permanentCardImage"), "the tile shows the card face").toBeTruthy();

    // …and the whole card (with its printed effect text) is one click away.
    fireEvent.click(screen.getByRole("button", { name: "Pathfinding actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /View card/i }));
    expect(screen.getByRole("dialog", { name: /Pathfinding enlarged/i })).toBeTruthy();
  });

  it("is PUBLIC: another seat sees the same card in play, without action buttons", () => {
    const state = playPathfinding();
    // Player views must not mask the tray — it is an in-play, face-up zone.
    const view = getPlayerView(state, "p2");
    expect(view.players.p1.ongoingCards?.map((held) => held.cardId)).toContain("ability.pathfinding");

    const { container } = renderTray(state, "p2");
    expect(container.querySelector(".permanentSlot.ongoing img.permanentCardImage")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pathfinding actions" }));
    // A non-owner gets the reader, never the owner's "end this effect" control.
    expect(screen.getByRole("menuitem", { name: /View card/i })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Discard from play/i })).toBeNull();
  });

  it("CONTROL: leaves the tray for the discard pile only once the effect is gone", () => {
    const live = playPathfinding();
    const liveIds = new Set(
      live.activeEffects
        .filter((effect) => effect.source.type === "card" && effect.source.cardId === "ability.pathfinding")
        .map((effect) => effect.id)
    );
    expect(liveIds.size).toBe(1);

    // End the effect at its own seam, then let any action run the shared release.
    const expired = { ...live, activeEffects: live.activeEffects.filter((effect) => !liveIds.has(effect.id)) };
    const settled = applyOk(expired, { type: "END_TURN", playerId: "p1" });

    expect(settled.players.p1.ongoingCards ?? []).toHaveLength(0);
    expect(settled.players.p1.discard).toContain("ability.pathfinding");

    const { container } = renderTray(settled, "p1");
    expect(container.querySelector(".permanentSlot.ongoing")).toBeNull();
  });
});
