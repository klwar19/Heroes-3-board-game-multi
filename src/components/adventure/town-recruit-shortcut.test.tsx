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
import type { ArmyUnitState, GameState, HouseRuleId } from "@/engine/state";

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

  it("keeps both Few and Pack cards visible with icon costs and owned-side glow", () => {
    const state = recruitReadyState();
    const faction = coreFactionDefinitions[state.players.p1.factionId!];
    const unitIds = faction.units.filter((id) => Boolean(coreUnitDefinitions[id]?.few));
    renderRecruit(state);

    expect(document.querySelectorAll(".unitSideCards")).toHaveLength(unitIds.length);
    expect(document.querySelectorAll(".unitSideCard.pack").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".unitCostItem img[src*='resource-gold']").length).toBeGreaterThan(0);

    const ownedUnitId = unitIds.find((id) => Boolean(coreUnitDefinitions[id]?.pack))!;
    state.players.p1.army = [{ id: "army_owned_few", unitDefId: ownedUnitId, side: "few" }];
    cleanup();
    renderRecruit(state);
    expect(document.querySelector(`.recruitRow.owned-few .unitSideCard.few.owned`)).toBeTruthy();
    expect(document.querySelector(`.recruitRow.owned-few .unitSideCard.pack.unowned`)).toBeTruthy();
  });

  it("a locked-tier row shows the dwelling requirement instead of live recruit controls", () => {
    // recruitReadyState builds ONLY the bronze dwelling, so silver/gold tiers
    // are locked. The engine rejects a locked-tier recruit ("Build the dwelling
    // of that unit's level first"), so the row must not offer an always-failing
    // button or basket checkbox — the cards stay visible for planning.
    renderRecruit(recruitReadyState());
    const lockedRows = [...document.querySelectorAll(".recruitRow.unitRosterRow.locked")];
    expect(lockedRows.length).toBeGreaterThan(0);
    for (const row of lockedRows) {
      expect(row.querySelector("button.recruitQuick")).toBeNull();
      expect(row.querySelector("input[type='checkbox']")).toBeNull();
      expect(row.textContent).toContain("dwelling first");
      // "show all units even not available": a locked unit STILL renders its
      // full card faces AND its recruit cost, so it stays a planning reference.
      expect(row.querySelector(".unitSideCards"), "locked unit shows its cards").toBeTruthy();
      expect(row.querySelector(".unitCost"), "locked unit shows its recruit cost").toBeTruthy();
    }
    // CONTROL: an unlocked (bronze) row keeps both live controls.
    const unlockedRow = [...document.querySelectorAll(".recruitRow.unitRosterRow:not(.locked)")].find((row) =>
      row.querySelector("button.recruitQuick")
    );
    expect(unlockedRow).toBeTruthy();
    expect(unlockedRow!.querySelector("input[type='checkbox']")).toBeTruthy();
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

  it("Freelancer's Guild asks which 1:1 substitute to spend when gold is short", () => {
    const state = recruitReadyState();
    state.players.p1.factionId = "stronghold";
    state.players.p1.resources = { gold: 0, buildingMaterials: 10, valuables: 10 };
    state.players.p1.army = [];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.factionId = "stronghold";
    town.buildings = ["stronghold.dwelling_bronze", "stronghold.freelancers_guild"];
    const onAction = vi.fn();
    renderRecruit(state, onAction);

    fireEvent.click(screen.getAllByRole("button", { name: "Recruit" })[0]);

    expect(onAction).not.toHaveBeenCalled();
    const prompt = screen.getByRole("dialog", { name: /Freelancer's Guild payment choice/i });
    expect(prompt.textContent).toMatch(/each count as exactly 1 gold/i);
    const materialsButton = screen.getByRole("button", { name: /Use .*material/i });
    fireEvent.click(materialsButton);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "POPULATION_ACTION", freelancerPayment: "materials-first" })
    );
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

  it("shows a Stack's valuables cost directly on the Add Stack button", () => {
    const state = recruitReadyState();
    state.adventure!.houseRules!["polish-unit-stacks"] = true;
    state.players.p1.army = [{ id: "army_archangel", unitDefId: "castle.archangels", side: "pack", stacks: 0 }];
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.dwelling_gold");
    renderRecruit(state);

    expect(
      screen.getByRole("button", { name: /Buy Stack for Archangels for 33 gold \+ 2 valuables/i }).textContent
    ).toMatch(/Add Stack.*33g \+ 2v/i);
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

// ---------------------------------------------------------------------------
// REGRESSION PIN — the card a player READS must carry the live unit-stat house
// rules, not the printed scan's numbers. This zoom printed "Defense 0" for a
// Pack of Griffins on a BINH table (where `griffin-buff` is ON by default and
// the engine mints it at 1) — the SECOND report of "Pack Griffins have 0
// Defense again", after `d95a9d71` fixed the same drift on the roster ROW.
// The engine half is pinned in src/engine/griffin-pack-defense.test.ts.
// ---------------------------------------------------------------------------

/** A Castle recruit panel with the given explicit house-rule toggles. */
function castleRecruitState(houseRules: Partial<Record<HouseRuleId, boolean>>): GameState {
  const state = createAdventureGameState({
    seed: "griffin-card-face",
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Gelu", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
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

/** The stat line the Pack of Griffins card zoom prints on that table. */
function packGriffinZoomLine(houseRules: Partial<Record<HouseRuleId, boolean>>): string {
  renderRecruit(castleRecruitState(houseRules));
  fireEvent.click(screen.getByRole("button", { name: /View the Pack Griffins card/i }));
  const line = Array.from(document.querySelectorAll(".zoomBackdrop p"))
    .map((node) => node.textContent ?? "")
    .find((text) => /Attack \d+ · Defense \d+/.test(text));
  expect(line, "the enlarged unit card should print a stat line").toBeTruthy();
  return line!;
}

describe("the recruit card face reads the live unit-stat house rules", () => {
  it("BINH DEFAULT: the Pack of Griffins card prints Defense 1, not the printed 0 [MUTATION-CHECK]", () => {
    // No explicit flag — the shipped BINH table, exactly what a player gets.
    expect(packGriffinZoomLine({})).toMatch(/Attack 3 · Defense 1 /);
  });

  it("CONTROL: with griffin-buff OFF the same card prints the printed Defense 0", () => {
    expect(packGriffinZoomLine({ "griffin-buff": false })).toMatch(/Attack 3 · Defense 0 /);
  });

  it("Community Balance ON with griffin-buff OFF still prints Defense 1", () => {
    expect(packGriffinZoomLine({ "griffin-buff": false, "community-card-balance": true })).toMatch(
      /Attack 3 · Defense 1 /
    );
  });
});
