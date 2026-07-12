"use client";

import type { GameMode } from "@/engine";

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
const HOSTED_KEY = "homm3bg.pendingRoomHosted";
/** The game mode to switch a freshly created room into (e.g. a battle test). */
const MODE_KEY = "homm3bg.pendingRoomMode";
/** The match type (Ranked/Normal) chosen at create time. */
const RANKED_KEY = "homm3bg.pendingRoomRanked";
/** Join password typed in the lobby before navigating into a locked room. */
const PASSWORD_KEY = "homm3bg.pendingRoomPassword";

export type PendingRoomName = { roomId: string; name: string };
export type PendingRoomMode = { roomId: string; mode: GameMode };
export type PendingRoomRanked = { roomId: string; ranked: boolean };
export type PendingRoomPassword = { roomId: string; password: string };

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

/**
 * One-shot handoff of a freshly created room's "closed" (hosted) choice, exactly
 * like the name above. When the creator picked a Closed table in the lobby, the
 * game page turns hosting on once connected (the creator becomes the host, seats
 * lock). Empty/open rooms store nothing, so the default stays an open table.
 */
export function savePendingRoomHosted(roomId: string): void {
  if (typeof window === "undefined" || !roomId) {
    return;
  }
  try {
    window.sessionStorage.setItem(HOSTED_KEY, roomId);
  } catch {
    /* Private mode etc. — the room simply opens as an open table. */
  }
}

/** Read AND clear the pending "closed" roomId (a one-shot hint, never re-applied). */
export function takePendingRoomHosted(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(HOSTED_KEY);
    if (raw) {
      window.sessionStorage.removeItem(HOSTED_KEY);
    }
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/**
 * One-shot handoff of a freshly created room's game MODE (the Battle Test flow).
 * The built-in backend creates the room in the chosen mode server-side, but
 * PartyKit creates every room as an adventure lobby, so the creator resets it to
 * the chosen mode once connected (page.tsx). Adventure rooms store nothing —
 * that is the default — so this only ever carries a battle test.
 */
export function savePendingRoomMode(roomId: string, mode: GameMode): void {
  if (typeof window === "undefined" || !roomId) {
    return;
  }
  try {
    window.sessionStorage.setItem(MODE_KEY, JSON.stringify({ roomId, mode } satisfies PendingRoomMode));
  } catch {
    /* Private mode etc. — the room simply opens as a normal adventure. */
  }
}

/**
 * One-shot handoff of a freshly created room's match type (Ranked/Normal),
 * exactly like the name/hosted hints above. The API backend seeds it
 * server-side at creation, but PartyKit creates rooms implicitly, so the first
 * client applies it via SET_ROOM_RANKED once connected (page.tsx).
 */
export function savePendingRoomRanked(roomId: string, ranked: boolean): void {
  if (typeof window === "undefined" || !roomId) {
    return;
  }
  try {
    window.sessionStorage.setItem(RANKED_KEY, JSON.stringify({ roomId, ranked } satisfies PendingRoomRanked));
  } catch {
    /* Private mode etc. — the room keeps the server-seeded default. */
  }
}

/** Read AND clear the pending match type (a one-shot hint, never re-applied). */
export function takePendingRoomRanked(): PendingRoomRanked | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(RANKED_KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(RANKED_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PendingRoomRanked).roomId === "string" &&
      typeof (parsed as PendingRoomRanked).ranked === "boolean"
    ) {
      return parsed as PendingRoomRanked;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read AND clear the pending room mode (a one-shot hint, never re-applied). */
export function takePendingRoomMode(): PendingRoomMode | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(MODE_KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(MODE_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PendingRoomMode).roomId === "string" &&
      ((parsed as PendingRoomMode).mode === "adventure" || (parsed as PendingRoomMode).mode === "combat-sandbox")
    ) {
      return parsed as PendingRoomMode;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * One-shot handoff of a join password typed in the room browser BEFORE the
 * player navigates into `/?room=…`. The game page seeds JOIN_ROOM with it so a
 * locked room never auto-joins without a typed password. Host absence does not
 * matter — the engine still hashes and checks. Cleared after first read.
 */
export function savePendingRoomPassword(roomId: string, password: string): void {
  if (typeof window === "undefined" || !roomId || !password) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      PASSWORD_KEY,
      JSON.stringify({ roomId, password } satisfies PendingRoomPassword)
    );
  } catch {
    /* Private mode etc. — the in-room password prompt remains the fallback. */
  }
}

/** Read AND clear the pending join password (one-shot; never re-applied). */
export function takePendingRoomPassword(): PendingRoomPassword | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(PASSWORD_KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(PASSWORD_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PendingRoomPassword).roomId === "string" &&
      typeof (parsed as PendingRoomPassword).password === "string" &&
      (parsed as PendingRoomPassword).password.length > 0
    ) {
      return parsed as PendingRoomPassword;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * One-shot handoff of a freshly created SINGLE-PLAYER room's computer-opponent
 * count. The built-in backend seeds the whole mode server-side at creation,
 * but PartyKit creates rooms implicitly on first connect — so the creating
 * tab's socket URL carries `?singlePlayer=<count>`, which the party honors
 * ONLY while the room has no snapshot at all (fresh, memberless,
 * unconfigured). Peeked (not cleared) when the socket query is built, so a
 * failed first connect can retry; it dies with the tab's sessionStorage and is
 * ignored by the server for any established room.
 */
const SINGLE_PLAYER_KEY = "homm3bg.pendingSinglePlayer";

export type PendingSinglePlayer = { roomId: string; computerOpponents: number };

export function savePendingSinglePlayer(roomId: string, computerOpponents: number): void {
  if (typeof window === "undefined" || !roomId) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      SINGLE_PLAYER_KEY,
      JSON.stringify({ roomId, computerOpponents } satisfies PendingSinglePlayer)
    );
  } catch {
    /* Private mode etc. — the room simply opens as a normal lobby. */
  }
}

/** Read WITHOUT clearing; validated against the room being connected to. */
export function peekPendingSinglePlayer(roomId: string): PendingSinglePlayer | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(SINGLE_PLAYER_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as PendingSinglePlayer).roomId === roomId &&
      typeof (parsed as PendingSinglePlayer).computerOpponents === "number" &&
      (parsed as PendingSinglePlayer).computerOpponents >= 1
    ) {
      return parsed as PendingSinglePlayer;
    }
    return null;
  } catch {
    return null;
  }
}
