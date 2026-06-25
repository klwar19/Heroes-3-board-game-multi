"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { CSSProperties } from "react";

import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";
import {
  FACTION_ACCENT,
  LEVEL_STYLE,
  SPECIALTY_ICON_BY_HERO,
  parseSpecialtyCardId,
  specialtyEffectText
} from "./specialty-card-data";

// ---------------------------------------------------------------------------
// Native hero-specialty card renderer (the FRAME, title, level badge and effect
// TEXT). A port of the HoMM3 Hero Creator's HeroCard (github.com/k-adam/
// Homm3_hero_creator, MIT © 2025 Adam Kecskes; see public/credits/). Only the
// central specialty PICTURE is an image, shown transparently (object-fit:
// contain) over the leather panel; a missing symbol just shows no icon (frame +
// text still draw). Pure helpers/data live in ./specialty-card-data so server
// components can use them. Only art-less heroes need this.
// ---------------------------------------------------------------------------

/**
 * One native specialty card (I / IV / VI). Self-scaling: it is its own size
 * container, so every internal dimension is in `cqw` and the card fits whatever
 * width its parent gives it.
 */
export function SpecialtyCard({ cardId, className }: { cardId: string; className?: string }) {
  const [iconFailed, setIconFailed] = useState(false);

  const parsed = parseSpecialtyCardId(cardId);
  const hero = parsed ? coreHeroDefinitions[parsed.slug] : undefined;
  const card = cardLibrary[cardId];
  if (!parsed || !hero || !card) {
    return null;
  }

  const level = LEVEL_STYLE[parsed.level];
  const iconSrc = SPECIALTY_ICON_BY_HERO[parsed.slug];
  const accent = FACTION_ACCENT[hero.faction] ?? "#3a3a3a";

  const style = {
    "--sc-border": `url("${assetUrl(`/assets/specialty-card/${level.border}.webp`)}")`,
    "--sc-leather": `url("${assetUrl("/assets/specialty-card/leather.webp")}")`,
    "--sc-accent": accent
  } as CSSProperties;

  return (
    <div className={`scWrap${className ? ` ${className}` : ""}`} data-level={parsed.level} style={style}>
      <div className="sc">
        <div className="scContent">
          {/* The icon box always holds its space, so the title + text sit BELOW
              the picture even before a unit's symbol has been generated. */}
          <div className="scIconBox">
            {iconSrc && !iconFailed ? (
              <img alt="" className="scIcon" onError={() => setIconFailed(true)} src={assetUrl(iconSrc)} />
            ) : null}
          </div>
          <h3 className="scName">{card.name}</h3>
          <p className="scDesc">{specialtyEffectText(cardId)}</p>
        </div>
        <div
          className="scPortrait"
          style={hero.portrait ? { backgroundImage: `url("${assetUrl(hero.portrait)}")` } : undefined}
        />
        <div className="scLevel">
          <span className="scLevelBadge">{level.numeral}</span>
        </div>
      </div>
    </div>
  );
}
