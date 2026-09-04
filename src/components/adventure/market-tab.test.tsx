// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MarketPanel } from "./screen";
import { applyAction, createAdventureGameState, getLegalActions } from "@/engine";
import type { GameState, HeroState, MapFieldState } from "@/engine";
import { astrologersCardDefinitions } from "@/data/cards/astrologers";

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

  it("shows Wandering Merchant as a blinking, real war-machine icon during the turn", () => {
    const { state } = gameWithHeroOn("empty_field");
    state.round = 2;
    state.players.p1.resources.gold = 20;
    state.adventure!.astrologers!.activeCardId = "astrologers.wandering_merchant";
    const onAction = renderMarket(state);

    const tab = screen.getByRole("button", { name: /Wandering Merchant/ });
    expect(tab.classList.contains("marketTab")).toBe(true);
    expect(tab.querySelector('img[src*="wandering-merchant-ballista"]')).toBeTruthy();

    fireEvent.click(tab);
    expect(onAction).toHaveBeenCalledWith({ type: "OPEN_WANDERING_MERCHANT", playerId: "p1" });
  });

  // The shop's discount must be the LIVE proclamation effect, not a number
  // hard-coded against the card id — otherwise a data retune silently makes the
  // label disagree with what the engine charges.
  it("prices the Merchant discount from the proclamation's own discountGold", () => {
    const effect = astrologersCardDefinitions["astrologers.wandering_merchant"].effect;
    if (effect.type !== "WAR_MACHINE_DISCOUNT_OFFER") {
      throw new Error("Wandering Merchant should carry WAR_MACHINE_DISCOUNT_OFFER");
    }
    const { state } = gameWithHeroOn("empty_field");
    state.round = 2;
    state.players.p1.resources.gold = 40;
    state.adventure!.astrologers!.activeCardId = "astrologers.wandering_merchant";
    const open = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "OPEN_WANDERING_MERCHANT",
    );
    const opened = applyAction(state, open!.action).state;
    renderMarket(opened);

    const heading = screen.getByRole("heading", { name: /War machines/ });
    expect(heading.textContent).toContain(`− ${effect.discountGold} gold`);
    // The buy buttons are priced off the same number.
    const prices = Array.from(document.querySelectorAll("button"))
      .map((button) => /Buy for (\d+)/.exec(button.textContent ?? "")?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.every((price) => price >= 0)).toBe(true);
  });

  it("closing without buying leaves the Merchant action available", () => {
    const { state } = gameWithHeroOn("empty_field");
    state.round = 2;
    state.players.p1.resources.gold = 20;
    state.adventure!.astrologers!.activeCardId = "astrologers.wandering_merchant";
    const open = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "OPEN_WANDERING_MERCHANT",
    );
    expect(open).toBeTruthy();
    const opened = applyAction(state, open!.action).state;
    const onAction = renderMarket(opened);

    expect(screen.getByRole("dialog", { name: "Wandering Merchant" })).toBeTruthy();
    fireEvent.click(screen.getByTitle("Close — you can buy later this turn"));
    const close = onAction.mock.calls[0]?.[0];
    expect(close).toMatchObject({ type: "RESOLVE_VISIT_STEP", playerId: "p1" });

    const closed = applyAction(opened, close).state;
    expect(closed.adventure?.pendingVisit).toBeNull();
    expect(getLegalActions(closed, "p1").some((legal) => legal.action.type === "OPEN_WANDERING_MERCHANT")).toBe(true);
  });
});
