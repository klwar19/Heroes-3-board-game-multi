// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MarketPanel } from "./screen";
import { createAdventureGameState, getLegalActions } from "@/engine";
import { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
import { cardLibrary } from "@/data/cards/library";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * The War Machine Factory is how a player obtains war machines in a real
 * (multiplayer) adventure game. This pins the shop UI down: it must list every
 * machine in the shared supply — First Aid Tent and Cannon included — and a
 * click must dispatch the real BUY_WAR_MACHINE action the server applies.
 */
function factoryVisit(): { state: GameState } {
  const state = createAdventureGameState({ seed: "ui-war-machine-shop", rollFirstPlayer: false });
  state.activePlayerId = "p1";

  const hero = Object.values(state.heroes).find(
    (candidate) => candidate.controllerId === "p1" && candidate.kind === "main"
  );
  if (!hero) {
    throw new Error("p1 should have a main hero");
  }

  // Plenty of gold so every machine is affordable (the dearest, Cannon, is 10).
  state.players.p1.resources.gold = 99;
  state.adventure!.pendingVisit = {
    heroId: hero.id,
    playerId: "p1",
    fieldId: "ui-factory-field",
    steps: [{ type: "WAR_MACHINE_SHOP" }]
  };
  return { state };
}

function renderFactory(state: GameState, onAction = vi.fn()) {
  render(
    <MarketPanel legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
  );
  return onAction;
}

describe("War Machine Factory shop UI", () => {
  it("opens as the War Machine Factory", () => {
    renderFactory(factoryVisit().state);
    expect(screen.getByRole("dialog", { name: /War Machine Factory/i })).toBeTruthy();
  });

  it("lists every war machine in the supply (all five)", () => {
    renderFactory(factoryVisit().state);
    for (const cardId of WAR_MACHINE_CARD_IDS) {
      const name = cardLibrary[cardId].name;
      // Cards without art render their name twice (image-fallback span + label),
      // so assert at least one match rather than a unique one.
      expect(screen.getAllByText(name).length, `${name} should be listed for sale`).toBeGreaterThan(0);
    }
  });

  it("buys the First Aid Tent at its factory price (3 gold)", () => {
    const onAction = renderFactory(factoryVisit().state);

    const card = screen.getAllByText("First Aid Tent")[0].closest(".marketMachine");
    expect(card).toBeTruthy();
    const buy = within(card as HTMLElement).getByRole("button", { name: /Buy for 3/ });
    fireEvent.click(buy);

    expect(onAction).toHaveBeenCalledWith({
      type: "BUY_WAR_MACHINE",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent"
    });
  });

  it("buys the Cannon — the priciest machine — at its factory price (10 gold)", () => {
    const onAction = renderFactory(factoryVisit().state);

    const card = screen.getAllByText("Cannon")[0].closest(".marketMachine");
    const buy = within(card as HTMLElement).getByRole("button", { name: /Buy for 10/ });
    fireEvent.click(buy);

    expect(onAction).toHaveBeenCalledWith({
      type: "BUY_WAR_MACHINE",
      playerId: "p1",
      cardId: "war_machine.cannon"
    });
  });

  it("disables buying a machine the player cannot afford", () => {
    const { state } = factoryVisit();
    state.players.p1.resources.gold = 4; // affords only the 3-gold First Aid Tent
    renderFactory(state);

    const cannon = screen.getAllByText("Cannon")[0].closest(".marketMachine");
    const cannonBuy = within(cannon as HTMLElement).getByRole("button");
    expect((cannonBuy as HTMLButtonElement).disabled).toBe(true);

    const tent = screen.getAllByText("First Aid Tent")[0].closest(".marketMachine");
    const tentBuy = within(tent as HTMLElement).getByRole("button");
    expect((tentBuy as HTMLButtonElement).disabled).toBe(false);
  });
});
