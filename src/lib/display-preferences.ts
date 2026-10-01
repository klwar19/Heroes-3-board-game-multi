/**
 * Client preferences behind Options → Graphics / Display that have no older
 * home of their own:
 *
 * - `motion`: "system" follows the OS `prefers-reduced-motion` exactly as the
 *   game always has; "reduced" forces the reduced-motion treatment on (every
 *   `@media (prefers-reduced-motion: reduce)` stylesheet rule plus the JS
 *   consumers that read `prefersReducedMotion()`); "full" forces it off even
 *   when the OS asks for reduced motion.
 * - `storyTextScale`: size of the story / dialogue text (story overlay).
 * - `keepAwake`: hold a screen Wake Lock while the game is visible, so a phone
 *   or tablet lying on the table does not dim mid-game.
 *
 * Stored per BROWSER in localStorage (never in GameState, never sent to the
 * server). Defaults reproduce the pre-Options behavior exactly.
 */

export type MotionPreference = "system" | "reduced" | "full";

export type DisplayPreferences = {
  motion: MotionPreference;
  storyTextScale: number;
  keepAwake: boolean;
};

export const STORY_TEXT_SCALES = [
  { value: 0.9, label: "Small" },
  { value: 1, label: "Normal" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Extra large" },
] as const;

export const DISPLAY_PREFERENCE_DEFAULTS: Readonly<DisplayPreferences> = Object.freeze({
  motion: "system",
  storyTextScale: 1,
  keepAwake: false,
});

const STORAGE_KEY = "binh-display-prefs";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function sanitizeDisplayPreferences(raw: unknown): DisplayPreferences {
  const source = raw && typeof raw === "object" ? (raw as Partial<DisplayPreferences>) : {};
  const motion: MotionPreference =
    source.motion === "reduced" || source.motion === "full" ? source.motion : "system";
  const scale = STORY_TEXT_SCALES.some((option) => option.value === source.storyTextScale)
    ? (source.storyTextScale as number)
    : DISPLAY_PREFERENCE_DEFAULTS.storyTextScale;
  return {
    motion,
    storyTextScale: scale,
    keepAwake: source.keepAwake === true,
  };
}

function readStored(): DisplayPreferences {
  if (typeof window === "undefined") return { ...DISPLAY_PREFERENCE_DEFAULTS };
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return sanitizeDisplayPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DISPLAY_PREFERENCE_DEFAULTS };
  }
}

let prefs: DisplayPreferences = readStored();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function osReducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    prefs = readStored();
    notify();
  });
  // An OS-level change matters to everyone still on "system".
  osReducedMotionQuery()?.addEventListener?.("change", () => {
    if (prefs.motion === "system") notify();
  });
}

export function getDisplayPreferences(): DisplayPreferences {
  return prefs;
}

export function subscribeDisplayPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDisplayPreferences(patch: Partial<DisplayPreferences>): void {
  const next = sanitizeDisplayPreferences({ ...prefs, ...patch });
  if (
    next.motion === prefs.motion &&
    next.storyTextScale === prefs.storyTextScale &&
    next.keepAwake === prefs.keepAwake
  ) {
    return;
  }
  prefs = next;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota — still applies for this session.
  }
  notify();
}

/**
 * THE reduced-motion question for JS consumers: the Options override when set,
 * otherwise the OS preference (the game's behavior before Options existed).
 */
export function prefersReducedMotion(): boolean {
  if (prefs.motion === "reduced") return true;
  if (prefs.motion === "full") return false;
  return osReducedMotionQuery()?.matches === true;
}

/**
 * Subscribe to anything that can flip `prefersReducedMotion()` — the Options
 * override or (while on "system") the OS setting. Pairs with
 * useSyncExternalStore.
 */
export function subscribeReducedMotion(listener: () => void): () => void {
  let last = prefersReducedMotion();
  return subscribeDisplayPreferences(() => {
    const next = prefersReducedMotion();
    if (next === last) return;
    last = next;
    listener();
  });
}

export const DISPLAY_PREFERENCES_STORAGE_KEY = STORAGE_KEY;
