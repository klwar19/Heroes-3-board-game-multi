// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "@/engine";
import { MoraleOverflowPrompt } from "./morale-overflow-prompt";

afterEach(cleanup);

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("MoraleOverflowPrompt interaction ownership", () => {
  it("stays hidden while View Air's exclusive Power choice owns the legal actions", () => {
    let state = createAdventureGameState({
      seed: "morale-overflow-view-air",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state.players.p1.hand = ["spell.view_air", "spell.haste"];
    state.players.p1.morale = 1;
    state.players.p1.moraleOverflow = 1;
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("map-spell-boost");
    const mapSpellChoice = getLegalActions(state, "p1");
    expect(mapSpellChoice.every((legal) => legal.action.type === "CHOOSE_OPTION")).toBe(true);

    render(
      <MoraleOverflowPrompt
        count={1}
        legalActions={mapSpellChoice}
        onDraw={vi.fn()}
        onRedraw={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog", { name: "Spend extra morale" })).toBeNull();
  });

  it("reappears with only the morale spends the engine currently accepts", () => {
    const draw = {
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "draw"
    } as const;
    const onDraw = vi.fn();

    render(
      <MoraleOverflowPrompt
        count={1}
        legalActions={[{ label: "Spend morale: draw a card", action: draw }]}
        onDraw={onDraw}
        onRedraw={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Draw a card" }));
    expect(onDraw).toHaveBeenCalledWith(draw);
    expect(screen.queryByRole("button", { name: "Discard & draw" })).toBeNull();
  });
});
