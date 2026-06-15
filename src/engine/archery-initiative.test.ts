import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { createInitialGameState } from "./index";
import { effectiveInitiative, makeActiveEffect } from "./active-effects";
import type { ActiveEffectDefinition, SourceRef } from "./state";

// Expert Archery (the card's expert side, sample.ts) grants the player's Ranged
// units "+1 attack vs non-adjacent AND +1 initiative until the end of the next
// combat round". The attack half always worked; the initiative half (a
// RANGED_INITIATIVE_BONUS modifier) was inert until effectiveInitiative learned
// to read it. These tests fail if that wiring is removed.

const archerySource: SourceRef = { type: "card", cardId: "ability.archery", controllerId: "p1" };

/** The Expert Archery active-effect definition, from the real card's expert side. */
function expertArchery(): ActiveEffectDefinition {
  const effect = cardLibrary["ability.archery"]?.effect;
  if (effect?.type !== "CREATE_ACTIVE_EFFECT" || !effect.expertEffect) {
    throw new Error("Expert Archery's CREATE_ACTIVE_EFFECT.expertEffect is missing");
  }
  return effect.expertEffect;
}

describe("Expert Archery — +1 initiative for Ranged units", () => {
  it("the card's expert side carries a RANGED_INITIATIVE_BONUS of +1", () => {
    const effect = cardLibrary["ability.archery"]?.effect;
    expect(effect?.type).toBe("CREATE_ACTIVE_EFFECT");
    if (effect?.type !== "CREATE_ACTIVE_EFFECT") {
      return;
    }
    const ranged = (effect.expertEffect?.modifiers ?? []).find(
      (modifier) => modifier.type === "RANGED_INITIATIVE_BONUS"
    );
    expect(ranged?.type === "RANGED_INITIATIVE_BONUS" && ranged.amount).toBe(1);
  });

  it("raises a Ranged unit's effective initiative but leaves a melee unit untouched", () => {
    const state = createInitialGameState();
    const ranged = state.combat!.units.unit_p1_crusaders;
    const ground = state.combat!.units.unit_p1_griffins;
    ranged.type = "ranged";
    ground.type = "ground";
    const rangedBase = ranged.initiative;
    const groundBase = ground.initiative;

    state.activeEffects.push(makeActiveEffect(state, expertArchery(), archerySource, "p1"));

    // The wiring under test: the +1 reaches the Ranged unit only.
    expect(effectiveInitiative(ranged, state.activeEffects)).toBe(rangedBase + 1);
    expect(effectiveInitiative(ground, state.activeEffects)).toBe(groundBase);
  });

  it("does not reach an enemy Ranged unit — the effect is the caster's own (player-scoped)", () => {
    const state = createInitialGameState();
    const enemyRanged = state.combat!.units.unit_p2_skeletons;
    enemyRanged.type = "ranged";
    const base = enemyRanged.initiative;

    state.activeEffects.push(makeActiveEffect(state, expertArchery(), archerySource, "p1"));

    expect(effectiveInitiative(enemyRanged, state.activeEffects)).toBe(base);
  });

  it("stacks additively with a Haste-style INITIATIVE_BONUS on the same Ranged unit", () => {
    const state = createInitialGameState();
    const ranged = state.combat!.units.unit_p1_crusaders;
    ranged.type = "ranged";
    const base = ranged.initiative;

    state.activeEffects.push(makeActiveEffect(state, expertArchery(), archerySource, "p1"));
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Haste",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          modifiers: [{ type: "INITIATIVE_BONUS", amount: 2 }]
        },
        { type: "system" },
        "p1",
        { type: "unit", unitId: ranged.id }
      )
    );

    expect(effectiveInitiative(ranged, state.activeEffects)).toBe(base + 3);
  });
});
