import type {
  DeckId,
  GameState,
  PlayerId,
  PlayerVisibleDeckState,
  PlayerVisiblePlayerState,
  PlayerVisibleState,
  ReactionWindow
} from "./state";

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getVisibleReactionWindow(window: ReactionWindow | null, viewerPlayerId: PlayerId): ReactionWindow | null {
  if (!window) {
    return null;
  }

  return {
    ...window,
    triggerEvent: cloneSerializable(window.triggerEvent),
    allowedPlayerIds: [...window.allowedPlayerIds],
    legalReactions: {
      [viewerPlayerId]: cloneSerializable(window.legalReactions[viewerPlayerId] ?? [])
    },
    passedPlayerIds: [...window.passedPlayerIds]
  };
}

export function getPlayerView(state: GameState, viewerPlayerId: PlayerId): PlayerVisibleState {
  const base = cloneSerializable(state);
  const players = Object.fromEntries(
    Object.entries(base.players).map<[PlayerId, PlayerVisiblePlayerState]>(([playerId, player]) => [
      playerId,
      {
        ...player,
        hand: playerId === viewerPlayerId ? [...player.hand] : [],
        handCount: player.hand.length,
        discard: [...player.discard]
      }
    ])
  );
  const decks = Object.fromEntries(
    Object.entries(base.decks).map<[DeckId, PlayerVisibleDeckState]>(([deckId, deck]) => [
      deckId,
      {
        id: deck.id,
        drawCount: deck.drawPile.length,
        discardPile: [...deck.discardPile]
      }
    ])
  );

  return {
    ...base,
    viewerPlayerId,
    players,
    decks,
    reactionWindow: getVisibleReactionWindow(base.reactionWindow, viewerPlayerId)
  };
}
