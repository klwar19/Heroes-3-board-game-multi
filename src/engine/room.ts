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
  "TRANSFER_HOST",
  "SET_ROOM_NAME",
  "SET_ROOM_REQUIRE_AUTH",
  "SET_ROOM_RANKED"
]);

export function isRoomMembershipAction(action: GameAction): boolean {
  return ROOM_MEMBERSHIP_ACTION_TYPES.has(action.type);
}

/**
 * The identity the transport authenticated for the client submitting an action
 * (Phase 2 — verified-identity seats). `clientId` is the value the client
 * *claims* (a stable per-tab id); `userId` is the account id the SERVER verified
 * from the session and is authoritative. Guest play carries only a `clientId`;
 * everything stays isomorphic and unit-testable without any network — a test
 * passes `{ clientId }` (guest) or `{ userId }` (signed-in) explicitly.
 */
export type VerifiedActor = { clientId?: string; userId?: string };

/** Longest accepted room name; longer input is trimmed to this. */
export const MAX_ROOM_NAME_LENGTH = 40;

/** A short, stable fallback label when a room has no name of its own. */
export function defaultRoomName(roomId: string): string {
  const trimmed = roomId.trim();
  return trimmed.length > 0 ? `Room ${trimmed}` : "Room";
}

/** The name to show for a room: its chosen name, else the id-derived default. */
export function roomDisplayName(state: GameState, roomId: string): string {
  const chosen = state.room?.name?.trim();
  return chosen && chosen.length > 0 ? chosen : defaultRoomName(roomId);
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

/** The member bound to a VERIFIED account id, or null. One member per userId. */
function findMemberByUserId(room: RoomMembershipState, userId: string): RoomMember | null {
  return room.members.find((member) => member.userId === userId) ?? null;
}

/**
 * Fallback resolution for a VERIFIED actor whose account id matches no member:
 * the GUEST member holding their claimed clientId, if any. This heals the
 * "joined as a guest, acts as a verified account" mismatch — the JOIN was
 * processed before the session could be verified (a transient verify-token
 * failure on the edge, or a room whose members predate the edge being able to
 * verify sessions at all) — which otherwise refuses EVERY action ("Join the
 * room before taking a seat's action") and every redacted frame (the player
 * sees the observer view of their own game). It never resolves a member bound
 * to a DIFFERENT verified account, so one account can still never act or see
 * for another; and matching a guest member by claimed clientId grants nothing a
 * plain guest connection could not already claim.
 */
function fallbackGuestMember(room: RoomMembershipState, clientId: string | undefined): RoomMember | null {
  if (!clientId) {
    return null;
  }
  const member = findMember(room, clientId);
  return member && !member.userId ? member : null;
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

/**
 * The seat a connection should be shown, resolving VERIFIED identity first
 * (Phase 2 — per-connection redaction). A signed-in viewer is bound to the
 * member holding their account id; a guest falls back to the claimed clientId;
 * anyone without a matching member is a spectator ("observer"). Used by the
 * transports to redact each frame to the recipient's own seat.
 */
export function seatForViewer(state: GameState, actor: VerifiedActor): RoomSeat {
  const room = state.room;
  if (!room) {
    return "observer";
  }
  const { clientId, userId } = actor;
  const member = userId
    ? (findMemberByUserId(room, userId) ?? fallbackGuestMember(room, clientId))
    : clientId
      ? findMember(room, clientId)
      : null;
  return member?.seat ?? "observer";
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function joinRoom(
  state: GameState,
  action: Extract<GameAction, { type: "JOIN_ROOM" }>,
  actor: VerifiedActor = {}
): void {
  if (!action.clientId) {
    throw new Error("A client id is required to join a room.");
  }
  const room = ensureRoom(state);
  const name = action.name?.trim() || "Player";
  // The account id the SERVER verified (undefined for a guest). Never read from
  // the action body, which a client could forge.
  const userId = actor.userId;

  // Verified-account gate (Phase 2): a hosted room the host locked to accounts
  // refuses guests. Applied to genuinely new joins only — an existing member
  // (re-connect) is grandfathered so a mid-game toggle can't strand a seat.
  if (
    room.hosted &&
    room.requireAuth &&
    !userId &&
    !findMember(room, action.clientId)
  ) {
    throw new Error("This room requires a verified account to join.");
  }

  // One account = one seat: a signed-in player already in the room re-binds to
  // their existing member (a second tab is the SAME seat holder), so a single
  // account can never occupy two seats. The latest tab becomes the live client.
  const existingByUser = userId ? findMemberByUserId(room, userId) : null;
  if (existingByUser) {
    const wasHost = room.hosted && room.hostClientId === existingByUser.clientId;
    existingByUser.name = name;
    existingByUser.userId = userId;
    // Move the host pointer to the new tab BEFORE rebinding the clientId, so the
    // host role follows the account across tabs rather than being lost.
    if (wasHost) {
      room.hostClientId = action.clientId;
    }
    existingByUser.clientId = action.clientId;
    existingByUser.isHost = room.hosted && room.hostClientId === action.clientId;
    appendEvent(state, {
      type: "ROOM_MEMBER_JOINED",
      clientId: existingByUser.clientId,
      name: existingByUser.name,
      seat: existingByUser.seat,
      isHost: existingByUser.isHost
    });
    return;
  }

  const existing = findMember(room, action.clientId);
  if (existing) {
    // Re-join (reconnect / rename): keep the seat and host, refresh the name.
    existing.name = name;
    // A guest member that has just signed in is upgraded to a verified member,
    // so the seat guard now binds it by the authoritative account id.
    if (userId) {
      existing.userId = userId;
    }
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
    isHost: room.hosted && room.hostClientId === action.clientId,
    ...(userId ? { userId } : {})
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

/**
 * Presence cleanup for a client whose LIVE connection dropped — a tab close, a
 * navigate back to the lobby, or a socket loss. Both transports call this from
 * their connection-close hook (the SSE stream `abort`/`cancel` on the built-in
 * backend, `onClose` on the PartyKit edge). It is NOT a player action and is
 * never seat-gated.
 *
 * It removes ONLY an "ephemeral" member: one that is not the host and holds no
 * real seat (`seat === "observer"`). That deliberately protects the two roles
 * whose loss on a transient disconnect would be a real regression:
 *   - a SEATED player in a hosted game keeps their seat (and its action
 *     authority) across a reconnect, so a network blip can never unseat them or
 *     hand their turn/choices to someone else; and
 *   - the host role is never dropped on a blip.
 *
 * Open-table members are always observers (open tables never store a seat on a
 * member — the seat there is a local, per-client choice), so they ARE reaped.
 * That is what stops ONE computer from being counted as many people after it
 * joins, leaves and rejoins: each real disconnect now removes the stale member
 * instead of leaving a ghost behind forever.
 *
 * Returns true only when it actually removed someone, so the caller re-broadcasts
 * (and re-reports the room to the lobby) exactly when the member list changed.
 */
export function dropDisconnectedMember(state: GameState, clientId: string): boolean {
  const room = state.room;
  if (!room || !clientId) {
    return false;
  }
  const index = room.members.findIndex((member) => member.clientId === clientId);
  if (index < 0) {
    return false;
  }
  const member = room.members[index];
  // Keep the host and any seated player; only reap spectators / open-table
  // members, whose loss changes nothing but a cosmetic head count.
  if (member.isHost || member.seat !== "observer") {
    return false;
  }
  room.members.splice(index, 1);
  appendEvent(state, { type: "ROOM_MEMBER_LEFT", clientId });
  return true;
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
  const target = findMember(room, action.targetClientId);
  if (!target) {
    throw new Error("That member is not in the room.");
  }
  assertValidSeat(state, action.seat);

  // Authority. The host may seat ANY member into ANY seat (bumping whoever holds
  // it). A non-host may only SELF-SERVE: claim an OPEN seat, or step down to
  // observer, for their OWN membership — they can never move another player, nor
  // take a seat someone else already holds (that stays the host's call). This is
  // the standard lobby rule, so a player in a hosted/closed room can pick a role
  // themselves instead of being stuck as an observer waiting on the host.
  if (!isEffectiveHost(room, action.clientId)) {
    if (action.targetClientId !== action.clientId) {
      throw new Error("Only the host can seat other players.");
    }
    if (action.seat !== "observer") {
      const occupant = room.members.find(
        (member) => member.clientId !== action.clientId && member.seat === action.seat
      );
      if (occupant) {
        throw new Error("That seat is taken — ask the host to move you into it.");
      }
    }
  }

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

export function setRoomName(state: GameState, action: Extract<GameAction, { type: "SET_ROOM_NAME" }>): void {
  const room = ensureRoom(state);
  const member = findMember(room, action.clientId);
  if (!member) {
    throw new Error("Join the room before naming it.");
  }
  // Hosted rooms are host-controlled (like seats); open tables let any member
  // set the name (the original free, single-browser test flow).
  if (room.hosted && !isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can rename a hosted room.");
  }

  const name = action.name.trim().slice(0, MAX_ROOM_NAME_LENGTH);
  // A blank name clears it back to the id-derived default rather than storing "".
  if (name.length === 0) {
    delete room.name;
  } else {
    room.name = name;
  }
  appendEvent(state, { type: "ROOM_NAMED", name, byClientId: action.clientId });
}

export function setRoomRequireAuth(
  state: GameState,
  action: Extract<GameAction, { type: "SET_ROOM_REQUIRE_AUTH" }>
): void {
  const room = ensureRoom(state);
  // Only a hosted room has a host to enforce it and seats to protect; on an open
  // table there is no seat lock, so requiring accounts would be meaningless.
  if (!room.hosted) {
    throw new Error("Only a hosted room can require a verified account.");
  }
  if (!isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can change the room settings.");
  }
  const requireAuth = Boolean(action.requireAuth);
  // Store the flag only when on, so a room that never used it stays byte-for-byte
  // as before (and legacy snapshots keep matching).
  if (requireAuth) {
    room.requireAuth = true;
  } else {
    delete room.requireAuth;
  }
  appendEvent(state, { type: "ROOM_REQUIRE_AUTH_CHANGED", requireAuth, byClientId: action.clientId });
}

export function setRoomRanked(state: GameState, action: Extract<GameAction, { type: "SET_ROOM_RANKED" }>): void {
  const room = ensureRoom(state);
  const member = findMember(room, action.clientId);
  if (!member) {
    throw new Error("Join the room before changing its match type.");
  }
  // Host-controlled on a hosted room (like the name); any member on an open
  // table. Only meaningful before the game starts — locked once the map is
  // built, so nobody can flip Ranked ↔ Normal to dodge a loss mid-game.
  if (room.hosted && !isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can change the match type.");
  }
  if (!(state.phase === "setup" && Boolean(state.setupLobby))) {
    throw new Error("The match type can only be set before the adventure starts.");
  }
  const ranked = Boolean(action.ranked);
  room.ranked = ranked;
  appendEvent(state, { type: "ROOM_RANKED_CHANGED", ranked, byClientId: action.clientId });
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
 * Skipped entirely when the room is open, when NO identity is supplied
 * (server back-compat / engine tests), and for membership actions (which carry
 * a `clientId`, validate themselves, and are never seat-gated).
 *
 * Trust model (Phase 2 — verified-identity seats):
 *  - When the transport supplies a VERIFIED `userId` (the client authenticated a
 *    session the server checked), the actor is bound to the member carrying that
 *    `userId` and NOTHING else — a forged `actorClientId` is ignored outright,
 *    so it can no longer grant a seat. This closes the documented trust boundary.
 *  - A GUEST (no `userId`) is still matched by the claimed `clientId`, exactly as
 *    before: on an unauthenticated table the engine enforces the rule *given* the
 *    claimed identity (it is not a defence against one guest forging another's
 *    id — guest tables remain the casual/testing mode).
 */
export function roomActionGuard(
  state: GameState,
  action: GameAction,
  actor: VerifiedActor
): string | null {
  const room = state.room;
  if (!room || !room.hosted) {
    return null; // open table → no seat enforcement
  }
  const { clientId, userId } = actor;
  if (!clientId && !userId) {
    return null; // identity not supplied
  }
  if (isRoomMembershipAction(action)) {
    return null; // membership actions self-validate by clientId
  }
  const playerId = actionSeat(action);
  if (!playerId) {
    return null; // not a seat-scoped action
  }

  // Verified identity is authoritative: a signed-in actor is bound to the
  // member holding their account id, so a spoofed clientId cannot reach another
  // VERIFIED account's seat. When no member carries the account id, fall back
  // to the GUEST member holding the claimed clientId (see fallbackGuestMember):
  // a join processed before the session could be verified must not lock the
  // player out of their own seat for the rest of the game.
  if (userId) {
    const member = findMemberByUserId(room, userId) ?? fallbackGuestMember(room, clientId);
    if (!member) {
      return "Join the room before taking a seat's action.";
    }
    if (member.seat !== playerId) {
      return "Seats are locked: you can only act for your own seat.";
    }
    return null;
  }

  // Guest actor (no verified session): matched by the claimed clientId, as
  // before. A seat held by a VERIFIED account is unreachable this way even to a
  // guest who learned its clientId — closing the "forge actorClientId to steal a
  // seat" hole. Guest-only tables (no member carries a userId) are unaffected.
  const member = clientId ? findMember(room, clientId) : null;
  if (!member) {
    return "Join the room before taking a seat's action.";
  }
  if (member.userId) {
    return "That seat belongs to a verified account — sign in to act for it.";
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
