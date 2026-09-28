/**
 * Garrison Wars progress: cleared adventure levels, the chosen campaign
 * banner, last loadouts and best Endless run. Browser storage only — the mode
 * runs entirely on the client. Every read and write tolerates blocked storage.
 */

import { FACTION_ORDER, type CardId } from "@/engine/garrison/content";
import type { FactionChoice } from "@/engine/garrison/levels";

export type GarrisonProgress = {
  cleared: string[];
  raids: string[];
  faction: FactionChoice;
  bestEndless: number;
  loadouts: Record<string, CardId[]>;
};

const KEY = "garrison-wars:progress:v1";

export const EMPTY_PROGRESS: GarrisonProgress = { cleared: [], raids: [], faction: "castle", bestEndless: 0, loadouts: {} };

export function loadProgress(): GarrisonProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_PROGRESS, loadouts: {} };
    const parsed = JSON.parse(raw) as Partial<GarrisonProgress>;
    return {
      cleared: Array.isArray(parsed.cleared) ? parsed.cleared.filter((id): id is string => typeof id === "string") : [],
      raids: Array.isArray(parsed.raids) ? parsed.raids.filter((id): id is string => typeof id === "string") : [],
      faction: isFactionChoice(parsed.faction) ? parsed.faction : "castle",
      bestEndless: typeof parsed.bestEndless === "number" ? parsed.bestEndless : 0,
      loadouts: cleanLoadouts(parsed.loadouts)
    };
  } catch {
    return { ...EMPTY_PROGRESS, loadouts: {} };
  }
}

function isFactionChoice(value: unknown): value is FactionChoice {
  return value === "mixed" || (typeof value === "string" && (FACTION_ORDER as readonly string[]).includes(value));
}

function cleanLoadouts(value: unknown): Record<string, CardId[]> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, CardId[]> = {};
  for (const [level, cards] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(cards)) out[level] = cards.filter((card): card is CardId => typeof card === "string");
  }
  return out;
}

export function saveProgress(progress: GarrisonProgress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked (private mode, quota): progress lasts for this visit only.
  }
}
