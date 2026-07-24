/**
 * Calamity Waves (anime-mod plan §6.6) — pure schedule/reward helpers. The
 * adventure wiring lives in adventure.ts (announce + queue the assaults behind
 * the round-start barrier, pillage on a loss) and adventure-reducer.ts (the
 * `wave-assault` reward pump branch opens the combat; the placement→draw seam
 * mints the wave army; finalizeAdventureCombat routes the outcome).
 * NOTHING here imports adventure.ts (no cycles).
 */

import type { CustomGuardSpec, GameState } from "./state";

/** Standard waves cap at a level-5 war party (level 7 = azure, never a wave). */
export const WAVE_ARMY_LEVEL_CAP = 5;
/** Repelling an assault: +2 gold, +1 main-hero XP (§6.6.3). */
export const WAVE_WIN_GOLD = 2;
export const WAVE_WIN_XP = 1;
/** From wave 3 on, a repelled assault also pays one Treasure-die roll. */
export const WAVE_TREASURE_DIE_FROM_WAVE = 3;
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
