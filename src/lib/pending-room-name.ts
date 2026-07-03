"use client";

/**
 * One-shot handoff of a freshly created room's chosen name from the room
 * browser (/play) to the game page (/?room=…).
 *
 * The API backend seeds the name server-side at creation, but PartyKit
 * creates rooms implicitly on first connect, so the FIRST CLIENT to join
 * applies the name via SET_ROOM_NAME once connected (page.tsx's
 * applyPendingName). When the browser and the game page were one component
 * this rode in a ref; now that creation happens on a separate route the value
 * crosses the navigation in sessionStorage (same-tab by definition, which is
 * exactly the scope a "room I just created" hint should have).
 */

const KEY = "homm3bg.pendingRoomName";

export type PendingRoomName = { roomId: string; name: string };

export function savePendingRoomName(roomId: string, name: string): void {
  if (typeof window === "undefined" || !name) {
    return;
  }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ roomId, name } satisfies PendingRoomName));
  } catch {
    /* Private mode etc. — the room simply keeps its default name. */
  }
}

/** Read AND clear the pending name (a one-shot hint, never re-applied). */
export function takePendingRoomName(): PendingRoomName | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(KEY);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PendingRoomName).roomId === "string" &&
      typeof (parsed as PendingRoomName).name === "string" &&
      (parsed as PendingRoomName).name.length > 0
    ) {
      return parsed as PendingRoomName;
    }
    return null;
  } catch {
    return null;
  }
}
