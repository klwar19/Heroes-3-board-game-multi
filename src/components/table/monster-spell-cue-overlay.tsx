"use client";

/**
 * PvE monster caster — the transient "the boss just cast X" banner.
 *
 * PRESENTATION ONLY. It dispatches nothing, opens no engine window and takes no
 * input (`pointer-events: none`, no click handler, no focusable child), so it
 * can never block a player or stall an AI/AFK seat — the commander-intro-overlay
 * precedent, minus even the dismiss click. Each cue removes itself after
 * `MONSTER_SPELL_CUE_MS`; several casts in one round-start pass stack in log
 * order and are staggered so they read one after another.
 *
 * The cast's sprite + sound are the ordinary board FX (page.tsx queues
 * `monsterSpellFxPlan` on the caster/target); this banner adds only the WORDS —
 * the spell's name, exactly what just happened (the engine's own message) and
 * what the spell always does. jsdom cannot compute CSS, so only the DOM contract
 * is pinned (`monster-spell-cue-overlay.test.tsx`); the look is a real-browser
 * concern with no e2e spec.
 */

import { useEffect } from "react";
import type { MonsterSpellCue } from "./monster-spell-cue";

/** How long one cast banner stays up. */
export const MONSTER_SPELL_CUE_MS = 3200;
/** Extra hold per queued cast, so a two-cast round start does not flash at once. */
export const MONSTER_SPELL_CUE_STAGGER_MS = 700;

export function MonsterSpellCueBanner({
  cue,
  index = 0,
  onDone
}: {
  cue: MonsterSpellCue;
  index?: number;
  onDone: (id: string) => void;
}) {
  const id = cue.id;
  useEffect(() => {
    const doneId = window.setTimeout(
      () => onDone(id),
      MONSTER_SPELL_CUE_MS + index * MONSTER_SPELL_CUE_STAGGER_MS
    );
    return () => window.clearTimeout(doneId);
  }, [id, index, onDone]);

  return (
    <div
      className="monsterSpellCue"
      data-monster-spell={cue.spellId}
      role="status"
      aria-live="polite"
      style={{ pointerEvents: "none" }}
    >
      <strong className="monsterSpellCueHeadline">{cue.headline}</strong>
      <p className="monsterSpellCueDetail">{cue.detail}</p>
      <small className="monsterSpellCueRules">{cue.rulesText}</small>
    </div>
  );
}

/** The stack of live cast banners. Renders nothing when there are none. */
export function MonsterSpellCueOverlay({
  cues,
  onDone
}: {
  cues: readonly MonsterSpellCue[];
  onDone: (id: string) => void;
}) {
  if (cues.length === 0) {
    return null;
  }
  return (
    <div className="monsterSpellCueStack" style={{ pointerEvents: "none" }}>
      {cues.map((cue, index) => (
        <MonsterSpellCueBanner key={cue.id} cue={cue} index={index} onDone={onDone} />
      ))}
    </div>
  );
}
