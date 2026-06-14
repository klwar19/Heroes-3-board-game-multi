import manifest from "./fx-manifest.json";

/**
 * Battle-effect sprite sheets converted from the original Heroes III defs
 * (scripts/convert-h3-defs.py). The manifest carries frame geometry; this
 * module maps the game's cards and unit abilities onto those sheets plus the
 * matching sounds from /public/sounds.
 */
export type FxSheet = {
  src: string;
  label: string;
  group: string;
  role: "affect" | "hit" | "projectile";
  frames: number;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  /** "bottom": the sprite stands on the cell floor (columns of light, bolts). */
  anchor: "center" | "bottom";
  opacity?: number;
  /** Width of the effect relative to one battle cell (area spells > 1). */
  coverage?: number;
  looksLike?: string;
  sourceDef: string;
};

const sheets = manifest as Record<string, FxSheet>;

export function getFxSheet(key: string): FxSheet | undefined {
  return sheets[key];
}

export function listFxSheets(): Record<string, FxSheet> {
  return sheets;
}

/**
 * How a spell looks and sounds on the table. `affect` sprites play over the
 * target unit (in order, each entry delayed by `delayMs`); `projectile`
 * travels from the caster's seat to the target before `hit` explodes there.
 * `tint` washes the target's card (bloodlust has no sprite in the original
 * game either - the engine tinted the creature red).
 */
export type SpellFxPlan = {
  projectile?: string;
  hit?: string;
  affect?: { key: string; delayMs?: number }[];
  tint?: "bloodlust";
  /** /public/sounds manifest key, e.g. "spells/fireball". */
  sound?: string;
  hitSound?: string;
};

export const spellFxPlans: Record<string, SpellFxPlan> = {
  "spell.magic_arrow": {
    // projectile-0 is the horizontal arrow; the stage rotates it in flight.
    projectile: "magic-arrow-projectile-0",
    hit: "magic-arrow-hit",
    sound: "spells/magic-arrow"
  },
  "spell.lightning_bolt": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/lightning-bolt"
  },
  "spell.fireball": {
    hit: "fireball",
    sound: "spells/fireball",
    hitSound: "spells/fireball-hit"
  },
  "spell.stone_skin": {
    affect: [{ key: "stone-skin" }],
    sound: "spells/stone-skin"
  },
  "spell.bloodlust": {
    tint: "bloodlust",
    sound: "spells/bloodlust"
  },
  "spell.cure": {
    affect: [{ key: "cure" }],
    sound: "spells/cure"
  },
  "spell.fortune": {
    affect: [{ key: "fortune" }],
    sound: "spells/fortune"
  },
  // Ready for future cards - the sheets and sounds are already converted.
  "spell.bless": { affect: [{ key: "bless" }], sound: "spells/bless" },
  "spell.prayer": { affect: [{ key: "prayer" }], sound: "spells/prayer" },
  "spell.haste": { affect: [{ key: "haste" }], sound: "spells/haste" },
  "spell.slow": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "spell.precision": { affect: [{ key: "precision" }], sound: "spells/precision" },
  "spell.curse": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "spell.dispel": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  // Summon Elemental: resolves on an empty space (no unit to anchor a sprite
  // on), so only a cast sound is wired — the new unit appearing is the visual.
  // Air has its own H3 summon clip; the others use the element's own voice.
  "spell.summon_air_elemental": { sound: "spells/air-elemental" },
  "spell.summon_earth_elemental": { sound: "units/earth-elemental-attack" },
  "spell.summon_fire_elemental": { sound: "units/fire-elemental-attack" },
  "spell.summon_water_elemental": { sound: "units/water-elemental-attack" }
};

/** Played at center stage when a spell is countered. */
export const cancelFx = { key: "dispel", sound: "spells/dispel" };

/** Unit abilities that have a matching original effect. */
export const abilityFxPlans: Record<string, SpellFxPlan> = {
  "magog-fireball-splash": { hit: "fireball", hitSound: "spells/fireball-hit" },
  "lich-death-cloud": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  // Faerie Dragons' activation damage-spell flies as an Ice Bolt from the
  // dragon to the chosen unit, then explodes on the hit.
  "faerie-dragon-spell": {
    projectile: "ice-bolt-projectile-0",
    hit: "ice-bolt-hit",
    sound: "spells/ice-bolt",
    hitSound: "spells/ice-bolt-hit"
  },
  // Lethal-save sources (Alamar's specialty, the Resurrection spell and the
  // Archangels' once-per-combat cancel) all emit the "resurrection" ability
  // event when the killing blow is cancelled, so one plan covers all three.
  resurrection: { affect: [{ key: "prayer" }], sound: "spells/resurrection" },
  // Phoenixes' Rebirth reuses the resurrection cue when the killing blow is
  // shrugged off and the bird clings to life at 1 Health.
  "phoenix-rebirth": { affect: [{ key: "prayer" }], sound: "spells/resurrection" },
  // Printed unit abilities wired with their original H3 effect + sound.
  "wyvern-sting": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "rust-dragon-acid": { hit: "acid-breath", hitSound: "effects/acid-breath" },
  "gorgon-death-stare": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  "dread-knight-death-blow": { affect: [{ key: "death-ripple" }], sound: "effects/death-blow" },
  // Future abilities (cards not implemented yet, assets ready):
  poison: { affect: [{ key: "poison" }], sound: "spells/poison" },
  paralyze: { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  age: { affect: [{ key: "age" }], sound: "effects/age" },
  disease: { affect: [{ key: "disease" }], sound: "effects/disease" },
  bind: { affect: [{ key: "bind" }], sound: "effects/bind" },
  fear: { affect: [{ key: "fear" }], sound: "effects/fear" },
  "acid-breath": { hit: "acid-breath", hitSound: "effects/acid-breath" }
};
