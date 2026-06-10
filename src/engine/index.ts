export { sampleCards } from "@/data/cards/sample";
export { sampleBuildings } from "@/data/towns/buildings";
export { unitAbilities } from "@/data/units/abilities";
export {
  ATTACK_DIE_FACES,
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_CROSSING_ROW,
  BATTLEFIELD_ROWS,
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getBattlefieldTerrain,
  isBattlefieldPosition
} from "./battlefield";
export { applyAction, findEvent } from "./reducer";
export { drawCardsForPlayer, isSharedDeckId, SHARED_DECK_IDS, shuffleCards } from "./decks";
export type { SharedDeckId } from "./decks";
export {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getAttackRerollEffects,
  makeActiveEffect
} from "./active-effects";
export {
  describeCardEffect,
  getCardEffectAmount,
  getCardOptions,
  getEffectAmount,
  getEffectiveCardEffect,
  getSpellDamageAmount,
  implementedCardEffectTypes,
  isImplementedCardEffect
} from "./effects";
export { getPlayerView } from "./player-view";
export { createSeededRandom } from "./random";
export { createInitialGameState } from "./setup";
export { createAdventureGameState } from "./adventure-setup";
export type { AdventurePlayerConfig, AdventureSetupOptions } from "./adventure-setup";
export {
  ABILITY_SEARCH_LEVELS,
  EXPERT_USES_BY_LEVEL,
  HAND_LIMIT_BY_LEVEL,
  NEUTRAL_ARMY_TABLE,
  NEUTRAL_DECK_IDS,
  RESOURCE_DIE_FACES,
  SPECIALTY_LEVELS,
  TRADE_RATES,
  TREASURE_DIE_FACES,
  canCrossEdge,
  gainExperience,
  getAdjacentSpaceIds,
  getMainHero,
  getTileFootprintSpaceIds,
  getUnitDefinition,
  getUnitSide,
  isFieldGuarded,
  levelOfExperience
} from "./adventure";
export {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  COMBAT_UNIT_LIMIT,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
  getHeroMoveDestinations,
  isTileAdjacentToSpace
} from "./adventure-reducer";
export {
  HEX_DIRECTIONS,
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  parseHexSpaceId,
  slotDirection,
  tileFootprint,
  tileFootprintsTouch
} from "./hex";
export type { HexCoord, HexDirection } from "./hex";
export { isNeutralUnit, pickNeutralTarget, planNeutralActivation } from "./neutral-ai";
export {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  canPlayerBuildStructure,
  effectHasExpertMode,
  getActiveUnitId,
  getAttackKind,
  getAttackRollMode,
  getCardPlayVariants,
  getLegalActions,
  getLegalMoveDestinations,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  getUnitMoveRange,
  isAdjacent,
  isEffectLegalForTrigger,
  isUnitAlive,
  sortUnitsForActivation
} from "./legal-actions";
export {
  getPostAttackAbilityDamageEffects,
  getUnitAbilityDefinitions,
  hasUnitAbilityEffect
} from "./unit-abilities";
export type { BattlefieldCoordinates, BattlefieldTerrain } from "./battlefield";
export { NEUTRAL_PLAYER_ID } from "./state";
export type {
  ActiveEffectDefinition,
  ActiveEffectModifier,
  ActiveEffectState,
  AbilityClass,
  AdventureReward,
  AdventureState,
  ArmyUnitState,
  ArtifactTier,
  AttackRollMode,
  BuildingDefinition,
  BuildingEffectDefinition,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
  CardId,
  CardOptionDefinition,
  CardPlayMode,
  CardLibrary,
  CombatContext,
  CombatDice,
  CombatSetupState,
  DeckSearchPick,
  CombatStat,
  CombatState,
  CombatUnitState,
  DamageKind,
  DeckState,
  EffectDefinition,
  EngineResult,
  EffectDurationDefinition,
  FactionId,
  GameAction,
  GameDifficulty,
  GameEvent,
  GameMode,
  GamePhase,
  GameState,
  HeroId,
  HeroState,
  LegalAction,
  MapFieldState,
  MapSpaceId,
  MapState,
  MapTileState,
  PendingVisit,
  PlayerId,
  PlayerState,
  PlayerVisibleDeckState,
  PlayerVisiblePlayerState,
  PlayerVisibleState,
  PendingChoice,
  ReactionPlay,
  ReactionWindow,
  ResolutionStackItem,
  ResourceCost,
  ResourceKind,
  RulesError,
  SourceRef,
  SpellLevel,
  SpellSchool,
  StatisticType,
  TargetRef,
  TownId,
  TownState,
  TriggerDefinition,
  TurnState,
  UnitGrade,
  UnitType,
  UnitId,
  VisitStep
} from "./state";
