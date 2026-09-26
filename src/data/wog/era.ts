/**
 * WoG "era" modules — data (see src/engine/wog-era.ts for the engine).
 *
 * Six optional modules, each OFF by default on both the WOG and the Anime mod
 * surface: the moving Raid Boss, the Wandering Teacher, the Loan Bank, Mithril,
 * Karmic Battles and Skill Combos. Everything a card or prompt prints here is
 * exactly what the engine runs (AGENTS.md: no decorative text).
 */

import type { RaidBossDefinition } from "@/data/anime/bosses";
import { registerFieldOverrideDefinitions } from "@/data/map/field-overrides";
import { unitAbilities } from "@/data/units/abilities";
import type { CardId, CardLibrary, TeacherLessonKind } from "@/engine/state";

// ---------------------------------------------------------------------------
// Moving Raid Boss
// ---------------------------------------------------------------------------

/** A moving boss: a raid-boss body (one layer) plus its map token art. */
export type WanderingBossDefinition = RaidBossDefinition & { mapImage: string };

const abilityTextOf = (ids: readonly string[]): string =>
  ids
    .map((id) => unitAbilities[id]?.text)
    .filter(Boolean)
    .join(" ");

const GRIMJAW_ABILITIES = ["wolf-raiders-strike-twice", "boss-fear"] as const;
const MORVANE_ABILITIES = ["wog-boss-death-bolt", "wog-boss-raise-zombies"] as const;

/**
 * The two moving bosses (one is picked at random when the boss arrives). Each
 * is ONE lone body with ~3x a Gold unit's Health (Gold units print 8-10) and a
 * boss kit of engine-wired abilities — no layers, no pendingChoice for the
 * fighter: Grimjaw strikes twice (acts again after the retaliation) and locks
 * the enemy's morale; Morvane casts a Death Bolt every activation and raises a
 * Zombies minion after every attack. Ability text is built from the wired
 * abilities' own texts.
 */
export const WANDERING_BOSSES: Record<string, WanderingBossDefinition> = {
  roaming_behemoth: {
    id: "roaming_behemoth",
    name: "Grimjaw the Roaming Behemoth",
    title: "The Moving Raid Boss",
    attack: 6,
    defense: 3,
    health: 27,
    initiative: 7,
    type: "ground",
    layers: 1,
    abilities: [...GRIMJAW_ABILITIES],
    abilityText: abilityTextOf(GRIMJAW_ABILITIES),
    minionCount: 0,
    minionLevel: 1,
    cardImage: "/assets/bosses/roaming_behemoth.webp",
    mapImage: "/assets/wog-era/roaming-behemoth-map.webp",
    summary: "Strikes twice and breaks the enemy's morale."
  },
  lich_sovereign: {
    id: "lich_sovereign",
    name: "Morvane the Lich Sovereign",
    title: "The Moving Raid Boss",
    attack: 5,
    defense: 2,
    health: 24,
    initiative: 8,
    type: "ranged",
    layers: 1,
    abilities: [...MORVANE_ABILITIES],
    abilityText: abilityTextOf(MORVANE_ABILITIES),
    minionCount: 0,
    minionLevel: 1,
    cardImage: "/assets/bosses/lich_sovereign.webp",
    mapImage: "/assets/wog-era/lich-sovereign-map.webp",
    summary: "Casts a Death Bolt every activation and raises Zombies after every attack."
  }
};

export const WANDERING_BOSS_IDS = Object.keys(WANDERING_BOSSES);

/** A moving boss definition by id (falls back to the first — never null). */
export function wanderingBossDefinition(defId: string | undefined): WanderingBossDefinition {
  return WANDERING_BOSSES[defId ?? ""] ?? WANDERING_BOSSES.roaming_behemoth!;
}

