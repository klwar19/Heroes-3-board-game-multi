import type { CardId, GameState, PlayerId } from "./state";

/** Move a newly acquired machine out of hand until its owner's next turn. */
export function deferPreOrderWarMachine(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  if (state.adventure?.astrologers?.activeCardId !== "astrologers.pre_order") return false;
  const player = state.players[playerId];
  const index = player?.hand.lastIndexOf(cardId) ?? -1;
  if (!player || index < 0) return false;
  player.hand.splice(index, 1);
  (player.preOrderWarMachines ??= []).push(cardId);
  return true;
}

export function deliverPreOrderWarMachines(state: GameState, playerId: PlayerId): CardId[] {
  const player = state.players[playerId];
  const pending = player?.preOrderWarMachines ?? [];
  if (!player || pending.length === 0) return [];
  player.hand.push(...pending);
  player.preOrderWarMachines = [];
  return pending;
}
