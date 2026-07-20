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
export type { ReducerOptions } from "./reducer";
export {
  AFK_AUTO_KICK_MS,
  AFK_IDLE_MS,
  AFK_REASK_MS,
  getAfkState,
  idleMillis,
  seatIsAwaitedInOrderedPlay,
  timeControlsActive,
  TURN_TIME_LIMIT_MS,
  turnClockPausedFor,
  turnClockRunningSeats,
  turnElapsedMillis
} from "./afk";
export {
  afkDropPending,
  driveAfkDrop,
  forcedResolutionPending,
  nextAfkDropAction,
  nextTurnTimeoutAction,
  turnTimeoutPending
} from "./afk-drop";
export {
  clearResetVote,
  isResetVoteApproved,
  resetVoteAuthorizes,
  resetVoteRequired
} from "./reset-vote";
export {
  defaultRoomName,
  dropDisconnectedMember,
  hashRoomPassword,
  healVerifiedMembership,
  isRoomMembershipAction,
  MAX_ROOM_NAME_LENGTH,
  MAX_ROOM_PASSWORD_LENGTH,
  normalizeRoomPassword,
  roomActionGuard,
  roomDisplayName,
  seatForViewer,
  seatOfClient
} from "./room";
export type { VerifiedActor } from "./room";
export { getSeatIdentity, memberForSeat, seatPersonLabel, seatPickSummary } from "./player-identity";
export type { SeatIdentity, SeatRole } from "./player-identity";
export {
  factionCrestAsset,
  getTableReaction,
  isTableReactionAction,
  MAX_TABLE_REACTIONS,
  TABLE_REACTION_FLOOD_LIMIT,
  TABLE_REACTIONS
} from "./table-reactions";
export type { TableReactionDef } from "./table-reactions";
export {
  appendSystemChat,
  CHAT_FLOOD_LIMIT,
  isChatAction,
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TEXT_LENGTH,
  sanitizeChatText,
  sendChat
} from "./chat";
export { ENGINE_PROTOCOL_VERSION, ENGINE_SIGNATURE } from "./version";
export {
  hasOpenAdventureTurn,
  isParallelActor,
  isRoundStartEventBarrierActive,
  MAX_PARALLEL_TURN_ROUNDS,
  normalizeParallelTurnRounds,
  parallelInteractionBlocker,
  parallelTurnsActive,
  parallelWaitMessage,
  remainingParallelPlayerIds,
  roundStartEventResolver,
  stopParallelTurns
} from "./parallel-turns";
export { drawCardsForPlayer, isSharedDeckId, SHARED_DECK_IDS, shuffleCards } from "./decks";
export type { SharedDeckId } from "./decks";
export {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForGameRoundEnd,
  expireEffectsForTurnEnd,
  effectiveInitiative,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getDisplayAttackBonus,
  getAttackRerollEffects,
  makeActiveEffect,
  playerSpellCastsIgnoreLimit,
  unitDealsElementalDamage,
  unitHasUnlimitedRetaliationEffect,
  unitIsBerserk
} from "./active-effects";
export {
  gainRunes,
  getRuneSummary,
  getRuneTrack,
  isBulwarkPlayer,
  spendRunes,
  RUNE_LEVEL_LABELS,
  RUNE_LEVEL_THRESHOLDS
} from "./runes";
export type { RuneLevelStatus, RuneTrackView } from "./runes";
export {
  commanderAbilityIds,
  awardCommanderGradePoints,
  commanderCastAvailable,
  commanderCastCandidates,
  commanderCastOf,
  commanderCastPower,
  commanderCastRuneCost,
  commanderCastUsedThisRound,
  commanderDefinitionOf,
  commanderGradesOf,
  commanderGradeUpChoices,
  commanderLiveAttackBonus,
  commanderLiveDefenseBonus,
  commanderOnOwnFrontLine,
  commanderPowerOf,
  commanderPreCombatSortAvailable,
  commanderRunePool,
  commandersModuleEnabled,
  commanderSlugForFaction,
  commanderUnitId,
  commanderUnitImmuneToOngoing,
  findCommanderUnit,
  isCommanderUnit,
  livingCommanderOf,
  makeCommanderCombatUnit,
  makeInitialCommanderState,
  playerHasLivingCommander
} from "./commanders";
export type { CommanderFirstAidOption } from "./commanders";
export {
  cardCanBoostPower,
  collectPowerBreakpoints,
  describeCardEffect,
  getCardEffectAmount,
  getCardOptions,
  getEffectAmount,
  getEffectDamageAmount,
  getEffectiveCardEffect,
  getSpellDamageAmount,
  getSpellDiceRollCount,
  implementedCardEffectTypes,
  isImplementedCardEffect,
  spellCastPowerBounds,
  spellMaxUsefulPower,
  spellMinUsefulPower,
  spellPowerBreakpoints,
  spellPowerLadder,
  spellPowerValueOfCard,
  spellTimingKind
} from "./effects";
export type { SpellLadderRow, SpellTimingKind } from "./effects";
export { appendEvent } from "./events";
export { getPlayerView, OBSERVER_VIEWER_SEAT, PASSWORD_REDACTED, redactStateForSeat } from "./player-view";
export { createSeededRandom } from "./random";
export {
  canonicalActionKey,
  chooseComputerAction,
  collectMapObjectives,
  computerDecisionOwner,
  computerGuaranteedWinsUsed,
  computerPlayerIds,
  COMPUTER_GUARANTEED_WIN_LIMIT,
  COMPUTER_GUARANTEED_WIN_MAX_DIFFICULTY,
  configuredComputerOpponents,
  controllerOf,
  emptyComputerMemory,
  getComputerMemory,
  combatHasHumanParticipant,
  humanPlayerIdsByController,
  isComputerPlayer,
  isPrivateSinglePlayer,
  isSinglePlayerRoomId,
  legalityMatchKey,
  noteComputerAction,
  observeForComputer,
  primaryMapObjective,
  refreshComputerMemory,
  sessionModeOf,
  setStickyObjective,
  standardComputerController
} from "./computer";
export type { ComputerDecision, ComputerObservation, ComputerPolicyMemory } from "./computer";
export {
  applyCombatBoardArtObstacles,
  assignCombatBoardArt,
  eligibleCombatBoardArtIds,
  isCreatureBankCombat,
  isSeaCombat,
  isSiegeCombat,
  pickCombatBoardArtId,
  SHIP_BATTLE_OBSTACLES,
  weightedCombatBoardArtIds
} from "./combat-board-art";
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
  expertUsesTotalThisRound,
  getRuleset,
  rulesetCardNote,
  specialtyTransformHealth,
  spellBookPowerAvailable,
  spellBookRuleEnabled,
  spellLimitFor,
  unitSideRuleOverrides,
  wisdomGoldDiscount,
  wisdomSearchCount
} from "./ruleset";
export {
  HOUSE_RULES,
  HOUSE_RULE_BY_ID,
  armyUnitStacksActive,
  houseRuleDefaultFor,
  houseRuleEnabled,
  resolveHouseRules
} from "./house-rules";
export type { HouseRuleCategory, HouseRuleDef } from "./house-rules";
export {
  polishReducedStartingBonusVisitSteps,
  polishSurrenderGoldCost,
  polishArtifactAccessAfterRoll,
  polishArtifactBandFromHeroLevel,
  polishArtifactBandFromTileGroup,
  polishPandoraBaseSearchCount,
  polishPandoraSearchCount,
  nextWaitTokenNumber
} from "./polish-house-rules";
export type { PolishArtifactBand } from "./polish-house-rules";
export {
  clearPolishArtifactAccess,
  isArtifactSharedDeckId,
  maybeApplyPolishRandomArtifactRoll,
  polishArtifactDeckAllowed,
  polishArtifactTierAllowed
} from "./polish-random-artifacts";
export {
  currentSurrenderGoldCost,
  flagField,
  materializeTileFields,
  playerPossessesGrail,
  startAdventureRound,
  tickSettlementHoldControl,
  tournamentMoraleSearchAgainEnabled,
  VII_FIELD_LOCATION
} from "./adventure";
export {
  CAST_A_SPELL_CARD_ID,
  gainOwnedCard,
  isCastASpellCard,
  polishSpellBookEnabled,
  polishSpellCanEnterBook
} from "./polish-spell-book";

