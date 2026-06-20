"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, CircleOff, Crown, Dices, Hourglass, Layers, Sunrise, Swords, Undo2, Zap } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { useEffect, useMemo, useRef, useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import { getFxSheet } from "@/data/fx";
import { playDiceRoll, playLibrarySound } from "@/lib/sound";
import {
  effectHasExpertMode,
  getEffectAmount,
  getEffectiveCardEffect,
  getPendingReactionPower,
  getSpellDamageAmount,
  spellPowerValueOfCard,
  standingSpellPower,
  SURRENDER_GOLD_COST,
  type CardPlayMode,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState,
  type ReactionPlay
} from "@/engine";
import { cardName, costCardEligible, formatDieFace, formatEvent, unitName } from "./utils";
import { CardBack, CardFrame } from "./seats";
import { AnkhIcon, CrossedShovelsIcon, StarBannerIcon } from "./dice-icons";
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
  /** Bowstring: the friendly ranged unit this play activates out of order. */
  target?: ReactionLegal["target"];
  /** Cards from hand this option demands as payment. */
  costCards?: { exact?: number; upTo?: number; powerCost?: number; filter?: "spell" | "power-source" };
};

type TraySelection = {
  handIndex: number;
  cardId: string;
  optionIndex?: number;
  mode: CardPlayMode;
  asPowerBoost?: boolean;
  /** Window-ending play (Magic Mirror's paid redirect): always selected solo. */
  nonBatchable?: boolean;
  costCards?: { exact?: number; upTo?: number; powerCost?: number; filter?: "spell" | "power-source" };
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

/**
 * Live Power readout for the open instant window. Shows the spell/attack's
 * CURRENT Power (printed base + Power fuelled so far) so the caster can see how
 * much Power they have committed and the defender can read the final Power
 * before choosing Resistance (which only cancels Power ≤ 1) or Magic Mirror.
 * The number is the engine's, recomputed every render, so it climbs in step
 * with each Power card played. Shown to both the active player and the one
 * waiting on them.
 */
function PendingPowerReadout({ state }: { state: GameState }) {
  const power = getPendingReactionPower(state);
  if (!power) {
    return null;
  }

  const spell = power.spellCardId ? cardLibrary[power.spellCardId] : undefined;
  const subject = power.kind === "spell" ? cardName(power.spellCardId ?? "") : "This attack";
  // Damage spells (Magic Arrow, Lightning Bolt, …) read more clearly with the
  // damage their CURRENT Power deals beside the number; non-damage spells just
  // show the Power level. This is the spell's value before the target's own
  // spell-damage reduction, so it is labelled as the spell's damage, not a
  // promised final hit.
  const damage =
    power.kind === "spell" && spell && spell.effect.type === "DEAL_DAMAGE"
      ? getSpellDamageAmount(spell, power.totalPower)
      : null;

  return (
    <span
      className="trayPowerMeter"
      title="Power fuels the spell's effect. Resistance only cancels a spell cast at Power 1 or less; Magic Mirror redirects it at whatever Power you used."
    >
      <Zap aria-hidden="true" size={13} />
      <strong>Power {power.totalPower}</strong>
      <small>
        {subject}
        {damage !== null ? ` · ${damage} damage` : ""}
        {power.fueledPower > 0
          ? ` · ${power.basePower} base + ${power.fueledPower} fuelled`
          : " · no Power added yet"}
      </small>
    </span>
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

  // The attack/cast window keeps priority with one player across several plays
  // (so a caster can empower a spell in steps), so this component is NOT
  // remounted between those plays. Selections are keyed on hand index, so a
  // card leaving the hand would shift every index and corrupt the next pick —
  // reset the in-progress selection whenever the hand actually changes. This is
  // the React "adjust state when a prop changes" pattern (reset during render),
  // which avoids a cascading-render effect.
  const handSignature = (view.players[viewerPlayerId]?.hand ?? []).join("|");
  const [lastHandSignature, setLastHandSignature] = useState(handSignature);
  if (lastHandSignature !== handSignature) {
    setLastHandSignature(handSignature);
    setSelections([]);
  }

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
        <PendingPowerReadout state={state} />
        <small>Waiting for {state.players[window.priorityPlayerId]?.name ?? window.priorityPlayerId} to respond…</small>
      </div>
    );
  }

  // Group the viewer's legal reactions by card + option (+1-Power discards
  // are their own group), then expose one selectable tile per copy in hand.
  const groupsByCard = new Map<string, TrayGroup[]>();
  for (const action of reactionActions) {
    // A per-unit target (Bowstring) makes otherwise-identical plays distinct, so
    // it joins the group key — each ranged unit gets its own tile button.
    const targetKey = action.target?.type === "unit" ? `#${action.target.unitId}` : "";
    const key = `${action.cardId}#${action.optionIndex ?? -1}#${action.asPowerBoost ? "boost" : "play"}${targetKey}`;
    const card = cardLibrary[action.cardId];
    const effect = card && !action.asPowerBoost ? getEffectiveCardEffect(card, action.optionIndex) : null;
    const batchable = action.asPowerBoost
      ? true
      : Boolean(
          effect &&
            // A target rides only the single PLAY_REACTION, never the batch
            // (PLAY_REACTIONS carries no target), so it must resolve on its own.
            !action.target &&
            effect.type !== "CANCEL_SPELL" &&
            effect.type !== "RECALL_SPELL" &&
            effect.type !== "REDIRECT_SPELL"
        );
    const option =
      card?.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
        ? card.effect.options[action.optionIndex]
        : undefined;
    const cost = option?.cost;
    const costCards =
      cost &&
      (cost.discardCards !== undefined || cost.discardCardsUpTo !== undefined || cost.powerCost !== undefined)
        ? {
            exact: cost.discardCards,
            upTo: cost.discardCardsUpTo,
            // Sorrow's silver/gold skip: pay a Power VALUE (2/4), not a card
            // count — selected power-source cards count their printed Power.
            powerCost: cost.powerCost,
            filter: cost.costCardFilter
          }
        : undefined;
    const cardGroups = groupsByCard.get(action.cardId) ?? [];
    const existing = cardGroups.find((group) => {
      const groupTargetKey = group.target?.type === "unit" ? `#${group.target.unitId}` : "";
      return `${group.cardId}#${group.optionIndex ?? -1}#${group.asPowerBoost ? "boost" : "play"}${groupTargetKey}` === key;
    });

    if (existing) {
      if (!existing.modes.includes(action.mode ?? "basic")) {
        existing.modes.push(action.mode ?? "basic");
      }
    } else {
      cardGroups.push({
        cardId: action.cardId,
        optionIndex: action.optionIndex,
        optionLabel: action.asPowerBoost
          ? "Discard for +1 Power"
          : action.target?.type === "unit"
            ? `Activate ${unitName(state, action.target.unitId)}`
            : option?.label,
        modes: [action.mode ?? "basic"],
        batchable,
        asPowerBoost: action.asPowerBoost,
        target: action.target,
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

      const incoming: TraySelection = {
        handIndex,
        cardId,
        optionIndex: group.optionIndex,
        mode: "basic",
        asPowerBoost: group.asPowerBoost,
        nonBatchable: group.batchable === false,
        costCards: group.costCards,
        costHandIndexes: []
      };

      // A window-ending play (Magic Mirror's paid redirect) is always solo:
      // picking it clears any batch, and a later batchable pick clears it.
      if (incoming.nonBatchable) {
        return [incoming];
      }

      const next = current
        .filter((selection) => selection.handIndex !== handIndex && !selection.nonBatchable)
        // A card leaving/entering play also leaves any payment role.
        .map((selection) => ({
          ...selection,
          costHandIndexes: selection.costHandIndexes.filter((index) => index !== handIndex)
        }));
      next.push(incoming);
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

  // Power-value cost (Sorrow's silver/gold skip): the standing spell Power for
  // the played card's school plus the printed Power of each chosen power-source
  // card. Mirrors the engine's payOptionCardCost so the tray's running total and
  // the resolution agree on what reaches a grade.
  const powerPaidBy = (selection: TraySelection) => {
    const card = cardLibrary[selection.cardId];
    const schools = card?.spellSchools ?? [];
    const standing = card ? standingSpellPower(state, viewerPlayerId, card) : 0;
    const fromCards = selection.costHandIndexes.reduce(
      (sum, index) => sum + spellPowerValueOfCard(cardLibrary[hand[index]], schools),
      0
    );
    return { standing, total: standing + fromCards };
  };

  const paymentInvalid = selections.some((selection) => {
    const cost = selection.costCards;
    if (!cost) {
      return false;
    }
    if (cost.powerCost !== undefined) {
      const { total } = powerPaidBy(selection);
      // Under-paid, or carrying a redundant Power card the engine would reject
      // ("more Power than it needs"): every chosen card must be necessary.
      if (total < cost.powerCost) {
        return true;
      }
      const schools = cardLibrary[selection.cardId]?.spellSchools ?? [];
      return selection.costHandIndexes.some(
        (index) => total - spellPowerValueOfCard(cardLibrary[hand[index]], schools) >= cost.powerCost!
      );
    }
    return cost.exact !== undefined && selection.costHandIndexes.length !== cost.exact;
  });

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
  // …but once a power-scaling spell (Bloodlust, Bless, or Slayer) is already on
  // the pending attack, the caster keeps priority and may keep adding Power to it
  // on its own — mirrors the engine's hasEmpowerablePlayed. Without this the tray
  // blocks a lone "+1 Power" the engine would happily accept after Slayer.
  const attackStackItem = isAttackWindow ? state.stack.at(-1) : undefined;
  const attackOwner =
    attackStackItem?.action.type === "ATTACK_UNIT" || attackStackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
      ? attackStackItem.action.playerId
      : undefined;
  const attackAlreadyEmpowerable =
    attackOwner === viewerPlayerId &&
    ((attackStackItem?.modifiers.powerScaledAttackInstants?.length ?? 0) > 0 ||
      attackStackItem?.modifiers.slayerRollsByPower !== undefined);
  const powerNeedsSpell =
    isAttackWindow && selections.some(isPowerSelection) && !hasSpellPlay && !attackAlreadyEmpowerable;

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
  const passLabel = isAttackWindow
    ? "Done — roll the die!"
    : window.triggerEvent.type === "UNIT_LETHAL_HIT"
      ? "Let it die"
      : "Pass";
  const crownsOver = crownsSelected > crownsAvailable;

  return (
    <div className="reactionTray" role="dialog" aria-label="Instant window">
      <header>
        <Undo2 aria-hidden="true" size={15} />
        <strong>Instant window</strong>
        <span>{triggerText}</span>
        <PendingPowerReadout state={state} />
      </header>
      <div className="trayTiles">
        {tiles.length === 0 && buildingBoosts.length === 0 && scrollReactions.length === 0 ? (
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
                  if (!group.batchable && !group.costCards) {
                    // Cost-free window-ending plays (Resistance, spell recall)
                    // resolve immediately and on their own. A PAID window-ender
                    // (Magic Mirror's silver/gold redirect) falls through to the
                    // pick + cost-picker path below so its Power can be paid; it
                    // is kept solo by toggleSelection and fired by the footer.
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
                            ...(group.optionIndex !== undefined ? { optionIndex: group.optionIndex } : {}),
                            ...(group.target ? { target: group.target } : {})
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
                  // Sorrow's silver/gold skip pays a Power VALUE, not a card
                  // count: each chip is valued by its printed Power and the
                  // running total (standing + chosen) must reach the threshold.
                  const powerCostValue = selection?.costCards?.powerCost;
                  const isPowerCost = powerCostValue !== undefined;
                  const playedSchools = cardLibrary[tile.cardId]?.spellSchools ?? [];
                  const powerPaid = isPowerCost && selection ? powerPaidBy(selection) : null;

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
                      ) : groupSelected &&
                        !group.asPowerBoost &&
                        !group.modes.includes("expert") &&
                        crownsAvailable <= 0 &&
                        (() => {
                          const effect = getEffectiveCardEffect(cardLibrary[group.cardId], group.optionIndex);
                          return effect ? effectHasExpertMode(effect) : false;
                        })() ? (
                        // The card HAS an expert side, but there are no crowns left
                        // this combat round — show the option locked, not hidden,
                        // so the player understands why they can't pick it.
                        <button
                          aria-disabled="true"
                          className="trayExpert locked"
                          disabled
                          title="No expert-effect crowns left this combat round."
                          type="button"
                        >
                          <Crown aria-hidden="true" size={13} />
                          <span>Expert 🔒</span>
                        </button>
                      ) : null}
                      {needsPayment ? (
                        <div className="trayPayment" aria-label="Choose cards to pay the cost">
                          <small>
                            {isPowerCost
                              ? `Pay ${powerCostValue} Power${
                                  (powerPaid?.standing ?? 0) > 0 ? ` · ${powerPaid?.standing} standing` : ""
                                } — ${powerPaid?.total ?? 0}/${powerCostValue} chosen`
                              : selection?.costCards?.exact !== undefined
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
                                selection?.costCards?.filter !== undefined &&
                                !costCardEligible(payCardId, selection.costCards.filter);
                              // A power source of the wrong school contributes
                              // nothing to this spell, so it can never validly pay.
                              const powerValue = isPowerCost
                                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools)
                                : 0;
                              if (takenElsewhere || wrongKind || (isPowerCost && powerValue <= 0)) {
                                return null;
                              }
                              // Count mode fills at the card target; Power mode
                              // stops once the threshold is met (no over-paying).
                              const full =
                                !inThisPayment &&
                                (isPowerCost
                                  ? (powerPaid?.total ?? 0) >= (powerCostValue ?? 0)
                                  : (selection?.costHandIndexes.length ?? 0) >= paymentTarget);
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
                                  {isPowerCost ? ` (+${powerValue})` : ""}
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
  /**
   * Every die rolled counts toward the outcome (Slayer counts the "+1"s; the
   * Champions' "apply both" sums two faces). The overlay then keeps every die
   * lit rather than dimming the "unused" ones it greys out for an advantage/
   * disadvantage keep-one roll.
   */
  sumAllDice?: boolean;
  /**
   * Spell-roll mode (Inferno): the cube(s) size a Spell's own effect, so the
   * overlay shows the spell's name and a "N hits" read-out instead of the
   * attacker-vs-defender combat breakdown.
   */
  spellMode?: boolean;
  /** Spell-mode heading (the spell's name). */
  title?: string;
  /** Spell-mode read-out under the dice (e.g. "3 hits → 3 damage each"). */
  caption?: string;
  /**
   * Hold the board (no overlay) this long before the cube starts tumbling.
   * Set for a neutral guard that moved into range first, so the table watches
   * it slide in, pauses, then sees the attack die thrown — and used by the
   * Inferno roll to wait out the spell card's flight before the dice tumble.
   */
  preDelayMs?: number;
};

/**
 * Tabletop pacing for the attack die: the cube is hurled, tumbles and bounces
 * across the felt, settles with a weighty wobble, then the result reads out. The
 * roll is deliberately drawn out so the throw lands like a real die coming to
 * rest rather than a quick CSS flick — the suspense is half the fun.
 */
export const DICE_ROLL_MS = 1850;
export const DICE_READ_MS = 2150;
/** Total time the attack-die overlay holds the screen (roll + read). */
export const DICE_PRESENT_MS = DICE_ROLL_MS + DICE_READ_MS;

/** How long each first-player attempt's dice clatter before the faces reveal. */
export const FIRST_ROLL_TUMBLE_MS = 1300;

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
  const preDelay = cue.preDelayMs ?? 0;
  // "waiting": board visible while a guard finishes sliding into range.
  const [phase, setPhase] = useState<"waiting" | "rolling" | "settled">(preDelay > 0 ? "waiting" : "rolling");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const beginRoll = () => {
      setPhase("rolling");
      playDiceRoll(cue.rolls.length, DICE_ROLL_MS - 120);
    };
    if (preDelay > 0) {
      timers.push(setTimeout(beginRoll, preDelay));
    } else {
      beginRoll();
    }
    timers.push(setTimeout(() => setPhase("settled"), preDelay + DICE_ROLL_MS));
    timers.push(setTimeout(onDone, preDelay + DICE_ROLL_MS + DICE_READ_MS));

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [onDone, preDelay, cue.rolls.length]);

  // During the pre-attack pause keep the board clear so the guard's move reads.
  if (phase === "waiting") {
    return null;
  }

  const rolling = phase === "rolling";

  return (
    <div
      className="diceOverlay"
      role="status"
      aria-label={cue.spellMode ? `${cue.title ?? "Spell"} roll` : "Attack roll"}
      onClick={onDone}
    >
      <div className="diceStage">
        <header>
          <Dices aria-hidden="true" size={16} />
          <strong>
            {cue.spellMode
              ? (cue.title ?? "Spell")
              : `${cue.isRetaliation ? "Retaliation!" : "Attack!"} ${cue.attackerName} → ${cue.defenderName}`}
          </strong>
          {cue.rollMode !== "normal" ? <span className="rollMode">{cue.rollMode}</span> : null}
        </header>
        <div className="diceRow">
          {cue.rolls.map((roll, index) => (
            <DieCube
              // Summed rolls (Slayer / Inferno / "apply both") keep every die lit —
              // only an advantage/disadvantage keep-one roll dims the unused face.
              dimmed={!rolling && !cue.sumAllDice && cue.rolls.length > 1 && roll !== cue.roll}
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
          {cue.spellMode ? (
            <strong className={`damageResult ${cue.roll > 0 ? "hit" : "blocked"}`}>
              {cue.caption ?? (cue.roll > 0 ? `${cue.roll} hit${cue.roll === 1 ? "" : "s"}` : "No effect")}
            </strong>
          ) : (
            <>
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
            </>
          )}
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

  return (
    <div className="modalBackdrop" role="dialog" aria-label={`Search the ${choice.deckId} deck`}>
      <div className="searchModal">
        <header>
          <strong>Search {choice.revealedCardIds.length} — {choice.deckId}</strong>
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
  experience: { icon: <StarBannerIcon size={24} />, label: "½ Level" },
  "artifact-search": { icon: <AnkhIcon size={22} />, label: "artifact" },
  "resource-die": {
    icon: <img alt="" className="mapTreasureResourceIcon" src={assetUrl("/assets/ui/dice-resource-tools.webp")} />,
    label: "resource"
  },
  "double-resource-die": { icon: <CrossedShovelsIcon size={31} />, label: "×2" }
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
          {/* The source art is a resource on a leather tile; the wrapper crops
              the leather frame away so only the gold/ore/crystal reads. */}
          <span className="mapDieResource">
            <img alt="" src={assetUrl(RESOURCE_FACE_ICONS[face.resource])} />
          </span>
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
  const faceIndexes = mapDiceFaceIndexes(cue);
  const dieCount = faceIndexes.length;

  useEffect(() => {
    playDiceRoll(dieCount, DICE_ROLL_MS - 120);
    const settleId = setTimeout(() => setPhase("settled"), DICE_ROLL_MS);
    const doneId = setTimeout(onDone, DICE_ROLL_MS + DICE_READ_MS);

    return () => {
      clearTimeout(settleId);
      clearTimeout(doneId);
    };
  }, [onDone, dieCount]);

  const rolling = phase === "rolling";

  return (
    <div
      aria-label={`${MAP_DICE_TITLES[cue.dice]} roll`}
      className="diceOverlay mapDiceOverlay"
      onClick={onDone}
      role="status"
    >
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
  const [phase, setPhase] = useState<"rolling" | "revealed">("rolling");

  const attempt = cue.attempts[attemptIndex] ?? cue.attempts[cue.attempts.length - 1];
  const isFinalAttempt = attemptIndex >= cue.attempts.length - 1;
  const best = Math.max(...attempt.rolls.map((roll) => roll.value));
  const revealed = phase === "revealed";
  const rolling = phase === "rolling";

  // The ceremony auto-plays straight off the shared cue, so every seat watches
  // the identical sequence on the same beat — nobody clicks to roll, and a tie
  // rolls on by itself. Only the final "Begin" dismissal is left to each seat.
  useEffect(() => {
    if (phase !== "rolling") {
      return;
    }
    // Each contender's die clatters as the ceremony rolls them, settling with
    // the reveal — the same tabletop throw the combat and map dice use.
    playDiceRoll(attempt.rolls.length, FIRST_ROLL_TUMBLE_MS - 120);
    const settle = window.setTimeout(() => setPhase("revealed"), FIRST_ROLL_TUMBLE_MS);
    return () => window.clearTimeout(settle);
  }, [phase, attemptIndex, attempt.rolls.length]);

  useEffect(() => {
    if (phase !== "revealed" || isFinalAttempt) {
      return;
    }
    const next = window.setTimeout(() => {
      setAttemptIndex((index) => Math.min(index + 1, cue.attempts.length - 1));
      setPhase("rolling");
    }, 1600);
    return () => window.clearTimeout(next);
  }, [phase, isFinalAttempt, cue.attempts.length]);

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
                <DieCube dimmed={false} rolling={rolling} value={revealed ? entry.value : 0} />
                <span className="firstRollValue">{revealed ? formatDieFace(entry.value) : "…"}</span>
              </div>
            );
          })}
        </div>

        <div className="firstRollActions">
          {rolling ? <span className="firstRollHint">rolling…</span> : null}
          {revealed && !isFinalAttempt ? (
            <strong className="firstRollTie">It&apos;s a tie — rolling again!</strong>
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

export type NewDayCue = {
  id: string;
  playerName: string;
  round: number;
};

/**
 * "A new day" cinematic: the classic Heroes III sunrise (NewDay.def, ten
 * frames) plays center screen at the start of every turn — the same for every
 * seat, because it is driven off the shared TURN_STARTED event rather than any
 * one client's clock. The new-day chime plays alongside it; the overlay is
 * non-interactive (pointer-events: none) and clears itself once it has played.
 */
export function NewDayOverlay({ cue, onDone }: { cue: NewDayCue; onDone: () => void }) {
  const spriteRef = useRef<HTMLDivElement | null>(null);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    playLibrarySound("adventure/new-day", 0.6);
    const sheet = getFxSheet("new-day");
    const sprite = spriteRef.current;
    const playMs = sheet ? (sheet.frames / sheet.fps) * 1000 : 1200;
    const holdMs = 1100;
    const start = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      if (sprite && sheet) {
        const frame = Math.min(sheet.frames - 1, Math.floor((elapsed / 1000) * sheet.fps));
        const col = frame % sheet.cols;
        const row = Math.floor(frame / sheet.cols);
        sprite.style.backgroundPosition = `-${col * sheet.frameWidth}px -${row * sheet.frameHeight}px`;
      }
      if (elapsed < playMs) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    const done = window.setTimeout(() => onDoneRef.current(), playMs + holdMs);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, []);

  const sheet = getFxSheet("new-day");

  return (
    <div className="newDayOverlay" role="status" aria-label="A new day dawns">
      <div className="newDayStage">
        {sheet ? (
          <div
            className="newDaySprite"
            ref={spriteRef}
            style={{
              width: `${sheet.frameWidth}px`,
              height: `${sheet.frameHeight}px`,
              backgroundImage: `url(${assetUrl(sheet.src)})`
            }}
          />
        ) : null}
        <div className="newDayCaption">
          <Sunrise aria-hidden="true" size={18} />
          <strong>A new day dawns</strong>
          <span>
            {cue.playerName}&apos;s turn · round {cue.round}
          </span>
        </div>
      </div>
    </div>
  );
}

export type AstrologersProclamationCue = {
  /** Unique per round so the overlay re-mounts when a new round resurfaces it. */
  id: string;
  cardId: string;
  name: string;
  text: string;
  image: string;
  expansion: string;
  /** Lasts until the next Astrologers round (vs. resolved immediately). */
  ongoing: boolean;
  round: number;
};

/**
 * The active Astrologers Proclaim card, popped into the player's face at the
 * start of each round so nobody misses the rule in effect. Driven off the
 * shared TURN_STARTED event but de-duplicated to once per round per client, so
 * it surfaces the same card every round it stays face up without nagging on
 * every single action. Dismissed by click / Enter / Escape (it never
 * auto-closes — the player reads it and acknowledges).
 */
export function AstrologersProclamationOverlay({
  cue,
  onDone
}: {
  cue: AstrologersProclamationCue;
  onDone: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    playLibrarySound("adventure/new-day", 0.35);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        onDoneRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className="astrologersProclaimBackdrop"
      role="dialog"
      aria-label={`Astrologers proclaim: ${cue.name}`}
      onClick={onDone}
    >
      <div className="astrologersProclaimCard" onClick={(event) => event.stopPropagation()}>
        <header className="astrologersProclaimHead">
          <span aria-hidden="true">🔭</span>
          <strong>The Astrologers proclaim…</strong>
          <span className="astrologersProclaimRound">round {cue.round}</span>
        </header>
        {cue.image && !imageFailed ? (
          <img
            alt={cue.name}
            className="astrologersProclaimArt"
            loading="eager"
            referrerPolicy="no-referrer"
            src={assetUrl(cue.image)}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="astrologersProclaimArt cardFaceFallback">{cue.name}</div>
        )}
        <div className="astrologersProclaimBody">
          <strong>{cue.name}</strong>
          <span className="astrologersProclaimMeta">
            {cue.expansion} · {cue.ongoing ? "active until the next Astrologers round" : "resolved now"}
          </span>
          <p>{cue.text}</p>
          <button className="commandButton primary" onClick={onDone} type="button">
            Understood
          </button>
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

  // Where a withdrawing hero ends up: a player-vs-player loser falls back to a
  // friendly base (moveDefeatedHeroHome); a neutral retreat returns to the last
  // visited field.
  const fallBackTo = combat.context.kind === "player" ? "a friendly Town or Settlement" : "the last visited field";

  const title =
    outcome.reason === "surrender"
      ? viewerLost
        ? "You surrender"
        : `${defeatedName} surrenders`
      : outcome.reason === "retreat"
        ? viewerLost
          ? "You retreat"
          : `${defeatedName} retreats`
        : viewerWon
          ? "Victory!"
          : viewerLost
            ? "Defeat"
            : `${winnerName} wins`;
  const detail =
    outcome.reason === "surrender"
      ? // House rule: a paid escape that keeps the army and is NOT a win for the
        // opponent (no experience, no Necromancy, no victory credit).
        `${defeatedName} pays ${SURRENDER_GOLD_COST} gold and withdraws to ${fallBackTo} with their whole army — it does not count as a win for ${winnerName}.`
      : outcome.reason === "retreat"
        ? `${defeatedName} falls back to ${fallBackTo}. The combat is over.`
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

/** A1-style label for a battlefield square (4 columns, 5 rows). */
function squareLabel(position: number): string {
  return `${String.fromCharCode(65 + (position % 4))}${Math.floor(position / 4) + 1}`;
}

/**
 * A guard step with nothing to react to resumes itself after this long — i.e.
 * the breather before the next neutral move. The previous step's dice and
 * strike animation are gated out before this preview mounts (see page.tsx), so
 * this is the clean 2s pause that follows the action, not an overlap with it.
 */
const NEUTRAL_AUTO_RESUME_MS = 2000;

/**
 * Combat pacing / reaction pop-up (`pendingNeutralStep`). The backdrop lets
 * clicks through (it is `pointer-events: none`), so while it floats at the top
 * the reacting player can still cast spells / play instants from their hand and
 * the board below.
 *
 * Neutral fights pause before EVERY guard step so the table sees each guard
 * about to act; the reacting player may cast an Intelligence-enabled Spell
 * (Magic Arrow, Fireball…), a trigger-free instant, or play an instant ability
 * first, then "Let the unit act". When there is nothing they can do, the pause
 * resumes itself after a short beat. (Old snapshots may carry a "guard-walk"
 * pause; it is handled the same way.)
 */
export function NeutralStepOverlay({
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
  const step = state.combat?.pendingNeutralStep;
  const continueAction = legalActions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP");
  // Anything other than "Let the unit act" is a real reaction worth pausing
  // for; with nothing else to do the pause auto-resumes so the fight flows.
  const hasReactions = legalActions.some((legal) => legal.action.type !== "CONTINUE_NEUTRAL_STEP");
  const autoResume = Boolean(step && continueAction) && !hasReactions;
  const pauseUnitId = step?.unitId;

  // Keep the latest dispatcher in a ref (updated in an effect, never during
  // render) so the auto-resume timer is keyed to the guard rather than reset by
  // an unrelated re-render of the parent (onAction is a fresh closure each time).
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  });
  useEffect(() => {
    if (!autoResume || !pauseUnitId) {
      return;
    }
    const timer = setTimeout(() => {
      onActionRef.current({ type: "CONTINUE_NEUTRAL_STEP", playerId: viewerPlayerId });
    }, NEUTRAL_AUTO_RESUME_MS);
    return () => clearTimeout(timer);
  }, [autoResume, pauseUnitId, viewerPlayerId]);

  if (!step) {
    return null;
  }

  const reactorId = step.reactingPlayerId ?? state.combat?.attackerPlayerId;
  const reactorName = reactorId ? state.players[reactorId]?.name : undefined;
  const isPre = step.kind !== "guard-walk";
  // The header speaks to whoever is viewing: only the reacting side is invited
  // to "react". The player whose own unit is about to act — and any spectator —
  // gets a neutral "Reaction window" instead of being told it is the enemy's turn.
  const isReactor = viewerPlayerId === reactorId;

  // Pre-activation preview: what the (neutral) unit is about to do.
  let summary: string;
  if (isPre) {
    const intent = step.intent;
    if (intent?.kind === "attack") {
      summary = intent.targetName
        ? `${step.name} is about to attack your ${intent.targetName}.`
        : `${step.name} is about to attack.`;
    } else if (intent?.kind === "move") {
      summary = `${step.name} is about to move.`;
    } else {
      summary = `${step.name} is about to take its turn.`;
    }
  } else {
    summary =
      step.from === undefined || step.to === undefined || step.from === step.to
        ? `${step.name} holds position.`
        : `${step.name} advances ${squareLabel(step.from)} → ${squareLabel(step.to)}.`;
  }

  return (
    <div className="combatResultBackdrop neutralStepBackdrop" role="dialog" aria-label="Enemy turn">
      <div className="combatResultModal neutralStepModal">
        <header>
          <Swords aria-hidden="true" size={18} />
          <strong>{!isPre ? "Enemy turn" : isReactor ? "Enemy turn — react?" : "Reaction window"}</strong>
        </header>
        <p>{summary}</p>
        {hasReactions ? (
          <small>Cast a Spell or play an instant now, or let the unit take its turn.</small>
        ) : (
          <small>Nothing to react with — continuing automatically…</small>
        )}
        <div className="combatResultButtons">
          {continueAction ? (
            <button
              className="commandButton primary"
              onClick={() => onAction({ type: "CONTINUE_NEUTRAL_STEP", playerId: viewerPlayerId })}
              type="button"
            >
              <Check aria-hidden="true" size={15} /> {isPre ? "Let the unit act" : "Continue"}
            </button>
          ) : (
            <small className="neutralStepWaiting">Waiting for {reactorName ?? "the attacker"}…</small>
          )}
        </div>
      </div>
    </div>
  );
}
