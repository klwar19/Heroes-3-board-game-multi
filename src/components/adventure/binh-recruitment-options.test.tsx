// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TownRecruitSection } from "./town-sections";
import { applyAction, createAdventureGameState, getLegalActions } from "@/engine";
import type { GameAction, GameState } from "@/engine/state";

afterEach(cleanup);

function ready(): GameState {
  let state = createAdventureGameState({ seed: "binh-recruit-ui", rollFirstPlayer: false, events: false,
    houseRules: { "duplicate-unit-recruitment": true, "settlement-foreign-recruitment": true } });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    const result = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(result.errors).toEqual([]);
    state = result.state;
  }
  state.players.p1.army = [];
  state.players.p1.resources = { gold: 1000, buildingMaterials: 1000, valuables: 1000 };
  Object.values(state.towns).find((town) => town.controllerId === "p1")!.buildings = ["castle.dwelling_bronze", "castle.citadel"];
  return state;
}

function section(state: GameState, onAction: (action: GameAction) => void) {
  return <TownRecruitSection state={state} viewerPlayerId="p1" onAction={onAction} legalActions={getLegalActions(state, "p1")} />;
}

// Optional artifact consumed by the real-browser layout suite. Vite handles
// the game's JSON/assets imports, which Playwright's Node loader cannot load.
afterAll(async () => {
  const output = process.env.BINH_RECRUIT_LAYOUT_OUTPUT;
  if (!output) return;
  const state = ready();
  state.players.p1.army = Array.from({ length: 5 }, (_, i) => ({ id: `dragon-${i}`, unitDefId: "dungeon.black_dragons", side: i === 0 ? "pack" : "few" }));
  state.adventure!.fields.foreign = { spaceId: "foreign", tileInstanceId: "test", slot: 0, location: "settlement",
    blackCube: false, flagOwnerId: "p1", everFlagged: true, settlementResource: "gold", settlementRecruitFactionId: "dungeon" };
  render(section(state, () => {}));
  await writeFile(output, document.body.innerHTML);
  cleanup();
});

describe("BINH recruitment controls", () => {
  it("buys copies through the reducer, targets each upgrade by slot, and preserves the recruit row after deaths", () => {
    let state = ready();
    const onAction = vi.fn((action: GameAction) => {
      const result = applyAction(state, action);
      expect(result.errors.map((error) => error.message)).toEqual([]);
      state = result.state;
      view.rerender(section(state, onAction));
    });
    const view = render(section(state, onAction));
    fireEvent.click(screen.getByRole("button", { name: "Recruit: Marksmen" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy same unit: Marksmen" }));
    const [first, second] = state.players.p1.army;
    expect(first.id).not.toBe(second.id);
    fireEvent.click(screen.getByRole("button", { name: "Reinforce Marksmen · Copy 2" }));
    expect(state.players.p1.army.map((unit) => unit.side)).toEqual(["few", "pack"]);
    expect(onAction).toHaveBeenLastCalledWith({ type: "POPULATION_ACTION", playerId: "p1", purchases: [
      { kind: "reinforce", unitDefId: "castle.marksmen", armyUnitId: second.id },
    ] });
    fireEvent.click(screen.getByRole("checkbox", { name: "Reinforce Marksmen · Copy 1 to a pack" }));
    expect(screen.getByRole("button", { name: "Buy 1" })).toBeTruthy();
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.id !== first.id);
    view.rerender(section(state, onAction));
    expect(screen.queryByRole("button", { name: "Buy 1" })).toBeNull();
    expect(document.querySelector(`[data-army-unit-id="${first.id}"]`)).toBeNull();
    expect(document.querySelector(`[data-army-unit-id="${second.id}"]`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Buy same unit: Marksmen" })).not.toBeDisabled();
    state.players.p1.army = [];
    view.rerender(section(state, onAction));
    fireEvent.click(screen.getByRole("button", { name: "Recruit: Marksmen" }));
    expect(document.querySelectorAll("[data-army-unit-id]")).toHaveLength(1);
  });

  it("shows the foreign town, gold-unit costs and working recruitment without gold dwellings", () => {
    let state = ready();
    state.adventure!.fields.foreign = {
      spaceId: "foreign", tileInstanceId: "test", slot: 0, location: "settlement",
      blackCube: false, flagOwnerId: "p1", everFlagged: true, settlementResource: "gold", settlementRecruitFactionId: "dungeon",
    };
    const onAction = vi.fn((action: GameAction) => {
      const result = applyAction(state, action);
      expect(result.errors).toEqual([]);
      state = result.state;
    });
    render(section(state, onAction));
    expect(document.querySelector(".settlementRecruitSources")?.textContent).toContain("Dungeon");
    const button = screen.getByRole("button", { name: "Recruit: Black Dragons" });
    expect(button).not.toBeDisabled();
    expect(within(button.closest(".recruitRow") as HTMLElement).getByLabelText(/^Recruit cost for Black Dragons:/)).toBeTruthy();
    fireEvent.click(button);
    expect(state.players.p1.army[0]).toMatchObject({ unitDefId: "dungeon.black_dragons", side: "few" });
  });

  it("keeps copy controls visible but disabled when the player cannot afford them", () => {
    const state = ready();
    state.players.p1.army = [{ id: "owned", unitDefId: "castle.marksmen", side: "few" }];
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    render(section(state, vi.fn()));
    expect(screen.getByRole("button", { name: "Buy same unit: Marksmen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reinforce Marksmen · Copy 1" })).toBeDisabled();
  });
});
