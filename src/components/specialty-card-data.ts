import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";

// ---------------------------------------------------------------------------
// Pure data + helpers for the native hero-specialty card. Kept out of the
// "use client" component file so server components (e.g. the /specialty-preview
// page) can call these functions directly — a "use client" module's exports are
// client references and cannot be invoked from the server.
// ---------------------------------------------------------------------------

/**
 * The central specialty symbol for each art-less hero. This is OPTIONAL — a
 * hero missing here still renders the native card (frame + portrait + name +
 * effect), just with an empty icon slot — but every art-less hero we ship is
 * given a faithful symbol below: a creature's own transparent portrait for the
 * unit specialists (matching the printed card, like the Bulwark heroes), and
 * the matching secondary-skill / war-machine icon for the rest.
 */
export const SPECIALTY_ICON_BY_HERO: Record<string, string> = {
  // --- Unit specialists: the creature the specialty names ------------------
  // Bulwark — the unit's own wiki creature portrait (heroes.thelazy.net,
  // downloaded to units-bulwark-<slug>-portrait.webp).
  dhuin: "/assets/units-bulwark-snow_elves-portrait.webp", // Snow Elves
  creyle: "/assets/units-bulwark-mammoths-portrait.webp", // Mammoths
  eikthurn: "/assets/units-bulwark-yetis-portrait.webp", // Yetis
  // Other unit specialists — the creature's transparent battle sprite from
  // heroes.thelazy.net (scripts/fetch-specialty-creature-icons.py).
  ingham: "/assets/specialty-card/creature-zealot.webp", // Zealots (Castle)
  valeska: "/assets/specialty-card/creature-marksman.webp", // Marksmen (Castle)
  casmetra: "/assets/specialty-card/creature-sorceress.webp", // Sorceresses (Cove)
  cassiopeia: "/assets/specialty-card/creature-oceanid.webp", // Oceanids (Cove)
  lorelei: "/assets/specialty-card/creature-harpy.webp", // Harpies (Dungeon)
  tarnum_dungeon: "/assets/specialty-card/creature-black_dragon.webp", // Dragons (Dungeon)
  tarnum_fortress: "/assets/specialty-card/creature-basilisk.webp", // Basilisks (Fortress)
  tarnum_rampart: "/assets/specialty-card/creature-sharpshooter.webp", // Sharpshooters (Rampart)
  ivor: "/assets/specialty-card/creature-grand_elf.webp", // Elves (Rampart)
  tarnum_conflux: "/assets/specialty-card/creature-enchanter.webp", // Enchanters
  // --- Spell / emblem specialists -----------------------------------------
  oidana: "/assets/specialty-card/icon-diplomacy.webp", // Diplomacy dove
  glacius: "/assets/specialty-card/icon-frost_ring.webp", // Homm3BG symbols
  ciele: "/assets/specialty-card/icon-magic_arrow.webp",
  luna: "/assets/specialty-card/icon-firewall.webp",
  // Septienna's specialty IS the Death Ripple spell — the actual spell icon from
  // heroes.thelazy.net (scripts/fetch-death-ripple-icon.py), not the generic
  // Necromancy skill emblem it used to (wrongly) borrow.
  septienna: "/assets/specialty-card/icon-death_ripple.webp", // Death Ripple spell icon
  kriv: "/assets/runes-emblem.webp", // Rune specialist — our own emblem
  // --- Skill / war-machine / spell-themed specialists: the matching printed
  // secondary-skill icon (public/assets/abilities-<skill>.webp) -------------
  tarnum_castle: "/assets/abilities-artillery.webp", // Ballista
  gerwulf: "/assets/abilities-artillery.webp", // Ballista
  torosar: "/assets/abilities-artillery.webp", // Ballista
  jeremy: "/assets/abilities-artillery.webp", // Cannon
  astra: "/assets/abilities-first_aid.webp", // Cure (heal/cleanse)
  miriam: "/assets/abilities-scouting.webp", // Scouting
  sephinroth: "/assets/abilities-estates.webp", // Valuables (resources)
  octavia: "/assets/abilities-estates.webp", // Gold (resources)
  melodia: "/assets/abilities-luck.webp", // Fortune (luck/morale)
  merist: "/assets/abilities-armorer.webp", // Stone Skin (defense)
  zilare: "/assets/abilities-air_magic.webp", // Forgetfulness (Air spell)
  ash: "/assets/abilities-offense.webp", // Bloodlust (+attack)
  cyra: "/assets/abilities-air_magic.webp" // Haste (Air spell, speed)
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

/** The specialty picture path for an art-less specialty (or undefined). */
export function specialtyIconSrc(cardId: string | undefined): string | undefined {
  if (!cardId) {
    return undefined;
  }
  const parsed = parseSpecialtyCardId(cardId);
  return parsed ? SPECIALTY_ICON_BY_HERO[parsed.slug] : undefined;
}

/**
 * True when we should draw this specialty with the native renderer instead of a
 * scanned image: it is a real specialty for a known hero AND the card has no
 * printed `cardImage` (the fan wiki has no scan for it). The central specialty
 * symbol (SPECIALTY_ICON_BY_HERO) is OPTIONAL — a missing one just leaves the
 * icon slot empty while the frame, portrait, name and effect text still draw, so
 * every art-less hero gets a real card rather than a blank placeholder. A
 * baked-art specialty (e.g. Sandro, Catherine) keeps its scan and returns false.
 */
export function canRenderSpecialtyCard(cardId: string | undefined): boolean {
  if (!cardId) {
    return false;
  }
  const parsed = parseSpecialtyCardId(cardId);
  if (!parsed) {
    return false;
  }
  const card = cardLibrary[cardId];
  return Boolean(parsed && coreHeroDefinitions[parsed.slug] && card && !card.assets?.cardImage);
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
