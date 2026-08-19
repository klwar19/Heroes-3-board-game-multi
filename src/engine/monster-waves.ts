/**
 * Calamity Waves (anime-mod plan §6.6) — pure schedule/reward helpers. The
 * adventure wiring lives in adventure.ts (announce + queue the assaults behind
 * the round-start barrier, pillage on a loss) and adventure-reducer.ts (the
 * `wave-assault` reward pump branch opens the combat; the placement→draw seam
 * mints the wave army; finalizeAdventureCombat routes the outcome).
 * NOTHING here imports adventure.ts (no cycles).
 */

import { DUNGEON_FLOOR_BOSSES } from "@/data/anime/bosses";
import type {
  CustomGuardSpec,
  GameState,
  ResolvedPveEncounterTheme,
  WaveDefeatLimit,
  WavePressure
} from "./state";
import type { SeededRandom } from "./random";
import { waveBattleEventFor, waveEconomyProfile } from "./pve-content";

/** Standard waves cap at a level-5 war party (level 7 = azure, never a wave). */
export const WAVE_ARMY_LEVEL_CAP = 5;
/** Repelling an assault: +2 gold, +1 main-hero XP (§6.6.3). */
export const WAVE_WIN_GOLD = 2;
export const WAVE_WIN_XP = 1;
/**
 * A repelled assault also drills every surviving deployed unit +1 XP (Unit
 * Experience only; USER RULE 2026-08-19). It STACKS on top of the ordinary
 * neutral base XP and the Veteran/Elite guard bonus, and — unlike the neutral
 * base — is NOT capped at the winner's hero level (it is a fixed wave reward).
 */
export const WAVE_WIN_UNIT_XP = 1;
/** From wave 3 on, a repelled assault also pays one Treasure-die roll. */
export const WAVE_TREASURE_DIE_FROM_WAVE = 3;
/**
 * Composition variety (USER RULE 2026-08-19 — "monster can vary more"). All
 * deterministic in (game seed, wave) so the same wave is identical across
 * clients, reconnects and same-seed replays.
 */
/** From this wave a classic-theme assault MAY arrive as a themed faction warband
 *  (real Few/Pack town units) instead of loose Neutrals (seeded 50/50). */
export const WAVE_WARBAND_FROM_WAVE = 2;
/** From this wave some invaders carry a Stack Token (an extra absorbed blow + stat). */
export const WAVE_STACK_TOKENS_FROM_WAVE = 3;
/** No more than this many invaders in one wave carry a Stack Token. */
export const WAVE_STACK_TOKEN_CAP = 3;
/** From this wave the invaders are battle-hardened (Veteran ranks) AND a mini-boss leads them. */
export const WAVE_VETERAN_FROM_WAVE = 4;
export const WAVE_MINIBOSS_FROM_WAVE = 4;
/** Rank cap for wave invaders (Seasoned/Veteran/Elite — matches the neutral cap). */
export const WAVE_VETERAN_RANK_CAP = 3;
/**
 * The mini-boss pool per theme — the existing two-layer Dungeon-floor wardens
 * (§6.7.3), reused so a wave boss ships with real art, real HP layers and a real
 * combat ability rather than a decorative new stub.
 */
export const WAVE_MINIBOSS_POOLS = {
  classic: ["minotaur_of_the_depths", "floor_wyrm"],
  doom: ["doom_baron_warden", "doom_cyberdemon_tyrant"]
} as const;
/** Pillage on a loss/retreat: lose 3 gold (floored at 0) + one holding overrun. */
export const WAVE_PILLAGE_GOLD = 3;
/** The overrun mine/settlement is re-seeded with a difficulty-Ⅰ guard. */
export const WAVE_OVERRUN_GUARD_LEVEL = 1;

/** Whether Calamity Waves is ON for this game (presence = frozen ON). */
export function monsterWavesEnabled(state: GameState): boolean {
  return Boolean(state.adventure?.monsterWaves);
}

/** The frozen wave rhythm: a wave every Nth round, first wave on round N. */
export function waveCadenceOf(state: GameState): 3 | 4 | 5 {
  return state.adventure?.monsterWaves?.cadence ?? 4;
}

export function waveThemeOf(state: GameState): ResolvedPveEncounterTheme {
  return state.adventure?.pveTheme ?? "classic";
}

export function wavePressureOf(state: GameState): WavePressure {
  return state.adventure?.monsterWaves?.pressure ?? "standard";
}

export function waveDefeatLimitOf(state: GameState): WaveDefeatLimit {
  return state.adventure?.monsterWaves?.defeatLimit ?? 0;
}

export function waveRewardsOf(state: GameState) {
  return waveEconomyProfile(wavePressureOf(state));
}

