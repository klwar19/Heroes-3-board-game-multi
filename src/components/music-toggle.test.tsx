// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MusicToggle } from "./music-toggle";
import { __resetMusicForTests, isMusicMuted } from "@/lib/music";

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "Audio",
    class {
      play() {
        return Promise.resolve();
      }
      pause() {}
    } as unknown as typeof Audio
  );
  __resetMusicForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MusicToggle", () => {
  it("turns the music off and back on when clicked", () => {
    render(<MusicToggle />);
    const button = screen.getByRole("button");

    expect(isMusicMuted()).toBe(false);
    expect(button.textContent).toContain("Music on");
    expect(button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button);
    expect(isMusicMuted()).toBe(true);
    expect(button.textContent).toContain("Music off");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);
    expect(isMusicMuted()).toBe(false);
    expect(button.textContent).toContain("Music on");
  });
});
