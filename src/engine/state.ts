export type PlayerId = string;
export type CardId = string;
export type UnitId = string;
export type HeroId = string;
export type TownId = string;
export type BuildingId = string;
export type DeckId = string;
export type MapSpaceId = string;

export type GamePhase =
  | "setup"
  | "round-start"
  | "simultaneous-turns"
  | "player-turn"
  | "ai-turn"
  | "map"
  | "town"
  | "combat-setup"
  | "combat"
  | "reaction"
  | "choice"
  | "cleanup"
  | "game-over";

export type GameMode = "combat-sandbox" | "adventure";
export type GameDifficulty = "easy" | "normal" | "hard" | "impossible";
/**
 * Rules variant chosen in the lobby:
 *  - "legacy": the community rulebook as printed (single Spell/Artifact decks,
 *    printed card values).
 *  - "binh": the BINH house-rule mode — split Basic/Expert Spell decks and
 *    Minor/Major/Relic Artifact decks with level/map gating, Wisdom expert
 *    discount 3, Estates 2/4 gold, Griffin and Marksmen stat tweaks, and the
 *    Pack of Cerberi attacking every adjacent enemy with full attacks.
 */
export type GameRuleset = "legacy" | "binh";
/**
 * How the scenario is won:
 *  - "conquest": flag an enemy faction Town (the classic skirmish goal).
 *  - "grail": the Grail hunt — win by capturing the Grail (defeat its guard,
 *    dig it, then carry it home) or by beating every enemy hero in combat at
 *    least once (only 2 of them in a 4-player game). The Dragon Utopia is NOT
 *    an objective here; it is just a creature bank.
 *  - "dragon-hunt": win by defeating the Dragon Utopia (no need to hold it) or
 *    by beating every enemy hero in combat at least once (only 2 in a 4-player
 *    game).
 *  - "dragon-conqueror": defeat the Dragon Utopia to capture it, then hold it.
 *    The holder garrisons it; rivals must besiege it (Walls, Gate, Arrow
 *    Tower) to take it. Controlling the Utopia at the start of your turn wins.
 */
export type VictoryMode = "conquest" | "grail" | "dragon-hunt" | "dragon-conqueror";

/**
 * Whether a player-vs-player Combat costs the fighters their dead units:
 *  - "normal": casualties are kept — destroyed unit cards leave the army and
 *    damaged Packs flip to Few (the rulebook outcome).
 *  - "none": a friendly-fight option — after a PvP Combat ends, neither side
 *    loses any unit cards or has a Pack downgraded. The fight still resolves a
 *    winner (and the loser still pays gold, loses morale and retreats home);
 *    only the troops are spared. Does not affect fights against Neutral guards.
 */
export type PvpTroopLoss = "normal" | "none";
export type FactionId =
  | "castle"
  | "rampart"
  | "inferno"
  | "necropolis"
  | "dungeon"
  | "stronghold"
  | "fortress"
  | "tower"
  | "conflux"
  | "cove";

export type TargetRef =
  | { type: "unit"; unitId: UnitId }
  | { type: "space"; position: number }
  | { type: "none" };

export type SourceRef =
  | { type: "card"; cardId: CardId; controllerId: PlayerId }
  | { type: "unit"; unitId: UnitId; controllerId: PlayerId }
  | { type: "system" };

export type DamageKind = "attack" | "spell" | "effect";
export type UnitType = "ground" | "ranged" | "flying";
export type UnitGrade = "bronze" | "silver" | "gold" | "azure";
export type CombatStat = "attack" | "defense" | "power";
export type CardPlayMode = "basic" | "expert";
export type SpellLevel = "basic" | "expert";
export type SpellSchool = "air" | "earth" | "fire" | "water" | "any";
export type ArtifactTier = "minor" | "major" | "relic";
export type StatisticType = "attack" | "defense" | "power" | "knowledge";
export type AbilityClass = "might" | "magic" | "economy" | "adventure" | "combat";
export type AttackRollMode = "normal" | "advantage" | "disadvantage";
export type ResourceKind = "gold" | "buildingMaterials" | "valuables";
export type ResourceCost = Partial<Record<ResourceKind, number>>;

export type TargetDefinition =
  | {
      type: "enemy-unit";
      unitTypes?: UnitType[];
      damagedOnly?: boolean;
      /**
       * Artillery: restrict the legal targets to the enemy unit(s) with the
       * lowest (effective) initiative. A single slowest enemy is the only legal
       * target; a tie offers each tied unit so the controller picks which is hit.
       */
      lowestInitiativeOnly?: boolean;
    }
  | {
      type: "friendly-unit";
      unitTypes?: UnitType[];
      damagedOnly?: boolean;
      /**
       * Bowstring of the Unicorn's Mane: the chosen ranged unit must not have
       * been activated yet this combat round (it is about to take its turn).
       */
      notActivatedThisRound?: boolean;
      /**
       * Ingham's Zealots VI: the effect lands only on a unit whose name matches
       * (his "your Zealots unit") — matched with the same family/"or" logic the
       * specialty-doubling uses, so the option is offered only when you field one.
       */
      unitName?: string;
    }
  | {
      type: "any-unit";
      unitTypes?: UnitType[];
      damagedOnly?: boolean;
      /**
       * Tarnum (Dungeon)'s Dragons VI: the effect lands only on a unit (friend or
       * foe) whose name matches — his "a Dragons unit" — using the same family /
       * "or" match the specialty-doubling uses.
       */
      unitName?: string;
    }
  /** Summon spells: a chosen empty space on the combat board. */
  | { type: "empty-space" }
  /** Inferno: any space on the combat board (occupied or not). */
  | { type: "any-space" }
  /**
   * Dispel: any unit, OR a board space holding a removable obstacle/trap token
   * (Force Field / Fire Wall / Quicksand / Land Mine). On a unit it also clears
   * the space the unit occupies.
   */
  | { type: "unit-or-obstacle" }
  | { type: "none" };

export type EffectDurationDefinition =
  | { type: "instant" }
  | { type: "current-combat-round" }
  | { type: "next-combat-round" }
  | { type: "combat-rounds"; rounds: number }
  | { type: "current-turn" }
  /** Torosar's Ballista IV: "until the end of the round" (this game round). */
  | { type: "current-game-round" }
  /**
   * Mirth (Power 0): "during this Activation". Lasts until the end of the
   * activation in progress when the effect is created (bound to the unit that
   * is active at creation time).
   */
  | { type: "current-activation" }
  /**
   * Forgetfulness: "during its next activation". Lasts until the end of the
   * targeted unit's next activation (bound to the effect's target unit).
   */
  | { type: "next-activation" }
  | { type: "combat" }
  | { type: "permanent" };

export type ActiveEffectModifier =
  | {
      type: "ATTACK_BONUS";
      amount: number;
    }
  | {
      type: "DEFENSE_BONUS";
      amount: number;
    }
  | {
      /**
       * Merist's Stone Skin VI: a player-scoped, combat-duration flag. While the
       * controller has it, their units' Defense tokens grant the +1 Defense on a
       * "0" OR a "+1" Defense-die roll (instead of only on a "+1"). Carries no
       * amount; resolveDefendBonus reads its presence on the defender's owner.
       */
      type: "DEFENSE_TOKEN_ON_ZERO";
    }
  | {
      type: "RANGED_ATTACK_BONUS";
      amount: number;
      nonAdjacentOnly: boolean;
    }
  | {
      type: "RANGED_INITIATIVE_BONUS";
      amount: number;
    }
  | {
      /**
       * Necklace of Swiftness (option A): "During this Combat, the initiative of
       * all your ground units is increased by 1." A player-scoped, combat-duration
       * effect; the bonus lands on the controller's GROUND units only (flying and
       * ranged units are untouched), mirroring how RANGED_INITIATIVE_BONUS gates
       * on the unit's own type. Read in effectiveInitiative.
       */
      type: "GROUND_INITIATIVE_BONUS";
      amount: number;
    }
  | {
      type: "ATTACK_DIE_REROLL";
      maxUsesPerRoll: number;
      consumeEffectOnUse: boolean;
    }
  | {
      // The First Aid Tent always heals exactly this much once per combat round.
      // The expert "heal 3×" is NOT a property of the Tent: it is the First Aid
      // ability card's expert side (FIRST_AID_TENT_VOLLEY), gated on holding that
      // card — mirroring how the Ballista's 3× volley lives on Artillery.
      type: "HEAL_ONCE_PER_COMBAT_ROUND";
      amount: number;
    }
  | {
      type: "UNIT_CANNOT_MOVE";
    }
  | {
      /**
       * Forgetfulness: while held, the unit cannot perform an Attack action
       * (it may still move). Lasts its next activation (the "next-activation"
       * duration removes it when that activation ends).
       */
      type: "UNIT_CANNOT_ATTACK";
    }
  | {
      /**
       * Berserk: while held (its next activation), the unit MUST attack the
       * nearest unit — friend or foe — or move toward it and attack it. The
       * legal-action layer drops every other action (no free move, defend or
       * ability) and the neutral AI targets the nearest unit instead of by
       * tier; `canUnitAttack` lets the berserked unit strike its own allies
       * (the attacked ally still retaliates). Bound to the unit's next
       * activation (the "next-activation" duration removes it when that
       * activation ends).
       */
      type: "BERSERK_FORCED_ATTACK";
    }
  | {
      /**
       * Shackles of War (house rule): while held, the affected player's Hero
       * cannot *Surrender* the current Combat. Retreat (and a fought-out loss)
       * is unaffected. Player-scoped, lasts the Combat.
       */
      type: "CANNOT_SURRENDER_COMBAT";
    }
  | {
      /**
       * Luck-style rerolls of the adventure dice. "any" also lets the
       * attack-die reroll flow consume this effect (Expert Luck).
       */
      type: "ADVENTURE_DIE_REROLL";
      dice: "treasure" | "resource" | "any";
      /**
       * Fortune: a shared budget of N rerolls across this effect's adventure
       * dice (Power 0/1/2 -> 1/2/3), spent one at a time. When omitted (Luck),
       * the once-per-die-type model applies instead.
       */
      rerolls?: number;
    }
  | {
      /**
       * Cards of Prophecy ("Set a Resource die or Treasure die on the side of
       * your choice"): instead of taking the rolled face of an adventure die,
       * the controller may set that die to any of its faces. "any" covers both
       * the Resource and the Treasure die. A single use — the whole effect is
       * spent the moment a die is set (mirrors the single-use "any" Luck
       * reroll), so the choice is offered once per played card.
       */
      type: "ADVENTURE_DIE_SET";
      dice: "treasure" | "resource" | "any";
    }
  | {
      /**
       * Melodia's Fortune VI ("During this turn, the number of dice you roll and
       * resolve at locations is increased by 1"): a current-turn, player-scoped
       * effect read in interactionToSteps — every Treasure/Resource die a location
       * makes the controller roll this turn is increased by `amount`.
       */
      type: "LOCATION_DICE_BONUS";
      amount: number;
    }
  | {
      /**
       * Ammo Cart: the affected ranged units ignore every ranged-attack
       * penalty (adjacent shots and opposite-back-row shots roll normally).
       */
      type: "RANGED_IGNORE_ALL_PENALTIES";
    }
  | {
      /** Haste / Slow / Cape of Velocity: shifts a unit's activation order. */
      type: "INITIATIVE_BONUS";
      amount: number;
    }
  | {
      /**
       * Cyra's Haste VI: the unit gains this much Defense, but only against
       * attacks made by a unit with strictly lower (effective) Initiative.
       */
      type: "DEFENSE_VS_LOWER_INITIATIVE";
      amount: number;
    }
  | {
      /**
       * Shield / Air Shield: extra Defense that applies only against an attacker
       * of a given UNIT TYPE — "ground-or-flying" (Shield) matches any non-ranged
       * attacker; "ranged" (Air Shield) matches a ranged attacker. Lasts the
       * Combat and is read in getAttackerTypeDefenseBonus during the attack maths.
       */
      type: "DEFENSE_VS_ATTACKER_TYPE";
      attackerType: "ground-or-flying" | "ranged";
      amount: number;
    }
  | {
      /**
       * Torosar's Ballista IV/VI: while held, the controller fields one extra
       * Ballista — it fires at every combat-round start and counts toward
       * "activate all your Ballistas". One modifier per granted Ballista.
       */
      type: "EXTRA_BALLISTA";
    }
  | {
      /**
       * Gerwulf's Ballista VI (ongoing): while the controller holds this
       * (player-scoped, combat duration), their Ballista's round-start shot
       * targets an enemy unit of THEIR choice — every living enemy is a
       * candidate — instead of being forced onto the lowest-initiative enemy.
       */
      type: "BALLISTA_CHOOSE_TARGET";
    }
  | {
      /** Anti-Magic: the unit cannot be targeted by spells (up to a tier). */
      type: "UNIT_SPELL_IMMUNE";
      maxGrade: UnitGrade;
    }
  | {
      /** Fire Shield: adjacent attackers take damage after their attack. */
      type: "FIRE_SHIELD";
      amount: number;
    }
  | {
      /** Scouting: the next Search(X) becomes Search(count). Consumed on use. */
      type: "SEARCH_COUNT_OVERRIDE";
      count: number;
    }
  | {
      /** Pendant of Courage: repeat the next Search action once. */
      type: "SEARCH_REPEAT_ONCE";
    }
  | {
      /**
       * Crest of Valor (option B, map): "Ignore negative morale effect from a
       * field." A player-scoped, current-turn shield spent the next time a Field
       * the player visits would hand them a negative Morale token — the
       * GAIN_MORALE visit-step checks for and consumes this effect (single use)
       * instead of lowering Morale. Combat-loss Morale is unaffected: only the
       * field visit-step reads it.
       */
      type: "IGNORE_FIELD_NEGATIVE_MORALE";
    }
  | {
      /**
       * Basic Air/Earth/Fire/Water Magic (permanent): instead of searching a
       * Spell deck, fetch its first spell of this school.
       */
      type: "SPELL_SCHOOL_FETCH";
      school: SpellSchool;
    }
  | {
      /** Necklace of Dragonteeth: extra Spell cards per combat round. */
      type: "SPELL_LIMIT_BONUS";
      amount: number;
    }
  | {
      /**
       * Intelligence: while held this Combat the controller may cast a Spell at
       * any time — even off-turn, without one of their own units being active
       * (it lifts the activation-timing gate, not the open-window rule). The
       * expert side also sets `ignoreSpellLimit`, so the per-combat-round Spell
       * limit no longer applies to that player.
       */
      type: "SPELL_CAST_ANYTIME";
      ignoreSpellLimit?: boolean;
    }
  | {
      /**
       * Angel Wings / Fly: this turn the player's Heroes may move through
       * blocked fields (passing over them, never stopping on one). Read by the
       * adventure pathfinding (canCrossEdge / classifyHeroStep).
       */
      type: "HERO_MOVE_THROUGH";
    }
  | {
      /**
       * Water Walk: this turn the player's Heroes may enter, cross and stop on
       * sea (water-terrain) fields. Read by the adventure pathfinding.
       */
      type: "HERO_WATER_WALK";
    }
  | {
      /**
       * Pathfinding ability (BINH house rule). For this turn the player's Heroes:
       *  - Basic: may move *through* fields holding Neutral Units or enemy Heroes
       *    without resolving them (Combat begins only if they END their movement
       *    there), and over yellow (sealed) borders and blocked fields (never
       *    ending on a blocked field — same "pass-over" rule as Fly).
       *  - Expert (`expert: true`): also gains all of the above PLUS may cross the
       *    coastline (land↔sea) with no halt, and may step directly between a
       *    Surface and a Subterranean Tile without a Subterranean Gate — which
       *    neither Dimension Door nor Fly can do.
       * Translated into movement capabilities by getHeroMovementCapabilities and
       * read by the adventure pathfinding (canCrossEdge / classifyHeroStep).
       */
      type: "HERO_PATHFINDING";
      expert?: boolean;
    }
  | {
      /** Logistics (basic): step to an adjacent empty field at end of turn. */
      type: "END_TURN_ADJACENT_MOVE";
    }
  | {
      /** Golden Bow: your ranged units ignore the long-range penalty. */
      type: "RANGED_IGNORE_PENALTY";
    }
  | {
      /**
       * Moandor's Liches VI specialty: while held, the unit deals "elemental
       * damage" — like the elemental units' printed trait. Its attack value
       * can no longer be raised by attack cards (Bloodlust, Offense, the
       * Attack statistic, Bless's bonus…) or Attack tokens; debuffs such as a
       * Sorceress' Weakness still lower it.
       */
      type: "ELEMENTAL_DAMAGE";
    }
  | {
      /**
       * Zydar's Sorcery VI (ongoing): until the end of the Combat round,
       * the owner draws this many cards after each Spell they cast.
       */
      type: "DRAW_ON_SPELL_CAST";
      amount: number;
    }
  | {
      /**
       * Orb of Vulnerability (option A): for the rest of the Combat every unit's
       * innate special ability "related to spells" is switched off — magic
       * resistance (the Dwarves' die roll), spell-damage reduction (Golems,
       * Black Dragons, the Unicorns' aura), printed spell-school immunity
       * (Elementals, Efreet, Phoenix…) and the Pegasi's enemy-spell Power drain.
       * Combat-scoped and side-agnostic, so a single grant covers both armies.
       * (Anti-Magic is a Spell-granted effect, not a unit ability, so it stays.)
       */
      type: "SUPPRESS_SPELL_ABILITIES";
    }
  | {
      /**
       * Elemental Orbs (Orb of Driving Rain / Silt / Tempestuous Fire / the
       * Firmament), option A: while the owner holds this combat-scoped effect,
       * the effective Power of every Spell they cast from the matching School
       * (and the school-agnostic "any" spells, exactly as the +Power boosts
       * treat them) is doubled before any enemy Power reduction. Two orbs of the
       * same school would compound (×4), but the printed set ships one of each.
       */
      type: "SPELL_POWER_DOUBLE";
      school: SpellSchool;
    }
  | {
      /**
       * Adrienne's Fire Magic specialty: while the owner holds this combat-scoped
       * effect, every Spell they cast from the matching School (and the
       * school-agnostic "any" spells, exactly as SPELL_POWER_DOUBLE treats them)
       * is cast with this much extra Power. Stacks additively across copies and
       * with the once-per-cast Power-card bonus; read in getCurrentSpellPower.
       */
      type: "SPELL_SCHOOL_POWER_BONUS";
      school: SpellSchool;
      amount: number;
    }
  | {
      /**
       * Pendant of Second Sight, option A: the selected unit "cannot gain a
       * Paralysis token during this Combat". A unit-scoped, combat-duration
       * immunity that blocks every Paralysis source — the Blind Spell
       * (PLACE_PARALYSIS) and the medusa-style attack/retaliation follow-ups —
       * exactly like the printed `ignore-paralysis` unit ability does.
       */
      type: "PARALYSIS_IMMUNITY";
    }
  | {
      /**
       * Interference ability: the affected unit reduces the damage it takes
       * from Spells by this much — a Defense bonus that, unusually, also blunts
       * Spell damage. Summed into totalSpellDamageReduction alongside the
       * Golems'/Black Dragons' printed "reduce Spell damage" passives. The same
       * Interference play also grants a plain DEFENSE_BONUS (vs attacks), so a
       * unit carrying it gets the bonus against both attacks and spells.
       */
      type: "SPELL_DAMAGE_REDUCTION";
      amount: number;
    }
  | {
      /**
       * Disrupting Ray: while held, the unit "cannot use their special ability".
       * getUnitAbilityDefinitions returns [] for a unit carrying this modifier,
       * so every ability read — attack follow-ups, passives, activation
       * abilities, printed immunities — sees nothing, for whatever abilities the
       * unit has now OR gains later, until the suppression ends. Combat-scoped
       * and removable (Dispel/Cure lift it). Read through effectAppliesToUnit, so
       * a Tower Titan/Gargoyle that ignores ongoing effects is not suppressed.
       */
      type: "UNIT_ABILITY_SUPPRESSED";
    }
  | {
      /**
       * Orb of Inhibition (option A): for the rest of the Combat every Spell and
       * Hero-Specialty CARD deals 0 damage — checked at the single card-damage
       * chokepoint (reducedCardDamage), so direct, area, Xyron and Chain Lightning
       * hits are all nullified for both armies. Unit-ability damage (the Faerie
       * bolt, retaliation) is NOT a card and is untouched; the Orb's option B
       * handles abilities separately. Global and side-agnostic, so one grant
       * covers everyone.
       */
      type: "NULLIFY_CARD_DAMAGE";
    }
  | {
      /**
       * Pendant of Negativity (option B): an ongoing, unit-scoped immunity to
       * Spells of the named School(s) cast on this unit — "ignore the effect of a
       * spell from the School of Air Magic cast on this unit". Like the printed
       * Elemental immunity it bars targeting and any area splash; a school-agnostic
       * spell ("any", e.g. Magic Arrow) counts as belonging to every School, so an
       * air immunity also turns Magic Arrow aside (mirroring this Pendant's own
       * cancel side and Protection from Air). Read through effectAppliesToUnit, so
       * a Tower Titan/Gargoyle that ignores ongoing effects is not protected by it.
       * NOT negated by Orb of Vulnerability (an artifact effect, not a unit
       * ability — exactly like Anti-Magic).
       */
      type: "SPELL_SCHOOL_IMMUNE";
      schools: SpellSchool[];
    }
  | {
      /**
       * Recanter's Cloak: a global, combat-scoped restriction on spell-casting
       * that binds BOTH heroes (the wearer included), enforced at the spell
       * resolution chokepoint (resolveTopStack) and the cast-offer gate.
       *   • `lockAll` (option B) — no Hero may cast any Spell this Combat.
       *   • `minPower` (option A) — a Spell that resolves below this Power has no
       *     effect, so "no Hero can use spells with Power 0" forces every cast to
       *     be boosted to Power ≥ 1 (minPower 1) to do anything.
       * Side-agnostic (scope "global"), so one grant covers both armies.
       */
      type: "SPELL_CAST_RESTRICTION";
      lockAll?: boolean;
      minPower?: number;
    }
  | {
      /**
       * Shaman's Puppet (option A): the affected unit rolls its Attack die with
       * "disadvantage" — it rolls two Attack dice and resolves the LOWER result
       * for every attack it makes — until the end of its activation. Read in
       * getAttackRollMode (the single roll-mode chokepoint), so it applies to the
       * unit's main attacks and move-and-attacks alike. Unit-scoped and removable;
       * a Tower Titan/Gargoyle that ignores ongoing effects shrugs it off through
       * effectAppliesToUnit, exactly like every other unit debuff.
       */
      type: "ATTACK_ROLL_DISADVANTAGE";
    }
  | {
      /**
       * Spirit of Oppression (option A): a global, combat-scoped lockout of every
       * Attack-die reroll for BOTH players — the printed "neither player can use
       * the positive morale token or reroll Attack dice". The positive morale
       * token is itself just an Attack-die reroll source in this engine
       * (buildRerollSources), so a single switch at that chokepoint covers both
       * clauses: while any NO_ATTACK_DIE_REROLL effect is on the table, no reroll
       * source (unit ability, Luck/Fortune/Mirth effect, or the morale token) is
       * offered to anyone. Side-agnostic (scope "global").
       */
      type: "NO_ATTACK_DIE_REROLL";
    }
  | {
      /**
       * Ingham's Zealots VI: while this (friendly) unit attacks, its target's
       * Defense counts as 0 (the printed "your Zealots unit ignores its targets'
       * Defense"). A unit-scoped, combat-duration modifier read at attack
       * resolution alongside the innate Behemoth/Manticore defense-pierce.
       */
      type: "IGNORES_DEFENSE";
    }
  | {
      /**
       * Lord Haart (Necropolis) Dread Knights IV: while this (friendly) unit is
       * the target of an enemy Retaliation Attack, that Retaliation Attack rolls
       * two Attack dice and resolves the lower — the active-effect twin of the
       * Dread Knights unit's printed RETALIATION_AGAINST_DISADVANTAGE ability.
       */
      type: "RETALIATION_AGAINST_DISADVANTAGE";
    };

export type ActiveEffectDefinition = {
  name: string;
  scope: "player" | "unit" | "global";
  modifiers: ActiveEffectModifier[];
  duration: EffectDurationDefinition;
  polarity?: "positive" | "negative" | "neutral";
  removable?: boolean;
};

