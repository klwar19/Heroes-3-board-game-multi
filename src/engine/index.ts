export { sampleCards } from "@/data/cards/sample";
export { sampleBuildings } from "@/data/towns/buildings";
export { unitAbilities } from "@/data/units/abilities";
export {
  fightingHeroIdForPlayer,
  heroCombatProfile,
  heroUnitId,
  injectHeroIntoCombat,
  makeHeroCombatUnit
} from "./heroes";

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
  firstPlayerCeremonyPending,
  resolveManualPlayerOrder,
  sanitizeManualPlayerOrder
} from "./first-player";
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
  seatOfClient,
  VERIFIED_SEAT_REJECTION_MESSAGE
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
  FUYUKI_COMMAND_SEAL_LIMIT,
  fuyukiCommandSealsOf,
  hiddenLeafMissionCompletion,
  hiddenLeafMissionPointsEarned,
  hiddenLeafMissionRankOf,
  hiddenLeafNextMissionRank
} from "./anime-town-mechanics";
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
  effectAppliesToUnit,
  effectiveInitiative,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getDisplayAttackBonus,
  getAttackRerollEffects,
  makeActiveEffect,
  playerSpellCastsIgnoreLimit,
  unitAttackRollAdvantaged,
  unitAttackRollDisadvantaged,
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
  commanderIntegratedDeploymentSortAvailable,
  commanderPowerOf,
  commanderPreCombatSortAvailable,
  commanderRunePool,
  commandersModuleEnabled,
  commanderSlugForFaction,
  commanderSortAbilitySource,
  commanderSortUnlocked,
  commanderFrontLineSpeedBonusActive,
  COMMANDER_FRONT_LINE_SPEED_BONUS,
  COMMANDER_SORT_SPEED_GRADE,
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
  cardCanBoostPowerForSpellSchools,
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
  spellPowerSidesOfCard,
  spellPowerSourceDrawCards,
  spellPowerValueOfCard,
  powerCostPaymentMode,
  cardCanFuelSchoollessPower,
  spellTimingKind
} from "./effects";
export type { SpellLadderRow, SpellPowerSide, SpellTimingKind } from "./effects";
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
  COOP_AI_TEAM_ID,
  COOP_HUMAN_TEAM_ID,
  humanPlayerIdsByController,
  isComputerPlayer,
  isPrivateSinglePlayer,
  isSinglePlayerRoomId,
  legalityMatchKey,
  noteComputerAction,
  observeForComputer,
  playersAreAllied,
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
  isPveEncounterCombat,
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
  customWinConditionProgress,
  flagField,
  materializeTileFields,
  playerPossessesGrail,
  polishQuickCombatFieldInfo,
  startAdventureRound,
  tickSettlementHoldControl,
  tournamentMoraleSearchAgainEnabled,
  VII_FIELD_LOCATION,
  type PolishQuickCombatFieldInfo
} from "./adventure";
export {
  CAST_A_SPELL_CARD_ID,
  gainOwnedCard,
  isCastASpellCard,
  polishBookSpellEffectIsLive,
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
  polishQuickCombatOutcome,
  polishQuickCombatUnitStrength,
  polishQuickCombatXpPossible,
  type PolishQuickCombatOutcome
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
  printedCardName,
  topTransform,
  unitFlipSidePreview,
  type UnitFlipSide
} from "./unit-transforms";
export { markUnitRemovedIfNeeded } from "./combat-units";
export {
  makeCombatUnitFromArmy,
  unitDrillGoldCost,
  unitDrillLimit,
  unitDrillMovementCost,
  unitDrillsUsedThisRound
} from "./adventure";
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
  clampSeatCount,
  createAdventureGameState,
  createAdventureLobbyState,
  defaultGameSetupOptions,
  DRAFT_FORMAT_LABELS,
  getDraftPhase,
  getScenario,
  mapForcedComputerFaction,
  lobbyTeamAssignments,
  readyCheckConfirmers,
  readyCheckRequired,
  reservedTownIdsForOtherSeats,
  sanitizeTeamAssignments,
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
  coopMapDeployment,
  coopMapDesignProblems,
  coopMapSeatCapacity,
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
  describeMapSupportedModes,
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
  MAX_FIELD_REWARD_EXPERIENCE,
  MAX_FIELD_REWARD_MOVEMENT,
  MAX_FIELD_REWARD_RESOURCE_DICE,
  MAX_CUSTOM_MAP_OBJECTS,
  MAX_CUSTOM_WAVE_OVERRIDES,
  MAX_CUSTOM_WIN_CONDITIONS,
  MAX_GATES_PER_PAIR,
  MAX_OBELISK_BONUSES,
  MAX_SINGLE_PLAYER_MAP_OPPONENTS,
  MAX_STARTING_ARMY_EXPERIENCE,
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
  mapHasAuthoredGrailOrUtopia,
  mapSupportedModes,
  mapSupportsGameMode,
  presetForcedOptionKeys,
  revertCustomMapPresetOptions,
  objectGuardSpec,
  ONEWAY_EXIT_MODES,
  OUTPOST_OBJECT_KINDS,
  STANDALONE_ONLY_OBJECT_KINDS,
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
  sanitizeCoopMapSeat,
  sanitizeSinglePlayerMapStart,
  secretFeatureDemandWarnings,
  singlePlayerMapDeployment,
  tileMatchesSecretFeature,
  TIMED_EFFECT_KIND_LABELS,
  TIMED_EFFECT_KINDS,
  VICTORY_POINT_OBJECTIVE_OPTIONS,
  victoryDesignConflicts,
  viiObjectiveRewardStacks,
  viiRewardStackWarnings,
  VII_FIELD_DESIGNATIONS
} from "./map-preset";
export type {
  CoopMapDeployment,
  CoopMapDeploymentResult,
  CoopMapSeatCapacity,
  SinglePlayerMapDeployment,
  ViiRewardStack,
  ViiRewardStackSource
} from "./map-preset";
export {
  availableFarTileTypes,
  FAR_TILE_TYPES,
  FAR_TILE_TYPE_LABELS,
  farTileTypeMatches,
  isFarTileType
} from "./far-tile-types";
export {
  describeGuardArmyGrouped,
  expandGuardUnitGroups,
  groupGuardUnitEntries,
  guardUnitEntryLabel,
  isCustomGuardUnitEntry,
  isAnyPackGuardSlot,
  isAnyFewGuardSlot,
  isPackGuardSlot,
  isFewGuardSlot,
  isRandomGuardSlot,
  isRandomPackGuardSlot,
  isRandomFewGuardSlot,
  isLevelPackGuard,
  packUnitPoolForTier,
  fewUnitPoolForTier,
  resolveCustomGuardDraws,
  resolveLevelPackGuardDraws,
  PACK_GUARD_PREFIX,
  FEW_GUARD_PREFIX,
  RANDOM_GUARD_PREFIX,
  RANDOM_PACK_GUARD_PREFIX,
  RANDOM_FEW_GUARD_PREFIX,
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
  victoryPointObjectiveProgress,
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
export {
  CUSTOM_BOSS_LIMITS,
  MAX_CUSTOM_RAID_BOSSES,
  RAID_BOSS_ESCALATION_INTERVAL,
  RAID_BOSS_KILL_GOLD,
  RAID_BOSS_LAYER_BREAK_GOLD,
  RAID_BOSS_SPAWN_ROUND,
  customBossToDefinition,
  raidBossKillCount,
  raidBossesEnabled,
  resolveBossDefinition
} from "./raid-bosses";
export {
  WAVE_ARMY_LEVEL_CAP,
  WAVE_PILLAGE_GOLD,
  WAVE_TREASURE_DIE_FROM_WAVE,
  WAVE_WIN_GOLD,
  WAVE_WIN_XP,
  monsterWavesEnabled,
  waveArmyLevel,
  waveCadenceOf,
  waveNumberForRound
} from "./monster-waves";
export {
  DUNGEON_BOSS_FLOORS,
  DUNGEON_FLOOR_CAP,
  dungeonDescentCostOf,
  dungeonEnabled,
  dungeonFloorCapOf,
  dungeonFloorDifficulty,
  dungeonFloorOf,
  dungeonTreasureThemeOf
} from "./dungeon";
export type { DungeonTreasureTheme } from "./dungeon";
export type {
  CustomRaidBossDef,
  DungeonDepth,
  DungeonDescentCost,
  RaidBossSpawnRound,
  RaidBossState
} from "./state";
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
  PRINTED_RESOURCE_DIE_FACES,
  SINGLE_VALUABLES_RESOURCE_DIE_FACES,
  resourceDieFaces,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  RETREAT_GOLD_COST,
  SPECIALTY_LEVELS,
  SURRENDER_GOLD_COST,
  TILE_BACK_LABELS,
  TRADE_RATES,
  TREASURE_DIE_FACES,
  adventureSeatCount,
  adventureRivalIds,
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
  fieldFlaggedByAlly,
  fieldLayer,
  freeSpellBookActive,
  gainExperience,
  requiredHeroDefeats,
  requiredRivalHeroDefeats,
  gateFieldsLinked,
  getActiveAstrologersCard,
  explorersHandStepActive,
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
  BLOCKED_FIELD_CARVE_LOCATIONS,
  isBlockedFieldCarve,
  printedBordersSurviveCarve,
  fieldNeverWearsBorders,
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
  CUSTOM_MAP_OBJECT_LAYERS,
  declaredStandaloneLayer,
  declaredStandaloneMapLayer,
  legalGateHexPairs,
  planGateChoiceForReveal,
  upsertGatePlan,
  recomputeSubterraneanGates,
  resolveStartingArmyFromGuardSpec,
  unreachableUndergroundCenters,
  applyRecruitGoldDiscount,
  totalRecruitGoldDiscount,
  legionVoucherDiscount,
  externalRecruitGoldDiscount,
  consumeRecruitVoucherFor,
  neutralRecruitCost,
  legionPieceAlreadyBanked,
  heldRecruitDiscountCards,
  bankReinforcementDiscount,
  reinforcementDiscountCostFor,
  redeemReinforcementDiscount,
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
  CREATURE_BANK_GUARD_OVERFLOW_CELLS,
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
export { bestMapSpellTier, isMapPowerTierSpell, mapSpellPowerTiers } from "./map-spell-cast";
export type { MapSpellPowerTiers } from "./map-spell-cast";
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
  tileLatticeNeighbors,
  tileTouchNeighbors
} from "./hex";
export type { HexCoord, HexDirection } from "./hex";
export { isNeutralUnit, pickNeutralTarget, planNeutralActivation } from "./neutral-ai";
export {
  combatUnitDecisionOwnerId,
  coopDisablesManualNeutralControl,
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
  playConsumesWindowPower,
  effectScalesWithAttackPool,
  attackWindowPooledPower,
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
  standingSpellPower,
  tacticsCombatOfferIsExpert
} from "./legal-actions";
export type { ActivationStep, PendingReactionPower } from "./legal-actions";
export { spellCastRestrictionNotices } from "./spell-cast-restrictions";
export type { SpellCastRestrictionNotice } from "./spell-cast-restrictions";
export {
  getInnateFlatAttackBonus,
  getPostAttackAbilityDamageEffects,
  getUnitAbilityDefinitions,
  hasUnitAbilityEffect
} from "./unit-abilities";
export {
  combatElementalSchool,
  committedSchoolExpertPower,
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
  CULTIVATION_REALM_REGISTERS,
  cultivationEnabled,
  cultivationRealmLabel,
  cultivationRealmOf,
  cultivationRealmRegisterKey,
  cultivationHandLimitBonus,
  cultivationSpellPowerBonus,
  cultivationCombatRerollBonus,
  maybeAdvanceCultivationRealm,
  tribulationAvailable
} from "./anime-cultivation";
export type { CultivationRealm, CultivationRealmLabel, CultivationRealmRegisterKey } from "./anime-cultivation";
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
  heroGradeNodesForRegister,
  heroGradeNodesForPlayer,
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
  HERO_GRADE_CHOICES_PER_TIER,
  HERO_GRADE_REGISTERS,
  HERO_GRADE_REGISTER_NODES,
  MGQ_JOB_MASTERY_NODE
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
// Polish Set Artifacts (`polish-set-artifacts`) — the read layer + its data.
export {
  ARTIFACT_SETS,
  ARTIFACT_SET_BY_ID,
  activeArtifactSetTiers,
  activeTiersForPieces,
  artifactSetActiveTierCount,
  artifactSetAttackWindowOffers,
  artifactSetDefinition,
  artifactSetEnemySpellPowerDrain,
  artifactSetIncome,
  artifactSetPieceCount,
  artifactSetPowerOffers,
  artifactSetRecruitGoldDiscount,
  artifactSetSelectedUnitId,
  artifactSetSpellDamageReduction,
  artifactSetTierAt,
  artifactSetTierIsActive,
  artifactSetTierIsAttackWindowInstant,
  findArtifactSetAttackWindowOffer,
  findArtifactSetOffer,
  playerArtifactSetStatuses,
  setArtifactsEnabled,
  syncArtifactSetTiers
} from "./artifact-sets";
export type { ArtifactSetOffer, ArtifactSetStatus } from "./artifact-sets";
export {
  ARTIFACT_SET_BY_MEMBER,
  ARTIFACT_SET_MEMBER_IDS,
  SET_ARTIFACT_MEMBERS_NOT_IN_GAME,
  artifactSetCardImage,
  artifactSetIconImage
} from "@/data/cards/artifact-sets";
export type {
  ArtifactSetDefinition,
  ArtifactSetId,
  ArtifactSetTier,
  ArtifactSetTierEffect
} from "@/data/cards/artifact-sets";
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
  combatScriptEffectLines,
  combatScriptTimingLines,
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
  CombatSandboxPlayMode,
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
  CustomMapObjectLayer,
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
  ReinforcementDiscountBank,
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
  AnimeModOptions,
  GameRuleset,
  TableGameMode
} from "./state";

export { getUnitTokens, tokenAttackBonus, tokenDefenseDelta } from "./tokens";
export {
  ARROW_TOWER_POSITION,
  ARROW_TOWER_STATS,
  arrowTowerRefusesEffect,
  destroyEnemyFortificationsInCells,
  effectRelocatesUnitOnBoard,
  enemyFortificationsInCells,
  fortificationTargetId,
  getDemolishAbility,
  intactFortificationPositions,
  isArrowTowerUnit,
  makeArrowTowerUnit,
  parseFortificationTargetId,
  SIEGE_ROW_POSITIONS
} from "./siege";
