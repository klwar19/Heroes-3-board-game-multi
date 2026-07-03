/**
 * Per-connection snapshot redaction for the BUILT-IN backend (Phase 2, plan
 * §D2 step 5). Every HTTP/SSE surface that returns a room snapshot runs it
 * through this so a recipient only ever receives the hidden information for
 * THEIR OWN seat — an opponent's real hand, deck order, face-down tiles and
 * private pending choices never reach the wire (devtools on a second client
 * shows a redacted frame). The redactor keeps the frame a GameState the existing
 * client renders unchanged (see `redactStateForSeat`).
 *
 * Gated to HOSTED rooms: an open table has no seat lock and keeps the shared
 * full-state fast path (the client redacts locally), exactly as before — so this
 * costs nothing on guest/open tables and only fans out per-viewer where seats
 * are actually enforced.
 */
import { OBSERVER_VIEWER_SEAT, redactStateForSeat, seatForViewer, type VerifiedActor } from "@/engine";
import type { GameRoomSnapshot } from "./game-room-store";

export function redactSnapshotForViewer(snapshot: GameRoomSnapshot, actor: VerifiedActor): GameRoomSnapshot {
  const room = snapshot.state.room;
  if (!room?.hosted) {
    return snapshot;
  }
  const seat = seatForViewer(snapshot.state, actor);
  const viewer = seat === "observer" ? OBSERVER_VIEWER_SEAT : seat;
  return { ...snapshot, state: redactStateForSeat(snapshot.state, viewer) };
}
