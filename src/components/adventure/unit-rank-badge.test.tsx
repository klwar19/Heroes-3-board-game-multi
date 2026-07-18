// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
    const printed = coreUnitDefinitions["castle.marksmen"]!.few!;
    const stats = document.querySelector(".armyUnitRow small")?.textContent ?? "";
    expect(stats).toContain(`A${printed.attack}`);
    expect(stats).toContain(`D${printed.defense}`);
  });
});
