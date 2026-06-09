export { sampleCards } from "@/data/cards/sample";
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
export { getPlayerView } from "./player-view";
export { createSeededRandom } from "./random";
export { createInitialGameState } from "./setup";
export {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
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
export type { BattlefieldCoordinates, BattlefieldTerrain } from "./battlefield";
export type {
  AttackRollMode,
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
  ReactionWindow,
  ResolutionStackItem,
  RulesError,
  SourceRef,
  TargetRef,
  TownId,
  TownState,
  TriggerDefinition,
  UnitType,
  UnitId
} from "./state";
