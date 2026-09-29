// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdventureHud } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, undoStatusStamp, type GameState } from "@/engine";

afterEach(cleanup);

function renderHud(state: GameState, onAction = vi.fn()) {
  render(
    <CardZoomProvider>
      <AdventureHud state={state} viewerPlayerId="p1" legalActions={[]} onAction={onAction} />
    </CardZoomProvider>
  );
  return onAction;
}

/**
 * The OPTIONAL Undo button on the map HUD renders ONLY when the lobby turned the
 * debug/testing option on (frozen onto `adventure.undoMoves`), and clicking it
 * dispatches the exact UNDO_MOVE action the server intercepts.
 */
describe("map HUD Undo button (optional undo mode)", () => {
  it("does NOT render with the option off (default) — CONTROL", () => {
    const state = createAdventureGameState({ seed: "undo-hud-off", playerCount: 2, rollFirstPlayer: false });
    expect(state.adventure?.undoMoves ?? false).toBe(false);
    renderHud(state);
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
  });

  it("renders with the option on and dispatches UNDO_MOVE for the viewer's seat", () => {
    const state = createAdventureGameState({
      seed: "undo-hud-on",
      playerCount: 2,
      rollFirstPlayer: false,
      undoMoves: true
    });
    expect(state.adventure?.undoMoves).toBe(true);
    const onAction = renderHud(state);
    const button = screen.getByRole("button", { name: /Undo/ });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith({ type: "UNDO_MOVE", playerId: "p1" });
  });
});

/**
 * The 1v1 Undo (`adventure.duelUndo`) on the map HUD: always visible to both
 * seats, ENABLED only for the seat whose own safe step the server stamped on
 * `undoStatus`, disabled with the reason as its tooltip otherwise.
 */
describe("map HUD 1v1 Undo button (duelUndo)", () => {
  function duelState(seed: string): GameState {
    const state = createAdventureGameState({ seed, playerCount: 2, rollFirstPlayer: false, duelUndo: true });
    expect(state.adventure?.duelUndo).toBe(true);
    return state;
  }

  it("is enabled for the seat whose step is on the stack and dispatches UNDO_MOVE", () => {
    const state = duelState("duel-hud-own");
    state.undoStatus = { playerId: "p1", depth: 2, atEvent: undoStatusStamp(state) };
    const onAction = renderHud(state);
    const button = screen.getByRole("button", { name: /Undo/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith({ type: "UNDO_MOVE", playerId: "p1" });
  });

  it("CONTROL — the opponent's step (or a stale stamp) leaves it disabled with the reason", () => {
    const state = duelState("duel-hud-other");
    state.undoStatus = { playerId: "p2", depth: 1, atEvent: undoStatusStamp(state) };
    renderHud(state);
    const button = screen.getByRole("button", { name: /Undo/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/Only/);
    cleanup();

    const stale = duelState("duel-hud-stale");
    stale.undoStatus = { playerId: "p1", depth: 1, atEvent: undoStatusStamp(stale) - 1 };
    renderHud(stale);
    expect((screen.getByRole("button", { name: /Undo/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
