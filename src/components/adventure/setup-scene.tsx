"use client";

import { useRef, useState } from "react";
import { assetUrl } from "@/lib/asset-url";
import { getUiModePreference, useUiModePreference } from "@/lib/ui-mode-preference";

const SETUP_SCENE_PLAYLIST = "/assets/ui/setup/setup-scene-playlist-v6.mp4";
/** Time at which the second animation is fully established after the crossfade. */
const SECOND_ANIMATION_START_SECONDS = 7.29;

const FRUIT = [
  { id: "mode", className: "setupSceneFruit--mode" },
  { id: "heroes", className: "setupSceneFruit--heroes" },
  { id: "map", className: "setupSceneFruit--map" },
  { id: "advanced", className: "setupSceneFruit--advanced" }
] as const;

export function SetupSceneArt({ cooperative = false }: { cooperative?: boolean }) {
  const randomizedStart = useRef(false);
  /*
   * PHONE MODE never LOADS the ~2MB scene playlist. Hiding it with CSS is not
   * enough — a `display: none` video with `preload="auto"` still downloads — so the
   * element itself must not be mounted. The painted still
   * (`.setupSceneIllustration`, the video's own poster art) sits at the same
   * inset/z-index underneath, so the scene is never a blank hole.
   *
   * Gated on the LIVE preference so the in-game 📱/💻 toggle unmounts the video
   * mid-session. `useUiModePreference` hydrates localStorage in an effect, so its
   * FIRST render always reports "computer" — and mounting the <video> for even
   * one frame is what starts the fetch. Until it is `ready` we therefore use a
   * synchronous read of the same stored key. Safe here: the setup lobby only ever
   * renders client-side (page.tsx's `state` starts null, so no server frame can
   * contain this component), hence no hydration mismatch to create.
   */
  const { ready, uiMode } = useUiModePreference();
  const [storedPhoneOnMount] = useState(() => getUiModePreference() === "phone");
  const phoneMode = ready ? uiMode === "phone" : storedPhoneOnMount;

  return (
    <div aria-hidden="true" className="setupSceneArt" data-testid="setup-scene-art">
      <span className={`setupSceneIllustration${cooperative ? " setupSceneIllustration--coop" : ""}`} />
      {phoneMode || cooperative ? null : (
        <video
          autoPlay
          className="setupSceneVideo"
          loop
          muted
          onLoadedMetadata={(event) => {
            if (randomizedStart.current) {
              return;
            }
            randomizedStart.current = true;
            event.currentTarget.currentTime =
              Math.random() < 0.5 ? 0 : SECOND_ANIMATION_START_SECONDS;
          }}
          playsInline
          poster={assetUrl("/assets/ui/setup/setup-scene-attached-final.webp")}
          preload="auto"
          src={assetUrl(SETUP_SCENE_PLAYLIST)}
        />
      )}
      {FRUIT.map((fruit) => (
        <span className={`setupScenePaintedFruit ${fruit.className}`} key={fruit.id} />
      ))}

      <span className="setupSceneDragonBreath" />
    </div>
  );
}
