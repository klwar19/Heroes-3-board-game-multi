// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CombatMoralePanel } from "./combat-morale-panel";
import { CardZoomProvider } from "./zoom";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import type { GameAction, GameState, LegalAction } from "@/engine";

afterEach(cleanup);

/**
 * The panel reads only the morale-card slices of state (rule flag, held
 * cards, the two combat participants), so a light stub keeps the test about
 * the UI wiring, not engine setup — the engine offers themselves are pinned
 * in morale-card-effects.test.ts / morale-in-combat.test.ts.
 */
function makeState({
  moraleCards = true,
  viewerPositive = [] as string[],
  viewerNegative = [] as string[],
  opponentNegative = [] as string[]
} = {}): GameState {
  return {
    adventure: moraleCards ? { moraleCards: true } : {},
    players: {
      p1: { id: "p1", name: "Alice", moraleCards: { positive: viewerPositive, negative: viewerNegative } },
      p2: { id: "p2", name: "Bob", moraleCards: { positive: [], negative: opponentNegative } }
    },
    combat: { attackerPlayerId: "p1", defenderPlayerId: "p2" }
  } as unknown as GameState;
}

function spendOffer(label: string, action: Record<string, unknown>): LegalAction {
  return { label, action: { type: "SPEND_MORALE", playerId: "p1", ...action } as GameAction };
}

function renderPanel(state: GameState, legalActions: LegalAction[], onAction = vi.fn()) {
  render(
    <CardZoomProvider>
      <CombatMoralePanel
        hand={[]}
        legalActions={legalActions}
        onAction={onAction}
        state={state}
        viewerPlayerId="p1"
      />
    </CardZoomProvider>
  );
  return onAction;
}

describe("CombatMoralePanel — morale cards visible and usable in combat", () => {
  it("offers the held Combat Bonus card as live +1 Attack / +1 Defense buttons", () => {
    const onAction = renderPanel(makeState({ viewerPositive: [MORALE_CARD_IDS.combatBonus] }), [
      spendOffer("Positive Morale: +1 Attack for this Combat", { benefit: "combat-bonus", bonus: "attack" }),
      spendOffer("Positive Morale: +1 Defense for this Combat", { benefit: "combat-bonus", bonus: "defense" })
    ]);

    fireEvent.click(screen.getByRole("button", { name: "+1 Attack this Combat" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "combat-bonus",
      bonus: "attack"
    });
    expect(screen.getByRole("button", { name: "+1 Defense this Combat" })).toBeTruthy();
  });

  it("offers each remove-token play the engine allows", () => {
    const onAction = renderPanel(makeState({ viewerPositive: [MORALE_CARD_IDS.removeToken] }), [
      spendOffer("Positive Morale: remove the weakness token from Pikemen", {
        benefit: "remove-token",
        unitId: "u1",
        tokenKind: "weakness"
      })
    ]);
    fireEvent.click(screen.getByRole("button", { name: "remove the weakness token from Pikemen" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "remove-token",
      unitId: "u1",
      tokenKind: "weakness"
    });
  });

  it("a held Positive card with no live offer still shows, with its where-to-use hint", () => {
    renderPanel(makeState({ viewerPositive: [MORALE_CARD_IDS.rerollDie] }), []);
    expect(screen.getByText("Positive Morale: Reroll a Die")).toBeTruthy();
    expect(screen.getByText(/reroll window/)).toBeTruthy();
  });

  it("shows a held Negative card as an armed curse with its trigger", () => {
    renderPanel(makeState({ viewerNegative: [MORALE_CARD_IDS.skipActivation] }), []);
    expect(screen.getByText("Negative Morale: Skip Activation Check")).toBeTruthy();
    expect(screen.getByText(/a −1 skips that unit/)).toBeTruthy();
    expect(document.querySelector(".combatMoraleRow.negative")).toBeTruthy();
  });

  it("shows the opposing fighter's held cards (public info)", () => {
    renderPanel(makeState({ opponentNegative: [MORALE_CARD_IDS.searchOne] }), []);
    expect(screen.getByText("Bob holds")).toBeTruthy();
    expect(screen.getByLabelText("Inspect Negative Morale: Search One")).toBeTruthy();
  });

  it("CONTROL — renders nothing when nobody holds a card and no offer exists", () => {
    renderPanel(makeState(), []);
    expect(document.querySelector(".combatMoraleCards")).toBeNull();
    expect(document.querySelector(".combatMorale")).toBeNull();
  });

  it("CONTROL — rule off keeps the classic morale-token buttons", () => {
    const onAction = renderPanel(makeState({ moraleCards: false }), [
      spendOffer("Spend morale: draw a card", { benefit: "draw" })
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Morale: draw 1/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "SPEND_MORALE", playerId: "p1", benefit: "draw" });
    expect(document.querySelector(".combatMoraleCards")).toBeNull();
  });
});
