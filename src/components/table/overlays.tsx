"use client";

import { Check, CircleOff, Crown, Dices, Hourglass, Layers, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import {
  getEffectAmount,
  getEffectiveCardEffect,
  type CardPlayMode,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState,
  type ReactionPlay
} from "@/engine";
import { cardName, formatDieFace, formatEvent, unitName } from "./utils";
import { CardBack, CardFrame } from "./seats";
import { useCardZoom, ZoomButton } from "./zoom";

type ReactionLegal = Extract<GameAction, { type: "PLAY_REACTION" }>;

type TrayGroup = {
  cardId: string;
  optionIndex?: number;
  optionLabel?: string;
  modes: CardPlayMode[];
  batchable: boolean;
  /** "Discard {card}: +1 Power" alternative play of a Spell card. */
  asPowerBoost?: boolean;
  /** Cards from hand this option demands as payment. */
  costCards?: { exact?: number; upTo?: number; filter?: "spell" };
};

type TraySelection = {
  handIndex: number;
  cardId: string;
  optionIndex?: number;
  mode: CardPlayMode;
  asPowerBoost?: boolean;
  costCards?: { exact?: number; upTo?: number; filter?: "spell" };
  /** Hand indexes chosen to pay the option's discard cost. */
  costHandIndexes: number[];
};

function selectionPreview(selections: TraySelection[]): string[] {
  const totals = new Map<string, number>();

  for (const selection of selections) {
    const card = cardLibrary[selection.cardId];
    if (!card) {
      continue;
    }
    if (selection.asPowerBoost) {
      totals.set("Power", (totals.get("Power") ?? 0) + 1);
      continue;
    }
    const effect = getEffectiveCardEffect(card, selection.optionIndex);
    if (!effect) {
      continue;
    }
    let amount = getEffectAmount(effect, selection.mode);
    if ((effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER") && effect.perCostCard) {
      amount += effect.perCostCard * selection.costHandIndexes.length;
    }

    if (effect.type === "ADD_COMBAT_STAT") {
      const key = effect.stat === "attack" ? "Attack" : "Defense";
      totals.set(key, (totals.get(key) ?? 0) + amount);
    } else if (effect.type === "ADD_SPELL_POWER") {
      totals.set("Power", (totals.get("Power") ?? 0) + amount);
    } else if (effect.type === "DRAW_CARDS") {
      totals.set("Draw", (totals.get("Draw") ?? 0) + amount);
    } else {
      totals.set(card.name, (totals.get(card.name) ?? 0) + 1);
    }
  }

  return [...totals.entries()].map(([key, amount]) =>
    key === "Draw" ? `Draw ${amount}` : ["Attack", "Defense", "Power"].includes(key) ? `+${amount} ${key}` : key
  );
}

export function ReactionTray({
  state,
  view,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  // The parent keys this component by window id + priority player, so the
  // selection naturally resets whenever the timing window changes hands.
  const window = state.reactionWindow;
  const [selections, setSelections] = useState<TraySelection[]>([]);
  const { zoomCard } = useCardZoom();

  const reactionActions = useMemo(
    () =>
      legalActions
        .map((legal) => legal.action)
        .filter((action): action is ReactionLegal => action.type === "PLAY_REACTION"),
    [legalActions]
  );

  // School of Magic in play: discard it from the field for the expert bonus.
  const fieldExpert = legalActions.find((legal) => legal.action.type === "USE_PERMANENT_EXPERT");

  if (!window) {
    return null;
  }

  const triggerText = formatEvent(window.triggerEvent, state);
  const isPriority = window.priorityPlayerId === viewerPlayerId;

  if (!isPriority) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>{triggerText}</span>
        <small>Waiting for {state.players[window.priorityPlayerId]?.name ?? window.priorityPlayerId} to respond…</small>
      </div>
    );
  }

  // Group the viewer's legal reactions by card + option (+1-Power discards
  // are their own group), then expose one selectable tile per copy in hand.
  const groupsByCard = new Map<string, TrayGroup[]>();
  for (const action of reactionActions) {
    const key = `${action.cardId}#${action.optionIndex ?? -1}#${action.asPowerBoost ? "boost" : "play"}`;
    const card = cardLibrary[action.cardId];
    const effect = card && !action.asPowerBoost ? getEffectiveCardEffect(card, action.optionIndex) : null;
    const batchable = action.asPowerBoost
      ? true
      : Boolean(effect && effect.type !== "CANCEL_SPELL" && effect.type !== "RECALL_SPELL");
    const option =
      card?.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
        ? card.effect.options[action.optionIndex]
        : undefined;
    const cost = option?.cost;
    const costCards =
      cost && (cost.discardCards !== undefined || cost.discardCardsUpTo !== undefined)
        ? { exact: cost.discardCards, upTo: cost.discardCardsUpTo, filter: cost.costCardFilter }
        : undefined;
    const cardGroups = groupsByCard.get(action.cardId) ?? [];
    const existing = cardGroups.find(
      (group) => `${group.cardId}#${group.optionIndex ?? -1}#${group.asPowerBoost ? "boost" : "play"}` === key
    );

    if (existing) {
      if (!existing.modes.includes(action.mode ?? "basic")) {
        existing.modes.push(action.mode ?? "basic");
      }
    } else {
      cardGroups.push({
        cardId: action.cardId,
        optionIndex: action.optionIndex,
        optionLabel: action.asPowerBoost ? "Discard for +1 Power" : option?.label,
        modes: [action.mode ?? "basic"],
        batchable,
        asPowerBoost: action.asPowerBoost,
        costCards
      });
    }
    groupsByCard.set(action.cardId, cardGroups);
  }

  const hand = view.players[viewerPlayerId]?.hand ?? [];
  const tiles = hand
    .map((cardId, handIndex) => ({ cardId, handIndex, groups: groupsByCard.get(cardId) ?? [] }))
    .filter((tile) => tile.groups.length > 0);

  const player = state.players[viewerPlayerId];
  const crownsAvailable = player
    ? player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound
    : 0;
  const crownsSelected = selections.filter((selection) => selection.mode === "expert").length;

  const toggleSelection = (handIndex: number, cardId: string, group: TrayGroup) => {
    setSelections((current) => {
      const existing = current.find((selection) => selection.handIndex === handIndex);
      if (
        existing &&
        existing.optionIndex === group.optionIndex &&
        Boolean(existing.asPowerBoost) === Boolean(group.asPowerBoost)
      ) {
        return current.filter((selection) => selection.handIndex !== handIndex);
      }

      const next = current
        .filter((selection) => selection.handIndex !== handIndex)
        // A card leaving/entering play also leaves any payment role.
        .map((selection) => ({
          ...selection,
          costHandIndexes: selection.costHandIndexes.filter((index) => index !== handIndex)
        }));
      next.push({
        handIndex,
        cardId,
        optionIndex: group.optionIndex,
        mode: "basic",
        asPowerBoost: group.asPowerBoost,
        costCards: group.costCards,
        costHandIndexes: []
      });
      return next.sort((left, right) => left.handIndex - right.handIndex);
    });
  };

  const setSelectionMode = (handIndex: number, mode: CardPlayMode) => {
    setSelections((current) =>
      current.map((selection) => (selection.handIndex === handIndex ? { ...selection, mode } : selection))
    );
  };

  const togglePayment = (selectionHandIndex: number, payHandIndex: number) => {
    setSelections((current) =>
      current.map((selection) => {
        if (selection.handIndex !== selectionHandIndex) {
          return selection;
        }
        const has = selection.costHandIndexes.includes(payHandIndex);
        return {
          ...selection,
          costHandIndexes: has
            ? selection.costHandIndexes.filter((index) => index !== payHandIndex)
            : [...selection.costHandIndexes, payHandIndex]
        };
      })
    );
  };

  // Hand indexes already committed (played or paying) cannot pay twice.
  const committedIndexes = new Set<number>();
  for (const selection of selections) {
    committedIndexes.add(selection.handIndex);
    for (const index of selection.costHandIndexes) {
      committedIndexes.add(index);
    }
  }

  const paymentInvalid = selections.some(
    (selection) =>
      selection.costCards?.exact !== undefined && selection.costHandIndexes.length !== selection.costCards.exact
  );

  const confirmSelection = () => {
    if (selections.length === 0 || paymentInvalid) {
      return;
    }

    const toPlay = (selection: TraySelection): ReactionPlay => ({
      cardId: selection.cardId,
      mode: selection.mode,
      ...(selection.optionIndex !== undefined ? { optionIndex: selection.optionIndex } : {}),
      ...(selection.asPowerBoost ? { asPowerBoost: true } : {}),
      ...(selection.costHandIndexes.length > 0
        ? { costCardIds: selection.costHandIndexes.map((index) => hand[index]) }
        : {})
    });

    if (selections.length === 1) {
      const [only] = selections;
      onAction({
        type: "PLAY_REACTION",
        playerId: viewerPlayerId,
        ...toPlay(only)
      });
      return;
    }

    onAction({ type: "PLAY_REACTIONS", playerId: viewerPlayerId, plays: selections.map(toPlay) });
  };

  const preview = selectionPreview(selections);
  const isAttackWindow = window.triggerEvent.type === "UNIT_ATTACK_DECLARED";
  const passLabel = isAttackWindow ? "Done — roll the die!" : "Pass";
  const crownsOver = crownsSelected > crownsAvailable;

  return (
    <div className="reactionTray" role="dialog" aria-label="Instant window">
      <header>
        <Undo2 aria-hidden="true" size={15} />
        <strong>Instant window</strong>
        <span>{triggerText}</span>
      </header>
      <div className="trayTiles">
        {tiles.length === 0 && !fieldExpert ? (
          <div className="trayEmpty">No playable instants — pass to continue.</div>
        ) : null}
        {fieldExpert && fieldExpert.action.type === "USE_PERMANENT_EXPERT" ? (
          <div className="trayTile permanentTile" key="field-expert">
            <CardFrame
              cardId={state.players[viewerPlayerId]?.permanent ?? undefined}
              className="trayCardImage"
            />
            <div className="trayTileBody">
              <strong>{cardName(state.players[viewerPlayerId]?.permanent ?? "")} (in play)</strong>
              <button className="trayInstant" onClick={() => onAction(fieldExpert.action)} type="button">
                <Crown aria-hidden="true" size={13} /> {fieldExpert.label}
              </button>
            </div>
          </div>
        ) : null}
        {tiles.map((tile) => {
          const selection = selections.find((candidate) => candidate.handIndex === tile.handIndex);
          return (
            <div className={`trayTile ${selection ? "selected" : ""}`} key={`${tile.cardId}-${tile.handIndex}`}>
              <CardFrame cardId={tile.cardId} className="trayCardImage" />
              <ZoomButton label={`Read ${cardName(tile.cardId)}`} onZoom={() => zoomCard(tile.cardId)} />
              <div className="trayTileBody">
                <strong>{cardName(tile.cardId)}</strong>
                {tile.groups.map((group) => {
                  const groupSelected = Boolean(
                    selection &&
                      selection.optionIndex === group.optionIndex &&
                      Boolean(selection.asPowerBoost) === Boolean(group.asPowerBoost)
                  );
                  if (!group.batchable) {
                    // Window-ending plays (Resistance, spell recall) resolve
                    // immediately and on their own.
                    return group.modes.map((mode) => (
                      <button
                        className="trayInstant"
                        key={`${group.cardId}-${group.optionIndex ?? "x"}-${mode}`}
                        onClick={() =>
                          onAction({
                            type: "PLAY_REACTION",
                            playerId: viewerPlayerId,
                            cardId: group.cardId,
                            mode,
                            ...(group.optionIndex !== undefined ? { optionIndex: group.optionIndex } : {})
                          })
                        }
                        type="button"
                      >
                        {group.optionLabel ?? "Play now"}
                        {mode === "expert" ? " (expert)" : ""}
                      </button>
                    ));
                  }

                  const needsPayment = groupSelected && selection?.costCards;
                  const paymentTarget = selection?.costCards?.exact ?? selection?.costCards?.upTo ?? 0;

                  return (
                    <div className="trayGroup" key={`${group.cardId}-${group.optionIndex ?? "x"}-${group.asPowerBoost ? "boost" : "play"}`}>
                      <button
                        aria-pressed={groupSelected}
                        className={`trayPick ${groupSelected ? "picked" : ""}`}
                        onClick={() => toggleSelection(tile.handIndex, tile.cardId, group)}
                        type="button"
                      >
                        <Check aria-hidden="true" size={13} />
                        <span>{group.optionLabel ?? "Add to play"}</span>
                      </button>
                      {groupSelected && group.modes.includes("expert") && !group.asPowerBoost ? (
                        <button
                          aria-pressed={selection?.mode === "expert"}
                          className={`trayExpert ${selection?.mode === "expert" ? "picked" : ""}`}
                          onClick={() =>
                            setSelectionMode(tile.handIndex, selection?.mode === "expert" ? "basic" : "expert")
                          }
                          title="Spend a crown for the expert effect"
                          type="button"
                        >
                          <Crown aria-hidden="true" size={13} />
                          <span>Expert</span>
                        </button>
                      ) : null}
                      {needsPayment ? (
                        <div className="trayPayment" aria-label="Choose cards to pay the cost">
                          <small>
                            {selection?.costCards?.exact !== undefined
                              ? `Discard exactly ${selection.costCards.exact}:`
                              : `Discard up to ${paymentTarget}:`}
                          </small>
                          <div className="trayPaymentChips">
                            {hand.map((payCardId, payIndex) => {
                              if (payIndex === tile.handIndex) {
                                return null;
                              }
                              const inThisPayment = Boolean(selection?.costHandIndexes.includes(payIndex));
                              const takenElsewhere = !inThisPayment && committedIndexes.has(payIndex);
                              const wrongKind =
                                selection?.costCards?.filter === "spell" &&
                                cardLibrary[payCardId]?.kind !== "spell";
                              if (takenElsewhere || wrongKind) {
                                return null;
                              }
                              const full =
                                !inThisPayment &&
                                (selection?.costHandIndexes.length ?? 0) >= paymentTarget;
                              return (
                                <button
                                  aria-pressed={inThisPayment}
                                  className={`trayChip ${inThisPayment ? "picked" : ""}`}
                                  disabled={full}
                                  key={`${payCardId}-${payIndex}`}
                                  onClick={() => togglePayment(tile.handIndex, payIndex)}
                                  type="button"
                                >
                                  {cardName(payCardId)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <footer>
        <div className="trayPreview">
          {preview.length > 0 ? preview.map((line) => <span key={line}>{line}</span>) : <span>Nothing selected</span>}
          <span className={`crownMeter ${crownsOver ? "over" : ""}`} title="Crowns selected / available">
            <Crown aria-hidden="true" size={13} /> {crownsSelected}/{crownsAvailable}
          </span>
        </div>
        <button
          className="trayConfirm"
          disabled={selections.length === 0 || crownsOver || paymentInvalid}
          onClick={confirmSelection}
          type="button"
        >
          <Check aria-hidden="true" size={15} />
          <span>
            Play {selections.length > 1 ? `${selections.length} cards` : "card"}
          </span>
        </button>
        <button
          className="trayPass"
          onClick={() => onAction({ type: "PASS_REACTION", playerId: viewerPlayerId })}
          type="button"
        >
          <CircleOff aria-hidden="true" size={15} />
          <span>{passLabel}</span>
        </button>
      </footer>
    </div>
  );
}

export type DiceCue = {
  id: string;
  rolls: number[];
  roll: number;
  /** Centaur's Axe: the die outcome counts this many times (default 1). */
  dieMultiplier: number;
  rollMode: "normal" | "advantage" | "disadvantage";
  attackerName: string;
  defenderName: string;
  attackValue: number;
  defenseValue: number;
  attackBonus: number;
  defenseBonus: number;
  damage: number;
  isRetaliation: boolean;
};

/** Cube faces: two +1, two 0, two -1 — matching the physical attack die. */
const CUBE_FACES: { value: number; transform: string }[] = [
  { value: 1, transform: "rotateY(0deg) translateZ(34px)" },
  { value: -1, transform: "rotateY(180deg) translateZ(34px)" },
  { value: 0, transform: "rotateY(90deg) translateZ(34px)" },
  { value: 0, transform: "rotateY(-90deg) translateZ(34px)" },
  { value: -1, transform: "rotateX(90deg) translateZ(34px)" },
  { value: 1, transform: "rotateX(-90deg) translateZ(34px)" }
];

const FINAL_ROTATION: Record<number, string> = {
  1: "rotateX(-8deg) rotateY(-6deg)",
  0: "rotateX(-8deg) rotateY(-96deg)",
  [-1]: "rotateX(-8deg) rotateY(174deg)"
};

function DieCube({ value, rolling, dimmed }: { value: number; rolling: boolean; dimmed: boolean }) {
  return (
    <div className={`dieScene ${dimmed ? "dimmed" : ""}`}>
      <div
        className={`dieCube ${rolling ? "tumbling" : "settled"}`}
        style={rolling ? undefined : { transform: FINAL_ROTATION[value] ?? FINAL_ROTATION[0] }}
      >
        {CUBE_FACES.map((face, index) => (
          <span className="dieFace" key={index} style={{ transform: face.transform }}>
            {formatDieFace(face.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rendered with `key={cue.id}` so each roll mounts fresh in the rolling phase. */
export function DiceOverlay({ cue, onDone }: { cue: DiceCue; onDone: () => void }) {
  const [phase, setPhase] = useState<"rolling" | "settled">("rolling");

  useEffect(() => {
    const settleId = setTimeout(() => setPhase("settled"), 1000);
    const doneId = setTimeout(onDone, 3100);

    return () => {
      clearTimeout(settleId);
      clearTimeout(doneId);
    };
  }, [onDone]);

  const rolling = phase === "rolling";

  return (
    <div className="diceOverlay" role="status" aria-label="Attack roll" onClick={onDone}>
      <div className="diceStage">
        <header>
          <Dices aria-hidden="true" size={16} />
          <strong>
            {cue.isRetaliation ? "Retaliation!" : "Attack!"} {cue.attackerName} → {cue.defenderName}
          </strong>
          {cue.rollMode !== "normal" ? <span className="rollMode">{cue.rollMode}</span> : null}
        </header>
        <div className="diceRow">
          {cue.rolls.map((roll, index) => (
            <DieCube
              dimmed={!rolling && cue.rolls.length > 1 && roll !== cue.roll}
              key={index}
              rolling={rolling}
              value={roll}
            />
          ))}
          {cue.dieMultiplier !== 1 && !rolling ? (
            <span className="dieMultiplier" title="Centaur's Axe: the outcome counts three times">
              ×{cue.dieMultiplier}
            </span>
          ) : null}
        </div>
        <div className={`diceBreakdown ${rolling ? "hidden" : ""}`}>
          <span className="formula">
            ⚔ {cue.attackValue - cue.roll * cue.dieMultiplier - cue.attackBonus}
            {cue.attackBonus !== 0 ? ` + ${cue.attackBonus}` : ""} {cue.roll >= 0 ? "+" : "−"} {Math.abs(cue.roll)}
            {cue.dieMultiplier !== 1 ? `×${cue.dieMultiplier}` : ""} = {cue.attackValue}
          </span>
          <span className="versus">vs</span>
          <span className="formula">
            🛡 {cue.defenseValue - cue.defenseBonus}
            {cue.defenseBonus !== 0 ? ` + ${cue.defenseBonus}` : ""} = {cue.defenseValue}
          </span>
          <strong className={`damageResult ${cue.damage > 0 ? "hit" : "blocked"}`}>
            {cue.damage > 0 ? `${cue.damage} damage` : "No damage"}
          </strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Draw-card cinematic: cards visibly travel from the deck to the hand. For
 * the drawing seat the actual card faces flash up; everyone else sees backs.
 */
export type DrawCue = {
  id: string;
  playerName: string;
  isViewer: boolean;
  count: number;
  cardIds: string[];
  reshuffled: boolean;
};

export function DrawOverlay({ cue, onDone }: { cue: DrawCue; onDone: () => void }) {
  useEffect(() => {
    const doneId = setTimeout(onDone, cue.isViewer ? 2100 : 1300);
    return () => clearTimeout(doneId);
  }, [cue, onDone]);

  return (
    <div aria-label={`${cue.playerName} draws ${cue.count} cards`} className="drawOverlay" onClick={onDone} role="status">
      <div className="drawStage">
        <header>
          <Layers aria-hidden="true" size={14} />
          <span>
            {cue.playerName} draws {cue.count} card{cue.count === 1 ? "" : "s"}
            {cue.reshuffled ? " (discard reshuffled)" : ""}
          </span>
        </header>
        <div className="drawCards">
          {Array.from({ length: Math.min(cue.count, 5) }, (_, index) => (
            <div className="drawCard" key={index} style={{ animationDelay: `${index * 130}ms` }}>
              {cue.isViewer && cue.cardIds[index] ? (
                <CardFrame cardId={cue.cardIds[index]} className="drawCardImage" />
              ) : (
                <CardBack className="drawCardImage" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SearchModal({
  state,
  view,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  const { zoomCard } = useCardZoom();
  const choice = view.pendingChoice;
  if (!choice || choice.type !== "DECK_SEARCH") {
    return null;
  }

  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>
          {state.players[choice.playerId]?.name ?? choice.playerId} is searching the {choice.deckId} deck…
        </span>
      </div>
    );
  }

  const discardTop = state.decks[choice.deckId]?.discardPile.at(-1);

  return (
    <div className="modalBackdrop" role="dialog" aria-label={`Search the ${choice.deckId} deck`}>
      <div className="searchModal">
        <header>
          <strong>Search 2 — {choice.deckId}</strong>
          <span>Keep one card. The rest go to the {choice.deckId} discard pile.</span>
        </header>
        <div className="searchCards">
          {choice.revealedCardIds.map((cardId, index) => (
            <div className="searchCardWrap" key={`${cardId}-${index}`}>
              <button
                className="searchCard"
                onClick={() =>
                  onAction({
                    type: "RESOLVE_DECK_SEARCH",
                    playerId: viewerPlayerId,
                    choiceId: choice.id,
                    pick: { kind: "revealed", index }
                  })
                }
                type="button"
              >
                <CardFrame cardId={cardId} className="searchCardImage" />
                <span>Keep {cardName(cardId)}</span>
              </button>
              <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId)} />
            </div>
          ))}
          {choice.canTakeDiscardTop ? (
            <button
              className="searchCard discardPick"
              onClick={() =>
                onAction({
                  type: "RESOLVE_DECK_SEARCH",
                  playerId: viewerPlayerId,
                  choiceId: choice.id,
                  pick: { kind: "discard-top" }
                })
              }
              type="button"
            >
              <CardFrame cardId={discardTop} className="searchCardImage" />
              <span>Take the discard top instead</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RerollModal({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ATTACK_DIE_REROLL") {
    return null;
  }

  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>
          {state.players[choice.playerId]?.name ?? choice.playerId} may reroll the attack die (
          {unitName(state, choice.attackerId)} → {unitName(state, choice.defenderId)})…
        </span>
      </div>
    );
  }

  const chooseActions = legalActions.filter((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
  const rerollAction = legalActions.find((legal) => legal.action.type === "REROLL_PENDING_CHOICE");
  const nextRerollSource = choice.rerollSources.find((source) => source.remaining > 0);

  return (
    <div className="modalBackdrop" role="dialog" aria-label="Reroll choice">
      <div className="searchModal rerollModal">
        <header>
          <strong>Fate is in your hands</strong>
          <span>
            {unitName(state, choice.attackerId)} attacks {unitName(state, choice.defenderId)} — keep a roll or spend a
            reroll.
          </span>
        </header>
        <div className="rerollRow">
          {choice.candidates.map((candidate, index) => {
            const action = chooseActions.find(
              (legal) => legal.action.type === "CHOOSE_PENDING_ROLL" && legal.action.candidateIndex === index
            );
            return (
              <button
                className="rerollDie"
                disabled={!action}
                key={index}
                onClick={() => action && onAction(action.action)}
                type="button"
              >
                <span className="dieFaceBig">{formatDieFace(candidate.roll)}</span>
                <small>{candidate.rolls.map(formatDieFace).join(" / ")}</small>
                <span>Keep</span>
              </button>
            );
          })}
          {rerollAction ? (
            <button className="rerollDie again" onClick={() => onAction(rerollAction.action)} type="button">
              <Dices aria-hidden="true" size={22} />
              <span>
                Reroll{nextRerollSource ? ` with ${nextRerollSource.name}` : ""} ({choice.remainingRerolls} left)
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
