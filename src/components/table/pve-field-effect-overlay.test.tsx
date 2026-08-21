// @vitest-environment jsdom
/**
 * PvE FIELD-EFFECT animated overlays + the one-shot explainer cue — DOM
 * contract only.
 *
 * jsdom cannot compute CSS, so NOTHING here proves the ash drifts, the flood
 * shimmers or that a layer sits above the board art: the visible half is a
 * real-browser concern with no e2e spec. What IS pinned: one layer per script
 * the ENGINE selects (`combatScriptsActiveForCombat`), the theme/particle
 * contract those CSS rules key off, that an unscripted fight renders NOTHING
 * (CONTROL), that both surfaces take NO input (so they can never block a player
 * or stall an AI/AFK seat), the registry SWEEP (no shipped script may be
 * invisible and no visual may be an orphan), the flare on a FRESH
 * `COMBAT_SCRIPT_TRIGGERED`, and the cue's show-once-per-combat-id rule.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { GameState } from "@/engine";
import { pveEncounterScriptsFor, PVE_COMBAT_SCRIPT_DEFINITIONS } from "@/data/anime/pve-combat-scripts";
import { getCombatScriptDefinition } from "@/data/map/combat-scripts";
import {
  PVE_FIELD_EFFECT_FLARE_MS,
  PVE_FIELD_EFFECT_VISUALS,
  PveFieldEffectOverlay,
  pveFieldEffectVisual
} from "./pve-field-effect-overlay";
import { PVE_FIELD_EFFECT_CUE_MS, PveFieldEffectsIntroCue } from "./pve-field-effects-cue";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * The smallest state both surfaces read (the panel test's fixture): a neutral
 * combat carrying a PvE encounter identity plus the fought field's location.
 */
function pveState(
  context: Record<string, unknown>,
  extra: { eventLog?: unknown[]; combatId?: string } = {}
): GameState {
  return {
    eventLog: extra.eventLog ?? [],
    adventure: { pveTheme: "classic", fields: { f1: { spaceId: "f1", location: "dungeon_gate" } } },
    combat: { id: extra.combatId ?? "c1", context: { kind: "neutral", fieldId: "f1", ...context } }
  } as unknown as GameState;
}

/** An ordinary guard fight on a plain field — the CONTROL for both surfaces. */
function plainState(): GameState {
  return {
    eventLog: [],
    adventure: { fields: { f1: { spaceId: "f1", location: "mine" } } },
    combat: { id: "c1", context: { kind: "neutral", fieldId: "f1" } }
  } as unknown as GameState;
}

describe("PvE field-effect visuals registry", () => {
  it("SWEEP: every shipped PvE script has a visual (a new script cannot ship invisible)", () => {
    const missing = Object.keys(PVE_COMBAT_SCRIPT_DEFINITIONS).filter(
      (id) => !PVE_FIELD_EFFECT_VISUALS[id]
    );
    expect(missing, "these scripts would render with no themed animation").toEqual([]);
  });

  it("SWEEP: no ORPHAN visual — every mapped id is a registered combat script", () => {
    const orphans = Object.keys(PVE_FIELD_EFFECT_VISUALS).filter(
      (id) => !getCombatScriptDefinition(id)
    );
    expect(orphans, "these visuals name no registered script").toEqual([]);
  });

  it("each visual names a DISTINCT theme per script family, with a sane particle count", () => {
    for (const [id, visual] of Object.entries(PVE_FIELD_EFFECT_VISUALS)) {
      expect(visual.theme, id).toMatch(/^[A-Za-z]+$/);
      expect(visual.particles, id).toBeGreaterThanOrEqual(0);
      expect(visual.particles, id).toBeLessThanOrEqual(40);
      expect(visual.label, id).toBeTruthy();
    }
    // The ash storm (the user's "like a sand storm" ask) is the particle-heaviest
    // theme, and the two "whole-battle stat" lairs are pure gradient vignettes.
    expect(pveFieldEffectVisual("pve_lair_ash_storm").particles).toBeGreaterThan(10);
    expect(pveFieldEffectVisual("pve_lair_unmaking_presence").particles).toBe(0);
    // An unmapped id falls through to the tinted generic theme, never a crash.
    expect(pveFieldEffectVisual("campaign_script_that_does_not_exist").theme).toBe("generic");
  });

  it("SWEEP: every declared video/sprite points at a COMMITTED media file (no 404 can ship)", () => {
    const publicDir = join(__dirname, "..", "..", "..", "public");
    for (const [id, visual] of Object.entries(PVE_FIELD_EFFECT_VISUALS)) {
      for (const media of [visual.video, visual.sprite]) {
        if (!media) continue;
        expect(existsSync(join(publicDir, media)), `${id} → ${media} is missing from public/`).toBe(
          true
        );
      }
    }
    // The media half is real, not vestigial: at least one video and one sprite ship.
    const all = Object.values(PVE_FIELD_EFFECT_VISUALS);
    expect(all.some((v) => v.video)).toBe(true);
    expect(all.some((v) => v.sprite)).toBe(true);
  });
});

