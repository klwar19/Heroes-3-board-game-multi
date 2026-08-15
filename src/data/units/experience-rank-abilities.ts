/**
 * Unit Experience rank rewards — each of the 4 ranks is EITHER stats OR one
 * ability (never both on the same rank).
 *
 * THREE generic templates (ability budget, not tier):
 *   standard — 1 ability  (S A S S)
 *   strong   — 2 abilities (S A S A)
 *   rare     — 3 abilities (A S A A)
 *
 * Gold units do NOT get a higher budget — only slower XP thresholds.
 * Unique schedules override the template for as many units as practical;
 * everything else falls back to a flavoured fill of one of the three templates.
 *
 * CLAUDE.md §2: every ability id is already-implemented.
 */

import type { UnitTier } from "@/data/factions/types";
import { coreUnitDefinitions } from "@/data/factions/units";

export type RankTemplateId = "standard" | "strong" | "rare";

export type RankStep =
  | { kind: "stats"; stats?: UnitRankStatBonus }
  | { kind: "ability"; choices: readonly string[] }
  | { kind: "hybrid"; stats: UnitRankStatBonus; choices: readonly string[] };

export type RankSchedule = {
  readonly 1: RankStep;
  readonly 2: RankStep;
  readonly 3: RankStep;
  readonly 4: RankStep;
};

export type UnitRankStatBonus = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
};

const Z: UnitRankStatBonus = { attack: 0, defense: 0, health: 0, initiative: 0 };

/** Same 3-step budget every tier — gold is Attack-first, not larger. */
export const UNIT_STAT_STEPS: Record<UnitTier, readonly UnitRankStatBonus[]> = {
  bronze: [
    { ...Z, defense: 1 },
    { ...Z, attack: 1 },
    { ...Z, health: 1, initiative: 1 }
  ],
  silver: [
    { ...Z, defense: 1 },
    { ...Z, attack: 1 },
    { ...Z, health: 1 }
  ],
  gold: [
    { ...Z, attack: 1 },
    { ...Z, defense: 1 },
    { ...Z, health: 1 }
  ],
  azure: [
    { ...Z, attack: 1 },
    { ...Z, defense: 1 },
    { ...Z, health: 1 }
  ]
};

function S(stats?: UnitRankStatBonus): RankStep {
  return stats ? { kind: "stats", stats } : { kind: "stats" };
}
function A(...choices: string[]): RankStep {
  return { kind: "ability", choices };
}
function H(stats: UnitRankStatBonus, ...choices: string[]): RankStep {
  return { kind: "hybrid", stats, choices };
}

/** Pattern skeletons (which ranks are stats vs ability). */
export const RANK_TEMPLATES: Record<RankTemplateId, readonly ("stats" | "ability")[]> = {
  // 1 ability
  standard: ["stats", "ability", "stats", "stats"],
  // 2 abilities
  strong: ["stats", "ability", "stats", "ability"],
  // 3 abilities
  rare: ["ability", "stats", "ability", "ability"]
};

export const RANK_TEMPLATE_LABELS: Record<RankTemplateId, string> = {
  standard: "Standard (1 ability)",
  strong: "Strong (2 abilities)",
  rare: "Rare (3 abilities)"
};

/** Build a schedule from a template + ability choice lists (length = ability slots). */
export function buildScheduleFromTemplate(
  template: RankTemplateId,
  abilitySlots: readonly (readonly string[])[]
): RankSchedule {
  const pattern = RANK_TEMPLATES[template];
  let ai = 0;
  const steps: RankStep[] = [];
  for (const kind of pattern) {
    if (kind === "stats") {
      steps.push(S());
    } else {
      const choices = abilitySlots[ai] ?? ["bulwark-thick-hide", "wog-no-negative-attack-roll"];
      ai += 1;
      steps.push(A(...choices));
    }
  }
  return { 1: steps[0]!, 2: steps[1]!, 3: steps[2]!, 4: steps[3]! };
}

export function scheduleAbilityCount(schedule: RankSchedule): number {
  let n = 0;
  for (const r of [1, 2, 3, 4] as const) {
    if (schedule[r].kind === "ability" || schedule[r].kind === "hybrid") n += 1;
  }
  return n;
}

export function scheduleTemplateId(schedule: RankSchedule): RankTemplateId {
  const n = scheduleAbilityCount(schedule);
  if (n >= 3) return "rare";
  if (n === 2) return "strong";
  return "standard";
}

// ---------------------------------------------------------------------------
// UNIQUE schedules — as many playable units as practical
// Pattern always matches one of the three templates.
// ---------------------------------------------------------------------------

