// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SetupSceneArt } from "./setup-scene";

afterEach(cleanup);

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
