"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { CSSProperties } from "react";

import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";
import {
  FACTION_ACCENT,
  FACTION_LEVEL_ART,
  LEVEL_STYLE,
  SPECIALTY_ICON_BY_HERO,
  parseSpecialtyCardId,
  specialtyEffectText,
  specialtyFaceLines
} from "./specialty-card-data";
import { CARD_GLYPH_PATHS } from "./card-glyph-paths";
import type { CardGlyphName } from "./card-glyph-paths";

/** One real printed-card glyph, inline at text size (currentColor + its own fixed fills). */
function CardGlyph({ name }: { name: CardGlyphName }) {
  const glyph = CARD_GLYPH_PATHS[name];
  return (
    <svg aria-label={name.replace("_points", "")} className={`scGlyph scGlyph-${name}`} role="img" viewBox={glyph.viewBox}>
      {glyph.paths.map((path, index) => (
        <path d={path.d} fill={path.fill ?? "currentColor"} key={index} />
      ))}
    </svg>
  );
}

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
  const faceLines = specialtyFaceLines(cardId);
  const iconSrc = SPECIALTY_ICON_BY_HERO[parsed.slug];
  const accent = FACTION_ACCENT[hero.faction] ?? "#3a3a3a";
  // The printed cards paint the level panel with a faction picture (Castle's
  // blue griffin); a faction that has one draws it behind the medallion.
  const levelArt = FACTION_LEVEL_ART[hero.faction];

  const style = {
    "--sc-border": `url("${assetUrl(`/assets/specialty-card/${level.border}.webp`)}")`,
    "--sc-leather": `url("${assetUrl("/assets/specialty-card/leather.webp")}")`,
    "--sc-accent": accent,
    ...(levelArt ? { "--sc-level-art": `url("${assetUrl(levelArt)}")` } : {})
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
          {faceLines ? (
            <div className="scDesc scFace">
              {faceLines.map((line, index) =>
                line.kind === "gap" ? (
                  <span className="scFaceGap" key={index} />
                ) : line.kind === "or" ? (
                  <span className="scFaceOr" key={index}>OR</span>
                ) : (
                  <p className="scFaceLine" key={index}>
                    {line.tokens.map((token, tokenIndex) =>
                      token.kind === "glyph" ? (
                        <CardGlyph key={tokenIndex} name={token.glyph} />
                      ) : (
                        <span key={tokenIndex}>{token.text}</span>
                      )
                    )}
                  </p>
                )
              )}
            </div>
          ) : (
            <p className="scDesc">{specialtyEffectText(cardId)}</p>
          )}
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
