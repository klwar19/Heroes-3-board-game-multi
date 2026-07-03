/**
 * Process-wide LobbyChatBoard singleton (globalThis-cached like the room /
 * account stores). Ephemeral by design: it lives only in memory, so a restart
 * clears the lobby feed — exactly the "temporary" behaviour we want, and why it
 * needs no disk persistence.
 */
import { LobbyChatBoard } from "./lobby-chat";

declare global {
  var __homm3bgLobbyChat: LobbyChatBoard | undefined;
}

export function getLobbyChatBoard(): LobbyChatBoard {
  const board = globalThis.__homm3bgLobbyChat ?? new LobbyChatBoard();
  globalThis.__homm3bgLobbyChat = board;
  return board;
}
