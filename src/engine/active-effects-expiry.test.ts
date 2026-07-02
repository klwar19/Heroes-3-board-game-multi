/**
 * Combat-end expiry invariant: NO combat-scoped effect survives the combat it
 * was made in. Combat rounds restart at 1 every battle, so a leaked
 * round-stamped effect (e.g. a `combat-rounds: 3` buff made in round 1 of a
 * fight that ended in round 1) would silently re-arm in the NEXT battle and
 * expire at ITS round 3 — a buff carried between fights.
 *
 * `combat-rounds` has no producer in today's content (the other kinds do) —
 * this pins the invariant so the FIRST card to use it cannot leak. The
 * durations that legitimately outlive a combat (permanent, current-turn,
 * current-game-round) are the CONTROL.
 */
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "@/engine";
import { expireEffectsForCombatEnd, makeActiveEffect } from "./active-effects";
import type { EffectDurationDefinition } from "./state";

function effectWith(duration: EffectDurationDefinition, name: string) {
  return {
    name,
    scope: "global" as const,
    modifiers: [{ type: "ATTACK_BONUS" as const, amount: 1 }],
    duration
  };
}

describe("expireEffectsForCombatEnd", () => {
  it("expires EVERY combat-scoped duration kind, and only those", () => {
    const state = createInitialGameState("combat-end-expiry");
    expect(state.combat?.round).toBe(1);

    const combatScoped: EffectDurationDefinition[] = [
      { type: "combat" },
      { type: "current-combat-round" },
      { type: "next-combat-round" },
      // The rounds:3 stamp (expiresAtCombatRoundEnd = 3) never arrives in a
      // fight that ends this round — combat end must still catch it.
      { type: "combat-rounds", rounds: 3 },
      { type: "current-activation" },
      { type: "next-activation" }
    ];
    const outlivesCombat: EffectDurationDefinition[] = [
      { type: "permanent" },
      { type: "current-turn" },
      { type: "current-game-round" }
    ];

    for (const duration of [...combatScoped, ...outlivesCombat]) {
      state.activeEffects.push(
        makeActiveEffect(
          state,
          effectWith(duration, duration.type),
          { type: "card", cardId: "test", controllerId: "p1" },
          "p1"
        )
      );
    }

    const expired = expireEffectsForCombatEnd(state);

    expect(expired.map((effect) => effect.name).sort()).toEqual(
      combatScoped.map((duration) => duration.type).sort()
    );
    expect(state.activeEffects.map((effect) => effect.name).sort()).toEqual(
      outlivesCombat.map((duration) => duration.type).sort()
    );
  });
});
