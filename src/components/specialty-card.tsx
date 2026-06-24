"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { CSSProperties } from "react";

import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";

// ---------------------------------------------------------------------------
// Native hero-specialty card renderer.
//
// The FRAME, title, level badge and effect TEXT are drawn here (a port of the
// HoMM3 Hero Creator's HeroCard — github.com/k-adam/Homm3_hero_creator, MIT
// © 2025 Adam Kecskes; see public/credits/). Only the central specialty PICTURE
// comes from an image, displayed transparently (object-fit: contain) over the
// leather panel:
//   - spell specialists → transparent symbols from the Homm3BG asset set
//     (CC BY-NC-SA 4.0 — see public/credits/Homm3BG_LICENSE.txt);
//   - the rune specialist → our own emblem;
//   - the Bulwark unit specialists + Diplomacy → a transparent symbol the owner
//     supplies (Diplomacy provided; the three unit symbols are generated with
//     Gemini per scripts/bulwark-specialty-cards-runbook.md). Until a symbol
//     file exists the slot gracefully shows no icon (the frame + text still draw).
//
// Only art-less heroes need this; everyone else keeps their scanned card image.
// ---------------------------------------------------------------------------

/** The transparent specialty picture for each art-less hero. */
const SPECIALTY_ICON_BY_HERO: Record<string, string> = {
  // Bulwark unit specialists — Gemini-generated transparent symbols (runbook).
  dhuin: "/assets/specialty-card/icon-dhuin.webp", // Snow Elves
  creyle: "/assets/specialty-card/icon-creyle.webp", // Mammoths
  eikthurn: "/assets/specialty-card/icon-eikthurn.webp", // Yetis
  // Diplomacy — owner-supplied dove emblem.
  oidana: "/assets/specialty-card/icon-diplomacy.webp",
  // Spell specialists — Homm3BG transparent symbols (CC BY-NC-SA).
  glacius: "/assets/specialty-card/icon-frost_ring.webp",
  ciele: "/assets/specialty-card/icon-magic_arrow.webp",
  luna: "/assets/specialty-card/icon-firewall.webp",
  // Rune specialist — our own emblem.
  kriv: "/assets/runes-emblem.webp"
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

/** True when we can draw this specialty natively (known hero + a mapped picture). */
export function canRenderSpecialtyCard(cardId: string | undefined): boolean {
  if (!cardId) {
    return false;
  }
  const parsed = parseSpecialtyCardId(cardId);
  return Boolean(
    parsed && SPECIALTY_ICON_BY_HERO[parsed.slug] && coreHeroDefinitions[parsed.slug] && cardLibrary[cardId]
  );
}

/**
 * The card's rules description. Prefers the prose tag (Glacius/Kriv/Oidana carry
 * one); otherwise builds it from the CHOOSE_ONE option labels — the unit-
 * specialist helpers (Dhuin/Creyle/Eikthurn) keep their wording there, so without
 * this branch those cards print blank.
 */
export function specialtyEffectText(cardId: string): string {
  const card = cardLibrary[cardId];
  if (!card) {
    return "";
  }
  const prose = (card.tags ?? []).filter((tag) => /\s/.test(tag)).sort((a, b) => b.length - a.length)[0];
  if (prose) {
    return prose;
  }
  const effect: unknown = card.effect;
  if (effect && typeof effect === "object" && "type" in effect && (effect as { type: unknown }).type === "CHOOSE_ONE") {
    const options = (effect as { options?: Array<{ label?: string }> }).options ?? [];
    return options
      .map((option) => option.label)
      .filter((label): label is string => Boolean(label))
      .join("   —  OR  —   ");
  }
  return "";
}

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
          {iconSrc && !iconFailed ? (
            <div className="scIconBox">
              <img alt="" className="scIcon" onError={() => setIconFailed(true)} src={assetUrl(iconSrc)} />
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
