// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HeroBoard } from "./hero-board";
import { CardZoomProvider } from "./table/zoom";
import { cardLibrary } from "@/data/cards/library";
import { createAdventureGameState, getMainHero, type GameState, type PlayerId } from "@/engine";

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

function renderBoardState(state: GameState, playerId: PlayerId = "p1") {
  return render(
    <CardZoomProvider>
      <HeroBoard state={state} playerId={playerId} />
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

  it("draws Oidana (Elder) — the diplomat / card-draw hero", () => {
    renderHeroBoard("oidana");
    expect(screen.getByLabelText("Oidana hero board")).toBeTruthy();
    expect(screen.getByText("Oidana")).toBeTruthy();
    expect(screen.getByText("Elder")).toBeTruthy();
    // An Elder's loadout: Power 2 / Knowledge 2.
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

// jsdom cannot compute CSS, so the golden-frame LOOK is not asserted here (it is
// CSS-only, see globals.css .hbSpecCard.earned); these pin the WIRING — which
// class each slot carries and which card each slot renders — so a browser then
// paints earned-gold vs locked-dim / a kept-ability thumb vs the search glyph.
describe("HeroBoard — Feature A: the full Ⅰ/Ⅳ/Ⅵ specialty row", () => {
  it("always shows all three specialty cards; only earned levels carry the golden-frame class (level 1)", () => {
    const { container } = renderBoardState(bulwarkAdventure("eikthurn")); // starts at level 1
    // All three specialty cards are present (not just the current one).
    expect(container.querySelectorAll(".hbSpecialtyRow .hbSpecCard")).toHaveLength(3);
    // At level 1 only the Ⅰ specialty is earned (golden frame); Ⅳ and Ⅵ are locked.
    expect(container.querySelectorAll(".hbSpecCard.earned")).toHaveLength(1);
    expect(container.querySelectorAll(".hbSpecCard.locked")).toHaveLength(2);
  });

  it("CONTROL — the earned (golden) class tracks the hero level: at level 4, Ⅰ and Ⅳ are earned", () => {
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p1")!.level = 4;
    const { container } = renderBoardState(state);
    expect(container.querySelectorAll(".hbSpecCard.earned")).toHaveLength(2);
    expect(container.querySelectorAll(".hbSpecCard.locked")).toHaveLength(1);
  });
});

describe("HeroBoard — Feature B: the kept level-up Ability at levels 2/3/5/7", () => {
  it("renders the kept Ability card in the level slot when a pick is recorded", () => {
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p1")!.level = 3;
    state.players.p1.levelUpAbilityPicks = { 2: "ability.offense" };
    const { container } = renderBoardState(state);
    // Exactly the level-2 slot becomes an ability-pick tile.
    expect(container.querySelectorAll(".hbSlotAbilityPick")).toHaveLength(1);
    // Its tooltip names the kept ability card.
    const offenseName = cardLibrary["ability.offense"].name;
    expect(screen.getByTitle(new RegExp(`kept ${offenseName}`))).toBeTruthy();
  });

  it("CONTROL — with no pick recorded, the level shows the bare Search marker (no pick tile)", () => {
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p1")!.level = 3;
    const { container } = renderBoardState(state); // no levelUpAbilityPicks
    expect(container.querySelectorAll(".hbSlotAbilityPick")).toHaveLength(0);
    // The plain Search-glyph slot is still drawn.
    expect(container.querySelector(".hbSlotSearch .hbIcon")).toBeTruthy();
  });

  it("renders an OPPONENT's board from the same component (opponent-info modal path)", () => {
    // The opponent-info modal passes the opponent's seat as playerId; the pick
    // record is public, so it renders identically for p2.
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p2")!.level = 3;
    state.players.p2.levelUpAbilityPicks = { 2: "ability.offense" };
    const { container } = renderBoardState(state, "p2");
    expect(container.querySelectorAll(".hbSlotAbilityPick")).toHaveLength(1);
  });
});
