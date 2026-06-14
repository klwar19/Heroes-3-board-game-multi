"use client";

/* eslint-disable @next/next/no-img-element */

import { Anchor, Crown, Hourglass, Layers, Search, Sparkles } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import { getDeckBack } from "@/data/decks";
import {
  describeCardEffect,
  describePermanentEffect,
  getPermanentCardIds,
  playerSpellCastsIgnoreLimit,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState,
  type SharedDeckId
} from "@/engine";
import {
  actionKey,
  cardName,
  cardSelectionKey,
  getCardMetaLabels,
  isBoardTargetCardAction,
  sameCardSelection,
  targetName,
  type CardBoardAction
} from "./utils";
import { useCardZoom, ZoomButton } from "./zoom";

export function CardFrame({
  cardId,
  className,
  title
}: {
  cardId?: string;
  className: string;
  title?: string;
}) {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const src = card?.assets?.cardImage;
  const alt = card?.assets?.imageAlt ?? card?.name ?? cardId ?? "card";

  if (!src) {
    return (
      <div className={`${className} cardFaceFallback`} title={title ?? alt}>
        {card?.name ?? cardId ?? "?"}
      </div>
    );
  }

  return <img alt={alt} className={className} loading="eager" referrerPolicy="no-referrer" src={assetUrl(src)} title={title ?? alt} />;
}

/**
 * The permanent cards in play next to a player's hero board — one as
 * printed, up to three with the Pandora's Box exception. Their effects are
 * always on. Each card shows a "permanent" badge, a voluntary "discard from
 * play" button when the engine offers it, and the School of Magic expert
 * discard whenever USE_PERMANENT_EXPERT is legal for the owner.
 */
