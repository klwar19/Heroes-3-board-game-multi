import { gamePaused } from "./game-pause";
import { getVisiblePendingChoice } from "./player-view";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { GameState, PendingChoice, PlayerId, ReactionWindow } from "./state";

/**
 * 1v1 Undo safety rules (`adventure.duelUndo`, lobby option "Undo button for
 * 1v1 games"). Pure helpers shared by the server undo history
 * (src/server/undo-history.ts) and the client button.
 *
 * THE RULE ("undo moves, never re-roll luck"): a player may take back their OWN
 * latest actions — hero map moves, unit moves, deployment, building, choices —
 * as long as NONE of them
 *  1. drew a random number (die roll, shuffle, tile flip, random pick): the
 *     server counts every draw from the engine's seeded streams during the
 *     action transaction (`randomDrawCount`, src/engine/random.ts);
 *  2. revealed hidden information to the actor: a card left a deck/draw pile,
 *     the opponent's hand/Spell Book/scrolls changed, a face-down tile / Far
 *     tile / pool entry / Pandora card / hidden hex event / event-pool card /
 *     auction bid / trap / enemy-force card changed, a private peek opened
 *     (Rogues / Thieves' Guild), a decision passed to the other seat or a
 *     reaction window opened / changed (`hiddenInfoKey`);
 *  3. was followed by an action of the OPPONENT (or any other committed game
 *     change, e.g. a computer beat — also one folded into the same
 *     transaction) — the chain check in the server history.
 * Crossing any of these locks everything before it for good, so luck can
 * never be retried and a peek can never be taken back.
 */

/** Top-level GameState keys that are NOT game progress (table/meta data). */
const NON_GAME_KEYS = new Set<string>([
  "room",
  "eventLog",
  "eventCounter",
  "afk",
  "pause",
  "resetVote",
  "tableReactions",
  "tableReactionSeq",
  "undoStatus",
  // Holds a full state snapshot of its own (rebuilt every action) — its
  // public effect (combatRetakeVote) stays in the key.
  "combatRetakeCheckpoint",
  "combatRetakeAvailable",
  // Per-viewer projection markers (never on the authoritative state, but
  // harmless to ignore).
  "viewerPlayerId"
]);