export type EffectDefinition =
  | {
      type: "DEAL_DAMAGE";
      amount?: number;
      amountByPower?: Record<number, number>;
      damageKind: DamageKind;
    }
  | {
      type: "HEAL_DAMAGE";
      amount?: number;
      amountByPower?: Record<number, number>;
      /** Rion's Battlefield Medic: "then draw N card(s)" after the heal. */
      drawCards?: number;
      /**
       * Rion's Battlefield Medic IV/VI: "Remove … damage or paralysis …" — also
       * clears the target's Paralysis token (a heal of 0 still clears it).
       */
      removeParalysis?: boolean;
    }
  | {
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS";
      amount?: number;
      amountByPower?: Record<number, number>;
      removePolarity: "negative" | "any-removable";
      /**
       * Cure: "Remove any effect or paralysis from the selected unit" — also
       * clears the target's Paralysis token (a heal of 0 still clears it).
       */
      removeParalysis?: boolean;
      /** Astra's Cure I: "… then draw N card(s)" after the cleanse. */
      drawCards?: number;
    }
  | {
      type: "CANCEL_SPELL";
      maxPower?: number;
      expertIgnoresMaxPower?: boolean;
      /**
       * Protection from Air/Earth/Fire/Water: the cancel only applies to a spell
       * belonging to one of these Schools. A school-agnostic spell ("any", e.g.
       * Magic Arrow) counts as belonging to every School, so any Protection can
       * end it. Resistance leaves this undefined (it cancels any school).
       */
      schools?: SpellSchool[];
      /**
       * Protection from X gates on the cancelled spell's printed LEVEL, not its
       * power: the basic play cancels a Basic spell only; the expert play
       * (expertIgnoresMaxSpellLevel) cancels a Basic OR Expert spell.
       */
      maxSpellLevel?: "basic" | "expert";
      expertIgnoresMaxSpellLevel?: boolean;
      /**
       * Boots of Polarity: a chance-based cancel. When set, playing the reaction
       * rolls `count` Attack dice and the player keeps the best ("choose one");
       * the spell is ignored only if a kept die shows `successFace` (the "+1"
       * face, value 1). A failed roll still spends the card but lets the spell
       * resolve — unlike the deterministic Resistance/Protection cancels above.
       */
      diceRoll?: { count: number; successFace: number };
    }
  | {
      type: "DRAW_CARDS";
      amount: number;
      expertAmount?: number;
      /**
       * Charm of Mana / Shackles of War: after drawing, the player discards this
       * many cards from hand through a follow-up choice ("draw 2, then discard
       * 1"). When `thenDiscardDrawnOnly` is set the choice is limited to the
       * cards just drawn ("draw 2, keep 1, discard the other" — Shackles).
       */
      thenDiscard?: number;
      thenDiscardDrawnOnly?: boolean;
    }
  | {
      /**
       * "OR" cards (mostly artifacts): the player chooses exactly one of the
       * printed options when playing the card. Each option may carry its own
       * timing trigger (e.g. "+1 Power" is only useful while casting a spell,
       * while "Draw 1 card" is an anytime instant).
       */
      type: "CHOOSE_ONE";
      options: CardOptionDefinition[];
    }
  | {
      type: "ADD_COMBAT_STAT";
      stat: "attack" | "defense";
      amount: number;
      expertAmount?: number;
      /** Spell instants (Bloodlust, Stone Skin…): amount scales with Power. */
      amountByPower?: Record<number, number>;
      /** Sword of Judgement style: +1 per card paid via the option's cost. */
      perCostCard?: number;
      /** Offense/Armorer: "Then draw 1 card." */
      drawCards?: number;
      /**
       * Blackshard of the Dead Knight: "discard 1 card. If the discarded card
       * was a spell, draw 1 card." When set, the play draws 1 card only if one
       * of the cards paid through the option's `cost.discardCards` was a Spell.
       */
      drawIfCostCardSpell?: boolean;
      /** Sword of Hellfire / Shield of the Damned: the unit also takes damage. */
      selfDamage?: number;
      /**
       * The stronger side of the Gnoll artifacts: the boosted unit also takes a
       * lasting combat token until the end of the Combat, mirroring the bonus on
       * the other stat (each floored at 0 — "minimum 0"):
       *  - Buckler of the Gnoll King: "+2 defense, then -1 attack" → a Weakness
       *    token on the defending unit.
       *  - Greater Gnoll's Flail: "+2 attack, then -1 defense" → a Corrosion
       *    token on the attacking unit.
       */
      selfStatPenalty?: { stat: "attack" | "defense"; amount: number };
      /** Bloodlust/Golden Bow: only these unit types may receive the bonus. */
      unitTypes?: UnitType[];
      /** Precision: the shot also ignores the ranged combat penalty. */
      ignoreRangedPenalty?: boolean;
      /** Hero specialties: the bonus doubles when the named unit is involved. */
      doubleForUnitName?: string;
      /**
       * Ivor's Elves IV: the bonus doubles when the unit it lands on is of this
       * unit TYPE (his "doubles for a ranged unit") — the type-keyed sibling of
       * `doubleForUnitName`. The attacker is checked for an attack bonus, the
       * defender for a defense bonus, exactly like the name-keyed doubling.
       */
      doubleForUnitType?: UnitType;
      /**
       * Merist's Stone Skin I: this much EXTRA defense is added on top of
       * `amount` when the buffed (defending) unit is orthogonally adjacent to the
       * attacker — "+1 defense, and +1 more if it is adjacent to the attacker."
       * Only meaningful for a `defense` reaction played in the attack window.
       */
      extraIfAdjacentToAttacker?: number;
      /**
       * Cyra's Haste IV: the bonus doubles when the attacked unit has strictly
       * higher (effective) Initiative than the attacker — rewards striking
       * faster foes.
       */
      doubleIfDefenderInitiativeHigher?: boolean;
      /**
       * Gundula IV: the inverse — the bonus doubles when YOUR (attacking) unit has
       * strictly higher (effective) Initiative than the attacked unit ("doubles if
       * the unit's Initiative is higher than the attacked unit's").
       */
      doubleIfAttackerInitiativeHigher?: boolean;
      /**
       * Ash's Bloodlust I/VI: "Place a Black cube on that unit." A Black cube on
       * a unit's card means it has spent its Retaliation — it can no longer
       * perform a Retaliation Attack this round (Counterstrike's CLEAR_RETALIATION
       * removes it). On an attack-buff reaction (UNIT_ATTACK_DECLARED, self) the
       * cube lands on the buffed ATTACKER once the attack resolves: the engine
       * sets that unit's `retaliatedThisRound = true`.
       */
      placeBlackCube?: boolean;
      /**
       * Ash's Bloodlust VI: "and ignores Retaliation Attacks." For this single
       * buffed attack the defender does not retaliate (the one-off equivalent of
       * the `ignores-retaliation` unit ability).
       */
      ignoresRetaliation?: boolean;
      /**
       * Tarnum (Fortress) Basilisks VI: "your selected unit uses its special
       * ability regardless of the required roll's result." On the buffed attack
       * (UNIT_ATTACK_DECLARED, self) every die-gated after-attack ability fires as
       * if its face was rolled — wired through stackItem.forceAbilityRollsThisAttack.
       */
      forceAbilityRolls?: boolean;
    }
  | {
      /** Centaur's Axe: the attack die's outcome counts three times. */
      type: "TRIPLE_ATTACK_DIE";
    }
  | {
      /**
       * Sandro's Cloak: the specialty card is physically placed on a matching
       * unit card and replaces its printed statistics (and silences its
       * printed abilities) until the covering card is defeated — across
       * combats. Defeat discards the specialty card and reveals whatever is
       * under it with the excess damage.
       */
      type: "TRANSFORM_UNIT";
      targetUnitName: string;
      targetVariants: ("few" | "pack")[];
      newName: string;
      attack: number;
      defense: number;
      health: number;
      initiative: number;
      cardImage?: string;
      /**
       * Cloak VI ("Legion"): the card may be placed on Few, Pack or even a
       * Horde, always stays on top of the stack, and the unit under it may
       * still be reinforced/upgraded while the Legion's statistics apply.
       */
      alwaysOnTop?: boolean;
    }
  | {
      /**
       * Necromancy: play after winning a Combat (never a Quick Combat) —
       * Reinforce a bronze or silver unit (expert: any unit) for half the
       * gold cost, rounded down. Necropolis heroes only.
       */
      type: "NECROMANCY_REINFORCE";
      /**
       * Vidomina's specialties pin the reinforce tier regardless of expert
       * crowns: I = "basic" (bronze/silver), VI = "expert" (any unit). When
       * omitted (the printed Necromancy ability) the played mode decides.
       */
      forceMode?: "basic" | "expert";
    }
  | {
      type: "ADD_SPELL_POWER";
      amount: number;
      expertAmount?: number;
      drawCards?: number;
      /** Breastplate of Brimstone: +1 more per card paid via the cost. */
      perCostCard?: number;
      /** Elemental Magic abilities: only spells of this school qualify. */
      schoolOnly?: SpellSchool;
    }
  | {
      /**
       * Tome of Air/Earth/Fire/Water (option B): "When playing a {School} Magic
       * spell, resolve its effect without paying the Power cost." Played as a
       * SPELL_CAST_STARTED self reaction during a turn/scroll cast of a matching
       * spell, it lifts that cast to the spell's maximum Power breakpoint for
       * free (added through the normal Power channel, so every readout, the
       * Resistance gate and a Mysticism recall stay consistent). A
       * school-agnostic "any" spell qualifies for any Tome.
       */
      type: "SET_SPELL_POWER_MAX";
      schoolOnly: Exclude<SpellSchool, "any">;
    }
  | { type: "GAIN_MORALE"; amount: number; expertDrawCards?: number }
  | {
      /** Estates, gold/resource artifacts: gain resources immediately. */
      type: "GAIN_RESOURCES";
      gain: ResourceCost;
      expertGain?: ResourceCost;
      /**
       * Sephinroth's Valuables I: "Pay `goldCost` gold to gain …". The player must
       * have the gold; it is spent before `gain` is granted (gated in legal-actions
       * so the option is hidden when unaffordable).
       */
      goldCost?: number;
    }
  | {
      /**
       * Octavia's "Gold" (IV/VI) and Melodia's "Fortune" (I/IV/VI) economic map
       * specialties — a compound, map-only play resolved in this order:
       *  1. gain `morale` positive-morale token(s) (Melodia I),
       *  2. if `locationDiceBonusTurn`, create a current-turn player effect adding
       *     +1 to the dice rolled & resolved at locations this turn (Melodia VI),
       *  3. roll `rollResourceDice` Resource dice — resolving exactly ONE when >1,
       *     through the existing CHOOSE_ONE in rollResourceDice (Octavia IV/VI,
       *     Melodia IV),
       *  4. gain `gold` (lands after the chosen die).
       * The interactive dice roll (and the trailing gold) run through a queued
       * map visit, so this option is map-only.
       */
      type: "RESOURCE_FORTUNE_PLAY";
      morale?: number;
      gold?: number;
      rollResourceDice?: number;
      locationDiceBonusTurn?: boolean;
    }
  | {
      /**
       * Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion) discount side.
       * An INSTANT, map-only effect: playing it opens a prompt to choose ONE
       * recruitable/reinforceable unit, then banks a one-shot voucher of `amount`
       * gold reserved for that exact unit (player.recruitDiscounts). The artifact
       * card resolves to the discard pile at once — it is never an ongoing effect.
       * The voucher never stacks (the cost path takes the single largest discount)
       * and is consumed when its unit is recruited/reinforced. See
       * `queueLegionDiscountChoice` and the `BANK_RECRUIT_DISCOUNT` visit step.
       */
      type: "GAIN_RECRUIT_DISCOUNT";
      amount: number;
    }
  | {
      /** Logistics expert, Boots of Speed: the main hero gains movement. */
      type: "GAIN_HERO_MOVEMENT";
      amount: number;
      expertAmount?: number;
      /** Angel Wings / Fly: also move through blocked fields this turn. */
      moveThroughThisTurn?: boolean;
      /** Water Walk: also cross/stop on sea fields this turn. */
      waterWalkThisTurn?: boolean;
      /** Shield of Naval Glory (Sea side): also draw this many cards. */
      drawCards?: number;
    }
  | {
      /**
       * Dimension Door: move the casting player's Hero up to `fields` fields,
       * ignoring obstacles and the fields in-between, then resolve the
       * destination normally (a guarded/enemy field starts combat). The Power
       * paid raises the reach (Power 0/2/4 -> 1/2/3 fields), encoded as the
       * higher-cost options of the spell's CHOOSE_ONE.
       */
      type: "DIMENSION_DOOR";
      fields: number;
    }
  | {
      /**
       * View Earth (Basic Earth, Map): capture an enemy-owned Mine within
       * `withinFields` hexes of the casting player's main Hero — the owner's
       * Faction cube and the Mine's ongoing production are replaced with the
       * caster's (no first-flag income, since the Mine was already flagged). The
       * Power paid raises the reach (Power 0/1/2 -> 1/2/3 fields), encoded as the
       * higher-cost options of the spell's CHOOSE_ONE. Resolved through the
       * "view-earth" pending choice (which Mine to take).
       */
      type: "VIEW_EARTH";
      withinFields: number;
    }
  | {
      /** Helm of Heavenly Enlightenment: an extra expert use this round. */
      type: "GAIN_EXPERT_USE";
      amount: number;
    }
  | {
      /**
       * Scholar (basic), Rib Cage, Crown of Dragontooth, Skull Helmet,
       * Mystic Orb: pick card(s) from your discard pile into hand.
       */
      type: "TAKE_FROM_DISCARD";
      count: number;
      filter?: "spell" | "non-artifact" | "spell-or-specialty" | "magic-arrow";
      /** Only the top N discard cards qualify (Mystic Orb of Mana). */
      fromTop?: number;
      /** Rib Cage: shuffle the rest of the discard pile into the deck. */
      shuffleRestIntoDeck?: boolean;
    }
  | {
      /**
       * Scholar (expert): remove up to `count` Statistic cards from hand or
       * discard, gaining each one's Empowered version on top of the discard pile
       * (distinct Empowered types only — "up to N different"). Opens an
       * interactive swap via the SCHOLAR_EMPOWER_PICK / SCHOLAR_EMPOWER_GIVE
       * visit steps (queued as a "visit-steps" reward). The Scholar card itself
       * is removed by the option's cost.removeSelf, matching "Remove the Scholar".
       */
      type: "SCHOLAR_EMPOWER_SWAP";
      count: number;
    }
  | {
      /** Card-driven Search (Breastplate of Brimstone, Crown of Dragontooth). */
      type: "CARD_DECK_SEARCH";
      deck: "spells" | "artifacts" | "abilities";
      count: number;
    }
  | {
      /**
       * Spellbinder's Hat (option A): "Remove 1 card from your hand, then
       * Search(<count>) the card's deck." Opens the REMOVE_HAND_CARD →
       * search-same-deck flow (filter "removable" = only abilities, artifacts and
       * spells, which are the cards that have a corresponding deck to dig). The
       * deck searched is whichever deck the removed card belongs to.
       *
       * `filter` narrows which hand cards may be removed (Miriam's Scouting I is
       * "ability" only; her IV/VI and the Hat default to "removable"). It must be
       * a kind that maps to a searchable deck so "search-same-deck" has a target.
       */
      type: "REMOVE_HAND_CARD_THEN_SEARCH";
      count: number;
      filter?: "ability" | "removable";
      /**
       * Miriam IV/VI: grant a CHOICE of the higher split decks (Major artifacts,
       * Expert spells) in the follow-up Search, beyond the player's usual
       * eligibility. The Spellbinder's Hat leaves this unset (basic deck only).
       */
      tieredReach?: boolean;
    }
  | {
      /**
       * Spellbinder's Hat (option B): "Remove this card and another one from your
       * hand or discard pile." The Hat itself leaves via the option's
       * cost.removeSelf; this then removes one more card the player picks from
       * hand OR discard pile (any card — "any card may be removed together with
       * the Spellbinder's Hat").
       */
      type: "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD";
    }
  | {
      /** Dragon Wing Tabard: discard random card(s) from the enemy hand. */
      type: "RANDOM_ENEMY_DISCARD";
      count: number;
    }
  | {
      /** Hourglass of the Evil Hour: a positive enemy loses morale. */
      type: "ENEMY_MORALE_STRIP";
    }
  | {
      /** Hourglass option 2: roll the Attack die; gain morale on the result. */
      type: "ROLL_FOR_MORALE";
      onRoll: number;
    }
  | {
      /**
       * Eagle Eye: dig the Spell deck for the first Basic (basic play) or
       * Expert (expert play) spell; take it or discard it; reshuffle.
       *
       * Tome of Air/Earth/Fire/Water (option A) sets `school`: instead of
       * matching by level, the dig finds the first spell of that School (any
       * level; a school-agnostic "any" spell counts as every School), then
       * take/discard/reshuffle exactly as Eagle Eye does.
       */
      type: "EAGLE_EYE_DIG";
      school?: Exclude<SpellSchool, "any">;
    }
  | {
      /** Town Portal: move the hero to a controlled town or settlement. */
      type: "TELEPORT_HERO_TO_TOWN";
      /**
       * Power 2/4: arriving also grants the hero +1/+2 movement. Encoded as the
       * higher-cost options of the spell's CHOOSE_ONE (paid with power-source
       * cards), like Fly / Dimension Door.
       */
      movementBonus?: number;
    }
  | {
      /** Speculum: discover a face-down tile adjacent to the hero's tile. */
      type: "DISCOVER_TILE_CARD";
    }
  | {
      /** Counterstrike: clear the retaliation marker of one of your units. */
      type: "CLEAR_RETALIATION";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /** Bless: ignore the Attack die; higher Power adds attack on top. */
      type: "IGNORE_ATTACK_DIE";
      attackBonusByPower?: Record<number, number>;
    }
  | {
      /**
       * Shield of the Dwarven Lords (option A): a defender's reaction played
       * AFTER the Attack die is rolled. It ignores the rolled die (the face
       * contributes 0 to the attack) and every additional effect that die face
       * triggered — Dread Knights' Death Blow, the Minotaurs' draw, the
       * Thunderbird/Wyvern follow-up bolt, the Azure/Basilisk paralysis, the
       * Zombie/Manticore die-defense bonus. Only offered in the dedicated
       * post-roll window (ATTACK_DIE_SETTLED), never as a free combat instant.
       */
      type: "IGNORE_ATTACK_DIE_RESULT";
    }
  | {
      /**
       * Bowstring of the Unicorn's Mane (option A): "Play this card before a unit
       * activates. Activate one of your ranged units that has not been activated
       * this round." The chosen friendly ranged unit (target) is made the active
       * unit and takes a full out-of-order activation now. Offered in the shared
       * pre-activation window (trigger controller "any"), so either player may
       * interject — including before an enemy unit acts.
       */
      type: "ACTIVATE_RANGED_UNIT";
      /** Valeska's Marksmen VI: allow re-activating an already-activated unit. */
      allowAlreadyActivated?: boolean;
    }
  | {
      /**
       * Helm of the Alabaster Unicorn (option B): "Cast a spell from the top of the
       * spell deck discard pile and Remove this card." Played as a `fromSpellDeck`
       * CAST_SPELL (mirroring a Spell Scroll cast), NOT a PLAY_CARD: the top card of
       * the shared Spell-deck discard pile is cast at the caster's normal Power, the
       * spell card stays in that discard pile, and the Helm is removed from the game.
       * This marker only flags the card as implemented and tells the legal-action
       * layer to offer that cast; it is never applied from playCard.
       *
       * Valeska's Marksmen VI sets `allowAlreadyActivated`: she may re-activate a
       * ranged unit that has already acted this round (the printed "even if that
       * unit has already been activated"). The Bowstring leaves it unset, so it
       * keeps targeting only not-yet-activated ranged units.
       *
       * Ciele's Magic Arrow IV (Conflux) reuses this marker with `spellId` set:
       * instead of the discard top, the offer layer finds that specific Spell in
       * the Spell-deck discard pile (any copy) and casts it for free. The enabling
       * card is a hero-specialty, so the cast sends it to the discard pile (to be
       * redrawn) rather than removing it like the Helm.
       */
      type: "CAST_FROM_SPELL_DISCARD";
      /** Ciele IV: only a Spell with this id may be cast (e.g. spell.magic_arrow). */
      spellId?: string;
    }
  | {
      /**
       * Misfortune (Basic Fire): the defender plays it the instant an enemy unit
       * declares an attack — in a dedicated window BEFORE the attacker can buff —
       * to negate that attack's Attack die result AND lock the attacker out of
       * increasing the attack from any source for this attack (cards, town/cube
       * boosts, the die). Grade-gated on the ATTACKING unit (Power 0/1/2 →
       * bronze/silver/gold). Engine: sets the attack's `negateAttackBuffs` +
       * `attackDieCancelled` modifiers; the legal-action layer then refuses every
       * attack-increasing reaction to the attacker for the rest of the attack.
       */
      type: "NEGATE_ATTACK";
      grade?: UnitGrade;
    }
  | {
      /** Anti-Magic: spell immunity for a unit (tier rises with Power). */
      type: "CREATE_SPELL_IMMUNITY";
      gradeByPower: Record<number, UnitGrade>;
      duration: EffectDurationDefinition;
    }
  | {
      /**
       * Fire Shield: a melee (ground/flying) attacker takes damage after its
       * attack. The Fire Shield spell scales with Power (`amountByPower`);
       * Rashka's Demoniac specialty uses a flat `amount` instead, doubled when
       * placed on the named unit (`doubleForUnitName`, his Efreet at level VI).
       */
      type: "CREATE_FIRE_SHIELD";
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      doubleForUnitName?: string;
      removable?: boolean;
    }
  | {
      /**
       * Spell Ward: the chosen friendly unit reduces the damage it takes from
       * Spells (and Hero-Specialty damage) by `amount` for the duration, summed
       * into totalSpellDamageReduction alongside the Golems' printed passive.
       * Clancy's Unicorns specialty (VI) uses a flat `amount`, doubled when the
       * ward lands on his signature unit (`doubleForUnitName`, his Unicorns).
       */
      type: "CREATE_SPELL_WARD";
      amount: number;
      duration: EffectDurationDefinition;
      doubleForUnitName?: string;
      removable?: boolean;
    }
  | {
      /** Haste / Slow / initiative artifacts: a lasting initiative shift. */
      type: "CREATE_INITIATIVE_BUFF";
      name: string;
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
      /** Hero specialties: the bonus doubles when placed on the named unit. */
      doubleForUnitName?: string;
    }
  | {
      /**
       * Lord Haart (Necropolis) Dread Knights I/VI: an INSTANT reaction, played
       * when an enemy declares a Retaliation Attack against one of your units.
       * Reduces THAT retaliation's damage by `amount` (1 at level I, 2 at VI),
       * doubled when the unit being retaliated against is the named unit (his
       * Dread Knights). It is written onto the pending retaliation's
       * `retaliationDamageReductionInstant` and consumed when that attack
       * resolves — it never lingers as an ongoing effect, so it fires only on
       * the single retaliation whose window the player answered.
       */
      type: "REDUCE_RETALIATION_DAMAGE";
      amount: number;
      doubleForUnitName?: string;
    }
  | {
      /** Vial of Lifeblood: +1 printed HP for this combat. */
      type: "ADD_UNIT_MAX_HEALTH";
      amount: number;
      /** Hero specialties: the bonus doubles when placed on the named unit. */
      doubleForUnitName?: string;
    }
  | {
      /** Fireball: spell damage to the target and one unit adjacent to it. */
      type: "AREA_DAMAGE_ADJACENT";
      amountByPower: Record<number, number>;
    }
  | {
      /**
       * Xyron's Inferno: select a space (occupied or empty); every unit on that
       * space and every unit orthogonally adjacent to it — friend or foe — takes
       * `amount` damage. The discard cost is carried on the card option.
       */
      type: "AREA_DAMAGE_ALL_ADJACENT";
      amount: number;
    }
  | {
      /**
       * Area blast that damages up to `adjacentPicks` units adjacent to a centre
       * (the chosen space, or the chosen unit's space), letting the caster choose
       * which when more than that are adjacent. `includeCenter` also damages the
       * unit on the centre space (Meteor Shower hits its target; Frost Ring rings
       * the centre and spares it). Friend or foe alike are hit. Damage is fixed
       * (`amount`, hero-specialty options) or power-scaled (`amountByPower`,
       * Frost Ring's spell cast).
       */
      type: "AREA_DAMAGE_PICK_ADJACENT";
      amount?: number;
      amountByPower?: Record<number, number>;
      includeCenter: boolean;
      adjacentPicks: number;
    }
  | {
      /**
       * Deemer's Meteor Shower IV: shuffle the player's whole discard pile back
       * into their deck, then draw `drawCards` card(s).
       */
      type: "RESHUFFLE_DISCARD_THEN_DRAW";
      drawCards: number;
    }
  | {
      /**
       * Gem's First Aid: take the named war machine card from the shared
       * supply into hand at no cost. When the supply has none left (already
       * taken — the player "already has" it), draw `fallbackDrawCards` instead.
       */
      type: "GAIN_WAR_MACHINE";
      warMachineCardId: CardId;
      fallbackDrawCards?: number;
      /** Torosar's Ballista I: pay this much gold to gain the war machine. */
      goldCost?: number;
    }
  | {
      /**
       * Solmyr's Chain Lightning (I: 1/1/0, VI: 2/1/1) and the Chain Lightning
       * Spell: the selected unit takes `damages[0]`; the remaining values are
       * dealt to the units closest to it (friend or foe), the caster choosing
       * which closest unit takes which on ties or when more than one nonzero
       * value is left. A value of 0 means that closest unit is skipped (its
       * damage routed away from an ally).
       *
       * Hero specialties use the fixed `damages`. The Spell scales its
       * allocation with the Power paid via `damagesByPower` (0 → 1/1/1,
       * 2 → 2/1/1, 4 → 3/2/1) — the array at the highest threshold the paid
       * Power reaches is used.
       */
      type: "CHAIN_LIGHTNING";
      damages?: number[];
      damagesByPower?: Record<number, number[]>;
    }
  | {
      /**
       * Blind Spell: place a Paralysis token on the selected enemy unit, gated
       * by the Power paid (0 → bronze, 1 → silver, 2 → gold). A paralysed unit
       * skips its next activation (the token is removed instead) and the token
       * comes off the moment the unit takes any damage. Casting on a unit above
       * the unlocked grade does nothing — exactly like Anti-Magic's gate.
       */
      type: "PLACE_PARALYSIS";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Casmetra's Sorceresses VI (option A): place a Weakness combat token on a
       * chosen unit for `rounds` Combat rounds (the same −N attack token the Cove
       * Sorceresses place). Not tier-gated — it reaches any unit, like the unit
       * ability — so a Creature Bank defender is a legal target too.
       */
      type: "PLACE_WEAKNESS_TOKEN";
      amount: number;
      rounds: number;
    }
  | {
      /**
       * Sorrow Spell (Instant reaction on UNIT_ACTIVATION_STARTED): when an
       * enemy unit is about to activate, skip its activation. The grade reached
       * is set by the Power paid (0 → bronze, 2 → silver, 4 → gold), modelled as
       * one CHOOSE_ONE option per grade — bronze free, silver/gold cost a Power
       * VALUE (`powerCost` 2/4) met by the caster's standing spell Power plus the
       * printed Power of any discarded power-source cards, so one +4 artifact (or
       * a +2 statistic) can reach a grade instead of forcing N separate discards.
       */
      type: "SKIP_ACTIVATION";
      grade: UnitGrade;
    }
  | {
      /**
       * Slayer Spell (Instant reaction on UNIT_ATTACK_DECLARED, attacker's
       * side, gold defender only): roll the Attack die `rollsByPower` times and
       * apply every result except a "-1" (each "+1" adds 1 to the attack), then
       * draw 1 card. Power 0 → 2 rolls, 2 → 4, 4 → 6.
       */
      type: "SLAYER_ATTACK";
      rollsByPower: Record<number, number>;
    }
  | {
      /**
       * Inferno Spell (Activation): select a space, roll the Attack die
       * `rollsByPower` times, and every unit on that space and the orthogonally
       * adjacent spaces (friend or foe) takes 1 damage for each "+1" rolled.
       * Power 0 → 1 roll, 1 → 2, 2 → 4.
       */
      type: "INFERNO";
      rollsByPower: Record<number, number>;
    }
  | {
      /**
       * Forgetfulness Spell (Activation): the selected enemy ranged unit cannot
       * attack during its next activation. The grade reached scales with the
       * Power paid (0 → bronze, 1 → silver, 2 → gold). Backed by a
       * UNIT_CANNOT_ATTACK effect with the "next-activation" duration.
       */
      type: "FORGETFULNESS";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Berserk Spell (Expert Fire, Activation): the selected unit MUST, during
       * its next activation, attack the nearest unit or move to the nearest unit
       * and attack it (friend or foe — the berserked unit may be forced onto its
       * own allies, who retaliate as normal). The reachable grade rises with the
       * Power paid (0 → bronze, 2 → silver, 4 → gold), exactly like Blind: casting
       * on a unit above the unlocked grade does nothing. Backed by a
       * BERSERK_FORCED_ATTACK effect with the "next-activation" duration.
       */
      type: "BERSERK";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Teleport Spell (Expert Water, Activation): move one of the caster's units
       * to any empty space on the combat board, ignoring obstacles, other units
       * and the distance in-between. The reachable grade of the moved unit rises
       * with the Power paid (0 → bronze, 1 → silver, 2 → gold), like Anti-Magic /
       * Blind; casting on a unit above the unlocked grade does nothing. The
       * destination empty space is picked in a follow-up choice after the cast
       * (the "combat-teleport" OPTION_CHOICE). The move is a free relocation: it
       * costs the unit no movement and provokes no Retaliation.
       */
      type: "TELEPORT_UNIT";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Necklace of Swiftness (option B): "Move one of your units 1 space." A
       * combat play that relocates one of the controller's units to an empty
       * orthogonally-adjacent space. The destination is picked in a follow-up
       * "combat-step" OPTION_CHOICE (openUnitStepChoice / resolveUnitStepChoice).
       * A unit can never land on an occupied space, an obstacle, a Wall or the
       * Gate (isSpaceBlockedForSummon); because the hop is a single step it never
       * passes *over* anything, so flying is irrelevant. The move is free: it
       * costs the unit no activation and provokes no Retaliation.
       */
      type: "MOVE_UNIT_ADJACENT";
    }
  | {
      /**
       * Clone Spell (Expert Water, Cove Expansion): place a 1-Health copy of one
       * of the caster's units on an empty space orthogonally adjacent to it. The
       * Clone copies everything printed on the original's card (statistics, type,
       * printed abilities) but NONE of the ongoing effects/tokens layered on the
       * original, and it starts with maxHealth 1. It is destroyed the instant it
       * takes ANY damage, the instant it is attacked (even for 0 damage), and the
       * instant its original leaves the Combat Board (see CombatUnitState.cloneOfUnitId
       * and combat-units.removeLinkedClones). The reachable grade of the cloned
       * unit rises with the Power paid (1 → bronze, 3 → silver, 5 → gold), the
       * Implosion tier ladder; below Power 1 nothing is cloned. The destination
       * empty space is picked in a follow-up choice after the cast (the
       * "combat-clone" OPTION_CHOICE). The "OR Instant: +1 Power" side is the
       * universal power-source discard, so it needs no dedicated option.
       */
      type: "CLONE_UNIT";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Dispel Spell (Basic Water): strip every removable ongoing effect from
       * the selected unit — Haste, Slow, Bless's bonus, Anti-Magic, Forgetfulness,
       * Fire Shield, an enemy's buffs… anything created `removable` and bound to
       * that unit. The reachable grade rises with the Power paid (0 → bronze,
       * 1 → silver, 2 → gold), exactly like Anti-Magic / Blind: casting on a unit
       * above the unlocked grade does nothing.
       *
       * The printed card also "removes effects from the space the unit occupies";
       * the engine models no space-bound (obstacle) effects, so only the unit's
       * own effects are removed — the complete behaviour for what is modelled.
       */
      type: "DISPEL_EFFECTS";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Frenzy Spell (Expert Fire, Instant on the attacker's side): the pending
       * attack ignores the attacked unit's Defense entirely — its Defense counts
       * as 0, the Shield/Defend roll included — reusing the same `ignoreDefense`
       * path as Elemental damage. Gated by the defender's grade (Power 0 → bronze,
       * 2 → silver, 4 → gold); the Power is paid as the chosen option's discard
       * cost, the cost-gated grade pattern shared with Resurrection / Magic Mirror.
       */
      type: "IGNORE_DEFENSE";
      /** Fixed pierced grade (legacy/cost-gated form). */
      grade?: UnitGrade;
      /**
       * Power→grade table (Frenzy): the pierced grade scales with the Power the
       * caster pools into the attack window, re-derived at resolution like Slayer.
       */
      gradeByPower?: Record<number, UnitGrade>;
    }
  | {
      /**
       * Torosar's Ballista specialty (I activate / IV / VI). `grant` fields one
       * extra Ballista for the combat or the rest of the game round ("this card
       * counts as a Ballista"); `activate` fires one of your Ballistas now (I)
       * or every Ballista you field (VI, after the grant). Either part may be
       * present alone.
       */
      type: "BALLISTA_SPECIALTY";
      grant?: "combat" | "game-round";
      activate?: "one" | "all";
    }
  | {
      /**
       * Gerwulf's Ballista IV/VI: "Discard your Ballista to inflict `amount`
       * damage on the selected unit." A combat play targeting an enemy unit:
       * the player must own an in-play war-machine card matching
       * `warMachineCardId` (a temporary Torosar-style grant cannot be discarded),
       * which is sent to the discard pile, then the chosen enemy takes `amount`
       * "effect" damage — the same physical Ballista shot, so spell-damage
       * reduction does not apply. Gated in legal-actions on owning that machine.
       */
      type: "DISCARD_WAR_MACHINE_DAMAGE";
      warMachineCardId: CardId;
      amount: number;
    }
  | {
      /**
       * Tarnum (Rampart) Sharpshooters VI: "Play at the start of Combat. Find a
       * `unitDefId` unit in the `tier` Neutral deck (or its discard pile) and add
       * it to your army for THIS Combat (discard it afterwards)." On play the card
       * is pulled from that Neutral deck and a TEMPORARY combat unit (no army card)
       * is placed on an empty cell on the player's side; when the Combat ends the
       * borrowed card returns to the Neutral discard pile. Gated to combat round 1
       * with the card available (legal-actions).
       */
      type: "BORROW_NEUTRAL_UNIT";
      unitDefId: string;
      tier: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /**
       * Tarnum (Dungeon)'s Dragons IV: "Choose a row (straight line of 5
       * consecutive spaces). Every unit in that row suffers `amount` damage."
       * The Combat board is 4 columns × 5 rows, so the only 5-space straight line
       * is a vertical column. Played on a chosen space (any-space target); every
       * living unit sharing that space's column — friend or foe — takes `amount`
       * "effect" damage (per-unit spell-damage reduction applies, like any card).
       */
      type: "DAMAGE_BATTLEFIELD_LINE";
      amount: number;
    }
  | {
      /**
       * Tarnum (Dungeon)'s Dragons VI (option A): "Remove a Black cube from or
       * place it on a Dragons unit." Toggles the selected unit's Retaliation
       * marker — if it has already spent its Retaliation this round
       * (`retaliatedThisRound`) the cube is removed (it may retaliate again);
       * otherwise a cube is placed (it cannot). The card's target restricts this
       * to a Dragons unit (friend or foe).
       */
      type: "TOGGLE_RETALIATION_MARKER";
    }
  | {
      /**
       * Artillery (basic side): deal `amount` damage to an enemy unit with the
       * lowest (effective) initiative — the same shot a Ballista makes, played
       * from hand without one. The card constrains its legal targets to the
       * slowest enemy/enemies (enemy-unit `lowestInitiativeOnly`), so a tie lets
       * the controller pick which slowest unit is hit. Deals "effect" damage.
       */
      type: "DAMAGE_LOWEST_INITIATIVE_ENEMY";
      amount: number;
    }
  | {
      /**
       * Septienna's Death Ripple specialty (I/IV/VI): deal `amount` damage to
       * EVERY enemy combat unit whose grade is one of `grades` (I -> bronze,
       * IV -> silver, VI -> gold + azure). A combat activation with no chosen
       * target — the engine finds the matching enemy units itself. Spell-damage
       * reduction (Gargoyles etc.) applies per struck unit, like any card damage.
       */
      type: "DAMAGE_ENEMY_UNITS_BY_GRADE";
      grades: UnitGrade[];
      amount: number;
    }
  | {
      /**
       * Tarnum (Castle)'s Ballista VI: "Choose `count` enemy units. Each of these
       * units suffers `amount` damage." A combat activation: the engine gathers
       * the caster's living enemy units and hits `count` of them for `amount`
       * each. When more than `count` are alive the caster picks which through the
       * shared area-pick choice (the same multi-pick used by Frost Ring / Meteor
       * Shower); with `count` or fewer enemies they are all hit at once. Per-unit
       * spell-damage reduction applies, like any card damage.
       */
      type: "DAMAGE_CHOSEN_ENEMIES";
      count: number;
      amount: number;
    }
  | {
      /**
       * Merist's Stone Skin IV: "All your units gain a Defense token." A combat
       * activation with no target — every living unit the caster controls gets a
       * Defense token (the Defend shield: a "+1" on the Defense die adds +1
       * Defense to an incoming attack). Units that already hold one are unchanged.
       */
      type: "GRANT_DEFENSE_TOKENS";
    }
  | {
      /**
       * Merist's Stone Skin VI: an ongoing combat effect. When played it places a
       * Defense token on all your units, and for the rest of the Combat your
       * Defense tokens grant their +1 Defense on a "0" OR a "+1" roll (instead of
       * only on a "+1"). Backed by a player-scoped DEFENSE_TOKEN_ON_ZERO modifier
       * that resolveDefendBonus reads, plus the same token grant as level IV.
       */
      type: "STONE_SKIN_AURA";
    }
  | {
      /**
       * Ivor's Elves I / VI: force the dice of an attack roll to a fixed face
       * value instead of rolling. Played as an instant in the attack window, it
       * sets the pending attack's `forcedRoll`; at resolution every die of that
       * attack shows `value` (a real face, so face-conditioned abilities still
       * read it). I forces 0 ("set all dice of the next attack roll to 0"); VI's
       * second option forces +1 ("set all dice of your roll to the values of your
       * choice" — +1 is the only value that maximises an attack, so the engine
       * realises the optimal choice). `value` is clamped to a real die face.
       */
      type: "FORCE_ATTACK_ROLL";
      value: number;
    }
  | {
      /**
       * Artillery (expert side): a declarative marker, never played through
       * PLAY_CARD. When the owner's Ballista fires at the start of a combat
       * round, the owner may play Artillery (spending one expert use) to resolve
       * that Ballista's shot against the SAME target `shots` times. Wired in
       * permanents.ts (processWarMachineRound / resolveWarMachineOption); the
       * engine reads `shots` from here so the card stays the source of truth.
       */
      type: "ARTILLERY_BALLISTA_VOLLEY";
      shots: number;
    }
  | {
      /**
       * First Aid's expert side: a declarative marker, never played through
       * PLAY_CARD. When the owner activates their First Aid Tent's heal, they may
       * play First Aid (spending one expert use, discarding the card) to resolve
       * that Tent heal against the SAME target `heals` times this round. Wired in
       * the Tent heal flow (USE_ACTIVE_EFFECT) — reducer.ts + legal-actions.ts —
       * so the engine reads `heals` from here and the card stays the source of
       * truth. Without an active First Aid Tent only the card's basic heal runs.
       */
      type: "FIRST_AID_TENT_VOLLEY";
      heals: number;
    }
  | {
      /**
       * Solmyr's Chain Lightning IV: dig up to `count` cards off the top of your
       * own Might and Magic deck, keep one in hand, and discard the rest.
       */
      type: "DECK_DIG_KEEP_ONE";
      count: number;
    }
  | {
      /**
       * Jeddite's Mysterious Warlock I/VI: dig up to `count` cards off the top of
       * your own deck, keep every card matching `filter` (Spell + Specialty) in
       * your hand, and discard the rest. No choice is needed — all matches are
       * kept — so this never opens a pending choice.
       */
      type: "DECK_DIG_KEEP_MATCHING";
      count: number;
      filter: "spell-or-specialty";
    }
  | {
      /**
       * Tazar's War Hero VI: draw the top card of the shared Artifact deck (the
       * Legacy "artifacts" deck, or the BINH Minor deck) straight to your hand.
       * The card's per-option `cost` pays the printed price (remove 1 card / or
       * discard 3 cards); this effect only performs the draw.
       */
      type: "DRAW_TOP_ARTIFACT";
    }
  | {
      /**
       * Adrienne's Fire Magic IV: Search (`count`) your own deck (reveal the top
       * `count`, keep one in hand, the rest go to your discard pile), THEN shuffle
       * your whole discard pile back into your deck. The reshuffle runs after the
       * pick resolves (the own-deck-pick choice carries `thenReshuffleDiscard`).
       */
      type: "SEARCH_DECK_THEN_RESHUFFLE";
      count: number;
    }
  | {
      /**
       * Alamar's Resurrection: played as a reaction on an enemy attack that
       * targets one of your units (normal attacks only — never spells or
       * specialty damage). If the attack would reduce that unit (of `grade` or
       * lower) to 0 HP it is cancelled — no damage and no Retaliation. The
       * option's discard cost (Power statistics / Spells) stands in for the
       * printed Power.
       */
      type: "CANCEL_LETHAL_ATTACK";
      grade: UnitGrade;
    }
  | {
      /**
       * Magic Mirror: an instant reaction when one of your units is about to be
       * targeted OR damaged by an enemy Spell. Choose a new target — any unit of
       * the paid grade (Power 0 → bronze, 1 → silver, 2 → gold), one option per
       * grade — picked in a follow-up choice after the card is played. Three
       * cases the engine handles (see getMagicMirrorReactions / chooseAbilityTarget):
       *  - a single-target cast aimed at your unit (Magic Arrow, Implosion…):
       *    the Spell re-points and resolves against the chosen unit;
       *  - an area cast that would damage your unit (Fireball's splash, Inferno's
       *    blast) even though its primary target is an enemy unit or a bare space:
       *    the blast recenters on the chosen unit (Inferno → that unit's space);
       *  - an instant combat debuff layered onto an attack (Curse on your
       *    defender, Weakness on your attacker): it is lifted off your unit and
       *    lands on the chosen unit as a lasting token, then the attack continues.
       */
      type: "REDIRECT_SPELL";
      grade: UnitGrade;
    }
  | {
      /**
       * Interference: an instant reaction to an enemy damaging Spell that
       * targets one of your units. Grants that unit +amount Defense for the
       * rest of the Combat — a Defense bonus that, unusually, also reduces the
       * incoming Spell's damage (and any later Spell damage to that unit). Basic
       * +1 / expert +2. Modelled as a unit-scoped effect carrying both a
       * DEFENSE_BONUS and a SPELL_DAMAGE_REDUCTION modifier.
       */
      type: "INTERFERE_SPELL";
      amount: number;
      /**
       * Interference's expert side grants +2 instead of +1. Optional: an
       * artifact (Plate of the Dying Light) that grants the same Defense /
       * spell-damage reduction through a CHOOSE_ONE option — not a basic/expert
       * pair — omits it, so no expert reaction is offered or resolved for it.
       */
      expertAmount?: number;
    }
  | {
      /**
       * Boots of Polarity (option B): "Remove 1 ongoing effect." Targets one of
       * your or the enemy's units and strips a single removable ongoing effect
       * from it (the most recently applied one). A unit-scoped dispel of exactly
       * one effect — narrower than Cure/Dispel, which clear several at once.
       */
      type: "REMOVE_ACTIVE_EFFECT";
    }
  | {
      type: "CREATE_ACTIVE_EFFECT";
      effect: ActiveEffectDefinition;
      expertEffect?: ActiveEffectDefinition;
      /**
       * Ash's Bloodlust IV: "Place a Black cube on that unit." After the ongoing
       * buff is created on the selected unit, that unit also spends its
       * Retaliation for the round (`retaliatedThisRound = true`) — the same Black
       * cube the instant Bloodlust sides place via ADD_COMBAT_STAT.placeBlackCube.
       */
      placeBlackCube?: boolean;
    }
  | {
      type: "CREATE_ATTACK_BUFF";
      name: string;
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
      /** Hero specialties: the bonus doubles when placed on the named unit. */
      doubleForUnitName?: string;
    }
  | {
      type: "CREATE_DEFENSE_BUFF";
      name: string;
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
      /**
       * Shield / Air Shield: when set, the buff is conditional — its Defense only
       * applies against an attacker of this UNIT TYPE ("ground-or-flying" =
       * Shield, "ranged" = Air Shield). Omitted for a plain, always-on +Defense.
       */
      vsAttackerType?: "ground-or-flying" | "ranged";
    }
  | {
      type: "CREATE_ATTACK_DIE_REROLL";
      name: string;
      basicRerolls: number;
      expertRerolls?: number;
      rerollsByPower?: Record<number, number>;
      /**
       * Fortune: the effect ALSO rerolls the adventure-map Treasure and Resource
       * dice (a shared ADVENTURE_DIE_REROLL budget equal to the reroll count), so
       * the same card works in combat (Attack die) and on the map.
       */
      adventureDice?: boolean;
      duration: EffectDurationDefinition;
      /**
       * Mirth: the duration scales with the Power paid rather than the reroll
       * count (Power 0 → this Activation, 2 → this Combat round, 4 → this
       * Combat). When set, it overrides `duration` at the matched breakpoint.
       */
      durationByPower?: Record<number, EffectDurationDefinition>;
      consumeEffectOnUse: boolean;
    }
  | {
      type: "RECALL_SPELL";
      expertSpellLimitBonus?: number;
      /**
       * Empowered Knowledge (Inferno / Star Axis): raise the spell limit by
       * this much on the basic play, no crown spent. Applied on every play;
       * `expertSpellLimitBonus` still adds on top only on the expert play.
       */
      basicSpellLimitBonus?: number;
      /** Mysticism expert: also recall every card played with the spell. */
      expertRecallPlayedCards?: boolean;
    }
  | {
      /**
       * Permanent cards whose whole behavior lives in `permanentEffect`
       * (war machines): playing the card only puts it into play.
       */
      type: "ENTER_PLAY";
    }
  | {
      /**
       * Dessa's Logistics specialty: during the continue-or-retreat decision
       * against neutral units, extend the combat by one round without
       * spending a movement point.
       */
      type: "CONTINUE_NEUTRAL_FREE";
    }
  | {
      /**
       * Shackles of War (house rule): played at the start of a player-vs-player
       * Combat, the enemy player's Hero cannot *Surrender* for the rest of that
       * Combat (a CANNOT_SURRENDER_COMBAT effect on the enemy). Retreat and a
       * fought-out loss are unaffected.
       */
      type: "BLOCK_ENEMY_SURRENDER";
    }
  | {
      /**
       * Earthquake: siege only. Power 0 removes 1 Wall/Gate of the caster's
       * choice, Power 1 removes 2, Power 2 deals 1 damage to every unit
       * adjacent to a fortification and removes them all.
       */
      type: "EARTHQUAKE";
    }
  | {
      /**
       * Remove Obstacle (Basic Water): remove obstacles of the caster's choice
       * from the Combat board — the random obstacle markers and any standing
       * siege Wall or Gate (never units). Power 0/1/2 -> remove 1/2/3 of them,
       * picked one at a time (the "remove-obstacle" choice). The "OR Instant:
       * +1 Power" side is the universal power-source discard.
       */
      type: "REMOVE_OBSTACLE";
      countByPower: Record<number, number>;
    }
  | {
      /**
       * Ballistics: siege only — destroy 1 Wall or the Gate (basic), or the
       * Arrow Tower (expert side).
       */
      type: "SIEGE_DEMOLISH";
      target: "wall-or-gate" | "arrow-tower";
    }
  | {
      /**
       * Summon X Elemental (Conflux Expert spells): on a chosen empty space,
       * Power 2 summons a Few and Power 4 a Pack of the school's Elemental.
       * The unit joins the combat immediately (acts on its own initiative) and
       * stays in the caster's army afterwards — exactly like the Pit Lords'
       * summoned Demons.
       */
      type: "SUMMON_ELEMENTAL";
      unitDefId: string;
    }
  | {
      /**
       * Force Field (Basic Earth): place an Obstacle on a chosen empty space.
       * It blocks the movement of non-flying units and bars stopping on it,
       * exactly like any Combat Obstacle, for a span that grows with the Power
       * paid — Power 0: this Combat round, 1: the next Combat round, 2: the
       * whole Combat. The "OR Instant: +1 Power" side is the universal
       * power-source discard, so it needs no option here.
       */
      type: "PLACE_FORCE_FIELD";
      durationByPower: Record<number, EffectDurationDefinition>;
    }
  | {
      /**
       * Fire Wall (Basic Fire): place an Effect Obstacle on a chosen empty
       * space for the whole Combat. Units may enter it, but any unit STOPPING on
       * it — and any GROUND or RANGED unit PASSING THROUGH it (flyers passing
       * over are unharmed) — takes damage that scales with Power: 0 -> 1,
       * 2 -> 2, 4 -> 3. The "OR Instant: +1 Power" side is the universal discard.
       */
      type: "PLACE_FIRE_WALL";
      damageByPower: Record<number, number>;
    }
  | {
      /**
       * Luna's Fire Wall specialty (I/VI): place a Fire Wall token on a chosen
       * empty space for this Combat, dealing a FIXED amount of damage (1 at I,
       * 3 at VI) — no Power scaling, unlike the Fire Wall spell. Reuses the same
       * `fire_wall` battlefield token (damage on stop / pass-through).
       */
      type: "PLACE_FIRE_WALL_FIXED";
      damage: number;
    }
  | {
      /**
       * Quicksand (Basic Earth) / Land Mine (Expert Fire): take 2/4/6 tokens by
       * Power (half armed, half decoy "empty"), shuffle them face down and place
       * one on each chosen empty space. The caster picks the spaces one by one
       * (the place-battlefield-tokens choice); the armed/decoy split stays hidden
       * from the opponent until a unit enters a token and reveals it. An armed
       * Quicksand ends the entering unit's movement AND activation; an armed Land
       * Mine deals `triggerDamage` and the unit then continues. The "OR Instant:
       * +1 Power" side is the universal discard.
       */
      type: "PLACE_HIDDEN_TOKENS";
      tokenKind: "quicksand" | "land_mine";
      countByPower: Record<number, number>;
      triggerDamage: number;
    }
  | {
      /**
       * Moandor's Liches VI specialty (one option of its "OR"): for the rest
       * of the Combat the chosen unit deals elemental damage. Restricted to the
       * named unit when `targetUnitName` is set (his card reads "your Liches").
       */
      type: "GRANT_ELEMENTAL_DAMAGE";
      targetUnitName?: string;
      duration: EffectDurationDefinition;
    }
  | {
      /**
       * Gem's First Aid VI: "For this Combat, double your First Aid Tent's
       * effect." Doubles the heal amount of the player's in-play First Aid Tent
       * for the rest of the current combat.
       */
      type: "DOUBLE_FIRST_AID_TENT";
    }
  | {
      /**
       * Gelu's Sharpshooters IV: discard a Pack of the `from` unit from your
       * army, then search the named Neutral tier deck for the `to` unit and add
       * it to your unit deck. `unique` enforces "you can control only 1 at a
       * time".
       */
      type: "CONVERT_ARMY_UNIT";
      fromUnitDefId: string;
      fromSide: "few" | "pack";
      toUnitDefId: string;
      toTier: "bronze" | "silver" | "gold" | "azure";
      unique?: boolean;
    }
  | {
      /**
       * Mutare / Cassiopeia's Tactics ability. A declarative marker only:
       * Tactics is never resolved through PLAY_CARD. The regular swap is offered
       * in the start-of-combat Tactics window, and the expert swap on the
       * holder's turn before their active unit moves; both run through the
       * SWAP_COMBAT_UNITS action and discard the card (expert also spends one
       * expert use). See swapCombatUnits in adventure-reducer.ts.
       */
      type: "TACTICS_SWAP";
    }
  | {
      /**
       * Cyra's Diplomacy, Map side: draw 1 Neutral Unit card per Dwelling the
       * player controls, then open a recruit choice over the draws (pay the
       * chosen unit's Recruitment cost; the rest return to their tier decks).
       * Resolved in openDiplomacyRecruit.
       */
      type: "DIPLOMACY_RECRUIT";
    }
  | {
      /**
       * Cyra's Diplomacy, Instant side. A declarative marker: the skip is
       * offered automatically as a pop-up when a hero meets Neutral Units whose
       * Field Difficulty equals the hero's level (never played from hand). See
       * the "diplomacy-skip" pending choice in adventure-reducer.ts.
       */
      type: "DIPLOMACY_SKIP_COMBAT";
    }
  | {
      /**
       * Learning ability. Never played from hand: it is offered automatically
       * when a Hero is about to level up (see the "learning-level-up" reward and
       * pending choice). Basic advances the Hero's Experience an extra half level
       * (`amount` steps); the Expert side advances a full level (`expertAmount`
       * steps), spends an expert use and removes the card from the game.
       * A "half level" is one Experience step here (2 steps = 1 level).
       */
      type: "ADVANCE_EXPERIENCE";
      amount: number;
      expertAmount: number;
    }
  | {
      /**
       * Visions spell (Map): scry one Neutral Unit deck. Draw `cardsByPower[P]`
       * cards from a chosen tier deck (P is the Power paid by discarding Spells
       * for +1 each via the option's "power-source" cost), then discard any of
       * them and return the rest to the top of that deck in the chosen order.
       * Resolved through the "visions-deck" / "visions-scry" pending choices.
       */
      type: "VISIONS_SCRY";
      cardsByPower: Record<number, number>;
    }
  | {
      /**
       * Disrupting Ray Spell (Basic Air, Ongoing): until the end of the Combat
       * the selected enemy unit cannot use its special ability. The reachable
       * grade rises with the Power paid (0 → bronze, 1 → silver, 2 → gold) — the
       * Anti-Magic/Blind gate; above it the cast does nothing. Backed by a
       * combat-scoped UNIT_ABILITY_SUPPRESSED effect. As a single-target unit
       * cast it can be deflected by Magic Mirror onto a new target.
       */
      type: "DISRUPTING_RAY";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Sacrifice Spell (Expert Fire, Activation): choose 1 of your damaged units
       * (the heal target, grade-gated by the Power paid — 0/2/4 → bronze/silver/
       * gold) and transfer its damage onto another of your units (the sacrifice,
       * picked in a follow-up ABILITY_TARGET_CHOICE). The amount moved is
       * min(heal target's damage, the sacrifice's remaining HP) — "up to as much
       * as is needed for the other unit to perish": the heal target loses that
       * much damage, the sacrifice takes it and perishes (a Pack flips to Few)
       * when it reaches its remaining HP.
       */
      type: "SACRIFICE_TRANSFER";
      gradeByPower: Record<number, UnitGrade>;
    };

