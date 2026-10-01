/**
 * Tiny observable the local tutorial room publishes and the coach overlay
 * reads (useSyncExternalStore). Kept separate from the room so the coach never
 * needs the connection object, and so the room works without a coach mounted.
 */
import { useSyncExternalStore } from "react";
import type { GameAction } from "@/engine";
import type { TutorialSetup, TutorialStep } from "./tutorial-core";

export type TutorialMode =
  /** Script not loaded yet. */
  | "loading"
  /** Setup lobby: the player configures the scripted match. */
  | "lobby"
  /** On the recorded game: the next human step is enforced. */
  | "script"
  /** The recording no longer matches this build (or ran out): free play vs the live AI. */
  | "free"
  /** The tutorial game was won. */
  | "done";

export type TutorialStatus = {
  mode: TutorialMode;
  roomId: string | null;
  /** The recorded script's id (clips are keyed by it and the step index). */
  scriptId: string | null;
  /** The match the tutorial is played with (lobby guidance). */
  setup: TutorialSetup | null;
  /** Index of the next script step (human or computer). */
  step: number;
  totalSteps: number;
  /** The next step, when it belongs to the player. */
  expected: TutorialStep | null;
  /** True while recorded computer steps are still being played out. */
  computerThinking: boolean;
  /** The last action the room refused because it was not the scripted one. */
  rejected: { action: GameAction; at: number } | null;
  /** Why the room left the script (shown honestly by the coach). */
  divergence: string | null;
  /** Lobby: what still differs from the tutorial's match configuration. */
  lobbyIssues: string[];
};

const INITIAL: TutorialStatus = {
  mode: "loading",
  roomId: null,
  scriptId: null,
  setup: null,
  step: 0,
  totalSteps: 0,
  expected: null,
  computerThinking: false,
  rejected: null,
  divergence: null,
  lobbyIssues: [],
};

let status: TutorialStatus = INITIAL;
const listeners = new Set<() => void>();

export function getTutorialStatus(): TutorialStatus {
  return status;
}

export function setTutorialStatus(patch: Partial<TutorialStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

/**
 * Read-only probe for the clip recorder / step verifier
 * (scripts/tutorial/record-clips.mjs): the current status and the coach's
 * current pointer targets. Reading them changes nothing.
 */
export type TutorialProbe = {
  status: () => TutorialStatus;
  target: { selectors: string[]; hint: string } | null;
  /** Which selector / match the pointer is on right now (set by the coach). */
  pick?: () => { selector: string; index: number; x: number; y: number } | null;
};
if (typeof window !== "undefined") {
  (window as unknown as { __binhTutorial?: TutorialProbe }).__binhTutorial = { status: () => status, target: null };
}

export function publishTutorialTarget(target: { selectors: string[]; hint: string } | null) {
  if (typeof window === "undefined") return;
  const probe = (window as unknown as { __binhTutorial?: TutorialProbe }).__binhTutorial;
  if (probe) probe.target = target;
}

export function resetTutorialStatus() {
  status = INITIAL;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTutorialStatus(): TutorialStatus {
  return useSyncExternalStore(subscribe, getTutorialStatus, () => INITIAL);
}
