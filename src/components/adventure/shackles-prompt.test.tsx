// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, getMainHero } from "@/engine";
import { startPlayerCombat } from "@/engine/adventure-reducer";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * Real start-of-combat state where the attacker holds Shackles of War and the
 * defender is eligible for a prep window (so Surrender is on the table). The
 * engine opens the attacker's "play Shackles?" decision; the generic PromptTray
 * surfaces it as a dialog with the two options.
 */
function shacklesDecisionState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.players.p2.townTokens = { build: true, population: true, spellBook: true };
  state.players.p2.resources = { gold: 50, buildingMaterials: 20, valuables: 20, magic: 20 } as never;
  state.players.p1.hand = ["artifact.shackles_of_war"];
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
  return state;
}

describe("Shackles of War — start-of-combat decision prompt", () => {
  it("shows the attacker the play/keep decision and dispatches their choice", () => {
    const state = shacklesDecisionState("shackles-ui");
    // Sanity: the engine really opened the decision for the attacker.
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("shackles-of-war");

    const onAction = vi.fn();
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    expect(screen.getByText(/stop the enemy hero surrendering/i)).toBeTruthy();
    const play = screen.getByRole("button", { name: /play shackles of war/i });
    expect(screen.getByRole("button", { name: /keep it/i })).toBeTruthy();

    fireEvent.click(play);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "CHOOSE_OPTION", playerId: "p1", optionIndex: 0 });
  });

  it("renders nothing for the defender while the attacker is deciding", () => {
    const state = shacklesDecisionState("shackles-ui-defender");
    const { container } = render(
      <PromptTray legalActions={getLegalActions(state, "p2")} onAction={vi.fn()} state={state} viewerPlayerId="p2" />
    );
    expect(container.innerHTML).toBe("");
  });
});
