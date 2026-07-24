import type { GameState } from "@/engine";
import { appendEvent } from "@/engine";

/**
 * Single-player SAVE SLOTS (server half), shared by both backends (the built-in
 * Next.js store and the PartyKit edge — the UNDO_MOVE precedent).
 *
 * WHY a server surface exists at all: single-player rooms are HOSTED, so every
 * frame a client receives is redacted to its seat (`redactStateForSeat`) — the
 * AI seats' hands AND even the owner's own deck order are "hidden" placeholders.
 * A client-captured snapshot therefore can NEVER faithfully restore a game.
 * Saving fetches the room's RAW state (owner-only, solo rooms only — there is
 * no opponent whose hidden info could be wronged), the browser stores it
 * locally (nothing is ever stored server-side, so save slots cannot flood the
 * server), and loading pushes that state back as an atomic whole-state swap
 * into the SAME room (no new rooms are minted).
 *
 * Scope guards (each pinned in single-player-save.test.ts):
 * - Only `sessionMode === "single-player"` rooms — a multiplayer table can
 *   neither leak raw state nor be overwritten by a client-supplied snapshot.
 * - Only the room's OWNER (verified userId first, else the guest clientId that
 *   minted the room — the same identity rule `joinRoom` enforces for sp rooms).
 * - A load keeps the room's LIVE membership object (the restoreRoom rule:
 *   recovery restores the GAME, never the membership) and refuses ranked rooms
 *   outright (belt-and-braces; sp rooms are never ranked).
 */

export type SinglePlayerSaveActor = { clientId?: string; userId?: string };

export type SinglePlayerSaveAccess = { ok: true } | { ok: false; reason: string };

/** Whether this actor may read/replace this single-player room's raw state. */
export function singlePlayerSaveAccess(
  state: GameState | null | undefined,
  actor: SinglePlayerSaveActor
): SinglePlayerSaveAccess {
  if (state?.sessionMode !== "single-player") {
    return { ok: false, reason: "Save slots exist only for single-player games." };
  }
  const room = state.room ?? null;
  if (room?.ranked) {
    return { ok: false, reason: "A ranked room has no save slots." };
  }
  if (room?.ownerUserId) {
    return actor.userId === room.ownerUserId
      ? { ok: true }
      : { ok: false, reason: "This single-player game belongs to another account." };
  }
  if (room?.ownerClientId) {
    return actor.clientId === room.ownerClientId
      ? { ok: true }
      : { ok: false, reason: "This single-player game belongs to another player." };
  }
  // No owner stamped yet (a pre-join frame): fall back to membership; a fresh
  // memberless room stays permissive, mirroring the store's restore rules.
  const members = room?.members ?? [];
  if (members.length === 0) {
    return { ok: true };
  }
  return members.some(
    (member) =>
      (actor.userId !== undefined && member.userId === actor.userId) ||
      (actor.clientId !== undefined && member.clientId === actor.clientId)
  )
    ? { ok: true }
    : { ok: false, reason: "Only a member of this room can use its save slots." };
}

export type SinglePlayerLoadOutcome = { ok: true; state: GameState } | { ok: false; reason: string };

/** Whether the room's current state is a fresh, never-started setup lobby. */
function isFreshLobby(state: GameState): boolean {
  return state.phase === "setup" && Boolean(state.setupLobby);
}

/**
 * Validates a load and grafts the room's live membership onto the saved state.
 * The returned state is the exact object to store + broadcast (version bump,
 * persistence and pump re-arm are the caller's job — mirror the undo path).
 */
export function prepareSinglePlayerLoad(
  current: GameState,
  incoming: unknown,
  actor: SinglePlayerSaveActor
): SinglePlayerLoadOutcome {
  const candidate = incoming as GameState | null;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !candidate.players ||
    typeof candidate.phase !== "string" ||
    candidate.sessionMode !== "single-player"
  ) {
    return { ok: false, reason: "That save is not a single-player game state." };
  }

  if (current.sessionMode === "single-player") {
    const access = singlePlayerSaveAccess(current, actor);
    if (!access.ok) {
      return access;
    }
  } else if (isFreshLobby(current) && (current.room?.members ?? []).length === 0) {
    // The server recycled the sp room into a fresh memberless lobby: allow the
    // owner's recovery push, exactly like restoreRoom's fresh-lobby rule.
  } else {
    return { ok: false, reason: "Saves can only be loaded into their own single-player room." };
  }

  // A load restores the GAME, never the live room membership.
  candidate.room = current.room ?? candidate.room ?? null;

  const name = candidate.players.p1?.name ?? "The player";
  appendEvent(candidate, {
    type: "EVENT_NOTE",
    playerId: "p1",
    message: `${name} loaded a saved game (round ${typeof candidate.round === "number" ? candidate.round : "?"}).`
  });
  return { ok: true, state: candidate };
}
