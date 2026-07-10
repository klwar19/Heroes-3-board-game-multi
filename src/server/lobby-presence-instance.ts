/**
 * Process-wide LobbyPresenceBoard singleton (globalThis-cached like the lobby
 * chat / room / account stores). Ephemeral by design: it lives only in memory,
 * so a restart clears presence — exactly the "temporary" behaviour we want, and
 * why it needs no disk persistence. Entries self-expire via the board's TTL, so
 * a lost tab drops off on its own without any cleanup job.
 */
import { LobbyPresenceBoard } from "./lobby-presence";

declare global {
  var __homm3bgLobbyPresence: LobbyPresenceBoard | undefined;
}

export function getLobbyPresenceBoard(): LobbyPresenceBoard {
  const board = globalThis.__homm3bgLobbyPresence ?? new LobbyPresenceBoard();
  globalThis.__homm3bgLobbyPresence = board;
  return board;
}
