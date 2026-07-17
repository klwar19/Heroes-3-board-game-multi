// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getStoryLanguage,
  setStoryLanguage,
  STORY_LANGUAGE_STORAGE_KEY,
  useStoryLanguage
} from "./story-language";

beforeEach(() => {
  window.localStorage.clear();
});

describe("story-language preference storage", () => {
  it("defaults to 'en' and never reads garbage as a language", () => {
    expect(getStoryLanguage()).toBe("en");
    window.localStorage.setItem(STORY_LANGUAGE_STORAGE_KEY, "fr");
    expect(getStoryLanguage()).toBe("en");
  });

  it("persists the choice and notifies same-tab subscribers", () => {
    const heard: unknown[] = [];
    const onChange = (event: Event) => heard.push((event as CustomEvent).detail);
    window.addEventListener("binh-story-lang-change", onChange);
    try {
      setStoryLanguage("vi");
      expect(window.localStorage.getItem(STORY_LANGUAGE_STORAGE_KEY)).toBe("vi");
      expect(getStoryLanguage()).toBe("vi");
      expect(heard).toEqual(["vi"]);

      setStoryLanguage("en");
      expect(getStoryLanguage()).toBe("en");
      expect(heard).toEqual(["vi", "en"]);
    } finally {
      window.removeEventListener("binh-story-lang-change", onChange);
    }
  });
});

describe("useStoryLanguage", () => {
  it("hydrates the stored choice and toggles/persists live", () => {
    window.localStorage.setItem(STORY_LANGUAGE_STORAGE_KEY, "vi");
    const { result } = renderHook(() => useStoryLanguage());
    expect(result.current.ready).toBe(true);
    expect(result.current.language).toBe("vi");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.language).toBe("en");
    expect(window.localStorage.getItem(STORY_LANGUAGE_STORAGE_KEY)).toBe("en");

    act(() => {
      result.current.setLanguage("vi");
    });
    expect(result.current.language).toBe("vi");
  });

  it("defaults to 'en' while unset (SSR-safe default)", () => {
    const { result } = renderHook(() => useStoryLanguage());
    expect(result.current.language).toBe("en");
  });

  it("follows a choice made elsewhere in the same tab", () => {
    const { result } = renderHook(() => useStoryLanguage());
    act(() => {
      setStoryLanguage("vi");
    });
    expect(result.current.language).toBe("vi");
  });
});
