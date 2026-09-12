import { describe, expect, it } from "vitest";

import {
  createAdventureGameState,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  unitSideRuleOverrides
} from "./index";
import type { CombatUnitState, GameState } from "./state";

/**
 * USER RULING for the BINH house rule `phoenix-pack-rebirth`: "Phoenix Few AND
 * Pack can revive — it can revive as a Pack, THEN it can ALSO revive as a Few."
 * So the once-per-combat Rebirth latch is PER SIDE: one lethal save on the Pack
 * side, one more on the Few side after the knock-down flip, and no third.
 *
 * The fixture is a Legacy table that opts the rule in / leaves it out explicitly,
 * so each assertion is about the RULE, not about which mode defaults it on.
 */
function makeState(phoenixPackRebirth: boolean, seed: string): GameState {
  return createAdventureGameState({
    startingBuildings: [],
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "legacy",
    houseRules: { "phoenix-pack-rebirth": phoenixPackRebirth }
  });
}

function mintPackPhoenix(state: GameState, id: string): CombatUnitState {
  return makeCombatUnitFromArmy(
    { id: "phoenixes", unitDefId: "conflux.phoenixes", side: "pack" },
    "p1",
    id,
    0,
    "legacy",
    unitSideRuleOverrides(state)
  )!;
}

/** Deal exactly lethal damage to the unit's CURRENT health bar. */
function killingBlow(state: GameState, unit: CombatUnitState): void {
  unit.damage = unit.maxHealth;
  markUnitRemovedIfNeeded(state, unit);
}

function removals(state: GameState, unitId: string): number {
  return state.eventLog.filter((event) => event.type === "UNIT_REMOVED" && event.unitId === unitId)
    .length;
}

describe("phoenix-pack-rebirth: the Pack Rebirth does not consume the Few Rebirth", () => {
  it("ON: revives as a Pack, flips, then revives AGAIN as a Few, and only then dies", () => {
    const state = makeState(true, "phoenix-pack-then-few-on");
    const unit = mintPackPhoenix(state, "combat_phoenix_on");
    expect(unit.variant).toBe("pack");
    expect(unit.abilities).toContain("phoenix-rebirth");

    // 1) First lethal blow: the PACK side clings to life at 1 Health, still Pack.
    killingBlow(state, unit);
    expect(unit.variant, "Rebirth keeps the card on its Pack side").toBe("pack");
    expect(unit.damage).toBe(unit.maxHealth - 1);
    expect(removals(state, unit.id)).toBe(0);

    // 2) Second lethal blow: the Pack charge is spent, so the card flips to Few.
    killingBlow(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.cardName).toContain("Few");
    expect(unit.maxHealth).toBe(7); // printed Few Health (Pack prints 8)
    expect(unit.damage).toBe(0);
    expect(removals(state, unit.id)).toBe(0);

    // 3) THE PIN — the Few side has its OWN Rebirth. Before this fix the Pack
    //    save had already spent the single latch and this blow removed the unit.
    killingBlow(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.damage, "the Few side is reborn at 1 Health").toBe(unit.maxHealth - 1);
    expect(removals(state, unit.id), "still on the board after the Few Rebirth").toBe(0);

    // 4) Two saves is the maximum — one per side. The fourth blow removes it.
    killingBlow(state, unit);
    expect(removals(state, unit.id)).toBe(1);
    expect(unit.damage).toBeGreaterThanOrEqual(unit.maxHealth);
  });

  it("CONTROL (rule OFF): the Pack has no Rebirth — it flips, revives once as a Few, then dies", () => {
    const state = makeState(false, "phoenix-pack-then-few-off");
    const unit = mintPackPhoenix(state, "combat_phoenix_off");
    expect(unit.abilities, "printed Pack: line attack + Fire immunity only").not.toContain(
      "phoenix-rebirth"
    );

    // 1) No Pack save at all: the first lethal blow flips the card to Few.
    killingBlow(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.damage).toBe(0);
    expect(removals(state, unit.id)).toBe(0);

    // 2) The printed Few Rebirth fires once.
    killingBlow(state, unit);
    expect(unit.variant).toBe("few");
    expect(unit.damage).toBe(unit.maxHealth - 1);
    expect(removals(state, unit.id)).toBe(0);

    // 3) And it is spent — one save total with the rule off.
    killingBlow(state, unit);
    expect(removals(state, unit.id)).toBe(1);
  });

  it("CONTROL: a Few-only Phoenix (never a Pack) still gets exactly one Rebirth with the rule ON", () => {
    const state = makeState(true, "phoenix-few-only-on");
    const unit = makeCombatUnitFromArmy(
      { id: "phoenixes_few", unitDefId: "conflux.phoenixes", side: "few" },
      "p1",
      "combat_phoenix_few",
      0,
      "legacy",
      unitSideRuleOverrides(state)
    )!;
    expect(unit.variant).toBe("few");

    killingBlow(state, unit);
    expect(unit.damage).toBe(unit.maxHealth - 1);
    expect(removals(state, unit.id)).toBe(0);

    killingBlow(state, unit);
    expect(removals(state, unit.id), "no second charge without a Pack side to flip from").toBe(1);
  });
});
