"use client";

/* eslint-disable @next/next/no-img-element -- card scans, not content images */

// ---------------------------------------------------------------------------
// Spell Book (house rule): a real, openable grimoire. Used on the adventure
// map (opened by the tray tome) AND in combat (the hand-fan Book shelf icon),
// so both places show the same painted two-page spread — an index of the
// stored Spells on the left page and the selected Spell's illustrated plate
// (art + school/level + rules text + cast actions) on the right. Switching
// spells turns a real paper leaf (3D flip + page foley).
// ---------------------------------------------------------------------------

import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Hourglass, Map as MapIcon, Sparkles, Swords, X, Zap } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { RESOURCE_ICONS } from "@/data/assets/homm-assets";
import { playSpellBookPageTurn } from "@/lib/sound";
import { cardLibrary } from "@/data/cards/library";
import {
  spellPowerLadder,
  spellTimingKind,
  type LegalAction,
  type SpellTimingKind
} from "@/engine";
import { actionKey, titleCase } from "@/components/table/utils";
import {
  resolveCardFaceImage,
  useBalanceArtFlags,
  type BalanceArtFlags
} from "@/components/table/polish-balance-art";
import { cardZoomContent } from "@/components/table/zoom";

/**
 * Render a Mage Guild / Spell Book shortcut label ("<n> gold: …search (n)")
 * with inline glyphs: the leading gold cost becomes a number + coin, and a
 * "search (n)" clause gains a spell sparkle. Presentation only — the engine
 * label stays plain, honest text and is kept as the button's aria-label, so the
 * accessible name (and every test that queries by it) is unchanged. Mirrors the
 * label→glyph substitution in victory-points-panel.tsx.
 */
function renderSpellBookLabel(label: string): ReactNode {
  const goldMatch = /^(\d+) gold: (.*)$/.exec(label);
  if (!goldMatch) {
    return label;
  }
  const [, cost, rest] = goldMatch;
  const searchMatch = /^(.*?)(search \(\d+\))(.*)$/i.exec(rest);
  return (
    <>
      <strong>{cost}</strong>{" "}
      <img alt="" aria-hidden className="resourceIcon small" src={assetUrl(RESOURCE_ICONS.gold)} />{" "}
      {searchMatch ? (
        <>
          {searchMatch[1]}
          {searchMatch[2]}{" "}
          <Sparkles aria-hidden size={13} style={{ verticalAlign: "-2px" }} />
          {searchMatch[3]}
        </>
      ) : (
        rest
      )}
    </>
  );
}

/**
 * Timing badge art per kind, keyed to the `spellTimingKind` derivation (data,
 * not prose). Reuses existing lucide iconography already used elsewhere in the
 * table (Zap = instant, Hourglass = ongoing, Swords = combat) — no new asset
 * files. The chip's accent colour comes from `.spellBookChip.timing.<kind>` CSS.
 */
const TIMING_BADGES: Record<
  SpellTimingKind,
  { label: string; Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }> }
> = {
  instant: { label: "Instant", Icon: Zap },
  ongoing: { label: "Ongoing", Icon: Hourglass },
  combat: { label: "Combat", Icon: Swords },
  map: { label: "Map", Icon: MapIcon }
};

/**
 * Per-spell book illustration override. EMPTY today: drop a book-style plate
 * illustration at `/assets/spellbook/<id>.webp` and register it here and the
 * Book shows it on the right page instead of the small deck scan — a clear,
 * self-contained home for real (gen) art with no layout change. Falls back to
 * the card's own `assets.cardImage` when there is no override.
 */
const SPELL_BOOK_ART: Record<string, string> = {};

/** School accent colours used for the Book's chips and index dots. */
const SPELL_SCHOOL_COLORS: Record<string, string> = {
  air: "#7fd4ff",
  earth: "#9bd36a",
  fire: "#ff8a5c",
  water: "#5ca8ff"
};

