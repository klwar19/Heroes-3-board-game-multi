/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";

// ---------------------------------------------------------------------------
// Native hero-specialty card renderer.
//
// A faithful port of the HoMM3 Hero Creator's specialty card
// (github.com/k-adam/Homm3_hero_creator, MIT © 2025 Adam Kecskes — see
// public/credits/Homm3_hero_creator_LICENSE.txt). Its `HeroCard` renders ONE
// specialty card per level (I/IV/VI); this reimplements that layout/CSS from OUR
// data so specialty cards draw live in-app — no Gemini, no browser screenshots,
// always in sync. The frame textures are vendored under
// /assets/specialty-card/. Effect text is our own prose (no spell-DSL parser),
// and the specialty "picture" is cropped from our existing unit/spell/ability
// art (or the Bulwark rune emblem) by the slot's object-fit window.
//
// Only heroes whose specialty cards have NO baked `cardImage` need this (the
// art-less Bulwark/Conflux roster); everyone else keeps their scanned card.
// ---------------------------------------------------------------------------

/** The specialty "picture" for each art-less hero, plus how to crop it. */
type IconSpec = { src: string; fit?: "cover" | "contain"; position?: string };

const SPECIALTY_ICON_BY_HERO: Record<string, IconSpec> = {
  // Unit specialists → crop the creature from the unit card's top-centre art.
  dhuin: { src: "/assets/units-bulwark-bronze-snow_elves-few.webp", position: "center 22%" },
  creyle: { src: "/assets/units-bulwark-golden-mammoths-few.webp", position: "center 22%" },
  eikthurn: { src: "/assets/units-bulwark-silver-yetis-few.webp", position: "center 22%" },
  // Spell / ability specialists → the spell / ability art.
  glacius: { src: "/assets/spells-frost_ring.webp", position: "center 24%" },
  oidana: { src: "/assets/abilities-diplomacy.webp", position: "center 24%" },
  luna: { src: "/assets/spells-fire_wall.webp", position: "center 24%" },
  ciele: { src: "/assets/spells-magic_arrow.webp", position: "center 24%" },
  // Rune specialist → the dedicated emblem (already icon-shaped, transparent).
  kriv: { src: "/assets/runes-emblem.webp", fit: "contain" }
};

/** Border texture + Roman numeral per specialty level, mirroring the source CSS. */
const LEVEL_STYLE: Record<1 | 4 | 6, { border: string; numeral: string }> = {
  1: { border: "border-1", numeral: "I" },
  4: { border: "border-4", numeral: "IV" },
  6: { border: "border-6", numeral: "VI" }
};

/** The level-panel accent (the Hero Creator tints it by town colour). */
const FACTION_ACCENT: Record<string, string> = {
  bulwark: "#1f3a5f",
  conflux: "#2b6c6c"
};

/** Parse `specialty.<slug>.<level>` → its hero slug and I/IV/VI level. */
export function parseSpecialtyCardId(cardId: string): { slug: string; level: 1 | 4 | 6 } | null {
  const match = /^specialty\.(.+)\.(1|4|6)$/u.exec(cardId);
  if (!match) {
    return null;
  }
  return { slug: match[1], level: Number(match[2]) as 1 | 4 | 6 };
}

/** True when we can draw this specialty natively (known hero + a picture for it). */
export function canRenderSpecialtyCard(cardId: string | undefined): boolean {
  if (!cardId) {
    return false;
  }
  const parsed = parseSpecialtyCardId(cardId);
  return Boolean(
    parsed && SPECIALTY_ICON_BY_HERO[parsed.slug] && coreHeroDefinitions[parsed.slug] && cardLibrary[cardId]
  );
}

/** The human-readable rules line lives in `tags` (prose; the rest are keywords). */
function specialtyEffectText(cardId: string): string {
  const tags = cardLibrary[cardId]?.tags ?? [];
  const prose = tags.filter((tag) => /\s/.test(tag)).sort((a, b) => b.length - a.length);
  return prose[0] ?? "";
}

/**
 * One native specialty card (I / IV / VI). Self-scaling: it is its own size
 * container, so every internal dimension is in `cqw` and the card fits whatever
 * width its parent gives it.
 */
export function SpecialtyCard({ cardId, className }: { cardId: string; className?: string }) {
  const parsed = parseSpecialtyCardId(cardId);
  const hero = parsed ? coreHeroDefinitions[parsed.slug] : undefined;
  const card = cardLibrary[cardId];
  if (!parsed || !hero || !card) {
    return null;
  }

  const level = LEVEL_STYLE[parsed.level];
  const icon = SPECIALTY_ICON_BY_HERO[parsed.slug];
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
          {icon ? (
            <div className="scIconBox">
              <img
                alt=""
                className="scIcon"
                src={assetUrl(icon.src)}
                style={{ objectFit: icon.fit ?? "cover", objectPosition: icon.position ?? "center" }}
              />
            </div>
          ) : null}
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
