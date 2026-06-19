// Type declarations for the pure mapping helpers exported by
// convert-h3-sounds.mjs (the conversion itself runs only when the script is
// executed directly). Used by src/data/hota-sound-mapping.test.ts.

export type SoundReference = Record<string, { entity: string; category: string }>;

/** Load docs/h3-sound-reference.csv into a name -> {entity, category} map. */
export function loadReference(): SoundReference;

/**
 * Manifest destination ("units/armadillo-attack", "ambient/frigate",
 * "spells/grenade", …) for an upper-cased H3/HotA sound name, or null when the
 * name is not recognised.
 */
export function destinationFor(base: string, ref: SoundReference): string | null;

/** 4-letter action suffix -> action slug (ATTK -> attack, EXT1 -> special, …). */
export const ACTIONS: Record<string, string>;

/** LOOPxxxx ambience code -> [slug, human description]. */
export const AMBIENT: Record<string, [string, string]>;

/** camelCase / PascalCase VCMI entity id -> kebab-case file slug. */
export function kebab(s: string): string;
