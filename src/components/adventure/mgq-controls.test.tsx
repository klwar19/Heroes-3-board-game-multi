// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PromptTray } from "./screen";
import { BuildingDetailPanel, TownRecruitSection } from "./town-sections";
import {
  MgqJobControl,
  mgqGoldUnavailable
} from "./mgq-controls";
import { TokenChips } from "@/components/table/board";
import { CardZoomProvider } from "@/components/table/zoom";
import { createAdventureGameState, getLegalActions, getMainHero } from "@/engine";
import { coreBuildingDefinitions } from "@/data/factions/core";
import type {
  ArmyUnitState,
  CombatUnitState,
  GameAction,
  GameState,
  LegalAction,
  PlayerState
} from "@/engine/state";

afterEach(cleanup);

function mgqState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  const player = state.players.p1;
  player.factionId = "mgq";
  player.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
  player.townTokens = { build: true, population: true, spellBook: true };
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
  town.buildings = [];
  return state;
}

function legal(action: GameAction, label: string = action.type): LegalAction {
  return { action, label };
}

describe("MGQ army-card Jobs", () => {
  it("shows the default Unemployed token and dispatches the exact legal reassignment", () => {
    const state = mgqState("mgq-ui-job");
    const unit: ArmyUnitState = { id: "pochi-card", unitDefId: "mgq.pochi", side: "few" };
    state.players.p1.army = [unit];
    const guard = legal(
      { type: "ASSIGN_UNIT_JOB", playerId: "p1", armyUnitId: unit.id, job: "guard" },
      "Assign Guard to Pochi (2 gold)"
    );
    const onAction = vi.fn();

    render(
      <MgqJobControl
        legalActions={[guard]}
        onAction={onAction}
        playerId="p1"
        state={state}
        unit={unit}
      />
    );

    expect(screen.getAllByText("Unemployed")).toHaveLength(2);
    expect(screen.getByText("default")).toBeTruthy();
    expect(screen.getByText("2 gold to reassign")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unemployed" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Guard" }));
    expect(onAction).toHaveBeenCalledWith(guard.action);
  });
});

