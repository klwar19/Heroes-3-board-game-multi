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
  state.players.p1.army = [{ id: "vets", unitDefId: "castle.marksmen", side: "few", experience: 9 }];
  return state;
}

/**
 * Unit Experience (optional rule): the army panel shows a WoG-style rank badge
 * (carets / an Elite sword) and the RANK-FOLDED stats the engine fights with.
 * With the rule off the identical card renders no badge and printed stats —
 * the desktop-unchanged CONTROL.
 */
describe("ArmyPanel veteran rank badge (unit experience)", () => {
  it("shows the Elite sword badge and rank-folded stats for a rank-3 bronze card", () => {
    renderArmy(makeState(true, "rank-badge-on"));
    const badge = document.querySelector(".unitRankBadge.rank-3");
    expect(badge?.textContent).toBe("⚔");
    expect(badge?.getAttribute("title")).toContain("Elite");
    // Bronze rank 3 = +1 Attack / +1 Defense / +1 Health / +1 Initiative over print.
    const printed = coreUnitDefinitions["castle.marksmen"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    expect(stats).toContain(`A${printed.attack + 1}`);
    expect(stats).toContain(`D${printed.defense + 1}`);
    expect(stats).toContain(`HP${printed.health + 1}`);
    expect(stats).toContain(`I${printed.initiative + 1}`);
  });

  it("CONTROL — with the rule off the same card shows printed stats and no badge", () => {
    renderArmy(makeState(false, "rank-badge-off"));
    expect(document.querySelector(".unitRankBadge")).toBeNull();
    expect(document.querySelector(".armyExperienceBoard")).toBeNull();
    const printed = coreUnitDefinitions["castle.marksmen"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    expect(stats).toContain(`A${printed.attack}`);
    expect(stats).toContain(`D${printed.defense}`);
  });

  it("opens the Unit Experience Board pop-up with per-rank stat changes, elite text and a live Drill", () => {
    const state = makeState(true, "rank-badge-action");
    state.players.p1.army[0].experience = 1;
    // A second card with a registered ELITE ability: its name + rules text must
    // read in the window even while locked (rank below 3).
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
    // The roster keeps the inline per-card XP track…
    expect(document.querySelector(".armyXpTrack")).toBeTruthy();
    // …and the board itself is a BUTTON that opens a pop-up window (like the
    // Hero Grade / Hero Equipment windows).
    const boardButton = document.querySelector("button.armyExperienceBoard") as HTMLButtonElement;
    expect(boardButton?.textContent).toContain("Unit Experience Board");
    fireEvent.click(boardButton);
    const dialog = document.querySelector(".heroSystemModal.unitXpWindow") as HTMLElement;
    expect(dialog).toBeTruthy();
    const text = dialog.textContent ?? "";
    // XP sources are spelled out…
    expect(text).toContain("Cards earn XP");
    // …the marksmen's BRONZE ladder shows every rank's threshold and stat
    // delta (bronze: 2/5/9 XP; Elite adds the bronze-only +1 Initiative), and
    // the champions' GOLD ladder shows its slower 4/9/15 thresholds…
    expect(text).toContain("1 · Seasoned");
    expect(text).toContain("2 · Veteran");
    expect(text).toContain("3 · Elite");
    expect(text).toContain("at 2 XP");
    expect(text).toContain("at 5 XP");
    expect(text).toContain("at 9 XP");
    expect(text).toContain("at 15 XP");
    expect(text).toContain("+1 Defense");
    expect(text).toContain("+1 Attack");
    expect(text).toContain("+1 Health · +1 Initiative");
    // …and the champions' registered elite ability appears with its FULL rules
    // text while still locked.
    expect(text).toContain("No Retaliation");
    expect(text).toContain("never provoke a Retaliation");
    // The window's Drill button dispatches the engine-offered action verbatim.
    fireEvent.click(dialog.querySelector(".armyUnitActions button") as Element);
    expect(dispatched[0]).toEqual({ type: "DRILL_UNIT", playerId: "p1", armyUnitId: "vets" });
  });
});
