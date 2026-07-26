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
  // absent === ON (legacy); harmless while enabled:false (anime gates require enabled).
  mapObjects: true,
  // absent === ON (legacy, mirrors mapObjects); the anime combat scripts gate on
  // `combatEvents !== false`. Harmless while enabled:false.
  combatEvents: true,
  xianxiaTowns: false,
  secretRealms: false,
  xianxiaNeutrals: false,
  doomNeutrals: false,
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
  heartDemon: false,
  heroGrades: false,
  equipment: false,
  // Opt-in only (=== true, no legacy semantics — new mechanics).
  unitStacks: false,
  unitExperience: false,
  neutralRankUp: false,
  pveTheme: "classic",
  wavePressure: "standard",
  waveDefeatLimit: 0,
  raidBossSpawnRound: 5,
  dungeonDepth: 10,
  dungeonDescentCost: 1
};

/** Master crest / skin gate. */
export function animeEnabled(state: Pick<GameState, "anime"> | { anime?: AnimeModOptions } | null | undefined): boolean {
  return Boolean(state?.anime?.enabled);
}

/** Whether a named module is on (implies master enabled). */
export function animeModuleEnabled(
  state: Pick<GameState, "anime"> | { anime?: AnimeModOptions } | null | undefined,
  module: keyof Omit<
    AnimeModOptions,
    | "enabled"
    | "waveCadence"
    | "pveTheme"
    | "wavePressure"
    | "waveDefeatLimit"
    | "raidBossSpawnRound"
    | "dungeonDepth"
    | "dungeonDescentCost"
  >
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
  const merged = {
    ...DEFAULT_ANIME_OPTIONS,
    ...partial
  };
  return {
    ...merged,
    pveTheme:
      merged.pveTheme === "doom" || merged.pveTheme === "random"
        ? merged.pveTheme
        : "classic",
    wavePressure: merged.wavePressure === "brutal" ? "brutal" : "standard",
    waveDefeatLimit:
      merged.waveDefeatLimit === 2 || merged.waveDefeatLimit === 3
        ? merged.waveDefeatLimit
        : 0,
    raidBossSpawnRound:
      merged.raidBossSpawnRound === 4 || merged.raidBossSpawnRound === 6
        ? merged.raidBossSpawnRound
        : 5,
    dungeonDepth: merged.dungeonDepth === 5 ? 5 : 10,
    dungeonDescentCost:
      merged.dungeonDescentCost === 0 || merged.dungeonDescentCost === 2
        ? merged.dungeonDescentCost
        : 1
  };
}

/** Read anime options from setup lobby / buildAdventure options. */
export function animeOptionsFromSetup(options: Pick<GameSetupOptions, "anime"> | null | undefined): AnimeModOptions {
  return resolveAnimeOptions(options?.anime ?? null);
}
