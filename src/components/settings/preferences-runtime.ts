"use client";

/**
 * Applies the page-wide Options preferences that are not read at a call site:
 *
 * - Motion override: every stylesheet `@media` rule written against
 *   `prefers-reduced-motion` has that feature swapped for an always-true /
 *   always-false condition (CSSOM `media.mediaText`), so the game's existing
 *   reduced-motion CSS turns on or off exactly as if the OS asked. "system"
 *   restores the authored text. Sheets that arrive later (route CSS chunks, dev
 *   HMR) are caught by a head MutationObserver.
 * - Story text size: the `--story-text-scale` custom property on <html>.
 * - Keep screen awake: a screen Wake Lock held while the page is visible.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  getDisplayPreferences,
  subscribeDisplayPreferences,
  type MotionPreference,
} from "@/lib/display-preferences";

const REDUCE_FEATURE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi;
const NO_PREFERENCE_FEATURE = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/gi;
const BARE_FEATURE = /\(\s*prefers-reduced-motion\s*\)/gi;
/** Conditions that are valid anywhere a media feature is. */
const ALWAYS = "(min-width: 0px)";
const NEVER = "(min-width: 999999px)";

const authoredMedia = new WeakMap<CSSMediaRule, string>();

function mediaTextFor(authored: string, mode: MotionPreference): string {
  if (mode === "system") return authored;
  const reduced = mode === "reduced";
  return authored
    .replace(REDUCE_FEATURE, reduced ? ALWAYS : NEVER)
    .replace(BARE_FEATURE, reduced ? ALWAYS : NEVER)
    .replace(NO_PREFERENCE_FEATURE, reduced ? NEVER : ALWAYS);
}

function isMotionQuery(text: string): boolean {
  return /prefers-reduced-motion/i.test(text);
}

function applyToRules(rules: CSSRuleList, mode: MotionPreference): void {
  for (const rule of Array.from(rules)) {
    if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
      const authored = authoredMedia.get(rule) ?? rule.media.mediaText;
      if (isMotionQuery(authored)) {
        if (!authoredMedia.has(rule)) authoredMedia.set(rule, authored);
        const wanted = mediaTextFor(authored, mode);
        if (rule.media.mediaText !== wanted) {
          try {
            rule.media.mediaText = wanted;
          } catch {
            // An engine that refuses the rewrite keeps the authored query.
          }
        }
      }
      applyToRules(rule.cssRules, mode);
    } else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) {
      applyToRules((rule as CSSGroupingRule).cssRules, mode);
    }
  }
}

/** True once any rule has been rewritten in this page session. */
let overrideApplied = false;

export function applyMotionOverride(mode: MotionPreference): void {
  if (typeof document === "undefined") return;
  // On "system" with nothing ever rewritten, the authored CSS is already right.
  if (mode === "system" && !overrideApplied) return;
  if (mode !== "system") overrideApplied = true;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // Cross-origin sheet: not ours to rewrite.
    }
    applyToRules(rules, mode);
  }
}

function useDisplayPreferences() {
  return useSyncExternalStore(subscribeDisplayPreferences, getDisplayPreferences, getDisplayPreferences);
}

function useMotionOverride(mode: MotionPreference): void {
  useEffect(() => {
    // "system" restores whatever an earlier override rewrote (a no-op for
    // everyone who never opts in) and needs no watcher.
    applyMotionOverride(mode);
    if (mode === "system") return;
    let frame = 0;
    const reapply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => applyMotionOverride(mode));
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof HTMLLinkElement) node.addEventListener("load", reapply, { once: true });
        }
      }
      reapply();
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [mode]);
}

function useStoryTextScale(scale: number): void {
  useEffect(() => {
    const root = document.documentElement;
    if (scale === 1) root.style.removeProperty("--story-text-scale");
    else root.style.setProperty("--story-text-scale", String(scale));
  }, [scale]);
}

export function wakeLockSupported(): boolean {
  // Older engines lack the Screen Wake Lock API even though lib.dom types it.
  return typeof navigator !== "undefined" && typeof (navigator as Partial<Navigator>).wakeLock?.request === "function";
}

function useKeepAwake(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;
    let pending = false;
    const acquire = () => {
      if (disposed || sentinel || pending || document.visibilityState !== "visible") return;
      pending = true;
      navigator.wakeLock.request("screen").then(
        (lock) => {
          pending = false;
          if (disposed) {
            lock.release().catch(() => undefined);
            return;
          }
          sentinel = lock;
          // The browser drops the lock whenever the page is hidden.
          lock.addEventListener("release", () => {
            if (sentinel === lock) sentinel = null;
          });
        },
        () => {
          // Denied (battery saver, policy): the screen may dim as before.
          pending = false;
        }
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [enabled]);
}

/** Mounted once (SettingsHost): keeps the page in step with Options. */
export function usePreferencesRuntime(): void {
  const prefs = useDisplayPreferences();
  useMotionOverride(prefs.motion);
  useStoryTextScale(prefs.storyTextScale);
  useKeepAwake(prefs.keepAwake);
}
