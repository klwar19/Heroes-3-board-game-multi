import type {
  CardId,
  DeckId,
  GameState,
  MapTileState,
  PendingChoice,
  PendingVisit,
  PlayerId,
  PlayerVisibleDeckState,
  PlayerVisiblePlayerState,
  PlayerVisibleState,
  ReactionWindow
} from "./state";
import { HIDDEN_CARD_ID } from "./state";
import { refillSharedDeckDiscards } from "./decks";

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Redact a FACE-DOWN tile for a player view: hide its identity (`tileDefId`) AND
 * its designer Ⅶ-field designation (`viiField`) plus its bonus (`viiFieldReward` /
 * `viiFieldVp`), so a hidden center slot's forced objective and reward are not
 * leaked before discovery. Every other field (band label, borders, pending token)
 * stays — the printed BACK is public. Face-up tiles are never passed here.
 */
function maskFaceDownTile(tile: MapTileState): MapTileState {
  const masked: MapTileState = { ...tile, tileDefId: "hidden" };
  delete masked.viiField;
  // The multi-select of allowed Ⅶ designations leaks the same objective info
  // as viiField — mask it too (the pick flags themselves are behaviour-public,
  // like a pending token: viewers may know a choice will open, not its set).
  delete masked.viiFields;
  delete masked.centerHex;
  delete masked.viiFieldReward;
  delete masked.viiFieldVp;
  return masked;
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

  // The two underground tile faces are private to the Hero who entered the
  // gate. Other seats can see that a decision is pending, but not either id.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "subterranean-tile-pick" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      prompt: "Choosing the Subterranean tile.",
      options: choice.options.map(() => ({ label: "Hidden tile" })),
      subterraneanTilePick: choice.subterraneanTilePick
        ? { ...choice.subterraneanTilePick, candidates: ["hidden", "hidden"] }
        : undefined
    };
  }

  // Search reveals stay private to the searcher; opponents only learn how
  // many cards were lifted off the deck.
  if (choice.type === "DECK_SEARCH" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      revealedCardIds: choice.revealedCardIds.map(() => "hidden")
    };
  }

  // Diplomacy's recruit choice is otherwise PUBLIC (the drawn Neutral cards are
  // announced in the feed), but its trailing inline Legion offers name the
  // owner's PRIVATE hand cards. Scrub exactly those trailing options + payload
  // for other seats, keeping the recruit/decline labels visible as before.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "diplomacy-recruit" &&
    choice.playerId !== viewerPlayerId &&
    (choice.diplomacyRecruit?.legionPlays?.length ?? 0) > 0
  ) {
    const firstLegionIndex = (choice.diplomacyRecruit?.recruitable.length ?? 0) + 1;
    return {
      ...cloneSerializable(choice),
      options: choice.options.map((option, index) =>
        index >= firstLegionIndex ? { label: "Play a card from hand" } : { ...option }
      ),
      diplomacyRecruit: {
        ...cloneSerializable(choice.diplomacyRecruit!),
        legionPlays: (choice.diplomacyRecruit!.legionPlays ?? []).map((play) => ({
          ...play,
          cardId: "hidden"
        }))
      }
    };
  }

  // Power-boost windows (map-spell-boost / visions-boost / fortune-boost): the
  // option labels name the caster's PRIVATE hand cards ("Discard <card> …"), so
  // other viewers only learn that the boost decision is open — never which
  // power sources are in hand. Payload card ids are scrubbed alongside.
  if (
    choice.type === "OPTION_CHOICE" &&
    (choice.context === "map-spell-boost" ||
      choice.context === "visions-boost" ||
      choice.context === "fortune-boost") &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      prompt:
        choice.context === "map-spell-boost"
          ? "Deciding whether to add Power to a map Spell."
          : choice.context === "visions-boost"
            ? "Visions: deciding whether to add Power."
            : "Fortune: deciding whether to add Power.",
      options: choice.options.map(() => ({ label: "Hidden option" })),
      ...(choice.mapSpellBoost
        ? {
            mapSpellBoost: {
              ...choice.mapSpellBoost,
              offers: choice.mapSpellBoost.offers.map(() => ({
                kind: "card" as const,
                cardId: "hidden",
                mode: "basic" as const,
                value: 0
              }))
            }
          }
        : {}),
      ...(choice.visionsBoost
        ? { visionsBoost: { ...choice.visionsBoost, spellCardIds: choice.visionsBoost.spellCardIds.map(() => "hidden") } }
        : {}),
      ...(choice.fortuneBoost
        ? { fortuneBoost: { ...choice.fortuneBoost, spellCardIds: choice.fortuneBoost.spellCardIds.map(() => "hidden") } }
        : {})
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
            ...(choice.visionsScry.tier ? { tier: choice.visionsScry.tier } : {}),
            remaining: choice.visionsScry.remaining.map(() => "hidden"),
            ...(choice.visionsScry.remainingTiers
              ? { remainingTiers: [...choice.visionsScry.remainingTiers] }
              : {}),
            toReturn: choice.visionsScry.toReturn.map(() => "hidden"),
            ...(choice.visionsScry.toReturnTiers
              ? { toReturnTiers: [...choice.visionsScry.toReturnTiers] }
              : {})
          }
        : undefined
    };
  }

  // Visions deck pick: the cards this cast has ALREADY lifted are private to the
  // caster (the visions-scry rule above) — the deck names/counts in the option
  // labels are public, and so is WHICH deck each lifted card came from (the pile
  // count moved), but never the card identities.
  if (choice.type === "OPTION_CHOICE" && choice.context === "visions-deck" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      visionsDeck: choice.visionsDeck
        ? { ...choice.visionsDeck, drawn: (choice.visionsDeck.drawn ?? []).map(() => "hidden") }
        : undefined
    };
  }

  // Diplomat's Cloak scry (Polish Set Artifacts): the Neutral card the holder is
  // looking at is private to them; opponents see only that a scry is happening.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "artifact-set-scry" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      options: choice.options.map(() => ({ label: "Hidden card" })),
      artifactSetScry: choice.artifactSetScry
        ? { ...choice.artifactSetScry, cardId: "hidden" }
        : undefined
    };
  }

  // Pandora scry: the shared-deck cards lifted off the top are revealed only to
  // the scrying player; opponents just see that a scry is happening.
  if (choice.type === "OPTION_CHOICE" && choice.context === "pandora-scry" && choice.playerId !== viewerPlayerId) {
    return {
      ...cloneSerializable(choice),
      options: choice.options.map(() => ({ label: "Hidden card" })),
      pandoraScry: choice.pandoraScry
        ? {
            deckId: choice.pandoraScry.deckId,
            remaining: choice.pandoraScry.remaining.map(() => "hidden"),
            toReturn: choice.pandoraScry.toReturn.map(() => "hidden"),
            discardsRemaining: choice.pandoraScry.discardsRemaining,
            then: choice.pandoraScry.then
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

  // Spellbinder's Hat played mid-combat: the removal menus name the owner's
  // (private) hand cards, so other viewers only learn that the choice is open.
  // (Option B also lists public discard cards, but masking the whole menu is
  // simpler and leaks nothing.)
  if (
    choice.type === "OPTION_CHOICE" &&
    (choice.context === "combat-remove-then-search" || choice.context === "combat-remove-another") &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      options: choice.options.map(() => ({ label: "Hidden card" })),
      removeThenSearch: choice.removeThenSearch
        ? { ...choice.removeThenSearch, cardIds: choice.removeThenSearch.cardIds.map(() => "hidden") }
        : undefined,
      removeAnother: choice.removeAnother
        ? { entries: choice.removeAnother.entries.map(() => ({ cardId: "hidden", source: "hand" as const })) }
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

  // "Which card sits face up?" (after a Search put 2+ cards back): the options
  // name cards only the searcher has seen. They become public the instant the
  // pick lands them on the discard pile, so this only keeps the reveal from
  // leaking one beat early — the same rule the DECK_SEARCH reveal itself follows.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "spell-discard-top" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      prompt: "Choosing which searched card sits face up on the discard pile.",
      options: choice.options.map(() => ({ label: "Hidden card" })),
      spellDiscardTopPick: choice.spellDiscardTopPick
        ? { ...choice.spellDiscardTopPick, cardIds: choice.spellDiscardTopPick.cardIds.map(() => "hidden"), keptCardId: undefined }
        : undefined
    };
  }

  // Positive Morale "Repeat Search": the offer names the card the Search just
  // gained — a card that went into the searcher's (private) hand, revealed to
  // no one else — so other viewers only learn that the offer is open.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "morale-repeat-search" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      prompt: "Positive Morale: deciding whether to repeat the Search.",
      options: choice.options.map(() => ({ label: "Hidden card" })),
      moraleRepeatSearch: choice.moraleRepeatSearch ? { ...choice.moraleRepeatSearch, cardId: "hidden" } : undefined
    };
  }

  // Thieves' Guild: the two peeked cards (and the option labels that name them)
  // stay private to the thieving player — even when an opponent's deck is the
  // one being looked at, the deck's owner does not learn which cards were on top.
  if (
    choice.type === "OPTION_CHOICE" &&
    choice.context === "thieves-guild" &&
    choice.playerId !== viewerPlayerId
  ) {
    return {
      ...cloneSerializable(choice),
      prompt: "A Thieves' Guild looks at the top of a deck.",
      options: choice.options.map(() => ({ label: "Hidden card" })),
      thievesGuild: choice.thievesGuild
        ? { ...choice.thievesGuild, cardIds: choice.thievesGuild.cardIds.map(() => "hidden") }
        : undefined
    };
  }

  return cloneSerializable(choice);
}

