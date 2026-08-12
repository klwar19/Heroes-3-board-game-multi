import { describe, expect, it } from "vitest";
import { getMainHero } from "./adventure";
import { createInitialGameState } from "./index";
import { mgqContractedSpirits, seedMgqSpiritsForCombat } from "./mgq-spirits";
import type { GameState, MgqSpirit } from "./state";

function spiritState(selected: MgqSpirit, level = 1): GameState {
  const state = createInitialGameState();
  state.players.p1.factionId = "mgq";
  state.players.p1.mgqSpirit = selected;
  const hero = getMainHero(state, "p1");
  if (hero) hero.level = level;
  return state;
}

describe("MGQ — Four Spirits summons", () => {
  it("makes all four choices innate without a Shrine contract", () => {
    const state = spiritState("sylph");
    expect(mgqContractedSpirits(state, "p1")).toEqual(["sylph", "gnome", "undine", "salamander"]);
    expect(mgqContractedSpirits(state, "p2")).toEqual([]);
  });

  it("summons the basic face at levels 1–3", () => {
    const state = spiritState("undine", 3);
    seedMgqSpiritsForCombat(state);
    const spirit = state.combat!.units.unit_p1_spirit_undine;
    expect(spirit).toMatchObject({ attack: 2, defense: 0, maxHealth: 4, initiative: 5, variant: "few", summoned: true, temporary: true });
    expect(spirit.abilities).toContain("mgq-undine-heal-1");
  });

  it("summons the advanced face at levels 4–7", () => {
    const state = spiritState("salamander", 4);
    seedMgqSpiritsForCombat(state);
    const spirit = state.combat!.units.unit_p1_spirit_salamander;
    expect(spirit).toMatchObject({ attack: 4, defense: 1, maxHealth: 4, initiative: 7, variant: "pack" });
    expect(spirit.abilities).toEqual(expect.arrayContaining(["champion-roll-two-dice", "champion-reroll-minus"]));
  });

  it("advanced Sylph grants +1 Initiative to other friendly troops for the combat", () => {
    const state = spiritState("sylph", 7);
    seedMgqSpiritsForCombat(state);
    expect(state.combat!.units.unit_p1_spirit_sylph.initiative).toBe(15);
    const boostedIds = state.activeEffects.filter((effect) => effect.name === "Sylph — Wind Swiftness").map((effect) => effect.target?.type === "unit" ? effect.target.unitId : null);
    expect(boostedIds).not.toContain("unit_p1_spirit_sylph");
    expect(boostedIds.some(Boolean)).toBe(true);
    expect(state.activeEffects.filter((effect) => effect.name === "Sylph — Wind Swiftness").every((effect) => effect.duration.type === "combat")).toBe(true);
  });
});

describe("MGQ spirit selection gate", () => {
  it("does not silently summon Sylph before the player chooses", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "mgq";
    delete state.players.p1.mgqSpirit;
    seedMgqSpiritsForCombat(state);
    expect(state.combat!.mgqSpirits).toEqual({});
    expect(Object.keys(state.combat!.units).some((id) => id.includes("spirit_sylph"))).toBe(false);
  });
});
