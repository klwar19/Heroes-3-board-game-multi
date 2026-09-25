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
 *    grade I/II; grade III is adjusted per spec for Health and Speed).
 *  - Attack is 2/3/3/4: from grade II, a -1 Attack die grants +1 Attack.
 *  - Defense is 1/2/2/2: grade II grants a permanent Defense token (+1 Defense
 *    on a +1 roll); grade III also pays that bonus on a 0 roll.
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
  "lion_el_jonson",
  "sonya",
  "forge"
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
 * bonus. Attack and Defense carry die riders at higher grades.
 *  - attack/health/speed are the unit's printed statistics (speed = Initiative).
 *  - defense is the printed Defense (1/2/2/2); grades II and III grant a
 *    Defense token. Grade III also pays +1 Defense on a 0 Defend roll.
 *  - damage is the NUMBER OF ADDITIONAL attack dice the commander rolls on each
 *    of its attacks (0/1/2/3). It is not a flat damage bonus — see the Might
 *    dice pool in reducer.ts (every extra "+1" raises the attack; at most one
 *    "−1" counts).
 *  - magic is the command-ability Power. Per the module spec the Power ladder
 *    is 0/0/1/2 (grade 1 buys the defensive package, not Power; grade 2 is the
 *    first Power step, grade 3 the top). Cast tiers cap at Power 2.
 */
export const COMMANDER_GRADE_VALUES: Record<CommanderStatKey, readonly [number, number, number, number]> = {
  attack: [2, 3, 3, 4],
  defense: [1, 2, 2, 2],
  health: [4, 5, 6, 8],
  damage: [0, 1, 2, 3],
  magic: [0, 0, 1, 2],
  speed: [5, 6, 7, 10]
};

/**
 * Defense grade that grants the "+1 def when attacked" Defense token (the
 * commander rolls the Defend die when attacked). Grade III retains it. Consumed by commanderAbilityIds and the
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

/**
 * Commanders whose Command cast is their primary value and rewards Magic Power
 * (Necropolis Animate Dead heal 1→3, Conflux Counterstrike tier-by-Power,
 * Rampart Shield +Def, Tower Precision's extra Power-2 uses). In ranked human play (16
 * commander games, 197 grade-ups) MAGIC was graded on these casters and on
 * NONE of the melee/utility commanders (paladin,
 * succubus, shaman, corsair/Sea Marshal, brute, ogre_leader, bulwark, factory —
 * 0 magic grades between them). Cast Power itself only climbs at Magic grade 2+
 * (COMMANDER_GRADE_VALUES.magic = [0,0,1,2]), so only a commander that actually
 * uses its cast is worth the investment. The computer AI's grade-up priority
 * (choice-policy) reads this so casters pour into Magic while everyone else
 * takes Attack + survivability. Single source of truth.
 */
export const COMMANDER_MAGIC_GRADE_SLUGS: ReadonlySet<CommanderSlug> = new Set<CommanderSlug>([
  "soul_eater",
  "temple_guardian",
  "astral_spirit",
  "hierophant",
]);

