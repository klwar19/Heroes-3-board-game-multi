// @vitest-environment jsdom
/**
 * Population recruit QoL: each recruitable unit shows its card art (click to
 * enlarge) and carries a one-click Recruit/Reinforce shortcut that fires a
 * single-purchase POPULATION_ACTION, with the cost/affordability info kept in
 * view. Each assertion fails if its wiring is removed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { TownRecruitSection } from "./town-sections";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, getLegalActions } from "@/engine";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { ArmyUnitState, GameState } from "@/engine/state";

afterEach(cleanup);

/** A fresh Castle town with the bronze dwelling (unlocks recruit) + Citadel
 *  (unlocks reinforce) built, the Population token in hand and plenty of gold.
 *  The starting army is cleared so the bronze units are RECRUITABLE (a fresh
 *  army already owns them, which would show only reinforce/done rows). */
function recruitReadyState(): GameState {
  const state = createAdventureGameState({ seed: "recruit-shortcut", difficulty: "normal", rollFirstPlayer: false });
  state.players.p1.townTokens = { build: true, population: true, spellBook: true };
  state.players.p1.resources = { ...state.players.p1.resources, gold: 500, buildingMaterials: 200, valuables: 200 };
  state.players.p1.army = [];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
  for (const buildingId of ["castle.dwelling_bronze", "castle.citadel"]) {
    if (!town.buildings.includes(buildingId)) {
      town.buildings.push(buildingId);
    }
  }
  return state;
}

function renderRecruit(state: GameState, onAction = vi.fn()) {
  render(
    <CardZoomProvider>
      <TownRecruitSection
        legalActions={getLegalActions(state, "p1")}
        onAction={onAction}
        state={state}
        viewerPlayerId="p1"
      />
    </CardZoomProvider>
  );
  return { onAction };
}

