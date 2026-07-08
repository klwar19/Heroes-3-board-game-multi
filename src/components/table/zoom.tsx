"use client";

/* eslint-disable @next/next/no-img-element */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { assetUrl } from "@/lib/asset-url";
import { Sparkles, X, ZoomIn } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import { describeCardEffect, getUnitAbilityDefinitions, type CombatUnitState } from "@/engine";
import { getCardMetaLabels, isEmpoweredStatisticCard, titleCase } from "./utils";
import { SpecialtyCard } from "@/components/specialty-card";
import { canRenderSpecialtyCard } from "@/components/specialty-card-data";
import { CommanderCardFace } from "@/components/commander-card";
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
  zoomUnit: (unit: CombatUnitState) => void;
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

export function unitZoomContent(unit: CombatUnitState): ZoomContent {
  const health = Math.max(0, unit.maxHealth - unit.damage);
  const abilities = getUnitAbilityDefinitions(unit);

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
      ...abilities.map(
        (ability) =>
          `${ability.name}: ${ability.text}${ability.implementationStatus === "implemented" ? "" : " (manual rule)"}`
      )
    ]
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
      zoomUnit: (unit) => setContent(unitZoomContent(unit)),
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
              {content.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
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
