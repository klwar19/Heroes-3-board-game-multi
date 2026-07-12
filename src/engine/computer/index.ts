export {
  computerPlayerIds,
  configuredComputerOpponents,
  controllerOf,
  humanPlayerIdsByController,
  isComputerPlayer,
  isPrivateSinglePlayer,
  sessionModeOf,
  standardComputerController,
} from "./control";
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
  MAP_OBJECTIVE_PRIORITY,
  objectiveDistanceField,
  ownTownSpaceId,
  primaryMapObjective,
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
  BANK_ENGAGE_RATIO,
  bankUnitStrength,
  canBeatCreatureBank,
  creatureBankStrength,
  ENEMY_ENGAGE_RATIO,
  playerArmyStrength,
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
  canonicalActionKey,
  chooseComputerAction,
  legalityMatchKey,
} from "./policy";
export { computerDecisionOwner } from "./window";
export type { ComputerDecision, ComputerObservation } from "./types";
