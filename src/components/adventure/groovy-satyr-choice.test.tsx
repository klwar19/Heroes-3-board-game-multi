// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState,
} from "@/engine";
import { getMainHero } from "@/engine/adventure";
import { startNeutralEncounter } from "@/engine/adventure-reducer";
import { formatEvent } from "@/components/table/utils";
import { PromptTray } from "./screen";

afterEach(cleanup);

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function openSatyrSwap(difficulty: number): GameState {
  let state = createAdventureGameState({
    seed: `groovy-satyr-${difficulty}`,
    difficulty: "normal",
    rollFirstPlayer: false,
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.adventure!.astrologers = {
    activeCardId: "astrologers.groovy_satyr",
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: [],
  };
  const hero = getMainHero(state, "p1")!;
  const field = state.adventure!.fields[hero.spaceId!];
  field.difficulty = difficulty;
  startNeutralEncounter(state, hero, field);

  const place = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLACE_COMBAT_UNIT",
  );
  expect(place).toBeTruthy();
  state = apply(state, place!.action);
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).toBe(
    "satyr-swap",
  );
  return state;
}

function openJudgeDread(difficulty: number): GameState {
  let state = createAdventureGameState({
    seed: `judge-dread-${difficulty}`,
    difficulty: "normal",
    rollFirstPlayer: false,
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.adventure!.astrologers = {
    activeCardId: "astrologers.judge_dread",
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: [],
  };
  const hero = getMainHero(state, "p1")!;
  const field = state.adventure!.fields[hero.spaceId!];
  field.difficulty = difficulty;
  startNeutralEncounter(state, hero, field);
  const place = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLACE_COMBAT_UNIT",
  );
  state = apply(state, place!.action);
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).toBe(
    "judge-dread",
  );
  return state;
}

function renderTray(state: GameState) {
  render(
    <PromptTray
      legalActions={getLegalActions(state, "p1")}
      onAction={vi.fn()}
      state={state}
      viewerPlayerId="p1"
    />,
  );
}

