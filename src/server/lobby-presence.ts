/**
 * Lobby presence — the ephemeral, GLOBAL "who is online right now" board for the
 * multiplayer front door. It is the presence sibling of the lobby chat
 * (src/server/lobby-chat.ts): same "temporary, bounded, nothing stored per
 * account" spirit and the same same-origin-Next.js REST model, so it works
 * whether rooms run on the built-in store or the PartyKit edge (both share this
 * app origin). Clients send a lightweight heartbeat every few seconds; an entry
 * that stops beating is pruned after a short TTL, so the list self-heals when a
 * tab closes without any explicit "leave".
 *
 * This module is the pure, framework-free board — a class with an injectable
 * clock so its TTL / dedup / bound rules are unit-tested deterministically (the
 * same testability bar as LobbyChatBoard / AccountStore). The process-wide
 * singleton and the HTTP route wrap it (see lobby-presence-instance.ts /
 * api/lobby-presence).
 *
 * Trust: whether an entry is a VERIFIED account is decided by the ROUTE from the
 * same-origin session cookie (never the client-sent body), exactly like the room
 * roster's guest flag — so the online list can't be spoofed into showing a guest
 * as a real player, and it stays consistent with the fix that stopped the roster
 * mislabelling verified accounts.
 */

import { sanitizeLobbyText } from "./lobby-chat";

/** What a player is doing in their room, for the online list / lobby roster. */
export type PresenceRoomStatus = "setup" | "playing";

/** One online player as shown in the lobby "Players online" panel. */
export type PresenceEntry = {
  /** The player's latest stable per-tab client id (React key + "you" styling). */
  clientId: string;
  /** Display name (the account nickname when signed in). */
  name: string;
  /** True when the SERVER verified a signed-in account for this heartbeat. */
  verified: boolean;
  /** The room they are in right now, if any (absent ⇒ idling in the lobby). */
  roomId?: string;
  /** That room's display name, if known. */
  roomName?: string;
  /**
   * In-room activity: "setup" = still in the lobby/seating screen, "playing" =
   * the game has started. Absent when idling in the multiplayer browser.
   */
  roomStatus?: PresenceRoomStatus;
};

/** What a heartbeat carries; `verified`/`userId` are supplied by the ROUTE. */
export type PresenceHeartbeat = {
  clientId: unknown;
  name: unknown;
  roomId?: unknown;
  roomName?: unknown;
  roomStatus?: unknown;
  /** Server-verified account id (from the cookie). Undefined for a guest. */
  userId?: string;
};

/** An entry stops counting as online this long after its last heartbeat. */
export const PRESENCE_TTL_MS = 30_000;

/** Hard cap on tracked entries (bounds memory against clientId spam). */
export const MAX_PRESENCE_ENTRIES = 1000;

const MAX_PRESENCE_NAME_LENGTH = 24;
const MAX_PRESENCE_ROOM_NAME_LENGTH = 40;
const MAX_ID_LENGTH = 80;

type StoredEntry = PresenceEntry & { userId?: string; at: number };

export class LobbyPresenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LobbyPresenceError";
  }
}

export class LobbyPresenceBoard {
  /** Keyed by `userId || clientId` so a signed-in player's tabs collapse to one. */
  private readonly entries = new Map<string, StoredEntry>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Record (upsert) one player's heartbeat. Dedupes a verified account's many
   * tabs to ONE entry (keyed by its userId), a guest by their clientId. Throws
   * on a missing/oversized clientId. Returns the stored public entry.
   */
  heartbeat(input: PresenceHeartbeat, now: number = this.now()): PresenceEntry {
    const clientId = typeof input.clientId === "string" ? input.clientId.trim().slice(0, MAX_ID_LENGTH) : "";
    if (!clientId) {
      throw new LobbyPresenceError("A client id is required.");
    }
    const userId = typeof input.userId === "string" && input.userId ? input.userId.slice(0, MAX_ID_LENGTH) : undefined;
    const name = sanitizeLobbyText(input.name, MAX_PRESENCE_NAME_LENGTH) || "Player";
    const roomId = typeof input.roomId === "string" && input.roomId ? input.roomId.slice(0, MAX_ID_LENGTH) : undefined;
    const roomName = roomId
      ? sanitizeLobbyText(input.roomName, MAX_PRESENCE_ROOM_NAME_LENGTH) || undefined
      : undefined;
    const roomStatus: PresenceRoomStatus | undefined =
      roomId && (input.roomStatus === "setup" || input.roomStatus === "playing")
        ? input.roomStatus
        : undefined;

    this.pruneStale(now);

    const key = userId ?? clientId;
    // A guest whose tab just signed in (or vice-versa) leaves a stale entry under
    // the old key; drop it so the same person never shows twice.
    if (userId) {
      this.entries.delete(clientId);
    }

    const entry: StoredEntry = {
      clientId,
      name,
      verified: Boolean(userId),
      ...(userId ? { userId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(roomName ? { roomName } : {}),
      ...(roomStatus ? { roomStatus } : {}),
      at: now
    };
    this.entries.set(key, entry);

    // Bound memory: past the cap, evict the least-recently-seen entries.
    if (this.entries.size > MAX_PRESENCE_ENTRIES) {
      const sorted = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [staleKey] of sorted.slice(0, this.entries.size - MAX_PRESENCE_ENTRIES)) {
        this.entries.delete(staleKey);
      }
    }

    return this.publicOf(entry);
  }

  /**
   * Explicitly drop a player (a clean "left the lobby" / tab close). Idempotent.
   * Matches by clientId OR userId so either identifier removes the right entry.
   */
  remove(clientId: string | undefined, userId?: string): void {
    if (userId) {
      this.entries.delete(userId);
    }
    if (!clientId) {
      return;
    }
    this.entries.delete(clientId);
    // A verified entry is keyed by userId, so also sweep any entry whose latest
    // clientId matches (the caller may not know the userId).
    for (const [key, entry] of this.entries) {
      if (entry.clientId === clientId) {
        this.entries.delete(key);
      }
    }
  }

  /** The currently-online players (stale entries pruned), verified first. */
  list(now: number = this.now()): PresenceEntry[] {
    this.pruneStale(now);
    return [...this.entries.values()]
      .sort((a, b) => {
        // Verified accounts first, then in-a-room before idle, then by name.
        if (a.verified !== b.verified) {
          return a.verified ? -1 : 1;
        }
        const aRoom = a.roomId ? 0 : 1;
        const bRoom = b.roomId ? 0 : 1;
        if (aRoom !== bRoom) {
          return aRoom - bRoom;
        }
        return a.name.localeCompare(b.name);
      })
      .map((entry) => this.publicOf(entry));
  }

  /** How many players are online right now (for a compact count badge). */
  count(now: number = this.now()): number {
    this.pruneStale(now);
    return this.entries.size;
  }

  private pruneStale(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.at > PRESENCE_TTL_MS) {
        this.entries.delete(key);
      }
    }
  }

  /** Strip the private fields (userId, last-beat time) from a stored entry. */
  private publicOf(entry: StoredEntry): PresenceEntry {
    return {
      clientId: entry.clientId,
      name: entry.name,
      verified: entry.verified,
      ...(entry.roomId ? { roomId: entry.roomId } : {}),
      ...(entry.roomName ? { roomName: entry.roomName } : {}),
      ...(entry.roomStatus ? { roomStatus: entry.roomStatus } : {})
    };
  }
}
