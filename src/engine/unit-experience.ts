/**
 * Anime Unit Experience (`anime.unitExperience`) — WoG-style creature veterancy,
 * board-adapted.
 *
 * Design (deliberately simple):
 *  - GAIN: at adventure-combat finalize, when a player WINS (neutral guard,
 *    Creature Bank, or PvP) every one of their army unit cards that PARTICIPATED
 *    in and SURVIVED the fight gains 1 XP. XP lives on the army card
 *    (`ArmyUnitState.xp`, public state).
 *  - RANKS: data-driven thresholds ({@link UNIT_EXPERIENCE_RANKS}) — 2 XP →
 *    Veteran (+1 Attack), 5 XP → Elite (+1 Attack/+1 Defense), 9 XP → Legend
 *    (+1 Attack/+1 Defense/+1 Health). The rank bonus is folded onto BOTH card
 *    sides (Few and Pack) at the SAME combat-derivation seam as the Polish Stack
 *    +1 Attack and Gelu's permanentAttackBonus, so every consumer (attack/defense
 *    resolution, previews, the AI army-strength read) sees it.
 *  - LOSS/RESET: a card removed from the game / recycled to a Neutral tier discard
 *    loses its XP automatically (the discard pile stores only the def-id string,
 *    so a fresh recruit starts at 0). XP is KEPT across a Pack→Few flip (same
 *    card, same veterans) and NEVER transfers between cards.
 *
 * Default OFF ⇒ nothing granted, no fold, no events (byte-identical). Because XP
 * is only ever stamped while the module is on, reads of `xp` (e.g. the AI
 * army-strength value) can fold the bonus unconditionally without threading the
 * flag — a card carries `xp` only under the module.
 */

import { animeModuleEnabled } from "./anime";
import { appendEvent } from "./events";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { AnimeModOptions, GameState } from "./state";

/** The flat combat-stat bonus a veterancy rank grants (added onto both sides). */
export type UnitRankBonus = { attack: number; defense: number; health: number };

export type UnitRank = {
  id: string;
  name: string;
  /** Minimum accumulated XP to hold this rank. */
  minXp: number;
  bonus: UnitRankBonus;
};

/**
 * Veterancy ranks, ASCENDING by `minXp`. The highest rank whose threshold the
 * card's XP meets applies (the bonus is that rank's, NOT a sum of earlier ones).
 * Tuning lives here — add/reprice a rank by editing this array alone.
 */
export const UNIT_EXPERIENCE_RANKS: readonly UnitRank[] = [
  { id: "veteran", name: "Veteran", minXp: 2, bonus: { attack: 1, defense: 0, health: 0 } },
  { id: "elite", name: "Elite", minXp: 5, bonus: { attack: 1, defense: 1, health: 0 } },
  { id: "legend", name: "Legend", minXp: 9, bonus: { attack: 1, defense: 1, health: 1 } }
];

const NO_BONUS: UnitRankBonus = { attack: 0, defense: 0, health: 0 };

/** Whether the Unit Experience module is active in this game. */
export function unitExperienceActive(
  state: Pick<GameState, "anime"> | { anime?: AnimeModOptions } | null | undefined
): boolean {
  return animeModuleEnabled(state, "unitExperience");
}

/** The rank a given XP total holds, or null below the first threshold. */
export function unitRankForXp(xp: number | undefined): UnitRank | null {
  const value = Math.max(0, Math.trunc(xp ?? 0));
  let rank: UnitRank | null = null;
  for (const candidate of UNIT_EXPERIENCE_RANKS) {
    if (value >= candidate.minXp) {
      rank = candidate;
    }
  }
  return rank;
}

/** The flat stat bonus a given XP total grants (all-zero below the first rank). */
export function unitExperienceBonus(xp: number | undefined): UnitRankBonus {
  const rank = unitRankForXp(xp);
  return rank ? rank.bonus : NO_BONUS;
}

/**
 * Award veterancy XP after a WON adventure combat: every surviving army unit
 * card the winner still owns gains 1 XP. No-op with the module off, on a
 * Neutral "win", or with no combat/outcome. Never opens a window (pure grant),
 * so the AI never stalls on it.
 */
export function grantUnitExperienceAfterCombat(state: GameState): void {
  const combat = state.combat;
  if (!combat || !combat.outcome) {
    return;
  }
  if (!unitExperienceActive(state)) {
    return;
  }
  const winnerId = combat.outcome.winnerPlayerId;
  if (winnerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  const player = state.players[winnerId];
  if (!player) {
    return;
  }

  // De-dupe by army card: a card can only field ONE combat unit, but guard the
  // loop so a future summon/clone sharing an armyUnitId can never double-grant.
  const credited = new Set<string>();
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== winnerId) {
      continue;
    }
    // Survivors only; a removed unit is at/over its Health.
    if (unit.damage >= unit.maxHealth) {
      continue;
    }
    // Clones and borrowed (Tarnum) units carry no persistent army card.
    if (unit.cloneOfUnitId || unit.temporary) {
      continue;
    }
    if (!unit.armyUnitId || credited.has(unit.armyUnitId)) {
      continue;
    }
    const armyUnit = player.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (!armyUnit) {
      continue;
    }
    credited.add(unit.armyUnitId);

    const before = Math.max(0, Math.trunc(armyUnit.xp ?? 0));
    const after = before + 1;
    armyUnit.xp = after;
    const beforeRank = unitRankForXp(before);
    const afterRank = unitRankForXp(after);
    const rankedUp = afterRank && afterRank.id !== beforeRank?.id;
    appendEvent(state, {
      type: "UNIT_EXPERIENCE_GAINED",
      playerId: winnerId,
      armyUnitId: armyUnit.id,
      unitDefId: armyUnit.unitDefId,
      unitName: unit.name,
      xp: after,
      ...(rankedUp ? { rankId: afterRank!.id, rankName: afterRank!.name } : {})
    });
  }
}
