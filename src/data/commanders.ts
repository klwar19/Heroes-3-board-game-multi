/**
 * Wake of Gods Commanders — board-game content data (engine-consumed).
 *
 * This is the BINH board-game adaptation of the WoG commander system
 * (docs/wog-commanders-plan.md keeps the original PC-scale reference). The
 * engine wiring lives in src/engine/commanders.ts; behaviour is pinned by
 * src/engine/wog-commander-*.test.ts. Every field in here is consumed by
 * engine code or the card UI — no decorative data.
 *
 * Model summary:
 *  - One commander per faction. It joins every combat of its owner's MAIN
 *    hero while alive, as a real battlefield unit (no army card).
 *  - Six stats, each at grade 1..3 (values in COMMANDER_GRADE_VALUES). All
 *    stats start at grade 1. At hero level 3 and 6 (Paladin: 2 and 5 — Wise)
 *    the owner picks TWO DIFFERENT stats and raises each one grade.
 *  - The Magic stat grades the whole magic package: grade 1 = Power 0,
 *    take -1 Spell damage, immune to ongoing effects; grade 2 = Power 1;
 *    grade 3 = Power 2 and -2 Spell damage (immunity stays throughout).
 *  - Each commander has ONE command ability (a "cast"): usable once per
 *    combat round during the commander's own activation, free (does not end
 *    the activation), scaling with Power 0/1/2.
 *  - Each commander has ONE specialty (a passive engine rule).
 *  - Combos: both stats of a pair at grade 3 unlock an extra ability —
 *    Damage+Magic = Death Stare, Damage+Speed = Charge (+1 Attack after
 *    moving). Reaching two grade-3 stats takes all four grade-up picks.
 *  - Death is persistent: a commander killed in combat stays dead until the
 *    owner revives it for gold (2 + 2x hero level).
 */

export const COMMANDER_SLUGS = [
  "paladin", "hierophant", "temple_guardian", "succubus", "brute",
  "soul_eater", "ogre_leader", "shaman", "astral_spirit",
  "corsair", "factory", "bulwark"
] as const;

export type CommanderSlug = (typeof COMMANDER_SLUGS)[number];

/** The six gradeable commander stats. */
export const COMMANDER_STAT_KEYS = [
  "attack", "defense", "health", "damage", "magic", "speed"
] as const;
export type CommanderStatKey = (typeof COMMANDER_STAT_KEYS)[number];

export type CommanderGrade = 1 | 2 | 3;
export type CommanderGrades = Record<CommanderStatKey, CommanderGrade>;

export const COMMANDER_STAT_LABELS: Record<CommanderStatKey, string> = {
  attack: "Attack",
  defense: "Defense",
  health: "Health",
  damage: "Damage",
  magic: "Magic",
  speed: "Speed"
};

/**
 * Stat value at grade 1/2/3 (index grade-1).
 *  - attack/defense/health/speed are the unit's printed statistics
 *    (speed = Initiative).
 *  - damage is BONUS damage added to the commander's attacks that deal at
 *    least 1 damage (normal attacks and retaliations).
 *  - magic is the command-ability Power (0/1/2).
 */
export const COMMANDER_GRADE_VALUES: Record<CommanderStatKey, readonly [number, number, number]> = {
  attack: [2, 3, 4],
  defense: [1, 2, 3],
  health: [4, 6, 8],
  damage: [0, 1, 2],
  magic: [0, 1, 2],
  speed: [5, 6, 7]
};

/** Spell-damage reduction granted by the Magic stat at grade 1/2/3. */
export const COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION: readonly [number, number, number] = [1, 1, 2];

export const COMMANDER_ALL_GRADES_ONE: CommanderGrades = {
  attack: 1, defense: 1, health: 1, damage: 1, magic: 1, speed: 1
};

export function commanderStatValue(key: CommanderStatKey, grade: CommanderGrade): number {
  return COMMANDER_GRADE_VALUES[key][grade - 1];
}

/** Command-ability Power (0/1/2) at the given Magic grade. */
export function commanderPower(grades: Pick<CommanderGrades, "magic">): number {
  return commanderStatValue("magic", grades.magic);
}

/**
 * Hero levels at which the owner picks two different stats to grade up.
 * The Paladin's Wise specialty reaches each pick one hero level EARLIER.
 */