/** Default arrival round (lobby chips offer 4 or 5); announced one round earlier. */
export const WANDERING_BOSS_DEFAULT_SPAWN_ROUND = 5;
/** Fraction of its Health the boss heals at every round start (rounded up). */
export const WANDERING_BOSS_HEAL_FRACTION = 0.25;
/** Gold shared among the NON-killers in proportion to the damage they dealt. */
export const WANDERING_BOSS_GOLD_POT = 15;
/** Movement a hero spends to attack the boss (like entering a field). */
export const WANDERING_BOSS_ATTACK_MP = 1;

// ---------------------------------------------------------------------------
// Wandering Teacher
// ---------------------------------------------------------------------------

export const WANDERING_TEACHER_MAP_IMAGE = "/assets/wog-era/wandering-teacher-map.webp";
/** The Teacher first appears at the start of this round, then moves every round. */
export const WANDERING_TEACHER_FIRST_ROUND = 2;
/** Lessons one seat may take from the Teacher over the whole game. */
export const TEACHER_LESSONS_PER_GAME = 2;
/** Unit experience a Study lesson grants one army unit (Unit Experience on). */
export const TEACHER_STUDY_UNIT_XP = 2;

export type TeacherLessonDefinition = {
  kind: TeacherLessonKind;
  name: string;
  gold: number;
  /** Exactly what the lesson does (shown on the button). */
  text: string;
};

export const TEACHER_LESSONS: Record<TeacherLessonKind, TeacherLessonDefinition> = {
  mastery: {
    kind: "mastery",
    name: "Mastery",
    gold: 8,
    text: "Empower one Ability card in your hand: it plays its Expert side without spending a crown for the rest of the game."
  },
  retrain: {
    kind: "retrain",
    name: "Retrain",
    gold: 3,
    text: "Set one Ability card from your hand aside, then Search the Ability deck (3)."
  },
  study: {
    kind: "study",
    name: "Study",
    gold: 4,
    text: "Your Main Hero gains 1 experience — or, with Unit Experience on, one of your army units gains 2 experience."
  }
};

export const TEACHER_LESSON_ORDER: readonly TeacherLessonKind[] = ["mastery", "retrain", "study"];
/** Lessons on offer each round (drawn from the three, seeded per round). */
export const TEACHER_LESSONS_PER_ROUND = 2;
/** Cards looked at by a Retrain search. */
export const TEACHER_RETRAIN_SEARCH = 3;

// ---------------------------------------------------------------------------
// Loan Bank
// ---------------------------------------------------------------------------

export const LOAN_PRINCIPAL = 10;
export const LOAN_REPAY = 15;
/** Repay by the end of round (taken + LOAN_TERM_ROUNDS). */
export const LOAN_TERM_ROUNDS = 3;
/** VP lost on a default when the bank finds no building to seize (VP games). */
export const LOAN_DEFAULT_VP = 2;

// ---------------------------------------------------------------------------
// Mithril
// ---------------------------------------------------------------------------

export const MITHRIL_ICON = "/assets/wog-era/mithril.webp";
/** Mithril the DISCOVERER of a new tile gains, once per tile, by tile band. */
export const MITHRIL_DISCOVERY: Partial<Record<string, number>> = { far: 1, near: 2, center: 3 };
/** Every live seat gains 1 Mithril at the start of every Nth round. */
export const MITHRIL_INCOME_EVERY_ROUNDS = 3;
/** Reroll any die (map or combat), once per round. */
export const MITHRIL_REROLL_COST = 1;
/** Forge a mine you hold: its next Resource-Round payout is doubled. */
export const MITHRIL_FORGE_MINE_COST = 2;
/** Forge one war machine type in Mithril (permanent). */
export const MITHRIL_WAR_MACHINE_COST = 6;

/** The Mithril Mine Field Override (Mithril module only; one per Near tile). */
export const MITHRIL_MINE_KIND = "mithril_mine";
export const MITHRIL_MINE_LOCATION_ID = "wog.mithril_mine";
/** Mithril its holder gains every Resource Round. */
export const MITHRIL_MINE_INCOME = 1;

