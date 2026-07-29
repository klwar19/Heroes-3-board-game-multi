import type { GameAction } from "@/engine";

/**
 * Pending-action echo (plan: partykit-network-upgrade slice N2) — the honest,
 * bounded version of "optimistic UI" for a server-authoritative game:
 * instant presentation-only feedback in the click→ack window.
 *
 * HARD BOUNDARIES (these make it safe — see the plan §1.2 for why full
 * client-side prediction is rejected permanently): an echo entry NEVER
 * mutates or predicts GameState, never gates prompts or legal actions, and
 * never suppresses the authoritative snapshot's presentation. Rollback is
 * "remove a CSS state", not state reconciliation. Every entry self-clears on
 * ack, error result, thrown submit (the transport's 15 s timeout), or —
 * belt-and-braces for a hung fetch on the built-in backend — the TTL prune
 * run on snapshot accept.
 *
 * Pure data + functions, free of React: page.tsx keeps the state in a ref (so
 * the duplicate-submit latch reads synchronously) mirrored into a useState
 * for rendering. Functions return the SAME reference when nothing changed.
 */

export type PendingActionEcho = {
  /** Locally-minted id — the client-side analogue of the transport requestId. */
  id: number;
  /** Stable fingerprint of the submitted action (duplicate-submit latch). */
  key: string;
  actionType: GameAction["type"];
  /** The hand card visually leaving the hand, when the action plays one. */
  cardId?: string;
  /** Wall-clock submit time (Date.now()). */
  at: number;
};

export type PendingEchoState = {
  nextId: number;
  entries: readonly PendingActionEcho[];
};

/**
 * Covers the 15 s receipt deadline plus the 60 s post-receipt processing
 * deadline, so a truly slow action cannot be submitted twice while in flight.
 */
export const PENDING_ECHO_TTL_MS = 75_000;
/**
 * After this long without an ack the echo styles as "slow network" (the
 * user-visible symptom of N3's RTT chip). Applied purely in CSS via an
 * animation delay on .cardInFlight — no JS timer, no re-render.
 */
export const PENDING_ECHO_SLOW_MS = 400;

export function initialPendingEchoState(): PendingEchoState {
  return { nextId: 1, entries: [] };
}

/**
 * Wall-clock for echo timestamps — the same indirection metricNow() uses, so
 * call sites in component scope stay clean under the react-hooks purity lint
 * (an inline Date.now() in the component body is flagged as render-impure).
 */
export function echoNow(): number {
  return Date.now();
}

/** Stable fingerprint: identical resubmits of the SAME action collide. */
export function pendingEchoKey(action: GameAction): string {
  return JSON.stringify(action);
}

/**
 * The hand card a submitted action plays, for the in-flight dim. Only true
 * HAND plays echo — Spell Book / Scroll / own-discard casts leave the hand
 * untouched, so dimming a same-id hand copy would lie.
 */
function handCardIdOf(action: GameAction): string | undefined {
  if (action.type !== "PLAY_CARD" && action.type !== "CAST_SPELL") {
    return undefined;
  }
  const source = action as {
    cardId: string;
    fromSpellBook?: boolean;
    fromScroll?: boolean;
    fromSpellDeck?: boolean;
    fromOwnDiscard?: boolean;
  };
  if (source.fromSpellBook || source.fromScroll || source.fromSpellDeck || source.fromOwnDiscard) {
    return undefined;
  }
  return source.cardId;
}

function sweep(entries: readonly PendingActionEcho[], now: number, ttlMs: number): readonly PendingActionEcho[] {
  return entries.some((entry) => now - entry.at >= ttlMs)
    ? entries.filter((entry) => now - entry.at < ttlMs)
    : entries;
}

export type BeginEchoResult =
  | { accepted: true; id: number; state: PendingEchoState }
  | { accepted: false; state: PendingEchoState };

/**
 * Register a submit. Refused when the SAME action is already in flight — the
 * duplicate-click latch. Stale entries are swept first, so a lost ack can
 * never wedge the latch shut (and a different action is never blocked).
 */
export function beginPendingEcho(
  state: PendingEchoState,
  action: GameAction,
  now: number,
  ttlMs: number = PENDING_ECHO_TTL_MS
): BeginEchoResult {
  const alive = sweep(state.entries, now, ttlMs);
  const key = pendingEchoKey(action);
  if (alive.some((entry) => entry.key === key)) {
    return {
      accepted: false,
      state: alive === state.entries ? state : { ...state, entries: alive }
    };
  }
  const entry: PendingActionEcho = {
    id: state.nextId,
    key,
    actionType: action.type,
    cardId: handCardIdOf(action),
    at: now
  };
  return {
    accepted: true,
    id: entry.id,
    state: { nextId: state.nextId + 1, entries: [...alive, entry] }
  };
}

/**
 * Remove one entry: called from the submit's settle path — ack (success),
 * error result (the "restore" — dropping the entry un-dims the card), or a
 * thrown submit (network failure / the transport's own 15 s timeout).
 */
export function resolvePendingEcho(state: PendingEchoState, id: number): PendingEchoState {
  if (!state.entries.some((entry) => entry.id === id)) {
    return state;
  }
  return { ...state, entries: state.entries.filter((entry) => entry.id !== id) };
}

/**
 * TTL sweep, run on snapshot accept: a submit whose promise never settles (a
 * hung fetch on the built-in backend has no timeout) still clears here.
 */
export function prunePendingEchoes(
  state: PendingEchoState,
  now: number,
  ttlMs: number = PENDING_ECHO_TTL_MS
): PendingEchoState {
  const alive = sweep(state.entries, now, ttlMs);
  return alive === state.entries ? state : { ...state, entries: alive };
}

const NO_CARDS: ReadonlySet<string> = new Set();

/** Hand card ids currently in flight — the hand panels dim exactly these. */
export function pendingEchoCardIds(state: PendingEchoState): ReadonlySet<string> {
  if (!state.entries.some((entry) => entry.cardId)) {
    return NO_CARDS;
  }
  const ids = new Set<string>();
  for (const entry of state.entries) {
    if (entry.cardId) {
      ids.add(entry.cardId);
    }
  }
  return ids;
}
