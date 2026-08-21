"use client";

/**
 * PvE FIELD-EFFECT battlefield overlays — the ANIMATED half of the Forced
 * Battle Events presentation.
 *
 * The mechanics and the words already existed (the engine scripts themselves,
 * the always-visible `PveFieldEffectsPanel`, the pre-fight menu lines and the
 * 🌀 feed line); what did not exist was ANY visual: a flooded lair, an ash storm
 * and a radiation leak all looked like an ordinary dirt field. This layer paints
 * one atmospheric, GLOBAL animation per active script across the whole
 * battlefield frame.
 *
 * PURE PRESENTATION: it derives from `combatScriptsActiveForCombat` — the SAME
 * read the engine fires from — dispatches nothing, opens no window, is
 * `aria-hidden` and `pointer-events: none`, and renders NOTHING when the fight
 * carries no scripts. So an ordinary combat is untouched and no AI/AFK seat can
 * stall on it.
 *
 * jsdom cannot compute CSS, so only the DOM contract is pinned
 * (`pve-field-effect-overlay.test.tsx`): one layer per active script, its theme,
 * the particle count, the aria/pointer contract and the registry sweep. Whether
 * the ash really drifts is a real-browser concern with no e2e spec.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameState } from "@/engine";
import { combatScriptsActiveForCombat } from "@/engine";

/** How long a fresh `COMBAT_SCRIPT_TRIGGERED` intensifies its own layer. */
export const PVE_FIELD_EFFECT_FLARE_MS = 1500;

export type PveFieldEffectVisual = {
  /**
   * The CSS theme key. Drives BOTH the modifier class
   * (`pveFieldFx-<theme>`) and `data-fx-theme`, so the stylesheet and the DOM
   * contract can never disagree about which animation a script wears.
   */
  theme: string;
  /**
   * How many animated particle spans the theme wants (0 = pure
   * gradient/pseudo-element layers, no particles).
   */
  particles: number;
  /** Human label — debugging / `title` only, never a rules claim. */
  label: string;
};

/**
 * ONE visual per script id. TOTAL over the shipped PvE script catalog: a sweep
 * in `pve-field-effect-overlay.test.tsx` fails if a `PVE_COMBAT_SCRIPT_DEFINITIONS`
 * entry has no visual (so a future script cannot ship invisible) and if an entry
 * here names no registered script (no orphan visuals).
 *
 * The two Bí Cảnh LOCATION scripts are included too — they run through the same
 * `combatScriptsActiveForCombat` read, so they would otherwise fall through to
 * the generic fallback.
 */
export const PVE_FIELD_EFFECT_VISUALS: Record<string, PveFieldEffectVisual> = {
  // ——— Dungeon, classic theme ———————————————————————————————————————————
  pve_dungeon_classic_shallow: { theme: "drip", particles: 14, label: "Dripping dark" },
  pve_dungeon_classic_deep: { theme: "dust", particles: 18, label: "Low ceilings" },
  pve_dungeon_classic_abyss: { theme: "pressure", particles: 0, label: "Abyssal pressure" },
  // ——— Dungeon, doom theme —————————————————————————————————————————————
  pve_dungeon_doom_shallow: { theme: "radiation", particles: 0, label: "Radiation leak" },
  pve_dungeon_doom_deep: { theme: "emberRise", particles: 16, label: "Hell empowers its own" },
  pve_dungeon_doom_abyss: { theme: "forge", particles: 0, label: "Furnace glow" },
  // ——— Rift Lairs ——————————————————————————————————————————————————————
  pve_lair_healing_miasma: { theme: "miasma", particles: 10, label: "Healing miasma" },
  pve_lair_flooded: { theme: "flood", particles: 0, label: "Flooded lair" },
  pve_lair_ash_storm: { theme: "ashStorm", particles: 22, label: "Ash storm" },
  pve_lair_thickening_nest: { theme: "web", particles: 0, label: "Thickening nest" },
  pve_lair_unmaking_presence: { theme: "unmaking", particles: 0, label: "The god's presence" },
  // ——— Bí Cảnh location scripts (same selection read) ——————————————————
  bi_canh_spirit_mist: { theme: "spiritMist", particles: 12, label: "Spirit mist" },
  bi_canh_earthvein_surge: { theme: "earthvein", particles: 0, label: "Earthvein surge" }
};