describe("PvE field-effect overlay", () => {
  it("renders one themed layer per script the engine selects for this fight", () => {
    const scripts = pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 6 });
    expect(scripts.length).toBeGreaterThan(0);
    const { container } = render(<PveFieldEffectOverlay state={pveState({ dungeonFloor: 6 })} />);

    const stack = container.querySelector(".pveFieldFxStack") as HTMLElement;
    expect(stack).not.toBeNull();
    expect(stack.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll(".pveFieldFxLayer")).toHaveLength(scripts.length);

    for (const script of scripts) {
      const layer = container.querySelector(`[data-script-id="${script.id}"]`) as HTMLElement;
      expect(layer, script.id).not.toBeNull();
      const visual = pveFieldEffectVisual(script.id);
      // The CSS keys off BOTH the modifier class and the data attribute.
      expect(layer.getAttribute("data-fx-theme")).toBe(visual.theme);
      expect(layer.classList.contains(`pveFieldFx-${visual.theme}`)).toBe(true);
      expect(layer.querySelectorAll(".pveFieldFxParticle")).toHaveLength(visual.particles);
      // Nothing is flaring on a first render (no fresh trigger yet).
      expect(layer.getAttribute("data-flare")).toBeNull();
    }
  });

  it("a raid lair paints ITS boss's script — a different boss a different theme", () => {
    const state = pveState({ raidBossId: "b1" });
    (state.adventure as unknown as { raidBosses: unknown }).raidBosses = {
      b1: { defId: "abyss_kraken" }
    };
    const { container } = render(<PveFieldEffectOverlay state={state} />);
    expect(container.querySelector('[data-script-id="pve_lair_flooded"]')?.getAttribute("data-fx-theme")).toBe(
      "flood"
    );

    cleanup();
    const other = pveState({ raidBossId: "b1" });
    (other.adventure as unknown as { raidBosses: unknown }).raidBosses = {
      b1: { defId: "calamity_dragon" }
    };
    const second = render(<PveFieldEffectOverlay state={other} />);
    expect(
      second.container.querySelector('[data-script-id="pve_lair_ash_storm"]')?.getAttribute("data-fx-theme")
    ).toBe("ashStorm");
    expect(second.container.querySelector('[data-script-id="pve_lair_flooded"]')).toBeNull();
  });

  it("CONTROL: an ordinary guard fight and a closed combat render NOTHING", () => {
    const { container } = render(<PveFieldEffectOverlay state={plainState()} />);
    expect(container.querySelector(".pveFieldFxStack")).toBeNull();

    cleanup();
    const closed = render(
      <PveFieldEffectOverlay state={{ adventure: {}, combat: null, eventLog: [] } as unknown as GameState} />
    );
    expect(closed.container.querySelector(".pveFieldFxStack")).toBeNull();
  });

  it("PRESENTATION ONLY: no button, link, input or focusable child anywhere", () => {
    const { container } = render(<PveFieldEffectOverlay state={pveState({ dungeonFloor: 2 })} />);
    expect(container.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });

  it("a FRESH COMBAT_SCRIPT_TRIGGERED flares its own layer, then clears", () => {
    vi.useFakeTimers();
    const scriptId = "pve_dungeon_classic_abyss";
    const { container, rerender } = render(
      <PveFieldEffectOverlay state={pveState({ dungeonFloor: 9 })} />
    );
    const layerOf = () => container.querySelector(`[data-script-id="${scriptId}"]`) as HTMLElement;
    expect(layerOf()).not.toBeNull();
    expect(layerOf().getAttribute("data-flare")).toBeNull();

    // A new trigger arrives in the log.
    rerender(
      <PveFieldEffectOverlay
        state={pveState(
          { dungeonFloor: 9 },
          { eventLog: [{ id: "e1", type: "COMBAT_SCRIPT_TRIGGERED", scriptId }] }
        )}
      />
    );
    expect(layerOf().getAttribute("data-flare")).toBe("on");

    act(() => {
      vi.advanceTimersByTime(PVE_FIELD_EFFECT_FLARE_MS + 50);
    });
    expect(layerOf().getAttribute("data-flare")).toBeNull();
  });

  it("events already in the log on the FIRST render never flare (a reconnect replays nothing)", () => {
    const scriptId = "pve_dungeon_classic_abyss";
    const { container } = render(
      <PveFieldEffectOverlay
        state={pveState(
          { dungeonFloor: 9 },
          { eventLog: [{ id: "e1", type: "COMBAT_SCRIPT_TRIGGERED", scriptId }] }
        )}
      />
    );
    expect(
      (container.querySelector(`[data-script-id="${scriptId}"]`) as HTMLElement).getAttribute("data-flare")
    ).toBeNull();
  });
});