export const UNIT_RANK_SCHEDULES: Record<string, RankSchedule> = {
  // ── Castle ──────────────────────────────────────────────────────────────
  "castle.halberdiers": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "bulwark-air-shield"]
  ]),
  "castle.marksmen": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "castle.griffins": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "reduce-spell-damage-1"] // already print unlimited-retaliation
  ]),
  "castle.crusaders": buildScheduleFromTemplate("strong", [
    ["commander-charge", "bulwark-thick-hide"],
    ["commander-max-damage", "wog-no-negative-attack-roll"]
  ]),
  "castle.zealots": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "castle.champions": buildScheduleFromTemplate("rare", [
    ["commander-charge", "bulwark-thick-hide"],
    ["ignores-retaliation", "commander-max-damage"],
    ["commander-max-damage", "wog-no-negative-attack-roll"]
  ]),
  "castle.archangels": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "reduce-spell-damage-1"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),

  // ── Necropolis ──────────────────────────────────────────────────────────
  "necropolis.skeletons": buildScheduleFromTemplate("rare", [
    ["zombie-resilience-weak", "bulwark-thick-hide"],
    ["bulwark-air-shield", "ignore-paralysis"],
    ["ignore-paralysis", "wraith-heal-1"]
  ]),
  "necropolis.zombies": buildScheduleFromTemplate("strong", [
    ["zombie-resilience-weak", "bulwark-thick-hide"],
    ["ignore-paralysis", "zombie-resilience"]
  ]),
  "necropolis.wraiths": buildScheduleFromTemplate("strong", [
    ["ignore-paralysis", "zombie-resilience-weak"],
    ["wraith-heal-1", "reduce-spell-damage-1"]
  ]),
  "necropolis.vampires": buildScheduleFromTemplate("strong", [
    ["ignore-paralysis", "zombie-resilience-weak"], // already print ignores-retaliation
    ["wraith-heal-1", "zombie-resilience"]
  ]),
  "necropolis.liches": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "necropolis.dread_knights": buildScheduleFromTemplate("strong", [
    ["commander-charge", "bulwark-thick-hide"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),
  "necropolis.ghost_dragons": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-thick-hide"],
    ["ignore-paralysis", "wog-fire-shield-1"]
  ]),

  // ── Dungeon ─────────────────────────────────────────────────────────────
  "dungeon.troglodytes": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "dungeon.harpies": buildScheduleFromTemplate("rare", [
    ["wog-no-negative-attack-roll", "bulwark-air-shield"],
    ["ignores-retaliation", "commander-charge"],
    ["double-attack-low-roll", "commander-max-damage"]
  ]),
  "dungeon.evil_eyes": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "dungeon.medusas": buildScheduleFromTemplate("rare", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ignore-combat-penalties"],
    ["ignores-retaliation", "commander-max-damage"]
  ]),
  "dungeon.minotaurs": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["commander-max-damage", "commander-charge"]
  ]),
  "dungeon.manticores": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "bulwark-air-shield"],
    ["wog-nightmare-fear", "ignore-paralysis"]
  ]),
  "dungeon.black_dragons": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-thick-hide"],
    ["wog-fire-shield-1", "ignore-paralysis"]
  ]),

  // ── Rampart ─────────────────────────────────────────────────────────────
  "rampart.centaurs": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "commander-charge"],
    ["ignore-all-combat-penalties", "wog-no-negative-attack-roll"]
  ]),
  "rampart.dwarves": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["reduce-spell-damage-1", "commander-defense-token"]
  ]),
  "rampart.elves": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "rampart.pegasi": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "reduce-spell-damage-1"]
  ]),
  "rampart.dendroids": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["commander-defense-token", "ignore-paralysis"]
  ]),
  "rampart.unicorns": buildScheduleFromTemplate("rare", [
    ["commander-charge", "bulwark-thick-hide"],
    ["unicorn-paralyze-retaliation", "reduce-spell-damage-1"],
    ["ignore-all-combat-penalties", "ignore-paralysis"]
  ]),
  "rampart.gold_dragons": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-thick-hide"],
    ["wog-fire-shield-1", "ignore-paralysis"]
  ]),

  // ── Inferno ─────────────────────────────────────────────────────────────
  "inferno.familiars": buildScheduleFromTemplate("rare", [
    ["wog-no-negative-attack-roll", "bulwark-thick-hide"],
    ["ignores-retaliation", "commander-charge"],
    ["double-attack-low-roll", "commander-max-damage"]
  ]),
  "inferno.magogs": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-fire-shield-1"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "inferno.cerberi": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-fire-shield-1"],
    ["unlimited-retaliation", "wog-nightmare-fear"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),
  "inferno.demons": buildScheduleFromTemplate("strong", [
    ["wog-fire-shield-1", "bulwark-thick-hide"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),
  "inferno.pit_lords": buildScheduleFromTemplate("strong", [
    ["wog-fire-shield-1", "bulwark-thick-hide"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),
  "inferno.efreet": buildScheduleFromTemplate("strong", [
    ["wog-fire-shield-1", "bulwark-thick-hide"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),
  "inferno.arch_devils": buildScheduleFromTemplate("strong", [
    ["wog-fire-shield-1", "reduce-spell-damage-1"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),

  // ── Stronghold ──────────────────────────────────────────────────────────
  "stronghold.goblins": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "stronghold.wolf_raiders": buildScheduleFromTemplate("strong", [
    ["commander-charge", "bulwark-thick-hide"],
    ["commander-max-damage", "wog-no-negative-attack-roll"]
  ]),
  "stronghold.orcs": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "stronghold.ogres": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["commander-defense-token", "commander-max-damage"]
  ]),
  "stronghold.thunderbirds": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"]
  ]),
  "stronghold.cyclopes": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "commander-max-damage"]
  ]),
  "stronghold.behemoths": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["wog-nightmare-fear", "commander-charge"],
    ["ignores-retaliation", "commander-max-damage"]
  ]),

  // ── Fortress ────────────────────────────────────────────────────────────
  "fortress.gnolls": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "fortress.lizardmen": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "fortress.dragon_flies": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "reduce-spell-damage-1"]
  ]),
  "fortress.basilisks": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["ignore-paralysis", "commander-charge"]
  ]),
  "fortress.gorgons": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["wog-nightmare-fear", "commander-max-damage"]
  ]),
  "fortress.wyverns": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "bulwark-thick-hide"]
  ]),
  "fortress.hydras": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["unlimited-retaliation", "commander-defense-token"],
    ["commander-defense-token", "ignore-paralysis"]
  ]),

  // ── Tower ───────────────────────────────────────────────────────────────
  "tower.gremlins": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ranged-extra-shot-on-low-roll", "ignore-all-combat-penalties"]
  ]),
  "tower.gargoyles": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "reduce-spell-damage-1"],
    ["ignore-paralysis", "reduce-spell-damage-1"]
  ]),
  "tower.iron_golems": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "reduce-spell-damage-1"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "tower.magi": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "tower.genies": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "wog-no-negative-attack-roll"]
  ]),
  "tower.nagas": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["unlimited-retaliation", "commander-max-damage"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),
  "tower.titans": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "reduce-spell-damage-1"],
    ["ignore-all-combat-penalties", "commander-max-damage"]
  ]),

  // ── Conflux ─────────────────────────────────────────────────────────────
  "conflux.sprites": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "reduce-spell-damage-1"]
  ]),
  "conflux.storm_elementals": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "wog-no-negative-attack-roll"]
  ]),
  "conflux.ice_elementals": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-thick-hide"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "conflux.energy_elementals": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "wog-fire-shield-1"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),
  "conflux.magma_elementals": buildScheduleFromTemplate("strong", [
    ["wog-fire-shield-1", "reduce-spell-damage-1"],
    ["ignore-paralysis", "bulwark-thick-hide"]
  ]),
  "conflux.magic_elementals": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "conflux.phoenixes": buildScheduleFromTemplate("rare", [
    ["wog-fire-shield-1", "reduce-spell-damage-1"],
    ["wog-fire-shield-1", "ignore-paralysis"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),

  // ── Cove ────────────────────────────────────────────────────────────────
  "cove.oceanids": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "bulwark-air-shield"]
  ]),
  "cove.seamen": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "cove.sea_dogs": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "cove.ayssids": buildScheduleFromTemplate("rare", [
    ["wog-no-negative-attack-roll", "bulwark-thick-hide"],
    ["ignores-retaliation", "commander-charge"],
    ["double-attack", "commander-max-damage"]
  ]),
  "cove.sorceresses": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "cove.nix": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["commander-defense-token", "ignore-paralysis"]
  ]),
  "cove.haspids": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["ignores-retaliation", "commander-charge"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),

  // ── Bulwark ─────────────────────────────────────────────────────────────
  "bulwark.kobolds": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "bulwark.mountain_rams": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-charge"],
    ["commander-defense-token", "wog-no-negative-attack-roll"]
  ]),
  "bulwark.snow_elves": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "bulwark.yetis": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["ignore-paralysis", "commander-max-damage"]
  ]),
  "bulwark.shamans": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "bulwark.mammoths": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "commander-defense-token"], // pack already thick-hide
    ["commander-defense-token", "reduce-spell-damage-1"]
  ]),
  "bulwark.jotunns": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "reduce-spell-damage-1"],
    ["reduce-spell-damage-1", "ignore-paralysis"],
    ["commander-defense-token", "ignore-paralysis"]
  ]),

  // ── Factory ─────────────────────────────────────────────────────────────
  "factory.halflings": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ranged-extra-shot-on-low-roll", "ignore-all-combat-penalties"]
  ]),
  "factory.mechanics": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "reduce-spell-damage-1"],
    ["ignore-paralysis", "wog-no-negative-attack-roll"]
  ]),
  "factory.armadillos": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["commander-defense-token", "reduce-spell-damage-1"]
  ]),
  "factory.automatons": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "reduce-spell-damage-1"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "factory.sandworms": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-charge"],
    ["wog-nightmare-fear", "ignore-paralysis"]
  ]),
  "factory.gunslingers": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "factory.couatls": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "reduce-spell-damage-1"]
  ]),
  "factory.dreadnoughts": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "reduce-spell-damage-1"],
    ["ignore-paralysis", "reduce-spell-damage-1"],
    ["commander-defense-token", "wog-fire-shield-1"]
  ]),

  // ── Anime Fuyuki ────────────────────────────────────────────────────────
  "fuyuki.assassins": buildScheduleFromTemplate("rare", [
    ["wog-no-negative-attack-roll", "bulwark-thick-hide"],
    ["ignores-retaliation", "commander-charge"],
    ["double-attack", "commander-max-damage"]
  ]),
  "fuyuki.riders": buildScheduleFromTemplate("strong", [
    ["commander-charge", "bulwark-thick-hide"],
    ["commander-max-damage", "wog-no-negative-attack-roll"]
  ]),
  "fuyuki.lancers": buildScheduleFromTemplate("strong", [
    ["commander-charge", "bulwark-thick-hide"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),
  "fuyuki.archers": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  "fuyuki.casters": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  "fuyuki.sabers": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["double-attack", "commander-max-damage"],
    ["ignores-retaliation", "commander-max-damage"]
  ]),
  "fuyuki.berserkers": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-charge"],
    ["commander-max-damage", "wog-nightmare-fear"]
  ]),

  // ── Anime Azure Breeze ──────────────────────────────────────────────────
  "azure_breeze.outer_disciples": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "azure_breeze.inner_swordsmen": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "commander-charge"]
  ]),
  // LV3 bronze flyer.
  "azure_breeze.spirit_crane": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "reduce-spell-damage-1"]
  ]),
  "azure_breeze.sect_protectors": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "reduce-spell-damage-1"], // few already Guarded
    ["wog-fire-shield-1", "ignore-paralysis"]
  ]),
  // LV5 silver (Qingyun specialty).
  "azure_breeze.true_inheritors": buildScheduleFromTemplate("rare", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
    ["double-attack", "commander-max-damage"],
    ["commander-max-damage", "ignore-paralysis"] // pack already no-retaliation
  ]),
  // LV6 gold formation mage.
  "azure_breeze.core_master": buildScheduleFromTemplate("strong", [
    ["reduce-spell-damage-1", "bulwark-air-shield"],
    ["ignore-paralysis", "commander-defense-token"]
  ]),
  // LV7 gold mountain tank.
  "azure_breeze.mountain_guardian": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["commander-defense-token", "reduce-spell-damage-1"]
  ]),

  // ── Anime Hidden Leaf ────────────────────────────────────────────────────
  // Swarm veterancy: bronze standard (1 ability), silver/gold strong (2). Every
  // choice is an already-implemented, non-Stacked ability drawn from the same
  // pools the Fuyuki/Azure schedules use.
  "hidden_leaf.genin_squad": buildScheduleFromTemplate("standard", [
    ["bulwark-thick-hide", "wog-no-negative-attack-roll"]
  ]),
  "hidden_leaf.medical_nin": buildScheduleFromTemplate("standard", [
    ["reduce-spell-damage-1", "bulwark-air-shield"]
  ]),
  // LV3 bronze ranged skirmisher.
  "hidden_leaf.anbu": buildScheduleFromTemplate("standard", [
    ["bulwark-air-shield", "ranged-extra-shot-on-low-roll"]
  ]),
  // LV4 silver ranged elite.
  "hidden_leaf.jonin": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "wog-no-negative-attack-roll"],
    ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
  ]),
  // LV5 silver ground tank.
  "hidden_leaf.giant_toad": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-defense-token"],
    ["commander-defense-token", "reduce-spell-damage-1"]
  ]),
  // LV6 gold AoE beast.
  "hidden_leaf.jinchuriki": buildScheduleFromTemplate("strong", [
    ["bulwark-thick-hide", "commander-charge"],
    ["commander-max-damage", "wog-nightmare-fear"]
  ]),
  // LV7 gold armored avatar.
  "hidden_leaf.susanoo": buildScheduleFromTemplate("strong", [
    ["bulwark-air-shield", "reduce-spell-damage-1"],
    ["wog-fire-shield-1", "ignore-paralysis"]
  ]),

  // ── Anime Azur Lane ──────────────────────────────────────────────────────
  // Fleet veterancy: bronze standard (1 ability), silver/gold strong (2). Every
  // choice is an already-implemented, non-Stacked ability NOT already printed on
  // that shipgirl's sides. Each schedule is keyed to the shipgirl's LORE (the
  // FIRST choice per slot is the signature; the second is a safer alternative):
  //   laffey  — "Solomon's Wardog", impossible rate of fire → the bespoke
  //     kansen-full-barrage (around-target salvo; 2026-07 upgrade), with the
  //     full second strike (sandworm-strike-again) as the safer alternative
  //     (NOT double-attack — that arm is ranged-gated and inert on a ground unit).
  //   javelin — torpedo-salvo destroyer → commander-max-damage (own die always
  //     counts +1 → a reliable full-power salvo; again NOT the ranged-only
  //     double-attack, which is dead on this ground unit).
  //   honolulu— ranged cruiser gunner → ranged-extra-shot-on-low-roll (a real
  //     ranged arm on the faction's one shooter).
  //   unicorn — carrier MEDIC → wraith-heal-1 (self-repair) then the bespoke
  //     kansen-fleet-formation escort aura (2026-07 upgrade; air-shield alt).
  //   yukikaze— "Miracle Yukikaze", luckiest ship → attack-roll-advantage-passive
  //     (roll two Attack dice, keep the higher) then a damage burst.
  //   prinz_eugen— UNSINKABLE cruiser → zombie-resilience (+1 Defense vs a 0/+1
  //     die = hard to sink) then wog-fire-shield-1 (flak barrage — reflect damage).
  //   i19     — ambush submarine → commander-max-damage / commander-charge (glass
  //     cannon after surfacing) then wog-nightmare-fear (terror from below). Its
  //     ranged double-attack alternative is likewise inert on this ground body, so
  //     the safer pick is wog-no-negative-attack-roll (torpedoes never misfire).
  // laffey signature UPGRADED (2026-07): kansen-full-barrage — the bespoke
  // around-target salvo arm — is her "impossible rate of fire"; the old full
  // second strike stays as the alternative.
  "azur_lane.laffey": buildScheduleFromTemplate("standard", [
    ["kansen-full-barrage", "sandworm-strike-again"]
  ]),
  "azur_lane.javelin": buildScheduleFromTemplate("standard", [
    ["commander-max-damage", "bulwark-air-shield"]
  ]),
  // LV3 bronze ranged cruiser gunner.
  "azur_lane.honolulu": buildScheduleFromTemplate("standard", [
    ["ranged-extra-shot-on-low-roll", "bulwark-air-shield"]
  ]),
  // LV4 silver carrier medic — heal itself, then (2026-07 upgrade) the bespoke
  // kansen-fleet-formation escort aura: adjacent allies +1 Attack on their own
  // attacks — the carrier escorting her fleet. Spell-ward stays the alternative.
  "azur_lane.unicorn": buildScheduleFromTemplate("strong", [
    ["wraith-heal-1", "commander-defense-token"],
    ["kansen-fleet-formation", "bulwark-air-shield"]
  ]),
  // LV5 silver lucky destroyer — twin Attack dice (keep higher), then a burst.
  "azur_lane.yukikaze": buildScheduleFromTemplate("strong", [
    ["attack-roll-advantage-passive", "wog-no-negative-attack-roll"],
    ["commander-charge", "commander-max-damage"]
  ]),
  // LV6 gold unsinkable heavy cruiser — die-roll soak, then a flak barrage.
  "azur_lane.prinz_eugen": buildScheduleFromTemplate("strong", [
    ["zombie-resilience", "reduce-spell-damage-1"],
    ["wog-fire-shield-1", "ignore-paralysis"]
  ]),
  // LV7 gold glass-cannon submarine — max-damage ambush, then Fear from below.
  "azur_lane.i19": buildScheduleFromTemplate("strong", [
    ["commander-max-damage", "commander-charge"],
    ["wog-nightmare-fear", "wog-no-negative-attack-roll"]
  ]),

  // ── Anime Heavenly Demon Palace ───────────────────────────────────────────
  // Demonic-path veterancy: bronze standard (1 ability), silver/gold strong (2).
  // Every choice is an already-implemented, non-Stacked ability NOT already
  // printed on that unit's sides. Each schedule is keyed to the unit's demonic
  // LORE (the FIRST choice per slot is the signature; the second a safer
  // alternative). The ground bodies avoid the ranged-gated `double-attack` arm
  // (inert on a melee unit — the same deviation the Azur Lane schedules document),
  // reaching for functional demonic arms (blood regeneration, terror, hellfire).
  //   blood_disciples — vampiric blood cultivators → wraith-heal-1 (regenerate
  //     each activation — the blood-drinker's self-heal on top of the printed
  //     siphon) then undying resilience.
  //   gu_witches      — poison-hex shooters → unicorn-paralyze-retaliation
  //     (a hex/curse that Paralyzes an attacker who engages the witch) then an
  //     extra poisoned volley.
  //   shadow_wraiths  — incorporeal terror → wog-nightmare-fear (spectral dread)
  //     then air-shield evasion (hard to pin an incorporeal wraith).
  //   corpse_puppets  — reanimated puppets → zombie-resilience (die-roll soak =
  //     unkillable corpse) then unshackled (a corpse ignores Paralysis) + terror.
  //   bone_reavers    — bone-crushing demon cavalry → commander-max-damage (the
  //     reliable full-power charge) then bone terror.
  //   ghost_king      — sovereign of the dead → teleport-move (spectral walk —
  //     phase across the battlefield) then a soul-reaping terror / devastation.
  //   demon_avatar    — apex demon incarnate → wog-fire-shield-1 (a hellfire aura
  //     that burns attackers) then devastating demonic blows.
  "heavenly_demon.blood_disciples": buildScheduleFromTemplate("standard", [
    ["wraith-heal-1", "zombie-resilience-weak"]
  ]),
  "heavenly_demon.gu_witches": buildScheduleFromTemplate("standard", [
    ["unicorn-paralyze-retaliation", "ranged-extra-shot-on-low-roll"]
  ]),
  "heavenly_demon.shadow_wraiths": buildScheduleFromTemplate("standard", [
    ["wog-nightmare-fear", "bulwark-air-shield"]
  ]),
  // LV5 silver reanimated tank.
  "heavenly_demon.corpse_puppets": buildScheduleFromTemplate("strong", [
    ["zombie-resilience", "bulwark-thick-hide"],
    ["ignore-paralysis", "wog-nightmare-fear"]
  ]),
  // LV4/5 silver demon cavalry.
  "heavenly_demon.bone_reavers": buildScheduleFromTemplate("strong", [
    ["commander-max-damage", "wog-no-negative-attack-roll"],
    ["wog-nightmare-fear", "commander-defense-token"]
  ]),
  // LV6 gold spectral sovereign.
  "heavenly_demon.ghost_king": buildScheduleFromTemplate("strong", [
    ["teleport-move", "bulwark-air-shield"],
    ["wog-nightmare-fear", "commander-max-damage"]
  ]),
  // LV7 gold apex demon.
  "heavenly_demon.demon_avatar": buildScheduleFromTemplate("strong", [
    ["wog-fire-shield-1", "reduce-spell-damage-1"],
    ["commander-max-damage", "ignore-paralysis"]
  ]),

  // Little Busters Campus — each signature emblem's first choice is the unit's
  // canonical mastery; the alternative keeps every decision competitive.
  "little_busters.haruka": buildScheduleFromTemplate("standard", [
    ["attack-roll-advantage", "wog-no-negative-attack-roll"]
  ]),
  "little_busters.rins_cats": buildScheduleFromTemplate("standard", [
    ["sandworm-strike-again", "commander-max-damage"]
  ]),
  "little_busters.disciplinary_committee": buildScheduleFromTemplate("standard", [
    ["ignore-all-combat-penalties", "commander-defense-token"]
  ]),
  "little_busters.masato": buildScheduleFromTemplate("strong", [
    ["unlimited-retaliation", "bulwark-thick-hide"],
    ["ignore-paralysis", "reduce-spell-damage-1"]
  ]),
  "little_busters.softball_club": buildScheduleFromTemplate("strong", [
    ["attack-roll-advantage-passive", "ranged-extra-shot-on-low-roll"],
    ["commander-max-damage", "bulwark-air-shield"]
  ]),
  "little_busters.saya": buildScheduleFromTemplate("strong", [
    ["gorgon-death-stare", "commander-charge"],
    ["commander-max-damage", "wog-no-negative-attack-roll"]
  ]),
  "little_busters.mio": buildScheduleFromTemplate("strong", [
    ["gargoyle-spell-ward", "bulwark-air-shield"],
    ["commander-defense-token", "ignore-paralysis"]
  ])
};

