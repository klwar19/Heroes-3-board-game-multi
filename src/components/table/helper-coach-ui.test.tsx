// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInitialGameState } from "@/engine";
import { setHelperCoachPreference, HELPER_COACH_STORAGE_KEY } from "@/lib/helper-coach-preference";
import { HelperCoachStrip } from "./helper-coach-ui";

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("HelperCoachStrip", () => {
  it("renders nothing useful until the player has opted in", () => {
    const state = createInitialGameState("helper-strip-unset");
    const { container } = render(
      <HelperCoachStrip legalActions={[]} state={state} viewerPlayerId="p1" />
    );
    // Preference unset → no strip body (and no "Tips off" chip).
    expect(container.querySelector(".helperCoachStrip")).toBeNull();
    expect(container.querySelector(".helperCoachChip")).toBeNull();
  });

  it("shows a next-step tip when tips are on", () => {
    setHelperCoachPreference("on");
    const state = createInitialGameState("helper-strip-on");
    state.pendingChoice = null;
    state.reactionWindow = null;
    render(<HelperCoachStrip legalActions={[]} state={state} viewerPlayerId="p1" />);
    // After the preference hook hydrates, the strip appears.
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hide tips/i })).toBeTruthy();
  });

  it("Hide tips flips preference to off and shows the re-enable chip", () => {
    setHelperCoachPreference("on");
    const state = createInitialGameState("helper-strip-hide");
    state.pendingChoice = null;
    state.reactionWindow = null;
    render(<HelperCoachStrip legalActions={[]} state={state} viewerPlayerId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Hide tips/i }));
    expect(localStorage.getItem(HELPER_COACH_STORAGE_KEY)).toBe("off");
    expect(screen.getByRole("button", { name: /Tips off/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Drag helper tip/i })).toBeNull();
  });

  it("shows a drag handle when tips are on", () => {
    setHelperCoachPreference("on");
    const state = createInitialGameState("helper-strip-drag");
    state.pendingChoice = null;
    state.reactionWindow = null;
    render(<HelperCoachStrip legalActions={[]} state={state} viewerPlayerId="p1" />);
    expect(screen.getByRole("button", { name: /Drag helper tip/i })).toBeTruthy();
    expect(screen.getByText(/Next step/i)).toBeTruthy();
  });
});
