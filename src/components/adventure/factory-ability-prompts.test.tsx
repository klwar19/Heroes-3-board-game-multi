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

/** Bring `nextId` up as the active unit by defending a starter, so its
 *  "[activation]" choice (Couatl invuln / Automaton cube) opens. */
function driveActivation(state: GameState, starterId: string, nextId: string): GameState {
  const units = state.combat!.units;
  for (const unit of Object.values(units)) {
    unit.activatedThisRound = unit.id !== starterId && unit.id !== nextId;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
  }
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = starterId;
  return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: starterId });
}

describe("Factory Couatl invulnerability — a clean yes/no prompt", () => {
  it("offers Activate + Skip buttons (never a 'click your own unit' hunt)", () => {
    const state = createInitialGameState("factory-couatl-prompt");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    Object.assign(state.combat!.units.unit_p1_marksmen, {
      name: "Couatls",
      cardName: "Couatls",
      type: "flying",
      variant: "few",
      abilities: ["couatl-invulnerability-few"],
      initiative: 20
    });
    const opened = driveActivation(state, "unit_p1_griffins", "unit_p1_marksmen");
    expect(opened.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && opened.pendingChoice.kind).toBe(
      "couatl-invulnerability"
    );
    const legal = getLegalActions(opened, "p1");
    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={opened} viewerPlayerId="p1" />);

    expect(screen.getByRole("button", { name: /activate ethereal coil/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /don't activate/i })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("clicking Activate sends CHOOSE_ABILITY_TARGET at the Couatl itself", () => {
    const state = createInitialGameState("factory-couatl-click");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    Object.assign(state.combat!.units.unit_p1_marksmen, {
      name: "Couatls",
      type: "flying",
      variant: "pack",
      abilities: ["couatl-invulnerability-pack"],
      initiative: 20
    });
    const opened = driveActivation(state, "unit_p1_griffins", "unit_p1_marksmen");
    const legal = getLegalActions(opened, "p1");
    const onAction = vi.fn();
    render(<PromptTray legalActions={legal} onAction={onAction} state={opened} viewerPlayerId="p1" />);
    screen.getByRole("button", { name: /activate ethereal coil/i }).click();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CHOOSE_ABILITY_TARGET", targetUnitId: "unit_p1_marksmen" })
    );
  });
});

describe("Factory Automaton cube-place — a clean yes/no prompt", () => {
  it("offers 'Place a faction cube' + Skip buttons", () => {
    const state = createInitialGameState("factory-automaton-prompt");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    Object.assign(state.combat!.units.unit_p1_marksmen, {
      name: "Automatons",
      cardName: "Automatons",
      type: "ground",
      variant: "few",
      abilities: ["automaton-place-cube", "automaton-detonate-cubes"],
      initiative: 20
    });
    const opened = driveActivation(state, "unit_p1_griffins", "unit_p1_marksmen");
    expect(opened.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && opened.pendingChoice.kind).toBe("automaton-cube");
    const legal = getLegalActions(opened, "p1");
    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={opened} viewerPlayerId="p1" />);

    expect(screen.getByRole("button", { name: /place a faction cube/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /don't place a cube/i })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

describe("Factory Dreadnought splash — mode choice + a board-click allocation", () => {
  /** A Dreadnought (pos 5) active, with an adjacent enemy (pos 1). */
  function dreadnoughtActive(moved: boolean): GameState {
    const state = createInitialGameState("factory-dread-prompt");
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    Object.assign(state.combat!.units.unit_p1_griffins, {
      name: "Dreadnoughts",
      cardName: "Dreadnoughts",
      type: "ground",
      unitDefId: "factory.dreadnoughts",
      variant: "pack",
      attack: 5,
      position: 5,
      abilities: ["dreadnought-splash-2"],
      movedThisActivation: moved,
      attackedThisActivation: false,
      activatedThisRound: false
    });
    Object.assign(state.combat!.units.unit_p2_skeletons, { defense: 0, maxHealth: 20, damage: 0, position: 1 });
    for (const id of ["unit_p1_crusaders", "unit_p1_marksmen", "unit_p2_vampires", "unit_p2_dread_knights"]) {
      state.combat!.units[id].position = 19;
    }
    state.combat!.units.unit_p2_dread_knights.position = 18;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    return state;
  }

  it("offers the splash as an 'other action' (mode of attack) alongside the normal attack", () => {
    const state = dreadnoughtActive(false);
    const legal = getLegalActions(state, "p1");
    const splash = legal.find(
      (l) => l.action.type === "USE_UNIT_ABILITY" && l.action.abilityId === "dreadnought-splash-2"
    );
    const normalAttack = legal.find((l) => l.action.type === "ATTACK_UNIT" && l.action.defenderId === "unit_p2_skeletons");
    expect(splash, "the splash mode is offered").toBeDefined();
    expect(normalAttack, "the normal attack is ALSO offered — the player chooses the mode").toBeDefined();
  });

  it("stays offered AFTER a move (a slow Juggernaut can advance, then splash)", () => {
    const state = dreadnoughtActive(true /* movedThisActivation */);
    const legal = getLegalActions(state, "p1");
    const splash = legal.find(
      (l) => l.action.type === "USE_UNIT_ABILITY" && l.action.abilityId === "dreadnought-splash-2"
    );
    expect(splash, "move-then-splash is legal").toBeDefined();
    // And the engine accepts it after the move.
    const resolved = applyOk(state, splash!.action);
    expect(resolved.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && resolved.pendingChoice.kind).toBe(
      "dreadnought-splash"
    );
  });

  it("the allocation prompt is a board-click flow with a Stop button (not a wall of buttons)", () => {
    let state = dreadnoughtActive(false);
    const splash = getLegalActions(state, "p1").find(
      (l) => l.action.type === "USE_UNIT_ABILITY" && l.action.abilityId === "dreadnought-splash-2"
    )!;
    state = applyOk(state, splash.action);
    expect(state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && state.pendingChoice.kind).toBe("dreadnought-splash");
    const legal = getLegalActions(state, "p1");
    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);

    expect(screen.getByText(/click a glowing adjacent unit/i)).toBeTruthy();
    // Only the Stop button in the tray (targets are clicked on the board).
    expect(screen.getByRole("button", { name: /stop/i })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
