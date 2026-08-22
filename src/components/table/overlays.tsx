"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, CircleOff, Crosshair, Crown, Dices, Hourglass, Layers, Plus, Sparkles, Sunrise, Swords, Undo2, Zap } from "lucide-react";
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
  artifactSetIconImage,
  cardCanFuelSchoollessPower,
  effectHasExpertMode,
  getEffectAmount,
  getEffectiveCardEffect,
  getPendingReactionPower,
  getSpellDamageAmount,
  getSpellDiceRollCount,
  houseRuleEnabled,
  PRINTED_RESOURCE_DIE_FACES,
  resourceDieFaces,
  spellBookPowerAvailable,
  spellBookRuleEnabled,
  spellCastPowerBounds,
  powerCostPaymentMode,
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
import {
  cardIsEmpoweredFor,
  cardName,
  costCardEligible,
  formatDieFace,
  formatEvent,
  unitName,
  type CardBoardAction,
  type NoticeReward
} from "./utils";
import { MORALE_CUE_SOUNDS, type MoraleCardCue } from "./morale-card-cue";
import { CardBack, CardFrame } from "./seats";
import { AnkhIcon, CrossedShovelsIcon, StarBannerIcon } from "./dice-icons";
import { useCardZoom, ZoomButton } from "./zoom";
import { balanceCardForDisplay } from "@/engine/community-balance-cards";

type ReactionLegal = Extract<GameAction, { type: "PLAY_REACTION" }>;