/** Does grading Magic meaningfully help this commander (see COMMANDER_MAGIC_GRADE_SLUGS)? */
export function commanderValuesMagicGrade(slug: string | undefined | null): boolean {
  return !!slug && COMMANDER_MAGIC_GRADE_SLUGS.has(slug as CommanderSlug);
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
    text: 'After the commander\'s attack, roll an Attack die — on "-1" or "0" the target gains Paralysis.'
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

export type CommanderTargetTier = "bronze" | "silver" | "gold" | "azure";

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
  /** Target must be no farther than this many battlefield spaces. */
  maxDistance?: number;
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
  | {
      /**
       * Factory Artificer "Emergency Repair": an INSTANT REACTION played in the
       * lethal-hit window (UNIT_LETHAL_HIT) when an ENEMY attack would destroy a
       * protected friendly unit or flip it from Pack to Few. It cancels that
       * whole attack (no damage, no on-attack effects, no Retaliation), anywhere
       * on the battlefield. Once per combat; the commander is then PARALYZED
       * (a real Paralysis token — it skips its next activation). The protected
       * units are listed by unitDefId per Power tier. Offered by
       * commanderLethalCancelReactionUnit, resolved in applyAttackDamageFromCandidate.
       */
      kind: "lethal-cancel";
      protectedUnitDefIdsByPower: readonly [readonly string[], readonly string[], readonly string[]];
    }
  | {
      kind: "defense-buff";
      amountByPower: readonly [number, number, number];
      vs: "melee" | "all";
      /**
       * Stronghold Stone Skin only: the Defense amount FROM combat round 2 onward
       * (the top tier grants +2 in round 1 but decays to +1 from round 2). Omit to
       * keep `amountByPower` every round (the Rampart Shield does). At the lower
       * tiers this array simply repeats `amountByPower`, so the decay is a top-tier
       * effect. Applied in resolveCommanderCast's defense-buff branch.
       */
      decayedAmountByPower?: readonly [number, number, number];
    }
  | { kind: "precision"; amountByPower: readonly [number, number, number] }
  | {
      /**
       * Tower Temple Guardian "Precision" (redesigned): an INSTANT-REACTION
       * offensive buff played through the attack window when a FRIENDLY RANGED
       * unit declares a nonadjacent attack. It boosts THAT ATTACK ONLY (a
       * per-attack `stackItem.modifiers.attackBonus`). Power 0/1 retain their
       * two-use ladder; Power 2 gets four uses, with +2 Attack on the first
       * three and +1 on the fourth. Resolved in
       * resolveCommanderCast's `precision-instant` branch, offered by
       * commanderPrecisionReactionUnit and gated by commanderCastUsedThisRound.
       */
      kind: "precision-instant";
      amountByPower: readonly [number, number, number];
      secondCastAmountByPower: readonly [number, number, number];
      fourthCastAmountAtPower2: number;
    }
  | {
      kind: "attack-buff";
      amountByPower: readonly [number, number, number];
      /** How long this commander's buff lasts; kept per cast because other commanders reuse this effect kind. */
      duration: "round" | "two-rounds" | "caster-two-activations";
      /** Dungeon Brute Power 2: Black Dragons receive at most this Attack bonus. */
      blackDragonPower2Cap?: number;
      /** Dungeon Brute Power 2: Black Dragons also roll Attack dice with advantage. */
      blackDragonAdvantageAtPower2?: boolean;
      /** Dungeon Brute only: the Power tier that also grants Attack die advantage. */
      advantageAtPower?: number;
    }
  | {
      kind: "fire-shield";
      damageByPower: readonly [number, number, number];
      durationByPower: readonly ["round" | "combat" | "two-rounds" | "three-rounds" | "caster-two-activations", "round" | "combat" | "two-rounds" | "three-rounds" | "caster-two-activations", "round" | "combat" | "two-rounds" | "three-rounds" | "caster-two-activations"];
      /** Add +1 Defense against only the first attack after this shield is applied at Power 2. */
      firstAttackDefenseFromPower?: number;
    }
  | { kind: "heal"; healByPower: readonly [number, number, number] }
  | {
      kind: "initiative-shift";
      amountByPower: readonly [number, number, number];
      durationByPower?: readonly ["round" | "combat", "round" | "combat", "round" | "combat"];
      /** Omit to make the Attack modifier unconditional. */
      attackVs?: "slower" | "faster";
      attackAmount: number;
      /**
       * Fortress Shaman "Haste" (redesigned) riders — all OPTIONAL so the shared
       * `initiative-shift` kind stays backward-compatible for every other user
       * (Sea Marshal's Slow, and the might_guy / sonya Haste reuses, which set
       * none of these and behave exactly as before):
       *  - `moveByPower`: extra COMBAT MOVEMENT spaces per Power tier, applied
       *    UNCONDITIONALLY (a COMMANDER_MOVEMENT_BONUS read in getUnitMoveRange
       *    regardless of the movement house rules).
       *  - `bonusVsSlowerByPower`: ADDITIONAL Attack vs strictly-slower targets
       *    per tier, laid ON TOP of the unconditional `attackAmount`
       *    (ATTACK_BONUS_VS_INITIATIVE "slower").
       *  - `durationRounds`: buff lasts this many combat rounds at EVERY tier
       *    (overrides `durationByPower`).
       *  - `refresh`: recasting on the same target REPLACES this cast's own
       *    effect instead of stacking a second copy.
       */
      moveByPower?: readonly [number, number, number];
      bonusVsSlowerByPower?: readonly [number, number, number];
      durationRounds?: number;
      refresh?: boolean;
    }
  | { kind: "unlimited-retaliation"; duration?: "round" | "combat" }
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
    }
  | {
      /**
       * Kyousuke "Little Busters, Assemble!": buffs EVERY allied unit adjacent
       * to the commander (the clicked target is only the picker's anchor — the
       * effect ignores it). Round-scoped, so it never lingers past the rally.
       */
      kind: "adjacent-allies-buff";
      attackByPower: readonly [number, number, number];
      defenseByPower: readonly [number, number, number];
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
  /**
   * One-line summary for an ACTION-POINT commander's AP table row (the cast is
   * that commander's priciest skill). Unused by every other commander.
   */
  apSummary?: string;
}

