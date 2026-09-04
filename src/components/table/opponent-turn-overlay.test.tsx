// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComputerBattleCue } from "./computer-battle-report";
import {
  ComputerBattleChip,
  computerRecapIsBlocking,
  OpponentTurnOverlay,
} from "./opponent-turn-overlay";

function cue(overrides: Partial<ComputerBattleCue>): ComputerBattleCue {
  return {
    id: "c1",
    playerId: "p2",
    playerName: "P2",
    won: true,
    quick: false,
    opponentLabel: "the neutral guards",
    rewardText: null,
    ...overrides,
  };
}

describe("OpponentTurnOverlay", () => {
  it("shows each battle's outcome + reward and starts the stepped walk on Watch", () => {
    const onWatch = vi.fn();
    const onDismiss = vi.fn();
    render(
      <OpponentTurnOverlay
        cues={[
          cue({ won: true, rewardText: "claimed a mine · +3 gold" }),
          cue({ id: "c2", won: false, opponentLabel: "the neutral guards" }),
        ]}
        hasReplay
        replayPhase="idle"
        onWatch={onWatch}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("P2 defeated the neutral guards")).toBeTruthy();
    expect(screen.getByText("claimed a mine · +3 gold")).toBeTruthy();
    expect(screen.getByText("P2 was defeated by the neutral guards")).toBeTruthy();

    fireEvent.click(screen.getByText("Watch moves (step by step) →"));
    expect(onWatch).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("offers Next while stepping and Confirm when the walk is done", () => {
    const onStepNext = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <OpponentTurnOverlay
        cues={[]}
        hasReplay
        replayPhase="stepping"
        remainingSteps={2}
        onWatch={() => {}}
        onStepNext={onStepNext}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText(/Next step/));
    expect(onStepNext).toHaveBeenCalledTimes(1);

    rerender(
      <OpponentTurnOverlay
        cues={[]}
        hasReplay
        replayPhase="done"
        remainingSteps={0}
        onWatch={() => {}}
        onStepNext={onStepNext}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText("Confirm"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("offers a single Continue button when the opponents did not move", () => {
    const onWatch = vi.fn();
    const onDismiss = vi.fn();
    render(
      <OpponentTurnOverlay
        cues={[cue({ quick: true })]}
        hasReplay={false}
        onWatch={onWatch}
        onDismiss={onDismiss}
      />,
    );
    // A Quick-Combat win reads as a sweep.
    expect(screen.getByText("P2 swept aside the neutral guards")).toBeTruthy();
    expect(screen.queryByText(/Watch moves/)).toBeNull();
    fireEvent.click(screen.getByText("Continue"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onWatch).not.toHaveBeenCalled();
  });

  it("turns Skip confirmations into a per-match auto-play choice", () => {
    const onDismiss = vi.fn();
    const onSkipConfirmations = vi.fn();
    render(
      <OpponentTurnOverlay
        cues={[]}
        hasReplay
        replayPhase="idle"
        onWatch={() => {}}
        onDismiss={onDismiss}
        onSkipConfirmations={onSkipConfirmations}
      />,
    );

    fireEvent.click(screen.getByText("Skip confirmations"));
    expect(onSkipConfirmations).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

/**
 * USER RULE 2026-09-04 (a 1 v 1 + 2 AI multiplayer Clash): "note about AI — not
 * needed, and hides important areas". The blocking modal above is the
 * SINGLE-PLAYER affordance (it gates the movement replay); multiplayer gets a
 * non-covering pill. jsdom cannot compute CSS, so only the DOM contract and the
 * gate are pinned here — the pixel is a real-browser concern.
 */
describe("computer-turn recap — blocking only in single player", () => {
  it("computerRecapIsBlocking: single-player only (multiplayer / legacy CONTROL: false)", () => {
    expect(computerRecapIsBlocking("single-player")).toBe(true);
    expect(computerRecapIsBlocking("multiplayer")).toBe(false);
    expect(computerRecapIsBlocking(undefined)).toBe(false);
  });

  it("the multiplayer chip reports the same battle lines with NO backdrop and no buttons", () => {
    const { container } = render(
      <ComputerBattleChip
        cues={[
          cue({ won: true }),
          cue({ id: "c2", won: false, playerName: "P3" }),
        ]}
      />,
    );
    // The covering layer is gone…
    expect(container.querySelector(".opponentTurnBackdrop")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // …and the information survives on a small status pill.
    const chip = container.querySelector(".computerBattleChip");
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute("role")).toBe("status");
    expect(screen.getByText(/P2 defeated the neutral guards/)).toBeTruthy();
    expect(screen.getByText(/P3 was defeated by the neutral guards/)).toBeTruthy();
  });

  it("CONTROL: the single-player overlay still renders its covering backdrop and gate button", () => {
    const { container } = render(
      <OpponentTurnOverlay
        cues={[cue({ won: true })]}
        hasReplay
        replayPhase="idle"
        onWatch={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(container.querySelector(".opponentTurnBackdrop")).toBeTruthy();
    expect(screen.getByText("Watch moves (step by step) →")).toBeTruthy();
  });

  it("renders nothing at all when no AI battle happened", () => {
    const { container } = render(<ComputerBattleChip cues={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
