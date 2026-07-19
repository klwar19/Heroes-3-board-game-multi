import { useEffect, useRef, useState } from "react";
import type { GameAction, LegalAction } from "@/engine";

export const COMPUTER_AUTO_ADVANCE_MS = 850;

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
 * Submit one already-legal ADVANCE_COMPUTER action after a readable pause.
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

    const timer = window.setTimeout(() => {
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
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [blocked, delayMs, enabled, legalActions, retry, roomKey, version]);
}
