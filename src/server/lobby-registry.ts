import { roomDisplayName, type GameMode, type GameState, type RoomMembershipState } from "@/engine";

/**
 * Pure, isomorphic lobby-directory logic — the single source of truth for how a
 * room is summarised into a directory row, who may close it, and when an empty
 * room has gone stale. It has NO node / server-only / DOM imports (only the
 * isomorphic engine), so all three backends share the exact same rules:
 *
 *  - the PartyKit lobby Durable Object (`party/lobby.ts`) holds a `LobbyRegistry`
 *    and answers the edge room list,
 *  - the PartyKit room party (`party/index.ts`) derives the record it reports,
 *  - the built-in Node room store (`game-room-store.ts`) builds its directory
 *    from the same helpers,
 *  - the browser client (`src/lib/realtime.ts`) imports the shared id + type.
 *
 * Because both transports derive the directory the same way, the lobby looks and
 * behaves identically whether the app runs on the built-in store or on the edge.
 */

/**
 * Empty rooms idle past this are pruned from the directory (store + edge).
 * One day of no members + no directory activity → gone from multiplayer lobby.
 */
export const STALE_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The fixed Durable Object id of the single lobby/registry instance. Game rooms
 * live in the `main` party (`/parties/main/<roomId>`); the lobby is one object
 * in the `lobby` party (`/parties/lobby/directory`), so this id never collides
 * with a user's room id.
 */
export const LOBBY_SINGLETON_ID = "directory";

/**
 * Cap on the member roster carried per directory row: enough for any real table
 * (games are 2-4 players plus a few observers) while keeping the directory
 * payload bounded however many clients pile into one room.
 */
export const MAX_DIRECTORY_MEMBERS = 12;

/**
 * How many public lobby rooms ONE account may have at once. Creating/holding
 * more auto-deletes the surplus (see `surplusRoomIds`): the lobby was getting
 * flooded with rooms, so a signed-in player is capped at this many. The cap
 * binds only to VERIFIED accounts (a room's owner userId) — a guest has no
 * stable account identity (its per-tab clientId resets), so guest / not-yet-
 * joined rooms are never counted or evicted; they age out via the stale TTL.
 * Single-player and private rooms never enter the directory, so they never
 * count against this.
 */
export const MAX_ROOMS_PER_ACCOUNT = 3;

/**
 * One member of a room as shown in the lobby directory — who is in which room,
 * marked host / seated, and whether they are a verified account or a guest
 * (guests render as "guest — name", so nobody is mistaken for a registered
 * player).
 */
export type RoomDirectoryMember = {
  name: string;
  host: boolean;
  /** True when the member is NOT bound to a verified account. */
  guest: boolean;
  /** True when they hold a real seat (not an observer). */
  seated: boolean;
};

/**
 * One row of the lobby's room directory, as shown to a particular viewer: enough
 * to tell rooms apart and decide whether to join — and whether THIS viewer may
 * close it — without connecting to each room.
 */
export type RoomDirectoryEntry = {
  roomId: string;
  name: string;
  /** Which kind of table this is: an adventure game or a combat "battle test". */
  mode: GameMode;
  /** Engine phase ("setup", "playing", "combat", …). */
  phase: string;
  /** False while the room is still a fresh setup lobby (nothing started yet). */
  inProgress: boolean;
  memberCount: number;
  seatedCount: number;
  hosted: boolean;
  hostName: string | null;
  /**
   * Who is in the room (host first, then seated players, then observers),
   * capped at MAX_DIRECTORY_MEMBERS. Absent only on records persisted before
   * the field existed — treat as empty.
   */
  members?: RoomDirectoryMember[];
  /** Match type shown in the directory: true = Ranked (counts MMR), false = Normal. */
  ranked: boolean;
  /** Whether the room is password-protected (a boolean only — never the hash). */
  locked?: boolean;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Whether the viewer this entry was built for may close the room. */
  canClose: boolean;
};

/**
 * The viewer-independent record a room reports to the lobby and the registry
 * stores. It carries `hostClientId` + `memberClientIds` (which a directory entry
 * deliberately omits) so the lobby can compute `canClose` per viewer at list
 * time, exactly like the built-in store does from the full game state.
 */