describe("PvE field-effect MEDIA (looping video overlays + sprite particles)", () => {
  const floodedLairState = () => {
    const state = pveState({ raidBossId: "b1" });
    (state.adventure as unknown as { raidBosses: unknown }).raidBosses = {
      b1: { defId: "abyss_kraken" }
    };
    return state;
  };

  afterEach(() => {
    window.localStorage.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).matchMedia;
  });

  it("a video theme mounts ONE muted looping <video> on a computer-mode client", () => {
    // jsdom default: preference unset (= computer) and no matchMedia (= no
    // reduced-motion opt-out) — the video-allowed baseline.
    const { container } = render(<PveFieldEffectOverlay state={floodedLairState()} />);
    const layer = container.querySelector('[data-script-id="pve_lair_flooded"]') as HTMLElement;
    const video = layer.querySelector("video.pveFieldFxVideo") as HTMLVideoElement;
    expect(video).not.toBeNull();
    // The anti-audio / autoplay-policy contract: muted, looping, inline.
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.muted || video.hasAttribute("muted")).toBe(true);
    expect(video.getAttribute("src")).toContain("/assets/fx/pve/overlay-flood.mp4");
  });

  it("PHONE MODE never mounts the video (the setup-scene rule: hidden video still downloads)", () => {
    window.localStorage.setItem("binh-ui-mode", "phone");
    const { container } = render(<PveFieldEffectOverlay state={floodedLairState()} />);
    const layer = container.querySelector('[data-script-id="pve_lair_flooded"]') as HTMLElement;
    expect(layer).not.toBeNull();
    expect(layer.querySelector("video")).toBeNull();
    // The pure-CSS layer is still the complete effect there.
    expect(layer.classList.contains("pveFieldFx-flood")).toBe(true);
  });

  it("prefers-reduced-motion never mounts the video either", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).matchMedia = (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener() {},
      removeEventListener() {}
    });
    const { container } = render(<PveFieldEffectOverlay state={floodedLairState()} />);
    expect(container.querySelector("video")).toBeNull();
  });

  it("a theme WITHOUT a video mounts none (CONTROL), and sprite themes carry the sprite contract", () => {
    const state = pveState({ raidBossId: "b1" });
    (state.adventure as unknown as { raidBosses: unknown }).raidBosses = {
      b1: { defId: "mother_demon" } // thickening nest: no video, no sprite
    };
    const { container } = render(<PveFieldEffectOverlay state={state} />);
    const web = container.querySelector('[data-script-id="pve_lair_thickening_nest"]') as HTMLElement;
    expect(web).not.toBeNull();
    expect(web.querySelector("video")).toBeNull();
    expect(web.getAttribute("data-fx-sprite")).toBeNull();
    expect(web.style.getPropertyValue("--pve-fx-sprite")).toBe("");

    cleanup();
    // A sprite theme sets BOTH halves the CSS keys off: the flag attribute and
    // the assetUrl()-wrapped custom property.
    const deep = render(<PveFieldEffectOverlay state={pveState({ dungeonFloor: 6 })} />);
    const dust = deep.container.querySelector('[data-fx-theme="dust"]') as HTMLElement;
    expect(dust).not.toBeNull();
    expect(dust.getAttribute("data-fx-sprite")).toBe("on");
    expect(dust.style.getPropertyValue("--pve-fx-sprite")).toContain(
      "/assets/fx/pve/particle-dust.webp"
    );
  });
});

