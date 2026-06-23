// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HeroBoard } from "./hero-board";
import { CardZoomProvider } from "./table/zoom";
import { createAdventureGameState, type GameState } from "@/engine";

afterEach(cleanup);

/** A 2-player adventure where p1 fields the given Bulwark hero. */
function bulwarkAdventure(heroDefId: string): GameState {
  return createAdventureGameState({
    seed: `hero-board-${heroDefId}`,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: heroDefId, factionId: "bulwark", heroDefId },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

function renderHeroBoard(heroDefId: string) {
  return render(
    <CardZoomProvider>
      <HeroBoard state={bulwarkAdventure(heroDefId)} playerId="p1" />
    </CardZoomProvider>
  );
}

describe("HeroBoard — new Bulwark heroes render on the table", () => {
  it("draws Eikthurn (Chieftain) with his name banner, class and starting stats", () => {
    renderHeroBoard("eikthurn");
    expect(screen.getByLabelText("Eikthurn hero board")).toBeTruthy();
    expect(screen.getByText("Eikthurn")).toBeTruthy();
    expect(screen.getByText("Chieftain")).toBeTruthy();
    // The Chieftain's printed statistic cards (attack 2 / defense 2) are shown.
    expect(screen.getByTitle("Attack 2")).toBeTruthy();
    expect(screen.getByTitle("Defense 2")).toBeTruthy();
  });

  it("draws Oidana (Elder) — the frost Slow caster", () => {
    renderHeroBoard("oidana");
    expect(screen.getByLabelText("Oidana hero board")).toBeTruthy();
    expect(screen.getByText("Oidana")).toBeTruthy();
    expect(screen.getByText("Elder")).toBeTruthy();
    // A caster's loadout: Power 2 / Knowledge 2.
    expect(screen.getByTitle("Power 2")).toBeTruthy();
    expect(screen.getByTitle("Knowledge 2")).toBeTruthy();
  });

  it("renders a different name/class for each hero (the board is hero-specific)", () => {
    const { unmount } = renderHeroBoard("eikthurn");
    expect(screen.queryByText("Oidana")).toBeNull();
    unmount();
    renderHeroBoard("oidana");
    expect(screen.queryByText("Eikthurn")).toBeNull();
  });
});
