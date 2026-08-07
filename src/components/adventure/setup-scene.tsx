"use client";

import { useRef } from "react";
import { assetUrl } from "@/lib/asset-url";

const SETUP_SCENE_PLAYLIST = "/assets/ui/setup/setup-scene-playlist.mp4";
/** Time at which the second animation is fully established after the crossfade. */
const SECOND_ANIMATION_START_SECONDS = 3.44;

const FRUIT = [
  { id: "mode", className: "setupSceneFruit--mode" },
  { id: "heroes", className: "setupSceneFruit--heroes" },
  { id: "map", className: "setupSceneFruit--map" },
  { id: "advanced", className: "setupSceneFruit--advanced" }
] as const;

export function SetupSceneArt() {
  const randomizedStart = useRef(false);

  return (
    <div aria-hidden="true" className="setupSceneArt" data-testid="setup-scene-art">
      <span className="setupSceneIllustration" />
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
          event.currentTarget.currentTime = Math.random() < 0.5 ? 0 : SECOND_ANIMATION_START_SECONDS;
        }}
        playsInline
        poster={assetUrl("/assets/ui/setup/setup-scene-attached-final.webp")}
        preload="auto"
        src={assetUrl(SETUP_SCENE_PLAYLIST)}
      />
      {FRUIT.map((fruit) => (
        <span className={`setupScenePaintedFruit ${fruit.className}`} key={fruit.id} />
      ))}

      <span className="setupSceneDragonBreath" />
    </div>
  );
}
