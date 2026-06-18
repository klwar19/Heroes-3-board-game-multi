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
export { applyAction, findEvent, unitMatchesSpecialtyName } from "./reducer";
export { ENGINE_PROTOCOL_VERSION, ENGINE_SIGNATURE } from "./version";
export { drawCardsForPlayer, isSharedDeckId, SHARED_DECK_IDS, shuffleCards } from "./decks";
export type { SharedDeckId } from "./decks";
export {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForGameRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getAttackRerollEffects,
  makeActiveEffect,
  playerSpellCastsIgnoreLimit,
  unitDealsElementalDamage,
  unitIsBerserk
} from "./active-effects";
export {
  cardCanBoostPower,
  describeCardEffect,
  getCardEffectAmount,
  getCardOptions,
  getEffectAmount,
  getEffectDamageAmount,
  getEffectiveCardEffect,
  getSpellDamageAmount,
  implementedCardEffectTypes,
  isImplementedCardEffect,
  spellPowerValueOfCard
} from "./effects";
export { getPlayerView } from "./player-view";
export { createSeededRandom } from "./random";
export {
  PVP_TROOP_LOSS_DESCRIPTIONS,
  PVP_TROOP_LOSS_LABELS,
  RULESET_DESCRIPTIONS,
  RULESET_LABELS,
  VICTORY_MODE_DESCRIPTIONS,
  VICTORY_MODE_LABELS,
  applyUnitSideRules,
  artifactDeckAccess,
  canDrawExpertSpells,
  deckDisplayName,
  eligibleArtifactDecks,
  eligibleSpellDecks,
  estatesGold,
  expertUsesAvailable,
  getRuleset,
  rulesetCardNote,
  specialtyTransformHealth,
  spellLimitFor,
  wisdomGoldDiscount,
  wisdomSearchCount
} from "./ruleset";
export {
  applyUnitCurrentSide,
  canPlaceTransformOn,
  insertUnitTransform,
  makeUnitTransformState,
  topTransform
} from "./unit-transforms";
export { markUnitRemovedIfNeeded } from "./combat-units";
export { makeCombatUnitFromArmy } from "./adventure";
export { createInitialGameState } from "./setup";
export {
  createAdventureGameState,
  createAdventureLobbyState,
  defaultGameSetupOptions,
  draftFarTiles,
  getScenario,
  scenarioStartingUnitLevels,
  TIER_LEVELS,
  tierOfLevel,
  UNIT_LEVELS,
  validateCustomMapPlan
} from "./adventure-setup";
export type { AdventurePlayerConfig, AdventureSetupOptions } from "./adventure-setup";
export { getTileBorderSegments, hasInternalBorder } from "@/data/map/borders";
export type { TileBorderSegment } from "@/data/map/borders";
export { astrologersCardDefinitions, astrologersDeckCardIds } from "@/data/cards/astrologers";
export type { AstrologersCardDefinition, AstrologersEffect } from "@/data/cards/astrologers";
export { DEFAULT_SCENARIO_ID, scenarioDefinitions } from "@/data/map/scenarios";
export type { ScenarioDefinition } from "@/data/map/scenarios";
export {
  ABILITY_SEARCH_LEVELS,
  ASTROLOGERS_DECK_ID,
  controlsTownOrSettlement,
  ELIMINATION_GRACE_TURNS,
  eliminatePlayer,
  EXPERT_USES_BY_LEVEL,
  HAND_LIMIT_BY_LEVEL,
  MAX_EXPERIENCE,
  NEUTRAL_ARMY_TABLE,
  NEUTRAL_DECK_IDS,
  refreshEliminationClock,
  RESOURCE_DIE_FACES,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  RETREAT_GOLD_COST,
  SPECIALTY_LEVELS,
  SURRENDER_GOLD_COST,
  TILE_BACK_LABELS,
  TRADE_RATES,
  TREASURE_DIE_FACES,
  canCrossEdge,
  canHeroReachPlacedTile,
  classifyHeroStep,
  effectiveHandLimit,
  fieldLayer,
  gainExperience,
  gateFieldsLinked,
  getActiveAstrologersCard,
  getAdjacentSpaceIds,
  getHeroMovementCapabilities,
  getMainHero,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  getUnitDefinition,
  getUnitSide,
  heroMovementMax,
  isFieldGuarded,
  isSeaField,
  levelOfExperience,
  recomputeSubterraneanGates,
  recruitDiscountAmount,
  seaStepHalts,
  seaTileBand,
  tileLayer
} from "./adventure";
export type { HeroMovementCapabilities, HeroPathTarget, HeroStepKind, MapLayer } from "./adventure";
export {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  COMBAT_UNIT_LIMIT,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
  getHeroMoveDestinations,
  isTileAdjacentToSpace,
  isTileRotationConnected,
  pumpAdventureQueues
} from "./adventure-reducer";
export {
  HEX_DIRECTIONS,
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  parseHexSpaceId,
  pixelToHex,
  slotDirection,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  tileLatticeColor,
  tileLatticeNeighbors
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
  getActivationStep,
  getLegalMoveDestinations,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  getPendingReactionPower,
  getUnitMoveRange,
  isAdjacent,
  isEffectLegalForTrigger,
  isUnitAlive,
  sortUnitsForActivation,
  standingSpellPower
} from "./legal-actions";
export type { ActivationStep, PendingReactionPower } from "./legal-actions";
export {
  getPostAttackAbilityDamageEffects,
  getUnitAbilityDefinitions,
  hasUnitAbilityEffect
} from "./unit-abilities";
export {
  getPermanentCardIds,
  getPermanentDefinitions,
  getPermanentSchoolBonus,
  permanentHandLimitBonus,
  permanentLimitFor,
  warMachinesForSale
} from "./permanents";
export { describePermanentEffect } from "./effects";
export { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
export type { BattlefieldCoordinates, BattlefieldTerrain } from "./battlefield";
export { NEUTRAL_PLAYER_ID } from "./state";
export type {
  ActiveEffectDefinition,
  ActiveEffectModifier,
  ActiveEffectState,
  AbilityClass,
  AdventureReward,
  AdventureState,
  AstrologersState,
  ArmyUnitState,
  ArtifactTier,
  AttackRollMode,
  BattlefieldTokenKind,
  BattlefieldTokenState,
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
  CustomMapTilePlan,
  CustomStartingUnit,
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
  GameSetupState,
  GameState,
  HeroId,
  HeroState,
  LegalAction,
  MapFieldState,
  MapSpaceId,
  MapState,
  MapTileState,
  GameSetupOptions,
  PendingTileChoice,
  PendingVisit,
  PlayerId,
  PlayerState,
  PlayerVisibleDeckState,
  PlayerVisiblePlayerState,
  PlayerVisibleState,
  PendingChoice,
  PermanentEffectDefinition,
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
  UnitLevel,
  UnitType,
  UnitId,
  UnitTransformState,
  VisitStep,
  CombatTokenKind,
  CombatTokenState,
  FirstPlayerRollState,
  SiegeState
} from "./state";

export { getUnitTokens, tokenAttackBonus, tokenDefenseDelta } from "./tokens";
export {
  ARROW_TOWER_POSITION,
  ARROW_TOWER_STATS,
  getDemolishAbility,
  intactFortificationPositions,
  isArrowTowerUnit,
  SIEGE_ROW_POSITIONS
} from "./siege";
