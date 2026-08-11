// @vitest-environment jsdom
/**
 * The Tome's "which Spell deck?" pick renders as ONE description plus TWO clean
 * buttons (2026-08-11 user ruling — "Tome of X-stupid, should work like 1
 * description, then allow to choose basic or expert deck after wards with 2
 * buttons").
 *
 * SURFACE: the generic `PromptTray`, exactly like `artifact-deck-pick` (Tazar's
 * War Hero VI) — the repo's existing "one play, then pick WHICH shared deck"
 * precedent. Deliberately NOT `DeckSearchModeModal`, whose full-screen
 * card-back/discard-face layout belongs to the SEARCH family (reveal N, keep
 * one, or take the discard top); a dig reveals nothing to show.
 *
 * Everything here is driven by the REAL engine: the state is built by playing
 * the Tome, and the buttons dispatch the engine's OWN index-aligned offers.
 * jsdom cannot compute CSS, so only the DOM contract is pinned.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "@/components/adventure/screen";
import { applyAction, createAdventureGameState, getLegalActions, type GameState } from "@/engine";
import type { CardId, GameAction } from "@/engine/state";

afterEach(cleanup);

const TOME_EARTH = "artifact.tome_of_earth" as CardId;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Play the Tome's dig on a split-deck table with a crown ⇒ the deck pick is open. */
function openedDeckPick(seed: string, { crowns = 1 }: { crowns?: number } = {}): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "split-decks": true }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.activePlayerId = "p1";
  state.players.p1.hand = [TOME_EARTH];
  state.players.p1.limits.expertUses = crowns;
  state.decks.spells.drawPile = ["spell.stone_skin" as CardId];
  state.decks.spells.discardPile = [];
  state.decks["spells-expert"]!.drawPile = ["spell.implosion" as CardId];
  state.decks["spells-expert"]!.discardPile = [];

  const play = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === TOME_EARTH && legal.action.optionIndex === 0
  );
  expect(play, "the Tome's dig side is offered").toBeTruthy();
  return applyOk(state, play!.action);
}

describe("Tome deck pick — one description, two buttons", () => {
  it("renders the prompt once and exactly two deck buttons", () => {
    const state = openedDeckPick("tome-pick-ui");
    const legalActions = getLegalActions(state, "p1");
    render(<PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    const tray = screen.getByRole("dialog", { name: /which Spell deck/i });
    const buttons = Array.from(tray.querySelectorAll("button")).map((button) => button.textContent?.trim());
    expect(buttons).toEqual(["Basic Spells deck", "Expert Spells deck (1 crown)"]);
  });

  it("each button dispatches the engine's OWN index-aligned offer", () => {
    const state = openedDeckPick("tome-pick-ui-dispatch");
    const legalActions = getLegalActions(state, "p1");
    const onAction = vi.fn();
    render(<PromptTray legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: "Expert Spells deck (1 crown)" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]![0]).toMatchObject({ type: "CHOOSE_OPTION", playerId: "p1", optionIndex: 1 });

    // …and the engine really accepts what the button sent.
    const resolved = applyOk(state, onAction.mock.calls[0]![0] as GameAction);
    expect(
      resolved.pendingChoice?.type === "OPTION_CHOICE" ? resolved.pendingChoice.eagleEye?.deckId : null
    ).toBe("spells-expert");
  });

  it("CONTROL: with no crown the pick never opens, so the tray shows the dig's own choice", () => {
    // The same play at 0 crowns skips the deck pick entirely and lands straight
    // on the take-or-discard prompt — no deck buttons to render.
    const state = openedDeckPick("tome-pick-ui-no-crown", { crowns: 0 });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).toBe("eagle-eye");

    render(<PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.queryByRole("button", { name: /Spells deck/i })).toBeNull();
  });
});
