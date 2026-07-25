import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createInitialGameState, unitFlipSidePreview, type CombatUnitState } from "./index";

/**
 * "What does this Pack become?" — the read behind the Pack/Few side info shown on
 * the combat inspector and the enlarged card view. A Pack card that takes lethal
 * damage keeps fighting on its FEW side, so the player is told those numbers up
 * front instead of having to remember them.
 *
 * The preview must be the SAME numbers the real flip produces (it goes through
 * `applyUnitSideRules`, exactly like `applyUnitCurrentSide` does when the flip
 * happens), and must be absent for every card that never flips.
 */

/** A pack-side combat unit built from the shipped definition, like a real deploy. */
function packUnit(unitDefId: string, overrides: Partial<CombatUnitState> = {}): CombatUnitState {
  const def = coreUnitDefinitions[unitDefId];
  const side = def.pack!;
  const state = createInitialGameState("flip-preview");
  const unit = state.combat!.units.unit_p1_griffins;
  return {
    ...unit,
    unitDefId,
    variant: "pack",
    cardName: `Pack of ${def.name}`,
    attack: side.attack,
    defense: side.defense,
    maxHealth: side.health,
    initiative: side.initiative,
    type: side.type ?? def.type,
    abilities: [...(side.abilities ?? [])],
    ...overrides
  } as CombatUnitState;
}

describe("Pack card info: the Few side it flips to", () => {
  it("reports the Few side's printed stats, name and abilities", () => {
    const def = coreUnitDefinitions["castle.marksmen"];
    const flip = unitFlipSidePreview(packUnit("castle.marksmen"), "legacy");
    expect(flip).toBeTruthy();
    expect(flip!.cardName).toBe(`Few ${def.name}`);
    expect(flip!.attack).toBe(def.few!.attack);
    expect(flip!.defense).toBe(def.few!.defense);
    expect(flip!.health).toBe(def.few!.health);
    expect(flip!.initiative).toBe(def.few!.initiative);
    expect(flip!.abilities).toEqual(def.few!.abilities ?? []);
  });

  it("applies the mode's side tweaks, so the preview matches what the flip really gives (Griffins)", () => {
    // `griffin-buff` (BINH, default ON) fights the Few Griffins at Attack 3 —
    // printed 2. The preview must show the number the player will actually get.
    const printed = coreUnitDefinitions["castle.griffins"].few!.attack;
    expect(printed).toBe(2);
    expect(unitFlipSidePreview(packUnit("castle.griffins"), "legacy")!.attack).toBe(2);
    expect(unitFlipSidePreview(packUnit("castle.griffins"), "binh")!.attack).toBe(3);
    // An explicit override wins over the mode default, like everywhere else.
    expect(unitFlipSidePreview(packUnit("castle.griffins"), "binh", { griffinBuff: false })!.attack).toBe(2);
  });

  it("carries the per-side TYPE change (a Pack shooter reverting to a melee Few)", () => {
    // Storm Elementals shoot on their Pack side and fight in melee as a Few.
    const def = coreUnitDefinitions["conflux.storm_elementals"];
    const pack = packUnit("conflux.storm_elementals");
    expect(pack.type).toBe("ranged");
    const flip = unitFlipSidePreview(pack, "binh")!;
    expect(flip.type).toBe(def.few!.type ?? def.type);
    expect(flip.type).not.toBe("ranged");
  });

  it("is absent for every card that never flips", () => {
    // A Few side is already the last side.
    expect(unitFlipSidePreview(packUnit("castle.marksmen", { variant: "few" }), "binh")).toBeNull();
    // A Neutral card has no Few side to fall back to.
    expect(unitFlipSidePreview(packUnit("castle.marksmen", { variant: "neutral" }), "binh")).toBeNull();
    // Creature-Bank defenders and bosses fight from their own card.
    expect(unitFlipSidePreview(packUnit("castle.marksmen", { bankUnit: true }), "binh")).toBeNull();
    expect(unitFlipSidePreview(packUnit("castle.marksmen", { bossUnit: true }), "binh")).toBeNull();
    // Clones never flip (they are destroyed by any damage).
    expect(unitFlipSidePreview(packUnit("castle.marksmen", { cloneOfUnitId: "unit_x" }), "binh")).toBeNull();
    // A specialty cover (Sandro's Cloak) decides the stats while it is on top.
    expect(
      unitFlipSidePreview(
        packUnit("castle.marksmen", {
          transforms: [{ cardId: "specialty.sandro.1", name: "Horde of Skeletons", attack: 3, defense: 1, health: 3, initiative: 4 }]
        }),
        "binh"
      )
    ).toBeNull();
  });
});
