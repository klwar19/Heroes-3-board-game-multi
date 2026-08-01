import { useEffect, useRef, useState } from "react";
import type { GameAction, GameState, LegalAction } from "@/engine";

/** Last-resort delay; the server normally advances and broadcasts within 900ms. */
export const COMPUTER_AUTO_ADVANCE_MS = 5_000;

/** Single-player keeps a client watchdog; multiplayer has no computer seats. */
export function computerAutoAdvanceEnabled(sessionMode: GameState["sessionMode"] | undefined): boolean {
  return sessionMode === "single-player";
}

export type ComputerAutoAdvanceOptions = {
  enabled: boolean;
  roomKey: string;
  version: number;
  blocked: boolean;
  legalActions: ReadonlyArray<LegalAction>;
  submit: (action: GameAction) => Promise<boolean | undefined>;
  delayMs?: number;
};

/**
 * Submit one already-legal ADVANCE_COMPUTER action only if the authoritative
 * server pump has left the same room version stuck beyond the watchdog delay.
 * A room/version key is submitted at most once, even if presentation state
 * rerenders repeatedly before the next authoritative snapshot arrives.
 */
export function usePacedComputerAdvance({
  enabled,
  roomKey,
  version,
  blocked,
  legalActions,
  submit,
  delayMs = COMPUTER_AUTO_ADVANCE_MS,
}: ComputerAutoAdvanceOptions): void {
  const submitRef = useRef(submit);
  const submittedVersionRef = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    if (!enabled || blocked) return;
    const advance = legalActions.find(
      (legal) => legal.action.type === "ADVANCE_COMPUTER",
    );
    if (!advance) return;

    const versionKey = `${roomKey}:${version}`;
    if (submittedVersionRef.current === versionKey) return;

    const submitAdvance = () => {
      if (submittedVersionRef.current === versionKey) return;
      submittedVersionRef.current = versionKey;
      void submitRef.current(advance.action).then((accepted) => {
        if (
          accepted !== true &&
          submittedVersionRef.current === versionKey
        ) {
          submittedVersionRef.current = null;
          setRetry((value) => value + 1);
        }
      });
    };

    const timer = window.setTimeout(submitAdvance, delayMs);
    // Background tabs and sleeping laptops may suspend this timer for minutes.
    // If the authoritative snapshot is still unchanged on wake, this recovery
    // request is safe; if a server tick won the race, normal legality rejects it.
    const onWake = () => {
      if (document.visibilityState !== "hidden") {
        window.clearTimeout(timer);
        submitAdvance();
      }
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [blocked, delayMs, enabled, legalActions, retry, roomKey, version]);
}
