import { coreBuildingDefinitions } from "@/data/factions/core";
import { makeActiveEffect } from "./active-effects";
import { appendEvent } from "./events";
import type { ActiveEffectModifier, CombatUnitState, GameState, PlayerId } from "./state";

/** Bulwark's cumulative, player-scoped combat Rune bonuses. */

/** Each unlocked level needs a fresh nine Runes on the main track. */
export const RUNE_LEVEL_THRESHOLDS = [9, 9, 9] as const;
export const RUNE_THRESHOLD = 9;
/** Reserve credited whenever one of the three Rune levels is earned. */
export const RUNE_SURPLUS_MAX = 5;
/** Three thresholds and one final spendable main track bound starting grants. */
export const RUNE_MAX = RUNE_THRESHOLD * (RUNE_LEVEL_THRESHOLDS.length + 1);

/** House-rule Runes a Bulwark unit's action earns its controller. */
export const RUNE_GAIN_ATTACK = 1;
export const RUNE_GAIN_RETALIATION = 2;
export const RUNE_GAIN_DEFEND = 3;

/**
 * Baseline Runes every Bulwark army starts a battle with, before any City Hall
 * "Rune-Empowered" bonus. 0 — Runes are EARNED gradually in battle, not granted
 * up front (the user spec: "each battle gradually get rune"). Tunable here.
 */
export const RUNE_STARTING_BASE = 0;

/** The cumulative army-wide bonus added at each Rune Level (Gamefound Update #3). */
export const RUNE_LEVEL_BONUS = { attack: 1, defense: 1, initiative: 3 } as const;

/**
 * The player-scoped buff added when each successive Rune Level is first reached.
 * Order is load-bearing: index 0 = Level 1, index 1 = Level 2, index 2 = Level 3.
 * Speed is represented by Initiative in this combat engine.
 */
const RUNE_LEVEL_EFFECTS: { name: string; modifier: ActiveEffectModifier }[] = [
  { name: "Rune Power", modifier: { type: "ATTACK_BONUS", amount: RUNE_LEVEL_BONUS.attack } },
  { name: "Rune Swiftness", modifier: { type: "INITIATIVE_BONUS", amount: RUNE_LEVEL_BONUS.initiative } },
  { name: "Rune Ward", modifier: { type: "DEFENSE_BONUS", amount: RUNE_LEVEL_BONUS.defense } }
];

/** Rune Ritual rider: an extra +1 Attack for the Rune Keeper at Level 1. */
const RUNE_KEEPER_LEVEL_ONE_EFFECT_NAME = "Rune Keeper's Rune Power";

/** The names of every Rune buff — the set this module owns and clears. */
const RUNE_EFFECT_NAMES = new Set([
  ...RUNE_LEVEL_EFFECTS.map((spec) => spec.name),
  RUNE_KEEPER_LEVEL_ONE_EFFECT_NAME
]);

/**
 * Strips a player's Rune buffs out of `state.activeEffects` (the army-wide
 * level effects plus the Rune Keeper's unit-scoped Level-1 rider). Used to
 * make seeding idempotent: a Rune buff that leaked from a PRIOR combat (a
 * Retreat/Surrender/Give-up ends combat without expiring combat-scoped effects)
 * is cleared before the new battle re-seeds, so a second copy is never stacked
 * on top — the "+1 Attack applied twice" double-buff. Identified by the buff
 * NAME + owner, exactly how the engine recognises
 * them; the freshly-seeded set is rebuilt immediately after by syncRuneEffects.
 */
function clearRuneEffects(state: GameState, playerId: PlayerId): void {
  state.activeEffects = state.activeEffects.filter(
    (effect) =>
      !(effect.controllerId === playerId && RUNE_EFFECT_NAMES.has(effect.name))
  );
}

export function isBulwarkPlayer(state: GameState, playerId: PlayerId | undefined): boolean {
  return Boolean(playerId) && state.players[playerId as PlayerId]?.factionId === "bulwark";
}

/**
 * The Sieidi/Altar baseline for a player: the Rune Level cap and the sum of
 * starting Runes granted only in Neutral combats.
 * Without any rune building a Bulwark player is capped at Level 1 (the base
 * faction mechanic), so the cap floor is 1. The strongest controlled rune
 * building wins, while grants from each controlled building stack.
 */