function getVisiblePendingVisit(visit: PendingVisit | null, viewerPlayerId: PlayerId): PendingVisit | null {
  if (!visit) {
    return null;
  }

  if (visit.playerId === viewerPlayerId) {
    return cloneSerializable(visit);
  }

  return {
    ...cloneSerializable(visit),
    steps: []
  };
}

export function getPlayerView(state: GameState, viewerPlayerId: PlayerId): PlayerVisibleState {
  const base = cloneSerializable(state);
  // A restored/legacy snapshot may predate the standing face-up-discard
  // invariant. Repair the detached view immediately so the table never renders
  // a shared Spell / Ability / Artifact discard as empty; the reducer performs
  // the same repair on the authoritative state at every action boundary.
  refillSharedDeckDiscards(base);
  // Computer policy memory is internal notes for AI seats — never show another
  // seat's focus/sticky/visit trail. The viewing computer seat may keep its own
  // (harmless for humans; observeForComputer also injects from authoritative).
  if (base.computerMemory) {
    const own = base.computerMemory[viewerPlayerId];
    base.computerMemory = own ? { [viewerPlayerId]: own } : {};
  }
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
        // Polish used Spells sit face up on the table and are public to every
        // seat, unlike the refreshed Book contents above.
        spellBookUsed: [...(player.spellBookUsed ?? [])],
        removed: [...player.removed],
        // Spell Scrolls show their symbol to everyone, but only the owner sees
        // which spells they hold (the cards sit face down near the hero).
        scrolls: player.scrolls
          ? player.scrolls.map((scroll) =>
              playerId === viewerPlayerId
                ? { ...scroll, spellCardIds: [...scroll.spellCardIds] }
                : { ...scroll, spellCardIds: scroll.spellCardIds.map(() => "hidden") }
            )
          : undefined,
        // Polish Set Artifacts: MIRROR the real, engine-synced public status —
        // never a recompute. A hosted client only ever holds a redacted frame
        // with every opponent's deck/hand masked, so re-deriving here would read
        // 0 for every opponent; passing the stored value through keeps the view
        // correct on every surface. [] when the rule is off (nothing is synced).
        // DESIGNED LEAK, see PlayerVisiblePlayerState.artifactSetStatus.
        artifactSetStatus: [...(player.artifactSetStatus ?? [])]
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
            tile.faceDown ? maskFaceDownTile(tile) : tile
          ])
        ),
        playerFarTiles: Object.fromEntries(
          Object.entries(base.adventure.playerFarTiles).map(([playerId, tiles]) => [
            playerId,
            tiles.map(() => "hidden")
          ])
        ),
        // The undrawn Ⅱ–Ⅲ pool is face down — players must not see which tiles
        // could come up; only its size (the reroll/draw headroom) shows.
        farTilePool: base.adventure.farTilePool?.map(() => "hidden"),
        // Same secrecy for the leftover Near (Ⅳ–Ⅴ) pool (designer resource pick).
        nearTilePool: base.adventure.nearTilePool?.map(() => "hidden"),
        // Gate-entry alternatives stay secret until offered to their owner.
        subterraneanTilePool: base.adventure.subterraneanTilePool?.map(() => "hidden"),
        // The delayed roll must use the same server entropy that assigned home
        // positions, but clients must not be able to predict its result.
        openingFirstPlayerSeed: undefined,
        // Designer hex events are INVISIBLE in the real game: clients never see
        // where they sit or what they do — an unsprung ambush must stay a
        // surprise. Both the live records AND the preset list are redacted for
        // every viewer (the engine announces a sprung event via the event log).
        hexEvents: undefined,
        mapPreset: base.adventure.mapPreset?.hexEvents
          ? { ...base.adventure.mapPreset, hexEvents: undefined }
          : base.adventure.mapPreset,
        // The Pandora's Box draw pile stays face down; only its size shows.
        pandoraDeck: base.adventure.pandoraDeck?.map(() => "hidden"),
        // Event resolution secrets: a face-down pool card (Magical Forest)
        // shows to nobody — after the shuffle even its contributor cannot tell
        // which entry is theirs — and an auction bid only to its bidder.
        events: base.adventure.events
          ? {
              ...base.adventure.events,
              pool: base.adventure.events.pool.map((entry) =>
                entry.faceUp ? entry : { ...entry, cardId: "hidden", deckId: "" }
              ),
              auction: base.adventure.events.auction
                ? {
                    ...base.adventure.events.auction,
                    bids:
                      viewerPlayerId in base.adventure.events.auction.bids
                        ? { [viewerPlayerId]: base.adventure.events.auction.bids[viewerPlayerId] }
                        : {}
                  }
                : null
            }
          : undefined,
        pendingVisit: getVisiblePendingVisit(base.adventure.pendingVisit, viewerPlayerId)
      }
    : null;

  // Face-down traps (Quicksand / Land Mine) keep their position and kind public
  // — the token sits on the board — but whether each is armed or a decoy stays
  // hidden from everyone but its controller. A trap is removed the instant a
  // unit springs it (see walkMoveThroughTokens), so only the caster ever learns
  // which of the face-down tokens still on the board are real.
  //
  // The PvE ENEMY FORCE hand is masked the same way an opponent's hand is: the
  // monster side's UNPLAYED card ids become `HIDDEN_CARD_ID` placeholders (the
  // COUNT stays public — the pre-fight prompt already announces "the enemy force
  // holds N cards", and a player must be able to see how many are left), while
  // `playedCardIds` stays exact, because a spent card was announced by name in
  // the feed and painted by the cue. Nobody "owns" the enemy force, so this is
  // masked for EVERY viewer, not just the opposing seat.
  const combat = base.combat
    ? {
        ...base.combat,
        battlefieldTokens: base.combat.battlefieldTokens?.map((token) =>
          token.controllerId !== viewerPlayerId &&
          (token.kind === "quicksand" || token.kind === "land_mine")
            ? { ...token, armed: undefined }
            : token
        ),
        ...(base.combat.enemyForce
          ? {
              enemyForce: {
                ...base.combat.enemyForce,
                cardIds: base.combat.enemyForce.cardIds.map((cardId) =>
                  base.combat!.enemyForce!.playedCardIds.includes(cardId) ? cardId : HIDDEN_CARD_ID
                )
              }
            }
          : {})
      }
    : base.combat;

  // Cards that enter a private hand or are discarded from one must not reach
  // multiplayer seats through the event log. Solo rooms have no human
  // opponent, so their owner keeps exact ids for a useful personal history;
  // multiplayer views get same-length hidden placeholders.
  const eventLog = base.eventLog.some(
    (event) =>
      (event.type === "PANDORA_CARD_DRAWN" ||
        event.type === "CARDS_DRAWN" ||
        event.type === "DECK_SEARCH_RESOLVED" ||
        event.type === "HAND_REFRESHED" ||
        event.type === "HAND_MULLIGAN") &&
      "playerId" in event &&
      (base.sessionMode === "single-player" ? event.playerId !== viewerPlayerId : true)
  )
    ? base.eventLog.map((event) => {
        if (event.type === "PANDORA_CARD_DRAWN" && event.playerId !== viewerPlayerId) {
          return { ...event, cardId: HIDDEN_CARD_ID };
        }
        if (
          event.type === "CARDS_DRAWN" &&
          (base.sessionMode !== "single-player" || event.playerId !== viewerPlayerId) &&
          event.cardIds
        ) {
          return { ...event, cardIds: event.cardIds.map(() => HIDDEN_CARD_ID) };
        }
        if (
          event.type === "DECK_SEARCH_RESOLVED" &&
          (base.sessionMode !== "single-player" || event.playerId !== viewerPlayerId)
        ) {
          return { ...event, discardedCardIds: event.discardedCardIds.map(() => HIDDEN_CARD_ID) };
        }
        if (
          event.type === "HAND_REFRESHED" &&
          (base.sessionMode !== "single-player" || event.playerId !== viewerPlayerId) &&
          event.discardedCardIds
        ) {
          return { ...event, discardedCardIds: event.discardedCardIds.map(() => HIDDEN_CARD_ID) };
        }
        if (
          event.type === "HAND_MULLIGAN" &&
          (base.sessionMode !== "single-player" || event.playerId !== viewerPlayerId) &&
          event.discardedCardIds
        ) {
          return { ...event, discardedCardIds: event.discardedCardIds.map(() => HIDDEN_CARD_ID) };
        }
        return event;
      })
    : base.eventLog;

  // Redact the room's password hash: its PRESENCE is preserved (so a UI can show
  // a "locked" badge) but the actual hash never appears in a rendered view. This
  // is hygiene, not secrecy — the raw state is still what the transport
  // broadcasts (see the note on RoomMembershipState.passwordHash); the
  // authoritative JOIN_ROOM check runs on the unredacted server state.
  const room =
    base.room && base.room.passwordHash
      ? { ...base.room, passwordHash: PASSWORD_REDACTED }
      : base.room;

  return {
    ...base,
    viewerPlayerId,
    players,
    decks,
    adventure,
    combat,
    eventLog,
    room,
    reactionWindow: getVisibleReactionWindow(base.reactionWindow, viewerPlayerId),
    pendingChoice: getVisiblePendingChoice(base.pendingChoice, viewerPlayerId)
  };
}