/**
 * Registered like every Field Override kind (board art, carve legality, the
 * "protected hex" read) but `poolExcluded`: it is never pool-drawn and never in
 * the designer palette — wog-era.ts carves exactly one onto each revealed Near
 * tile while the Mithril module is on, so no other game can ever see one.
 */
registerFieldOverrideDefinitions({
  [MITHRIL_MINE_KIND]: {
    id: MITHRIL_MINE_KIND,
    locationId: MITHRIL_MINE_LOCATION_ID,
    name: "Mithril Mine",
    package: "wog",
    poolExcluded: true,
    tileGroups: ["near"],
    terrain: "land",
    guard: 5,
    implementationStatus: "implemented",
    summary:
      "Guarded (Ⅴ). Flag it like a Garrison (an enemy takes the flag by entering); its holder gains 1 Mithril every Resource Round.",
    image: "/assets/wog-era/mithril-mine.webp"
  }
});

export type MithrilWarMachineUpgrade = {
  name: string;
  /** The upgraded card's full rules text (baked into its face). */
  text: string;
  cardImage: string;
};

/**
 * Mithril war-machine upgrades, applied live by permanents.ts / reducer.ts for
 * a seat whose `mithrilWarMachines` lists the card id; the printed card never
 * changes. "Even Combat round" = combat round 2, 4, 6, …
 */
export const MITHRIL_WAR_MACHINES: Record<string, MithrilWarMachineUpgrade> = {
  "war_machine.first_aid_tent": {
    name: "Mithril First Aid Tent",
    text: "Once per Combat round, remove 1 damage from one of your units — 2 damage in even Combat rounds.",
    cardImage: "/assets/war_machines-first_aid_tent-mithril.webp"
  },
  "war_machine.ammo_cart": {
    name: "Mithril Ammo Cart",
    text: "Your ranged units ignore all ranged penalties and gain +2 Initiative. When the battle begins, one ranged unit you choose gets +1 Attack for this Combat.",
    cardImage: "/assets/war_machines-ammo_cart-mithril.webp"
  },
  "war_machine.ballista": {
    name: "Mithril Ballista",
    text: "At the start of each Combat round, deal 2 damage (instead of 1) to the enemy unit with the lowest Initiative.",
    cardImage: "/assets/war_machines-ballista-mithril.webp"
  },
  "war_machine.catapult": {
    name: "Mithril Catapult",
    text: "At the start of each Combat round you may pay 1 building material to deal 1 damage to each of any 2 targets you choose — they need not be adjacent.",
    cardImage: "/assets/war_machines-catapult-mithril.webp"
  },
  "war_machine.cannon": {
    name: "Mithril Cannon",
    text: "At the start of each Combat round you may spend 1 expert use to deal 2 damage to 1 enemy unit — 3 damage in even Combat rounds.",
    cardImage: "/assets/war_machines-cannon-mithril.webp"
  },
  "war_machine.lightning_generator": {
    name: "Mithril Lightning Generator",
    text: "At the start of each Combat round, deal 1 damage to an enemy unit of your choice — 2 damage in even Combat rounds.",
    cardImage: "/assets/war_machines-lightning_generator-mithril.webp"
  }
};

/** The Mithril face for a war-machine card a seat has forged, else undefined. */
export function mithrilWarMachineImage(cardId: string | undefined, forged: readonly string[] | undefined): string | undefined {
  if (!cardId || !forged?.includes(cardId)) {
    return undefined;
  }
  return MITHRIL_WAR_MACHINES[cardId]?.cardImage;
}

// ---------------------------------------------------------------------------
// Karmic Battles
// ---------------------------------------------------------------------------

/** Stack Tokens each guard gains in an empowered (karmic) fight. */
export const KARMIC_STACK_TOKENS = 1;
/** Treasure dice a karmic win rolls (on top of +gold = the field's difficulty). */
export const KARMIC_TREASURE_DICE = 1;

