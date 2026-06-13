"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, CircleOff, Crown, Dices, Hourglass, Layers, Swords, Undo2 } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { useEffect, useMemo, useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import {
  getEffectAmount,
  getEffectiveCardEffect,
  getPermanentCardIds,
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
import { ArtifactIcon, DieFaceIcon, DoubleDieIcon, ExperienceIcon } from "./dice-icons";
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
  onAction,
  onViewHand
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  /** Opens the full-size hand browser so cards stay readable mid-window. */
  onViewHand?: () => void;
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
        .filter((action): action is ReactionLegal => action.type === "PLAY_REACTION" && !action.fromScroll),
    [legalActions]
  );

  // Spell Scroll instants: one-click, power-locked, not in hand — kept apart
  // from the hand-card batch tray.
  const scrollReactions = useMemo(
    () =>
      legalActions
        .map((legal) => legal.action)
        .filter((action): action is ReactionLegal => action.type === "PLAY_REACTION" && Boolean(action.fromScroll)),
    [legalActions]
  );

  // School of Magic in play: discard it from the field for the expert bonus.
  const fieldExpert = legalActions.find((legal) => legal.action.type === "USE_PERMANENT_EXPERT");
  const schoolPermanentId =
    getPermanentCardIds(state, viewerPlayerId).find((cardId) =>
      Boolean(cardLibrary[cardId]?.permanentEffect?.schoolBonus)
    ) ?? null;

  // Town-building boosts usable inside this window (Brimstone cube on your
  // own cast, Hall of Valhalla on your unit's attack).
  const buildingBoosts = legalActions.filter(
    (legal) => legal.action.type === "SPEND_TOWN_CUBE" || legal.action.type === "HALL_OF_VALHALLA_BOOST"
  );

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

  const isAttackWindow = window.triggerEvent.type === "UNIT_ATTACK_DECLARED";
  // Attack-window pairing rule: Power (the statistic card or a "+1 Power"
  // discard) only flows into an instant spell played in the same
  // declaration — it cannot be declared on its own during an attack.
  const isPowerSelection = (selection: TraySelection) => {
    if (selection.asPowerBoost) {
      return true;
    }
    const card = cardLibrary[selection.cardId];
    const effect = card ? getEffectiveCardEffect(card, selection.optionIndex) : null;
    return effect?.type === "ADD_SPELL_POWER";
  };
  const hasSpellPlay = selections.some(
    (selection) => !selection.asPowerBoost && cardLibrary[selection.cardId]?.kind === "spell" && !isPowerSelection(selection)
  );
  const powerNeedsSpell = isAttackWindow && selections.some(isPowerSelection) && !hasSpellPlay;

  const confirmSelection = () => {
    if (selections.length === 0 || paymentInvalid || powerNeedsSpell) {
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
        {tiles.length === 0 && !fieldExpert && buildingBoosts.length === 0 && scrollReactions.length === 0 ? (
          <div className="trayEmpty">No playable instants — pass to continue.</div>
        ) : null}
        {buildingBoosts.map((legal) => (
          <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
            <div className="trayTileBody">
              <strong>🏛 Town building</strong>
              <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                {legal.label}
              </button>
            </div>
          </div>
        ))}
        {scrollReactions.map((action) => (
          <div className="trayTile scrollTile" key={JSON.stringify(action)}>
            <CardFrame cardId={action.cardId} className="trayCardImage" />
            <div className="trayTileBody">
              <strong>📜 {cardName(action.cardId)} (Scroll)</strong>
              <button className="trayInstant" onClick={() => onAction(action)} type="button">
                Play at power 0
              </button>
            </div>
          </div>
        ))}
        {fieldExpert && fieldExpert.action.type === "USE_PERMANENT_EXPERT" ? (
          <div className="trayTile permanentTile" key="field-expert">
            <CardFrame cardId={schoolPermanentId ?? undefined} className="trayCardImage" />
            <div className="trayTileBody">
              <strong>{cardName(schoolPermanentId ?? "")} (in play)</strong>
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
          {powerNeedsSpell ? (
            <span className="trayWarning">Power only counts with a Spell played into this attack — add the spell.</span>
          ) : null}
          {crownsOver ? (
            <span className="trayWarning" role="alert">
              {crownsAvailable === 0
                ? "No crowns left this combat round — turn off the Expert plays."
                : `Only ${crownsAvailable} crown${crownsAvailable === 1 ? "" : "s"} left — you picked ${crownsSelected} Expert plays. Turn ${crownsSelected - crownsAvailable} off.`}
            </span>
          ) : null}
          <span className={`crownMeter ${crownsOver ? "over" : ""}`} title="Crowns selected / available">
            <Crown aria-hidden="true" size={13} /> {crownsSelected}/{crownsAvailable}
          </span>
        </div>
        {onViewHand ? (
          <button className="trayPass" onClick={onViewHand} title="Read every card in your hand" type="button">
            <Layers aria-hidden="true" size={15} />
            <span>View hand</span>
          </button>
        ) : null}
        <button
          className="trayConfirm"
          disabled={selections.length === 0 || crownsOver || paymentInvalid || powerNeedsSpell}
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

  const latestIndex = choice.candidates.length - 1;
  const keepAction = legalActions.find(
    (legal) => legal.action.type === "CHOOSE_PENDING_ROLL" && legal.action.candidateIndex === latestIndex
  );
  const rerollAction = legalActions.find((legal) => legal.action.type === "REROLL_PENDING_CHOICE");

  return (
    <div className="modalBackdrop" role="dialog" aria-label="Reroll choice">
      <div className="searchModal rerollModal">
        <header>
          <strong>Fate is in your hands</strong>
          <span>
            {unitName(state, choice.attackerId)} attacks {unitName(state, choice.defenderId)} — a reroll replaces the
            result, the latest roll counts.
          </span>
        </header>
        <div className="rerollRow">
          {choice.candidates.map((candidate, index) => {
            const isLatest = index === latestIndex;
            return (
              <div className={`rerollDie ${isLatest ? "current" : "rerolledAway"}`} key={index}>
                <span className="dieFaceBig">{formatDieFace(candidate.roll)}</span>
                <small>{candidate.rolls.map(formatDieFace).join(" / ")}</small>
                {isLatest ? (
                  keepAction ? (
                    <button className="commandButton primary" onClick={() => onAction(keepAction.action)} type="button">
                      Keep {formatDieFace(candidate.roll)}
                    </button>
                  ) : null
                ) : (
                  <small className="rerolledNote">rerolled away</small>
                )}
              </div>
            );
          })}
          {rerollAction ? (
            <button className="rerollDie again" onClick={() => onAction(rerollAction.action)} type="button">
              <Dices aria-hidden="true" size={22} />
              <span>{rerollAction.label.replace(/^Reroll attack die /, "Reroll ")}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adventure-map dice and visit notices
// ---------------------------------------------------------------------------

export type MapDiceCue = {
  id: string;
  playerName: string;
  dice: "resource" | "treasure" | "attack";
  results: string[];
  resourceRolls?: { resource: "gold" | "buildingMaterials" | "valuables"; amount: number }[];
  treasureRolls?: ("experience" | "artifact-search" | "resource-die" | "double-resource-die")[];
  attackRolls?: number[];
};

/** Cube-face transforms shared by every die; index-aligned with face lists. */
const MAP_CUBE_TRANSFORMS = [
  "rotateY(0deg) translateZ(34px)",
  "rotateY(180deg) translateZ(34px)",
  "rotateY(90deg) translateZ(34px)",
  "rotateY(-90deg) translateZ(34px)",
  "rotateX(90deg) translateZ(34px)",
  "rotateX(-90deg) translateZ(34px)"
];

/** Cube rotation that brings face <index> to the front, with a slight tilt. */
const MAP_CUBE_FINAL = [
  "rotateX(-8deg) rotateY(-6deg)",
  "rotateX(-8deg) rotateY(174deg)",
  "rotateX(-8deg) rotateY(-96deg)",
  "rotateX(-8deg) rotateY(84deg)",
  "rotateX(-98deg) rotateY(0deg)",
  "rotateX(82deg) rotateY(0deg)"
];

/** The printed Resource die: 2/4 materials, 1/2 valuables, 3/6 gold. */
const RESOURCE_DIE_LAYOUT: { resource: "buildingMaterials" | "valuables" | "gold"; amount: number }[] = [
  { resource: "buildingMaterials", amount: 2 },
  { resource: "buildingMaterials", amount: 4 },
  { resource: "valuables", amount: 1 },
  { resource: "valuables", amount: 2 },
  { resource: "gold", amount: 3 },
  { resource: "gold", amount: 6 }
];

const RESOURCE_FACE_ICONS: Record<string, string> = {
  gold: "/assets/icons/gold_leather.gif",
  buildingMaterials: "/assets/icons/ore_leather.gif",
  valuables: "/assets/icons/crystal_leather.gif"
};

/** The printed Treasure die: 2× experience, 2× artifact, 1× die, 1× 2 dice. */
const TREASURE_DIE_LAYOUT: ("experience" | "artifact-search" | "resource-die" | "double-resource-die")[] = [
  "experience",
  "experience",
  "artifact-search",
  "artifact-search",
  "resource-die",
  "double-resource-die"
];

/** Treasure-die face art (authentic-styled SVG) and its caption. */
const TREASURE_FACE_ICONS: Record<string, { icon: React.ReactNode; label: string }> = {
  experience: { icon: <ExperienceIcon size={22} />, label: "½ Level" },
  "artifact-search": { icon: <ArtifactIcon size={20} />, label: "artifact" },
  "resource-die": { icon: <DieFaceIcon size={20} />, label: "die" },
  "double-resource-die": { icon: <DoubleDieIcon size={22} />, label: "2 dice" }
};

const ATTACK_DIE_LAYOUT = [1, -1, 0, 0, -1, 1];

function MapDieCube({
  kind,
  faceIndex,
  rolling,
  dimmed
}: {
  kind: MapDiceCue["dice"];
  faceIndex: number;
  rolling: boolean;
  dimmed: boolean;
}) {
  const faceContent = (index: number) => {
    if (kind === "resource") {
      const face = RESOURCE_DIE_LAYOUT[index];
      return (
        <>
          <img alt="" src={assetUrl(RESOURCE_FACE_ICONS[face.resource])} />
          <b>{face.amount}</b>
        </>
      );
    }
    if (kind === "treasure") {
      const face = TREASURE_FACE_ICONS[TREASURE_DIE_LAYOUT[index]];
      return (
        <>
          <span className="mapFaceGlyph">{face.icon}</span>
          <small>{face.label}</small>
        </>
      );
    }
    return <>{formatDieFace(ATTACK_DIE_LAYOUT[index])}</>;
  };

  return (
    <div className={`dieScene ${dimmed ? "dimmed" : ""}`}>
      <div
        className={`dieCube mapDie-${kind} ${rolling ? "tumbling" : "settled"}`}
        style={rolling ? undefined : { transform: MAP_CUBE_FINAL[faceIndex] ?? MAP_CUBE_FINAL[0] }}
      >
        {MAP_CUBE_TRANSFORMS.map((transform, index) => (
          <span className={`dieFace mapDieFace mapDieFace-${kind}`} key={index} style={{ transform }}>
            {faceContent(index)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Face index a structured roll lands on, for the settle rotation. */
function mapDiceFaceIndexes(cue: MapDiceCue): number[] {
  if (cue.dice === "resource" && cue.resourceRolls?.length) {
    return cue.resourceRolls.map((roll) =>
      Math.max(
        0,
        RESOURCE_DIE_LAYOUT.findIndex((face) => face.resource === roll.resource && face.amount === roll.amount)
      )
    );
  }
  if (cue.dice === "treasure" && cue.treasureRolls?.length) {
    return cue.treasureRolls.map((roll) => Math.max(0, TREASURE_DIE_LAYOUT.indexOf(roll)));
  }
  if (cue.dice === "attack" && cue.attackRolls?.length) {
    return cue.attackRolls.map((roll) => Math.max(0, ATTACK_DIE_LAYOUT.indexOf(roll)));
  }
  return [0];
}

const MAP_DICE_TITLES: Record<MapDiceCue["dice"], string> = {
  resource: "Resource die",
  treasure: "Treasure die",
  attack: "Attack die"
};

/**
 * Adventure-map die roll, staged exactly like the combat attack roll: the
 * physical cube tumbles, settles on the rolled face, and the outcome reads
 * out underneath. Rendered with key={cue.id} so each roll mounts fresh.
 */
export function MapDiceOverlay({ cue, onDone }: { cue: MapDiceCue; onDone: () => void }) {
  const [phase, setPhase] = useState<"rolling" | "settled">("rolling");

  useEffect(() => {
    const settleId = setTimeout(() => setPhase("settled"), 950);
    const doneId = setTimeout(onDone, 2900);

    return () => {
      clearTimeout(settleId);
      clearTimeout(doneId);
    };
  }, [onDone]);

  const rolling = phase === "rolling";
  const faceIndexes = mapDiceFaceIndexes(cue);

  return (
    <div className="diceOverlay mapDiceOverlay" role="status" aria-label={`${MAP_DICE_TITLES[cue.dice]} roll`} onClick={onDone}>
      <div className="diceStage">
        <header>
          <Dices aria-hidden="true" size={16} />
          <strong>
            {cue.playerName} rolls the {MAP_DICE_TITLES[cue.dice]}
            {faceIndexes.length > 1 ? ` ×${faceIndexes.length}` : ""}
          </strong>
        </header>
        <div className="diceRow">
          {faceIndexes.map((faceIndex, index) => (
            <MapDieCube dimmed={false} faceIndex={faceIndex} key={index} kind={cue.dice} rolling={rolling} />
          ))}
        </div>
        <div className={`diceBreakdown ${rolling ? "hidden" : ""}`}>
          {cue.results.map((result, index) => (
            <strong className="damageResult hit" key={index}>
              {result}
            </strong>
          ))}
          {faceIndexes.length > 1 ? <span className="versus">choose one</span> : null}
        </div>
      </div>
    </div>
  );
}

export type MapNoticeCue = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  lines: string[];
  /** Visited location id, so the notice can swap in dedicated art. */
  location?: string;
};

/** Locations drawn with the treasure-chest art instead of the money-bag glyph. */
const TREASURE_CHEST_LOCATIONS = new Set(["treasure_symbol", "sea_chest"]);

/** A small wooden treasure chest with gold bands and a lock — drawn as art. */
function TreasureChestIcon() {
  return (
    <svg className="treasureChestArt" viewBox="0 0 48 40" width="46" height="38" role="img" aria-label="Treasure chest">
      {/* lid */}
      <path d="M5 19 Q24 1 43 19 L43 21 L5 21 Z" fill="#8a5524" stroke="#3a2410" strokeWidth="1.6" />
      <path d="M5 19 Q24 6 43 19" fill="none" stroke="#a9712f" strokeWidth="1.4" />
      {/* body */}
      <rect x="5" y="20" width="38" height="17" rx="2.5" fill="#9c6529" stroke="#3a2410" strokeWidth="1.6" />
      {/* gold bands */}
      <rect x="5" y="23" width="38" height="3.6" fill="#f4c64e" stroke="#9c7a1e" strokeWidth="0.7" />
      <rect x="9" y="20" width="3.2" height="17" fill="#f4c64e" stroke="#9c7a1e" strokeWidth="0.6" />
      <rect x="35.8" y="20" width="3.2" height="17" fill="#f4c64e" stroke="#9c7a1e" strokeWidth="0.6" />
      {/* lock */}
      <rect x="20.5" y="24" width="7" height="8" rx="1.4" fill="#f8d469" stroke="#8a6713" strokeWidth="1" />
      <circle cx="24" cy="27.4" r="1.3" fill="#5b3a12" />
      <rect x="23.3" y="27.4" width="1.4" height="3" fill="#5b3a12" />
    </svg>
  );
}

/**
 * Location-visit notice, popped into the player's face instead of a corner
 * toast: who stepped where, and what the visit did. Click (or wait) to
 * dismiss; dice rolls layer on top with their own overlay.
 */
export function MapNoticeOverlay({ cue, onDone }: { cue: MapNoticeCue; onDone: () => void }) {
  useEffect(() => {
    const doneId = setTimeout(onDone, cue.lines.length > 0 ? 5200 : 3400);
    return () => clearTimeout(doneId);
  }, [cue, onDone]);

  const showChest = cue.location ? TREASURE_CHEST_LOCATIONS.has(cue.location) : false;

  return (
    <div className="mapNoticeBackdrop" onClick={onDone} role="status" aria-label={cue.title}>
      <div className="mapNotice">
        <span aria-hidden="true" className="mapNoticeIcon">
          {showChest ? <TreasureChestIcon /> : cue.icon}
        </span>
        <strong>{cue.title}</strong>
        <small>{cue.subtitle}</small>
        {cue.lines.length > 0 ? (
          <ul>
            {cue.lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        ) : null}
        <small className="mapNoticeHint">click to continue</small>
      </div>
    </div>
  );
}

export type FirstPlayerRollCue = {
  id: string;
  /** Each roll round the engine recorded; ties carry over to the next round. */
  attempts: { rolls: { playerId: string; name: string; value: number }[] }[];
  winnerPlayerId: string;
  winnerName: string;
  /** Final seating order, winner first. */
  order: { playerId: string; name: string }[];
};

/**
 * Determine-the-first-player ceremony, played out one roll at a time so it
 * feels like grabbing the dice: everyone's Attack die sits ready, a button
 * rolls them, they tumble and settle, the highest is highlighted — and a tie
 * offers a reroll among the tied players (replaying the exact rounds the engine
 * already decided). The last round names the starting player and the order.
 */
export function FirstPlayerRollOverlay({ cue, onDone }: { cue: FirstPlayerRollCue; onDone: () => void }) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [phase, setPhase] = useState<"ready" | "rolling" | "revealed">("ready");

  const attempt = cue.attempts[attemptIndex] ?? cue.attempts[cue.attempts.length - 1];
  const isFinalAttempt = attemptIndex >= cue.attempts.length - 1;
  const best = Math.max(...attempt.rolls.map((roll) => roll.value));
  const revealed = phase === "revealed";
  const rolling = phase === "rolling";

  useEffect(() => {
    if (!rolling) {
      return;
    }
    const settle = setTimeout(() => setPhase("revealed"), 1000);
    return () => clearTimeout(settle);
  }, [rolling]);

  const roll = () => {
    if (phase === "ready") {
      setPhase("rolling");
    }
  };
  const reroll = () => {
    setAttemptIndex((index) => Math.min(index + 1, cue.attempts.length - 1));
    setPhase("ready");
  };

  return (
    <div className="diceOverlay firstRollOverlay" role="dialog" aria-label="Who goes first?">
      <div className="diceStage firstRollStage">
        <header>
          <Crown aria-hidden="true" size={16} />
          <strong>Who goes first?</strong>
          <span className="rollMode">
            Everyone rolls the Attack die — highest starts{cue.attempts.length > 1 ? " · ties reroll" : ""}
          </span>
        </header>

        <div className="firstRollContenders">
          {attempt.rolls.map((entry) => {
            const isLeader = revealed && entry.value === best;
            return (
              <div className={`firstRollContender ${revealed ? (isLeader ? "leader" : "trailing") : ""}`} key={entry.playerId}>
                <span className="firstRollName">{entry.name}</span>
                <DieCube dimmed={!revealed && !rolling} rolling={rolling} value={revealed ? entry.value : 0} />
                <span className="firstRollValue">{revealed ? formatDieFace(entry.value) : "—"}</span>
              </div>
            );
          })}
        </div>

        <div className="firstRollActions">
          {phase === "ready" ? (
            <button className="commandButton primary" onClick={roll} type="button">
              <Dices aria-hidden="true" size={15} /> {attemptIndex === 0 ? "Roll the dice!" : "Reroll the tie!"}
            </button>
          ) : null}
          {rolling ? <span className="firstRollHint">rolling…</span> : null}
          {revealed && !isFinalAttempt ? (
            <>
              <strong className="firstRollTie">It&apos;s a tie — roll again!</strong>
              <button className="commandButton primary" onClick={reroll} type="button">
                <Dices aria-hidden="true" size={15} /> Reroll
              </button>
            </>
          ) : null}
          {revealed && isFinalAttempt ? (
            <>
              <strong className="firstRollWinner">{cue.winnerName} plays first!</strong>
              <ol className="firstRollOrder">
                {cue.order.map((seat, index) => (
                  <li key={seat.playerId}>
                    <span className="firstRollSeatNo">{index + 1}</span> {seat.name}
                  </li>
                ))}
              </ol>
              <button className="commandButton primary" onClick={onDone} type="button">
                <Check aria-hidden="true" size={15} /> Begin the adventure
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * End-of-combat notice: combat no longer drops back to the map by itself.
 * The battlefield stays up behind this popup until a participant clicks
 * "Return to the adventure map" (ACKNOWLEDGE_COMBAT_END); the battle
 * simulator offers a table reset instead. "Keep looking" hides the popup so
 * the final board can be inspected — the dock keeps the return button.
 */
export function CombatResultModal({
  state,
  viewerPlayerId,
  legalActions,
  onAction,
  onReset
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  onReset?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const combat = state.combat;
  const outcome = combat?.outcome;

  if (!combat || !outcome || dismissed) {
    return null;
  }

  const isSandbox = combat.context.kind === "sandbox";
  const winnerName = state.players[outcome.winnerPlayerId]?.name ?? outcome.winnerPlayerId;
  const defeatedName = state.players[outcome.defeatedPlayerId]?.name ?? outcome.defeatedPlayerId;
  const viewerWon = outcome.winnerPlayerId === viewerPlayerId;
  const viewerLost = outcome.defeatedPlayerId === viewerPlayerId;
  const acknowledge = legalActions.find((legal) => legal.action.type === "ACKNOWLEDGE_COMBAT_END");

  const title =
    outcome.reason === "retreat"
      ? viewerLost
        ? "You retreat"
        : `${defeatedName} retreats`
      : viewerWon
        ? "Victory!"
        : viewerLost
          ? "Defeat"
          : `${winnerName} wins`;
  const detail =
    outcome.reason === "retreat"
      ? `${defeatedName} falls back to the last visited field. The combat is over.`
      : `${winnerName} defeats ${defeatedName}${
          outcome.reason === "all-enemy-units-defeated" ? " — every opposing unit is gone" : ""
        }.`;

  return (
    <div className="combatResultBackdrop" role="dialog" aria-label="Combat result">
      <div className={`combatResultModal ${viewerWon ? "won" : viewerLost ? "lost" : ""}`}>
        <header>
          <Swords aria-hidden="true" size={18} />
          <strong>{title}</strong>
        </header>
        <p>{detail}</p>
        {!isSandbox ? (
          <small>
            Experience, unit cards and the contested field resolve when the battlefield closes.
          </small>
        ) : null}
        <div className="combatResultButtons">
          {acknowledge ? (
            <button className="commandButton primary" onClick={() => onAction(acknowledge.action)} type="button">
              {acknowledge.label}
            </button>
          ) : null}
          {isSandbox && onReset ? (
            <button className="commandButton primary" onClick={onReset} type="button">
              Reset the table
            </button>
          ) : null}
          <button className="commandButton ghost" onClick={() => setDismissed(true)} type="button">
            Keep looking at the battlefield
          </button>
        </div>
      </div>
    </div>
  );
}