/** Sentinel that replaces a room's password hash in any player-facing view. */
export const PASSWORD_REDACTED = "__redacted__";

/**
 * The placeholder that stands in for a hidden card id on the wire. Defined in
 * `state.ts` (the types leaf) so a leaf derivation can recognise a masked zone
 * without importing this module; re-exported here for the historical name.
 */
export { HIDDEN_CARD_ID };

/** Whom to render for a connection that holds no seat (a spectator). */
export const OBSERVER_VIEWER_SEAT = "observer" as PlayerId;

function hiddenCards(count: number): CardId[] {
  return count > 0 ? new Array<CardId>(count).fill(HIDDEN_CARD_ID) : [];
}

/**
 * A GameState redacted for one seat, that is STILL a GameState (Phase 2 —
 * per-connection redaction). Where `getPlayerView` collapses another seat's
 * hidden cards to a count, this keeps the SHAPE — the count becomes an
 * equal-length array of "hidden" placeholders — so the frame a transport sends
 * to seat S carries no other seat's real hand / deck order / face-down tile ids,
 * yet the existing client (which re-runs `getPlayerView` on whatever it
 * receives) renders byte-for-byte identically: `getPlayerView` reads only the
 * array LENGTHS for opponents, which the placeholders preserve.
 *
 * Built ON `getPlayerView`, so every masking rule lives in exactly one place and
 * the two can never drift. Pass `OBSERVER_VIEWER_SEAT` for a spectator socket.
 */
