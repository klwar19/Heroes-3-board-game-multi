// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCampaign } from "@/data/story/campaigns";
import {
  bindCampaignRoom,
  getCampaignBinding,
  getCampaignProgress,
  isCampaignIntroShown,
  isCampaignOutcomeShown,
  isChapterCompleted,
  isChapterUnlocked,
  markCampaignIntroShown,
  markCampaignOutcomeShown,
  markChapterCompleted
} from "./campaign-progress";

const JIANGHU = getCampaign("jianghu")!;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("campaign completion + unlock chain", () => {
  it("defaults to no progress", () => {
    expect(getCampaignProgress("jianghu")).toEqual({ completed: [] });
    expect(isChapterCompleted("jianghu", "ch1")).toBe(false);
  });

  it("chapter 1 is always unlocked; chapter 2 unlocks only after chapter 1 is completed", () => {
    expect(isChapterUnlocked(JIANGHU, "ch1")).toBe(true);
    expect(isChapterUnlocked(JIANGHU, "ch2")).toBe(false);
    expect(isChapterUnlocked(JIANGHU, "ch3")).toBe(false);

    markChapterCompleted("jianghu", "ch1");

    expect(isChapterUnlocked(JIANGHU, "ch2")).toBe(true);
    // ch3 still needs ch2.
    expect(isChapterUnlocked(JIANGHU, "ch3")).toBe(false);
    // An unknown chapter id never unlocks.
    expect(isChapterUnlocked(JIANGHU, "does-not-exist")).toBe(false);
  });

  it("persists completion and is idempotent", () => {
    markChapterCompleted("jianghu", "ch1");
    markChapterCompleted("jianghu", "ch1");
    expect(getCampaignProgress("jianghu").completed).toEqual(["ch1"]);
    expect(isChapterCompleted("jianghu", "ch1")).toBe(true);
    // Independent per campaign.
    expect(isChapterCompleted("bin-otherworld", "ch1")).toBe(false);
  });

  it("ignores a corrupted stored value (returns defaults, never throws)", () => {
    window.localStorage.setItem("binh-campaign:jianghu", "{ not json");
    expect(getCampaignProgress("jianghu")).toEqual({ completed: [] });
  });
});

describe("per-room campaign binding + one-per-room markers", () => {
  it("binds a room and reads it back; an unbound room is null (CONTROL)", () => {
    expect(getCampaignBinding("sp-unknown")).toBeNull();

    bindCampaignRoom("sp-1", { campaignId: "jianghu", chapterId: "ch1" });
    expect(getCampaignBinding("sp-1")).toEqual({ campaignId: "jianghu", chapterId: "ch1" });
  });

  it("intro/outcome markers default false, flip true, and preserve the binding", () => {
    bindCampaignRoom("sp-1", { campaignId: "bin-otherworld", chapterId: "ch1" });
    expect(isCampaignIntroShown("sp-1")).toBe(false);
    expect(isCampaignOutcomeShown("sp-1")).toBe(false);

    markCampaignIntroShown("sp-1");
    expect(isCampaignIntroShown("sp-1")).toBe(true);
    expect(isCampaignOutcomeShown("sp-1")).toBe(false);

    markCampaignOutcomeShown("sp-1");
    expect(isCampaignOutcomeShown("sp-1")).toBe(true);
    // The binding itself survives the marker writes.
    expect(getCampaignBinding("sp-1")).toEqual({
      campaignId: "bin-otherworld",
      chapterId: "ch1",
      introShown: true,
      outcomeShown: true
    });
  });

  it("marking an UNBOUND room is a no-op — it never conjures a binding", () => {
    markCampaignIntroShown("sp-none");
    markCampaignOutcomeShown("sp-none");
    expect(getCampaignBinding("sp-none")).toBeNull();
    expect(isCampaignIntroShown("sp-none")).toBe(false);
  });
});

describe("SSR safety", () => {
  it("reads default and writes no-op when window is absent (never throws)", () => {
    vi.stubGlobal("window", undefined);
    expect(getCampaignProgress("jianghu")).toEqual({ completed: [] });
    expect(getCampaignBinding("sp-1")).toBeNull();
    expect(isChapterUnlocked(JIANGHU, "ch1")).toBe(true);
    // Writes silently do nothing (no window).
    expect(() => markChapterCompleted("jianghu", "ch1")).not.toThrow();
    expect(() => bindCampaignRoom("sp-1", { campaignId: "jianghu", chapterId: "ch1" })).not.toThrow();
  });
});
