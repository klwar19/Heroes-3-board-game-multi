"use client";

/**
 * Map spell cast-then-boost window — the battle-style Power picker.
 *
 * After a Power-tiered map Spell (View Air, View Earth, Fly, Dimension Door,
 * Water Walk, Town Portal) is cast, the engine opens the `map-spell-boost`
 * OPTION_CHOICE. This modal replaces the old PromptTray text-button list ("the
 * box system") with the same vibe as casting in combat: the spell's card face,
 * a live Power readout over the printed tier ladder, and every Power source as
 * a clickable card tile — hand cards (each printed side its own tile, expert
 * crowns marked), the Spell Book, the School of Magic and Basic X Magic
 * experts, plus the printed cost discards (Titan's Cuirass / Breastplate of
 * Brimstone). PRESENTATION ONLY: every tile dispatches the exact CHOOSE_OPTION
 * the engine offered (index-aligned), so AI seats, AFK defaults and hidden-info
 * masking are untouched.
 */

import { Check, Crown, Hourglass } from "lucide-react";
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
  const power = boost.power;
  const best = tiers ? bestMapSpellTier(tiers, power) : null;

  const optionActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "CHOOSE_OPTION" }> } =>
      legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === choice.id
  );
  if (optionActions.length === 0) {
    return null;
  }
  const actionFor = (optionIndex: number) => optionActions.find((legal) => legal.action.optionIndex === optionIndex);
  // The trailing option (when present) is "Resolve now"; while a printed cost
  // discard is still owed the engine withholds it, and so do we.
  const resolveAction = choice.options.length > boost.offers.length ? actionFor(boost.offers.length) : undefined;

  const entries = boost.offers.map((offer, index) => ({ offer, index, visual: offerVisual(offer) }));
  const costSourceName = boost.costDiscards ? cardName(boost.costDiscards.sourceCardId) : null;
  const sections: { key: "hand" | "book" | "cost" | "school"; heading: string }[] = [
    {
      key: "cost",
      heading: boost.costDiscards
        ? boost.costDiscards.required > 0
          ? `Pay ${costSourceName}: discard ${boost.costDiscards.required} more card${boost.costDiscards.required === 1 ? "" : "s"}`
          : `${costSourceName}: discard up to ${boost.costDiscards.upTo} more, +${boost.costDiscards.perCard} Power each`
        : "Pay the printed cost"
    },
    { key: "hand", heading: "Add Power from your hand" },
    { key: "book", heading: "…or burn a Spell Book Spell" },
    { key: "school", heading: "…or your School of Magic (expert)" }
  ];

  const renderTile = (entry: (typeof entries)[number]) => {
    const legal = actionFor(entry.index);
    if (!legal) {
      return null;
    }
    const label = choice.options[entry.index]?.label ?? legal.label;
    const value = entry.offer.value;
    return (
      <div className="searchCardWrap" key={entry.index}>
        <button
          aria-label={label}
          className="searchCard spellBoostTile"
          onClick={() => onAction(legal.action)}
          title={label}
          type="button"
        >
          <span className="spellBoostValue">{value > 0 ? `+${value} Power` : "Pay cost"}</span>
          <CardFrame cardId={entry.visual.faceCardId} className="searchCardImage" />
          <span className="spellBoostTileName">{cardName(entry.visual.faceCardId)}</span>
          {offerChips(entry.offer).map((chip) => (
            <small className="spellBoostChip" key={chip}>
              {chip.startsWith("Expert") ? <Crown aria-hidden="true" size={10} /> : null}
              {chip}
            </small>
          ))}
        </button>
        <ZoomButton
          label={`Read ${cardName(entry.visual.faceCardId)}`}
          onZoom={() => zoomCard(entry.visual.faceCardId)}
        />
      </div>
    );
  };

  return (
    <div className="modalBackdrop" role="dialog" aria-label={choice.prompt}>
      <div className="searchModal mapSpellBoostModal">
        <header>
          <strong>{spell?.name ?? "Map Spell"} — add Power like in battle</strong>
          <span>Pump Power sources into the cast, then resolve at the best tier you reach.</span>
        </header>
        <div className="spellBoostTop">
          <div className="searchCardWrap spellBoostSpell">
            <CardFrame cardId={boost.spellCardId} className="searchCardImage" />
            <ZoomButton label={`Read ${cardName(boost.spellCardId)}`} onZoom={() => zoomCard(boost.spellCardId)} />
          </div>
          <div className="spellBoostLadder" data-testid="spell-boost-ladder">
            <span className="spellBoostPower">
              Power: <b>{power}</b>
            </span>
            {(tiers?.tiers ?? []).map((tier) => {
              const reached = tier.minPower <= power;
              const isBest = best?.optionIndex === tier.optionIndex;
              return (
                <span
                  className={`spellBoostTier${reached ? " reached" : ""}${isBest ? " best" : ""}`}
                  data-reached={reached ? "true" : "false"}
                  key={tier.optionIndex}
                >
                  <b>{tier.minPower}+</b> {tier.label}
                  {isBest ? " ← resolves now" : ""}
                </span>
              );
            })}
          </div>
        </div>
        <div className="searchCards deckSearchSections">
          {sections.map((section) => {
            const own = entries.filter((entry) => entry.visual.section === section.key);
            if (own.length === 0) {
              return null;
            }
            return (
              <section className="deckSearchSection" key={section.key}>
                <span className="deckSearchSectionLabel">{section.heading}</span>
                <div className="deckSearchSectionRow spellBoostRow">{own.map(renderTile)}</div>
              </section>
            );
          })}
        </div>
        {resolveAction ? (
          <footer className="spellBoostResolveRow">
            <button
              className="commandButton primary"
              onClick={() => onAction(resolveAction.action)}
              type="button"
            >
              <Check aria-hidden="true" size={13} /> {choice.options[boost.offers.length]?.label ?? resolveAction.label}
            </button>
          </footer>
        ) : (
          <footer className="spellBoostResolveRow">
            <small className="spellBoostCostNote">The printed cost must be paid before the Spell resolves.</small>
          </footer>
        )}
      </div>
    </div>
  );
}
