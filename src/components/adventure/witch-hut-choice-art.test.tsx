// @vitest-environment jsdom
/**
 * Witch Hut reveal: the "look at the top Ability card" pick must SHOW the
 * revealed card's actual face in the prompt tray (the drawPile is masked in
 * player views, so the old blind text buttons could never name it client-side),
 * and declining must send the card to the SHARED Ability discard — never into
 * any of the player's own piles.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, type GameState } from "@/engine";
import { processPendingVisit } from "@/engine/adventure";
import { cardLibrary } from "@/data/cards/library";

afterEach(cleanup);

function witchHutState(): GameState {
  const state = createAdventureGameState({
    seed: "witch-hut-art",
    ruleset: "binh",
    difficulty: "normal",
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ],
    rollFirstPlayer: false
  });
  state.pendingChoice = null;
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  state.players.p1.deck = [];
  state.players.p1.discard = [];
  state.decks.abilities.drawPile = ["ability.luck"];
  state.decks.abilities.discardPile = [];
  const heroId = Object.values(state.heroes).find((hero) => hero.controllerId === "p1")!.id;
  const fieldId = Object.keys(state.adventure!.fields)[0];
  state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "WITCH_HUT" }] };
  processPendingVisit(state);
  return state;
}

describe("Witch Hut choice tray — shows the revealed Ability card's face", () => {
  it("renders the card art on the take/discard options and names the card", () => {
    const state = witchHutState();
    const onAction = vi.fn();
    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={onAction} state={state} viewerPlayerId="p1" />
    );

    const luckImage = cardLibrary["ability.luck"]?.assets?.cardImage;
    expect(luckImage, "the Luck ability card should have art").toBeTruthy();

    const take = screen.getByRole("button", { name: /Take Luck into hand/i });
    expect(take.querySelector("img")?.getAttribute("src")).toContain(luckImage);
    const discard = screen.getByRole("button", { name: /Put Luck into the Ability discard pile/i });
    expect(discard.querySelector("img")?.getAttribute("src")).toContain(luckImage);

    // Clicking the take tile dispatches the CHOOSE_ONE option resolve.
    fireEvent.click(take);
    expect(onAction).toHaveBeenCalledWith({ type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
  });
});
