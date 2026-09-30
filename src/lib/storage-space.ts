/**
 * Browser-storage space management shared by every localStorage writer.
 *
 * The multiplayer recovery cache (room-cache.ts) mirrors a whole GameState —
 * several MB — for each room a player has joined, and those copies were never
 * evicted. After a game or two the origin's localStorage quota is full and
 * EVERY later setItem throws, so small stores (Order & Chaos progress, story
 * campaign completion) silently stopped saving. `setItemMakingRoom` retries a
 * failed write after dropping the idle room caches (never the room this tab
 * is playing), which are only a best-effort crash-recovery copy.
 *
 * Kept free of engine imports so light client bundles can use it.
 */

export const ROOM_CACHE_PREFIX = "homm3bg-room:";

/** The room this tab mirrors (the live game): never evicted to make space. */
let liveRoomId: string | null = null;

export function markLiveRoomCache(roomId: string): void {
  liveRoomId = roomId;
}

/** Remove every cached room except `keepRoomId`; returns how many were removed. */
export function evictRoomCaches(keepRoomId: string | null = liveRoomId): number {
  if (typeof window === "undefined") return 0;
  try {
    const keep = keepRoomId === null ? null : ROOM_CACHE_PREFIX + keepRoomId;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(ROOM_CACHE_PREFIX) && key !== keep) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
    return keys.length;
  } catch {
    return 0;
  }
}

/**
 * localStorage.setItem that frees the idle room caches and tries once more
 * when the first write fails. False when storage is blocked or still full.
 */
export function setItemMakingRoom(key: string, value: string, keepRoomId: string | null = liveRoomId): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    if (evictRoomCaches(keepRoomId) === 0) return false;
  }
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
