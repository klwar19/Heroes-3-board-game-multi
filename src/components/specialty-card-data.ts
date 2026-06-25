import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";

// ---------------------------------------------------------------------------
// Pure data + helpers for the native hero-specialty card. Kept out of the
// "use client" component file so server components (e.g. the /specialty-preview
// page) can call these functions directly — a "use client" module's exports are
// client references and cannot be invoked from the server.
// ---------------------------------------------------------------------------

/** The transparent specialty picture for each art-less hero. */
export const SPECIALTY_ICON_BY_HERO: Record<string, string> = {
  // Bulwark unit specialists — the unit's own wiki creature portrait
  // (heroes.thelazy.net, downloaded to units-bulwark-<slug>-portrait.webp).
  dhuin: "/assets/units-bulwark-snow_elves-portrait.webp", // Snow Elves
  creyle: "/assets/units-bulwark-mammoths-portrait.webp", // Mammoths
  eikthurn: "/assets/units-bulwark-yetis-portrait.webp", // Yetis
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
export const LEVEL_STYLE: Record<1 | 4 | 6, { border: string; numeral: string }> = {
  1: { border: "border-1", numeral: "I" },
  4: { border: "border-4", numeral: "IV" },
  6: { border: "border-6", numeral: "VI" }
};

/** The level-panel accent (the Hero Creator tints it by town colour). */
export const FACTION_ACCENT: Record<string, string> = {
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