export interface CommanderSpecialtyDefinition {
  id:
    | "wise"
    | "first-aid"
    | "mana-magician"
    | "charming"
    | "soul-reformer"
    | "soul-link"
    | "undead"
    | "ballista-master"
    | "superior-combat"
    | "vanguard-marshal"
    | "elemental-scourge"
    | "tinkerer"
    | "rune-ritual"
    | "mission-briefing"
    | "unbreakable-bond"
    | "lion-round-barrage"
    | "storm-salvage";
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
  /** True for project-original commanders outside the official WoG roster. */
  original?: boolean;
  cast: CommanderCastDefinition;
  /** Optional additional commands sharing the normal once-per-round cast budget. */
  additionalCasts?: readonly CommanderCastDefinition[];
  specialty: CommanderSpecialtyDefinition;
  /** Built card asset (frame + art only; name, abilities and stats are overlaid). */
  cardImage: string;
}

// ---------------------------------------------------------------------------
// ACTION-POINT commanders (Blue Archive Ibuki, Little Busters Kyousuke).
//
// An AP commander starts every combat with 1 Action Point, banks +1 for moving,
// attacking, Defending or being attacked while alive, and spends AP on the
// skills below during its own activation. Its once-per-round CAST is simply the
// most expensive skill (COMMANDER_AP_CAST_COST AP) and is described by the
// definition's own `cast`, so an AP commander never gets a second cast budget.
//
// EVERY per-slug branch in the engine and the UI reads this table through
// `commanderUsesActionPoints` / `commanderApSkillOf` — do NOT reintroduce a
// `slug === "ibuki"` check.
// ---------------------------------------------------------------------------

/** What an AP skill needs the player to click before it can resolve. */
export type CommanderApSkillTarget = "enemy-unit" | "ally-unit" | "empty-space" | "none";

export type CommanderApSkillEffect =
  /** Ibuki "Sniper Shot": flat EFFECT damage to the chosen enemy. */
  | { kind: "flat-damage"; damageByPower: readonly [number, number, number] }
  /** Ibuki "Up to Mischief": a round-scoped Attack (and, from a Power rung, Defense) penalty. */
  | { kind: "enemy-debuff"; attack: number; defenseFromPower: number }
  /** Ibuki "Gadabout": teleport to an empty space, splashing every adjacent enemy. */
  | { kind: "teleport-splash"; landingDamage: number }
  /** Kyousuke "Mission Start!": a round-scoped Attack buff on ONE ally. */
  | { kind: "ally-attack-buff"; amountByPower: readonly [number, number, number] }
  /**
   * Kyousuke "Gutsy Play": a round-scoped Defense penalty on one enemy plus,
   * from `initiativeFromPower`, a COMBAT-scoped Initiative penalty (two
   * durations, so it resolves as two separate ongoing effects).
   */
  | { kind: "enemy-defense-debuff"; defense: number; initiative: number; initiativeFromPower: number }
  /** Kyousuke "Strategy Meeting": draw from your OWN deck (reshuffles when empty). */
  | { kind: "draw-cards"; countByPower: readonly [number, number, number] };

export interface CommanderApSkill {
  /** Unit-ability id carried by the commander's combat unit. */
  id: string;
  name: string;
  /** Action Points spent when the skill resolves. */
  ap: number;
  /** Icon shown in the card's AP table and in the offer. */
  icon: string;
  /** Printed rules text (the AP table row). */
  text: string;
  target: CommanderApSkillTarget;
  effect: CommanderApSkillEffect;
}

/** AP spent by an AP commander's once-per-round cast (its priciest skill). */
export const COMMANDER_AP_CAST_COST = 3;

