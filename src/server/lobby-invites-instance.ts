/**
 * Process-wide LobbyInviteBoard singleton (globalThis-cached like lobby chat /
 * presence). Ephemeral by design: a restart clears pending invites.
 */
import { LobbyInviteBoard } from "./lobby-invites";

declare global {
  // eslint-disable-next-line no-var
  var __homm3bgLobbyInvites: LobbyInviteBoard | undefined;
}

export function getLobbyInviteBoard(): LobbyInviteBoard {
  const board = globalThis.__homm3bgLobbyInvites ?? new LobbyInviteBoard();
  globalThis.__homm3bgLobbyInvites = board;
  return board;
}
