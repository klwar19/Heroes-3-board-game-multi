// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarketPanel } from "./screen";
import { createAdventureGameState, getLegalActions } from "@/engine";
import type { GameState, HeroState, MapFieldState } from "@/engine";

afterEach(cleanup);

/** Seed a real adventure, then stand a hero of `p1` on a freshly injected field. */
function gameWithHeroOn(location: string, heroKind: "main" | "secondary" = "main") {
  const state = createAdventureGameState({ seed: "ui-market", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";

  const field: MapFieldState = {
    spaceId: "50,50",
    tileInstanceId: "ui-market-tile",
    slot: 0,
    location,
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;

  let hero: HeroState | undefined;
  if (heroKind === "secondary") {
    hero = {
      id: "hero_p1_secondary",
      controllerId: "p1",
      kind: "secondary",
      level: 1,
      experience: 0,
      movementPoints: 0,
      movementPointsMax: 4,
      spaceId: field.spaceId
    };
    state.heroes[hero.id] = hero;
  } else {
    hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main");
    if (!hero) {
      throw new Error("p1 should have a main hero");
    }
    hero.spaceId = field.spaceId;
    hero.movementPoints = 0;
  }
  return { state, heroId: hero.id };
}

function renderMarket(state: GameState, onAction = vi.fn()) {
  render(
    <MarketPanel
      legalActions={getLegalActions(state, "p1")}
      onAction={onAction}
      state={state}
      viewerPlayerId="p1"
    />
  );
  return onAction;
}

describe("MarketPanel — persistent blinking Market tab", () => {
  it("shows a clear, blinking tab while a hero is parked on a Trading Post", () => {
    const { state } = gameWithHeroOn("trading_post");
    renderMarket(state);

    const tab = screen.getByRole("button", { name: /Trading Post/ });
    // The blink comes from the `.marketTab` class' CSS animation.
    expect(tab.classList.contains("marketTab")).toBe(true);
    expect(tab.getAttribute("title")).toMatch(/trade any time/i);
  });

  it("opens the market for free when the tab is clicked (OPEN_MARKET, no movement spent)", () => {
    const { state, heroId } = gameWithHeroOn("trading_post");
    const onAction = renderMarket(state);

    fireEvent.click(screen.getByRole("button", { name: /Trading Post/ }));

    expect(onAction).toHaveBeenCalledWith({ type: "OPEN_MARKET", playerId: "p1", heroId });
  });

  it("keeps the tab available through a Secondary Hero parked on the tile", () => {
    const { state, heroId } = gameWithHeroOn("trading_post", "secondary");
    const onAction = renderMarket(state);

    fireEvent.click(screen.getByRole("button", { name: /Trading Post/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "OPEN_MARKET", playerId: "p1", heroId });
  });

  it("shows nothing when no hero stands on a market and no market is open", () => {
    const { state } = gameWithHeroOn("empty_field");
    const { container } = render(
      <MarketPanel legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );
    expect(container.firstChild).toBeNull();
  });
});
