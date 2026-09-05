"use client";

/**
 * COMBAT-OUTCOME CINEMATICS — the HoMM3 battle-result clips with their stings,
 * shown inside the combat-result popup for THE VIEWER's decided, fought-out
 * fight: a neutral guard / Creature Bank / PvE fight or a PvP battle alike.
 *   - VICTORY: WIN3.BIK (re-encoded, 72 KB mp4) + the "Win Battle" fanfare.
 *   - DEFEAT:  LBSTART.BIK (re-encoded, 47 KB mp4) + the "LoseCombat" sting.
 *
 * PRESENTATION ONLY: it dispatches nothing, opens no engine window and reads
 * only the public `combat.outcome`, so it can never block a player or stall an
 * AI/AFK seat. Which clip (if any) shows is ONE pure read,
 * `combatOutcomeCinematic`, which mirrors the popup's own titles:
 *   - "Victory!" → the viewer is `outcome.winnerPlayerId`;
 *   - "Defeat"   → the viewer is `outcome.defeatedPlayerId`;
 *   - neither for an ESCAPE (surrender / secondary-hero surrender — the house
 *     rules say those are NOT a win for the opponent — or a retreat, which the
 *     popup titles "<name> retreats" / "You retreat"), for a bystander, for an
 *     undecided fight, or in the Battle Test sandbox.
 * Quick Combat resolves with no combat state and no popup, so it has no
 * cinematic (a deliberate limit — the clips are the coda of a fought fight).
 *
 * Once per combat id per client (a module-level seen-set, like the PvE
 * field-effects cue): a re-render, "Keep looking at the battlefield" or a
 * reconnect's replayed snapshot never replays the sting. The sting goes through
 * the music controller (`playCombatSting`), so it honours the music mute and
 * hands the background track back when it ends. The video is muted
 * (autoplay-safe) and is not mounted under `prefers-reduced-motion` — the sting
 * still plays there.
 *
 * jsdom cannot compute CSS, so `victory-cinematic.test.tsx` pins the DOM and
 * music contract only; the look is a real-browser concern.
 */

import { useEffect, useSyncExternalStore } from "react";

import type { GameState, PlayerId } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { DEFEAT_STING_TRACK, VICTORY_FANFARE_TRACK, playCombatSting } from "@/lib/music";

export type CombatOutcomeCinematicKind = "victory" | "defeat";

/** Re-encoded Bink clips (512×240 h264, silent). */
export const COMBAT_OUTCOME_VIDEOS: Record<CombatOutcomeCinematicKind, string> = {
  victory: "/assets/fx/combat-outcome/win-battle.mp4",
  defeat: "/assets/fx/combat-outcome/lose-battle.mp4"
};
/** Kept for callers/tests that name the win clip directly. */
export const VICTORY_CINEMATIC_VIDEO = COMBAT_OUTCOME_VIDEOS.victory;

export const COMBAT_OUTCOME_STINGS: Record<CombatOutcomeCinematicKind, string> = {
  victory: VICTORY_FANFARE_TRACK,
  defeat: DEFEAT_STING_TRACK
};

const ESCAPE_REASONS = new Set(["surrender", "surrender-secondary", "retreat"]);

/** Which clip the viewer gets for the current decided fight — exactly the popup's "Victory!" / "Defeat" titles. */
export function combatOutcomeCinematic(state: GameState, viewerPlayerId: PlayerId): CombatOutcomeCinematicKind | null {
  const combat = state.combat;
  const outcome = combat?.outcome;
  if (!combat || !outcome) return null;
  if (combat.context.kind === "sandbox") return null;
  if (ESCAPE_REASONS.has(outcome.reason)) return null;
  if (outcome.winnerPlayerId === viewerPlayerId) return "victory";
  if (outcome.defeatedPlayerId === viewerPlayerId) return "defeat";
  return null;
}

/** The viewer's decided, fought-out win — exactly when the result popup says "Victory!". */
export function victoryCinematicApplies(state: GameState, viewerPlayerId: PlayerId): boolean {
  return combatOutcomeCinematic(state, viewerPlayerId) === "victory";
}

const stingPlayedFor = new Set<string>();

/** Test hook: forget which combats already played their sting on this client. */
export function __resetVictoryCinematicForTests(): void {
  stingPlayedFor.clear();
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

/**
 * Whether the clip may mount: false under `prefers-reduced-motion` and on the
 * server snapshot (a `useSyncExternalStore` read, the main-menu
 * `useVideoBackdropAllowed` precedent — never a setState-in-effect).
 */
function useCinematicVideoAllowed(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => !(reducedMotionQuery()?.matches ?? false),
    () => false
  );
}

export function VictoryCinematic({ state, viewerPlayerId }: { state: GameState; viewerPlayerId: PlayerId }) {
  const kind = combatOutcomeCinematic(state, viewerPlayerId);
  const combatId = kind ? state.combat!.id : null;
  const videoAllowed = useCinematicVideoAllowed();

  useEffect(() => {
    if (!combatId || !kind || stingPlayedFor.has(combatId)) return;
    stingPlayedFor.add(combatId);
    playCombatSting(COMBAT_OUTCOME_STINGS[kind]);
  }, [combatId, kind]);

  if (!combatId || !kind) return null;

  return (
    <div
      className={`victoryCinematic ${kind}`}
      data-combat-id={combatId}
      data-outcome={kind}
      data-testid="victory-cinematic"
    >
      {videoAllowed ? (
        <video
          aria-label={kind === "victory" ? "Victory cinematic" : "Defeat cinematic"}
          autoPlay
          className="victoryCinematicVideo"
          muted
          playsInline
          preload="auto"
          src={assetUrl(COMBAT_OUTCOME_VIDEOS[kind])}
        />
      ) : null}
    </div>
  );
}
