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
  eikthurn: "/assets/units-bulwark-mountain_rams-portrait.webp", // Mountain Rams (bronze lv2)
  // Every unit specialist uses the unit's own in-game PORTRAIT (not the full
  // battle sprite) — scripts/fetch-specialty-unit-portraits.py.
  ingham: "/assets/units-zealot-portrait.webp", // Zealots (Castle)
  valeska: "/assets/units-marksman-portrait.webp", // Marksmen (Castle)
  casmetra: "/assets/units-sorceress-portrait.webp", // Sorceresses (Cove)
  cassiopeia: "/assets/units-oceanid-portrait.webp", // Oceanids (Cove)
  lorelei: "/assets/units-harpy-portrait.webp", // Harpies (Dungeon)
  tarnum_dungeon: "/assets/units-black_dragon-portrait.webp", // Dragons (Dungeon)
  tarnum_fortress: "/assets/units-basilisk-portrait.webp", // Basilisks (Fortress)
  tarnum_rampart: "/assets/units-sharpshooter-portrait.webp", // Sharpshooters (Rampart)
  ivor: "/assets/units-grand_elf-portrait.webp", // Elves (Rampart)
  tarnum_conflux: "/assets/units-enchanter-portrait.webp", // Enchanters
  // Conflux Planeswalker unit specialists — the creature's own wiki portrait
  // (scripts/fetch-conflux-elemental-portraits.py). Their cards used to reference
  // baked scans (hero_specialties-<slug>-*.webp) that were never shipped — broken
  // <img> links; they are art-less now.
  erdamon: "/assets/units-magma_elemental-portrait.webp", // Magma Elementals
  monere: "/assets/units-magic_elemental-portrait.webp", // Magic Elementals
  pasis: "/assets/units-energy_elemental-portrait.webp", // Elementals (Energy)
  // Factory unit specialists — the unit's own Factory card art (no dedicated
  // portrait crop yet). Six kept heroes, each buffs one Factory unit.
  henrietta: "/assets/units-factory-bronze-halflings-few.webp", // Halflings
  frederick: "/assets/units-factory-silver-automatons-few.webp", // Automatons
  sam: "/assets/units-factory-bronze-mechanics-few.webp", // Mechanics
  tancred: "/assets/units-factory-golden-gunslingers-few.webp", // Bounty Hunters
  celestine: "/assets/units-factory-bronze-armadillos-few.webp", // Armadillos
  agar: "/assets/units-factory-silver-sandworms-few.webp", // Sandworms
  // Moandor's specialty IS the Liches — the unit's own Power Lich wiki portrait
  // (scripts/fetch-lich-portrait.py), matching the Bulwark unit specialists. His
  // three cards used to reference baked scans (hero_specialties-moandor-*.webp)
  // that were never shipped — broken <img> links; they are art-less now.
  moandor: "/assets/units-lich-portrait.webp", // Liches (Power Lich portrait)
  // --- Spell / emblem specialists -----------------------------------------
  oidana: "/assets/specialty-card/icon-diplomacy.webp", // Diplomacy dove
  glacius: "/assets/specialty-card/icon-frost_ring.webp", // Homm3BG symbols
  ciele: "/assets/specialty-card/icon-magic_arrow.webp",
  luna: "/assets/specialty-card/icon-firewall.webp",
  // Septienna's specialty IS the Death Ripple spell — the actual spell icon from
  // heroes.thelazy.net (scripts/fetch-death-ripple-icon.py), not the generic
  // Necromancy skill emblem it used to (wrongly) borrow.
  septienna: "/assets/specialty-card/icon-death_ripple.webp", // Death Ripple spell icon
  // Jeremy's specialty IS the Cannon war machine, so he shows the actual HotA
  // Cannon (its own transparent battle sprite from heroes.thelazy.net,
  // scripts/fetch-cannon-cure-specialty-icons.py) rather than the generic
  // Artillery skill card he used to borrow.
  jeremy: "/assets/specialty-card/icon-cannon.webp", // Cannon
  // Astra's specialty IS the Cure spell, so she shows the Cure SPELL icon (from
  // heroes.thelazy.net, same script) — not the First Aid Tent war-machine emblem
  // (abilities-first_aid.webp) she used to (wrongly) borrow.
  astra: "/assets/specialty-card/icon-cure.webp", // Cure spell icon
  kriv: "/assets/runes-emblem.webp", // Rune specialist — our own emblem
  // --- Skill / war-machine / spell-themed specialists: the matching printed
  // secondary-skill icon (public/assets/abilities-<skill>.webp) -------------
  // Ballista specialists show the actual Ballista war-machine battle sprite
  // (scripts/fetch-ballista-icon.py), like Jeremy's Cannon — not the generic
  // Artillery secondary-skill emblem they used to borrow.
  tarnum_castle: "/assets/specialty-card/icon-ballista.webp", // Ballista
  gerwulf: "/assets/specialty-card/icon-ballista.webp", // Ballista
  torosar: "/assets/specialty-card/icon-ballista.webp", // Ballista
  // Miriam's specialty IS Scouting — the large Expert Scouting skill emblem from
  // heroes.thelazy.net (scripts/fetch-forgetfulness-scouting-icons.py), not the
  // small generic Scouting emblem.
  miriam: "/assets/specialty-card/icon-scouting-expert.webp", // Scouting
  // Sephinroth's specialty IS Valuables — the game's own Valuables resource icon
  // (RESOURCE_ICONS.valuables), the red crystals cut out of the shared leather
  // tile to a transparent background (scripts/make-sephinroth-valuables-icon.py),
  // not the generic Estates skill emblem.
  sephinroth: "/assets/specialty-card/icon-valuables.webp", // Valuables (resource icon)
  // Octavia's specialty IS Gold — the game's own gold-coins icon, cut out of the
  // shared leather resource tile to a transparent background
  // (scripts/make-octavia-gold-icon.py), not the generic Estates skill emblem.
  octavia: "/assets/specialty-card/icon-gold.webp", // Gold (gold-coins icon)
  // Melodia's specialty IS Fortune — the actual Fortune SPELL icon
  // (scripts/fetch-fortune-icon.py), not the generic Luck skill emblem.
  melodia: "/assets/specialty-card/icon-fortune.webp", // Fortune spell icon
  // Merist's specialty IS the Stone Skin spell — the actual spell icon from
  // heroes.thelazy.net (scripts/fetch-stoneskin-haste-icons.py), not the generic
  // Armorer skill emblem.
  merist: "/assets/specialty-card/icon-stone_skin.webp", // Stone Skin spell icon
  // Zilare's specialty IS Forgetfulness — the actual Forgetfulness SPELL icon
  // (scripts/fetch-forgetfulness-scouting-icons.py), not the generic Air-Magic emblem.
  zilare: "/assets/specialty-card/icon-forgetfulness.webp", // Forgetfulness spell icon
  // Ash's specialty IS the Bloodlust spell, so he shows the Bloodlust SPELL icon
  // (heroes.thelazy.net, scripts/fetch-bloodlust-icon.py) — not the generic
  // Offense secondary-skill emblem (abilities-offense.webp) he used to borrow.
  ash: "/assets/specialty-card/icon-bloodlust.webp", // Bloodlust spell icon
  // Cyra's specialty IS the Haste spell — the actual spell icon from
  // heroes.thelazy.net (scripts/fetch-stoneskin-haste-icons.py), not the generic
  // Air-Magic skill emblem.
  cyra: "/assets/specialty-card/icon-haste.webp" // Haste spell icon
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
