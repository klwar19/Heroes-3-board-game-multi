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

/**
 * Big Cleanup resolves in the engine before the proclamation is shown. Build a
 * faithful physical replay for the moment the player acknowledges the card:
 * old hand -> discard first, then replacement cards -> hand. Card faces stay
 * hidden because the discarded identities are private/history data and the
 * authoritative hand has already been replaced by the time presentation runs.
 */
export function buildBigCleanupHandFx(
  eventId: string,
  playerId: string,
  discarded: number,
  drawn: number
): ForcedHandFxPlan {
  const discardCount = Math.min(Math.max(0, discarded), MAX_VISIBLE_CARDS);
  const drawCount = Math.min(Math.max(0, drawn), MAX_VISIBLE_CARDS);
  const cues: FxCue[] = [];

  for (let index = 0; index < discardCount; index += 1) {
    cues.push({
      kind: "flight",
      id: `${eventId}-cleanup-discard-${index}`,
      from: `hand:${playerId}`,
      to: `discard:${playerId}`,
      delayMs: index * DISCARD_STAGGER_MS
    });
  }

  const drawStart = discardCount > 0
    ? FLIGHT_MS + (discardCount - 1) * DISCARD_STAGGER_MS
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
