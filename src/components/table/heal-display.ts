/**
 * Combat board "frozen health" presentation for heals.
 *
 * During an attack the board holds a struck unit at its pre-hit health until the
 * blow visibly lands, so a killing blow keeps the card on the board until impact
 * (see `freezeDamage` in the page's animation timeline). A heal wants the mirror
 * of that: show the MORE-wounded pre-heal health, then climb the bar back up when
 * the shimmer ends.
 *
 * The naive "pre-heal = finalDamage + healAmount" breaks for a heal used as an
 * INSTANT the moment a unit is attacked (the First Aid Tent's heal-when-attacked
 * reaction). That heal lands BEFORE the incoming hit, so by the time the snapshot
 * settles the unit's real `finalDamage` already includes that later hit. Adding
 * the heal back on top then OVER-counts and can reach `maxHealth`, which the
 * board reads as "removed": the SURVIVING unit vanishes, then pops back in once
 * the strike's own reveal fires — the reported "heal, unit disappears, then
 * reappears at 1 HP" bug.
 *
 * Two rules keep a living unit on the board:
 *  1. If an attack in the same snapshot already froze this unit at its pre-hit
 *     health (`alreadyFrozen`), keep that value — it is exactly the post-heal,
 *     pre-hit health to show until the blow lands. Returning `undefined` tells
 *     the caller to leave the existing freeze untouched.
 *  2. Otherwise freeze at the pre-heal health, but never at or above `maxHealth`
 *     while the unit survives, so a unit that lives is never shown as dead.
 */
export function healFreezeDisplayDamage(args: {
  /** The unit's true damage in the settled snapshot (includes any later hit). */
  finalDamage: number;
  maxHealth: number;
  /** Damage mended by this heal (the DAMAGE_HEALED event amount). */
  healAmount: number;
  /** Whether an attack this snapshot already froze this unit's displayed health. */
  alreadyFrozen: boolean;
}): number | undefined {
  const { finalDamage, maxHealth, healAmount, alreadyFrozen } = args;
  if (alreadyFrozen) {
    // An attack's pre-pass already holds this unit at its pre-hit (post-heal)
    // health; that is the right value to show until the blow lands. Don't clobber
    // it with finalDamage + heal, which counts the very hit being animated twice.
    return undefined;
  }
  const preHeal = finalDamage + healAmount;
  // A unit that survives (finalDamage < maxHealth) must never read as dead.
  const cap = finalDamage < maxHealth ? maxHealth - 1 : maxHealth;
  return Math.min(cap, preHeal);
}
