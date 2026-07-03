import type { FactionId, GameAction, GameState, RoomSeat, TableReaction } from "./state";

/**
 * Table reactions (emotes) — a small social layer for the multiplayer table.
 *
 * A reaction is a purely cosmetic broadcast: it flows through `applyAction`
 * like any other action (self-validating, so it lives in the reducer's
 * `HANDLER_VALIDATED_ACTIONS`), mutates only the synced ring buffer
 * `state.tableReactions`, and is never seat- or turn-gated — an observer may
 * react, and a player may react on anyone's turn. Because a reaction carries no
 * seat `playerId`, `roomActionGuard` and the parallel-turn bystander backstop
 * both skip it (they act only on seat-scoped actions), so it is safe in every
 * mode (solo, open table, hosted, parallel turns).
 *
 * Two guards keep it from ever bloating state or being abused:
 *  - the buffer is capped at MAX_TABLE_REACTIONS (oldest dropped), so the
 *    snapshot size is bounded no matter how many reactions are sent; and
 *  - a per-client flood cap rejects a client that already owns the last
 *    TABLE_REACTION_FLOOD_LIMIT entries in the buffer, so one client can never
 *    monopolise the feed. Both are deterministic (no wall-clock), so replays and
 *    tests stay reproducible; the transient "fade after a few seconds" display
 *    is handled entirely client-side off each reaction's `seq`.
 */

/** One entry in the reaction palette (the single source of truth for ids). */
export type TableReactionDef = {
  id: string;
  /** Short menu label (button tooltip / accessible name). */
  label: string;
  /** The line shown in the floating bubble + feed ("Well met!"). */
  phrase: string;
  /**
   * Optional authentic board-game art thumbnail (a /public asset path). When
   * set, the palette + bubble show this image; otherwise the UI draws the
   * heraldic SVG glyph keyed by `id`. Kept here so the engine's allow-list and
   * the renderer never drift.
   */
  image?: string;
};

/**
 * The reaction palette. Ids are the contract validated on the wire; labels /
 * phrases / art are shared with the UI so a new reaction is a single edit here.
 * The art-backed entries use real Heroes-3 board-game scans already in the
 * repo; the rest render as in-house heraldic glyphs (see ReactionGlyph).
 */
export const TABLE_REACTIONS: readonly TableReactionDef[] = [
  { id: "greet", label: "Greetings", phrase: "Well met!" },
  { id: "well_played", label: "Well played", phrase: "Well played." },
  { id: "wow", label: "Amazed", phrase: "By the gods!" },
  { id: "laugh", label: "Laugh", phrase: "Ha ha!" },
  { id: "think", label: "Thinking", phrase: "Hmm…" },
  { id: "hurry", label: "Hurry up", phrase: "Your move…" },
  { id: "oops", label: "Blast", phrase: "Blast it!" },
  {
    id: "threaten",
    label: "Threaten",
    phrase: "You will fall.",
    image: "/assets/artifacts_minor-skull_helmet.webp"
  },
  {
    id: "glory",
    label: "For glory",
    phrase: "For glory!",
    image: "/assets/artifacts_relic-crown_of_dragontooth.webp"
  },
  {
    id: "luck",
    label: "Good luck",
    phrase: "Fortune favour you.",
    image: "/assets/abilities-luck.webp"
  },
  {
    id: "dragon",
    label: "Dragon's roar",
    phrase: "Fear the dragon!",
    image: "/assets/units-black_dragon-portrait.webp"
  },
  {
    id: "riches",
    label: "Riches",
    phrase: "Riches await.",
    image: "/assets/artifacts_major-endless_bag_of_gold.webp"
  }
] as const;

const TABLE_REACTION_IDS = new Set(TABLE_REACTIONS.map((reaction) => reaction.id));

/** Longest reaction history kept in synced state (bounds the snapshot). */
export const MAX_TABLE_REACTIONS = 16;

/**
 * A client may not own more than this many of the most-recent buffer entries.
 * Rejecting the (LIMIT+1)-th consecutive reaction from one client stops a single
 * seat from flooding the feed, without any timestamp. Paired with a client-side
 * cooldown on the reaction bar for the everyday "don't spam" case.
 */
export const TABLE_REACTION_FLOOD_LIMIT = 4;

export function isTableReactionAction(action: GameAction): boolean {
  return action.type === "SEND_TABLE_REACTION";
}

/** Look up a reaction definition by id (or null when unknown). */
export function getTableReaction(reactionId: string): TableReactionDef | null {
  return TABLE_REACTIONS.find((reaction) => reaction.id === reactionId) ?? null;
}

/** The authentic faction crest asset for a seat's chosen faction, if any. */
export function factionCrestAsset(factionId: FactionId | null | undefined): string | null {
  return factionId ? `/assets/town-icon-${factionId}.webp` : null;
}

/**
 * Resolve who is sending: a room member (name + seat honoured) or, on an open /
 * no-room table, the fallback name the action carried. Returns null only when a
 * room exists and the client is not one of its members — the one case we refuse,
 * mirroring the "claimed identity" trust model (a member id is required).
 */
function resolveSender(
  state: GameState,
  action: Extract<GameAction, { type: "SEND_TABLE_REACTION" }>
): { name: string; seat: RoomSeat | null } | null {
  const room = state.room;
  if (room && room.members.length > 0) {
    const member = room.members.find((entry) => entry.clientId === action.clientId);
    if (!member) {
      return null;
    }
    return { name: member.name, seat: member.seat };
  }
  // No room (isolated / true-solo): accept, attributing to the sent name.
  return { name: action.name?.trim() || "Player", seat: null };
}

/** The faction a seat is playing (for the crest); null for observers / unknown. */
function factionOfSeat(state: GameState, seat: RoomSeat | null): FactionId | null {
  if (!seat || seat === "observer") {
    return null;
  }
  return state.players[seat]?.factionId ?? null;
}

export function sendTableReaction(
  state: GameState,
  action: Extract<GameAction, { type: "SEND_TABLE_REACTION" }>
): void {
  if (!action.clientId) {
    throw new Error("A client id is required to send a reaction.");
  }
  if (!TABLE_REACTION_IDS.has(action.reactionId)) {
    throw new Error("That reaction is not available.");
  }

  const sender = resolveSender(state, action);
  if (!sender) {
    throw new Error("Join the room before reacting.");
  }

  const buffer = state.tableReactions ?? [];
  // Per-client flood cap: refuse when this client already owns the last
  // TABLE_REACTION_FLOOD_LIMIT entries (a deterministic dominance guard).
  if (buffer.length >= TABLE_REACTION_FLOOD_LIMIT) {
    const recent = buffer.slice(-TABLE_REACTION_FLOOD_LIMIT);
    if (recent.every((entry) => entry.clientId === action.clientId)) {
      throw new Error("Slow down — too many reactions at once.");
    }
  }

  const seq = (state.tableReactionSeq ?? 0) + 1;
  state.tableReactionSeq = seq;
  const reaction: TableReaction = {
    seq,
    clientId: action.clientId,
    name: sender.name,
    reactionId: action.reactionId,
    seat: sender.seat,
    factionId: factionOfSeat(state, sender.seat)
  };
  // Append and trim to the cap (drop the oldest) so the snapshot stays bounded.
  const next = [...buffer, reaction];
  state.tableReactions = next.length > MAX_TABLE_REACTIONS ? next.slice(-MAX_TABLE_REACTIONS) : next;
}
