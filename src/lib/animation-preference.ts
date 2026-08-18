/**
 * Client preference: "Skip animations" for the table. When ON, the presentation
 * layer (dice rolls, card-flight, spell FX, event/story cues, combat reveals) is
 * skipped immediately instead of playing out — the game jumps straight to the
 * result. Reaction/instant windows are engine state, NOT presentation cues, so
 * they are UNAFFECTED: a player who skips animations still gets their reaction
 * tray and unlimited time to answer it. Default OFF, so nobody who has not opted
 * in sees any change.
 *
 * Stored in localStorage (per BROWSER, never in GameState, never sent to the
 * server). Mirrors the `binh-ui-mode` / `binh-helper-coach` preference pattern
 * (storage event for cross-tab sync, CustomEvent for same-tab sync).
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "binh-skip-animations";
const CHANGE_EVENT = "binh-skip-animations-change";

function readRaw(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** False (animations on) until the player opts into skipping. */
export function getSkipAnimationsPreference(): boolean {
  return readRaw();
}

export function setSkipAnimationsPreference(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Private mode / quota — still notify this tab so the session can use it.
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  } catch {
    // ignore
  }
}

/**
 * React hook: live "skip animations" preference.
 * - `skipAnimations` is false until the player turns it on
 * - `setSkipAnimations` persists + updates every subscriber in this tab
 * - `ready` flips true once the client has hydrated the stored value (SSR
 *   renders animations-on, the client adopts the stored value)
 */
export function useSkipAnimationsPreference(): {
  skipAnimations: boolean;
  setSkipAnimations: (value: boolean) => void;
  ready: boolean;
} {
  const [skipAnimations, setState] = useState(false);
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setState(readRaw());
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setState(readRaw());
      }
    };
    const onLocal = () => setState(readRaw());

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocal);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setSkipAnimations = useCallback((value: boolean) => {
    setSkipAnimationsPreference(value);
    setState(value);
  }, []);

  return { skipAnimations, setSkipAnimations, ready };
}

/** Test helper — one source of truth for the storage key. */
export const SKIP_ANIMATIONS_STORAGE_KEY = STORAGE_KEY;