export type LobbyRoomRecord = {
  roomId: string;
  name: string;
  /** Which kind of table this is: an adventure game or a combat "battle test". */
  mode: GameMode;
  phase: string;
  inProgress: boolean;
  memberCount: number;
  seatedCount: number;
  hosted: boolean;
  hostName: string | null;
  hostClientId: string | null;
  memberClientIds: string[];
  /** The visible member roster (see RoomDirectoryMember); absent on legacy records. */
  members?: RoomDirectoryMember[];
  /** Match type: true = Ranked (counts MMR), false = Normal (casual). */
  ranked: boolean;
  /** Whether the room is password-protected (a boolean only — never the hash). */
  locked?: boolean;
  createdByName: string | null;
  /**
   * The VERIFIED account id that owns this room (its host, else its first
   * member) — the key the per-account room cap counts by. Null for a room with
   * no signed-in owner (a guest table, or one nobody has joined yet), which the
   * cap deliberately never counts. Never a guessable/forgeable value: it comes
   * from the server-stamped member `userId`.
   */
  ownerUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  visibility?: "public" | "private";
  sessionMode?: "multiplayer" | "single-player";
};

export type DeriveLobbyRecordInput = {
  roomId: string;
  state: GameState;
  createdAt: string;
  updatedAt: string;
  createdByName?: string | null;
};

/** Summarises a room's game state into the record the directory is built from. */
export function deriveLobbyRecord(input: DeriveLobbyRecordInput): LobbyRoomRecord {
  const { roomId, state, createdAt, updatedAt } = input;
  const room: RoomMembershipState | null = state.room ?? null;
  const members = room?.members ?? [];
  const host = room?.hostClientId ? (members.find((member) => member.clientId === room.hostClientId) ?? null) : null;
  // Who "owns" the room for the per-account cap: the explicit owner userId
  // (set for private rooms, never listed), else the host, else the first member
  // — whichever is a VERIFIED account. A room nobody signed-in holds yet is
  // ownerless (null) and never counts against the cap.
  const ownerUserId = room?.ownerUserId ?? host?.userId ?? members[0]?.userId ?? null;
  const isFreshLobby =
    state.phase === "setup" && (Boolean(state.setupLobby) || Boolean(state.combatSandboxSetup));
  // The visible roster: who is in this room — host first, then seated players,
  // then observers — each marked guest (no verified account) or not, so the
  // lobby can render "guest — name" honestly. Bounded (see the cap's comment).
  const roster: RoomDirectoryMember[] = [...members]
    .sort((a, b) => {
      const rank = (member: (typeof members)[number]) => (member.isHost ? 0 : member.seat !== "observer" ? 1 : 2);
      return rank(a) - rank(b);
    })
    .slice(0, MAX_DIRECTORY_MEMBERS)
    .map((member) => ({
      name: member.name,
      host: member.isHost,
      guest: !member.userId,
      seated: member.seat !== "observer"
    }));
  return {
    roomId,
    name: roomDisplayName(state, roomId),
    mode: state.mode,
    phase: state.phase,
    inProgress: !isFreshLobby,
    memberCount: members.length,
    seatedCount: members.filter((member) => member.seat !== "observer").length,
    hosted: Boolean(room?.hosted),
    hostName: host?.name ?? null,
    hostClientId: room?.hostClientId ?? null,
    memberClientIds: members.map((member) => member.clientId),
    members: roster,
    // Absent flag (legacy rooms) shows as Ranked, matching the match-report
    // default; only an explicit Normal table (`ranked === false`) shows casual.
    ranked: room?.ranked !== false,
    locked: Boolean(room?.passwordHash),
    createdByName: input.createdByName ?? null,
    ownerUserId,
    createdAt,
    updatedAt,
    ...(room?.visibility === "private" ? { visibility: "private" as const } : {}),
    ...(state.sessionMode === "single-player" ? { sessionMode: "single-player" as const } : {})
  };
}

