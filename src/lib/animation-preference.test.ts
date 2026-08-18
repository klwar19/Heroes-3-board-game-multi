// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getSkipAnimationsPreference,
  setSkipAnimationsPreference,
  SKIP_ANIMATIONS_STORAGE_KEY,
  useSkipAnimationsPreference
} from "./animation-preference";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("skip-animations preference", () => {
  it("defaults to OFF (animations on) until the player opts in", () => {
    expect(getSkipAnimationsPreference()).toBe(false);
  });

  it("persists the choice under the storage key and reads it back", () => {
    setSkipAnimationsPreference(true);
    expect(window.localStorage.getItem(SKIP_ANIMATIONS_STORAGE_KEY)).toBe("1");
    expect(getSkipAnimationsPreference()).toBe(true);

    setSkipAnimationsPreference(false);
    expect(window.localStorage.getItem(SKIP_ANIMATIONS_STORAGE_KEY)).toBe("0");
    expect(getSkipAnimationsPreference()).toBe(false);
  });

  it("hook hydrates the stored value and updates every subscriber in this tab", () => {
    setSkipAnimationsPreference(true);
    const { result } = renderHook(() => useSkipAnimationsPreference());
    // After hydration the hook reflects the stored ON value.
    expect(result.current.ready).toBe(true);
    expect(result.current.skipAnimations).toBe(true);

    // A second subscriber sees a same-tab change (CustomEvent sync).
    const { result: other } = renderHook(() => useSkipAnimationsPreference());
    act(() => result.current.setSkipAnimations(false));
    expect(result.current.skipAnimations).toBe(false);
    expect(other.current.skipAnimations).toBe(false);
  });
});