describe("Groovy Satyr neutral-card choice", () => {
  it.each([
    { difficulty: 5, tiers: ["bronze", "silver", "gold"] },
    { difficulty: 7, tiers: ["azure"] },
  ])("shows every drawn Neutral card face, including $tiers tiers", ({ difficulty, tiers }) => {
    const state = openSatyrSwap(difficulty);
    const draws = state.combat!.pendingNeutralDraws ?? [];
    expect(new Set(draws.map((draw) => draw.tier))).toEqual(new Set(tiers));

    renderTray(state);
    expect(screen.getByRole("button", { name: "Keep all drawn Neutral Units" })).toBeTruthy();
    for (const draw of draws) {
      const name = coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId;
      const button = screen.getByRole("button", {
        name: `Discard ${name} → draw 1 new ${draw.tier} Neutral`,
      });
      expect(button.querySelector("img"), `${name} must show its Neutral card face`).toBeTruthy();
    }
  });

  it("keeps every drawn card when the player chooses not to discard", () => {
    let state = openSatyrSwap(5);
    const original = structuredClone(state.combat!.pendingNeutralDraws ?? []);
    const discardSizes = Object.fromEntries(
      ["bronze", "silver", "gold", "azure"].map((tier) => [
        tier,
        state.decks[`neutral-${tier}`]!.discardPile.length,
      ]),
    );

    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0,
    });

    expect(state.pendingChoice).toBeNull();
    expect(state.combat!.pendingNeutralDraws).toBeNull();
    for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
      expect(state.decks[`neutral-${tier}`]!.discardPile).toHaveLength(discardSizes[tier]);
    }
    expect(
      Object.values(state.combat!.units)
        .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)
        .map((unit) => unit.unitDefId),
    ).toEqual(expect.arrayContaining(original.map((draw) => draw.unitDefId)));
  });

  it("shows the discarded card and same-tier replacement before revealing the army", () => {
    let state = openSatyrSwap(5);
    const draws = state.combat!.pendingNeutralDraws ?? [];
    const drawIndex = draws.findIndex((draw) => draw.tier === "silver");
    expect(drawIndex).toBeGreaterThanOrEqual(0);
    const discarded = draws[drawIndex];

    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: drawIndex + 1,
    });

    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).toBe(
      "satyr-swap-result",
    );
    const result =
      state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.satyrSwapResult : undefined;
    expect(result?.fromUnitDefId).toBe(discarded.unitDefId);
    expect(result?.tier).toBe("silver");
    expect(state.decks["neutral-silver"]!.discardPile).toContain(discarded.unitDefId);
    expect(state.combat!.pendingNeutralDraws?.[drawIndex]).toEqual({
      unitDefId: result?.toUnitDefId,
      tier: "silver",
    });

    const swapEvent = [...state.eventLog]
      .reverse()
      .find((event) => event.type === "NEUTRAL_DRAW_SWAPPED");
    expect(swapEvent?.type).toBe("NEUTRAL_DRAW_SWAPPED");
    if (swapEvent?.type === "NEUTRAL_DRAW_SWAPPED") {
      expect(formatEvent(swapEvent, state)).toContain("discards");
      expect(formatEvent(swapEvent, state)).toContain("draws");
      expect(formatEvent(swapEvent, state)).toContain("Silver Neutral deck");
    }

    renderTray(state);
    const cards = within(screen.getByTestId("satyr-swap-result-cards"));
    expect(cards.getByText("Discarded")).toBeTruthy();
    expect(cards.getByText("New Silver draw")).toBeTruthy();
    expect(cards.getAllByRole("img")).toHaveLength(2);

    const continueAction = getLegalActions(state, "p1")[0]?.action;
    expect(continueAction?.type).toBe("CHOOSE_OPTION");
    state = apply(state, continueAction!);
    expect(state.pendingChoice).toBeNull();
    expect(
      Object.values(state.combat!.units).filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID),
    ).toHaveLength(draws.length);
  });
});

describe("Judge Dread whole-army choice", () => {
  it.each([
    { difficulty: 5, tiers: ["bronze", "silver", "gold"] },
    { difficulty: 7, tiers: ["azure"] },
  ])("shows every drawn Neutral card, including $tiers tiers, with two whole-army actions", ({ difficulty, tiers }) => {
    const state = openJudgeDread(difficulty);
    const draws = state.combat!.pendingNeutralDraws ?? [];
    expect(new Set(draws.map((draw) => draw.tier))).toEqual(new Set(tiers));

    renderTray(state);
    const army = within(screen.getByTestId("judge-dread-drawn-army"));
    expect(army.getAllByRole("img")).toHaveLength(draws.length);
    for (const draw of draws) {
      const name = coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId;
      expect(army.getByText(new RegExp(`${draw.tier} · ${name}`, "i"))).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Keep all drawn Neutral Units" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard all and redraw the same tiers" })).toBeTruthy();
  });

  it("shows all discarded and replacement cards before combat, preserving every tier", () => {
    let state = openJudgeDread(5);
    const originalTiers = (state.combat!.pendingNeutralDraws ?? []).map((draw) => draw.tier).sort();
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1,
    });

    renderTray(state);
    const result = within(screen.getByTestId("judge-dread-redraw-result"));
    expect(result.getByText("Discarded army")).toBeTruthy();
    expect(result.getByText("New army · same tiers")).toBeTruthy();
    expect(result.getAllByRole("img")).toHaveLength(originalTiers.length * 2);
    const payload =
      state.pendingChoice?.type === "OPTION_CHOICE"
        ? state.pendingChoice.judgeDreadResult
        : undefined;
    expect(payload?.replacements.map((draw) => draw.tier).sort()).toEqual(originalTiers);
    expect(screen.getByRole("button", { name: "Continue with the new Neutral army" })).toBeTruthy();
  });
});