export const COMMANDER_AP_SKILLS: Partial<Record<CommanderSlug, readonly CommanderApSkill[]>> = {
  ibuki: [
    {
      id: "commander-ibuki-sniper-shot",
      name: "Sniper Shot",
      ap: 1,
      icon: "/assets/anime/icons/blue-archive/ibuki-sniper-shot.webp",
      text: "Deal 1 flat damage to an enemy unit; at Power 2, deal 2 instead.",
      target: "enemy-unit",
      effect: { kind: "flat-damage", damageByPower: [1, 1, 2] }
    },
    {
      id: "commander-ibuki-up-to-mischief",
      name: "Up to Mischief",
      ap: 2,
      icon: "/assets/anime/icons/blue-archive/ibuki-up-to-mischief.webp",
      text: "An enemy has −1 Attack this combat round; at Power 1+, it also has −1 Defense.",
      target: "enemy-unit",
      effect: { kind: "enemy-debuff", attack: -1, defenseFromPower: 1 }
    },
    {
      id: "commander-ibuki-gadabout",
      name: "Gadabout",
      ap: 2,
      icon: "/assets/anime/icons/blue-archive/ibuki-gadabout.webp",
      text: "Teleport anywhere; enemies adjacent to the landing space take 1 damage.",
      target: "empty-space",
      effect: { kind: "teleport-splash", landingDamage: 1 }
    }
  ],
  kyousuke_natsume: [
    {
      id: "commander-kyousuke-mission-start",
      name: "Mission Start!",
      ap: 1,
      icon: "/assets/anime/icons/little-busters/kyousuke-mission-start.webp",
      text: "An ally gains +1 Attack this combat round; at Power 2, +2.",
      target: "ally-unit",
      effect: { kind: "ally-attack-buff", amountByPower: [1, 1, 2] }
    },
    {
      id: "commander-kyousuke-gutsy-play",
      name: "Gutsy Play",
      ap: 2,
      icon: "/assets/anime/icons/little-busters/kyousuke-gutsy-play.webp",
      text: "An enemy has −1 Defense this combat round; at Power 1+, it also has −1 Initiative for the rest of the combat.",
      target: "enemy-unit",
      effect: { kind: "enemy-defense-debuff", defense: -1, initiative: -1, initiativeFromPower: 1 }
    },
    {
      id: "commander-kyousuke-strategy-meeting",
      name: "Strategy Meeting",
      ap: 2,
      icon: "/assets/anime/icons/little-busters/kyousuke-strategy-meeting.webp",
      text: "Draw 1 card from your own deck; at Power 2, draw 2.",
      target: "none",
      effect: { kind: "draw-cards", countByPower: [1, 1, 2] }
    }
  ]
};

/** Header art for the card's AP panel (the cast icon is used for its own row). */
export const COMMANDER_AP_HEADER_ICON: Partial<Record<CommanderSlug, string>> = {
  ibuki: "/assets/anime/icons/blue-archive/ibuki-command.webp",
  kyousuke_natsume: "/assets/anime/icons/little-busters/kyousuke-command.webp"
};

/** True for a commander whose commands are paid for with Action Points. */
export function commanderUsesActionPoints(slug: string | undefined | null): boolean {
  return Boolean(slug && COMMANDER_AP_SKILLS[slug as CommanderSlug]);
}

/** The AP skills of `slug` (never the 3-AP cast), or an empty list. */
export function commanderApSkills(slug: string | undefined | null): readonly CommanderApSkill[] {
  return (slug && COMMANDER_AP_SKILLS[slug as CommanderSlug]) || [];
}

