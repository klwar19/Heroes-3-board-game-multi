// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComputerBattleCue } from "./computer-battle-report";
import { OpponentTurnOverlay } from "./opponent-turn-overlay";

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
  it("shows each battle's outcome + reward and starts the replay on Watch", () => {
    const onWatch = vi.fn();
    const onDismiss = vi.fn();
    render(
      <OpponentTurnOverlay
        cues={[
          cue({ won: true, rewardText: "claimed a mine · +3 gold" }),
          cue({ id: "c2", won: false, opponentLabel: "the neutral guards" }),
        ]}
        hasReplay
        onWatch={onWatch}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("P2 defeated the neutral guards")).toBeTruthy();
    expect(screen.getByText("claimed a mine · +3 gold")).toBeTruthy();
    expect(screen.getByText("P2 was defeated by the neutral guards")).toBeTruthy();

    fireEvent.click(screen.getByText("Watch their moves →"));
    expect(onWatch).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
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
    expect(screen.queryByText("Watch their moves →")).toBeNull();
    fireEvent.click(screen.getByText("Continue"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onWatch).not.toHaveBeenCalled();
  });
});