/** FNV-1a (two lanes) over a string → compact hex key. */
function hashString(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 16777619);
    b ^= code + index;
    b = Math.imul(b, 2246822519);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length.toString(16)}`;
}

/**
 * A key of everything that is GAME progress (board, heroes, armies, hands,
 * decks, combat, turn…), ignoring table meta data (chat/membership, event
 * feed, AFK clocks, pause, emotes, the undo status itself). Two states with
 * the same key are the same position.
 */
export function gameProgressKey(state: GameState): string {
  const json = JSON.stringify(state, function (this: unknown, key, value) {
    if (this === state && NON_GAME_KEYS.has(key)) {
      return undefined;
    }
    return value;
  });
  return hashString(json ?? "");
}

type Loose = Record<string, unknown> | undefined | null;

function hiddenCombatParts(combat: Loose, actorId: PlayerId): unknown {
  if (!combat) return null;
  const enemyForce = combat.enemyForce as { cardIds?: unknown[]; playedCardIds?: unknown[] } | undefined;
  const tokens = (combat.battlefieldTokens as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    enemyForce: enemyForce ? { cardIds: enemyForce.cardIds ?? [], played: enemyForce.playedCardIds ?? [] } : null,
    // Face-down traps: armed/decoy (and Factory traps entirely) are hidden
    // from everyone but the controller.
    traps: tokens.filter((token) => token.controllerId !== actorId),
    // Round-start offers queued for ANOTHER seat (Ballistics, Henrietta,
    // Overclock…) exist only because that seat holds the card in hand.
    offers: (((combat.warMachineRound as { pending?: Array<{ playerId?: unknown }> } | undefined)?.pending) ?? []).filter(
      (entry) => entry.playerId !== actorId
    )
  };
}

/** A seat id nobody holds: every per-viewer mask of player-view applies to it. */
const UNDO_PROBE_VIEWER = "__undo_probe__";

/**
 * The part of a pending choice that depends on hidden information: a choice
 * carrying PRIVATE content (a Rogues / Thieves' Guild peek at a deck top, a
 * Search reveal — anything player-view masks for other seats) and any choice
 * handed to ANOTHER seat (its very existence may come from their hidden hand).
 * Opening, changing or closing one is a reveal, so the action is not undoable
 * (otherwise a player could peek, then take the peek back).
 */
function hiddenChoicePart(choice: PendingChoice | null | undefined, actorId: PlayerId): unknown {
  if (!choice) return null;
  const raw = JSON.stringify(choice);
  if (JSON.stringify(getVisiblePendingChoice(choice, UNDO_PROBE_VIEWER)) !== raw) {
    return raw;
  }
  const owner = (choice as { playerId?: unknown }).playerId;
  return owner !== actorId ? [choice.id, choice.type, owner ?? null] : null;
}

/**
 * A reaction window opens only when some seat holds a usable reaction, so its
 * existence and ALLOWED seats come from hidden hands (an attack declaration
 * that opens a window shows the opponent holds an instant). Any change to it
 * therefore counts as a reveal.
 */
function reactionWindowPart(window: ReactionWindow | null | undefined): unknown {
  return window ? [window.id, window.allowedPlayerIds, window.priorityPlayerId, window.passedPlayerIds] : null;
}

/**
 * A key of everything HIDDEN from `actorId` (mirrors the masking rules of
 * getPlayerView / redactStateForSeat in player-view.ts). If an action changes
 * it, the action moved something out of (or into) a hidden zone — a draw, a
 * search, a flip, a sprung trap — and is not undoable. Deliberately broad: a
 * false "revealed" only makes undo unavailable, never unsafe.
 */
export function hiddenInfoKey(state: GameState, actorId: PlayerId): string {
  const players = Object.entries(state.players ?? {}).map(([playerId, player]) => {
    const own = playerId === actorId;
    return [
      playerId,
      // Deck ORDER is hidden from everyone, owner included.
      player.deck ?? [],
      own ? null : player.hand ?? [],
      own ? null : player.spellBook ?? [],
      own ? null : (player.scrolls ?? []).map((scroll) => scroll.spellCardIds ?? []),
      own ? null : player.preOrderWarMachines ?? []
    ];
  });
  const decks = Object.entries(state.decks ?? {}).map(([deckId, deck]) => [deckId, deck.drawPile ?? []]);
  const adventure = state.adventure as unknown as Loose;
  const tiles = adventure?.tiles as Record<string, { faceDown?: boolean; tileDefId?: string }> | undefined;
  const events = adventure?.events as
    | { pool?: Array<{ faceUp?: boolean; cardId?: unknown; deckId?: unknown }>; auction?: { bids?: Record<string, unknown> } | null }
    | undefined;
  const hiddenAdventure = adventure
    ? {
        faceDownTiles: Object.entries(tiles ?? {})
          .filter(([, tile]) => tile.faceDown)
          .map(([tileId, tile]) => [tileId, tile.tileDefId ?? null]),
        playerFarTiles: adventure.playerFarTiles ?? null,
        farTilePool: adventure.farTilePool ?? null,
        nearTilePool: adventure.nearTilePool ?? null,
        subterraneanTilePool: adventure.subterraneanTilePool ?? null,
        openingFirstPlayerSeed: adventure.openingFirstPlayerSeed ?? null,
        hexEvents: adventure.hexEvents ?? null,
        pandoraDeck: adventure.pandoraDeck ?? null,
        eventPool: (events?.pool ?? []).filter((entry) => !entry.faceUp).map((entry) => [entry.cardId, entry.deckId]),
        auctionBids: Object.entries(events?.auction?.bids ?? {}).filter(([seat]) => seat !== actorId)
      }
    : null;
  const parallel = Object.entries(state.parallelCombats ?? {}).map(([owner, context]) => {
    const neutral = (context as unknown as { neutralPlayer?: { hand?: unknown[]; deck?: unknown[] } }).neutralPlayer;
    return [
      owner,
      hiddenCombatParts(context.combat as unknown as Loose, actorId),
      neutral ? [neutral.hand ?? [], neutral.deck ?? []] : null,
      hiddenChoicePart(context.pendingChoice, actorId),
      reactionWindowPart(context.reactionWindow)
    ];
  });
  return hashString(
    JSON.stringify({
      players,
      decks,
      adventure: hiddenAdventure,
      combat: hiddenCombatParts(state.combat as unknown as Loose, actorId),
      choice: hiddenChoicePart(state.pendingChoice, actorId),
      reaction: reactionWindowPart(state.reactionWindow),
      parallel
    })
  );
}

/**
 * Table decisions that must never be rewound even when they involve no luck:
 * conceding / leaving, the AFK and departure votes (a seat handed to the
 * computer), the forced timeouts, the combat retake (itself a consented
 * rewind) and the computer watchdog. When one of them changes the game it
 * locks the history like a die roll does.
 */
const NEVER_UNDOABLE_ACTIONS = new Set<string>([
  "GIVE_UP",
  "LEAVE_GAME",
  "START_AFK_VOTE",
  "CAST_AFK_VOTE",
  "FORCE_AFK_KICK",
  "FORCE_TURN_TIMEOUT",
  "RESOLVE_AFK_DROP",
  "RESOLVE_TURN_TIMEOUT",
  "REQUEST_COMBAT_RETAKE",
  "ANSWER_COMBAT_RETAKE",
  "ADVANCE_COMPUTER",
  "UNDO_MOVE"
]);

/** Whether an action type is a table decision the 1v1 Undo never rewinds. */
export function actionNeverUndoable(actionType: string): boolean {
  return NEVER_UNDOABLE_ACTIONS.has(actionType);
}

/** The two seats of a 1v1 game (non-neutral players), or null if not 1v1. */
export function duelSeats(state: GameState): [PlayerId, PlayerId] | null {
  const seats = Object.keys(state.players ?? {}).filter((id) => id !== NEUTRAL_PLAYER_ID);
  return seats.length === 2 ? [seats[0], seats[1]] : null;
}

/**
 * Why the 1v1 Undo is not usable on this game right now, or null when it is.
 * "off" when the option is not on at all (callers hide the button then).
 */
export function duelUndoBlockReason(state: GameState): string | null {
  const adventure = state.adventure;
  if (!adventure?.duelUndo) return "off";
  // The testing "Undo moves" mode rewinds anything; it supersedes this one.
  if (adventure.undoMoves) return "The testing Undo mode is on for this game.";
  if (state.mode !== "adventure" || state.setupLobby) return "The adventure has not started yet.";
  if (adventure.winnerPlayerId) return "The game is over.";
  if (!duelSeats(state)) return "Undo is only available in 1v1 (2-player) games.";
  // USER RULING 2026-09-29: the 1v1 Undo may be used on ranked tables too
  // (the table opted in at setup; undo never crosses RNG or hidden info).
  return null;
}

/** The public status's freshness stamp (see UndoStatus.atEvent). */
export function undoStatusStamp(state: GameState): number {
  return Math.max(state.eventCounter ?? 0, state.eventLog?.length ?? 0);
}

/** Rule text shown with the option and on the button. */
export const DUEL_UNDO_RULE_TEXT =
  "Undo your own latest moves (hero moves, unit moves, deployment, choices) until your opponent acts. " +
  "Never past a die roll or any random result, a card draw or deck search, or a hidden tile, card or trap being revealed.";

/**
 * Client view of the 1v1 Undo button: whether to show it, the enabled state
 * and the reason / tooltip. Mirrors the server checks (which remain
 * authoritative — a stale click is simply refused).
 */
export function duelUndoButtonState(
  state: GameState,
  viewerPlayerId: PlayerId
): { visible: boolean; disabledReason: string | null; depth: number } {
  const blocked = duelUndoBlockReason(state);
  if (blocked === "off" || !duelSeats(state)?.includes(viewerPlayerId)) {
    return { visible: false, disabledReason: null, depth: 0 };
  }
  if (blocked) return { visible: true, disabledReason: blocked, depth: 0 };
  // A paused table is frozen: no move (and no take-back) until it resumes.
  if (gamePaused(state)) return { visible: true, disabledReason: "The table is paused.", depth: 0 };
  const status = state.undoStatus;
  if (!status) return { visible: true, disabledReason: "Nothing to undo yet.", depth: 0 };
  if (status.atEvent !== undoStatusStamp(state)) {
    return { visible: true, disabledReason: "The game moved on — nothing to undo.", depth: 0 };
  }
  if (status.playerId !== viewerPlayerId || status.depth <= 0) {
    const reason =
      status.lockedReason ??
      (status.playerId
        ? `Only ${state.players[status.playerId]?.name ?? status.playerId} can undo — it was their move.`
        : "Nothing to undo.");
    return { visible: true, disabledReason: reason, depth: 0 };
  }
  return { visible: true, disabledReason: null, depth: status.depth };
}
