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
  | "tower";

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
  | { type: "enemy-unit"; unitTypes?: UnitType[]; damagedOnly?: boolean }
  | { type: "friendly-unit"; unitTypes?: UnitType[]; damagedOnly?: boolean }
  | { type: "any-unit"; unitTypes?: UnitType[]; damagedOnly?: boolean }
  /** Summon spells: a chosen empty space on the combat board. */
  | { type: "empty-space" }
  | { type: "none" };

export type EffectDurationDefinition =
  | { type: "instant" }
  | { type: "current-combat-round" }
  | { type: "next-combat-round" }
  | { type: "combat-rounds"; rounds: number }
  | { type: "current-turn" }
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
      type: "RANGED_ATTACK_BONUS";
      amount: number;
      nonAdjacentOnly: boolean;
    }
  | {
      type: "RANGED_INITIATIVE_BONUS";
      amount: number;
    }
  | {
      type: "ATTACK_DIE_REROLL";
      maxUsesPerRoll: number;
      consumeEffectOnUse: boolean;
    }
  | {
      type: "HEAL_ONCE_PER_COMBAT_ROUND";
      amount: number;
      /**
       * First Aid Tent expert: instead of the single basic heal, spend 1
       * expert use to heal this many times in the round. Activating the expert
       * and using the basic heal are mutually exclusive within a round.
       */
      expertUsesPerRound?: number;
    }
  | {
      type: "UNIT_CANNOT_MOVE";
    }
  | {
      /**
       * Luck-style rerolls of the adventure dice. "any" also lets the
       * attack-die reroll flow consume this effect (Expert Luck).
       */
      type: "ADVENTURE_DIE_REROLL";
      dice: "treasure" | "resource" | "any";
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
      /** Legion artifacts: the next recruit/reinforce costs less gold. */
      type: "RECRUIT_DISCOUNT";
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
      /** Angel Wings: walk through fields without resolving them this turn. */
      type: "HERO_MOVE_THROUGH";
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
    }
  | { type: "CANCEL_SPELL"; maxPower?: number; expertIgnoresMaxPower?: boolean }
  | { type: "DRAW_CARDS"; amount: number; expertAmount?: number }
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
      /** Sword of Hellfire / Shield of the Damned: the unit also takes damage. */
      selfDamage?: number;
      /** Bloodlust/Golden Bow: only these unit types may receive the bonus. */
      unitTypes?: UnitType[];
      /** Precision: the shot also ignores the ranged combat penalty. */
      ignoreRangedPenalty?: boolean;
      /** Hero specialties: the bonus doubles when the named unit is involved. */
      doubleForUnitName?: string;
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
  | { type: "GAIN_MORALE"; amount: number; expertDrawCards?: number }
  | {
      /** Estates, gold/resource artifacts: gain resources immediately. */
      type: "GAIN_RESOURCES";
      gain: ResourceCost;
      expertGain?: ResourceCost;
    }
  | {
      /** Logistics expert, Boots of Speed: the main hero gains movement. */
      type: "GAIN_HERO_MOVEMENT";
      amount: number;
      expertAmount?: number;
      /** Angel Wings: also walk through fields without resolving this turn. */
      moveThroughThisTurn?: boolean;
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
      filter?: "spell" | "non-artifact";
      /** Only the top N discard cards qualify (Mystic Orb of Mana). */
      fromTop?: number;
      /** Rib Cage: shuffle the rest of the discard pile into the deck. */
      shuffleRestIntoDeck?: boolean;
    }
  | {
      /** Card-driven Search (Breastplate of Brimstone, Crown of Dragontooth). */
      type: "CARD_DECK_SEARCH";
      deck: "spells" | "artifacts" | "abilities";
      count: number;
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
       */
      type: "EAGLE_EYE_DIG";
    }
  | {
      /** Town Portal: move the hero to a controlled town or settlement. */
      type: "TELEPORT_HERO_TO_TOWN";
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
       * Xyron's Inferno: pick a space (any unit's space); that unit and every
       * unit orthogonally adjacent to it — friend or foe — take `amount`
       * damage. The discard cost is carried on the card option.
       */
      type: "AREA_DAMAGE_ALL_ADJACENT";
      amount: number;
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
       * Magic Mirror: an instant reaction to an enemy Spell cast that targets
       * one of your units. Choose a new target for that Spell — any unit of the
       * paid grade (Power 0 → bronze, 1 → silver, 2 → gold), set as one option
       * per grade. The Spell then resolves against the chosen unit instead. The
       * new target is picked in a follow-up choice after the card is played.
       */
      type: "REDIRECT_SPELL";
      grade: UnitGrade;
    }
  | {
      type: "CREATE_ACTIVE_EFFECT";
      effect: ActiveEffectDefinition;
      expertEffect?: ActiveEffectDefinition;
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
    }
  | {
      type: "CREATE_ATTACK_DIE_REROLL";
      name: string;
      basicRerolls: number;
      expertRerolls?: number;
      rerollsByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
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
       * Earthquake: siege only. Power 0 removes 1 Wall/Gate of the caster's
       * choice, Power 1 removes 2, Power 2 deals 1 damage to every unit
       * adjacent to a fortification and removes them all.
       */
      type: "EARTHQUAKE";
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
   * The discarded/removed cards must match this filter. "power-source" cards
   * are anything that can contribute Power: a Power statistic or any Spell
   * (Alamar's Resurrection spends these to stand in for its printed Power).
   */
  costCardFilter?: "spell" | "power-source";
  /** Cost cards are removed from the game rather than discarded. */
  removeCostCards?: boolean;
};

export type TriggerDefinition = {
  event: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED";
  controller: "self" | "opponent" | "any";
};

/** War machine triggers offered/resolved at the start of every combat round. */
export type WarMachineRoundStartDefinition =
  | {
      /** Ballista: automatic damage to the enemy unit with the lowest initiative. */
      kind: "damage-lowest-initiative";
      amount: number;
      /**
       * Ballista expert: at the round start, the owner may spend 1 expert use
       * to fire this many shots instead of the single basic shot. Declining
       * fires once and the Ballista does nothing more that round.
       */
      expertShots?: number;
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
  /** This option is the card's expert side: playing it spends a crown. */
  expertOnly?: boolean;
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

export type DeckSearchPick =
  | { kind: "revealed"; index: number }
  | { kind: "discard-top" }
  | {
      /**
       * Basic X Magic: instead of the search, return the revealed cards and
       * fetch the deck's first spell of this school, then reshuffle.
       */
      kind: "school-fetch";
      school: SpellSchool;
    };

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
  | { type: "MOVE_UNIT"; playerId: PlayerId; unitId: UnitId; destination: number }
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
      /** Discard this Spell card for its alternative "+1 Power" effect. */
      asPowerBoost?: boolean;
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
  | { type: "REVISIT_FIELD"; playerId: PlayerId; heroId: HeroId }
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
       * Schools of Magic: while casting a matching spell, discard the in-play
       * permanent for its expert power bonus (replaces the basic +1; costs
       * one expert use).
       */
      type: "USE_PERMANENT_EXPERT";
      playerId: PlayerId;
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
  | { type: "CONTINUE_NEUTRAL_COMBAT"; playerId: PlayerId }
  | { type: "CONTINUE_NEUTRAL_STEP"; playerId: PlayerId }
  | { type: "RETREAT_FROM_COMBAT"; playerId: PlayerId }
  | {
      /**
       * Close the end-of-combat notice: finalizes an adventure combat
       * (experience, unit flips, the field visit) and returns to the map.
       */
      type: "ACKNOWLEDGE_COMBAT_END";
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
  | { type: "END_TURN"; playerId: PlayerId };

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
      reason: "all-enemy-units-defeated" | "retreat" | "surrender";
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
      reason: "combat-round-ended" | "turn-ended" | "combat-ended";
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
    /** Bless: the Attack die is not rolled (counts as 0). */
    ignoreAttackDie?: boolean;
    /** Precision: this shot ignores the ranged back-row penalty. */
    ignoreRangedPenalty?: boolean;
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
     * A defending defender's Defense roll for this attack, rolled once and
     * reused across the lethal-save window so the same outcome decides the hit.
     * Only a "+1" grants +1 Defense.
     */
    defendRoll?: number;
    playedCardIds: CardId[];
  };
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
  /** Cards removed from the game entirely (the "remove" keyword). */
  removed: CardId[];
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
  /** Round number the Mage Guild was built (token unusable that round). */
  mageGuildBuiltRound?: number;
  /** +1 positive morale token (max 1) or a single negative token (-1). */
  morale: number;
  /**
   * Over the hand limit at the start of the turn: the player must discard
   * down (REFRESH_HAND) before doing anything else.
   */
  needsHandRefresh?: boolean;
  /**
   * Start-of-turn mulligan still available: discard any number of cards and
   * draw that many. Cleared by the first movement/town action of the turn.
   */
  canMulligan?: boolean;
  /** Second negative morale token: the hand is discarded when the turn ends. */
  discardHandAtTurnEnd?: boolean;
  /** Nomads (army map ability): the end-of-turn adjacent step was offered this turn. */
  nomadStepDoneThisTurn?: boolean;
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
  };
  /** Round the Blacksmith action was last used ("once per your turn"). */
  blacksmithUsedRound?: number;
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
  retaliatedThisRound: boolean;
  defenseToken: boolean;
  /**
   * Set once the pre-activation reaction pause has been resolved for this
   * unit's current activation, so the pump does not re-open it after the
   * reacting player casts/plays during the pause. Reset every time the unit
   * becomes active (setActiveUnit).
   */
  reactionPauseAcked?: boolean;
  /** Combat tokens currently on the card (attack/weakness/corrosion/paralysis). */
  tokens?: CombatTokenState[];
  abilities: string[];
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
   * Conjured onto the battlefield by a spell (Summon Elemental). Summoned
   * units carry no printed grade, so the neutral AI's same-tier targeting rule
   * never applies to them — guards attack every real, graded enemy first and
   * only turn on a summoned unit when nothing else is left.
   */
  summoned?: boolean;
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
   *    Fireball…), trigger-free instant spells, or play an instant ability /
   *    use an active effect. Set in neutral fights (the human reacts before
   *    each guard acts) and in player-vs-player fights whenever the reacting
   *    side holds Intelligence (the anytime-cast freedom). `reactingPlayerId`
   *    holds priority; `intent` previews what the guard is about to do.
   *  - "guard-walk": after a neutral guard walks (a pure move — attacks pause
   *    on the defender's reaction window and the attack die instead) the engine
   *    stops so the table can see the move. Neutral fights only.
   *
   * The sandbox never pauses like this (its pump does not run).
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
    /** One entry per round-start war machine: its owner and the machine card. */
    pending: { playerId: PlayerId; cardId: CardId }[];
    firstTargetUnitId?: UnitId | null;
  } | null;
  outcome: {
    winnerPlayerId: PlayerId;
    defeatedPlayerId: PlayerId;
    reason: "all-enemy-units-defeated" | "retreat" | "surrender";
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
   * Controllers who have had at least one unit removed from the board this
   * combat (Pit Lords' "Summon Demons" triggers off a friendly removal).
   */
  unitRemovedControllerIds?: PlayerId[];
  dice: CombatDice;
  units: Record<UnitId, CombatUnitState>;
  /**
   * Battlefield spaces blocked by obstacle tokens. Ground and ranged units
   * can neither enter nor move through them; flying units may fly over but
   * not land on them. Unit cards themselves also count as combat obstacles.
   */
  obstacles?: number[];
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
  resource?: ResourceKind;
  amount?: number;
  faction?: string;
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
   * Grail Hunt: this Grail field's guards have been defeated and the Grail is
   * waiting to be dug (1 movement point) before it can be carried home.
   */
  grailDiggable?: boolean;
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
      filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic";
      fromTop?: number;
      shuffleRestIntoDeck?: boolean;
    }
  | {
      /** Generic queued interaction resolved through the visit-step machinery. */
      playerId: PlayerId;
      kind: "visit-steps";
      steps: VisitStep[];
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
      /** Spends the positive morale token (reroll-any-die morale action). */
      type: "CONSUME_MORALE";
    }
  | {
      /** Marks the Swift Weasel once-per-turn adventure-die reroll as used. */
      type: "CONSUME_WEASEL";
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
  | { type: "SEARCH_SHARED_DECK"; deckId: DeckId; count: number }
  | { type: "SETTLEMENT_CHOICE" }
  | { type: "MAGIC_SPRING" }
  | { type: "WITCH_HUT" }
  | { type: "SCHOLAR" }
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
    }
  | {
      /** University: pick one of the top cards of a shared discard pile. */
      type: "SEARCH_DISCARD";
      deckId: DeckId;
      count: number;
    }
  | {
      /** Hill Fort: reinforce one Few unit, its cost reduced by 3 gold (min 0). */
      type: "HILL_FORT";
    }
  | {
      /** Subterranean Gate: move the hero to the linked gate on an adjacent tile. */
      type: "SUBTERRANEAN_GATE";
    }
  | {
      /** Logistics / Town Portal: place the hero on the field directly. */
      type: "TELEPORT_HERO";
      heroId: HeroId;
      spaceId: MapSpaceId;
      /** Whether arriving resolves the field like a normal visit. */
      visit?: boolean;
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
      filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic";
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
  /** Field visit currently being resolved (choices pending). */
  pendingVisit: PendingVisit | null;
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
};

export type AttackRollCandidate = {
  rolls: number[];
  roll: number;
};

export type AttackRerollSource = {
  /** Display name shown to the player (unit ability, Fortune, Luck, …). */
  name: string;
  /** Backing active effect; unit-ability rerolls have none. */
  effectId?: string;
  /** Positive morale token: spending the reroll discards the token. */
  morale?: boolean;
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
      canTakeDiscardTop: boolean;
      /**
       * Basic X Magic in play: the search may instead fetch the deck's first
       * spell of one of these schools (cards are put back and reshuffled).
       */
      schoolFetch?: SpellSchool[];
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
        | "discard-pick"
        | "eagle-eye"
        | "own-deck-pick"
        | "garrison"
        | "siege-gate"
        | "siege-demolish"
        | "rogues-scout"
        | "combat-reposition"
        | "cover-of-darkness";
      /** combat-reposition: Harpies' optional fly-back after their attack. */
      reposition?: { unitId: UnitId; originPosition: number };
      /** deck-pick: the shared-deck search waiting on the deck choice. */
      deckPick?: { deckIds: DeckId[]; count: number };
      /** own-deck-pick: revealed cards of the player's own deck (Mana Vortex). */
      ownDeckPick?: { cardIds: CardId[] };
      /** rogues-scout: the deck being peeked and its revealed top card. */
      rogueScout?: { deckId: DeckId; cardId: CardId };
      /** siege-demolish: intact fortification positions and removals left. */
      siegeDemolish?: { positions: number[]; remaining: number };
      /** discard-pick: the candidate cards (index-aligned with options). */
      discardPick?: {
        cardIds: CardId[];
        remaining: number;
        filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic";
        fromTop?: number;
        shuffleRestIntoDeck?: boolean;
      };
      /** eagle-eye: the dug spell waiting on take/discard. */
      eagleEye?: { deckId: DeckId; cardId: CardId };
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
        | "spell-redirect"
        | "enchanter-activation"
        | "faerie-damage";
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
    }
  | {
      /**
       * Neutral Magi "Power Drain": after the Magi attack, the defending
       * player chooses to discard one of their own Power-contributing cards
       * (a Power statistic or any Spell) or to let a random card be discarded.
       * Created only when the defender holds at least one Power card; combat
       * stays parked on its retaliation until this resolves.
       */
      id: string;
      type: "COMBAT_HAND_DISCARD";
      playerId: PlayerId;
      kind: "magi-power-or-random";
      abilityId: string;
      abilityName: string;
      sourceUnitId: UnitId;
      prompt: string;
      /** Cards in the chooser's hand that can contribute Power. */
      powerCardIds: CardId[];
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
};

/** Reserved player id that controls neutral armies during map combats. */
export const NEUTRAL_PLAYER_ID: PlayerId = "neutrals";

export type PlayerVisiblePlayerState = Omit<PlayerState, "hand" | "deck"> & {
  hand: CardId[];
  handCount: number;
  /** Deck order is hidden from every seat, including the owner. */
  deck: CardId[];
  deckCount: number;
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
