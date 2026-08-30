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
 *    stats START at grade 0 (the base line). Each hero level-up awards the
 *    commander stat POINTS to spend (one point raises one stat by one grade,
 *    max grade 3): every level-up gives 1 point, and the two "milestone"
 *    levels give 2 (levels 3 & 6 for everyone; the Castle Paladin's Wise
 *    milestones are levels 2 & 5). A grade's bonus over the base is NOT
 *    additive with the previous grades — it IS the value shown (+1 / +2 at
 *    grade I/II; grade III is adjusted per spec: Attack +3, Health +4, Speed +5).
 *  - Defense is the exception: base line 1/2/2/3, and grade II additionally
 *    grants a permanent Defense token (the commander rolls the Defend die when
 *    attacked → +1 Defense on a "+1" face). Grade III is a reliable flat 3
 *    with no die (see commanderAbilityIds / the DEFEND spec).
 *  - Damage is a DICE bonus, not a flat one: at Damage grade N the commander
 *    rolls N ADDITIONAL attack dice alongside its normal attack die on each of
 *    its attacks; every extra "+1" face raises the attack, and at most one "−1"
 *    face counts (see the Might wiring in reducer.ts / getMightDiceCount).
 *  - The Magic stat grades the whole magic package per the module spec:
 *    grade 0 = Power 0 and NOTHING else (only the once-per-round cast itself);
 *    grade 1 = Power 0, take -1 Spell damage, immune to ongoing effects;
 *    grade 2 = Power 1 (keeps -1 Spell damage + ongoing immunity);
 *    grade 3 = Power 2, take -3 Spell damage, immune to ongoing effects.
 *    The spell ward and the ongoing-effect immunity begin at grade 1 — a
 *    grade-0 commander is NOT immune and takes full Spell damage.
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
  "corsair", "factory", "bulwark", "ruler", "sword_saint", "might_guy", "belfast",
  "demon_ancestor",
  "kyousuke_natsume",
  "ibuki",
  "sonya"
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
 * The authentic WoG commander-skill symbols, downloaded from the reference page
 * (heroesofmightandmagic.com/wakeofgods/comm3.shtml → pics/comds). Used by the
 * combat "commander stats" UI — NOT the card face (which keeps the HoMM3 spell
 * icons). One 70×70 glyph per primary stat.
 */
export const COMMANDER_STAT_ICON: Record<CommanderStatKey, string> = {
  attack: "/assets/commander-icons/stat-attack.jpg",
  defense: "/assets/commander-icons/stat-defense.jpg",
  health: "/assets/commander-icons/stat-health.jpg",
  damage: "/assets/commander-icons/stat-damage.jpg",
  magic: "/assets/commander-icons/stat-magic.jpg",
  speed: "/assets/commander-icons/stat-speed.jpg"
};

/**
 * The WoG combination-skill symbol for a combo, keyed by its one-letter `tag`
 * (the same tag the reference page marks it with in battle). Downloaded from
 * pics/comds/_XX_YY.jpg into /assets/commander-icons/combo-<tag>.jpg.
 */
export function commanderComboSiteIcon(tag: string): string {
  return `/assets/commander-icons/combo-${tag}.jpg`;
}

/**
 * Stat value at grade 0/1/2/3 (index = grade). Grade 0 is the starting base
 * line; each grade's bonus over that base REPLACES the previous grade's
 * bonus (+1 / +2 at grade I/II, grade III adjusted per the module spec:
 * Attack +3, Health +4, Speed +5).
 *  - attack/health/speed are the unit's printed statistics (speed = Initiative).
 *  - defense is the printed Defense (1/2/2/3); grade II ALSO grants a Defense
 *    token — the "+1 def when attacked" rider (commanderAbilityIds wires
 *    `commander-defense-token`), grade III is the reliable flat 3.
 *  - damage is the NUMBER OF ADDITIONAL attack dice the commander rolls on each
 *    of its attacks (0/1/2/3). It is not a flat damage bonus — see the Might
 *    dice pool in reducer.ts (every extra "+1" raises the attack; at most one
 *    "−1" counts).
 *  - magic is the command-ability Power. Per the module spec the Power ladder
 *    is 0/0/1/2 (grade 1 buys the defensive package, not Power; grade 2 is the
 *    first Power step, grade 3 the top). Cast tiers cap at Power 2.
 */
