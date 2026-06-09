export { sampleCards } from "@/data/cards/sample";
export { sampleBuildings } from "@/data/towns/buildings";
export { unitAbilities } from "@/data/units/abilities";
export {
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
export {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getAttackRerollEffects,
  makeActiveEffect
} from "./active-effects";
export {
  describeCardEffect,
  getCardEffectAmount,
  getSpellDamageAmount,
  implementedCardEffectTypes,
  isImplementedCardEffect
} from "./effects";
export { getPlayerView } from "./player-view";
export { createSeededRandom } from "./random";
export { createInitialGameState } from "./setup";
export {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  canPlayerBuildStructure,
  getActiveUnitId,
  getAttackKind,
  getAttackRollMode,
  getLegalActions,
  getLegalMoveDestinations,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  getUnitMoveRange,
  isAdjacent,
  isUnitAlive,
  sortUnitsForActivation
} from "./legal-actions";
export {
  getPostAttackAbilityDamageEffects,
  getUnitAbilityDefinitions,
  hasUnitAbilityEffect
} from "./unit-abilities";
export type { BattlefieldCoordinates, BattlefieldTerrain } from "./battlefield";
export type {
  ActiveEffectDefinition,
  ActiveEffectModifier,
  ActiveEffectState,
  AttackRollMode,
  BuildingDefinition,
  BuildingEffectDefinition,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
  CardId,
  CardPlayMode,
  CardLibrary,
  CombatStat,
  CombatState,
  CombatUnitState,
  DamageKind,
  DeckState,
  EffectDefinition,
  EngineResult,
  EffectDurationDefinition,
  GameAction,
  GameEvent,
  GamePhase,
  GameState,
  HeroId,
  HeroState,
  LegalAction,
  MapSpaceId,
  MapState,
  PlayerId,
  PlayerState,
  PlayerVisibleDeckState,
  PlayerVisiblePlayerState,
  PlayerVisibleState,
  PendingChoice,
  ReactionWindow,
  ResolutionStackItem,
  ResourceCost,
  ResourceKind,
  RulesError,
  SourceRef,
  TargetRef,
  TownId,
  TownState,
  TriggerDefinition,
  TurnState,
  UnitType,
  UnitId
} from "./state";
