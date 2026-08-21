import { describe, expect, it } from "vitest";

import { spellFxPlans } from "./fx";
import { ENEMY_FORCE_FX_KEY, enemyForceFxPlan } from "./enemy-force-fx";
import { ENEMY_FORCE_CARD_POOL } from "@/engine/enemy-force";

/**
 * The presentation sweep for PvE ENEMY FORCE card plays — the guard the deleted
 * `monster-spell-fx.test.ts` provided for the removed rotation.
 *
 * A play has no dice, no window and no card leaving a hand, so its reused H3
 * sprite + sound is the ONLY thing that animates it. A pool entry whose FX key
 * does not resolve would resolve silently in a real fight, which is precisely
 * the "decorative" failure mode this file exists to prevent.
 */
describe("enemy-force FX", () => {
  it("every pool card maps to a LIVE spellFxPlans entry", () => {
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      const key = ENEMY_FORCE_FX_KEY[entry.cardId];
      expect(key, `${entry.cardId} has no FX key`).toBeTruthy();
      expect(spellFxPlans[key], `${entry.cardId} → ${key} is not a live plan`).toBeTruthy();
    }
  });

  it("the map is DERIVED from the pool — it can never fall out of sync", () => {
    expect(Object.keys(ENEMY_FORCE_FX_KEY).sort()).toEqual(
      ENEMY_FORCE_CARD_POOL.map((entry) => entry.cardId).sort()
    );
  });

  it("every resolved plan carries something the player can actually perceive", () => {
    for (const entry of ENEMY_FORCE_CARD_POOL) {
      const plan = enemyForceFxPlan(entry.cardId);
      const perceivable = Boolean(
        plan.sound || plan.projectile || plan.hit || plan.tint || plan.affect?.length
      );
      expect(perceivable, `${entry.cardId} resolves to an imperceptible plan`).toBe(true);
    }
  });

  it("an unknown card still gets an audible fallback rather than silence", () => {
    const plan = enemyForceFxPlan("card.does_not_exist");
    expect(plan.sound).toBeTruthy();
  });
});
