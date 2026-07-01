"use client";

/* eslint-disable @next/next/no-img-element */

import { Anchor, Crown, Hourglass, Layers, Search, Sparkles } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { playSpellBookOpen } from "@/lib/sound";
import { useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import { getDeckBack } from "@/data/decks";
import {
  describeCardEffect,
  describePermanentEffect,
  getPermanentCardIds,
  getRuneTrack,
  isBulwarkPlayer,
  playerSpellCastsIgnoreLimit,
  spellBookRuleEnabled,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerVisibleState,
  type SharedDeckId
} from "@/engine";
import {
  actionKey,
  cardIsEmpoweredFor,
  cardName,
  cardSelectionKey,
  getCardMetaLabels,
  isBoardTargetCardAction,
  isEmpoweredStatisticCard,
  sameCardSelection,
  targetName,
  type CardBoardAction
} from "./utils";
import { useCardZoom, ZoomButton } from "./zoom";
import { SpecialtyCard } from "@/components/specialty-card";
import { canRenderSpecialtyCard } from "@/components/specialty-card-data";

export function CardFrame({
  cardId,
  className,
  title,
  empowered
}: {
  cardId?: string;
  className: string;
  title?: string;
  /**
   * Force the Empowered highlight (gold ring + glow) for an ability the owner
   * has had Empowered — that status is per-player, so the caller passes it in.
   * Empowered STATISTICS are detected intrinsically (the `"empowered"` tag), so
   * they highlight here even when this prop is omitted.
   */
  empowered?: boolean;
}) {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const src = card?.assets?.cardImage;
  const alt = card?.assets?.imageAlt ?? card?.name ?? cardId ?? "card";
  const showEmpowered = Boolean(empowered) || isEmpoweredStatisticCard(cardId);
  // The empowered ring is layered onto whichever element renders, so the cue is
  // identical across the hand fan, trays, piles and discard tops.
  const frameClass = showEmpowered ? `${className} empoweredCard` : className;
  // Some cards have no scan yet (e.g. Moandor's specialties are not on the fan
  // wiki); show the named text frame rather than a broken image. Keyed by src
  // so a different card reusing this frame still renders its art.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    // Art-less hero specialties (Bulwark/Conflux/Cove and every other hero with
    // no printed scan) render the native specialty card here too — same as the
    // zoom view — so they show in the hand fan, trays and piles, not just on
    // zoom. The icon slot may be empty; the frame, name and effect still draw.
    if (cardId && canRenderSpecialtyCard(cardId)) {
      return (
        <div className={`${frameClass} specialtyCardFrame`} title={title ?? alt}>
          <SpecialtyCard cardId={cardId} />
        </div>
      );
    }
    return (
      <div className={`${frameClass} cardFaceFallback`} title={title ?? alt}>
        {card?.name ?? cardId ?? "?"}
      </div>
    );
  }

  return (
    <img
      alt={showEmpowered ? `${alt} (empowered)` : alt}
      className={frameClass}
      data-empowered={showEmpowered ? "true" : undefined}
      loading="eager"
      onError={() => setFailedSrc(src)}
      referrerPolicy="no-referrer"
      src={assetUrl(src)}
      title={title ?? alt}
    />
  );
}

/**
 * The permanent cards in play next to a player's hero board — one as
 * printed, up to three with the Pandora's Box exception. Their effects are
 * always on. Each card shows a "permanent" badge and a voluntary "discard from
 * play" button when the engine offers it. (A School of Magic's discard-for-+3
 * is decided when casting — see the spell's "+ School of Magic" cast option —
 * not from here.)
 */
