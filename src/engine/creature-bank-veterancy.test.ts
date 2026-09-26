/**
 * Creature-Bank veteran ranks (user 2026-09-26). Bank cards reuse Neutral unit
 * ids but print a different card, so a Crypt Skeleton (prints Rebirth) and a
 * Treasury Dwarf (prints a Stacked Defense token) follow a bank-only track.
 * Every assertion is paired with a CONTROL where the old rule would differ.
 */
import { describe, expect, it } from "vitest";
import { rankScheduleFor } from "@/data/units/experience-rank-abilities";
import { createInitialGameState } from "./index";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { getActiveDefenseBonus } from "./active-effects";
import { armyCardRankScheduleSide, combatUnitRankScheduleSide, unitRankAbilityIds } from "./unit-experience";
import { NEUTRAL_PLAYER_ID } from "./state";

describe("Creature-Bank veteran track", () => {
  it("Crypt Skeletons R4 = Reborn Guard on the bank track; the Neutral card keeps Veteran Rebirth", () => {
    expect(rankScheduleFor("neutral.skeletons", "bank")[4]).toMatchObject({ kind: "ability", choices: ["veteran-rebirth-guard"] });
    // CONTROL: the regular Neutral Skeletons card (no printed Rebirth) is unchanged.
    expect(rankScheduleFor("neutral.skeletons", "neutral")[4]).toMatchObject({ choices: ["veteran-rebirth"] });
    expect(rankScheduleFor("neutral.skeletons", "faction")[4]).toMatchObject({ choices: ["veteran-rebirth"] });
    // Ranks 1-3 are shared with the unit's own track.
    for (const rank of [1, 2, 3] as const) {
      expect(rankScheduleFor("neutral.skeletons", "bank")[rank]).toEqual(rankScheduleFor("neutral.skeletons", "faction")[rank]);
    }
  });

  it("Treasury Dwarves R3 = Spell Resistance (-1 Spell damage) on the bank track; the Neutral card keeps Runic Backlash", () => {
    expect(rankScheduleFor("neutral.dwarves", "bank")[3]).toMatchObject({ kind: "ability", choices: ["reduce-spell-damage-1"] });
    // CONTROL: the regular Neutral Dwarves card is unchanged.
    expect(rankScheduleFor("neutral.dwarves", "neutral")[3]).toMatchObject({ choices: ["ntv-runic-backlash"] });
    expect(unitRankAbilityIds("neutral.dwarves", 4, undefined, "bank")).toContain("reduce-spell-damage-1");
    expect(unitRankAbilityIds("neutral.dwarves", 4, undefined, "bank")).not.toContain("ntv-runic-backlash");
  });

  it("bank defenders and won bank cards follow the bank track; everything else resolves as before", () => {
    expect(combatUnitRankScheduleSide({ controllerId: NEUTRAL_PLAYER_ID, bankUnit: true, unitDefId: "neutral.skeletons" })).toBe("bank");
    expect(combatUnitRankScheduleSide({ controllerId: "p1", variant: "neutral", bankUnit: true, unitDefId: "neutral.dwarves" })).toBe("bank");
    expect(armyCardRankScheduleSide({ side: "bank", unitDefId: "neutral.skeletons" })).toBe("bank");
    // CONTROLS: a plain Neutral guard, a bank card without its own ranks, a recruited Neutral card.
    expect(combatUnitRankScheduleSide({ controllerId: NEUTRAL_PLAYER_ID, unitDefId: "neutral.skeletons" })).toBe("neutral");
    expect(combatUnitRankScheduleSide({ controllerId: NEUTRAL_PLAYER_ID, bankUnit: true, unitDefId: "neutral.zombies" })).toBe("neutral");
    expect(combatUnitRankScheduleSide({ controllerId: "p1", variant: "neutral", bankUnit: true, unitDefId: "neutral.zombies" })).toBe("faction");
    expect(armyCardRankScheduleSide({ side: "neutral", unitDefId: "neutral.skeletons" })).toBe("neutral");
    expect(armyCardRankScheduleSide({ side: "bank", unitDefId: "neutral.griffins" })).toBe("faction");
  });

  it("Reborn Guard: the printed Rebirth save grants +1 Defense for the rest of the combat", () => {
    const withGuard = createInitialGameState("bank-skeleton-reborn-guard");
    const skeleton = withGuard.combat!.units.unit_p2_skeletons;
    skeleton.abilities = ["phoenix-rebirth", "veteran-rebirth-guard"];
    skeleton.damage = skeleton.maxHealth; // lethal hit
    expect(getActiveDefenseBonus(withGuard, skeleton)).toBe(0);
    markUnitRemovedIfNeeded(withGuard, skeleton);
    expect(skeleton.damage).toBe(skeleton.maxHealth - 1); // Rebirth saved it at 1 Health
    expect(getActiveDefenseBonus(withGuard, skeleton)).toBe(1);
    expect(withGuard.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "veteran-rebirth-guard")).toBe(true);

    // CONTROL: the same save without Reborn Guard grants no Defense.
    const plain = createInitialGameState("bank-skeleton-reborn-guard");
    const plainSkeleton = plain.combat!.units.unit_p2_skeletons;
    plainSkeleton.abilities = ["phoenix-rebirth"];
    plainSkeleton.damage = plainSkeleton.maxHealth;
    markUnitRemovedIfNeeded(plain, plainSkeleton);
    expect(plainSkeleton.damage).toBe(plainSkeleton.maxHealth - 1);
    expect(getActiveDefenseBonus(plain, plainSkeleton)).toBe(0);
  });

  it("Reborn Guard alone never saves the unit (it rides on an existing Rebirth)", () => {
    const state = createInitialGameState("bank-skeleton-no-rebirth");
    const skeleton = state.combat!.units.unit_p2_skeletons;
    skeleton.abilities = ["veteran-rebirth-guard"];
    skeleton.damage = skeleton.maxHealth;
    markUnitRemovedIfNeeded(state, skeleton);
    expect(getActiveDefenseBonus(state, skeleton)).toBe(0);
    expect(state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "veteran-rebirth-guard")).toBe(false);
  });
});
