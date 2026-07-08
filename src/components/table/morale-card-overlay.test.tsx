// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoraleCardOverlay } from "./overlays";
import { MORALE_CUE_SOUNDS, type MoraleCardCue } from "./morale-card-cue";

vi.mock("@/lib/sound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sound")>();
  return { ...actual, playLibrarySound: vi.fn() };
});

import { playLibrarySound } from "@/lib/sound";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(playLibrarySound).mockClear();
});

function cue(overrides: Partial<MoraleCardCue> = {}): MoraleCardCue {
  return {
    id: "cue1",
    playerId: "p1",
    playerName: "Alice",
    viewerIsHolder: false,
    cardId: "morale.negative.skip_activation",
    cardName: "Negative Morale: Skip Activation Check",
    image: "/assets/morale-cards/sheet/negative-skip-activation.png",
    polarity: "negative",
    kind: "used",
    headline: "Negative Morale strikes!",
    detail: "The −1 comes up — this unit's activation is skipped.",
    soundKey: MORALE_CUE_SOUNDS.bad,
    ...overrides
  };
}

describe("MoraleCardOverlay", () => {
  it("shows the card, the holder and what happened, styled by polarity", () => {
    render(<MoraleCardOverlay cue={cue()} onDone={() => {}} />);
    expect(screen.getByText("Negative Morale strikes!")).toBeTruthy();
    expect(screen.getByText("Negative Morale: Skip Activation Check")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText(/activation is skipped/)).toBeTruthy();
    expect(document.querySelector(".moraleCueCard.negative")).toBeTruthy();
    expect(document.querySelector(".moraleCueCard.positive")).toBeNull();
    expect(screen.getByAltText("Negative Morale: Skip Activation Check")).toBeTruthy();
  });

  it("plays the cue's own morale sting on mount (bad for a strike, good for a gain)", () => {
    render(<MoraleCardOverlay cue={cue()} onDone={() => {}} />);
    expect(playLibrarySound).toHaveBeenCalledWith(MORALE_CUE_SOUNDS.bad, expect.any(Number));

    vi.mocked(playLibrarySound).mockClear();
    render(
      <MoraleCardOverlay
        cue={cue({
          id: "cue2",
          polarity: "positive",
          kind: "drawn",
          headline: "Positive Morale!",
          soundKey: MORALE_CUE_SOUNDS.good,
          viewerIsHolder: true
        })}
        onDone={() => {}}
      />
    );
    expect(playLibrarySound).toHaveBeenCalledWith(MORALE_CUE_SOUNDS.good, expect.any(Number));
  });

  it("labels the viewing seat's own moment as 'You'", () => {
    render(<MoraleCardOverlay cue={cue({ viewerIsHolder: true })} onDone={() => {}} />);
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("dismisses on click, and by itself once the moment has been seen", () => {
    const onDone = vi.fn();
    render(<MoraleCardOverlay cue={cue()} onDone={onDone} />);
    fireEvent.click(screen.getByRole("status"));
    expect(onDone).toHaveBeenCalledTimes(1);

    cleanup();
    vi.useFakeTimers();
    const autoDone = vi.fn();
    render(<MoraleCardOverlay cue={cue({ id: "cue3" })} onDone={autoDone} />);
    act(() => {
      vi.advanceTimersByTime(4400);
    });
    expect(autoDone).toHaveBeenCalledTimes(1);
  });
});
