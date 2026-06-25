import { coreBuildingDefinitions } from "@/data/factions/core";
import { makeActiveEffect } from "./active-effects";
import { appendEvent } from "./events";
import type { ActiveEffectModifier, CombatUnitState, GameState, PlayerId } from "./state";

/**
 * Bulwark "Runes" — the faction's unique combat mechanic, based on Gamefound
 * Update #3 ("Faction Focus: Bulwark") with the repo's current house-rule
 * action gains.
 *
 * Current house rule:
 *  - During a battle, whenever a Bulwark player's unit ACTS it earns that player
 *    Runes: Attack -> +1, Retaliate -> +1, Defend -> +2.
 *  - The accumulated Rune total pushes the player up Rune LEVELS, each granting a
 *    CUMULATIVE army-wide passive buff to ALL of that player's units:
 *      Level 1                -> +1 Attack
 *      Level 2 (needs Sieidi) -> +1 Defense  (on top of L1)
 *      Level 3 (needs Altar)  -> +3 Initiative (on top of L1+L2)
 *  - Runes RESET every battle (collected again from scratch). Every Bulwark army
 *    BEGINS each battle with RUNE_STARTING_BASE Runes (0) and GRADUALLY earns
 *    more by acting; the army gets a level's buff the moment its Rune total
 *    REACHES that level's threshold (the user spec: "each battle gradually get
 *    rune, and get buff when reach threshold (4, 7, 10)").
 *  - The Sieidi/Altar buildings do NOT pre-charge Runes; they raise the MAX
 *    LEVEL only (Sieidi -> Level 2, Altar -> Level 3 — "building will raise the
 *    max level"). Without a rune building a Bulwark army can still earn up to
 *    Level 1. The City Hall combat-focus choice and Kriv's specialty add
 *    starting/banked Runes to reach the thresholds sooner. This is deliberate:
 *    pre-charging straight to the cap (the original behaviour) made the entire
 *    earn-by-acting loop, Kriv's specialty and the City Hall option inert in real
 *    combat — a decorative mechanic. They are load-bearing now.
 *
 * What the dev note leaves open (designed here, tunable in ONE place):
 *  - the per-level Rune THRESHOLDS (4 / 7 / 10 — first rung at 4, then +3, +3)
 *    and the starting-rune amount (RUNE_STARTING_BASE = 0; you earn the runes).
 *    The Sieidi/Altar buildings carry startingRunes: 0 (max-level raisers, not
 *    pre-chargers); the City Hall flag is the head-start path (see core.ts
 *    RUNE_ALTAR buildings + the bulwark.city_hall option).
 *  - action-gain values are intentionally house-ruled for now. If the official
 *    +1/+2/+3 rate is adopted later, update these constants, tests and UI text
 *    together.
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
 * Rune totals required to reach Rune Levels 1, 2 and 3. Per the user spec the
 * first rung is at 4 and each further level is +3 Runes away (4 / 7 / 10): a
 * Bulwark army begins at 0 and earns its way up, getting each level's buff when
 * its Rune total reaches that threshold, as far as the Sieidi/Altar max level.
 */
export const RUNE_LEVEL_THRESHOLDS = [4, 7, 10] as const;
/** No point banking past Level 3 — Runes cap at the top threshold. */
export const RUNE_MAX = RUNE_LEVEL_THRESHOLDS[RUNE_LEVEL_THRESHOLDS.length - 1];

/** House-rule Runes a Bulwark unit's action earns its controller. */
export const RUNE_GAIN_ATTACK = 1;
export const RUNE_GAIN_RETALIATION = 1;
export const RUNE_GAIN_DEFEND = 2;

/**
 * Baseline Runes every Bulwark army starts a battle with, before any City Hall
 * "Rune-Empowered" bonus. 0 — Runes are EARNED gradually in battle, not granted
 * up front (the user spec: "each battle gradually get rune"). Tunable here.
 */
export const RUNE_STARTING_BASE = 0;

/** The cumulative army-wide bonus added at each Rune Level (Gamefound Update #3). */
export const RUNE_LEVEL_BONUS = { attack: 1, defense: 1, initiative: 3 } as const;

/** The player-scoped buff added when each successive Rune Level is first reached. */
const RUNE_LEVEL_EFFECTS: { name: string; modifier: ActiveEffectModifier }[] = [
  { name: "Rune Power", modifier: { type: "ATTACK_BONUS", amount: RUNE_LEVEL_BONUS.attack } },
  { name: "Rune Ward", modifier: { type: "DEFENSE_BONUS", amount: RUNE_LEVEL_BONUS.defense } },
  { name: "Rune Swiftness", modifier: { type: "INITIATIVE_BONUS", amount: RUNE_LEVEL_BONUS.initiative } }
];

