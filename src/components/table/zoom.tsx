"use client";

/* eslint-disable @next/next/no-img-element */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { assetUrl } from "@/lib/asset-url";
import { Sparkles, X, ZoomIn } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import {
  describeCardEffect,
  getUnitAbilityDefinitions,
  unitFlipSidePreview,
  type CombatUnitState,
  type GameRuleset
} from "@/engine";
import { UNIT_RANK_NAMES } from "@/data/units/experience";
import { getCardMetaLabels, isEmpoweredStatisticCard, titleCase } from "./utils";
import { SpecialtyCard } from "@/components/specialty-card";
import { canRenderSpecialtyCard } from "@/components/specialty-card-data";
import { CommanderCardFace, CommanderStatsPanel } from "@/components/commander-card";
import type { CommanderSlug, CommanderStatKey } from "@/data/commanders";

/** Anything the table can blow up to readable size: a card id or a unit card. */
export type ZoomContent = {
  title: string;
  image?: string;
  /** Art-less specialty: render the native SpecialtyCard instead of an image. */
  specialtyCardId?: string;
  /**
   * WOG commander unit: render the DYNAMIC card face (real stat numbers and
   * the unlocked combination skills) instead of the static frame image.
   */
  commanderFace?: {
    slug: CommanderSlug;
    grades: Partial<Record<CommanderStatKey, number>>;
    statValues: { attack: number; defense: number; health: number; speed: number };
    dead?: boolean;
  };
  subtitle?: string;
  lines: string[];
  /** Empowered card (Empowered Statistic / an Empowered ability) — show the cue. */
  empowered?: boolean;
};

type CardZoomContextValue = {
  zoomCard: (cardId: string) => void;
  zoomUnit: (unit: CombatUnitState, ruleset?: GameRuleset) => void;
  zoomContent: (content: ZoomContent) => void;
};

const CardZoomContext = createContext<CardZoomContextValue | null>(null);

export function useCardZoom(): CardZoomContextValue {
  const value = useContext(CardZoomContext);
  if (!value) {
    throw new Error("useCardZoom must be used inside CardZoomProvider.");
  }

  return value;
}

/**
 * Like useCardZoom but returns null instead of throwing when there is no
 * provider, so a component (e.g. the town recruit rows) can offer click-to-zoom
 * where a provider exists and degrade to a plain, non-zoomable view where it is
 * rendered in isolation (unit tests, embeds).
 */
export function useOptionalCardZoom(): CardZoomContextValue | null {
  return useContext(CardZoomContext);
}

export function cardZoomContent(cardId: string): ZoomContent {
  const card = cardLibrary[cardId];
  if (!card) {
    return { title: cardId, lines: [] };
  }

  const lines: string[] = [describeCardEffect(card)];
  const note = card.tags.find((tag) => tag.includes(" "));
  if (card.implementationStatus === "not-implemented" && note) {
    lines.push(`Printed text: ${note}`);
  }

  return {
    title: card.name,
    image: card.assets?.cardImage,
    specialtyCardId: !card.assets?.cardImage && canRenderSpecialtyCard(cardId) ? cardId : undefined,
    subtitle: getCardMetaLabels(card).join(" · "),
    lines,
    empowered: isEmpoweredStatisticCard(cardId)
  };
}

export function unitZoomContent(unit: CombatUnitState, ruleset: GameRuleset = "legacy"): ZoomContent {
  const health = Math.max(0, unit.maxHealth - unit.damage);
  const abilities = getUnitAbilityDefinitions(unit);
  // A Pack card's other side: lethal damage flips it to its Few side. Shown as a
  // plain line so a player can read what the card becomes before committing.
  // (The zoom is a pure card view with no GameState, so the mode defaults come
  // from `ruleset` — the caller passes the table's.)
  const flip = unitFlipSidePreview(unit, ruleset);

  return {
    title: unit.cardName,
    image: unit.assets?.cardImage,
    commanderFace:
      unit.commanderSlug && unit.commanderGrades
        ? {
            slug: unit.commanderSlug as CommanderSlug,
            grades: unit.commanderGrades,
            statValues: { attack: unit.attack, defense: unit.defense, health: unit.maxHealth, speed: unit.initiative },
            dead: unit.damage >= unit.maxHealth
          }
        : undefined,
    subtitle: unit.commanderSlug
      ? `commander (tierless) ${unit.type} · initiative ${unit.initiative}`
      : `${titleCase(unit.grade)} ${unit.type} · initiative ${unit.initiative}`,
    lines: [
      `Attack ${unit.attack} · Defense ${unit.defense}${unit.defenseToken ? " (defending: rolls +1 for +1 Defense)" : ""} · HP ${health}/${unit.maxHealth}`,
      flip
        ? `Lethal damage flips this card to its ${flip.cardName} side: Attack ${flip.attack} · Defense ${flip.defense} · HP ${flip.health} · initiative ${flip.initiative}${
            flip.type !== unit.type ? ` (fights as a ${flip.type} unit)` : ""
          }.`
        : "",
      (unit.unitRank ?? 0) > 0
        ? `Veteran rank ${unit.unitRank} (${UNIT_RANK_NAMES[unit.unitRank ?? 0] ?? ""}) — ${
            unit.unitExperience ?? 0
          } XP; rank bonuses are folded into the stats above.`
        : "",
      ...abilities.map(
        (ability) =>
          `${ability.name}: ${ability.text}${ability.implementationStatus === "implemented" ? "" : " (manual rule)"}`
      )
    ].filter(Boolean)
  };
}

