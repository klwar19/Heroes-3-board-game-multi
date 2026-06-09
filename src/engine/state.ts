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
  | "combat"
  | "reaction"
  | "choice"
  | "cleanup"
  | "game-over";

export type TargetRef = { type: "unit"; unitId: UnitId } | { type: "none" };

export type SourceRef =
  | { type: "card"; cardId: CardId; controllerId: PlayerId }
  | { type: "unit"; unitId: UnitId; controllerId: PlayerId }
  | { type: "system" };

export type DamageKind = "attack" | "spell" | "effect";
export type UnitType = "ground" | "ranged" | "flying";
export type CombatStat = "attack" | "defense" | "power";
export type CardPlayMode = "basic" | "expert";
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
  | { type: "CANCEL_SPELL"; maxPower?: number }
  | { type: "ADD_COMBAT_STAT"; stat: "attack" | "defense"; amount: number; expertAmount?: number }
  | { type: "ADD_SPELL_POWER"; amount: number; expertAmount?: number }
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
      type: "CREATE_ATTACK_DIE_REROLL";
      name: string;
      basicRerolls: number;
      expertRerolls?: number;
      rerollsByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      consumeEffectOnUse: boolean;
    };

export type TriggerDefinition = {
  event: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED";
  controller: "self" | "opponent" | "any";
};

export type CardDefinition = {
  id: CardId;
  name: string;
  kind: "spell" | "ability" | "artifact" | "hero-specialty" | "ai" | "unit" | "statistic" | "war-machine";
  timing: "action" | "instant" | "reaction" | "passive" | "map" | "combat" | "town";
  phaseLimit?: GamePhase[];
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

export type GameAction =
  | { type: "CAST_SPELL"; playerId: PlayerId; cardId: CardId; target: TargetRef }
  | { type: "PLAY_CARD"; playerId: PlayerId; cardId: CardId; target?: TargetRef; mode?: CardPlayMode }
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
  | { type: "END_COMBAT_ROUND"; playerId: PlayerId }
  | { type: "BUILD_STRUCTURE"; playerId: PlayerId; townId: TownId; buildingId: BuildingId }
  | { type: "COMPLETE_SIMULTANEOUS_TURN"; playerId: PlayerId }
  | { type: "REROLL_PENDING_CHOICE"; playerId: PlayerId; choiceId: string }
  | { type: "CHOOSE_PENDING_ROLL"; playerId: PlayerId; choiceId: string; candidateIndex: number }
  | { type: "PLAY_REACTION"; playerId: PlayerId; cardId: CardId; mode?: CardPlayMode }
  | { type: "PASS_REACTION"; playerId: PlayerId }
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
      type: "UNIT_REMOVED";
      unitId: UnitId;
      playerId: PlayerId;
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
      reason: "all-enemy-units-defeated";
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

export type PlayerState = {
  id: PlayerId;
  name: string;
  hand: CardId[];
  discard: CardId[];
  resources: {
    [key in ResourceKind]: number;
  };
  limits: {
    hand: number;
    expertUses: number;
  };
  combatStats: {
    spellsCastThisRound: number;
    spellLimitBonusThisRound: number;
    expertUsesSpentThisRound: number;
  };
};

export type CombatUnitState = {
  id: UnitId;
  controllerId: PlayerId;
  name: string;
  cardName: string;
  variant: "few" | "pack" | "neutral";
  type: UnitType;
  attack: number;
  defense: number;
  maxHealth: number;
  damage: number;
  initiative: number;
  position: number;
  activatedThisRound: boolean;
  movedThisActivation: boolean;
  retaliatedThisRound: boolean;
  defenseToken: boolean;
  abilities: string[];
  assets?: {
    cardImage?: string;
    imageAlt?: string;
    wikiUrl?: string;
  };
};

export type CombatState = {
  id: string;
  round: number;
  attackerPlayerId: PlayerId;
  defenderPlayerId: PlayerId;
  activeUnitId: UnitId | null;
  outcome: {
    winnerPlayerId: PlayerId;
    defeatedPlayerId: PlayerId;
    reason: "all-enemy-units-defeated";
  } | null;
  attackDie: number[];
  attackDieIndex: number;
  units: Record<UnitId, CombatUnitState>;
};

export type DeckState = {
  id: DeckId;
  drawPile: CardId[];
  discardPile: CardId[];
};

export type MapState = {
  spaces: Record<MapSpaceId, { id: MapSpaceId; adjacent: MapSpaceId[] }>;
};

export type TownState = {
  id: TownId;
  controllerId: PlayerId;
  buildings: string[];
};

export type HeroState = {
  id: HeroId;
  controllerId: PlayerId;
  level: number;
  movementPoints: number;
  spaceId: MapSpaceId | null;
};

export type AttackRollCandidate = {
  rolls: number[];
  roll: number;
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
      sourceEffectIds: string[];
    }
  | null;

export type GameState = {
  id: string;
  seed: string;
  round: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  turnOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  map: MapState;
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

export type PlayerVisiblePlayerState = Omit<PlayerState, "hand"> & {
  hand: CardId[];
  handCount: number;
};

export type PlayerVisibleDeckState = Omit<DeckState, "drawPile"> & {
  drawCount: number;
};

export type PlayerVisibleState = Omit<GameState, "players" | "decks" | "reactionWindow"> & {
  viewerPlayerId: PlayerId;
  players: Record<PlayerId, PlayerVisiblePlayerState>;
  decks: Record<DeckId, PlayerVisibleDeckState>;
  reactionWindow: ReactionWindow | null;
};

export type EngineResult = {
  state: GameState;
  events: GameEvent[];
  errors: RulesError[];
};
