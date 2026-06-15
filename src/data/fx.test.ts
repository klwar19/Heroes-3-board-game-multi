import { describe, expect, it } from "vitest";
import {
  abilityFxPlans,
  healFxPlans,
  MAX_PRESENTATION_MS,
  MAX_PROJECTILE_FLIGHT_MS,
  SINGLE_FRAME_FLASH_MS,
  soundDurationMs,
  spellFxPlans,
  spellPresentationMs,
  spriteDurationMs,
  type SpellFxPlan
} from "./fx";

describe("soundDurationMs", () => {
  it("reads measured MP3 lengths from the durations manifest", () => {
    // These come from public/sounds/durations.json (measured frame-by-frame).
    expect(soundDurationMs("spells/fireball-hit")).toBeGreaterThan(800);
    expect(soundDurationMs("spells/cure")).toBeGreaterThan(800);
  });

  it("is 0 for an unknown or missing key", () => {
    expect(soundDurationMs(undefined)).toBe(0);
    expect(soundDurationMs("spells/does-not-exist")).toBe(0);
  });
});

describe("spriteDurationMs", () => {
  it("derives duration from the sheet's frame count and fps", () => {
    // fireball: 13 frames at 15 fps ≈ 867ms.
    expect(spriteDurationMs("fireball")).toBe(Math.round((13 / 15) * 1000));
  });

  it("flashes a single-frame still for a fixed window", () => {
    // lightning-bolt is one tall frame; runSprite fades it instead of ticking.
    expect(spriteDurationMs("lightning-bolt")).toBe(SINGLE_FRAME_FLASH_MS);
  });

  it("is 0 for an unknown sprite", () => {
    expect(spriteDurationMs(undefined)).toBe(0);
    expect(spriteDurationMs("not-a-sheet")).toBe(0);
  });
});

/** Every sprite key a plan will draw on the table. */
function spritesOf(plan: SpellFxPlan): string[] {
  return [plan.projectile, plan.hit, ...(plan.affect ?? []).map((a) => a.key)].filter(
    (key): key is string => Boolean(key)
  );
}

/** The sound the plan actually plays, matching queueBoardFx's selection. */
function playedSound(plan: SpellFxPlan): string | undefined {
  if (plan.projectile) {
    return plan.hitSound ?? plan.sound; // cast at launch + hit at impact; hit is the later one
  }
  if (plan.hit) {
    return plan.hitSound ?? plan.sound;
  }
  return plan.sound; // affect / tint
}

describe("spellPresentationMs", () => {
  it("covers both the sprite and the sound for a bare hit spell (Fireball)", () => {
    const plan = spellFxPlans["spell.fireball"];
    const expected = Math.max(spriteDurationMs("fireball"), soundDurationMs("spells/fireball-hit"));
    expect(spellPresentationMs(plan)).toBe(expected);
    // Long enough that the explosion AND its boom finish before the damage shows
    // (the old hard-coded gate of 850ms cut the sound off).
    expect(spellPresentationMs(plan)).toBeGreaterThan(850);
  });

  it("waits out the flight, the hit sprite and the impact sound for a projectile (Magic Arrow)", () => {
    const plan = spellFxPlans["spell.magic_arrow"];
    expect(spellPresentationMs(plan)).toBeGreaterThanOrEqual(
      MAX_PROJECTILE_FLIGHT_MS + spriteDurationMs("magic-arrow-hit")
    );
  });

  it("waits out the longer of the bolt-flash and the crackle/sound (Lightning Bolt)", () => {
    const plan = spellFxPlans["spell.lightning_bolt"];
    // crackle is offset 220ms and runs 800ms; the sound is longer still.
    expect(spellPresentationMs(plan)).toBeGreaterThanOrEqual(soundDurationMs("spells/lightning-bolt"));
    expect(spellPresentationMs(plan)).toBeGreaterThan(950); // beats the old hard-coded affect gate
  });

  it("is 0 for a missing plan", () => {
    expect(spellPresentationMs(undefined)).toBe(0);
  });

  it("never exceeds the safety bound", () => {
    for (const plan of Object.values(spellFxPlans)) {
      expect(spellPresentationMs(plan)).toBeLessThanOrEqual(MAX_PRESENTATION_MS);
    }
  });

  it("always outlasts every sprite AND the sound the plan plays", () => {
    // This is the gate's contract: the damage / heal / death queued right after
    // the presentation can never land before any part of it has been seen/heard.
    const plans = [
      ...Object.values(spellFxPlans),
      ...Object.values(abilityFxPlans),
      ...Object.values(healFxPlans)
    ];
    for (const plan of plans) {
      const gate = spellPresentationMs(plan);
      for (const sprite of spritesOf(plan)) {
        expect(gate).toBeGreaterThanOrEqual(spriteDurationMs(sprite));
      }
      expect(gate).toBeGreaterThanOrEqual(soundDurationMs(playedSound(plan)));
    }
  });

  it("gives every damage/heal-bearing spell a non-zero gate", () => {
    // Buff/curse-only plans still animate, but the ones that can change a unit's
    // health must hold their result back behind a real presentation.
    for (const id of ["spell.fireball", "spell.magic_arrow", "spell.lightning_bolt", "spell.cure"]) {
      expect(spellPresentationMs(spellFxPlans[id])).toBeGreaterThan(0);
    }
  });
});

describe("healFxPlans", () => {
  it("gives the First Aid Tent a sprite + sound (it heals outside the spell flow)", () => {
    const plan = healFxPlans["war_machine.first_aid_tent"];
    expect(plan).toBeTruthy();
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    expect(plan.affect?.length).toBeGreaterThan(0);
    expect(plan.sound).toBeTruthy();
  });

  it("does not re-animate the Cure spell (which already animates as a cast)", () => {
    expect(healFxPlans["spell.cure"]).toBeUndefined();
  });
});
