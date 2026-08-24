/**
 * Raid Bosses (anime-mod plan §6.5) — pure helpers shared by the adventure
 * wiring (spawn/announce/escalate in adventure.ts, the lair fight + wound
 * persistence in adventure-reducer.ts) and the Dungeon's floor bosses
 * (§6.7.3, src/engine/dungeon.ts).
 *
 * A boss is a bespoke-stat LAYERED monster minted as a gradeless neutral
 * (`bankUnit` + `bossUnit`): its `armyStacks` ARE the printed health bars
 * (layers − 1 extra bars on top of the body), shed by the unconditional
 * boss branch of `markUnitRemovedIfNeeded` with excess damage carried.
 * NOTHING here imports adventure.ts (no cycles).
 */

import {
  DUNGEON_FLOOR_BOSSES,
  RAID_BOSSES,
  RAID_BOSS_ABILITY_CHOICES,
  type RaidBossDefinition
} from "@/data/anime/bosses";
import { unitAbilities } from "@/data/units/abilities";
import {
  NEUTRAL_PLAYER_ID,
  type CombatUnitState,
  type CustomRaidBossDef,
  type GameState,
  type PlayerId,
  type RaidBossState
} from "./state";
import { playersAreAllied } from "./computer/control";

/** Scheduled spawn: announced on round SPAWN−1, placed on round SPAWN. */
export const RAID_BOSS_SPAWN_ROUND = 5;
/** An unslain boss regrows +1 layer (to its printed cap) every 4th round. */
export const RAID_BOSS_ESCALATION_INTERVAL = 4;
/** Every layer broken pays the breaker this much gold immediately. */
export const RAID_BOSS_LAYER_BREAK_GOLD = 2;
/** The kill additionally pays the killer this much gold + a relic search. */
export const RAID_BOSS_KILL_GOLD = 5;
/** Clamp rails for designer custom bosses (sanitizer + resolution). */
export const CUSTOM_BOSS_LIMITS = {
  attack: { min: 1, max: 15 },
  defense: { min: 0, max: 12 },
  health: { min: 1, max: 12 },
  initiative: { min: 1, max: 12 },
  layers: { min: 1, max: 8 }
} as const;
export const MAX_CUSTOM_RAID_BOSSES = 6;
const CLASSIC_RAID_BOSS_IDS = [
  "goblin_king",
  "colossal_titan",
  "abyss_kraken",
  "calamity_dragon",
  "avatar_of_erebos",
  // Variant expansion §B1–B4.
  "lich_archon",
  "hydra_matriarch",
  "basilisk_queen",
  "wailing_banshee"
] as const;
/** Exported for the theme-pool test: a classic game must never roll these. */
export const DOOM_RAID_BOSS_IDS = [
  "cyberdemon_prime",
  "spider_overmind",
  // Variant expansion §B5–B6.
  "archvile_ascendant",
  "mother_demon"
] as const;

