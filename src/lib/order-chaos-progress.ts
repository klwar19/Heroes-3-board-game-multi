/**
 * Order & Chaos progress: cleared levels, stars (goals met), Seals and unit
 * levels, the chosen hero and artifacts, last seed packets, best Endless run
 * and broken raids. Browser storage only (the mode runs on the client); every
 * read and write tolerates blocked storage. Unlocks are derived from `cleared`.
 */

import type { BlessingId, SpellId } from "@/engine/garrison/content";
import { OC_ARTIFACTS, OC_HERO_ORDER, OC_MAX_LEVEL, OC_MERCENARIES, OC_SPELLS, type OcHeroId } from "@/engine/garrison/order-chaos/campaign";

export type OcProgress = {
  cleared: string[];
  /** Per level: the indices of the goals met at least once. */
  stars: Record<string, number[]>;
  seals: number;
  /** Barracks levels by unit kind (missing = 1). */
  levels: Record<string, number>;
  hero: OcHeroId;
  artifacts: BlessingId[];
  loadouts: Record<string, string[]>;
  bestEndless: number;
  raids: string[];
  /** Mercenary Camp units hired with Seals. */
  hired: string[];
  /** General spells packed into the spellbook (empty: the first ones found). */
  spellbook: SpellId[];
  /** Testing only: everything unlocked (password-gated in the menu). */
  testAll: boolean;
};

const KEY = "order-chaos:progress:v1";

export function emptyOcProgress(): OcProgress {
  return { cleared: [], stars: {}, seals: 0, levels: {}, hero: "catherine", artifacts: [], loadouts: {}, bestEndless: 0, raids: [], hired: [], spellbook: [], testAll: false };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function loadOcProgress(): OcProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyOcProgress();
    const p = JSON.parse(raw) as Partial<OcProgress>;
    const stars: Record<string, number[]> = {};
    for (const [id, list] of Object.entries(p.stars ?? {})) {
      if (Array.isArray(list)) stars[id] = list.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 4);
    }
    const levels: Record<string, number> = {};
    for (const [kind, level] of Object.entries(p.levels ?? {})) {
      if (Number.isInteger(level)) levels[kind] = Math.max(1, Math.min(OC_MAX_LEVEL, level as number));
    }
    const loadouts: Record<string, string[]> = {};
    for (const [id, list] of Object.entries(p.loadouts ?? {})) loadouts[id] = strings(list);
    return {
      cleared: strings(p.cleared),
      stars,
      seals: typeof p.seals === "number" && p.seals >= 0 ? Math.floor(p.seals) : 0,
      levels,
      hero: OC_HERO_ORDER.includes(p.hero as OcHeroId) ? (p.hero as OcHeroId) : "catherine",
      artifacts: strings(p.artifacts).filter((id): id is BlessingId => OC_ARTIFACTS.includes(id as BlessingId)),
      loadouts,
      bestEndless: typeof p.bestEndless === "number" ? p.bestEndless : 0,
      raids: strings(p.raids),
      hired: strings(p.hired).filter((kind) => OC_MERCENARIES.some((merc) => merc.kind === kind)),
      spellbook: strings(p.spellbook).filter((id): id is SpellId => OC_SPELLS.includes(id as SpellId)),
      testAll: p.testAll === true
    };
  } catch {
    return emptyOcProgress();
  }
}

export function saveOcProgress(progress: OcProgress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked (private mode, quota): progress lasts for this visit only.
  }
}
