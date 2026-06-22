import { appendEvent } from "./events";
import { NEUTRAL_PLAYER_ID } from "./state";
import type {
  GameAction,
  GameState,
  PlayerId,
  RoomMember,
  RoomMembershipState,
  RoomSeat
} from "./state";

/**
 * Room membership / seating engine.
 *
 * Membership lives inside the synced GameState (`state.room`) so it flows
 * through `applyAction` exactly like every other rule — validated server-side,
 * persisted, and broadcast by both transport backends. See the doc-comment on
 * `RoomMembershipState` in state.ts for the open-table vs. hosted model.
 *
 * Every handler here validates its own preconditions and THROWS on anything
 * illegal (so the action types are listed in `HANDLER_VALIDATED_ACTIONS` in
 * the reducer and never go through getLegalActions). They mutate `state` in
 * place, matching the rest of the reducer.
 */

/** The action types handled by this module (membership, not seat gameplay). */
const ROOM_MEMBERSHIP_ACTION_TYPES = new Set<GameAction["type"]>([
  "JOIN_ROOM",
  "LEAVE_ROOM",
  "SET_ROOM_HOSTED",
  "ASSIGN_SEAT",
  "KICK_MEMBER",
  "TRANSFER_HOST"
]);

export function isRoomMembershipAction(action: GameAction): boolean {
  return ROOM_MEMBERSHIP_ACTION_TYPES.has(action.type);
}

/** Creates the membership record on first use (a fresh open table). */
export function ensureRoom(state: GameState): RoomMembershipState {
  if (!state.room) {
    state.room = { hosted: false, hostClientId: null, members: [] };
  }
  return state.room;
}

function findMember(room: RoomMembershipState, clientId: string): RoomMember | null {
  return room.members.find((member) => member.clientId === clientId) ?? null;
}

/** The exact registered host (the only client trusted with host powers). */
function isEffectiveHost(room: RoomMembershipState, clientId: string): boolean {
  return room.hosted && room.hostClientId === clientId;
}

/** The set of real seat ids (no neutrals) this game knows about. */
function knownSeatIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const seat of state.setupLobby?.seats ?? []) {
    ids.add(seat.playerId);
  }
  for (const playerId of state.turnOrder) {
    if (playerId !== NEUTRAL_PLAYER_ID) {
      ids.add(playerId);
    }
  }
  for (const playerId of Object.keys(state.players)) {
    if (playerId !== NEUTRAL_PLAYER_ID) {
      ids.add(playerId);
    }
  }
  return ids;
}

function assertValidSeat(state: GameState, seat: RoomSeat): void {
  if (seat === "observer") {
    return;
  }
  if (!knownSeatIds(state).has(seat)) {
    throw new Error("That seat does not exist in this game.");
  }
}

