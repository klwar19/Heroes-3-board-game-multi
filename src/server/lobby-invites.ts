/**
 * Lobby invites — ephemeral, targeted pop-ups so an Invite from the room panel
 * or lobby "Players online" list reaches the invited player as a modal, not only
 * as a line in the global lobby chat.
 *
 * Same spirit as lobby chat / presence: in-memory ring of pending invites, TTL
 * pruning, nothing stored per account. A pure board with an injectable clock so
 * bounds/TTL are unit-testable; the process singleton and HTTP route wrap it.
 */

import { sanitizeLobbyText } from "./lobby-chat";

export type LobbyInvite = {
  /** Monotonic id within this process lifetime. */
  id: string;
  /** Inviter's stable per-tab client id. */
  fromClientId: string;
  /** Display name at send time. */
  fromName: string;
  /** Invitee's latest client id (the presence entry key's clientId). */
  toClientId: string;
  /**
   * Optional verified account id of the invitee — when set, any of their tabs
   * (keyed by userId on the presence board) can receive the invite.
   */
  toUserId?: string;
  /** Room to join (absent for a plain "want to play?" lobby nudge). */
  roomId?: string;
  /** Room display name at send time. */
  roomName?: string;
  /** Server receive time (ms). */
  at: number;
};

export type SendLobbyInviteInput = {
  fromClientId: unknown;
  fromName: unknown;
  toClientId: unknown;
  toUserId?: unknown;
  roomId?: unknown;
  roomName?: unknown;
};

/** How long an unanswered invite stays pending. */
export const LOBBY_INVITE_TTL_MS = 5 * 60_000;

/** Hard cap on pending invites (bounds memory). */
export const MAX_LOBBY_INVITES = 200;

const MAX_ID_LENGTH = 80;
const MAX_NAME_LENGTH = 24;
const MAX_ROOM_NAME_LENGTH = 40;

export class LobbyInviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LobbyInviteError";
  }
}

export class LobbyInviteBoard {
  private invites: LobbyInvite[] = [];
  private seq = 0;
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Post a new invite. Throws on a missing from/to clientId. Returns the stored
   * invite. Dedupes: a fresh invite from the same sender to the same target for
   * the same room replaces any older still-pending one.
   */
  send(input: SendLobbyInviteInput, now: number = this.now()): LobbyInvite {
    const fromClientId =
      typeof input.fromClientId === "string" ? input.fromClientId.trim().slice(0, MAX_ID_LENGTH) : "";
    const toClientId =
      typeof input.toClientId === "string" ? input.toClientId.trim().slice(0, MAX_ID_LENGTH) : "";
    if (!fromClientId) {
      throw new LobbyInviteError("A sender is required.");
    }
    if (!toClientId) {
      throw new LobbyInviteError("Pick a player to invite.");
    }
    if (fromClientId === toClientId) {
      throw new LobbyInviteError("You cannot invite yourself.");
    }
    const fromName = sanitizeLobbyText(input.fromName, MAX_NAME_LENGTH) || "A player";
    const roomId =
      typeof input.roomId === "string" && input.roomId.trim()
        ? input.roomId.trim().slice(0, MAX_ID_LENGTH)
        : undefined;
    const roomName = roomId
      ? sanitizeLobbyText(input.roomName, MAX_ROOM_NAME_LENGTH) || undefined
      : undefined;
    const toUserId =
      typeof input.toUserId === "string" && input.toUserId.trim()
        ? input.toUserId.trim().slice(0, MAX_ID_LENGTH)
        : undefined;

    this.prune(now);

    // Replace any still-pending invite from this sender to this target for the
    // same room so re-clicks don't stack duplicate modals.
    this.invites = this.invites.filter(
      (invite) =>
        !(
          invite.fromClientId === fromClientId &&
          invite.toClientId === toClientId &&
          (invite.roomId ?? "") === (roomId ?? "")
        )
    );

    this.seq += 1;
    const invite: LobbyInvite = {
      id: `inv-${this.seq}`,
      fromClientId,
      fromName,
      toClientId,
      ...(toUserId ? { toUserId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(roomName ? { roomName } : {}),
      at: now
    };
    this.invites.push(invite);
    if (this.invites.length > MAX_LOBBY_INVITES) {
      this.invites = this.invites.slice(-MAX_LOBBY_INVITES);
    }
    return { ...invite };
  }

  /**
   * Pending invites addressed to this tab (or this verified account). Newest
   * first. Consumes nothing — the client dismisses explicitly after acting.
   */
  listFor(
    clientId: string,
    options: { userId?: string; now?: number } = {}
  ): LobbyInvite[] {
    const now = options.now ?? this.now();
    this.prune(now);
    const userId = options.userId;
    return this.invites
      .filter(
        (invite) =>
          invite.toClientId === clientId ||
          (userId && invite.toUserId && invite.toUserId === userId)
      )
      .slice()
      .reverse()
      .map((invite) => ({ ...invite }));
  }

  /**
   * Drop one invite after Accept / Decline. Only the invitee (by clientId or
   * matching userId) may dismiss. Idempotent.
   */
  dismiss(
    inviteId: string,
    clientId: string,
    options: { userId?: string; now?: number } = {}
  ): boolean {
    const now = options.now ?? this.now();
    this.prune(now);
    const before = this.invites.length;
    this.invites = this.invites.filter((invite) => {
      if (invite.id !== inviteId) {
        return true;
      }
      const owns =
        invite.toClientId === clientId ||
        (options.userId && invite.toUserId && invite.toUserId === options.userId);
      return !owns;
    });
    return this.invites.length < before;
  }

  private prune(now: number): void {
    this.invites = this.invites.filter((invite) => now - invite.at <= LOBBY_INVITE_TTL_MS);
  }
}