export const COMMANDER_GRADE_UP_LEVELS: readonly number[] = [3, 6];
export const COMMANDER_WISE_GRADE_UP_LEVELS: readonly number[] = [2, 5];

export function commanderGradeUpLevels(slug: CommanderSlug): readonly number[] {
  return slug === "paladin" ? COMMANDER_WISE_GRADE_UP_LEVELS : COMMANDER_GRADE_UP_LEVELS;
}

/** Reviving a dead commander costs gold scaling with the hero's level. */
export function commanderReviveCost(heroLevel: number): number {
  return 2 + 2 * Math.max(1, heroLevel);
}

// ---------------------------------------------------------------------------
// Combos — both stats of the pair at grade 3 unlock the extra ability.
// ---------------------------------------------------------------------------

export interface CommanderCombo {
  id: "death-stare" | "charge";
  name: string;
  requires: readonly [CommanderStatKey, CommanderStatKey];
  /** Unit ability id granted to the commander's combat unit. */
  abilityId: string;
  text: string;
}

export const COMMANDER_COMBOS: readonly CommanderCombo[] = [
  {
    id: "death-stare",
    name: "Death Stare",
    requires: ["damage", "magic"],
    abilityId: "gorgon-death-stare",
    text: 'Damage + Magic at grade 3: after the commander\'s attack, roll 2 Attack dice — on two "-1" results the target\'s Health drops to 0.'
  },
  {
    id: "charge",
    name: "Charge",
    requires: ["damage", "speed"],
    abilityId: "commander-charge",
    text: "Damage + Speed at grade 3: +1 Attack when the commander attacks after moving this activation."
  }
] as const;

export function commanderUnlockedCombos(grades: CommanderGrades): CommanderCombo[] {
  return COMMANDER_COMBOS.filter((combo) => combo.requires.every((key) => grades[key] >= 3));
}

// ---------------------------------------------------------------------------
// Command abilities (the once-per-combat-round cast).
// ---------------------------------------------------------------------------

export type CommanderTargetTier = "bronze" | "silver" | "gold";

export interface CommanderCastTargeting {
  side: "friendly" | "enemy";
  /** "ranged" = ranged units only; "melee" = non-ranged units only. */
  unitType?: "ranged" | "melee";
  /** Target must be a mechanical unit (Factory machines). */
  mechanical?: boolean;
  /** Target must carry at least 1 damage (heals). */
  damagedOnly?: boolean;
  /**
   * Highest target tier allowed at Power 0/1/2 (Animate Dead, Counterstrike).
   * Tierless targets (other commanders, bank guards, summons) never qualify.
   */
  maxTierByPower?: readonly [CommanderTargetTier, CommanderTargetTier, CommanderTargetTier];
  /** Below this Power the target must be adjacent to the commander. */
  adjacentBelowPower?: number;
  /** Runes spent from the owner's combat pool per Power tier (Rune Keeper). */
  runeCostByPower?: readonly [number, number, number];
  /**
   * Ongoing-effect buffs never land on the commander itself (its Magic grade 1
   * ongoing-effect immunity would fizzle them), so those casts exclude self.
   */
  canTargetSelf: boolean;
}

export type CommanderCastEffect =
  | { kind: "heal-cleanse"; healByPower: readonly [number, number, number]; cleanseFromPower: number }
  | { kind: "defense-buff"; amountByPower: readonly [number, number, number]; vs: "melee" | "all" }
  | { kind: "precision"; amountByPower: readonly [number, number, number] }
  | { kind: "attack-buff"; amountByPower: readonly [number, number, number] }
  | {
      kind: "fire-shield";
      damageByPower: readonly [number, number, number];
      durationByPower: readonly ["round" | "combat" | "two-rounds", "round" | "combat" | "two-rounds", "round" | "combat" | "two-rounds"];
    }
  | { kind: "heal"; healByPower: readonly [number, number, number] }
  | {
      kind: "initiative-shift";
      amountByPower: readonly [number, number, number];
      /** The shifted unit's Attack also changes vs slower/faster targets. */
      attackVs: "slower" | "faster";
      attackAmount: number;
    }
  | { kind: "unlimited-retaliation" };