export function runeBuildingInfo(
  state: GameState,
  playerId: PlayerId
): { neutralStartingRunes: number; levelCap: number } {
  let neutralStartingRunes = 0;
  let levelCap = 1;
  for (const town of Object.values(state.towns)) {
    if (town.controllerId !== playerId) {
      continue;
    }
    for (const buildingId of town.buildings ?? []) {
      const effect = coreBuildingDefinitions[buildingId]?.effect;
      if (effect?.type === "RUNE_ALTAR") {
        neutralStartingRunes += effect.neutralStartingRunes;
        levelCap = Math.max(levelCap, effect.levelCap);
      }
    }
  }
  return { neutralStartingRunes, levelCap };
}

/** Number of full nine-Rune cycles represented by a lifetime gain total. */
export function runeLevelForCount(count: number): number {
  return Math.min(3, Math.floor(Math.max(0, count) / RUNE_THRESHOLD));
}

/** Earned levels persist for this combat after the track resets or is spent. */
export function effectiveRuneLevel(state: GameState, playerId: PlayerId): number {
  const entry = state.combat?.runes?.[playerId];
  if (!entry) {
    return 0;
  }
  return Math.min(entry.appliedLevel, runeBuildingInfo(state, playerId).levelCap);
}

/**
 * Applies the next earned army-wide bonus. `appliedLevel` prevents a spent
 * main track or reserve from revoking or duplicating a lasting combat bonus.
 */
function syncRuneEffects(state: GameState, playerId: PlayerId, target: number): void {
  const entry = state.combat?.runes?.[playerId];
  if (!entry) {
    return;
  }
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
    // Rune Power grants the whole army +1 Attack. Rune Ritual gives the living
    // Rune Keeper one more +1 as soon as that Level-1 threshold is crossed.
    if (nextLevel === 1) {
      const commander = Object.values(state.combat?.units ?? {}).find(
        (unit) =>
          unit.controllerId === playerId &&
          unit.commanderSlug === "bulwark" &&
          unit.damage < unit.maxHealth
      );
      if (commander) {
        const commanderEffect = makeActiveEffect(
          state,
          {
            name: RUNE_KEEPER_LEVEL_ONE_EFFECT_NAME,
            scope: "unit",
            modifiers: [{ type: "ATTACK_BONUS", amount: 1 }],
            duration: { type: "combat" },
            polarity: "positive",
            removable: false
          },
          { type: "system" },
          playerId,
          { type: "unit", unitId: commander.id }
        );
        state.activeEffects.push(commanderEffect);
        appendEvent(state, {
          type: "ACTIVE_EFFECT_CREATED",
          effectId: commanderEffect.id,
          controllerId: playerId,
          name: `${RUNE_KEEPER_LEVEL_ONE_EFFECT_NAME} (Rune Level 1)`,
          duration: commanderEffect.duration
        });
      }
    }
    entry.appliedLevel = nextLevel;
    appendEvent(state, {
      type: "ACTIVE_EFFECT_CREATED",
      effectId: effect.id,
      controllerId: playerId,
      name: `${spec.name} (Rune Level ${nextLevel})`,
      duration: effect.duration
    });
    // A dedicated cue for the combat UI: a Rune Level just turned on, which the
    // table announces with the Rune sound (effects/rune). Emitted on the climb
    // only (the while-loop runs solely when appliedLevel < target), so it never
    // fires for Level 0 or a no-change re-sync.
    appendEvent(state, {
      type: "RUNE_LEVEL_REACHED",
      playerId,
      level: nextLevel,
      count: entry.count
    });
  }
}