/**
 * Table-wide card magnifier: any component can call useCardZoom() to open a
 * readable, full-size view of a card or unit. Click anywhere (or Escape) to
 * put the card back down.
 */
export function CardZoomProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ZoomContent | null>(null);
  // Fall back to the text frame if a card's scan is missing (e.g. Moandor's
  // specialties); keyed by src so each newly zoomed card tries its own art.
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  const value = useMemo<CardZoomContextValue>(
    () => ({
      zoomCard: (cardId) => setContent(cardZoomContent(cardId)),
      zoomUnit: (unit, ruleset) => setContent(unitZoomContent(unit, ruleset)),
      zoomContent: (next) => setContent(next)
    }),
    []
  );

  const close = useCallback(() => setContent(null), []);

  useEffect(() => {
    if (!content) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content, close]);

  return (
    <CardZoomContext.Provider value={value}>
      {children}
      {content ? (
        <div aria-label={`${content.title} enlarged`} className="zoomBackdrop" onClick={close} role="dialog">
          <div className="zoomCardStage">
            {content.commanderFace ? (
              <div className="zoomCardImage" style={{ background: "transparent", boxShadow: "none" }}>
                <CommanderCardFace
                  slug={content.commanderFace.slug}
                  grades={content.commanderFace.grades}
                  statValues={content.commanderFace.statValues}
                  dead={content.commanderFace.dead}
                />
              </div>
            ) : content.specialtyCardId ? (
              <div className="zoomNativeCard">
                <SpecialtyCard cardId={content.specialtyCardId} />
              </div>
            ) : content.image && failedImageSrc !== content.image ? (
              <img
                alt={content.empowered ? `${content.title} (empowered)` : content.title}
                className={`zoomCardImage${content.empowered ? " empoweredCard" : ""}`}
                decoding="async"
                loading="eager"
                onError={() => setFailedImageSrc(content.image ?? null)}
                referrerPolicy="no-referrer"
                src={assetUrl(content.image)}
              />
            ) : (
              <div className={`zoomCardImage cardFaceFallback${content.empowered ? " empoweredCard" : ""}`}>
                {content.title}
              </div>
            )}
            <div className="zoomCardBody">
              <strong>{content.title}</strong>
              {content.empowered ? (
                <span className="empoweredBadge zoomEmpoweredBadge">
                  <Sparkles aria-hidden="true" size={11} /> Empowered
                </span>
              ) : null}
              {content.subtitle ? <span className="zoomMeta">{content.subtitle}</span> : null}
              {content.commanderFace ? (
                // WOG commander: the pro stats view (authentic comm3 symbols,
                // grade bonuses, Damage dice, the Power ladder, and every
                // combination skill explained) instead of the plain stat lines.
                <CommanderStatsPanel
                  slug={content.commanderFace.slug}
                  grades={content.commanderFace.grades}
                  statValues={content.commanderFace.statValues}
                  style={{ maxWidth: "100%", marginTop: 4 }}
                />
              ) : (
                content.lines.map((line) => <p key={line}>{line}</p>)
              )}
              <button onClick={close} type="button">
                <X aria-hidden="true" size={14} />
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CardZoomContext.Provider>
  );
}

/** Small magnifier affordance for card tiles and lists. */
export function ZoomButton({ onZoom, label }: { onZoom: () => void; label?: string }) {
  return (
    <button
      aria-label={label ?? "Read card"}
      className="zoomButton"
      onClick={(event) => {
        event.stopPropagation();
        onZoom();
      }}
      title={label ?? "Read card"}
      type="button"
    >
      <ZoomIn aria-hidden="true" size={13} />
    </button>
  );
}
