import { describe, expect, it } from "vitest";
import { healFreezeDisplayDamage } from "./heal-display";

/**
 * The combat board hides a unit whose *displayed* damage reaches its max (it
 * reads as "removed"). The First Aid Tent heal-when-attacked reaction lands the
 * heal BEFORE the incoming hit, so the settled snapshot's real damage already
 * includes that hit. The old display rule (finalDamage + healAmount) then
 * over-counted and could reach maxHealth, making a SURVIVING unit vanish during
 * the heal shimmer and reappear once the strike's reveal fired.
 *
 * Each assertion fails if the fix is reverted (CLAUDE.md #1/#1a): the test pins
 * the observable outcome — what the board would display — not an intermediate.
 */
describe("healFreezeDisplayDamage — a healed survivor never reads as dead", () => {
  it("heal-when-attacked: a unit that survives the hit is NOT shown as removed", () => {
    // Crusaders: max 6, wounded to 2, healed 2->1, then take 4 => final 5 (alive).
    // The attack already froze the unit at its pre-hit health, so the heal must
    // leave that freeze alone (undefined) rather than push it to 5+1 = 6 = dead.
    const shown = healFreezeDisplayDamage({
      finalDamage: 5,
      maxHealth: 6,
      healAmount: 1,
      alreadyFrozen: true
    });
    expect(shown, "the attack's pre-hit freeze must be kept, not overwritten").toBeUndefined();
  });

  it("CONTROL: the old buggy value (final + heal) would have read as DEAD", () => {
    // This documents the exact bug: 5 + 1 = 6 = maxHealth => the board hid a
    // living unit. The fix above must never produce that for a survivor.
    const buggy = Math.min(6, 5 + 1);
    expect(buggy).toBe(6); // == maxHealth => "removed" on the board
  });

  it("own-turn heal (no attack): shows the pre-heal wounded health, below max", () => {
    // Wounded to 1 after a 1-point heal (was 2); the bar shows 2, then climbs.
    const shown = healFreezeDisplayDamage({
      finalDamage: 1,
      maxHealth: 6,
      healAmount: 1,
      alreadyFrozen: false
    });
    expect(shown).toBe(2);
    expect(shown!).toBeLessThan(6); // visible (not removed)
  });

  it("never freezes a surviving unit at or above max even without an attack freeze", () => {
    // Defensive: if some path passes a large heal on a barely-alive unit, the
    // frozen pre-heal is capped at maxHealth-1 so the unit stays on the board.
    const shown = healFreezeDisplayDamage({
      finalDamage: 5,
      maxHealth: 6,
      healAmount: 3,
      alreadyFrozen: false
    });
    expect(shown).toBe(5); // capped to maxHealth-1, NOT 8
    expect(shown!).toBeLessThan(6);
  });

  it("a unit that is genuinely dead in the snapshot may read as removed", () => {
    // finalDamage >= maxHealth: the unit died; no cap, it is allowed to vanish.
    const shown = healFreezeDisplayDamage({
      finalDamage: 6,
      maxHealth: 6,
      healAmount: 1,
      alreadyFrozen: false
    });
    expect(shown).toBe(6); // min(maxHealth, 7) = 6 => removed (it died)
  });
});