/**
 * Whether `viewerClientId` may close this room. Mirrors the room engine's close
 * rule:
 *  - a HOSTED room is protected: only its host may close it;
 *  - an OPEN table has no host and stores no seats to protect (seats there are a
 *    local, per-client choice), so there is no ownership to guard — ANYONE may
 *    close it.
 *
 * Open tables are closeable by anyone on purpose: a player's `clientId` is
 * per-session (it resets when the browser/tab is closed), so a fresh session no
 * longer "owns" the open rooms it created earlier. Gating close on membership
 * then stranded those rooms as undeletable clutter. Anyone can already join an
 * open table and act as any seat, so letting anyone close one grants no new
 * power. Protect a room from being closed by others by Hosting it.
 */
export function viewerCanClose(record: LobbyRoomRecord, viewerClientId?: string): boolean {
  if (record.hosted) {
    return Boolean(viewerClientId) && record.hostClientId === viewerClientId;
  }
  return true;
}

/** True when nobody is a member AND the room has been idle past the TTL. */
export function isStaleRecord(record: LobbyRoomRecord, now: number = Date.now()): boolean {
  if (record.memberCount > 0) {
    return false;
  }
  const updatedMs = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedMs)) {
    return false;
  }
  return now - updatedMs > STALE_ROOM_TTL_MS;
}

/** Projects a stored record into the per-viewer directory row (adds canClose). */
export function toDirectoryEntry(record: LobbyRoomRecord, viewerClientId?: string): RoomDirectoryEntry {
  return {
    roomId: record.roomId,
    name: record.name,
    mode: record.mode,
    phase: record.phase,
    inProgress: record.inProgress,
    memberCount: record.memberCount,
    seatedCount: record.seatedCount,
    hosted: record.hosted,
    hostName: record.hostName,
    members: record.members ?? [],
    ranked: record.ranked,
    locked: Boolean(record.locked),
    createdByName: record.createdByName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    canClose: viewerCanClose(record, viewerClientId)
  };
}

/**
 * A stable signature of every directory-relevant field EXCEPT `updatedAt`. A
 * room party reports to the lobby only when this signature changes, so ordinary
 * game actions (which don't alter the directory) don't hammer the lobby, while
 * name / membership / phase changes always do. Listed explicitly so adding a
 * field to LobbyRoomRecord is a conscious decision about whether it belongs here.
 */
export function lobbyRecordSignature(record: LobbyRoomRecord): string {
  return JSON.stringify({
    roomId: record.roomId,
    name: record.name,
    mode: record.mode,
    phase: record.phase,
    inProgress: record.inProgress,
    memberCount: record.memberCount,
    seatedCount: record.seatedCount,
    hosted: record.hosted,
    hostName: record.hostName,
    hostClientId: record.hostClientId,
    memberClientIds: record.memberClientIds,
    // Roster changes (rename, sign-in upgrade, seat/host moves) must re-report,
    // or the lobby would keep showing stale names for the room.
    members: record.members ?? [],
    ranked: record.ranked,
    locked: Boolean(record.locked),
    createdByName: record.createdByName,
    // The owner drives the per-account cap; a change (a guest host signing in,
    // a host transfer) must re-report so the cap re-evaluates.
    ownerUserId: record.ownerUserId ?? null,
    createdAt: record.createdAt,
    visibility: record.visibility ?? "public",
    sessionMode: record.sessionMode ?? "multiplayer"
  });
}

/**
 * The roomIds to EVICT so no account holds more than `cap` public rooms — the
 * "auto-delete surplus" half of the per-account room limit. Groups the given
 * records by owner account and, for any account over the cap, returns its
 * surplus rooms (the ones NOT kept). Which rooms are kept, best → worst:
 * in-progress GAMES are kept ahead of idle setup lobbies (never wipe a live
 * game to preserve a fresh empty room), then more-recently-created ahead of
 * older. So a fourth room deletes the account's oldest idle lobby, not its
 * running game.
 *
 * Ownerless rooms (guest / not-yet-joined, `ownerUserId` null) are never
 * counted or returned — the cap can only bind a stable signed-in account.
 * Pure and deterministic (no wall-clock), so both backends and the unit tests
 * agree on exactly which rooms are surplus.
 */
