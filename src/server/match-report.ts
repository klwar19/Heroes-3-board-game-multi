/**
 * Automatic match-result reporting (plan Phase 6 — the piece that turns the
 * store's tested `recordMatchResult` + Elo into a LIVE ladder): when an applied
 * action moves a game into its terminal state, the seated VERIFIED accounts
 * get a win/loss recorded, exactly once per game instance.
 *
 * Isomorphic core + thin trigger:
 *  - `detectFinishedMatch(prev, next)` is pure and shared by BOTH backends —
 *    the built-in store calls it inline after `applyAction`, and the PartyKit
 *    room Durable Object calls the same function and POSTs the result to
 *    `/api/matches/report` (it has no database access of its own).
 *  - Idempotency: the matchId is the game's `state.seed` — unique per room
 *    creation AND per reset (a crypto nonce is baked in) — and both account
 *    backends no-op a repeated matchId, so double delivery (retry, both
 *    transports racing, a duplicate action broadcast) can never double-count.
 *
 * What counts as a RANKED match (deliberately strict, documented):
 *  - the game ended with a declared winner seat (`adventure.winnerPlayerId`);
 *    a bare `game-over` with no winner (or a neutral "winner") attributes
 *    nothing;
 *  - only members bound to a VERIFIED account (`RoomMember.userId`) on a real
 *    seat participate — guests and observers are invisible to the ladder;
 *  - at least TWO distinct accounts, including the winner and at least one
 *    loser: solo games, games against neutrals only, and one-account tables
 *    (self-play across tabs) are never ranked;
 *  - an account occupying more than one seat disqualifies itself (ambiguous),
 *    never the whole match.
 */
// ISOMORPHIC — this module is bundled into the PartyKit Worker (party/index.ts
// imports the detector), so it must never import Node built-ins or the account
// store; the Node-side trigger lives in match-report-trigger.ts.
import { NEUTRAL_PLAYER_ID, type GameState } from "@/engine";
import type { MatchParticipantInput } from "@/server/accounts/account-store";

export type FinishedMatch = {
  /** Idempotency key: the finished game's unique seed. */
  matchId: string;
  participants: (MatchParticipantInput & { nickname: string })[];
};

/** Terminal-state test shared by every reporter. */
export function gameIsOver(state: GameState): boolean {
  return state.phase === "game-over" || Boolean(state.adventure?.winnerPlayerId);
}

/**
 * The ranked result of the game that JUST finished between these two snapshots,
 * or null when nothing ranked happened (not a transition, no winner seat, not
 * enough verified accounts). Pure — safe on any runtime, including the edge.
 */
export function detectFinishedMatch(prev: GameState, next: GameState): FinishedMatch | null {
  if (gameIsOver(prev) || !gameIsOver(next)) {
    return null;
  }
  const winnerSeat = next.adventure?.winnerPlayerId;
  if (!winnerSeat || winnerSeat === NEUTRAL_PLAYER_ID) {
    return null;
  }
  const members = next.room?.members ?? [];
  const seatHolders = members.filter((member) => member.userId && member.seat !== "observer");
  // An account on MORE than one seat is ambiguous (self-play across tabs on an
  // open table) — drop that account, keep the match for everyone else.
  const seatsPerAccount = new Map<string, number>();
  for (const member of seatHolders) {
    seatsPerAccount.set(member.userId!, (seatsPerAccount.get(member.userId!) ?? 0) + 1);
  }
  const participants: FinishedMatch["participants"] = [];
  for (const member of seatHolders) {
    if ((seatsPerAccount.get(member.userId!) ?? 0) > 1) {
      continue;
    }
    // A seat removed by the table's AFK kick vote is reported as "abandon":
    // Elo and the loss column treat it exactly like a loss (see the account
    // store), but the record keeps the drop distinguishable from a fought
    // defeat. Eliminated players keep their seat membership, so every loser —
    // kicked, conquered or resigned — still gets their result here.
    const result: FinishedMatch["participants"][number]["result"] =
      member.seat === winnerSeat ? "win" : next.players?.[member.seat]?.kickedByVote ? "abandon" : "loss";
    participants.push({
      accountId: member.userId!,
      nickname: member.name,
      result
    });
  }
  const hasWinner = participants.some((p) => p.result === "win");
  const hasLoser = participants.some((p) => p.result === "loss" || p.result === "abandon");
  if (participants.length < 2 || !hasWinner || !hasLoser) {
    return null;
  }
  return { matchId: next.seed, participants };
}

