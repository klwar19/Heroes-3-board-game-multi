// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { createAdventureGameState } from "@/engine";
import type { LegalAction } from "@/engine/state";
import { PromptTray } from "./screen";

afterEach(cleanup);

describe("Subterranean Gate and resource prompt art", () => {
  it("shows the two gate-entry tile faces as selectable tile cards", () => {
    const state = createAdventureGameState({
      seed: "subterranean-pick-art",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    const choiceId = "choice_subterranean_tiles";
    state.pendingChoice = {
      id: choiceId,
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Choose 1 of 2 Subterranean tiles",
      options: [{ label: "Choose tile A" }, { label: "Choose tile B" }],
      context: "subterranean-tile-pick",
      subterraneanTilePick: { tileInstanceId: "tile_hidden", candidates: ["U1", "U2"] },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    const legalActions: LegalAction[] = [0, 1].map((optionIndex) => ({
      label: `Choose tile ${optionIndex === 0 ? "A" : "B"}`,
      action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex }
    }));

    const { container } = render(
      <PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    const cards = container.querySelectorAll(".promptRewardCard.tileThumb");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("img")?.getAttribute("src")).toBeTruthy();
    expect(cards[1].querySelector("img")?.getAttribute("src")).toBeTruthy();
    expect(cards[0].getAttribute("aria-label")).toBe("Choose tile A");
    expect(cards[1].getAttribute("aria-label")).toBe("Choose tile B");
  });

  it("uses compact resource symbols and amounts instead of spelling out gold and valuables", () => {
    const state = createAdventureGameState({
      seed: "resource-choice-symbols",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: "hex_0_0",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Choose one",
          options: [
            { label: "Gain 3 gold", steps: [{ type: "GAIN_RESOURCES", gold: 3 }] },
            { label: "Gain 1 valuables", steps: [{ type: "GAIN_RESOURCES", valuables: 1 }] }
          ]
        }
      ]
    };
    const legalActions: LegalAction[] = [
      {
        label: "Gain 3 gold",
        action: { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }
      },
      {
        label: "Gain 1 valuables",
        action: { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 }
      }
    ];

    const { container } = render(
      <PromptTray legalActions={legalActions} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    const cards = container.querySelectorAll(".promptRewardCard.resourceReward");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("img")?.getAttribute("src")).toMatch(/resource-gold/i);
    expect(cards[1].querySelector("img")?.getAttribute("src")).toMatch(/resource-valuables/i);
    expect(cards[0].querySelector("small")?.textContent).toBe("+3");
    expect(cards[1].querySelector("small")?.textContent).toBe("+1");
    expect(container.textContent?.toLowerCase()).not.toContain("gain 3 gold");
    expect(container.textContent?.toLowerCase()).not.toContain("gain 1 valuables");
  });
});
