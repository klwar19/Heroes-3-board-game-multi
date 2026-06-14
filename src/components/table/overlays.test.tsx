// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeutralStepOverlay } from "./overlays";
import type { GameState, LegalAction } from "@/engine";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Minimal state carrying a pre-activation guard pause for the overlay. */
function pauseState(intentTargetName?: string): GameState {
  return {
    players: { p1: { name: "You" }, neutrals: { name: "Neutrals" } },
    combat: {
      attackerPlayerId: "p1",
      units: { guard1: { id: "guard1", name: "Marksmen" } },
      pendingNeutralStep: {
        kind: "pre-activation",
        unitId: "guard1",
        name: "Marksmen",
        reactingPlayerId: "p1",
        intent: { kind: "attack", targetName: intentTargetName }
      }
    }
  } as unknown as GameState;
}

const resume: LegalAction = {
  label: "Let the unit act",
  action: { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" }
};
const castArrow: LegalAction = {
  label: "Cast Magic Arrow",
  action: { type: "CAST_SPELL", playerId: "p1", cardId: "spell.magic_arrow", target: { type: "none" } }
};

describe("NeutralStepOverlay — guard-step pacing", () => {
  it("auto-resumes after 3s when the player has nothing to react with", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(<NeutralStepOverlay legalActions={[resume]} onAction={onAction} state={pauseState("Griffins")} viewerPlayerId="p1" />);

    // The pop-up shows the guard's planned attack and the auto-continue note.
    expect(screen.getByText(/Marksmen is about to attack your Griffins/)).toBeTruthy();
    expect(screen.getByText(/continuing automatically/i)).toBeTruthy();

    // Nothing fires before the beat is up; it resumes itself at 3s.
    act(() => vi.advanceTimersByTime(2000));
    expect(onAction).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onAction).toHaveBeenCalledWith({ type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("waits indefinitely when the player can actually react (no auto-resume)", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    render(
      <NeutralStepOverlay legalActions={[castArrow, resume]} onAction={onAction} state={pauseState()} viewerPlayerId="p1" />
    );

    // A real reaction is on offer, so the pause prompts the player and holds.
    expect(screen.getByText(/Cast a Spell or play an instant/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(10000));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not resume for a player who does not hold the pause", () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    // No CONTINUE action in this viewer's legal actions: they are a spectator
    // to the pause and must never auto-dispatch a resume.
    render(<NeutralStepOverlay legalActions={[]} onAction={onAction} state={pauseState()} viewerPlayerId="p2" />);

    expect(screen.getByText(/Waiting for/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(10000));
    expect(onAction).not.toHaveBeenCalled();
  });
});
