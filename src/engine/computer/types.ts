import type {
  GameAction,
  LegalAction,
  PlayerId,
  PlayerVisibleState,
} from "../state";
import type { ComputerPolicyMemory } from "./memory";

export type ComputerObservation = {
  playerId: PlayerId;
  state: PlayerVisibleState;
  legalActions: LegalAction[];
  /**
   * This seat's multi-round policy memory (from authoritative state). Optional
   * for unit fixtures; scorers treat missing as empty/default memory.
   */
  memory?: ComputerPolicyMemory;
};

export type ComputerDecision = {
  playerId: PlayerId;
  action: GameAction;
  policy: string;
  score: number;
};
