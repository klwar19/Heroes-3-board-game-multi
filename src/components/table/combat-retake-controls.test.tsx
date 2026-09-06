// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createAdventureGameState, createInitialGameState } from "@/engine";
import { CommandDock } from "./board";
afterEach(cleanup);

function ready() {
  const state = createInitialGameState("retake-controls");
  state.adventure = createAdventureGameState({ seed: "retake-controls-map", houseRules: { "combat-retake": true } }).adventure;
  state.combat!.setup = null;
  state.combat!.prep = null;
  state.combat!.context = { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "0,0" };
  state.combatRetakeAvailable = true;
  return state;
}

it("both PvP players can request through the real battle dock; only the opponent can approve", () => {
  const state = ready();
  const onAction = vi.fn();
  const view = render(<CommandDock state={state} viewerPlayerId="p2" legalActions={[]} onAction={onAction} />);
  fireEvent.click(screen.getByRole("button", { name: "Request turn retake" }));
  expect(onAction).toHaveBeenCalledWith({ type: "REQUEST_COMBAT_RETAKE", playerId: "p2" });
  state.combatRetakeVote = { requestedBy: "p2", opponentId: "p1", combatId: state.combat!.id };
  view.rerender(<CommandDock state={state} viewerPlayerId="p2" legalActions={[]} onAction={onAction} />);
  expect(screen.queryByRole("button", { name: "Agree: retake turn" })).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel request" })).toBeTruthy();
  view.rerender(<CommandDock state={state} viewerPlayerId="p1" legalActions={[]} onAction={onAction} />);
  fireEvent.click(screen.getByRole("button", { name: "Agree: retake turn" }));
  expect(onAction).toHaveBeenCalledWith({ type: "ANSWER_COMBAT_RETAKE", playerId: "p1", agree: true });
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(onAction).toHaveBeenCalledWith({ type: "ANSWER_COMBAT_RETAKE", playerId: "p1", agree: false });
});

it("disables the request when the server has no saved activation", () => {
  const state = ready();
  state.combatRetakeAvailable = false;
  const onAction = vi.fn();
  render(<CommandDock state={state} viewerPlayerId="p1" legalActions={[]} onAction={onAction} />);
  const button = screen.getByRole("button", { name: "Request turn retake" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(onAction).not.toHaveBeenCalled();
});

it("never shows retake for neutral combat, spectators, disabled rules or map play", () => {
  const state = ready();
  const onAction = vi.fn();
  const view = render(<CommandDock state={state} viewerPlayerId="observer" legalActions={[]} onAction={onAction} />);
  expect(screen.queryByRole("button", { name: "Request turn retake" })).toBeNull();
  state.combat!.context = { kind: "neutral", heroId: "hero_p1", fieldId: "0,0", difficulty: 7, hasAzure: true };
  view.rerender(<CommandDock state={state} viewerPlayerId="p1" legalActions={[]} onAction={onAction} />);
  expect(screen.queryByRole("button", { name: "Request turn retake" })).toBeNull();
  const off = ready(); off.adventure!.houseRules!["combat-retake"] = false;
  view.rerender(<CommandDock state={off} viewerPlayerId="p1" legalActions={[]} onAction={onAction} />);
  expect(screen.queryByRole("button", { name: "Request turn retake" })).toBeNull();
  const map = ready(); map.combat = null;
  view.rerender(<CommandDock state={map} viewerPlayerId="p1" legalActions={[]} onAction={onAction} />);
  expect(screen.queryByRole("button", { name: "Request turn retake" })).toBeNull();
});
