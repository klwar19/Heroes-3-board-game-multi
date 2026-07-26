/**
 * Raid Bosses & Dungeon floor bosses (anime-mod plan §6.5.2 / §6.7.3) — shared
 * by BOTH mod surfaces (`wog.raidBosses`/`anime.raidBosses`, `wog.dungeon`/
 * `anime.dungeon`).
 *
 * A boss is a bespoke-stat LAYERED monster, never a Neutral deck card: its
 * statline is per-LAYER and `layers` is the health-bar count. The engine mint
 * (`makeRaidBossCombatUnit`, src/engine/raid-bosses.ts) rides the army-stack
 * layer machinery (`armyStacks` = layers − 1; `markUnitRemovedIfNeeded` sheds
 * one full bar per lethal hit, carrying excess) and stamps `bankUnit`, so a
 * boss is GRADELESS in play: tier-gated spells/stares can't touch it, the
 * neutral AI ranks it by distance, and `applyUnitCurrentSide` keeps its minted
 * stats (the bank branch no-ops on the synthetic `boss.<id>` def id).
 *
 * CLAUDE.md §2: each `abilities` array is the complete, literal list of
 * engine-wired effects; `abilityText` restates exactly that and nothing more.
 * `src/engine/raid-bosses.test.ts` enforces every id resolves implemented.
 */

import type { UnitType } from "@/engine/state";

export type RaidBossDefinition = {
  id: string;
  name: string;
  /** Flavor subtitle shown under the name on the generated card face. */
  title: string;
  /** Per-layer statline (each layer is one full health bar of `health`). */
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  type: UnitType;
  /** Printed layer cap — total health bars at full strength (escalation cap). */
  layers: number;
  /** Complete, literal list of engine-wired ability ids (implemented only). */
  abilities: string[];
  /** Exactly what the wired abilities do — never more (CLAUDE.md §2). */
  abilityText: string;
  /** Escort minions accompanying the boss: N draws at a NEUTRAL_ARMY_TABLE row. */
  minionCount: number;
  minionLevel: number;
  cardImage: string;
  summary: string;
};

const art = (slug: string) => `/assets/bosses/${slug}.webp`;

/** The five §6.5 world bosses, keyed by id. */
export const RAID_BOSSES: Record<string, RaidBossDefinition> = {
  goblin_king: {
    id: "goblin_king",
    name: "Goblin King",
    title: "Tyrant of the Warrens",
    attack: 4,
    defense: 1,
    health: 3,
    initiative: 6,
    type: "ground",
    layers: 3,
    abilities: ["ignores-retaliation", "boss-enrage"],
    abilityText:
      "[unit_attack] Ignore the Retaliation Attack. While this boss is on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 3,
    minionLevel: 2,
    cardImage: art("goblin_king"),
    summary: "3 layers; strikes without retaliation and enrages on its last bar."
  },
  colossal_titan: {
    id: "colossal_titan",
    name: "Colossal Titan",
    title: "The Walking Calamity",
    attack: 6,
    defense: 2,
    health: 3,
    initiative: 3,
    type: "ground",
    layers: 5,
    abilities: ["boss-devour", "zombie-resilience"],
    abilityText:
      'After its own attack against a BRONZE unit, roll 1 Attack die; on a "+1" the target side is removed outright (Devour). When attacked, roll an Attack die; on a "+1" the damage is reduced by 1 (Resilience).',
    minionCount: 2,
    minionLevel: 2,
    cardImage: art("colossal_titan"),
    summary: "5 layers, slow; devours bronze units whole and shrugs off chip damage."
  },
  abyss_kraken: {
    id: "abyss_kraken",
    name: "Abyss Kraken",
    title: "Terror of the Deep",
    attack: 5,
    defense: 1,
    health: 3,
    initiative: 7,
    type: "ground",
    layers: 4,
    abilities: ["magic-elemental-attack-all-enemies", "unlimited-retaliation"],
    abilityText:
      "[unit_attack] After the attack, a full separate attack at this unit's Attack strikes EVERY other adjacent enemy unit. May retaliate more than once in a combat round.",
    minionCount: 3,
    minionLevel: 3,
    cardImage: art("abyss_kraken"),
    summary: "4 layers; its tentacles lash every adjacent enemy and never stop retaliating."
  },
  calamity_dragon: {
    id: "calamity_dragon",
    name: "Calamity Dragon",
    title: "Herald of the Rift",
    attack: 6,
    defense: 2,
    health: 3,
    initiative: 9,
    type: "flying",
    layers: 6,
    abilities: ["dragon-line-attack-3", "ignores-retaliation"],
    abilityText:
      "[unit_attack] Attack 2 spaces in a line: after the attack, a full separate attack at attack 3 strikes the unit directly behind the target. Ignore the Retaliation Attack.",
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("calamity_dragon"),
    summary: "6 layers, flying; line breath and untouchable strikes."
  },
  avatar_of_erebos: {
    id: "avatar_of_erebos",
    name: "Avatar of Erebos",
    title: "The God That Walks",
    attack: 7,
    defense: 2,
    health: 3,
    initiative: 8,
    type: "ground",
    layers: 7,
    abilities: ["boss-fear", "boss-enrage"],
    abilityText:
      "While this unit lives, the enemy cannot USE morale (token or Positive Morale cards — reroll, set-die, redraw, combat bonus, token removal; gains and draws still happen). While on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("avatar_of_erebos"),
    summary: "7 layers; its Fear locks your morale away, and it enrages at the end."
  },
  cyberdemon_prime: {
    id: "cyberdemon_prime",
    name: "Cyberdemon Prime",
    title: "Siege Lord of Hell",
    attack: 7,
    defense: 2,
    health: 4,
    initiative: 6,
    type: "ground",
    layers: 6,
    abilities: ["dragon-line-attack-3", "boss-enrage"],
    abilityText:
      "[unit_attack] Rocket barrage strikes the target and the unit directly behind it at Attack 3. While this boss is on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("doom_baron_warden"),
    summary: "6 layers; a rocket barrage tears through lines before its final enrage."
  },
  spider_overmind: {
    id: "spider_overmind",
    name: "Spider Overmind",
    title: "Architect of the Invasion",
    attack: 6,
    defense: 3,
    health: 3,
    initiative: 7,
    type: "ranged",
    layers: 5,
    abilities: ["magic-elemental-attack-all-enemies", "zombie-resilience"],
    abilityText:
      '[unit_attack] After its attack, this unit makes a full separate attack against every other adjacent enemy; those follow-ups do not retaliate or chain. If the attacker resolves a "0" or "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("doom_cyberdemon_tyrant"),
    summary: "5 layers; suppressing fire lashes the whole formation while armor absorbs hits."
  }
};