/** The AP skill `abilityId` names for `slug`, or null (the cast is NOT one). */
export function commanderApSkillOf(slug: string | undefined | null, abilityId: string): CommanderApSkill | null {
  return commanderApSkills(slug).find((skill) => skill.id === abilityId) ?? null;
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
        "At most 3 casts per combat. Remove 2 damage from a friendly unit and remove its negative tokens and effects."
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
      effect: { kind: "defense-buff", amountByPower: [1, 1, 2], vs: "melee" },
      // INSTANT REACTION (not an activation cast): play when one of your units is
      // attacked in melee, before damage — the attacked unit gains the Defense.
      tierText: [
        "Instant reaction, once per combat: when your unit is attacked in melee, it gains +1 Defense vs melee this round.",
        "Instant reaction, once per combat round and at most twice per combat: when your unit is attacked in melee, it gains +1 Defense vs melee this round.",
        "Instant reaction, once per combat round and at most twice per combat: when your unit is attacked in melee, it gains +2 Defense vs melee this round."
      ]
    },
    specialty: {
      id: "first-aid",
      name: "First Aid Master",
      text: "After a combat, choose 1 bronze/silver casualty: revive it or restore Few to Pack by paying half that side's gold cost, rounded down, minus 1 (minimum 0). You cannot choose a unit you cannot afford."
    },
    cardImage: "/assets/units-commander-hierophant.webp"
  },
  temple_guardian: {
    slug: "temple_guardian", name: "Temple Guardian", faction: "Tower",
    cast: {
      abilityId: "commander-cast-temple_guardian",
      name: "Precision",
      icon: "/assets/spell-icons/precision.png",
      // Redesigned (user spec): an INSTANT-REACTION buff played through the attack
      // window when one of your RANGED units attacks a NONADJACENT target.
      // Power 0/1 retain their two-use ladder. Power 2 gives +2 Attack on
      // uses 1-2 and +1 on uses 3-4. Every use ignores ranged penalties.
      targeting: { side: "friendly", unitType: "ranged", canTargetSelf: false },
      effect: { kind: "precision-instant", amountByPower: [1, 2, 2], secondCastAmountByPower: [1, 1, 2], fourthCastAmountAtPower2: 1 },
      tierText: [
        "Instant, when your ranged unit attacks a nonadjacent target: +1 Attack and ignore ranged penalties for that attack. Once per round, twice per combat; the second use gives +1 Attack and ignores ranged penalties.",
        "Instant, when your ranged unit attacks a nonadjacent target: +2 Attack and ignore ranged penalties for that attack. Once per round, twice per combat; the second use gives +1 Attack and ignores ranged penalties.",
        "Instant, when your ranged unit attacks a nonadjacent target: +2 Attack for the first two uses, then +1 Attack for the third and fourth. Every use ignores ranged penalties. Once per round, four times per combat."
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
        damageByPower: [1, 2, 2],
        durationByPower: ["two-rounds", "caster-two-activations", "caster-two-activations"],
        firstAttackDefenseFromPower: 2
      },
      tierText: [
        "At most twice per combat. A friendly unit gains a Fire Shield: an enemy that attacks or retaliates against it takes 1 damage. Lasts 2 combat rounds.",
        "At most twice per combat. A friendly unit gains a Fire Shield: an enemy that attacks or retaliates against it takes 2 damage until the commander's next activation, then 1 damage until its following activation, when the shield ends.",
        "At most twice per combat. A friendly unit gains a Fire Shield: an enemy that attacks or retaliates against it takes 2 damage until the commander's next activation, then 1 damage until its following activation, when the shield ends. It also gets +1 Defense against only the first attack after receiving the shield."
      ]
    },
    specialty: {
      id: "charming",
      name: "Charming",
      text: "At the start of a combat against neutral units, one random enemy neutral unit (any tier) gains a Paralysis token and -1 Defense for combat rounds 1-2."
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
      // to the commander; Pow 1 = +1 anywhere; Pow 2 = +2 anywhere. Cast on the
      // Brute's activation and lasting until its second following activation.
      targeting: { side: "friendly", unitType: "melee", adjacentBelowPower: 1, canTargetSelf: false },
      effect: { kind: "attack-buff", amountByPower: [1, 1, 2], duration: "caster-two-activations", blackDragonPower2Cap: 1, blackDragonAdvantageAtPower2: true, advantageAtPower: 1 },
      tierText: [
        "At most 3 casts per combat. On the Brute's activation, an adjacent friendly melee unit gains +1 Attack until the Brute's second following activation. You may instead cast at combat start for +1 Attack until the end of round 1 and skip the Brute's round-1 turn.",
        "At most 3 casts per combat. On the Brute's activation, any friendly melee unit gains +1 Attack and rolls Attack dice with advantage until the Brute's second following activation. You may instead cast at combat start for +1 Attack only until the end of round 1 and skip the Brute's round-1 turn.",
        "At most 3 casts per combat. On the Brute's activation, any friendly melee unit gains +2 Attack (Black Dragons gain only +1 Attack and roll Attack dice with advantage) until the Brute's second following activation. You may instead cast at combat start for +1 Attack only until the end of round 1 and skip the Brute's round-1 turn."
      ]
    },
    specialty: {
      id: "soul-reformer",
      name: "Soul Reformer",
      text: "At the start of combat against neutral units, you may pay 2 gold to draw 1 card. After each combat you win, gain 2 gold."
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
        // Every graded tier at every Power; the ladder stays so tierless
        // bodies (other commanders, bank guards, summons, battlefield
        // heroes) remain excluded exactly as before.
        maxTierByPower: ["azure", "azure", "azure"],
        canTargetSelf: false
      },
      effect: { kind: "heal", healByPower: [1, 2, 3] },
      tierText: [
        "Remove 1 damage from any friendly unit.",
        "Remove 2 damage from any friendly unit. At most 3 times per combat.",
        "First use: remove 3 damage. Later uses: remove 2 damage. At most 4 times per combat."
      ]
    },
    specialty: {
      id: "soul-link",
      name: "Soul Link",
      text: "At combat start, choose another friendly unit. Once per combat round, when it takes damage, the commander takes half that damage, rounded up, and the chosen unit takes the rest."
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
      // Nerfed defend buff (user spec). The +Defense amounts shrink to +1/+1/+2
      // and the reaction gains a per-combat budget that tightens the low tiers
      // while letting the top tier react every round with a decaying amount:
      //  - Power 0: +1 Defense, only ONCE per combat.
      //  - Power 1: +1 Defense, once per round and at most TWICE per combat.
      //  - Power 2: +2 Defense in combat round 1, then +1 from round 2 on, once
      //    per round with at most four casts per combat (decayedAmountByPower supplies the
      //    round-2+ amount; the budget lives in commanderCastUsedThisRound).
      effect: {
        kind: "defense-buff",
        amountByPower: [1, 1, 2],
        decayedAmountByPower: [1, 1, 1],
        vs: "all"
      },
      // INSTANT REACTION (not an activation cast): play when one of your units is
      // attacked (melee OR ranged), before damage — the attacked unit gains the Defense.
      tierText: [
        "Instant reaction, once per combat: when your unit is attacked, it gains +1 Defense vs all attacks this round.",
        "Instant reaction, once per combat round and at most twice per combat: when your unit is attacked, it gains +1 Defense vs all attacks this round.",
        "Instant reaction, once per combat round and at most four times per combat: when your unit is attacked, it gains +2 Defense vs all attacks this round in round 1, then +1 from round 2 on."
      ]
    },
    specialty: {
      id: "ballista-master",
      name: "Ballista Master",
      text: "In combat you field an extra Ballista: one if you own no Ballista, a second if you already own one. It fires at the start of each round like any Ballista and works with the Artillery card."
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
      // Redesigned (user spec). The buff lasts 2 combat rounds at every Power and
      // does NOT stack (a recast on the same unit refreshes it). Pow 0 = +3
      // Initiative & +1 Attack; Pow 1 = +6 Initiative, +1 Attack & +1 Movement;
      // Pow 2 = +9 Initiative, +1 Attack (+1 MORE vs strictly-slower targets) & +1
      // Movement. In combat round 1 the Shaman may instead cast this at the very
      // start of the battle (before turn order) — see the begin-of-match option in
      // adventure-reducer — but then its own round-1 activation is skipped.
      effect: {
        kind: "initiative-shift",
        amountByPower: [3, 6, 9],
        attackAmount: 1,
        moveByPower: [0, 1, 1],
        bonusVsSlowerByPower: [0, 0, 1],
        durationRounds: 2,
        refresh: true
      },
      tierText: [
        "A friendly unit gains +3 Initiative and +1 Attack for 2 combat rounds.",
        "A friendly unit gains +6 Initiative, +1 Attack and +1 Movement for 2 combat rounds. If cast at the start of combat, the commander also gains +3 Initiative for 2 combat rounds.",
        "A friendly unit gains +9 Initiative, +1 Attack (+1 more vs slower units) and +1 Movement for 2 combat rounds. If cast at the start of combat, the commander also gains +5 Initiative for 2 combat rounds."
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
        "For 2 combat rounds, a friendly bronze unit has +1 Attack on Retaliation Attacks, may retaliate any number of times, and may retaliate against units that ignore retaliation.",
        "For 2 combat rounds, a friendly bronze or silver unit has +1 Attack on Retaliation Attacks, may retaliate any number of times, and may retaliate against units that ignore retaliation.",
        "For 2 combat rounds, a friendly unit of any tier — even gold — has +1 Attack on Retaliation Attacks, may retaliate any number of times, and may retaliate against units that ignore retaliation."
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
      name: "Emergency Repair",
      icon: "/assets/spell-icons/cure.png",
      targeting: {
        side: "friendly",
        canTargetSelf: false
      },
      effect: {
        kind: "lethal-cancel",
        protectedUnitDefIdsByPower: [
          ["factory.mechanics"],
          ["factory.mechanics", "factory.automatons"],
          ["factory.mechanics", "factory.automatons", "factory.dreadnoughts"]
        ]
      },
      tierText: [
        "Instant, anywhere, once per Combat: cancel an enemy attack that would destroy your Engineers or flip them from Pack to Few. The commander is then Paralyzed.",
        "Instant, anywhere, once per Combat: cancel an enemy attack that would destroy your Engineers or Automatons, or flip them from Pack to Few. The commander is then Paralyzed.",
        "Instant, anywhere, once per Combat: cancel an enemy attack that would destroy your Engineers or any mechanical unit (Automatons, Juggernauts), or flip them from Pack to Few. The commander is then Paralyzed."
      ]
    },
    specialty: {
      id: "tinkerer",
      name: "Tinkerer",
      text: "War machines cost you 5 less gold (to a minimum of 0). At the start of battle, place 1/2/3 Mechanical Traps at Power 0/1/2; each is spent when a unit steps on it and deals 2 damage. You may keep up to 2 war machines as permanents: 1 active and 1 in reserve. During your own combat turn, switch them any number of times: the first switch each Combat is free, then each switch costs 1 gold. Without gold, you cannot switch again. Other permanents still use the normal permanent limit, including Pandora's Box expansions."
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
        "Spend 2 Runes: remove 3 damage on each of the first 2 heals this combat, then 2 damage on later heals."
      ]
    },
    specialty: {
      id: "rune-ritual",
      name: "Rune Ritual",
      text: "Gain +1 Rune every time the commander MOVES, and +3 Runes every time it is attacked. At Rune Level 1, the commander gains +1 additional Attack beyond the army-wide +1 Attack."
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
      effect: { kind: "attack-buff", amountByPower: [1, 1, 2], duration: "two-rounds" },
      tierText: [
        "A nearby allied melee Servant gains +1 Attack for 2 combat rounds.",
        "An allied melee Servant anywhere gains +1 Attack for 2 combat rounds.",
        "An allied melee Servant anywhere gains +2 Attack for 2 combat rounds."
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
      text: "After a combat, choose 1 bronze/silver casualty: revive it or restore Few to Pack by paying half that side's gold cost, rounded down, minus 1 (minimum 0). You cannot choose a unit you cannot afford."
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
      effect: { kind: "attack-buff", amountByPower: [1, 1, 2], duration: "two-rounds" },
      tierText: [
        "A nearby allied melee demon-cultivator gains +1 Attack for 2 combat rounds.",
        "An allied melee demon-cultivator anywhere gains +1 Attack for 2 combat rounds.",
        "An allied melee demon-cultivator anywhere gains +2 Attack for 2 combat rounds."
      ]
    },
    // Specialty: REUSE `undead` (Paralysis-token immunity) — the id the
    // Necropolis Soul Eater carried before its Soul Link redesign. The engine gate keys off the specialty id
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
    // ACTION-POINT commander (the Ibuki machinery, generalised): three cheap
    // skills in COMMANDER_AP_SKILLS plus this 3-AP rally. It is an ACTIVATION
    // cast, NOT an instant reaction — the old Hierophant-Shield reuse is gone.
    cast: {
      abilityId: "commander-cast-kyousuke-assemble",
      name: "Little Busters, Assemble!",
      icon: "/assets/anime/icons/little-busters/kyousuke-assemble.webp",
      // The click is only the picker's anchor (Kyousuke himself is always
      // legal, so the cast can never be starved of a target); the effect buffs
      // every ALLY adjacent to him and ignores what was clicked.
      targeting: { side: "friendly", canTargetSelf: true },
      effect: { kind: "adjacent-allies-buff", attackByPower: [1, 1, 2], defenseByPower: [0, 1, 1] },
      tierText: [
        "Spend 3 AP: every allied unit adjacent to Kyousuke gains +1 Attack this combat round.",
        "Spend 3 AP: every allied unit adjacent to Kyousuke gains +1 Attack and +1 Defense this combat round.",
        "Spend 3 AP: every allied unit adjacent to Kyousuke gains +2 Attack and +1 Defense this combat round."
      ],
      apSummary:
        "Every allied unit adjacent to Kyousuke gains +1 Attack this combat round; at Power 1 also +1 Defense, at Power 2 +2 Attack and +1 Defense."
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
      ],
      apSummary:
        "Reactivate an ally that already activated: Bronze at Power 0, up to Silver at Power 1, or any tier at Power 2. Silver and Gold have −2 Attack for that extra activation."
    },
    specialty: {
      id: "mission-briefing",
      name: "Schale Mission Briefing",
      text: "At the start of each combat, take the top card of your discard pile into your hand. If your discard pile is empty, draw 1 card from your deck instead."
    },
    cardImage: "/assets/units-commander-ibuki.webp"
  },
  lion_el_jonson: {
    slug: "lion_el_jonson", name: "Lion El'Jonson", faction: "Imperium of Man", original: true,
    cast: {
      abilityId: "commander-cast-lion-slash",
      name: "Lion's Slash",
      icon: "/assets/warhammer/icons/lions-slash.webp",
      targeting: {
        side: "enemy",
        maxDistance: 3,
        canTargetSelf: false
      },
      effect: { kind: "enemy-damage", damageByPower: [1, 2, 3] },
      tierText: [
        "Choose an enemy within 3 spaces: deal 1 flat damage, ignoring Defense and Retaliation.",
        "Choose an enemy within 3 spaces: deal 2 flat damage, ignoring Defense and Retaliation.",
        "Choose an enemy within 3 spaces: deal 3 flat damage, ignoring Defense and Retaliation."
      ]
    },
    additionalCasts: [{
      abilityId: "commander-cast-lion-counterstroke",
      name: "Deathwing Counterstroke",
      icon: "/assets/warhammer/icons/deathwing-counterstroke.webp",
      targeting: {
        side: "friendly",
        maxTierByPower: ["bronze", "silver", "gold"],
        canTargetSelf: false
      },
      effect: { kind: "unlimited-retaliation", duration: "combat" },
      tierText: [
        "Choose a Bronze ally: it may retaliate without limit for the rest of this Combat.",
        "Choose a Bronze or Silver ally: it may retaliate without limit for the rest of this Combat.",
        "Choose a Bronze, Silver, or Gold ally: it may retaliate without limit for the rest of this Combat."
      ]
    }],
    specialty: {
      id: "lion-round-barrage",
      name: "The Lion's Barrage",
      text: "At the start of Combat rounds 1–3, one random living enemy takes 1 flat damage. This effect ignores Defense and causes no Retaliation."
    },
    cardImage: "/assets/units-commander-lion_el_jonson.webp"
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
  },
  forge: {
    slug: "forge", name: "Mech Princess", faction: "Forge", original: true,
    // Cast: "Arc Discharge" — REUSES Belfast's `enemy-damage` kind (flat EFFECT
    // damage to one chosen enemy: no Retaliation, ignores Defense. Power 2
    // scales by combat round and target tier (see commanderEnemyDamageAmount).
    cast: {
      abilityId: "commander-cast-forge",
      name: "Arc Discharge",
      // Codex medallion (generated-session-art/forge/icons/arc-discharge.png).
      icon: "/assets/commander-icons/forge-arc-discharge.webp",
      targeting: { side: "enemy", canTargetSelf: false },
      effect: { kind: "enemy-damage", damageByPower: [1, 2, 3] },
      tierText: [
        "Deal 1 damage to an enemy unit (no Retaliation, ignores Defense).",
        "Deal 2 damage to an enemy unit (no Retaliation, ignores Defense).",
        "Choose 1 enemy. Combat rounds 1-2: deal 3 damage to any unit. From round 3: deal 2 to gold and azure, or 3 to other units. No Retaliation; ignores Defense."
      ]
    },
    // Specialty: automatic after-combat reward (finalizeAdventureCombat in
    // src/engine/adventure-reducer.ts). The Mech Princess must have taken the
    // field on the WINNING side of that combat (alive or fallen).
    specialty: {
      id: "storm-salvage",
      name: "Storm Salvage",
      text: "At combat start, choose no Scroll, or buy a phantom Chain Lightning Scroll for 1 building material against neutrals / 1 Valuable in PvP. If you win and the Scroll still contains a spell after combat, gain 1 building material, then the Scroll disappears."
    },
    cardImage: "/assets/units-commander-forge.webp"
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
  imperium: "lion_el_jonson",
  mgq: "sonya",
  forge: "forge"
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
/**
 * The rows of an AP commander's command table: its AP skills, then its
 * once-per-round cast at COMMANDER_AP_CAST_COST. ONE derivation shared by the
 * card face and the stats panel, so a new AP commander needs no UI edit.
 */
export function commanderApCommandTableRows(
  slug: CommanderSlug
): readonly { id: string; name: string; ap: number; icon: string; text: string }[] {
  const definition = commanderDefinitions[slug];
  const rows = commanderApSkills(slug).map((skill) => ({
    id: skill.id,
    name: skill.name,
    ap: skill.ap,
    icon: skill.icon,
    text: skill.text
  }));
  if (!definition) {
    return rows;
  }
  return [
    ...rows,
    {
      id: definition.cast.abilityId,
      name: definition.cast.name,
      ap: COMMANDER_AP_CAST_COST,
      icon: definition.cast.icon,
      text: definition.cast.apSummary ?? definition.cast.tierText[0]
    }
  ];
}

/** @deprecated Kept for external callers — use commanderApCommandTableRows("ibuki"). */
export const IBUKI_COMMAND_SKILLS = commanderApCommandTableRows("ibuki");

export function commanderCastIsInstantReaction(cast: CommanderCastDefinition): boolean {
  // The DEFENDER-side defend buffs (Hierophant Shield, Ogre Stone Skin) and the
  // ATTACKER-side Tower Precision are all played through the attack window, never
  // as an activation cast.
  // Factory Emergency Repair is a lethal-hit-window reaction (never an activation cast).
  return (
    cast.effect.kind === "defense-buff" ||
    cast.effect.kind === "precision-instant" ||
    cast.effect.kind === "lethal-cancel"
  );
}
