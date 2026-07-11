import type {
  GameAction,
  LegalAction,
  PlayerId,
  PlayerVisibleState,
} from "../state";

export type ComputerObservation = {
  playerId: PlayerId;
  state: PlayerVisibleState;
  legalActions: LegalAction[];
};

export type ComputerDecision = {
  playerId: PlayerId;
  action: GameAction;
  policy: string;
  score: number;
};
