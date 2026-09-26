// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInitialGameState, makeActiveEffect, type GameState } from "@/engine";
import { placeCombatToken } from "@/engine/tokens";
import { playedCardStatGlows, statBuffGlows } from "./stat-glow";

/** A deep copy (game states are plain JSON). */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Two frames of the same combat: `prior` as it was, `next` to be changed by the test. */
function frames(seed: string): { prior: GameState; next: GameState; unitId: string } {
  const prior = createInitialGameState(seed);
  const next = clone(prior);
  return { prior, next, unitId: "unit_p1_crusaders" };
}

function buff(state: GameState, unitId: string, modifiers: Parameters<typeof makeActiveEffect>[1]["modifiers"]) {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      { name: "Test buff", scope: "unit", duration: { type: "combat" }, polarity: "positive", modifiers },
      { type: "system" },
      state.combat!.units[unitId].controllerId,
      { type: "unit", unitId }
    )
  );
}

describe("statBuffGlows (hex sprite / board card buff glow)", () => {
  it("glows each stat a newly created effect raises — and nothing on an unchanged frame (CONTROL)", () => {
    const { prior, next, unitId } = frames("stat-glow-effect");
    expect(statBuffGlows(prior, clone(prior)).size, "CONTROL: an unchanged frame glows nothing").toBe(0);
    buff(next, unitId, [
      { type: "ATTACK_BONUS", amount: 1 },
      { type: "INITIATIVE_BONUS", amount: 1 }
    ]);
    const glows = statBuffGlows(prior, next);
    expect(glows.get(unitId)).toEqual(["attack", "speed"]);
    // Only the buffed unit glows.
    expect([...glows.keys()]).toEqual([unitId]);
  });

  it("an effect that already existed in the previous frame never glows again", () => {
    const { prior, unitId } = frames("stat-glow-old-effect");
    buff(prior, unitId, [{ type: "DEFENSE_BONUS", amount: 2 }]);
    const next = clone(prior);
    expect(statBuffGlows(prior, next).size).toBe(0);
  });

  it("a new Attack token glows red (CONTROL for the token path)", () => {
    const { prior, next, unitId } = frames("stat-glow-attack-token");
    placeCombatToken(next, next.combat!.units[unitId], "attack", 1, "Test token");
    expect(statBuffGlows(prior, next).get(unitId)).toEqual(["attack"]);
  });

  it("a Weakness or Corrosion token ending is a debuff ending, not a buff: no glow", () => {
    const { prior, unitId } = frames("stat-glow-debuff-token-ends");
    placeCombatToken(prior, prior.combat!.units[unitId], "weakness", -1, "Test weakness");
    placeCombatToken(prior, prior.combat!.units[unitId], "corrosion", -1, "Test corrosion");
    expect(prior.combat!.units[unitId].tokens?.length, "both debuff tokens are on the unit").toBe(2);
    const next = clone(prior);
    next.combat!.units[unitId].tokens = [];
    expect(statBuffGlows(prior, next).get(unitId)).toBeUndefined();
  });

  it("does not glow across different combats' unit tables, nor without a previous frame", () => {
    const { prior, next, unitId } = frames("stat-glow-new-combat");
    placeCombatToken(next, next.combat!.units[unitId], "attack", 1, "Test token");
    expect(statBuffGlows(null, next).size).toBe(0);
    next.combat!.id = `${next.combat!.id}-other`;
    expect(statBuffGlows(prior, next).size).toBe(0);
  });

  it("the combat's first snapshot shows buffs already in play without a glow (CONTROL: the same buff mid-combat glows)", () => {
    const { prior, next, unitId } = frames("stat-glow-first-snapshot");
    buff(next, unitId, [{ type: "ATTACK_BONUS", amount: 1 }]);
    expect(statBuffGlows(prior, next).get(unitId), "CONTROL: observed during the combat").toEqual(["attack"]);
    // The frame before the combat view appeared (the adventure map: no combat).
    const beforeCombat = clone(prior);
    beforeCombat.combat = null;
    expect(statBuffGlows(beforeCombat, next).size).toBe(0);
    // Switching to another battle's view: its buffs are its starting picture.
    const otherBattle = clone(next);
    otherBattle.combat!.id = `${otherBattle.combat!.id}-other`;
    expect(statBuffGlows(prior, otherBattle).size).toBe(0);
  });
});

describe("playedCardStatGlows (attack-window ADD_COMBAT_STAT cards)", () => {
  it("reads the raised stat from the card's effect, or the CHOOSE_ONE side that was played", () => {
    expect(playedCardStatGlows({ effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 } }, undefined)).toEqual([
      "attack"
    ]);
    expect(
      playedCardStatGlows({ effect: { type: "ADD_COMBAT_STAT", stat: "defense", amountByPower: { 1: 1, 2: 2 } } }, undefined)
    ).toEqual(["defense"]);
    const prayer = {
      effect: {
        type: "CHOOSE_ONE",
        options: [
          { label: "Attack", effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: 1 } },
          { label: "Defense", effect: { type: "ADD_COMBAT_STAT", stat: "defense", amount: 1 } }
        ]
      }
    };
    expect(playedCardStatGlows(prayer, "Defense")).toEqual(["defense"]);
    expect(playedCardStatGlows(prayer, "Attack")).toEqual(["attack"]);
  });

  it("a lowering stat card, another effect or no card glows nothing", () => {
    expect(playedCardStatGlows({ effect: { type: "ADD_COMBAT_STAT", stat: "attack", amount: -1 } }, undefined)).toEqual([]);
    expect(playedCardStatGlows({ effect: { type: "DAMAGE", amount: 2 } }, undefined)).toEqual([]);
    expect(playedCardStatGlows(undefined, undefined)).toEqual([]);
  });
});
