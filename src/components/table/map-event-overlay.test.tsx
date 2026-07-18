// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapEventOverlay, type MapEventCue } from "./overlays";

vi.mock("@/lib/sound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sound")>();
  return { ...actual, playLibrarySound: vi.fn() };
});

import { playLibrarySound } from "@/lib/sound";

afterEach(() => {
  cleanup();
  vi.mocked(playLibrarySound).mockClear();
});

function cue(overrides: Partial<MapEventCue> = {}): MapEventCue {
  return {
    id: "evt1",
    round: 6,
    messages: [
      "Every player gains 3 gold.",
      "The black cubes are cleared from Windmill, Water Wheel (2 fields)."
    ],
    ...overrides
  };
}

describe("MapEventOverlay", () => {
  it("shows the round and one line per fired effect, with a sting", () => {
    render(<MapEventOverlay cue={cue()} onDone={() => {}} />);
    expect(screen.getByText("Map event!")).toBeTruthy();
    expect(screen.getByText("round 6")).toBeTruthy();
    expect(screen.getByText("Every player gains 3 gold.")).toBeTruthy();
    expect(screen.getByText(/black cubes are cleared/)).toBeTruthy();
    expect(document.querySelector(".mapEventCard")).toBeTruthy();
    expect(vi.mocked(playLibrarySound)).toHaveBeenCalledWith("adventure/new-week", 0.4);
  });

  it("uses a distinct 'Final round!' header when the cue is the VP final-round warning", () => {
    render(
      <MapEventOverlay
        cue={cue({ finalRound: true, round: 20, messages: ["This is the final round — the game ends once it is over."] })}
        onDone={() => {}}
      />
    );
    expect(screen.getByText("Final round!")).toBeTruthy();
    expect(screen.queryByText("Map event!")).toBeNull();
    expect(screen.getByText("round 20")).toBeTruthy();
    expect(screen.getByText(/game ends once it is over/i)).toBeTruthy();
  });

  it("dismisses on the button and on a backdrop click", () => {
    const onDone = vi.fn();
    render(<MapEventOverlay cue={cue()} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Understood" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector(".mapEventBackdrop")!);
    expect(onDone).toHaveBeenCalledTimes(2);
    // A click INSIDE the card must not dismiss.
    fireEvent.click(document.querySelector(".mapEventCard")!);
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
