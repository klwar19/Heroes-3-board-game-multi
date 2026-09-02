"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import type { GameAction, GameState, LegalAction, PlayerId } from "@/engine";
import { cardName } from "./utils";
import { useCardZoom } from "./zoom";
import { MORALE_CARD_HINTS, moraleCardRulesText } from "./morale-card-cue";

/** A held Morale card as a zoomable art chip (combat panel + opponent rows). */
export function MoraleHeldCardChip({ cardId }: { cardId: string }) {
  const { zoomContent } = useCardZoom();
  const card = cardLibrary[cardId];
  return (
    <button
      aria-label={`Inspect ${card?.name ?? cardId}`}
      className="moraleHeldCard"
      onClick={() =>
        zoomContent({
          title: card?.name ?? cardId,
          image: card?.assets?.cardImage,
          subtitle: cardId.includes(".positive.") ? "Positive Morale" : "Negative Morale",
          lines: [moraleCardRulesText(cardId), MORALE_CARD_HINTS[cardId] ?? ""].filter(Boolean)
        })
      }
      title={card?.name ?? cardId}
      type="button"
    >
      {card?.assets?.cardImage ? (
        <img alt="" src={assetUrl(card.assets.cardImage)} />
      ) : (
        <span>{cardId.includes(".positive.") ? "P" : "N"}</span>
      )}
    </button>
  );
}

/**
 * Morale during combat, both rule flavors:
 *  - Morale CARDS on: every held card rides under the hand — each Positive
 *    card with its live "use it now" buttons (straight from the engine's
 *    SPEND_MORALE offers, so a button exists exactly when the play is legal)
 *    or a hint saying where its use is offered; each Negative card pulsing
 *    red with the trigger it is waiting for. Opposing fighters' held cards
 *    (public info) show as a compact row.
 *  - Rule off: spend the positive morale TOKEN for draw 1 / discard-redraw.
 *    (The token's third use — rerolling a die — is offered inside the
 *    attack-die reroll prompt when a die is thrown.)
 */