/**
 * What an UNMAPPED script wears: a neutral tint with no particles. It exists so
 * a hand-registered campaign script is never invisible AND never crashes; the
 * registry sweep is what keeps shipped content off this path.
 */
export const PVE_FIELD_EFFECT_FALLBACK_VISUAL: PveFieldEffectVisual = {
  theme: "generic",
  particles: 0,
  label: "Field effect"
};

export function pveFieldEffectVisual(scriptId: string): PveFieldEffectVisual {
  return PVE_FIELD_EFFECT_VISUALS[scriptId] ?? PVE_FIELD_EFFECT_FALLBACK_VISUAL;
}

/**
 * The script ids whose effect JUST fired, for ~`PVE_FIELD_EFFECT_FLARE_MS`.
 *
 * Derived from the newest `COMBAT_SCRIPT_TRIGGERED` event id per script in
 * `state.eventLog`. Events already present on the FIRST render never flare, so a
 * reconnect/replay does not re-flash history (and the combat-start trigger's
 * announcement is the intro cue's job, not a flare).
 */
function useFreshScriptFlares(state: GameState): ReadonlySet<string> {
  const eventLog = state.eventLog;
  const latestByScript = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of eventLog ?? []) {
      if (event.type === "COMBAT_SCRIPT_TRIGGERED") {
        map.set(event.scriptId, event.id);
      }
    }
    return map;
  }, [eventLog]);

  const seenRef = useRef<Map<string, string> | null>(null);
  const [flares, setFlares] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const firstPass = seenRef.current === null;
    const seen = seenRef.current ?? new Map<string, string>();
    seenRef.current = seen;
    const fresh: string[] = [];
    for (const [scriptId, eventId] of latestByScript) {
      if (seen.get(scriptId) !== eventId) {
        seen.set(scriptId, eventId);
        if (!firstPass) {
          fresh.push(scriptId);
        }
      }
    }
    if (fresh.length === 0) {
      return;
    }
    // The repo's established cue pattern: a transient presentation flash that
    // reacts to a snapshot's NEW events must be set from the effect (there is no
    // external store to subscribe to), then cleared on its own timer.
    /* eslint-disable react-hooks/set-state-in-effect */
    setFlares(new Set(fresh));
    /* eslint-enable react-hooks/set-state-in-effect */
    const timer = window.setTimeout(() => setFlares(new Set()), PVE_FIELD_EFFECT_FLARE_MS);
    return () => window.clearTimeout(timer);
  }, [latestByScript]);

  return flares;
}

/**
 * The stack of animated field-effect layers for the CURRENT combat. Mounted
 * inside `.battlefieldFrame` (board.tsx) so it inherits the board's box on every
 * surface — desktop HUD and phone mode alike — instead of being pinned to the
 * viewport.
 */
export function PveFieldEffectOverlay({ state }: { state: GameState }) {
  const combat = state.combat;
  const scripts = combat ? combatScriptsActiveForCombat(state, combat) : [];
  const flares = useFreshScriptFlares(state);
  if (scripts.length === 0) {
    return null;
  }
  return (
    <div aria-hidden="true" className="pveFieldFxStack">
      {scripts.map((script) => {
        const visual = pveFieldEffectVisual(script.id);
        return (
          <div
            className={`pveFieldFxLayer pveFieldFx-${visual.theme}`}
            data-flare={flares.has(script.id) ? "on" : undefined}
            data-fx-theme={visual.theme}
            data-script-id={script.id}
            key={script.id}
            title={visual.label}
          >
            {visual.particles > 0
              ? Array.from({ length: visual.particles }, (_, index) => (
                  <span
                    className="pveFieldFxParticle"
                    key={index}
                    // Deterministic (never Math.random): the same index always
                    // yields the same lane/delay, so SSR and the client agree.
                    style={
                      {
                        "--pve-fx-index": index,
                        "--pve-fx-lane": `${((index * 37) % 100)}%`,
                        "--pve-fx-delay": `${((index * 431) % 5000) / 1000}s`,
                        "--pve-fx-scale": `${0.7 + ((index * 17) % 60) / 100}`
                      } as CSSProperties
                    }
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
