// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { applyAction, createInitialGameState, getLegalActions } from "@/engine";
import type { GameAction, GameState } from "@/engine";

afterEach(cleanup);

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * Drives a real combat to the Jotunn Warlord's start-of-activation Teleport
 * choice: the stand-in Warlord (Marksmen) activates with a friendly Crusaders as
 * the only candidate. Returns the state the instant the "pick a unit" choice
 * (kind "jotunn-teleport") is on the table.
 */
function jotunnTeleportChoice(): GameState {
  const state = createInitialGameState("teleport-prompt-ui");
  state.combat!.obstacles = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const units = state.combat!.units;
  units.unit_p1_marksmen.position = 0; // the stand-in Jotunn Warlord
  units.unit_p1_marksmen.abilities = ["bulwark-jotunn-teleport"];
  units.unit_p1_marksmen.initiative = 20;
  units.unit_p1_griffins.position = 1; // ally that defends to advance the slot
  units.unit_p1_crusaders.position = 2; // the friendly teleport candidate
  units.unit_p2_skeletons.position = 16; // an enemy (must NEVER be offered)
  for (const unit of Object.values(units)) {
    unit.activatedThisRound = true;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
  }
  units.unit_p1_marksmen.activatedThisRound = false;
  units.unit_p1_griffins.activatedThisRound = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
}

describe("Teleport prompt — a clean two-click board flow, not a wall of buttons", () => {
  it("the Jotunn unit pick shows a board-click instruction + Skip only, never a button per unit", () => {
    const state = jotunnTeleportChoice();
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    const legal = getLegalActions(state, "p1");

    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // The board-click instruction is shown…
    expect(screen.getByText(/click one of your units on the battlefield/i)).toBeTruthy();
    // …and the optional Skip is still a button…
    expect(screen.getByRole("button", { name: /don't teleport/i })).toBeTruthy();
    // …but the candidate unit is NOT listed as a button (you click it on the
    // board instead). Exactly one button in the tray: the Skip.
    expect(screen.queryByRole("button", { name: /teleport.*crusaders/i })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("the destination pick shows a board-click instruction, never a button per empty cell", () => {
    let state = jotunnTeleportChoice();
    // Pick the friendly unit → the empty-space (combat-teleport) picker opens.
    const pick = state.pendingChoice!;
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: pick.id,
      targetUnitId: "unit_p1_crusaders"
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "combat-teleport").toBe(
      true
    );
    const legal = getLegalActions(state, "p1");
    // Sanity: the engine really does offer one CHOOSE_OPTION per empty cell.
    expect(legal.filter((l) => l.action.type === "CHOOSE_OPTION").length).toBeGreaterThan(1);

    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    // The instruction names the unit being moved and asks for a board click…
    expect(screen.getByText(/click an empty slot on the battlefield/i)).toBeTruthy();
    // …and NONE of the per-cell "Teleport to …" buttons clutter the tray.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
