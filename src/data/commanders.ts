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
 *  - Six stats, each at grade 0..3 (values in COMMANDER_GRADE_VALUES). All
 *    stats START at grade 0 (the base line). At hero level 2, 4 and 6
 *    (Paladin: 2, 3 and 5 — Wise) the owner picks TWO DIFFERENT stats and
 *    raises each one grade. A grade's bonus over the base is NOT additive
 *    with the previous grades — it IS the value shown (+1 / +2 at grade
 *    I/II; grade III is adjusted per spec: Attack +3, Health +4, Speed +5).
 *  - The Magic stat grades the whole magic package: grade 0 = Power 0,
 *    take -1 Spell damage, immune to ongoing effects; grade 1 = Power 1;
 *    grade 2 = Power 2 and -2 Spell damage; grade 3 = Power 3 and -3 Spell
 *    damage (the ongoing-effect immunity stays throughout).
 *  - Each commander has ONE command ability (a "cast"): usable once per
 *    combat round during the commander's own activation, free (does not end
 *    the activation), scaling with Power (tiers 0 / 1 / 2+).
 *  - Each commander has ONE specialty (a passive engine rule).
 *  - Combination skills (COMMANDER_COMBOS): every pair of the six stats
 *    unlocks one of the 15 WoG combination skills once ONE stat of the pair
 *    reaches grade 3 and the OTHER at least grade 2.
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

export type CommanderGrade = 0 | 1 | 2 | 3;
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
 * Stat value at grade 0/1/2/3 (index = grade). Grade 0 is the starting base
 * line; each grade's bonus over that base REPLACES the previous grade's
 * bonus (+1 / +2 at grade I/II, grade III adjusted per the module spec:
 * Attack +3, Health +4, Speed +5).
 *  - attack/defense/health/speed are the unit's printed statistics
 *    (speed = Initiative).
 *  - damage is BONUS damage added to the commander's attacks that deal at
 *    least 1 damage (normal attacks and retaliations).
 *  - magic is the command-ability Power (0/1/2/3; cast tiers cap at 2).
 */
export const COMMANDER_GRADE_VALUES: Record<CommanderStatKey, readonly [number, number, number, number]> = {
  attack: [2, 3, 4, 5],
  defense: [1, 2, 3, 4],
  health: [4, 5, 6, 8],
  damage: [0, 1, 2, 3],
  magic: [0, 1, 2, 3],
  speed: [5, 6, 7, 10]
};

/** Spell-damage reduction granted by the Magic stat at grade 0/1/2/3. */
export const COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION: readonly [number, number, number, number] = [1, 1, 2, 3];

export const COMMANDER_ALL_GRADES_ZERO: CommanderGrades = {
  attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0
};

export function commanderStatValue(key: CommanderStatKey, grade: CommanderGrade): number {
  return COMMANDER_GRADE_VALUES[key][grade];
}

/** Command-ability Power (0..3) at the given Magic grade. */
export function commanderPower(grades: Pick<CommanderGrades, "magic">): number {
  return commanderStatValue("magic", grades.magic);
}

/**
 * Hero levels at which the owner picks two different stats to grade up.
 * The Paladin's Wise specialty reaches the later picks EARLIER (2/3/5).
 * Three picks x two stats = 6 raises: enough to take one stat to grade 3
 * and its combo partner to grade 2 (a combination skill) with one to spare.
 */
export const COMMANDER_GRADE_UP_LEVELS: readonly number[] = [2, 4, 6];
export const COMMANDER_WISE_GRADE_UP_LEVELS: readonly number[] = [2, 3, 5];

export function commanderGradeUpLevels(slug: CommanderSlug): readonly number[] {
  return slug === "paladin" ? COMMANDER_WISE_GRADE_UP_LEVELS : COMMANDER_GRADE_UP_LEVELS;
}

/** Reviving a dead commander costs gold scaling with the hero's level. */
export function commanderReviveCost(heroLevel: number): number {
  return 2 + 2 * Math.max(1, heroLevel);
}

// ---------------------------------------------------------------------------
// Combination skills — the 15 WoG secondary skills, one per stat pair
// (docs/wog-commanders-plan.md §5, board-game adapted). A combo unlocks once
// ONE stat of its pair reaches grade 3 and the OTHER at least grade 2.
// ---------------------------------------------------------------------------

export interface CommanderCombo {
  id: string;
  /** The WoG one-letter tag (docs/wog-commanders-plan.md §5). */
  tag: string;
  name: string;
  requires: readonly [CommanderStatKey, CommanderStatKey];
  /**
   * Unit ability id granted to the commander's combat unit — null only for
   * Sharpshooter, which is wired as the unit's type flipping to "ranged" in
   * makeCommanderCombatUnit (there is no ability tag for a type).
   */
  abilityId: string | null;
  /** HoMM3 spell icon for the skill (scripts/fetch-commander-spell-icons.py). */
  icon: string;
  text: string;
}

