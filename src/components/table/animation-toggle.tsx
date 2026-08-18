/**
 * Table-menu switch for the "Skip animations" preference (see
 * src/lib/animation-preference.ts). Sits next to the UI-mode and music toggles.
 */
"use client";

import { Film, FastForward } from "lucide-react";
import { useSkipAnimationsPreference } from "@/lib/animation-preference";

export function AnimationToggle() {
  const { skipAnimations, setSkipAnimations, ready } = useSkipAnimationsPreference();

  if (!ready) {
    return null;
  }

  return (
    <button
      aria-pressed={skipAnimations}
      className={`uiModeToggle ${skipAnimations ? "phone" : ""}`}
      onClick={() => setSkipAnimations(!skipAnimations)}
      title={
        skipAnimations
          ? "Animations are SKIPPED — jump straight to results. Click to play them again."
          : "Skip animations — jump straight to results (you can still react in instant windows)."
      }
      type="button"
    >
      {skipAnimations ? <FastForward aria-hidden="true" size={13} /> : <Film aria-hidden="true" size={13} />}
      <span>{skipAnimations ? "Skip FX" : "Animations"}</span>
    </button>
  );
}