export interface CommanderCastDefinition {
  /** Unit ability id carried by the commander's combat unit. */
  abilityId: string;
  name: string;
  /** Spell art used on the card face and in the cast prompt. */
  icon: string;
  targeting: CommanderCastTargeting;
  effect: CommanderCastEffect;
  /** Printed rules text per Power 0/1/2 (shown on the card, current tier highlighted). */
  tierText: readonly [string, string, string];
}

export interface CommanderSpecialtyDefinition {
  id:
    | "wise"
    | "first-aid"
    | "mana-magician"
    | "charming"
    | "soul-reformer"
    | "undead"
    | "ballista-master"
    | "superior-combat"
    | "pacifist"
    | "tinkerer"
    | "rune-ritual";
  name: string;
  text: string;
}

export interface CommanderDefinition {
  slug: CommanderSlug;
  name: string;
  faction: string;
  /** true for the three non-WoG originals (Cove/Factory/Bulwark). */
  original?: boolean;
  cast: CommanderCastDefinition;
  specialty: CommanderSpecialtyDefinition;
  /** Built card asset (frame + art only; name, abilities and stats are overlaid). */
  cardImage: string;
}

export const commanderDefinitions: Record<CommanderSlug, CommanderDefinition> = {
  paladin: {
    slug: "paladin", name: "Paladin", faction: "Castle",
    cast: {
      abilityId: "commander-cast-paladin",
      name: "Cure",
      icon: "/assets/spells-cure.webp",
      targeting: { side: "friendly", canTargetSelf: true },
      effect: { kind: "heal-cleanse", healByPower: [1, 1, 2], cleanseFromPower: 1 },
      tierText: [
        "Remove 1 damage from a friendly unit.",
        "Remove 1 damage from a friendly unit and remove its negative tokens and effects.",
        "Remove 2 damage from a friendly unit and remove its negative tokens and effects."
      ]
    },
    specialty: {
      id: "wise",
      name: "Wise",
      text: "The commander grades up early: the two grade-up picks arrive at hero level 2 and 5 (instead of 3 and 6)."
    },
    cardImage: "/assets/units-commander-paladin.webp"
  },
  hierophant: {
    slug: "hierophant", name: "Hierophant", faction: "Rampart",
    cast: {
      abilityId: "commander-cast-hierophant",
      name: "Shield",
      icon: "/assets/spells-shield.webp",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: { kind: "defense-buff", amountByPower: [1, 2, 3], vs: "melee" },
      tierText: [
        "A friendly unit gains +1 Defense against melee attacks this round.",
        "A friendly unit gains +2 Defense against melee attacks this round.",
        "A friendly unit gains +3 Defense against melee attacks this round."
      ]
    },
    specialty: {
      id: "first-aid",
      name: "First Aid Master",
      text: "After a combat: one of your bronze/silver units that died or flipped from Pack to Few may be restored (choose 1)."
    },
    cardImage: "/assets/units-commander-hierophant.webp"
  },
  temple_guardian: {
    slug: "temple_guardian", name: "Temple Guardian", faction: "Tower",
    cast: {
      abilityId: "commander-cast-temple_guardian",
      name: "Precision",
      icon: "/assets/spells-precision.webp",
      targeting: { side: "friendly", unitType: "ranged", canTargetSelf: false },
      effect: { kind: "precision", amountByPower: [1, 2, 3] },
      tierText: [
        "A friendly ranged unit gains +1 Attack and ignores all ranged penalties this round.",
        "A friendly ranged unit gains +2 Attack and ignores all ranged penalties this round.",
        "A friendly ranged unit gains +3 Attack and ignores all ranged penalties this round."
      ]
    },
    specialty: {
      id: "mana-magician",
      name: "Mana Magician",
      text: "Twice per combat, casting a Spell may exceed your per-round spell limit."
    },
    cardImage: "/assets/units-commander-temple_guardian.webp"
  },
  succubus: {
    slug: "succubus", name: "Succubus", faction: "Inferno",
    cast: {
      abilityId: "commander-cast-succubus",
      name: "Fire Shield",
      icon: "/assets/spells-fire_shield.webp",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: {
        kind: "fire-shield",
        damageByPower: [1, 1, 2],
        durationByPower: ["round", "combat", "two-rounds"]
      },
      tierText: [
        "A friendly unit gains a Fire Shield (melee attackers take 1 damage) for this round.",
        "A friendly unit gains a Fire Shield (melee attackers take 1 damage) for the whole combat.",
        "A friendly unit gains a Fire Shield (melee attackers take 2 damage) for two rounds."
      ]
    },
    specialty: {
      id: "charming",
      name: "Charming",
      text: "At the start of a combat against neutral units, one random enemy neutral unit (any tier) gains a Paralysis token."
    },
    cardImage: "/assets/units-commander-succubus.webp"
  },
  brute: {
    slug: "brute", name: "Brute", faction: "Dungeon",
    cast: {
      abilityId: "commander-cast-brute",
      name: "Bloodlust",
      icon: "/assets/spells-bloodlust.webp",
      targeting: { side: "friendly", unitType: "melee", canTargetSelf: false },
      effect: { kind: "attack-buff", amountByPower: [1, 2, 3] },
      tierText: [
        "A friendly melee unit anywhere gains +1 Attack this round.",
        "A friendly melee unit anywhere gains +2 Attack this round.",
        "A friendly melee unit anywhere gains +3 Attack this round."
      ]
    },
    specialty: {
      id: "soul-reformer",
      name: "Soul Reformer",
      text: "After each combat you win, gain 2 gold."
    },
    cardImage: "/assets/units-commander-brute.webp"
  },
  soul_eater: {
    slug: "soul_eater", name: "Soul Eater", faction: "Necropolis",
    cast: {
      abilityId: "commander-cast-soul_eater",
      name: "Animate Dead",
      icon: "/assets/spells-resurrection.webp",
      targeting: {
        side: "friendly",
        damagedOnly: true,
        maxTierByPower: ["bronze", "silver", "gold"],
        canTargetSelf: false
      },
      effect: { kind: "heal", healByPower: [2, 2, 2] },
      tierText: [
        "Remove 2 damage from a friendly bronze unit.",
        "Remove 2 damage from a friendly bronze or silver unit.",
        "Remove 2 damage from a friendly unit of any tier — even gold."
      ]
    },
    specialty: {
      id: "undead",
      name: "Undead",
      text: "The commander is undead: it can never gain a Paralysis token."
    },
    cardImage: "/assets/units-commander-soul_eater.webp"
  },
  ogre_leader: {
    slug: "ogre_leader", name: "Ogre Leader", faction: "Stronghold",
    cast: {
      abilityId: "commander-cast-ogre_leader",
      name: "Stone Skin",
      icon: "/assets/spells-stone_skin.webp",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: { kind: "defense-buff", amountByPower: [1, 2, 3], vs: "all" },
      tierText: [
        "A friendly unit gains +1 Defense against all attacks this round.",
        "A friendly unit gains +2 Defense against all attacks this round.",
        "A friendly unit gains +3 Defense against all attacks this round."
      ]
    },
    specialty: {
      id: "ballista-master",
      name: "Ballista Master",
      text: "Your Ballista's round-start shot targets an enemy unit of YOUR choice (instead of the lowest-initiative enemy)."
    },
    cardImage: "/assets/units-commander-ogre_leader.webp"
  },
  shaman: {
    slug: "shaman", name: "Shaman", faction: "Fortress",
    cast: {
      abilityId: "commander-cast-shaman",
      name: "Haste",
      icon: "/assets/spells-haste.webp",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: { kind: "initiative-shift", amountByPower: [2, 3, 4], attackVs: "slower", attackAmount: 1 },
      tierText: [
        "A friendly unit gains +2 Initiative and +1 Attack against slower units this round.",
        "A friendly unit gains +3 Initiative and +1 Attack against slower units this round.",
        "A friendly unit gains +4 Initiative and +1 Attack against slower units this round."
      ]
    },
    specialty: {
      id: "superior-combat",
      name: "Superior Combat",
      text: "At combat setup, choose +1 Attack or +1 Defense for the commander (applied at the start of each of its combats)."
    },
    cardImage: "/assets/units-commander-shaman.webp"
  },
  astral_spirit: {
    slug: "astral_spirit", name: "Astral Spirit", faction: "Conflux",
    cast: {
      abilityId: "commander-cast-astral_spirit",
      name: "Counterstrike",
      icon: "/assets/spells-counterstrike.webp",
      targeting: {
        side: "friendly",
        maxTierByPower: ["bronze", "silver", "gold"],
        canTargetSelf: false
      },
      effect: { kind: "unlimited-retaliation" },
      tierText: [
        "A friendly bronze unit may retaliate any number of times this round.",
        "A friendly bronze or silver unit may retaliate any number of times this round.",
        "A friendly unit of any tier — even gold — may retaliate any number of times this round."
      ]
    },
    specialty: {
      id: "pacifist",
      name: "Pacifist",
      text: "At the start of a combat against 2 or more neutral units, one random bronze/silver neutral flees the battlefield (no rewards for it)."
    },
    cardImage: "/assets/units-commander-astral_spirit.webp"
  },
  corsair: {
    slug: "corsair", name: "Sea Marshal", faction: "Cove", original: true,
    cast: {
      abilityId: "commander-cast-corsair",
      name: "Slow",
      icon: "/assets/spells-slow.webp",
      targeting: { side: "enemy", canTargetSelf: false },
      effect: { kind: "initiative-shift", amountByPower: [-2, -3, -4], attackVs: "faster", attackAmount: -1 },
      tierText: [
        "An enemy unit suffers -2 Initiative and -1 Attack against faster units this round.",
        "An enemy unit suffers -3 Initiative and -1 Attack against faster units this round.",
        "An enemy unit suffers -4 Initiative and -1 Attack against faster units this round."
      ]
    },
    specialty: {
      id: "superior-combat",
      name: "Battle Stance",
      text: "At combat setup, choose +1 Attack or +1 Defense for the commander (applied at the start of each of its combats)."
    },
    cardImage: "/assets/units-commander-corsair.webp"
  },
  factory: {
    slug: "factory", name: "Artificer", faction: "Factory", original: true,
    cast: {
      abilityId: "commander-cast-factory",
      name: "Field Repair",
      icon: "/assets/specialty-card/icon-ballista.webp",
      targeting: {
        side: "friendly",
        mechanical: true,
        damagedOnly: true,
        adjacentBelowPower: 2,
        canTargetSelf: false
      },
      effect: { kind: "heal", healByPower: [1, 2, 2] },
      tierText: [
        "Remove 1 damage from an adjacent friendly mechanical unit.",
        "Remove 2 damage from an adjacent friendly mechanical unit.",
        "Remove 2 damage from a friendly mechanical unit anywhere."
      ]
    },
    specialty: {
      id: "tinkerer",
      name: "Tinkerer",
      text: "War machines cost you 5 less gold (to a minimum of 0)."
    },
    cardImage: "/assets/units-commander-factory.webp"
  },
  bulwark: {
    slug: "bulwark", name: "Rune Keeper", faction: "Bulwark", original: true,
    cast: {
      abilityId: "commander-cast-bulwark",
      name: "Rune Mend",
      icon: "/assets/spells-frost_ring.webp",
      targeting: {
        side: "friendly",
        damagedOnly: true,
        runeCostByPower: [1, 2, 2],
        canTargetSelf: true
      },
      effect: { kind: "heal", healByPower: [1, 2, 3] },
      tierText: [
        "Spend 1 Rune: remove 1 damage from a friendly unit.",
        "Spend 2 Runes: remove 2 damage from a friendly unit.",
        "Spend 2 Runes: remove 3 damage from a friendly unit."
      ]
    },
    specialty: {
      id: "rune-ritual",
      name: "Rune Ritual",
      text: "Gain 1 Rune at the start of each combat."
    },
    cardImage: "/assets/units-commander-bulwark.webp"
  }
};

/** Faction id → commander slug (all 12 factions have exactly one commander). */
export const COMMANDER_SLUG_BY_FACTION: Record<string, CommanderSlug> = {
  castle: "paladin",
  rampart: "hierophant",
  tower: "temple_guardian",
  inferno: "succubus",
  dungeon: "brute",
  necropolis: "soul_eater",
  stronghold: "ogre_leader",
  fortress: "shaman",
  conflux: "astral_spirit",
  cove: "corsair",
  factory: "factory",
  bulwark: "bulwark"
};

export function commanderCastTierIndex(power: number): 0 | 1 | 2 {
  return power >= 2 ? 2 : power === 1 ? 1 : 0;
}
