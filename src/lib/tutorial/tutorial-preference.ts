/**
 * Client preferences for the new-player tutorial.
 *
 * - `binh-tutorial-prompt` = "off": the player ticked "Don't ask again" on the
 *   main-menu tutorial prompt.
 * - `binh-tutorial-progress`: the step the player reached, so a reload (or
 *   leaving and coming back) resumes the same scripted game.
 * - `binh-tutorial-completed` = "1": the tutorial game was won; the prompt
 *   stops asking and the menu icon shows a check.
 * - `binh-tutorial-asked` (sessionStorage): the prompt already asked in this
 *   browser session, so it greets you on entry without nagging on every
 *   menu visit (same rhythm as the welcome notice).
 *
 * Every storage access is guarded: private mode / SSR never throws.
 */

const PROMPT_KEY = "binh-tutorial-prompt";
const PROGRESS_KEY = "binh-tutorial-progress";
const COMPLETED_KEY = "binh-tutorial-completed";
const ASKED_KEY = "binh-tutorial-asked";

function read(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(storage: "local" | "session", key: string, value: string | null) {
  try {
    const target = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, value);
  } catch {
    // Storage unavailable: the choice simply lasts for this page view.
  }
}

/** True when the main-menu prompt should ask this browser session. */
export function shouldAskTutorial(): boolean {
  if (typeof window === "undefined") return false;
  if (read("local", PROMPT_KEY) === "off") return false;
  if (read("local", COMPLETED_KEY) === "1") return false;
  return read("session", ASKED_KEY) !== "1";
}

export function markTutorialAsked(dontAskAgain: boolean) {
  write("session", ASKED_KEY, "1");
  if (dontAskAgain) write("local", PROMPT_KEY, "off");
}

export function isTutorialCompleted(): boolean {
  return typeof window !== "undefined" && read("local", COMPLETED_KEY) === "1";
}

export function markTutorialCompleted() {
  write("local", COMPLETED_KEY, "1");
}

/** Saved progress: the next script step the player has not played yet. */
export type TutorialProgress = { scriptId: string; step: number };

export function readTutorialProgress(): TutorialProgress | null {
  if (typeof window === "undefined") return null;
  const raw = read("local", PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    return typeof parsed.scriptId === "string" && typeof parsed.step === "number" && parsed.step >= 0
      ? { scriptId: parsed.scriptId, step: Math.floor(parsed.step) }
      : null;
  } catch {
    return null;
  }
}

export function writeTutorialProgress(progress: TutorialProgress | null) {
  write("local", PROGRESS_KEY, progress ? JSON.stringify(progress) : null);
}

/** Tutorial-only language (the rest of the app stays English). */
export type TutorialLanguage = "en" | "vi" | "pl";
const LANGUAGE_KEY = "binh-tutorial-lang";
const LANGUAGE_EVENT = "binh-tutorial-lang-change";

/** Stored choice, else the browser language (Vietnamese / Polish), else English. */
export function getTutorialLanguage(): TutorialLanguage {
  if (typeof window === "undefined") return "en";
  const stored = read("local", LANGUAGE_KEY);
  if (stored === "en" || stored === "vi" || stored === "pl") return stored;
  const browser = (navigator.language || "").toLowerCase();
  if (browser.startsWith("vi")) return "vi";
  if (browser.startsWith("pl")) return "pl";
  return "en";
}

export function setTutorialLanguage(language: TutorialLanguage) {
  write("local", LANGUAGE_KEY, language);
  try {
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: language }));
  } catch {
    // ignore
  }
}

export function onTutorialLanguageChange(listener: (language: TutorialLanguage) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener(getTutorialLanguage());
  window.addEventListener(LANGUAGE_EVENT, handler);
  return () => window.removeEventListener(LANGUAGE_EVENT, handler);
}

/** Chapter medals earned (0–8); never goes down, so Start over keeps them. */
const MEDALS_KEY = "binh-tutorial-medals";

export function readTutorialMedals(): number {
  if (typeof window === "undefined") return 0;
  const value = Number(read("local", MEDALS_KEY));
  return Number.isFinite(value) ? Math.max(0, Math.min(8, Math.floor(value))) : 0;
}

export function writeTutorialMedals(count: number) {
  if (count > readTutorialMedals()) write("local", MEDALS_KEY, String(Math.max(0, Math.min(8, Math.floor(count)))));
}
