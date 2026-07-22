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
  | { kind: "stats" }
  | { kind: "ability"; choices: readonly string[] };

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

function S(): RankStep {
  return { kind: "stats" };
}
function A(...choices: string[]): RankStep {
  return { kind: "ability", choices };
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
    if (schedule[r].kind === "ability") n += 1;
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

/** Resolved schedule: unique table first, else flavoured template fill. */
export function rankScheduleFor(unitDefId: string): RankSchedule {
  const unique = UNIT_RANK_SCHEDULES[unitDefId];
  if (unique) return unique;
  const flavour = inferFlavour(unitDefId);
  const pack = FLAVOUR_ABILITIES[flavour];
  return buildScheduleFromTemplate(pack.template, pack.slots);
}

/** Whether this unit has a hand-authored unique schedule (not template fallback). */
export function hasUniqueRankSchedule(unitDefId: string): boolean {
  return Boolean(UNIT_RANK_SCHEDULES[unitDefId]);
}

// ---------------------------------------------------------------------------
// UI labels / icons (legacy track ids map to flavour for display)
// ---------------------------------------------------------------------------

export type RankAbilityTrackId = Flavour | RankTemplateId;

export function rankAbilityTrackFor(unitDefId: string): string {
  if (UNIT_RANK_SCHEDULES[unitDefId]) {
    return `unique:${scheduleTemplateId(UNIT_RANK_SCHEDULES[unitDefId])}`;
  }
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
  "wog-fire-shield-1": "/assets/spell-icons/fire_shield.png",
  "ignore-all-combat-penalties": "/assets/spell-icons/precision.png",
  "ignore-combat-penalties": "/assets/spell-icons/precision.png",
  "ranged-extra-shot-on-low-roll": "/assets/ui/rank-ability/extra-shot.webp",
  "attack-roll-advantage-passive": "/assets/ui/rank-ability/advantage.webp",
  "commander-charge": "/assets/spell-icons/haste.png",
  "commander-max-damage": "/assets/spell-icons/bloodlust.png",
  "ignores-retaliation": "/assets/ui/rank-ability/no-retaliation.webp",
  "unlimited-retaliation": "/assets/spell-icons/counterstrike.png",
  "double-attack": "/assets/ui/rank-ability/double-strike.webp",
  "double-attack-low-roll": "/assets/ui/rank-ability/double-strike.webp",
  "sandworm-strike-again": "/assets/ui/rank-ability/double-strike.webp",
  // Azur Lane bespoke arms (2026-07 upgrade) — Codex-painted naval icons.
  "kansen-full-barrage": "/assets/ui/rank-ability/full-barrage.webp",
  "kansen-fleet-formation": "/assets/ui/rank-ability/fleet-formation.webp",
  "zombie-resilience-weak": "/assets/ui/rank-ability/resilience.webp",
  "zombie-resilience": "/assets/ui/rank-ability/resilience.webp",
  "wraith-heal-1": "/assets/spell-icons/animate_dead.png",
  "wog-nightmare-fear": "/assets/ui/rank-ability/fear.webp",
  "unicorn-paralyze-retaliation": "/assets/spell-icons/blind.png"
};

const RANK_ABILITY_ICON_FALLBACK = "/assets/spell-icons/slayer.png";

export function unitRankAbilityIcon(abilityId: string): string {
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
