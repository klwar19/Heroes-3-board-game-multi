// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlacementPanel, PreBattlePanel } from "./screen";
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

  it("shows a Retreat button during PvP deployment and fires RETREAT_FROM_COMBAT", () => {
    // A PvP hero may Retreat while still placing units (before any fighting).
    const pvpDeploy = (() => {
      const base = deployState();
      return {
        ...base,
        combat: {
          ...base.combat!,
          context: { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "0,0" }
        }
      } as GameState;
    })();
    const actions: LegalAction[] = [
      ...PLACE_ACTIONS,
      { action: { type: "RETREAT_FROM_COMBAT", playerId: "p1" }, label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)" }
    ];
    const onAction = vi.fn<(action: GameAction) => void>();
    const { getByText } = render(
      <PlacementPanel legalActions={actions} onAction={onAction} state={pvpDeploy} viewerPlayerId="p1" />
    );

    const retreat = getByText(/^Retreat/);
    fireEvent.click(retreat);
    expect(onAction).toHaveBeenCalledWith({ type: "RETREAT_FROM_COMBAT", playerId: "p1" });
  });
});

describe("PreBattlePanel — PvP pre-battle preparation (on the map)", () => {
  function prepState(accepted: ("p1" | "p2")[] = []): GameState {
    const base = deployState();
    return {
      ...base,
      combat: {
        ...base.combat!,
        attackerPlayerId: "p1",
        defenderPlayerId: "p2",
        context: { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "0,0" },
        prep: { accepted }
      }
    } as GameState;
  }

  // The escape + Accept legal actions the engine offers a preparing defender.
  const DEFENDER_ACTIONS: LegalAction[] = [
    { action: { type: "RETREAT_FROM_COMBAT", playerId: "p2" }, label: "Retreat (lose the combat)" },
    { action: { type: "ACCEPT_COMBAT", playerId: "p2" }, label: "Accept the battle" }
  ];

  it("offers the preparing defender an Accept button (fires ACCEPT_COMBAT)", () => {
    const onAction = vi.fn<(action: GameAction) => void>();
    const { getByText } = render(
      <PreBattlePanel legalActions={DEFENDER_ACTIONS} onAction={onAction} state={prepState()} viewerPlayerId="p2" />
    );

    expect(getByText("Retreat (lose the combat)")).toBeTruthy();
    fireEvent.click(getByText("Accept the battle"));
    expect(onAction).toHaveBeenCalledWith({ type: "ACCEPT_COMBAT", playerId: "p2" });
  });

  it("offers the ATTACKER an Accept button too (both sides prepare)", () => {
    const onAction = vi.fn<(action: GameAction) => void>();
    const attackerActions: LegalAction[] = [{ action: { type: "ACCEPT_COMBAT", playerId: "p1" }, label: "Accept" }];
    const { getByText } = render(
      <PreBattlePanel legalActions={attackerActions} onAction={onAction} state={prepState()} viewerPlayerId="p1" />
    );

    fireEvent.click(getByText("Accept the battle"));
    expect(onAction).toHaveBeenCalledWith({ type: "ACCEPT_COMBAT", playerId: "p1" });
  });

  it("shows a waiting message once the viewer has accepted (no Accept button)", () => {
    const onAction = vi.fn();
    const { queryByText, getByText } = render(
      <PreBattlePanel legalActions={[]} onAction={onAction} state={prepState(["p2"])} viewerPlayerId="p2" />
    );

    // The accepted defender can no longer accept; they wait on the attacker.
    expect(queryByText("Accept the battle")).toBeNull();
    expect(getByText(/Waiting for .* to accept the battle/i)).toBeTruthy();
  });

  it("renders nothing outside an open prep window", () => {
    const onAction = vi.fn();
    const noPrep = deployState(); // sandbox combat, no prep
    const { container } = render(
      <PreBattlePanel legalActions={[]} onAction={onAction} state={noPrep} viewerPlayerId="p2" />
    );
    expect(container.querySelector(".preBattlePanel")).toBeNull();
  });
});