function spellBookArtFor(cardId: string, balanceFlags: BalanceArtFlags): string | undefined {
  return SPELL_BOOK_ART[cardId] ?? resolveCardFaceImage(balanceFlags, cardId, false);
}

/** Best human rules text for a card id: its printed prose tag, else the auto effect. */
function spellRulesText(cardId: string | undefined, balanceFlags: BalanceArtFlags): string {
  if (!cardId) {
    return "";
  }
  const card = cardLibrary[cardId];
  if (!card) {
    return "";
  }
  return cardZoomContent(cardId, false, balanceFlags.polish, balanceFlags.community).lines[0] ?? "";
}

export function SpellBookModal({
  cardIds,
  usedCardIds = [],
  polishMode = false,
  castsByCard,
  shortcuts = [],
  onCast,
  onShortcut,
  onClose,
  subtitle,
  restrictionNotices = [],
  emptyHint,
  castLabel
}: {
  /** The stored Spell ids, in Book order. */
  cardIds: string[];
  /** Polish Book cards already cast this round (shown, but not castable). */
  usedCardIds?: string[];
  /** Use the Polish refreshed/used wording and lifecycle. */
  polishMode?: boolean;
  /** Cast actions available right now for each stored Spell id (from the Book).
      Read-only so a `Map<string, PlayLegal[]>` widens in cleanly. */
  castsByCard: ReadonlyMap<string, readonly LegalAction[]>;
  /** Mage Guild actions exposed inside the map Book: purchases plus Polish
      Rolling Spells. Combat callers omit these, so town actions never leak
      into a battle window. */
  shortcuts?: readonly LegalAction[];
  /** Start a cast (the caller stages/arms it, then may close the Book). */
  onCast: (legal: LegalAction) => void;
  /** Dispatch a Mage Guild shortcut. Required only when `shortcuts` is used. */
  onShortcut?: (legal: LegalAction) => void;
  onClose: () => void;
  /** Left-page blurb override (the combat Book explains combat timing). */
  subtitle?: string;
  /** Engine-derived reasons this player currently cannot (or must pay to) cast.
      The caller supplies them from `spellCastRestrictionNotices` — the modal
      never derives a restriction itself. */
  restrictionNotices?: readonly string[];
  /** Why the selected Spell has no cast right now, in the caller's terms. */
  emptyHint?: (cardId: string) => string;
  /** Cast-button label override (combat appends the concrete target). */
  castLabel?: (legal: LegalAction) => string;
}) {
  const balanceArt = useBalanceArtFlags();
  const [selected, setSelected] = useState(0);
  const [artFailed, setArtFailed] = useState<string | null>(null);
  // Bumped on every index change: keys the right page so the paper leaf
  // re-flips (and re-runs its animation) once per actual page turn — never on
  // the initial open (turnCount 0 = freshly opened, no `turning` class).
  const [turnCount, setTurnCount] = useState(0);

  // Esc closes the Book, matching the game's other modals.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  // Clamp to the current page count so a spell cast away from the Book never
  // leaves the plate pointing past the end.
  const allCardIds = [...new Set([...cardIds, ...usedCardIds])];
  const index = Math.min(selected, Math.max(0, allCardIds.length - 1));
  const activeId = allCardIds[index];
  const card = activeId ? cardLibrary[activeId] : undefined;
  const art = activeId ? spellBookArtFor(activeId, balanceArt) : undefined;
  const casts = activeId ? castsByCard.get(activeId) ?? [] : [];
  const purchaseShortcuts = shortcuts.filter(
    (legal) => legal.action.type === "SPELL_BOOK_ACTION" && !legal.action.rollSpell
  );
  const rollShortcuts = activeId
    ? shortcuts.filter(
        (legal) =>
          legal.action.type === "SPELL_BOOK_ACTION" && legal.action.rollSpell?.cardId === activeId
      )
    : [];
  const schools = card?.spellSchools ?? [];
  const accent = SPELL_SCHOOL_COLORS[schools[0] ?? ""] ?? "var(--gold)";
  // Data-derived timing badge + full Power ladder (read from the effect's own
  // `*ByPower` tables, never the prose `tags`), so the plate can never drift.
  const timing = card ? spellTimingKind(card) : null;
  const ladder = card ? spellPowerLadder(card) : [];

  const turnTo = (itemIndex: number) => {
    if (itemIndex === index) {
      return;
    }
    setSelected(itemIndex);
    setTurnCount((count) => count + 1);
    playSpellBookPageTurn();
  };

  return createPortal(
    <div className="spellBookBackdrop" role="dialog" aria-modal="true" aria-label="Spell Book" onMouseDown={onClose}>
      <div
        className="spellBookBook"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ "--spell-accent": accent } as CSSProperties}
      >
        <button aria-label="Close the Spell Book" className="spellBookBookClose" onClick={onClose} type="button">
          <X aria-hidden="true" size={16} />
        </button>

        {/* LEFT PAGE — the index of stored Spells */}
        <div className="spellBookPage left">
          <div className="spellBookPlateHeader">
            <BookOpen aria-hidden="true" size={18} />
            <strong>Spell Book</strong>
          </div>
          <p className="spellBookBlurb">
            {polishMode
              ? "Play Cast a Spell from your hand, then choose one refreshed Spell. It becomes used until the next round; Book Spells cannot pay Power."
              : subtitle ??
              "Spells set aside for later. Cast one on your turn or in combat (the normal Spell limit still applies), or stash more from your hand with a card's 📖 button."}
          </p>
          {restrictionNotices.length > 0 ? (
            <div aria-label="Spell restrictions" className="dockSpellNotices">
              {restrictionNotices.map((text) => (
                <div className="drawWarning" key={text}>
                  ⚠ {text}
                </div>
              ))}
            </div>
          ) : null}
          {allCardIds.length === 0 ? (
            <p className="spellBookEmpty">
              The pages are blank. Stash a hand Spell with its 📖 button to inscribe it here.
            </p>
          ) : (
            <ul className="spellBookIndex">
              {allCardIds.map((id, itemIndex) => {
                const entry = cardLibrary[id];
                const school = entry?.spellSchools?.[0];
                const readyCount = cardIds.filter((candidate) => candidate === id).length;
                const usedCount = usedCardIds.filter((candidate) => candidate === id).length;
                return (
                  <li key={`${id}-${itemIndex}`}>
                    <button
                      className={`spellBookIndexItem ${itemIndex === index ? "active" : ""} ${readyCount === 0 ? "used" : ""}`}
                      onClick={() => turnTo(itemIndex)}
                      type="button"
                    >
                      <span
                        className={`spellBookIndexDot ${entry?.spellLevel ?? "basic"}`}
                        style={{ "--spell-accent": SPELL_SCHOOL_COLORS[school ?? ""] ?? "var(--gold)" } as CSSProperties}
                      />
                      <span className="spellBookIndexName">{entry?.name ?? id}</span>
                      <span className="spellBookIndexLevel">
                        {readyCount > 0 ? `Ready${readyCount > 1 ? ` ×${readyCount}` : ""}` : "Used"}
                        {usedCount > 0 && readyCount > 0 ? ` · Used ×${usedCount}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {purchaseShortcuts.length > 0 && onShortcut ? (
            <div className="spellBookShortcuts" aria-label="Mage Guild spell shortcuts">
              <strong>Mage Guild</strong>
              {purchaseShortcuts.map((legal) => (
                <button
                  aria-label={legal.label}
                  className="commandButton"
                  key={actionKey(legal.action)}
                  onClick={() => onShortcut(legal)}
                  type="button"
                >
                  {renderSpellBookLabel(legal.label)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="spellBookSpine" aria-hidden="true" />

        {/* RIGHT PAGE — the selected Spell's illustrated plate. Keyed by the
            turn count so every index change re-mounts the page: the paper leaf
            flips over the fresh plate like a real page turn. */}
        <div
          className={`spellBookPage right ${turnCount > 0 ? "turning" : ""}`}
          key={`${activeId ?? "empty"}-${turnCount}`}
        >
          {/* The turning paper leaf (covers the page, flips away to the spine). */}
          <span aria-hidden="true" className="spellBookTurnLeaf" />
          {card ? (
            <>
              <div className="spellBookArtSlot" data-spell-id={activeId}>
                {art && artFailed !== art ? (
                  <img
                    alt={card.name}
                    className="spellBookArt"
                    draggable={false}
                    onError={() => setArtFailed(art ?? null)}
                    referrerPolicy="no-referrer"
                    src={assetUrl(art)}
                  />
                ) : (
                  <div className="spellBookArtFallback">
                    <Sparkles aria-hidden="true" size={26} />
                    <span>{card.name}</span>
                  </div>
                )}
                <span aria-hidden="true" className="spellBookArtFrame" />
              </div>
              <h3 className="spellBookSpellTitle">{card.name}</h3>
              <div className="spellBookChips">
                {timing ? (
                  <span className={`spellBookChip timing ${timing}`}>
                    {(() => {
                      const { Icon } = TIMING_BADGES[timing];
                      return <Icon aria-hidden size={11} />;
                    })()}
                    {TIMING_BADGES[timing].label}
                  </span>
                ) : null}
                <span className={`spellBookChip level ${card.spellLevel ?? "basic"}`}>
                  {card.spellLevel === "expert" ? "Expert" : "Basic"} spell
                </span>
                {schools.map((school) => (
                  <span
                    className="spellBookChip school"
                    key={school}
                    style={{ "--spell-accent": SPELL_SCHOOL_COLORS[school] ?? "var(--gold)" } as CSSProperties}
                  >
                    {titleCase(school)}
                  </span>
                ))}
                {typeof card.power === "number" ? <span className="spellBookChip power">Power {card.power}</span> : null}
                {activeId && usedCardIds.includes(activeId) ? (
                  <span className={`spellBookChip ${cardIds.includes(activeId) ? "ready" : "used"}`}>
                    {cardIds.includes(activeId) ? "Refreshed copy available" : "Used until next round"}
                  </span>
                ) : null}
              </div>
              <p className="spellBookDefinition">{spellRulesText(activeId, balanceArt)}</p>
              {ladder.length > 0 ? (
                <div className="spellBookLadder">
                  <span className="spellBookLadderTitle">
                    <Sparkles aria-hidden size={12} /> Power ladder
                  </span>
                  <ul className="spellBookLadderRows">
                    {ladder.map((row) => (
                      <li className="spellBookLadderRow" key={row.power}>
                        <span className="spellBookLadderPower">Power {row.power}</span>
                        <span className="spellBookLadderText">{row.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="spellBookActions">
                {casts.map((legal) => (
                  <button className="commandButton primary" key={actionKey(legal.action)} onClick={() => onCast(legal)} type="button">
                    {castLabel ? castLabel(legal) : legal.label}
                  </button>
                ))}
                {rollShortcuts.length > 0 && onShortcut ? (
                  <div className="spellBookRollShortcuts" aria-label={`Rolling Spells shortcuts for ${card.name}`}>
                    {rollShortcuts.map((legal) => (
                      <button
                        aria-label={legal.label}
                        className="commandButton spellBookRollButton"
                        key={actionKey(legal.action)}
                        onClick={() => onShortcut(legal)}
                        type="button"
                      >
                        {renderSpellBookLabel(legal.label)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {casts.length === 0 && rollShortcuts.length === 0 ? (
                  <small className="spellBookNote">
                    {emptyHint
                      ? emptyHint(activeId ?? "")
                      : "Castable in combat — or as a Map Spell on your turn, when the normal Spell limit allows."}
                  </small>
                ) : null}
              </div>
            </>
          ) : (
            <div className="spellBookEmptyPage">
              <BookOpen aria-hidden="true" size={40} />
              <p>No spell selected.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
