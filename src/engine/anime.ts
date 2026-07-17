/**
 * Anime mod gate helpers and defaults.
 *
 * Default OFF — every helper returns false when `state.anime` / options are
 * absent so legacy tables are byte-identical.
 *
 * Field Overrides are GLOBAL (see `src/engine/field-overrides.ts` +
 * GameSetupOptions.fieldOverrides) — not anime module flags. The anime mod
 * only contributes object content into the global catalog.
 */

import type { AnimeModOptions, GameSetupOptions, GameState } from "./state";

export const DEFAULT_ANIME_OPTIONS: AnimeModOptions = {
  enabled: false,
  xianxiaTowns: false,
  secretRealms: false,
  xianxiaNeutrals: false,
  elixirPills: false,
  cultivation: false,
  destiny: false,
  isekaiTowns: false,
  isekaiNeutrals: false,
  guild: false,
  monsterWaves: false,
  raidBosses: false,
  dungeon: false,
  gods: false,
  xianxiaArtifacts: false,
  heartDemon: false
};

/** Master crest / skin gate. */
export function animeEnabled(state: Pick<GameState, "anime"> | { anime?: AnimeModOptions } | null | undefined): boolean {
  return Boolean(state?.anime?.enabled);
}

/** Whether a named module is on (implies master enabled). */
export function animeModuleEnabled(
  state: Pick<GameState, "anime"> | { anime?: AnimeModOptions } | null | undefined,
  module: keyof Omit<AnimeModOptions, "enabled" | "waveCadence">
): boolean {
  const anime = state?.anime;
  if (!anime?.enabled) {
    return false;
  }
  return Boolean(anime[module]);
}

/** Merge partial lobby anime options onto defaults (WOG pattern). */
export function resolveAnimeOptions(partial?: Partial<AnimeModOptions> | null): AnimeModOptions {
  if (!partial) {
    return { ...DEFAULT_ANIME_OPTIONS };
  }
  return {
    ...DEFAULT_ANIME_OPTIONS,
    ...partial
  };
}

/** Read anime options from setup lobby / buildAdventure options. */
export function animeOptionsFromSetup(options: Pick<GameSetupOptions, "anime"> | null | undefined): AnimeModOptions {
  return resolveAnimeOptions(options?.anime ?? null);
}