// ---------------------------------------------------------------------------
// Fallback flavour for units without a unique entry (neutrals, WOG, future)
// ---------------------------------------------------------------------------

type Flavour =
  | "melee"
  | "ranged"
  | "flying"
  | "cavalry"
  | "undead"
  | "fire"
  | "beast"
  | "dragon"
  | "elemental"
  | "machine"
  | "mystic"
  | "assassin"
  | "warden";

const FLAVOUR_ABILITIES: Record<Flavour, { template: RankTemplateId; slots: readonly (readonly string[])[] }> = {
  melee: {
    template: "standard",
    slots: [["bulwark-thick-hide", "bulwark-air-shield"]]
  },
  ranged: {
    template: "strong",
    slots: [
      ["bulwark-air-shield", "wog-no-negative-attack-roll"],
      ["ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"]
    ]
  },
  flying: {
    template: "standard",
    slots: [["bulwark-air-shield", "reduce-spell-damage-1"]]
  },
  cavalry: {
    template: "strong",
    slots: [
      ["commander-charge", "bulwark-thick-hide"],
      ["commander-max-damage", "wog-no-negative-attack-roll"]
    ]
  },
  undead: {
    template: "strong",
    slots: [
      ["zombie-resilience-weak", "ignore-paralysis"],
      ["ignore-paralysis", "wraith-heal-1"]
    ]
  },
  fire: {
    template: "strong",
    slots: [
      ["wog-fire-shield-1", "bulwark-thick-hide"],
      ["ignore-paralysis", "commander-max-damage"]
    ]
  },
  beast: {
    template: "strong",
    slots: [
      ["bulwark-thick-hide", "wog-no-negative-attack-roll"],
      ["wog-nightmare-fear", "commander-charge"]
    ]
  },
  dragon: {
    template: "strong",
    slots: [
      ["reduce-spell-damage-1", "bulwark-thick-hide"],
      ["wog-fire-shield-1", "ignore-paralysis"]
    ]
  },
  elemental: {
    template: "strong",
    slots: [
      ["reduce-spell-damage-1", "bulwark-air-shield"],
      ["ignore-paralysis", "wog-fire-shield-1"]
    ]
  },
  machine: {
    template: "strong",
    slots: [
      ["bulwark-thick-hide", "reduce-spell-damage-1"],
      ["ignore-paralysis", "commander-defense-token"]
    ]
  },
  mystic: {
    template: "strong",
    slots: [
      ["reduce-spell-damage-1", "bulwark-air-shield"],
      ["ignore-paralysis", "commander-defense-token"]
    ]
  },
  assassin: {
    template: "rare",
    slots: [
      ["wog-no-negative-attack-roll", "bulwark-thick-hide"],
      ["ignores-retaliation", "commander-charge"],
      ["double-attack", "commander-max-damage"]
    ]
  },
  warden: {
    template: "strong",
    slots: [
      ["bulwark-thick-hide", "commander-defense-token"],
      ["commander-defense-token", "reduce-spell-damage-1"]
    ]
  }
};

