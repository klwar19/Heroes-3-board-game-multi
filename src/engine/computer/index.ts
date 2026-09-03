export {
  combatHasHumanParticipant,
  computerPlayerIds,
  COOP_AI_TEAM_ID,
  COOP_HUMAN_TEAM_ID,
  configuredComputerOpponents,
  controllerOf,
  humanPlayerIdsByController,
  isComputerPlayer,
  isPrivateSinglePlayer,
  isSinglePlayerRoomId,
  playersAreAllied,
  sessionModeOf,
  standardComputerController,
} from "./control";
export {
  applyComputerGuaranteedWin,
  combatQualifiesForComputerGuaranteedWin,
  COMPUTER_GUARANTEED_WIN_LIMIT,
  COMPUTER_GUARANTEED_WIN_MAX_DIFFICULTY,
  computerGuaranteedWinsUsed,
} from "./guaranteed-wins";
export { observeForComputer } from "./observation";
export { cardKeepValue, scoreCardAction } from "./card-policy";
export { scoreChoiceAction } from "./choice-policy";
export { formationFitScore, scoreCombatAction } from "./combat-policy";
export {
  hasUsefulMarketTrade,
  resourceDeficits,
  scoreMapAction,
  tradeUtility,
} from "./map-policy";
export {
  canBeatGuardedField,
  collectMapObjectives,
  distanceFromHeroTo,
  freeSeizuresWithinReach,
  isFreeSeizeObjective,
  MAP_OBJECTIVE_PRIORITY,
  objectiveDistanceField,
  ownTownSpaceId,
  primaryMapObjective,
  VISITABLE_LOCATION_VALUE,
  type MapObjective,
  type MapObjectiveKind,
} from "./map-navigation";
export {
  emptyComputerMemory,
  economyFocusBias,
  getComputerMemory,
  inferEconomyFocus,
  noteComputerAction,
  refreshComputerMemory,
  setStickyObjective,
  STICKY_OBJECTIVE_MAX_ROUNDS,
  type ComputerPolicyMemory,
  type EconomyFocus,
} from "./memory";
export {
  activeEnemySideCount,
  armyCoversPremiumEconomyGuard,
  BANK_ENGAGE_RATIO,
  bankUnitStrength,
  canBeatCreatureBank,
  creatureBankStrength,
  ENEMY_ENGAGE_RATIO,
  enemyEngagementRatio,
  isPremiumEconomyField,
  playerArmyStrength,
  premiumEconomyEngageCap,
  shouldAssaultEnemyHolding,
  shouldEngageEnemy,
  unitSideStrength,
} from "./army-strength";
export {
  attackIsLethal,
  expectedAttackDamage,
  unitRemainingHealth,
  unitThreatValue,
} from "./score";
export {
  armyDevelopmentProfile,
  armyReadyForContestedFight,
  CORE_PACK_TARGET,
  CORE_BODY_TARGET,
  developmentResourceTargets,
  nextDevelopmentBuildingCost,
  openingCorePackTarget,
  unitDevelopmentSideStrength,
  type ArmyDevelopmentPhase,
  type ArmyDevelopmentProfile,
} from "./development";
export {
  canonicalActionKey,
  chooseComputerAction,
  legalityMatchKey,
} from "./policy";
export { computerDecisionOwner } from "./window";
export type { ComputerDecision, ComputerObservation } from "./types";
