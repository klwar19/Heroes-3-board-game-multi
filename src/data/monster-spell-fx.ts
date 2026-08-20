import { spellFxPlans, type SpellFxPlan } from "./fx";
import { MONSTER_SPELLS, type MonsterSpellId } from "./anime/monster-spells";

/**
 * Battle presentation for the PvE monster CASTER spells (dungeon/raid-boss
 * variant expansion §A). A boss's `BOSS_SPELL_ROTATION` resolves automatically
 * at every combat round's start — no window, no dice, no card — so without a
 * cue the player only ever saw a feed line. Each spell REUSES an already
 * converted H3 spell's sprite sheet + sound (never new media); the mapping
 * lives here alone, exactly like `commanderCastFxPlan` does for WOG commanders,
 * so a new `MonsterSpellId` fails the sweep in `monster-spell-fx.test.ts`
 * instead of silently resolving to nothing.
 *
 * The trigger is the engine's `UNIT_ABILITY_TRIGGERED` event, which carries
 * `monsterSpellId` for exactly these casts (see `applyMonsterSpellEffect`).
 */

/** MonsterSpellId → the `spellFxPlans` key whose sprite + sound it reuses. */
export const MONSTER_SPELL_FX_KEY: Record<MonsterSpellId, string> = {
  // A dark bolt hurled at one enemy → the Magic Arrow projectile + impact.
  shadow_bolt: "spell.magic_arrow",
  // −2 Initiative on the fastest enemy → literally the Slow spell's shimmer.
  chill_of_the_deep: "spell.slow",
  // −1 Attack on every enemy → the Curse hex.
  withering_curse: "spell.curse",
  // The caster mends itself → the Cure shimmer.
  mend_flesh: "spell.cure",
  // The enemy discards at random → Forgetfulness (memory drained).
  siphon_thought: "spell.forgetfulness",
  // +1 Defense on its own side → the Stone Skin hardening.
  ward_of_ash: "spell.stone_skin"
};

/**
 * Safety net for a future spell whose mapped plan disappears. Never reached by
 * a shipped spell (the sweep proves every id maps to a live plan); it keeps a
 * cast audible + visible rather than silent if `fx.ts` ever drops a key.
 */
export const MONSTER_SPELL_FALLBACK_FX: SpellFxPlan = {
  affect: [{ key: "curse" }],
  sound: "spells/curse"
};

/** The board FX plan for a monster spell cast. Never null — see the fallback. */
export function monsterSpellFxPlan(spellId: string): SpellFxPlan {
  const key = MONSTER_SPELL_FX_KEY[spellId as MonsterSpellId];
  return (key ? spellFxPlans[key] : undefined) ?? MONSTER_SPELL_FALLBACK_FX;
}

/** Every shipped monster spell has a mapped FX key — guards a new spell. */
export function everyMonsterSpellHasFx(): boolean {
  return (Object.keys(MONSTER_SPELLS) as MonsterSpellId[]).every(
    (id) => typeof MONSTER_SPELL_FX_KEY[id] === "string" && Boolean(spellFxPlans[MONSTER_SPELL_FX_KEY[id]])
  );
}
