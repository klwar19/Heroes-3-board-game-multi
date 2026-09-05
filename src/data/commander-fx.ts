import { spellFxPlans, type SpellFxPlan } from "./fx";
import { commanderDefinitions, type CommanderSlug } from "./commanders";

/**
 * Battle presentation for the WOG commander abilities (sfx + animation). Each
 * command ability reuses a converted H3 spell's sprite sheet + sound, and each
 * in-combat specialty trigger gets a themed sting. Pure data + lookups so
 * page.tsx only wires the cues and the tests can pin the mapping.
 *
 * The engine emits COMMANDER_CAST_USED (with commanderSlug + targetUnitId) when
 * a command ability resolves — the activation cast AND the Shield / Stone Skin
 * instant reaction — and COMMANDER_SPECIALTY_TRIGGERED (with specialtyId) when a
 * combat specialty fires (Charming, Elemental Scourge, Rune Ritual).
 */

/** commander slug → the spellFxPlans key whose sprite + sound the cast reuses. */
export const COMMANDER_CAST_FX_KEY: Record<CommanderSlug, string> = {
  paladin: "spell.cure", // Cure
  hierophant: "spell.shield", // Shield (instant reaction)
  temple_guardian: "spell.precision", // Precision
  succubus: "spell.fire_shield", // Fire Shield
  brute: "spell.bloodlust", // Bloodlust (red battle-rage tint)
  soul_eater: "spell.animate_dead", // Animate Dead (resurrection sheet + animate-dead sound)
  ogre_leader: "spell.stone_skin", // Stone Skin (instant reaction)
  shaman: "spell.haste", // Haste
  astral_spirit: "spell.counterstrike", // Counterstrike
  corsair: "spell.slow", // Slow
  factory: "spell.cure", // Field Repair (mends → the Cure shimmer)
  bulwark: "spell.sacrifice", // Rune Mend (sound-only, like the Sacrifice spell)
  ruler: "spell.bloodlust", // Command Seal
  sword_saint: "spell.precision", // Sword Intent
  might_guy: "spell.haste", // Body Flicker (reuses the Shaman's Haste cast + fx)
  belfast: "spell.magic_arrow", // Royal Salvo (enemy damage → the Magic Arrow bolt + impact fx)
  demon_ancestor: "spell.bloodlust", // Blood Frenzy (reuses the Brute's Bloodlust cast + fx)
  kyousuke_natsume: "spell.prayer", // Little Busters, Assemble! (a rally over the adjacent allies)
  ibuki: "commander.ibuki.executive", // Executive Order
  lion_el_jonson: "spell.magic_arrow", // Lion's Slash (Counterstroke is selected by cast name below)
  sonya: "spell.haste" // Cheer (Shaman Haste reuse)
};

/**
 * Fallback for a commander cast whose spell has no plan yet. Animate Dead now
 * has its own spellFxPlans entry (resurrection sheet + animate-dead sound), so
 * this is only a safety net for future unmapped casts — still the real
 * Resurrection/Animate Dead sheet, never the Prayer column.
 */
export const COMMANDER_CAST_FALLBACK_FX: SpellFxPlan = {
  affect: [{ key: "resurrection" }],
  sound: "spells/animate-dead"
};

/**
 * The board FX plan for a commander cast, by slug. Falls back to a shimmer +
 * sound when the mapped spell has no plan (Animate Dead), so every commander
 * cast animates and sounds — never a silent, invisible resolution.
 */
export function commanderCastFxPlan(commanderSlug: string, castName?: string): SpellFxPlan {
  const key = commanderSlug === "lion_el_jonson" && castName === "Deathwing Counterstroke"
    ? "spell.counterstrike"
    : COMMANDER_CAST_FX_KEY[commanderSlug as CommanderSlug];
  return (key ? spellFxPlans[key] : undefined) ?? COMMANDER_CAST_FALLBACK_FX;
}

/**
 * The themed sting for an in-combat commander specialty trigger, by specialtyId
 * (CommanderSpecialtyDefinition.id). Only the specialties that actually fire a
 * COMMANDER_SPECIALTY_TRIGGERED event during combat are mapped; the rest resolve
 * on the map (Soul Reformer, Tinkerer…) or are passive, and get no combat cue.
 */
export const COMMANDER_SPECIALTY_SOUND: Record<string, string> = {
  charming: "spells/curse", // Succubus: a hex seizes an enemy
  "elemental-scourge": "spells/death-ripple", // Astral Spirit: sears every neutral
  "rune-ritual": "effects/rune" // Rune Keeper: a rune is carved
};

/** The specialty sting sound for a trigger event, or undefined if none applies. */
export function commanderSpecialtySound(specialtyId: string): string | undefined {
  return COMMANDER_SPECIALTY_SOUND[specialtyId];
}

/** Every commander definition's cast has a mapped FX key — guards new commanders. */
export function everyCommanderCastHasFx(): boolean {
  return (Object.keys(commanderDefinitions) as CommanderSlug[]).every(
    (slug) => typeof COMMANDER_CAST_FX_KEY[slug] === "string"
  );
}