export function surplusRoomIds(
  records: Iterable<LobbyRoomRecord>,
  cap: number = MAX_ROOMS_PER_ACCOUNT
): string[] {
  const byOwner = new Map<string, LobbyRoomRecord[]>();
  for (const record of records) {
    const owner = record.ownerUserId;
    if (!owner) {
      continue;
    }
    const list = byOwner.get(owner);
    if (list) {
      list.push(record);
    } else {
      byOwner.set(owner, [record]);
    }
  }
  const surplus: string[] = [];
  for (const rooms of byOwner.values()) {
    if (rooms.length <= cap) {
      continue;
    }
    const keepOrder = [...rooms].sort((a, b) => {
      // Keep in-progress games ahead of idle setup lobbies.
      if (a.inProgress !== b.inProgress) {
        return a.inProgress ? -1 : 1;
      }
      // Then keep the most recently created (older rooms are evicted first).
      const created = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (created !== 0) {
        return created;
      }
      // Stable tie-break so the result is deterministic regardless of input order.
      return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
    });
    for (const record of keepOrder.slice(cap)) {
      surplus.push(record.roomId);
    }
  }
  return surplus;
}

/**
 * The lobby's in-memory room directory: a roomId-keyed set of records with the
 * same prune / sort / per-viewer canClose rules as the built-in store, so the
 * edge backend presents an identical lobby. The PartyKit lobby Durable Object is
 * a thin wrapper that persists `records()` to storage and serves `list()`.
 */
export class LobbyRegistry {
  private readonly rooms = new Map<string, LobbyRoomRecord>();

  constructor(records: Iterable<LobbyRoomRecord> = []) {
    for (const record of records) {
      if (record && typeof record.roomId === "string" && record.roomId.length > 0 &&
          record.visibility !== "private" && record.sessionMode !== "single-player") {
        this.rooms.set(record.roomId, record);
      }
    }
  }

  /** Insert or replace a room's record (keyed by roomId — never duplicates). */
  upsert(record: LobbyRoomRecord): void {
    if (!record || typeof record.roomId !== "string" || record.roomId.length === 0) {
      return;
    }
    if (record.visibility === "private" || record.sessionMode === "single-player") {
      this.rooms.delete(record.roomId);
      return;
    }
    this.rooms.set(record.roomId, record);
  }

  /** Remove a room from the directory. Returns whether it was present. */
  remove(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  has(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Drops empty rooms idle past the TTL; returns the pruned room ids. */
  prune(now: number = Date.now()): string[] {
    const removed: string[] = [];
    for (const [roomId, record] of this.rooms) {
      if (isStaleRecord(record, now)) {
        this.rooms.delete(roomId);
        removed.push(roomId);
      }
    }
    return removed;
  }

  /**
   * The directory for one viewer: prunes stale rooms first, then returns the
   * rest newest-activity-first with a per-viewer `canClose`.
   */
  list(viewerClientId?: string, now: number = Date.now()): RoomDirectoryEntry[] {
    this.prune(now);
    const visible = [...this.rooms.values()].filter(
      (record) => record.visibility !== "private" && record.sessionMode !== "single-player"
    );
    // Hide any room beyond an account's cap so a flooded directory is bounded on
    // sight, even before the backend's real "auto-delete surplus" pass removes
    // it. Backend-agnostic: both the built-in store and the edge lobby list
    // through here. (The record itself stays until the backend force-closes it,
    // so this is a view filter, not a mutation.)
    const surplus = new Set(surplusRoomIds(visible));
    return visible
      .filter((record) => !surplus.has(record.roomId))
      .map((record) => toDirectoryEntry(record, viewerClientId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  /**
   * Drop every room beyond an account's cap from the registry, returning the
   * evicted roomIds so the caller can force-close the real rooms. Mirrors
   * `prune`. Used by the edge lobby on each report so surplus records don't
   * linger in Durable Object storage.
   */
  enforceOwnerCaps(cap: number = MAX_ROOMS_PER_ACCOUNT): string[] {
    const evicted = surplusRoomIds(this.rooms.values(), cap);
    for (const roomId of evicted) {
      this.rooms.delete(roomId);
    }
    return evicted;
  }

  /** The raw records, for persistence to Durable Object storage. */
  records(): LobbyRoomRecord[] {
    return [...this.rooms.values()];
  }
}