// ---------------------------------------------------------------------------
// Skill Combos
// ---------------------------------------------------------------------------

export type SkillComboDefinition = {
  id: string;
  name: string;
  /** The two Ability cards a seat must own (deck, hand, discard or in play). */
  requires: readonly [CardId, CardId];
  cardId: CardId;
};

/**
 * Nine combos. Every weak-alone Ability has a home: Tactics (3), each Basic X
 * Magic (1 each), Artillery + Ballistics (Siege Battery), Pathfinding
 * (Trailblazer), Scouting (Tailwind). Balance target: a little more than the
 * better of its two ingredients, paid for with two specific cards plus a deck
 * slot — never a mass effect lasting the whole combat on its Basic side except
 * Tailwind's +1 Initiative.
 */
export const SKILL_COMBOS: readonly SkillComboDefinition[] = [
  { id: "volley_formation", name: "Volley Formation", requires: ["ability.archery", "ability.tactics"], cardId: "combo.volley_formation" },
  { id: "tunnel_march", name: "Tunnel March", requires: ["ability.basic_earth_magic", "ability.logistics"], cardId: "combo.tunnel_march" },
  { id: "shield_wall", name: "Shield Wall", requires: ["ability.tactics", "ability.armorer"], cardId: "combo.shield_wall" },
  { id: "pincer_assault", name: "Pincer Assault", requires: ["ability.tactics", "ability.offense"], cardId: "combo.pincer_assault" },
  { id: "healing_tide", name: "Healing Tide", requires: ["ability.basic_water_magic", "ability.first_aid"], cardId: "combo.healing_tide" },
  { id: "tailwind", name: "Tailwind", requires: ["ability.basic_air_magic", "ability.scouting"], cardId: "combo.tailwind" },
  { id: "firebrand", name: "Firebrand", requires: ["ability.basic_fire_magic", "ability.offense"], cardId: "combo.firebrand" },
  { id: "siege_battery", name: "Siege Battery", requires: ["ability.artillery", "ability.ballistics"], cardId: "combo.siege_battery" },
  { id: "trailblazer", name: "Trailblazer", requires: ["ability.pathfinding", "ability.logistics"], cardId: "combo.trailblazer" }
];

const comboSource = {
  product: "Heroes 3 BG multi — WoG era module (Skill Combos, after ERA's Combo Skills)",
  credit: "Original combo card for the optional Skill Combos module; effects reuse engine-wired card effects."
};

const comboAssets = (slug: string, name: string) => ({
  cardImage: `/assets/abilities-combo-${slug}.webp`,
  imageAlt: `${name} combo ability card`
});

/**
 * The combo cards. Every effect below is an existing, engine-wired card effect
 * shape (Archery's CREATE_ACTIVE_EFFECT pair, Logistics' GAIN_HERO_MOVEMENT,
 * Logistics IV's player-scope modifiers, First Aid's HEAL_DAMAGE, the
 * DAMAGE_CHOSEN_ENEMIES specialty arm, Pathfinding's HERO_PATHFINDING and
 * Logistics' END_TURN_ADJACENT_MOVE modifiers) — no combo needs bespoke engine
 * code.
 */
