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
export type FactionId = "castle" | "rampart" | "inferno" | "necropolis" | "dungeon";

export type TargetRef = { type: "unit"; unitId: UnitId } | { type: "none" };

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
      /** Hero specialties: the bonus doubles when the named unit is involved. */
      doubleForUnitName?: string;
    }
  | {
      /** Centaur's Axe: the attack die's outcome counts three times. */
      type: "TRIPLE_ATTACK_DIE";
    }
  | {
      /**
       * Sandro's Cloak: the specialty card is placed on a matching unit and
       * replaces its printed statistics for the rest of the combat.
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
    }
  | { type: "ADD_SPELL_POWER"; amount: number; expertAmount?: number; drawCards?: number }
  | { type: "GAIN_MORALE"; amount: number; expertDrawCards?: number }
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
    };

export type TriggerDefinition = {
  event: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED";
  controller: "self" | "opponent" | "any";
};

export type CardOptionDefinition = {
  label: string;
  trigger?: TriggerDefinition;
  effect: Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;
};

export type CardDefinition = {
  id: CardId;
  name: string;
  kind: "spell" | "ability" | "artifact" | "hero-specialty" | "ai" | "unit" | "statistic" | "war-machine";
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
};

export type DeckSearchPick = { kind: "revealed"; index: number } | { kind: "discard-top" };

export type GameAction =
  | { type: "CAST_SPELL"; playerId: PlayerId; cardId: CardId; target: TargetRef }
  | {
      type: "PLAY_CARD";
      playerId: PlayerId;
      cardId: CardId;
      target?: TargetRef;
      mode?: CardPlayMode;
      optionIndex?: number;
    }
  | { type: "ATTACK_UNIT"; playerId: PlayerId; attackerId: UnitId; defenderId: UnitId }
  | {
      type: "MOVE_AND_ATTACK_UNIT";
      playerId: PlayerId;
      attackerId: UnitId;
      destination: number;
      defenderId: UnitId;
    }
  | { type: "MOVE_UNIT"; playerId: PlayerId; unitId: UnitId; destination: number }
  | { type: "USE_UNIT_ABILITY"; playerId: PlayerId; unitId: UnitId; abilityId: string; target: TargetRef }
  | { type: "USE_ACTIVE_EFFECT"; playerId: PlayerId; effectId: string; target: TargetRef }
  | { type: "DEFEND_UNIT"; playerId: PlayerId; unitId: UnitId }
  | { type: "END_ACTIVATION"; playerId: PlayerId; unitId: UnitId }
  | { type: "END_COMBAT_ROUND"; playerId: PlayerId }
  | { type: "BUILD_STRUCTURE"; playerId: PlayerId; townId: TownId; buildingId: BuildingId }
  | { type: "COMPLETE_SIMULTANEOUS_TURN"; playerId: PlayerId }
  | { type: "REROLL_PENDING_CHOICE"; playerId: PlayerId; choiceId: string }
  | { type: "CHOOSE_PENDING_ROLL"; playerId: PlayerId; choiceId: string; candidateIndex: number }
  | { type: "PLAY_REACTION"; playerId: PlayerId; cardId: CardId; mode?: CardPlayMode; optionIndex?: number }
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
  | { type: "PLACE_COMBAT_UNIT"; playerId: PlayerId; armyUnitId: string; position: number }
  | { type: "UNPLACE_COMBAT_UNIT"; playerId: PlayerId; armyUnitId: string }
  | { type: "FINISH_COMBAT_PLACEMENT"; playerId: PlayerId }
  | { type: "CONTINUE_NEUTRAL_COMBAT"; playerId: PlayerId }
  | { type: "RETREAT_FROM_COMBAT"; playerId: PlayerId }
  | {
      /** Population token: recruit and/or reinforce any number of units at once. */
      type: "POPULATION_ACTION";
      playerId: PlayerId;
      purchases: { kind: "recruit" | "reinforce"; unitDefId: string; armyUnitId?: string }[];
    }
  | { type: "SPELL_BOOK_ACTION"; playerId: PlayerId }
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
      /** Map-setup lobby: claim a faction and main hero for a seat. */
      type: "CHOOSE_FACTION";
      playerId: PlayerId;
      factionId: FactionId;
      heroDefId: string;
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
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      attackValue: number;
      defenseValue: number;
      damage: number;
      isRetaliation: boolean;
    }
  | {
      id: string;
      type: "PENDING_CHOICE_CREATED";
      choiceId: string;
      choiceType: "ATTACK_DIE_REROLL";
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
      dice: "treasure" | "resource";
      results: string[];
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
      type: "GAME_WON";
      playerId: PlayerId;
      reason: string;
    };

