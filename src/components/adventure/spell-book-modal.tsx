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

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Sparkles, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { playSpellBookPageTurn } from "@/lib/sound";
import { cardLibrary } from "@/data/cards/library";
import { describeCardEffect, type LegalAction } from "@/engine";
import { actionKey, titleCase } from "@/components/table/utils";

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

function spellBookArtFor(cardId: string): string | undefined {
  return SPELL_BOOK_ART[cardId] ?? cardLibrary[cardId]?.assets?.cardImage;
}

/** Best human rules text for a card id: its printed prose tag, else the auto effect. */
function spellRulesText(cardId: string | undefined): string {
  if (!cardId) {
    return "";
  }
  const card = cardLibrary[cardId];
  if (!card) {
    return "";
  }
  const prose = (card.tags ?? []).filter((tag) => /\s/.test(tag)).sort((a, b) => b.length - a.length)[0];
  return prose ?? describeCardEffect(card);
}

export function SpellBookModal({
  cardIds,
  castsByCard,
  onCast,
  onClose,
  subtitle,
  emptyHint,
  castLabel
}: {
  /** The stored Spell ids, in Book order. */
  cardIds: string[];
  /** Cast actions available right now for each stored Spell id (from the Book).
      Read-only so a `Map<string, PlayLegal[]>` widens in cleanly. */
  castsByCard: ReadonlyMap<string, readonly LegalAction[]>;
  /** Start a cast (the caller stages/arms it, then may close the Book). */
  onCast: (legal: LegalAction) => void;
  onClose: () => void;
  /** Left-page blurb override (the combat Book explains combat timing). */
  subtitle?: string;
  /** Why the selected Spell has no cast right now, in the caller's terms. */
  emptyHint?: (cardId: string) => string;
  /** Cast-button label override (combat appends the concrete target). */
  castLabel?: (legal: LegalAction) => string;
}) {
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
  const index = Math.min(selected, Math.max(0, cardIds.length - 1));
  const activeId = cardIds[index];
  const card = activeId ? cardLibrary[activeId] : undefined;
  const art = activeId ? spellBookArtFor(activeId) : undefined;
  const casts = activeId ? castsByCard.get(activeId) ?? [] : [];
  const schools = card?.spellSchools ?? [];
  const accent = SPELL_SCHOOL_COLORS[schools[0] ?? ""] ?? "var(--gold)";

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
            {subtitle ??
              "Spells set aside for later. Cast one on your turn or in combat (the normal Spell limit still applies), or stash more from your hand with a card's 📖 button."}
          </p>
          {cardIds.length === 0 ? (
            <p className="spellBookEmpty">
              The pages are blank. Stash a hand Spell with its 📖 button to inscribe it here.
            </p>
          ) : (
            <ul className="spellBookIndex">
              {cardIds.map((id, itemIndex) => {
                const entry = cardLibrary[id];
                const school = entry?.spellSchools?.[0];
                return (
                  <li key={`${id}-${itemIndex}`}>
                    <button
                      className={`spellBookIndexItem ${itemIndex === index ? "active" : ""}`}
                      onClick={() => turnTo(itemIndex)}
                      type="button"
                    >
                      <span
                        className={`spellBookIndexDot ${entry?.spellLevel ?? "basic"}`}
                        style={{ "--spell-accent": SPELL_SCHOOL_COLORS[school ?? ""] ?? "var(--gold)" } as CSSProperties}
                      />
                      <span className="spellBookIndexName">{entry?.name ?? id}</span>
                      <span className="spellBookIndexLevel">{entry?.spellLevel === "expert" ? "Expert" : "Basic"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
              </div>
              <p className="spellBookDefinition">{spellRulesText(activeId)}</p>
              <div className="spellBookActions">
                {casts.map((legal) => (
                  <button className="commandButton primary" key={actionKey(legal.action)} onClick={() => onCast(legal)} type="button">
                    {castLabel ? castLabel(legal) : legal.label}
                  </button>
                ))}
                {casts.length === 0 ? (
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
