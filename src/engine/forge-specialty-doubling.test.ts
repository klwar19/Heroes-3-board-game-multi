import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import type { CombatUnitState, EffectDefinition } from "./state";
import { specialtyCombatStatMultiplier, unitBelongsToFaction } from "./specialty-unit-name";

/**
 * Dark Mullich's Overclock I: "The effect doubles for ground units." The
 * doubling keys off the unit's TYPE. Each assertion pairs a ground unit with a
 * CONTROL (a ranged unit — even a Forge one) so removing the type check makes
 * the ground case fail while the control still passes.
 */
function unit(unitDefId: string, name: string, type: "ground" | "ranged"): CombatUnitState {
  return { id: `u_${name}`, name, unitDefId, type } as unknown as CombatUnitState;
}

type StatEffect = Extract<EffectDefinition, { type: "ADD_COMBAT_STAT" }>;

function mullichAttackOption(): StatEffect {
  const card = cardLibrary["specialty.dark_mullich.1"];
  if (!card || card.effect.type !== "CHOOSE_ONE") throw new Error("Overclock I missing");
  const option = card.effect.options.find((entry) => entry.effect.type === "ADD_COMBAT_STAT");
  if (!option || option.effect.type !== "ADD_COMBAT_STAT") throw new Error("attack side missing");
  return option.effect;
}

describe("Ground doubling (Dark Mullich Overclock I)", () => {
  const state = { combat: null, activeEffects: [] };
  const castleHalberdiers = unit("castle.halberdiers", "Halberdiers", "ground");
  const forgeGrunts = unit("forge.grunts", "Grunts", "ranged");
  const defender = unit("castle.marksmen", "Marksmen", "ranged");

  it("still recognises a Forge unit by its definition id prefix (shared helper)", () => {
    expect(unitBelongsToFaction(forgeGrunts, "forge")).toBe(true);
    expect(unitBelongsToFaction(castleHalberdiers, "forge")).toBe(false);
  });

  it("doubles the +1 Attack side for a ground attacker but not for a ranged Forge CONTROL", () => {
    const effect = mullichAttackOption();
    expect(effect.doubleForUnitType).toBe("ground");
    expect(effect.doubleForUnitFaction).toBeUndefined();
    expect(specialtyCombatStatMultiplier(state, effect, castleHalberdiers, defender)).toBe(2);
    expect(specialtyCombatStatMultiplier(state, effect, forgeGrunts, defender)).toBe(1);
  });
});
