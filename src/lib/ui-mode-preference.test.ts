// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectRecommendedUiMode,
  getUiModePreference,
  PHONE_SHORT_SIDE_MAX,
  setUiModePreference,
  UI_MODE_STORAGE_KEY,
  useUiModePreference
} from "./ui-mode-preference";

function stubViewport({ coarse, width, height }: { coarse: boolean; width: number; height: number }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("pointer: coarse") ? coarse : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  );
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ui-mode preference storage", () => {
  it("is unset (null) until the player answers, and never reads garbage as a mode", () => {
    expect(getUiModePreference()).toBeNull();
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "tablet");
    expect(getUiModePreference()).toBeNull();
  });

  it("persists the choice and notifies same-tab subscribers", () => {
    const heard: unknown[] = [];
    const onChange = (event: Event) => heard.push((event as CustomEvent).detail);
    window.addEventListener("binh-ui-mode-change", onChange);
    try {
      setUiModePreference("phone");
      expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("phone");
      expect(getUiModePreference()).toBe("phone");
      expect(heard).toEqual(["phone"]);

      setUiModePreference("computer");
      expect(getUiModePreference()).toBe("computer");
      expect(heard).toEqual(["phone", "computer"]);
    } finally {
      window.removeEventListener("binh-ui-mode-change", onChange);
    }
  });
});

describe("detectRecommendedUiMode", () => {
  it("recommends phone for a coarse pointer on a phone-sized viewport (portrait AND landscape)", () => {
    stubViewport({ coarse: true, width: 390, height: 844 });
    expect(detectRecommendedUiMode()).toBe("phone");
    stubViewport({ coarse: true, width: 844, height: 390 });
    expect(detectRecommendedUiMode()).toBe("phone");
  });

  it("recommends computer for a fine pointer even on a small window (resized desktop)", () => {
    stubViewport({ coarse: false, width: 390, height: 844 });
    expect(detectRecommendedUiMode()).toBe("computer");
  });

  it("recommends computer for a coarse pointer on a large slab (big tablet)", () => {
    stubViewport({ coarse: true, width: PHONE_SHORT_SIDE_MAX + 200, height: PHONE_SHORT_SIDE_MAX + 400 });
    expect(detectRecommendedUiMode()).toBe("computer");
  });

  it("falls back to computer when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(detectRecommendedUiMode()).toBe("computer");
  });
});

describe("useUiModePreference", () => {
  it("hydrates the stored choice, resolves uiMode, and setPreference persists live", () => {
    stubViewport({ coarse: true, width: 390, height: 844 });
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");

    const { result } = renderHook(() => useUiModePreference());
    expect(result.current.ready).toBe(true);
    expect(result.current.preference).toBe("phone");
    expect(result.current.uiMode).toBe("phone");
    expect(result.current.recommended).toBe("phone");

    act(() => {
      result.current.setPreference("computer");
    });
    expect(result.current.uiMode).toBe("computer");
    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("computer");
  });

  it("stays in computer mode while unanswered (the desktop-unchanged default)", () => {
    stubViewport({ coarse: true, width: 390, height: 844 });
    const { result } = renderHook(() => useUiModePreference());
    expect(result.current.preference).toBeNull();
    expect(result.current.uiMode).toBe("computer");
  });

  it("follows a choice made elsewhere in the same tab (the prompt updates the toggle)", () => {
    stubViewport({ coarse: false, width: 1600, height: 900 });
    const { result } = renderHook(() => useUiModePreference());
    act(() => {
      setUiModePreference("phone");
    });
    expect(result.current.preference).toBe("phone");
    expect(result.current.uiMode).toBe("phone");
  });
});
