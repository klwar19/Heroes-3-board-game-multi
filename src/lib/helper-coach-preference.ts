/**
 * Client preference for the on-screen helper coach (next-step strip +
 * "why can't I play this" card hints).
 *
 * Stored in localStorage so it survives sessions. Until the player answers the
 * lobby prompt, the preference is unset — coach stays OFF so we never surprise
 * veterans mid-game before they choose. After they pick Keep on / Turn off,
 * that choice is sticky until they change it in the coach strip or lobby.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "binh-helper-coach";
const CHANGE_EVENT = "binh-helper-coach-change";

export type HelperCoachPreference = "on" | "off";

function readRaw(): HelperCoachPreference | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "on" || value === "off") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** null = player has not answered the lobby prompt yet. */
export function getHelperCoachPreference(): HelperCoachPreference | null {
  return readRaw();
}

/** True only when the player explicitly kept the helper on. */
export function isHelperCoachEnabled(): boolean {
  return readRaw() === "on";
}

export function setHelperCoachPreference(value: HelperCoachPreference): void {
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
 * React hook: live preference for the coach UI.
 * - `preference` is null until the lobby prompt is answered
 * - `enabled` is true only for preference === "on"
 * - `setPreference` persists + updates every subscriber in this tab
 */
export function useHelperCoachPreference(): {
  preference: HelperCoachPreference | null;
  enabled: boolean;
  setPreference: (value: HelperCoachPreference) => void;
  ready: boolean;
} {
  const [preference, setPreferenceState] = useState<HelperCoachPreference | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount (SSR renders the default, the client
  // adopts the stored preference), mirroring the other browser-preference
  // hooks in this repo (chat-panel, welcome-notice, room-browser).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPreferenceState(readRaw());
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

  const setPreference = useCallback((value: HelperCoachPreference) => {
    setHelperCoachPreference(value);
    setPreferenceState(value);
  }, []);

  return {
    preference,
    enabled: preference === "on",
    setPreference,
    ready
  };
}

/** Test helper — storage key is not a secret, but keep one source of truth. */
export const HELPER_COACH_STORAGE_KEY = STORAGE_KEY;
