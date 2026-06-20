// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CommandDock } from "./board";
import { createInitialGameState, type GameState, type LegalAction } from "@/engine";

afterEach(cleanup);

/**
 * A PvP combat past the pre-battle prep window (no prep panel). The board command
 * dock is the escape UI here, and per the house rule it shows ONLY Retreat —
 * never Surrender (a before-battle, prep-only option). Both the no-casualties
 * RETREAT_FROM_COMBAT and the in-fight GIVE_UP_COMBAT concede are surfaced as a
 * "Retreat" button.
 */
function pvpCombatState(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: "0,0"
  };
  state.combat!.prep = null;
  state.combat!.outcome = null;
  state.combat!.setup = null;
  state.phase = "combat";
  return state;
}

describe("CommandDock — in-combat escape is Retreat only (Surrender is prep-only)", () => {
  it("renders Retreat but NOT Surrender, even if a stray Surrender action is present", () => {
    const state = pvpCombatState("dock-retreat-only");
    // SURRENDER_COMBAT is deliberately NOT a command-bar action; the dock must
    // never render it (Surrender belongs to the defender's prep panel only).
    const actions: LegalAction[] = [
      { label: "Retreat (lose the combat: pay 5 gold, -1 morale, fall back home)", action: { type: "RETREAT_FROM_COMBAT", playerId: "p1" } },
      { label: "Surrender (pay 10 gold, keep your whole army, return home)", action: { type: "SURRENDER_COMBAT", playerId: "p1" } }
    ];
    render(<CommandDock legalActions={actions} onAction={vi.fn()} onReset={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.getByRole("button", { name: /retreat/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /surrender/i })).toBeNull();
  });

  it("shows the in-fight concede as a 'Retreat' button and dispatches GIVE_UP_COMBAT", () => {
    const state = pvpCombatState("dock-concede");
    const onAction = vi.fn();
    const actions: LegalAction[] = [
      {
        label: "Retreat (lose the combat — your fallen so far stay lost, survivors fall back home)",
        action: { type: "GIVE_UP_COMBAT", playerId: "p1" }
      }
    ];
    render(<CommandDock legalActions={actions} onAction={onAction} onReset={vi.fn()} state={state} viewerPlayerId="p1" />);
    const retreat = screen.getByRole("button", { name: /retreat/i });
    expect(screen.queryByRole("button", { name: /give up/i })).toBeNull();
    fireEvent.click(retreat);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "GIVE_UP_COMBAT", playerId: "p1" });
  });
});
