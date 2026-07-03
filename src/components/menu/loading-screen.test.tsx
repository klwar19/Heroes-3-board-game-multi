// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen } from "./loading-screen";
import { UI_ART_SLOTS } from "@/data/ui-art";

/**
 * jsdom never loads images, so the preload hook is driven by hand through a
 * fake Image whose onload/onerror the test fires. This asserts the OBSERVABLE
 * outcome — the progress bar value and the "n / m assets" counter advance —
 * not just that images were constructed.
 */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";

  constructor() {
    FakeImage.instances.push(this);
  }
}

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bar = () => screen.getByRole("progressbar");

describe("LoadingScreen", () => {
  it("advances the progress bar as preloads resolve, counting errors too", () => {
    render(
      <LoadingScreen
        preloadSlots={["menu-backdrop", "lobby-backdrop"]}
        status="connecting"
        title="Joining room…"
      />
    );

    expect(screen.getByRole("heading", { name: "Joining room…" })).toBeTruthy();
    expect(screen.getByText("connecting")).toBeTruthy();

    // Two slots requested → two preloads, none resolved yet.
    expect(FakeImage.instances).toHaveLength(2);
    expect(FakeImage.instances.map((image) => image.src)).toEqual([
      UI_ART_SLOTS["menu-backdrop"].src,
      UI_ART_SLOTS["lobby-backdrop"].src
    ]);
    expect(bar().getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("0 / 2 assets")).toBeTruthy();

    act(() => {
      FakeImage.instances[0].onload?.();
    });
    expect(bar().getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("1 / 2 assets")).toBeTruthy();

    // A missing file must not stall the bar: errors count as resolved.
    act(() => {
      FakeImage.instances[1].onerror?.();
    });
    expect(bar().getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("2 / 2 assets")).toBeTruthy();
  });

  it("keeps progress across re-renders with an equal manifest (fresh array literal)", () => {
    const { rerender } = render(
      <LoadingScreen preloadSlots={["menu-backdrop", "lobby-backdrop"]} title="Loading…" />
    );
    act(() => {
      FakeImage.instances[0].onload?.();
    });
    expect(bar().getAttribute("aria-valuenow")).toBe("50");

    rerender(<LoadingScreen preloadSlots={["menu-backdrop", "lobby-backdrop"]} title="Loading…" />);

    // No restart: same two preloads, progress retained.
    expect(FakeImage.instances).toHaveLength(2);
    expect(bar().getAttribute("aria-valuenow")).toBe("50");
  });

  it("renders an indeterminate bar when there is nothing to preload", () => {
    render(<LoadingScreen title="Opening the main menu…" />);
    expect(bar().getAttribute("aria-valuenow")).toBeNull();
    expect(screen.queryByText(/assets/)).toBeNull();
  });
});
