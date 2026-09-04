import { NEUTRAL_PLAYER_ID, type GameState, type PlayerId } from "./state";

/**
 * "Arena duels" — the `arena-duel` custom win condition (1v1 ONLY).
 *
 * At the START of rounds 4, 8 and 12 the two main heroes are pulled into a PvP
 * battle wherever they stand on the map (no travel, no adjacency, no field is
 * contested), and the match is a BEST OF THREE: the first seat to win 2 duels
 * wins the game. The normal victory mode keeps running in parallel — conquest
 * can end the series at any time.
 *
 * This is the LEAF module: pure schedule/tally reads only, imported by
 * adventure.ts (round-start hook + the progress metric), adventure-reducer.ts
 * (the pump + the finalize tally) and adventure-setup.ts (the 1v1 gate). It must
 * never import from either of those.
 */

/** The fixed duel schedule (game ROUNDS). Even rounds ⇒ Astrologers rounds. */
export const ARENA_DUEL_ROUNDS: readonly number[] = [4, 8, 12];

/** Best of three: this many duel wins wins the whole game. */
export const ARENA_DUEL_WINS_TO_WIN = 2;

/** Which duel (1-based) a round hosts, or null for every other round. */
export function arenaDuelNumberForRound(round: number): number | null {
  const index = ARENA_DUEL_ROUNDS.indexOf(round);
  return index < 0 ? null : index + 1;
}

/** Whether the `arena-duel` condition is authored on this game's map preset. */
export function arenaDuelConditionActive(state: GameState): boolean {
  return Boolean(
    state.adventure?.mapPreset?.customWinConditions?.some(
      (condition) => condition.kind === "arena-duel"
    )
  );
}

/**
 * The two LIVE duelling seats, in turn order — or null when the table is not a
 * 1v1 right now. This is the defensive inertness guard: the build gate already
 * refuses a 3+ seat game, and a seat eliminated mid-series (conquest still
 * applies) leaves nothing to schedule.
 */
export function arenaDuelSeats(state: GameState): [PlayerId, PlayerId] | null {
  const live = state.turnOrder.filter(
    (id) => id !== NEUTRAL_PLAYER_ID && state.players[id] && !state.players[id]?.eliminated
  );
  return live.length === 2 ? [live[0]!, live[1]!] : null;
}

/**
 * Who ATTACKS in a given duel. It alternates so neither seat always holds the
 * attacker's initiative: duels 1 and 3 are opened by the first live seat in
 * turn order, duel 2 by the second.
 */
export function arenaDuelAttackerIndex(duel: number): 0 | 1 {
  return duel % 2 === 0 ? 1 : 0;
}

/** A seat's duel wins so far (0 on a game with no series). */
export function arenaDuelWins(state: GameState, playerId: PlayerId): number {
  return state.adventure?.arenaDuels?.wins?.[playerId] ?? 0;
}
