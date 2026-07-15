/**
 * Client preference for the table UI mode: the classic Computer (desktop)
 * layout vs the Phone layout (bottom tab bar, one full-screen panel at a time).
 *
 * Stored in localStorage so it survives sessions — per BROWSER, deliberately
 * not per account: the same player wants Computer mode on their desktop and
 * Phone mode on their phone. Until the player answers the pre-game prompt the
 * preference is unset and the UI stays in Computer mode, so nothing about the
 * existing desktop experience changes for anyone who has not opted in.
 *
 * Pure presentation: this value never enters GameState and is never sent to
 * the server. Mirrors the `binh-helper-coach` preference pattern
 * (null-until-answered, storage event for cross-tab sync, CustomEvent for
 * same-tab sync).
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "binh-ui-mode";
const CHANGE_EVENT = "binh-ui-mode-change";

export type UiMode = "computer" | "phone";

function readRaw(): UiMode | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "computer" || value === "phone") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** null = the player has not answered the pre-game mode prompt yet. */
export function getUiModePreference(): UiMode | null {
  return readRaw();
}

export function setUiModePreference(value: UiMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
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
 * Which mode the pre-game prompt should RECOMMEND (pre-highlight) for this
 * device. Never auto-applied — the player always picks.
 *
 * "Phone-shaped" = a coarse (touch) primary pointer AND a short viewport side
 * of at most PHONE_SHORT_SIDE_MAX px. The short side is what layout actually
 * fights over (a phone is ~390 portrait / ~390 landscape short side; an iPad
 * portrait is 768–834), so it beats width-only checks that flip with rotation.
 */
export const PHONE_SHORT_SIDE_MAX = 820;

export function detectRecommendedUiMode(): UiMode {
  if (typeof window === "undefined") {
    return "computer";
  }
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    return coarse && shortSide > 0 && shortSide <= PHONE_SHORT_SIDE_MAX ? "phone" : "computer";
  } catch {
    return "computer";
  }
}

/**
 * React hook: live UI-mode preference.
 * - `preference` is null until the pre-game prompt is answered
 * - `uiMode` resolves to "computer" until the player explicitly picks "phone"
 * - `recommended` is the device-detected suggestion for the prompt
 * - `setPreference` persists + updates every subscriber in this tab
 * - `ready` flips true once the client has hydrated the stored value
 */
export function useUiModePreference(): {
  preference: UiMode | null;
  uiMode: UiMode;
  recommended: UiMode;
  setPreference: (value: UiMode) => void;
  ready: boolean;
} {
  const [preference, setPreferenceState] = useState<UiMode | null>(null);
  const [recommended, setRecommended] = useState<UiMode>("computer");
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount (SSR renders the computer default, the
  // client adopts the stored preference), mirroring helper-coach-preference.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPreferenceState(readRaw());
    setRecommended(detectRecommendedUiMode());
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setPreferenceState(readRaw());
      }
    };
    const onLocal = () => setPreferenceState(readRaw());

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocal);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setPreference = useCallback((value: UiMode) => {
    setUiModePreference(value);
    setPreferenceState(value);
  }, []);

  return {
    preference,
    uiMode: preference === "phone" ? "phone" : "computer",
    recommended,
    setPreference,
    ready
  };
}

/** Test helper — storage key is not a secret, but keep one source of truth. */
export const UI_MODE_STORAGE_KEY = STORAGE_KEY;
