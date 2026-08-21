"use client";

/**
 * PvE ENEMY FORCE — the transient "the enemy force just played X" banner.
 *
 * PRESENTATION ONLY. It dispatches nothing, opens no engine window and takes no
 * input (`pointer-events: none`, no click handler, no focusable child), so it
 * can never block a player or stall an AI/AFK seat — the commander-intro-overlay
 * precedent, minus even the dismiss click. Each cue removes itself after
 * `ENEMY_FORCE_CUE_MS`; several plays batched into one snapshot stack in log
 * order and are staggered so they read one after another.
 *
 * Unlike the removed monster-spell banner this one shows the actual CARD FACE:
 * the enemy force plays real library cards, and the user's whole point was that
 * it behaves like a player, so the player must see what was played. The sprite +
 * sound are the ordinary board FX (page.tsx queues `enemyForceFxPlan` on the
 * boss/target); this banner adds the CARD and the WORDS.
 *
 * jsdom cannot compute CSS, so only the DOM contract is pinned
 * (`enemy-force-cue-overlay.test.tsx`); the look is a real-browser concern with
 * no e2e spec.
 */

import { useEffect } from "react";
import { assetUrl } from "@/lib/asset-url";
import type { EnemyForceCue } from "./enemy-force-cue";

/** How long one play banner stays up. */
export const ENEMY_FORCE_CUE_MS = 3600;
/** Extra hold per queued play, so a batched pair does not flash at once. */
export const ENEMY_FORCE_CUE_STAGGER_MS = 700;

export function EnemyForceCueBanner({
  cue,
  index = 0,
  onDone
}: {
  cue: EnemyForceCue;
  index?: number;
  onDone: (id: string) => void;
}) {
  const id = cue.id;
  useEffect(() => {
    const doneId = window.setTimeout(
      () => onDone(id),
      ENEMY_FORCE_CUE_MS + index * ENEMY_FORCE_CUE_STAGGER_MS
    );
    return () => window.clearTimeout(doneId);
  }, [id, index, onDone]);

  return (
    <div
      className="enemyForceCue"
      data-enemy-force-card={cue.cardId}
      role="status"
      aria-live="polite"
      style={{ pointerEvents: "none" }}
    >
      {cue.cardImage ? (
        <img
          className="enemyForceCueCard"
          alt={cue.cardName}
          src={assetUrl(cue.cardImage)}
          aria-hidden="true"
        />
      ) : null}
      <div className="enemyForceCueText">
        <strong className="enemyForceCueHeadline">{cue.headline}</strong>
        <p className="enemyForceCueDetail">{cue.detail}</p>
        {cue.rulesText ? (
          <small className="enemyForceCueRules">{cue.rulesText}</small>
        ) : null}
      </div>
    </div>
  );
}

/** The stack of live play banners. Renders nothing when there are none. */
export function EnemyForceCueOverlay({
  cues,
  onDone
}: {
  cues: readonly EnemyForceCue[];
  onDone: (id: string) => void;
}) {
  if (cues.length === 0) {
    return null;
  }
  return (
    <div className="enemyForceCueStack" style={{ pointerEvents: "none" }}>
      {cues.map((cue, index) => (
        <EnemyForceCueBanner key={cue.id} cue={cue} index={index} onDone={onDone} />
      ))}
    </div>
  );
}
