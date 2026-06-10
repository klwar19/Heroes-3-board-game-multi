"use client";

import { Check, CircleOff, Crown, Dices, Hourglass, Undo2 } from "lucide-react";
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
import { CardFrame } from "./seats";

type ReactionLegal = Extract<GameAction, { type: "PLAY_REACTION" }>;

type TrayGroup = {
  cardId: string;
  optionIndex?: number;
  optionLabel?: string;
  modes: CardPlayMode[];
  batchable: boolean;
};

type TraySelection = {
  handIndex: number;
  cardId: string;
  optionIndex?: number;
  mode: CardPlayMode;
};

function selectionPreview(selections: TraySelection[]): string[] {
  const totals = new Map<string, number>();

  for (const selection of selections) {
    const card = cardLibrary[selection.cardId];
    if (!card) {
      continue;
    }
    const effect = getEffectiveCardEffect(card, selection.optionIndex);
    if (!effect) {
      continue;
    }
    const amount = getEffectAmount(effect, selection.mode);

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

  const reactionActions = useMemo(
    () =>
      legalActions
        .map((legal) => legal.action)
        .filter((action): action is ReactionLegal => action.type === "PLAY_REACTION"),
    [legalActions]
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

  // Group the viewer's legal reactions by card + option, then expose one
  // selectable tile per physical copy in hand.
  const groupsByCard = new Map<string, TrayGroup[]>();
  for (const action of reactionActions) {
    const key = `${action.cardId}#${action.optionIndex ?? -1}`;
    const card = cardLibrary[action.cardId];
    const effect = card ? getEffectiveCardEffect(card, action.optionIndex) : null;
    const batchable = Boolean(effect && effect.type !== "CANCEL_SPELL" && effect.type !== "RECALL_SPELL");
    const cardGroups = groupsByCard.get(action.cardId) ?? [];
    const existing = cardGroups.find((group) => `${group.cardId}#${group.optionIndex ?? -1}` === key);

    if (existing) {
      if (!existing.modes.includes(action.mode ?? "basic")) {
        existing.modes.push(action.mode ?? "basic");
      }
    } else {
      cardGroups.push({
        cardId: action.cardId,
        optionIndex: action.optionIndex,
        optionLabel:
          card?.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
            ? card.effect.options[action.optionIndex]?.label
            : undefined,
        modes: [action.mode ?? "basic"],
        batchable
      });
    }
    groupsByCard.set(action.cardId, cardGroups);
  }

  const hand = view.players[viewerPlayerId]?.hand ?? [];
  const tiles = hand
    .map((cardId, handIndex) => ({ cardId, handIndex, groups: groupsByCard.get(cardId) ?? [] }))
    .filter((tile) => tile.groups.length > 0);

  const player = state.players[viewerPlayerId];
  const crownsAvailable = player ? player.limits.expertUses - player.combatStats.expertUsesSpentThisRound : 0;
  const crownsSelected = selections.filter((selection) => selection.mode === "expert").length;

  const toggleSelection = (handIndex: number, cardId: string, group: TrayGroup) => {
    setSelections((current) => {
      const existing = current.find((selection) => selection.handIndex === handIndex);
      if (existing && existing.optionIndex === group.optionIndex) {
        return current.filter((selection) => selection.handIndex !== handIndex);
      }

      const next = current.filter((selection) => selection.handIndex !== handIndex);
      next.push({ handIndex, cardId, optionIndex: group.optionIndex, mode: "basic" });
      return next.sort((left, right) => left.handIndex - right.handIndex);
    });
  };

  const setSelectionMode = (handIndex: number, mode: CardPlayMode) => {
    setSelections((current) =>
      current.map((selection) => (selection.handIndex === handIndex ? { ...selection, mode } : selection))
    );
  };

  const confirmSelection = () => {
    if (selections.length === 0) {
      return;
    }

    if (selections.length === 1) {
      const [only] = selections;
      onAction({
        type: "PLAY_REACTION",
        playerId: viewerPlayerId,
        cardId: only.cardId,
        mode: only.mode,
        ...(only.optionIndex !== undefined ? { optionIndex: only.optionIndex } : {})
      });
      return;
    }

    const plays: ReactionPlay[] = selections.map((selection) => ({
      cardId: selection.cardId,
      mode: selection.mode,
      ...(selection.optionIndex !== undefined ? { optionIndex: selection.optionIndex } : {})
    }));
    onAction({ type: "PLAY_REACTIONS", playerId: viewerPlayerId, plays });
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
        {tiles.length === 0 ? <div className="trayEmpty">No playable instants — pass to continue.</div> : null}
        {tiles.map((tile) => {
          const selection = selections.find((candidate) => candidate.handIndex === tile.handIndex);
          return (
            <div className={`trayTile ${selection ? "selected" : ""}`} key={`${tile.cardId}-${tile.handIndex}`}>
              <CardFrame cardId={tile.cardId} className="trayCardImage" />
              <div className="trayTileBody">
                <strong>{cardName(tile.cardId)}</strong>
                {tile.groups.map((group) => {
                  const groupSelected = Boolean(selection && selection.optionIndex === group.optionIndex);
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

                  return (
                    <div className="trayGroup" key={`${group.cardId}-${group.optionIndex ?? "x"}`}>
                      <button
                        aria-pressed={groupSelected}
                        className={`trayPick ${groupSelected ? "picked" : ""}`}
                        onClick={() => toggleSelection(tile.handIndex, tile.cardId, group)}
                        type="button"
                      >
                        <Check aria-hidden="true" size={13} />
                        <span>{group.optionLabel ?? "Add to play"}</span>
                      </button>
                      {groupSelected && group.modes.includes("expert") ? (
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
          disabled={selections.length === 0 || crownsOver}
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
        </div>
        <div className={`diceBreakdown ${rolling ? "hidden" : ""}`}>
          <span className="formula">
            ⚔ {cue.attackValue - cue.roll - cue.attackBonus}
            {cue.attackBonus !== 0 ? ` + ${cue.attackBonus}` : ""} {cue.roll >= 0 ? "+" : "−"} {Math.abs(cue.roll)} ={" "}
            {cue.attackValue}
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
            <button
              className="searchCard"
              key={`${cardId}-${index}`}
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
