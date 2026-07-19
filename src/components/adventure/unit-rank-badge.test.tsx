// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ArmyPanel } from "./screen";
import { CardZoomProvider } from "@/components/table/zoom";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createAdventureGameState, type GameState } from "@/engine";

afterEach(cleanup);

function renderArmy(state: GameState) {
  render(
    <CardZoomProvider>
      <ArmyPanel state={state} playerId="p1" />
    </CardZoomProvider>
  );
}

function makeState(unitExperience: boolean, seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ruleset: "legacy",
    ...(unitExperience ? { unitExperience: true } : {})
  } as Parameters<typeof createAdventureGameState>[0]);
  // Halberdiers standard path: R3 = 2 stats steps (+Def +Atk), R2 ability
  state.players.p1.army = [{ id: "vets", unitDefId: "castle.halberdiers", side: "few", experience: 10 }];
  return state;
}

describe("ArmyPanel veteran rank badge (unit experience)", () => {
  it("shows rank badge and schedule-folded stats for a rank-3 standard-path unit", () => {
    renderArmy(makeState(true, "rank-badge-on"));
    const badge = document.querySelector(".unitRankBadge.rank-3");
    expect(badge).toBeTruthy();
    const printed = coreUnitDefinitions["castle.halberdiers"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    // R1 stats +1 Def, R3 stats +1 Atk (R2 is ability)
    expect(stats).toContain(`A${printed.attack + 1}`);
    expect(stats).toContain(`D${printed.defense + 1}`);
  });

  it("CONTROL — with the rule off the same card shows printed stats and no badge", () => {
    renderArmy(makeState(false, "rank-badge-off"));
    expect(document.querySelector(".unitRankBadge")).toBeNull();
    expect(document.querySelector(".armyExperienceBoard")).toBeNull();
    const printed = coreUnitDefinitions["castle.halberdiers"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    expect(stats).toContain(`A${printed.attack}`);
    expect(stats).toContain(`D${printed.defense}`);
  });

  it("opens the Unit Experience Board with STATS/ABILITY pills, unique path, and Drill", () => {
    const state = makeState(true, "rank-badge-action");
    state.players.p1.army[0].experience = 1;
    state.players.p1.army.push({ id: "champs", unitDefId: "castle.champions", side: "few", experience: 0 });
    const dispatched: unknown[] = [];
    render(
      <CardZoomProvider>
        <ArmyPanel
          state={state}
          playerId="p1"
          legalActions={[{ label: "Drill", action: { type: "DRILL_UNIT", playerId: "p1", armyUnitId: "vets" } }]}
          onAction={(action) => dispatched.push(action)}
        />
      </CardZoomProvider>
    );
    expect(document.querySelector(".armyXpTrack")).toBeTruthy();
    const boardButton = document.querySelector("button.armyExperienceBoard") as HTMLButtonElement;
    expect(boardButton?.textContent).toContain("Unit Experience Board");
    fireEvent.click(boardButton);
    const dialog = document.querySelector(".heroSystemModal.unitXpWindow") as HTMLElement;
    expect(dialog).toBeTruthy();
    const text = dialog.textContent ?? "";
    expect(text).toContain("either stats or one ability");
    expect(text).toContain("1 · Seasoned");
    expect(text).toContain("2 · Veteran");
    expect(text).toContain("3 · Elite");
    expect(text).toContain("4 · Legend");
    expect(text).toContain("STATS");
    expect(text).toContain("ABILITY");
    expect(text).toContain("at 3 XP");
    expect(text).toContain("No Retaliation");
    expect(text).toContain("never provoke a Retaliation");
    fireEvent.click(dialog.querySelector(".armyUnitActions button") as Element);
    expect(dispatched[0]).toEqual({ type: "DRILL_UNIT", playerId: "p1", armyUnitId: "vets" });
  });
});
