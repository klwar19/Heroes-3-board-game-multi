// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  getHelperCoachPreference,
  HELPER_COACH_STORAGE_KEY,
  isHelperCoachEnabled,
  setHelperCoachPreference
} from "./helper-coach-preference";
import { HelperCoachLobbyPrompt } from "@/components/table/helper-coach-ui";

beforeEach(() => {
  localStorage.clear();
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
});
