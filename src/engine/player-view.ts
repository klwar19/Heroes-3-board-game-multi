import type {
  DeckId,
  GameState,
  PendingChoice,
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

function getVisiblePendingChoice(choice: PendingChoice, viewerPlayerId: PlayerId): PendingChoice {
  if (!choice) {
    return null;
  }

  // Search reveals stay private to the searcher; opponents only learn how
  // many cards were lifted off the deck.
  if (choice.type === "DECK_SEARCH" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      revealedCardIds: choice.revealedCardIds.map(() => "hidden")
    };
  }

  // Own-deck searches (Mana Vortex): the revealed cards and their labels stay
  // private to the searching player.
  if (choice.type === "OPTION_CHOICE" && choice.context === "own-deck-pick" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      options: choice.options.map(() => ({ label: "Hidden card" })),
      ownDeckPick: choice.ownDeckPick ? { cardIds: choice.ownDeckPick.cardIds.map(() => "hidden") } : undefined
    };
  }

  // Visions scry: the Neutral Unit cards lifted off the shared deck are revealed
  // only to the scrying player; opponents just see that a scry is happening.
  if (choice.type === "OPTION_CHOICE" && choice.context === "visions-scry" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      options: choice.options.map(() => ({ label: "Hidden card" })),
      visionsScry: choice.visionsScry
        ? {
            tier: choice.visionsScry.tier,
            remaining: choice.visionsScry.remaining.map(() => "hidden"),
            toReturn: choice.visionsScry.toReturn.map(() => "hidden")
          }
        : undefined
    };
  }

  // Magi Power Drain: the candidate Power cards are the defender's hand, so
  // their identities stay private to the choosing player.
  if (choice.type === "COMBAT_HAND_DISCARD" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      powerCardIds: choice.powerCardIds.map(() => "hidden")
    };
  }

  // Quicksand / Land Mine placement: the armed/decoy split the caster is laying
  // down stays private to them, so an opponent never learns which of the
  // face-down tokens are real before a unit springs one.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "place-battlefield-tokens" &&
    choice.playerId !== viewerPlayerId &&
    choice.placeTokens
  ) {
    return {
      ...cloneSerializable(choice),
      placeTokens: { ...choice.placeTokens, armedSlots: choice.placeTokens.armedSlots.map(() => false) }
    };
  }

  // Genies' Wish: the Spells dug out of the controller's own deck stay private
  // to them — opponents only learn how many Spells were offered.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "genie-take-spell" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      options: choice.options.map(() => ({ label: "Hidden Spell" })),
      genieTakeSpell: choice.genieTakeSpell
        ? { ...choice.genieTakeSpell, spellCardIds: choice.genieTakeSpell.spellCardIds.map(() => "hidden") }
        : undefined
    };
  }

  // Rogues' scout: the peeked top card stays private to the scouting player.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "rogues-scout" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      prompt: "A Rogue scouts a deck.",
      rogueScout: choice.rogueScout ? { ...choice.rogueScout, cardId: "hidden" } : undefined
    };
  }

  return cloneSerializable(choice);
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
        // Nobody, including the owner, may read the draw pile order.
        deck: [],
        deckCount: player.deck.length,
        discard: [...player.discard],
        // Spell Book (house rule): a face-down personal library — only the owner
        // sees which Spells it holds; opponents learn just the count. `?? []`
        // guards a game serialized before the Spell Book release (no spellBook
        // field): spreading undefined would throw on every render and strand the
        // player on the crash screen. healLegacyPlayerFields backfills it too.
        spellBook: playerId === viewerPlayerId ? [...(player.spellBook ?? [])] : [],
        spellBookCount: (player.spellBook ?? []).length,
        removed: [...player.removed],
        // Spell Scrolls show their symbol to everyone, but only the owner sees
        // which spells they hold (the cards sit face down near the hero).
        scrolls: player.scrolls
          ? player.scrolls.map((scroll) =>
              playerId === viewerPlayerId
                ? { ...scroll, spellCardIds: [...scroll.spellCardIds] }
                : { ...scroll, spellCardIds: scroll.spellCardIds.map(() => "hidden") }
            )
          : undefined
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

  // Hidden adventure information: face-down tiles keep their position but
  // not their identity. Far tile supplies stay face down even for their
  // owner ("All face-down Tiles should be kept hidden from all players until
  // they are about to be placed or revealed") — only the II–III back shows.
  const adventure = base.adventure
    ? {
        ...base.adventure,
        tiles: Object.fromEntries(
          Object.entries(base.adventure.tiles).map(([tileId, tile]) => [
            tileId,
            tile.faceDown ? { ...tile, tileDefId: "hidden" } : tile
          ])
        ),
        playerFarTiles: Object.fromEntries(
          Object.entries(base.adventure.playerFarTiles).map(([playerId, tiles]) => [
            playerId,
            tiles.map(() => "hidden")
          ])
        ),
        // The Pandora's Box draw pile stays face down; only its size shows.
        pandoraDeck: base.adventure.pandoraDeck?.map(() => "hidden")
      }
    : null;

  // Face-down traps (Quicksand / Land Mine) keep their position and kind public
  // — the token sits on the board — but whether each is armed or a decoy stays
  // hidden from everyone but its controller. A trap is removed the instant a
  // unit springs it (see walkMoveThroughTokens), so only the caster ever learns
  // which of the face-down tokens still on the board are real.
  const combat = base.combat
    ? {
        ...base.combat,
        battlefieldTokens: base.combat.battlefieldTokens?.map((token) =>
          token.controllerId !== viewerPlayerId &&
          (token.kind === "quicksand" || token.kind === "land_mine")
            ? { ...token, armed: undefined }
            : token
        )
      }
    : base.combat;

  return {
    ...base,
    viewerPlayerId,
    players,
    decks,
    adventure,
    combat,
    reactionWindow: getVisibleReactionWindow(base.reactionWindow, viewerPlayerId),
    pendingChoice: getVisiblePendingChoice(base.pendingChoice, viewerPlayerId)
  };
}
