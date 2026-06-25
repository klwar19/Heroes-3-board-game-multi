"use client";

/* eslint-disable @next/next/no-img-element */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { assetUrl } from "@/lib/asset-url";
import { X, ZoomIn } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import { describeCardEffect, getUnitAbilityDefinitions, type CombatUnitState } from "@/engine";
import { getCardMetaLabels, titleCase } from "./utils";
import { SpecialtyCard } from "@/components/specialty-card";
import { canRenderSpecialtyCard } from "@/components/specialty-card-data";

/** Anything the table can blow up to readable size: a card id or a unit card. */
export type ZoomContent = {
  title: string;
  image?: string;
  /** Art-less specialty: render the native SpecialtyCard instead of an image. */
  specialtyCardId?: string;
  subtitle?: string;
  lines: string[];
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
    lines
  };
}

export function unitZoomContent(unit: CombatUnitState): ZoomContent {
  const health = Math.max(0, unit.maxHealth - unit.damage);
  const abilities = getUnitAbilityDefinitions(unit);

  return {
    title: unit.cardName,
    image: unit.assets?.cardImage,
    subtitle: `${titleCase(unit.grade)} ${unit.type} · initiative ${unit.initiative}`,
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
            {content.specialtyCardId ? (
              <div className="zoomNativeCard">
                <SpecialtyCard cardId={content.specialtyCardId} />
              </div>
            ) : content.image && failedImageSrc !== content.image ? (
              <img
                alt={content.title}
                className="zoomCardImage"
                loading="eager"
                onError={() => setFailedImageSrc(content.image ?? null)}
                referrerPolicy="no-referrer"
                src={assetUrl(content.image)}
              />
            ) : (
              <div className="zoomCardImage cardFaceFallback">{content.title}</div>
            )}
            <div className="zoomCardBody">
              <strong>{content.title}</strong>
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