/**
 * Extra price printed on a card option: "Discard N cards to…", "Remove this
 * card, then…", "Remove 1 Spell from hand, then…". Paid via the action's
 * `costCardIds` (the chosen cards from hand).
 */
export type CardPlayCost = {
  /** The played card is removed from the game instead of discarded. */
  removeSelf?: boolean;
  /** Discard exactly this many other cards from hand. */
  discardCards?: number;
  /** Discard any number up to this many (effects may scale per card). */
  discardCardsUpTo?: number;
  /**
   * Pay at least this much spell Power (instead of a fixed card count). Met by
   * the caster's standing spell Power for the played card's school (Power
   * statistic / School-of-Magic permanent / active-unit boost) PLUS the full
   * printed Power of each discarded power-source card — a Spell counts as the
   * "+1 Power" on its bottom side, a Power statistic/artifact/ability counts as
   * its printed Power (school-restricted Power only when the school matches).
   * Used by Sorrow's silver/gold skip so a single +4 artifact (or your Power
   * stat) reaches a grade instead of forcing N separate discards. Requires
   * `costCardFilter: "power-source"`.
   */
  powerCost?: number;
  /**
   * The discarded/removed cards must match this filter. "power-source" cards
   * are anything that can contribute Power: a Power statistic or any Spell
   * (Alamar's Resurrection spends these to stand in for its printed Power).
   */
  costCardFilter?: "spell" | "power-source";
  /** Cost cards are removed from the game rather than discarded. */
  removeCostCards?: boolean;
};

export type TriggerDefinition = {
  event: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED";
  controller: "self" | "opponent" | "any";
};

/** War machine triggers offered/resolved at the start of every combat round. */
export type WarMachineRoundStartDefinition =
  | {
      /**
       * Ballista: automatic `amount` damage to the enemy unit with the lowest
       * (effective) initiative at the start of each combat round (the owner
       * breaks a tie). The "fire 3× against the same target" volley is NOT
       * intrinsic to the Ballista — it is the Artillery ability's expert side
       * (see ARTILLERY_BALLISTA_VOLLEY and permanents.ts).
       */
      kind: "damage-lowest-initiative";
      amount: number;
    }
  | {
      /** Catapult: optionally pay the cost to damage two adjacent targets. */
      kind: "pay-to-splash";
      cost: ResourceCost;
      amount: number;
    }
  | {
      /** Cannon: optionally spend 1 expert use to damage one enemy unit. */
      kind: "expert-shot";
      amount: number;
    };

/**
 * What a Permanent card does while it stays in play next to the hero board.
 * Permanents enter play when played, survive between combats, and leave for
 * the discard pile when replaced by another permanent (or when their expert
 * effect is used).
 */
export type PermanentEffectDefinition = {
  /**
   * Schools of Magic: spells of the school gain +basicPower while the card is
   * in play; the expert effect discards the card during one of the owner's
   * casts for +expertPower instead (never both on the same spell).
   */
  schoolBonus?: { school: SpellSchool; basicPower: number; expertPower: number };
  /** Active effect applied for the owner's combats while the card is in play. */
  combatEffect?: ActiveEffectDefinition;
  /** Initiative added to the owner's ranged units while in combat. */
  rangedInitiativeBonus?: number;
  /** Trigger resolved at the start of every combat round. */
  roundStart?: WarMachineRoundStartDefinition;
  /**
   * Income artifacts (Eversmoking Ring of Sulfur, Inexhaustible Cart of Ore):
   * while the card is in play, the owner gains `amount` of `resource` at the
   * start of every Resources round (the odd rounds after the first).
   */
  resourceRoundGain?: { resource: ResourceKind; amount: number };
  /**
   * Pandora's Box "You can have up to 3 permanent cards played at a time,
   * including this one": while in play, the owner's permanent limit becomes
   * this number instead of the printed one.
   */
  permanentLimitOverride?: number;
  /** Pandora's Box "Your hand is increased by 1" while the card is in play. */
  handLimitBonus?: number;
};

export type CardOptionDefinition = {
  label: string;
  trigger?: TriggerDefinition;
  /** Printed extra price of this option (discard/remove cards). */
  cost?: CardPlayCost;
  /** This option may only be played outside combat (map effects). */
  mapOnly?: boolean;
  /** This option may only be played during combat. */
  combatOnly?: boolean;
  /**
   * "Instant" combat timing in the board-game sense: this option may be played
   * at ANY time during a Combat — on your own turn AND off-turn while an enemy
   * unit is active (its turn starting, mid-move, or just finished). Used by the
   * instant damage specialties (Gerwulf's Ballista discard, Adelaide's Frost
   * Ring, Deemer's Meteor Shower). The engine offers it off-turn through
   * addCombatAnytimeSpecialtyPlays — which feeds the off-turn combat action pass
   * AND getOffTurnCombatReactions (so it is also offered during every neutral /
   * Intelligence reaction pause). A turn-only option (e.g. Gerwulf IV's free
   * 1 damage, Gerwulf VI's ongoing aim) simply omits this flag, so it stays
   * playable only on the owner's own turn.
   */
  combatAnytime?: boolean;
  /** This option is the card's expert side: playing it spends a crown. */
  expertOnly?: boolean;
  /**
   * Mystic Orb of Mana's second option ("Only if your discard pile is empty:
   * draw 2 cards"): the option is offered only while the player's discard pile
   * holds no cards.
   */
  requiresEmptyDiscard?: boolean;
  /**
   * Crown of the Five Seas' sea side ("If this Hero is on a Sea tile …"): the
   * option is offered only while the playing player's main Hero stands on a Sea
   * (water-terrain) field.
   */
  requiresSeaTile?: boolean;
  /**
   * Ring of the Wayfarer's paralysis side ("At start of Combat with Neutral
   * Units …"): offered only on the opening round of a Combat against Neutral
   * Units.
   */
  requiresNeutralCombatStart?: boolean;
  /**
   * Jeremy's Cannon IV/VI ("use the Cannon once"): the option is offered only
   * while the playing player has this war-machine card in play, mirroring
   * Torosar's "Activate your Ballista (if you have one)". Gated in legal-actions
   * and re-checked in the reducer so the free shot can never fire without the
   * machine.
   */
  requiresWarMachine?: CardId;
  /**
   * Targ of the Rampaging Ogre's top side: "Then, instead of discarding, put
   * this card back into your hand." After the option's effect resolves the
   * played card is returned to the owner's hand instead of staying in the
   * discard pile (the cost cards it discarded stay discarded). Combat-reaction
   * artifacts only — handled in the reaction-play resolution.
   */
  returnSelfToHand?: boolean;
  /**
   * Bowstring of the Unicorn's Mane (option B): "Use this after a ranged unit's
   * Attack die roll." The post-roll die-ignore (IGNORE_ATTACK_DIE_RESULT) is only
   * offered when the attacking unit is a ranged unit — otherwise this option is
   * never offered in the ATTACK_DIE_SETTLED window.
   */
  requiresRangedAttacker?: boolean;
  /**
   * Per-option target override for a CHOOSE_ONE card whose options strike
   * different sides. Ring of the Wayfarer's initiative side buffs a friendly
   * unit (the card-level `target`) while its paralysis side hits any non-Azure
   * unit, so that option carries its own `any-unit` target. Falls back to the
   * card-level `target` when absent.
   */
  target?: TargetDefinition;
  effect: Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;
};

