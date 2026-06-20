// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandDock } from "./board";
import { createInitialGameState, type GameState, type LegalAction } from "@/engine";

afterEach(cleanup);

/**
 * A PvP combat sitting in the post-deployment escape window (no defenderPrep
 * panel — the attacker never gets one). The engine offers RETREAT_FROM_COMBAT
 * and SURRENDER_COMBAT here; the dock must render a button for BOTH. Surrender
 * used to be missing from COMMAND_ACTION_TYPES, so the attacker could not
 * surrender at all from the board.
 */
function pvpEscapeState(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: "0,0"
  };
  state.combat!.defenderPrep = null;
  state.combat!.outcome = null;
  state.combat!.setup = null;
  state.phase = "combat";
  return state;
}

const escapeActions: LegalAction[] = [
  { label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)", action: { type: "RETREAT_FROM_COMBAT", playerId: "p1" } },
  { label: "Surrender (pay 10 gold, keep your whole army, return home)", action: { type: "SURRENDER_COMBAT", playerId: "p1" } }
];

describe("CommandDock — start-of-combat escape buttons", () => {
  it("renders BOTH a Retreat and a Surrender button in the escape window", () => {
    const state = pvpEscapeState("dock-surrender");
    render(
      <CommandDock legalActions={escapeActions} onAction={vi.fn()} onReset={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(screen.getByRole("button", { name: /retreat/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /surrender/i })).toBeTruthy();
  });

  it("dispatches SURRENDER_COMBAT when the Surrender button is clicked", () => {
    const state = pvpEscapeState("dock-surrender-click");
    const onAction = vi.fn();
    render(
      <CommandDock legalActions={escapeActions} onAction={onAction} onReset={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    fireEvent.click(screen.getByRole("button", { name: /surrender/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "SURRENDER_COMBAT", playerId: "p1" });
  });
});