export function inferFlavour(unitDefId: string): Flavour {
  const def = coreUnitDefinitions[unitDefId];
  if (!def) return "melee";
  const faction = unitDefId.split(".")[0] ?? "";
  const name = def.name.toLowerCase();
  const type = def.type;
  if (name.includes("dragon")) return "dragon";
  if (faction === "necropolis" || name.includes("skeleton") || name.includes("zombie") || name.includes("wraith") || name.includes("vampire") || name.includes("lich") || name.includes("mummy")) {
    return "undead";
  }
  if (faction === "inferno" || name.includes("efreet") || name.includes("devil") || name.includes("demon") || name.includes("magog") || name.includes("familiar") || name.includes("cerber")) {
    return "fire";
  }
  if (name.includes("golem") || name.includes("automaton") || name.includes("dreadnought") || name.includes("gargoyle")) {
    return "machine";
  }
  if (name.includes("elemental") || faction === "conflux") return "elemental";
  if (name.includes("assassin") || name.includes("harpy") || name.includes("rogue") || name.includes("ayssid")) {
    return "assassin";
  }
  if (
    name.includes("champion") ||
    name.includes("cavalier") ||
    name.includes("rider") ||
    name.includes("crusader") ||
    name.includes("wolf") ||
    name.includes("unicorn") ||
    name.includes("saber")
  ) {
    return "cavalry";
  }
  if (
    name.includes("behemoth") ||
    name.includes("hydra") ||
    name.includes("basilisk") ||
    name.includes("gorgon") ||
    name.includes("wyvern") ||
    name.includes("manticore") ||
    name.includes("mammoth") ||
    name.includes("berserker") ||
    name.includes("troll") ||
    name.includes("boar")
  ) {
    return "beast";
  }
  if (
    name.includes("mage") ||
    name.includes("magi") ||
    name.includes("genie") ||
    name.includes("zealot") ||
    name.includes("shaman") ||
    name.includes("caster") ||
    name.includes("sorcer") ||
    name.includes("enchanter") ||
    name.includes("master")
  ) {
    return "mystic";
  }
  if (
    name.includes("dendroid") ||
    name.includes("dwarf") ||
    name.includes("ogre") ||
    name.includes("protector") ||
    name.includes("guardian") ||
    name.includes("armadillo") ||
    name.includes("nix")
  ) {
    return "warden";
  }
  if (type === "ranged") return "ranged";
  if (type === "flying") return "flying";
  return "melee";
}

