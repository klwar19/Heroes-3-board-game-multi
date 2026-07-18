// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/sound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sound")>();
  return { ...actual, playLibrarySound: vi.fn() };
});

// All shipped story art is on disk (2026-07), so the placeholder-fallback path
// is pinned by FORCING sprite paths back into placeholder mode for one test.
const placeholderMock = vi.hoisted(() => ({ forceSprites: false }));
vi.mock("@/data/story/scenes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/story/scenes")>();
  return {
    ...actual,
    storyAssetIsPlaceholder: (path: string) =>
      (placeholderMock.forceSprites && path.includes("/sprites/")) || actual.storyAssetIsPlaceholder(path)
  };
});

import { playLibrarySound } from "@/lib/sound";
import { StoryOverlay } from "./story-overlay";
import { getStoryScene } from "@/data/story/scenes";

const XIANXIA = getStoryScene("story.demo.xianxia")!;

// Structural preconditions the drive relies on (content can change, structure can't silently).
const NAMED_SPRITE_INDEX = XIANXIA.lines.findIndex((l) => l.speaker !== "narrator" && Boolean(l.sprite));

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.mocked(playLibrarySound).mockClear();
});

function renderScene(sceneId: string, onDone = vi.fn()) {
  render(<StoryOverlay cue={{ id: `evt-${sceneId}`, sceneId }} onDone={onDone} />);
  return onDone;
}

/** Click the dialogue stage — completes the current line, else advances. */
function clickStage() {
  fireEvent.click(document.querySelector(".storyStage")!);
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true }));
  });
}

function lineText(): string {
  return document.querySelector(".storyLineText")?.textContent ?? "";
}

function nameplate(): string | null {
  return document.querySelector(".storyNameplate")?.textContent ?? null;
}

