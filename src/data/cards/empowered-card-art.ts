import { cardLibrary } from "@/data/cards/library";

/**
 * Printed "Empowered" card faces (fan-wiki scans, imported by
 * scripts/fetch-empowered-card-art.py into
 * `/assets/abilities-<slug>-empowered.webp` and
 * `/assets/statistics-<stat>-empowered.webp`).
 *
 * An ability is Empowered PER OWNER (the Dragon Fly Hive / Griffin Conservatory
 * bank bonus, tracked in `player.empoweredAbilities` — see
 * `abilityExpertIsCrownFree` in the engine ruleset), so the card data cannot
 * carry the empowered face: the render surfaces swap it in when they know the
 * owner. `empoweredCardImage` is that single lookup.
 *
 * The slug lists below are an EXPLICIT registry of the faces that actually
 * exist on disk — never a runtime guess at a filename. `empowered-card-art.test.ts`
 * fails if a listed face is missing (or if a base face gains a wiki empowered
 * scan that is not listed).
 */

/** Ability slugs with a downloaded `/assets/abilities-<slug>-empowered.webp`. */
export const EMPOWERED_ABILITY_ART_SLUGS = [
  "air_magic",
  "archery",
  "armorer",
  "artillery",
  "ballistics",
  "basic_air_magic",
  "basic_earth_magic",
  "basic_fire_magic",
  "basic_water_magic",
  "diplomacy",
  "eagle_eye",
  "earth_magic",
  "estates",
  "fire_magic",
  "first_aid",
  "intelligence",
  "interference",
  "leadership",
  "learning",
  "logistics",
  "luck",
  "mysticism",
  "necromancy",
  "offense",
  "pathfinding",
  "resistance",
  "scholar",
  "scouting",
  "sorcery",
  "tactics",
  "water_magic",
  "wisdom"
] as const;

/** Statistic slugs with a downloaded `/assets/statistics-<stat>-empowered.webp`. */
export const EMPOWERED_STATISTIC_ART_SLUGS = ["attack", "defense", "power", "knowledge"] as const;

const ABILITY_SLUGS = new Set<string>(EMPOWERED_ABILITY_ART_SLUGS);
const STATISTIC_SLUGS = new Set<string>(EMPOWERED_STATISTIC_ART_SLUGS);

const ABILITY_FACE = /^\/assets\/abilities-([a-z0-9_]+)\.webp$/;
const STATISTIC_FACE = /^\/assets\/statistics-([a-z0-9_]+)\.webp$/;

/**
 * The printed Empowered face for a card, or `undefined` when there is none to
 * swap in — either the card has no registered empowered scan, or its printed
 * face IS already an empowered scan (the Empowered Statistics, and Diplomacy,
 * which is printed always-Empowered).
 */
export function empoweredCardImage(cardId: string | undefined): string | undefined {
  if (!cardId) {
    return undefined;
  }
  const base = cardLibrary[cardId]?.assets?.cardImage;
  if (!base) {
    return undefined;
  }
  const ability = ABILITY_FACE.exec(base);
  if (ability && ABILITY_SLUGS.has(ability[1])) {
    return `/assets/abilities-${ability[1]}-empowered.webp`;
  }
  const statistic = STATISTIC_FACE.exec(base);
  if (statistic && STATISTIC_SLUGS.has(statistic[1])) {
    return `/assets/statistics-${statistic[1]}-empowered.webp`;
  }
  return undefined;
}

/**
 * The face to render for `cardId`: the Empowered scan when the card is shown as
 * Empowered and such a scan exists, else the card's own printed face.
 */
export function cardFaceImage(cardId: string | undefined, empowered: boolean): string | undefined {
  const base = cardId ? cardLibrary[cardId]?.assets?.cardImage : undefined;
  if (!empowered) {
    return base;
  }
  return empoweredCardImage(cardId) ?? base;
}
