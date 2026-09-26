import { combatGeometry } from "./battlefield";
import { areaAround, type FootprintCombat, type FootprintUnit } from "./hex-footprint";

/**
 * PC-sized area Spells / Specialties on the optional hex battlefield (house
 * rule `hex-battlefield`, combat.geometry === "hex"; user request 2026-09-26):
 * on the 13×9 hex board these blasts take the Heroes III PC area instead of the
 * board game's "centre + adjacent spaces, pick N" rule. The 4×5 grid never
 * reads this table (hexPcSpellArea returns null there), so grid combats are
 * unchanged.
 *
 * Source: VCMI `config/spells/offensive.json`, expert-level `range`
 * ("0" = the centre hex, "1" = the ring around it):
 *   fireball     "0-1" → radius 1, centre included (7 hexes)
 *   frostRing    "1"   → radius 1, centre EXCLUDED (the 6-hex ring)
 *   meteorShower "0-1" → radius 1, centre included (7 hexes)
 *   inferno      "0-2" → radius 2, centre included (19 hexes)
 *
 * The radius is measured in hexes from the centre; a two-hex (double-wide)
 * centre body counts as a whole (distance = the minimum over its hexes,
 * areaAround). On the hex board EVERY living unit in the area — friend or foe —
 * is hit: no "pick N adjacent units" step and no Fireball second-target pick
 * (the printed adjacentPicks / minAdjacentPicks are ignored for these cards).
 * Damage amounts, dice, reductions, immunities and events are unchanged.
 */
export type HexPcSpellArea = {
  /** Hexes from the centre the blast reaches. */
  readonly radius: number;
  /** Whether the centre hex(es) — the unit standing there — are hit too. */
  readonly includeCentre: boolean;
};

const FIREBALL_AREA: HexPcSpellArea = { radius: 1, includeCentre: true };
const FROST_RING_AREA: HexPcSpellArea = { radius: 1, includeCentre: false };
const METEOR_SHOWER_AREA: HexPcSpellArea = { radius: 1, includeCentre: true };
const INFERNO_AREA: HexPcSpellArea = { radius: 2, includeCentre: true };

/**
 * Card id → PC area. Balance-pack reprints keep the printed id, so they share
 * the entry. Adelaide IV / Glacius IV carry no blast today (their table entry
 * is only read by the area resolvers, so it is inert for them).
 */
export const HEX_PC_SPELL_AREAS: Readonly<Record<string, HexPcSpellArea>> = {
  "spell.fireball": FIREBALL_AREA,
  "spell.frost_ring": FROST_RING_AREA,
  "specialty.adelaide.1": FROST_RING_AREA,
  "specialty.adelaide.4": FROST_RING_AREA,
  "specialty.adelaide.6": FROST_RING_AREA,
  "specialty.glacius.1": FROST_RING_AREA,
  "specialty.glacius.4": FROST_RING_AREA,
  "specialty.glacius.6": FROST_RING_AREA,
  "spell.meteor_shower": METEOR_SHOWER_AREA,
  "spell.inferno": INFERNO_AREA,
  "specialty.xyron.1": INFERNO_AREA,
  "specialty.xyron.4": INFERNO_AREA,
  "specialty.xyron.6": INFERNO_AREA
};

/** The PC area of `cardId` in this combat: only on the hex board, else null (grid: printed rule). */
export function hexPcSpellArea(
  combat: FootprintCombat | null | undefined,
  cardId: string | null | undefined
): HexPcSpellArea | null {
  if (!cardId || combatGeometry(combat) !== "hex") return null;
  return HEX_PC_SPELL_AREAS[cardId] ?? null;
}

/**
 * The hexes `cardId`'s PC blast covers around `centre` (a cell, or the centre
 * unit's whole body), or null when the card keeps its printed area (4×5 grid,
 * or a card without a PC area).
 */
export function hexPcSpellBlast(
  combat: FootprintCombat | null | undefined,
  cardId: string | null | undefined,
  centre: number | FootprintUnit
): Set<number> | null {
  const spec = hexPcSpellArea(combat, cardId);
  return spec ? areaAround(combat, centre, spec.includeCentre, spec.radius) : null;
}
