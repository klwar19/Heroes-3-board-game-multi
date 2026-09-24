"use client";

import { useState } from "react";
import type { GameAction, GameState, LegalAction, PlayerId } from "@/engine";
import { getActiveAstrologersCard } from "@/engine/adventure";
import { assetUrl } from "@/lib/asset-url";

export function CardGamesNotice({ state, viewerPlayerId, legalActions, onAction }: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [minimizedRound, setMinimizedRound] = useState<string | null>(null);
  const [openedRound, setOpenedRound] = useState<string | null>(null);
  const card = getActiveAstrologersCard(state);
  if (card?.effect.type !== "PAID_CARD_DRAW") return null;

  const player = state.players[viewerPlayerId];
  if (!player || player.id === "neutrals") return null;
  const key = `${state.seed}:${state.round}:${viewerPlayerId}:${card.id}`;
  const drawAction = legalActions.find((entry) => entry.action.type === "ASTROLOGERS_CARD_GAMES" && entry.action.playerId === viewerPlayerId);
  const available = Boolean(drawAction);
  const used = player.cardGamesUsedRound === state.round;
  const expanded = openedRound === key || (available && minimizedRound !== key);
  const status = used
    ? "Used this round"
    : player.resources.gold < card.effect.gold
      ? `Need ${card.effect.gold} gold`
      : player.deck.length + player.discard.length === 0
        ? "No cards left to draw"
        : available
          ? `Pay ${card.effect.gold} gold to draw 1 card`
          : "Available on your map turn";

  if (!expanded) {
    return (
      <button className={`cardGamesChip${available ? " cardGamesReady" : ""}`} type="button"
        aria-label={`Open Card Games: ${status}`} onClick={() => setOpenedRound(key)}>
        <span aria-hidden="true">🃏</span>
        <span><strong>Card Games</strong><small>{status}</small></span>
      </button>
    );
  }

  return (
    <aside className={`cardGamesNotice${available ? " cardGamesReady" : ""}`} aria-label="Card Games Astrologers event">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated card face */}
      <img className="cardGamesArt" src={assetUrl(card.image)} alt="Card Games Astrologers event card" />
      <div className="cardGamesBody">
        <strong>Card Games</strong>
        <p>Once per round during your map turn, pay {card.effect.gold} gold to draw a card.</p>
        <button type="button" disabled={!drawAction} onClick={() => drawAction && onAction(drawAction.action)}>
          Draw card · {card.effect.gold} gold
        </button>
        <small aria-live="polite">{status}</small>
        <button className="cardGamesMinimize" type="button" onClick={() => { setOpenedRound(null); setMinimizedRound(key); }}>
          Minimize
        </button>
      </div>
    </aside>
  );
}
