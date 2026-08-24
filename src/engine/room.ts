import { appendSystemChat } from "./chat";
import { controllerOf, isPrivateSinglePlayer } from "./computer/control";
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
  "RECLAIM_HOST",
  "SET_ROOM_NAME",
  "SET_ROOM_PASSWORD",
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

/**
 * The seat-guard rejection a hosted room returns when a GUEST actor's claimed
 * clientId matches a member bound to a verified account. Exported as ONE
 * constant so the client transport can recognise it (see the self-heal
 * reconnect in src/lib/realtime.ts): over a long hosted session the edge's
 * verified-identity resolution can lapse — Cloudflare hibernation wipes the
 * in-memory memoization AND the browser's 10-minute socket ticket has since
 * expired — degrading a signed-in actor to a guest and producing exactly this
 * message. The client answers it by reconnecting to mint a fresh ticket instead
 * of forcing the player to refresh. Keep the string and this constant in
 * lockstep; the guard below is the sole producer.
 */
export const VERIFIED_SEAT_REJECTION_MESSAGE =
  "That seat belongs to a verified account — sign in to act for it.";

/** Longest accepted room name; longer input is trimmed to this. */
export const MAX_ROOM_NAME_LENGTH = 40;

/** Longest accepted room password; longer input is trimmed to this. */
export const MAX_ROOM_PASSWORD_LENGTH = 32;

/**
 * Normalises a raw password the same way on both the set and the check path, so
 * whitespace/length differences never make a correct password fail: trim the
 * ends and cap the length. A result of "" means "no password / clear the lock".
 */
export function normalizeRoomPassword(raw: string | undefined | null): string {
  return (raw ?? "").trim().slice(0, MAX_ROOM_PASSWORD_LENGTH);
}

/**
 * Deterministic, dependency-free hash of a room password (cyrb53 by bryc,
 * public domain — github.com/bryc), rendered as a fixed-width hex string. Runs
 * identically in Node, the browser, and the Cloudflare Workers edge runtime,
 * and synchronously (the reducer is sync, so Web Crypto's async digest is not
 * an option).
 *
 * This is deliberately a NON-cryptographic hash: the room password is a casual
 * join-gate (see `RoomMembershipState.passwordHash`), not a secret against a
 * wire-sniffer, so a fast, salted, collision-resistant-enough mixer is the
 * right tool. Callers MUST pass an already-`normalizeRoomPassword`d value so the
 * stored hash and every future check agree.
 */
