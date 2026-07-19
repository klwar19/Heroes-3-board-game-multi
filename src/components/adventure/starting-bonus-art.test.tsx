// @vitest-environment jsdom
/**
 * Scenario starting bonus (rulebook p.10): the "roll Resource dice" vs "get an
 * Artifact" options carry no specific card id, so each must show a representative
 * glyph (resource die / artifact) — a picture beats two look-alike text buttons.
 * Scoped to the "Starting bonus" prompt so no other resource/Search prompt changes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions } from "@/engine";

afterEach(cleanup);

describe("Starting bonus tray — representative glyph art per option", () => {
  it("shows a resource-die glyph on the dice option and an artifact glyph on the artifact option", () => {
    const state = createAdventureGameState({
      seed: "bonus-art",
      difficulty: "normal",
      rollFirstPlayer: false,
      startingBonus: true
    });
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    render(
      <PromptTray legalActions={getLegalActions(state, "p1")} onAction={vi.fn()} state={state} viewerPlayerId="p1" />
    );

    const diceOption = screen.getByRole("button", { name: /Resource Dice/i });
    expect(diceOption.querySelector("img")?.getAttribute("src")).toContain("starting-bonus-resource");

    const artifactOption = screen.getByRole("button", { name: /Artifact Deck/i });
    expect(artifactOption.querySelector("img")?.getAttribute("src")).toContain("starting-bonus-artifact");

    // The images are non-draggable so a stray-pixel click still picks the option.
    for (const button of [diceOption, artifactOption]) {
      expect(button.querySelector("img")?.getAttribute("draggable")).toBe("false");
    }
  });
});
