import type { UnitDefinition } from "@/data/factions/types";

/** Standard classic-Doom neutral monster slice represented by the enemy art in this branch. */
export const DOOM_UNIT_IDS_BY_TIER = {
  bronze: [
    "doom.demon",
    "doom.former_human",
    "doom.former_human_sergeant",
    "doom.imp",
    "doom.lost_soul"
  ],
  silver: [
    "doom.cacodemon",
    "doom.hell_knight",
    "doom.arachnotron",
    "doom.former_commando"
  ],
  gold: [
    "doom.baron_of_hell",
    "doom.revenant",
    "doom.mancubus",
    "doom.pain_elemental"
  ],
  azure: [
    "doom.arch_vile",
    "doom.spider_mastermind",
    "doom.cyberdemon"
  ]
} as const;

export type DoomUnitId = (typeof DOOM_UNIT_IDS_BY_TIER)[keyof typeof DOOM_UNIT_IDS_BY_TIER][number];

export const DOOM_UNIT_IDS = Object.values(DOOM_UNIT_IDS_BY_TIER).flat() as DoomUnitId[];

const source = {
  product: "DOOM (1993) / DOOM II: Hell on Earth - neutral monster adaptation",
  credit:
    "Enemy identity, weapon silhouettes, health reference, and behavior adapted from Doom Wiki and the classic enemy reference table. Board-game values are an initial balanced pass and remain tunable.",
  url: "https://www.wolfensteingoodies.com/archives/olddoom/enemies.htm"
};