export type CardDefinition = {
  id: CardId;
  name: string;
  kind: "spell" | "ability" | "artifact" | "hero-specialty" | "ai" | "unit" | "statistic" | "war-machine" | "pandora";
  timing: "action" | "instant" | "reaction" | "ongoing" | "passive" | "map" | "combat" | "town";
  phaseLimit?: GamePhase[];
  spellLevel?: SpellLevel;
  spellSchools?: SpellSchool[];
  artifactTier?: ArtifactTier;
  statisticType?: StatisticType;
  abilityClass?: AbilityClass;
  tags: string[];
  power?: number;
  trigger?: TriggerDefinition;
  target?: TargetDefinition;
  /**
   * Permanent cards stay in play until discarded or replaced (their effect is
   * always on while in play). Each player may have only one permanent in play
   * at a time — the printed rule — unless a Pandora's Box permanent raises
   * the limit (permanentLimitOverride). Playing one above the limit discards
   * the oldest, and the owner may also discard one voluntarily at any time.
   */
  permanent?: boolean;
  /** Continuous behavior while a permanent card is in play. */
  permanentEffect?: PermanentEffectDefinition;
  /** War machines: purchase prices at the factory and the Trading Post. */
  warMachineCosts?: { factory: ResourceCost; tradingPost: ResourceCost };
  effect: EffectDefinition;
  assets?: {
    cardImage?: string;
    imageAlt?: string;
  };
  implementationStatus: "implemented" | "not-implemented";
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type CardLibrary = Record<CardId, CardDefinition>;

export type BuildingEffectDefinition =
  | { type: "GAIN_RESOURCE"; resource: ResourceKind; amount: number }
  | { type: "ADD_EXPERT_USE_LIMIT"; amount: number };

export type BuildingDefinition = {
  id: BuildingId;
  name: string;
  cost: ResourceCost;
  prerequisites?: BuildingId[];
  effect?: BuildingEffectDefinition;
  implementationStatus: "implemented" | "not-implemented";
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type BuildingLibrary = Record<BuildingId, BuildingDefinition>;

export type ReactionPlay = {
  cardId: CardId;
  mode?: CardPlayMode;
  optionIndex?: number;
  /** Cards from hand paying the option's printed discard/remove cost. */
  costCardIds?: CardId[];
  /** Play this Spell card for its alternative "+1 Power" bottom effect. */
  asPowerBoost?: boolean;
};

export type DeckSearchPick = { kind: "revealed"; index: number };

/**
 * Which deck a Thieves' Guild peek targets: a shared deck (keyed by its id) or a
 * player's personal Might & Magic deck (keyed by that player's id — own or
 * opponent's).
 */
export type ThievesGuildTarget =
  | { kind: "shared"; deckId: DeckId }
  | { kind: "player"; ownerId: PlayerId };

export type GameAction =
  | {
      type: "CAST_SPELL";
      playerId: PlayerId;
      cardId: CardId;
      target: TargetRef;
      /**
       * Spell Scroll cast: the spell comes from this scroll (not the hand),
       * resolves at power 0, cannot be boosted by any Power source, and is
       * removed from the game once it resolves.
       */
      fromScroll?: string;
      /**
       * Helm of the Alabaster Unicorn (option B): the spell is cast from the top
       * of the shared Spell-deck discard pile (not the hand). It resolves at the
       * caster's normal Power, the spell card stays in that discard pile, and the
       * Helm card named here is removed from the game once the cast resolves.
       */
      fromSpellDeck?: CardId;
      /**
       * Spell Book (house rule): the Spell is cast from the player's Spell Book
       * (PlayerState.spellBook), not the hand. It casts at the caster's normal
       * Power, counts toward the one-Spell-per-combat-round limit exactly like a
       * hand cast, and moves Book → discard pile when it resolves. Mutually
       * exclusive with fromScroll / fromSpellDeck (each names a distinct source).
       */
      fromSpellBook?: boolean;
      /**
       * Schools of Magic (Air/Earth/Fire/Water Magic) in play: the caster may
       * decide AS PART OF the cast to discard the matching permanent for its
       * expert power bonus (+3 instead of the standing +1; costs one expert use).
       * Decided up front so a normal cast just applies the +1 and resolves —
       * never popping an extra expert prompt.
       */
      useSchoolExpert?: boolean;
    }
  | {
      type: "PLAY_CARD";
      playerId: PlayerId;
      cardId: CardId;
      target?: TargetRef;
      mode?: CardPlayMode;
      optionIndex?: number;
      /** Cards from hand paying the option's printed discard/remove cost. */
      costCardIds?: CardId[];
      /** Map plays of specialty transforms: the army unit card to cover. */
      armyUnitId?: string;
      /**
       * Spell Book (house rule): a Map Spell played from the player's Spell Book
       * (PlayerState.spellBook) rather than the hand. Resolves exactly like the
       * hand play and moves Book → discard pile. Only ever set for Spell cards.
       */
      fromSpellBook?: boolean;
    }
  | {
      type: "ATTACK_UNIT";
      playerId: PlayerId;
      attackerId: UnitId;
      defenderId: UnitId;
      /**
       * Set when the attack is a printed-ability follow-up (Liches' Death
       * Cloud): the base attack value replaces the unit's, the target may be
       * any unit (friend, foe, or the attacker itself), and the attack never
       * chains further follow-ups or retaliations of its own.
       */
      abilityAttack?: { abilityId: string; baseAttack: number };
    }
  | {
      type: "MOVE_AND_ATTACK_UNIT";
      playerId: PlayerId;
      attackerId: UnitId;
      destination: number;
      defenderId: UnitId;
    }
  | {
      type: "MOVE_UNIT";
      playerId: PlayerId;
      unitId: UnitId;
      destination: number;
      /**
       * Optional player-chosen route: the spaces the unit ENTERS in order
       * (start-exclusive, `destination` last). Lets the player decide whether to
       * brave a Fire Wall rather than always taking the engine's auto safe path.
       * Must be a legal orthogonal walk within range that avoids blocked spaces
       * (units / obstacles / Force Fields); omitted = the engine auto-routes.
       * Ignored for flying units (they never enter the spaces they pass over).
       */
      path?: number[];
    }
  | { type: "USE_UNIT_ABILITY"; playerId: PlayerId; unitId: UnitId; abilityId: string; target: TargetRef }
  | {
      /**
       * Pit Lords' "Summon Demons" other action: instead of moving/attacking,
       * summon a Few of Demons onto an empty adjacent space, or reinforce a
       * friendly Few of Demons up to a Pack. Once per combat per Pit Lords unit.
       */
      type: "SUMMON_DEMONS";
      playerId: PlayerId;
      unitId: UnitId;
      mode: "summon" | "reinforce";
      /** Summon: the empty space to place the new Few of Demons on. */
      position?: number;
      /** Reinforce: the friendly Few of Demons to flip up to a Pack. */
      targetUnitId?: UnitId;
    }
  | {
      /**
       * Tower Genies (Few) "Wish" other action: instead of moving/attacking,
       * discard cards from the top of your deck and take a Spell discarded this
       * way to your hand.
       */
      type: "USE_GENIE_DECK_DRAW";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | { type: "USE_ACTIVE_EFFECT"; playerId: PlayerId; effectId: string; target: TargetRef; mode?: CardPlayMode }
  | { type: "DEFEND_UNIT"; playerId: PlayerId; unitId: UnitId }
  | { type: "END_ACTIVATION"; playerId: PlayerId; unitId: UnitId }
  | { type: "END_COMBAT_ROUND"; playerId: PlayerId }
  | { type: "BUILD_STRUCTURE"; playerId: PlayerId; townId: TownId; buildingId: BuildingId }
  | { type: "COMPLETE_SIMULTANEOUS_TURN"; playerId: PlayerId }
  | { type: "REROLL_PENDING_CHOICE"; playerId: PlayerId; choiceId: string }
  | { type: "CHOOSE_PENDING_ROLL"; playerId: PlayerId; choiceId: string; candidateIndex: number }
  | {
      type: "PLAY_REACTION";
      playerId: PlayerId;
      cardId: CardId;
      mode?: CardPlayMode;
      optionIndex?: number;
      costCardIds?: CardId[];
      /**
       * Bowstring of the Unicorn's Mane (option A): the friendly ranged unit to
       * activate out of order in the pre-activation window. Reactions that pick a
       * unit carry it here (most reactions target the window's trigger implicitly).
       */
      target?: TargetRef;
      /** Discard this Spell card for its alternative "+1 Power" effect. */
      asPowerBoost?: boolean;
      /**
       * Spell Book (house rule): the reaction Spell — whether played for its
       * instant effect or discarded `asPowerBoost` for +1 Power — comes from the
       * player's Spell Book (PlayerState.spellBook), not the hand, and moves Book →
       * discard pile. An `asPowerBoost` play from the Book is capped at ONE per
       * turn (combatStats.spellBookPowerUsedThisTurn). Book plays are single-card
       * only: the batch path (PLAY_REACTIONS) never carries them.
       */
      fromSpellBook?: boolean;
      /**
       * Spell Scroll reaction: the spell instant comes from this scroll, not
       * the hand. It resolves at power 0 (no boosts, no expert side) and is
       * removed from the game once played.
       */
      fromScroll?: string;
    }
  | {
      /**
       * Plays several instant cards in one declaration (e.g. two Attack cards
       * plus an artifact on the same attack), exactly like dropping a stack of
       * instants on the table at once. Spell-cancel and recall effects must be
       * played alone through PLAY_REACTION.
       */
      type: "PLAY_REACTIONS";
      playerId: PlayerId;
      plays: ReactionPlay[];
    }
  | { type: "PASS_REACTION"; playerId: PlayerId }
  | {
      /**
       * Lethal-save window: cancel the killing blow with a unit ability instead
       * of a card (Archangels' once-per-combat Resurrection). The named unit
       * must be the one whose ability does the saving.
       */
      type: "USE_UNIT_RESURRECTION";
      playerId: PlayerId;
      savingUnitId: UnitId;
    }
  | { type: "SEARCH_DECK"; playerId: PlayerId; deckId: DeckId; count: number }
  | { type: "RESOLVE_DECK_SEARCH"; playerId: PlayerId; choiceId: string; pick: DeckSearchPick }
  /**
   * Combat test mode only: drop any card straight into a player's hand so a
   * tester can exercise its mechanic without searching for it. Rejected outside
   * the combat sandbox; see sandboxAddCard.
   */
  | { type: "SANDBOX_ADD_CARD"; playerId: PlayerId; cardId: CardId }
  | { type: "MOVE_HERO"; playerId: PlayerId; heroId: HeroId; to: MapSpaceId }
  | {
      /**
       * Click-to-move: walk the hero along consecutive adjacent fields, one MP
       * per step. Walking stops early when something needs input (a guard
       * fight, a visit choice) or movement points run out.
       */
      type: "MOVE_HERO_PATH";
      playerId: PlayerId;
      heroId: HeroId;
      path: MapSpaceId[];
    }
  | {
      /**
       * Start-of-turn mulligan (and forced discard when over the hand limit):
       * discard the listed cards, then draw that many back up to the limit.
       */
      type: "REFRESH_HAND";
      playerId: PlayerId;
      discardCardIds: CardId[];
    }
  | {
      /**
       * Spell Book (house rule): move a Spell card from hand into the player's
       * Spell Book, freeing the hand slot WITHOUT drawing a replacement. Legal
       * only on the player's own map turn (no combat / reaction / pending choice),
       * for a Spell currently in hand, while the rule is on.
       */
      type: "MOVE_SPELL_TO_SPELL_BOOK";
      playerId: PlayerId;
      cardId: CardId;
    }
  | { type: "REVISIT_FIELD"; playerId: PlayerId; heroId: HeroId }
  | {
      /**
       * Open the Trading Post / War Machine Factory panel for a hero parked on
       * a market field. Free and repeatable — unlike REVISIT_FIELD it costs no
       * movement point, so the market stays available while any of the player's
       * heroes (Main or Secondary) sits on the tile.
       */
      type: "OPEN_MARKET";
      playerId: PlayerId;
      heroId: HeroId;
    }
  | { type: "DISCOVER_TILE"; playerId: PlayerId; heroId: HeroId; tileInstanceId: string }
  | {
      /** Place one of the player's face-down Far (II–III) tiles from supply. */
      type: "PLACE_TILE";
      playerId: PlayerId;
      heroId: HeroId;
      supplyIndex: number;
      centerRow: number;
      centerCol: number;
    }
  | {
      /**
       * Redwood Observatory: instead of flipping an adjacent face-down tile, drop
       * one of the visiting player's face-down Far (Ⅱ–Ⅲ) supply tiles into an
       * open border slot next to the observatory (no movement cost). Resolves the
       * open DISCOVER_ADJACENT_TILE visit step.
       */
      type: "PLACE_OBSERVATORY_TILE";
      playerId: PlayerId;
      supplyIndex: number;
      centerRow: number;
      centerCol: number;
    }
  | {
      /**
       * Chooses the final rotation of a just-revealed or just-placed tile
       * ("You may always rotate Map Tiles when placing or revealing them").
       */
      type: "SET_TILE_ROTATION";
      playerId: PlayerId;
      tileInstanceId: string;
      rotation: number;
    }
  | {
      /** Resolves the current pending visit step (choice index / pay option / skip). */
      type: "RESOLVE_VISIT_STEP";
      playerId: PlayerId;
      optionIndex?: number;
      decline?: boolean;
    }
  | {
      /** Trade resources at a Trading Post (rate index from TRADE_RATES). */
      type: "TRADE_RESOURCES";
      playerId: PlayerId;
      rateIndex: number;
    }
  | {
      /**
       * Buy a war machine from the shared supply during an open Trading Post
       * (higher price) or War Machine Factory (lower price) visit. The card
       * goes to the buyer's hand and the purchase ends the visit.
       */
      type: "BUY_WAR_MACHINE";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * Sell one Spell Scroll spell at an open Trading Post (market) for
       * 2 gold. The spell leaves the scroll (and the game); an emptied scroll
       * is removed too.
       */
      type: "SELL_SCROLL_SPELL";
      playerId: PlayerId;
      scrollId: string;
      cardId: CardId;
    }
  | {
      /**
       * Basic X Magic (the in-play spell-fetch permanent): spend an expert use
       * for +3 Power on a matching-school spell — a normal cast (into
       * schoolPowerBonus) or an instant played into an attack (into the caster's
       * attack-window Power pool). Unlike the card School-of-Magic expert it
       * discards nothing; the fetch permanent stays in play.
       */
      type: "USE_SCHOOL_FETCH_EXPERT";
      playerId: PlayerId;
      school: SpellSchool;
    }
  | {
      /**
       * Voluntarily put one of your in-play permanents into the discard pile
       * ("The player may decide to put an active permanent card into their
       * discard pile. This stops the card effect immediately.").
       */
      type: "DISCARD_PERMANENT";
      playerId: PlayerId;
      cardId: CardId;
    }
  | { type: "PLACE_COMBAT_UNIT"; playerId: PlayerId; armyUnitId: string; position: number }
  | { type: "UNPLACE_COMBAT_UNIT"; playerId: PlayerId; armyUnitId: string }
  | { type: "FINISH_COMBAT_PLACEMENT"; playerId: PlayerId }
  | {
      /**
       * Player-vs-player pre-battle preparation: a participant (attacker or
       * defender) readies up after any town actions. Deployment begins only once
       * BOTH participants have accepted. Validated in acceptCombat.
       */
      type: "ACCEPT_COMBAT";
      playerId: PlayerId;
    }
  | {
      /**
       * Tactics ability: switch the positions of two of your own units, either
       * in the start-of-combat Tactics window (free) or on your turn before your
       * active unit moves (expert, spends one expert use). Both spend the Tactics
       * card. Validated in swapCombatUnits.
       */
      type: "SWAP_COMBAT_UNITS";
      playerId: PlayerId;
      unitIdA: UnitId;
      unitIdB: UnitId;
    }
  | {
      /** Decline a start-of-combat Tactics swap window without swapping. */
      type: "FINISH_TACTICS";
      playerId: PlayerId;
    }
  | { type: "CONTINUE_NEUTRAL_COMBAT"; playerId: PlayerId }
  | { type: "CONTINUE_NEUTRAL_STEP"; playerId: PlayerId }
  | { type: "RETREAT_FROM_COMBAT"; playerId: PlayerId }
  | {
      /**
       * Player-vs-player combats (house rule): at the start of the combat
       * (round 1) a participating hero may Surrender for a flat 10-gold toll
       * paid to the opponent — they keep their whole army, take no morale hit,
       * return home, and the opponent gains nothing toward winning. Offered
       * only with the full 10 gold in hand, and blocked while the player is
       * under Shackles of War.
       */
      type: "SURRENDER_COMBAT";
      playerId: PlayerId;
    }
  | {
      /**
       * Give up a player-vs-player combat at any point once it is under way (a
       * concede, not the start-of-combat Surrender; Neutral-guard fights have no
       * Give up, only the end-of-round Retreat). It is always a defeat — the same
       * loss consequences as a Retreat (5-gold toll, -1 morale, fall back home,
       * the opponent gains the win and its credit). The troop cost depends on the
       * lobby's PvP casualty mode: in losing-troop mode only the casualties taken
       * up to the point of conceding are lost (survivors fall back, exactly like
       * a Retreat); in keep-troops mode it keeps every unit but discards its
       * entire hand. Offered to a participating hero throughout the fight.
       * Validated in giveUpCombat / finalizeAdventureCombat.
       */
      type: "GIVE_UP_COMBAT";
      playerId: PlayerId;
    }
  | {
      /**
       * Close the end-of-combat notice: finalizes an adventure combat
       * (experience, unit flips, the field visit) and returns to the map.
       */
      type: "ACKNOWLEDGE_COMBAT_END";
      playerId: PlayerId;
    }
  | {
      /**
       * Decline the after-combat Necromancy window (BINH house rule). Closes the
       * now-or-never window for good — it never reopens until the next non-Quick
       * Combat win — and releases the field reward withheld behind the decision.
       */
      type: "SKIP_NECROMANCY";
      playerId: PlayerId;
    }
  | {
      /** Population token: recruit and/or reinforce any number of units at once. */
      type: "POPULATION_ACTION";
      playerId: PlayerId;
      purchases: { kind: "recruit" | "reinforce"; unitDefId: string; armyUnitId?: string }[];
    }
  | {
      /**
       * Buy a Secondary Hero for 10 gold at your town (or a settlement),
       * wearing the portrait of one of your faction's other heroes.
       */
      type: "HIRE_SECONDARY_HERO";
      playerId: PlayerId;
      heroDefId: string;
    }
  | {
      /**
       * Spell Book token: pay the Mage Guild price to search the Spell deck.
       * Playing a Wisdom card with it reduces the price (2 gold basic,
       * 3 gold expert in BINH mode) and upgrades the search to 3/4 cards.
       */
      type: "SPELL_BOOK_ACTION";
      playerId: PlayerId;
      wisdom?: { cardId: CardId; mode: CardPlayMode };
    }
  | {
      /**
       * Rogues (army map ability): once during your turn, look at the top card
       * of any deck. Reveals the deck's top card, then a Keep-on-top /
       * Move-to-bottom choice opens.
       */
      type: "ROGUES_SCOUT_DECK";
      playerId: PlayerId;
      deckId: DeckId;
    }
  | {
      /**
       * Thieves' Guild (Cove building): once during your turn, choose one deck
       * (a shared deck or any player's Might & Magic deck) and look at its top 2
       * cards. Reveals them privately, then a "discard which one" choice opens
       * (the other card goes back on top).
       */
      type: "THIEVES_GUILD_ACTION";
      playerId: PlayerId;
      buildingId: BuildingId;
      target: ThievesGuildTarget;
    }
  | {
      /**
       * Blacksmith (Castle): once per turn — pay 6 gold to Search (2) the
       * Artifact deck, or remove an Artifact card from hand for 4 gold.
       */
      type: "BLACKSMITH_ACTION";
      playerId: PlayerId;
      option: "search" | "sell";
      artifactCardId?: CardId;
    }
  | {
      /**
       * Magic University (Conflux): once per round, instead of buying spells
       * normally, choose a School of Magic and discard from the top of your deck
       * until you reveal a Spell of that school, then take it to hand.
       */
      type: "MAGIC_UNIVERSITY_ACTION";
      playerId: PlayerId;
      school: SpellSchool;
    }
  | {
      /**
       * "During your turn" town-building uses (Cover of Darkness, Castle
       * Gate): once per round per building. `optionIndex` picks the printed
       * option; `cardIds` pays discard costs; `targetPlayerId` aims a random
       * discard; `spaceId` is the Castle Gate teleport destination.
       */
      type: "USE_TOWN_BUILDING";
      playerId: PlayerId;
      buildingId: BuildingId;
      optionIndex: number;
      cardIds?: CardId[];
      targetPlayerId?: PlayerId;
      spaceId?: MapSpaceId;
    }
  | {
      /**
       * Brimstone Stormclouds (and cube buildings like it): while one of your
       * spells is waiting to resolve, remove 1 faction cube from the building
       * for +1 Power on that spell (max 1 cube per spell).
       *
       * Cage of Warlords (Fortress) reuses this with `boost`: while one of your
       * units' attacks waits to resolve, remove 1 cube for +1 attack (you are
       * the attacker) or +1 defense (your unit is the target). One bonus per
       * cube, several may be spent on the same attack.
       */
      type: "SPEND_TOWN_CUBE";
      playerId: PlayerId;
      buildingId: BuildingId;
      boost?: "attack" | "defense";
    }
  | {
      /**
       * Hall of Valhalla: once per round, while one of your units' attacks is
       * waiting to resolve, that attack gains +1 attack.
       */
      type: "HALL_OF_VALHALLA_BOOST";
      playerId: PlayerId;
      buildingId: BuildingId;
    }
  | {
      /**
       * Siege: destroy a fortification. Adjacent ground/flying units demolish
       * a Wall or the Gate as their attack — automatically successful, no die,
       * no cards. Cyclops' printed ability does the same at any range, the
       * pack/neutral versions may also bring down the Arrow Tower.
       */
      type: "ATTACK_FORTIFICATION";
      playerId: PlayerId;
      attackerId: UnitId;
      target: { kind: "wall" | "gate"; position: number } | { kind: "arrow-tower" };
    }
  | {
      /**
       * Spend the positive morale token: draw 1 card, or discard any number
       * of cards and draw that many ("redraw"). The third printed option —
       * reroll any die — is offered inside the dice flows themselves.
       */
      type: "SPEND_MORALE";
      playerId: PlayerId;
      benefit: "draw" | "redraw";
      discardCardIds?: CardId[];
    }
  | { type: "CHOOSE_OPTION"; playerId: PlayerId; choiceId: string; optionIndex: number }
  | {
      /**
       * Resolves a COMBAT_HAND_DISCARD (Magi Power Drain): the defender either
       * names a Power card from hand to discard, or "random" to let a random
       * card be discarded.
       */
      type: "RESOLVE_COMBAT_DISCARD";
      playerId: PlayerId;
      choiceId: string;
      cardId: CardId | "random";
    }
  | {
      /**
       * Resolves an ABILITY_TARGET_CHOICE: picks the unit a printed attack
       * ability hits (Magog fireball splash, Cerberi second head, Liches'
       * Death Cloud) or, on AI target ties, the unit the neutrals attack.
       */
      type: "CHOOSE_ABILITY_TARGET";
      playerId: PlayerId;
      choiceId: string;
      targetUnitId: UnitId;
    }
  | {
      /** Map-setup lobby: claim a faction and main hero for a seat. */
      type: "CHOOSE_FACTION";
      playerId: PlayerId;
      factionId: FactionId;
      heroDefId: string;
    }
  | {
      /**
       * Map-setup lobby: adjust the game options (scenario, neutral
       * difficulty, starting resources/income/units/buildings) before the
       * adventure starts. Any seated player may adjust them.
       */
      type: "SET_GAME_OPTIONS";
      playerId: PlayerId;
      options: Partial<GameSetupOptions>;
    }
  | {
      /** Map-setup lobby: build the scenario map once every seat has a faction. */
      type: "START_ADVENTURE";
      playerId: PlayerId;
    }
  | {
      /**
       * Register (or refresh) this client in the room as an observer. Carries a
       * stable per-browser `clientId` and a display `name`. Idempotent: a
       * re-join updates the name and keeps the existing seat/host. Membership
       * actions are keyed by `clientId`, never a seat `playerId`.
       */
      type: "JOIN_ROOM";
      clientId: string;
      name: string;
    }
  | {
      /** Remove this client from the room; frees its seat and hands off host. */
      type: "LEAVE_ROOM";
      clientId: string;
    }
  | {
      /**
       * Turn host control on or off. Turning it ON makes the caller the host
       * (only a member of an open room may do this); turning it OFF (back to an
       * open table) is host-only. Keyed by the caller's `clientId`.
       */
      type: "SET_ROOM_HOSTED";
      clientId: string;
      hosted: boolean;
    }
  | {
      /**
       * Host-only (hosted rooms): seat `targetClientId` at `seat` (a real seat
       * id or "observer"). Seating a member at a seat another member holds bumps
       * that other member to observer. The host may seat themselves (so the host
       * can be Player 1).
       */
      type: "ASSIGN_SEAT";
      clientId: string;
      targetClientId: string;
      seat: RoomSeat;
    }
  | {
      /** Host-only (hosted rooms): remove `targetClientId` from the room. */
      type: "KICK_MEMBER";
      clientId: string;
      targetClientId: string;
    }
  | {
      /** Host-only (hosted rooms): hand host to another member. */
      type: "TRANSFER_HOST";
      clientId: string;
      targetClientId: string;
    }
  | {
      /**
       * Rename the room so it is identifiable in the lobby. Open table: any
       * member may set it; hosted: host-only (mirrors `SET_ROOM_HOSTED`). Keyed
       * by the caller's `clientId`. A blank name clears it back to the default.
       */
      type: "SET_ROOM_NAME";
      clientId: string;
      name: string;
    }
  | { type: "END_TURN"; playerId: PlayerId }
  | {
      /**
       * Concede the game: the player is removed from the turn order and becomes
       * an observer (rulebook p.11 elimination). Legal only on the player's own
       * map turn — never while defending in Combat ("you cannot surrender when
       * defending your Faction Town", rulebook p.46).
       */
      type: "GIVE_UP";
      playerId: PlayerId;
    };

export type LegalAction = {
  action: GameAction;
  label: string;
  reason?: string;
};

export type RulesError = {
  code:
    | "ACTION_NOT_LEGAL"
    | "CARD_NOT_FOUND"
    | "CARD_NOT_IN_HAND"
    | "CARD_NOT_IN_SPELL_BOOK"
    | "INVALID_TARGET"
    | "NO_REACTION_WINDOW"
    | "NOT_PRIORITY_PLAYER";
  message: string;
  path?: string;
};

export type GameEvent =
  | {
      id: string;
      type: "GAME_CREATED";
      message: string;
    }
  | {
      id: string;
      type: "COMBAT_ROUND_STARTED";
      round: number;
      activeUnitId: UnitId | null;
    }
  | {
      id: string;
      type: "UNIT_ACTIVATION_STARTED";
      unitId: UnitId;
      playerId: PlayerId;
    }
  | {
      id: string;
      type: "UNIT_ATTACK_DECLARED";
      playerId: PlayerId;
      attackerId: UnitId;
      defenderId: UnitId;
      isRetaliation: boolean;
      attackKind: "melee" | "ranged";
      rollMode: AttackRollMode;
      /** Set for printed-ability follow-up attacks (Liches' Death Cloud). */
      abilityAttack?: { abilityId: string; baseAttack: number };
    }
  | {
      /**
       * A resolved attack would reduce a unit to 0 HP — opens the save window
       * where that unit's controller may play Alamar's Resurrection.
       */
      id: string;
      type: "UNIT_LETHAL_HIT";
      attackerId: UnitId;
      defenderId: UnitId;
    }
  | {
      /**
       * The Attack die has been rolled (and any rerolls resolved) but the hit
       * has not yet landed — opens the window where the defender may play Shield
       * of the Dwarven Lords to ignore the die and the effects it triggered.
       */
      id: string;
      type: "ATTACK_DIE_SETTLED";
      attackerId: UnitId;
      defenderId: UnitId;
      roll: number;
    }
  | {
      id: string;
      type: "ATTACK_ROLLED";
      attackerId: UnitId;
      defenderId: UnitId;
      rolls: number[];
      roll: number;
      /** Centaur's Axe: the die outcome is multiplied before it is applied. */
      dieMultiplier?: number;
      /**
       * The Attack die was not rolled (Bless ignores it; Elemental damage
       * never uses it). The client skips the rolling-dice cinematic for these.
       */
      noDie?: boolean;
      /**
       * Every die in `rolls` counts toward `roll` (summed/counted) rather than
       * one being selected — Slayer and the Champions' "apply both" roll. The
       * dice overlay keeps every die lit instead of dimming the "unused" faces.
       */
      sumAllDice?: boolean;
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      /**
       * Defending unit's per-attack Defense roll: a unit that took the Defend
       * action rolls one Attack die each time it is struck and only gains +1
       * Defense on a "+1" face. Present whenever the defender was defending.
       */
      defendRoll?: number;
      attackValue: number;
      defenseValue: number;
      damage: number;
      isRetaliation: boolean;
    }
  | {
      /**
       * A Spell rolled the Attack die one or more times to size its own effect
       * (Inferno's area blast). Logged BEFORE the damage it produces so the
       * client can show the dice tumbling and read out, then the burst and the
       * damage land. `hits` is the number of "+1" faces (the damage each unit in
       * range takes); `position` anchors the dice overlay on the targeted space.
       */
      id: string;
      type: "SPELL_DICE_ROLLED";
      spellCardId: CardId;
      playerId: PlayerId;
      rolls: number[];
      hits: number;
      position?: number;
    }
  | {
      id: string;
      type: "PENDING_CHOICE_CREATED";
      choiceId: string;
      choiceType: "ATTACK_DIE_REROLL" | "ABILITY_TARGET_CHOICE" | "COMBAT_HAND_DISCARD";
      playerId: PlayerId;
      sourceEffectIds: string[];
      message: string;
    }
  | {
      id: string;
      type: "ATTACK_REROLLED";
      choiceId: string;
      playerId: PlayerId;
      rolls: number[];
      roll: number;
      remainingRerolls: number;
      sourceName: string;
    }
  | {
      id: string;
      type: "PENDING_CHOICE_RESOLVED";
      choiceId: string;
      playerId: PlayerId;
      selectedIndex: number;
    }
  | {
      id: string;
      type: "RETALIATION_ATTACKED";
      attackerId: UnitId;
      defenderId: UnitId;
    }
  | {
      id: string;
      type: "UNIT_MOVED";
      playerId: PlayerId;
      unitId: UnitId;
      from: number;
      to: number;
    }
  | {
      /** A Spell placed an Obstacle / Effect / face-down trap on a board space. */
      id: string;
      type: "BATTLEFIELD_TOKEN_PLACED";
      playerId: PlayerId;
      tokenId: string;
      kind: BattlefieldTokenKind;
      position: number;
    }
  | {
      /**
       * A moving unit sprang a battlefield token. Fire Wall / Land Mine damage
       * ("damage", with `amount`), a Quicksand that halted it ("stop"), or a
       * face-down trap that turned out to be an empty decoy ("decoy"). For the
       * face-down traps (Quicksand / Land Mine) the token is removed from the
       * board the instant it is sprung, so the opponent never learns which of
       * the remaining face-down tokens are real.
       */
      id: string;
      type: "BATTLEFIELD_TOKEN_TRIGGERED";
      tokenId: string;
      kind: BattlefieldTokenKind;
      position: number;
      unitId: UnitId;
      outcome: "damage" | "stop" | "decoy";
      amount?: number;
    }
  | {
      /** A timed Force Field reached the end of its duration and was removed. */
      id: string;
      type: "BATTLEFIELD_TOKEN_EXPIRED";
      tokenId: string;
      kind: BattlefieldTokenKind;
      position: number;
    }
  | {
      /**
       * Remove Obstacle lifted one of the board's obstacle markers off `position`
       * (Walls and the Gate report through FORTIFICATION_DESTROYED instead). The
       * marker simply clears; the UI plays the crumble cue on that cell.
       */
      id: string;
      type: "COMBAT_OBSTACLE_REMOVED";
      playerId: PlayerId;
      position: number;
    }
  | {
      id: string;
      type: "UNIT_DEFENDED";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      id: string;
      type: "UNIT_ACTIVATION_ENDED";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      id: string;
      type: "UNIT_REMOVED";
      unitId: UnitId;
      playerId: PlayerId;
    }
  | {
      /** A defeated Pack card turns to its Few side with the excess damage. */
      id: string;
      type: "UNIT_FLIPPED";
      unitId: UnitId;
      playerId: PlayerId;
      unitName: string;
      excessDamage: number;
    }
  | {
      /**
       * A specialty card covering a unit (Sandro's Cloak) ran out of health:
       * it goes to its owner's discard pile and the card under it is
       * revealed with the excess damage.
       */
      id: string;
      type: "SPECIALTY_CARD_DEFEATED";
      unitId: UnitId;
      playerId: PlayerId;
      cardId: CardId;
      revealedName: string;
      excessDamage: number;
    }
  | {
      id: string;
      type: "UNIT_TRANSFORMED";
      unitId: UnitId;
      playerId: PlayerId;
      newName: string;
      byCardId: CardId;
    }
  | {
      id: string;
      type: "COMBAT_ROUND_ENDED";
      round: number;
      nextRound: number;
    }
  | {
      id: string;
      type: "COMBAT_ENDED";
      winnerPlayerId: PlayerId;
      defeatedPlayerId: PlayerId;
      reason: "all-enemy-units-defeated" | "retreat" | "surrender" | "give-up";
    }
  | {
      id: string;
      type: "TURN_ENDED";
      playerId: PlayerId;
      nextPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "SPELL_CAST_STARTED";
      playerId: PlayerId;
      spellCardId: CardId;
      target: TargetRef;
      power: number;
    }
  | {
      id: string;
      type: "SPELL_CAST_RESOLVED";
      playerId: PlayerId;
      spellCardId: CardId;
      target: TargetRef;
      power: number;
    }
  | {
      id: string;
      type: "SPELL_CAST_CANCELLED";
      playerId: PlayerId;
      spellCardId: CardId;
      cancelledByPlayerId: PlayerId;
      cancelledByCardId: CardId;
    }
  | {
      /**
       * A cast could not take effect at the Power paid (Clone on a unit whose
       * grade the Power did not reach) and was refunded instead of wasted: the
       * Spell card and any Power spent on it return to the caster's hand and the
       * cast no longer counts against the one-Spell-per-round limit. Surfaced to
       * the player so they know nothing was lost. `reason` is a human message.
       */
      id: string;
      type: "SPELL_CAST_REFUNDED";
      playerId: PlayerId;
      spellCardId: CardId;
      reason: string;
    }
  | {
      /** Magic Mirror: a pending Spell was re-pointed to a new target. */
      id: string;
      type: "SPELL_REDIRECTED";
      /** The player who played Magic Mirror (the original spell's target side). */
      playerId: PlayerId;
      spellCardId: CardId;
      byCardId: CardId;
      fromTarget: TargetRef;
      toTarget: TargetRef;
    }
  | {
      id: string;
      type: "DAMAGE_ASSIGNED";
      source: SourceRef;
      target: TargetRef;
      amount: number;
      damageKind: DamageKind;
    }
  | {
      id: string;
      type: "DAMAGE_HEALED";
      source: SourceRef;
      target: TargetRef;
      amount: number;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECTS_REMOVED";
      source: SourceRef;
      target: TargetRef;
      effectIds: string[];
    }
  | {
      id: string;
      type: "UNIT_ABILITY_TRIGGERED";
      unitId: UnitId;
      abilityId: string;
      targetUnitId?: UnitId;
      message: string;
    }
  | {
      id: string;
      type: "CARD_PLAYED";
      playerId: PlayerId;
      cardId: CardId;
      timing: CardDefinition["timing"];
      mode: CardPlayMode;
      effectAmount?: number;
      optionLabel?: string;
    }
  | {
      id: string;
      type: "CARDS_DRAWN";
      playerId: PlayerId;
      count: number;
      requested: number;
      reshuffledDiscard: boolean;
    }
  | {
      /** Spell Book (house rule): a Spell moved from hand into the Spell Book. */
      id: string;
      type: "SPELL_MOVED_TO_SPELL_BOOK";
      playerId: PlayerId;
      cardId: CardId;
      message: string;
    }
  | {
      id: string;
      type: "SANDBOX_CARD_ADDED";
      playerId: PlayerId;
      cardId: CardId;
      message: string;
    }
  | {
      id: string;
      type: "DECK_SEARCH_STARTED";
      playerId: PlayerId;
      deckId: DeckId;
      choiceId: string;
      revealedCount: number;
    }
  | {
      id: string;
      type: "DECK_SEARCH_RESOLVED";
      playerId: PlayerId;
      deckId: DeckId;
      choiceId: string;
      pick: "revealed" | "discard-top";
      discardedCardIds: CardId[];
    }
  | {
      id: string;
      type: "HERO_MOVED";
      playerId: PlayerId;
      heroId: HeroId;
      from: MapSpaceId;
      to: MapSpaceId;
      movementLeft: number;
    }
  | {
      id: string;
      type: "HERO_GAINED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
    }
  | {
      id: string;
      type: "REACTION_WINDOW_OPENED";
      windowId: string;
      triggerEventId: string;
      priorityPlayerId: PlayerId;
      allowedPlayerIds: PlayerId[];
    }
  | {
      id: string;
      type: "REACTION_PASSED";
      playerId: PlayerId;
      windowId: string;
    }
  | {
      id: string;
      type: "REACTION_WINDOW_CLOSED";
      windowId: string;
      reason: "all-pass" | "reaction-played";
    }
  | {
      id: string;
      type: "STRUCTURE_BUILT";
      playerId: PlayerId;
      townId: TownId;
      buildingId: BuildingId;
      cost: ResourceCost;
    }
  | {
      id: string;
      type: "BUILDING_EFFECT_APPLIED";
      playerId: PlayerId;
      townId: TownId;
      buildingId: BuildingId;
      effect: BuildingEffectDefinition;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECT_CREATED";
      effectId: string;
      controllerId: PlayerId;
      name: string;
      duration: EffectDurationDefinition;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECT_USED";
      effectId: string;
      playerId: PlayerId;
      target: TargetRef;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECT_EXPIRED";
      effectId: string;
      reason: "combat-round-ended" | "turn-ended" | "combat-ended" | "game-round-ended" | "activation-ended";
    }
  | {
      id: string;
      type: "SIMULTANEOUS_TURN_COMPLETED";
      playerId: PlayerId;
      completedPlayerIds: PlayerId[];
    }
  | {
      id: string;
      type: "ORDERED_TURNS_STARTED";
      activePlayerId: PlayerId;
    }
  | {
      id: string;
      type: "ROOM_MEMBER_JOINED";
      clientId: string;
      name: string;
      seat: RoomSeat;
      isHost: boolean;
    }
  | {
      id: string;
      type: "ROOM_MEMBER_LEFT";
      clientId: string;
    }
  | {
      id: string;
      type: "ROOM_SEAT_CHANGED";
      clientId: string;
      seat: RoomSeat;
      /** The client who made the change (the host, or the member themselves). */
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_MEMBER_KICKED";
      clientId: string;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_HOSTED_CHANGED";
      hosted: boolean;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_HOST_CHANGED";
      clientId: string;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_NAMED";
      name: string;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROUND_STARTED";
      round: number;
      kind: "first" | "resource" | "astrologers";
    }
  | {
      id: string;
      type: "TURN_STARTED";
      playerId: PlayerId;
      round: number;
    }
  | {
      id: string;
      type: "HAND_REFRESHED";
      playerId: PlayerId;
      discarded: number;
      drawn: number;
    }
  | {
      id: string;
      type: "TILE_REVEALED";
      playerId: PlayerId;
      tileInstanceId: string;
      tileDefId: string;
    }
  | {
      id: string;
      type: "TILE_PLACED";
      playerId: PlayerId;
      tileInstanceId: string;
      tileDefId: string;
      centerRow: number;
      centerCol: number;
      rotation: number;
    }
  | {
      id: string;
      type: "TILE_ROTATION_SET";
      playerId: PlayerId;
      tileInstanceId: string;
      tileDefId: string;
      rotation: number;
    }
  | {
      id: string;
      type: "ASTROLOGERS_DRAWN";
      cardId: string;
      name: string;
      text: string;
      round: number;
    }
  | {
      id: string;
      type: "ARMY_UNIT_FLIPPED";
      playerId: PlayerId;
      unitDefId: string;
      reason: string;
    }
  | {
      id: string;
      type: "SPELL_RETURNED_TO_HAND";
      playerId: PlayerId;
      cardId: CardId;
      reason: string;
    }
  | {
      id: string;
      type: "NEUTRAL_DRAW_SWAPPED";
      playerId: PlayerId;
      fromUnitDefId: string;
      toUnitDefId: string;
    }
  | {
      id: string;
      type: "MORALE_SPENT";
      playerId: PlayerId;
      benefit: "draw" | "redraw" | "reroll";
    }
  | {
      id: string;
      type: "FACTION_CHOSEN";
      playerId: PlayerId;
      factionId: FactionId;
      heroDefId: string;
    }
  | {
      id: string;
      type: "ADVENTURE_STARTED";
      scenarioId: string;
      playerIds: PlayerId[];
    }
  | {
      id: string;
      type: "FIELD_VISITED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      location: string;
      revisit: boolean;
    }
  | {
      id: string;
      type: "FIELD_FLAGGED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
      location: string;
      previousOwnerId: PlayerId | null;
    }
  | {
      id: string;
      type: "RESOURCES_GAINED";
      playerId: PlayerId;
      gold: number;
      buildingMaterials: number;
      valuables: number;
      reason: string;
    }
  | {
      id: string;
      type: "RESOURCES_SPENT";
      playerId: PlayerId;
      cost: ResourceCost;
      reason: string;
    }
  | {
      id: string;
      type: "PRODUCTION_CHANGED";
      playerId: PlayerId;
      resource: ResourceKind;
      amount: number;
    }
  | {
      id: string;
      type: "ADVENTURE_DICE_ROLLED";
      playerId: PlayerId;
      dice: "treasure" | "resource" | "attack";
      results: string[];
      /** Structured faces so the table can animate the physical dice. */
      resourceRolls?: { resource: ResourceKind; amount: number }[];
      treasureRolls?: ("experience" | "artifact-search" | "resource-die" | "double-resource-die")[];
      attackRolls?: number[];
    }
  | {
      id: string;
      type: "EXPERIENCE_GAINED";
      playerId: PlayerId;
      heroId: HeroId;
      amount: number;
      experience: number;
      level: number;
    }
  | {
      id: string;
      type: "HERO_LEVEL_UP";
      playerId: PlayerId;
      heroId: HeroId;
      level: number;
      effects: string[];
    }
  | {
      id: string;
      type: "MORALE_CHANGED";
      playerId: PlayerId;
      amount: number;
      total: number;
    }
  | {
      /** Crest of Valor: a Field's negative-morale token was ignored. */
      id: string;
      type: "FIELD_MORALE_IGNORED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
    }
  | {
      id: string;
      type: "NEUTRAL_COMBAT_STARTED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
      unitDefIds: string[];
    }
  | {
      /**
       * The guard army is drawn and placed only after the player finishes
       * their own placement (rulebook Combat Setup order).
       */
      id: string;
      type: "NEUTRAL_ARMY_REVEALED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
      difficulty: number;
      unitDefIds: string[];
    }
  | {
      /** A Creature Bank Token was placed on a Tile's Blocked Field. */
      id: string;
      type: "CREATURE_BANK_PLACED";
      fieldId: MapSpaceId;
      bankId: string;
    }
  | {
      /** A Creature Bank Combat began (no Field Difficulty). */
      id: string;
      type: "CREATURE_BANK_COMBAT_STARTED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      bankId: string;
      unitDefIds: string[];
      stackedCount: number;
    }
  | {
      /**
       * A player Empowered an ability (Dragon Fly Hive / Griffin Conservatory
       * bonus): its Expert side may henceforth be played without a crown.
       */
      id: string;
      type: "ABILITY_EMPOWERED";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * A Stacked Creature Bank defender took a lethal blow and discarded its
       * Stack Token instead of being removed, carrying the leftover damage to
       * its new Health.
       */
      id: string;
      type: "STACK_TOKEN_DISCARDED";
      unitId: UnitId;
      playerId: PlayerId;
      unitName: string;
      excessDamage: number;
    }
  | {
      id: string;
      type: "GAME_OPTIONS_CHANGED";
      playerId: PlayerId;
      message: string;
    }
  | {
      id: string;
      type: "PLAYER_COMBAT_STARTED";
      attackerPlayerId: PlayerId;
      defenderPlayerId: PlayerId;
      fieldId: MapSpaceId;
    }
  | {
      id: string;
      type: "QUICK_COMBAT_WON";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
    }
  | {
      id: string;
      type: "COMBAT_CONTINUED";
      playerId: PlayerId;
      movementLeft: number;
    }
  | {
      id: string;
      type: "COMBAT_RETREATED";
      playerId: PlayerId;
      heroId: HeroId;
      returnedTo: MapSpaceId;
    }
  | {
      id: string;
      type: "COMBAT_UNIT_PLACED";
      playerId: PlayerId;
      unitId: UnitId;
      position: number;
    }
  | {
      id: string;
      type: "COMBAT_PLACEMENT_FINISHED";
      playerId: PlayerId;
    }
  | {
      /** PvP: the defender finished pre-combat preparation; deployment begins. */
      id: string;
      type: "COMBAT_PREP_ACCEPTED";
      playerId: PlayerId;
    }
  | {
      /** Tactics: two of a player's units switched battlefield positions. */
      id: string;
      type: "COMBAT_UNITS_SWAPPED";
      playerId: PlayerId;
      unitIdA: UnitId;
      unitIdB: UnitId;
      mode: "basic" | "expert";
    }
  | {
      /** Diplomacy (Map): the Neutral Unit cards drawn, one per Dwelling. */
      id: string;
      type: "DIPLOMACY_NEUTRALS_DRAWN";
      playerId: PlayerId;
      unitDefIds: string[];
    }
  | {
      /** Diplomacy (Instant): a matching-level Neutral fight skipped for no XP. */
      id: string;
      type: "DIPLOMACY_COMBAT_SKIPPED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
    }
  | {
      id: string;
      type: "UNIT_RECRUITED";
      playerId: PlayerId;
      unitDefId: string;
      kind: "recruit" | "reinforce";
      cost: ResourceCost;
    }
  | {
      id: string;
      type: "SPELLS_PURCHASED";
      playerId: PlayerId;
      cost: ResourceCost;
    }
  | {
      id: string;
      type: "TRADE_EXECUTED";
      playerId: PlayerId;
      rateLabel: string;
    }
  | {
      id: string;
      type: "WAR_MACHINE_BOUGHT";
      playerId: PlayerId;
      cardId: CardId;
      cost: ResourceCost;
      at: "factory" | "trading-post";
    }
  | {
      /** A permanent card entered play (the previous one went to discard). */
      id: string;
      type: "PERMANENT_PLAYED";
      playerId: PlayerId;
      cardId: CardId;
      replacedCardId: CardId | null;
    }
  | {
      /** An in-play permanent left play for the discard pile. */
      id: string;
      type: "PERMANENT_DISCARDED";
      playerId: PlayerId;
      cardId: CardId;
      reason: "voluntary" | "limit" | "expert" | "replaced";
    }
  | {
      /** Pandora's Box: the visiting hero drew a Pandora deck card. */
      id: string;
      type: "PANDORA_CARD_DRAWN";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /** A war machine fired (round-start trigger or its expert discard). */
      id: string;
      type: "WAR_MACHINE_TRIGGERED";
      playerId: PlayerId;
      cardId: CardId;
      targetUnitId?: UnitId;
      message: string;
    }
  | {
      id: string;
      type: "GAME_WON";
      playerId: PlayerId;
      reason: string;
    }
  | {
      id: string;
      type: "PLAYER_ELIMINATED";
      playerId: PlayerId;
      reason: string;
      /** True when the player chose to give up rather than being timed out. */
      gaveUp: boolean;
    }
  | {
      id: string;
      type: "PLAYER_ELIMINATION_CLOCK";
      playerId: PlayerId;
      /** Turns the player has left before elimination, or null when cleared. */
      turnsLeft: number | null;
    }
  | {
      /**
       * Setup roll for the starting player (official rulebook step 22): every
       * player rolls the Attack die, highest result starts; ties reroll among
       * the tied players. Every attempt's rolls are kept for display.
       */
      id: string;
      type: "FIRST_PLAYER_ROLLED";
      attempts: { rolls: { playerId: PlayerId; name: string; value: number }[] }[];
      winnerPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "COMBAT_TOKEN_PLACED";
      unitId: UnitId;
      playerId: PlayerId;
      kind: CombatTokenKind;
      amount: number;
      sourceName: string;
    }
  | {
      id: string;
      type: "COMBAT_TOKEN_REMOVED";
      unitId: UnitId;
      kind: CombatTokenKind;
      reason: "expired" | "replaced" | "damage" | "activation-skipped" | "dispelled";
    }
  | {
      /** Siege: the defender's Walls, Gate and Arrow Tower hit the board. */
      id: string;
      type: "SIEGE_FORTIFICATIONS_PLACED";
      playerId: PlayerId;
      wallPositions: number[];
      gatePosition: number;
    }
  | {
      id: string;
      type: "FORTIFICATION_DESTROYED";
      playerId: PlayerId;
      byUnitId: UnitId | null;
      kind: "wall" | "gate" | "arrow-tower";
      position?: number;
      message: string;
    }
  | {
      id: string;
      type: "TOWN_BUILDING_USED";
      playerId: PlayerId;
      buildingId: BuildingId;
      message: string;
    }
  | {
      /** A Spell Scroll was taken from a field; its 2 spells are now held. */
      id: string;
      type: "SPELL_SCROLL_GAINED";
      playerId: PlayerId;
      scrollId: string;
      spellCardIds: CardId[];
    }
  | {
      /** A Spell Scroll spell was sold at the market for gold. */
      id: string;
      type: "SCROLL_SPELL_SOLD";
      playerId: PlayerId;
      scrollId: string;
      cardId: CardId;
      gold: number;
    };

export type ResolutionStackItem = {
  id: string;
  source: SourceRef;
  action: GameAction;
  status: "pending" | "waiting-for-reaction" | "resolving" | "resolved" | "cancelled";
  triggerEventIds: string[];
  modifiers: {
    spellPowerBonus: number;
    /**
     * School of Magic permanent bonus on this cast, tracked apart from
     * spellPowerBonus so it neither blocks nor is blocked by Power cards.
     * Basic (+1) applies automatically; the expert discard replaces it.
     */
    schoolPowerBonus?: number;
    attackBonus: number;
    defenseBonus: number;
    /** Centaur's Axe: multiplies the rolled attack-die outcome (default 1). */
    attackDieMultiplier?: number;
    /** Brimstone Stormclouds: faction cubes spent on this cast (max 1). */
    townCubePowerBonus?: number;
    /**
     * Spell Scroll cast: the spell resolves at power 0 and no Power source
     * (Power cards, +1 discards, School of Magic, town cubes, Astrologers) may
     * raise it — getCurrentSpellPower returns 0 while this is set.
     */
    scrollLocked?: boolean;
    /**
     * Helm of the Alabaster Unicorn cast (option B): the spell was cast from the
     * top of the Spell-deck discard pile. Like a scroll cast it has no hand/discard
     * card to send anywhere afterward — the card stays in the Spell-deck discard
     * pile — so finalizeSpellCardDestination leaves it untouched.
     */
    fromSpellDeck?: boolean;
    /** Bless: the Attack die is not rolled (counts as 0). */
    ignoreAttackDie?: boolean;
    /**
     * Ivor's Elves I / VI: a played specialty forced this attack's die to a
     * fixed face. At resolution every die shows this value (no roll, no reroll);
     * it is a real face so face-conditioned abilities still read it. 0 = "set all
     * dice to 0" (I); 1 = "set your roll to +1" (VI's chosen-value option).
     */
    forcedRoll?: number;
    /**
     * Lord Haart (Necropolis) Dread Knights I/VI: damage knocked off THIS
     * retaliation by the instant the defender's controller played in the
     * retaliation window (1/2, doubled for his Dread Knights). Only ever set on
     * a retaliation attack; read into the attack's `damageReduction` at
     * resolution, then discarded with the stack item.
     */
    retaliationDamageReductionInstant?: number;
    /** Frenzy: this attack ignores the defender's Defense (counts as 0). */
    ignoreDefense?: boolean;
    /**
     * Slayer: roll the Attack die this many times against a gold defender and
     * count the "+1" faces as the die's whole contribution (every "-1" is
     * ignored). Set by the Slayer reaction; consumed in resolveAttackStackItem.
     */
    slayerRolls?: number;
    /**
     * Slayer's power→rolls table, kept so the roll count re-derives when more
     * Power lands in the attack window after Slayer was played (the caster keeps
     * priority and may keep empowering it) instead of being frozen at the Power
     * it had when first cast — the same recompute the attack/defense instants get.
     */
    slayerRollsByPower?: Record<number, number>;
    /** Adrienne's Fire Magic: extra Power her School-of-Fire bonus adds to a
     * fire Slayer's roll-count lookup (constant offset, folded into the Power). */
    slayerSchoolPowerBonus?: number;
    /** Slayer: draw 1 card once the modified attack has resolved. */
    slayerDraw?: boolean;
    /** Precision: this shot ignores the ranged back-row penalty. */
    ignoreRangedPenalty?: boolean;
    /**
     * Spell instants played into this attack that the OTHER side may still
     * cancel with Resistance (Curse/Weakness/Bloodlust/Precision/Bless/Slayer).
     * Each entry is the casting player; the spell's effect on the attack is
     * reversed if cancelled, exactly like Resistance ending an Activation cast.
     * Non-spell boosts (the Attack/Defense statistics) are never listed — they
     * are not Spells and cannot be Resisted.
     */
    cancellableSpellInstants?: { cardId: CardId; playerId: PlayerId }[];
    /**
     * Magic Mirror bounced an instant combat debuff (Curse/Weakness) onto a new
     * unit. These are NOT ongoing effects or tokens — they are the instant
     * itself, re-pointed: a one-shot stat delta that the attack maths apply to
     * the named unit for THIS attack and (copied across) its retaliation, then
     * vanish with the stack item. So nothing can Dispel or ignore them — only
     * spell-immunity stops them, enforced by the redirect's target filter.
     */
    redirectedInstants?: { unitId: UnitId; stat: "attack" | "defense"; amount: number }[];
    /**
     * Knowledge / Mysticism was played on this cast. The recall resolves
     * after the spell does: instants come back at once, ongoing spells only
     * when the effect they created ends.
     */
    recallSpell?: { toHand: boolean; recallPlayedCards: boolean };
    /**
     * Alamar's Resurrection armed on this attack: if it would reduce the named
     * unit (of `grade` or lower) to 0 HP, the blow is cancelled.
     */
    cancelLethal?: { unitId: UnitId; grade: UnitGrade };
    /**
     * The attack die outcome rolled before pausing for the lethal-save window,
     * reused when the attack resumes so the die is not rerolled.
     */
    rolledCandidate?: { rolls: number[]; roll: number };
    /** Set once the lethal-save window has been offered for this attack. */
    lethalSaveOffered?: boolean;
    /**
     * Shield of the Dwarven Lords: set once the post-roll die-cancel window has
     * been offered for this attack, so it is opened at most once.
     */
    dieCancelOffered?: boolean;
    /**
     * Shield of the Dwarven Lords resolved: the rolled Attack die (and every
     * effect that die face would have triggered) is ignored — the face counts
     * as 0 and no die-triggered ability fires.
     */
    attackDieCancelled?: boolean;
    /**
     * Misfortune: while true, this attack opened the dedicated pre-buff window
     * where only the defender's Misfortune may be played (before any other card,
     * per the card's timing). Cleared the instant Misfortune is played or the
     * defender declines, at which point the normal attack-declared buff window
     * takes over.
     */
    misfortunePhase?: boolean;
    /**
     * Misfortune resolved on this attack: the attacker can no longer increase
     * their attack from any source for this attack. The legal-action layer
     * refuses every attack-increasing reaction to the attacker (Bloodlust,
     * Precision, Bless, Slayer, Hall of Valhalla / Cage attack boosts), and the
     * Attack die is cancelled alongside (`attackDieCancelled`).
     */
    negateAttackBuffs?: boolean;
    /**
     * A defending defender's Defense roll for this attack, rolled once and
     * reused across the lethal-save window so the same outcome decides the hit.
     * Only a "+1" grants +1 Defense.
     */
    defendRoll?: number;
    /**
     * Attack-window spell instants (Bloodlust, Precision, Bless's bonus,
     * Curse/Weakness…) whose attack/defense bonus scales with Power. Recorded
     * so Power played LATER in the same window — the caster keeps priority and
     * may keep empowering — recomputes their contribution against the new total
     * Power instead of being frozen at the value they had when first played.
     */
    powerScaledAttackInstants?: PowerScaledAttackInstant[];
    /**
     * Per-player Power pool for an attack window. Each side's spell instants
     * (the attacker's Bloodlust/Bless/Precision/Slayer, the defender's
     * Curse/Weakness) scale only with the Power THAT side paid — Power cards,
     * +1 discards and standing bonuses are kept per caster so one player's Power
     * never inflates the other's spell. (Spell casts on your own turn use the
     * single `spellPowerBonus`; only the shared attack window needs splitting.)
     */
    attackPowerByPlayer?: Record<PlayerId, number>;
    /**
     * Frenzy's Power→grade table and its caster, kept on the attack so the
     * pierced grade (bronze→silver→gold) is re-derived from the caster's final
     * attack-window Power at resolution — Power paid after Frenzy keeps lifting
     * it, exactly like Slayer's roll count.
     */
    ignoreDefenseGradeByPower?: Record<number, CombatUnitState["grade"]>;
    ignoreDefenseCasterId?: PlayerId;
    /** Adrienne's Fire Magic: extra Power her School-of-Fire bonus adds to a
     * fire Frenzy's pierced-grade lookup (constant offset, folded into Power). */
    ignoreDefenseSchoolPowerBonus?: number;
    /** Players who already spent their Basic X Magic +3 expert on this stack. */
    schoolFetchExpertUsedBy?: PlayerId[];
    /**
     * Ash's Bloodlust I/IV/VI: a played buff also "places a Black cube" on the
     * buffed attacker — once this attack resolves the attacker spends its
     * Retaliation for the round (`retaliatedThisRound = true`). Set from
     * ADD_COMBAT_STAT.placeBlackCube during the attack-declared window.
     */
    setRetaliatedOnAttacker?: boolean;
    /**
     * Ash's Bloodlust VI: this single attack "ignores Retaliation Attacks" — the
     * defender does not retaliate, the one-off equivalent of the attacker holding
     * the `ignores-retaliation` ability. Set from ADD_COMBAT_STAT.ignoresRetaliation.
     */
    ignoresRetaliationThisAttack?: boolean;
    /**
     * Tarnum (Fortress) Basilisks VI: "your selected unit uses its special
     * ability regardless of the required roll's result". For this single attack
     * every die-GATED after-attack ability of the attacker triggers as if its
     * required face was rolled — the Basilisk/Azure Paralysis, the Gorgon Death
     * Stare, the Wyvern/Thunderbird flat-damage sting, the Rust Dragon Acid
     * token and the Minotaur draw. Set from ADD_COMBAT_STAT.forceAbilityRolls.
     */
    forceAbilityRollsThisAttack?: boolean;
    playedCardIds: CardId[];
  };
};

/**
 * One Power-scaling attack/defense buff played into an attack window, kept so
 * its applied bonus can be recomputed when more Power lands afterward.
 */
export type PowerScaledAttackInstant = {
  cardId: CardId;
  /** The caster — its bonus re-derives from this player's attack Power pool. */
  playerId: PlayerId;
  stat: "attack" | "defense";
  /** The card's power→amount table (e.g. Bloodlust { 0:1, 1:2, 2:3 }). */
  amountByPower: Record<number, number>;
  /** Fallback amount when no breakpoint matches the current Power. */
  baseAmount: number;
  /** Power-independent extra (per-discarded-card bonuses) added on top. */
  fixedBonus: number;
  /**
   * Adrienne's Fire Magic: extra Power her School-of-Fire bonus adds to this
   * spell instant. A constant offset (her effect lasts the Combat), folded into
   * the Power passed to amountByPower at first play and every re-derivation.
   */
  schoolPowerBonus?: number;
  /** Hero-specialty doubling decided once at play time (1 or 2). */
  doubleFactor: number;
  /** The bonus currently folded into the stack item (after doubling). */
  appliedAmount: number;
};

export type ReactionWindow = {
  id: string;
  triggerEvent: GameEvent;
  allowedPlayerIds: PlayerId[];
  priorityPlayerId: PlayerId;
  legalReactions: Record<PlayerId, LegalAction[]>;
  passedPlayerIds: PlayerId[];
  closesWhen: "all-pass" | "one-reaction" | "choice-made";
};

export type ActiveEffectState = ActiveEffectDefinition & {
  id: string;
  source: SourceRef;
  controllerId: PlayerId;
  target?: TargetRef;
  startedRound: number;
  startedCombatRound?: number;
  expiresAtCombatRoundEnd?: number;
  expiresAtTurnEndPlayerId?: PlayerId;
  /** Game round at whose end the effect expires ("current-game-round"). */
  expiresAtGameRound?: number;
  /**
   * Unit whose activation-end expires this effect ("current-activation" binds
   * to the active unit at creation, "next-activation" to the target unit).
   */
  expiresAtActivationEndUnitId?: UnitId;
  usedRollEventIds: string[];
  usedChoiceIds: string[];
  usedCombatRoundNumbers: number[];
  /**
   * First Aid Tent: heals performed this combat round and whether the expert
   * (multiple heals for 1 expert use) was activated, so basic and expert heals
   * stay mutually exclusive within a round.
   */
  healRound?: { round: number; count: number; expert: boolean };
};

export type TurnState = {
  mode: "simultaneous" | "ordered";
  simultaneousRoundLimit: number;
  completedPlayerIds: PlayerId[];
  observingPlayerId: PlayerId | null;
};

/**
 * Which player a connected client controls in a hosted room: a real seat id
 * (a member of `turnOrder` / a lobby seat) or "observer" (watches with hidden
 * information filtered, takes no actions).
 */
export type RoomSeat = PlayerId | "observer";

/**
 * One connected participant of a room, keyed by a stable per-browser
 * `clientId` (stored client-side in localStorage). A member's `seat` is the
 * player they control, or "observer". `isHost` mirrors `RoomMembershipState.
 * hostClientId` for convenience in views.
 */
export type RoomMember = {
  clientId: string;
  name: string;
  seat: RoomSeat;
  isHost: boolean;
};

/**
 * Room membership/seating, carried inside the synced GameState so it flows
 * through `applyAction` (engine-validated) and both transport backends
 * identically.
 *
 * Two modes:
 *  - **open table** (`hosted: false`, or `state.room` absent on legacy
 *    snapshots): no seat enforcement at all — any client may view/act as any
 *    seat. This is the original "easy to test" behaviour (the local seat
 *    switcher in the UI).
 *  - **hosted** (`hosted: true`): seats are host-controlled. Only the host
 *    (`hostClientId`) may assign/kick/transfer, players cannot move their own
 *    seat, and a game action is only accepted from the client whose seat
 *    matches the action's `playerId` (enforced in `applyAction` when the
 *    transport passes `actorClientId`).
 */
export type RoomMembershipState = {
  hosted: boolean;
  hostClientId: string | null;
  members: RoomMember[];
  /**
   * Human-readable room name shown in the lobby and the room panel, so players
   * can tell rooms apart instead of reading the opaque room id. Optional: a room
   * that was never named falls back to a default label derived from its id.
   * Set via the `SET_ROOM_NAME` action (open table: any member; hosted: host
   * only), and seeded by the explicit "create room" flow.
   */
  name?: string;
};

/**
 * A hero-specialty card physically covering a unit card (Sandro's Cloak of
 * the Undead King): its statistics replace the unit's until defeated. Stored
 * bottom-to-top — the LAST entry is the card on top whose statistics apply.
 */
export type UnitTransformState = {
  /** The specialty card placed on the unit (discarded when defeated). */
  cardId: CardId;
  name: string;
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  cardImage?: string;
  /** Cloak VI: stays on top even when more upgrades land underneath. */
  alwaysOnTop?: boolean;
};

export type ArmyUnitState = {
  /** Stable instance id of this unit card in the player's unit deck. */
  id: string;
  unitDefId: string;
  /** "neutral": a single-sided Neutral card recruited via Portal of Summoning. */
  side: "few" | "pack" | "neutral";
  /**
   * Specialty cards stacked on this unit card (Sandro's Cloak), bottom-up.
   * The top entry's statistics replace the printed side between and during
   * combats until that covering card is defeated.
   */
  transforms?: UnitTransformState[];
};

export type TownTokenState = {
  build: boolean;
  population: boolean;
  spellBook: boolean;
};

/**
 * A Spell Scroll near the hero board (Stronghold expansion field). Each scroll
 * holds up to 2 Spell cards drawn from the Basic/Expert Magic decks. Its spells
 * are NOT in the hand: the owner may cast one during combat at power 0 (it
 * cannot be boosted by any Power source) or sell one at the market for 2 gold.
 * A used or sold spell leaves the scroll; once both are gone the scroll is gone.
 */
export type SpellScrollState = {
  id: string;
  /** The Spell card ids held in the scroll (0-2). */
  spellCardIds: CardId[];
};

/**
 * A Legion artifact discount voucher (Legs/Loins/Torso/Arms/Head of Legion).
 * Playing a Legion discount side opens a prompt to pick ONE specific unit; the
 * choice banks a voucher reserved for that exact recruit/reinforce target. The
 * cost path NEVER stacks discounts — neither two Legion pieces aimed at the same
 * unit nor a Legion piece with another source (Champions' Stables, a recruit-cost
 * building, a discount event…). It always applies the single LARGEST applicable
 * gold discount, each computed from the unit's ORIGINAL printed cost. A voucher
 * is consumed when its target unit is recruited/reinforced (whichever path), and
 * any unused vouchers expire at the start of the owner's next turn.
 */
export type RecruitDiscountVoucher = {
  /** The Legion artifact card id that banked this voucher (one per piece per turn). */
  cardId: CardId;
  /** Gold knocked off the targeted unit's recruit/reinforce, floored at 0. */
  amount: number;
  /** The exact unit this voucher is reserved for. */
  target:
    | { kind: "recruit"; unitDefId: string }
    | { kind: "reinforce"; armyUnitId: string };
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  /** Adventure mode: chosen faction and main hero definition ids. */
  factionId?: FactionId;
  heroDefId?: string;
  /** Personal draw pile. The top of the pile is the last array element. */
  deck: CardId[];
  hand: CardId[];
  discard: CardId[];
  /**
   * Spell Book (house rule, default ON — `adventure.spellBook`). A personal,
   * face-down library of Spell cards set aside next to the hero, NOT in hand and
   * NOT counted against the hand limit. The owner may stash any Spell from hand
   * here on their turn (MOVE_SPELL_TO_SPELL_BOOK) to free a hand slot without
   * drawing a replacement. A Spell in the Book may be cast or played exactly like
   * a hand Spell — it obeys the same one-Spell-per-combat-round limit — and, like
   * a hand Spell, it may be discarded for +1 Power; but only ONE Book Spell may be
   * spent for Power per turn (see combatStats.spellBookPowerUsedThisTurn). A used
   * Book Spell goes to the discard pile, and when it is later picked up from the
   * discard pile the owner may route it straight back into the Book. Held privately
   * (player-view hides the contents from opponents, exposing only spellBookCount).
   */
  spellBook: CardId[];
  /** Cards removed from the game entirely (the "remove" keyword). */
  removed: CardId[];
  /**
   * Ability card ids this player has had "empowered" (e.g. the Dragon Fly Hive /
   * Griffin Conservatory Creature Bank bonus). An empowered ability may be played
   * on its Expert side without spending an Expert use (a crown) — the holder may
   * always use either the basic or the expert function for free. Permanent for
   * the rest of the game. Matched by card id, so it follows the card between
   * hand and discard.
   */
  empoweredAbilities?: CardId[];
  /**
   * Deprecated single-permanent slot from older snapshots; live states use
   * `permanents`. Read through getPermanentCardIds, never directly.
   */
  permanent?: CardId | null;
  /**
   * The permanent cards in play next to the hero board (war machines,
   * Schools of Magic, Pandora's Box permanents), oldest first. Their effects
   * are always on. The limit is 1 unless an in-play Pandora's Box permanent
   * raises it (permanentLimitOverride); playing above the limit discards the
   * oldest and the owner may discard one voluntarily at any time.
   */
  permanents?: CardId[];
  /** Unit deck: the army that fights the player's combats. */
  army: ArmyUnitState[];
  /** Scenario starting units, restored when the unit deck empties. */
  startingArmy: { unitDefId: string; side: "few" | "pack" }[];
  resources: {
    [key in ResourceKind]: number;
  };
  /** Per-round production gained during Resource Rounds. */
  production: {
    [key in ResourceKind]: number;
  };
  /** Town action tokens flip inactive when used, refresh each round. */
  townTokens: TownTokenState;
  /**
   * Whether this player has already recruited/reinforced (a Population action)
   * this round. The Population token is no longer consumed by a single
   * purchase: a player may recruit and reinforce as many times as they can
   * afford (BINH house rule). Movement is what closes the window — once this is
   * true, the next time one of the player's heroes moves the Population token
   * flips off for the rest of the round. Moving before any purchase leaves the
   * window open (you may still buy later, even on an opponent's turn). Reset by
   * refreshRoundTokens.
   */
  populationPurchasedThisRound?: boolean;
  /** Round number the Mage Guild was built (token unusable that round). */
  mageGuildBuiltRound?: number;
  /** +1 positive morale token (max 1) or a single negative token (-1). */
  morale: number;
  /**
   * Positive morale gained while already at the +1 cap: the token does not
   * stack, so each extra one must be spent immediately (draw a card, or
   * discard any number and draw that many). The UI pops up to resolve it;
   * the reroll use does not apply to these.
   */
  moraleOverflow?: number;
  /**
   * Over the hand limit at the start of the turn (only reachable via card
   * effects, since the hand is no longer auto-drawn): the player must discard
   * down to the limit (REFRESH_HAND) before taking any other turn action.
   */
  needsHandRefresh?: boolean;
  /**
   * The optional start-of-turn draw is still available this turn: the player
   * MAY discard any number of cards and then draw back up to the hand limit
   * (rulebook: "may discard any number of hand cards, then draws up to hand
   * limit"). Offered on every turn, including the first; it is the single
   * either/or — "draw new" (discard nothing) or "discard and draw new", never
   * both, because the hand is never auto-drawn. Cleared once used, or once the
   * player takes their first map/exploration action of the turn.
   */
  canMulligan?: boolean;
  /** Second negative morale token: the hand is discarded when the turn ends. */
  discardHandAtTurnEnd?: boolean;
  /**
   * Removed from the game (gave up, or spent the grace period with no Town or
   * Settlement). An eliminated player keeps a `players` entry so the table can
   * still show them as an observer, but they leave `turnOrder` and take no
   * turns. Rulebook p.11: "Eliminated players are immediately removed."
   */
  eliminated?: boolean;
  /**
   * Player Elimination clock (rulebook p.11, house rule: 2 of the player's own
   * turns instead of 3 full Rounds). Set while the player controls no Town and
   * no Settlement; counts down at the end of each of their turns and reaching 0
   * eliminates them. `null`/absent means they hold a base and are safe.
   */
  eliminationCountdown?: number | null;
  /** Nomads (army map ability): the end-of-turn adjacent step was offered this turn. */
  nomadStepDoneThisTurn?: boolean;
  /**
   * Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion): per-unit discount
   * vouchers. Playing a Legion discount side opens a prompt to pick the single
   * unit it applies to, banking one voucher reserved for that exact target. The
   * recruit/reinforce cost path applies the single LARGEST applicable gold
   * discount and never stacks vouchers — neither with each other on the same unit
   * nor with any other source (Champions' Stables, a recruit-cost building, a
   * discount event). A voucher is consumed when its unit is recruited/reinforced;
   * each Legion piece may bank at most one voucher per turn (the SAME piece cannot
   * stack with itself), and all unused vouchers expire at the start of the owner's
   * next turn. See `bestRecruitGoldDiscount`/`consumeRecruitVoucherFor`.
   */
  recruitDiscounts?: RecruitDiscountVoucher[];
  /** Rogues (army map ability): the once-per-turn deck peek was used this turn. */
  rogueScoutUsedThisTurn?: boolean;
  limits: {
    hand: number;
    expertUses: number;
  };
  combatStats: {
    spellsCastThisRound: number;
    spellLimitBonusThisRound: number;
    expertUsesSpentThisRound: number;
    /** Helm of Heavenly Enlightenment: extra expert uses this round. */
    expertUseBonusThisRound?: number;
    /** Spells cast since the current adventure turn started (Astrologers hooks). */
    spellsCastThisTurn?: number;
    /**
     * Whether ANY spell has been cast this combat round, free casts included.
     * Drives the "first spell this round" Power bonus (Tower Magi Pack) so it is
     * granted to whichever spell is cast first — the limit-free Helm of the
     * Alabaster Unicorn cast counts here even though it does not bump
     * spellsCastThisRound. Reset with the per-round spell counter.
     */
    anySpellCastThisRound?: boolean;
    /**
     * Spell Book (house rule): true once this player has spent ONE Book Spell as
     * a +1 Power source this turn. Like a crown (expertUsesSpentThisRound) this is
     * a per-game-round budget — it survives across combat rounds and the map→combat
     * boundary, and refreshRoundTokens clears it at the start of the player's turn.
     * Power boosts from the HAND (and every other source) are unaffected; only the
     * Book is capped at one Power discard per turn. Absent = none spent yet.
     */
    spellBookPowerUsedThisTurn?: boolean;
  };
  /** Round the Blacksmith action was last used ("once per your turn"). */
  blacksmithUsedRound?: number;
  /** Round the Magic University deck-dig was last used ("once per round"). */
  magicUniversityUsedRound?: number;
  /**
   * Round each "once per round/turn" town building was last used (Cover of
   * Darkness, Castle Gate, …), keyed by building id.
   */
  buildingUsedRound?: Record<string, number>;
  /**
   * Ongoing cards held in play while their effect lasts. The card leaves the
   * hand when played but only reaches the discard pile (or, when Knowledge /
   * Mysticism recalled it, the hand) after every effect it created ends —
   * so a recalled Summon/Clone-style spell cannot be recast while its first
   * casting is still on the table.
   */
  ongoingCards?: { cardId: CardId; effectIds: string[]; returnTo: "discard" | "hand" }[];
  /**
   * Necromancy timing window: set when this player wins a Combat other than
   * a Quick Combat, cleared by the next movement / town action / turn end —
   * the card may only be played while the window is open.
   */
  necromancyWindow?: boolean;
  /**
   * Ability cards this player acquired by drawing them out of the shared
   * Ability deck (the level-up "Search (2) the Ability deck" reward). A
   * Necromancy gained this way may be kept but never played — it is only a
   * real, playable ability when it comes from a hero's printed board, not
   * from a level-up draw (house rule).
   */
  deckDrawnAbilityCardIds?: CardId[];
  /**
   * Spell Scrolls held near the hero board (not in hand). Each holds up to 2
   * Spell cards usable in combat at power 0 or sellable at the market.
   */
  scrolls?: SpellScrollState[];
};

/**
 * Combat tokens placed on unit cards ("Tokens on Units", rulebook p.89):
 *  - "attack": +1/+2 attack while held (Ogres). One per unit; on a second
 *    token the better one is kept.
 *  - "weakness": −1/−2 attack while held (Sorceresses, Weakness spell). One
 *    per unit; the better (least bad) one is kept.
 *  - "corrosion": −1 defense to a minimum of 0 (Behemoths). One per unit;
 *    stays until the end of combat.
 *  - "paralysis": the unit skips its next activation (token removed instead);
 *    removed when the unit takes damage. Retaliations still happen.
 */
export type CombatTokenKind = "attack" | "weakness" | "corrosion" | "paralysis";

export type CombatTokenState = {
  id: string;
  kind: CombatTokenKind;
  /** Signed stat delta (attack +1/+2, weakness −1/−2, corrosion −1). */
  amount: number;
  /** Combat round at whose end the token expires; absent = end of combat. */
  expiresAtCombatRoundEnd?: number;
  /** Display name of whatever placed the token. */
  sourceName: string;
};

export type BattlefieldTokenKind = "force_field" | "fire_wall" | "quicksand" | "land_mine";

/**
 * A token (or card) occupying a Combat-board space, placed by a Spell:
 *  - force_field — an Obstacle: blocks non-flying movement and bars stopping
 *    on it, until `expiresAtCombatRoundEnd` (absent = the whole Combat).
 *  - fire_wall   — an Effect Obstacle: units may enter, but stopping on it (any
 *    type) or passing through it (ground/ranged only) costs `damage`. Lasts the
 *    whole Combat.
 *  - quicksand / land_mine — a face-down trap: `armed` true for a real token,
 *    false for a decoy ("empty"). `armed` is hidden from non-controllers (see
 *    getPlayerView) — only the caster ever knows which are real. The instant a
 *    unit enters a trap it is sprung and REMOVED from the board: an armed
 *    Quicksand ends the unit's movement and activation, an armed Land Mine deals
 *    `damage`, a decoy does nothing. Because a sprung trap is taken off the
 *    board, the opponent never learns which of the remaining face-down tokens
 *    are real. Two tokens of the same kind may share a space only when placed by
 *    different players.
 */
export type BattlefieldTokenState = {
  id: string;
  kind: BattlefieldTokenKind;
  position: number;
  controllerId: PlayerId;
  /** fire_wall / land_mine: damage dealt to a caught unit. */
  damage?: number;
  /** quicksand / land_mine: true = real trap, false = decoy. Hidden from non-controllers. */
  armed?: boolean;
  /** force_field: combat round at whose end it lifts; absent = lasts the whole Combat. */
  expiresAtCombatRoundEnd?: number;
};

/** A Stack Token modifies exactly one statistic of a Creature Bank defender. */
export type StackTokenStat = "attack" | "defense" | "health" | "initiative";

export type CombatUnitState = {
  id: UnitId;
  controllerId: PlayerId;
  name: string;
  cardName: string;
  variant: "few" | "pack" | "neutral";
  grade: UnitGrade;
  type: UnitType;
  attack: number;
  defense: number;
  maxHealth: number;
  damage: number;
  initiative: number;
  position: number;
  activatedThisRound: boolean;
  movedThisActivation: boolean;
  attackedThisActivation?: boolean;
  /** Attacks resolved during this activation (double-attack abilities stop at 2). */
  attacksThisActivation?: number;
  /**
   * Position this unit stood on when its current activation began. Harpies'
   * "Strike and Return" repositioning flies the unit back here after its
   * attack; reset every time the unit activates.
   */
  activationStartPosition?: number;
  /**
   * Set once a unit's "[activation]" choice ability has resolved this
   * activation (Enchanters' heal-or-buff, Faerie Dragons' damage-spell), so it
   * never fires twice and the unit can act normally afterwards.
   */
  activationAbilityDone?: boolean;
  /** Pit Lords: set once this unit has summoned/reinforced Demons this combat. */
  summonedThisCombat?: boolean;
  /** Archangels: set once this unit has spent its once-per-combat lethal save. */
  usedLethalSaveThisCombat?: boolean;
  /** Phoenixes: set once this unit has spent its once-per-combat Rebirth self-save. */
  usedRebirthThisCombat?: boolean;
  /**
   * Cove Haspids (Few): set the moment this unit's Pack side is defeated and it
   * flips down to its Few side during a combat. The Few side's "Vengeance"
   * ability grants +2 Attack only while this is set, so a Few recruited fresh
   * (never a Pack) gets no bonus. Reset implicitly per combat (units are rebuilt).
   */
  flippedDownThisCombat?: boolean;
  /**
   * Cove Seamen (Pack): set once this unit has banked its once-per-combat
   * "gain 2 gold when it removes a unit from Combat" reward, so it never pays
   * out twice in the same fight.
   */
  gainedKillGoldThisCombat?: boolean;
  retaliatedThisRound: boolean;
  defenseToken: boolean;
  /**
   * Set once the pre-activation reaction pause has been resolved for this
   * unit's current activation, so the pump does not re-open it after the
   * reacting player casts/plays during the pause. Reset every time the unit
   * becomes active (setActiveUnit).
   */
  reactionPauseAcked?: boolean;
  /**
   * Set once the pre-activation interrupt window has been offered for this unit's
   * current activation — the window Sorrow (skip) and Bowstring of the Unicorn's
   * Mane (activate one of your ranged units) share — so the centralized hook does
   * not re-open it every action. Reset every time the unit becomes active.
   */
  preActivationWindowOffered?: boolean;
  /** Combat tokens currently on the card (attack/weakness/corrosion/paralysis). */
  tokens?: CombatTokenState[];
  /**
   * Fortress Wyverns' poison: faction cubes riding this unit. At the beginning
   * of each of its activations one cube is removed to inflict 1 damage, until
   * none remain. Repeated Wyvern hits stack more cubes here.
   */
  poisonCubes?: number;
  abilities: string[];
  /**
   * Disrupting Ray: derived flag recomputed after every action from the unit's
   * UNIT_ABILITY_SUPPRESSED active effects (syncAbilitySuppression). While set,
   * getUnitAbilityDefinitions returns [] so the unit cannot use ANY special
   * ability — current or future — until the suppression ends.
   */
  abilitiesSuppressed?: boolean;
  /**
   * Specialty cards covering the unit card (Sandro's Cloak), bottom-up; the
   * top entry's statistics are the unit's current statistics. Printed
   * abilities stay inactive while a transform is on top.
   */
  transforms?: UnitTransformState[];
  /** Adventure mode: unit definition this combat card represents. */
  unitDefId?: string;
  /** Adventure mode: army card instance this unit maps back to. */
  armyUnitId?: string;
  /**
   * Fixed creature-bank guard (Dragon Utopia's dragons, the Cyclops
   * Stockpile's 2 golden Cyclopes): minted for this fight only, so it must
   * not be returned to a Neutral tier deck when the combat finishes.
   */
  bankGuard?: boolean;
  /**
   * Creature Bank defender (Naval Battles optional rule). Fights from its own
   * Creature Bank unit card (distinct stats, NO tier), is returned to the bank
   * pile rather than a Neutral tier deck, and follows the Stack Token rules.
   * Implies bankGuard (minted, never deck-drawn).
   */
  bankUnit?: boolean;
  /**
   * The Stack Token currently sitting on this Creature Bank defender, if any.
   * A Stacked unit's printed statistics already include the token's bonus; when
   * it would take lethal damage the token is discarded (reverting the bonus) and
   * the leftover damage carries to the new, lower Health (rulebook p.67).
   */
  stackToken?: StackTokenStat | null;
  /**
   * Conjured onto the battlefield by a spell (Summon Elemental). Summoned
   * units carry no printed grade, so the neutral AI's same-tier targeting rule
   * never applies to them — guards attack every real, graded enemy first and
   * only turn on a summoned unit when nothing else is left.
   */
  summoned?: boolean;
  /**
   * Clone Spell: when set, this unit is a 1-Health Clone Token copying the unit
   * with this id. A Clone copies everything printed on the original's card but
   * none of the ongoing effects/tokens on it, and is destroyed by any damage, by
   * being attacked (even for 0 damage), or when its original is removed from the
   * Combat Board. Clones never flip (Pack→Few), never Rebirth, leave no army
   * bookkeeping, and never count as one of your units leaving for Pit Lords.
   */
  cloneOfUnitId?: UnitId;
  /**
   * Tarnum (Rampart) Sharpshooters VI: a Neutral-deck unit borrowed "for this
   * Combat (discard it afterwards)". It carries no army card (no armyUnitId), so
   * it is never written back to the army; instead, when the Combat ends its
   * `unitDefId` is returned to its tier's Neutral discard pile (finalizeAdventure-
   * Combat). Whether it survived or died, the borrowed card is discarded.
   */
  temporary?: boolean;
  assets?: {
    cardImage?: string;
    imageAlt?: string;
    wikiUrl?: string;
  };
};

export type CombatDice = {
  /** The faces of the physical attack die, e.g. [-1, -1, 0, 0, 1, 1]. */
  faces: number[];
  /** Seed used to derive each roll deterministically (server-authoritative). */
  seed: string;
  /** Number of single dice rolled so far; advances the deterministic sequence. */
  rollCount: number;
  /**
   * Optional forced roll results consumed in order before falling back to the
   * seeded die. Used by tests and scripted tutorials; undefined in normal play.
   */
  scriptedRolls?: number[];
};

export type CombatContext =
  | {
      kind: "sandbox";
    }
  | {
      kind: "neutral";
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
      /** Highest tier present in the drawn neutral army (azure has no time limit). */
      hasAzure: boolean;
      /**
       * Creature Bank combat (Naval Battles optional rule): the bank being
       * fought. When set, this is NOT a Field-Difficulty fight — there is no
       * Quick Combat, no Round limit, no MP to extend and no experience, and the
       * win reward is the bank's (scaled by `bankStackCount`). A CreatureBankId
       * (typed loosely here because state.ts has no data-layer imports).
       */
      bankId?: string;
      /** Number of Stacked defenders placed on the bank (the reward's X). */
      bankStackCount?: number;
    }
  | {
      kind: "player";
      attackerHeroId: HeroId;
      /** Null when the town owner garrisons without their hero (8 gold defense). */
      defenderHeroId: HeroId | null;
      fieldId: MapSpaceId;
      /** Defending a faction town with a Citadel: walls, gate and arrow tower. */
      siege?: boolean;
    };

export type CombatBoardArtId =
  | "classic"
  | "frozen"
  | "hell-necro"
  | "jungle-fortress"
  | "creature-bank-dungeon"
  | "castle-siege"
  | "ship-battle";

/**
 * Siege fortifications on the combat board (town with a Citadel): 3 Walls and
 * 1 Gate fill the middle row, the Arrow Tower fights from beside the board.
 */
export type SiegeState = {
  /** Town owner the fortifications belong to (the combat's defender). */
  townPlayerId: PlayerId;
  /** Middle-row positions still holding a Wall card. */
  walls: number[];
  /** Middle-row position of the Gate while it stands. */
  gatePosition: number | null;
  /** Arrow Tower combat unit id while it stands. */
  arrowTowerUnitId: UnitId | null;
};

export type CombatSetupState = {
  /** Player ids still to place units, in placement order. */
  pendingPlayerIds: PlayerId[];
  /** Army unit instance ids already placed this setup, per player. */
  placedUnitIds: Record<PlayerId, string[]>;
  /** Maximum units a side may field. */
  unitLimit: number;
};

/**
 * Follow-up bookkeeping for one resolved attack: printed attack abilities
 * (splash, second heads, Death Cloud) resolve between the attack and the
 * retaliation, so the retaliation is parked here until they finish.
 */
export type AttackSequenceState = {
  attackerId: UnitId;
  /** The original declared target (retaliation comes from this unit). */
  defenderId: UnitId;
  attackKind: "melee" | "ranged";
  /** Whether the original target still owes its retaliation attack. */
  retaliationPending: boolean;
  /**
   * Magic Mirror bounced an instant debuff (Curse/Weakness) onto a unit during
   * this attack: carried here so the same one-shot stat delta also applies to
   * the retaliation, then vanishes (it is never an ongoing effect or token).
   */
  redirectedInstants?: { unitId: UnitId; stat: "attack" | "defense"; amount: number }[];
  /**
   * BINH Cerberi: remaining printed follow-up attacks (one full attack per
   * adjacent enemy), resolved one at a time before the retaliation.
   */
  queuedAbilityAttacks?: {
    abilityId: string;
    abilityName: string;
    baseAttack: number;
    targetUnitId: UnitId;
  }[];
  /**
   * Wolf Raiders: same target follow-up after the original target's
   * retaliation has either resolved or been skipped.
   */
  afterRetaliationAbilityAttack?: {
    abilityId: string;
    abilityName: string;
    targetUnitId: UnitId;
  };
};

export type CombatState = {
  id: string;
  round: number;
  attackerPlayerId: PlayerId;
  defenderPlayerId: PlayerId;
  activeUnitId: UnitId | null;
  context: CombatContext;
  /** Deterministic combat-board art selected when the fight starts. */
  boardArtId?: CombatBoardArtId;
  setup: CombatSetupState | null;
  /** In-flight follow-ups of the attack that just resolved. */
  attackSequence?: AttackSequenceState | null;
  /**
   * Neutral cards drawn after the player finished placement, awaiting the
   * Groovy Satyr swap choice before the army is revealed and placed.
   */
  pendingNeutralDraws?: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[] | null;
  /**
   * Set between combat rounds against neutrals: the attacking hero must spend
   * 1 MP to continue for another round or retreat.
   */
  awaitingContinue: boolean;
  /**
   * Combat pacing / reaction pause. The engine stops here and waits for one
   * player to resume with CONTINUE_NEUTRAL_STEP. Two kinds:
   *
   *  - "pre-activation": before a unit takes its turn, the OTHER side gets a
   *    window to react first — cast Intelligence-enabled spells (Magic Arrow,
   *    Fireball…), trigger-free instant spells, play an instant ability / use an
   *    active effect (First Aid Tent), or play an instant damage specialty
   *    (Gerwulf/Adelaide/Deemer — the `combatAnytime` options). Set in neutral
   *    fights (the human reacts before each guard acts) and in player-vs-player
   *    fights whenever the reacting side holds Intelligence (the anytime-cast
   *    freedom). `reactingPlayerId` holds priority; `intent` previews the move.
   *  - "guard-walk": after a neutral guard walks (a pure move — attacks pause
   *    on the defender's reaction window and the attack die instead) the engine
   *    stops so the table can see the move. Neutral fights only.
   *
   * The sandbox never pauses like this (its pump does not run); there, off-turn
   * instants are simply offered to the non-active player at any combat moment.
   */
  pendingNeutralStep?: {
    /** Older snapshots have no kind; treat a missing kind as "guard-walk". */
    kind?: "pre-activation" | "guard-walk";
    unitId: UnitId;
    /** Display name of the acting unit, for the pop-up. */
    name: string;
    /**
     * The player who holds priority during the pause and resumes it. Defaults
     * to the attacker on older snapshots (the only reactor a guard-walk had).
     */
    reactingPlayerId?: PlayerId;
    /** Where a guard stepped from / to ("guard-walk" only). */
    from?: number;
    to?: number;
    /** "pre-activation": a preview of what the (neutral) unit is about to do. */
    intent?: {
      kind: "attack" | "move" | "pass";
      /** "attack": the unit the guard will strike (when already decided). */
      targetUnitId?: UnitId;
      targetName?: string;
      /** "move"/"move-and-attack": where the guard will step to. */
      destination?: number;
    };
  } | null;
  /**
   * Round-start war machine triggers still waiting to resolve, in owner
   * order (attacker first). The Catapult parks its first chosen target here
   * while the second target choice is open.
   */
  warMachineRound?: {
    /**
     * One entry per round-start war machine: its owner and the machine card.
     * `granted` entries are Torosar's temporary Ballistas (no permanent card) —
     * they fire a basic shot and skip the in-play check.
     */
    pending: { playerId: PlayerId; cardId: CardId; granted?: boolean }[];
    firstTargetUnitId?: UnitId | null;
    /**
     * Artillery expert: while a Ballista tie-break choice is open for the
     * same-target volley, how many shots the chosen target takes (cleared once
     * the volley resolves). Absent/1 for an ordinary single Ballista shot.
     */
    volleyShots?: number | null;
  } | null;
  outcome: {
    winnerPlayerId: PlayerId;
    defeatedPlayerId: PlayerId;
    reason: "all-enemy-units-defeated" | "retreat" | "surrender" | "give-up";
  } | null;
  /**
   * Adventure combats stay on the battlefield after the outcome until a
   * participant acknowledges the end-of-combat notice; finalization (XP,
   * unit flips, the field visit) runs when this flips true.
   */
  endAcknowledged?: boolean;
  /** Siege fortifications while defending a Citadel town (PvP only). */
  siege?: SiegeState | null;
  /**
   * Cover of Darkness owners still to decide their start-of-combat option
   * (discard 1 random card from the enemy hand), resolved before placement.
   */
  pendingCoverOfDarkness?: PlayerId[];
  /**
   * Shackles of War: the attacker holds a "block the enemy's Surrender" instant
   * and gets a start-of-combat decision to play it (before the prep window, where
   * Surrender lives) — resolved like Cover of Darkness. Holds the single deciding
   * player while open; cleared once they choose.
   */
  pendingShackles?: PlayerId[] | null;
  /**
   * True once the start-of-combat Shackles decision has been offered this combat,
   * so it is never re-offered (the attacker who keeps the card still holds it,
   * which would otherwise re-trigger the prompt).
   */
  shacklesOffered?: boolean;
  /**
   * Player-vs-player pre-battle preparation window, presented on the adventure
   * MAP (not the battlefield) so both sides can see their towns, resources and
   * armies and plan with a clear head. When an enemy hero attacks, BOTH the
   * attacker and the defender may spend any town actions they have not used this
   * round (build a structure, recruit/reinforce units, buy spells) before the
   * fight — recruited units join the army in time to be deployed — then each
   * presses ACCEPT_COMBAT ("Accept the battle"). Deployment begins only once
   * *both* participants have accepted. Retreat / Surrender are also available
   * here. `accepted` lists the participants who have readied up so far; a
   * participant who has not yet accepted may still take town actions, one who
   * has is locked in and waits. Opened for every player-vs-player combat;
   * cleared once both accept (or by a Retreat / Surrender that ends the combat).
   */
  prep?: { accepted: PlayerId[] } | null;
  /**
   * Tactics ability: participants still entitled to a start-of-combat unit
   * swap, attacker first then a hero-present PvP defender. Set once all units
   * are placed/revealed for each player who holds a playable Tactics card and
   * fields at least two living units. The head holds priority (phase stays
   * "combat-setup", setup is already null); SWAP_COMBAT_UNITS performs one swap
   * (spending the card) and FINISH_TACTICS declines, each popping the queue.
   * Combat round 1 begins (finalizeCombatStart) only once the queue drains.
   */
  pendingTacticsSwaps?: PlayerId[] | null;
  /**
   * Controllers who have had at least one unit removed from the board this
   * combat (Pit Lords' "Summon Demons" triggers off a friendly removal).
   */
  unitRemovedControllerIds?: PlayerId[];
  /**
   * Neutral Skeletons: set once a Skeleton guard has been destroyed this
   * combat, so the attacker's Necropolis hero gets the free bronze reinforce.
   */
  skeletonGuardDefeated?: boolean;
  /** Set once the Skeletons reinforce has been offered (mid-combat or after). */
  skeletonReinforceGranted?: boolean;
  dice: CombatDice;
  units: Record<UnitId, CombatUnitState>;
  /**
   * Battlefield spaces blocked by obstacle tokens. Ground and ranged units
   * can neither enter nor move through them; flying units may fly over but
   * not land on them. Unit cards themselves also count as combat obstacles.
   */
  obstacles?: number[];
  /**
   * Spell-placed board tokens (Force Field, Fire Wall, Quicksand, Land Mine).
   * Force Field tokens additionally count as Combat Obstacles (folded into the
   * blocked-space set); the others let units enter but bite them as they move.
   */
  battlefieldTokens?: BattlefieldTokenState[];
};

export type DeckState = {
  id: DeckId;
  drawPile: CardId[];
  discardPile: CardId[];
};

export type MapState = {
  spaces: Record<MapSpaceId, { id: MapSpaceId; adjacent: MapSpaceId[] }>;
};

export type MapTileState = {
  id: string;
  tileDefId: string;
  centerRow: number;
  centerCol: number;
  rotation: number;
  faceDown: boolean;
  /** Roman numerals printed on the tile back (public info), e.g. "Ⅳ–Ⅴ". */
  backLabel?: string;
  /** Tile group (public info — the printed back gives it away). */
  group?: "starting" | "far" | "near" | "center" | "sea" | "subterranean";
  /**
   * Tile revealed/placed but its rotation not confirmed yet: fields are not
   * materialized until the owner locks the rotation in.
   */
  awaitingRotation?: boolean;
};

export type MapFieldState = {
  spaceId: MapSpaceId;
  tileInstanceId: string;
  /** Tile slot 0-6 this field came from. */
  slot: number;
  location: string;
  difficulty?: number;
  /**
   * Creature Bank id (Naval Battles optional rule) when `location` is
   * "creature_bank". A CreatureBankId, typed loosely because state.ts has no
   * data-layer imports. The bank's defenders and reward are looked up from it.
   */
  bankId?: string;
  resource?: ResourceKind;
  amount?: number;
  faction?: string;
  /**
   * Set to "water" on sea hexes (open ocean and sea features on water tiles).
   * Absent means a land hex. Resolved from the tile field's terrain override or
   * the tile terrain when the tile is materialized; read by `isSeaField` to gate
   * sea movement (crossing the coastline halts a hero without Water Walk).
   */
  terrain?: "water";
  /** Visitable fields get a black cube after the visit and then count as empty. */
  blackCube: boolean;
  flagOwnerId: PlayerId | null;
  /**
   * Obelisks and Star Axes keep every visitor's cube: players beyond the
   * first flagger land here ("do not remove any enemy Faction Cubes;
   * multiple players may have a Faction Cube on this Field").
   */
  extraFlagOwnerIds?: PlayerId[];
  /** Whether the first-flag immediate income was already claimed. */
  everFlagged: boolean;
  /** Resource chosen for a flagged settlement. */
  settlementResource: ResourceKind | null;
  /**
   * Obelisk house rule: the Attack-die face (-1, 0, or +1) rolled the first
   * time any Hero visits this Obelisk. It is locked in for the rest of the
   * game — every later visitor (any player) receives the same reward category
   * without rerolling: -1 = +1 positive morale, 0 = Search (2) the Artifact
   * deck, +1 = roll one Treasure die and one Resource die. `undefined` until
   * the first visit rolls it.
   */
  obeliskRoll?: -1 | 0 | 1;
  /**
   * Grail Hunt: this Grail field's guards have been defeated and the Grail is
   * waiting to be dug (1 movement point) before it can be carried home.
   */
  grailDiggable?: boolean;
  /**
   * Subterranean Gate token (Stronghold expansion). When a gate is placed, the
   * sacrificed hex's `location` becomes "subterranean_gate" and these point at
   * the tile on the OTHER layer the gate bridges:
   * - `gateToTileId`: the opposite-layer tile this half connects to. A Hero who
   *   enters this field discovers that tile for free if it is still face-down
   *   (the only way to discover across the Surface↔Subterranean divide).
   * - `gateLinkSpaceId`: the partner gate field — the matching half on the other
   *   tile — set once both halves have been materialized. Movement may cross
   *   between the two linked halves even though they sit on different layers:
   *   they are the one sanctioned Surface↔Subterranean crossing ("Treat both
   *   Fields of the Subterranean Gate Token as one Field"). Undefined while only
   *   this half exists because the other tile is still face-down.
   */
  gateToTileId?: string;
  gateLinkSpaceId?: MapSpaceId;
};

export type PendingVisit = {
  heroId: HeroId;
  playerId: PlayerId;
  fieldId: MapSpaceId;
  /** Steps still to resolve for this visit (front of array first). */
  steps: VisitStep[];
};

export type AdventureReward =
  | { playerId: PlayerId; kind: "shared-deck-search"; deckId: DeckId; count: number }
  | { playerId: PlayerId; kind: "city-hall-choice"; buildingId: BuildingId }
  | {
      /** Scholar / Rib Cage / Crown of Dragontooth: pick from the discard pile. */
      playerId: PlayerId;
      kind: "discard-pick";
      count: number;
      filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic" | "spell-or-specialty" | "magic-arrow";
      fromTop?: number;
      shuffleRestIntoDeck?: boolean;
    }
  | {
      /** Generic queued interaction resolved through the visit-step machinery. */
      playerId: PlayerId;
      kind: "visit-steps";
      steps: VisitStep[];
    }
  | {
      /**
       * A post-combat field visit deferred behind the after-combat Necromancy
       * decision, so the field reward lands only AFTER Necromancy is paid for
       * (see AdventureState.pendingNecromancy).
       */
      playerId: PlayerId;
      kind: "field-visit";
      heroId: HeroId;
      fieldId: MapSpaceId;
    }
  | {
      /**
       * Learning: the Hero just crossed at least one level and the player holds a
       * Learning ability card. Pumped into a "learning-level-up" choice offering
       * to advance an extra half/full level (see pumpAdventureQueues).
       */
      playerId: PlayerId;
      kind: "learning-level-up";
    }
  | {
      /**
       * Start-of-turn phase divider. Queued LAST by startPlayerTurn, after every
       * round-start ("beginning of the round" City Hall income/draws, Astrologers
       * Proclaim) and start-of-turn ("beginning of your turn" building/Astrologers)
       * effect. When pumped it takes the hand-limit snapshot for the player whose
       * turn is starting: it opens the optional discard-and-draw and, if the
       * earlier effects pushed the hand over the limit, requires a discard down
       * before the player may act. Snapshotting here — not eagerly in
       * startPlayerTurn — is what makes a round-start draw (e.g. Stronghold City
       * Hall "draw 2") correctly force the first player to discard.
       */
      playerId: PlayerId;
      kind: "start-turn-hand";
    };

export type VisitStep =
  | { type: "CHOOSE_ONE"; prompt: string; options: { label: string; steps: VisitStep[] }[] }
  | { type: "PAY_TO"; prompt: string; costOptions: ResourceCost[]; steps: VisitStep[] }
  | { type: "GAIN_RESOURCES"; gold?: number; buildingMaterials?: number; valuables?: number }
  | { type: "GAIN_EXPERIENCE"; amount: number }
  | { type: "GAIN_MOVEMENT"; amount: number }
  | { type: "GAIN_MORALE"; amount: number }
  | { type: "ROLL_RESOURCE_DICE"; count: number }
  | { type: "ROLL_TREASURE_DICE"; count: number }
  | {
      /** Marks one Luck reroll (per dice kind) as spent before re-rolling. */
      type: "CONSUME_LUCK";
      effectId: string;
      dice: "treasure" | "resource";
    }
  | {
      /**
       * Cards of Prophecy: spend the die-set effect before applying the chosen
       * face of a Resource/Treasure die (the whole effect is removed — one use).
       */
      type: "CONSUME_DIE_SET";
      effectId: string;
    }
  | {
      /** Spends the positive morale token (reroll-any-die morale action). */
      type: "CONSUME_MORALE";
    }
  | {
      /** Marks the Swift Weasel once-per-turn adventure-die reroll as used. */
      type: "CONSUME_WEASEL";
    }
  | {
      /**
       * Plays a held reroll artifact (Diplomat's Ring / Ambassador's Sash) as an
       * instant the moment a die is rolled: discards it from hand, then the
       * adventure die is re-rolled by the step that follows.
       */
      type: "CONSUME_REROLL_ARTIFACT";
      cardId: CardId;
    }
  | {
      /**
       * Octavia's Gold I reaction: discard a specific held card from hand the
       * moment a Resource die is rolled (offered inside rollResourceDice, mirroring
       * the Diplomat's Ring reroll reaction). The die-set that follows overrides
       * the rolled face.
       */
      type: "CONSUME_HELD_CARD";
      cardId: CardId;
      optionLabel: string;
    }
  | {
      /** Terrible Plague: flip one army card from Pack back to Few. */
      type: "FLIP_PACK_TO_FEW";
      armyUnitId: string;
    }
  | {
      /** Isra's Friends / settlements: reinforce a Few unit, possibly at half cost. */
      type: "REINFORCE_ARMY_UNIT";
      armyUnitId: string;
      halfCost: boolean;
    }
  | {
      /** Neutral Skeletons reward: reinforce one Few unit for free (Few→Pack). */
      type: "REINFORCE_FREE";
      armyUnitId: string;
    }
  | {
      /**
       * Add a unit of `unitDefId` to the army for free. `side` defaults to "few"
       * (Garden of Life, Conflux); a Creature Bank "gain a Stacked unit" reward
       * passes "pack" for the bigger version.
       */
      type: "RECRUIT_FREE";
      unitDefId: string;
      side?: "few" | "pack";
    }
  | {
      /**
       * Legion artifact: the player picked which unit the just-played discount
       * side applies to. Banks one `RecruitDiscountVoucher` for that exact target
       * (no-op input; resolves automatically once the unit is chosen).
       */
      type: "BANK_RECRUIT_DISCOUNT";
      cardId: CardId;
      amount: number;
      target:
        | { kind: "recruit"; unitDefId: string }
        | { kind: "reinforce"; armyUnitId: string };
    }
  | { type: "SEARCH_SHARED_DECK"; deckId: DeckId; count: number }
  | { type: "SETTLEMENT_CHOICE" }
  | {
      /**
       * Reward for flagging an enemy Town (rulebook p.76: "Scenarios typically
       * have special rewards for flagging them"). The conqueror raises one
       * production track by a single resource-gain level: +5 gold, +2 building
       * materials, or +1 valuables.
       */
      type: "RESOURCE_GAIN_LEVEL";
    }
  | { type: "MAGIC_SPRING" }
  | { type: "WITCH_HUT" }
  | { type: "SCHOLAR" }
  | {
      /**
       * Scholar ability card (expert): offer to remove one non-empowered
       * Statistic card from hand or discard and gain its Empowered version on
       * top of the discard pile. Recurses up to `remaining` times; `takenTypes`
       * lists the Empowered statistic types already taken this play, which may
       * not be taken again ("up to N different Empowered Statistic cards").
       */
      type: "SCHOLAR_EMPOWER_PICK";
      remaining: number;
      takenTypes: string[];
    }
  | {
      /** Scholar (expert): remove the chosen Statistic card, bank its Empowered form. */
      type: "SCHOLAR_EMPOWER_GIVE";
      source: "hand" | "discard";
      cardId: string;
    }
  | {
      /**
       * Choose one: trade resources (repeatable within the visit), sell one
       * hand card for 1 gold, or buy a war machine at the higher price.
       * `traded` locks the visit to resource trading once a trade happened.
       */
      type: "TRADING_POST";
      traded?: boolean;
    }
  | {
      /** War Machine Factory: buy one war machine at the lower price. */
      type: "WAR_MACHINE_SHOP";
    }
  | {
      /**
       * Astrologers (McGiver): open the self-rebuilding menu to take one War
       * Machine of the player's choice from the shared supply for free. Rebuilt
       * from the live supply each time so a second player never sees a machine an
       * earlier one already took; offers a Skip exit (the take is optional).
       */
      type: "WAR_MACHINE_GRANT_OFFER";
    }
  | {
      /**
       * McGiver grant leaf: move the chosen war machine from the shared supply to
       * the player's hand at no cost (they play it as a permanent later).
       */
      type: "GRANT_WAR_MACHINE";
      cardId: CardId;
    }
  | {
      /**
       * Astrologers (Charlie and his Circus): draw one Neutral Unit per Dwelling
       * tier the player controls (capped at `maxDraws`), then open a paid recruit
       * menu over them. Azure is never drawn — no Dwelling unlocks it.
       */
      type: "NEUTRAL_RECRUIT_OFFER";
      maxDraws: number;
    }
  | {
      /**
       * Neutral-recruit leaf: recruit `recruit` (paying its cost) and return every
       * other card in `drawn` to its tier's discard pile. A null `recruit`
       * declines and shuffles all of `drawn` back.
       */
      type: "RECRUIT_DRAWN_NEUTRAL";
      recruit: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" } | null;
      drawn: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
    }
  | {
      /**
       * Astrologers (Unexpected Reinforcements): open a free recruit menu over the
       * Neutral Units deck cards associated with the player's faction (the neutral
       * counterpart of a roster unit) whose Dwelling tier they have built and whose
       * card is still in the deck. Azure never qualifies — no Dwelling unlocks it.
       */
      type: "FACTION_RECRUIT_OFFER";
    }
  | {
      /**
       * Faction-recruit leaf: take one copy of neutral `unitDefId` from its tier's
       * Neutral Units deck and add it to the army's single-sided Neutral side, for
       * free. Recruited as neutral, it can never be reinforced to a Pack.
       */
      type: "RECRUIT_FACTION_UNIT";
      unitDefId: CardId;
    }
  | { type: "DISCOVER_ADJACENT_TILE" }
  | {
      /** Sea Chest / Jetsam: roll one Attack die, resolve the matching branch. */
      type: "ATTACK_DIE_TABLE";
      plus: VisitStep[];
      zero: VisitStep[];
      minus: VisitStep[];
    }
  | {
      /**
       * Remove one hand card from the game, then resolve the follow-up
       * (Witch Hut / Trading Post / Faerie Ring / Market of Time).
       */
      type: "REMOVE_HAND_CARD";
      prompt: string;
      filter: "any" | "ability" | "statistic" | "removable";
      then: "none" | "gain-valuables" | "search-same-deck" | "choose-deck-search";
      /** Depth of the follow-up Search (Miriam's Scouting VI digs 4); defaults to 2. */
      searchCount?: number;
      /**
       * Miriam's Scouting IV/VI: when the follow-up is "search-same-deck" and the
       * removed card is a Spell/Artifact, offer a CHOICE among the higher split
       * decks too — Major artifacts and Expert spells — which the specialty's
       * scouting reach grants regardless of the usual hero-level / artifact-source
       * gate. Bronze "ability" (Scouting I) never sets this (the Ability deck has
       * no tiers).
       */
      tieredReach?: boolean;
    }
  | {
      /**
       * Spellbinder's Hat (option B): open a menu of every card in the player's
       * hand AND discard pile; the picked one is removed from the game. Builds a
       * CHOOSE_ONE whose options each carry a REMOVE_CARD_FROM_PILE leaf.
       */
      type: "REMOVE_ONE_FROM_HAND_OR_DISCARD";
      prompt: string;
    }
  | {
      /** Removes the named card from the player's hand or discard pile (→ removed). */
      type: "REMOVE_CARD_FROM_PILE";
      cardId: CardId;
      source: "hand" | "discard";
    }
  | {
      /** University: pick one of the top cards of a shared discard pile. */
      type: "SEARCH_DISCARD";
      deckId: DeckId;
      count: number;
    }
  | {
      /**
       * Pyramid (Creature Bank): rebuild a remove-then-search menu up to
       * `remaining` more times. Each pick removes one Spell/Ability/Artifact
       * card from hand or discard pile and Searches (`searchCount`) the deck
       * matching the removed card; a Done exit ends the loop early.
       */
      type: "REMOVE_THEN_SEARCH_REPEAT";
      remaining: number;
      searchCount: number;
    }
  | {
      /**
       * Dragon Fly Hive / Griffin Conservatory bonus: build a menu of the
       * player's own non-Empowered Ability cards (hand + discard); picking one
       * Empowers it (a MARK_ABILITY_EMPOWERED leaf). No-op when none are owned.
       */
      type: "EMPOWER_ABILITY";
    }
  | {
      /** Adds `cardId` to the player's permanent empoweredAbilities list. */
      type: "MARK_ABILITY_EMPOWERED";
      cardId: CardId;
    }
  | {
      /** Hill Fort: reinforce one Few unit, its cost reduced by 3 gold (min 0). */
      type: "HILL_FORT";
    }
  | {
      /**
       * Subterranean Gate: entering the gate discovers the tile on the other
       * layer for free if it is still face-down. Otherwise the gate is an empty
       * field (the hero simply walks across the linked gate↔entrance edge).
       */
      type: "SUBTERRANEAN_GATE";
    }
  | {
      /** Logistics / Town Portal: place the hero on the field directly. */
      type: "TELEPORT_HERO";
      heroId: HeroId;
      spaceId: MapSpaceId;
      /** Whether arriving resolves the field like a normal visit. */
      visit?: boolean;
      /** Town Portal Power 2/4: movement granted to the hero on arrival. */
      movementBonus?: number;
    }
  | {
      /** Scholar basic / Rib Cage / Crown of Dragontooth: discard-pile pick. */
      type: "TAKE_DISCARD_CARD";
      cardId: CardId;
      shuffleRestIntoDeck?: boolean;
    }
  | {
      /** Consumes a one-shot active effect once its benefit was taken. */
      type: "CONSUME_EFFECT";
      effectId: string;
    }
  | {
      /** Pandora's Box: draw the top card of the Pandora deck into hand. */
      type: "DRAW_PANDORA_CARD";
    }
  | {
      /** Necromancy Amplifier: fetch the Ability deck's first Necromancy card. */
      type: "NECROMANCY_FETCH";
    }
  | {
      /** Queue a discard-pile pick through the shared reward pipeline. */
      type: "DISCARD_PICK";
      count: number;
      filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic" | "spell-or-specialty";
    }
  | {
      /**
       * Mana Vortex: the chosen card is discarded, the discard pile shuffles
       * back into the deck, then Search(3) from the own deck.
       */
      type: "MANA_VORTEX_RESOLVE";
      discardCardId: CardId;
    }
  | {
      /** Portal of Summoning: draw the top Neutral card of the chosen tier. */
      type: "PORTAL_SUMMON";
      tier: "bronze" | "silver" | "gold";
    }
  | {
      /** Portal of Summoning: pay the printed cost to recruit the drawn card. */
      type: "PORTAL_RECRUIT";
      unitDefId: string;
    }
  | {
      /** Portal of Summoning: the drawn card goes to its tier discard pile. */
      type: "PORTAL_DECLINE";
      unitDefId: string;
    }
  | {
      /** Saplings / settlement perks: reinforce with only the gold halved. */
      type: "REINFORCE_HALF_GOLD";
      armyUnitId: string;
      /** Necromancy: "half the gold cost (rounded down)" instead of up. */
      roundDown?: boolean;
    }
  | {
      /** Cove Pub: reinforce one unit with a flat gold discount (min 0). */
      type: "REINFORCE_FLAT_GOLD";
      armyUnitId: string;
      discount: number;
    }
  | {
      /**
       * Library of Enlightenment: open the swap menu — pick a Statistic card
       * (hand or discard) to remove for 3 gold. `remaining` swaps are left.
       */
      type: "LIBRARY_SWAP";
      remaining: number;
    }
  | {
      /** Library: pay 3 gold, remove the chosen source, then pick a replacement. */
      type: "LIBRARY_REMOVE";
      cardId: CardId;
      source: "hand" | "discard";
      remaining: number;
    }
  | {
      /** Library: gain the chosen replacement Statistic, then loop if swaps remain. */
      type: "LIBRARY_GAIN";
      statisticType: StatisticType;
      remaining: number;
    }
  | {
      /** Star Axis: open the menu to swap a hand Statistic for its Empowered form. */
      type: "STAR_AXIS_SWAP";
    }
  | {
      /** Star Axis: remove the chosen hand Statistic and gain its Empowered form. */
      type: "STAR_AXIS_GIVE";
      cardId: CardId;
    }
  | {
      /**
       * Astrologers (Dancing Imp / Hero): open the self-rebuilding menu to
       * empower one Statistic card. Offers each non-Empowered Statistic in the
       * given `sources` (deduped by source+type); `costGold` (Hero) is charged
       * per swap; `remaining` chains further offers (Hero's "up to twice").
       */
      type: "STAT_EMPOWER_OFFER";
      sources: ("hand" | "discard")[];
      remaining: number;
      prompt: string;
      costGold?: number;
    }
  | {
      /**
       * Astrologers empower leaf: remove the named Statistic card from `source`
       * (→ removed) and add the same-type Empowered Statistic to the hand. Pays
       * `costGold` first when present (Hero); a free swap omits it (Dancing Imp).
       */
      type: "EMPOWER_STATISTIC";
      cardId: CardId;
      source: "hand" | "discard";
      costGold?: number;
    }
  | {
      /**
       * Plane Between Planes: open the self-rebuilding menu to Remove up to
       * `remaining` more cards from the hand or discard pile (optional — each
       * step offers a Done exit). Each pick chains a REMOVE_CARD_FROM_PILE leaf.
       */
      type: "REMOVE_UP_TO";
      remaining: number;
    }
  | {
      /** Black Market: open the buy menu over the top Artifact discards. */
      type: "BLACK_MARKET";
    }
  | {
      /** Black Market: pay the rarity price and take the chosen artifact. */
      type: "BLACK_MARKET_BUY";
      cardId: CardId;
      deckId: DeckId;
      price: number;
    }
  | {
      /**
       * Elemental Conflux: open the recruit menu — one Elementals card per
       * Dwelling tier you have, drawn from the matching Neutral deck.
       */
      type: "ELEMENTAL_CONFLUX";
    }
  | {
      /** Elemental Conflux: recruit the chosen Elementals card for its cost. */
      type: "ELEMENTAL_RECRUIT_ONE";
      unitDefId: string;
      tier: "bronze" | "silver" | "gold";
    }
  | {
      /**
       * Tavern: pay 7 gold to gain a Secondary Hero on this field, then choose
       * one enemy to discard 1 random card. Resolved through the visit-choice
       * action (decline, or pick which enemy to hit).
       */
      type: "TAVERN";
    }
  | {
      /**
       * Prison: gain a Secondary Hero on this field, or 3 gold if you already
       * have one. Auto-resolves with no input.
       */
      type: "PRISON";
    }
  | {
      /**
       * Spell Scroll field: draw `remaining` Spells (one at a time, the player
       * picks the Basic or Expert Magic deck for each) into a single new scroll
       * placed near the hero. Self-expands into deck-pick + DRAW_SCROLL_SPELL.
       */
      type: "SPELL_SCROLL";
      remaining: number;
      /** The scroll being filled; created on the first draw. */
      scrollId?: string;
    }
  | {
      /** One Spell Scroll draw: take the top card of `deckId` into the scroll. */
      type: "DRAW_SCROLL_SPELL";
      deckId: DeckId;
      scrollId: string;
    };

export type AstrologersState = {
  /** Face-up Astrologers Proclaim card in effect until the next even round. */
  activeCardId: string | null;
  /** One-shot "next Resource Round" income adjustments (Gold Dragon & co). */
  nextResourceModifiers: { gold: number; valuables: number };
  /** Players whose first spell already returned to hand (Crazy Wizard). */
  crazyWizardUsedBy: PlayerId[];
  /** Players who already used this turn's free die reroll (Swift Weasel). */
  swiftWeaselUsedBy: PlayerId[];
};

export type PendingTileChoice = {
  /** Tile just revealed/placed: this player must choose its rotation. */
  tileInstanceId: string;
  playerId: PlayerId;
  kind: "reveal" | "place";
  /**
   * The hero that placed this tile (Far placements only). The chosen rotation
   * must leave a border-line doorway this hero can cross onto the tile through.
   */
  heroId?: HeroId;
};

/** Result of the start-of-game Attack-die roll for the first player. */
export type FirstPlayerRollState = {
  attempts: { rolls: { playerId: PlayerId; name: string; value: number }[] }[];
  winnerPlayerId: PlayerId;
};

/**
 * An attacker stepped onto an enemy Town/Settlement whose owner has no hero
 * there: the owner decides whether to pay 8 gold and defend with units only.
 */
export type PendingGarrisonState = {
  attackerPlayerId: PlayerId;
  attackerHeroId: HeroId;
  defenderPlayerId: PlayerId;
  fieldId: MapSpaceId;
};

export type AdventureState = {
  difficulty: GameDifficulty;
  /** Scenario this map was built from (data/map/scenarios). */
  scenarioId?: string;
  tiles: Record<string, MapTileState>;
  fields: Record<MapSpaceId, MapFieldState>;
  /** Face-down Far tiles each player may place for 1 MP. */
  playerFarTiles: Record<PlayerId, string[]>;
  /** Start-of-game first-player roll, shown to every seat. */
  firstPlayerRoll?: FirstPlayerRollState | null;
  /** Garrison decision pending while an undefended town is attacked. */
  pendingGarrison?: PendingGarrisonState | null;
  /**
   * Shared face-up war machine pile (one copy of each card). Bought machines
   * leave the supply for good — they live in the buyer's deck from then on.
   */
  warMachineSupply?: CardId[];
  /** Pandora's Box deck: shuffled draw pile (top = last element). */
  pandoraDeck?: CardId[];
  /**
   * Creature Bank token piles (Naval Battles optional rule). Two shuffled piles
   * of CreatureBankId — one for Far Map Tiles (II-III), one for Near (IV-V) —
   * drawn from (top = last element) when a player places a bank on a discovered
   * tile's Blocked Field. Present only when the rule is enabled; an empty pile
   * means every token of that type has been placed.
   */
  creatureBankTokensFar?: string[];
  creatureBankTokensNear?: string[];
  /** Field visit currently being resolved (choices pending). */
  pendingVisit: PendingVisit | null;
  /**
   * After-combat Necromancy decision (BINH house rule). Set when a player wins a
   * non-Quick Combat AND can play a Necromancy ability at that very instant.
   * While it is set the winner may ONLY play Necromancy or skip it — nothing else
   * on the map is legal and the field reward of the fight they just won is
   * withheld (its visit is stored here) until the decision is made. This is what
   * stops "collect the field gold, THEN reinforce with it": the reinforce is
   * priced on the gold held before the reward lands. Cleared the instant the
   * decision is made and never reopens until the next non-Quick Combat win.
   */
  pendingNecromancy?: {
    playerId: PlayerId;
    /** The post-combat field visit deferred behind the decision (if any). */
    heroId?: HeroId;
    fieldId?: MapSpaceId;
  } | null;
  /** Rewards waiting to resolve one at a time (level-up searches, City Halls). */
  rewardQueue: AdventureReward[];
  /** Last field each hero visited, where a retreating hero returns. */
  lastVisitedField: Record<HeroId, MapSpaceId>;
  /** Victory: flagging an enemy town wins the scenario (default skirmish). */
  winnerPlayerId: PlayerId | null;
  /**
   * How this game is won. Absent on snapshots from before win conditions
   * existed; treated as "conquest" (flag an enemy town).
   */
  victoryMode?: VictoryMode;
  /**
   * Whether dead units are kept after a player-vs-player Combat. Absent on
   * older snapshots; treated as "normal" (the rulebook — casualties are lost).
   */
  pvpTroopLoss?: PvpTroopLoss;
  /**
   * Spell Book house rule (default ON). When on, each player has a personal
   * Spell Book zone (PlayerState.spellBook) they may stash hand Spells into, cast
   * or boost from, and refill from the discard pile. Off hides the move-to-Book
   * action and the discard→Book pickup option entirely, so the Book stays empty
   * and inert. Absent on older snapshots; treated as ON (see spellBookRuleEnabled).
   */
  spellBook?: boolean;
  /**
   * Grail Hunt: the single Grail Token's progress. Only one token exists in
   * the game even when several Grail fields are on the map.
   */
  grail?: {
    status: "uncollected" | "carried" | "delivered";
    /** Hero physically carrying the dug Grail back toward their town. */
    carrierHeroId?: HeroId;
  };
  /**
   * Grail Hunt / Dragon Hunt: distinct enemy players each player has beaten in
   * hero combat at least once (the "defeat every enemy hero" win path).
   */
  heroDefeats?: Record<PlayerId, PlayerId[]>;
  /** Tile awaiting its rotation choice after a reveal or placement. */
  pendingTileChoice?: PendingTileChoice | null;
  /** Astrologers Proclaim deck state (even rounds). */
  astrologers?: AstrologersState;
};

/**
 * Adjustable game options chosen during map setup (rulebook setup steps 1, 8,
 * 9 and the difficulty choice): starting map, neutral difficulty (the Field
 * Difficulty Level Table column — Impossible by default), starting resources,
 * base income ("resource gain", 10 gold / 0 materials / 0 valuables by
 * default), starting units and pre-built buildings.
 */
export type GameSetupOptions = {
  scenarioId: string;
  /** Seats in the map-setup lobby, clamped to the scenario's min/max players. */
  playerCount?: number;
  /** Rules variant: "legacy" (rulebook) or "binh" (house rules). */
  ruleset: GameRuleset;
  /** Win condition: "conquest" (flag enemy town), "grail", "dragon-hunt" or "dragon-conqueror". */
  victoryMode?: VictoryMode;
  /** PvP Combat casualties: "normal" (lose dead units) or "none" (keep troops). */
  pvpTroopLoss?: PvpTroopLoss;
  /**
   * Naval Battles optional rule. When on (default), discovering a Far/Near Map
   * Tile with a Blocked Field lets the discovering player place a Creature Bank
   * token there. Off disables the offer and the token piles entirely.
   */
  creatureBanks?: boolean;
  /**
   * Spell Book house rule (default ON). Gives every player a personal Spell Book
   * zone they may stash hand Spells into to free slots, then cast or boost from.
   * Off disables the move-to-Book action and the discard→Book pickup entirely.
   */
  spellBook?: boolean;
  /**
   * Whether players may open their own Ⅱ–Ⅲ Far tiles (default ON). When ON each
   * player drafts a personal Far-tile supply they can place onto the map. Off
   * gives no supply at all — use it for scenarios whose map already includes its
   * Ⅱ–Ⅲ tiles, so there is nothing left for players to open.
   */
  farTileOpening?: boolean;
  difficulty: GameDifficulty;
  startingResources: { gold: number; buildingMaterials: number; valuables: number };
  startingProduction: { gold: number; buildingMaterials: number; valuables: number };
  startingUnitTiers: ("bronze" | "silver" | "gold")[];
  /**
   * Starting army by unit level: one optional few/pack entry per level 1-7.
   * Every player receives their own faction's unit of that level. When set
   * (non-null — may be empty for "no units"), it replaces the tier default.
   */
  startingUnits?: CustomStartingUnit[] | null;
  /** Building ids without the faction prefix (e.g. "city_hall"). */
  startingBuildings: string[];
  /**
   * Designed map (made in the map designer and saved): replaces the
   * scenario's face-down Near/Center layout with the saved tiles. Starting
   * tiles stay fixed by faction and seat.
   */
  customMap?: CustomMapTilePlan[] | null;
  /** Display name of the saved map design the lobby picked. */
  customMapName?: string | null;
};

/** PC unit level (1-7): levels 1-3 are bronze, 4-5 silver, 6-7 gold. */
export type UnitLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * One starting-army entry: a unit level (1-7) and the few or pack side.
 * Each player receives their own faction's unit of that level. Older saved
 * lobbies stored a unit tier or an exact `unitDefId`; the setup still
 * honors those snapshots.
 */
export type CustomStartingUnit = {
  /** Unit level 1-7 (the merged starting-units mode). */
  level?: UnitLevel;
  /** Legacy tier entry from older saved lobbies. */
  tier?: "bronze" | "silver" | "gold";
  side: "few" | "pack";
  /** Legacy exact-unit entry from older saved lobbies. */
  unitDefId?: string;
};

/**
 * One designed map tile. Face-down tiles draw randomly from their group's
 * pool when the adventure starts ("down means random"); face-up tiles place
 * the chosen tile, already revealed, at the chosen rotation.
 */
export type CustomMapTilePlan = {
  row: number;
  col: number;
  /**
   * Which pool/role the tile fills:
   * - "starting" (Ⅰ): a seat's town — the position of player N's faction
   *   starting tile (the tile art itself comes from the faction, never random).
   * - "far" (Ⅱ–Ⅲ), "near" (Ⅳ–Ⅴ), "center" (Ⅵ–Ⅶ), "sea", "subterranean":
   *   face-down draws a random tile from that supply; face-up places a chosen one.
   */
  group: "starting" | "far" | "near" | "center" | "sea" | "subterranean";
  faceDown: boolean;
  /** Face-up tiles: the exact tile to place. Ignored while face-down or starting. */
  tileDefId?: string;
  /** Face-up tiles: clockwise 60° steps (0-5, default 0). */
  rotation?: number;
  /**
   * Sea tiles only: which guard band this slot belongs to. The Cove sea pool
   * ships both Ⅳ–Ⅴ and Ⅵ–Ⅶ tiles behind one wave back, so the designer offers
   * them as two palette entries — a face-down sea slot then draws only from the
   * matching band. Undefined (older saved maps) means "any sea tile".
   */
  seaBand?: "iv-v" | "vi-vii";
};

/** Pre-game lobby: players pick factions and heroes before the map builds. */
export type GameSetupState = {
  scenarioId: string;
  options: GameSetupOptions;
  seats: {
    playerId: PlayerId;
    name: string;
    factionId: FactionId | null;
    heroDefId: string | null;
  }[];
};

export type TownState = {
  id: TownId;
  controllerId: PlayerId;
  buildings: string[];
  factionId?: FactionId;
  /** Map field the town occupies in adventure mode. */
  fieldId?: MapSpaceId;
  /**
   * Faction cubes stored on cube buildings (Brimstone Stormclouds, Cage of
   * Warlords), keyed by building id. Gained on build and on the building's
   * round trigger, spent during combat.
   */
  factionCubes?: Record<string, number>;
};

export type HeroState = {
  id: HeroId;
  controllerId: PlayerId;
  kind: "main" | "secondary";
  heroDefId?: string;
  level: number;
  /** Experience steps within the level track (2 per level). */
  experience: number;
  movementPoints: number;
  movementPointsMax: number;
  spaceId: MapSpaceId | null;
  /**
   * Set when the hero takes a step touching a sea field without Water Walk —
   * wading in (land→sea), wading out (sea→land), or moving within the sea: their
   * movement is over for the turn (they cannot take another step), even though
   * their remaining movement points are kept so a neutral combat on a sea field
   * can still spend them. Cleared when movement refreshes. Water Walk never sets
   * it (the hero keeps moving across the sea).
   */
  movementHaltedThisTurn?: boolean;
};

export type AttackRollCandidate = {
  rolls: number[];
  roll: number;
  /**
   * Every die rolled contributes to `roll` (the faces are summed/counted) rather
   * than one selected face — Slayer (count the "+1"s) and the Neutral Champions'
   * "apply both" roll. The dice overlay then shows all dice lit, never dimming
   * the "unused" ones the way it does for an advantage/disadvantage keep-one roll.
   */
  sumAllDice?: boolean;
};

export type AttackRerollSource = {
  /** Display name shown to the player (unit ability, Fortune, Luck, …). */
  name: string;
  /** Backing active effect; unit-ability rerolls have none. */
  effectId?: string;
  /** Positive morale token: spending the reroll discards the token. */
  morale?: boolean;
  /**
   * Held reroll artifact (Diplomat's Ring / Ambassador's Sash): taking the
   * reroll plays the card, discarding it from the owner's hand.
   */
  cardId?: CardId;
  /**
   * Printed face gate (Crusaders: 'reroll every "0"'): the source is only
   * usable while the current roll shows this face, and using it never
   * depletes `remaining` — every new matching face may be rerolled again.
   */
  onlyOnRoll?: number;
  remaining: number;
  used: number;
};

export type PendingChoice =
  | {
      id: string;
      type: "ATTACK_DIE_REROLL";
      playerId: PlayerId;
      stackItemId: string;
      attackerId: UnitId;
      defenderId: UnitId;
      isRetaliation: boolean;
      attackKind: "melee" | "ranged";
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      candidates: AttackRollCandidate[];
      remainingRerolls: number;
      /** Reroll pools in spend order — Luck is always sorted last. */
      rerollSources: AttackRerollSource[];
      sourceEffectIds: string[];
    }
  | {
      id: string;
      type: "DECK_SEARCH";
      playerId: PlayerId;
      deckId: DeckId;
      /** Cards lifted off the top of the deck; only the searcher may see them. */
      revealedCardIds: CardId[];
      /** Pendant of Courage: this search repeats once after it resolves. */
      repeatSearch?: { deckId: DeckId; count: number };
      returnPhase: GamePhase;
    }
  | {
      id: string;
      type: "OPTION_CHOICE";
      playerId: PlayerId;
      prompt: string;
      options: { label: string }[];
      context:
        | "city-hall"
        | "satyr-swap"
        | "war-machine"
        | "deck-pick"
        | "deck-search-mode"
        | "scouting-prompt"
        | "discard-pick"
        | "hand-discard"
        | "eagle-eye"
        | "own-deck-pick"
        | "artifact-deck-pick"
        | "garrison"
        | "siege-gate"
        | "siege-demolish"
        | "remove-obstacle"
        | "skeleton-reinforce"
        | "rogues-scout"
        | "thieves-guild"
        | "combat-reposition"
        | "genie-take-spell"
        | "combat-knockback"
        | "combat-teleport"
        | "place-battlefield-tokens"
        | "combat-clone"
        | "combat-step"
        | "combat-activation-order"
        | "cover-of-darkness"
        | "shackles-of-war"
        | "diplomacy-skip"
        | "diplomacy-recruit"
        | "dimension-door"
        | "view-earth"
        | "learning-level-up"
        | "fortune-boost"
        | "visions-boost"
        | "visions-deck"
        | "visions-scry"
        | "place-creature-bank";
      /**
       * city-hall: the income options for the City Hall (Resource-round) choice
       * under resolution, index-aligned with `options`. Stored here in game
       * state so the pick survives serialization (reload / reconnect / server
       * restart). It previously lived in a module-level variable that reset to
       * null off-process, which made the choice unresolvable and left the player
       * stuck in the "choice" phase, unable to draw or discard.
       */
      cityHall?: {
        options: {
          label: string;
          gold?: number;
          buildingMaterials?: number;
          valuables?: number;
          movement?: number;
          drawCards?: number;
          reinforceBronzeFree?: boolean;
          tradingPost?: boolean;
          searchSpellDeck?: number;
          /** Cove City Hall: gain Hero experience (paired with removeArtifactFromHand). */
          experience?: number;
          /** Cove City Hall: this option removes one Artifact card from hand as its cost. */
          removeArtifactFromHand?: boolean;
        }[];
      };
      /** combat-reposition: Harpies' optional fly-back after their attack. */
      reposition?: { unitId: UnitId; originPosition: number };
      /**
       * genie-take-spell: the Spells dug out of the Genies' controller's deck
       * (index-aligned with `options`); the chosen one goes to hand, the rest to
       * discard. `mode` decides how combat resumes afterwards.
       */
      genieTakeSpell?: { spellCardIds: CardId[]; unitId: UnitId; mode: "other-action" | "on-attack"; abilityId: string };
      /**
       * combat-knockback: the Ghost Dragons shoved `unitId` after their attack;
       * the defender picks which empty space (index-aligned with the options) to
       * move to. `attackerId` is the Ghost Dragons whose attack triggered it.
       */
      knockback?: { unitId: UnitId; attackerId: UnitId; positions: number[] };
      /**
       * combat-teleport: the Teleport Spell moved this unit; the caster picks
       * which empty space (index-aligned with the options) it lands on.
       */
      teleport?: { unitId: UnitId; positions: number[] };
      /**
       * place-battlefield-tokens: the caster places the rest of a Quicksand /
       * Land Mine set, one token per pick. `positions` are the empty spaces still
       * open (index-aligned with the options; a trailing "stop" option carries no
       * position). `armedSlots` is the shuffled armed/decoy assignment for the
       * placement slots in order — kept private to the caster (see player-view) —
       * and `placedCount` is how many tokens are already down, so the next one
       * takes `armedSlots[placedCount]`. `remaining` caps how many more may drop.
       */
      placeTokens?: {
        kind: "quicksand" | "land_mine";
        positions: number[];
        armedSlots: boolean[];
        placedCount: number;
        remaining: number;
        triggerDamage: number;
      };
      /**
       * combat-clone: the Clone Spell is placing a copy of `originalUnitId`; the
       * caster picks which empty space adjacent to it (index-aligned with the
       * options) the Clone Token lands on.
       */
      clone?: { originalUnitId: UnitId; positions: number[] };
      /**
       * combat-step: Necklace of Swiftness moved this unit one space; the
       * controller picks which empty orthogonally-adjacent space (index-aligned
       * with the options) it steps to.
       */
      step?: { unitId: UnitId; positions: number[] };
      /**
       * combat-activation-order: several units of one side are tied for the next
       * activation slot (same effective initiative); the chooser picks which one
       * activates now (index-aligned with the options). `side` is the controller
       * those tied units belong to — usually the chooser's own side, but for the
       * Neutral army it is NEUTRAL_PLAYER_ID while the attacker breaks the tie on
       * its behalf, so resolution validates the pick against `side`, not the
       * answering player.
       */
      activationOrder?: { unitIds: UnitId[]; side: PlayerId };
      /** deck-pick: the shared-deck search waiting on the deck choice. */
      deckPick?: { deckIds: DeckId[]; count: number };
      /**
       * deck-search-mode: a "Search X" with a non-empty discard pile, waiting on
       * the up-front either/or — Search the deck (reveal the top X, keep one) OR
       * take the top of that deck's discard pile. The searched cards are only
       * revealed if the player commits to searching.
       */
      deckSearchMode?: {
        deckId: DeckId;
        count: number;
        /** Basic X Magic schools offered as "draw instead of Searching" options. */
        schoolFetch?: SpellSchool[];
        /** Whether a "take the top discard" option is offered (index 1). */
        hasDiscardTop?: boolean;
      };
      /**
       * scouting-prompt: a held Scouting card may be played before a Search. The
       * pop-up offers, in option order: [decline], then "Search (3)" (basic) when
       * `offerBasic`, then "Search (5)" (expert, spends a crown) when `offerExpert`.
       * Resolving creates the SEARCH_COUNT_OVERRIDE and re-enters the Search; the
       * deck + base count are kept here so the search can resume after the choice.
       */
      scoutingPrompt?: {
        deckId: DeckId;
        baseCount: number;
        offerBasic: boolean;
        offerExpert: boolean;
      };
      /** own-deck-pick: revealed cards of the player's own deck (Mana Vortex). */
      ownDeckPick?: {
        cardIds: CardId[];
        /**
         * Adrienne's Fire Magic IV: after the pick (the chosen card to hand, the
         * rest to discard), shuffle the player's whole discard pile back into
         * their deck. Omitted for Mana Vortex / Chain Lightning IV.
         */
        thenReshuffleDiscard?: boolean;
      };
      /** artifact-deck-pick (Tazar's War Hero VI): the Artifact decks to draw from. */
      artifactDeckPick?: { deckIds: DeckId[] };
      /** rogues-scout: the deck being peeked and its revealed top card. */
      rogueScout?: { deckId: DeckId; cardId: CardId };
      /**
       * thieves-guild: the deck being peeked and its top 2 cards (index 0 is the
       * very top). The chosen option's card is discarded; the other returns on
       * top. Private to the peeking player (redacted in player-view).
       */
      thievesGuild?: { target: ThievesGuildTarget; cardIds: CardId[] };
      /** siege-demolish: intact fortification positions and removals left. */
      siegeDemolish?: { positions: number[]; remaining: number };
      /**
       * remove-obstacle: the obstacles still standing (index-aligned with the
       * options), each tagged so resolution knows what to clear — an obstacle
       * marker, a siege Wall / Gate, or a battlefield token (Force Field, Fire
       * Wall, Quicksand, Land Mine, carrying its `tokenId`). `remaining` caps how
       * many more the caster may remove.
       */
      removeObstacle?: {
        items: { position: number; kind: "obstacle" | "wall" | "gate" | "token"; tokenId?: string }[];
        remaining: number;
      };
      /** skeleton-reinforce: the bronze Few army units that may be flipped free. */
      skeletonReinforce?: { armyUnitIds: string[] };
      /** discard-pick: the candidate cards (index-aligned with options). */
      discardPick?: {
        cardIds: CardId[];
        /**
         * Spell Book (house rule): where each option routes the picked card —
         * "hand" (default) or "spellBook". Index-aligned with `cardIds`/`options`,
         * so a Spell candidate can appear twice (a "to hand" and a "to Book"
         * option). Absent = every pick goes to hand.
         */
        destinations?: ("hand" | "spellBook")[];
        remaining: number;
        filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic" | "spell-or-specialty" | "magic-arrow";
        fromTop?: number;
        shuffleRestIntoDeck?: boolean;
      };
      /** eagle-eye: the dug spell waiting on take/discard. */
      eagleEye?: { deckId: DeckId; cardId: CardId };
      /** hand-discard: candidate hand cards (index-aligned with options) and how many still to discard (Charm of Mana / Shackles of War). */
      handDiscard?: { cardIds: CardId[]; remaining: number; drawnOnly: boolean };
      /**
       * dimension-door: the Hero being teleported and the candidate
       * destination fields (index-aligned with the options; the final "stay"
       * option carries no destination).
       */
      dimensionDoor?: { heroId: HeroId; destinations: MapSpaceId[] };
      /**
       * view-earth: the casting Hero and the enemy-owned Mine fields in reach
       * (index-aligned with the options; the final "Cancel" option carries no
       * Mine). Resolving captures the chosen Mine for the caster.
       */
      viewEarth?: { heroId: HeroId; mineSpaceIds: MapSpaceId[] };
      /**
       * diplomacy-skip: the neutral fight Cyra's Diplomacy may skip. Option 0
       * uses the card (claim the field, no XP); option 1 fights normally.
       */
      diplomacySkip?: { heroId: HeroId; fieldId: MapSpaceId; difficulty: number };
      /**
       * diplomacy-recruit: the Neutral Unit cards drawn (one per Dwelling) and
       * the affordable subset offered as recruit options, in option order. The
       * final option always declines; every undrawn-but-recruited card and all
       * declined draws return to their tier deck's discard pile.
       */
      diplomacyRecruit?: {
        draws: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
        recruitable: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
      };
      /**
       * learning-level-up: the Learning play modes offered, index-aligned with
       * the options. The final "decline" option carries no mode. Resolving a
       * mode discards (basic) or removes (expert) one Learning card from hand and
       * advances the Hero's Experience.
       */
      learningLevelUp?: { modes: ("basic" | "expert")[] };
      /**
       * visions-boost: paying Visions' Power on the map. `spellCardIds` are the
       * power-source Spells in hand offered to discard for +1 card each (index-
       * aligned with the leading options; the trailing option scrys now). `boost`
       * is how many have already been paid, capped by `cardsByPower`.
       */
      visionsBoost?: { boost: number; spellCardIds: CardId[]; cardsByPower: Record<number, number> };
      /**
       * fortune-boost: paying Fortune's Power on the map. `spellCardIds` are the
       * power-source cards in hand offered to discard for +1 reroll each (index-
       * aligned with the leading options; the trailing option plays now).
       * `boost` is how many have been paid; `cardId` is the Fortune card whose
       * rerollsByPower maps the boost to the final reroll budget.
       */
      fortuneBoost?: { boost: number; spellCardIds: CardId[]; cardId: CardId };
      /**
       * visions-deck: the Neutral tier decks Visions may scry (index-aligned with
       * the options) and how many cards the chosen power level draws.
       */
      visionsDeck?: { tiers: ("bronze" | "silver" | "gold" | "azure")[]; count: number };
      /**
       * visions-scry: the Neutral cards lifted off the chosen tier deck still
       * awaiting a keep/discard decision (`remaining`), and the cards already
       * kept (`toReturn`, in pick order — the first kept ends on top). The
       * identities stay private to the scrying player.
       */
      visionsScry?: {
        tier: "bronze" | "silver" | "gold" | "azure";
        remaining: CardId[];
        toReturn: CardId[];
      };
      /**
       * place-creature-bank: a discovered Far/Near tile's Blocked Field at
       * `fieldId`, offered to the discovering player to convert into a Creature
       * Bank drawn from the `tier` pile. Option 0 places it, option 1 declines.
       */
      creatureBank?: { fieldId: MapSpaceId; tier: "far" | "near" };
      returnPhase: GamePhase;
    }
  | {
      /**
       * A printed attack ability needs a target: Magog splash (1 flat damage
       * to a unit adjacent to the target), Cerberi second head (1 flat damage
       * to another enemy adjacent to Cerberi), Liches' Death Cloud (a full
       * second attack at base attack 2 against a unit adjacent to the
       * original target), a rulebook AI tie ("the player chooses which
       * unit is attacked"), or a war machine round-start shot.
       */
      id: string;
      type: "ABILITY_TARGET_CHOICE";
      playerId: PlayerId;
      kind:
        | "flat-damage"
        | "second-attack"
        | "neutral-target"
        | "war-machine"
        | "spell-splash"
        | "area-pick"
        | "spell-redirect"
        | "enchanter-activation"
        | "faerie-damage"
        | "chain-lightning"
        | "sacrifice-transfer";
      abilityId: string | null;
      abilityName: string;
      prompt: string;
      /** Unit the ability comes from; null for war machines (cards, not units). */
      sourceUnitId: UnitId | null;
      /** Original attack target the follow-up is anchored to (if any). */
      anchorUnitId: UnitId | null;
      candidateUnitIds: UnitId[];
      /** Flat damage dealt on resolution (flat-damage / faerie-damage kind). */
      amount?: number;
      /** Replacement base attack of the follow-up attack (second-attack kind). */
      baseAttack?: number;
      /** Fireball's second space may be empty: the choice can be skipped. */
      optional?: boolean;
      /** Label of the "skip" action when `optional` (default "Skip"). */
      skipLabel?: string;
      /**
       * Chain Lightning: the still-eligible "closest" units (anchorUnitId is the
       * selected unit), and the damage values still to allocate, leftmost first.
       */
      chainReachableUnitIds?: UnitId[];
      chainRemainingDamages?: number[];
      /**
       * Magic Mirror reflecting an instant combat debuff played onto an attack
       * (Curse on your defender, Weakness on your attacker). The debuff was
       * already lifted off your unit; once the new target is chosen it is pushed
       * onto the pending attack as a one-shot `redirectedInstants` stat delta
       * (−defense for Curse, −attack for Weakness) covering this attack and its
       * retaliation only — an instant, never an ongoing effect or token. Absent
       * for a normal cast redirect, which re-points the pending Spell instead.
       */
      redirectInstant?: {
        stat: "attack" | "defense";
        /** Signed stat delta the instant carries (e.g. −2 for a Power-1 Curse). */
        amount: number;
        sourceCardId: CardId;
      };
      /**
       * "area-pick" (Frost Ring / Meteor Shower VI): how many more adjacent units
       * the caster still has to pick for this blast. Each pick takes `amount`
       * damage; the choice re-opens until this reaches 0 or the candidates run out.
       */
      picksRemaining?: number;
      /** Card the area-pick damage is sourced from (for damage reduction). */
      sourceCardId?: CardId;
    }
  | {
      /**
       * A combat hand-discard prompt with two kinds:
       *  - "magi-power-or-random": Neutral Magi "Power Drain" — after the Magi
       *    attack the defending player discards a Power-contributing card (a
       *    Power statistic or any Spell) of their choice, or lets a random card
       *    be discarded. Combat stays parked on its retaliation until resolved.
       *  - "pegasi-toll": Neutral Pegasi "Mystic Toll" — the caster must pay a
       *    Power card of their choice BEFORE a Spell is cast. The cast is held in
       *    `tollSpell` and replayed once the toll is paid (no random option).
       */
      id: string;
      type: "COMBAT_HAND_DISCARD";
      playerId: PlayerId;
      kind: "magi-power-or-random" | "pegasi-toll";
      abilityId: string;
      abilityName: string;
      sourceUnitId: UnitId;
      prompt: string;
      /** Cards in the chooser's hand that can contribute Power. */
      powerCardIds: CardId[];
      /** "pegasi-toll" only: the Spell cast deferred until the toll is paid. */
      tollSpell?: { cardId: CardId; target: TargetRef; fromScroll?: string; fromSpellDeck?: CardId; fromSpellBook?: boolean };
    }
  | null;

export type GameState = {
  id: string;
  seed: string;
  mode: GameMode;
  /** Rules variant; absent on snapshots saved before modes existed (= legacy). */
  ruleset?: GameRuleset;
  round: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  turnOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  map: MapState;
  adventure: AdventureState | null;
  /** Pre-game lobby choices; null once the adventure map is built. */
  setupLobby?: GameSetupState | null;
  towns: Record<TownId, TownState>;
  heroes: Record<HeroId, HeroState>;
  combat: CombatState | null;
  decks: Record<DeckId, DeckState>;
  stack: ResolutionStackItem[];
  reactionWindow: ReactionWindow | null;
  activeEffects: ActiveEffectState[];
  /**
   * Rolling window of the most recent events (capped — see appendEvent).
   * Ids stay unique across the whole game through `eventCounter`.
   */
  eventLog: GameEvent[];
  /** Monotonic event id counter; absent on snapshots from before the cap. */
  eventCounter?: number;
  pendingChoice: PendingChoice;
  turn: TurnState;
  /**
   * Room membership/seating (host, seats, observers). Absent on legacy
   * snapshots and on rooms that never opted into hosting — treated as an
   * "open table" with no seat enforcement (the original free-seat test mode).
   */
  room?: RoomMembershipState | null;
};

/** Reserved player id that controls neutral armies during map combats. */
export const NEUTRAL_PLAYER_ID: PlayerId = "neutrals";

export type PlayerVisiblePlayerState = Omit<PlayerState, "hand" | "deck" | "spellBook"> & {
  hand: CardId[];
  handCount: number;
  /** Deck order is hidden from every seat, including the owner. */
  deck: CardId[];
  deckCount: number;
  /**
   * Spell Book (house rule): the owner sees the Spell ids; opponents see an empty
   * array and only the count (the Book sits face down next to the hero).
   */
  spellBook: CardId[];
  spellBookCount: number;
};

export type PlayerVisibleDeckState = Omit<DeckState, "drawPile"> & {
  drawCount: number;
};

export type PlayerVisibleState = Omit<GameState, "players" | "decks" | "reactionWindow" | "pendingChoice"> & {
  viewerPlayerId: PlayerId;
  players: Record<PlayerId, PlayerVisiblePlayerState>;
  decks: Record<DeckId, PlayerVisibleDeckState>;
  reactionWindow: ReactionWindow | null;
  pendingChoice: PendingChoice;
};

export type EngineResult = {
  state: GameState;
  events: GameEvent[];
  errors: RulesError[];
};