export function PermanentSlot({
  state,
  playerId,
  viewerPlayerId,
  legalActions,
  onAction,
  compact = false
}: {
  state: GameState;
  playerId: PlayerId;
  viewerPlayerId?: PlayerId;
  legalActions?: LegalAction[];
  onAction?: (action: GameAction) => void;
  compact?: boolean;
}) {
  const { zoomCard } = useCardZoom();
  const cardIds = getPermanentCardIds(state, playerId);
  // Ongoing cards held in play: they reach the discard pile (or a recalled
  // spell the hand) only after their effect ends.
  const ongoingCards = state.players[playerId]?.ongoingCards ?? [];
  if (cardIds.length === 0 && ongoingCards.length === 0) {
    return null;
  }

  const ownView = Boolean(onAction && viewerPlayerId === playerId);
  const discardActionFor = (cardId: string) =>
    ownView
      ? legalActions?.find(
          (legal) => legal.action.type === "DISCARD_PERMANENT" && legal.action.cardId === cardId
        )
      : undefined;
  // Income permanents (Eversmoking Ring, Inexhaustible Cart) can be cracked open
  // for their one-off instant gain while sitting in the permanent slot.
  const crackActionFor = (cardId: string) =>
    ownView
      ? legalActions?.find(
          (legal) => legal.action.type === "CRACK_PERMANENT" && legal.action.cardId === cardId
        )
      : undefined;

  return (
    <div
      className={`permanentRow ${compact ? "compact" : ""}`}
      aria-label={`${state.players[playerId]?.name} permanents in play`}
    >
      {cardIds.map((cardId, index) => {
        const card = cardLibrary[cardId];
        const discard = discardActionFor(cardId);
        const crack = crackActionFor(cardId);

        return (
          <div className={`permanentSlot ${compact ? "compact" : ""}`} key={`${cardId}-${index}`}>
            <button
              className="permanentCardButton"
              onClick={() => zoomCard(cardId)}
              title={card ? `${card.name} — ${describePermanentEffect(card)}` : cardId}
              type="button"
            >
              <CardFrame cardId={cardId} className="permanentCardImage" />
            </button>
            <div className="permanentMeta">
              <span className="permanentBadge">
                <Anchor aria-hidden="true" size={11} /> permanent
              </span>
              {!compact ? <strong>{card?.name ?? cardId}</strong> : null}
              {!compact && card ? <small>{describePermanentEffect(card)}</small> : null}
              {crack ? (
                <button
                  className="commandButton"
                  onClick={() => onAction?.(crack.action)}
                  title="Crack this card open: remove it from the game for its one-off instant gain"
                  type="button"
                >
                  {crack.label.replace(/^Crack .*? open: /, "Crack open: ")}
                </button>
              ) : null}
              {discard ? (
                <button
                  className="commandButton ghost"
                  onClick={() => onAction?.(discard.action)}
                  title="Voluntarily put this permanent into your discard pile (its effect stops immediately)"
                  type="button"
                >
                  Discard from play
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {ongoingCards.map((held, index) => {
        const card = cardLibrary[held.cardId];
        return (
          <div className={`permanentSlot ongoing ${compact ? "compact" : ""}`} key={`ongoing-${held.cardId}-${index}`}>
            <button
              className="permanentCardButton"
              onClick={() => zoomCard(held.cardId)}
              title={`${card?.name ?? held.cardId} stays in play until its effect ends, then goes to the ${
                held.returnTo === "hand" ? "hand (recalled)" : "discard pile"
              }.`}
              type="button"
            >
              <CardFrame cardId={held.cardId} className="permanentCardImage" />
            </button>
            <div className="permanentMeta">
              <span className="permanentBadge ongoingBadge">
                <Hourglass aria-hidden="true" size={11} /> ongoing
              </span>
              {!compact ? <strong>{card?.name ?? held.cardId}</strong> : null}
              {!compact ? (
                <small>
                  Until the effect ends, then → {held.returnTo === "hand" ? "hand (recalled)" : "discard"}
                </small>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CardBack({ className, deckId }: { className?: string; deckId?: string }) {
  const back = getDeckBack(deckId);
  if (back.image) {
    return <img alt={back.label} aria-hidden="true" className={`cardBack ${className ?? ""}`} src={assetUrl(back.image)} />;
  }
  return (
    <div className={`cardBack back-${back.styleKey} ${className ?? ""}`} aria-hidden="true" title={back.label}>
      <span>H3</span>
    </div>
  );
}

type HandCardEntry = {
  handIndex: number;
  cardId: string;
  boardSelections: CardBoardAction[];
  immediateActions: LegalAction[];
};

/**
 * The pop-up window opened by the Spell Book / Spell Scroll icon: lists each
 * stored Spell with the cast buttons the engine currently offers for it. The
 * cast actions are already concrete (pre-targeted, carrying their own
 * fromScroll/fromSpellBook source), so each is dispatched DIRECTLY — never
 * routed through the board's card-selection key, which does not distinguish the
 * source zone. Spells with no legal cast right now show why (the timing hint).
 */
function SpellShelfPopover({
  title,
  subtitle,
  spellIds,
  actions,
  state,
  trayActive,
  onAction,
  onClose,
  zoomCard,
  emptyHint
}: {
  title: string;
  subtitle: string;
  spellIds: string[];
  actions: (LegalAction & { action: CardBoardAction })[];
  state: GameState;
  trayActive: boolean;
  onAction: (action: GameAction) => void;
  onClose: () => void;
  zoomCard: (cardId: string) => void;
  emptyHint?: (cardId: string) => string;
}) {
  return (
    <div className="shelfPopover" role="menu" aria-label={`${title} spells`}>
      <strong>{title}</strong>
      <small>{subtitle}</small>
      {spellIds.length === 0 ? <div className="shelfEmpty">No Spells here.</div> : null}
      {[...new Set(spellIds)].map((spellId) => {
        const card = cardLibrary[spellId];
        const actionsForSpell = actions.filter((legal) => legal.action.cardId === spellId);
        const castable = !trayActive && actionsForSpell.length > 0;
        return (
          <div className="shelfSpell" key={spellId}>
            <button
              className="shelfSpellHead"
              onClick={() => zoomCard(spellId)}
              title={card ? describeCardEffect(card) : spellId}
              type="button"
            >
              <CardFrame cardId={spellId} className="shelfSpellIcon" />
              <span className="shelfSpellName">{card?.name ?? spellId}</span>
            </button>
            {castable ? (
              <div className="shelfSpellCasts">
                {actionsForSpell.map((legal) => {
                  const action = legal.action;
                  const targetLabel =
                    action.target?.type === "unit"
                      ? ` → ${targetName(state, action.target)}`
                      : action.target?.type === "space"
                        ? " → space"
                        : "";
                  const expert = action.type === "CAST_SPELL" && action.useSchoolExpert ? " + School of Magic" : "";
                  return (
                    <button
                      className="commandButton"
                      key={actionKey(action)}
                      onClick={() => {
                        onAction(action);
                        onClose();
                      }}
                      type="button"
                    >
                      {`Cast${expert}${targetLabel}`}
                    </button>
                  );
                })}
              </div>
            ) : (
              <small className="shelfSpellHint">{emptyHint ? emptyHint(spellId) : "Not castable right now."}</small>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HandFan({
  view,
  state,
  viewerPlayerId,
  legalActions,
  selectedCardAction,
  trayActive,
  hiddenTailCount = 0,
  onSelectCardAction,
  onAction
}: {
  view: PlayerVisibleState;
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  selectedCardAction: CardBoardAction | null;
  trayActive: boolean;
  /** Freshly drawn cards stay hidden while their draw flight is in the air. */
  hiddenTailCount?: number;
  onSelectCardAction: (action: CardBoardAction | null) => void;
  onAction: (action: GameAction) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [shelfOpen, setShelfOpen] = useState<"book" | "scroll" | null>(null);
  // A staged immediate play (no board target): clicking the play arms it here
  // first, so an accidental click is ALWAYS cancellable — the card is only
  // actually played when the player presses Confirm. Nothing is sent to the
  // engine until then, so this holds for multiplayer too.
  const [armed, setArmed] = useState<{ handIndex: number; action: CardBoardAction; label: string } | null>(null);
  const { zoomCard } = useCardZoom();
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  const cardActions = legalActions.filter(
    (legal): legal is LegalAction & { action: CardBoardAction } =>
      legal.action.type === "CAST_SPELL" || legal.action.type === "PLAY_CARD"
  );

  const playerState = state.players[viewerPlayerId];
  const ignoreSpellLimit = Boolean(playerState) && playerSpellCastsIgnoreLimit(state, viewerPlayerId);
  const spellLimit = 1 + (playerState?.combatStats.spellLimitBonusThisRound ?? 0);
  const spellLimitReached = !ignoreSpellLimit && (playerState?.combatStats.spellsCastThisRound ?? 0) >= spellLimit;
  const activeUnit = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : undefined;
  const ownActivationOpen = Boolean(
    activeUnit &&
      activeUnit.controllerId === viewerPlayerId &&
      !activeUnit.activatedThisRound &&
      !activeUnit.attackedThisActivation
  );

  /** Why a card has no buttons right now, in table terms. */
  const timingHint = (cardId: string): string => {
    const card = cardLibrary[cardId];
    if (!card) {
      return "Unknown card";
    }
    if (card.implementationStatus === "not-implemented") {
      return "Resolve this card manually — automation coming soon";
    }
    if (card.kind === "spell") {
      if (spellLimitReached) {
        return `Spell limit reached (${spellLimit} per combat round)`;
      }
      return card.trigger || card.timing === "instant"
        ? "Instant spell: play it into an attack or spell window (Power cards empower it)"
        : "Activation spell: cast while one of your units is active, before it attacks";
    }
    if (card.trigger || card.timing === "instant") {
      return "Instant: waits for its timing window (attack or spell)";
    }
    if (card.timing === "ongoing" || card.timing === "combat" || card.timing === "action") {
      return ownActivationOpen
        ? "Playable now"
        : "Play during your own unit's activation, before it attacks";
    }
    if (card.timing === "map") {
      return "Map effect: play on the adventure map during your turn";
    }
    return "No legal timing right now";
  };

  const entries: HandCardEntry[] = player.hand.map((cardId, handIndex) => {
    // Only true hand casts belong on the hand card — Spell Scroll (fromScroll)
    // and Spell Book (fromSpellBook) casts live on their own shelf icons, so a
    // Spell present in several zones is never offered twice or routed to the
    // wrong source (cardSelectionKey, which drives board targeting, ignores the
    // source flag, so the hand must exclude the off-hand casts here).
    const actionsForCard = cardActions.filter(
      (legal) =>
        legal.action.cardId === cardId &&
        !("fromScroll" in legal.action && legal.action.fromScroll) &&
        !legal.action.fromSpellBook
    );
    const boardSelections = Array.from(
      new Map(
        actionsForCard
          .map((legal) => legal.action)
          .filter(isBoardTargetCardAction)
          .map((action) => [cardSelectionKey(action), action])
      ).values()
    );
    const immediateActions = actionsForCard.filter((legal) => !isBoardTargetCardAction(legal.action));

    return { handIndex, cardId, boardSelections, immediateActions };
  });

  const hiddenFromIndex = entries.length - Math.max(0, hiddenTailCount);

  // Spell Scrolls sit next to the hero board, not in hand. Each held spell may
  // be cast in combat at power 0 (CAST_SPELL with fromScroll); the engine
  // offers a concrete action per legal target.
  const scrolls = player.scrolls ?? [];
  const scrollCastActions = cardActions.filter(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromScroll
  );

  // Spell Book (house rule): the player's personal Spell library, not in hand.
  // Its Spells cast like hand Spells (CAST_SPELL/PLAY_CARD with fromSpellBook);
  // the icon opens a window listing them with their available cast buttons.
  const spellBook = player.spellBook ?? [];
  const bookCastActions = cardActions.filter((legal) => legal.action.fromSpellBook);
  // The Book icon is shown from the start whenever the house rule is on (even
  // empty), so the player can always open it to see what it holds.
  const showSpellBook = spellBookRuleEnabled(state);

  return (
    <div className={`handFan ${trayActive ? "muted" : ""}`} aria-label="Your hand" data-fx-anchor={`hand:${viewerPlayerId}`}>
      {showSpellBook || scrolls.length > 0 ? (
        <div className="spellShelf" aria-label="Spell Book and Spell Scrolls">
          {showSpellBook ? (
            <div className="shelfItem">
              <button
                aria-expanded={shelfOpen === "book"}
                className={`shelfIcon ${shelfOpen === "book" ? "open" : ""} ${spellBook.length === 0 ? "empty" : ""}`}
                onClick={() => {
                  const opening = shelfOpen !== "book";
                  setShelfOpen(opening ? "book" : null);
                  // Play the page-flip cue only when the Book is being opened.
                  if (opening) {
                    playSpellBookOpen();
                  }
                }}
                title={
                  spellBook.length === 0
                    ? "Spell Book — empty (stash Spells on your map turn to store them here)"
                    : "Spell Book — cast a stored Spell (normal Spell limit applies)"
                }
                type="button"
              >
                <img alt="Spell Book" className="shelfGlyph" src={assetUrl("/assets/ui/spell-book-button.png")} />
                <span className="shelfCount">{spellBook.length}</span>
              </button>
              {shelfOpen === "book" ? (
                <SpellShelfPopover
                  actions={bookCastActions}
                  emptyHint={(spellId) => timingHint(spellId)}
                  onAction={onAction}
                  onClose={() => setShelfOpen(null)}
                  spellIds={spellBook}
                  state={state}
                  subtitle="Cast a stored Spell — Power boosts are played in the instant window."
                  title="Spell Book"
                  trayActive={trayActive}
                  zoomCard={zoomCard}
                />
              ) : null}
            </div>
          ) : null}
          {scrolls.length > 0 ? (
            <div className="shelfItem">
              <button
                aria-expanded={shelfOpen === "scroll"}
                className={`shelfIcon ${shelfOpen === "scroll" ? "open" : ""}`}
                onClick={() => setShelfOpen(shelfOpen === "scroll" ? null : "scroll")}
                title="Spell Scrolls — cast in combat at power 0 (not in hand)"
                type="button"
              >
                <span aria-hidden="true" className="shelfGlyph shelfGlyphEmoji">📜</span>
                <span className="shelfCount">{scrolls.reduce((total, scroll) => total + scroll.spellCardIds.length, 0)}</span>
              </button>
              {shelfOpen === "scroll" ? (
                <SpellShelfPopover
                  actions={scrollCastActions}
                  onAction={onAction}
                  onClose={() => setShelfOpen(null)}
                  spellIds={scrolls.flatMap((scroll) => scroll.spellCardIds)}
                  state={state}
                  subtitle="Cast at power 0 — Scroll Spells cannot be boosted."
                  title="Spell Scrolls"
                  trayActive={trayActive}
                  zoomCard={zoomCard}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {entries.length === 0 ? <div className="handEmpty">Empty hand</div> : null}
      {entries.map((entry, entryIndex) => {
        const card = cardLibrary[entry.cardId];
        const playable = !trayActive && (entry.boardSelections.length > 0 || entry.immediateActions.length > 0);
        const selected = entry.boardSelections.some((action) => sameCardSelection(selectedCardAction, action));
        const open = openIndex === entry.handIndex;
        const incoming = entryIndex >= hiddenFromIndex;
        const empowered = cardIsEmpoweredFor(entry.cardId, player.empoweredAbilities);

        return (
          <div className={`fanSlot ${open ? "open" : ""} ${incoming ? "incoming" : ""}`} key={`${entry.cardId}-${entry.handIndex}`}>
            {open ? (
              <div className="cardPopover" role="menu" aria-label={`${cardName(entry.cardId)} actions`}>
                <strong>{cardName(entry.cardId)}</strong>
                {armed && armed.handIndex === entry.handIndex ? (
                  // Confirm step: the play is staged, not yet sent. Cancel backs
                  // out with no effect; Confirm is the only thing that plays it.
                  <div className="cardPlayConfirm" aria-label="Confirm card play">
                    <small>Play this card?</small>
                    <strong className="confirmLabel">{armed.label}</strong>
                    <button
                      className="confirmPlay"
                      onClick={() => {
                        onAction(armed.action);
                        setArmed(null);
                        setOpenIndex(null);
                      }}
                      type="button"
                    >
                      Confirm
                    </button>
                    <button className="ghost" onClick={() => setArmed(null)} type="button">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    {card ? <small>{describeCardEffect(card)}</small> : null}
                    {card ? (
                      <div className="popMeta">
                        {getCardMetaLabels(card).map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    ) : null}
                    <button
                      onClick={() => {
                        zoomCard(entry.cardId);
                        setOpenIndex(null);
                      }}
                      type="button"
                    >
                      Read card (large)
                    </button>
                    {entry.boardSelections.map((action) => (
                      <button
                        key={cardSelectionKey(action)}
                        onClick={() => {
                          onSelectCardAction(sameCardSelection(selectedCardAction, action) ? null : action);
                          setOpenIndex(null);
                        }}
                        type="button"
                      >
                        {sameCardSelection(selectedCardAction, action)
                          ? "Cancel targeting"
                          : `Pick target${"mode" in action && action.mode === "expert" ? " (expert)" : ""}${
                              action.type === "CAST_SPELL" && action.useSchoolExpert ? " + School of Magic (+3)" : ""
                            }`}
                      </button>
                    ))}
                    {entry.immediateActions.map((legal) => {
                      const action = legal.action as CardBoardAction;
                      const label =
                        action.type === "CAST_SPELL" && action.useSchoolExpert
                          ? "Cast + School of Magic (+3)"
                          : action.type === "PLAY_CARD" && action.optionIndex !== undefined && card?.effect.type === "CHOOSE_ONE"
                            ? card.effect.options[action.optionIndex]?.label
                            : action.type === "PLAY_CARD" && action.mode === "expert"
                              ? "Use expert"
                              : action.target?.type === "unit"
                                ? `Use on ${targetName(state, action.target)}`
                                : "Use";
                      return (
                        <button
                          key={actionKey(action)}
                          // Arm a Confirm step instead of playing immediately, so an
                          // accidental click can always be cancelled.
                          onClick={() => setArmed({ handIndex: entry.handIndex, action, label: label ?? "Use" })}
                          type="button"
                        >
                          {label}
                        </button>
                      );
                    })}
                    {!playable ? <small className="noTiming">{timingHint(entry.cardId)}</small> : null}
                    <button
                      className="ghost"
                      onClick={() => {
                        setArmed(null);
                        setOpenIndex(null);
                      }}
                      type="button"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            ) : null}
            <button
              aria-pressed={open || selected}
              className={`fanCard ${playable ? "playable" : ""} ${selected ? "selected" : ""}`}
              onClick={() => {
                setArmed(null);
                // Clear click-to-target: a card whose only play is a single
                // board target (Lightning Bolt and every other targeted Spell)
                // arms targeting straight away — pick the card, then click the
                // enemy on the board — instead of opening a text popover. Cards
                // with a choice (basic/expert mode, two CHOOSE_ONE options, an
                // immediate "Use") still open the popover so the player can pick.
                if (playable && entry.boardSelections.length === 1 && entry.immediateActions.length === 0) {
                  const action = entry.boardSelections[0];
                  onSelectCardAction(sameCardSelection(selectedCardAction, action) ? null : action);
                  setOpenIndex(null);
                  return;
                }
                setOpenIndex(open ? null : entry.handIndex);
              }}
              title={
                card
                  ? `${empowered ? "Empowered — " : ""}${card.name} — ${describeCardEffect(card)}`
                  : entry.cardId
              }
              type="button"
            >
              <CardFrame cardId={entry.cardId} className="fanCardImage" empowered={empowered} />
              {playable ? <span className="playGlow" aria-hidden="true" /> : null}
              {empowered ? (
                <span className="empoweredBadge empoweredBadgeOverlay">
                  <Sparkles aria-hidden="true" size={9} /> Empowered
                </span>
              ) : null}
            </button>
            <ZoomButton label={`Read ${cardName(entry.cardId)}`} onZoom={() => zoomCard(entry.cardId)} />
          </div>
        );
      })}
    </div>
  );
}

// The Runes skill graphic shown on the track scales with the player's cap:
// no rune building (cap 1) -> Basic, Sieidi (cap 2) -> Advanced, Altar (cap 3)
// -> Expert (heroes.thelazy.net Runes art, fetched by fetch-bulwark-art.py).
const RUNE_SKILL_ICONS = [
  "/assets/runes-basic.webp",
  "/assets/runes-advanced.webp",
  "/assets/runes-expert.webp"
] as const;

function runeLevelHint(status: string, bonusLabel: string, threshold: number, level: number): string {
  const base = `Rune Level ${level} (${threshold} Runes): ${bonusLabel}`;
  if (status === "active") return `${base} — active`;
  if (status === "pending") return `${base} — earn ${threshold} Runes to activate`;
  return `${base} — locked (build the Sieidi/Altar)`;
}

/**
 * Bulwark's Rune track for the combat HUD. Renders only for a Bulwark player in
 * combat; everything it shows comes from the tested engine `getRuneTrack`. The
 * compact form (opponent seats) shows the icon, count/level and three status
 * pips; the full form (your dock) adds the labelled level chips.
 */
export function RuneTrack({
  state,
  playerId,
  compact
}: {
  state: GameState;
  playerId: PlayerId;
  compact?: boolean;
}) {
  if (!state.combat || !isBulwarkPlayer(state, playerId)) {
    return null;
  }
  const track = getRuneTrack(state, playerId);
  const icon = RUNE_SKILL_ICONS[Math.min(RUNE_SKILL_ICONS.length - 1, Math.max(0, track.levelCap - 1))];

  return (
    <div
      className={`runeTrack${compact ? " compact" : ""}`}
      aria-label={`Runes for ${state.players[playerId]?.name ?? playerId}: ${track.count} of ${track.max}, Level ${track.level} of ${track.levelCap}`}
    >
      <div className="runeTrackHead">
        <img className="runeSkillIcon" src={assetUrl(icon)} alt="" aria-hidden="true" loading="lazy" />
        <span className="runeTitle">Runes</span>
        <span className="runeCount">
          {track.count}
          <small>/{track.max}</small>
        </span>
        <span className="runeLevelTag" title={`Rune Level ${track.level} (cap ${track.levelCap})`}>
          Lv&nbsp;{track.level}
        </span>
      </div>
      {compact ? (
        <div className="runePips" role="presentation">
          {track.levels.map((lvl) => (
            <span
              key={lvl.level}
              className={`runePip ${lvl.status}`}
              title={runeLevelHint(lvl.status, lvl.bonusLabel, lvl.threshold, lvl.level)}
            />
          ))}
        </div>
      ) : (
        <div className="runeLevels">
          {track.levels.map((lvl) => (
            <div
              key={lvl.level}
              className={`runeLevel ${lvl.status}`}
              title={runeLevelHint(lvl.status, lvl.bonusLabel, lvl.threshold, lvl.level)}
            >
              <span className="runeLevelThreshold">{lvl.threshold}</span>
              <span className="runeLevelBonus">{lvl.bonusLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OpponentBar({
  view,
  state,
  viewerPlayerId
}: {
  view: PlayerVisibleState;
  state: GameState;
  viewerPlayerId: PlayerId;
}) {
  const opponents = state.turnOrder.filter((playerId) => playerId !== viewerPlayerId);

  return (
    <div className="opponentBar">
      {opponents.map((playerId) => {
        const player = view.players[playerId];
        if (!player) {
          return null;
        }
        const spellLimit = 1 + player.combatStats.spellLimitBonusThisRound;
        const spellLimitLabel = playerSpellCastsIgnoreLimit(state, playerId) ? "∞" : String(spellLimit);
        const crownsLeft = player.limits.expertUses - player.combatStats.expertUsesSpentThisRound;

        return (
          <section className="opponentSeat" key={playerId} aria-label={`${player.name} seat`}>
            <div className="seatBadge">
              <strong>{player.name}</strong>
              <span className="seatMetrics">
                <span title="Crowns left this combat round">
                  <Crown aria-hidden="true" size={12} /> {crownsLeft}
                </span>
                <span title="Spells cast / limit">
                  <Sparkles aria-hidden="true" size={12} /> {player.combatStats.spellsCastThisRound}/{spellLimitLabel}
                </span>
              </span>
              <RuneTrack state={state} playerId={playerId} compact />
            </div>
            <div
              className="opponentHand"
              aria-label={`${player.name} hand: ${player.handCount} hidden cards`}
              data-fx-anchor={`hand:${playerId}`}
            >
              {Array.from({ length: Math.min(player.handCount, 12) }, (_, index) => (
                <CardBack className="opponentCardBack" key={index} />
              ))}
              <span className="handCount">{player.handCount}</span>
            </div>
            <div className="seatPiles">
              <div className="pileSpot" title={`${player.name} draw deck`} data-fx-anchor={`deck:${playerId}`}>
                <CardBack className="pileCard" />
                <span>{player.deckCount}</span>
              </div>
              <div className="pileSpot" title={`${player.name} discard pile`} data-fx-anchor={`discard:${playerId}`}>
                {player.discard.length > 0 ? (
                  <CardFrame
                    cardId={player.discard.at(-1)}
                    className="pileCard faceUp"
                    empowered={cardIsEmpoweredFor(player.discard.at(-1), player.empoweredAbilities)}
                  />
                ) : (
                  <div className="pileCard emptyPile" />
                )}
                <span>{player.discard.length}</span>
              </div>
            </div>
            <PermanentSlot compact playerId={playerId} state={state} />
          </section>
        );
      })}
    </div>
  );
}

export function PlayerDock({
  state,
  view,
  viewerPlayerId
}: {
  state: GameState;
  view: PlayerVisibleState;
  viewerPlayerId: PlayerId;
}) {
  const player = view.players[viewerPlayerId];
  if (!player) {
    return null;
  }

  const spellLimit = 1 + player.combatStats.spellLimitBonusThisRound;
  const spellLimitLabel = playerSpellCastsIgnoreLimit(state, viewerPlayerId) ? "∞" : String(spellLimit);
  const crownsLeft = player.limits.expertUses - player.combatStats.expertUsesSpentThisRound;

  return (
    <div className="playerDock" aria-label="Your decks and resources">
      <div
        className="pileSpot tall"
        title="Your draw deck (order hidden, reshuffles from discard)"
        data-fx-anchor={`deck:${viewerPlayerId}`}
      >
        <CardBack className="pileCard" />
        <span>{player.deckCount}</span>
        <small>deck</small>
      </div>
      <div className="pileSpot tall" title="Your discard pile" data-fx-anchor={`discard:${viewerPlayerId}`}>
        {player.discard.length > 0 ? (
          <CardFrame
            cardId={player.discard.at(-1)}
            className="pileCard faceUp"
            empowered={cardIsEmpoweredFor(player.discard.at(-1), player.empoweredAbilities)}
          />
        ) : (
          <div className="pileCard emptyPile" />
        )}
        <span>{player.discard.length}</span>
        <small>discard</small>
      </div>
      <div className="dockMetrics">
        <strong>{player.name}</strong>
        <span title="Crowns left this combat round">
          <Crown aria-hidden="true" size={13} /> {crownsLeft} crown{crownsLeft === 1 ? "" : "s"}
        </span>
        <span title="Spells cast this combat round">
          <Sparkles aria-hidden="true" size={13} /> {player.combatStats.spellsCastThisRound}/{spellLimitLabel} spells
        </span>
        <span title="Gold / materials / valuables">
          {player.resources.gold}g · {player.resources.buildingMaterials}m · {player.resources.valuables}v
        </span>
      </div>
      <RuneTrack state={state} playerId={viewerPlayerId} />
    </div>
  );
}

const SHARED_DECK_LABELS: Record<SharedDeckId, string> = {
  spells: "Spells",
  "spells-expert": "Expert Spells",
  abilities: "Abilities",
  artifacts: "Artifacts",
  "artifacts-minor": "Minor Artifacts",
  "artifacts-major": "Major Artifacts",
  "artifacts-relic": "Relic Artifacts"
};

export function DeckWells({
  view,
  legalActions,
  onAction
}: {
  view: PlayerVisibleState;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const searchActions = new Map<string, GameAction>();
  for (const legal of legalActions) {
    if (legal.action.type === "SEARCH_DECK") {
      searchActions.set(legal.action.deckId, legal.action);
    }
  }

  return (
    <div className="deckWells" aria-label="Shared decks">
      {(Object.keys(SHARED_DECK_LABELS) as SharedDeckId[]).map((deckId) => {
        const deck = view.decks[deckId];
        if (!deck) {
          return null;
        }
        const searchAction = searchActions.get(deckId);

        return (
          <section className="deckWell" key={deckId} aria-label={`${SHARED_DECK_LABELS[deckId]} deck`}>
            <header>
              <Layers aria-hidden="true" size={13} />
              <span>{SHARED_DECK_LABELS[deckId]}</span>
            </header>
            <div className="wellPiles">
              <div
                className="pileSpot"
                title={`${SHARED_DECK_LABELS[deckId]} draw pile`}
                data-fx-anchor={`deck:shared-${deckId}`}
              >
                <CardBack className="pileCard" deckId={deckId} />
                <span>{deck.drawCount}</span>
              </div>
              <div
                className="pileSpot"
                title={`${SHARED_DECK_LABELS[deckId]} discard (top shown)`}
                data-fx-anchor={`discard:shared-${deckId}`}
              >
                {deck.discardPile.length > 0 ? (
                  <CardFrame cardId={deck.discardPile.at(-1)} className="pileCard faceUp" />
                ) : (
                  <div className="pileCard emptyPile" />
                )}
                <span>{deck.discardPile.length}</span>
              </div>
            </div>
            {searchAction ? (
              <button className="wellSearch" onClick={() => onAction(searchAction)} type="button">
                <Search aria-hidden="true" size={13} />
                <span>Search 2</span>
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
