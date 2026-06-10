"use client";

/* eslint-disable @next/next/no-img-element */

import { Crown, Layers, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import {
  describeCardEffect,
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

  return <img alt={alt} className={className} loading="eager" referrerPolicy="no-referrer" src={src} title={title ?? alt} />;
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div className={`cardBack ${className ?? ""}`} aria-hidden="true">
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
  onSelectCardAction,
  onAction
}: {
  view: PlayerVisibleState;
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  selectedCardAction: CardBoardAction | null;
  trayActive: boolean;
  onSelectCardAction: (action: CardBoardAction | null) => void;
  onAction: (action: GameAction) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  const cardActions = legalActions.filter(
    (legal): legal is LegalAction & { action: CardBoardAction } =>
      legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD"
  );

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

  return (
    <div className={`handFan ${trayActive ? "muted" : ""}`} aria-label="Your hand">
      {entries.length === 0 ? <div className="handEmpty">Empty hand</div> : null}
      {entries.map((entry) => {
        const card = cardLibrary[entry.cardId];
        const playable = !trayActive && (entry.boardSelections.length > 0 || entry.immediateActions.length > 0);
        const selected = entry.boardSelections.some((action) => sameCardSelection(selectedCardAction, action));
        const open = openIndex === entry.handIndex;

        return (
          <div className={`fanSlot ${open ? "open" : ""}`} key={`${entry.cardId}-${entry.handIndex}`}>
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
                {!playable ? <small className="noTiming">No legal timing right now</small> : null}
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
                  <Sparkles aria-hidden="true" size={12} /> {player.combatStats.spellsCastThisRound}/{spellLimit}
                </span>
              </span>
            </div>
            <div className="opponentHand" aria-label={`${player.name} hand: ${player.handCount} hidden cards`}>
              {Array.from({ length: Math.min(player.handCount, 12) }, (_, index) => (
                <CardBack className="opponentCardBack" key={index} />
              ))}
              <span className="handCount">{player.handCount}</span>
            </div>
            <div className="seatPiles">
              <div className="pileSpot" title={`${player.name} draw deck`}>
                <CardBack className="pileCard" />
                <span>{player.deckCount}</span>
              </div>
              <div className="pileSpot" title={`${player.name} discard pile`}>
                {player.discard.length > 0 ? (
                  <CardFrame cardId={player.discard.at(-1)} className="pileCard faceUp" />
                ) : (
                  <div className="pileCard emptyPile" />
                )}
                <span>{player.discard.length}</span>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function PlayerDock({
  view,
  viewerPlayerId
}: {
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
}) {
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  const spellLimit = 1 + player.combatStats.spellLimitBonusThisRound;
  const crownsLeft = player.limits.expertUses - player.combatStats.expertUsesSpentThisRound;

  return (
    <div className="playerDock" aria-label="Your decks and resources">
      <div className="pileSpot tall" title="Your draw deck (order hidden, reshuffles from discard)">
        <CardBack className="pileCard" />
        <span>{player.deckCount}</span>
        <small>deck</small>
      </div>
      <div className="pileSpot tall" title="Your discard pile">
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
          <Sparkles aria-hidden="true" size={13} /> {player.combatStats.spellsCastThisRound}/{spellLimit} spells
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
  abilities: "Abilities",
  artifacts: "Artifacts"
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
              <div className="pileSpot" title={`${SHARED_DECK_LABELS[deckId]} draw pile`}>
                <CardBack className="pileCard" />
                <span>{deck.drawCount}</span>
              </div>
              <div className="pileSpot" title={`${SHARED_DECK_LABELS[deckId]} discard (top shown)`}>
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
