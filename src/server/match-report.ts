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
 * What counts as a recordable match (deliberately strict, documented). Every
 * match below records each account's WIN/LOSS (so a give-up / quit shows on the
 * profile even in a NORMAL game); the `ranked` flag then decides whether MMR
 * also moves (RANKED) or stays put (NORMAL) — see recordMatchResult:
 *  - the game ended with a declared winner seat (`adventure.winnerPlayerId`);
 *    a bare `game-over` with no winner (or a neutral "winner") attributes
 *    nothing;
 *  - only members bound to a VERIFIED account (`RoomMember.userId`) on a real
 *    seat participate — guests and observers are invisible to the ladder;
 *  - QUITTING LOSES POINTS: accounts seated when the adventure started
 *    (`room.matchSeats`, stamped at map build) that no longer hold their seat at
 *    game end — left the room, stepped down to observer, host-kicked — are
 *    reported as "abandon" (an Elo loss). Deleting your membership row cannot
 *    dodge the ladder;
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
  /**
   * Whether this game counts toward MMR/Elo. A NORMAL ("casual") table still
   * records the WIN/LOSS on each account (so a give-up / quit shows up on the
   * profile), but leaves the rating untouched — only a RANKED game moves MMR.
   */
  ranked: boolean;
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
  if (next.sessionMode === "single-player" || next.room?.visibility === "private") return null;
  // A NORMAL ("casual") table still records the WIN/LOSS on each account — so a
  // give-up / quit is reflected on the profile even in a casual game — but does
  // NOT move MMR (see `ranked` on the result, honoured by recordMatchResult).
  // `ranked === false` is the explicit opt-out set by the lobby's Ranked/Normal
  // picker; an absent flag (legacy rooms) stays ranked, unchanged.
  const ranked = next.room?.ranked !== false;
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
  // Seat → account, LIVE members first. These are players still in the room at
  // game end: their result comes from their seat (win / abandon-if-vote-kicked /
  // loss). Eliminated players keep their seat membership, so every loser who
  // stayed — conquered, resigned or vote-kicked — is attributed here.
  const liveByAccount = new Map<string, { seat: string; nickname: string }>();
  for (const member of seatHolders) {
    if ((seatsPerAccount.get(member.userId!) ?? 0) > 1) {
      continue;
    }
    liveByAccount.set(member.userId!, { seat: member.seat, nickname: member.name });
  }
  // Deserters: the seat → account snapshot frozen when the adventure STARTED
  // (room.matchSeats). An account that was seated at the start but no longer
  // holds that seat now — left the room, stepped down to observer, was kicked
  // by the host — is reported as "abandon" (an Elo loss), so quitting a ranked
  // game can never dodge the ladder. If their seat is the winning seat (their
  // faction won by last-standing after they left) they still get the win.
  // Games started before the snapshot existed simply have no extra entries.
  const participants: FinishedMatch["participants"] = [];
  for (const [accountId, live] of liveByAccount) {
    const result: FinishedMatch["participants"][number]["result"] =
      live.seat === winnerSeat ? "win" : next.players?.[live.seat]?.kickedByVote ? "abandon" : "loss";
    participants.push({ accountId, nickname: live.nickname, result });
  }
  for (const [seat, bound] of Object.entries(next.room?.matchSeats ?? {})) {
    if (!bound.userId || (seatsPerAccount.get(bound.userId) ?? 0) > 1) {
      continue; // guest seat, or an ambiguous multi-seat account (dropped above).
    }
    if (liveByAccount.has(bound.userId) || participants.some((p) => p.accountId === bound.userId)) {
      continue; // the account is already attributed (still here, or moved seats).
    }
    participants.push({
      accountId: bound.userId,
      nickname: bound.name,
      result: seat === winnerSeat ? "win" : "abandon"
    });
  }
  const hasWinner = participants.some((p) => p.result === "win");
  const hasLoser = participants.some((p) => p.result === "loss" || p.result === "abandon");
  if (participants.length < 2 || !hasWinner || !hasLoser) {
    return null;
  }
  return { matchId: next.seed, ranked, participants };
}

