// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, createInitialGameState, getLegalActions } from "@/engine";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * A round-1 PvP combat sitting in the start-of-combat escape window: deployment
 * is done (no setup), no unit has acted yet, so RETREAT_FROM_COMBAT is offered
 * to both heroes. This is the exact state that used to make the generic
 * "The combat round is over" prompt pop up during every PvP battle — it must
 * NOT, because that prompt is only for the neutral between-rounds gate.
 */
function pvpEscapeWindow(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.combat = createInitialGameState(seed).combat;
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
  };
  state.combat!.setup = null;
  state.combat!.awaitingContinue = false;
  state.combat!.round = 1;
  state.phase = "combat";
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const unit of Object.values(state.combat!.units)) {
    unit.activatedThisRound = false;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
  }
  return state;
}

/**
 * A neutral combat paused between rounds: the attacking hero must spend 1 MP to
 * fight on or retreat (CombatState.awaitingContinue). This IS the "combat round
 * is over" gate and the prompt must show.
 */
function neutralRoundOver(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.combat = createInitialGameState(seed).combat;
  state.combat!.context = {
    kind: "neutral",
    heroId: "hero_p1",
    fieldId: state.heroes.hero_p1.spaceId ?? "0,0",
    difficulty: 1,
    hasAzure: false
  };
  state.combat!.setup = null;
  state.combat!.awaitingContinue = true;
  state.heroes.hero_p1.movementPoints = 2;
  state.phase = "combat";
  state.activePlayerId = "p1";
  return state;
}

describe("The 'combat round is over' prompt", () => {
  it("does NOT pop up in the PvP start-of-combat escape window (RETREAT offered, but no neutral gate)", () => {
    const state = pvpEscapeWindow("pvp-no-prompt");
    const legal = getLegalActions(state, "p1");
    // Sanity: the buggy trigger really is present — Retreat is a legal action here.
    expect(legal.some((l) => l.action.type === "RETREAT_FROM_COMBAT")).toBe(true);

    const { container } = render(
      <PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/combat round is over/i)).toBeNull();
  });

  it("DOES pop up in the neutral between-rounds gate (the legitimate use)", () => {
    const state = neutralRoundOver("neutral-prompt");
    const legal = getLegalActions(state, "p1");
    expect(legal.some((l) => l.action.type === "CONTINUE_NEUTRAL_COMBAT")).toBe(true);
    expect(legal.some((l) => l.action.type === "RETREAT_FROM_COMBAT")).toBe(true);

    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.getByText(/combat round is over/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /fight another combat round/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /retreat/i })).toBeTruthy();
  });

  it("surfaces a +Movement top-up button when the out-of-move hero holds one", () => {
    const state = neutralRoundOver("neutral-move-topup");
    // Out of movement: the plain "spend 1 MP" continue is impossible, but a
    // held +Movement card (Boots of Speed) can be spent to buy another round.
    state.heroes.hero_p1.movementPoints = 0;
    state.players.p1.hand = ["artifact.boots_of_speed"];
    const legal = getLegalActions(state, "p1");
    expect(legal.some((l) => l.action.type === "CONTINUE_NEUTRAL_COMBAT")).toBe(false);
    expect(
      legal.some((l) => l.action.type === "PLAY_CARD" && l.action.cardId === "artifact.boots_of_speed")
    ).toBe(true);

    render(<PromptTray legalActions={legal} onAction={vi.fn()} state={state} viewerPlayerId="p1" />);
    expect(screen.getByText(/combat round is over/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /gain movement to fight another combat round/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /retreat/i })).toBeTruthy();
  });
});