type TrayGroup = {
  cardId: string;
  optionIndex?: number;
  optionLabel?: string;
  modes: CardPlayMode[];
  batchable: boolean;
  /** "Discard {card}: +1 Power" alternative play of a Spell card. */
  asPowerBoost?: boolean;
  /**
   * Draw-rider-only play: the engine resolves ONLY the "then draw" rider and
   * deliberately fizzles the primary effect. Dropping this flag from the
   * dispatched action would resolve the FULL effect instead — a different play.
   */
  drawOnly?: boolean;
  /** Trigger-free card-gain utility joining an already-open window. */
  utilityOnly?: boolean;
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
  /** See TrayGroup.drawOnly — must ride the dispatched PLAY_REACTION(S). */
  drawOnly?: boolean;
  utilityOnly?: boolean;
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

function selectionPreview(
  selections: TraySelection[],
  balanceEnabled: boolean,
  communityEnabled: boolean
): string[] {
  const totals = new Map<string, number>();

  for (const selection of selections) {
    // Polish Balance Pack reprints a card's WHOLE definition (e.g. Celestial
    // Necklace of Bliss "+1 attack, then +X per discard" vs the classic "+X").
    // The engine reads the reprint, so the running total must resolve it too or
    // the tray would show "+0 Attack" while the engine actually grants +1.
    const card = balanceCardForDisplay(balanceEnabled, communityEnabled, selection.cardId);
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
 * Also surfaces min/max useful tiers (Implosion needs ≥1, tops at 5) so the
 * caster knows when under-fuelled or past the printed ladder.
 */
function PendingPowerReadout({ state }: { state: GameState }) {
  const power = getPendingReactionPower(state);
  if (!power) {
    return null;
  }

  const spell = power.spellCardId ? cardLibrary[power.spellCardId] : undefined;
  const subject = power.kind === "spell" ? cardName(power.spellCardId ?? "") : "This attack";
  const bounds = power.kind === "spell" ? spellCastPowerBounds(spell) : { minUseful: 0, maxUseful: null };
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

  const underMin = bounds.minUseful > 0 && power.totalPower < bounds.minUseful;
  const overMax = bounds.maxUseful !== null && power.totalPower > bounds.maxUseful;
  const meterClass = underMin ? "trayPowerMeter under" : overMax ? "trayPowerMeter over" : "trayPowerMeter";

  return (
    <span
      className={meterClass}
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
        {bounds.minUseful > 0 ? ` · needs ≥${bounds.minUseful}` : ""}
        {bounds.maxUseful !== null ? ` · top tier ${bounds.maxUseful}` : ""}
        {power.fueledPower > 0
          ? ` · ${power.basePower} base + ${power.fueledPower} fuelled`
          : " · no Power added yet"}
        {underMin ? " · too low" : ""}
        {overMax ? " · past top tier" : ""}
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
  // An EMPOWERED ability paid at its expert Power value costs no crown (the
  // engine's payOptionCardCost counts it out of the budget), so it must not be
  // counted here either or the tile would refuse a payment the engine accepts.
  const crownsSelected = payIndexes.filter(
    (handIndex, position) =>
      (payModes[position] ?? "basic") === "expert" &&
      !cardIsEmpoweredFor(hand[handIndex], view.players[viewerPlayerId]?.empoweredAbilities)
  ).length;
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

  // `defaultMode`: the mode this source must be spent at to bring any Power (see
  // powerCostPaymentMode) — a School-of-Magic ability is 0 basic / 3 expert.
  const togglePay = (index: number, defaultMode: CardPlayMode = "basic") =>
    setPayIndexes((current) => {
      const at = current.indexOf(index);
      if (at !== -1) {
        setPayModes((modes) => modes.filter((_, position) => position !== at));
        return current.filter((value) => value !== index);
      }
      setPayModes((modes) => [...modes, defaultMode]);
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
              const wrongKind = cost.costCardFilter !== undefined && !costCardEligible(payCardId, cost.costCardFilter);
              // Same rule as the reaction tray: a source whose BASIC Power is 0
              // (every School-of-Magic ability) still pays at its Expert value,
              // which is exactly what the engine's affordability gate counted
              // when it offered this play. Hiding it made the offer unpayable.
              const payDefaultMode = isPowerCost
                ? powerCostPaymentMode(cardLibrary[payCardId], playedSchools, {
                    crownAvailable:
                      cardIsEmpoweredFor(payCardId, view.players[viewerPlayerId]?.empoweredAbilities) ||
                      crownsAvailable - crownsSelected > 0
                  })
                : "basic";
              if (wrongKind || (isPowerCost && payDefaultMode === null)) {
                return null;
              }
              const payMode = picked ? (payModes[at] ?? "basic") : (payDefaultMode ?? "basic");
              const powerValue = isPowerCost
                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools, payMode)
                : 0;
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
                    onClick={() => togglePay(index, payDefaultMode ?? "basic")}
                    type="button"
                  >
                    {cardName(payCardId)}
                    {isPowerCost ? ` (+${powerValue})` : ""}
                  </button>
                  {picked &&
                  canExpertPay &&
                  // An EMPOWERED source pays its expert value with no crown, so
                  // the toggle stays offered at 0 crowns.
                  (isExpertPay ||
                    cardIsEmpoweredFor(payCardId, view.players[viewerPlayerId]?.empoweredAbilities) ||
                    crownsAvailable - crownsSelected > 0) ? (
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

/** Spell-style Power picker used by Deemer's Meteor Shower and Kud's Rocket Launcher. */
export function MeteorPowerWindow({
  action,
  state,
  view,
  viewerPlayerId,
  onAim,
  onCancel
}: {
  action: Extract<GameAction, { type: "PLAY_CARD" }>;
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  onAim: (
    action: Extract<GameAction, { type: "PLAY_CARD" }>,
    payment: { costCardIds: string[]; costCardModes?: CardPlayMode[] }
  ) => void;
  onCancel: () => void;
}) {
  const { zoomCard } = useCardZoom();
  const hand = view.players[viewerPlayerId]?.hand ?? [];
  const [payIndexes, setPayIndexes] = useState<number[]>([]);
  const [payModes, setPayModes] = useState<CardPlayMode[]>([]);
  const [bookCardId, setBookCardId] = useState<string | undefined>();
  const player = state.players[viewerPlayerId];
  // This is a Specialty, not a Spell: spell-only standing bonuses do not fuel it.
  const standing = 0;
  const crownsAvailable = player
    ? player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound
    : 0;
  const crownsSelected = payIndexes.filter(
    (index, position) =>
      payModes[position] === "expert" &&
      !cardIsEmpoweredFor(hand[index], view.players[viewerPlayerId]?.empoweredAbilities)
  ).length;
  const eligible = hand
    .map((cardId, index) => ({ cardId, index }))
    .filter(({ cardId }) => cardCanFuelSchoollessPower(cardLibrary[cardId]));
  const bookPowerUsable = Boolean(
    spellBookRuleEnabled(state) && player && spellBookPowerAvailable(player)
  );
  const bookSpells = bookPowerUsable
    ? [...new Set(view.players[viewerPlayerId]?.spellBook ?? [])].filter(
        (cardId) => cardLibrary[cardId]?.kind === "spell"
      )
    : [];
  const fromHand = payIndexes.reduce(
    (sum, index, position) =>
      sum + spellPowerValueOfCard(cardLibrary[hand[index]], [], payModes[position] ?? "basic"),
    0
  );
  const power = standing + fromHand + (bookCardId ? 1 : 0);
  const damage = power >= 4 ? 3 : power >= 2 ? 2 : 1;
  const paymentCount = payIndexes.length + (bookCardId ? 1 : 0);
  const canConfirm = paymentCount <= 4 && crownsSelected <= crownsAvailable;

  const toggle = (index: number) => {
    const at = payIndexes.indexOf(index);
    if (at >= 0) {
      setPayIndexes((current) => current.filter((value) => value !== index));
      setPayModes((current) => current.filter((_, position) => position !== at));
      return;
    }
    if (paymentCount >= 4) return;
    setPayIndexes((current) => [...current, index]);
    setPayModes((current) => [...current, "basic"]);
  };

  return (
    <div className="reactionTray meteorPowerTray" role="dialog" aria-label={`${cardName(action.cardId)} Power`}>
      <header>
        <Zap aria-hidden="true" size={15} />
        <strong>{cardName(action.cardId)}</strong>
        <span>Choose Power, then click the target on the battlefield.</span>
      </header>
      <div className="trayTiles">
        {eligible.length === 0 && bookSpells.length === 0 ? (
          <div className="trayEmpty">No extra Power sources. You may aim at Power {standing}.</div>
        ) : null}
        {eligible.map(({ cardId, index }) => {
          const pickedAt = payIndexes.indexOf(index);
          const picked = pickedAt >= 0;
          const mode = picked ? (payModes[pickedAt] ?? "basic") : "basic";
          const basicValue = spellPowerValueOfCard(cardLibrary[cardId], [], "basic");
          const expertValue = spellPowerValueOfCard(cardLibrary[cardId], [], "expert");
          const empowered = cardIsEmpoweredFor(cardId, view.players[viewerPlayerId]?.empoweredAbilities);
          const canExpert = expertValue > basicValue;
          return (
            <div className={`trayTile ${picked ? "selected" : ""}`} key={`${cardId}-${index}`}>
              <CardFrame cardId={cardId} className="trayCardImage" empowered={empowered} />
              <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId, empowered)} />
              <div className="trayTileBody">
                <strong>{cardName(cardId)}</strong>
                <button
                  aria-pressed={picked}
                  className={`trayPick ${picked ? "picked" : ""}`}
                  onClick={() => toggle(index)}
                  type="button"
                >
                  <Check aria-hidden="true" size={13} />
                  <span>+{mode === "expert" ? expertValue : basicValue} Power</span>
                </button>
                {picked && canExpert ? (
                  <button
                    aria-pressed={mode === "expert"}
                    className={`trayExpert ${mode === "expert" ? "picked" : ""}`}
                    disabled={mode !== "expert" && !empowered && crownsSelected >= crownsAvailable}
                    onClick={() => {
                      const next = [...payModes];
                      next[pickedAt] = mode === "expert" ? "basic" : "expert";
                      setPayModes(next);
                    }}
                    type="button"
                  >
                    <Crown aria-hidden="true" size={13} />
                    <span>{mode === "expert" ? `Expert +${expertValue}` : `Use crown (+${expertValue})`}</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {bookSpells.map((cardId) => (
          <div className={`trayTile scrollTile ${bookCardId === cardId ? "selected" : ""}`} key={`meteor-book-${cardId}`}>
            <CardFrame cardId={cardId} className="trayCardImage" />
            <div className="trayTileBody">
              <strong>📖 {cardName(cardId)}</strong>
              <button
                aria-pressed={bookCardId === cardId}
                className={`trayPick ${bookCardId === cardId ? "picked" : ""}`}
                disabled={!bookCardId && paymentCount >= 4}
                onClick={() => setBookCardId((current) => current === cardId ? undefined : cardId)}
                type="button"
              >
                <Check aria-hidden="true" size={13} /> +1 Power
              </button>
            </div>
          </div>
        ))}
      </div>
      <footer>
        <div className="trayPreview">
          <span>Power {power} → {damage} damage</span>
          <span>{paymentCount}/4 sources</span>
          <span className="crownMeter"><Crown aria-hidden="true" size={13} /> {crownsSelected}/{crownsAvailable}</span>
        </div>
        <button
          className="trayConfirm"
          disabled={!canConfirm}
          onClick={() => {
            const costCardIds = [...payIndexes.map((index) => hand[index]), ...(bookCardId ? [bookCardId] : [])];
            const modes = [...payModes, ...(bookCardId ? (["basic"] as CardPlayMode[]) : [])];
            onAim(action, {
              costCardIds,
              ...(modes.some((mode) => mode === "expert") ? { costCardModes: modes } : {})
            });
          }}
          type="button"
        >
          <Crosshair aria-hidden="true" size={15} /> Use Power &amp; choose target
        </button>
        <button className="trayPass" onClick={onCancel} type="button">
          <CircleOff aria-hidden="true" size={15} /> Back
        </button>
      </footer>
    </div>
  );
}

export function ReactionTray({
  state,
  view,
  viewerPlayerId,
  legalActions,
  onAction,
  onSelectCardAction
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  /** Arms one card, then lets the player choose its unit directly on the board. */
  onSelectCardAction?: (action: CardBoardAction) => void;
}) {
  // The parent keys this component by window id + priority player, so the
  // selection naturally resets whenever the timing window changes hands.
  const window = state.reactionWindow;
  // Polish Balance Pack reprints some reaction cards' whole definition (labels,
  // amounts). Resolve those for every displayed label/total or the tray shows
  // the classic text while the engine runs the reprint.
  const balanceEnabled = houseRuleEnabled(state, "polish-card-balance");
  // The Community Balance Change reprints WIN over the Polish ones for a card
  // both packs cover (see `balanceCardForDisplay`).
  const communityEnabled = houseRuleEnabled(state, "community-card-balance");
  const [selections, setSelections] = useState<TraySelection[]>([]);
  /**
   * Cast-window Power gate dialog: when the caster tries to Pass while under
   * the spell's min useful Power, or over the top tier, show a modal so they
   * can go back and re-fuel (or, for overboard only, confirm anyway).
   */
  const [powerPassDialog, setPowerPassDialog] = useState<null | {
    kind: "under" | "over";
    spellName: string;
    totalPower: number;
    minUseful: number;
    maxUseful: number | null;
  }>(null);
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

  // Anime Hero Grades (§3.11): the reaction skills (Battle Focus +Attack on your
  // attack, Iron Will +Defense on the incoming hit) are non-card instants offered
  // by the engine as USE_HERO_SKILL_REACTION; render each as its own one-click
  // tile (they are not PLAY_REACTION cards, so the generic batch never shows them).
  const heroSkillReactions = legalActions.filter(
    (legal) => legal.action.type === "USE_HERO_SKILL_REACTION"
  );

  // Basic X Magic (the in-play spell-fetch permanent): its +3 Power expert is a
  // standalone USE_SCHOOL_FETCH_EXPERT action (using it discards the permanent —
  // user ruling: the expert consumes its source, hand or permanent), so no
  // PLAY_REACTION card tile ever surfaces it. Without this the +3 expert was
  // engine-offered but had no button in the instant window ("cannot play the
  // expert effect").
  const schoolFetchExpertReactions = legalActions.filter(
    (legal) => legal.action.type === "USE_SCHOOL_FETCH_EXPERT"
  );

  // Retaliation pre-roll Morale-token draw. This is a standalone SPEND_MORALE
  // action, not a card play; keep the window open after drawing so a newly drawn
  // defense instant can be selected from the refreshed tray.
  const moraleDrawOffers = legalActions.filter(
    (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "draw"
  );

  // "Instant (any time during Combat)" cards joining this window — Gerwulf's
  // "discard your Ballista: N damage", Deemer's Meteor Shower and kin (the engine
  // side is combatAnytimeInstantWindowJoins). They are PLAY_CARD offers, not
  // PLAY_REACTION, so the batch tray above never surfaces them; without these
  // tiles the reported case ("use the ballista before the counter attack") had an
  // engine offer and no button.
  //
  // ONE tile per offer whose target is a UNIT or absent — directly clickable. A
  // printed discard cost is NOT paid here: the shared submit path opens the cost
  // picker for any PLAY_CARD with a printed cost and no `costCardIds`, and the
  // engine's legality match ignores `costCardIds`, so the enriched play is legal.
  // DELIBERATE LIMIT: space-target joins (Adelaide's / Glacius' Frost Ring ring,
  // Tarnum-Dungeon's row blast) are ~20 offers, one per board cell — the tray does
  // not list twenty look-alike tiles; those keep the board's existing space-target
  // arming as their pick surface.
  const isMeteorTargetPlay = (
    legal: LegalAction
  ): legal is LegalAction & { action: Extract<GameAction, { type: "PLAY_CARD" }> } =>
    legal.action.type === "PLAY_CARD" &&
    legal.action.target?.type === "unit" &&
    Boolean(cardLibrary[legal.action.cardId]?.tags?.includes("meteor-shower"));
  const meteorTargetPlays = legalActions.filter(isMeteorTargetPlay);
  const meteorAimOffers = [...new Map(
    meteorTargetPlays.map((legal) => [
      `${legal.action.cardId}:${legal.action.optionIndex ?? -1}:${legal.action.mode ?? "basic"}`,
      legal
    ])
  ).values()];
  const combatInstantJoins = legalActions.filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.target?.type !== "space" &&
      !isMeteorTargetPlay(legal)
  );

  // Polish Set Artifacts, the pop-up instants ("rolls 2 dice and resolves the
  // higher result" — Angelic Alliance 3, Power of the Dragon Father 2). The
  // engine offers them as USE_ARTIFACT_SET_POWER inside the attack window of the
  // unit about to roll; they are not PLAY_REACTION cards, so the batch tray never
  // surfaces them, and (being window-only) they are deliberately kept OUT of the
  // command dock's Set-powers menu. Without these tiles the 2026-08-11 ruling's
  // pop-up would have an engine offer and no button.
  const artifactSetReactions = legalActions.filter(
    (legal) => legal.action.type === "USE_ARTIFACT_SET_POWER"
  );

  // Halberdiers' Parry (USE_UNIT_DIE_IGNORE): discard a chosen hand card to
  // ignore the just-rolled Attack die. A standalone legal action (one offer per
  // discardable card, worded by the engine), so the card-tile path never
  // surfaces it — without these tiles only the AI could ever Parry.
  // Community Balance Change: the reprinted Pack pays NO discard, so its single
  // offer carries no `discardCardId` — the tile below already renders the card
  // frame conditionally, so it degrades to a bare labelled button.
  const dieCancelReactions = legalActions.filter(
    (legal) => legal.action.type === "USE_UNIT_DIE_IGNORE"
  );

  // WOG Commander instant-reaction casts (USE_COMMANDER_CAST_REACTION) — the
  // defense-buff casts that fire when your unit is attacked: Rampart Hierophant's
  // Shield, Stronghold Ogre Leader's Stone Skin, Little Busters Kyousuke's Mission
  // Start. The engine offers, resolves and AI-uses them, but they are neither
  // PLAY_REACTION cards nor any other listed tray type, so without this tile a
  // human could NEVER cast a commander instant reaction — the tray showed only
  // "No playable instants — pass" ("commander instant like rampart never works").
  const commanderCastReactions = legalActions.filter(
    (legal) => legal.action.type === "USE_COMMANDER_CAST_REACTION"
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

  // A reaction play that opened a nested pick — Scholar's discard recovery —
  // PAUSES the window, and getLegalActions then offers the picker ONLY that
  // choice's options. Rendering the tray here would show "No playable instants
  // — pass to continue." beside a Pass button the engine rejects (a pendingChoice
  // is exclusive), so yield the surface to the choice prompt. The tray returns
  // with the RE-DERIVED offers the moment the pick resolves — including the card
  // just taken from the discard pile.
  if (state.pendingChoice) {
    return null;
  }


  // Group the viewer's legal reactions by card + option (+1-Power discards
  // are their own group), then expose one selectable tile per copy in hand.
  const groupsByCard = new Map<string, TrayGroup[]>();
  for (const action of reactionActions) {
    // A per-unit target (Bowstring) makes otherwise-identical plays distinct, so
    // it joins the group key — each ranged unit gets its own tile button.
    const targetKey = action.target?.type === "unit" ? `#${action.target.unitId}` : "";
    // A draw-rider-only offer is a DIFFERENT play than the real triggered face
    // of the same option — collapsing them into one tile would silently
    // dispatch the wrong one.
    const drawOnlyKey = action.drawOnly ? "#drawOnly" : "";
    const key = `${action.cardId}#${action.optionIndex ?? -1}#${action.asPowerBoost ? "boost" : "play"}${targetKey}${drawOnlyKey}`;
    // Resolve the Balance-Pack reprint so the option LABEL ("+1 attack, discard
    // X cards: +X more attack") matches what the engine runs, not the classic
    // "Discard X cards: +X attack".
    const card = balanceCardForDisplay(balanceEnabled, communityEnabled, action.cardId);
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
      const groupDrawOnlyKey = group.drawOnly ? "#drawOnly" : "";
      return (
        `${group.cardId}#${group.optionIndex ?? -1}#${group.asPowerBoost ? "boost" : "play"}${groupTargetKey}${groupDrawOnlyKey}` ===
        key
      );
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
            : action.drawOnly
              ? `${option?.label ?? card?.name ?? action.cardId} (draw only)`
              : option?.label,
        drawOnly: action.drawOnly,
        utilityOnly: action.utilityOnly,
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
    // Each Power source paid at its expert value spends one crown too — unless
    // that source is itself an EMPOWERED ability (payOptionCardCost counts it
    // out of the crown budget, so counting it here would disable Confirm).
    selections.reduce(
      (sum, selection) =>
        sum +
        selection.costHandIndexes.filter(
          (payIndex, position) =>
            (selection.costHandModes[position] ?? "basic") === "expert" &&
            !cardIsEmpoweredFor(hand[payIndex], view.players[viewerPlayerId]?.empoweredAbilities)
        ).length,
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
        Boolean(existing.asPowerBoost) === Boolean(group.asPowerBoost) &&
        Boolean(existing.drawOnly) === Boolean(group.drawOnly)
      ) {
        return current.filter((selection) => selection.handIndex !== handIndex);
      }

      const incoming: TraySelection = {
        handIndex,
        cardId,
        optionIndex: group.optionIndex,
        mode: "basic",
        asPowerBoost: group.asPowerBoost,
        drawOnly: group.drawOnly,
        utilityOnly: group.utilityOnly,
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
      // Keep declaration order. Sorting by physical hand position makes the
      // visible order lie about what the batch will resolve.
      return next;
    });
  };

  const setSelectionMode = (handIndex: number, mode: CardPlayMode) => {
    setSelections((current) =>
      current.map((selection) => (selection.handIndex === handIndex ? { ...selection, mode } : selection))
    );
  };

  // `defaultMode` is the mode the chip must be spent at to bring ANY Power (see
  // powerCostPaymentMode): a School-of-Magic ability is worth 0 basic / 3 expert,
  // so picking it at "basic" would add nothing and the cost could never be met.
  const togglePayment = (
    selectionHandIndex: number,
    payHandIndex: number,
    defaultMode: CardPlayMode = "basic"
  ) => {
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
            : [...selection.costHandModes, defaultMode]
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
        // `drawOnly` MUST ride the play: dropping it resolves the FULL primary
        // effect instead of the draw rider the button promised (Runes granted
        // mid-window, a target-less heal throw). It is also part of the engine's
        // legality match, so a tile's flag must reach the action verbatim or the
        // play is refused.
        //
        // `utilityOnly` is an offer-side marker only — the reducer never reads
        // it (it drives reactionOfferOpensWindow's window-opening rule, the
        // trap-twin dedupe and this tile's label). The one face that carries it
        // WITHOUT `drawOnly` is Deemer IV's "shuffle your discard into your deck,
        // then draw 1", whose full primary effect IS what its tile promises. It
        // is forwarded anyway so the action stays a faithful copy of the offer.
        ...(selection.drawOnly ? { drawOnly: true as const } : {}),
        ...(selection.utilityOnly ? { utilityOnly: true as const } : {}),
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

  const preview = selectionPreview(selections, balanceEnabled, communityEnabled);
  const crownsOver = crownsSelected > crownsAvailable;

  // Pending CAST_SPELL Power bounds for the viewing caster (Pass gating).
  const pendingCast =
    !isAttackWindow && state.stack.at(-1)?.action.type === "CAST_SPELL"
      ? state.stack.at(-1)!
      : null;
  const pendingCastAction =
    pendingCast?.action.type === "CAST_SPELL" ? pendingCast.action : null;
  const isSpellCaster =
    Boolean(pendingCastAction) && pendingCastAction!.playerId === viewerPlayerId;
  const pendingSpellCard = pendingCastAction ? cardLibrary[pendingCastAction.cardId] : undefined;
  const castPowerBounds = spellCastPowerBounds(pendingSpellCard);
  const livePower = getPendingReactionPower(state);
  const castTotalPower = livePower?.kind === "spell" ? livePower.totalPower : 0;
  const pendingSpellDamage =
    pendingSpellCard?.effect.type === "DEAL_DAMAGE"
      ? getSpellDamageAmount(pendingSpellCard, castTotalPower)
      : null;
  // "Pass" looked like it discarded the cast, and players reasonably read the
  // unchanged health bar as a zero-damage result. For the caster, name the
  // committed outcome explicitly: this button RESOLVES the spell and applies
  // the shown damage after everyone has finished reacting.
  const passLabel = isAttackWindow
    ? "Done — roll the die!"
    : window.triggerEvent.type === "UNIT_LETHAL_HIT"
      ? "Let it die"
      : isSpellCaster
        ? `Resolve ${pendingSpellCard?.name ?? "spell"}${
            pendingSpellDamage !== null ? ` — deal ${pendingSpellDamage} damage` : ""
          }`
        : pendingSpellCard
          ? `Pass — allow ${pendingSpellCard.name}`
          : "Pass";
  const scrollLocked = Boolean(pendingCast?.modifiers.scrollLocked);
  // Scroll casts may still need the floor (Implosion etc.): paid Power is the
  // only fuel, capped at minUseful — so under-min still blocks Pass.
  const underMinPower =
    isSpellCaster &&
    castPowerBounds.minUseful > 0 &&
    castTotalPower < castPowerBounds.minUseful;
  // Scrolls cannot climb past the lowest useful tier; skip the "over max" warn
  // (extra Power is already capped in the engine).
  const overMaxPower =
    isSpellCaster &&
    !scrollLocked &&
    castPowerBounds.maxUseful !== null &&
    castTotalPower > castPowerBounds.maxUseful;
  // Any legal way to raise Power on this cast: discard a Spell for +1, play a
  // Power statistic (ADD_SPELL_POWER), or a Book Power discard.
  const canFuelPower =
    reactionActions.some((action) => {
      if (action.asPowerBoost) {
        return true;
      }
      const effect = getEffectiveCardEffect(cardLibrary[action.cardId], action.optionIndex);
      return effect?.type === "ADD_SPELL_POWER";
    }) || spellBookReactions.some((action) => action.asPowerBoost);
  // Hard-block Pass only when under the floor AND more Power can still be added.
  // If the hand is empty of Power sources, Pass is allowed so the table never soft-locks.
  const passBlockedUnderMin = underMinPower && canFuelPower;

  const tryPassReaction = () => {
    if (passBlockedUnderMin) {
      setPowerPassDialog({
        kind: "under",
        spellName: pendingSpellCard?.name ?? "This spell",
        totalPower: castTotalPower,
        minUseful: castPowerBounds.minUseful,
        maxUseful: castPowerBounds.maxUseful
      });
      return;
    }
    if (overMaxPower) {
      setPowerPassDialog({
        kind: "over",
        spellName: pendingSpellCard?.name ?? "This spell",
        totalPower: castTotalPower,
        minUseful: castPowerBounds.minUseful,
        maxUseful: castPowerBounds.maxUseful
      });
      return;
    }
    onAction({ type: "PASS_REACTION", playerId: viewerPlayerId });
  };

  const confirmPassAnyway = () => {
    setPowerPassDialog(null);
    onAction({ type: "PASS_REACTION", playerId: viewerPlayerId });
  };

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
        heroSkillReactions.length === 0 &&
        schoolFetchExpertReactions.length === 0 &&
        artifactSetReactions.length === 0 &&
        moraleDrawOffers.length === 0 &&
        dieCancelReactions.length === 0 &&
        commanderCastReactions.length === 0 &&
        combatInstantJoins.length === 0 &&
        meteorAimOffers.length === 0 &&
        firstAidReactions.length === 0 ? (
          <div className="trayEmpty">No playable instants — pass to continue.</div>
        ) : null}
        {commanderCastReactions.map((legal) => (
          <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
            <div className="trayTileBody">
              <strong>
                <Sunrise aria-hidden="true" size={15} /> Commander cast
              </strong>
              <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                {legal.label}
              </button>
            </div>
          </div>
        ))}
        {meteorAimOffers.map((legal) => {
          const action = legal.action;
          return (
            <div className="trayTile permanentTile" key={`aim-${action.cardId}-${action.optionIndex ?? -1}`}>
              <CardFrame cardId={action.cardId} className="trayCardImage" />
              <div className="trayTileBody">
                <strong>{cardName(action.cardId)}</strong>
                <button
                  className="trayInstant"
                  onClick={() => onSelectCardAction?.(action)}
                  type="button"
                >
                  Choose Power &amp; target
                </button>
              </div>
            </div>
          );
        })}
        {combatInstantJoins.map((legal) => {
          const cardId = legal.action.type === "PLAY_CARD" ? legal.action.cardId : "";
          // The engine label describes the EFFECT, not the target, so several
          // per-unit offers of one card read identically ("…: 3 damage to an enemy
          // unit" ×3). Name the target on the button so the player can tell the
          // tiles apart.
          const targetUnitId =
            legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit"
              ? legal.action.target.unitId
              : null;
          const targetName = targetUnitId ? state.combat?.units[targetUnitId]?.cardName : null;
          return (
            <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
              {cardId ? <CardFrame cardId={cardId} className="trayCardImage" /> : null}
              <div className="trayTileBody">
                <strong>Instant</strong>
                <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                  {targetName ? `${legal.label} → ${targetName}` : legal.label}
                </button>
              </div>
            </div>
          );
        })}
        {schoolFetchExpertReactions.map((legal) => {
          const cardId =
            legal.action.type === "USE_SCHOOL_FETCH_EXPERT"
              ? (`ability.basic_${legal.action.school}_magic` as const)
              : "";
          return (
            <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
              {cardId ? <CardFrame cardId={cardId} className="trayCardImage" /> : null}
              <div className="trayTileBody">
                <strong>
                  <Plus aria-hidden="true" size={15} /> Basic Magic
                </strong>
                <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                  {legal.label}
                </button>
              </div>
            </div>
          );
        })}
        {artifactSetReactions.map((legal) => {
          const setId = legal.action.type === "USE_ARTIFACT_SET_POWER" ? legal.action.setId : "";
          return (
            <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
              <div className="trayTileBody">
                <strong>
                  {setId ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="setPowerIcon"
                      data-set-id={setId}
                      src={assetUrl(artifactSetIconImage(setId))}
                    />
                  ) : null}{" "}
                  Set power
                </strong>
                <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                  {legal.label}
                </button>
              </div>
            </div>
          );
        })}
        {heroSkillReactions.map((legal) => (
          <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
            <div className="trayTileBody">
              <strong>
                <Plus aria-hidden="true" size={15} /> Hero Grade skill
              </strong>
              <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                {legal.label}
              </button>
            </div>
          </div>
        ))}
        {moraleDrawOffers.map((legal) => (
          <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
            <div className="trayTileBody">
              <strong>Positive Morale</strong>
              <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                {legal.label}
              </button>
            </div>
          </div>
        ))}
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
        {dieCancelReactions.map((legal) => {
          const cardId = legal.action.type === "USE_UNIT_DIE_IGNORE" ? legal.action.discardCardId : "";
          return (
            <div className="trayTile permanentTile" key={JSON.stringify(legal.action)}>
              {cardId ? <CardFrame cardId={cardId} className="trayCardImage" /> : null}
              <div className="trayTileBody">
                <strong>Parry</strong>
                <button className="trayInstant" onClick={() => onAction(legal.action)} type="button">
                  {legal.label}
                </button>
              </div>
            </div>
          );
        })}
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
          const selectedOrder = selection ? selections.indexOf(selection) + 1 : null;
          const empowered = cardIsEmpoweredFor(
            tile.cardId,
            view.players[viewerPlayerId]?.empoweredAbilities
          );
          return (
            <div className={`trayTile ${selection ? "selected" : ""}`} key={`${tile.cardId}-${tile.handIndex}`}>
              <CardFrame cardId={tile.cardId} className="trayCardImage" empowered={empowered} />
              {selectedOrder ? (
                <span className="trayOrderBadge" aria-label={`Play order ${selectedOrder}`}>
                  {selectedOrder}
                </span>
              ) : null}
              <ZoomButton label={`Read ${cardName(tile.cardId)}`} onZoom={() => zoomCard(tile.cardId, empowered)} />
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
                  // Meteor Shower pays an optional NUMBER of Power-source cards,
                  // but its damage reads the VALUE brought. Those cards need the
                  // same crown/expert toggle as numeric Power costs.
                  const valuesPowerSources =
                    isPowerCost ||
                    (selection?.costCards?.upTo !== undefined &&
                      selection.costCards.filter === "power-source");
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
                              const takenElsewhere = !inThisPayment && committedIndexes.has(payIndex);
                              const wrongKind =
                                selection?.costCards?.filter !== undefined &&
                                !costCardEligible(payCardId, selection.costCards.filter);
                              // The mode this chip must be spent at to bring ANY
                              // Power — null when it can never pay (wrong school,
                              // not a power source). A School-of-Magic ability is
                              // 0 basic / 3 expert: `canAffordCardCost` counts that
                              // expert value and OFFERS the play, so the old
                              // `basic <= 0` test hid the only chip that could pay
                              // an offered Sorrow — the play was unconfirmable.
                              // An EMPOWERED source pays its expert value crown-free.
                              const payDefaultMode = valuesPowerSources
                                ? powerCostPaymentMode(cardLibrary[payCardId], playedSchools, {
                                    crownAvailable:
                                      cardIsEmpoweredFor(
                                        payCardId,
                                        view.players[viewerPlayerId]?.empoweredAbilities
                                      ) || crownsAvailable - crownsSelected > 0
                                  })
                                : "basic";
                              if (takenElsewhere || wrongKind || (valuesPowerSources && payDefaultMode === null)) {
                                return null;
                              }
                              const payMode = inThisPayment
                                ? (selection?.costHandModes[payPosition] ?? "basic")
                                : (payDefaultMode ?? "basic");
                              // A power source of the wrong school contributes
                              // nothing to this spell, so it can never validly pay.
                              // Value it at the chosen mode (expert = crown).
                              const powerValue = valuesPowerSources
                                ? spellPowerValueOfCard(cardLibrary[payCardId], playedSchools, payMode)
                                : 0;
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
                                valuesPowerSources &&
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
                                    onClick={() => togglePayment(tile.handIndex, payIndex, payDefaultMode ?? "basic")}
                                    type="button"
                                  >
                                    {cardName(payCardId)}
                                    {valuesPowerSources ? ` (+${powerValue})` : ""}
                                  </button>
                                  {inThisPayment &&
                                  canExpertPay &&
                                  // An EMPOWERED source pays its expert value
                                  // crown-free, so the toggle survives 0 crowns.
                                  (isExpertPay ||
                                    cardIsEmpoweredFor(
                                      payCardId,
                                      view.players[viewerPlayerId]?.empoweredAbilities
                                    ) ||
                                    crownsAvailable - crownsSelected > 0) ? (
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
                                const powerValue = valuesPowerSources
                                  ? spellPowerValueOfCard(cardLibrary[bookCardId], playedSchools)
                                  : 0;
                                if (wrongKind || (valuesPowerSources && powerValue <= 0)) {
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
                                    {valuesPowerSources ? ` (+${powerValue})` : ""}
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
          {passBlockedUnderMin ? (
            <span className="trayWarning" role="alert">
              {pendingSpellCard?.name ?? "This spell"} needs at least Power {castPowerBounds.minUseful}{" "}
              (currently {castTotalPower}). Add Power, then resolve.
            </span>
          ) : null}
          {overMaxPower && !passBlockedUnderMin ? (
            <span className="trayWarning">
              Power {castTotalPower} is past the top tier ({castPowerBounds.maxUseful}). Extra Power will not improve
              this spell.
            </span>
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
          className={`trayPass${passBlockedUnderMin ? " blocked" : ""}${overMaxPower ? " caution" : ""}`}
          onClick={tryPassReaction}
          title={
            passBlockedUnderMin
              ? `Needs Power ≥ ${castPowerBounds.minUseful} before resolving`
              : overMaxPower
                ? `Past top tier (${castPowerBounds.maxUseful}) — confirm to resolve anyway`
                : undefined
          }
          type="button"
        >
          <CircleOff aria-hidden="true" size={15} />
          <span>{passLabel}</span>
        </button>
      </footer>
      {powerPassDialog ? (
        <div className="modalBackdrop trayPowerBackdrop" role="dialog" aria-modal="true" aria-label="Spell Power check">
          <div className="confirmModal">
            {powerPassDialog.kind === "under" ? (
              <>
                <strong>Not enough Power</strong>
                <p>
                  <em>{powerPassDialog.spellName}</em> needs at least{" "}
                  <strong>Power {powerPassDialog.minUseful}</strong> (currently{" "}
                  {powerPassDialog.totalPower}). Add Power cards first, then resolve.
                </p>
                <div className="confirmModalButtons">
                  <button className="commandButton primary" onClick={() => setPowerPassDialog(null)} type="button">
                    Go back — add Power
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong>Power past the top tier</strong>
                <p>
                  <em>{powerPassDialog.spellName}</em> tops out at{" "}
                  <strong>Power {powerPassDialog.maxUseful}</strong>. You have{" "}
                  {powerPassDialog.totalPower} — the extra will not improve this cast.
                </p>
                <div className="confirmModalButtons">
                  <button className="commandButton ghost" onClick={() => setPowerPassDialog(null)} type="button">
                    Go back — adjust Power
                  </button>
                  <button className="commandButton primary" onClick={confirmPassAnyway} type="button">
                    Resolve anyway
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
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
  /** Printed follow-up attacks are called out as a distinct second attack. */
  abilityAttack?: { name: string; baseAttack: number };
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
   * Dice force-rerolled after the throw (Hourglass of the Evil Hour's curse; the
   * Negative-Morale reroll_plus_one card): each "+1" is rerolled once. When set,
   * the overlay settles on the "+1" faces first, then re-tumbles those dice to
   * their kept faces so the reroll is SEEN rather than only stated in a chip.
   */
  rerollBeats?: { index: number; from: number; to: number }[];
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

/**
 * Reroll replay (Hourglass of the Evil Hour / Negative-Morale reroll_plus_one):
 * after the throw settles on the "+1" faces, hold them briefly (FLASH), then
 * re-tumble only the rerolled dice (TUMBLE) before the kept faces read out. The
 * whole replay fits inside DICE_READ_MS so the global dice clock (and the strike
 * FX pinned to it) is untouched.
 */
export const REROLL_FLASH_MS = 520;
export const REROLL_TUMBLE_MS = 700;

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

function DieCube({
  value,
  rolling,
  dimmed,
  rerolled = false
}: {
  value: number;
  rolling: boolean;
  dimmed: boolean;
  /** A forced-reroll die: highlighted so the "+1" → kept-face swap reads. */
  rerolled?: boolean;
}) {
  return (
    <div className={`dieScene ${dimmed ? "dimmed" : ""}${rerolled ? " rerolled" : ""}`}>
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
  // A forced "+1" reroll (Hourglass / Negative Morale) replays inside the read
  // window: the dice settle on the "+1" faces (preReroll), hold, then only the
  // rerolled dice re-tumble (rerolling) to their kept faces. Skipped for spell
  // rolls and when the read window is too short to fit the replay.
  const rerollBeats = useMemo(
    () => (!cue.spellMode ? (cue.rerollBeats ?? []) : []),
    [cue.spellMode, cue.rerollBeats]
  );
  const hasReroll = rerollBeats.length > 0 && readMs >= REROLL_FLASH_MS + REROLL_TUMBLE_MS + 200;
  const rerolledIndexes = useMemo(() => new Set(rerollBeats.map((beat) => beat.index)), [rerollBeats]);
  const fromByIndex = useMemo(() => {
    const map = new Map<number, number>();
    for (const beat of rerollBeats) {
      if (!map.has(beat.index)) {
        map.set(beat.index, beat.from);
      }
    }
    return map;
  }, [rerollBeats]);
  // "waiting": board visible while a guard finishes sliding into range.
  const [phase, setPhase] = useState<"waiting" | "rolling" | "preReroll" | "rerolling" | "settled">(
    preDelay > 0 ? "waiting" : "rolling"
  );

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
    if (hasReroll) {
      // Land on the "+1" faces, hold, re-tumble the rerolled dice, then settle.
      timers.push(setTimeout(() => setPhase("preReroll"), preDelay + DICE_ROLL_MS));
      timers.push(
        setTimeout(() => {
          setPhase("rerolling");
          playDiceRoll(rerolledIndexes.size, REROLL_TUMBLE_MS - 80);
        }, preDelay + DICE_ROLL_MS + REROLL_FLASH_MS)
      );
      timers.push(
        setTimeout(() => setPhase("settled"), preDelay + DICE_ROLL_MS + REROLL_FLASH_MS + REROLL_TUMBLE_MS)
      );
    } else {
      timers.push(setTimeout(() => setPhase("settled"), preDelay + DICE_ROLL_MS));
    }
    timers.push(setTimeout(onDone, preDelay + DICE_ROLL_MS + readMs));

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [onDone, preDelay, readMs, diceCount, hasReroll, rerolledIndexes]);

  // During the pre-attack pause keep the board clear so the guard's move reads.
  if (phase === "waiting") {
    return null;
  }

  // The initial throw is tumbling; the breakdown/chips reveal only once the
  // whole sequence (including any reroll replay) has settled.
  const rolling = phase === "rolling";
  const settled = phase === "settled";

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
              : cue.abilityAttack
                ? `2nd attack — ${cue.abilityAttack.name} (Attack ${cue.abilityAttack.baseAttack})! ${cue.attackerName} → ${cue.defenderName}`
                : `${cue.isRetaliation ? "Retaliation!" : "Attack!"} ${cue.attackerName} → ${cue.defenderName}`}
          </strong>
          {cue.rollMode !== "normal" ? <span className="rollMode">{cue.rollMode}</span> : null}
        </header>
        <div className="diceRow">
          {cue.rolls.map((roll, index) => {
            const isRerolled = hasReroll && rerolledIndexes.has(index);
            // During the "+1" hold the rerolled die shows its pre-reroll face;
            // during the re-tumble only the rerolled dice spin again.
            const tumbling = rolling || (phase === "rerolling" && isRerolled);
            const shownValue = phase === "preReroll" && isRerolled ? (fromByIndex.get(index) ?? roll) : roll;
            return (
              <DieCube
                // Summed rolls (Slayer / Inferno / "apply both") keep every die lit —
                // only an advantage/disadvantage keep-one roll dims the unused face.
                dimmed={settled && !cue.sumAllDice && cue.rolls.length > 1 && roll !== cue.roll}
                key={index}
                rerolled={isRerolled && phase !== "rolling"}
                rolling={tumbling}
                value={shownValue}
              />
            );
          })}
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
        <div className={`diceBreakdown ${settled ? "" : "hidden"}`}>
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
        {settled &&
        (cue.defendRoll !== undefined ||
          (cue.modifiers?.length ?? 0) > 0 ||
          rerollBeats.length > 0) ? (
          <div className="diceModifiers">
            {cue.defendRoll !== undefined ? (
              <span className="diceModChip shield">
                🛡 Defend die {formatDieFace(cue.defendRoll)}
                {cue.defendRoll === 1 ? " → +1 Defense" : ""}
              </span>
            ) : null}
            {rerollBeats.map((beat, index) => (
              <span className="diceModChip reroll" data-testid="dice-reroll-beat" key={`reroll-${index}`}>
                🎲 {formatDieFace(beat.from)} rerolled → {formatDieFace(beat.to)}
              </span>
            ))}
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
  legalActions,
  onAction
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
  /**
   * When provided, extra Search-window offers ride along the keep picks —
   * today the Tournament Book p.54 Morale-token "discard all revealed, Search
   * (X) again" (SPEND_MORALE repeat-search), which has no other surface while
   * this modal covers the table.
   */
  legalActions?: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const { zoomCard } = useCardZoom();
  const pending = view.pendingChoice;
  const searchChoice = pending?.type === "DECK_SEARCH" ? pending : null;
  const cardCount = searchChoice?.revealedCardIds.length ?? 0;
  const searchChoiceId = searchChoice?.id ?? null;
  // Search(3+) packs the row; default to a compact zoom so every card is visible
  // without scrolling. Search(1–2) keeps the large face-up layout. The player can
  // always toggle (zoom out / zoom in) either way. Derived default + a per-choice
  // override (no effect): a NEW search choice automatically resets to its default.
  const [compactOverride, setCompactOverride] = useState<{ id: string | null; value: boolean } | null>(
    null
  );
  const compact =
    compactOverride && compactOverride.id === searchChoiceId ? compactOverride.value : cardCount > 2;

  if (!searchChoice) {
    return null;
  }

  if (searchChoice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>
          {state.players[searchChoice.playerId]?.name ?? searchChoice.playerId} is searching the{" "}
          {searchChoice.deckId} deck…
        </span>
      </div>
    );
  }

  // Tournament Book p.54: spend the positive Morale token to discard all
  // revealed cards and perform the same Search (X) again. Offered by
  // legal-actions only on tournament tables (token mode) — rendered here
  // because this modal is the only thing the searcher can interact with.
  const repeatSearchOffer = legalActions?.find(
    (legal) => legal.action.type === "SPEND_MORALE" && legal.action.benefit === "repeat-search"
  );

  return (
    <div className="modalBackdrop" role="dialog" aria-label={`Search the ${searchChoice.deckId} deck`}>
      <div className={`searchModal${compact ? " searchModal--compact" : ""}`}>
        <header>
          <strong>
            Search {searchChoice.revealedCardIds.length} — {searchChoice.deckId}
          </strong>
          <span>
            {searchChoice.allowRemove
              ? `Keep one card, or Remove one from the game. The rest go to the ${searchChoice.deckId} discard pile.`
              : `Keep one card. The rest go to the ${searchChoice.deckId} discard pile.`}
          </span>
          {searchChoice.revealedCardIds.length > 2 ? (
            <button
              className="searchZoomToggle"
              onClick={() => setCompactOverride({ id: searchChoiceId, value: !compact })}
              type="button"
            >
              {compact ? "Zoom in cards" : "Zoom out cards"}
            </button>
          ) : null}
        </header>
        <div className={`searchCards${compact ? " searchCards--compact" : ""}`}>
          {searchChoice.revealedCardIds.map((cardId, index) => {
            const keepOffer = legalActions?.find(
              (legal) =>
                legal.action.type === "RESOLVE_DECK_SEARCH" &&
                legal.action.choiceId === searchChoice.id &&
                legal.action.pick.index === index &&
                legal.action.pick.remove !== true
            );
            const removeOffer = legalActions?.find(
              (legal) =>
                legal.action.type === "RESOLVE_DECK_SEARCH" &&
                legal.action.choiceId === searchChoice.id &&
                legal.action.pick.index === index &&
                legal.action.pick.remove === true
            );
            return (
              <div className="searchCardWrap" key={`${cardId}-${index}`}>
                <button
                  className="searchCard"
                  onClick={() =>
                    onAction(
                      keepOffer?.action ?? {
                        type: "RESOLVE_DECK_SEARCH",
                        playerId: viewerPlayerId,
                        choiceId: searchChoice.id,
                        pick: { kind: "revealed", index }
                      }
                    )
                  }
                  type="button"
                >
                  <CardFrame cardId={cardId} className="searchCardImage" />
                  <span>Keep {cardName(cardId)}</span>
                </button>
                {searchChoice.allowRemove ? (
                  <button
                    className="searchRemoveCard"
                    disabled={!removeOffer && Boolean(legalActions)}
                    onClick={() =>
                      onAction(
                        removeOffer?.action ?? {
                          type: "RESOLVE_DECK_SEARCH",
                          playerId: viewerPlayerId,
                          choiceId: searchChoice.id,
                          pick: { kind: "revealed", index, remove: true }
                        }
                      )
                    }
                    type="button"
                  >
                    Remove {cardName(cardId)}
                  </button>
                ) : null}
                <ZoomButton label={`Read ${cardName(cardId)}`} onZoom={() => zoomCard(cardId)} />
              </div>
            );
          })}
        </div>
        {repeatSearchOffer ? (
          <footer className="searchRepeatRow">
            <button
              className="searchRepeatButton"
              onClick={() => onAction(repeatSearchOffer.action)}
              type="button"
            >
              {repeatSearchOffer.label}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Up-front Search-or-take-discard (and Basic X Magic school-fetch) choice.
 * Same search-modal vibe as SearchModal: Search shows the deck's card back,
 * take-discard shows the face-up top of that discard pile, the school draw the
 * Basic X Magic card face. Renders BOTH up-front surfaces: the single-deck
 * "deck-search-mode" choice AND the one-step SPELLS deck-pick (`deckPick.upFront`
 * — user demand: "choose discard, search or school of magic" in ONE decision,
 * never "choose search, then the School-of-Magic draw appears after").
 */
export function DeckSearchModeModal({
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
  const { zoomCard } = useCardZoom();
  const choice = state.pendingChoice;
  const isMode = choice?.type === "OPTION_CHOICE" && choice.context === "deck-search-mode" && Boolean(choice.deckSearchMode);
  const isUpFrontPick = choice?.type === "OPTION_CHOICE" && choice.context === "deck-pick" && Boolean(choice.deckPick?.upFront);
  if (choice?.type !== "OPTION_CHOICE" || (!isMode && !isUpFrontPick)) {
    return null;
  }

  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>
          {state.players[choice.playerId]?.name ?? choice.playerId} is choosing how to search…
        </span>
      </div>
    );
  }

  const optionActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "CHOOSE_OPTION" }> } =>
      legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === choice.id
  );
  if (optionActions.length === 0) {
    return null;
  }

  // Which section an option belongs to and what art its tile wears — derived
  // from the option INDEX layout of whichever choice is open. This is
  // PRESENTATION only: the option ORDER and each tile's `optionIndex` (which
  // drive CHOOSE_OPTION resolution) are untouched; we just partition the SAME
  // actions by index into headed rows.
  const visualFor = (
    optionIndex: number
  ): { section: "search" | "discard" | "fetch"; faceCardId?: string; backDeckId: string } => {
    if (choice.context === "deck-pick" && choice.deckPick) {
      const pick = choice.deckPick;
      if (optionIndex < pick.deckIds.length) {
        return { section: "search", backDeckId: pick.deckIds[optionIndex]! };
      }
      const tops = pick.discardTops ?? [];
      const extraIndex = optionIndex - pick.deckIds.length;
      if (extraIndex < tops.length) {
        return { section: "discard", faceCardId: tops[extraIndex]!.cardId, backDeckId: pick.deckIds[0]! };
      }
      const school = (pick.fetchSchools ?? [])[extraIndex - tops.length];
      return {
        section: "fetch",
        ...(school ? { faceCardId: `ability.basic_${school}_magic` } : {}),
        backDeckId: pick.deckIds[0]!
      };
    }
    const mode = choice.deckSearchMode!;
    const discardOptionCount = mode.hasDiscardTop ? 1 : 0;
    if (optionIndex === 0) {
      return { section: "search", backDeckId: mode.deckId };
    }
    if (mode.hasDiscardTop && optionIndex <= discardOptionCount) {
      const deckState = view.decks[mode.deckId];
      const discardTopId =
        deckState && deckState.discardPile.length > 0
          ? deckState.discardPile[deckState.discardPile.length - 1]
          : null;
      return { section: "discard", ...(discardTopId ? { faceCardId: discardTopId } : {}), backDeckId: mode.deckId };
    }
    const school = (mode.schoolFetch ?? [])[optionIndex - 1 - discardOptionCount];
    return {
      section: "fetch",
      ...(school ? { faceCardId: `ability.basic_${school}_magic` } : {}),
      backDeckId: mode.deckId
    };
  };

  const renderOption = (legal: (typeof optionActions)[number]) => {
    const optionIndex = legal.action.optionIndex;
    const visual = visualFor(optionIndex);
    const isDiscard = visual.section === "discard";
    return (
      <div className="searchCardWrap" key={optionIndex}>
        <button
          className={`searchCard${isDiscard ? " discardPick" : ""}`}
          onClick={() => onAction(legal.action)}
          type="button"
        >
          {visual.faceCardId ? (
            <CardFrame cardId={visual.faceCardId} className="searchCardImage" />
          ) : (
            <CardBack className="searchCardImage" deckId={visual.backDeckId} />
          )}
          <span>{legal.label}</span>
        </button>
        {visual.faceCardId ? (
          <ZoomButton label={`Read ${cardName(visual.faceCardId)}`} onZoom={() => zoomCard(visual.faceCardId!)} />
        ) : null}
      </div>
    );
  };

  const bySection = (section: "search" | "discard" | "fetch") =>
    optionActions.filter((legal) => visualFor(legal.action.optionIndex).section === section);
  const sections: { key: string; heading: string; options: typeof optionActions }[] = [
    { key: "search", heading: "Search the deck", options: bySection("search") },
    { key: "discard", heading: "…or take the top discard", options: bySection("discard") },
    { key: "fetch", heading: "…or draw from your School of Magic instead", options: bySection("fetch") }
  ];

  return (
    <div className="modalBackdrop" role="dialog" aria-label={choice.prompt}>
      <div className="searchModal deckSearchModeModal">
        <header>
          <strong>{choice.prompt}</strong>
          <span>Search reveals the top cards and you keep one. Taking the discard skips the search.</span>
        </header>
        <div className="searchCards deckSearchSections">
          {sections.map((section) =>
            section.options.length > 0 ? (
              <section className="deckSearchSection" key={section.key}>
                <span className="deckSearchSectionLabel">{section.heading}</span>
                <div className="deckSearchSectionRow">{section.options.map(renderOption)}</div>
              </section>
            ) : null
          )}
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
  /** Resource dice thrown because the Treasure die landed on a Resource face. */
  origin?: "treasure";
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

type ResourceDieLayout = readonly { resource: "buildingMaterials" | "valuables" | "gold"; amount: number }[];

/**
 * Fallback Resource-die layout for a caller that passes no game state: the
 * PRINTED die (2/4 materials, 1/2 valuables, 3/6 gold). The live table passes
 * `resourceDieFaces(state)` instead, so the cube shows the house-rule die
 * (valuables capped at 1) whenever `resource-die-single-valuables` is on.
 */
const RESOURCE_DIE_LAYOUT: ResourceDieLayout = PRINTED_RESOURCE_DIE_FACES.map((face) => ({
  resource: face.resource,
  amount: face.amount
}));

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
  dimmed,
  resourceLayout = RESOURCE_DIE_LAYOUT
}: {
  kind: MapDiceCue["dice"];
  faceIndex: number;
  rolling: boolean;
  dimmed: boolean;
  resourceLayout?: ResourceDieLayout;
}) {
  const faceContent = (index: number) => {
    if (kind === "resource") {
      const face = resourceLayout[index];
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
function mapDiceFaceIndexes(cue: MapDiceCue, resourceLayout: ResourceDieLayout = RESOURCE_DIE_LAYOUT): number[] {
  if (cue.dice === "resource" && cue.resourceRolls?.length) {
    return cue.resourceRolls.map((roll) =>
      Math.max(
        0,
        resourceLayout.findIndex((face) => face.resource === roll.resource && face.amount === roll.amount)
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
 *
 * `resourceLayout` is the six faces of the Resource die THIS table rolls
 * (`resourceDieFaces(state)`): the printed die, or the house-rule die whose
 * "2 valuables" face is capped at 1. Omitted, the cube falls back to the
 * printed die.
 */
export function MapDiceOverlay({
  cue,
  onDone,
  resourceLayout = RESOURCE_DIE_LAYOUT
}: {
  cue: MapDiceCue;
  onDone: () => void;
  resourceLayout?: ResourceDieLayout;
}) {
  const [phase, setPhase] = useState<"rolling" | "settled">("rolling");
  const faceIndexes = mapDiceFaceIndexes(cue, resourceLayout);
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
  const stageLabel =
    cue.dice === "treasure"
      ? "STEP 1 · TREASURE DIE"
      : cue.dice === "resource" && cue.origin === "treasure"
        ? "STEP 2 · RESOURCE DICE FROM TREASURE"
        : null;

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
          <span>
            {stageLabel ? <small className="mapDiceStepLabel">{stageLabel}</small> : null}
            <strong>
              {cue.playerName} rolls the {MAP_DICE_TITLES[cue.dice]}
              {faceIndexes.length > 1 ? ` ×${faceIndexes.length}` : ""}
            </strong>
          </span>
        </header>
        <div className="diceRow">
          {faceIndexes.map((faceIndex, index) => (
            <MapDieCube
              dimmed={false}
              faceIndex={faceIndex}
              key={index}
              kind={cue.dice}
              resourceLayout={resourceLayout}
              rolling={rolling}
            />
          ))}
        </div>
        <div className={`diceBreakdown ${rolling ? "hidden" : ""}`}>
          {cue.results.map((result, index) => (
            <strong className="damageResult hit" key={index}>
              {cue.dice === "treasure" ? `Treasure result → ${result}` : result}
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
  /**
   * Compact reward chips (resource token / experience / morale + a short "+N"
   * or "+N/turn" label) built from the visit's outcome events — the result of
   * a treasure chest / mine visit shown with the correct board icons instead of
   * a "mass of text". When present, the chips REPLACE the text lines.
   */
  rewards?: NoticeReward[];
  /**
   * A resource-token icon to use as the notice art when the location has no
   * dedicated art (a mine shows its resource token instead of a pickaxe emoji).
   */
  iconImage?: string;
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
  const rewards = cue.rewards ?? [];
  const hasRewards = rewards.length > 0;
  useEffect(() => {
    const doneId = setTimeout(onDone, hasRewards || cue.lines.length > 0 ? 5200 : 3400);
    return () => clearTimeout(doneId);
  }, [cue, onDone, hasRewards]);

  const noticeArt = cue.location ? NOTICE_ART_BY_LOCATION[cue.location] : undefined;

  return (
    <div className="mapNoticeBackdrop" onClick={onDone} role="status" aria-label={cue.title}>
      <div className="mapNotice">
        <span
          aria-hidden="true"
          className={`mapNoticeIcon${noticeArt || cue.iconImage ? " withArt" : ""}`}
        >
          {noticeArt ? (
            <img
              alt=""
              className={`mapNoticeArt${NOTICE_ART_COMPACT.has(cue.location ?? "") ? " compact" : ""}`}
              src={assetUrl(noticeArt)}
            />
          ) : cue.iconImage ? (
            <img alt="" className="mapNoticeResourceArt" src={assetUrl(cue.iconImage)} />
          ) : (
            cue.icon
          )}
        </span>
        <strong>{cue.title}</strong>
        <small>{cue.subtitle}</small>
        {/* Prefer the compact reward chips (correct icons, no "mass of text");
            fall back to the text lines only when there are no material chips
            (e.g. an Artifact Search that grants no resource/XP). */}
        {hasRewards ? (
          <div className="mapNoticeRewards">
            {rewards.map((reward, index) => (
              <span
                className={`mapNoticeReward tone-${reward.tone}`}
                key={index}
                title={reward.title}
              >
                {reward.icon ? (
                  <img alt="" className="mapNoticeRewardIcon" src={assetUrl(reward.icon)} />
                ) : (
                  <span aria-hidden="true" className="mapNoticeRewardGlyph">
                    {reward.glyph}
                  </span>
                )}
                <b>{reward.label}</b>
              </span>
            ))}
          </div>
        ) : cue.lines.length > 0 ? (
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
  // Do not launch immediately behind the last starting-bonus animation. Every
  // client gets an explicit local acknowledgement before the already-recorded
  // shared roll ceremony begins.
  const [phase, setPhase] = useState<"ready" | "rolling" | "revealed">("ready");

  const attempt = cue.attempts[attemptIndex] ?? cue.attempts[cue.attempts.length - 1];
  const isFinalAttempt = attemptIndex >= cue.attempts.length - 1;
  const best = Math.max(...attempt.rolls.map((roll) => roll.value));
  const revealed = phase === "revealed";
  const rolling = phase === "rolling";

  // Once acknowledged, the ceremony auto-plays the shared attempts; tied
  // attempts continue on their own. The final Begin dismissal stays local too.
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
          {phase === "ready" ? (
            <button className="commandButton primary" onClick={() => setPhase("rolling")} type="button">
              <Dices aria-hidden="true" size={15} /> Roll for first player
            </button>
          ) : null}
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

export type MapEventCue = {
  /** Unique per firing (the first MAP_PRESET_TRIGGERED event id of the batch). */
  id: string;
  round: number;
  /** One line per timed effect that fired this round (several can share a round). */
  messages: string[];
  /**
   * When set, this cue is the Victory-Points "final round" warning (not a
   * designed-map timed event): the overlay uses a distinct header so the player
   * understands the game ends once this round is over.
   */
  finalRound?: boolean;
  /**
   * When set, this cue is a Calamity Waves notice (not a designed-map timed
   * event): "incoming" is the round-BEFORE warning, "imminent" is the wave
   * round beginning — both pop a distinct battle-flavored header so a wave is
   * never just a feed line the player misses before their armies fight it.
   */
  monsterWave?: "incoming" | "imminent";
};

/**
 * Designed-map timed event(s) firing at the start of a round (map-designer
 * "Timed events"): pops an ornate scroll-framed announcement into every
 * player's face so a "+3 gold each" or "the mills re-open" is never just a
 * feed line nobody notices. Several effects sharing the round stack into one
 * card. Dismissed by click / Enter / Escape, once per firing per client.
 */
export function MapEventOverlay({ cue, onDone }: { cue: MapEventCue; onDone: () => void }) {
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // A Calamity Wave gets an ominous war-horn instead of the cheerful new-week
  // chime — it is a threat bearing down on every army, not a bookkeeping notice.
  const isWave = Boolean(cue.monsterWave);
  useEffect(() => {
    playLibrarySound(isWave ? "effects/horn-altar" : "adventure/new-week", isWave ? 0.55 : 0.4);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        onDoneRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWave]);

  const headerIcon = cue.monsterWave ? "⚔️" : cue.finalRound ? "⏳" : "🗺️";
  const headerTitle = cue.monsterWave
    ? cue.monsterWave === "imminent"
      ? "Monster wave strikes!"
      : "Monster wave incoming!"
    : cue.finalRound
    ? "Final round!"
    : "Map event!";
  const ariaLabel = cue.monsterWave
    ? `${headerTitle} — round ${cue.round}`
    : cue.finalRound
    ? `Final round — round ${cue.round}`
    : `Map event — round ${cue.round}`;

  // Calamity Waves get a dedicated HORROR treatment: a full-bleed painted
  // invasion backdrop and a single short line instead of the ornate scroll's
  // verbose effect list — a wave is a threat to brace for, not a memo to read.
  if (cue.monsterWave) {
    const tagline =
      cue.monsterWave === "imminent"
        ? "The horde is here — every army fights NOW."
        : "The horde gathers — every army is struck next round.";
    return (
      <div
        className="astrologersProclaimBackdrop mapEventBackdrop waveWarnBackdrop"
        role="dialog"
        aria-label={ariaLabel}
        onClick={onDone}
      >
        <div className="mapEventCard waveWarnCard" onClick={(event) => event.stopPropagation()}>
          <img
            aria-hidden="true"
            className="waveWarnArt"
            src={assetUrl("/assets/ui/monster-wave-warning.webp")}
            alt=""
          />
          <div className="waveWarnBody">
            <span className="waveWarnRound">Round {cue.round}</span>
            <strong className="waveWarnTitle">{headerTitle}</strong>
            <p className="waveWarnTagline">{tagline}</p>
            <button className="commandButton primary waveWarnButton" onClick={onDone} type="button">
              Brace for battle
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="astrologersProclaimBackdrop mapEventBackdrop"
      role="dialog"
      aria-label={ariaLabel}
      onClick={onDone}
    >
      <div className="mapEventCard" onClick={(event) => event.stopPropagation()}>
        <header className="mapEventHead">
          <span aria-hidden="true">{headerIcon}</span>
          <strong>{headerTitle}</strong>
          <span className="mapEventRound">round {cue.round}</span>
        </header>
        <ul className="mapEventLines">
          {cue.messages.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
        <button className="commandButton primary" onClick={onDone} type="button">
          Understood
        </button>
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
 * simulator keeps the result visible until the player uses the top-level new
 * game control. "Keep looking" hides the popup so the final board can be inspected.
 */
export function CombatResultModal({
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