/** The names of every army-wide Rune buff — the set this module owns and clears. */
const RUNE_EFFECT_NAMES = new Set(RUNE_LEVEL_EFFECTS.map((spec) => spec.name));

/**
 * Strips a player's army-wide Rune buffs out of `state.activeEffects`. Used to
 * make seeding idempotent: a Rune buff that leaked from a PRIOR combat (a
 * Retreat/Surrender/Give-up ends combat without expiring combat-scoped effects)
 * is cleared before the new battle re-seeds, so a second copy is never stacked
 * on top — the "+1 Attack applied twice" double-buff. Identified by the buff
 * NAME + the player scope + owner, exactly how the engine and tests recognise
 * them; the freshly-seeded set is rebuilt immediately after by syncRuneEffects.
 */
function clearRuneEffects(state: GameState, playerId: PlayerId): void {
  state.activeEffects = state.activeEffects.filter(
    (effect) =>
      !(effect.scope === "player" && effect.controllerId === playerId && RUNE_EFFECT_NAMES.has(effect.name))
  );
}

export function isBulwarkPlayer(state: GameState, playerId: PlayerId | undefined): boolean {
  return Boolean(playerId) && state.players[playerId as PlayerId]?.factionId === "bulwark";
}

/**
 * The Sieidi/Altar baseline for a player: the Rune Level CAP their rune building
 * unlocks (Sieidi -> 2, Altar -> 3) and any starting Runes it pre-charges. The
 * board's rune buildings are cap-raisers, not pre-chargers, so startingRunes is
 * 0 — the player must EARN the climb to the unlocked level by acting in battle.
 * Without any rune building a Bulwark player is capped at Level 1 (the base
 * faction mechanic), so the cap floor is 1. The strongest controlled rune
 * building wins, even if the player controls several towns.
 */
export function runeBuildingInfo(
  state: GameState,
  playerId: PlayerId
): { startingRunes: number; levelCap: number } {
  let startingRunes = 0;
  let levelCap = 1;
  for (const town of Object.values(state.towns)) {
    if (town.controllerId !== playerId) {
      continue;
    }
    for (const buildingId of town.buildings ?? []) {
      const effect = coreBuildingDefinitions[buildingId]?.effect;
      if (effect?.type === "RUNE_ALTAR") {
        startingRunes = Math.max(startingRunes, effect.startingRunes);
        levelCap = Math.max(levelCap, effect.levelCap);
      }
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
 * starting amount is RUNE_STARTING_BASE (0) plus the rune building's startingRunes
 * (0 — max-level raisers, not pre-chargers) plus any City Hall "Rune-Empowered"
 * bonus, capped at RUNE_MAX. So a normal Bulwark army opens at 0 Runes / Level 0
 * and earns its buffs by acting; further levels are reached via gainRunes during
 * the fight as far as the building max level allows.
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

/**
 * Makes a Bulwark player Rune-Empowered: their Hero then starts each combat with
 * `amount` more Runes (added to runeEmpoweredNextCombats, capped at RUNE_MAX),
 * until their next Resource round clears the flag. Stacks with the City Hall
 * combat-focus option (both feed the same flag, read by seedRunesForCombat).
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

/** The per-level cumulative buff label shown on the Rune track (kept in sync with RUNE_LEVEL_BONUS). */
export const RUNE_LEVEL_LABELS = [
  `+${RUNE_LEVEL_BONUS.attack} Attack`,
  `+${RUNE_LEVEL_BONUS.defense} Defense`,
  `+${RUNE_LEVEL_BONUS.initiative} Initiative`
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
  level: number;
  levelCap: number;
  max: number;
  nextThreshold: number | null;
  levels: { level: number; threshold: number; bonusLabel: string; status: RuneLevelStatus }[];
};

/**
 * Everything the combat UI needs to draw a Bulwark player's Rune track in one
 * tested place: the live count, the effective level/cap, the cap (RUNE_MAX) and
 * each level's threshold, bonus label and active/pending/locked status.
 */
export function getRuneTrack(state: GameState, playerId: PlayerId): RuneTrackView {
  const { count, level, levelCap, nextThreshold } = getRuneSummary(state, playerId);
  const levels = RUNE_LEVEL_THRESHOLDS.map((threshold, index) => {
    const rung = index + 1;
    const status: RuneLevelStatus =
      rung > levelCap ? "locked" : level >= rung ? "active" : "pending";
    return { level: rung, threshold, bonusLabel: RUNE_LEVEL_LABELS[index], status };
  });
  return { count, level, levelCap, max: RUNE_MAX, nextThreshold, levels };
}