export const COMMANDER_COMBOS: readonly CommanderCombo[] = [
  {
    id: "no-retaliation",
    tag: "N",
    name: "No Enemy Retaliation",
    requires: ["attack", "magic"],
    abilityId: "ignores-retaliation",
    icon: "/assets/spell-icons/forgetfulness.png",
    text: "Attacks by the commander never provoke a Retaliation Attack."
  },
  {
    id: "can-shoot",
    tag: "S",
    name: "Sharpshooter",
    requires: ["attack", "speed"],
    abilityId: null,
    icon: "/assets/spell-icons/magic_arrow.png",
    text: "The commander becomes a ranged unit: it may attack from anywhere (normal ranged penalties apply)."
  },
  {
    id: "max-damage",
    tag: "M",
    name: "Mighty Blow",
    requires: ["attack", "damage"],
    abilityId: "commander-max-damage",
    icon: "/assets/spell-icons/frenzy.png",
    text: 'The commander\'s own Attack die always counts as "+1" (maximum damage).'
  },
  {
    id: "endless-retaliation",
    tag: "E",
    name: "Endless Retaliation",
    requires: ["defense", "health"],
    abilityId: "unlimited-retaliation",
    icon: "/assets/spell-icons/counterstrike.png",
    text: "The commander may retaliate any number of times each combat round."
  },
  {
    id: "crushing-strike",
    tag: "D",
    name: "Crushing Strike",
    requires: ["attack", "defense"],
    abilityId: "commander-defense-crush",
    icon: "/assets/spell-icons/disrupting_ray.png",
    text: "The commander's attacks reduce the target's Defense by 2 (to a minimum of 0)."
  },
  {
    id: "fearsome",
    tag: "O",
    name: "Fearsome",
    requires: ["attack", "health"],
    abilityId: "commander-fearsome",
    icon: "/assets/spell-icons/sorrow.png",
    text: 'On a "-1" on the commander\'s Attack die, the target is frozen by fear — it gains Paralysis.'
  },
  {
    id: "strike-all",
    tag: "A",
    name: "Whirlwind Strike",
    requires: ["defense", "damage"],
    abilityId: "commander-strike-all",
    icon: "/assets/spell-icons/fireball.png",
    text: "After its attack, the commander also attacks every other adjacent enemy (these extra attacks never provoke Retaliation)."
  },
  {
    id: "fire-shield",
    tag: "I",
    name: "Fire Shield",
    requires: ["defense", "magic"],
    abilityId: "commander-fire-shield",
    icon: "/assets/spell-icons/fire_shield.png",
    text: "Permanent Fire Shield: an adjacent attacker takes 1 damage after attacking the commander."
  },
  {
    id: "block",
    tag: "B",
    name: "Block",
    requires: ["defense", "speed"],
    abilityId: "commander-block",
    icon: "/assets/spell-icons/force_field.png",
    text: 'When the commander is attacked, roll an Attack die — on "-1" the attack\'s damage is fully blocked.'
  },
  {
    id: "double-strike",
    tag: "2",
    name: "Double Strike",
    requires: ["health", "damage"],
    abilityId: "commander-double-strike",
    icon: "/assets/spell-icons/slayer.png",
    text: "After the target retaliates (if it can), the commander strikes it once more; the extra attack never provokes Retaliation."
  },
  {
    id: "paralyze",
    tag: "P",
    name: "Paralyzing Touch",
    requires: ["health", "magic"],
    abilityId: "commander-paralyze",
    icon: "/assets/spell-icons/blind.png",
    text: 'After the commander\'s attack, roll an Attack die — on "0" the target gains Paralysis.'
  },
  {
    id: "regeneration",
    tag: "R",
    name: "Regeneration",
    requires: ["health", "speed"],
    abilityId: "commander-regeneration",
    icon: "/assets/spell-icons/resurrection.png",
    text: "The commander removes 1 damage at the start of each of its activations."
  },
  {
    id: "death-stare",
    tag: "G",
    name: "Death Stare",
    requires: ["damage", "magic"],
    abilityId: "gorgon-death-stare",
    icon: "/assets/spell-icons/death_ripple.png",
    text: 'After the commander\'s attack, roll 2 Attack dice — two "-1" results drop the target\'s Health to 0.'
  },
  {
    id: "battle-teleport",
    tag: "F",
    name: "Battle Teleport",
    requires: ["magic", "speed"],
    abilityId: "teleport-move",
    icon: "/assets/spell-icons/teleport.png",
    text: "As its regular movement, the commander may move to ANY empty space on the battlefield."
  },
  {
    id: "charge",
    tag: "C",
    name: "Charge",
    requires: ["damage", "speed"],
    abilityId: "commander-charge",
    icon: "/assets/spell-icons/haste.png",
    text: "+1 Attack when the commander attacks after moving this activation."
  }
] as const;

/** A combo unlocks with ONE stat of its pair at grade 3 and the other at 2+. */
export function commanderComboUnlocked(grades: CommanderGrades, combo: CommanderCombo): boolean {
  const [first, second] = combo.requires;
  const a = grades[first];
  const b = grades[second];
  return (a >= 3 && b >= 2) || (b >= 3 && a >= 2);
}

export function commanderUnlockedCombos(grades: CommanderGrades): CommanderCombo[] {
  return COMMANDER_COMBOS.filter((combo) => commanderComboUnlocked(grades, combo));
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
      icon: "/assets/spell-icons/cure.png",
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
      text: "The commander grades up early: the grade-up picks arrive at hero level 2, 3 and 5 (instead of 2, 4 and 6)."
    },
    cardImage: "/assets/units-commander-paladin.webp"
  },
  hierophant: {
    slug: "hierophant", name: "Hierophant", faction: "Rampart",
    cast: {
      abilityId: "commander-cast-hierophant",
      name: "Shield",
      icon: "/assets/spell-icons/shield.png",
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
      icon: "/assets/spell-icons/precision.png",
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
      icon: "/assets/spell-icons/fire_shield.png",
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
      icon: "/assets/spell-icons/bloodlust.png",
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
      icon: "/assets/spell-icons/animate_dead.png",
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
      icon: "/assets/spell-icons/stone_skin.png",
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
      icon: "/assets/spell-icons/haste.png",
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
      icon: "/assets/spell-icons/counterstrike.png",
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
      icon: "/assets/spell-icons/slow.png",
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
      icon: "/assets/spell-icons/cure.png",
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
      icon: "/assets/spell-icons/sacrifice.png",
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