export function hashRoomPassword(normalized: string): string {
  // Fixed salt so the on-wire hash of a short password is not a bare, rainbow-
  // table-friendly digest of the raw text.
  const input = `homm3bg:room-password:v1:${normalized}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(16).padStart(14, "0");
}

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

/**
 * Ranked setup is always a closed, one-person-per-seat table. Fill its open
 * lobby seats in join order so every actual player immediately receives the
 * map-preparation controls and participates in the start ready check. Normal
 * hosted rooms keep explicit host/self-service seating, and once every seat is
 * occupied later arrivals remain observers.
 */
function autoSeatRankedSetupObservers(
  state: GameState,
  room: RoomMembershipState,
  byClientId: string
): void {
  const lobby = state.setupLobby;
  if (!room.ranked || !room.hosted || state.phase !== "setup" || !lobby) {
    return;
  }

  for (const member of room.members) {
    if (member.seat !== "observer") {
      continue;
    }
    const occupied = new Set(
      room.members
        .filter((candidate) => candidate.clientId !== member.clientId && candidate.seat !== "observer")
        .map((candidate) => candidate.seat)
    );
    const openSeat = lobby.seats.find((seat) => !occupied.has(seat.playerId))?.playerId;
    if (!openSeat) {
      return;
    }
    member.seat = openSeat;
    appendEvent(state, {
      type: "ROOM_SEAT_CHANGED",
      clientId: member.clientId,
      seat: openSeat,
      byClientId
    });
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

/**
 * Heal a member that JOINED as a guest but is actually a VERIFIED account, so
 * the roster (and every seat check) stops calling a real player "guest — name".
 *
 * Why this is needed: a member's `userId` is stamped only at JOIN time, from the
 * identity the server verified for that JOIN. If verification was not available
 * at that instant — the client connected before its session token could be
 * minted, a transient verify-token failure on the edge, or a member that
 * predates verified sessions — the member is created as a guest, and because the
 * client deliberately never re-sends JOIN_ROOM (so a kicked player can't
 * auto-rejoin) it would stay a guest forever. Every LATER action the same player
 * takes DOES carry their server-verified `userId`, so we upgrade the member the
 * first time we see one.
 *
 * Strictly safe — it can only ever ADD the server-verified id to a member that
 * had none, never rebind or overwrite:
 *  - `userId` is the SERVER-verified account id (never the forgeable action
 *    body), so a guest cannot claim someone else's account this way;
 *  - it upgrades ONLY the guest member holding the actor's own claimed
 *    `clientId` (the same match `fallbackGuestMember` already trusts for seat
 *    authority), and never a member already bound to any account;
 *  - it refuses when another member already holds this `userId` (one account =
 *    one member), so it can't create a duplicate seat.
 *
 * Returns true when it changed a member, so the caller re-reports the roster.
 */
export function healVerifiedMembership(state: GameState, actor: VerifiedActor): boolean {
  const room = state.room;
  const { clientId, userId } = actor;
  if (!room || !userId || !clientId) {
    return false;
  }
  // Already bound to this account somewhere → nothing to heal (and never bind a
  // second member to the same account).
  if (findMemberByUserId(room, userId)) {
    return false;
  }
  const member = findMember(room, clientId);
  if (!member || member.userId) {
    return false;
  }
  member.userId = userId;
  // Backfill the frozen match-report seat snapshot when this seat was stamped
  // as a guest at adventure start (JOIN before the socket ticket resolved).
  // Without this, a later heal would leave matchSeats.userId empty and a
  // leaver/deserter path could drop the account from the ladder entirely —
  // live members still record via their seat, but the quit-proof snapshot
  // would not. Only fill a missing userId; never rebind a different account.
  if (member.seat !== "observer" && room.matchSeats?.[member.seat] && !room.matchSeats[member.seat].userId) {
    room.matchSeats[member.seat] = {
      ...room.matchSeats[member.seat],
      userId
    };
  }
  return true;
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
  const privateSinglePlayer = state.sessionMode === "single-player" || room.visibility === "private";
  if (privateSinglePlayer) {
    if ((room.ownerUserId && userId !== room.ownerUserId) ||
        (!room.ownerUserId && room.ownerClientId && action.clientId !== room.ownerClientId)) {
      throw new Error("This private single-player game belongs to another player.");
    }
    if (!room.ownerUserId && !room.ownerClientId) {
      if (userId) room.ownerUserId = userId;
      room.ownerClientId = action.clientId;
    }
    room.hosted = true;
    room.visibility = "private";
    room.ranked = false;
    room.hostClientId = action.clientId;
  }

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
      isHost: existingByUser.isHost,
      verified: true,
      newMember: false
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
      isHost: existing.isHost,
      verified: Boolean(existing.userId),
      newMember: false
    });
    return;
  }

  // Password gate for a NEW member: a locked room demands the correct password
  // from anyone who is not the sticky host (who owns the room and set the lock)
  // or an existing member reconnecting (handled by the early returns above). The
  // check normalises the attempt the same way the password was stored so
  // whitespace never breaks it.
  if (room.passwordHash && room.hostClientId !== action.clientId) {
    const attempt = normalizeRoomPassword(action.password);
    if (attempt.length === 0 || hashRoomPassword(attempt) !== room.passwordHash) {
      throw new Error("Incorrect room password.");
    }
  }

  const member: RoomMember = {
    clientId: action.clientId,
    name,
    seat: privateSinglePlayer ? "p1" : "observer",
    isHost: room.hosted && room.hostClientId === action.clientId,
    ...(userId ? { userId } : {})
  };
  room.members.push(member);
  appendEvent(state, {
    type: "ROOM_MEMBER_JOINED",
    clientId: member.clientId,
    name: member.name,
    seat: member.seat,
    isHost: member.isHost,
    verified: Boolean(userId),
    newMember: true
  });
  autoSeatRankedSetupObservers(state, room, action.clientId);
  // Announce a genuinely NEW arrival in the room chat too (forced, so it shows
  // even on a table where nobody has chatted yet): everyone should know who
  // walked in — by registered nickname, or honestly labeled a guest. Reconnects
  // and cross-tab rebinds above stay quiet, so refreshes never spam the feed.
  appendSystemChat(state, userId ? `${name} joined the room.` : `guest — ${name} joined the room.`, {
    force: true
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
    // Claiming host: allowed when the room is open (any member), when no host
    // is assigned yet (hosted flag without hostClientId), or when already the
    // host (a no-op refresh). Never lets a player seize host from another.
    if (room.hosted && room.hostClientId && room.hostClientId !== action.clientId) {
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
    autoSeatRankedSetupObservers(state, room, action.clientId);
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

  // Single-player: the computer seats are never sit-able. A member seated onto
  // p2+ would break the one-human invariant — both the member AND the computer
  // runner would then act for the same seat. Only p1 (or observer) is legal.
  if (state.sessionMode === "single-player" && action.seat !== "observer" && action.seat !== "p1") {
    throw new Error("Computer seats cannot be taken in a single-player game.");
  }

  // GENERAL rule (co-op step 1): a COMPUTER-controlled seat is never sit-able in
  // ANY session mode — a multiplayer lobby may now hold computer seats too
  // (SET_COMPUTER_OPPONENTS). Both the member and the computer runner would
  // otherwise act for the same seat. Applies to the host as well as to a
  // self-claim; the single-player check above stays as a belt-and-braces guard.
  if (action.seat !== "observer" && controllerOf(state, action.seat).kind === "computer") {
    throw new Error("A computer seat cannot be taken by a player.");
  }

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

/**
 * Recover host on a hosted room whose host is GONE. A member may claim host for
 * THEMSELVES only while the current host holds no live connection — the exact
 * "host absent → a member may act" rule the destructive reset/close ops already
 * use (see authorizeHostedWipe in game-room-store.ts / hostAuthorizes on the
 * edge). This is what unsticks the common guest case: a host whose per-tab
 * clientId died with their browser rejoins as a fresh member and would
 * otherwise be locked out of deleting or re-seating their OWN table, because a
 * guest carries no stable id to rebind by.
 *
 * `liveClientIds` is the set of clientIds currently holding a live stream on
 * this room, injected by the server transport (both backends track it for the
 * wipe rule). Undefined only in isolated engine tests / non-networked paths;
 * treated as "the host is not provably connected", so recovery is permitted —
 * the networked path always supplies it and thus always enforces the guard.
 */
export function reclaimHost(
  state: GameState,
  action: Extract<GameAction, { type: "RECLAIM_HOST" }>,
  actor: VerifiedActor = {},
  liveClientIds?: readonly string[]
): void {
  const room = ensureRoom(state);
  if (!room.hosted) {
    throw new Error("There is no host to reclaim in an open room.");
  }
  // Resolve the acting member: a verified account binds by its id; a guest by
  // the claimed clientId. The returning host is normally a guest who just
  // rejoined, so the clientId path is the common one.
  const member = actor.userId
    ? (findMemberByUserId(room, actor.userId) ?? fallbackGuestMember(room, action.clientId))
    : findMember(room, action.clientId);
  if (!member) {
    throw new Error("Join the room before reclaiming host.");
  }
  // Already the host → make sure the flags are consistent and do nothing else.
  if (room.hostClientId === member.clientId) {
    for (const other of room.members) {
      other.isHost = other.clientId === member.clientId;
    }
    return;
  }
  // The living host keeps their room: recovery is only for an ABSENT host.
  const hostConnected = Boolean(
    room.hostClientId && liveClientIds && liveClientIds.includes(room.hostClientId)
  );
  if (hostConnected) {
    throw new Error("Only the host can manage this room while the host is connected.");
  }
  room.hostClientId = member.clientId;
  for (const other of room.members) {
    other.isHost = other.clientId === member.clientId;
  }
  appendEvent(state, {
    type: "ROOM_HOST_CHANGED",
    clientId: member.clientId,
    byClientId: member.clientId
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

export function setRoomPassword(
  state: GameState,
  action: Extract<GameAction, { type: "SET_ROOM_PASSWORD" }>
): void {
  const room = ensureRoom(state);
  const member = findMember(room, action.clientId);
  if (!member) {
    throw new Error("Join the room before setting a password.");
  }
  // Same authority as naming: any member on an open table; host-only when hosted.
  if (room.hosted && !isEffectiveHost(room, action.clientId)) {
    throw new Error("Only the host can set a room password.");
  }

  const password = normalizeRoomPassword(action.password);
  // Blank clears the lock; otherwise store ONLY the hash (never the plaintext).
  if (password.length === 0) {
    delete room.passwordHash;
  } else {
    room.passwordHash = hashRoomPassword(password);
  }
  appendEvent(state, {
    type: "ROOM_PASSWORD_CHANGED",
    hasPassword: Boolean(room.passwordHash),
    byClientId: action.clientId
  });
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
  if (ranked) {
    autoSeatRankedSetupObservers(state, room, action.clientId);
  }
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
  if (!room) {
    return null; // no membership record → no enforcement
  }
  const { clientId, userId } = actor;
  if (!clientId && !userId) {
    return null; // identity not supplied
  }
  if (isRoomMembershipAction(action)) {
    return null; // membership actions self-validate by clientId
  }

  // Password-protected room (open OR hosted): only members — who supplied the
  // password when they joined — may take game actions. This is what makes a
  // password meaningful on an OPEN table too, where seats are otherwise free: a
  // client that reached the room by its id but never passed the password (so
  // never became a member) can spectate the broadcast, but cannot play. A
  // verified account is matched by its userId, a guest by the claimed clientId.
  if (room.passwordHash) {
    const member =
      (userId ? findMemberByUserId(room, userId) : null) ?? (clientId ? findMember(room, clientId) : null);
    if (!member) {
      return "This room is password-protected — join with the password to play.";
    }
  }

  if (!room.hosted) {
    return null; // open table → members act as any seat
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
  // PRIVATE single-player exemption (defense in depth for the hibernation
  // ticket-expiry bug). An `sp-` room is a 128-bit-unguessable, never-listed,
  // one-human table that only its owner could ever join (joinRoom's owner gate)
  // and is never ranked/MMR. Its lone human member carries a `userId` when
  // signed in, so when Cloudflare hibernation wipes the edge's in-memory token
  // cache AND the 10-minute socket ticket has since expired, this actor
  // degrades to a guest — and would otherwise be locked out of its OWN private
  // game (every action rejected here) until a page refresh minted a fresh
  // ticket. The claimed clientId still matches the seat's member and nobody
  // else can be in the room, so let it act; the seat check below still applies.
  // Hosted MULTIPLAYER rooms are NOT private single-player (checked via the
  // sessionMode / private-visibility markers), so their behaviour is unchanged
  // — a guest can never reach a verified account's seat there.
  if (member.userId && !isPrivateSinglePlayer(state)) {
    return VERIFIED_SEAT_REJECTION_MESSAGE;
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