/**
 * Seeds the per-combat Rune pools for both participants at the start of a battle
 * (called from finalizeCombatStart). Only Bulwark players get a pool; the
 * starting amount is the neutral-only building grants plus any City Hall or
 * specialty head start, capped at RUNE_MAX.
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
    // Idempotent seed: drop any Rune buff still hanging around from a prior
    // battle (or a double-entered setup) so we rebuild the army-wide buffs from
    // scratch instead of stacking a second +Attack/+Defense on top. Without this
    // a leaked Level-1 buff makes a Level-2 unit read base+1+1 Attack.
    clearRuneEffects(state, playerId);
    const { neutralStartingRunes } = runeBuildingInfo(state, playerId);
    const flagBonus = (state.players[playerId]?.runeEmpoweredNextCombats ?? 0)
      + (state.players[playerId]?.cityHallRunesNextCombats ?? 0);
    const buildingBonus = combat.context.kind === "neutral" ? neutralStartingRunes : 0;
    const startingRunes = Math.min(RUNE_MAX, RUNE_STARTING_BASE + buildingBonus + flagBonus);
    combat.runes[playerId] = { count: 0, reserve: 0, appliedLevel: 0 };
    // Starting grants go through the same nine-Rune cycles as action gains.
    gainRunes(state, playerId, startingRunes);
  }
}

/**
 * Credits a Bulwark player with `amount` Runes for one of their units' actions
 * and applies each newly reached level. Every completed cycle resets the main
 * track and credits five spendable reserve Runes.
 */
export function gainRunes(state: GameState, playerId: PlayerId | undefined, amount: number): void {
  if (!state.combat || amount <= 0 || !isBulwarkPlayer(state, playerId)) {
    return;
  }
  const owner = playerId as PlayerId;
  state.combat.runes = state.combat.runes ?? {};
  const entry = state.combat.runes[owner] ?? (state.combat.runes[owner] = { count: 0, reserve: 0, appliedLevel: 0 });
  normalizeRuneEntry(entry);
  let remaining = amount;
  const levelCap = runeBuildingInfo(state, owner).levelCap;
  while (remaining > 0) {
    const room = RUNE_THRESHOLD - entry.count;
    if (room <= 0) break;
    const gained = Math.min(room, remaining);
    entry.count += gained;
    remaining -= gained;
    if (entry.count === RUNE_THRESHOLD && entry.appliedLevel < levelCap) {
      syncRuneEffects(state, owner, entry.appliedLevel + 1);
      entry.count = 0;
      entry.reserve = (entry.reserve ?? 0) + RUNE_SURPLUS_MAX;
    }
  }
}

/** Convert an in-progress old save without discarding earned combat bonuses. */
function runeEntryBalances(entry: { count: number; reserve?: number; appliedLevel: number }): { count: number; reserve: number } {
  if (entry.reserve !== undefined) return { count: entry.count, reserve: entry.reserve };
  const oldThresholds = [0, 4, 7, 12];
  return {
    count: Math.max(0, Math.min(RUNE_THRESHOLD, entry.count - oldThresholds[Math.min(3, entry.appliedLevel)])),
    reserve: 0
  };
}

function normalizeRuneEntry(entry: { count: number; reserve?: number; appliedLevel: number }): void {
  const balance = runeEntryBalances(entry);
  entry.count = balance.count;
  entry.reserve = balance.reserve;
}

/** Spendable Runes in reserve and on the main track, for all legality checks. */
export function availableRunes(state: GameState, playerId: PlayerId): number {
  const entry = state.combat?.runes?.[playerId];
  if (!entry) return 0;
  const balance = runeEntryBalances(entry);
  return balance.reserve + balance.count;
}

/** Whether another Rune gain can change the main track in this combat. */
export function runeTrackHasRoom(state: GameState, playerId: PlayerId): boolean {
  const entry = state.combat?.runes?.[playerId];
  return !entry || runeEntryBalances(entry).count < RUNE_THRESHOLD;
}

/**
 * Makes a Bulwark player Rune-Empowered: their Hero then starts each combat with
 * `amount` more Runes (added to runeEmpoweredNextCombats, capped at RUNE_MAX),
 * until their next Resource round clears the flag. Stacks with the separate
 * City Hall bonus at combat start.
 * No-op (returns the unchanged flag) for a non-Bulwark player or amount <= 0.
 * Returns the resulting starting-rune total so the caller can log it.
 */
export function grantStartingRunes(state: GameState, playerId: PlayerId | undefined, amount: number): number {
  const player = playerId ? state.players[playerId] : undefined;
  const current = player?.runeEmpoweredNextCombats ?? 0;
  if (amount <= 0 || !player || !isBulwarkPlayer(state, playerId)) {
    return current;
  }
  const next = Math.min(RUNE_MAX, current + amount);
  player.runeEmpoweredNextCombats = next;
  return next;
}