describe("Population recruit — unit view + one-click shortcut", () => {
  it("shows a unit-art thumbnail for each recruitable unit", () => {
    renderRecruit(recruitReadyState());
    expect(document.querySelectorAll(".recruitThumbImg").length).toBeGreaterThan(0);
  });

  it("a per-row Recruit button fires a single-purchase POPULATION_ACTION", () => {
    const { onAction } = renderRecruit(recruitReadyState());
    const recruitButtons = screen.getAllByRole("button", { name: "Recruit" });
    expect(recruitButtons.length).toBeGreaterThan(0);
    fireEvent.click(recruitButtons[0]);

    const call = onAction.mock.calls.find((c) => c[0]?.type === "POPULATION_ACTION");
    expect(call, "the shortcut should dispatch a POPULATION_ACTION").toBeTruthy();
    expect(call![0].playerId).toBe("p1");
    // The shortcut buys exactly ONE unit (not the whole basket).
    expect(call![0].purchases).toHaveLength(1);
    expect(call![0].purchases[0].kind).toBe("recruit");
  });

  it("a per-row Reinforce shortcut fires a single reinforce POPULATION_ACTION for the owned Few", () => {
    const state = recruitReadyState();
    const faction = coreFactionDefinitions[state.players.p1.factionId!];
    const bronzeUnitId = faction.units.find(
      (id) => coreUnitDefinitions[id]?.tier === "bronze" && Boolean(coreUnitDefinitions[id]?.pack)
    )!;
    const owned: ArmyUnitState = { id: "army_test_1", unitDefId: bronzeUnitId, side: "few" };
    state.players.p1.army = [owned];
    const onAction = vi.fn();
    render(
      <CardZoomProvider>
        <TownRecruitSection
          legalActions={getLegalActions(state, "p1")}
          onAction={onAction}
          state={state}
          viewerPlayerId="p1"
        />
      </CardZoomProvider>
    );
    const reinforceButtons = screen.getAllByRole("button", { name: "Reinforce" });
    expect(reinforceButtons.length).toBeGreaterThan(0);
    fireEvent.click(reinforceButtons[0]);
    const call = onAction.mock.calls.find((c) => c[0]?.type === "POPULATION_ACTION");
    expect(call, "the shortcut should dispatch a reinforce POPULATION_ACTION").toBeTruthy();
    expect(call![0].purchases).toHaveLength(1);
    expect(call![0].purchases[0]).toMatchObject({
      kind: "reinforce",
      unitDefId: bronzeUnitId,
      armyUnitId: "army_test_1"
    });
  });

  it("shows the Polish Stack count/cost and dispatches the exact Stack purchase", () => {
    const state = recruitReadyState();
    state.adventure!.houseRules!["polish-unit-stacks"] = true;
    state.players.p1.army = [{ id: "army_stack_1", unitDefId: "castle.griffins", side: "pack", stacks: 1 }];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings = town.buildings.filter((buildingId) => buildingId !== "castle.dwelling_bronze");
    const { onAction } = renderRecruit(state);

    expect(document.querySelector(".armyStackBadge")?.textContent).toContain("×1");
    expect(document.querySelector(".stackPurchasePanel")).toBeTruthy();
    expect(screen.getByText(/1\/3/)).toBeTruthy();
    expect(screen.getByText(/bronze · max 3/i)).toBeTruthy();

    // Buying a Stack is spent gold: the first click ARMS a confirm step; it must
    // NOT dispatch anything yet.
    fireEvent.click(screen.getByRole("button", { name: /Buy Stack for Griffins/i }));
    expect(onAction).not.toHaveBeenCalled();

    // The confirm step names the unit AND the gold cost.
    const confirmPanel = document.querySelector(".stackPurchaseConfirm") as HTMLElement;
    expect(confirmPanel, "arming shows the confirm panel").toBeTruthy();
    expect(confirmPanel.textContent).toMatch(/Griffins/);
    expect(confirmPanel.textContent).toMatch(/gold/i);

    // Only the explicit Confirm dispatches the exact previous action.
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "castle.griffins", armyUnitId: "army_stack_1" }]
    });
  });

  it("Cancelling an armed Stack purchase dispatches nothing", () => {
    const state = recruitReadyState();
    state.adventure!.houseRules!["polish-unit-stacks"] = true;
    state.players.p1.army = [{ id: "army_stack_1", unitDefId: "castle.griffins", side: "pack", stacks: 1 }];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings = town.buildings.filter((buildingId) => buildingId !== "castle.dwelling_bronze");
    const { onAction } = renderRecruit(state);

    fireEvent.click(screen.getByRole("button", { name: /Buy Stack for Griffins/i }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAction).not.toHaveBeenCalled();
    // Backing out restores the Buy button (nothing staged).
    expect(screen.getByRole("button", { name: /Buy Stack for Griffins/i })).toBeTruthy();
    expect(document.querySelector(".stackPurchaseConfirm")).toBeFalsy();
  });

  it("lists recruited Neutrals with clear Stack UI at army caps (not bank max)", () => {
    const state = recruitReadyState();
    state.adventure!.houseRules!["polish-unit-stacks"] = true;
    state.players.p1.army = [{ id: "army_n1", unitDefId: "neutral.nagas", side: "neutral", stacks: 0 }];
    const { onAction } = renderRecruit(state);

    expect(screen.getByText(/Recruited Neutrals/i)).toBeTruthy();
    expect(screen.getByText(/gold · max 1/i)).toBeTruthy();
    expect(document.querySelector(".neutralBadge")?.textContent).toMatch(/Neutral/i);
    // Same confirm step for a recruited Neutral: arm, then Confirm.
    fireEvent.click(screen.getByRole("button", { name: /Buy Stack for Nagas/i }));
    expect(onAction).not.toHaveBeenCalled();
    const confirmPanel = document.querySelector(".stackPurchaseConfirm") as HTMLElement;
    expect(confirmPanel.textContent).toMatch(/Nagas/);
    expect(confirmPanel.textContent).toMatch(/gold/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "neutral.nagas", armyUnitId: "army_n1" }]
    });
  });

  it("clicking the thumbnail opens the enlarged unit view instead of buying", () => {
    const { onAction } = renderRecruit(recruitReadyState());
    const thumb = document.querySelector(".recruitThumb") as HTMLElement;
    expect(thumb, "a recruit row should render a clickable unit thumbnail").toBeTruthy();
    fireEvent.click(thumb);
    // The zoom overlay opens; the click must NOT queue or fire a purchase.
    expect(document.querySelector(".zoomBackdrop")).toBeTruthy();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("disables the Recruit shortcut (info still shown) when the unit is unaffordable", () => {
    const poor = recruitReadyState();
    poor.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    renderRecruit(poor);
    const recruitButtons = screen.getAllByRole("button", { name: "Recruit" });
    expect(recruitButtons.length).toBeGreaterThan(0);
    expect(recruitButtons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    // The cost/limit info is still on the row (the thumbnail + tier + price stay).
    expect(document.querySelectorAll(".recruitThumbImg").length).toBeGreaterThan(0);
  });
});
