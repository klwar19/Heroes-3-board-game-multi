import { spellFxPlans, type SpellFxPlan } from "./fx";
import { ENEMY_FORCE_CARD_POOL } from "@/engine/enemy-force";

/**
 * Battle presentation for the PvE ENEMY FORCE's card plays (2026-08-21, the
 * BOSS_SPELL_ROTATION replacement). A raid boss / Dungeon warden spends a held
 * card at its own activation start with no window and no dice, so without a cue
 * the player would only ever see a feed line. Each play REUSES an already
 * converted H3 spell's sprite sheet + sound (never new media).
 *
 * The mapping is DERIVED, not a second table: every pool entry already declares
 * its `fxKey`, so a new pool card cannot ship without FX. `enemy-force-fx.test.ts`
 * sweeps that every declared key resolves to a LIVE `spellFxPlans` entry —
 * exactly the guard the deleted `monster-spell-fx.test.ts` provided.
 *
 * The trigger is the engine's `ENEMY_FORCE_CARD_PLAYED` event.
 */

/** card id → the `spellFxPlans` key whose sprite + sound the play reuses. */
export const ENEMY_FORCE_FX_KEY: Record<string, string> = Object.fromEntries(
  ENEMY_FORCE_CARD_POOL.map((entry) => [entry.cardId, entry.fxKey])
);

/**
 * Safety net for a future entry whose mapped plan disappears. Never reached by a
 * shipped card (the sweep proves every key maps to a live plan); it keeps a play
 * audible + visible rather than silent if `fx.ts` ever drops a key.
 */
const FALLBACK: SpellFxPlan = { affect: [{ key: "bless" }], sound: "spells/bless" };

export function enemyForceFxPlan(cardId: string): SpellFxPlan {
  const key = ENEMY_FORCE_FX_KEY[cardId];
  return (key ? spellFxPlans[key] : undefined) ?? FALLBACK;
}