/**
 * WOG Rune Keeper commander ("Rune Mend"): spends Runes from the per-combat
 * pool. Reserve is spent first, then the main track. Reached levels persist.
 */
export function spendRunes(state: GameState, playerId: PlayerId, amount: number): boolean {
  if (amount <= 0) {
    return true;
  }
  const entry = state.combat?.runes?.[playerId];
  if (!entry || availableRunes(state, playerId) < amount) {
    return false;
  }
  normalizeRuneEntry(entry);
  const fromReserve = Math.min(entry.reserve ?? 0, amount);
  entry.reserve = (entry.reserve ?? 0) - fromReserve;
  entry.count -= amount - fromReserve;
  return true;
}

/** Rune gain for a resolved attack (+1) or Retaliation Attack (+2). */
export function gainRunesForAttack(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): void {
  gainRunes(state, attacker.controllerId, isRetaliation ? RUNE_GAIN_RETALIATION : RUNE_GAIN_ATTACK);
}

/** Rune gain for taking the Defend action (+3). */
export function gainRunesForDefend(state: GameState, unit: CombatUnitState): void {
  gainRunes(state, unit.controllerId, RUNE_GAIN_DEFEND);
}

/** Live Rune readout for the combat UI / tests. */
export function getRuneSummary(
  state: GameState,
  playerId: PlayerId
): { count: number; reserve: number; available: number; level: number; levelCap: number; nextThreshold: number | null } {
  const entry = state.combat?.runes?.[playerId];
  const balance = entry ? runeEntryBalances(entry) : { count: 0, reserve: 0 };
  const count = balance.count;
  const reserve = balance.reserve;
  const { levelCap } = runeBuildingInfo(state, playerId);
  // Rune effects persist once earned, including after a Rune-priced ability
  // spends from the pool. Keep the track aligned with the active effects.
  const level = Math.min(entry?.appliedLevel ?? 0, levelCap);
  const nextThreshold = level < levelCap ? RUNE_THRESHOLD : null;
  return { count, reserve, available: count + reserve, level, levelCap, nextThreshold };
}

/**
 * The per-level cumulative buff label shown on the Rune track. Speed uses the
 * combat engine's Initiative bonus.
 */
export const RUNE_LEVEL_LABELS = [
  `+${RUNE_LEVEL_BONUS.attack} Attack`,
  `+${RUNE_LEVEL_BONUS.initiative} Speed`,
  `+${RUNE_LEVEL_BONUS.defense} Defense`
] as const;

/**
 * Per-level status for one rung of the Rune track:
 *  - "active":  the army-wide buff is live (the level is reached AND within cap),
 *  - "pending": the building unlocks this level but the player hasn't EARNED the
 *               Runes for it yet (the climb the buildings open up),
 *  - "locked":  no rune building unlocks this level (build the Sieidi/Altar).
 */
export type RuneLevelStatus = "active" | "pending" | "locked";

export type RuneTrackView = {
  count: number;
  reserve: number;
  available: number;
  level: number;
  levelCap: number;
  max: number;
  nextThreshold: number | null;
  /** Alias for reserve, retained for existing display consumers. */
  surplus: number;
  levels: { level: number; threshold: number; bonusLabel: string; status: RuneLevelStatus }[];
};

/**
 * Live main track, reserve, earned bonuses and building locks for the combat UI.
 */
export function getRuneTrack(state: GameState, playerId: PlayerId): RuneTrackView {
  const { count, reserve, available, level, levelCap, nextThreshold } = getRuneSummary(state, playerId);
  const levels = RUNE_LEVEL_THRESHOLDS.map((threshold, index) => {
    const rung = index + 1;
    const status: RuneLevelStatus =
      rung > levelCap ? "locked" : level >= rung ? "active" : "pending";
    return { level: rung, threshold, bonusLabel: RUNE_LEVEL_LABELS[index], status };
  });
  return { count, reserve, available, level, levelCap, max: RUNE_THRESHOLD, nextThreshold, surplus: reserve, levels };
}
