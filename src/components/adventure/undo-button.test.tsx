// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdventureHud } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, type GameState } from "@/engine";

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