describe("MGQ Gold Contract roster", () => {
  it("shows the three locked choices and hides every other Gold identity", () => {
    const state = mgqState("mgq-ui-gold-contract");
    const player = state.players.p1;
    player.mgqGoldContracts = ["mgq.carmilla", "mgq.giga", "mgq.lucretia"];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("mgq.dwelling_gold");

    expect(mgqGoldUnavailable(player, "mgq.cupi")).toBe(true);
    expect(mgqGoldUnavailable(player, "mgq.carmilla")).toBe(false);

    render(
      <CardZoomProvider>
        <TownRecruitSection legalActions={[]} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
      </CardZoomProvider>
    );

    expect(screen.getByRole("region", { name: "Gold Contract" })).toBeTruthy();
    expect(screen.getAllByText("Carmilla").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Giga").length).toBeGreaterThan(0);
    expect(screen.getByText(/5 uncontracted Gold companions are hidden/i)).toBeTruthy();
    expect(screen.getAllByText("Lucretia").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cupi")).toBeNull();
  });

  it("locks Gold recruitment while a new game's mandatory setup choice is pending", () => {
    const player = {
      factionId: "mgq",
      mgqGoldContracts: [],
      mgqGoldContractSetupRequired: true
    } as unknown as PlayerState;
    expect(mgqGoldUnavailable(player, "mgq.lucretia")).toBe(true);
  });

  it("renders all atomic Gold trios and dispatches the selected trio action", () => {
    const state = createAdventureGameState({
      seed: "mgq-ui-gold-setup",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Luka", factionId: "mgq", heroDefId: "luka" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const onAction = vi.fn();
    const legalActions = getLegalActions(state, "p1");
    const view = render(<PromptTray legalActions={legalActions} onAction={onAction} state={state} viewerPlayerId="p1" />);

    expect(screen.getByRole("dialog", { name: "Choose three Gold Contracts" })).toBeTruthy();
    expect(screen.getByText("Mandatory setup")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: "Carmilla" }));
    expect(screen.getByRole("button", { name: "Select 2 more" })).toBeTruthy();

    const reopened = structuredClone(state);
    if (reopened.pendingChoice) reopened.pendingChoice.id = `${reopened.pendingChoice.id}_reopened`;
    const reopenedLegal = getLegalActions(reopened, "p1");
    view.rerender(<PromptTray legalActions={reopenedLegal} onAction={onAction} state={reopened} viewerPlayerId="p1" />);
    expect(screen.getByRole("button", { name: "Select 3 more" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Carmilla" }));
    fireEvent.click(screen.getByRole("button", { name: "Giga" }));
    fireEvent.click(screen.getByRole("button", { name: "Lucretia" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm three Gold Contracts" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "CHOOSE_OPTION", playerId: "p1" })
    );
  });
});

describe("MGQ Companion Recruitment prompt", () => {
  it("renders exact costs, an unaffordable offer, and the explicit decline", () => {
    const state = mgqState("mgq-ui-companion");
    state.adventure!.pendingCompanionRecruitment = {
      playerId: "p1",
      heroId: getMainHero(state, "p1")!.id,
      options: [
        { unitDefId: "neutral.griffins", tier: "bronze", cost: { gold: 4 } },
        { unitDefId: "neutral.medusas", tier: "silver", cost: { gold: 11, valuables: 1 } }
      ]
    };
    const sealGriffins = legal({
      type: "RESOLVE_COMPANION_RECRUITMENT",
      playerId: "p1",
      unitDefId: "neutral.griffins"
    });
    const decline = legal({
      type: "RESOLVE_COMPANION_RECRUITMENT",
      playerId: "p1",
      unitDefId: null
    });
    const onAction = vi.fn();

    render(<PromptTray legalActions={[sealGriffins, decline]} onAction={onAction} state={state} viewerPlayerId="p1" />);

    expect(screen.getByRole("dialog", { name: "Companion Recruitment" })).toBeTruthy();
    expect(screen.getByText("Cost: 4 gold")).toBeTruthy();
    expect(screen.getByText("Cost: 11 gold, 1 valuables")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Cannot afford" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Seal Griffins" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline Companion Recruitment" }));
    expect(onAction).toHaveBeenNthCalledWith(1, sealGriffins.action);
    expect(onAction).toHaveBeenNthCalledWith(2, decline.action);
  });
});

describe("MGQ Spirit Shrine", () => {
  it("shows the innate selection and dispatches the exact next-combat summon", () => {
    const state = mgqState("mgq-ui-spirits");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("mgq.spirit_shrine");
    state.players.p1.mgqSpirit = "sylph";
    const gnome = legal(
      { type: "SET_MGQ_SPIRIT", playerId: "p1", spirit: "gnome" },
      "Summon Gnome in the next combat"
    );
    const onAction = vi.fn();

    render(
      <BuildingDetailPanel
        building={coreBuildingDefinitions["mgq.spirit_shrine"]}
        legalActions={[gnome]}
        onAction={onAction}
        state={state}
        viewerPlayerId="p1"
      />
    );

    expect(screen.getByText("Sylph will be summoned next combat")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sylph/i }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: /Salamander/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("contract not built")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Gnome/i }));
    expect(onAction).toHaveBeenCalledWith(gnome.action);
  });
});

describe("MGQ Temptation token", () => {
  it("renders a visible T marker and a complete accessible rules label", () => {
    const unit = {
      id: "tempted",
      controllerId: "p2",
      defense: 1,
      tokens: [
        { id: "temptation-1", kind: "temptation", amount: 1, sourceName: "Trance Pollen" },
        { id: "temptation-2", kind: "temptation", amount: 1, sourceName: "Sleep Toxin" }
      ]
    } as CombatUnitState;

    render(<TokenChips unit={unit} />);

    expect(screen.getAllByText("T")).toHaveLength(2);
    expect(screen.getAllByLabelText(/Temptation: 2 tokens skip the next activation/i)).toHaveLength(2);
  });
});
