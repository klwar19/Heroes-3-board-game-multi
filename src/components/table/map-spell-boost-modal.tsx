"use client";

/**
 * Map spell cast-then-boost window — the battle-style Power tray.
 *
 * After a Power-tiered map Spell (View Air, View Earth, Fly, Dimension Door,
 * Water Walk, Town Portal) is cast, the engine opens the `map-spell-boost`
 * OPTION_CHOICE. This tray replaces the old PromptTray text-button list and
 * uses the actual combat reaction-tray language: the cast stays open, current
 * Power updates live, and every Power source is a one-click card tile. There is
 * no tier picker — the player gradually adds Power, then commits the cast.
 * Sources include hand cards (each printed side its own tile, expert
 * crowns marked), the Spell Book, the School of Magic and Basic X Magic
 * experts, plus the printed cost discards (Titan's Cuirass / Breastplate of
 * Brimstone). PRESENTATION ONLY: every tile dispatches the exact CHOOSE_OPTION
 * the engine offered (index-aligned), so AI seats, AFK defaults and hidden-info
 * masking are untouched.
 */

import { Check, Crown, Hourglass, Zap } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import {
  bestMapSpellTier,
  mapSpellPowerTiers,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { cardName } from "./utils";
import { CardFrame } from "./seats";
import { useCardZoom, ZoomButton } from "./zoom";

type BoostChoice = Extract<NonNullable<GameState["pendingChoice"]>, { type: "OPTION_CHOICE" }>;
type BoostOffer = NonNullable<BoostChoice["mapSpellBoost"]>["offers"][number];

/** Which section an offer renders under, and the card face its tile wears. */
function offerVisual(offer: BoostOffer): { section: "hand" | "book" | "cost" | "school"; faceCardId: string } {
  if (offer.kind === "card") {
    return { section: offer.fromBook ? "book" : "hand", faceCardId: offer.cardId };
  }
  if (offer.kind === "tome-max") {
    return { section: "hand", faceCardId: offer.cardId };
  }
  if (offer.kind === "cost-discard") {
    return { section: "cost", faceCardId: offer.cardId };
  }
  if (offer.kind === "school-permanent-expert") {
    return { section: "school", faceCardId: offer.permanentCardId };
  }
  return { section: "school", faceCardId: offer.fromHandCardId ?? `ability.basic_${offer.school}_magic` };
}

/** Short chips describing what playing this tile does beyond the +Power. */
function offerChips(offer: BoostOffer): string[] {
  const chips: string[] = [];
  if (offer.kind === "card") {
    if (offer.mode === "expert") {
      chips.push(offer.crownFree ? "Expert — Empowered, no crown" : "Expert — 1 crown");
    }
    if (offer.drawCards) {
      chips.push(`then draw ${offer.drawCards}`);
    }
    if (offer.removeSelf) {
      chips.push("leaves the game");
    }
    if (offer.costDiscards) {
      chips.push(
        offer.costDiscards.required > 0
          ? `then discard ${offer.costDiscards.required} card${offer.costDiscards.required === 1 ? "" : "s"}`
          : `up to ${offer.costDiscards.upTo} discards, +${offer.costDiscards.perCard} each`
      );
    }
    if (offer.fromBook) {
      chips.push("Spell Book");
    }
  } else if (offer.kind === "school-permanent-expert" || offer.kind === "school-fetch-expert") {
    chips.push("Expert — 1 crown");
    chips.push(offer.kind === "school-fetch-expert" && offer.fromHandCardId ? "discards the card" : "discards the permanent");
  } else if (offer.kind === "tome-max") {
    chips.push("Maximum Power");
    chips.push("discards the Tome");
  }
  return chips;
}

export function MapSpellBoostModal({
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
  const { zoomCard } = useCardZoom();
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "map-spell-boost" || !choice.mapSpellBoost) {
    return null;
  }

  if (choice.playerId !== viewerPlayerId) {
    return (
      <div className="reactionStrip waiting" role="status">
        <Hourglass aria-hidden="true" size={15} />
        <span>{state.players[choice.playerId]?.name ?? choice.playerId} is adding Power to a map Spell…</span>
      </div>
    );
  }

  const boost = choice.mapSpellBoost;
  const spell = cardLibrary[boost.spellCardId];
  const tiers = mapSpellPowerTiers(spell);
  const power = boost.effectivePower ?? boost.power;
  const best = tiers ? bestMapSpellTier(tiers, power) : null;

  const optionActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "CHOOSE_OPTION" }> } =>
      legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === choice.id
  );
  if (optionActions.length === 0) {
    return null;
  }
  const actionFor = (optionIndex: number) => optionActions.find((legal) => legal.action.optionIndex === optionIndex);
  // The trailing option (when present) commits the Power and casts; while a printed cost
  // discard is still owed the engine withholds it, and so do we.
  const resolveAction = choice.options.length > boost.offers.length ? actionFor(boost.offers.length) : undefined;

  // The tray deliberately has no tier PICKER, but the player still has to
  // decide HOW MUCH Power to add — so the next unreached breakpoint (and what it
  // buys) is spelled out beside the live Power. Without it the readout says only
  // what the cast does now, and "add +1 Power" is a blind choice.
  const nextTier = (tiers?.tiers ?? []).find((tier) => tier.minPower > power) ?? null;

  const entries = boost.offers.map((offer, index) => ({ offer, index, visual: offerVisual(offer) }));
  const costSourceName = boost.costDiscards ? cardName(boost.costDiscards.sourceCardId) : null;
  const sourceLabel = (entry: (typeof entries)[number]) =>
    entry.visual.section === "book"
      ? "Spell Book"
      : entry.visual.section === "school"
        ? "School expert"
        : entry.visual.section === "cost"
          ? `Pay ${costSourceName ?? "printed cost"}`
          : entry.offer.kind === "tome-max"
            ? "Tome"
            : "Power source";

  const renderTile = (entry: (typeof entries)[number]) => {
    const legal = actionFor(entry.index);
    if (!legal) {
      return null;
    }
    const label = choice.options[entry.index]?.label ?? legal.label;
    const value = entry.offer.value;
    return (
      <div className="trayTile mapSpellSourceTile" key={entry.index}>
        <div className="mapSpellTrayCard">
          <CardFrame cardId={entry.visual.faceCardId} className="trayCardImage" />
          <ZoomButton
            label={`Read ${cardName(entry.visual.faceCardId)}`}
            onZoom={() => zoomCard(entry.visual.faceCardId)}
          />
        </div>
        <div className="trayTileBody">
          <strong>{cardName(entry.visual.faceCardId)}</strong>
          <small className="mapSpellSourceKind">{sourceLabel(entry)}</small>
          <div className="mapSpellSourceChips">
            {offerChips(entry.offer).map((chip) => (
              <small className="spellBoostChip" key={chip}>
                {chip.startsWith("Expert") ? <Crown aria-hidden="true" size={10} /> : null}
                {chip}
              </small>
            ))}
          </div>
          <button
            aria-label={label}
            className="trayInstant mapSpellAddPower"
            onClick={() => onAction(legal.action)}
            title={label}
            type="button"
          >
            <Zap aria-hidden="true" size={13} />
            {entry.offer.kind === "tome-max"
              ? "Set to maximum Power"
              : value > 0
                ? `Add +${value} Power`
                : "Pay cost"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="reactionTray mapSpellPowerTray" role="dialog" aria-label={choice.prompt}>
      <header>
        <Zap aria-hidden="true" size={15} />
        <strong>Map Spell — Power window</strong>
        <span>{spell?.name ?? "Map Spell"}</span>
        <span className="trayPowerMeter" data-testid="spell-boost-power">
          <Zap aria-hidden="true" size={13} />
          <strong>Power {power}</strong>
          <small>{best ? `Current effect: ${best.label}` : "Cast in progress"}</small>
          <small className="mapSpellNextTier" data-testid="spell-boost-next-tier">
            {nextTier
              ? `Next at Power ${nextTier.minPower}: ${nextTier.label}`
              : "Highest effect reached"}
          </small>
        </span>
      </header>
      <div className="trayTiles">
        <div className="trayTile mapSpellCastTile">
          <div className="mapSpellTrayCard">
            <CardFrame cardId={boost.spellCardId} className="trayCardImage" />
            <ZoomButton label={`Read ${cardName(boost.spellCardId)}`} onZoom={() => zoomCard(boost.spellCardId)} />
          </div>
          <div className="trayTileBody">
            <strong>{cardName(boost.spellCardId)}</strong>
            <small>Spell prepared. Add Power one source at a time, then commit the cast.</small>
          </div>
        </div>
        {entries.map(renderTile)}
      </div>
      <footer>
        <div className="trayPreview">
          <span>All added Power is spent when this Spell resolves. Recall never restores Power.</span>
          {boost.costDiscards ? (
            <span>
              {boost.costDiscards.required > 0
                ? `Pay ${costSourceName}: discard ${boost.costDiscards.required} more`
                : `${costSourceName}: up to ${boost.costDiscards.upTo} more discards`}
            </span>
          ) : null}
        </div>
        {resolveAction ? (
          <button
            className="trayPass mapSpellResolve"
            onClick={() => onAction(resolveAction.action)}
            type="button"
          >
            <Check aria-hidden="true" size={15} />
            Commit Power &amp; Cast — Power {power}
          </button>
        ) : (
          <small className="spellBoostCostNote">Pay the printed cost before resolving.</small>
        )}
      </footer>
    </div>
  );
}
