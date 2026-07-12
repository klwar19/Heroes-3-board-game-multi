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
export { scoreCombatAction } from "./combat-policy";
export { scoreMapAction } from "./map-policy";
export {
  canBeatGuardedField,
  collectMapObjectives,
  objectiveDistanceField,
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
