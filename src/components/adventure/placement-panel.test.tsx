// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlacementPanel } from "./screen";
import { createInitialGameState, type GameAction, type GameState, type LegalAction } from "@/engine";

afterEach(cleanup);

/**
 * The combat deployment panel lives in its own sidebar to the right of the
 * board. These tests pin the behaviour that makes that sidebar useful: every
 * army unit renders as a draggable tile (drag-to-deploy), and the lock-in /
 * Ready button is present. They fail if the drag wiring or the finish button
 * is dropped.
 */
function deployState(): GameState {
  const base = createInitialGameState("placement-panel-test");
  if (!base.combat) {
    throw new Error("sandbox state must have a combat");
  }
  return {
    ...base,
    players: {
      ...base.players,
      p1: {
        ...base.players.p1,
        army: [
          { id: "army_1", unitDefId: "castle.marksmen", side: "pack" },
          { id: "army_2", unitDefId: "castle.griffins", side: "few" }
        ]
      }
    },
    combat: {
      ...base.combat,
      context: { kind: "sandbox" },
      setup: {
        pendingPlayerIds: ["p1", "p2"],
        placedUnitIds: { p1: [], p2: [] },
        unitLimit: 5
      }
    }
  };
}

const PLACE_ACTIONS: LegalAction[] = [
  {
    action: { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: "army_1", position: 12 },
    label: "Place at front-left"
  },
  {
    action: { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: "army_2", position: 16 },
    label: "Place at back-left"
  },
  {
    action: { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" },
    label: "Ready for battle"
  }
];

describe("PlacementPanel — deploy sidebar", () => {
  it("renders every army unit as a draggable tile and a Ready button", () => {
    const onAction = vi.fn();
    const { container, getByText } = render(
      <PlacementPanel
        legalActions={PLACE_ACTIONS}
        onAction={onAction}
        state={deployState()}
        viewerPlayerId="p1"
      />
    );

    const tiles = container.querySelectorAll(".placementUnit");
    expect(tiles).toHaveLength(2);
    // Both placeable tiles are draggable so they can be dropped on the board.
    for (const tile of Array.from(tiles)) {
      expect(tile.getAttribute("draggable")).toBe("true");
    }

    expect(getByText("Ready for battle")).toBeTruthy();
    expect(container.querySelector(".combatReadyButton")).toBeTruthy();
  });

  it("carries the army unit id on dragstart so the board can place it", () => {
    const onAction = vi.fn();
    const { container } = render(
      <PlacementPanel
        legalActions={PLACE_ACTIONS}
        onAction={onAction}
        state={deployState()}
        viewerPlayerId="p1"
      />
    );

    const tile = container.querySelector(".placementUnit");
    expect(tile).toBeTruthy();

    const setData = vi.fn();
    fireEvent.dragStart(tile as Element, {
      dataTransfer: { setData, setDragImage: vi.fn(), effectAllowed: "" }
    });
    expect(setData).toHaveBeenCalledWith("application/x-h3-army-unit", "army_1");
  });

  it("fires FINISH_COMBAT_PLACEMENT when the Ready button is clicked", () => {
    const onAction = vi.fn<(action: GameAction) => void>();
    const { getByText } = render(
      <PlacementPanel
        legalActions={PLACE_ACTIONS}
        onAction={onAction}
        state={deployState()}
        viewerPlayerId="p1"
      />
    );

    fireEvent.click(getByText("Ready for battle"));
    expect(onAction).toHaveBeenCalledWith({ type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  });
});
