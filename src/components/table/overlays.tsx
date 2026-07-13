"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, CircleOff, Crown, Dices, Hourglass, Layers, Plus, Sparkles, Sunrise, Swords, Undo2, Zap } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { useEffect, useMemo, useRef, useState } from "react";
import { RESOURCE_ICONS } from "@/data/assets/homm-assets";
import { cardLibrary } from "@/data/cards/library";
import { getFxSheet } from "@/data/fx";
import { playDiceRoll, playLibrarySound } from "@/lib/sound";
import {
  AFK_AUTO_KICK_MS,
  AFK_IDLE_MS,
  AFK_REASK_MS,
  seatIsAwaitedInOrderedPlay,
  TURN_TIME_LIMIT_MS,
  turnClockPausedFor,
  turnClockRunningSeats,
  effectHasExpertMode,
  getEffectAmount,
  getEffectiveCardEffect,
  getPendingReactionPower,
  getSpellDamageAmount,
  getSpellDiceRollCount,
  RESOURCE_DIE_FACES,
  spellBookPowerAvailable,
  spellBookRuleEnabled,
  spellPowerValueOfCard,
  standingSpellPower,
  SURRENDER_GOLD_COST,
  type CardPlayCost,
  type CardPlayMode,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState,
  type ReactionPlay
} from "@/engine";
import { cardIsEmpoweredFor, cardName, costCardEligible, formatDieFace, formatEvent, unitName } from "./utils";
import { MORALE_CUE_SOUNDS, type MoraleCardCue } from "./morale-card-cue";
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
  /**
   * Parallel to costHandIndexes: "expert" values that Power source at its
   * expertAmount and spends one crown (Power-value costs — Sorrow, Alamar's
   * Resurrection, …). Index-aligned with costHandIndexes.
   */
  costHandModes: CardPlayMode[];
  /**
   * Spell Book (house rule): a Book Spell chosen to help pay a lethal save's
   * Power cost — capped at ONE (the once-per-turn Book Power budget). Held by
   * card id (a Book Spell has no hand index) and added to the play's costCardIds.
   */
  costBookCardId?: string;
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
  // damage their CURRENT Power deals beside the number; die-roll spells (Inferno
  // on a cast, Slayer on an attack) show how many Attack dice the current Power
  // will throw — climbing live as Power is fuelled, just like the damage line.
  const damage =
    power.kind === "spell" && spell && spell.effect.type === "DEAL_DAMAGE"
      ? getSpellDamageAmount(spell, power.totalPower)
      : null;
  // Slayer's live die count rides the attack stack (recomputed whenever Power
  // is added); Inferno reads from the spell card + total Power.
  const slayerDice =
    power.kind === "attack" ? (state.stack.at(-1)?.modifiers.slayerRolls ?? null) : null;
  const diceRolls =
    power.kind === "spell" && spell
      ? getSpellDiceRollCount(spell, power.totalPower)
      : slayerDice;

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
        {diceRolls !== null
          ? ` · ${diceRolls} Attack ${diceRolls === 1 ? "die" : "dice"}`
          : ""}
        {power.fueledPower > 0
          ? ` · ${power.basePower} base + ${power.fueledPower} fuelled`
          : " · no Power added yet"}
      </small>
    </span>
  );
}

/**
 * The MANDATORY card cost a reaction option charges (exact discard count or a
 * Power value), or undefined when it charges none / only an optional "up to"
 * discard. Used to route a Spell Book reaction that must be paid (a silver/gold
 * Resurrection cast from the Book) to a picker instead of a bare one-click tile.
 */
function reactionMandatoryCost(action: ReactionLegal): CardPlayCost | undefined {
  if (action.asPowerBoost) {
    return undefined;
  }
  const card = cardLibrary[action.cardId];
  if (card?.effect.type !== "CHOOSE_ONE" || action.optionIndex === undefined) {
    return undefined;
  }
  const cost = card.effect.options[action.optionIndex]?.cost;
  return cost && (cost.discardCards !== undefined || cost.powerCost !== undefined) ? cost : undefined;
}

/**
 * A Spell Book reaction (house rule) that must be paid — the silver/gold
 * Resurrection cast straight from the Book. The one-click Book tile cannot
 * collect a cost, so this renders the card with a hand-payment picker (Power
 * sources), mirroring the batch tray's own cost logic, and only enables the play
 * once the exact discard / Power value is met.
 */
