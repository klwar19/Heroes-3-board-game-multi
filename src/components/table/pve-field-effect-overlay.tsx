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
 * MEDIA half (2026-08-21): five themes additionally mount a looping VIDEO
 * overlay (Pixabay-licensed stock, `public/assets/fx/pve/overlay-*.mp4`,
 * screen-blended so its black background vanishes) and six themes swap their
 * flat CSS particle dots for soft transparent SPRITE textures
 * (`particle-*.webp`). The video is NEVER mounted in phone mode or under
 * `prefers-reduced-motion` — a hidden video still downloads (the setup-scene
 * rule) — so those clients keep the pure-CSS layer as the complete effect.
 * The clips are not seamless loops; at overlay opacity under a screen blend
 * the loop cut is a soft fade, accepted deliberately.
 *
 * Video sources (Pixabay license — free use, no attribution required),
 * downscaled to 640x360 crf28 no-audio:
 *   overlay-flood.mp4     pixabay.com/videos/particles-rays-blue-underwater-203336
 *   overlay-ash.mp4       pixabay.com/videos/smoke-fire-dark-overlay-247797
 *   overlay-radiation.mp4 pixabay.com/videos/particles-green-space-abstract-5253
 *   overlay-embers.mp4    pixabay.com/videos/fire-sparks-smoke-burn-burning-170065
 *   overlay-mist.mp4      pixabay.com/videos/smoke-fog-abstract-black-and-white-250438
 * Sprites are image-gen (scripts/gen-pve-fx-textures.ps1 is the SOURCES record).
 *
 * jsdom cannot compute CSS, so only the DOM contract is pinned
 * (`pve-field-effect-overlay.test.tsx`): one layer per active script, its theme,
 * the particle count, the aria/pointer contract and the registry sweep. Whether
 * the ash really drifts is a real-browser concern with no e2e spec.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameState } from "@/engine";
import { combatScriptsActiveForCombat } from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { getUiModePreference, useUiModePreference } from "@/lib/ui-mode-preference";

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
  /**
   * OPTIONAL looping video overlay (a real filmed/pre-rendered texture,
   * Pixabay-licensed, `public/assets/fx/pve/overlay-*.mp4`). Composited with
   * `mix-blend-mode: screen` so its near-black background vanishes over the
   * board art. NEVER mounted in phone mode or under `prefers-reduced-motion`
   * (a `display: none` video still downloads — the setup-scene rule), so those
   * surfaces keep the pure-CSS animation below as the complete effect.
   */
  video?: string;
  /**
   * OPTIONAL soft particle sprite (transparent webp,
   * `public/assets/fx/pve/particle-*.webp`) replacing the flat CSS dot on this
   * theme's `.pveFieldFxParticle` spans via `--pve-fx-sprite`. A theme without
   * one keeps its original CSS-drawn particle.
   */
  sprite?: string;
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
/** The media directory every video/sprite path below lives in. */
const FX_DIR = "/assets/fx/pve";

export const PVE_FIELD_EFFECT_VISUALS: Record<string, PveFieldEffectVisual> = {
  // ——— Dungeon, classic theme ———————————————————————————————————————————
  pve_dungeon_classic_shallow: {
    theme: "drip",
    particles: 14,
    label: "Dripping dark",
    sprite: `${FX_DIR}/particle-dripwater.webp`
  },
  pve_dungeon_classic_deep: {
    theme: "dust",
    particles: 18,
    label: "Low ceilings",
    sprite: `${FX_DIR}/particle-dust.webp`
  },
  pve_dungeon_classic_abyss: { theme: "pressure", particles: 0, label: "Abyssal pressure" },
  // ——— Dungeon, doom theme —————————————————————————————————————————————
  pve_dungeon_doom_shallow: {
    theme: "radiation",
    particles: 0,
    label: "Radiation leak",
    video: `${FX_DIR}/overlay-radiation.mp4`
  },
  pve_dungeon_doom_deep: {
    theme: "emberRise",
    particles: 16,
    label: "Hell empowers its own",
    video: `${FX_DIR}/overlay-embers.mp4`,
    sprite: `${FX_DIR}/particle-ember.webp`
  },
  pve_dungeon_doom_abyss: { theme: "forge", particles: 0, label: "Furnace glow" },
  // ——— Rift Lairs ——————————————————————————————————————————————————————
  pve_lair_healing_miasma: {
    theme: "miasma",
    particles: 10,
    label: "Healing miasma",
    sprite: `${FX_DIR}/particle-spore.webp`
  },
  pve_lair_flooded: {
    theme: "flood",
    particles: 0,
    label: "Flooded lair",
    video: `${FX_DIR}/overlay-flood.mp4`
  },
  pve_lair_ash_storm: {
    theme: "ashStorm",
    particles: 22,
    label: "Ash storm",
    video: `${FX_DIR}/overlay-ash.mp4`,
    sprite: `${FX_DIR}/particle-ember.webp`
  },
  pve_lair_thickening_nest: { theme: "web", particles: 0, label: "Thickening nest" },
  pve_lair_unmaking_presence: { theme: "unmaking", particles: 0, label: "The god's presence" },
  // ——— Bí Cảnh location scripts (same selection read) ——————————————————
  bi_canh_spirit_mist: {
    theme: "spiritMist",
    particles: 12,
    label: "Spirit mist",
    video: `${FX_DIR}/overlay-mist.mp4`,
    sprite: `${FX_DIR}/particle-mist.webp`
  },
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
 * "May this client MOUNT the looping overlay videos?" — false in phone mode
 * (the setup-scene rule: a `display: none` video with any preload still
 * downloads, so CSS cannot gate it) and false under `prefers-reduced-motion`
 * (those users opted out of ambient movement AND should not pay the download).
 * The pure-CSS layer below the video is the complete effect on both surfaces.
 *
 * Phone half mirrors `SetupSceneArt`: the LIVE preference (so the in-game
 * 📱/💻 toggle unmounts mid-session) seeded by a synchronous read for the
 * first render. Safe for the same reason: the table only ever renders
 * client-side (page.tsx's `state` starts null), so no hydration mismatch.
 */
function useFieldFxVideoAllowed(): boolean {
  const { ready, uiMode } = useUiModePreference();
  const [storedPhoneOnMount] = useState(() => getUiModePreference() === "phone");
  const phoneMode = ready ? uiMode === "phone" : storedPhoneOnMount;
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  return !phoneMode && !reducedMotion;
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
  const videoAllowed = useFieldFxVideoAllowed();
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
            data-fx-sprite={visual.sprite ? "on" : undefined}
            data-fx-theme={visual.theme}
            data-script-id={script.id}
            key={script.id}
            style={
              visual.sprite
                ? ({ "--pve-fx-sprite": `url(${assetUrl(visual.sprite)})` } as CSSProperties)
                : undefined
            }
            title={visual.label}
          >
            {visual.video && videoAllowed ? (
              <video
                autoPlay
                className="pveFieldFxVideo"
                loop
                muted
                playsInline
                preload="auto"
                src={assetUrl(visual.video)}
              />
            ) : null}
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
