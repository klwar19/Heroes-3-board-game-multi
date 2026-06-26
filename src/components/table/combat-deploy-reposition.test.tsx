// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattlefieldBoard } from "./board";
import { CardZoomProvider } from "./zoom";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "@/engine";
import { getMainHero } from "@/engine/adventure";
import { startNeutralEncounter } from "@/engine/adventure-reducer";

afterEach(cleanup);

function firePointer(type: "pointermove" | "pointerup", x: number, y: number): void {
  const ev = new Event(type);
  Object.assign(ev, { clientX: x, clientY: y, isPrimary: true, button: 0 });
  window.dispatchEvent(ev);
}

function apply(state: GameState, action: GameAction): GameState {
  const r = applyAction(state, action);
  expect(r.errors, r.errors.map((e) => e.message).join("; ")).toEqual([]);
  return r.state;
}

/** A real neutral Combat Setup for p1 with ONE unit already placed on the board. */
function placementWithOnePlaced(): GameState {
  let state = createAdventureGameState({ seed: "deploy-reposition", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  const hero = getMainHero(state, "p1")!;
  const field = state.adventure!.fields[hero.spaceId!];
  field.difficulty = 2; // level-1 hero < 2 → real Combat Setup
  startNeutralEncounter(state, hero, field);
  const place = getLegalActions(state, "p1").find((l) => l.action.type === "PLACE_COMBAT_UNIT");
  if (!place) throw new Error("no PLACE_COMBAT_UNIT offered");
  return apply(state, place.action);
}

describe("Battlefield deployment — repositioning a placed unit", () => {
  function renderBoard(state: GameState, onAction = vi.fn<(a: GameAction) => void>()) {
    const result = render(
      <CardZoomProvider>
        <BattlefieldBoard
          state={state}
          viewerPlayerId="p1"
          legalActions={getLegalActions(state, "p1")}
          selectedCardAction={null}
          onAction={onAction}
          onInspect={() => {}}
        />
      </CardZoomProvider>
    );
    return { ...result, onAction };
  }

  it("the placed unit's card image is NOT natively draggable (so the pointer-drag drop lands)", () => {
    // Regression guard: a natively-draggable <img> starts the browser's own
    // image drag, which swallows the pointer events and the custom reposition
    // drop never fires — that is exactly the "drag from the panel works, but
    // dragging a unit already on the field doesn't" bug. The deploy-panel
    // portrait sets draggable={false} for the same reason.
    const state = placementWithOnePlaced();
    const placed = Object.values(state.combat!.units).find((u) => u.controllerId === "p1")!;
    const { container } = renderBoard(state);

    const cell = container.querySelector<HTMLElement>(`[data-fx-unit="${placed.id}"]`);
    expect(cell, "the placed unit cell renders").toBeTruthy();
    expect(cell!.classList.contains("unitDraggable"), "placed unit is a drag source").toBe(true);

    const img = cell!.querySelector<HTMLImageElement>("img.boardCardImage");
    expect(img, "the placed unit shows its card image").toBeTruthy();
    expect(img!.getAttribute("draggable"), "card image must not be natively draggable").toBe("false");
  });

  it("dragging a placed unit onto an empty cell dispatches a reposition", () => {
    const state = placementWithOnePlaced();
    const placed = Object.values(state.combat!.units).find((u) => u.controllerId === "p1")!;
    const { container, onAction } = renderBoard(state);

    const source = container.querySelector<HTMLElement>(`[data-fx-unit="${placed.id}"]`)!;
    const emptyDrop = Array.from(container.querySelectorAll<HTMLElement>('[data-drop-cell="true"]')).find(
      (c) => c.getAttribute("data-fx-cell") !== String(placed.position)
    )!;
    expect(emptyDrop, "an empty deployment drop cell").toBeTruthy();
    const targetPos = Number(emptyDrop.getAttribute("data-fx-cell"));

    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => emptyDrop;
    fireEvent.pointerDown(source, { clientX: 0, clientY: 0, isPrimary: true, button: 0 });
    firePointer("pointermove", 60, 60);
    firePointer("pointerup", 60, 60);

    expect(onAction).toHaveBeenCalledWith({
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: placed.armyUnitId,
      position: targetPos
    });
    window.dispatchEvent(new Event("click"));
  });

  it("a placed unit's own cell is a drop target (drop another unit on it to switch)", () => {
    const state = placementWithOnePlaced();
    const placed = Object.values(state.combat!.units).find((u) => u.controllerId === "p1")!;
    const { container } = renderBoard(state);
    const cell = container.querySelector<HTMLElement>(`[data-fx-unit="${placed.id}"]`)!;
    expect(cell.getAttribute("data-drop-cell"), "your placed unit cell accepts a swap drop").toBe("true");
  });
});
