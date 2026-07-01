import { roomDisplayName, type GameState, type RoomMembershipState } from "@/engine";

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

/** Empty rooms idle past this are pruned from the directory (store + edge). */
export const STALE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The fixed Durable Object id of the single lobby/registry instance. Game rooms
 * live in the `main` party (`/parties/main/<roomId>`); the lobby is one object
 * in the `lobby` party (`/parties/lobby/directory`), so this id never collides
 * with a user's room id.
 */
export const LOBBY_SINGLETON_ID = "directory";

/**
 * One row of the lobby's room directory, as shown to a particular viewer: enough
 * to tell rooms apart and decide whether to join — and whether THIS viewer may
 * close it — without connecting to each room.
 */
export type RoomDirectoryEntry = {
  roomId: string;
  name: string;
  /** Engine phase ("setup", "playing", "combat", …). */
  phase: string;
  /** False while the room is still a fresh setup lobby (nothing started yet). */
  inProgress: boolean;
  memberCount: number;
  seatedCount: number;
  hosted: boolean;
  hostName: string | null;
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
  phase: string;
  inProgress: boolean;
  memberCount: number;
  seatedCount: number;
  hosted: boolean;
  hostName: string | null;
  hostClientId: string | null;
  memberClientIds: string[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
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
  const isFreshLobby = state.phase === "setup" && Boolean(state.setupLobby);
  return {
    roomId,
    name: roomDisplayName(state, roomId),
    phase: state.phase,
    inProgress: !isFreshLobby,
    memberCount: members.length,
    seatedCount: members.filter((member) => member.seat !== "observer").length,
    hosted: Boolean(room?.hosted),
    hostName: host?.name ?? null,
    hostClientId: room?.hostClientId ?? null,
    memberClientIds: members.map((member) => member.clientId),
    createdByName: input.createdByName ?? null,
    createdAt,
    updatedAt
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
    phase: record.phase,
    inProgress: record.inProgress,
    memberCount: record.memberCount,
    seatedCount: record.seatedCount,
    hosted: record.hosted,
    hostName: record.hostName,
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
    phase: record.phase,
    inProgress: record.inProgress,
    memberCount: record.memberCount,
    seatedCount: record.seatedCount,
    hosted: record.hosted,
    hostName: record.hostName,
    hostClientId: record.hostClientId,
    memberClientIds: record.memberClientIds,
    createdByName: record.createdByName,
    createdAt: record.createdAt
  });
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
      if (record && typeof record.roomId === "string" && record.roomId.length > 0) {
        this.rooms.set(record.roomId, record);
      }
    }
  }

  /** Insert or replace a room's record (keyed by roomId — never duplicates). */
  upsert(record: LobbyRoomRecord): void {
    if (!record || typeof record.roomId !== "string" || record.roomId.length === 0) {
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
    return [...this.rooms.values()]
      .map((record) => toDirectoryEntry(record, viewerClientId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  /** The raw records, for persistence to Durable Object storage. */
  records(): LobbyRoomRecord[] {
    return [...this.rooms.values()];
  }
}
