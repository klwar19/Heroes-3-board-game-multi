/**
 * Campaign story triggers (Anime mod §12) — the PURE decision layer.
 *
 * Given a bound campaign room's game read, its binding, the human seat and the
 * once-per-room shown-markers, decide WHICH scene (if any) to pop and whether
 * the chapter is completed. Kept side-effect-free so it is unit-testable without
 * the giant table page: the page derives the inputs from live state, calls this,
 * and does the impure work (setStoryCue / mark markers / markChapterCompleted).
 *
 * An UNBOUND room (`binding === null`) fires NOTHING — the control that keeps
 * every normal, non-campaign table silent.
 */

import { getCampaign } from "@/data/story/campaigns";
import type { CampaignRoomBinding } from "@/lib/campaign-progress";
import type { GamePhase, PlayerId } from "@/engine";

/** The minimal slice of game state the decision needs (a `GameState` is assignable). */
export type CampaignStateRead = {
  phase: GamePhase;
  adventure?: { winnerPlayerId: PlayerId | null } | null;
};

export type CampaignShownMarkers = {
  introShown: boolean;
  outcomeShown: boolean;
};

export type CampaignTrigger =
  | { kind: "start"; sceneId: string }
  | {
      kind: "victory";
      /** Scene to pop (absent only if the chapter defines no onVictory scene). */
      sceneId?: string;
      /** The page marks this chapter completed. */
      complete: { campaignId: string; chapterId: string };
    }
  | { kind: "defeat"; sceneId?: string };

/**
 * Decide the campaign scene to fire, if any.
 *
 * - Unbound room, or a binding that no longer resolves → null.
 * - Finished game (`phase === "game-over"`), outcome not yet shown → victory
 *   (human seat won) or defeat (human seat lost). Victory always carries
 *   `complete` so the page records completion even if no onVictory scene exists.
 * - Otherwise, the adventure is visible (`phase !== "setup"`) and the intro has
 *   not been shown → the onStart scene. The finished branch takes priority, so
 *   an already-over game shows its outcome, never a late intro.
 */
export function campaignSceneToFire(
  read: CampaignStateRead,
  binding: CampaignRoomBinding | null,
  viewerPlayerId: PlayerId,
  markers: CampaignShownMarkers
): CampaignTrigger | null {
  if (!binding) {
    return null;
  }
  const chapter = getCampaign(binding.campaignId)?.chapters.find((c) => c.id === binding.chapterId);
  if (!chapter) {
    return null;
  }

  if (read.phase === "game-over") {
    if (markers.outcomeShown) {
      return null;
    }
    const won = read.adventure?.winnerPlayerId === viewerPlayerId;
    if (won) {
      return {
        kind: "victory",
        ...(chapter.scenes.onVictory ? { sceneId: chapter.scenes.onVictory } : {}),
        complete: { campaignId: binding.campaignId, chapterId: binding.chapterId }
      };
    }
    return {
      kind: "defeat",
      ...(chapter.scenes.onDefeat ? { sceneId: chapter.scenes.onDefeat } : {})
    };
  }

  const started = read.phase !== "setup";
  if (started && !markers.introShown && chapter.scenes.onStart) {
    return { kind: "start", sceneId: chapter.scenes.onStart };
  }
  return null;
}
