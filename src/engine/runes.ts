import { coreBuildingDefinitions } from "@/data/factions/core";
import { makeActiveEffect } from "./active-effects";
import { appendEvent } from "./events";
import type { ActiveEffectModifier, CombatUnitState, GameState, PlayerId } from "./state";

/**
 * Bulwark "Runes" — the faction's unique combat mechanic, transcribed from
 * Gamefound Update #3 ("Faction Focus: Bulwark") and cross-checked against the
 * PC "Runes" secondary skill (heroes.thelazy.net/Bulwark).
 *
 * What the dev note fixes (verbatim mechanic):
 *  - During a battle, whenever a Bulwark player's unit ACTS it earns that player
 *    Runes: Attack -> +1, Retaliate -> +1, Defend -> +2.
 *  - The accumulated Rune total pushes the player up Rune LEVELS, each granting a
 *    CUMULATIVE army-wide passive buff to ALL of that player's units:
 *      Level 1                -> +1 Attack
 *      Level 2 (needs Sieidi) -> +1 Defense  (on top of L1)
 *      Level 3 (needs Altar)  -> +3 Initiative (on top of L1+L2)
 *  - Runes RESET every battle (collected again from scratch). Every Bulwark army
 *    starts each battle with a base of RUNE_STARTING_BASE Runes; the City Hall
 *    combat-focus choice and the Sieidi/Altar buildings raise that starting
 *    number further (and the buildings raise the level cap).
 *
 * What the dev note leaves open (designed here, tunable in ONE place, mirroring
 * the PC skill's 9-rune Expert cap):
 *  - the per-level Rune THRESHOLDS (3 / 6 / 9) and the starting-rune amounts
 *    granted by Sieidi / Altar / the City Hall flag (see core.ts RUNE_ALTAR
 *    buildings + the bulwark.city_hall option).
 *
 * Implementation note: the army-wide buff reuses the engine's existing
 * player-scoped active-effect machinery (exactly how Necklace of Swiftness /
 * Expert Archery grant "all your units +X"). A Rune Level's buff is a
 * player-scoped, combat-duration ATTACK_BONUS / DEFENSE_BONUS / INITIATIVE_BONUS
 * effect, so `getActiveAttackBonus` / `getActiveDefenseBonus` / `effectiveInitiative`
 * pick it up everywhere (combat maths, neutral AI, UI) for free, and
 * `expireEffectsForCombatEnd` discards it when the battle ends.
 */

/**
 * Rune totals required to reach Rune Levels 1, 2 and 3. Not given in the dev
 * note; chosen to land the cap at the PC skill's 9-rune Expert maximum.
 */
export const RUNE_LEVEL_THRESHOLDS = [3, 6, 9] as const;
/** No point banking past Level 3 — Runes cap at the top threshold. */
export const RUNE_MAX = RUNE_LEVEL_THRESHOLDS[RUNE_LEVEL_THRESHOLDS.length - 1];

/** Runes a Bulwark unit's action earns its controller (Gamefound Update #3). */
export const RUNE_GAIN_ATTACK = 1;
export const RUNE_GAIN_RETALIATION = 1;
export const RUNE_GAIN_DEFEND = 2;

/**
 * Baseline Runes every Bulwark army starts a battle with, before any Sieidi /
 * Altar building or City Hall "Rune-Empowered" bonus. Tunable here in one place.
 */
export const RUNE_STARTING_BASE = 4;

/** The cumulative army-wide bonus added at each Rune Level (Gamefound Update #3). */
export const RUNE_LEVEL_BONUS = { attack: 1, defense: 1, initiative: 3 } as const;

/** The player-scoped buff added when each successive Rune Level is first reached. */
const RUNE_LEVEL_EFFECTS: { name: string; modifier: ActiveEffectModifier }[] = [
  { name: "Rune Power", modifier: { type: "ATTACK_BONUS", amount: RUNE_LEVEL_BONUS.attack } },
  { name: "Rune Ward", modifier: { type: "DEFENSE_BONUS", amount: RUNE_LEVEL_BONUS.defense } },
  { name: "Rune Swiftness", modifier: { type: "INITIATIVE_BONUS", amount: RUNE_LEVEL_BONUS.initiative } }
];

export function isBulwarkPlayer(state: GameState, playerId: PlayerId | undefined): boolean {
  return Boolean(playerId) && state.players[playerId as PlayerId]?.factionId === "bulwark";
}

/**
 * The Sieidi/Altar baseline for a player: the extra Runes their Hero starts each
 * combat with, and the Rune Level cap their rune building unlocks. Without any
 * rune building a Bulwark player still reaches Level 1 (the base faction
 * mechanic), so the cap floor is 1. The Altar supersedes the Sieidi (same tile),
 * so the strongest rune building present wins.
 */
export function runeBuildingInfo(
  state: GameState,
  playerId: PlayerId
): { startingRunes: number; levelCap: number } {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId) ?? null;
  let startingRunes = 0;
  let levelCap = 1;
  for (const buildingId of town?.buildings ?? []) {
    const effect = coreBuildingDefinitions[buildingId]?.effect;
    if (effect?.type === "RUNE_ALTAR") {
      startingRunes = Math.max(startingRunes, effect.startingRunes);
      levelCap = Math.max(levelCap, effect.levelCap);
    }
  }
  return { startingRunes, levelCap };
}

