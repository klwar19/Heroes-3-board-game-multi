/**
 * Order & Chaos Summoning Portal: the exclusive prizes. Every entry here is real
 * content defined elsewhere — the units in ./roster.ts (OC_DEFENDERS / OC_ENEMIES,
 * Ascended forms in OC_ULTIMATES), the passive and artifacts in OC_BLESSINGS, the
 * spell in ../content.ts SPELLS — with its rules in ../sim.ts. None of them is a
 * campaign reward, a mercenary or in OC_ARTIFACTS: the portal is the only way in.
 *
 * Types and ids only (plus the hero's data), so any screen can import it cheaply.
 */

import type { BlessingId, DefKind, EnemyKind, SpellId } from "../content";

export type OcGachaRarity = "SSR" | "UR";

/** Lawful units for the player's hand (full seed packets with a Surge and an Ascended form). */
export const OC_GACHA_UNITS: { kind: DefKind; rarity: OcGachaRarity }[] = [
  // Saves a troop in her 3×3 from a killing blow every 20 s.
  { kind: "oc-guardian-angel", rarity: "SSR" },
  // Its bolts Expose foes: +25% damage from everything for 5 s.
  { kind: "oc-astral-spirit", rarity: "SSR" },
  // Breath, plus a crystal prison every 10 s that shatters for 900 (+450 around).
  { kind: "oc-crystal-dragon", rarity: "UR" }
];

/** Chaos creatures for the player's Chaos Raids hand (atkCards: Might cost and recharge). */
export const OC_GACHA_CHAOS: { kind: EnemyKind; rarity: "SSR" }[] = [
  // A flyer whose acid breath melts shells and Corrodes troops (+50% damage taken for 8 s).
  { kind: "oc-rust-dragon", rarity: "SSR" },
  // Rocket artillery that lobs over walls at the costliest troop in range (3×3), and gets back up once.
  { kind: "oc-revenant", rarity: "SSR" }
];

/** Artifacts (equipped like OC_ARTIFACTS once won). */
export const OC_GACHA_ARTIFACTS: { id: BlessingId; rarity: "SSR" }[] = [
  // Spell damage +25% and through spell resistance (the immune take half).
  { id: "orb-of-vulnerability", rarity: "SSR" },
  // Chills and freezes on the horde last 50% longer.
  { id: "tome-of-water", rarity: "SSR" }
];

export type OcGachaHero = {
  id: string;
  name: string;
  title: string;
  portrait: string;
  /** A blessing no other hero has and no artifact is; its strength grows with the hero's rank (sim.ts blessingPower). */
  passive: BlessingId;
  /** Signature spell, scaled by the hero's rank (sim.ts heroSpell). */
  spell: SpellId;
  blurb: string;
  rarity: "UR";
};

/**
 * Melodia, the Rampart druid of Fortune. Passive "luck": each troop attack (shot, melee strike, lightning,
 * beam, bomb, dash, slam) has a 20% chance (14% at rank 1, +1.5% a rank) to deal double damage. Fortune (18 mana,
 * 35 s): for 8 s (5.6 s at rank 1) every such attack is lucky and every foe slain drops
 * 10 gold. Rank texts: ./hero-ranks.ts heroPassiveText / heroSpellText.
 */
export const OC_GACHA_HERO: OcGachaHero = {
  id: "melodia",
  name: "Melodia",
  title: "Druid of Fortune",
  portrait: "/assets/hero_boardart-melodia.webp",
  passive: "luck",
  spell: "fortune",
  blurb: "Luck: every attack your troops make (a shot, a melee strike, a lightning bolt, a beam, a bomb, a dash or a slam) has a 20% chance to be lucky (double damage). Fortune makes every one of them lucky for 8 s, and every foe slain drops 10 gold.",
  rarity: "UR"
};
