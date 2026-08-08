// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupSceneArt } from "./setup-scene";
import { UI_MODE_STORAGE_KEY, setUiModePreference } from "@/lib/ui-mode-preference";

afterEach(cleanup);
// The preference is per-browser localStorage; every case states its own mode so
// no test inherits another's (the unset default is the shipped desktop path).
beforeEach(() => window.localStorage.clear());

describe("SetupSceneArt — setup video background", () => {
  it("renders the looping menu video with its poster, both through assetUrl()", () => {
    const { container } = render(<SetupSceneArt />);
    const video = container.querySelector("video.setupSceneVideo") as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    // The path must flow through assetUrl() so the CDN rewrite reaches it; in
    // the test env (no NEXT_PUBLIC_ASSET_BASE_URL) that leaves it root-relative.
    expect(video?.getAttribute("src")).toBe("/assets/ui/setup/setup-scene-playlist-v6.mp4");
    expect(video?.getAttribute("poster")).toBe(
      "/assets/ui/setup/setup-scene-attached-final.webp"
    );
    // Decorative background: autoplay, muted, looping, inline — never a control surface.
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.hasAttribute("playsinline")).toBe(true);
    expect(video?.hasAttribute("controls")).toBe(false);
  });

  it("keeps the still illustration layer as the reduced-motion / no-video fallback", () => {
    const { container } = render(<SetupSceneArt />);
    // The CSS hides .setupSceneVideo under prefers-reduced-motion and falls back
    // to this painted still; it must always be present in the DOM behind the video.
    expect(container.querySelector(".setupSceneIllustration")).not.toBeNull();
    expect(screen.getByTestId("setup-scene-art").getAttribute("aria-hidden")).toBe("true");
  });
});

/**
 * Phone mode must not LOAD the ~2MB playlist at all: a `display: none` <video>
 * still downloads it, so the ELEMENT must never be mounted. The painted still
 * layer stays, so the scene is not a blank hole.
 */
describe("SetupSceneArt — phone mode never loads the video", () => {
  it("mounts NO setup-scene video in phone mode, and keeps the still art", () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    const { container } = render(<SetupSceneArt />);
    expect(container.querySelector("video")).toBeNull();
    // Not merely src-less / hidden: no element carrying that URL exists at all.
    expect(container.innerHTML).not.toContain("setup-scene-playlist");
    // The scene still paints — the poster art is this layer's CSS background.
    expect(container.querySelector(".setupSceneIllustration")).not.toBeNull();
    expect(container.querySelector(".setupSceneDragonBreath")).not.toBeNull();
  });

  it("CONTROL: computer mode and an UNSET preference both render the video as before", () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    const computer = render(<SetupSceneArt />);
    expect(
      computer.container.querySelector("video.setupSceneVideo")?.getAttribute("src")
    ).toBe("/assets/ui/setup/setup-scene-playlist-v6.mp4");
    cleanup();

    window.localStorage.removeItem(UI_MODE_STORAGE_KEY);
    const unset = render(<SetupSceneArt />);
    expect(unset.container.querySelector("video.setupSceneVideo")?.getAttribute("src")).toBe(
      "/assets/ui/setup/setup-scene-playlist-v6.mp4"
    );
  });

  it("omits the video on the FIRST render pass too, before the preference hook hydrates", () => {
    // `useUiModePreference` reads localStorage in an effect, so its first render
    // reports "computer". Mounting the <video> for even one frame is what starts
    // the 2MB fetch, so the gate also takes a SYNCHRONOUS read. RTL's render()
    // flushes effects inside act(), which hides that frame — a server-style
    // single-pass render is what exposes it (jsdom still has localStorage here).
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
    expect(renderToStaticMarkup(<SetupSceneArt />)).not.toContain("setup-scene-playlist");

    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    expect(renderToStaticMarkup(<SetupSceneArt />)).toContain("setup-scene-playlist");
  });

  it("unmounts the video when the in-game toggle flips to phone mid-session", () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
    const { container } = render(<SetupSceneArt />);
    expect(container.querySelector("video.setupSceneVideo")).not.toBeNull();

    // Exactly what the table menu's 📱/💻 toggle calls (same-tab CustomEvent).
    act(() => setUiModePreference("phone"));
    expect(container.querySelector("video")).toBeNull();

    // …and back: switching to Computer restores the video.
    act(() => setUiModePreference("computer"));
    expect(container.querySelector("video.setupSceneVideo")).not.toBeNull();
  });
});
