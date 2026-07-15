// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  getHelperCoachPreference,
  HELPER_COACH_STORAGE_KEY,
  isHelperCoachEnabled,
  setHelperCoachPreference
} from "./helper-coach-preference";
import { UI_MODE_STORAGE_KEY } from "./ui-mode-preference";
import { HelperCoachLobbyPrompt } from "@/components/table/helper-coach-ui";

beforeEach(() => {
  localStorage.clear();
  // The pre-game UI-mode prompt outranks the coach prompt (they must never
  // stack); these tests are about the COACH's own behaviour, so answer the
  // mode question up front. The deferral itself is pinned below and in
  // src/app/page-phone-mode.test.tsx.
  localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});
afterEach(cleanup);

describe("helper-coach preference storage", () => {
  it("starts unset and disabled until the player chooses", () => {
    expect(getHelperCoachPreference()).toBeNull();
    expect(isHelperCoachEnabled()).toBe(false);
  });

  it("persists on / off in localStorage", () => {
    setHelperCoachPreference("on");
    expect(localStorage.getItem(HELPER_COACH_STORAGE_KEY)).toBe("on");
    expect(isHelperCoachEnabled()).toBe(true);

    setHelperCoachPreference("off");
    expect(localStorage.getItem(HELPER_COACH_STORAGE_KEY)).toBe("off");
    expect(isHelperCoachEnabled()).toBe(false);
  });
});

describe("HelperCoachLobbyPrompt", () => {
  it("asks once and saves Keep tips on", () => {
    render(<HelperCoachLobbyPrompt />);
    expect(screen.getByRole("dialog", { name: /On-screen helper tips/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Keep tips on/i }));
    expect(localStorage.getItem(HELPER_COACH_STORAGE_KEY)).toBe("on");
    expect(screen.queryByRole("dialog", { name: /On-screen helper tips/i })).toBeNull();
  });

  it("saves Turn tips off and does not reappear", () => {
    render(<HelperCoachLobbyPrompt />);
    fireEvent.click(screen.getByRole("button", { name: /Turn tips off/i }));
    expect(localStorage.getItem(HELPER_COACH_STORAGE_KEY)).toBe("off");
    cleanup();
    render(<HelperCoachLobbyPrompt />);
    expect(screen.queryByRole("dialog", { name: /On-screen helper tips/i })).toBeNull();
  });

  it("force re-opens the prompt after a choice", () => {
    setHelperCoachPreference("off");
    render(<HelperCoachLobbyPrompt force />);
    expect(screen.getByRole("dialog", { name: /On-screen helper tips/i })).toBeTruthy();
  });

  it("waits while the UI-mode question is unanswered (two prompts never stack)", () => {
    localStorage.removeItem(UI_MODE_STORAGE_KEY);
    render(<HelperCoachLobbyPrompt />);
    expect(screen.queryByRole("dialog", { name: /On-screen helper tips/i })).toBeNull();

    // A forced open (the lobby "Change" button) is the player's own ask —
    // it must NOT be held back by the mode question.
    cleanup();
    render(<HelperCoachLobbyPrompt force />);
    expect(screen.getByRole("dialog", { name: /On-screen helper tips/i })).toBeTruthy();
  });
});