/** The seat a client controls, or null if they are not a member. */
export function seatOfClient(state: GameState, clientId: string): RoomSeat | null {
  return state.room ? (findMember(state.room, clientId)?.seat ?? null) : null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function joinRoom(state: GameState, action: Extract<GameAction, { type: "JOIN_ROOM" }>): void {
  if (!action.clientId) {
    throw new Error("A client id is required to join a room.");
  }
  const room = ensureRoom(state);
  const name = action.name?.trim() || "Player";

  const existing = findMember(room, action.clientId);
  if (existing) {
    // Re-join (reconnect / rename): keep the seat and host, refresh the name.
    existing.name = name;
    // A returning host reclaims the host flag (sticky by clientId).
    if (room.hosted && room.hostClientId === action.clientId) {
      existing.isHost = true;
    }
    appendEvent(state, {
      type: "ROOM_MEMBER_JOINED",
      clientId: existing.clientId,
      name: existing.name,
      seat: existing.seat,
      isHost: existing.isHost
    });
    return;
  }

  const member: RoomMember = {
    clientId: action.clientId,
    name,
    seat: "observer",
    isHost: room.hosted && room.hostClientId === action.clientId
  };
  room.members.push(member);
  appendEvent(state, {
    type: "ROOM_MEMBER_JOINED",
    clientId: member.clientId,
    name: member.name,
    seat: member.seat,
    isHost: member.isHost
  });
}

export function leaveRoom(state: GameState, action: Extract<GameAction, { type: "LEAVE_ROOM" }>): void {
  const room = state.room;
  if (!room) {
    return;
  }
  const index = room.members.findIndex((member) => member.clientId === action.clientId);
  if (index < 0) {
    return; // idempotent — already gone
  }

  room.members.splice(index, 1);
  appendEvent(state, { type: "ROOM_MEMBER_LEFT", clientId: action.clientId });

  // The host left: hand host to the next remaining member (host stays on),
  // or clear it if the room is now empty.
  if (room.hosted && room.hostClientId === action.clientId) {
    const next = room.members[0] ?? null;
    room.hostClientId = next ? next.clientId : null;
    for (const member of room.members) {
      member.isHost = next ? member.clientId === next.clientId : false;
    }
    if (next) {
      appendEvent(state, {
        type: "ROOM_HOST_CHANGED",
        clientId: next.clientId,
        byClientId: action.clientId
      });
    }
  }
}

export function setRoomHosted(
  state: GameState,
  action: Extract<GameAction, { type: "SET_ROOM_HOSTED" }>
): void {
  const room = ensureRoom(state);
  const member = findMember(room, action.clientId);
  if (!member) {
    throw new Error("Join the room before changing its host settings.");
  }

  if (action.hosted) {
    // Claiming host: allowed when the room is open (any member) or when already
    // the host (a no-op refresh). Never lets a player seize host from another.
    if (room.hosted && room.hostClientId !== action.clientId) {
      throw new Error("Only the host can change the room settings.");
    }
    const wasHosted = room.hosted;
    room.hosted = true;
    room.hostClientId = action.clientId;
    for (const other of room.members) {
      other.isHost = other.clientId === action.clientId;
    }
    if (!wasHosted) {
      appendEvent(state, { type: "ROOM_HOSTED_CHANGED", hosted: true, byClientId: action.clientId });
    }
    appendEvent(state, { type: "ROOM_HOST_CHANGED", clientId: action.clientId, byClientId: action.clientId });
    return;
  }

  // Turning hosting off (back to an open table) is host-only.
  if (!isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can change the room settings.");
  }
  room.hosted = false;
  room.hostClientId = null;
  for (const other of room.members) {
    other.isHost = false;
  }
  appendEvent(state, { type: "ROOM_HOSTED_CHANGED", hosted: false, byClientId: action.clientId });
}

export function assignSeat(state: GameState, action: Extract<GameAction, { type: "ASSIGN_SEAT" }>): void {
  const room = ensureRoom(state);
  if (!room.hosted) {
    throw new Error("Seat assignment is only available in a hosted room.");
  }
  if (!isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can assign seats.");
  }
  const target = findMember(room, action.targetClientId);
  if (!target) {
    throw new Error("That member is not in the room.");
  }
  assertValidSeat(state, action.seat);

  // Bump whoever else holds this seat back to observer (a real seat is single
  // occupancy; observer is not).
  if (action.seat !== "observer") {
    for (const other of room.members) {
      if (other.clientId !== target.clientId && other.seat === action.seat) {
        other.seat = "observer";
        appendEvent(state, {
          type: "ROOM_SEAT_CHANGED",
          clientId: other.clientId,
          seat: "observer",
          byClientId: action.clientId
        });
      }
    }
  }

  if (target.seat !== action.seat) {
    target.seat = action.seat;
    appendEvent(state, {
      type: "ROOM_SEAT_CHANGED",
      clientId: target.clientId,
      seat: action.seat,
      byClientId: action.clientId
    });
  }
}

export function kickMember(state: GameState, action: Extract<GameAction, { type: "KICK_MEMBER" }>): void {
  const room = ensureRoom(state);
  if (!room.hosted) {
    throw new Error("Members can only be removed from a hosted room.");
  }
  if (!isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can remove members.");
  }
  if (action.targetClientId === action.clientId) {
    throw new Error("The host cannot kick themselves — transfer host or leave instead.");
  }
  const index = room.members.findIndex((member) => member.clientId === action.targetClientId);
  if (index < 0) {
    throw new Error("That member is not in the room.");
  }
  room.members.splice(index, 1);
  appendEvent(state, {
    type: "ROOM_MEMBER_KICKED",
    clientId: action.targetClientId,
    byClientId: action.clientId
  });
}

export function transferHost(state: GameState, action: Extract<GameAction, { type: "TRANSFER_HOST" }>): void {
  const room = ensureRoom(state);
  if (!room.hosted) {
    throw new Error("There is no host to transfer in an open room.");
  }
  if (!isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can transfer host.");
  }
  const target = findMember(room, action.targetClientId);
  if (!target) {
    throw new Error("That member is not in the room.");
  }
  room.hostClientId = target.clientId;
  for (const member of room.members) {
    member.isHost = member.clientId === target.clientId;
  }
  appendEvent(state, {
    type: "ROOM_HOST_CHANGED",
    clientId: target.clientId,
    byClientId: action.clientId
  });
}

// ---------------------------------------------------------------------------
// Seat-ownership guard for ordinary game actions
// ---------------------------------------------------------------------------

/**
 * In a HOSTED room, a game action (anything that carries a seat `playerId`) is
 * only accepted from the client whose seat matches that `playerId`. Returns an
 * error message when the actor may not take the action, or null when it is
 * allowed / not applicable.
 *
 * Skipped entirely when the room is open, when no `actorClientId` is supplied
 * (server back-compat / engine tests), and for membership actions (which carry
 * a `clientId`, validate themselves, and are never seat-gated).
 *
 * Trust note: `actorClientId` is the value the transport attached for the
 * sending client; there is no auth binding a socket to a clientId yet (guest
 * play). So this enforces the rule given the claimed identity — it is not a
 * defence against a client that forges another client's id. Authentication is
 * a later milestone (see docs/multiplayer-platform-plan.md).
 */
export function roomActionGuard(
  state: GameState,
  action: GameAction,
  actorClientId: string | undefined
): string | null {
  const room = state.room;
  if (!room || !room.hosted) {
    return null; // open table → no seat enforcement
  }
  if (!actorClientId) {
    return null; // identity not supplied
  }
  if (isRoomMembershipAction(action)) {
    return null; // membership actions self-validate by clientId
  }
  const playerId = actionSeat(action);
  if (!playerId) {
    return null; // not a seat-scoped action
  }
  const member = findMember(room, actorClientId);
  if (!member) {
    return "Join the room before taking a seat's action.";
  }
  if (member.seat !== playerId) {
    return "Seats are locked: you can only act for your own seat.";
  }
  return null;
}

/** The seat a game action acts for, or null for neutral / non-seat actions. */
function actionSeat(action: GameAction): PlayerId | null {
  if (!("playerId" in action)) {
    return null;
  }
  const playerId = (action as { playerId: PlayerId }).playerId;
  if (!playerId || playerId === NEUTRAL_PLAYER_ID) {
    return null;
  }
  return playerId;
}
