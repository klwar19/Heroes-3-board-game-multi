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
