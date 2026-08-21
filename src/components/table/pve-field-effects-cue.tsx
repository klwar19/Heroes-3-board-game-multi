"use client";

/**
 * PvE FIELD EFFECTS — the one-shot "this battlefield does X" explainer.
 *
 * The animated overlays say something is HAPPENING; this banner says WHAT, once,
 * as the fight opens: every active script's name plus its AUTHORED `summary`
 * (through the shared `combatScriptEffectLines` reading — the text is never
 * re-authored here). The always-visible `PveFieldEffectsPanel` stays as the
 * reference; this is the intro.
 *
 * PRESENTATION ONLY, the enemy-force-cue precedent minus even the dismiss click:
 * `pointer-events: none`, no focusable child, no click handler, dispatches
 * nothing and opens no engine window — so it can never block a player or stall
 * an AI/AFK seat. It self-gates: it shows ONCE per combat id per client (a ref
 * seen-set, so a reconnect's replayed snapshot never re-pops it) and renders
 * nothing at all for an unscripted fight.
 *
 * jsdom cannot compute CSS, so only the DOM contract is pinned
 * (`pve-field-effect-overlay.test.tsx`); the look is a real-browser concern with
 * no e2e spec.
 */

import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/engine";
import { combatScriptsActiveForCombat } from "@/engine";

/** How long the explainer stays up before removing itself. */
export const PVE_FIELD_EFFECT_CUE_MS = 7000;

export function PveFieldEffectsIntroCue({ state }: { state: GameState }) {
  const combat = state.combat;
  const combatId = combat?.id ?? null;
  const scripts = combat ? combatScriptsActiveForCombat(state, combat) : [];
  const seenRef = useRef<Set<string>>(new Set());
  // The combat id the banner is currently up for (null = nothing shown). The
  // TEXT is always re-read from the live scripts at render time, so no stale
  // rules line can ever be frozen into component state.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const scripted = Boolean(combatId) && scripts.length > 0;

  useEffect(() => {
    if (!scripted || !combatId || seenRef.current.has(combatId)) {
      return;
    }
    seenRef.current.add(combatId);
    setShownFor(combatId);
  }, [scripted, combatId]);

  useEffect(() => {
    if (!shownFor) {
      return;
    }
    const timer = window.setTimeout(() => setShownFor(null), PVE_FIELD_EFFECT_CUE_MS);
    return () => window.clearTimeout(timer);
  }, [shownFor]);

  if (!combatId || shownFor !== combatId || scripts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pveFieldEffectCue"
      data-combat-id={combatId}
      role="status"
      style={{ pointerEvents: "none" }}
    >
      <strong className="pveFieldEffectCueHeadline">
        🌀 Field effects in this battle ({scripts.length})
      </strong>
      <ul className="pveFieldEffectCueList">
        {scripts.map((script) => (
          <li data-script-id={script.id} key={script.id}>
            <strong>{script.name.en}</strong>
            <span> — {script.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