export const wogEraComboCards: CardLibrary = {
  "combo.volley_formation": {
    id: "combo.volley_formation",
    name: "Volley Formation",
    kind: "ability",
    timing: "ongoing",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: [
      "ability",
      "combo",
      "ongoing",
      "ranged",
      "Combo (Archery + Tactics). Basic: this Combat round your ranged units get +1 Attack (adjacent targets too) and +2 Initiative. Expert: the same until the end of the next Combat round."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Volley Formation",
        scope: "player",
        duration: { type: "current-combat-round" },
        modifiers: [
          { type: "RANGED_ATTACK_BONUS", amount: 1, nonAdjacentOnly: false },
          { type: "RANGED_INITIATIVE_BONUS", amount: 2 }
        ]
      },
      expertEffect: {
        name: "Expert Volley Formation",
        scope: "player",
        duration: { type: "next-combat-round" },
        modifiers: [
          { type: "RANGED_ATTACK_BONUS", amount: 1, nonAdjacentOnly: false },
          { type: "RANGED_INITIATIVE_BONUS", amount: 2 }
        ]
      }
    },
    assets: comboAssets("volley_formation", "Volley Formation"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.tunnel_march": {
    id: "combo.tunnel_march",
    name: "Tunnel March",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "combo",
      "map",
      "Combo (Basic Earth Magic + Logistics). Basic: your Hero gains +1 Movement. Expert: your Hero gains +2 Movement."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Your hero gains +1 movement",
          mapOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 1 }
        },
        {
          label: "Expert: your hero gains +2 movement",
          mapOnly: true,
          expertOnly: true,
          effect: { type: "GAIN_HERO_MOVEMENT", amount: 2 }
        }
      ]
    },
    assets: comboAssets("tunnel_march", "Tunnel March"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.shield_wall": {
    id: "combo.shield_wall",
    name: "Shield Wall",
    kind: "ability",
    timing: "ongoing",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: [
      "ability",
      "combo",
      "ongoing",
      "defense",
      "Combo (Tactics + Armorer). Basic: all your units get +1 Defense this Combat round. Expert: the same until the end of the next Combat round."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Shield Wall",
        scope: "player",
        duration: { type: "current-combat-round" },
        modifiers: [{ type: "DEFENSE_BONUS", amount: 1 }]
      },
      expertEffect: {
        name: "Expert Shield Wall",
        scope: "player",
        duration: { type: "next-combat-round" },
        modifiers: [{ type: "DEFENSE_BONUS", amount: 1 }]
      }
    },
    assets: comboAssets("shield_wall", "Shield Wall"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.pincer_assault": {
    id: "combo.pincer_assault",
    name: "Pincer Assault",
    kind: "ability",
    timing: "ongoing",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: [
      "ability",
      "combo",
      "ongoing",
      "attack",
      "Combo (Tactics + Offense). Basic: all your units get +1 Attack this Combat round. Expert: the same until the end of the next Combat round."
    ],
    effect: {
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        name: "Pincer Assault",
        scope: "player",
        duration: { type: "current-combat-round" },
        modifiers: [{ type: "ATTACK_BONUS", amount: 1 }]
      },
      expertEffect: {
        name: "Expert Pincer Assault",
        scope: "player",
        duration: { type: "next-combat-round" },
        modifiers: [{ type: "ATTACK_BONUS", amount: 1 }]
      }
    },
    assets: comboAssets("pincer_assault", "Pincer Assault"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.healing_tide": {
    id: "combo.healing_tide",
    name: "Healing Tide",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "combat",
    tags: [
      "ability",
      "combo",
      "instant",
      "heal",
      "Combo (Basic Water Magic + First Aid). Basic: remove 2 damage from one of your units. Expert: remove 3 damage from one of your units."
    ],
    target: { type: "friendly-unit", damagedOnly: true },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove 2 damage from one of your units",
          combatOnly: true,
          effect: { type: "HEAL_DAMAGE", amount: 2 }
        },
        {
          label: "Expert: remove 3 damage from one of your units",
          combatOnly: true,
          expertOnly: true,
          effect: { type: "HEAL_DAMAGE", amount: 3 }
        }
      ]
    },
    assets: comboAssets("healing_tide", "Healing Tide"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.tailwind": {
    id: "combo.tailwind",
    name: "Tailwind",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "combat",
    tags: [
      "ability",
      "combo",
      "instant",
      "initiative",
      "Combo (Basic Air Magic + Scouting). Basic: all your units get +1 Initiative this Combat. Expert: all your units get +2 Initiative this Combat."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "+1 initiative to all your units this combat",
          combatOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Tailwind",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "INITIATIVE_BONUS", amount: 1 }]
            }
          }
        },
        {
          label: "Expert: +2 initiative to all your units this combat",
          combatOnly: true,
          expertOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Expert Tailwind",
              scope: "player",
              duration: { type: "combat" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "INITIATIVE_BONUS", amount: 2 }]
            }
          }
        }
      ]
    },
    assets: comboAssets("tailwind", "Tailwind"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.firebrand": {
    id: "combo.firebrand",
    name: "Firebrand",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: [
      "ability",
      "combo",
      "instant",
      "damage",
      "Combo (Basic Fire Magic + Offense). Basic: an enemy unit suffers 2 damage. Expert: an enemy unit suffers 3 damage."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "An enemy unit suffers 2 damage",
          combatOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 2 }
        },
        {
          label: "Expert: an enemy unit suffers 3 damage",
          combatOnly: true,
          expertOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 1, amount: 3 }
        }
      ]
    },
    assets: comboAssets("firebrand", "Firebrand"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.siege_battery": {
    id: "combo.siege_battery",
    name: "Siege Battery",
    kind: "ability",
    timing: "instant",
    phaseLimit: ["combat"],
    abilityClass: "might",
    tags: [
      "ability",
      "combo",
      "instant",
      "damage",
      "Combo (Artillery + Ballistics). Basic: choose 2 enemy units; each suffers 1 damage. Expert: choose 2 enemy units; each suffers 2 damage."
    ],
    target: { type: "none" },
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Choose 2 enemy units: 1 damage to each",
          combatOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 2, amount: 1 }
        },
        {
          label: "Expert: choose 2 enemy units: 2 damage to each",
          combatOnly: true,
          expertOnly: true,
          effect: { type: "DAMAGE_CHOSEN_ENEMIES", count: 2, amount: 2 }
        }
      ]
    },
    assets: comboAssets("siege_battery", "Siege Battery"),
    implementationStatus: "implemented",
    source: comboSource
  },
  "combo.trailblazer": {
    id: "combo.trailblazer",
    name: "Trailblazer",
    kind: "ability",
    timing: "instant",
    abilityClass: "adventure",
    tags: [
      "ability",
      "combo",
      "map",
      "Combo (Pathfinding + Logistics). Basic: this turn your Hero moves as with Expert Pathfinding (through Neutral & enemy Hero fields, over yellow borders & blocked fields — never ending on one) with no crown. Expert: the same, and at the end of your turn step to an adjacent empty field."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "This turn: Expert Pathfinding movement (no crown)",
          mapOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Trailblazer",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "HERO_PATHFINDING", expert: true }]
            }
          }
        },
        {
          label: "Expert: Expert Pathfinding movement, and step to an adjacent empty field at the end of your turn",
          mapOnly: true,
          expertOnly: true,
          effect: {
            type: "CREATE_ACTIVE_EFFECT",
            effect: {
              name: "Expert Trailblazer",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "HERO_PATHFINDING", expert: true }, { type: "END_TURN_ADJACENT_MOVE" }]
            }
          }
        }
      ]
    },
    assets: comboAssets("trailblazer", "Trailblazer"),
    implementationStatus: "implemented",
    source: comboSource
  }
};

/**
 * Every Skill Combo card id. Combo cards are FORGED (FORGE_SKILL_COMBO, Skill
 * Combos module), never shuffled into a draw deck or a sandbox well — the deck
 * coverage checks exclude them like the other never-decked module cards (still
 * addable in the sandbox via SANDBOX_ADD_CARD, which reads cardLibrary).
 */
export const wogEraComboCardIds: readonly string[] = Object.keys(wogEraComboCards);

export function skillComboById(comboId: string): SkillComboDefinition | undefined {
  return SKILL_COMBOS.find((combo) => combo.id === comboId);
}