describe("PvE field-effect explainer cue", () => {
  it("names every active effect with its AUTHORED summary at combat start", () => {
    const scripts = pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 6 });
    const { container } = render(<PveFieldEffectsIntroCue state={pveState({ dungeonFloor: 6 })} />);
    const cue = screen.getByRole("status");
    expect(cue.classList.contains("pveFieldEffectCue")).toBe(true);
    expect(cue.textContent).toContain(`Field effects in this battle (${scripts.length})`);
    for (const script of scripts) {
      expect(cue.querySelector(`[data-script-id="${script.id}"]`)).toBeTruthy();
      expect(cue.textContent).toContain(script.name.en);
      // The words are the engine's own authored summary, never re-written here.
      expect(cue.textContent).toContain(script.summary);
    }
    // Takes NO input at all.
    expect((cue as HTMLElement).style.pointerEvents).toBe("none");
    expect(container.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });

  it("auto-dismisses on its own timer and NEVER re-shows for the same combat id", () => {
    vi.useFakeTimers();
    const { rerender } = render(<PveFieldEffectsIntroCue state={pveState({ dungeonFloor: 6 })} />);
    expect(screen.queryByRole("status")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(PVE_FIELD_EFFECT_CUE_MS + 50);
    });
    expect(screen.queryByRole("status")).toBeNull();

    // A later snapshot of the SAME combat (a reconnect, a new round) never pops it again.
    rerender(
      <PveFieldEffectsIntroCue
        state={pveState(
          { dungeonFloor: 6 },
          { eventLog: [{ id: "e1", type: "COMBAT_SCRIPT_TRIGGERED", scriptId: "x" }] }
        )}
      />
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("status")).toBeNull();

    // A DIFFERENT combat id does get its own intro.
    rerender(<PveFieldEffectsIntroCue state={pveState({ dungeonFloor: 6 }, { combatId: "c2" })} />);
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.queryByRole("status")).not.toBeNull();
  });

  it("CONTROL: an unscripted fight and a closed combat show no explainer", () => {
    render(<PveFieldEffectsIntroCue state={plainState()} />);
    expect(screen.queryByRole("status")).toBeNull();

    cleanup();
    render(
      <PveFieldEffectsIntroCue state={{ adventure: {}, combat: null, eventLog: [] } as unknown as GameState} />
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
