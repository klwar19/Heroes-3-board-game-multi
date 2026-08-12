import { describe, expect, it } from "vitest";

import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { abilityFxPlans } from "@/data/fx";
import { effectiveInitiative } from "./active-effects";
import { getArmyMapAbilities } from "./adventure";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { createInitialGameState } from "./index";
import { MGQ_JOBS, mgqEffectiveJob, mgqJobBaseAbilityIds, mgqJobsForUnit } from "./mgq-jobs";
import { getBonusUnitExperience } from "./unit-abilities";

describe("MGQ varied Job pools", () => {
  it("gives every recruitable monster Unemployed plus exactly four unique compatible Jobs", () => {
    const pools = Object.values(coreUnitDefinitions)
      .filter((unit) => unit.faction === "mgq" && !unit.summonOnly)
      .map((unit) => mgqJobsForUnit(unit.id));

    expect(pools.length).toBeGreaterThan(20);
    for (const pool of pools) {
      expect(pool).toHaveLength(5);
      expect(new Set(pool).size).toBe(5);
      expect(pool[0]).toBe("unemployed");
      expect(pool.every((job) => MGQ_JOBS.includes(job))).toBe(true);
    }
    expect(new Set(pools.map((pool) => [...pool].sort().join("|"))).size).toBe(pools.length);
  });

  it("uses advantage for Warrior and heal-only adjacent aid for Healer", () => {
    expect(mgqJobBaseAbilityIds("unemployed")).toEqual([]);
    expect(mgqJobBaseAbilityIds("warrior")).toEqual(["attack-roll-advantage"]);
    expect(mgqJobBaseAbilityIds("healer")).toEqual(["mgq-job-heal-adjacent"]);
    expect(mgqJobBaseAbilityIds("mage")).toEqual(["mgq-mage-magic-arrow"]);
    expect(mgqJobBaseAbilityIds("hunter")).toEqual(["mgq-hunter-low-roll-pierce"]);
    expect(unitAbilities["mgq-job-heal-adjacent"].effect).toEqual({
      type: "MGQ_WHITE_MAGIC_ACTION",
      healAmount: 1,
      attackBonus: 0
    });
    expect(abilityFxPlans["mgq-mage-magic-arrow"]).toMatchObject({
      projectile: "magic-arrow-projectile-0",
      hit: "magic-arrow-hit",
      sound: "spells/magic-arrow"
    });
  });

  it("starts every MGQ monster Unemployed with no inherited bonus", () => {
    expect(mgqEffectiveJob({ unitDefId: "mgq.sofia", side: "few", companion: false })).toBe("unemployed");
  });

  it("Noble contributes exactly +1 gold to the Resource-round map ability fold", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "mgq";
    state.players.p1.army = [{ id: "noble-sofia", unitDefId: "mgq.sofia", side: "few", job: "noble" }];
    expect(getArmyMapAbilities(state, "p1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ abilityId: "mgq-noble-income", effect: { type: "MAP_RESOURCE_ROUND_GAIN", resource: "gold", amount: 1 } })
    ]));
  });

  it("Hero rolls once and revives at 1 Health on 0", () => {
    const state = createInitialGameState("mgq-hero-job");
    const unit = state.combat!.units.unit_p1_marksmen;
    unit.variant = "few";
    unit.abilities = ["mgq-hero-rebirth"];
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;
    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.damage).toBe(unit.maxHealth - 1);
    expect(unit.usedRebirthThisCombat).toBe(true);
    expect(state.combat!.dice.rollCount).toBe(1);
  });

  it("Gadabout grants +1 survivor XP and Maid adjacency updates without sticky state", () => {
    const state = createInitialGameState("mgq-maid-job");
    const maid = state.combat!.units.unit_p1_marksmen;
    const ally = state.combat!.units.unit_p1_griffins;
    maid.abilities = ["mgq-maid-speed-aura"];
    maid.position = 9;
    ally.position = 10;
    const base = ally.initiative;
    expect(effectiveInitiative(ally, state.activeEffects, state.combat)).toBe(base + 2);
    ally.position = 19;
    expect(effectiveInitiative(ally, state.activeEffects, state.combat)).toBe(base);
    ally.position = 10;
    expect(effectiveInitiative(ally, state.activeEffects, state.combat)).toBe(base + 2);

    ally.abilities = ["mgq-gadabout-xp"];
    expect(getBonusUnitExperience(ally)).toBe(1);
  });
});
