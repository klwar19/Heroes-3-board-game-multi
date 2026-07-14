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

/**
 * How many computer seats this game was CONFIGURED with — read from the
 * persisted controller map, so eliminations never shrink it. Used by room
 * resets/rematches to rebuild the same table.
 */
export function configuredComputerOpponents(state: GameState): number {
  return Object.values(state.controllers ?? {}).filter(
    (controller) => controller.kind === "computer",
  ).length;
}

export function humanPlayerIdsByController(state: GameState): PlayerId[] {
  return state.turnOrder.filter(
    (playerId) =>
      playerId !== NEUTRAL_PLAYER_ID &&
      !state.players[playerId]?.eliminated &&
      controllerOf(state, playerId).kind === "human",
  );
}

/**
 * True when a living human seat is a participant of the open combat (attacker,
 * defender, or a unit controller). Used by the live computer pump: AI-only
 * fights (computer vs neutrals / computer vs computer) bulk-resolve off-screen;
 * a fight that involves the human is paced like normal PvP.
 */
export function combatHasHumanParticipant(state: GameState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const seats = new Set<PlayerId>();
  if (combat.attackerPlayerId) seats.add(combat.attackerPlayerId);
  if (combat.defenderPlayerId) seats.add(combat.defenderPlayerId);
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId) seats.add(unit.controllerId);
  }
  for (const playerId of seats) {
    if (
      playerId !== NEUTRAL_PLAYER_ID &&
      !state.players[playerId]?.eliminated &&
      controllerOf(state, playerId).kind === "human"
    ) {
      return true;
    }
  }
  return false;
}

/** A room is private if either persisted marker says so; useful during migrations/recovery. */
export function isPrivateSinglePlayer(state: GameState): boolean {
  return (
    sessionModeOf(state) === "single-player" ||
    state.room?.visibility === "private"
  );
}

/**
 * The id prefix minted for a private single-player game (see
 * `createSinglePlayerRoom` in src/lib/realtime.ts). It is produced ONLY there,
 * so the prefix is a reliable single-player signal in its own right.
 */
export const SINGLE_PLAYER_ROOM_PREFIX = "sp-";

/**
 * True when a roomId was minted for a single-player game. Used as a FALLBACK
 * single-player signal so a room that comes into being WITHOUT the
 * `?singlePlayer=` creation marker — the marker is read from `localStorage`, so
 * it is absent when storage is blocked/cleared, when an `sp-` link is opened in
 * a fresh browser, or when the room is auto-created by a bare snapshot/action
 * request — still becomes a PRIVATE single-player room rather than a public,
 * listed multiplayer lobby room that would flood the directory.
 */
export function isSinglePlayerRoomId(roomId: string | undefined | null): boolean {
  return typeof roomId === "string" && roomId.startsWith(SINGLE_PLAYER_ROOM_PREFIX);
}