export const COMMANDER_GRADE_VALUES: Record<CommanderStatKey, readonly [number, number, number, number]> = {
  attack: [2, 3, 4, 5],
  defense: [1, 2, 2, 3],
  health: [4, 5, 6, 8],
  damage: [0, 1, 2, 3],
  magic: [0, 0, 1, 2],
  speed: [5, 6, 7, 10]
};

/**
 * Defense grade that grants the "+1 def when attacked" Defense token (the
 * commander rolls the Defend die when attacked). Exactly grade II — grade III
 * is a reliable flat 3 with no die. Consumed by commanderAbilityIds and the
 * stats UI so the single source of truth is here.
 */
export const COMMANDER_DEFENSE_TOKEN_GRADE = 2;

/**
 * Spell-damage reduction granted by the Magic stat at grade 0/1/2/3. Per the
 * module spec grade 0 grants NONE (0); the ward begins at grade 1 (-1), holds
 * at grade 2 (-1) and jumps to grade 3 (-3). A 0 means no `reduce-spell-damage`
 * ability is wired at all (the commander takes full Spell damage).
 */
export const COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION: readonly [number, number, number, number] = [0, 1, 1, 3];

/**
 * The Magic grade at (and above) which the commander is immune to ongoing
 * effects (the titan-style ward). Per the module spec a grade-0 Magic commander
 * is NOT immune — the immunity is part of the grade-1 package. Consumed by
 * commanderAbilityIds and the stats UI so the single source of truth is here.
 */
export const COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE = 1;

/** Whether a commander at the given Magic grade is immune to ongoing effects. */
export function commanderMagicImmuneToOngoing(magicGrade: number): boolean {
  return magicGrade >= COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE;
}

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
 * Every hero level-up awards the commander stat POINTS to spend (one point
 * raises one stat by one grade). A normal level-up gives 1 point; a "milestone"
 * level gives 2. Milestones are levels 3 & 6 for everyone EXCEPT the Castle
 * Paladin, whose Wise specialty (a) pulls the two milestone points EARLIER to
 * levels 2 & 5 AND (b) adds a THIRD milestone at level 7. So a full run to level
 * 7 is 8 points for everyone else but 9 for the Paladin (its level-7 double) —
 * enough to take one stat to grade 3 (3 points) and its combo partner to
 * grade 2 (2 points) with room to spare.
 */
export const COMMANDER_DOUBLE_POINT_LEVELS: readonly number[] = [3, 6];
export const COMMANDER_WISE_DOUBLE_POINT_LEVELS: readonly number[] = [2, 5, 7];

/** The two milestone (2-point) level-ups for a commander. */
export function commanderDoublePointLevels(slug: CommanderSlug): readonly number[] {
  return slug === "paladin" ? COMMANDER_WISE_DOUBLE_POINT_LEVELS : COMMANDER_DOUBLE_POINT_LEVELS;
}

/**
 * Stat points a commander earns when its hero reaches `level`:
 *  - level < 2 (the starting level): 0 (no level-up happened);
 *  - a milestone level (see commanderDoublePointLevels): 2;
 *  - any other level-up: 1.
 */
export function commanderGradePointsForLevelUp(slug: CommanderSlug, level: number): number {
  if (level < 2) {
    return 0;
  }
  return commanderDoublePointLevels(slug).includes(level) ? 2 : 1;
}

/**
 * A commander stat can only be raised to grade 3 — "mastery" — once its main
 * hero has reached this level. Grades 1 and 2 have no level requirement; only
 * the final grade-2 → grade-3 raise waits for level 5. (A raise TO grade 3 is
 * the 2 → 3 step, so the gate keys off the stat currently sitting at grade 2.)
 */
export const COMMANDER_MASTERY_MIN_HERO_LEVEL = 5;

/**
 * Whether a commander stat may be raised from `currentGrade` to the next grade
 * given the hero's `heroLevel`. Only the step INTO grade 3 (from grade 2) is
 * gated — it needs level `COMMANDER_MASTERY_MIN_HERO_LEVEL`+. Everything else is
 * bounded only by the grade cap (3).
 */
