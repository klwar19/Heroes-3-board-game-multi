import {
  DRAW_STAGGER_MS,
  FLIGHT_MS,
  type FxCue
} from "./fx";

const DISCARD_STAGGER_MS = 90;
const MAX_VISIBLE_CARDS = 6;

export type ForcedHandFxPlan = {
  cues: FxCue[];
  durationMs: number;
};

export type ForcedHandFxMode = "discard-all" | "reshuffle-spells";

/**
 * Forced-hand proclamations resolve in the engine before their card is shown.
 * Build a faithful physical replay for the acknowledgement: Big Cleanup moves
 * the hand to discard; Annoying Lizard returns only Spells/Artifacts to the
 * deck; replacement cards then fly from the deck into the hand. Card faces stay
 * hidden because the moved identities are private/history data and the
 * authoritative hand has already changed by the time presentation runs.
 */
export function buildForcedHandFx(
  eventId: string,
  playerId: string,
  mode: ForcedHandFxMode,
  moved: number,
  drawn: number
): ForcedHandFxPlan {
  const movedCount = Math.min(Math.max(0, moved), MAX_VISIBLE_CARDS);
  const drawCount = Math.min(Math.max(0, drawn), MAX_VISIBLE_CARDS);
  const cues: FxCue[] = [];
  const destination = mode === "reshuffle-spells" ? `deck:${playerId}` : `discard:${playerId}`;
  const idPart = mode === "reshuffle-spells" ? "reshuffle" : "cleanup-discard";

  for (let index = 0; index < movedCount; index += 1) {
    cues.push({
      kind: "flight",
      id: `${eventId}-${idPart}-${index}`,
      from: `hand:${playerId}`,
      to: destination,
      delayMs: index * DISCARD_STAGGER_MS
    });
  }

  const drawStart = movedCount > 0
    ? FLIGHT_MS + (movedCount - 1) * DISCARD_STAGGER_MS
    : 0;
  for (let index = 0; index < drawCount; index += 1) {
    cues.push({
      kind: "flight",
      id: `${eventId}-cleanup-draw-${index}`,
      from: `deck:${playerId}`,
      to: `hand:${playerId}`,
      delayMs: drawStart + index * DRAW_STAGGER_MS
    });
  }

  const durationMs = drawStart + (drawCount > 0
    ? FLIGHT_MS + (drawCount - 1) * DRAW_STAGGER_MS
    : 0);
  return { cues, durationMs };
}

/** Compatibility wrapper for callers/tests that specifically present Big Cleanup. */
export function buildBigCleanupHandFx(
  eventId: string,
  playerId: string,
  discarded: number,
  drawn: number
): ForcedHandFxPlan {
  return buildForcedHandFx(eventId, playerId, "discard-all", discarded, drawn);
}