export function PermanentSlot({
  state,
  playerId,
  viewerPlayerId,
  legalActions,
  onAction,
  compact = false
}: {
  state: GameState;
  playerId: PlayerId;
  viewerPlayerId?: PlayerId;
  legalActions?: LegalAction[];
  onAction?: (action: GameAction) => void;
  compact?: boolean;
}) {
  const { zoomCard } = useCardZoom();
  const cardIds = getPermanentCardIds(state, playerId);
  // Ongoing cards held in play: they reach the discard pile (or a recalled
  // spell the hand) only after their effect ends.
  const ongoingCards = state.players[playerId]?.ongoingCards ?? [];
  if (cardIds.length === 0 && ongoingCards.length === 0) {
    return null;
  }

  const ownView = Boolean(onAction && viewerPlayerId === playerId);
  const expert = ownView
    ? legalActions?.find((legal) => legal.action.type === "USE_PERMANENT_EXPERT")
    : undefined;
  const discardActionFor = (cardId: string) =>
    ownView
      ? legalActions?.find(
          (legal) => legal.action.type === "DISCARD_PERMANENT" && legal.action.cardId === cardId
        )
      : undefined;

  return (
    <div
      className={`permanentRow ${compact ? "compact" : ""}`}
      aria-label={`${state.players[playerId]?.name} permanents in play`}
    >
      {cardIds.map((cardId, index) => {
        const card = cardLibrary[cardId];
        const discard = discardActionFor(cardId);

        return (
          <div className={`permanentSlot ${compact ? "compact" : ""}`} key={`${cardId}-${index}`}>
            <button
              className="permanentCardButton"
              onClick={() => zoomCard(cardId)}
              title={card ? `${card.name} — ${describePermanentEffect(card)}` : cardId}
              type="button"
            >
              <CardFrame cardId={cardId} className="permanentCardImage" />
            </button>
            <div className="permanentMeta">
              <span className="permanentBadge">
                <Anchor aria-hidden="true" size={11} /> permanent
              </span>
              {!compact ? <strong>{card?.name ?? cardId}</strong> : null}
              {!compact && card ? <small>{describePermanentEffect(card)}</small> : null}
              {expert && index === 0 ? (
                <button className="commandButton" onClick={() => onAction?.(expert.action)} type="button">
                  <Crown aria-hidden="true" size={12} /> {expert.label}
                </button>
              ) : null}
              {discard ? (
                <button
                  className="commandButton ghost"
                  onClick={() => onAction?.(discard.action)}
                  title="Voluntarily put this permanent into your discard pile (its effect stops immediately)"
                  type="button"
                >
                  Discard from play
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {ongoingCards.map((held, index) => {
        const card = cardLibrary[held.cardId];
        return (
          <div className={`permanentSlot ongoing ${compact ? "compact" : ""}`} key={`ongoing-${held.cardId}-${index}`}>
            <button
              className="permanentCardButton"
              onClick={() => zoomCard(held.cardId)}
              title={`${card?.name ?? held.cardId} stays in play until its effect ends, then goes to the ${
                held.returnTo === "hand" ? "hand (recalled)" : "discard pile"
              }.`}
              type="button"
            >
              <CardFrame cardId={held.cardId} className="permanentCardImage" />
            </button>
            <div className="permanentMeta">
              <span className="permanentBadge ongoingBadge">
                <Hourglass aria-hidden="true" size={11} /> ongoing
              </span>
              {!compact ? <strong>{card?.name ?? held.cardId}</strong> : null}
              {!compact ? (
                <small>
                  Until the effect ends, then → {held.returnTo === "hand" ? "hand (recalled)" : "discard"}
                </small>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CardBack({ className, deckId }: { className?: string; deckId?: string }) {
  const back = getDeckBack(deckId);
  if (back.image) {
    return <img alt={back.label} aria-hidden="true" className={`cardBack ${className ?? ""}`} src={assetUrl(back.image)} />;
  }
  return (
    <div className={`cardBack back-${back.styleKey} ${className ?? ""}`} aria-hidden="true" title={back.label}>
      <span>H3</span>
    </div>
  );
}

type HandCardEntry = {
  handIndex: number;
  cardId: string;
  boardSelections: CardBoardAction[];
  immediateActions: LegalAction[];
};

export function HandFan({
  view,
  state,
  viewerPlayerId,
  legalActions,
  selectedCardAction,
  trayActive,
  hiddenTailCount = 0,
  onSelectCardAction,
  onAction
}: {
  view: PlayerVisibleState;
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  selectedCardAction: CardBoardAction | null;
  trayActive: boolean;
  /** Freshly drawn cards stay hidden while their draw flight is in the air. */
  hiddenTailCount?: number;
  onSelectCardAction: (action: CardBoardAction | null) => void;
  onAction: (action: GameAction) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { zoomCard } = useCardZoom();
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  const cardActions = legalActions.filter(
    (legal): legal is LegalAction & { action: CardBoardAction } =>
      legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD"
  );

  const playerState = state.players[viewerPlayerId];
  const ignoreSpellLimit = Boolean(playerState) && playerSpellCastsIgnoreLimit(state, viewerPlayerId);
  const spellLimit = 1 + (playerState?.combatStats.spellLimitBonusThisRound ?? 0);
  const spellLimitReached = !ignoreSpellLimit && (playerState?.combatStats.spellsCastThisRound ?? 0) >= spellLimit;
  const activeUnit = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === viewerPlayerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );

  /** Why a card has no buttons right now, in table terms. */
  const timingHint = (cardId: string): string => {
    const card = cardLibrary[cardId];
    if (!card) {
      return "Unknown card";
    }
    if (card.implementationStatus === "not-implemented") {
      return "Resolve this card manually — automation coming soon";
    }
    if (card.kind === "spell") {
      if (spellLimitReached) {
        return `Spell limit reached (${spellLimit} per combat round)`;
      }
      return card.trigger || card.timing === "instant"
        ? "Instant spell: play it into an attack or spell window (Power cards empower it)"
        : "Activation spell: cast while one of your units is active, before it attacks";
    }
    if (card.trigger || card.timing === "instant") {
      return "Instant: waits for its timing window (attack or spell)";
    }
    if (card.timing === "ongoing" || card.timing === "combat" || card.timing === "action") {
      return ownActivationOpen
        ? "Playable now"
        : "Play during your own unit's activation, before it attacks";
    }
    if (card.timing === "map") {
      return "Map effect: play on the adventure map during your turn";
    }
    return "No legal timing right now";
  };

  const entries: HandCardEntry[] = player.hand.map((cardId, handIndex) => {
    const actionsForCard = cardActions.filter((legal) => legal.action.cardId === cardId);
    const boardSelections = Array.from(
      new Map(
        actionsForCard
          .map((legal) => legal.action)
          .filter(isBoardTargetCardAction)
          .map((action) => [cardSelectionKey(action), action])
      ).values()
    );
    const immediateActions = actionsForCard.filter((legal) => !isBoardTargetCardAction(legal.action));

    return { handIndex, cardId, boardSelections, immediateActions };
  });

  const hiddenFromIndex = entries.length - Math.max(0, hiddenTailCount);

  // Spell Scrolls sit next to the hero board, not in hand. Each held spell may
  // be cast in combat at power 0 (CAST_SPELL with fromScroll); the engine
  // offers a concrete action per legal target.
  const scrolls = player.scrolls ?? [];
  const scrollCastActions = cardActions.filter(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromScroll
  );

  return (
    <div className={`handFan ${trayActive ? "muted" : ""}`} aria-label="Your hand" data-fx-anchor={`hand:${viewerPlayerId}`}>
      {scrolls.length > 0 ? (
        <div className="scrollRail" aria-label="Spell Scrolls">
          {scrolls.map((scroll) => (
            <div className="scrollChip" key={scroll.id} title="Spell Scroll (cast in combat at power 0; not in hand)">
              <span className="scrollGlyph" aria-hidden="true">📜</span>
              <div className="scrollSpells">
                {scroll.spellCardIds.map((spellId, spellIndex) => {
                  const card = cardLibrary[spellId];
                  const casts = scrollCastActions.filter(
                    (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromScroll === scroll.id && legal.action.cardId === spellId
                  );
                  return (
                    <div className="scrollSpell" key={`${scroll.id}-${spellIndex}`}>
                      <button
                        className="scrollSpellName"
                        onClick={() => zoomCard(spellId)}
                        title={card ? describeCardEffect(card) : spellId}
                        type="button"
                      >
                        {card?.name ?? spellId}
                      </button>
                      {!trayActive && casts.length > 0 ? (
                        <div className="scrollSpellCasts">
                          {casts.map((legal) => {
                            const action = legal.action as CardBoardAction;
                            const label =
                              action.target?.type === "unit" ? `Cast → ${targetName(state, action.target)}` : "Cast";
                            return (
                              <button
                                className="commandButton"
                                key={actionKey(action)}
                                onClick={() => onAction(action)}
                                type="button"
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {entries.length === 0 ? <div className="handEmpty">Empty hand</div> : null}
      {entries.map((entry, entryIndex) => {
        const card = cardLibrary[entry.cardId];
        const playable = !trayActive && (entry.boardSelections.length > 0 || entry.immediateActions.length > 0);
        const selected = entry.boardSelections.some((action) => sameCardSelection(selectedCardAction, action));
        const open = openIndex === entry.handIndex;
        const incoming = entryIndex >= hiddenFromIndex;

        return (
          <div className={`fanSlot ${open ? "open" : ""} ${incoming ? "incoming" : ""}`} key={`${entry.cardId}-${entry.handIndex}`}>
            {open ? (
              <div className="cardPopover" role="menu" aria-label={`${cardName(entry.cardId)} actions`}>
                <strong>{cardName(entry.cardId)}</strong>
                {card ? <small>{describeCardEffect(card)}</small> : null}
                {card ? (
                  <div className="popMeta">
                    {getCardMetaLabels(card).map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                ) : null}
                <button
                  onClick={() => {
                    zoomCard(entry.cardId);
                    setOpenIndex(null);
                  }}
                  type="button"
                >
                  Read card (large)
                </button>
                {entry.boardSelections.map((action) => (
                  <button
                    key={cardSelectionKey(action)}
                    onClick={() => {
                      onSelectCardAction(sameCardSelection(selectedCardAction, action) ? null : action);
                      setOpenIndex(null);
                    }}
                    type="button"
                  >
                    {sameCardSelection(selectedCardAction, action)
                      ? "Cancel targeting"
                      : `Pick target${"mode" in action && action.mode === "expert" ? " (expert)" : ""}`}
                  </button>
                ))}
                {entry.immediateActions.map((legal) => {
                  const action = legal.action as CardBoardAction;
                  const label =
                    action.type === "PLAY_CARD" && action.optionIndex !== undefined && card?.effect.type === "CHOOSE_ONE"
                      ? card.effect.options[action.optionIndex]?.label
                      : action.type === "PLAY_CARD" && action.mode === "expert"
                        ? "Use expert"
                        : action.target?.type === "unit"
                          ? `Use on ${targetName(state, action.target)}`
                          : "Use";
                  return (
                    <button
                      key={actionKey(action)}
                      onClick={() => {
                        onAction(action);
                        setOpenIndex(null);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
                {!playable ? <small className="noTiming">{timingHint(entry.cardId)}</small> : null}
                <button className="ghost" onClick={() => setOpenIndex(null)} type="button">
                  Close
                </button>
              </div>
            ) : null}
            <button
              aria-pressed={open}
              className={`fanCard ${playable ? "playable" : ""} ${selected ? "selected" : ""}`}
              onClick={() => setOpenIndex(open ? null : entry.handIndex)}
              title={card ? `${card.name} — ${describeCardEffect(card)}` : entry.cardId}
              type="button"
            >
              <CardFrame cardId={entry.cardId} className="fanCardImage" />
              {playable ? <span className="playGlow" aria-hidden="true" /> : null}
            </button>
            <ZoomButton label={`Read ${cardName(entry.cardId)}`} onZoom={() => zoomCard(entry.cardId)} />
          </div>
        );
      })}
    </div>
  );
}

export function OpponentBar({
  view,
  state,
  viewerPlayerId
}: {
  view: PlayerVisibleState;
  state: GameState;
  viewerPlayerId: PlayerId;
}) {
  const opponents = state.turnOrder.filter((playerId) => playerId !== viewerPlayerId);

  return (
    <div className="opponentBar">
      {opponents.map((playerId) => {
        const player = view.players[playerId];
        if (!player) {
          return null;
        }
        const spellLimit = 1 + player.combatStats.spellLimitBonusThisRound;
        const spellLimitLabel = playerSpellCastsIgnoreLimit(state, playerId) ? "∞" : String(spellLimit);
        const crownsLeft = player.limits.expertUses - player.combatStats.expertUsesSpentThisRound;

        return (
          <section className="opponentSeat" key={playerId} aria-label={`${player.name} seat`}>
            <div className="seatBadge">
              <strong>{player.name}</strong>
              <span className="seatMetrics">
                <span title="Crowns left this combat round">
                  <Crown aria-hidden="true" size={12} /> {crownsLeft}
                </span>
                <span title="Spells cast / limit">
                  <Sparkles aria-hidden="true" size={12} /> {player.combatStats.spellsCastThisRound}/{spellLimitLabel}
                </span>
              </span>
            </div>
            <div
              className="opponentHand"
              aria-label={`${player.name} hand: ${player.handCount} hidden cards`}
              data-fx-anchor={`hand:${playerId}`}
            >
              {Array.from({ length: Math.min(player.handCount, 12) }, (_, index) => (
                <CardBack className="opponentCardBack" key={index} />
              ))}
              <span className="handCount">{player.handCount}</span>
            </div>
            <div className="seatPiles">
              <div className="pileSpot" title={`${player.name} draw deck`} data-fx-anchor={`deck:${playerId}`}>
                <CardBack className="pileCard" />
                <span>{player.deckCount}</span>
              </div>
              <div className="pileSpot" title={`${player.name} discard pile`} data-fx-anchor={`discard:${playerId}`}>
                {player.discard.length > 0 ? (
                  <CardFrame cardId={player.discard.at(-1)} className="pileCard faceUp" />
                ) : (
                  <div className="pileCard emptyPile" />
                )}
                <span>{player.discard.length}</span>
              </div>
            </div>
            <PermanentSlot compact playerId={playerId} state={state} />
          </section>
        );
      })}
    </div>
  );
}

export function PlayerDock({
  state,
  view,
  viewerPlayerId
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
}) {
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  const spellLimit = 1 + player.combatStats.spellLimitBonusThisRound;
  const spellLimitLabel = playerSpellCastsIgnoreLimit(state, viewerPlayerId) ? "∞" : String(spellLimit);
  const crownsLeft = player.limits.expertUses - player.combatStats.expertUsesSpentThisRound;

  return (
    <div className="playerDock" aria-label="Your decks and resources">
      <div
        className="pileSpot tall"
        title="Your draw deck (order hidden, reshuffles from discard)"
        data-fx-anchor={`deck:${viewerPlayerId}`}
      >
        <CardBack className="pileCard" />
        <span>{player.deckCount}</span>
        <small>deck</small>
      </div>
      <div className="pileSpot tall" title="Your discard pile" data-fx-anchor={`discard:${viewerPlayerId}`}>
        {player.discard.length > 0 ? (
          <CardFrame cardId={player.discard.at(-1)} className="pileCard faceUp" />
        ) : (
          <div className="pileCard emptyPile" />
        )}
        <span>{player.discard.length}</span>
        <small>discard</small>
      </div>
      <div className="dockMetrics">
        <strong>{player.name}</strong>
        <span title="Crowns left this combat round">
          <Crown aria-hidden="true" size={13} /> {crownsLeft} crown{crownsLeft === 1 ? "" : "s"}
        </span>
        <span title="Spells cast this combat round">
          <Sparkles aria-hidden="true" size={13} /> {player.combatStats.spellsCastThisRound}/{spellLimitLabel} spells
        </span>
        <span title="Gold / materials / valuables">
          {player.resources.gold}g · {player.resources.buildingMaterials}m · {player.resources.valuables}v
        </span>
      </div>
    </div>
  );
}

const SHARED_DECK_LABELS: Record<SharedDeckId, string> = {
  spells: "Spells",
  "spells-expert": "Expert Spells",
  abilities: "Abilities",
  artifacts: "Artifacts",
  "artifacts-minor": "Minor Artifacts",
  "artifacts-major": "Major Artifacts",
  "artifacts-relic": "Relic Artifacts"
};

export function DeckWells({
  view,
  legalActions,
  onAction
}: {
  view: PlayerVisibleState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const searchActions = new Map<string, GameAction>();
  for (const legal of legalActions) {
    if (legal.action.type === "SEARCH_DECK") {
      searchActions.set(legal.action.deckId, legal.action);
    }
  }

  return (
    <div className="deckWells" aria-label="Shared decks">
      {(Object.keys(SHARED_DECK_LABELS) as SharedDeckId[]).map((deckId) => {
        const deck = view.decks[deckId];
        if (!deck) {
          return null;
        }
        const searchAction = searchActions.get(deckId);

        return (
          <section className="deckWell" key={deckId} aria-label={`${SHARED_DECK_LABELS[deckId]} deck`}>
            <header>
              <Layers aria-hidden="true" size={13} />
              <span>{SHARED_DECK_LABELS[deckId]}</span>
            </header>
            <div className="wellPiles">
              <div
                className="pileSpot"
                title={`${SHARED_DECK_LABELS[deckId]} draw pile`}
                data-fx-anchor={`deck:shared-${deckId}`}
              >
                <CardBack className="pileCard" deckId={deckId} />
                <span>{deck.drawCount}</span>
              </div>
              <div
                className="pileSpot"
                title={`${SHARED_DECK_LABELS[deckId]} discard (top shown)`}
                data-fx-anchor={`discard:shared-${deckId}`}
              >
                {deck.discardPile.length > 0 ? (
                  <CardFrame cardId={deck.discardPile.at(-1)} className="pileCard faceUp" />
                ) : (
                  <div className="pileCard emptyPile" />
                )}
                <span>{deck.discardPile.length}</span>
              </div>
            </div>
            {searchAction ? (
              <button className="wellSearch" onClick={() => onAction(searchAction)} type="button">
                <Search aria-hidden="true" size={13} />
                <span>Search 2</span>
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
