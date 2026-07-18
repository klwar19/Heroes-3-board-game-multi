import type { UnitTier } from "@/data/factions/types";

/**
 * Unit Experience (optional rule) — the board-game adaptation of the WoG Unit
 * Experience System (UES, heroesofmightandmagic.com/wakeofgods/ues.shtml and
 * the CREXPBON table). The PC mod tracks 10 ranks per creature stack with
 * per-creature stat/ability schedules; the board adaptation compresses that to
 * THREE veteran ranks per unit CARD with tier-scaled XP thresholds (higher-tier
 * cards rank up slower, mirroring the PC mod's per-level experience scaling),
 * one generic stat package per tier (the CREXPBON "default level" progressions:
 * low tiers earn Defense first, then Attack; top tiers earn Attack first), and
 * a unique ELITE ability for one signature unit per faction at rank 3 (each a
 * reuse of an already-implemented engine ability — CLAUDE.md rule #2).
 *
 * All data here is consumed by src/engine/unit-experience.ts; behaviour is
 * pinned in src/engine/unit-experience.test.ts.
 */

/** Veteran rank display names; index = rank (0 unranked). */
export const UNIT_RANK_NAMES = ["", "Seasoned", "Veteran", "Elite"] as const;

export const MAX_UNIT_RANK = 3;

/**
 * Total XP needed to reach ranks 1/2/3 per tier. Bronze cards drill up fast;
 * gold/azure veterans are a long-game investment (WoG: higher-level creatures
 * need more experience per rank).
 */
export const UNIT_RANK_THRESHOLDS: Record<UnitTier, readonly [number, number, number]> = {
  bronze: [2, 5, 9],
  silver: [3, 7, 12],
  gold: [4, 9, 15],
  azure: [4, 9, 15]
};

export type UnitRankStatBonus = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
};

const NO_BONUS: UnitRankStatBonus = { attack: 0, defense: 0, health: 0, initiative: 0 };

/**
 * CUMULATIVE stat bonuses at ranks 1/2/3 per tier (index rank-1). CREXPBON's
 * default progressions give low levels Defense at R1 and Attack at R2 while
 * level-7 creatures gain Attack immediately — mirrored here: bronze/silver earn
 * +1 Defense then +1 Attack then +1 Health (bronze Elites also gain +1
 * Initiative, the CREXPBON "Speed R4" bump nearly every low creature carries);
 * gold/azure earn +1 Attack first.
 */
export const UNIT_RANK_STAT_BONUSES: Record<
  UnitTier,
  readonly [UnitRankStatBonus, UnitRankStatBonus, UnitRankStatBonus]
> = {
  bronze: [
    { ...NO_BONUS, defense: 1 },
    { ...NO_BONUS, defense: 1, attack: 1 },
    { attack: 1, defense: 1, health: 1, initiative: 1 }
  ],
  silver: [
    { ...NO_BONUS, defense: 1 },
    { ...NO_BONUS, defense: 1, attack: 1 },
    { attack: 1, defense: 1, health: 1, initiative: 0 }
  ],
  gold: [
    { ...NO_BONUS, attack: 1 },
    { ...NO_BONUS, attack: 1, defense: 1 },
    { attack: 1, defense: 1, health: 1, initiative: 0 }
  ],
  azure: [
    { ...NO_BONUS, attack: 1 },
    { ...NO_BONUS, attack: 1, defense: 1 },
    { attack: 1, defense: 1, health: 1, initiative: 0 }
  ]
};

/**
 * Unique ELITE (rank 3) ability grants — one signature unit per faction, each
 * a CREXPBON-derived flavor mapped onto an ALREADY-IMPLEMENTED engine ability
 * id (registry hygiene is pinned by test: every key must be a real unit def,
 * every value an implemented `unitAbilities` entry). The grant is appended to
 * the unit's printed `abilities` at combat-unit build time when the side does
 * not already print it; it never edits the printed card data.
 */
export const ELITE_UNIT_RANK_ABILITIES: Record<string, string> = {
  // CREXPBON "Champion: No Retaliation R5".
  "castle.champions": "ignores-retaliation",
  // CREXPBON "War Unicorn: Blind bonus" → the paralysing Blinding Horn.
  "rampart.unicorns": "unicorn-paralyze-retaliation",
  // CREXPBON "Naga: Extra Retals R5/R7/R9/R10".
  "tower.nagas": "unlimited-retaliation",
  // CREXPBON "Skeleton: Air Shield R3/R6".
  "necropolis.skeletons": "bulwark-air-shield",
  // CREXPBON "Medusa: Extra Shots" / no-penalty riders.
  "dungeon.medusas": "ignore-all-combat-penalties",
  // CREXPBON "Cerberus: Retaliate Twice R8/R9/R10".
  "inferno.cerberi": "unlimited-retaliation",
  // CREXPBON "Behemoth: Fear R5".
  "stronghold.behemoths": "wog-nightmare-fear",
  // CREXPBON "Chaos Hydra: Extra Retals R5/R7/R9/R10".
  "fortress.hydras": "unlimited-retaliation",
  // CREXPBON "Phoenix: Fire Shield".
  "conflux.phoenixes": "wog-fire-shield-1",
  // HotA sea serpent — the viper strike leaves no opening (no CREXPBON row).
  "cove.haspids": "ignores-retaliation",
  // CREXPBON "Giant: Magic Resistance 5%/Rank".
  "bulwark.jotunns": "reduce-spell-damage-1",
  // The perfected machine cannot be stopped (no CREXPBON row; UES-style
  // high-rank immunity).
  "factory.dreadnoughts": "ignore-paralysis"
};

/** XP a winner's surviving deployed units gain from a won PvP battle. */
export const UNIT_XP_PVP_WIN = 2;
/** Minimum XP from a won Creature Bank fight (actual = max(this, Stacked count)). */
export const UNIT_XP_BANK_MIN = 2;
/** Drill (map action at your own Town): gold cost and XP granted. */
export const DRILL_UNIT_GOLD_COST = 2;
export const DRILL_UNIT_XP = 1;
