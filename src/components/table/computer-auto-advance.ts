import { useEffect, useRef, useState } from "react";
import type { GameAction, LegalAction } from "@/engine";

export const COMPUTER_AUTO_ADVANCE_MS = 850;

/**
 * Whether the client should AUTO-ADVANCE a single-player computer's map turn
 * (submit one ADVANCE_COMPUTER per beat via {@link usePacedComputerAdvance})
 * WITHOUT the human pressing "Next" for every step.
 *
 * ON BY DEFAULT for single-player. A map computer turn is human-gated — the
 * server never auto-pumps it (that path is PvP-only), so SOMETHING must submit
 * ADVANCE_COMPUTER or the AI hero simply never leaves its start cell ("single
 * player AI … not move at all, even though so many paths"). This used to be
 * opt-in, so the default made the player grind a "Next step" button — and a
 * lingering battle recap / move replay could even hide that button while the
 * computer still owed a move, freezing the turn. Defaulting it ON drives the
 * whole computer turn at a readable pace (the hook still waits for dice, recaps
 * and replays via its `blocked` set).
 *
 * A per-tab MANUAL opt-out is preserved: storing `manual:<seed>` in
 * `autoAdvanceMatchSeed` turns auto OFF for that exact match so a player can
 * step through by hand. A bare seed (the legacy "Skip confirmations" marker) or
 * null both leave the default ON.
 */
export function singlePlayerAutoAdvanceDefault(
  sessionMode: string | undefined,
  autoAdvanceMatchSeed: string | null,
  seed: string | undefined,
): boolean {
  return (
    sessionMode === "single-player" &&
    autoAdvanceMatchSeed !== `manual:${seed ?? ""}`
  );
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
