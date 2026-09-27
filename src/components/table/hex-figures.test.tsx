// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState, type GameState } from "@/engine";
import { makeActiveEffect } from "@/engine/active-effects";
import { hexPosition } from "@/engine/battlefield";
import { HexUnitsLayer, hexWarMachineStands } from "./hex-figures";
import { HEX_BOARD_HEIGHT, HEX_BOARD_WIDTH, HEX_UNIT_CUE_EVENT, hexCellCenter, type HexUnitCueDetail } from "./hex-battlefield";

/**
 * Hex Battlefield figure layer: where war machines stand and how a walking
 * figure stacks against the rows in front of it. Real engine state, real
 * sprite atlases; jsdom lacks ResizeObserver / Image.decode (stubbed) and the
 * shared animation clock runs on fake rAF time.
 */

const cell = (column: number, row: number): number => {
  const position = hexPosition(column, row);
  if (position === null) throw new Error(`off board ${column},${row}`);
  return position;
};

/** The starting fight, moved onto the hex board (armies at their edges). */
function hexFight(): GameState {
  const state = createInitialGameState("hex-figures");
  const combat = state.combat!;
  combat.geometry = "hex";
  const spots: Record<string, number> = {
    unit_p1_marksmen: cell(0, 4),
    unit_p1_griffins: cell(1, 6),
    unit_p1_crusaders: cell(2, 2),
    unit_p2_skeletons: cell(12, 4),
    unit_p2_vampires: cell(11, 6),
    unit_p2_dread_knights: cell(11, 8)
  };
  for (const [id, position] of Object.entries(spots)) combat.units[id].position = position;
  return state;
}

function layer(state: GameState, flipped = false) {
  const combat = state.combat!;
  const units = Object.values(combat.units).filter((unit) => unit.damage < unit.maxHealth && unit.position >= 0);
  return (
    <HexUnitsLayer
      combat={combat}
      flipped={flipped}
      healthOf={(unit) => unit.maxHealth - unit.damage}
      state={state}
      statDeltasOf={() => ({ attack: 0, defense: 0, initiative: 0 })}
      units={units}
    />
  );
}

/** A figure's foot point in board units, read off its percentage placement. */
function footOf(element: Element | null): { x: number; y: number } {
  const style = (element as HTMLElement).style;
  return { x: (parseFloat(style.left) / 100) * HEX_BOARD_WIDTH, y: (parseFloat(style.top) / 100) * HEX_BOARD_HEIGHT };
}

const machine = (container: HTMLElement, playerId: string, cardId: string) =>
  container.querySelector(`[data-hex-war-machine][data-fx-anchor="war-machine:${playerId}:${cardId}"]`);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"]
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  if (!("decode" in HTMLImageElement.prototype)) {
    Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: () => Promise.resolve() });
  }
});

afterEach(() => {
  cleanup();
  // Let the shared clock see its disposed figures and stop before real timers return.
  vi.advanceTimersByTime(100);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("hex war machines", () => {
  it("stand one hex outside each army's edge column on the board's own grid, both sides alike", () => {
    const state = hexFight();
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.permanents = ["war_machine.ballista"];
    const { container } = render(layer(state));
    // The Ballista's PC row 3 is board row 2; a two-hex machine's feet stand
    // between its head hex and the tail hex behind it (half a hex further out).
    const firstHex = hexCellCenter(cell(0, 2), false);
    const lastHex = hexCellCenter(cell(12, 2), false);
    const attacker = footOf(machine(container, "p1", "war_machine.ballista"));
    const defender = footOf(machine(container, "p2", "war_machine.ballista"));
    expect(attacker.x + 22).toBeCloseTo(firstHex.x - 44, 5);
    expect(defender.x - 22).toBeCloseTo(lastHex.x + 44, 5);
    // Same row as the board's row 2 creatures' feet (15 px under the hex centre).
    expect(attacker.y).toBeCloseTo(firstHex.y + 15, 5);
    expect(defender.y).toBeCloseTo(lastHex.y + 15, 5);
    // The mirrored seat mirrors the whole field.
    cleanup();
    const flipped = render(layer(state, true)).container;
    expect(footOf(machine(flipped, "p1", "war_machine.ballista")).x).toBeCloseTo(HEX_BOARD_WIDTH - attacker.x, 5);
  });

  it("field every machine in play, but only the Tinkerer's active one — and a Ballista per granted extra Ballista", () => {
    const state = hexFight();
    state.players.p1.permanents = ["war_machine.ballista", "war_machine.cannon"];
    // CONTROL: without the Factory Tinkerer both machines take the field.
    expect(hexWarMachineStands(state, "p1", "war_machine.ballista")).toBe(true);
    expect(hexWarMachineStands(state, "p1", "war_machine.cannon")).toBe(true);
    state.players.p1.commander = {
      slug: "factory",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, speed: 0, magic: 0 }
    };
    state.players.p1.activeWarMachineCardId = "war_machine.cannon";
    expect(hexWarMachineStands(state, "p1", "war_machine.cannon")).toBe(true);
    expect(hexWarMachineStands(state, "p1", "war_machine.ballista"), "the reserve machine stays off the field").toBe(false);
    const { container } = render(layer(state));
    expect(machine(container, "p1", "war_machine.cannon")).toBeTruthy();
    expect(machine(container, "p1", "war_machine.ballista")).toBeNull();
    cleanup();
    // A granted Ballista (Torosar's) stands and shoots as a real machine.
    state.activeEffects.push(
      makeActiveEffect(
        state,
        { name: "Ballista", scope: "player", duration: { type: "combat" }, polarity: "positive", removable: false, modifiers: [{ type: "EXTRA_BALLISTA" }] },
        { type: "card", cardId: "specialty.torosar.1", controllerId: "p1" },
        "p1"
      )
    );
    expect(hexWarMachineStands(state, "p1", "war_machine.ballista")).toBe(true);
    const granted = render(layer(state)).container;
    expect(granted.querySelectorAll('[data-hex-war-machine][data-fx-anchor="war-machine:p1:war_machine.ballista"]')).toHaveLength(1);
  });
});

describe("hex figure walk", () => {
  it("keeps its row's stacking order while walking (the row in front still draws over it)", async () => {
    const state = hexFight();
    const walkerId = "unit_p1_crusaders";
    const { container, rerender } = render(layer(state));
    const figure = container.querySelector<HTMLElement>(`[data-hex-unit="${walkerId}"]`)!;
    expect(figure.style.zIndex).toBe("12");
    // The engine has moved the Crusaders three hexes along row 2 (C3 -> C6).
    const moved = structuredClone(state);
    moved.combat!.units[walkerId].position = cell(5, 2);
    rerender(layer(moved));
    let done = false;
    const detail: HexUnitCueDetail = {
      cue: { kind: "move", from: `cell:${cell(2, 2)}`, toPosition: cell(5, 2), path: [cell(3, 2), cell(4, 2), cell(5, 2)] },
      done: () => {
        done = true;
      }
    };
    act(() => {
      figure.dispatchEvent(new CustomEvent(HEX_UNIT_CUE_EVENT, { detail }));
    });
    expect(detail.accepted).toBe(true);
    const shown = new Set<string>();
    const translated = new Set<string>();
    for (let step = 0; step < 400 && !done; step += 1) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      shown.add(figure.style.zIndex);
      translated.add(figure.style.translate);
    }
    expect(done, "the walk finished").toBe(true);
    expect(translated.size, "the figure really walked").toBeGreaterThan(5);
    // Row 2 figures stack at z 12; the row in front (row 3) at 13.
    expect([...shown]).toEqual(["12"]);
  });
});
