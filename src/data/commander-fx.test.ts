import { describe, expect, it } from "vitest";
import manifest from "../../public/sounds/manifest.json";
import { spellFxPlans } from "./fx";
import { commanderDefinitions, type CommanderSlug } from "./commanders";
import {
  COMMANDER_CAST_FALLBACK_FX,
  COMMANDER_CAST_FX_KEY,
  COMMANDER_SPECIALTY_SOUND,
  commanderCastFxPlan,
  commanderSpecialtySound,
  everyCommanderCastHasFx
} from "./commander-fx";

/**
 * Presentation wiring for WOG commander abilities (sfx + animation). These are
 * NOT gameplay-effect tests — behaviour is pinned in wog-commander-*.test.ts —
 * but they guard against a broken/missing FX mapping: a dead spell-plan key or a
 * sound file that does not exist would resolve to a silent, invisible cast.
 */

const soundKeys = new Set(Object.keys(manifest as Record<string, unknown>));

describe("commander ability presentation (fx + sfx)", () => {
  it("maps every commander's cast to a board FX plan", () => {
    expect(everyCommanderCastHasFx()).toBe(true);
    for (const slug of Object.keys(commanderDefinitions) as CommanderSlug[]) {
      expect(COMMANDER_CAST_FX_KEY[slug], slug).toBeTruthy();
    }
  });

  it("every mapped cast resolves to a real plan and a real sound", () => {
    for (const slug of Object.keys(commanderDefinitions) as CommanderSlug[]) {
      const plan = commanderCastFxPlan(slug);
      // A visible sprite/hit/tint OR at least an audible sound — never nothing.
      const visible = Boolean(plan.projectile || plan.hit || plan.affect?.length || plan.tint);
      expect(visible || Boolean(plan.sound), `${slug} has a visible or audible cue`).toBe(true);
      if (plan.sound) {
        expect(soundKeys.has(plan.sound), `${slug} sound ${plan.sound} exists`).toBe(true);
      }
    }
  });

  it("reuses the real spell plan when one exists, else the shimmer fallback", () => {
    // Brute's Bloodlust reuses the red battle-rage tint.
    expect(commanderCastFxPlan("brute")).toBe(spellFxPlans["spell.bloodlust"]);
    expect(commanderCastFxPlan("brute").tint).toBe("bloodlust");
    // Paladin's Cure reuses the cure shimmer.
    expect(commanderCastFxPlan("paladin")).toBe(spellFxPlans["spell.cure"]);
    // Soul Eater's Animate Dead uses the real Resurrection/Animate Dead sheet
    // (C01SPE0) — never the Prayer column — with the animate-dead cast sound.
    expect(spellFxPlans["spell.animate_dead"]).toBeTruthy();
    expect(commanderCastFxPlan("soul_eater")).toBe(spellFxPlans["spell.animate_dead"]);
    expect(commanderCastFxPlan("soul_eater").affect?.[0]?.key).toBe("resurrection");
    expect(commanderCastFxPlan("soul_eater").sound).toBe("spells/animate-dead");
  });

  it("gives the in-combat specialties a real sting and nothing to the rest", () => {
    for (const [specialtyId, sound] of Object.entries(COMMANDER_SPECIALTY_SOUND)) {
      expect(commanderSpecialtySound(specialtyId)).toBe(sound);
      expect(soundKeys.has(sound), `${specialtyId} sound ${sound} exists`).toBe(true);
    }
    // A specialty that never fires a combat trigger event has no sting.
    expect(commanderSpecialtySound("tinkerer")).toBeUndefined();
    expect(commanderSpecialtySound("soul-reformer")).toBeUndefined();
  });
});