export function redactStateForSeat(state: GameState, viewerPlayerId: PlayerId): GameState {
  const view = getPlayerView(state, viewerPlayerId);

  const players = Object.fromEntries(
    Object.entries(view.players).map(([playerId, player]) => {
      // Drop the visible-only count fields; rebuild the hidden arrays from them.
      // NOTE: `artifactSetStatus` (Polish Set Artifacts) is deliberately NOT
      // stripped here — unlike the counts it is REAL PlayerState the engine
      // syncs, and a hosted client needs it to render an opponent's set progress
      // it could never recompute from the masked zones.
      const { handCount, deckCount, spellBookCount, ...rest } = player;
      const isViewer = playerId === viewerPlayerId;
      return [
        playerId,
        {
          ...rest,
          // The viewer keeps its own real hand / Spell Book; opponents become
          // same-length placeholders. Deck ORDER is hidden from everyone,
          // including the owner (getPlayerView already emptied it for all).
          hand: isViewer ? [...player.hand] : hiddenCards(handCount),
          deck: hiddenCards(deckCount),
          spellBook: isViewer ? [...(player.spellBook ?? [])] : hiddenCards(spellBookCount),
          spellBookUsed: [...(player.spellBookUsed ?? [])]
        }
      ];
    })
  );

  const decks = Object.fromEntries(
    Object.entries(view.decks).map(([deckId, deck]) => {
      const { drawCount, ...rest } = deck;
      return [deckId, { ...rest, drawPile: hiddenCards(drawCount) }];
    })
  );

  // Strip the view-only `viewerPlayerId` marker so the result is a clean
  // GameState; the client stamps its own on render.
  const { viewerPlayerId: _omit, players: _p, decks: _d, ...base } = view;
  void _omit;
  void _p;
  void _d;
  return { ...base, players, decks } as GameState;
}