describe("StoryOverlay", () => {
  it("plays the open sting and renders the first line + a named speaker's nameplate", () => {
    expect(NAMED_SPRITE_INDEX).toBeGreaterThan(0);
    renderScene("story.demo.xianxia");
    expect(vi.mocked(playLibrarySound)).toHaveBeenCalledWith("adventure/new-week", 0.4);

    // Line 0 is the narrator: complete the typewriter, text shows, no nameplate.
    clickStage();
    expect(lineText()).toBe(XIANXIA.lines[0].text.en);
    expect(nameplate()).toBeNull();

    // Advance to line 1 (a named speaker) and complete it — nameplate appears.
    clickStage(); // advance to line 1
    clickStage(); // complete line 1
    expect(nameplate()).toBe((XIANXIA.lines[1].speaker as { en: string }).en);
    expect(lineText()).toBe(XIANXIA.lines[1].text.en);
  });

  it("typewriter completes on the first press, then advances — via click AND Space", () => {
    renderScene("story.demo.xianxia");
    // Frozen timers: nothing auto-typed yet.
    expect(lineText().length).toBeLessThan(XIANXIA.lines[0].text.en.length);

    clickStage(); // first press completes the line
    expect(lineText()).toBe(XIANXIA.lines[0].text.en);

    clickStage(); // second press advances to line 1 (fresh, un-typed)
    expect(nameplate()).toBe((XIANXIA.lines[1].speaker as { en: string }).en);
    expect(lineText().length).toBeLessThan(XIANXIA.lines[1].text.en.length);

    pressKey(" "); // Space completes line 1
    expect(lineText()).toBe(XIANXIA.lines[1].text.en);
    pressKey(" "); // Space advances to line 2
    expect(nameplate()).toBe((XIANXIA.lines[2].speaker as { en: string }).en);
  });

  it("Skip jumps to the end — the scene's choices render", () => {
    renderScene("story.demo.xianxia");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    const buttons = document.querySelectorAll(".storyChoiceButton");
    expect(buttons.length).toBe(XIANXIA.choices!.length);
    expect(screen.getByText(XIANXIA.choices![0].text.en)).toBeTruthy();
  });

  it("the EN/VI toggle swaps the visible text and persists the choice", () => {
    renderScene("story.demo.xianxia");
    clickStage(); // complete line 0 in EN
    expect(lineText()).toBe(XIANXIA.lines[0].text.en);

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(lineText()).toBe(XIANXIA.lines[0].text.vi);
    expect(window.localStorage.getItem("binh-story-lang")).toBe("vi");
  });

  it("choices render at scene end and a nextSceneId choice continues into that scene", () => {
    const onDone = renderScene("story.demo.xianxia");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    const chaining = XIANXIA.choices!.find((c) => c.nextSceneId)!;
    const nextScene = getStoryScene(chaining.nextSceneId!)!;
    fireEvent.click(screen.getByText(chaining.text.en));

    // Same overlay session, now playing the follow-up scene's first line.
    expect(onDone).not.toHaveBeenCalled();
    clickStage(); // complete the follow-up's first line
    expect(lineText()).toBe(nextScene.lines[0].text.en);
  });

  it("calls onDone once when the last line resolves (no-choice scene)", () => {
    const onDone = renderScene("story.demo.isekai");
    fireEvent.click(screen.getByRole("button", { name: "Skip" })); // reveal to last line
    expect(onDone).not.toHaveBeenCalled();
    clickStage(); // advance past the last line → done
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stamps the package theme class on the overlay root (xianxia and isekai)", () => {
    const { unmount } = render(
      <StoryOverlay cue={{ id: "x", sceneId: "story.demo.xianxia" }} onDone={vi.fn()} />
    );
    expect(document.querySelector(".storyOverlayBackdrop.xianxiaTheme")).toBeTruthy();
    expect(document.querySelector(".storyOverlayBackdrop.isekaiTheme")).toBeNull();
    unmount();

    render(<StoryOverlay cue={{ id: "i", sceneId: "story.demo.isekai" }} onDone={vi.fn()} />);
    expect(document.querySelector(".storyOverlayBackdrop.isekaiTheme")).toBeTruthy();
  });

  it("renders a DECLARED-placeholder sprite as an initial-letter avatar chip, never a broken <img>", () => {
    placeholderMock.forceSprites = true;
    try {
      renderScene("story.demo.xianxia");
      // Advance to the first named line that carries a sprite.
      for (let i = 0; i < NAMED_SPRITE_INDEX; i += 1) {
        clickStage(); // complete
        clickStage(); // advance
      }
      const avatar = document.querySelector(".storySpriteAvatar");
      expect(avatar).toBeTruthy();
      const speaker = XIANXIA.lines[NAMED_SPRITE_INDEX].speaker as { en: string };
      expect(avatar?.textContent).toBe(speaker.en.charAt(0));
      // No real <img> for a placeholder sprite.
      expect(document.querySelector(".storySpriteImage")).toBeNull();
    } finally {
      placeholderMock.forceSprites = false;
    }
  });

  it("renders the real sprite <img> now that the art shipped (no avatar fallback)", () => {
    renderScene("story.demo.xianxia");
    for (let i = 0; i < NAMED_SPRITE_INDEX; i += 1) {
      clickStage(); // complete
      clickStage(); // advance
    }
    const img = document.querySelector(".storySpriteImage");
    expect(img, "shipped sprite art draws as a real image").toBeTruthy();
    expect(img!.getAttribute("src")).toContain("/assets/story/sprites/");
    expect(document.querySelector(".storySpriteAvatar")).toBeNull();
  });

  it("the history log shows the lines seen so far", () => {
    renderScene("story.demo.xianxia");
    clickStage(); // complete line 0
    clickStage(); // advance to line 1
    clickStage(); // complete line 1
    clickStage(); // advance to line 2

    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    const log = document.querySelector(".storyHistory")!;
    expect(within(log as HTMLElement).getByText(XIANXIA.lines[0].text.en)).toBeTruthy();
    expect(within(log as HTMLElement).getByText(new RegExp(escapeRegExp(XIANXIA.lines[1].text.en)))).toBeTruthy();
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