function SpellBookSaveTile({
  state,
  view,
  viewerPlayerId,
  action,
  cost,
  onAction
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  action: ReactionLegal;
  cost: CardPlayCost;
  onAction: (action: GameAction) => void;
}) {
  const [payIndexes, setPayIndexes] = useState<number[]>([]);
  // Parallel to payIndexes: the chosen Power-value mode of each picked source.
  const [payModes, setPayModes] = useState<CardPlayMode[]>([]);
  // Spell Book (house rule): ONE other Book Spell may help pay this Book play's
  // Power cost (once-per-turn budget). Not the played card itself.
  const [bookPayCardId, setBookPayCardId] = useState<string | undefined>(undefined);
  const hand = view.players[viewerPlayerId]?.hand ?? [];
  const spellBook = view.players[viewerPlayerId]?.spellBook ?? [];
  const playedSchools = cardLibrary[action.cardId]?.spellSchools ?? [];
  const isPowerCost = cost.powerCost !== undefined;
  const standing = cardLibrary[action.cardId]
    ? standingSpellPower(state, viewerPlayerId, cardLibrary[action.cardId])
    : 0;
  const chosenValues = [
    ...payIndexes.map((index, position) =>
      spellPowerValueOfCard(cardLibrary[hand[index]], playedSchools, payModes[position] ?? "basic")
    ),
    ...(bookPayCardId ? [spellPowerValueOfCard(cardLibrary[bookPayCardId], playedSchools)] : [])
  ];
  const powerTotal = standing + chosenValues.reduce((sum, value) => sum + value, 0);

  const player = state.players[viewerPlayerId];
  const crownsAvailable = player
    ? player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound
    : 0;
  const crownsSelected = payModes.filter((mode) => mode === "expert").length;
  const crownsOver = crownsSelected > crownsAvailable;
  const bookPowerUsable = Boolean(
    spellBookRuleEnabled(state) && player && spellBookPowerAvailable(player)
  );

  const satisfied =
    !crownsOver &&
    (isPowerCost
      ? powerTotal >= (cost.powerCost ?? 0) && !chosenValues.some((value) => powerTotal - value >= (cost.powerCost ?? 0))
      : payIndexes.length + (bookPayCardId ? 1 : 0) === (cost.discardCards ?? 0));

  const targetReached = isPowerCost
    ? powerTotal >= (cost.powerCost ?? 0)
    : payIndexes.length + (bookPayCardId ? 1 : 0) >= (cost.discardCards ?? 0);

  const playedCard = cardLibrary[action.cardId];
  const optionLabel =
    playedCard?.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
      ? playedCard.effect.options[action.optionIndex]?.label
      : undefined;

  const togglePay = (index: number) =>
    setPayIndexes((current) => {
      const at = current.indexOf(index);
      if (at !== -1) {
        setPayModes((modes) => modes.filter((_, position) => position !== at));
        return current.filter((value) => value !== index);
      }
      setPayModes((modes) => [...modes, "basic"]);
      return [...current, index];
    });

  const setPayMode = (index: number, mode: CardPlayMode) =>
    setPayModes((modes) => {
      const at = payIndexes.indexOf(index);
      if (at === -1) {
        return modes;
      }
      const next = [...modes];
      next[at] = mode;
      return next;
    });

  return (
    <div className="trayTile scrollTile" key={JSON.stringify(action)}>
      <CardFrame cardId={action.cardId} className="trayCardImage" />
      <div className="trayTileBody">
        <strong>📖 {cardName(action.cardId)} (Spell Book)</strong>
        <div className="trayPayment" aria-label="Choose cards to pay the save cost">
          <small>
            {isPowerCost
              ? `Pay ${cost.powerCost} Power${standing > 0 ? ` · ${standing} standing` : ""} — ${powerTotal}/${cost.powerCost} chosen`
              : `Discard exactly ${cost.discardCards}:`}
          </small>
          <div className="trayPaymentChips">
            {hand.map((payCardId, index) => {
              const at = payIndexes.indexOf(index);
              const picked = at !== -1;
              const payMode = picked ? (payModes[at] ?? "basic") : "basic";
              const wrongKind = cost.costCardFilter !== undefined && !costCardEligible(payCardId, cost.costCardFilter);
              const powerValueBasic = isPowerCost
                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools, "basic")
                : 0;
              const powerValue = isPowerCost
                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools, payMode)
                : 0;
              if (wrongKind || (isPowerCost && powerValueBasic <= 0)) {
                return null;
              }
              const payAddPower =
                cardLibrary[payCardId]?.effect.type === "ADD_SPELL_POWER"
                  ? cardLibrary[payCardId]?.effect
                  : cardLibrary[payCardId]?.effect.type === "CHOOSE_ONE"
                    ? cardLibrary[payCardId]?.effect.options.find((o) => o.effect.type === "ADD_SPELL_POWER")?.effect
                    : undefined;
              const canExpertPay =
                isPowerCost &&
                payAddPower?.type === "ADD_SPELL_POWER" &&
                payAddPower.expertAmount !== undefined &&
                payAddPower.expertAmount > payAddPower.amount;
              const isExpertPay = payMode === "expert";
              return (
                <span className="trayChipGroup" key={`${payCardId}-${index}`}>
                  <button
                    aria-pressed={picked}
                    className={`trayChip ${picked ? "picked" : ""}`}
                    disabled={!picked && targetReached}
                    onClick={() => togglePay(index)}
                    type="button"
                  >
                    {cardName(payCardId)}
                    {isPowerCost ? ` (+${powerValue})` : ""}
                  </button>
                  {picked && canExpertPay && (isExpertPay || crownsAvailable - crownsSelected > 0) ? (
                    <button
                      aria-pressed={isExpertPay}
                      className={`trayExpert ${isExpertPay ? "picked" : ""}`}
                      onClick={() => setPayMode(index, isExpertPay ? "basic" : "expert")}
                      title="Spend a crown to pay this source at its expert Power value"
                      type="button"
                    >
                      <Crown aria-hidden="true" size={13} />
                      <span>{isExpertPay ? `Expert +${payAddPower?.expertAmount}` : "Crown"}</span>
                    </button>
                  ) : null}
                </span>
              );
            })}
            {bookPowerUsable
              ? [...new Set(spellBook)]
                  .filter((id) => id !== action.cardId)
                  .map((bookCardId) => {
                    const wrongKind =
                      cost.costCardFilter !== undefined && !costCardEligible(bookCardId, cost.costCardFilter);
                    const powerValue = isPowerCost
                      ? spellPowerValueOfCard(cardLibrary[bookCardId], playedSchools)
                      : 0;
                    if (wrongKind || (isPowerCost && powerValue <= 0)) {
                      return null;
                    }
                    const picked = bookPayCardId === bookCardId;
                    return (
                      <button
                        aria-pressed={picked}
                        className={`trayChip bookChip ${picked ? "picked" : ""}`}
                        disabled={!picked && targetReached}
                        key={`book-pay-${bookCardId}`}
                        onClick={() => setBookPayCardId(picked ? undefined : bookCardId)}
                        title="Spend a Spell Book Spell for Power (once per turn)"
                        type="button"
                      >
                        📖 {cardName(bookCardId)}
                        {isPowerCost ? ` (+${powerValue})` : ""}
                      </button>
                    );
                  })
              : null}
          </div>
        </div>
        <button
          className="trayInstant"
          disabled={!satisfied}
          onClick={() => {
            const costCardIds = [
              ...payIndexes.map((index) => hand[index]),
              ...(bookPayCardId ? [bookPayCardId] : [])
            ];
            const costCardModes: CardPlayMode[] = [
              ...payModes,
              ...(bookPayCardId ? (["basic"] as CardPlayMode[]) : [])
            ];
            onAction({
              ...action,
              costCardIds,
              ...(costCardModes.some((mode) => mode === "expert") ? { costCardModes } : {})
            });
          }}
          type="button"
        >
          {optionLabel ?? "Play from Spell Book"}
        </button>
      </div>
    </div>
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
        .filter(
          (action): action is ReactionLegal =>
            action.type === "PLAY_REACTION" && !action.fromScroll && !action.fromSpellBook
        ),
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

  // Spell Book instants (house rule): a Book Spell played for its effect or
  // discarded for +1 Power. Like Scrolls they are single-card plays (never
  // batched), so they get their own one-click tiles apart from the hand batch.
  const spellBookReactions = useMemo(
    () =>
      legalActions
        .map((legal) => legal.action)
        .filter((action): action is ReactionLegal => action.type === "PLAY_REACTION" && Boolean(action.fromSpellBook)),
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

  // Crag Hack's Offense VI: while the combat-long aura is up, every held card
  // may be discarded for an instant +1 attack instead of its printed effect.
  // Engine offers CONVERT_CARD_TO_ATTACK (not PLAY_REACTION), so without these
  // tiles the specialty is invisible in the reaction tray even though it is
  // engine-wired and tested.
  const offenseViConverts = legalActions.filter(
    (legal) => legal.action.type === "CONVERT_CARD_TO_ATTACK"
  );

  // Free unit "lethal save" reactions — the Archangels' once-per-combat
  // Resurrection that cancels a killing blow on another friendly unit. It is a
  // standalone legal action (no hand card behind it), so the card-tile path
  // never surfaces it; render it as its own one-click tile, or the player can
  // only ever choose "Let it die".
  const resurrectionActions = legalActions.filter(
    (legal) => legal.action.type === "USE_UNIT_RESURRECTION"
  );

  // First Aid Tent heal as an instant reaction — "usable at any time, like an
  // instant", so the moment one of your units is attacked you may mend a wound
  // BEFORE the hit lands (which can let the unit survive a killing blow). The
  // engine offers it as a USE_ACTIVE_EFFECT in the attack window; without this
  // tile the reaction prompt only showed "Keep normal attack", so the Tent
  // looked like it could not react at all.
  const firstAidReactions = legalActions.filter(
    (legal) => legal.action.type === "USE_ACTIVE_EFFECT"
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
  // An Empowered ability (Dragon Fly Hive / Griffin Conservatory Creature-Bank
  // bonus) plays its Expert side crown-free — the engine's abilityExpertIsCrownFree
  // exempts it from the crown spend and legal-actions offers it at 0 crowns. So it
  // must NOT count against the crown budget here, or the tray would disable Confirm
  // (and show "no crowns left") for a play the engine happily accepts.
  const crownsSelected =
    selections.filter(
      (selection) =>
        selection.mode === "expert" &&
        !cardIsEmpoweredFor(selection.cardId, view.players[viewerPlayerId]?.empoweredAbilities)
    ).length +
    // Each Power source paid at its expert value spends one crown too.
    selections.reduce(
      (sum, selection) => sum + selection.costHandModes.filter((mode) => mode === "expert").length,
      0
    );

  // Spell Book (house rule): the Book's once-per-turn +1 Power may help pay ANY
  // reaction Power cost (lethal save, Magic Mirror silver/gold, Sorrow, …) —
  // including a map Spell like Fly stashed in the Book. Offered while the budget
  // is unspent.
  const bookPowerUsable = Boolean(
    spellBookRuleEnabled(state) && player && spellBookPowerAvailable(player)
  );
  const viewerSpellBook = view.players[viewerPlayerId]?.spellBook ?? [];

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
        costHandIndexes: [],
        costHandModes: []
      };

      // A window-ending play (Magic Mirror's paid redirect) is always solo:
      // picking it clears any batch, and a later batchable pick clears it.
      if (incoming.nonBatchable) {
        return [incoming];
      }

      const next = current
        .filter((selection) => selection.handIndex !== handIndex && !selection.nonBatchable)
        // A card leaving/entering play also leaves any payment role (drop its
        // mode at the same position so the two arrays stay index-aligned).
        .map((selection) => {
          const kept = selection.costHandIndexes
            .map((index, position) => ({ index, mode: selection.costHandModes[position] ?? "basic" }))
            .filter((entry) => entry.index !== handIndex);
          return {
            ...selection,
            costHandIndexes: kept.map((entry) => entry.index),
            costHandModes: kept.map((entry) => entry.mode)
          };
        });
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
        const at = selection.costHandIndexes.indexOf(payHandIndex);
        const has = at !== -1;
        return {
          ...selection,
          costHandIndexes: has
            ? selection.costHandIndexes.filter((index) => index !== payHandIndex)
            : [...selection.costHandIndexes, payHandIndex],
          costHandModes: has
            ? selection.costHandModes.filter((_, position) => position !== at)
            : [...selection.costHandModes, "basic"]
        };
      })
    );
  };

  // Toggle a chosen Power source between its basic and expert (crown) value when
  // paying a Power-value cost. Only power sources with an expert side ever show
  // the toggle, so a card without one is left at basic.
  const setCostCardMode = (selectionHandIndex: number, payHandIndex: number, mode: CardPlayMode) => {
    setSelections((current) =>
      current.map((selection) => {
        if (selection.handIndex !== selectionHandIndex) {
          return selection;
        }
        const at = selection.costHandIndexes.indexOf(payHandIndex);
        if (at === -1) {
          return selection;
        }
        const nextModes = [...selection.costHandModes];
        nextModes[at] = mode;
        return { ...selection, costHandModes: nextModes };
      })
    );
  };

  // Spell Book (house rule): pick / clear the ONE Book Spell that may help pay a
  // reaction Power cost. Picking a different Book Spell replaces the prior one.
  const toggleBookPayment = (selectionHandIndex: number, bookCardId: string) => {
    setSelections((current) =>
      current.map((selection) =>
        selection.handIndex === selectionHandIndex
          ? { ...selection, costBookCardId: selection.costBookCardId === bookCardId ? undefined : bookCardId }
          : selection
      )
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
      (sum, index, position) =>
        sum + spellPowerValueOfCard(cardLibrary[hand[index]], schools, selection.costHandModes[position] ?? "basic"),
      0
    );
    const fromBook = selection.costBookCardId
      ? spellPowerValueOfCard(cardLibrary[selection.costBookCardId], schools)
      : 0;
    return { standing, total: standing + fromCards + fromBook };
  };

  // Cards committed to paying a selection's cost: its hand chips plus the one
  // optional Book Spell. Count-mode costs (Resurrection Spell) and Power-value
  // costs (the specialty) both spend the Book Spell as one card / one Power.
  const paymentCardCount = (selection: TraySelection) =>
    selection.costHandIndexes.length + (selection.costBookCardId ? 1 : 0);

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
      const chosenValues = [
        ...selection.costHandIndexes.map((index, position) =>
          spellPowerValueOfCard(cardLibrary[hand[index]], schools, selection.costHandModes[position] ?? "basic")
        ),
        ...(selection.costBookCardId ? [spellPowerValueOfCard(cardLibrary[selection.costBookCardId], schools)] : [])
      ];
      return chosenValues.some((value) => total - value >= cost.powerCost!);
    }
    return cost.exact !== undefined && paymentCardCount(selection) !== cost.exact;
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
  // …but once a power-scaling spell THIS player already played is on the pending
  // attack, they keep priority and may keep adding Power to it on its own —
  // mirrors the engine's hasEmpowerablePlayed. This is NOT attacker-only: the
  // DEFENDER's power-scaling instant (Weakness/Curse, played on the enemy's
  // attack — including a one-click Spell Book play that never joins the tray's
  // `selections`) is just as empowerable. Keying it off `attackOwner ===
  // viewerPlayerId` wrongly blocked the defender from fuelling their own Weakness
  // with a lone "+1 Power" (e.g. a hand Magic Arrow) after playing it from the
  // Book. Match the engine: recognise ANY power-scaling instant recorded under
  // the viewer's own id, plus the attacker-only Slayer / ignore-defense casters.
  const attackStackItem = isAttackWindow ? state.stack.at(-1) : undefined;
  const attackOwner =
    attackStackItem?.action.type === "ATTACK_UNIT" || attackStackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
      ? attackStackItem.action.playerId
      : undefined;
  const attackAlreadyEmpowerable =
    (attackStackItem?.modifiers.powerScaledAttackInstants ?? []).some((record) => record.playerId === viewerPlayerId) ||
    (attackOwner === viewerPlayerId && attackStackItem?.modifiers.slayerRollsByPower !== undefined) ||
    attackStackItem?.modifiers.ignoreDefenseCasterId === viewerPlayerId;
  const powerNeedsSpell =
    isAttackWindow && selections.some(isPowerSelection) && !hasSpellPlay && !attackAlreadyEmpowerable;

  const confirmSelection = () => {
    if (selections.length === 0 || paymentInvalid || powerNeedsSpell) {
      return;
    }

    const toPlay = (selection: TraySelection): ReactionPlay => {
      const costCardIds = [
        ...selection.costHandIndexes.map((index) => hand[index]),
        ...(selection.costBookCardId ? [selection.costBookCardId] : [])
      ];
      // Index-aligned modes: hand sources by their chosen mode, then the Book
      // Spell (always basic — a Spell has no expert Power side).
      const costCardModes: CardPlayMode[] = [
        ...selection.costHandIndexes.map((_, position) => selection.costHandModes[position] ?? "basic"),
        ...(selection.costBookCardId ? (["basic"] as CardPlayMode[]) : [])
      ];
      return {
        cardId: selection.cardId,
        mode: selection.mode,
        ...(selection.optionIndex !== undefined ? { optionIndex: selection.optionIndex } : {}),
        ...(selection.asPowerBoost ? { asPowerBoost: true } : {}),
        ...(costCardIds.length > 0 ? { costCardIds } : {}),
        ...(costCardModes.some((mode) => mode === "expert") ? { costCardModes } : {})
      };
    };

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
        {tiles.length === 0 &&
        buildingBoosts.length === 0 &&
        offenseViConverts.length === 0 &&
        scrollReactions.length === 0 &&
        spellBookReactions.length === 0 &&
        resurrectionActions.length === 0 &&
        firstAidReactions.length === 0 ? (
          <div className="trayEmpty">No playable instants — pass to continue.</div>
        ) : null}
        {firstAidReactions.map((legal) => (
          <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
            <div className="trayTileBody">
              <strong>
                <Plus aria-hidden="true" size={15} /> First Aid
              </strong>
              <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                {legal.label}
              </button>
            </div>
          </div>
        ))}
        {resurrectionActions.map((legal) => (
          <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
            <div className="trayTileBody">
              <strong>
                <Sunrise aria-hidden="true" size={15} /> Free save
              </strong>
              <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                {legal.label}
              </button>
            </div>
          </div>
        ))}
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
        {offenseViConverts.map((legal) => {
          const cardId =
            legal.action.type === "CONVERT_CARD_TO_ATTACK" ? legal.action.cardId : "";
          return (
            <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
              {cardId ? <CardFrame cardId={cardId} className="trayCardImage" /> : null}
              <div className="trayTileBody">
                <strong>Offense VI</strong>
                <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                  {legal.label}
                </button>
              </div>
            </div>
          );
        })}
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
        {spellBookReactions.map((action) => {
          // A Book reaction that MUST be paid (a silver/gold Resurrection cast
          // from the Book) needs a cost picker; everything else is one-click.
          const cost = reactionMandatoryCost(action);
          if (cost) {
            return (
              <SpellBookSaveTile
                action={action}
                cost={cost}
                key={JSON.stringify(action)}
                onAction={onAction}
                state={state}
                view={view}
                viewerPlayerId={viewerPlayerId}
              />
            );
          }
          return (
            <div className="trayTile scrollTile" key={JSON.stringify(action)}>
              <CardFrame cardId={action.cardId} className="trayCardImage" />
              <div className="trayTileBody">
                <strong>📖 {cardName(action.cardId)} (Spell Book)</strong>
                <button className="trayInstant" onClick={() => onAction(action)} type="button">
                  {action.asPowerBoost ? "Discard for +1 Power" : "Play from Spell Book"}
                </button>
              </div>
            </div>
          );
        })}
        {tiles.map((tile) => {
          const selection = selections.find((candidate) => candidate.handIndex === tile.handIndex);
          const empowered = cardIsEmpoweredFor(
            tile.cardId,
            view.players[viewerPlayerId]?.empoweredAbilities
          );
          return (
            <div className={`trayTile ${selection ? "selected" : ""}`} key={`${tile.cardId}-${tile.handIndex}`}>
              <CardFrame cardId={tile.cardId} className="trayCardImage" empowered={empowered} />
              <ZoomButton label={`Read ${cardName(tile.cardId)}`} onZoom={() => zoomCard(tile.cardId)} />
              <div className="trayTileBody">
                <strong>
                  {cardName(tile.cardId)}
                  {empowered ? (
                    <span className="empoweredBadge">
                      <Sparkles aria-hidden="true" size={9} /> Empowered
                    </span>
                  ) : null}
                </strong>
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
                              const payPosition = selection?.costHandIndexes.indexOf(payIndex) ?? -1;
                              const inThisPayment = payPosition !== -1;
                              const payMode = inThisPayment
                                ? (selection?.costHandModes[payPosition] ?? "basic")
                                : "basic";
                              const takenElsewhere = !inThisPayment && committedIndexes.has(payIndex);
                              const wrongKind =
                                selection?.costCards?.filter !== undefined &&
                                !costCardEligible(payCardId, selection.costCards.filter);
                              // A power source of the wrong school contributes
                              // nothing to this spell, so it can never validly pay.
                              // Value it at the chosen mode (expert = crown).
                              const powerValue = isPowerCost
                                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools, payMode)
                                : 0;
                              const powerValueBasic = isPowerCost
                                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools, "basic")
                                : 0;
                              if (takenElsewhere || wrongKind || (isPowerCost && powerValueBasic <= 0)) {
                                return null;
                              }
                              // A Power source with a higher expert value can be
                              // upgraded with a crown once it is picked.
                              const payCardEffect = cardLibrary[payCardId]?.effect;
                              const payAddPower =
                                payCardEffect?.type === "ADD_SPELL_POWER"
                                  ? payCardEffect
                                  : payCardEffect?.type === "CHOOSE_ONE"
                                    ? payCardEffect.options.find((o) => o.effect.type === "ADD_SPELL_POWER")?.effect
                                    : undefined;
                              const canExpertPay =
                                isPowerCost &&
                                payAddPower?.type === "ADD_SPELL_POWER" &&
                                payAddPower.expertAmount !== undefined &&
                                payAddPower.expertAmount > payAddPower.amount;
                              // Count mode fills at the card target; Power mode
                              // stops once the threshold is met (no over-paying).
                              const full =
                                !inThisPayment &&
                                (isPowerCost
                                  ? (powerPaid?.total ?? 0) >= (powerCostValue ?? 0)
                                  : (selection ? paymentCardCount(selection) : 0) >= paymentTarget);
                              const isExpertPay = payMode === "expert";
                              return (
                                <span className="trayChipGroup" key={`${payCardId}-${payIndex}`}>
                                  <button
                                    aria-pressed={inThisPayment}
                                    className={`trayChip ${inThisPayment ? "picked" : ""}`}
                                    disabled={full}
                                    onClick={() => togglePayment(tile.handIndex, payIndex)}
                                    type="button"
                                  >
                                    {cardName(payCardId)}
                                    {isPowerCost ? ` (+${powerValue})` : ""}
                                  </button>
                                  {inThisPayment && canExpertPay && (isExpertPay || crownsAvailable - crownsSelected > 0) ? (
                                    <button
                                      aria-pressed={isExpertPay}
                                      className={`trayExpert ${isExpertPay ? "picked" : ""}`}
                                      onClick={() =>
                                        setCostCardMode(tile.handIndex, payIndex, isExpertPay ? "basic" : "expert")
                                      }
                                      title="Spend a crown to pay this source at its expert Power value"
                                      type="button"
                                    >
                                      <Crown aria-hidden="true" size={13} />
                                      <span>{isExpertPay ? `Expert +${payAddPower?.expertAmount}` : "Crown"}</span>
                                    </button>
                                  ) : null}
                                </span>
                              );
                            })}
                            {/* Spell Book (house rule): one stashed Book Spell may help
                                pay any reaction Power cost — the once-per-turn Book
                                Power budget (Fly, Haste, … all count as +1). */}
                            {bookPowerUsable &&
                              [...new Set(viewerSpellBook)].map((bookCardId) => {
                                if (bookCardId === tile.cardId) {
                                  return null;
                                }
                                const picked = selection?.costBookCardId === bookCardId;
                                const wrongKind =
                                  selection?.costCards?.filter !== undefined &&
                                  !costCardEligible(bookCardId, selection.costCards.filter);
                                const powerValue = isPowerCost
                                  ? spellPowerValueOfCard(cardLibrary[bookCardId], playedSchools)
                                  : 0;
                                if (wrongKind || (isPowerCost && powerValue <= 0)) {
                                  return null;
                                }
                                const full =
                                  !picked &&
                                  (isPowerCost
                                    ? (powerPaid?.total ?? 0) >= (powerCostValue ?? 0)
                                    : (selection ? paymentCardCount(selection) : 0) >= paymentTarget);
                                return (
                                  <button
                                    aria-pressed={picked}
                                    className={`trayChip bookChip ${picked ? "picked" : ""}`}
                                    disabled={full}
                                    key={`book-${bookCardId}`}
                                    onClick={() => toggleBookPayment(tile.handIndex, bookCardId)}
                                    title="Spend a Spell Book Spell for Power (once per turn)"
                                    type="button"
                                  >
                                    📖 {cardName(bookCardId)}
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
   * attacker-vs-defender combat breakdown. Ability rolls (Death Stare, the
   * Thunderbird extra die, the morale skip-activation check…) reuse this mode
   * with `tone` colouring the outcome caption.
   */
  spellMode?: boolean;
  /** Spell-mode heading (the spell's name). */
  title?: string;
  /** Spell-mode read-out under the dice (e.g. "3 hits → 3 damage each"). */
  caption?: string;
  /**
   * Colours the spell-mode caption: "good" (the roll landed) glows gold,
   * "bad" (no effect / a curse struck) reads muted red. Without it the
   * caption falls back to the Inferno hits>0 colouring.
   */
  tone?: "good" | "bad";
  /**
   * Defending unit's per-attack Defend die (a "+1" pays +1 Defense) — shown
   * as a shield chip under the breakdown when the defender was defending.
   */
  defendRoll?: number;
  /**
   * WOG commander Might dice: extra attack dice rolled alongside the main die
   * (each "+1" raises the attack; at most one "−1" counts). Rendered as their
   * own cubes after the main dice, never dimmed.
   */
  mightRolls?: number[];
  /**
   * Morale/artifact/spell adjustments that visibly changed this roll (e.g.
   * "Negative Morale — one die is set to the "-1" side"). Listed as chips
   * under the breakdown so the player sees WHY the dice differ.
   */
  modifiers?: { source: string; text: string }[];
  /**
   * How long the settled dice hold before the overlay dismisses itself.
   * Defaults to DICE_READ_MS; ability rolls use the shorter
   * ABILITY_DICE_READ_MS so a Death Stare after every attack stays snappy.
   */
  readMs?: number;
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
/**
 * The shorter read for an ability's own roll (Death Stare, the Thunderbird
 * extra die…): it follows an attack that already had its full dice beat, so
 * the outcome reads out quickly instead of holding the table a second time.
 */
export const ABILITY_DICE_READ_MS = 1500;

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
  const readMs = cue.readMs ?? DICE_READ_MS;
  const diceCount = cue.rolls.length + (cue.mightRolls?.length ?? 0);
  // "waiting": board visible while a guard finishes sliding into range.
  const [phase, setPhase] = useState<"waiting" | "rolling" | "settled">(preDelay > 0 ? "waiting" : "rolling");

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const beginRoll = () => {
      setPhase("rolling");
      playDiceRoll(diceCount, DICE_ROLL_MS - 120);
    };
    if (preDelay > 0) {
      timers.push(setTimeout(beginRoll, preDelay));
    } else {
      beginRoll();
    }
    timers.push(setTimeout(() => setPhase("settled"), preDelay + DICE_ROLL_MS));
    timers.push(setTimeout(onDone, preDelay + DICE_ROLL_MS + readMs));

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [onDone, preDelay, readMs, diceCount]);

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
          {cue.mightRolls?.length ? (
            <>
              <span className="mightDiceTag" title="Commander Might: extra attack dice rolled alongside the main die">
                Might
              </span>
              {cue.mightRolls.map((roll, index) => (
                <DieCube dimmed={false} key={`might-${index}`} rolling={rolling} value={roll} />
              ))}
            </>
          ) : null}
        </div>
        <div className={`diceBreakdown ${rolling ? "hidden" : ""}`}>
          {cue.spellMode ? (
            <strong
              className={`damageResult ${cue.tone ? (cue.tone === "good" ? "hit" : "blocked") : cue.roll > 0 ? "hit" : "blocked"}`}
            >
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
        {!rolling && (cue.defendRoll !== undefined || (cue.modifiers?.length ?? 0) > 0) ? (
          <div className="diceModifiers">
            {cue.defendRoll !== undefined ? (
              <span className="diceModChip shield">
                🛡 Defend die {formatDieFace(cue.defendRoll)}
                {cue.defendRoll === 1 ? " → +1 Defense" : ""}
              </span>
            ) : null}
            {cue.modifiers?.map((modifier, index) => (
              <span className="diceModChip" key={index}>
                <strong>{modifier.source}</strong> — {modifier.text}
              </span>
            ))}
          </div>
        ) : null}
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
  const isReroll = choice?.type === "ATTACK_DIE_REROLL";
  // The newest candidate is the die that just landed (the first roll, or the
  // face a reroll replaced it with). We tumble it before offering keep/reroll.
  const latestIndex = isReroll ? choice.candidates.length - 1 : -1;
  const latestCandidate = isReroll ? choice.candidates[latestIndex] : undefined;
  const isViewersChoice = isReroll && choice.playerId === viewerPlayerId;
  // A stable key for "the throw we are currently showing" — the choice id plus
  // the latest candidate index, so the initial roll AND every reroll each get a
  // fresh key (and a new attack's choice never reuses a stale one).
  const rollKey = isReroll ? `${choice.id}:${latestIndex}` : null;
  const latestRollCount = latestCandidate?.rolls.length ?? 0;

  // Roll the die FIRST, then reveal the choice: the cube tumbles for the same
  // beat as the attack-die overlay, so the player watches the throw land before
  // being asked to keep it or roll again — never the result flashing up first.
  // `rolling` is derived (the latest throw has not been marked settled yet), so
  // the effect only ever calls setState from inside the settle timer — never
  // synchronously — and each fresh throw re-arms the tumble on its own.
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const rolling = isViewersChoice && Boolean(latestCandidate) && settledKey !== rollKey;
  useEffect(() => {
    if (!rolling || !rollKey) {
      return;
    }
    playDiceRoll(latestRollCount, DICE_ROLL_MS - 120);
    const settle = setTimeout(() => setSettledKey(rollKey), DICE_ROLL_MS);
    return () => clearTimeout(settle);
  }, [rolling, rollKey, latestRollCount]);

  if (!isReroll || !choice) {
    return null;
  }

  // An ability's own roll (Death Stare, the Thunderbird extra die…) reads out
  // under the ability's name and shows every die; an attack window keeps the
  // attacker → defender line and its single kept face.
  const abilityRoll = choice.abilityRoll;

  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>
          {state.players[choice.playerId]?.name ?? choice.playerId} may reroll the{" "}
          {abilityRoll ? `${abilityRoll.abilityName} dice` : "attack die"} (
          {unitName(state, choice.attackerId)} → {unitName(state, choice.defenderId)})…
        </span>
      </div>
    );
  }

  const keepAction = legalActions.find(
    (legal) => legal.action.type === "CHOOSE_PENDING_ROLL" && legal.action.candidateIndex === latestIndex
  );
  // Both the plain reroll and the Positive Morale set-die (useSetDie) offers.
  const rerollActions = legalActions.filter((legal) => legal.action.type === "REROLL_PENDING_CHOICE");

  return (
    <div className="modalBackdrop" role="dialog" aria-label="Reroll choice">
      <div className="searchModal rerollModal">
        <header>
          <strong>{abilityRoll ? `${abilityRoll.abilityName} — fate is in your hands` : "Fate is in your hands"}</strong>
          <span>
            {abilityRoll
              ? `${unitName(state, choice.attackerId)} rolls for ${abilityRoll.abilityName} against ${unitName(state, choice.defenderId)}`
              : `${unitName(state, choice.attackerId)} attacks ${unitName(state, choice.defenderId)}`}{" "}
            — a reroll replaces the result, the latest roll counts.
          </span>
        </header>
        {rolling && latestCandidate ? (
          // The throw in progress: the freshest die tumbles across the felt; the
          // keep/reroll choice and any rerolled-away faces stay hidden until it
          // settles, mounting the cube fresh (key) so it always animates.
          <div className="rerollRow">
            <div className="rerollDie current rolling" key={`rolling-${latestIndex}`}>
              <div className="rerollDieCube">
                {latestCandidate.rolls.map((roll, index) => (
                  <DieCube
                    dimmed={!rolling && latestCandidate.rolls.length > 1 && roll !== latestCandidate.roll}
                    key={index}
                    rolling={rolling}
                    value={roll}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rerollRow">
            {choice.candidates.map((candidate, index) => {
              const isLatest = index === latestIndex;
              // Ability rolls (Death Stare) count EVERY face; the attack roll
              // keeps one. Show what the outcome actually reads.
              const facesText = abilityRoll
                ? candidate.rolls.map(formatDieFace).join(" · ")
                : formatDieFace(candidate.roll);
              return (
                <div className={`rerollDie ${isLatest ? "current" : "rerolledAway"}`} key={index}>
                  <span className="dieFaceBig">{facesText}</span>
                  <small>{candidate.rolls.map(formatDieFace).join(" / ")}</small>
                  {isLatest ? (
                    keepAction ? (
                      <button className="commandButton primary" onClick={() => onAction(keepAction.action)} type="button">
                        Keep {facesText}
                      </button>
                    ) : null
                  ) : (
                    <small className="rerolledNote">rerolled away</small>
                  )}
                </div>
              );
            })}
            {rerollActions.map((rerollAction) => (
              <button
                className="rerollDie again"
                key={rerollAction.label}
                onClick={() => onAction(rerollAction.action)}
                type="button"
              >
                <Dices aria-hidden="true" size={22} />
                <span>{rerollAction.label.replace(/^Reroll attack die /, "Reroll ")}</span>
              </button>
            ))}
          </div>
        )}
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

/**
 * The Resource die faces rendered on the cube — derived from the engine's
 * RESOURCE_DIE_FACES so the visual always matches the actual die (incl. the
 * house rule that reduced the "2 valuables" face to 1, giving 2/4 materials,
 * 1/1 valuables, 3/6 gold).
 */
const RESOURCE_DIE_LAYOUT: { resource: "buildingMaterials" | "valuables" | "gold"; amount: number }[] =
  RESOURCE_DIE_FACES.map((face) => ({ resource: face.resource, amount: face.amount }));

// The Resource die cube faces use the same real board-game resource art as the
// resource bar (shared RESOURCE_ICONS registry) — the coin stack, stone pile
// and red crystal cluster — instead of the old leather .gif icons.
const RESOURCE_FACE_ICONS: Record<string, string> = {
  gold: RESOURCE_ICONS.gold,
  buildingMaterials: RESOURCE_ICONS.buildingMaterials,
  valuables: RESOURCE_ICONS.valuables
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

/** Locations with dedicated HD art in the visit notice. */
const NOTICE_ART_BY_LOCATION: Record<string, string> = {
  creature_bank: "/assets/ui/notice-creature-bank.webp",
  resource_symbol: "/assets/ui/notice-resource.webp",
  sea_chest: "/assets/ui/notice-treasure-chest.webp",
  treasure_symbol: "/assets/ui/notice-treasure-chest.webp"
};

/**
 * The treasure-chest art fills its 256² canvas edge-to-edge (unlike the
 * creature-bank / resource art, which carry their own internal margin), so it
 * reads noticeably larger in the same notice frame. Inset these locations' art a
 * little (a `.compact` padding on the image only) so it matches the others —
 * the notice frame and text layout are unchanged.
 */
const NOTICE_ART_COMPACT = new Set(["sea_chest", "treasure_symbol"]);

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

  const noticeArt = cue.location ? NOTICE_ART_BY_LOCATION[cue.location] : undefined;

  return (
    <div className="mapNoticeBackdrop" onClick={onDone} role="status" aria-label={cue.title}>
      <div className="mapNotice">
        <span aria-hidden="true" className={`mapNoticeIcon${noticeArt ? " withArt" : ""}`}>
          {noticeArt ? (
            <img
              alt=""
              className={`mapNoticeArt${NOTICE_ART_COMPACT.has(cue.location ?? "") ? " compact" : ""}`}
              src={assetUrl(noticeArt)}
            />
          ) : (
            cue.icon
          )}
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
  /**
   * For the forced-hand proclamations (Big Cleanup, Annoying Lizard), the
   * result already applied to THIS viewer's hand. Shown so the player knows the
   * mandatory discard has happened (and was not the optional start-of-turn
   * draw) — i.e. that it could not be skipped.
   */
  reshuffle?: { discarded: number; drawn: number };
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
          // Art-less proclamation (no upstream scan): render a branded card face
          // rather than a bare name, so it reads as an intentional card.
          <div className="astrologersProclaimArt astrologersProclaimArtFallback">
            <span className="astrologersProclaimFallbackIcon" aria-hidden="true">
              🔭
            </span>
            <strong>{cue.name}</strong>
            <span className="astrologersProclaimFallbackSet">{cue.expansion}</span>
          </div>
        )}
        <div className="astrologersProclaimBody">
          <strong>{cue.name}</strong>
          <span className="astrologersProclaimMeta">
            {cue.expansion} · {cue.ongoing ? "active until the next Astrologers round" : "resolved now"}
          </span>
          <p>{cue.text}</p>
          {cue.reshuffle ? (
            <p className="astrologersProclaimForced">
              ✔ Forced &amp; already applied — your hand ({cue.reshuffle.discarded}) was discarded and{" "}
              {cue.reshuffle.drawn} new card{cue.reshuffle.drawn === 1 ? "" : "s"} drawn. It could not be skipped.
              The “draw new” below is your separate, normal start-of-turn draw.
            </p>
          ) : null}
          <button className="commandButton primary" onClick={onDone} type="button">
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}

export type EventDrawnCue = {
  /** Unique per draw so the overlay re-mounts for each new Event card. */
  id: string;
  cardId: string;
  name: string;
  text: string;
  image: string;
  expansion: string;
  round: number;
  /** Name of the player who drew this Event (resolution starts with them). */
  drawerName: string;
  /** True when THIS viewer is the drawer, so the copy addresses them directly. */
  viewerIsDrawer: boolean;
};

/**
 * The just-drawn Event card (Fortress expansion optional rule), popped into
 * every player's face when it is drawn at the start of a Resource round, so a
 * new Event is never missed. Mirrors the Astrologers proclamation: dismissed by
 * click / Enter / Escape, once per draw per client. States WHO drew it and that
 * it resolves clockwise from the drawer.
 */
export function EventDrawnOverlay({
  cue,
  onDone
}: {
  cue: EventDrawnCue;
  onDone: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    playLibrarySound("adventure/new-week", 0.4);
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
      className="astrologersProclaimBackdrop eventDrawnBackdrop"
      role="dialog"
      aria-label={`Event drawn: ${cue.name}`}
      onClick={onDone}
    >
      <div className="astrologersProclaimCard eventDrawnCard" onClick={(event) => event.stopPropagation()}>
        <header className="astrologersProclaimHead">
          <span aria-hidden="true">📜</span>
          <strong>A new Event is drawn…</strong>
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
          <div className="astrologersProclaimArt astrologersProclaimArtFallback">
            <span className="astrologersProclaimFallbackIcon" aria-hidden="true">
              📜
            </span>
            <strong>{cue.name}</strong>
            <span className="astrologersProclaimFallbackSet">{cue.expansion}</span>
          </div>
        )}
        <div className="astrologersProclaimBody">
          <strong>{cue.name}</strong>
          <span className="astrologersProclaimMeta">
            {cue.expansion} · {cue.viewerIsDrawer ? "you drew it" : `drawn by ${cue.drawerName}`} · resolves
            clockwise from {cue.viewerIsDrawer ? "you" : cue.drawerName}
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
 * Morale-card moment (map AND combat screens): a drawn / auto-striking /
 * cancelled / absorbed Morale card slams onto the screen with its real card
 * art, the holder's name and one plain-words line saying what just happened,
 * plus the H3 good/bad-morale sting. Positive moments glow gold; negative
 * ones flash red and shake. Click (or wait) to dismiss — the game state is
 * final before the cue shows, so this is pure presentation.
 */
export function MoraleCardOverlay({ cue, onDone }: { cue: MoraleCardCue; onDone: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const negative = cue.soundKey === MORALE_CUE_SOUNDS.bad;

  useEffect(() => {
    playLibrarySound(cue.soundKey, 0.6);
    const doneId = window.setTimeout(onDone, negative ? 4400 : 3600);
    return () => window.clearTimeout(doneId);
  }, [cue, onDone, negative]);

  return (
    <div
      className={`moraleCueBackdrop ${negative ? "negative" : "positive"}`}
      onClick={onDone}
      role="status"
      aria-label={`${cue.headline} — ${cue.playerName}`}
    >
      <div className={`moraleCueCard ${negative ? "negative" : "positive"} ${cue.kind}`}>
        <span aria-hidden="true" className="moraleCueRing" />
        {cue.image && !imageFailed ? (
          <img
            alt={cue.cardName}
            className="moraleCueArt"
            src={assetUrl(cue.image)}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="moraleCueArt moraleCueArtFallback" aria-hidden="true">
            {cue.polarity === "positive" ? "🎺" : "🌩"}
          </div>
        )}
        <div className="moraleCueBody">
          <strong className="moraleCueHeadline">{cue.headline}</strong>
          <span className="moraleCueName">{cue.cardName}</span>
          <span className="moraleCueHolder">{cue.viewerIsHolder ? "You" : cue.playerName}</span>
          <p>{cue.detail}</p>
          <small className="mapNoticeHint">click to continue</small>
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
      : outcome.reason === "surrender-secondary"
        ? viewerLost
          ? "You surrender your Secondary Hero"
          : `${defeatedName} surrenders their Secondary Hero`
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
      : outcome.reason === "surrender-secondary"
        ? // House rule: the 2nd hero is sacrificed (removed) instead of paying
          // gold; the army and gold are kept and it is NOT a win for the opponent.
          `${defeatedName} gives up their Secondary Hero to escape — no gold is paid and the army is kept, but the 2nd hero is lost. It does not count as a win for ${winnerName}.`
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

/**
 * AFK vote-kick + the 10-minute TURN TIMER (multiplayer): one panel that
 * covers the whole flow.
 *
 *  - While a vote is OPEN, every player sees it; live seats other than the
 *    target answer Kick / Wait (one "wait" closes it, unanimous "kick" drops
 *    the target through the engine driver).
 *  - With no vote open, a live viewer gets a "call a vote" button for any
 *    seat idle past AFK_IDLE_MS whose re-ask cooldown (AFK_REASK_MS after a
 *    "wait") has passed — so the table is re-asked every 10 minutes, never
 *    spammed. The timestamps come from the SERVER's clock; the engine
 *    re-checks legality on submit, so a skewed local clock can only make the
 *    button appear a little early or late, never force a kick.
 *  - The TURN TIMER chip counts down the open turn's 10-minute budget
 *    (`afk.turnOpenSince` + TURN_TIME_LIMIT_MS) once under five minutes
 *    remain, and any live client fires FORCE_TURN_TIMEOUT the moment a turn
 *    is over budget — the server re-checks its own clock and then force-ends
 *    that turn (never kicks the player).
 *
 * Rendered on the adventure map AND the combat table — a battle is exactly
 * where an AFK opponent hurts most.
 */
export function AfkVotePanel({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  // Re-evaluate idleness periodically so the button appears without a reload.
  // A short tick keeps the 30-minute auto-kick prompt (which fires an action)
  // responsive without hammering; 5s is plenty for a minute-scale threshold —
  // but tighten to 1s while a turn-timer countdown is on screen, so the
  // MM:SS readout ticks smoothly.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const hasTurnClock = Boolean(
    state.afk?.turnOpenSince && Object.keys(state.afk.turnOpenSince).length > 0
  );
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), hasTurnClock ? 1_000 : 5_000);
    return () => clearInterval(timer);
  }, [hasTurnClock]);
  // Two-step "call a vote" confirm: the first click arms this target, the second
  // (Confirm) actually opens the vote. "Press it, then confirm or cancel."
  const [pendingKickTarget, setPendingKickTarget] = useState<PlayerId | null>(null);
  // One-shot guard so the 30-minute auto-kick fires a single action per target.
  const autoKickFiredRef = useRef<string | null>(null);
  // One-shot guard per (seat, turn-open stamp) for the turn-timer force-end.
  const turnTimeoutFiredRef = useRef<string | null>(null);

  const afk = state.afk;
  const liveSeats = state.turnOrder.filter(
    (id) => id !== "neutral" && !state.players[id]?.eliminated
  );
  const viewerLive = liveSeats.includes(viewerPlayerId);

  // Certain 30-minute auto-kick: once ANY seat has been idle past the hard
  // threshold, a live seat's client fires FORCE_AFK_KICK (the server re-checks
  // the idle time). Fired from an effect so render stays pure; guarded to once
  // per target and skipped while a drop is already in progress. The whole
  // vote/timer system is CLOSED-table only (open games carry no time pressure).
  const afkActive =
    state.mode === "adventure" &&
    !state.setupLobby &&
    state.phase !== "game-over" &&
    Boolean(state.room?.hosted) &&
    liveSeats.length >= 2;
  const autoKickTarget =
    afkActive && viewerLive && afk && !afk.droppingPlayerId
      ? (liveSeats.find(
          (seat) =>
            seat !== viewerPlayerId &&
            afk.lastActionAt?.[seat] !== undefined &&
            nowTick - (afk.lastActionAt?.[seat] ?? nowTick) >= AFK_AUTO_KICK_MS
        ) ?? null)
      : null;
  useEffect(() => {
    if (!autoKickTarget) {
      return;
    }
    if (autoKickFiredRef.current === autoKickTarget) {
      return;
    }
    autoKickFiredRef.current = autoKickTarget;
    onAction({ type: "FORCE_AFK_KICK", playerId: viewerPlayerId, targetPlayerId: autoKickTarget });
  }, [autoKickTarget, onAction, viewerPlayerId]);

  // Turn timer: the open-turn seats whose 10-minute budget is burning right
  // now (server-stamped clocks; paused seats show no countdown). Any live
  // seat's client — including the timed-out player's own — force-ends a turn
  // that is over budget; the server re-checks everything before acting.
  const turnClocks =
    afkActive && afk?.turnOpenSince
      ? turnClockRunningSeats(state)
          .filter((seat) => afk.turnOpenSince?.[seat] !== undefined && !turnClockPausedFor(state, seat))
          .map((seat) => ({
            seat,
            since: afk.turnOpenSince![seat],
            remaining: TURN_TIME_LIMIT_MS - (nowTick - afk.turnOpenSince![seat])
          }))
      : [];
  const expiredTurn =
    viewerLive && afk && !afk.droppingPlayerId && !afk.turnTimeoutPlayerId
      ? (turnClocks.find((clock) => clock.remaining <= 0) ?? null)
      : null;
  // One-shot per (seat, stamp, 30s bucket): the bucket lets a client whose
  // local clock ran slightly FAST retry after the server rejected its early
  // fire — without it one rejection would silence this client for the whole
  // turn. A duplicate fire is harmless (the server refuses an already-armed
  // timeout and the effect stops once the flag appears in the synced state).
  const expiredTurnKey = expiredTurn
    ? `${expiredTurn.seat}:${expiredTurn.since}:${Math.floor(-expiredTurn.remaining / 30_000)}`
    : null;
  useEffect(() => {
    if (!expiredTurn || !expiredTurnKey) {
      return;
    }
    if (turnTimeoutFiredRef.current === expiredTurnKey) {
      return;
    }
    turnTimeoutFiredRef.current = expiredTurnKey;
    onAction({ type: "FORCE_TURN_TIMEOUT", playerId: viewerPlayerId, targetPlayerId: expiredTurn.seat });
  }, [expiredTurn, expiredTurnKey, onAction, viewerPlayerId]);

  if (
    state.mode !== "adventure" ||
    state.setupLobby ||
    state.phase === "game-over" ||
    !state.room?.hosted ||
    liveSeats.length < 2
  ) {
    // Open (non-hosted) tables carry no AFK vote / auto-kick / turn timer UI.
    return null;
  }

  // Countdown chip: shown once an open turn is under five minutes, so the
  // deadline is never a surprise — reads "your turn" for the seat it is about.
  const countdownClock = turnClocks
    .filter((clock) => clock.remaining <= 5 * 60_000)
    .sort((a, b) => a.remaining - b.remaining)[0];
  const turnTimerChip = countdownClock ? (
    <div
      className={`turnTimerChip${countdownClock.remaining <= 60_000 ? " urgent" : ""}`}
      role="status"
      aria-label="Turn timer"
    >
      <Hourglass aria-hidden="true" size={13} />
      <span>
        {countdownClock.seat === viewerPlayerId
          ? "Your turn auto-ends in "
          : `${state.players[countdownClock.seat]?.name ?? countdownClock.seat}'s turn ends in `}
        <strong>{formatCountdown(countdownClock.remaining)}</strong>
      </span>
    </div>
  ) : afk?.turnTimeoutPlayerId ? (
    <div className="turnTimerChip urgent" role="status" aria-label="Turn timer">
      <Hourglass aria-hidden="true" size={13} />
      <span>
        {(state.players[afk.turnTimeoutPlayerId]?.name ?? afk.turnTimeoutPlayerId) +
          "'s 10 minutes are up — ending their turn…"}
      </span>
    </div>
  ) : null;

  const votePanel = renderVotePanel();
  if (!turnTimerChip && !votePanel) {
    return null;
  }
  return (
    <>
      {turnTimerChip}
      {votePanel}
    </>
  );

  function renderVotePanel() {
    const vote = afk?.vote ?? null;
    if (vote) {
    const targetName = state.players[vote.targetPlayerId]?.name ?? vote.targetPlayerId;
    const myVote = vote.votes[viewerPlayerId];
    const canVote = viewerLive && viewerPlayerId !== vote.targetPlayerId && !myVote;
    const kicks = Object.values(vote.votes).filter((entry) => entry === "kick").length;
    const needed = liveSeats.filter((seat) => seat !== vote.targetPlayerId).length;
    return (
      <div className="afkVotePanel" role="dialog" aria-label="AFK vote">
        <Hourglass aria-hidden="true" size={14} />
        <span>
          <strong>{targetName}</strong> seems to be away — kick them from the game? ({kicks}/{needed} votes)
        </span>
        {canVote ? (
          <span className="afkVoteButtons">
            <button
              className="commandButton danger"
              type="button"
              onClick={() => onAction({ type: "CAST_AFK_VOTE", playerId: viewerPlayerId, vote: "kick" })}
            >
              Kick
            </button>
            <button
              className="commandButton"
              type="button"
              onClick={() => onAction({ type: "CAST_AFK_VOTE", playerId: viewerPlayerId, vote: "wait" })}
            >
              Wait
            </button>
          </span>
        ) : (
          <span className="afkVoteWaiting">
            {viewerPlayerId === vote.targetPlayerId ? "act to cancel the vote" : "waiting for the other players…"}
          </span>
        )}
      </div>
    );
  }

  if (!viewerLive || !afk || afk.droppingPlayerId) {
    return null;
  }
  // A seat is callable once idle past the window AND past the re-ask cooldown —
  // and, in ordered play, only while the table is actually waiting on it (its
  // turn / battle / choice). A seat idling through another player's turn is idle
  // by design and is NOT offered as a kick target.
  const callable = liveSeats.filter((seat) => {
    if (seat === viewerPlayerId) {
      return false;
    }
    const lastAction = afk.lastActionAt?.[seat];
    if (lastAction === undefined || nowTick - lastAction < AFK_IDLE_MS) {
      return false;
    }
    if (!seatIsAwaitedInOrderedPlay(state, seat)) {
      return false;
    }
    const lastVote = afk.lastVoteEndedAt?.[seat];
    return lastVote === undefined || nowTick - lastVote >= AFK_REASK_MS;
  });
  if (callable.length === 0) {
    return null;
  }

  // Second step of the confirm: an armed target shows Confirm / Cancel instead
  // of opening the vote on the first click.
  if (pendingKickTarget && callable.includes(pendingKickTarget)) {
    const targetName = state.players[pendingKickTarget]?.name ?? pendingKickTarget;
    return (
      <div className="afkVotePanel" role="dialog" aria-label="Confirm AFK vote">
        <Hourglass aria-hidden="true" size={14} />
        <span>
          Call a vote to kick <strong>{targetName}</strong>?
        </span>
        <span className="afkVoteButtons">
          <button
            className="commandButton danger"
            type="button"
            onClick={() => {
              onAction({ type: "START_AFK_VOTE", playerId: viewerPlayerId, targetPlayerId: pendingKickTarget });
              setPendingKickTarget(null);
            }}
          >
            Confirm vote
          </button>
          <button className="commandButton" type="button" onClick={() => setPendingKickTarget(null)}>
            Cancel
          </button>
        </span>
      </div>
    );
  }

    return (
      <div className="afkVotePanel" role="status" aria-label="AFK player detected">
        <Hourglass aria-hidden="true" size={14} />
        {callable.map((seat) => (
          <button
            className="commandButton danger"
            key={seat}
            type="button"
            onClick={() => setPendingKickTarget(seat)}
          >
            {(state.players[seat]?.name ?? seat) + " is away (10 min+) — call a kick vote"}
          </button>
        ))}
      </div>
    );
  }
}

/** ms → "M:SS" (never negative) for the turn-timer countdown chip. */
function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The "start a NEW adventure" table-consent panel. Pressing "New adventure"
 * while a multiplayer game is in progress opens this vote (state.resetVote)
 * instead of wiping the game immediately: EVERY live seat must confirm before
 * the reset fires (the requester's browser fires it — see page.tsx). Any live
 * seat can Decline to cancel the whole vote. Renders nothing when no vote is
 * open, so it self-gates on every screen exactly like AfkVotePanel.
 *
 * Confirm targeting: a HOSTED room offers the viewer only their OWN seat (seat
 * ownership is enforced server-side); an OPEN table — where one browser holds
 * every seat through the local switcher — offers a Confirm button per still-
 * unconfirmed live seat, matching the open-table "act as any seat" model.
 */
export function ResetVotePanel({
  state,
  viewerPlayerId,
  onAction,
  canForceReset = false,
  onForceReset
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
  /**
   * The viewer is the HOST of a hosted table, so they may START the new
   * adventure now without waiting for every seat to confirm. This is the escape
   * hatch for a stuck vote — a player who left but is not eliminated, a solo
   * host test — so "New adventure" is never a dead end. The host still opens the
   * vote first (everyone sees the warning); this only skips the waiting.
   */
  canForceReset?: boolean;
  /** Fire the host-override reset (resetRoom RPC). Required when canForceReset. */
  onForceReset?: () => void;
}) {
  const vote = state.resetVote ?? null;
  if (!vote) {
    return null;
  }
  const liveSeats = state.turnOrder.filter((id) => id !== "neutral" && !state.players[id]?.eliminated);
  const hosted = Boolean(state.room?.hosted);
  const viewerLive = liveSeats.includes(viewerPlayerId);
  const confirmed = liveSeats.filter((seat) => vote.confirmations[seat]).length;
  const total = liveSeats.length;
  const requesterName = state.players[vote.startedByPlayerId]?.name ?? vote.startedByPlayerId;

  // Seats this viewer may confirm now: their OWN seat in a hosted room; every
  // still-unconfirmed live seat on an open table (the local controller holds
  // them all through the seat switcher).
  const confirmableSeats = (hosted ? (viewerLive ? [viewerPlayerId] : []) : liveSeats).filter(
    (seat) => !vote.confirmations[seat]
  );
  // A live seat this viewer controls, used to Decline (cancel the whole vote).
  const cancelSeat = viewerLive ? viewerPlayerId : hosted ? null : (liveSeats[0] ?? null);

  return (
    <div className="afkVotePanel resetVotePanel" role="dialog" aria-label="New adventure vote">
      <Sparkles aria-hidden="true" size={14} />
      <span>
        <strong>{requesterName}</strong> wants to start a NEW adventure — this wipes the current game. Everyone still in
        the game must confirm. ({confirmed}/{total} confirmed)
      </span>
      <span className="afkVoteButtons">
        {confirmableSeats.map((seat) => (
          <button
            className="commandButton"
            key={seat}
            type="button"
            onClick={() => onAction({ type: "CONFIRM_ROOM_RESET", playerId: seat })}
          >
            {hosted || confirmableSeats.length === 1
              ? "Confirm new adventure"
              : `Confirm as ${state.players[seat]?.name ?? seat}`}
          </button>
        ))}
        {cancelSeat ? (
          <button
            className="commandButton danger"
            type="button"
            onClick={() => onAction({ type: "CANCEL_ROOM_RESET", playerId: cancelSeat })}
          >
            {vote.startedByPlayerId === viewerPlayerId ? "Withdraw" : "Decline"}
          </button>
        ) : null}
        {/* Host override: start the new adventure now without waiting for every
            seat — so a stuck vote is never a dead end. */}
        {canForceReset && onForceReset ? (
          <button
            className="commandButton primary"
            type="button"
            onClick={onForceReset}
            title="Host: start the new adventure now, without waiting for everyone"
          >
            Start now (host)
          </button>
        ) : null}
      </span>
      {viewerLive && confirmableSeats.length === 0 && !canForceReset ? (
        <span className="afkVoteWaiting">you confirmed — waiting for the other players…</span>
      ) : null}
      {canForceReset ? (
        <span className="afkVoteWaiting">as host you can start now, or wait for everyone to confirm.</span>
      ) : null}
    </div>
  );
}