export function CombatMoralePanel({
  legalActions,
  hand,
  state,
  viewerPlayerId,
  onAction
}: {
  legalActions: LegalAction[];
  hand: string[];
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);
  const [abilityPicking, setAbilityPicking] = useState(false);

  // Adventure keeps the Morale Cards rule on the map state; Battle Test keeps it
  // on `sandboxRules` after Begin (there is no adventure object in a sandbox), so
  // the combat panel must honour both or the drawn cards would be unusable.
  const moraleCardsOn = Boolean(state.adventure?.moraleCards || state.sandboxRules?.moraleCards);
  const drawAction = legalActions.find(
    (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "draw"
  );
  const redrawAction = legalActions.find(
    (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "redraw"
  );
  const abilityTokenOffers = legalActions.filter(
    (legal) =>
      legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.playerId === viewerPlayerId
  );
  const abilityTokenCount = Math.max(0, state.players[viewerPlayerId]?.abilityEmpowerToken ?? 0);
  const holdsAbilityToken = abilityTokenCount >= 1;

  if (!moraleCardsOn && !drawAction && !redrawAction && abilityTokenOffers.length === 0 && !holdsAbilityToken) {
    return null;
  }

  const confirmRedraw = () => {
    if (picks.length === 0) {
      return;
    }
    onAction({
      type: "SPEND_MORALE",
      playerId: viewerPlayerId,
      benefit: "redraw",
      discardCardIds: picks.map((index) => hand[index])
    });
    setPicking(false);
    setPicks([]);
  };

  const pickerModal = picking ? (
    <div className="moraleOverflowBackdrop" role="dialog" aria-modal="true" aria-label="Discard and redraw">
      <div className="moraleOverflowPopup">
        <strong>Spend morale: discard cards, draw that many</strong>
        <div className="moraleRedrawCards">
          {hand.map((cardId, index) => (
            <button
              aria-pressed={picks.includes(index)}
              className={`trayChip ${picks.includes(index) ? "picked" : ""}`}
              key={`${cardId}-${index}`}
              onClick={() =>
                setPicks((current) =>
                  current.includes(index)
                    ? current.filter((value) => value !== index)
                    : [...current, index]
                )
              }
              type="button"
            >
              {cardName(cardId)}
            </button>
          ))}
        </div>
        <div className="handButtons">
          <button className="commandButton primary" disabled={picks.length === 0} onClick={confirmRedraw} type="button">
            Discard {picks.length} &amp; draw {picks.length}
          </button>
          <button
            className="commandButton ghost"
            onClick={() => {
              setPicking(false);
              setPicks([]);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const abilityTokenButtons =
    abilityTokenOffers.length > 0 ? (
      <div className="handButtons" aria-label="Ability Empower token">
        {abilityTokenOffers.length === 1 ? (
          <button
            className="commandButton"
            onClick={() => onAction(abilityTokenOffers[0].action)}
            type="button"
          >
            👑 Ability token ×{abilityTokenCount}: {abilityTokenOffers[0].label.replace(/^Ability token: /, "")}
          </button>
        ) : (
          <button className="commandButton" onClick={() => setAbilityPicking(true)} type="button">
            👑 Ability tokens ×{abilityTokenCount}: Empower a hand Ability…
          </button>
        )}
      </div>
    ) : holdsAbilityToken ? (
      <div className="handButtons" aria-label="Ability Empower token">
        <span className="combatMoraleHint">👑 Ability token ×{abilityTokenCount} — put a non-Empowered Ability in hand to spend one.</span>
      </div>
    ) : null;

  const abilityPickerModal = abilityPicking ? (
    <div className="moraleOverflowBackdrop" role="dialog" aria-modal="true" aria-label="Empower an ability with token">
      <div className="moraleOverflowPopup abilityEmpowerTokenPopup">
        <strong>Spend Ability Empower token</strong>
        <p>Empower one Ability in your hand. Expert then costs no crown forever. One of your {abilityTokenCount} tokens will be spent.</p>
        <div className="handButtons abilityEmpowerTokenChoices">
          {abilityTokenOffers.map((legal) => (
            <button
              key={legal.label}
              className="commandButton primary"
              type="button"
              onClick={() => {
                onAction(legal.action);
                setAbilityPicking(false);
              }}
            >
              {legal.label.replace(/^Ability token: /, "")}
            </button>
          ))}
          <button className="commandButton ghost" type="button" onClick={() => setAbilityPicking(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ---- Rule off: spend the +1 morale token (draw 1 / discard & redraw). ----
  if (!moraleCardsOn) {
    if (!drawAction && !redrawAction && !abilityTokenButtons) {
      return null;
    }
    return (
      <div className="combatMorale" aria-label="Spend morale and ability token">
        <div className="handButtons">
          {drawAction ? (
            <button className="commandButton" onClick={() => onAction(drawAction.action)} type="button">
              🎖 Morale: draw 1
            </button>
          ) : null}
          {redrawAction ? (
            <button className="commandButton" onClick={() => setPicking(true)} type="button">
              🎖 Morale: discard &amp; redraw
            </button>
          ) : null}
        </div>
        {abilityTokenButtons}
        {pickerModal}
        {abilityPickerModal}
      </div>
    );
  }

  // ---- Morale cards rule: the held cards themselves, with live use offers. ----
  const held = state.players[viewerPlayerId]?.moraleCards ?? { positive: [], negative: [] };
  const heldPositive = held.positive ?? [];
  const heldNegative = held.negative ?? [];
  type SpendLegal = LegalAction & { action: Extract<GameAction, { type: "SPEND_MORALE" }> };
  const spendOffers = legalActions.filter(
    (legal): legal is SpendLegal => legal.action.type === "SPEND_MORALE"
  );

  // The opposing fighter's held Morale cards are public (face-up beside the
  // hero) — show them so a player can anticipate the curse about to strike.
  const combat = state.combat;
  const others = (combat ? [combat.attackerPlayerId, combat.defenderPlayerId] : [])
    .filter((playerId) => playerId !== viewerPlayerId)
    .map((playerId) => {
      const player = state.players[playerId];
      return {
        playerId,
        name: player?.name ?? playerId,
        cards: [...(player?.moraleCards?.positive ?? []), ...(player?.moraleCards?.negative ?? [])]
      };
    })
    .filter((entry) => entry.cards.length > 0);

  const hasMoraleCards =
    heldPositive.length > 0 || heldNegative.length > 0 || others.length > 0;
  if (!hasMoraleCards && !abilityTokenButtons) {
    return null;
  }

  // "Use it now" buttons per held Positive card, straight from the engine's
  // SPEND_MORALE offers — a button exists exactly when the play is legal.
  const offerButtonsFor = (cardId: string): { key: string; label: string; onClick: () => void }[] => {
    if (cardId === MORALE_CARD_IDS.combatBonus) {
      return spendOffers
        .filter((legal) => legal.action.benefit === "combat-bonus")
        .map((legal) => ({
          key: `bonus-${legal.action.bonus ?? "attack"}`,
          label: legal.action.bonus === "defense" ? "+1 Defense this Combat" : "+1 Attack this Combat",
          onClick: () => onAction(legal.action)
        }));
    }
    if (cardId === MORALE_CARD_IDS.removeToken) {
      return spendOffers
        .filter((legal) => legal.action.benefit === "remove-token")
        .map((legal) => ({
          key: legal.label,
          label: legal.label.replace(/^Positive Morale: /, ""),
          onClick: () => onAction(legal.action)
        }));
    }
    if (cardId === MORALE_CARD_IDS.redrawHand && redrawAction && hand.length > 0) {
      return [{ key: "redraw", label: "Discard cards & draw as many", onClick: () => setPicking(true) }];
    }
    return [];
  };

  return (
    <div className="combatMoraleCards" aria-label="Morale cards and ability token in this combat">
      {hasMoraleCards ? <header>🎺 Morale cards</header> : null}
      {heldPositive.map((cardId, index) => {
        const buttons = offerButtonsFor(cardId);
        return (
          <div className="combatMoraleRow positive" key={`pos-${cardId}-${index}`}>
            <MoraleHeldCardChip cardId={cardId} />
            <div className="combatMoraleRowBody">
              <strong>{cardLibrary[cardId]?.name ?? cardId}</strong>
              {buttons.length > 0 ? (
                <div className="handButtons">
                  {buttons.map((button) => (
                    <button className="commandButton" key={button.key} onClick={button.onClick} type="button">
                      {button.label}
                    </button>
                  ))}
                </div>
              ) : (
                <small>{MORALE_CARD_HINTS[cardId] ?? moraleCardRulesText(cardId)}</small>
              )}
            </div>
          </div>
        );
      })}
      {heldNegative.map((cardId, index) => (
        <div className="combatMoraleRow negative" key={`neg-${cardId}-${index}`}>
          <MoraleHeldCardChip cardId={cardId} />
          <div className="combatMoraleRowBody">
            <strong>{cardLibrary[cardId]?.name ?? cardId}</strong>
            <small>{MORALE_CARD_HINTS[cardId] ?? moraleCardRulesText(cardId)}</small>
          </div>
        </div>
      ))}
      {others.map((entry) => (
        <div className="combatMoraleOthers" key={entry.playerId}>
          <span>{entry.name} holds</span>
          {entry.cards.map((cardId, index) => (
            <MoraleHeldCardChip cardId={cardId} key={`${cardId}-${index}`} />
          ))}
        </div>
      ))}
      {abilityTokenButtons}
      {pickerModal}
      {abilityPickerModal}
    </div>
  );
}