export function waveBattleEventOf(state: GameState, wave: number) {
  return waveBattleEventFor(waveThemeOf(state), wave);
}

/**
 * The wave number (1-based) due at THIS round, or null on a quiet round.
 * Pure in (cadence, round): wave k fires on round k × cadence.
 */
export function waveNumberForRound(cadence: number, round: number): number | null {
  if (cadence <= 0 || round < cadence || round % cadence !== 0) {
    return null;
  }
  return round / cadence;
}

/** The NEUTRAL_ARMY_TABLE row a standard wave draws: wave 1 ≈ 2, +1/wave, cap 5. */
export function waveArmyLevel(wave: number): number {
  return Math.max(1, Math.min(WAVE_ARMY_LEVEL_CAP, wave + 1));
}

/**
 * Designer exact-wave override (map preset `monsterWaves.waves[wave]` — the
 * CustomGuardSpec vocabulary): replaces that wave number's level-table draw
 * for EVERY seat's assault. Null = no override, draw from the level table.
 */
export function designedWaveSpec(state: GameState, wave: number): CustomGuardSpec | null {
  const spec = state.adventure?.mapPreset?.monsterWaves?.waves?.[wave];
  if (!spec) {
    return null;
  }
  if ((spec.units?.length ?? 0) > 0 || (spec.level ?? 0) > 0) {
    return spec;
  }
  return null;
}

/**
 * The Veteran rank (0–3) the invaders of wave N fight at (USER RULE 2026-08-19 —
 * "higher unit exp level from wave 4"): none before wave 4, Seasoned at 4–5,
 * Veteran at 6–7, Elite from 8. Folded onto every non-boss invader at reveal,
 * so a fought-out later wave is genuinely harder AND pays the Veteran/Elite
 * bonus XP the player already earns against ranked neutral guards.
 */
export function waveVeteranRank(wave: number): number {
  if (wave < WAVE_VETERAN_FROM_WAVE) {
    return 0;
  }
  if (wave < 6) {
    return 1;
  }
  if (wave < 8) {
    return 2;
  }
  return WAVE_VETERAN_RANK_CAP;
}

/**
 * How many invaders carry a Stack Token (a Polish-style extra absorbed blow +
 * stat) in wave N: none before wave 3, then wave−2 tokens, capped at 3.
 */
export function waveStackTokenCount(wave: number): number {
  if (wave < WAVE_STACK_TOKENS_FROM_WAVE) {
    return 0;
  }
  return Math.min(WAVE_STACK_TOKEN_CAP, wave - 2);
}

/**
 * Whether wave N (classic theme) arrives as a themed faction WARBAND (real
 * Few/Pack town units drawn at the same Field-Difficulty row) instead of loose
 * Neutrals. Deterministic 50/50 from wave 2 on; the caller falls back to the
 * Neutral draw when no playable faction exists. Doom waves never warband
 * (their draw mints Doom cards).
 */
export function waveArmyIsWarband(wave: number, random: SeededRandom): boolean {
  if (wave < WAVE_WARBAND_FROM_WAVE) {
    return false;
  }
  return random.nextInt(0, 1) === 1;
}

/** Whether wave N is led by a mini-boss (guaranteed from wave 4). */
export function waveMiniBossPresent(wave: number): boolean {
  return wave >= WAVE_MINIBOSS_FROM_WAVE;
}

/** The mini-boss definition id leading wave N, drawn from the frozen theme's pool. */
export function waveMiniBossDefId(
  wave: number,
  random: SeededRandom,
  theme: ResolvedPveEncounterTheme
): string {
  const pool = theme === "doom" ? WAVE_MINIBOSS_POOLS.doom : WAVE_MINIBOSS_POOLS.classic;
  return pool[random.nextInt(0, pool.length - 1)]!;
}

/**
 * The mini-boss's health-bar count in wave N: two bars from wave 4, +1 every two
 * waves, never above the definition's printed layer cap (the wardens ship 2–3).
 */
export function waveMiniBossLayers(wave: number, defLayers: number): number {
  const grown = 2 + Math.floor(Math.max(0, wave - WAVE_MINIBOSS_FROM_WAVE) / 2);
  return Math.max(1, Math.min(defLayers, grown));
}

/** Every mini-boss def a wave can field (data-test coverage of the pools). */
export function listWaveMiniBossDefIds(): string[] {
  return [...WAVE_MINIBOSS_POOLS.classic, ...WAVE_MINIBOSS_POOLS.doom];
}

/** The shipped warden defs the wave pools reference (kept honest by a data test). */
export const WAVE_MINIBOSS_DEFS = DUNGEON_FLOOR_BOSSES;
