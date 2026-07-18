/**
 * Client preference for the visual-novel STORY overlay language: English or
 * Vietnamese. The story system is bilingual by construction (every line/choice
 * carries `.en` and `.vi`); this preference chooses which the overlay shows.
 *
 * Stored in localStorage so it survives sessions — per BROWSER, deliberately
 * not per account (a shared device may prefer one language regardless of who is
 * signed in). Pure presentation: this value never enters GameState and is never
 * sent to the server.
 *
 * Mirrors the `binh-ui-mode` preference pattern (SSR-safe read, storage event
 * for cross-tab sync, CustomEvent for same-tab sync). Unlike UI mode there is
 * no "unset" state: the default is "en" so the overlay always has a language.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "binh-story-lang";
const CHANGE_EVENT = "binh-story-lang-change";

export type StoryLanguage = "en" | "vi";

function readRaw(): StoryLanguage {
  if (typeof window === "undefined") {
    return "en";
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "en" || value === "vi") {
      return value;
    }
    return "en";
  } catch {
    return "en";
  }
}

/** The stored language, defaulting to "en" (SSR-safe). */
export function getStoryLanguage(): StoryLanguage {
  return readRaw();
}

export function setStoryLanguage(value: StoryLanguage): void {
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
 * React hook: live story-language preference.
 * - `language` resolves to "en" until the client hydrates a stored "vi"
 * - `setLanguage` persists + updates every subscriber in this tab
 * - `toggle` flips en↔vi
 * - `ready` flips true once the client has hydrated the stored value
 */
export function useStoryLanguage(): {
  language: StoryLanguage;
  setLanguage: (value: StoryLanguage) => void;
  toggle: () => void;
  ready: boolean;
} {
  const [language, setLanguageState] = useState<StoryLanguage>("en");
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount (SSR renders the "en" default, the
  // client adopts the stored preference), mirroring ui-mode-preference.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLanguageState(readRaw());
    setReady(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        setLanguageState(readRaw());
      }
    };
    const onLocal = () => setLanguageState(readRaw());

    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocal);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setLanguage = useCallback((value: StoryLanguage) => {
    setStoryLanguage(value);
    setLanguageState(value);
  }, []);

  const toggle = useCallback(() => {
    setLanguage(readRaw() === "vi" ? "en" : "vi");
  }, [setLanguage]);

  return { language, setLanguage, toggle, ready };
}

/** Test helper — storage key is not a secret, but keep one source of truth. */
export const STORY_LANGUAGE_STORAGE_KEY = STORAGE_KEY;