export const doomUnitDefinitions: Record<DoomUnitId, UnitDefinition> = {
  "doom.demon": {
    id: "doom.demon",
    name: "Demon",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: {
      attack: 3,
      defense: 1,
      health: 5,
      initiative: 5,
      cost: { gold: 7 },
      abilities: ["unlimited-retaliation"],
      abilityText: "[unit_retaliation] This unit can perform an unlimited number of Retaliation Attacks.",
      cardImage: "/assets/doom/units/demon.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Demon",
    source
  },
  "doom.former_human": {
    id: "doom.former_human",
    name: "Former Human",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: {
      attack: 2,
      defense: 0,
      health: 3,
      initiative: 6,
      cost: { gold: 4 },
      abilities: [],
      cardImage: "/assets/doom/units/former-human.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Zombieman",
    source
  },
  "doom.imp": {
    id: "doom.imp",
    name: "Imp",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: {
      attack: 2,
      defense: 0,
      health: 4,
      initiative: 8,
      cost: { gold: 5 },
      abilities: ["ranged-extra-shot-on-low-roll"],
      abilityText: '[unit_attack] After a ranged Attack roll of "0" or "-1", deal 1 extra damage.',
      cardImage: "/assets/doom/units/imp.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Imp",
    source
  },
  "doom.lost_soul": {
    id: "doom.lost_soul",
    name: "Lost Soul",
    faction: "neutral",
    tier: "bronze",
    type: "flying",
    neutral: {
      attack: 2,
      defense: 0,
      health: 3,
      initiative: 10,
      cost: { gold: 5 },
      abilities: ["ignores-retaliation"],
      abilityText: "[unit_attack] Attacks by this unit never provoke a Retaliation Attack.",
      cardImage: "/assets/doom/units/lost-soul.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Lost_Soul",
    source
  },
  "doom.former_human_sergeant": {
    id: "doom.former_human_sergeant",
    name: "Former Human Sergeant",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: {
      attack: 2,
      defense: 0,
      health: 3,
      initiative: 5,
      cost: { gold: 6 },
      abilities: [],
      cardImage: "/assets/doom/units/former-human-sergeant.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Shotgun_Guy",
    source
  },
  "doom.cacodemon": {
    id: "doom.cacodemon",
    name: "Cacodemon",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 3,
      defense: 1,
      health: 5,
      initiative: 9,
      cost: { gold: 11 },
      abilities: ["ignore-combat-penalties"],
      abilityText: "[unit_passive] Ignore the ranged combat penalty against adjacent units.",
      cardImage: "/assets/doom/units/cacodemon.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Cacodemon",
    source
  },
  "doom.hell_knight": {
    id: "doom.hell_knight",
    name: "Hell Knight",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: {
      attack: 4,
      defense: 2,
      health: 7,
      initiative: 8,
      cost: { gold: 14 },
      abilities: ["reduce-spell-damage-1"],
      abilityText: "[unit_passive] Reduce any damage from spells by 1.",
      cardImage: "/assets/doom/units/hell-knight.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Hell_Knight",
    source
  },
  "doom.arachnotron": {
    id: "doom.arachnotron",
    name: "Arachnotron",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 4,
      defense: 1,
      health: 6,
      initiative: 11,
      cost: { gold: 15 },
      abilities: ["double-attack-low-roll"],
      abilityText: '[unit_attack] If a non-adjacent attack rolls "-1" or "0", attack the target again.',
      cardImage: "/assets/doom/units/arachnotron.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Arachnotron",
    source
  },
  "doom.baron_of_hell": {
    id: "doom.baron_of_hell",
    name: "Baron of Hell",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: {
      attack: 5,
      defense: 2,
      health: 8,
      initiative: 9,
      cost: { gold: 22 },
      abilities: ["reduce-spell-damage-2"],
      abilityText: "[unit_passive] Reduce any damage from spells by 2.",
      cardImage: "/assets/doom/units/baron-of-hell.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Baron_of_Hell",
    source
  },
  "doom.former_commando": {
    id: "doom.former_commando",
    name: "Former Commando",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 3,
      defense: 1,
      health: 5,
      initiative: 10,
      cost: { gold: 13 },
      abilities: ["double-attack"],
      abilityText: "[unit_attack] Suppressing Fire: if the target is non-adjacent, attack that target again.",
      cardImage: "/assets/doom/units/former-commando.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Heavy_Weapon_Dude",
    source
  },
  "doom.revenant": {
    id: "doom.revenant",
    name: "Revenant",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: {
      attack: 5,
      defense: 1,
      health: 7,
      initiative: 13,
      cost: { gold: 20 },
      abilities: ["attack-roll-advantage-passive"],
      abilityText: "[unit_attack] Deadly Pursuit: roll 2 Attack dice and resolve the higher outcome.",
      cardImage: "/assets/doom/units/revenant.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Revenant",
    source
  },
  "doom.mancubus": {
    id: "doom.mancubus",
    name: "Mancubus",
    faction: "neutral",
    tier: "gold",
    type: "ranged",
    neutral: {
      attack: 5,
      defense: 2,
      health: 8,
      initiative: 7,
      cost: { gold: 22 },
      abilities: ["magog-fireball-splash"],
      abilityText: "[unit_attack] Flame Volley: a non-adjacent attack also deals 1 damage to a unit adjacent to the target.",
      cardImage: "/assets/doom/units/mancubus.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Mancubus",
    source
  },
  "doom.pain_elemental": {
    id: "doom.pain_elemental",
    name: "Pain Elemental",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: {
      attack: 4,
      defense: 1,
      health: 6,
      initiative: 10,
      cost: { gold: 20 },
      abilities: ["reduce-spell-damage-2"],
      abilityText: "[unit_passive] Soul Hunger: reduce any damage from spells by 2.",
      cardImage: "/assets/doom/units/pain-elemental.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Pain_Elemental",
    source
  },
  "doom.arch_vile": {
    id: "doom.arch_vile",
    name: "Arch-Vile",
    faction: "neutral",
    tier: "azure",
    type: "ranged",
    neutral: {
      attack: 6,
      defense: 1,
      health: 8,
      initiative: 14,
      cost: { gold: 30 },
      abilities: ["reduce-spell-damage-2"],
      abilityText: "[unit_passive] Hellfire Ward: reduce any damage from spells by 2.",
      cardImage: "/assets/doom/units/arch-vile.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Arch-vile",
    source
  },
  "doom.spider_mastermind": {
    id: "doom.spider_mastermind",
    name: "Spider Mastermind",
    faction: "neutral",
    tier: "azure",
    type: "ground",
    neutral: {
      attack: 7,
      defense: 2,
      health: 10,
      initiative: 16,
      cost: { gold: 45, valuables: 2 },
      abilities: ["attack-roll-advantage-passive", "reduce-spell-damage-2"],
      abilityText:
        "[unit_passive] Mastermind Assault: roll 2 Attack dice, resolving the higher. Reduce spell damage by 2.",
      cardImage: "/assets/doom/units/spider-mastermind.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Spider_Mastermind",
    source
  },
  "doom.cyberdemon": {
    id: "doom.cyberdemon",
    name: "Cyberdemon",
    faction: "neutral",
    tier: "azure",
    type: "ranged",
    neutral: {
      attack: 8,
      defense: 3,
      health: 12,
      initiative: 14,
      cost: { gold: 52, valuables: 3 },
      abilities: ["magog-fireball-splash", "reduce-spell-damage-3"],
      abilityText:
        "[unit_passive] Rocket Barrage: a non-adjacent attack also deals 1 damage adjacent to the target. Reduce spell damage by 3.",
      cardImage: "/assets/doom/units/cyberdemon.webp"
    },
    wikiUrl: "https://doom.fandom.com/wiki/Cyberdemon",
    source
  }
};
