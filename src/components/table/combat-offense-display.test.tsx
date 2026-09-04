// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getPlayerView } from "@/engine";
import type { GameAction, GameState } from "@/engine/state";
import { ReactionTray } from "./overlays";
import { BattlefieldBoard } from "./board";
import { CardZoomProvider } from "./zoom";

afterEach(cleanup);

function ready(offense = true) {
  const state = createInitialGameState("vakin-offense-display");
  state.adventure = createAdventureGameState({ seed: "offense-ui-map", rollFirstPlayer: false }).adventure;
  state.adventure!.astrologers!.activeCardId = offense ? "astrologers.offense" : null;
  state.players.p1.hand = ["stat.defense", "specialty.gelu.1"];
  state.players.p2.hand = [];
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.units.unit_p2_skeletons.maxHealth = 50;
  state.combat!.units.unit_p2_skeletons.abilities = [];
  state.combat!.dice.scriptedRolls = [0, 0, 0];
  return state;
}

function apply(state: GameState, action: GameAction) {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function tray(state: GameState, onAction = vi.fn()) {
  return <CardZoomProvider><ReactionTray state={state} view={getPlayerView(state, "p1")}
    viewerPlayerId="p1" legalActions={getLegalActions(state, "p1")} onAction={onAction} /></CardZoomProvider>;
}

describe("Offense combat display", () => {
  it("labels converted Defense and specialty options as Attack and previews their real result", () => {
    let state = ready();
    state = apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    const onAction = vi.fn();
    render(tray(state, onAction));
    expect(screen.getByRole("note").textContent).toContain("cannot increase Defense");
    fireEvent.click(screen.getByRole("button", { name: "Add Attack (Offense)" }));
    expect(screen.getByText("+1 Attack")).toBeTruthy();
    expect(screen.queryByText("+1 Defense")).toBeNull();
    expect(screen.getByRole("button", { name: /\+1 Attack .*Offense/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play card" }));
    const action = onAction.mock.calls[0][0] as GameAction;
    state = apply(state, action);
    while (state.reactionWindow) state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    const hit = state.eventLog.find(e => e.type === "ATTACK_ROLLED" && !e.isRetaliation);
    expect(hit).toMatchObject({ attackBonus: 1, defenseBonus: 0 });
  });

  it("explains the changed rule on the board even when there is no reaction window", () => {
    const state = ready();
    const board = () => <CardZoomProvider><BattlefieldBoard state={state} viewerPlayerId="p1"
      legalActions={[]} selectedCardAction={null} onAction={vi.fn()} onInspect={vi.fn()} /></CardZoomProvider>;
    const { rerender } = render(board());
    expect(screen.getByText(/Astrologers — Offense/)).toBeTruthy();
    state.adventure!.astrologers!.activeCardId = null;
    rerender(board());
    expect(screen.queryByText(/Astrologers — Offense/)).toBeNull();
  });

  it.each([false, true])("lets the caster add Power to Magic Arrow, with Offense=%s", offense => {
    let state = ready(offense);
    state.players.p1.hand = ["spell.magic_arrow", "stat.power"];
    state = apply(state, { type: "CAST_SPELL", playerId: "p1", cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" } });
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(0);
    const onAction = vi.fn();
    render(tray(state, onAction));
    fireEvent.click(screen.getByRole("button", { name: "Add to play" }));
    expect(screen.getByText("+1 Power")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play card" }));
    state = apply(state, onAction.mock.calls[0][0]);
    while (state.reactionWindow) state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(state.players.p1.discard).toContain("stat.power");
  });
});
