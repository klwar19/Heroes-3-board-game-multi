import type { UnitDefinition } from "@/data/factions/types";

/**
 * First WOG content slice. These cards are kept out of the ordinary Neutral
 * decks unless the lobby enables WOG -> New neutral creatures under BINH.
 */
export const WOG_UNIT_IDS_BY_TIER = {
  bronze: ["wog.santa_gremlin", "wog.ghost"],
  silver: [
    "wog.air_messenger",
    "wog.earth_messenger",
    "wog.fire_messenger",
    "wog.water_messenger",
    "wog.war_zealot",
    "wog.arctic_sharpshooter",
    "wog.lava_sharpshooter",
    "wog.sylvan_centaur",
    "wog.werewolf"
  ],
  gold: ["wog.nightmare", "wog.hell_steed", "wog.gorynych"],
  azure: ["wog.dracolich"]
} as const;

export type WogUnitId = (typeof WOG_UNIT_IDS_BY_TIER)[keyof typeof WOG_UNIT_IDS_BY_TIER][number];

export const WOG_UNIT_IDS = Object.values(WOG_UNIT_IDS_BY_TIER).flat() as WogUnitId[];

const source = {
  product: "Heroes III: In the Wake of Gods (fan-mod board-game adaptation)",
  credit:
    "Creature identity and lore reference the Wake of Gods neutral-creature roster. Board-game statistics and adaptations were supplied for this project; card illustrations are newly generated and composed in the project's neutral frames.",
  url: "https://www.heroesofmightandmagic.com/wakeofgods/neutral.shtml"
};