export {
  POLISH_QUICK_COMBAT_DIFFICULTY_X,
  POLISH_QUICK_COMBAT_STACK_LAYER_STRENGTH,
  POLISH_QUICK_COMBAT_TIER_STRENGTH,
  POLISH_QUICK_COMBAT_UNIT_COUNT,
  polishQuickCombatArmyStrength,
  polishQuickCombatEnabled,
  polishQuickCombatFieldStrength,
  polishQuickCombatUnitStrength,
  polishQuickCombatXpPossible
} from "./polish-quick-combat";

export {
  POLISH_UNIT_STACK_RULES,
  polishArmyUnitCanBuyStack,
  polishArmyUnitStackCap,
  polishArmyUnitStackCost,
  polishUnitStackCap,
  polishUnitStackCapLabel,
  polishUnitStackCost
} from "./polish-unit-stacks";
export {
  applyUnitCurrentSide,
  canPlaceTransformOn,
  insertUnitTransform,
  makeUnitTransformState,
  topTransform
} from "./unit-transforms";
export { markUnitRemovedIfNeeded } from "./combat-units";
export { makeCombatUnitFromArmy } from "./adventure";
export {
  armyUnitRankInfo,
  unitExperienceActive,
  unitRankAbilityGainsAt,
  unitRankAbilityIds,
  unitRankForExperience,
  unitRankStatBonuses,
  unitRankStatBonusesFor,
  unitRankStatGainsAt,
  unitRankStep,
  withRankAbilities
} from "./unit-experience";
export { createInitialGameState } from "./setup";
export {
  createCombatSandboxLobbyState,
  isCombatSandboxSetup,
  makeDefaultSandboxSeat,
  sandboxBattlefieldChoices,
  sandboxPlayMode,
  sandboxRulesetForMode
} from "./combat-sandbox-setup";
export { freshEntropy, freshSeed } from "./seed";
export {
  bannableHeroesForSeat,
  createAdventureGameState,
  createAdventureLobbyState,
  defaultGameSetupOptions,
  DRAFT_FORMAT_LABELS,
  getDraftPhase,
  getScenario,
  readyCheckConfirmers,
  readyCheckRequired,
  reservedTownIdsForOtherSeats,
  scenarioStartingUnitLevels,
  START_CHECK_MS,
  TIER_LEVELS,
  tierOfLevel,
  TOURNAMENT_REMOVED_ABILITY_ID,
  TOURNAMENT_REMOVED_ARTIFACT_ID,
  resolveTournamentRules,
  tournamentRulesAllOn,
  UNIT_LEVELS,
  isSecretTileFeature,
  SECRET_TILE_FEATURE_IDS,
  SECRET_TILE_FEATURES,
  secretFeatureFullLabel,
  secretFeatureLabel,
  validateCustomMapPlan,
  validateCustomMapObjects,
  MAX_DESIGNED_GATE_LINKS
} from "./adventure-setup";
export type { AdventurePlayerConfig, AdventureSetupOptions, DraftPhaseInfo } from "./adventure-setup";
export {
  applyCustomMapPresetToOptions,
  customMapPresetIsActive,
  CUSTOM_WIN_CONDITION_OPTIONS,
  defaultCustomWinCondition,
  defaultObeliskBonusForKind,
  defaultTimedEffect,
  defaultTimedEvent,
  defaultVictoryPointObjective,
  describeCustomMapPreset,
  describeCustomMapPresetEntries,
  describeGuardSpec,
  describeMapObjects,
  describeObeliskAwards,
  describeObeliskBonus,
  describeObeliskRole,
  describeSettlementConfig,
  describeSettlementFieldPlan,
  sanitizeSettlementFieldPlan,
  describeObjectivesConfig,
  describeUtopiaGuards,
  describeTimedMapEffect,
  describeTimedEventSchedule,
  describeVictoryPointsConfig,
  foldLegacyViiBonus,
  isCustomGuardUnit,
  isViiFieldDesignation,
  MAX_CENTER_HEX_DICE,
  MAX_CENTER_HEX_RESOURCE,
  MAX_CENTER_HEX_SEARCH,
  MAX_CENTER_HEX_SEARCH_TIMES,
  MAX_CENTER_HEX_VP,
  MAX_CUSTOM_MAP_OBJECTS,
  MAX_CUSTOM_WIN_CONDITIONS,
  MAX_GATES_PER_PAIR,
  MAX_OBELISK_BONUSES,
  MAX_SETTLEMENT_VP,
  MAX_SETTLEMENT_HOLD_ROUNDS,
  MAX_TIMED_EVENTS,
  MAX_VICTORY_POINT_OBJECTIVES,
  mergeCustomWinConditions,
  planAllowedSecretFeatures,
  planExcludedSecretFeatures,
  tileMatchesAnySecretFeature,
  tileMatchesAnyExcludedFeature,
  tilePassesSecretFilters,
  MAP_PRESET_BUILDING_OPTIONS,
  MAP_PRESET_DIFFICULTY_OPTIONS,
  MAP_PRESET_OBELISK_BONUS_KINDS,
  MAP_PRESET_OBELISK_ROLE_OPTIONS,
  MAP_PRESET_VICTORY_OPTIONS,
  presetForcedOptionKeys,
  revertCustomMapPresetOptions,
  objectGuardSpec,
  ONEWAY_EXIT_MODES,
  OUTPOST_OBJECT_KINDS,
  describeFieldReward,
  describeHexEvent,
  MAX_HEX_EVENT_MESSAGE,
  OBJECT_PLAN_KINDS,
  sanitizeCenterHexPlan,
  sanitizeCenterHexReward,
  sanitizeFieldReward,
  sanitizeCustomGuardSpec,
  sanitizeCustomMapObject,
  sanitizeCustomMapPreset,
  sanitizeCustomWinConditions,
  sanitizeHexEvent,
  sanitizeHexEvents,
  sanitizeObjectFieldPlan,
  sanitizeObjectPlans,
  sanitizeObjectGuard,
  secretFeatureDemandWarnings,
  tileMatchesSecretFeature,
  TIMED_EFFECT_KIND_LABELS,
  TIMED_EFFECT_KINDS,
  VICTORY_POINT_OBJECTIVE_OPTIONS,
  victoryDesignConflicts,
  VII_FIELD_DESIGNATIONS
} from "./map-preset";
export {
  describeGuardArmyGrouped,
  expandGuardUnitGroups,
  groupGuardUnitEntries,
  guardUnitEntryLabel,
  isCustomGuardUnitEntry,
  isAnyPackGuardSlot,
  isPackGuardSlot,
  isRandomGuardSlot,
  isRandomPackGuardSlot,
  isLevelPackGuard,
  packUnitPoolForTier,
  resolveCustomGuardDraws,
  resolveLevelPackGuardDraws,
  PACK_GUARD_PREFIX,
  RANDOM_GUARD_PREFIX,
  RANDOM_PACK_GUARD_PREFIX,
  RANDOM_GUARD_TIERS
} from "./map-design-features";
export type { RandomGuardTier, ResolveCustomGuardOptions } from "./map-design-features";
export {
  computeVictoryPoints,
  controlledSettlementCount,
  DEFAULT_VICTORY_CONDITION_VP,
  describeCustomWinCondition,
  describeVictoryPointObjective,
  recordVpHeroDefeat,
  recordVpSurrender,
  recordVpUtopiaDefeat,
  victoryConditionVp,
  victoryPointsConfig,
  victoryPointsModeActive
} from "./victory-points";
export type {
  VictoryPointBreakdown,
  VictoryPointRow,
  VictoryPointsConfig,
  VictoryPointsResult
} from "./victory-points";
export type {
  CustomMapPresetEntry,
  CustomMapStartingBonus,
  CustomMapTimedEffect,
  CustomMapTimedEvent,
  ObjectPlanKind,
  PresetForcedOptionKey,
  TimedEffectKind
} from "./map-preset";
export { getTileBorderSegments, hasInternalBorder } from "@/data/map/borders";
export type { TileBorderSegment } from "@/data/map/borders";
export { astrologersCardDefinitions, astrologersDeckCardIds } from "@/data/cards/astrologers";
export type { AstrologersCardDefinition, AstrologersEffect } from "@/data/cards/astrologers";
export { eventCardDefinitions, eventsDeckCardIds, EVENTS_NOT_IMPLEMENTED } from "@/data/cards/events";
export type { EventCardDefinition, EventCardEffect } from "@/data/cards/events";
export { DEFAULT_SCENARIO_ID, scenarioDefinitions } from "@/data/map/scenarios";
export type { ScenarioDefinition } from "@/data/map/scenarios";
export {
  ABILITY_SEARCH_LEVELS,
  ASTROLOGERS_DECK_ID,
  EVENTS_DECK_ID,
  EVENT_ARTIFACT_PRICES,
  controlsTownOrSettlement,
  drawEventCard,
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
  adventureSeatCount,
  canCrossEdge,
  canHeroReachPlacedTile,
  canHeroReachPlacementCenter,
  changeMorale,
  checkCustomWinConditions,
  classifyHeroStep,
  declareAdventureWinner,
  endGameByVictoryPoints,
  effectiveHandLimit,
  ensureUniqueArmyUnitIds,
  fieldLayer,
  gainExperience,
  requiredHeroDefeats,
  gateFieldsLinked,
  getActiveAstrologersCard,
  getActiveEventCard,
  getEventsState,
  getAdjacentSpaceIds,
  healLegacyPlayerFields,
  getHeroMovementCapabilities,
  getMainHero,
  getReachableHeroPaths,
  getTileFootprintSpaceIds,
  getUnitDefinition,
  getUnitSide,
  heroCanDiscoverTileAcrossBorders,
  heroFieldSealedForDiscovery,
  heroMovementMax,
  heroMoveStartsBattle,
  carveColoredGateField,
  carveOnewayField,
  applyCustomGuardToField,
  clearCustomGuard,
  customGuardArmyDifficulty,
  designedGuardPreview,
  stampDesignerFieldReward,
  gatePairColor,
  isBankStyleGuardLocation,
  isTeleportObjectGuardLocation,
  isFieldGuarded,
  playerHoldsTentFlag,
  isMapObjectLocation,
  isMapTokenLocation,
  mapFieldLayer,
  DESIGNER_BORDER_SEALING_ENABLED,
  isDesignedEdgeSealedBetween,
  isOuterEdgeSealed,
  isTileSlotDesignedSealed,
  isTileSlotOuterSealed,
  isSeaField,
  MAX_DESIGNED_BORDERS,
  MAX_DESIGNED_BORDER_EDGES,
  normalizeDesignedBorders,
  normalizeDesignedBorderEdges,
  legalTokenSlotsForTileDef,
  levelOfExperience,
  mapTokenLabel,
  placementTokenLabel,
  polishBankSizeForAttackRolls,
  tokenMayCoverFieldDef,
  planSubterraneanGates,
  planIsUnderground,
  UNDERGROUND_LAYER_GROUPS,
  legalGateHexPairs,
  planGateChoiceForReveal,
  upsertGatePlan,
  recomputeSubterraneanGates,
  unreachableUndergroundCenters,
  applyRecruitGoldDiscount,
  totalRecruitGoldDiscount,
  legionVoucherDiscount,
  externalRecruitGoldDiscount,
  consumeRecruitVoucherFor,
  legionDiscountTargets,
  queueLegionDiscountChoice,
  seaStepHalts,
  seaTileBand,
  startingBonusDescription,
  subterraneanTileBand,
  TILE_GROUP_BAND_LABELS,
  tileLayer
} from "./adventure";
export type { DesignedGateLinkLike, HeroMovementCapabilities, HeroPathTarget, HeroStepKind, MapLayer, MapTokenKind, PlannedSubterraneanGate, RecruitPurchaseRef, TilePlacementLike, TokenPlacementKind } from "./adventure";
export {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  COMBAT_UNIT_LIMIT,
  COMMANDER_COMBAT_UNIT_LIMIT,
  combatUnitLimit,
  CREATURE_BANK_ATTACKER_CELLS,
  CREATURE_BANK_GUARD_CORNERS,
  DEFENDER_BACKLINE,
  DEFENDER_FRONTLINE,
  canHeroDiscoverAdjacentTile,
  getEndTurnMoveDestinations,
  getHeroMoveDestinations,
  inCombatPrep,
  isTileAdjacentToSpace,
  isTileRotationConnected,
  TILE_ROTATION_SEAL_GATE_ENABLED,
  observatoryPlacementCenters,
  observatoryRevealTargets,
  placementCellsFor,
  neutralFormationCellsFor,
  commanderDeploymentCellsFor,
  neutralFormationCellsForGuard,
  neutralPlacementIsManual,
  pumpAdventureQueues
} from "./adventure-reducer";
export {
  canonicalTileEdgeCode,
  HEX_DIRECTIONS,
  hexDirectionBetween,
  hexDistance,
  hexNeighbor,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  parseHexSpaceId,
  pixelToHex,
  slotDirection,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeColor,
  tileLatticeNeighbors
} from "./hex";
export type { HexCoord, HexDirection } from "./hex";
export { isNeutralUnit, pickNeutralTarget, planNeutralActivation } from "./neutral-ai";
export {
  isNeutralSideCombatChoice,
  manualGuardControllerId,
  neutralCombatControllerId,
  neutralControlMustAttack,
  pvpNeutralControllerId
} from "./neutral-control";
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
  getActivationOrder,
  getActivationStep,
  getLegalMoveDestinations,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  getPendingReactionPower,
  getUnitMoveRange,
  isAdjacent,
  isEffectLegalForTrigger,
  isUnitAlive,
  standingSpellPower
} from "./legal-actions";
export type { ActivationStep, PendingReactionPower } from "./legal-actions";
export {
  getPostAttackAbilityDamageEffects,
  getUnitAbilityDefinitions,
  hasUnitAbilityEffect
} from "./unit-abilities";
export {
  combatElementalSchool,
  elementalTileSpellPowerBonus,
  getPermanentCardIds,
  getPermanentDefinitions,
  getPermanentSchoolBonus,
  permanentHandLimitBonus,
  permanentLimitFor,
  pickSpellSchoolForPower,
  schoolScopedStandingPower,
  warMachinesForSale
} from "./permanents";
export { describePermanentEffect } from "./effects";
export { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
export type { BattlefieldCoordinates, BattlefieldTerrain } from "./battlefield";
export { DEFAULT_OBELISK_BONUS, DEFAULT_WOG_OPTIONS, MAX_CUSTOM_GUARD_UNITS, MAX_HEX_EVENTS, NEUTRAL_PLAYER_ID } from "./state";
export { DEFAULT_ANIME_OPTIONS, animeEnabled, animeModuleEnabled } from "./anime";
export {
  CULTIVATION_REALMS,
  cultivationEnabled,
  cultivationRealmOf,
  cultivationHandLimitBonus,
  cultivationSpellPowerBonus,
  cultivationCombatRerollBonus,
  maybeAdvanceCultivationRealm,
  tribulationAvailable
} from "./anime-cultivation";
export {
  heroGradesEnabled,
  heroGradeOf,
  heroGradeProgressOf,
  heroGradePointsOf,
  heroGradeNodesOf,
  heroHasGradeNode,
  heroGradeHandLimitBonus,
  heroGradeSpellPowerBonus,
  gainGradeProgress,
  gradeForMerit,
  pickableNodesFrom,
  heroGradeNode,
  heroGradePickableNodes,
  heroGradeRegisterKey,
  heroGradeLabel,
  heroTrainAvailable
} from "./anime-hero-grades";
export {
  HERO_GRADE_MERIT_THRESHOLDS,
  HERO_GRADE_TIER_COUNT,
  HERO_GRADE_MAX,
  HERO_GRADE_PICKS_PER_TIER,
  HERO_GRADE_REGISTERS
} from "@/data/anime/hero-grades";
export {
  equipmentEnabled,
  equipmentContextAvailable,
  heroEquipmentOf,
  heroEquipmentSlot,
  playerHasEquipment,
  playerOwnsEquipment,
  heroEquipmentInventoryOf,
  equipmentSpellPowerBonus,
  equipmentFirstSpellPowerBonus,
  applyEquipmentStageCostumeDefenseToken,
  equipmentHandLimitBonus,
  equipmentWinGold,
  equipmentResourceRoundMaterials,
  equipmentResourceRoundGold,
  equipmentMovementBonus,
  equipmentVeteranBonusXp,
  equipmentRound1AttackBonus,
  equipmentGrantsCommanderSort,
  equipmentGrantsCommanderRevive,
  equipEquipment
} from "./anime-equipment";
export {
  ANIME_EQUIPMENT_DEFINITIONS,
  ANIME_EQUIPMENT_ART_PLACEHOLDERS,
  ANIME_EQUIPMENT_SLOTS,
  EQUIPMENT_IDS,
  EQUIPMENT_SLOT_GLYPH,
  EQUIPMENT_SHOP_SALES,
  EQUIPMENT_SHOP_LOCATION_IDS,
  getEquipmentDefinition,
  listEquipmentDefinitions,
  equipmentImage,
  type EquipmentDefinition,
  type EquipmentContextRequirement
} from "@/data/anime/equipment";
export {
  carveFieldOverride,
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions,
  fieldOverrideLabel,
  fieldOverridesEnabled,
  fieldOverridePlacementMode,
  customMapHasFieldOverridePins,
  customMapHasAnimeFieldOverridePins,
  resolveFieldOverridesEnabled,
  resolveFieldOverridePlacement,
  mapObjectsModuleActive
} from "./field-overrides";
export {
  applyCombatScriptCombatStart,
  applyCombatScriptRoundStart,
  combatScriptStatDelta,
  combatScriptsActiveForCombat
} from "./combat-scripts";
export {
  registerCombatScriptDefinitions,
  getCombatScriptDefinition,
  listCombatScriptDefinitions,
  combatScriptsForLocation,
  type CombatScriptDefinition,
  type CombatScriptEffect,
  type CombatScriptEvent,
  type CombatScriptSide,
  type CombatScriptText
} from "@/data/map/combat-scripts";
export {
  planTokens,
  planFieldOverrides,
  occupiedSlotsOnPlan,
  firstFreeSlot,
  withPlanTokens,
  withPlanFieldOverrides,
  dedupePlanHexPlacements
} from "./tile-hex-placements";
export type {
  AbilityDiceRoll,
  ActiveEffectDefinition,
  ActiveEffectModifier,
  ActiveEffectState,
  AbilityClass,
  AnimeEquipmentSlot,
  AdventureReward,
  AdventureState,
  AstrologersState,
  ArmyUnitState,
  ArtifactTier,
  AttackRollMode,
  AttackRollModifierNote,
  BankSize,
  BattlefieldTokenKind,
  BattlefieldTokenState,
  BuildingDefinition,
  BuildingEffectDefinition,
  BuildingId,
  BuildingLibrary,
  CardDefinition,
  CardId,
  CardOptionDefinition,
  CardPlayCost,
  CardPlayMode,
  CardLibrary,
  CombatContext,
  CombatBoardArtId,
  CombatDice,
  CombatSandboxSeatConfig,
  CombatSandboxSetupState,
  CombatSandboxUnitPick,
  CombatSetupState,
  CombatScriptStatModifier,
  DeckSearchPick,
  CombatStat,
  CombatState,
  CombatUnitState,
  CustomMapObeliskBonus,
  CustomMapObeliskConfig,
  CustomMapSettlementConfig,
  CustomMapSettlementFieldPlan,
  CustomMapObjectivesConfig,
  CustomMapObject,
  CustomMapObjectKind,
  CustomMapObjectPlacement,
  CustomMapPreset,
  CustomMapTilePlan,
  CustomMapGateLink,
  CustomStartingUnit,
  CustomWinCondition,
  SecretTileFeature,
  VictoryMode,
  DamageKind,
  DeckState,
  DraftFormat,
  EffectDefinition,
  EngineResult,
  EffectDurationDefinition,
  FactionId,
  GameAction,
  GameDifficulty,
  GameSessionMode,
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
  HouseRuleId,
  PendingTileChoice,
  PendingVisit,
  PlayerId,
  PlayerController,
  ComputerDifficulty,
  PlayerState,
  PlayerVisibleDeckState,
  PlayerVisiblePlayerState,
  PlayerVisibleState,
  PendingChoice,
  RecruitDiscountVoucher,
  PermanentEffectDefinition,
  ChatMessage,
  ReactionPlay,
  ReactionWindow,
  ResolutionStackItem,
  ResetVoteState,
  RoomMember,
  RoomMembershipState,
  RoomSeat,
  ResourceCost,
  ResourceKind,
  RulesError,
  SourceRef,
  SpellLevel,
  SpellSchool,
  StartCheckState,
  StatisticType,
  TableReaction,
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
  ViiFieldReward,
  CustomCenterHexPlan,
  CustomCenterHexReward,
  CustomFieldReward,
  CustomGuardSpec,
  CustomHexEvent,
  CustomMapTileToken,
  CustomObjectFieldPlan,
  HexEventState,
  OnewayExitMode,
  VictoryPointObjective,
  VisitStep,
  VpLedgerEntry,
  CombatTokenKind,
  CombatTokenState,
  FirstPlayerRollState,
  SiegeState,
  WogModOptions,
  AnimeModOptions
} from "./state";

export { getUnitTokens, tokenAttackBonus, tokenDefenseDelta } from "./tokens";
export {
  ARROW_TOWER_POSITION,
  ARROW_TOWER_STATS,
  destroyEnemyFortificationsInCells,
  enemyFortificationsInCells,
  fortificationTargetId,
  getDemolishAbility,
  intactFortificationPositions,
  isArrowTowerUnit,
  makeArrowTowerUnit,
  parseFortificationTargetId,
  SIEGE_ROW_POSITIONS
} from "./siege";
