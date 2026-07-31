import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createInitialGameState, getLegalActions } from "./index";
import { getUnitImmuneSpellSchools, unitImmuneToSpellSchools } from "./unit-abilities";
import type { CombatUnitState, GameState } from "./state";

/**
 * Elemental units are printed "Immune to Magic Arrow and <element> Magic
 * spells" (Magic Elementals: Magic Arrow only). That immunity must actually
 * block targeting by those Spells — previously it was only display text.
 */

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

describe("elemental spell-school immunity (helper)", () => {
  it("an Air Elemental is immune to Magic Arrow (any) and Air spells, not other schools", () => {
    const air = unitWith(["elemental-damage", "air-elemental-immunity"]);
    expect(getUnitImmuneSpellSchools(air).sort()).toEqual(["air", "any"]);
    expect(unitImmuneToSpellSchools(air, ["any"])).toBe(true); // Magic Arrow
    expect(unitImmuneToSpellSchools(air, ["air"])).toBe(true); // Air school
    expect(unitImmuneToSpellSchools(air, ["fire"])).toBe(false);
    expect(unitImmuneToSpellSchools(air, ["earth"])).toBe(false);
    expect(unitImmuneToSpellSchools(air, ["water"])).toBe(false);
  });

  it("a Magic Elemental is immune to Magic Arrow only, never a school", () => {
    const magic = unitWith(["elemental-damage", "magic-elemental-immunity"]);
    expect(getUnitImmuneSpellSchools(magic)).toEqual(["any"]);
    expect(unitImmuneToSpellSchools(magic, ["any"])).toBe(true);
    for (const school of ["air", "earth", "fire", "water"] as const) {
      expect(unitImmuneToSpellSchools(magic, [school])).toBe(false);
    }
  });

  it("an ordinary unit is never immune by this trait", () => {
    const ordinary = unitWith(["lich-death-cloud"]);
    expect(getUnitImmuneSpellSchools(ordinary)).toEqual([]);
    expect(unitImmuneToSpellSchools(ordinary, ["any"])).toBe(false);
    expect(unitImmuneToSpellSchools(ordinary, ["fire"])).toBe(false);
  });

  it("treats an empty or absent school list as not immune", () => {
    const air = unitWith(["air-elemental-immunity"]);
    expect(unitImmuneToSpellSchools(air, [])).toBe(false);
    expect(unitImmuneToSpellSchools(air, undefined)).toBe(false);
  });
});

describe("every printed Elemental carries its immunity ability", () => {
  const expected: Record<string, string> = {
    "conflux.air_elementals": "air-elemental-immunity",
    "neutral.air_elementals": "air-elemental-immunity",
    "conflux.earth_elementals": "earth-elemental-immunity",
    "neutral.storm_elementals": "air-elemental-immunity",
    "neutral.earth_elementals": "earth-elemental-immunity",
    "conflux.fire_elementals": "fire-elemental-immunity",
    "neutral.magma_elementals": "earth-elemental-immunity",
    "neutral.fire_elementals": "fire-elemental-immunity",
    "neutral.energy_elementals": "fire-elemental-immunity",
    "conflux.water_elementals": "water-elemental-immunity",
    "neutral.water_elementals": "water-elemental-immunity",
    "neutral.ice_elementals": "water-elemental-immunity",
    "neutral.magic_elementals": "magic-elemental-immunity"
  };

  for (const [unitId, abilityId] of Object.entries(expected)) {
    it(`${unitId} has ${abilityId} on every side`, () => {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeTruthy();
      for (const side of [def.few, def.pack, def.neutral]) {
        if (!side) {
          continue;
        }
        expect(side.abilities ?? [], `${unitId} side`).toContain(abilityId);
        // The elemental-damage trait stays alongside the immunity.
        expect(side.abilities ?? [], `${unitId} side`).toContain("elemental-damage");
      }
    });
  }
});

/** Make a p2 combat unit an Elemental and let p1's active unit cast spells. */
function combatWithEnemyElemental(immunity: string): GameState {
  const state = createInitialGameState("elem-immunity-seed");
  state.combat!.units.unit_p2_skeletons.abilities = ["elemental-damage", immunity];
  state.players.p1.hand = ["spell.magic_arrow", "spell.lightning_bolt", "spell.curse"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  return state;
}

function spellTargets(state: GameState, cardId: string): string[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
    .flatMap((legal) =>
      legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? [legal.action.target.unitId] : []
    );
}

describe("elemental immunity blocks spell targeting in combat", () => {
  it("Magic Arrow (any) and Lightning Bolt (air) cannot target an Air Elemental", () => {
    const state = combatWithEnemyElemental("air-elemental-immunity");
    // The Air Elemental (skeletons) is excluded from both immune Spells…
    expect(spellTargets(state, "spell.magic_arrow")).not.toContain("unit_p2_skeletons");
    expect(spellTargets(state, "spell.lightning_bolt")).not.toContain("unit_p2_skeletons");
    // …while an ordinary enemy stays a legal target for both.
    expect(spellTargets(state, "spell.magic_arrow")).toContain("unit_p2_vampires");
    expect(spellTargets(state, "spell.lightning_bolt")).toContain("unit_p2_vampires");
  });

  it("immunity is school-specific: a Magic Elemental blocks Magic Arrow but not an Air spell", () => {
    const state = combatWithEnemyElemental("magic-elemental-immunity");
    // Magic Arrow (school "any") is blocked…
    expect(spellTargets(state, "spell.magic_arrow")).not.toContain("unit_p2_skeletons");
    // …but Lightning Bolt (Air) is NOT — Magic Elementals are immune to Magic
    // Arrow only, never to a school. This proves the immunity is not blanket.
    expect(spellTargets(state, "spell.lightning_bolt")).toContain("unit_p2_skeletons");
  });
});