export function commanderCanRaiseGrade(currentGrade: number, heroLevel: number): boolean {
  if (currentGrade >= 3) {
    return false;
  }
  if (currentGrade === 2 && heroLevel < COMMANDER_MASTERY_MIN_HERO_LEVEL) {
    return false;
  }
  return true;
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
    text: "The commander removes 2 damage at the start of each of its activations."
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
  /** Target must already have completed its activation this combat round. */
  activatedOnly?: boolean;
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
      durationByPower?: readonly ["round" | "combat", "round" | "combat", "round" | "combat"];
      /** Omit to make the Attack modifier unconditional. */
      attackVs?: "slower" | "faster";
      attackAmount: number;
    }
  | { kind: "unlimited-retaliation" }
  | { kind: "reactivate" }
  | {
      /**
       * Belfast "Royal Salvo" (2026-07 Azur Lane upgrade): flat EFFECT damage
       * to an ENEMY unit — the module's first offensive command. Effect damage
       * is not an attack or a Spell: no Retaliation, not reduced by Defense,
       * not subject to per-attack damage caps, and NOT reduced by spell wards;
       * a lethal salvo routes through the normal removal path. Instant (not an
       * ongoing effect), so ongoing-effect immunity never blocks it.
       */
      kind: "enemy-damage";
      damageByPower: readonly [number, number, number];
    };

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
    | "vanguard-marshal"
    | "elemental-scourge"
    | "tinkerer"
    | "rune-ritual"
    | "mission-briefing"
    | "unbreakable-bond";
  name: string;
  text: string;
}

/**
 * Superior Combat stance (Shaman): the chosen +1 Attack/Defense applies only
 * during combat rounds 1..COMMANDER_STANCE_MAX_ROUND of each combat; from the
 * next round on the commander fights without it. A single source of truth so the
 * engine's live fold (commanderLiveAttackBonus / commanderLiveDefenseBonus) and
 * the printed text agree.
 */
export const COMMANDER_STANCE_MAX_ROUND = 2;

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