export const wogUnitDefinitions: Record<WogUnitId, UnitDefinition> = {
  "wog.ghost": {
    id: "wog.ghost",
    name: "Ghost",
    faction: "neutral",
    tier: "bronze",
    type: "ground",
    neutral: {
      attack: 3,
      defense: 0,
      health: 4,
      initiative: 7,
      cost: { gold: 6 },
      abilities: ["wog-ghost-soul-harvest"],
      abilityText:
        "[unit_attack] After defeating a non-Undead unit, remove all [damage] from Ghost and permanently gain +1 [health_points] (maximum +2 per game).",
      cardImage: "/assets/units-neutral-bronze-wog_ghost.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Ghost",
    source
  },
  "wog.air_messenger": {
    id: "wog.air_messenger",
    name: "Air Messenger",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: {
      attack: 3,
      defense: 1,
      health: 5,
      initiative: 9,
      cost: { gold: 8 },
      abilities: ["wog-air-protection"],
      abilityText: "[unit_passive] Reduce [damage] from Air Magic [spell] by 2 (to a minimum of 0).",
      cardImage: "/assets/units-neutral-silver-wog_air_messenger.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Messengers",
    source
  },
  "wog.earth_messenger": {
    id: "wog.earth_messenger",
    name: "Earth Messenger",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: {
      attack: 3,
      defense: 2,
      health: 4,
      initiative: 5,
      cost: { gold: 8 },
      abilities: ["wog-earth-protection"],
      abilityText: "[unit_passive] Reduce [damage] from Earth Magic [spell] by 2 (to a minimum of 0).",
      cardImage: "/assets/units-neutral-silver-wog_earth_messenger.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Messengers",
    source
  },
  "wog.fire_messenger": {
    id: "wog.fire_messenger",
    name: "Fire Messenger",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: {
      attack: 4,
      defense: 1,
      health: 5,
      initiative: 7,
      cost: { gold: 8 },
      abilities: ["wog-fire-protection"],
      abilityText: "[unit_passive] Reduce [damage] from Fire Magic [spell] by 2 (to a minimum of 0).",
      cardImage: "/assets/units-neutral-silver-wog_fire_messenger.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Messengers",
    source
  },
  "wog.water_messenger": {
    id: "wog.water_messenger",
    name: "Water Messenger",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: {
      attack: 3,
      defense: 1,
      health: 6,
      initiative: 6,
      cost: { gold: 8 },
      abilities: ["wog-water-protection"],
      abilityText: "[unit_passive] Reduce [damage] from Water Magic [spell] by 2 (to a minimum of 0).",
      cardImage: "/assets/units-neutral-silver-wog_water_messenger.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Messengers",
    source
  },
  "wog.war_zealot": {
    id: "wog.war_zealot",
    name: "War Zealot",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 3,
      defense: 1,
      health: 4,
      initiative: 6,
      cost: { gold: 13 },
      abilities: ["ignore-combat-penalties", "wog-war-zealot-mirror", "wog-attack-when-attacking-1"],
      abilityText:
        "[unit_passive] Ignore the combat penalty against adjacent units. This unit has Magic Mirror at all times. [unit_attack] When this unit attacks, it gains +1 [attack].",
      cardImage: "/assets/units-neutral-silver-wog_war_zealot.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/War_Zealot",
    source
  },
  "wog.arctic_sharpshooter": {
    id: "wog.arctic_sharpshooter",
    name: "Arctic Sharpshooter",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 3,
      defense: 1,
      health: 5,
      initiative: 8,
      cost: { gold: 15 },
      // engine: `ignore-all-combat-penalties` waives the range/adjacent penalties
      // on this unit's OWN attack only (never its Retaliation Attack) — the same
      // [unit_attack] scope as the base Sharpshooters/Magi/Halflings that share the
      // ability; the "+1 Defense vs ranged" (bulwark-air-shield) is the passive.
      abilities: ["ignore-all-combat-penalties", "bulwark-air-shield"],
      abilityText: "[unit_passive] Ignore combat penalties. +1 [defense] against attacks from ranged units.",
      cardImage: "/assets/units-neutral-silver-wog_arctic_sharpshooter.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Arctic_Sharpshooter",
    source
  },
  "wog.lava_sharpshooter": {
    id: "wog.lava_sharpshooter",
    name: "Lava Sharpshooter",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 3,
      defense: 0,
      health: 5,
      initiative: 9,
      cost: { gold: 15 },
      // engine: `ignore-all-combat-penalties` waives the range/adjacent penalties
      // on this unit's OWN attack only (never its Retaliation Attack) — the same
      // [unit_attack] scope as the base Sharpshooters/Magi/Halflings that share the
      // ability; the "1 damage to an adjacent attacker" (wog-fire-shield-1) is the passive;
      // `wog-attack-when-attacking-1` adds +1 Attack on its OWN attack only.
      abilities: ["ignore-all-combat-penalties", "wog-fire-shield-1", "wog-attack-when-attacking-1"],
      abilityText: "[unit_passive] Ignore combat penalties. An adjacent attacker takes 1 [damage] after attacking this unit. [unit_attack] When this unit attacks, it gains +1 [attack].",
      cardImage: "/assets/units-neutral-silver-wog_lava_sharpshooter.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Lava_Sharpshooter",
    source
  },
  "wog.sylvan_centaur": {
    id: "wog.sylvan_centaur",
    name: "Sylvan Centaur",
    faction: "neutral",
    tier: "silver",
    type: "ranged",
    neutral: {
      attack: 3,
      defense: 0,
      health: 4,
      initiative: 8,
      cost: { gold: 12 },
      abilities: ["double-attack", "wog-no-negative-attack-roll"],
      abilityText: "[unit_attack] Attack a non-adjacent target twice. Treat a \"-1\" Attack die result as \"0\".",
      cardImage: "/assets/units-neutral-silver-wog_sylvan_centaur.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Sylvan_Centaur",
    source
  },
  "wog.werewolf": {
    id: "wog.werewolf",
    name: "Werewolf",
    faction: "neutral",
    tier: "silver",
    type: "ground",
    neutral: {
      attack: 3,
      defense: 1,
      health: 5,
      initiative: 7,
      cost: { gold: 15 },
      abilities: ["wog-werewolf-moon-frenzy", "wog-werewolf-pack-call"],
      abilityText:
        "[unit_passive] During Astrologers' rounds, +1 [attack] and this unit must attack if possible. [unit_attack] Once per Combat after defeating a unit, summon a temporary Werewolf with -1 to every statistic.",
      cardImage: "/assets/units-neutral-silver-wog_werewolf.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Werewolf",
    source
  },
  "wog.nightmare": {
    id: "wog.nightmare",
    name: "Nightmare",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: {
      attack: 5,
      defense: 2,
      health: 6,
      initiative: 11,
      cost: { gold: 25 },
      abilities: ["gorgon-death-stare", "wog-nightmare-fear"],
      abilityText:
        "[unit_passive] Fear: when this unit is attacked (not on a Retaliation Attack), the attacker rolls 2 Attack dice and resolves the lower result. [unit_attack] Death Stare: after the attack, roll 2 Attack dice. On two \"-1\" results, reduce the target's [health_points] to 0.",
      cardImage: "/assets/units-neutral-golden-wog_nightmare.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Nightmare",
    source
  },
  "wog.hell_steed": {
    id: "wog.hell_steed",
    name: "Hell Steed",
    faction: "neutral",
    tier: "gold",
    type: "ground",
    neutral: {
      attack: 5,
      defense: 1,
      health: 7,
      initiative: 9,
      cost: { gold: 22 },
      // engine: a NORMAL melee attacker — it rolls its Attack die and its blow is
      // reduced by the target's Defense (it does NOT "use Magic Arrow" / deal
      // un-rollable elemental damage; that earlier `wog-magic-arrow-attack` wiring
      // was wrong and has been removed). `efreet-fire-immunity` = immune to Magic
      // Arrow + Fire Magic; `wog-fire-shield-1` burns an attacker for 1 ONLY when
      // this unit is attacked (never on its own Retaliation Attack — see
      // applyFireShieldDamage); `wog-hell-steed-fire-wall` drops a 1-damage Fire
      // Wall on the target's space after its own attack.
      abilities: ["efreet-fire-immunity", "wog-fire-shield-1", "wog-hell-steed-fire-wall"],
      abilityText:
        "[unit_passive] Immune to Magic Arrow and Fire Magic [spell]. An adjacent attacker that attacks this unit takes 1 [damage]. [unit_attack] Place a Fire Wall on the target's space.",
      cardImage: "/assets/units-neutral-golden-wog_hell_steed.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Hell_Steed",
    source
  },
  "wog.gorynych": {
    id: "wog.gorynych",
    name: "Gorynych",
    faction: "neutral",
    tier: "gold",
    type: "flying",
    neutral: {
      attack: 5,
      defense: 2,
      health: 7,
      initiative: 8,
      cost: { gold: 25 },
      abilities: ["ignores-retaliation", "wog-gorynych-sweep"],
      abilityText: "[unit_attack] Ignore the Retaliation Attack. Then attack every other adjacent enemy with 4 [attack].",
      cardImage: "/assets/units-neutral-golden-wog_gorynych.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Gorynych",
    source
  },
  "wog.santa_gremlin": {
    id: "wog.santa_gremlin",
    name: "Santa Gremlin",
    faction: "neutral",
    tier: "bronze",
    type: "ranged",
    neutral: {
      attack: 2,
      defense: 0,
      health: 4,
      initiative: 5,
      cost: { gold: 5 },
      abilities: ["wog-santa-ice-bolt", "wog-santa-guard", "wog-santa-gift"],
      abilityText:
        "[unit_attack] This unit's ranged attack uses Ice Bolt. Add a neutral Gremlin guard before Combat. After defeating Santa Gremlin in a neutral Combat, roll 1 extra Resource die.",
      cardImage: "/assets/units-neutral-bronze-wog_santa_gremlin.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Santa_Gremlin",
    source
  },
  "wog.dracolich": {
    id: "wog.dracolich",
    name: "Dracolich",
    faction: "neutral",
    tier: "azure",
    type: "ranged",
    neutral: {
      attack: 7,
      defense: 2,
      health: 10,
      initiative: 16,
      cost: { gold: 45, valuables: 2 },
      abilities: [
        "wog-undead",
        "ignore-combat-penalties",
        "titan-ignore-ongoing",
        "reduce-spell-damage-2",
        "teleport-move",
        "wog-dracolich-armor",
        "wog-dracolich-death-cloud"
      ],
      abilityText:
        "[unit_passive] Undead. Ignore the combat penalty against adjacent units. Ignore [ongoing] effects and reduce [damage] from [spell] by 2. [movement] Move to any empty Battlefield space. When attacked, roll 1 Attack die; on \"-1\", reduce [damage] taken by 2. [unit_attack] Attack a unit adjacent to the target with 4 Attack.",
      cardImage: "/assets/units-neutral-azure-wog_dracolich.webp"
    },
    wikiUrl: "https://heroes.thelazy.net/index.php/In_the_Wake_of_Gods/Dracolich",
    source
  }
};
