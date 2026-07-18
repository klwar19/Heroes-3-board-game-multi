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

import { chapterRoomOptions, getCampaign, type CampaignChapter } from "@/data/story/campaigns";
import { coreFactionDefinitions } from "@/data/factions/core";
import type { CampaignRoomBinding } from "@/lib/campaign-progress";
import type { GameAction, GamePhase, PlayerId } from "@/engine";

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

/**
 * The setup-lobby actions that make a chapter's carried config REAL (Anime mod
 * §12). PURE — no side effects, no dispatch. The Begin flow mints a standard
 * single-player room; once the human is seated in its setup lobby the page
 * pushes these through the NORMAL action pipeline (no new server surface), so
 * the room ends up with the chapter's game options and the protagonist's core
 * faction preselected. The player still sees the setup screen and may change
 * anything before starting.
 *
 * Returns, in order:
 *  1. `SET_GAME_OPTIONS` carrying the chapter's fully-resolved `anime` options,
 *     the global `fieldOverrides` toggle, and the `difficulty` when specified.
 *  2. `CHOOSE_FACTION` preselecting the chapter's `playerFaction` for `playerId`,
 *     paired with that faction's first (default) hero — a fresh Free-pick lobby
 *     accepts it and the player may re-pick.
 *
 * A locked chapter (no `setup` ⇒ `chapterRoomOptions` null) or a faction with no
 * heroes yields an empty list (nothing to inject).
 */
export function campaignSetupActions(chapter: CampaignChapter, playerId: PlayerId): GameAction[] {
  const options = chapterRoomOptions(chapter);
  if (!options) {
    return [];
  }
  const actions: GameAction[] = [
    {
      type: "SET_GAME_OPTIONS",
      playerId,
      options: {
        anime: options.anime,
        fieldOverrides: options.fieldOverrides,
        ...(options.difficulty ? { difficulty: options.difficulty } : {})
      }
    }
  ];
  const heroDefId = coreFactionDefinitions[options.playerFaction]?.heroes[0];
  if (heroDefId) {
    actions.push({
      type: "CHOOSE_FACTION",
      playerId,
      factionId: options.playerFaction,
      heroDefId
    });
  }
  return actions;
}
