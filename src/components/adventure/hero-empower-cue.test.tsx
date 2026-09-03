// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, type GameState } from "@/engine";
import { HeroEmpowerCue, heroEmpowerCueModel } from "./hero-empower-cue";

function heroGame(): GameState {
  const state = createAdventureGameState({
    seed: "hero-empower-cue",
    difficulty: "normal",
    rollFirstPlayer: false
  });
  state.round = 2;
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  state.combat = null;
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingNecromancy = null;
  state.adventure!.rewardQueue = [];
  state.adventure!.astrologers = {
    activeCardId: "astrologers.hero",
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: [],
    heroEmpowerChosenRoundBy: {},
    heroEmpowerUsesBy: {}
  };
  state.players.p1.canMulligan = false;
  state.players.p1.needsHandRefresh = false;
  state.players.p1.hand = ["stat.attack", "stat.power"];
  state.players.p1.resources.gold = 20;
  return state;
}

describe("Hero proclamation hand cue", () => {
  it("shows the price, remaining uses, and opens an eligible Statistic", () => {
    const state = heroGame();
    const model = heroEmpowerCueModel(state, "p1", getLegalActions(state, "p1"));
    expect(model).toMatchObject({
      tone: "available",
      chooseCardId: "stat.attack",
      buttonLabel: "Choose Statistic (2 left)"
    });

    const onChoose = vi.fn();
    render(<HeroEmpowerCue model={model!} onChoose={onChoose} />);
    const cue = screen.getByRole("status");
    expect(cue.className).toContain("available");
    expect(cue.querySelector("img")?.getAttribute("src")).toContain(
      "/assets/ui/hero-empower-exchange.png"
    );
    expect(screen.getByText(/2 of 2 exchanges available this turn/i)).toBeTruthy();
    expect(screen.getByText(/You may act or move between exchanges/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose Statistic (2 left)" }));
    expect(onChoose).toHaveBeenCalledWith("stat.attack");
  });

  it("updates to one remaining, then disappears after both purchases or the chosen turn", () => {
    const state = heroGame();
    const first = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "ASTROLOGERS_HERO_EMPOWER" && legal.action.cardId === "stat.attack"
    );
    expect(first).toBeTruthy();
    const bought = applyAction(state, first!.action);
    expect(bought.errors).toEqual([]);

    expect(heroEmpowerCueModel(bought.state, "p1", getLegalActions(bought.state, "p1"))).toMatchObject({
      tone: "available",
      chooseCardId: "stat.power",
      buttonLabel: "Choose Statistic (1 left)"
    });

    const second = getLegalActions(bought.state, "p1").find(
      (legal) => legal.action.type === "ASTROLOGERS_HERO_EMPOWER" && legal.action.cardId === "stat.power"
    );
    expect(second).toBeTruthy();
    const completed = applyAction(bought.state, second!.action);
    expect(completed.errors).toEqual([]);
    expect(heroEmpowerCueModel(completed.state, "p1", getLegalActions(completed.state, "p1"))).toBeNull();

    bought.state.round = 3;
    expect(heroEmpowerCueModel(bought.state, "p1", getLegalActions(bought.state, "p1"))).toBeNull();
  });

  it("disappears as soon as Hero is no longer the active proclamation", () => {
    const state = heroGame();
    state.adventure!.astrologers!.activeCardId = "astrologers.grim_warlock";
    expect(heroEmpowerCueModel(state, "p1", getLegalActions(state, "p1"))).toBeNull();
  });
});
