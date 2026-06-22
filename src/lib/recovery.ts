"use client";

import { clearAllCachedRooms } from "@/lib/room-cache";

/**
 * Crash recovery that ALWAYS works, regardless of why the table crashed.
 *
 * Every other recovery path (Next.js reset(), a hard reload, re-fetching the
 * snapshot, "return to the default room") reconnects to the SAME room — so if
 * the room's own state is what crashes the render (a stale re-restored cache,
 * or a bad snapshot from a server running older engine code), reconnecting just
 * re-loads the poison and the crash screen comes straight back. The player
 * "keeps staying there".
 *
 * Opening a brand-new room id sidesteps that completely: the server has no such
 * room yet, so it hands back a clean, empty setup lobby that cannot carry the
 * crashing state. This is the guaranteed escape hatch. It loses the (already
 * unplayable) broken game — that is the trade for always landing somewhere that
 * works.
 */

export function freshRoomId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `room-${stamp}-${rand}`;
}

export function escapeToFreshRoom(): void {
  if (typeof window === "undefined") {
    return;
  }
  // Drop any poisoned local save so a future visit to ANY room can't restore it.
  clearAllCachedRooms();
  window.location.assign(`${window.location.pathname}?room=${freshRoomId()}`);
}