/** Whether the Raid Bosses module is ON for this game (presence = frozen ON). */
export function raidBossesEnabled(state: GameState): boolean {
  return Boolean(state.adventure?.raidBosses);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

/**
 * A designer custom boss resolved into the shared definition shape. Stats are
 * re-clamped here (defense in depth — the preset sanitizer already clamps) and
 * abilities re-filtered against the curated whitelist; `abilityText` is the
 * concatenation of the wired abilities' own printed texts, so the card says
 * exactly what runs (CLAUDE.md §2).
 */
export function customBossToDefinition(custom: CustomRaidBossDef): RaidBossDefinition {
  const abilities = (custom.abilities ?? []).filter(
    (id) => RAID_BOSS_ABILITY_CHOICES.includes(id) && unitAbilities[id]?.implementationStatus === "implemented"
  );
  return {
    id: custom.id,
    name: custom.name,
    title: "Designer's Nightmare",
    attack: clamp(custom.attack, CUSTOM_BOSS_LIMITS.attack.min, CUSTOM_BOSS_LIMITS.attack.max),
    defense: clamp(custom.defense, CUSTOM_BOSS_LIMITS.defense.min, CUSTOM_BOSS_LIMITS.defense.max),
    health: clamp(custom.health, CUSTOM_BOSS_LIMITS.health.min, CUSTOM_BOSS_LIMITS.health.max),
    initiative: clamp(
      custom.initiative,
      CUSTOM_BOSS_LIMITS.initiative.min,
      CUSTOM_BOSS_LIMITS.initiative.max
    ),
    type: custom.type ?? "ground",
    layers: clamp(custom.layers, CUSTOM_BOSS_LIMITS.layers.min, CUSTOM_BOSS_LIMITS.layers.max),
    abilities,
    abilityText: abilities
      .map((id) => unitAbilities[id]?.text)
      .filter(Boolean)
      .join(" "),
    minionCount: 2,
    minionLevel: 3,
    cardImage: "/assets/bosses/custom_boss.webp",
    summary: `${custom.name} — a designer-forged horror.`
  };
}

/**
 * Resolve a boss definition by id: a designed map's custom bosses win over
 * the built-in catalog (a custom def reusing a catalog id REPLACES it), then
 * the raid catalog, then the Dungeon floor bosses. Null = unknown id.
 */
export function resolveBossDefinition(state: GameState, defId: string): RaidBossDefinition | null {
  const custom = state.adventure?.mapPreset?.raidBosses?.bosses?.find((boss) => boss.id === defId);
  if (custom) {
    return customBossToDefinition(custom);
  }
  return RAID_BOSSES[defId] ?? DUNGEON_FLOOR_BOSSES[defId] ?? null;
}

/**
 * The boss pool the SCHEDULED spawn draws from: a designed map's custom-boss
 * list REPLACES the catalog when present (the designer's "my monsters on my
 * map" hook); otherwise the five catalog bosses.
 */
export function scheduledBossPool(state: GameState): string[] {
  const custom = state.adventure?.mapPreset?.raidBosses?.bosses;
  if (custom && custom.length > 0) {
    return custom.map((boss) => boss.id);
  }
  return state.adventure?.pveTheme === "doom"
    ? [...DOOM_RAID_BOSS_IDS]
    : [...CLASSIC_RAID_BOSS_IDS];
}

/**
 * Mint a boss combat unit with `layersLeft` health bars remaining (wounds
 * persist between attempts): body + (layersLeft − 1) army-stack layers.
 * `bankUnit` carries the gradeless targeting / tier-gate exemption and keeps
 * `applyUnitCurrentSide` off the minted stats (its bank branch no-ops on the
 * synthetic `boss.<id>` def id); `bossUnit` makes the layer shed unconditional
 * and marks it for layer-break payouts.
 */
export function makeRaidBossCombatUnit(
  def: RaidBossDefinition,
  layersLeft: number,
  unitId: string,
  position: number
): CombatUnitState {
  const layers = Math.max(1, Math.min(def.layers, Math.round(layersLeft)));
  return {
    id: unitId,
    controllerId: NEUTRAL_PLAYER_ID,
    name: def.name,
    cardName: `${def.name} (Boss)`,
    variant: "neutral",
    // Nominal only: `bankUnit` makes the boss tierless for every rules read
    // (targeting, tier gates, the neutral AI's grade ordering).
    grade: "gold",
    type: def.type,
    attack: def.attack,
    defense: def.defense,
    maxHealth: def.health,
    damage: 0,
    initiative: def.initiative,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: [...def.abilities],
    unitDefId: `boss.${def.id}`,
    bankUnit: true,
    bankGuard: true,
    bossUnit: true,
    ...(layers > 1 ? { armyStacks: layers - 1 } : {}),
    assets: { cardImage: def.cardImage, imageAlt: `${def.name} boss card` }
  };
}

/** Health bars a living boss unit still holds (0 once removed). */
export function bossLayersRemaining(unit: CombatUnitState): number {
  if (unit.damage >= unit.maxHealth) {
    return 0;
  }
  return (unit.armyStacks ?? 0) + 1;
}

/**
 * THE shared "how many Raid Bosses has this seat slain" metric — the ONE reader
 * behind the `slay-raid-boss` custom win condition and any future VP/objective
 * row (CLAUDE.md: the metrics ARE the Victory-Points readers, never a duplicate;
 * no boss-kill reader existed before this one). Event-sourced off
 * `RaidBossState.slainBy`, which `resolveRaidBossVictory` stamps at the kill, so
 * a cleared lair keeps paying its credit forever.
 *
 * CO-OP is TEAM-WIDE: in a `gameMode === "coop"` game an ALLY's kill counts for
 * every ally (`playersAreAllied` — the same alliance read every other co-op gate
 * takes, no new team plumbing). On any other table it is strictly per-seat, so
 * clash / single-player semantics are byte-identical.
 */
export function raidBossKillCount(state: GameState, playerId: PlayerId): number {
  const bosses = state.adventure?.raidBosses;
  if (!bosses) {
    return 0;
  }
  const teamWide = state.gameMode === "coop";
  let count = 0;
  for (const boss of Object.values(bosses)) {
    const slayer = boss.slainBy;
    if (!slayer) {
      continue;
    }
    if (slayer === playerId || (teamWide && playersAreAllied(state, playerId, slayer))) {
      count += 1;
    }
  }
  return count;
}

/** The live (unslain) boss lairing on a field, if any. */
export function raidBossOnField(state: GameState, fieldId: string): RaidBossState | null {
  const bosses = state.adventure?.raidBosses;
  if (!bosses) {
    return null;
  }
  for (const boss of Object.values(bosses)) {
    if (boss.fieldId === fieldId && !boss.slainBy && boss.layersLeft > 0) {
      return boss;
    }
  }
  return null;
}