/** Highest Rune Level (0–3) reached by `count`, ignoring the building cap. */
export function runeLevelForCount(count: number): number {
  let level = 0;
  for (const threshold of RUNE_LEVEL_THRESHOLDS) {
    if (count >= threshold) {
      level += 1;
    }
  }
  return level;
}

/** Current effective Rune Level for a player: min(level-from-runes, building cap). */
export function effectiveRuneLevel(state: GameState, playerId: PlayerId): number {
  const entry = state.combat?.runes?.[playerId];
  if (!entry) {
    return 0;
  }
  return Math.min(runeLevelForCount(entry.count), runeBuildingInfo(state, playerId).levelCap);
}

/**
 * Brings the player's army-wide Rune buffs up to their current effective Rune
 * Level. Add-only: Runes only ever rise within a battle and the building cap is
 * fixed, so this never has to remove a buff — `appliedLevel` records how far we
 * have already gone so the same buff is never created twice.
 */
function syncRuneEffects(state: GameState, playerId: PlayerId): void {
  const entry = state.combat?.runes?.[playerId];
  if (!entry) {
    return;
  }
  const target = effectiveRuneLevel(state, playerId);
  while (entry.appliedLevel < target) {
    const nextLevel = entry.appliedLevel + 1;
    const spec = RUNE_LEVEL_EFFECTS[nextLevel - 1];
    const effect = makeActiveEffect(
      state,
      {
        name: spec.name,
        scope: "player",
        modifiers: [spec.modifier],
        duration: { type: "combat" },
        polarity: "positive",
        removable: false
      },
      { type: "system" },
      playerId
    );
    state.activeEffects.push(effect);
    entry.appliedLevel = nextLevel;
    appendEvent(state, {
      type: "ACTIVE_EFFECT_CREATED",
      effectId: effect.id,
      controllerId: playerId,
      name: `${spec.name} (Rune Level ${nextLevel})`,
      duration: effect.duration
    });
  }
}

/**
 * Seeds the per-combat Rune pools for both participants at the start of a battle
 * (called from finalizeCombatStart). Only Bulwark players get a pool; the
 * starting amount is the Sieidi/Altar baseline plus any City Hall "Rune-Empowered"
 * bonus, capped at RUNE_MAX. The seed immediately applies whatever Rune Level it
 * already qualifies for.
 */
export function seedRunesForCombat(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  combat.runes = combat.runes ?? {};
  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (!isBulwarkPlayer(state, playerId)) {
      continue;
    }
    const { startingRunes } = runeBuildingInfo(state, playerId);
    const flagBonus = state.players[playerId]?.runeEmpoweredNextCombats ?? 0;
    const count = Math.min(RUNE_MAX, RUNE_STARTING_BASE + startingRunes + flagBonus);
    combat.runes[playerId] = { count, appliedLevel: 0 };
    // Any Rune Level the starting pool already qualifies for is applied (and
    // logged via a real ACTIVE_EFFECT_CREATED event) by syncRuneEffects.
    syncRuneEffects(state, playerId);
  }
}

/**
 * Credits a Bulwark player with `amount` Runes for one of their units' actions
 * and re-applies any Rune Level newly reached. No-op for non-Bulwark players,
 * outside combat, or once the Rune cap is hit.
 */
export function gainRunes(state: GameState, playerId: PlayerId | undefined, amount: number): void {
  if (!state.combat || amount <= 0 || !isBulwarkPlayer(state, playerId)) {
    return;
  }
  const owner = playerId as PlayerId;
  state.combat.runes = state.combat.runes ?? {};
  const entry = state.combat.runes[owner] ?? (state.combat.runes[owner] = { count: 0, appliedLevel: 0 });
  const before = entry.count;
  entry.count = Math.min(RUNE_MAX, entry.count + amount);
  if (entry.count !== before) {
    syncRuneEffects(state, owner);
  }
}

/** Rune gain for a resolved attack (Attack +1) or Retaliation Attack (+1). */
export function gainRunesForAttack(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): void {
  gainRunes(state, attacker.controllerId, isRetaliation ? RUNE_GAIN_RETALIATION : RUNE_GAIN_ATTACK);
}

/** Rune gain for taking the Defend action (+2). */
export function gainRunesForDefend(state: GameState, unit: CombatUnitState): void {
  gainRunes(state, unit.controllerId, RUNE_GAIN_DEFEND);
}

/** Live Rune readout for the combat UI / tests. */
export function getRuneSummary(
  state: GameState,
  playerId: PlayerId
): { count: number; level: number; levelCap: number; nextThreshold: number | null } {
  const count = state.combat?.runes?.[playerId]?.count ?? 0;
  const { levelCap } = runeBuildingInfo(state, playerId);
  const level = Math.min(runeLevelForCount(count), levelCap);
  const nextThreshold = level < levelCap ? RUNE_LEVEL_THRESHOLDS[level] : null;
  return { count, level, levelCap, nextThreshold };
}