type RankOneProfile = "defense" | "health" | "initiative" | "own-attack" | "retaliation" | "guarded";

const FLAT_DEFENSE_RANK_ONE_UNITS = new Set([
  "stronghold.wolf_raiders",
  "fuyuki.riders",
  "azure_breeze.spirit_crane",
  "hidden_leaf.anbu",
  "azur_lane.javelin",
  "heavenly_demon.bone_reavers",
  "little_busters.haruka",
  "mgq.miyabi",
  "mgq.hild",
  "mgq.pochi",
  "conflux.ice_elementals",
  "dungeon.minotaurs",
  "necropolis.wraiths",
  "inferno.demons",
  "tower.genies",
  "rampart.dendroids",
  "castle.marksmen",
  "fortress.gnolls",
  "wog.ghost",
  "doom.former_human",
  "doom.cacodemon"
]);

function stableRankHash(value: string, salt = 0): number {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const RANK_ONE_PROFILES: Record<Flavour, readonly RankOneProfile[]> = {
  melee: ["health", "own-attack", "retaliation", "guarded"],
  ranged: ["initiative", "own-attack", "health", "guarded"],
  flying: ["initiative", "own-attack", "health", "retaliation"],
  cavalry: ["initiative", "own-attack", "retaliation", "health"],
  undead: ["health", "retaliation", "guarded", "own-attack"],
  fire: ["own-attack", "health", "retaliation", "initiative"],
  beast: ["health", "guarded", "retaliation", "own-attack"],
  dragon: ["health", "initiative", "guarded", "own-attack"],
  elemental: ["health", "initiative", "guarded", "own-attack"],
  machine: ["health", "guarded", "retaliation", "initiative"],
  mystic: ["initiative", "health", "own-attack", "guarded"],
  assassin: ["initiative", "own-attack", "retaliation", "health"],
  warden: ["health", "guarded", "retaliation", "initiative"]
};

export function rankOneProfileFor(unitDefId: string): RankOneProfile {
  if (unitDefId === "fortress.gorgons") return "initiative";
  if (FLAT_DEFENSE_RANK_ONE_UNITS.has(unitDefId)) return "defense";
  const profiles = RANK_ONE_PROFILES[inferFlavour(unitDefId)];
  return profiles[stableRankHash(unitDefId, 1) % profiles.length]!;
}

/** Unit-aware, one-point stat packages. Defense 3 is never increased. */
export function unitStatStepsFor(
  unitDefId: string,
  tier: UnitTier
): readonly UnitRankStatBonus[] {
  const def = coreUnitDefinitions[unitDefId];
  const printedDefense = Math.max(
    def?.few?.defense ?? 0,
    def?.pack?.defense ?? 0,
    def?.neutral?.defense ?? 0
  );
  const profile = rankOneProfileFor(unitDefId);
  const flavour = inferFlavour(unitDefId);
  const logicalDefault: Record<Flavour, keyof UnitRankStatBonus> = {
    melee: "attack", ranged: "attack", flying: "initiative", cavalry: "initiative",
    undead: "health", fire: "attack", beast: "health", dragon: "health",
    elemental: "initiative", machine: "health", mystic: "initiative",
    assassin: "initiative", warden: "health"
  };
  const defenseCapFallback: keyof UnitRankStatBonus =
    ["flying", "cavalry", "assassin", "mystic"].includes(flavour) ? "initiative" : "health";
  const first = profile === "defense" && printedDefense >= 3
    ? defenseCapFallback
    : ["defense", "health", "initiative"].includes(profile)
    ? (profile as keyof UnitRankStatBonus)
    : logicalDefault[flavour];
  const tierOrder: Record<UnitTier, readonly (keyof UnitRankStatBonus)[]> = {
    bronze: ["defense", "attack", "health", "initiative"],
    silver: ["defense", "attack", "health", "initiative"],
    gold: ["attack", "health", "initiative", "defense"],
    azure: ["attack", "health", "initiative", "defense"]
  };
  const order = [first, ...tierOrder[tier]]
    .filter((stat, index, all) => all.indexOf(stat) === index)
    .filter((stat) => stat !== "defense" || printedDefense < 3)
    .slice(0, 3);
  return order.map((stat) => ({ ...Z, [stat]: 1 }));
}

const RANK_TWO_ABILITIES: Record<Flavour, readonly string[]> = {
  melee: ["veteran-attack-when-attacking", "veteran-guarded-stance", "commander-charge", "wog-no-negative-attack-roll"],
  ranged: ["veteran-steady-aim", "bulwark-air-shield", "attack-roll-advantage-passive", "ranged-extra-shot-on-low-roll"],
  flying: ["bulwark-air-shield", "veteran-attack-when-attacking", "reduce-spell-damage-1", "commander-charge"],
  cavalry: ["commander-charge", "veteran-retaliation-fury", "veteran-attack-when-attacking", "wog-no-negative-attack-roll"],
  undead: ["zombie-resilience-weak", "veteran-retaliation-fury", "wraith-heal-1", "veteran-guarded-stance"],
  fire: ["wog-fire-shield-1", "veteran-attack-when-attacking", "reduce-spell-damage-1", "wog-no-negative-attack-roll"],
  beast: ["veteran-guarded-stance", "wog-no-negative-attack-roll", "commander-charge", "wog-nightmare-fear"],
  dragon: ["reduce-spell-damage-1", "veteran-guarded-stance", "bulwark-air-shield", "wog-fire-shield-1"],
  elemental: ["reduce-spell-damage-1", "bulwark-air-shield", "veteran-guarded-stance", "wog-fire-shield-1"],
  machine: ["veteran-guarded-stance", "reduce-spell-damage-1", "commander-defense-token", "veteran-retaliation-fury"],
  mystic: ["reduce-spell-damage-1", "bulwark-air-shield", "veteran-steady-aim", "wraith-heal-1"],
  assassin: ["veteran-steady-aim", "commander-charge", "ignores-retaliation", "veteran-attack-when-attacking"],
  warden: ["veteran-guarded-stance", "commander-defense-token", "veteran-retaliation-fury", "reduce-spell-damage-1"]
};

const RANK_THREE_ABILITIES: Record<Flavour, readonly string[]> = {
  melee: ["veteran-defense-pierce", "commander-max-damage", "unlimited-retaliation", "ignores-retaliation"],
  ranged: ["ignore-all-combat-penalties", "veteran-low-roll-insight", "ranged-extra-shot-on-low-roll", "veteran-defense-pierce"],
  flying: ["veteran-speed-hunter", "teleport-move", "ignores-retaliation", "veteran-soul-feast"],
  cavalry: ["veteran-speed-hunter", "commander-max-damage", "ignores-retaliation", "double-attack-low-roll"],
  undead: ["veteran-rebirth", "veteran-soul-feast", "wraith-heal-2", "wraith-enemy-discard"],
  fire: ["wog-fire-shield-1", "commander-max-damage", "ignores-retaliation", "double-attack-low-roll"],
  beast: ["wog-nightmare-fear", "wraith-heal-2", "veteran-defense-pierce", "veteran-rebirth"],
  dragon: ["veteran-speed-hunter", "wraith-heal-2", "wog-fire-shield-1", "veteran-soul-feast"],
  elemental: ["veteran-spell-sunder", "teleport-move", "wog-fire-shield-1", "reduce-spell-damage-1"],
  machine: ["commander-defense-token", "unlimited-retaliation", "veteran-defense-pierce", "reduce-spell-damage-1"],
  mystic: ["veteran-spell-sunder", "veteran-low-roll-insight", "teleport-move", "wraith-heal-2"],
  assassin: ["ignores-retaliation", "veteran-low-roll-insight", "double-attack-low-roll", "teleport-move"],
  warden: ["unlimited-retaliation", "wraith-heal-2", "veteran-defense-pierce", "commander-defense-token"]
};

const RANK_FOUR_ABILITIES: Record<Flavour, readonly string[]> = {
  melee: ["veteran-defense-pierce", "veteran-rebirth", "unlimited-retaliation", "commander-max-damage"],
  ranged: ["veteran-low-roll-insight", "veteran-spell-sunder", "ignore-all-combat-penalties", "ranged-extra-shot-on-low-roll"],
  flying: ["veteran-speed-hunter", "veteran-soul-feast", "teleport-move", "ignores-retaliation"],
  cavalry: ["veteran-speed-hunter", "double-attack-low-roll", "commander-max-damage", "ignores-retaliation"],
  undead: ["veteran-rebirth", "veteran-soul-feast", "wraith-heal-2", "wraith-enemy-discard"],
  fire: ["wog-fire-shield-1", "double-attack-low-roll", "commander-max-damage", "veteran-rebirth"],
  beast: ["wog-nightmare-fear", "veteran-rebirth", "wraith-heal-2", "veteran-defense-pierce"],
  dragon: ["veteran-speed-hunter", "wraith-heal-2", "veteran-soul-feast", "wog-fire-shield-1"],
  elemental: ["veteran-spell-sunder", "teleport-move", "wog-fire-shield-1", "veteran-low-roll-insight"],
  machine: ["unlimited-retaliation", "commander-defense-token", "veteran-defense-pierce", "reduce-spell-damage-1"],
  mystic: ["veteran-spell-sunder", "veteran-low-roll-insight", "wraith-heal-2", "teleport-move"],
  assassin: ["ignores-retaliation", "double-attack-low-roll", "veteran-low-roll-insight", "teleport-move"],
  warden: ["unlimited-retaliation", "wraith-heal-2", "veteran-defense-pierce", "commander-defense-token"]
};

function rotatedChoices(unitDefId: string, rank: number, pool: readonly string[]): string[] {
  const start = stableRankHash(unitDefId, rank) % pool.length;
  return pool.map((_, index) => pool[(start + index) % pool.length]!);
}

function rankOneStepFor(unitDefId: string): RankStep {
  if (unitDefId === "fortress.hydras") return A("veteran-fear-aura");
  if (unitDefId === "castle.champions") return A("veteran-moving-pierce");
  const profile = rankOneProfileFor(unitDefId);
  if (["defense", "health", "initiative"].includes(profile)) return S();
  if (profile === "own-attack") return A("veteran-attack-when-attacking");
  if (profile === "retaliation") return A("veteran-retaliation-fury");
  return A("veteran-guarded-stance");
}

function explicitRankTwo(unitDefId: string): RankStep | null {
  if (unitDefId === "castle.champions") return S({ ...Z, health: 1 });
  return null;
}

function explicitRankThree(unitDefId: string): RankStep | null {
  if (unitDefId === "castle.archangels") return A("veteran-layer-draw");
  if (unitDefId === "castle.champions") {
    return H({ ...Z, initiative: 2 }, "veteran-mobility-1");
  }
  if (unitDefId === "stronghold.behemoths") return A("veteran-flying-movement");
  if (unitDefId.endsWith(".black_dragons")) {
    return H({ ...Z, initiative: 2 }, "veteran-speed-hunter");
  }
  if (unitDefId.endsWith(".phoenixes")) return A("veteran-regeneration-2");
  // Reserve Soul Feast for the requested Ghost Dragon capstone instead of
  // accidentally consuming it from the generic dragon pool one rank early.
  if (unitDefId.endsWith(".ghost_dragons")) return S();
  return null;
}

function explicitRankFour(unitDefId: string): RankStep | null {
  if (unitDefId === "castle.crusaders") return A("veteran-double-attack");
  if (unitDefId === "inferno.pit_lords") return A("veteran-defense-pierce");
  if (unitDefId === "inferno.magogs") return S({ ...Z, health: 2 });
  if (unitDefId === "necropolis.dread_knights") return A("reduce-spell-and-specialty-damage-2");
  if (unitDefId === "conflux.sprites") return A("pegasi-magic-damper");
  if (unitDefId.endsWith(".skeletons")) return A("veteran-rebirth");
  if (unitDefId.endsWith(".magi")) return A("veteran-spell-sunder");
  if (unitDefId.endsWith(".unicorns")) return A("veteran-low-roll-insight");
  if (unitDefId.endsWith(".zealots")) return A("veteran-defense-pierce");
  if (unitDefId.endsWith(".ghost_dragons")) return A("veteran-soul-feast");
  return null;
}

/** Resolved schedule: diversified small R1, themed R2/R3, and a capstone R4. */
export function rankScheduleFor(unitDefId: string): RankSchedule {
  const flavour = inferFlavour(unitDefId);
  const rankThree = explicitRankThree(unitDefId) ??
    (stableRankHash(unitDefId, 3) % 3 === 0
      ? A(...rotatedChoices(unitDefId, 3, RANK_THREE_ABILITIES[flavour]))
      : S());
  return {
    1: rankOneStepFor(unitDefId),
    2: explicitRankTwo(unitDefId) ?? A(...rotatedChoices(unitDefId, 2, RANK_TWO_ABILITIES[flavour])),
    3: rankThree,
    4: explicitRankFour(unitDefId) ?? A(...rotatedChoices(unitDefId, 4, RANK_FOUR_ABILITIES[flavour]))
  };
}

/** Whether this unit has a hand-authored unique schedule (not template fallback). */
export function hasUniqueRankSchedule(unitDefId: string): boolean {
  return Boolean(coreUnitDefinitions[unitDefId]);
}

// ---------------------------------------------------------------------------
// UI labels / icons (legacy track ids map to flavour for display)
// ---------------------------------------------------------------------------

export type RankAbilityTrackId = Flavour | RankTemplateId;

export function rankAbilityTrackFor(unitDefId: string): string {
  return inferFlavour(unitDefId);
}

export const RANK_ABILITY_TRACK_LABELS: Record<string, string> = {
  melee: "Shield wall",
  ranged: "Sharpshooter",
  flying: "Skyrider",
  cavalry: "Shock cavalry",
  undead: "Unholy host",
  fire: "Infernal breed",
  beast: "Apex predator",
  dragon: "Dragon blood",
  elemental: "Elemental core",
  machine: "War machine",
  mystic: "Arcane disciple",
  assassin: "Silent blade",
  warden: "Bulwark",
  "unique:standard": "Unique · Standard",
  "unique:strong": "Unique · Strong",
  "unique:rare": "Unique · Rare",
  // legacy aliases
  melee_line: "Shield wall",
  ranged_line: "Sharpshooter",
  flying_line: "Skyrider",
  cavalry_line: "Shock cavalry",
  undead_line: "Unholy host",
  infernal_line: "Infernal breed",
  beast_line: "Apex predator",
  dragon_line: "Dragon blood",
  elemental_line: "Elemental core",
  mechanical_line: "War machine",
  aquatic_line: "Sea hunter",
  mystic_line: "Arcane disciple",
  assassin_line: "Silent blade",
  warden_line: "Bulwark"
};

export const UNIT_RANK_ABILITY_ICONS: Record<string, string> = {
  "bulwark-thick-hide": "/assets/ui/rank-ability/thick-hide.webp",
  "bulwark-air-shield": "/assets/ui/rank-ability/air-shield.webp",
  "wog-no-negative-attack-roll": "/assets/ui/rank-ability/sure-shot.webp",
  "reduce-spell-damage-1": "/assets/ui/rank-ability/spell-ward.webp",
  "ignore-paralysis": "/assets/ui/rank-ability/unshackled.webp",
  "commander-defense-token": "/assets/ui/rank-ability/guarded.webp",
  "wog-fire-shield-1": "/assets/ui/rank-ability/fire-shield.webp",
  "ignore-all-combat-penalties": "/assets/ui/rank-ability/precision.webp",
  "ignore-combat-penalties": "/assets/ui/rank-ability/precision.webp",
  "ranged-extra-shot-on-low-roll": "/assets/ui/rank-ability/extra-shot.webp",
  "attack-roll-advantage-passive": "/assets/ui/rank-ability/advantage.webp",
  "attack-roll-advantage": "/assets/ui/rank-ability/advantage.webp",
  "commander-charge": "/assets/ui/rank-ability/charge.webp",
  "commander-max-damage": "/assets/ui/rank-ability/max-damage.webp",
  "ignores-retaliation": "/assets/ui/rank-ability/no-retaliation.webp",
  "unlimited-retaliation": "/assets/ui/rank-ability/counterstrike.webp",
  "double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "double-attack-low-roll": "/assets/ui/rank-ability/double-strike.webp",
  "sandworm-strike-again": "/assets/ui/rank-ability/double-strike.webp",
  // Azur Lane bespoke arms (2026-07 upgrade) — Codex-painted naval icons.
  "kansen-full-barrage": "/assets/ui/rank-ability/full-barrage.webp",
  "kansen-fleet-formation": "/assets/ui/rank-ability/fleet-formation.webp",
  "zombie-resilience-weak": "/assets/ui/rank-ability/resilience.webp",
  "zombie-resilience": "/assets/ui/rank-ability/resilience.webp",
  "wraith-heal-1": "/assets/ui/rank-ability/soul-mend.webp",
  "wraith-heal-2": "/assets/ui/rank-ability/regeneration-2.webp",
  "wraith-enemy-discard": "/assets/ui/rank-ability/spell-sunder.webp",
  "wog-nightmare-fear": "/assets/ui/rank-ability/fear.webp",
  "unicorn-paralyze-retaliation": "/assets/ui/rank-ability/paralyzing-gaze.webp",
  "gorgon-death-stare": "/assets/ui/rank-ability/death-stare.webp",
  "gargoyle-spell-ward": "/assets/ui/rank-ability/spell-ward.webp",
  "teleport-move": "/assets/ui/rank-ability/teleport.webp",
  "veteran-attack-when-attacking": "/assets/ui/rank-ability/own-attack.webp",
  "veteran-retaliation-fury": "/assets/ui/rank-ability/retaliation-fury.webp",
  "veteran-guarded-stance": "/assets/ui/rank-ability/guarded-stance.webp",
  "veteran-steady-aim": "/assets/ui/rank-ability/steady-aim.webp",
  "veteran-rebirth": "/assets/ui/rank-ability/rebirth.webp",
  "veteran-spell-sunder": "/assets/ui/rank-ability/spell-sunder.webp",
  "veteran-low-roll-insight": "/assets/ui/rank-ability/low-roll-insight.webp",
  "veteran-defense-pierce": "/assets/ui/rank-ability/defense-pierce.webp",
  "veteran-soul-feast": "/assets/ui/rank-ability/soul-feast.webp",
  "veteran-speed-hunter": "/assets/ui/rank-ability/speed-hunter.webp",
  "veteran-regeneration-2": "/assets/ui/rank-ability/regeneration-2.webp",
  "veteran-flying-movement": "/assets/ui/rank-ability/flying-movement.webp",
  "veteran-fear-aura": "/assets/ui/rank-ability/fear-aura.webp",
  "veteran-layer-draw": "/assets/ui/rank-ability/layer-triumph.webp",
  "veteran-moving-pierce": "/assets/ui/rank-ability/moving-pierce.webp",
  "veteran-mobility-1": "/assets/ui/rank-ability/mobility.webp",
  "veteran-double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "reduce-spell-and-specialty-damage-2": "/assets/ui/rank-ability/arcane-aegis.webp",
  "pegasi-magic-damper": "/assets/ui/rank-ability/spell-dampening.webp"
};

/**
 * Azur Lane's veterancy choices use the shipgirl's own skill emblem. This is
 * keyed by unit definition, not by shared engine ability id: the same rank
 * mechanic can be offered to several ships, but the XP board still shows the
 * correct in-game art for the ship being trained.
 *
 * This unit-level map is the signature/default emblem. The choice-level map
 * below is the authoritative lookup when a schedule offers a specific skill.
 */
export const AZUR_LANE_RANK_ABILITY_ICONS: Record<string, string> = {
  "azur_lane.laffey": "/assets/anime/icons/azur-lane/rank-ability-laffey.webp",
  "azur_lane.javelin": "/assets/anime/icons/azur-lane/rank-ability-javelin.webp",
  "azur_lane.honolulu": "/assets/anime/icons/azur-lane/rank-ability-honolulu.webp",
  "azur_lane.unicorn": "/assets/anime/icons/azur-lane/rank-ability-unicorn.webp",
  "azur_lane.yukikaze": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",
  "azur_lane.prinz_eugen": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen.webp",
  "azur_lane.i19": "/assets/anime/icons/azur-lane/rank-ability-i19.webp"
};

/**
 * Explicit XP-board art for every Azur Lane schedule choice. The engine ids
 * are intentionally shared with the regular HoMM3-style rank abilities, so a
 * lookup by ability id alone would make (for example) every `commander-charge`
 * choice show the same generic Haste art. Pairing the id with the ship keeps
 * normal card ability art untouched while assigning the actual in-game ship
 * skill emblem to every Azur Lane choice.
 */
export const AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE: Record<string, string> = {
  "azur_lane.laffey:kansen-full-barrage": "/assets/anime/icons/azur-lane/rank-ability-laffey.webp",
  "azur_lane.laffey:sandworm-strike-again": "/assets/anime/icons/azur-lane/rank-ability-laffey-assault.webp",

  "azur_lane.javelin:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-javelin.webp",
  "azur_lane.javelin:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-javelin-assault.webp",

  "azur_lane.honolulu:ranged-extra-shot-on-low-roll": "/assets/anime/icons/azur-lane/rank-ability-honolulu.webp",
  "azur_lane.honolulu:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-honolulu-barrage.webp",

  "azur_lane.unicorn:wraith-heal-1": "/assets/anime/icons/azur-lane/rank-ability-unicorn.webp",
  "azur_lane.unicorn:commander-defense-token": "/assets/anime/icons/azur-lane/rank-ability-unicorn-aid.webp",
  "azur_lane.unicorn:kansen-fleet-formation": "/assets/anime/icons/azur-lane/rank-ability-unicorn.webp",
  "azur_lane.unicorn:bulwark-air-shield": "/assets/anime/icons/azur-lane/rank-ability-unicorn-aid.webp",

  "azur_lane.yukikaze:attack-roll-advantage-passive": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",
  "azur_lane.yukikaze:wog-no-negative-attack-roll": "/assets/anime/icons/azur-lane/rank-ability-yukikaze-lucky.webp",
  "azur_lane.yukikaze:commander-charge": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",
  "azur_lane.yukikaze:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-yukikaze.webp",

  "azur_lane.prinz_eugen:zombie-resilience": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen.webp",
  "azur_lane.prinz_eugen:reduce-spell-damage-1": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen-shield.webp",
  "azur_lane.prinz_eugen:wog-fire-shield-1": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen.webp",
  "azur_lane.prinz_eugen:ignore-paralysis": "/assets/anime/icons/azur-lane/rank-ability-prinz-eugen-shield.webp",

  "azur_lane.i19:commander-max-damage": "/assets/anime/icons/azur-lane/rank-ability-i19.webp",
  "azur_lane.i19:commander-charge": "/assets/anime/icons/azur-lane/rank-ability-i19-torpedoes.webp",
  "azur_lane.i19:wog-nightmare-fear": "/assets/anime/icons/azur-lane/rank-ability-i19.webp",
  "azur_lane.i19:wog-no-negative-attack-roll": "/assets/anime/icons/azur-lane/rank-ability-i19-torpedoes.webp"
};

/** Little Busters bespoke veterancy emblems (one researched emblem per line). */
export const LITTLE_BUSTERS_RANK_ABILITY_ICONS: Record<string, string> = {
  "little_busters.haruka": "/assets/anime/icons/little-busters/rank-haruka.webp",
  "little_busters.rins_cats": "/assets/anime/icons/little-busters/rank-rins-cats.webp",
  "little_busters.disciplinary_committee": "/assets/anime/icons/little-busters/rank-disciplinary-committee.webp",
  "little_busters.masato": "/assets/anime/icons/little-busters/rank-masato.webp",
  "little_busters.softball_club": "/assets/anime/icons/little-busters/rank-softball-club.webp",
  "little_busters.saya": "/assets/anime/icons/little-busters/rank-saya.webp",
  "little_busters.mio": "/assets/anime/icons/little-busters/rank-mio.webp"
};

export const LITTLE_BUSTERS_RANK_ABILITY_ICON_BY_CHOICE: Record<string, string> = {
  "little_busters.haruka:attack-roll-advantage": "/assets/anime/icons/little-busters/rank-haruka.webp",
  "little_busters.rins_cats:sandworm-strike-again": "/assets/anime/icons/little-busters/rank-rins-cats.webp",
  "little_busters.disciplinary_committee:ignore-all-combat-penalties": "/assets/anime/icons/little-busters/rank-disciplinary-committee.webp",
  "little_busters.masato:unlimited-retaliation": "/assets/anime/icons/little-busters/rank-masato.webp",
  "little_busters.softball_club:attack-roll-advantage-passive": "/assets/anime/icons/little-busters/rank-softball-club.webp",
  "little_busters.saya:gorgon-death-stare": "/assets/anime/icons/little-busters/rank-saya.webp",
  "little_busters.mio:gargoyle-spell-ward": "/assets/anime/icons/little-busters/rank-mio.webp"
};

/** MGQ's rank-3 emblem follows the card's current Job, including sealed Neutrals. */
export const MGQ_JOB_RANK_ABILITY_ICONS: Record<string, string> = {
  "ignores-retaliation": "/assets/anime/icons/mgq/rank-job-warrior.webp",
  "unlimited-retaliation": "/assets/anime/icons/mgq/rank-job-guard.webp",
  "titan-ignore-ongoing": "/assets/anime/icons/mgq/rank-job-mage.webp",
  "wraith-heal-1": "/assets/anime/icons/mgq/rank-job-healer.webp"
};

const RANK_ABILITY_ICON_FALLBACK = "/assets/spell-icons/slayer.png";

export function unitRankAbilityIcon(abilityId: string, unitDefId?: string, mgqJob?: string): string {
  if (unitDefId?.startsWith("mgq.") || mgqJob) {
    const jobIcon = MGQ_JOB_RANK_ABILITY_ICONS[abilityId];
    if (jobIcon) return jobIcon;
  }
  if (unitDefId?.startsWith("azur_lane.")) {
    const choiceIcon = AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE[`${unitDefId}:${abilityId}`];
    if (choiceIcon) return choiceIcon;
    if (AZUR_LANE_RANK_ABILITY_ICONS[unitDefId]) return AZUR_LANE_RANK_ABILITY_ICONS[unitDefId];
  }
  if (unitDefId?.startsWith("little_busters.")) {
    const choiceIcon = LITTLE_BUSTERS_RANK_ABILITY_ICON_BY_CHOICE[`${unitDefId}:${abilityId}`];
    if (choiceIcon) return choiceIcon;
    if (LITTLE_BUSTERS_RANK_ABILITY_ICONS[unitDefId]) return LITTLE_BUSTERS_RANK_ABILITY_ICONS[unitDefId];
  }
  return UNIT_RANK_ABILITY_ICONS[abilityId] ?? RANK_ABILITY_ICON_FALLBACK;
}

// Compatibility exports for older imports / tests
export const ELITE_UNIT_RANK_ABILITIES: Record<string, string> = {};
export const LEGEND_UNIT_RANK_ABILITIES: Record<string, string> = {};
export const UNIT_RANK_TRACK_OVERRIDES: Record<string, string> = {};
export const RANK_ABILITY_TRACKS = RANK_TEMPLATES;
export const UNIT_RANK_ABILITY_SCHEDULES = UNIT_RANK_SCHEDULES;
export const RANK_SCHEDULES = RANK_TEMPLATES;

export function rankAbilityScheduleFor(unitDefId: string): RankSchedule {
  return rankScheduleFor(unitDefId);
}
export function inferRankAbilityTrack(unitDefId: string): string {
  return rankAbilityTrackFor(unitDefId);
}