export type ResolutionStackItem = {
  id: string;
  source: SourceRef;
  action: GameAction;
  status: "pending" | "waiting-for-reaction" | "resolving" | "resolved" | "cancelled";
  triggerEventIds: string[];
  modifiers: {
    spellPowerBonus: number;
    attackBonus: number;
    defenseBonus: number;
    /** Centaur's Axe: multiplies the rolled attack-die outcome (default 1). */
    attackDieMultiplier?: number;
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
};

export type TurnState = {
  mode: "simultaneous" | "ordered";
  simultaneousRoundLimit: number;
  completedPlayerIds: PlayerId[];
  observingPlayerId: PlayerId | null;
};

export type ArmyUnitState = {
  /** Stable instance id of this unit card in the player's unit deck. */
  id: string;
  unitDefId: string;
  side: "few" | "pack";
};

export type TownTokenState = {
  build: boolean;
  population: boolean;
  spellBook: boolean;
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
  limits: {
    hand: number;
    expertUses: number;
  };
  combatStats: {
    spellsCastThisRound: number;
    spellLimitBonusThisRound: number;
    expertUsesSpentThisRound: number;
    /** Spells cast since the current adventure turn started (Astrologers hooks). */
    spellsCastThisTurn?: number;
  };
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
  retaliatedThisRound: boolean;
  defenseToken: boolean;
  abilities: string[];
  /** Adventure mode: unit definition this combat card represents. */
  unitDefId?: string;
  /** Adventure mode: army card instance this unit maps back to. */
  armyUnitId?: string;
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
      defenderHeroId: HeroId | null;
      fieldId: MapSpaceId;
    };

export type CombatSetupState = {
  /** Player ids still to place units, in placement order. */
  pendingPlayerIds: PlayerId[];
  /** Army unit instance ids already placed this setup, per player. */
  placedUnitIds: Record<PlayerId, string[]>;
  /** Maximum units a side may field. */
  unitLimit: number;
};

export type CombatState = {
  id: string;
  round: number;
  attackerPlayerId: PlayerId;
  defenderPlayerId: PlayerId;
  activeUnitId: UnitId | null;
  context: CombatContext;
  setup: CombatSetupState | null;
  /**
   * Set between combat rounds against neutrals: the attacking hero must spend
   * 1 MP to continue for another round or retreat.
   */
  awaitingContinue: boolean;
  outcome: {
    winnerPlayerId: PlayerId;
    defeatedPlayerId: PlayerId;
    reason: "all-enemy-units-defeated" | "retreat" | "surrender";
  } | null;
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
  /** Whether the first-flag immediate income was already claimed. */
  everFlagged: boolean;
  /** Resource chosen for a flagged settlement. */
  settlementResource: ResourceKind | null;
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
  | {
      /** Groovy Satyr: swap one drawn neutral for a fresh card of the same tier. */
      type: "SATYR_SWAP";
      drawIndex: number;
    }
  | { type: "SEARCH_SHARED_DECK"; deckId: DeckId; count: number }
  | { type: "SETTLEMENT_CHOICE" }
  | { type: "MAGIC_SPRING" }
  | { type: "WITCH_HUT" }
  | { type: "SCHOLAR" }
  | { type: "TRADING_POST" }
  | { type: "DISCOVER_ADJACENT_TILE" };

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
};

export type PendingNeutralEncounter = {
  heroId: HeroId;
  fieldId: MapSpaceId;
  difficulty: number;
  draws: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
};

export type AdventureState = {
  difficulty: GameDifficulty;
  /** Scenario this map was built from (data/map/scenarios). */
  scenarioId?: string;
  tiles: Record<string, MapTileState>;
  fields: Record<MapSpaceId, MapFieldState>;
  /** Face-down Far tiles each player may place for 1 MP. */
  playerFarTiles: Record<PlayerId, string[]>;
  /** Field visit currently being resolved (choices pending). */
  pendingVisit: PendingVisit | null;
  /** Rewards waiting to resolve one at a time (level-up searches, City Halls). */
  rewardQueue: AdventureReward[];
  /** Last field each hero visited, where a retreating hero returns. */
  lastVisitedField: Record<HeroId, MapSpaceId>;
  /** Victory: flagging an enemy town wins the scenario (default skirmish). */
  winnerPlayerId: PlayerId | null;
  /** Tile awaiting its rotation choice after a reveal or placement. */
  pendingTileChoice?: PendingTileChoice | null;
  /** Astrologers Proclaim deck state (even rounds). */
  astrologers?: AstrologersState;
  /** Neutral encounter paused on a pre-combat choice (Groovy Satyr). */
  pendingEncounter?: PendingNeutralEncounter | null;
};

/** Pre-game lobby: players pick factions and heroes before the map builds. */
export type GameSetupState = {
  scenarioId: string;
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
      returnPhase: GamePhase;
    }
  | {
      id: string;
      type: "OPTION_CHOICE";
      playerId: PlayerId;
      prompt: string;
      options: { label: string }[];
      context: "city-hall";
      returnPhase: GamePhase;
    }
  | null;

export type GameState = {
  id: string;
  seed: string;
  mode: GameMode;
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
  eventLog: GameEvent[];
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
