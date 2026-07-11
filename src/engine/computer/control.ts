import { NEUTRAL_PLAYER_ID } from "../state";
import type {
  GameSessionMode,
  GameState,
  PlayerController,
  PlayerId,
} from "../state";

const HUMAN_CONTROLLER: PlayerController = Object.freeze({ kind: "human" });
const STANDARD_COMPUTER: PlayerController = Object.freeze({
  kind: "computer",
  difficulty: "standard",
  policyVersion: 1,
});

/** Legacy-compatible session lookup: every pre-feature snapshot is multiplayer. */
export function sessionModeOf(state: GameState): GameSessionMode {
  return state.sessionMode === "single-player"
    ? "single-player"
    : "multiplayer";
}

/** Legacy-compatible controller lookup. Neutrals are never a player-seat computer. */
export function controllerOf(
  state: GameState,
  playerId: PlayerId,
): PlayerController {
  if (playerId === NEUTRAL_PLAYER_ID) {
    return HUMAN_CONTROLLER;
  }
  return state.controllers?.[playerId] ?? HUMAN_CONTROLLER;
}

export function standardComputerController(): PlayerController {
  return { ...STANDARD_COMPUTER };
}

export function isComputerPlayer(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return (
    playerId !== NEUTRAL_PLAYER_ID &&
    controllerOf(state, playerId).kind === "computer"
  );
}

export function computerPlayerIds(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (playerId) =>
      !state.players[playerId]?.eliminated && isComputerPlayer(state, playerId),
  );
}

export function humanPlayerIdsByController(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (playerId) =>
      playerId !== NEUTRAL_PLAYER_ID &&
      !state.players[playerId]?.eliminated &&
      controllerOf(state, playerId).kind === "human",
  );
}

/** A room is private if either persisted marker says so; useful during migrations/recovery. */
export function isPrivateSinglePlayer(state: GameState): boolean {
  return (
    sessionModeOf(state) === "single-player" ||
    state.room?.visibility === "private"
  );
}