/** The two §6.7.3 Dungeon floor bosses (floors 5 and 10) — 2-layer minibosses. */
export const DUNGEON_FLOOR_BOSSES: Record<string, RaidBossDefinition> = {
  minotaur_of_the_depths: {
    id: "minotaur_of_the_depths",
    name: "Minotaur of the Depths",
    title: "Warden of Floor 5",
    attack: 5,
    defense: 1,
    health: 3,
    initiative: 7,
    type: "ground",
    layers: 2,
    abilities: ["ignores-retaliation", "boss-enrage"],
    abilityText:
      "[unit_attack] Ignore the Retaliation Attack. While this boss is on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("minotaur_of_the_depths"),
    summary: "The floor-5 warden: 2 layers, riposte-proof, furious at the end."
  },
  floor_wyrm: {
    id: "floor_wyrm",
    name: "The Floor Wyrm",
    title: "Warden of Floor 10",
    attack: 5,
    defense: 2,
    health: 4,
    initiative: 5,
    type: "ground",
    layers: 2,
    abilities: ["boss-devour", "unlimited-retaliation"],
    abilityText:
      'After its own attack against a BRONZE unit, roll 1 Attack die; on a "+1" the target side is removed outright (Devour). May retaliate more than once in a combat round.',
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("floor_wyrm"),
    summary: "The floor-10 warden: 2 thick layers, devours bronze units, always retaliates."
  },
  doom_baron_warden: {
    id: "doom_baron_warden",
    name: "Baron Warden",
    title: "Keeper of Infernal Floor 5",
    attack: 5,
    defense: 2,
    health: 3,
    initiative: 6,
    type: "ground",
    layers: 2,
    abilities: ["nix-damage-cap", "boss-enrage"],
    abilityText:
      "This unit cannot take more than 4 damage from a single attack (Spell and ability damage are not capped). While on its LAST health layer, its Attack gains +2 (Enrage).",
    minionCount: 2,
    minionLevel: 3,
    cardImage: art("cyberdemon_prime"),
    summary: "The Doom floor-5 warden: two armored layers and a vicious final phase."
  },
  doom_cyberdemon_tyrant: {
    id: "doom_cyberdemon_tyrant",
    name: "Cyberdemon Tyrant",
    title: "Keeper of Infernal Floor 10",
    attack: 6,
    defense: 2,
    health: 4,
    initiative: 7,
    type: "ground",
    layers: 3,
    abilities: ["dragon-line-attack-3", "ignores-retaliation"],
    abilityText:
      "[unit_attack] Rocket barrage strikes the target and the unit directly behind it at Attack 3. Ignore the Retaliation Attack.",
    minionCount: 3,
    minionLevel: 4,
    cardImage: art("spider_overmind"),
    summary: "The Doom floor-10 tyrant: three layers, line-breaking rockets, no retaliation."
  }
};

/**
 * The curated ability whitelist a DESIGNER custom boss may draw from (map
 * preset `raidBosses.bosses[].abilities`): self-contained, implemented combat
 * abilities only — nothing that reads a deck, faction cubes or player state.
 * `sanitizeCustomMapPreset` filters against this list; a data test asserts
 * every id resolves to an implemented `unitAbilities` entry.
 */
export const RAID_BOSS_ABILITY_CHOICES: readonly string[] = [
  "boss-enrage",
  "boss-devour",
  "boss-fear",
  "ignores-retaliation",
  "unlimited-retaliation",
  "zombie-resilience",
  "dragon-line-attack-3",
  "magic-elemental-attack-all-enemies",
  "teleport-move",
  "nix-damage-cap",
  "commander-defense-token",
  "attack-roll-advantage-passive"
];

/** Every shipped boss (raid + dungeon floors), for data tests and art builds. */
export function listAllBossDefinitions(): RaidBossDefinition[] {
  return [...Object.values(RAID_BOSSES), ...Object.values(DUNGEON_FLOOR_BOSSES)];
}
