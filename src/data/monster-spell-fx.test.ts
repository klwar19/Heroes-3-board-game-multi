import { describe, expect, it } from "vitest";
import manifest from "../../public/sounds/manifest.json";
import { spellFxPlans, spellPresentationMs } from "./fx";
import { MONSTER_SPELLS, type MonsterSpellId } from "./anime/monster-spells";
import {
  MONSTER_SPELL_FALLBACK_FX,
  MONSTER_SPELL_FX_KEY,
  everyMonsterSpellHasFx,
  monsterSpellFxPlan
} from "./monster-spell-fx";

/**
 * PvE monster CASTER presentation (fx + sfx). These are NOT gameplay tests —
 * the casts' behaviour is pinned in `src/engine/monster-spells.test.ts` — but
 * they guard the mapping: a new `MonsterSpellId`, a dead `spellFxPlans` key or a
 * sound file that does not exist would resolve to a silent, invisible cast, and
 * that is exactly the bug this presentation layer exists to fix.
 */

const soundKeys = new Set(Object.keys(manifest as Record<string, unknown>));
const spellIds = Object.keys(MONSTER_SPELLS) as MonsterSpellId[];

describe("monster spell presentation (fx + sfx)", () => {
  it("maps EVERY shipped monster spell to a live FX plan (the sweep)", () => {
    expect(spellIds.length).toBeGreaterThan(0);
    expect(everyMonsterSpellHasFx()).toBe(true);
    for (const id of spellIds) {
      const key = MONSTER_SPELL_FX_KEY[id];
      expect(key, `${id} has an FX key`).toBeTruthy();
      expect(spellFxPlans[key], `${id} → ${key} is a real spell plan`).toBeTruthy();
      // The plan resolved for this id IS that spell's plan — never the fallback.
      expect(monsterSpellFxPlan(id)).toBe(spellFxPlans[key]);
    }
  });

  it("mutation check: an UNMAPPED spell id fails the sweep and takes the fallback", () => {
    // The sweep is only meaningful if a hole actually fails it. Simulate the
    // "someone adds a 7th spell and forgets the FX" case by asking for one.
    expect(MONSTER_SPELL_FX_KEY["not_a_spell" as MonsterSpellId]).toBeUndefined();
    expect(monsterSpellFxPlan("not_a_spell")).toBe(MONSTER_SPELL_FALLBACK_FX);
    // ...and by breaking a real mapping: the sweep goes false.
    const saved = MONSTER_SPELL_FX_KEY[spellIds[0]];
    (MONSTER_SPELL_FX_KEY as Record<string, string>)[spellIds[0]] = "spell.does_not_exist";
    try {
      expect(everyMonsterSpellHasFx()).toBe(false);
    } finally {
      (MONSTER_SPELL_FX_KEY as Record<string, string>)[spellIds[0]] = saved;
    }
    expect(everyMonsterSpellHasFx()).toBe(true);
  });

  it("every mapped cast is both VISIBLE and AUDIBLE, with a real sound file", () => {
    for (const id of spellIds) {
      const plan = monsterSpellFxPlan(id);
      const visible = Boolean(plan.projectile || plan.hit || plan.affect?.length || plan.tint);
      expect(visible, `${id} has a sprite/tint`).toBe(true);
      expect(plan.sound, `${id} has a sound`).toBeTruthy();
      expect(soundKeys.has(plan.sound as string), `${id} sound ${plan.sound} exists`).toBe(true);
    }
    // The safety-net fallback must itself be playable.
    expect(soundKeys.has(MONSTER_SPELL_FALLBACK_FX.sound as string)).toBe(true);
  });

  it("every plan holds the board back long enough to be seen and heard", () => {
    // `queueBoardFx` advances the presentation timeline by this gate, so the
    // damage/heal a cast causes can never land before its sprite has played.
    for (const id of spellIds) {
      expect(spellPresentationMs(monsterSpellFxPlan(id)), id).toBeGreaterThan(0);
    }
  });

  it("reuses the H3 spell whose meaning matches (no new media)", () => {
    expect(monsterSpellFxPlan("shadow_bolt")).toBe(spellFxPlans["spell.magic_arrow"]);
    expect(monsterSpellFxPlan("chill_of_the_deep")).toBe(spellFxPlans["spell.slow"]);
    expect(monsterSpellFxPlan("withering_curse")).toBe(spellFxPlans["spell.curse"]);
    expect(monsterSpellFxPlan("mend_flesh")).toBe(spellFxPlans["spell.cure"]);
    expect(monsterSpellFxPlan("siphon_thought")).toBe(spellFxPlans["spell.forgetfulness"]);
    expect(monsterSpellFxPlan("ward_of_ash")).toBe(spellFxPlans["spell.stone_skin"]);
  });
});