export const IBUKI_COMMAND_SKILLS = [
  { id: "commander-ibuki-sniper-shot", name: "Sniper Shot", ap: 1, icon: "/assets/anime/icons/blue-archive/ibuki-sniper-shot.webp", text: "Deal 1 flat damage to an enemy unit; at Power 2, deal 2 instead." },
  { id: "commander-ibuki-up-to-mischief", name: "Up to Mischief", ap: 2, icon: "/assets/anime/icons/blue-archive/ibuki-up-to-mischief.webp", text: "An enemy has −1 Attack this combat round; at Power 1+, it also has −1 Defense." },
  { id: "commander-ibuki-gadabout", name: "Gadabout", ap: 2, icon: "/assets/anime/icons/blue-archive/ibuki-gadabout.webp", text: "Teleport anywhere; enemies adjacent to the landing space take 1 damage." },
  { id: "commander-cast-executive-order", name: "Executive Order", ap: 3, icon: "/assets/anime/icons/blue-archive/ibuki-executive-order.webp", text: "Reactivate an ally that already activated: Bronze at Power 0, up to Silver at Power 1, or any tier at Power 2. Silver and Gold have −2 Attack for that extra activation." }
] as const;

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
      text: "The commander earns its milestone points early AND gains an extra one: the two-point level-ups are hero level 2 & 5 (instead of 3 & 6), and it earns a third two-point milestone at level 7."
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
      // INSTANT REACTION (not an activation cast): play when one of your units is
      // attacked in melee, before damage — the attacked unit gains the Defense.
      tierText: [
        "Instant reaction: when your unit is attacked in melee, it gains +1 Defense vs melee this round.",
        "Instant reaction: when your unit is attacked in melee, it gains +2 Defense vs melee this round.",
        "Instant reaction: when your unit is attacked in melee, it gains +3 Defense vs melee this round."
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
      // Power ladder (user spec): Pow 0 = +1 but the ranged unit must be
      // adjacent to the commander; Pow 1 = +1 anywhere; Pow 2 = +2 anywhere.
      // Always for THIS round only. The "ignore ranged penalties" rider stays.
      targeting: { side: "friendly", unitType: "ranged", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "precision", amountByPower: [1, 1, 2] },
      tierText: [
        "A friendly ranged unit ADJACENT to the commander gains +1 Attack and ignores all ranged penalties this round.",
        "A friendly ranged unit anywhere gains +1 Attack and ignores all ranged penalties this round.",
        "A friendly ranged unit anywhere gains +2 Attack and ignores all ranged penalties this round."
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
      // Power ladder (user spec): Pow 0 = +1 but the melee unit must be adjacent
      // to the commander; Pow 1 = +1 anywhere; Pow 2 = +2 anywhere. Always for
      // THIS round only.
      targeting: { side: "friendly", unitType: "melee", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "attack-buff", amountByPower: [1, 1, 2] },
      tierText: [
        "A friendly melee unit ADJACENT to the commander gains +1 Attack this round.",
        "A friendly melee unit anywhere gains +1 Attack this round.",
        "A friendly melee unit anywhere gains +2 Attack this round."
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
      // INSTANT REACTION (not an activation cast): play when one of your units is
      // attacked (melee OR ranged), before damage — the attacked unit gains the Defense.
      tierText: [
        "Instant reaction: when your unit is attacked, it gains +1 Defense vs all attacks this round.",
        "Instant reaction: when your unit is attacked, it gains +2 Defense vs all attacks this round.",
        "Instant reaction: when your unit is attacked, it gains +3 Defense vs all attacks this round."
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
      effect: {
        kind: "initiative-shift",
        amountByPower: [2, 6, 9],
        durationByPower: ["round", "round", "combat"],
        attackAmount: 1
      },
      tierText: [
        "A friendly unit gains +2 Initiative and +1 Attack this round.",
        "A friendly unit gains +6 Initiative and +1 Attack this round.",
        "A friendly unit gains +9 Initiative and +1 Attack for the whole combat."
      ]
    },
    specialty: {
      id: "superior-combat",
      name: "Superior Combat",
      text: "Outside combat, choose +1 Attack or +1 Defense for the commander. The stance applies ONLY during combat rounds 1-2; from round 3 the commander fights without it."
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
      id: "elemental-scourge",
      name: "Elemental Scourge",
      text: "At the start of a combat against neutral units, every enemy neutral unit takes 1 damage."
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
      id: "vanguard-marshal",
      name: "Vanguard Marshal",
      text: "At combat setup you may sort the commander together with allied units in your deployment zone. During combat round 1, once it reaches your FRONT LINE (the row nearest the enemy), it has +1 Attack for the rest of that round, even after moving away."
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
      text: "Gain +1 Rune every time the commander MOVES, and +1 Rune every time it is attacked."
    },
    cardImage: "/assets/units-commander-bulwark.webp"
  },
  ruler: {
    slug: "ruler", name: "Astral Regent", faction: "Fuyuki City", original: true,
    cast: {
      abilityId: "commander-cast-brute",
      name: "Command Seal",
      icon: "/assets/spell-icons/bloodlust.png",
      targeting: { side: "friendly", unitType: "melee", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "attack-buff", amountByPower: [1, 1, 2] },
      tierText: [
        "A nearby allied melee Servant gains +1 Attack this round.",
        "An allied melee Servant anywhere gains +1 Attack this round.",
        "An allied melee Servant anywhere gains +2 Attack this round."
      ]
    },
    specialty: {
      id: "vanguard-marshal",
      name: "Unbroken Contract",
      text: "At combat setup you may sort the Regent together with allied units in your deployment zone. During combat round 1, once the Regent reaches your front line, it has +1 Attack for the rest of that round, even after moving away."
    },
    cardImage: "/assets/units-commander-ruler.webp"
  },
  sword_saint: {
    slug: "sword_saint", name: "Sword Saint", faction: "Azure Breeze Sect", original: true,
    cast: {
      abilityId: "commander-cast-temple_guardian",
      name: "Sword Intent",
      icon: "/assets/spell-icons/precision.png",
      targeting: { side: "friendly", unitType: "ranged", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "precision", amountByPower: [1, 1, 2] },
      tierText: [
        "A nearby allied ranged disciple gains +1 Attack and ignores ranged penalties this round.",
        "An allied ranged disciple anywhere gains +1 Attack and ignores ranged penalties this round.",
        "An allied ranged disciple anywhere gains +2 Attack and ignores ranged penalties this round."
      ]
    },
    specialty: {
      id: "superior-combat",
      name: "One With the Blade",
      text: "Choose +1 Attack or +1 Defense before combat; the stance lasts through rounds 1–2."
    },
    cardImage: "/assets/units-commander-sword_saint.webp"
  },
  might_guy: {
    slug: "might_guy", name: "Might Guy", faction: "Hidden Leaf Village", original: true,
    // Cast: REUSE the Fortress Shaman's Haste arm verbatim (commander-cast-shaman,
    // initiative-shift). Reusing a cast abilityId across commanders is established
    // (ruler → commander-cast-brute, sword_saint → commander-cast-temple_guardian).
    cast: {
      abilityId: "commander-cast-shaman",
      name: "Body Flicker",
      icon: "/assets/spell-icons/haste.png",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: {
        kind: "initiative-shift",
        amountByPower: [2, 6, 9],
        durationByPower: ["round", "round", "combat"],
        attackAmount: 1
      },
      tierText: [
        "A friendly unit gains +2 Initiative and +1 Attack this round.",
        "A friendly unit gains +6 Initiative and +1 Attack this round.",
        "A friendly unit gains +9 Initiative and +1 Attack for the whole combat."
      ]
    },
    // Specialty: REUSE `superior-combat` (owner-picked stance) — the sword_saint /
    // shaman precedent proves the id need not be unique per slug.
    specialty: {
      id: "superior-combat",
      name: "Eight Gates",
      text: "Choose +1 Attack or +1 Defense before combat; the stance lasts through rounds 1–2."
    },
    cardImage: "/assets/units-commander-might_guy.webp"
  },
  belfast: {
    slug: "belfast", name: "Belfast", faction: "Azur Lane Naval Base", original: true,
    // Cast: "Royal Salvo" — the module's BESPOKE offensive command (2026-07
    // upgrade; was a Precision reuse). The new `enemy-damage` kind deals flat
    // EFFECT damage to an enemy unit (adjacent below Power 1, anywhere from
    // Power 1, 2 damage at Power 2) — resolveCommanderCast's enemy-damage
    // branch, pinned in wog-commander-casts.test.ts ("Royal Salvo").
    cast: {
      abilityId: "commander-cast-belfast",
      name: "Royal Salvo",
      icon: "/assets/anime/icons/azur-lane/commander-royal-salvo.webp",
      targeting: { side: "enemy", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "enemy-damage", damageByPower: [1, 1, 2] },
      tierText: [
        "Deal 1 damage to an enemy unit adjacent to the commander (no Retaliation, ignores Defense).",
        "Deal 1 damage to an enemy unit anywhere (no Retaliation, ignores Defense).",
        "Deal 2 damage to an enemy unit anywhere (no Retaliation, ignores Defense)."
      ]
    },
    // Specialty: REUSE `first-aid` (post-combat restoration) — the SAME id the
    // Rampart Hierophant carries, so the first-aid window (keyed off the
    // specialty id, not the slug) opens for Belfast too.
    specialty: {
      id: "first-aid",
      name: "Impeccable Service",
      text: "After a combat: one of your bronze/silver units that died or flipped from Pack to Few may be restored (choose 1)."
    },
    cardImage: "/assets/units-commander-belfast.webp"
  },
  demon_ancestor: {
    slug: "demon_ancestor", name: "Demon Ancestor", faction: "Heavenly Demon Palace", original: true,
    // Cast: REUSE the Dungeon Brute's Bloodlust arm verbatim (commander-cast-brute,
    // attack-buff melee) — the SAME abilityId the Fuyuki Regent (ruler) already
    // reuses, so reusing a cast abilityId across commanders is established.
    cast: {
      abilityId: "commander-cast-brute",
      name: "Blood Frenzy",
      icon: "/assets/spell-icons/bloodlust.png",
      targeting: { side: "friendly", unitType: "melee", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "attack-buff", amountByPower: [1, 1, 2] },
      tierText: [
        "A nearby allied melee demon-cultivator gains +1 Attack this round.",
        "An allied melee demon-cultivator anywhere gains +1 Attack this round.",
        "An allied melee demon-cultivator anywhere gains +2 Attack this round."
      ]
    },
    // Specialty: REUSE `undead` (Paralysis-token immunity) — the SAME id the
    // Necropolis Soul Eater carries. The engine gate keys off the specialty id
    // (not the "soul_eater" slug), the Belfast first-aid precedent — so the
    // paralysis immunity applies to the Demon Ancestor too. Thematically the
    // demon-blood body cannot be petrified.
    specialty: {
      id: "undead",
      name: "Undying Demon Body",
      text: "The commander's demon-forged corpse is beyond fear: it can never gain a Paralysis token."
    },
    cardImage: "/assets/units-commander-demon_ancestor.webp"
  },
  kyousuke_natsume: {
    slug: "kyousuke_natsume", name: "Kyousuke Natsume", faction: "Little Busters Campus", original: true,
    cast: {
      abilityId: "commander-cast-hierophant",
      name: "Mission Start",
      icon: "/assets/anime/icons/little-busters/rank-shared.webp",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: { kind: "defense-buff", amountByPower: [1, 2, 3], vs: "melee" },
      tierText: [
        "Instant reaction: when a teammate is attacked in melee, it gains +1 Defense this round.",
        "Instant reaction: when a teammate is attacked in melee, it gains +2 Defense this round.",
        "Instant reaction: when a teammate is attacked in melee, it gains +3 Defense this round."
      ]
    },
    specialty: {
      id: "vanguard-marshal",
      name: "Team Captain",
      text: "At combat setup you may sort Kyousuke together with allied units in your deployment zone. During combat round 1, once he reaches your front line, he has +1 Attack for the rest of that round, even after moving away."
    },
    cardImage: "/assets/units-commander-kyousuke_natsume.webp"
  },
  ibuki: {
    slug: "ibuki", name: "Ibuki", faction: "Kivotos Academy Domain", original: true,
    cast: {
      abilityId: "commander-cast-executive-order",
      name: "Executive Order",
      icon: "/assets/anime/icons/blue-archive/ibuki-executive-order.webp",
      targeting: {
        side: "friendly",
        canTargetSelf: false,
        activatedOnly: true,
        maxTierByPower: ["bronze", "silver", "gold"]
      },
      effect: { kind: "reactivate" },
      tierText: [
        "Choose a Bronze ally that already activated this round. It may activate again.",
        "Choose a Bronze or Silver ally that already activated this round. It may activate again; a Silver unit has −2 Attack during that activation.",
        "Choose any non-commander ally that already activated this round. It may activate again; a Silver or Gold unit has −2 Attack during that activation."
      ]
    },
    specialty: {
      id: "mission-briefing",
      name: "Schale Mission Briefing",
      text: "At the start of each combat, take the top card of your discard pile into your hand. If your discard pile is empty, draw 1 card from your deck instead."
    },
    cardImage: "/assets/units-commander-ibuki.webp"
  },
  sonya: {
    slug: "sonya",
    name: "Sonya",
    faction: "Monster Girl Quest: Paradox",
    original: true,
    cast: {
      abilityId: "commander-cast-shaman",
      name: "Cheer",
      icon: "/assets/spell-icons/haste.png",
      targeting: { side: "friendly", canTargetSelf: false },
      effect: {
        kind: "initiative-shift",
        amountByPower: [2, 6, 9],
        durationByPower: ["round", "round", "combat"],
        attackAmount: 1
      },
      tierText: [
        "A friend gains +2 Initiative and +1 Attack this round.",
        "A friend gains +6 Initiative and +1 Attack this round.",
        "A friend gains +9 Initiative and +1 Attack for the whole combat."
      ]
    },
    specialty: {
      id: "unbreakable-bond",
      name: "Unbreakable Bond",
      text: "Outside combat, choose one army card. While Sonya lives, that unit has +1 Defense during combat round 1; the first time it would die each combat, Sonya takes 1 damage instead."
    },
    cardImage: "/assets/units-commander-sonya.webp"
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
  bulwark: "bulwark",
  fuyuki: "ruler",
  azure_breeze: "sword_saint",
  hidden_leaf: "might_guy",
  azur_lane: "belfast",
  heavenly_demon: "demon_ancestor",
  little_busters: "kyousuke_natsume",
  blue_archive: "ibuki",
  mgq: "sonya"
};

export function commanderCastTierIndex(power: number): 0 | 1 | 2 {
  return power >= 2 ? 2 : power === 1 ? 1 : 0;
}

/**
 * The two "defend buff" commands (Hierophant's Shield, Ogre Leader's Stone Skin)
 * are INSTANT REACTIONS, not activation casts: instead of being cast during the
 * commander's own turn, they are played in response to one of the owner's units
 * being attacked, buffing the attacked unit's Defense before damage. Every other
 * command is a normal activation cast. Keyed off the effect kind so the single
 * source of truth is the cast definition. (See src/engine/commanders.ts for the
 * offer/resolution wiring and wog-commander-casts.test.ts for the behaviour.)
 */
export function commanderCastIsInstantReaction(cast: CommanderCastDefinition): boolean {
  return cast.effect.kind === "defense-buff";
}
