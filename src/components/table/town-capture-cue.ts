import type { GameEvent, GameState, PlayerId } from "@/engine";
import { NEUTRAL_PLAYER_ID } from "@/engine";
import type { MapNoticeCue } from "./overlays";

/**
 * Presentation model for the "enemy town captured" pop-up. Flagging an enemy
 * faction Town is NOT an instant win (rulebook p.76): the conqueror earns a
 * resource-gain reward and the former owner goes on a 2-turn elimination clock
 * only if it took their last Town/Settlement — you win by being the last faction
 * standing. That surprises players ("I took their town but didn't win!"), so this
 * builds a clear pop-up shown to BOTH sides — the conqueror and the former owner
 * — explaining exactly what happened and what happens next.
 *
 * Pure over the engine's real state: it reads the former owner's
 * `eliminationCountdown` (set by `refreshEliminationClock` in the SAME action as
 * the FIELD_FLAGGED event) to say whether they are on the clock or still hold a
 * base. page.tsx only wires the queue; the wording is pinned by the test here.
 */

type FieldFlaggedEvent = Extract<GameEvent, { type: "FIELD_FLAGGED" }>;

const playerName = (state: GameState, id: PlayerId): string => state.players[id]?.name ?? id;

const turns = (n: number): string => `${n} more of your turns`;
const ownerTurns = (name: string, n: number): string => `${name} has ${n} more turn${n === 1 ? "" : "s"}`;

/**
 * Is this event an enemy FACTION-town capture (location "town", taken from a
 * living rival)? Settlements, mines and random towns route through their own
 * flags and are not the "captured their town but didn't win" case.
 */
export function isEnemyTownCapture(event: GameEvent): event is FieldFlaggedEvent {
  return (
    event.type === "FIELD_FLAGGED" &&
    event.location === "town" &&
    Boolean(event.previousOwnerId) &&
    event.previousOwnerId !== event.playerId &&
    event.previousOwnerId !== NEUTRAL_PLAYER_ID
  );
}

/**
 * The pop-up for `viewerId` when an enemy town is captured — one framing for the
 * conqueror, another for the former owner, and null for everyone else (the pop-up
 * is targeted, not table-wide). Returns null if the event is not an enemy-town
 * capture, or the former owner is unknown.
 */
export function buildTownCaptureCue(
  event: GameEvent,
  state: GameState,
  viewerId: PlayerId
): MapNoticeCue | null {
  if (!isEnemyTownCapture(event)) {
    return null;
  }
  const conquerorId = event.playerId;
  const formerOwnerId = event.previousOwnerId as PlayerId;
  const formerOwner = state.players[formerOwnerId];
  if (!formerOwner) {
    return null;
  }
  if (viewerId !== conquerorId && viewerId !== formerOwnerId) {
    return null;
  }

  const conquerorName = playerName(state, conquerorId);
  const formerOwnerName = playerName(state, formerOwnerId);

  // Post-action clock state (refreshEliminationClock ran in the same action).
  const countdown = formerOwner.eliminationCountdown;
  const onClock = !formerOwner.eliminated && typeof countdown === "number" && countdown > 0;
  const stillHasBase = !formerOwner.eliminated && (countdown === null || countdown === undefined);
  const clockTurns = onClock ? (countdown as number) : 0;

  const winLine = "Win the game by being the last faction standing.";
  const viewerIsConqueror = viewerId === conquerorId;

  if (viewerIsConqueror) {
    const lines = ["Flagging a town is NOT an instant win — you earn a resource-gain reward."];
    if (onClock) {
      lines.push(
        `${ownerTurns(formerOwnerName, clockTurns)} to take a Town or Settlement, or they are eliminated.`
      );
    } else if (stillHasBase) {
      lines.push(`${formerOwnerName} still holds another Town or Settlement, so they fight on.`);
    } else {
      lines.push(`${formerOwnerName} has been eliminated.`);
    }
    lines.push(winLine);
    return {
      id: `town-capture-${event.id}`,
      icon: "🚩",
      title: "Enemy town captured!",
      subtitle: `You flag ${formerOwnerName}'s town`,
      lines
    };
  }

  // The former owner's view.
  const lines: string[] = [`${conquerorName} flagged your town. This is not an instant loss.`];
  if (onClock) {
    lines.push(`You have ${turns(clockTurns)} to take a Town or Settlement, or you are eliminated.`);
    lines.push("Grab a new base before your grace period runs out!");
  } else if (stillHasBase) {
    lines.push("You still hold another Town or Settlement, so you fight on.");
    lines.push("You are eliminated only when you have no Town and no Settlement left.");
  } else {
    lines.push("You have no Town or Settlement left — you have been eliminated.");
  }
  return {
    id: `town-capture-${event.id}`,
    icon: "🚩",
    title: "Your town was captured!",
    subtitle: `${conquerorName} flags your town`,
    lines
  };
}
