/**
 * Order & Chaos progress: cleared levels, stars (goals met), Seals and unit
 * levels, the chosen hero and artifacts, last seed packets, best Endless run
 * and broken raids. Browser storage only (the mode runs on the client); every
 * read and write tolerates blocked storage. Unlocks are derived from `cleared`.
 */

import type { BlessingId, SpellId } from "@/engine/garrison/content";
import { OC_ARTIFACTS, OC_HERO_ORDER, OC_MAX_LEVEL, OC_MERCENARIES, OC_SPELLS, OC_WORLDS, type OcHeroId } from "@/engine/garrison/order-chaos/campaign";
import { setItemMakingRoom } from "./storage-space";

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
  /** Story scenes already shown ("prologue:v3", "world:3", "level:w1-2", "after:w1-2", "epilogue"). */
  seen: string[];
};

export const OC_PROGRESS_KEY = "order-chaos:progress:v1";
const KEY = OC_PROGRESS_KEY;

export function emptyOcProgress(): OcProgress {
  return { cleared: [], stars: {}, seals: 0, levels: {}, hero: "catherine", artifacts: [], loadouts: {}, bestEndless: 0, raids: [], hired: [], spellbook: [], testAll: false, seen: [] };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * A save from before the story existed: mark the closing scenes of the worlds
 * the player has already moved past (a level of the next world cleared) as
 * seen, so they don't replay as a backlog. The current world's stays owed.
 */
function legacySeen(cleared: readonly string[]): string[] {
  return OC_WORLDS.filter((world) => OC_WORLDS.find((next) => next.id === world.id + 1)?.levels.some((level) => cleared.includes(level.id)))
    .map((world) => `outro:${world.id}`);
}

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
    const cleared = strings(p.cleared);
    const loadouts: Record<string, string[]> = {};
    for (const [id, list] of Object.entries(p.loadouts ?? {})) loadouts[id] = strings(list);
    return {
      cleared,
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
      testAll: p.testAll === true,
      seen: Array.isArray(p.seen) ? strings(p.seen) : legacySeen(cleared)
    };
  } catch {
    return emptyOcProgress();
  }
}

/**
 * Persist the progress; false when the browser refused (storage blocked, or
 * still full after the idle multiplayer room caches were freed) — the caller
 * warns the player, since progress then lasts for this visit only.
 */
export function saveOcProgress(progress: OcProgress): boolean {
  return setItemMakingRoom(KEY, JSON.stringify(progress));
}
