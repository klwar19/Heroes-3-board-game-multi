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
export { scoreCombatAction } from "./combat-policy";
export { scoreMapAction } from "./map-policy";
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
  ENEMY_ENGAGE_RATIO,
  playerArmyStrength,
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
