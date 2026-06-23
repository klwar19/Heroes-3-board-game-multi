import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { effectiveInitiative } from "./active-effects";
import { coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type { FactionId } from "@/data/factions/types";
import type { ActiveEffectModifier, GameAction, GameState, UnitId } from "./state";

/**
 * Bulwark heroes. The genuinely NEW engine code is Kriv's GAIN_RUNES specialty
 * effect, so it gets a behavioural test (banks Runes for a Bulwark caster; the
 * option is not even offered to anyone else). Dhuin/Creyle reuse the tested
 * unit-specialist factories and Glacius reuses Adelaide's Frost-Ring area
 * damage, so those are guarded at the wiring level.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

/** A PLAY_CARD legal action for `cardId` targeting a specific unit. */
function findUnitPlay(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

/** Net total of a given active-effect modifier kind sitting on one unit. */
function modifierTotalOn(state: GameState, unitId: UnitId, kind: ActiveEffectModifier["type"]): number {
  let total = 0;
  for (const effect of state.activeEffects) {
    if (effect.target?.type !== "unit" || effect.target.unitId !== unitId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === kind && "amount" in modifier) {
        total += modifier.amount;
      }
    }
  }
  return total;
}

/** Combat sandbox with p1 holding Kriv's level-I specialty; faction varies. */
function krivCombat(seed: string, faction: FactionId): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.factionId = faction;
  state.players.p1.hand = ["specialty.kriv.1"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

describe("Bulwark hero — Kriv's rune-synergy specialty", () => {
  it("banks 2 Runes for a Bulwark caster played in combat", () => {
    const state = krivCombat("kriv-banks", "bulwark");
    const play = findPlay(state, "specialty.kriv.1", 0);
    expect(play, "the Gain-2-Runes option should be offered to a Bulwark caster in combat").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.runes?.p1?.count).toBe(2);
  });

  it("offers the rune option ONLY to a Bulwark caster (control: castle)", () => {
    const state = krivCombat("kriv-control", "castle");
    expect(findPlay(state, "specialty.kriv.1", 0)).toBeFalsy();
    // And the rune count never moves for a non-Bulwark player.
    expect(state.combat!.runes?.p1).toBeUndefined();
  });
});

describe("Bulwark heroes — roster & specialty wiring", () => {
  const heroIds = ["dhuin", "creyle", "glacius", "kriv", "eikthurn", "oidana"] as const;

  it("registers six Bulwark heroes (three Chieftains, three Elders)", () => {
    for (const id of heroIds) {
      expect(coreHeroDefinitions[id]?.faction, id).toBe("bulwark");
    }
    const byClass = heroIds.reduce<Record<string, number>>((acc, id) => {
      const klass = coreHeroDefinitions[id].class;
      acc[klass] = (acc[klass] ?? 0) + 1;
      return acc;
    }, {});
    expect(byClass).toEqual({ Chieftain: 3, Elder: 3 });
    expect(coreHeroDefinitions.dhuin.class).toBe("Chieftain");
    expect(coreHeroDefinitions.dhuin.type).toBe("might");
    expect(coreHeroDefinitions.creyle.class).toBe("Chieftain");
    expect(coreHeroDefinitions.glacius.class).toBe("Elder");
    expect(coreHeroDefinitions.glacius.type).toBe("magic");
    expect(coreHeroDefinitions.kriv.class).toBe("Elder");
    // batch 2: Eikthurn (Chieftain/Might, Yetis) and Oidana (Elder/Magic, Slow).
    expect(coreHeroDefinitions.eikthurn.class).toBe("Chieftain");
    expect(coreHeroDefinitions.eikthurn.type).toBe("might");
    expect(coreHeroDefinitions.oidana.class).toBe("Elder");
    expect(coreHeroDefinitions.oidana.type).toBe("magic");
  });

  it("each hero's starting ability and three specialties are real, implemented cards", () => {
    for (const id of heroIds) {
      const hero = coreHeroDefinitions[id];
      expect(adventureCards[hero.startingAbilityCardId]?.kind, `${id} ability`).toBe("ability");
      for (const specialtyId of Object.values(hero.specialtyCardIds)) {
        const card = adventureCards[specialtyId];
        expect(card, specialtyId).toBeTruthy();
        expect(card.implementationStatus, specialtyId).toBe("implemented");
      }
    }
  });

  it("Dhuin doubles Snow Elves; Creyle doubles Mammoths", () => {
    const dhuin1 = adventureCards["specialty.dhuin.1"].effect as { options: { effect: unknown }[] };
    expect(dhuin1.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Snow Elves" });
    expect(adventureCards["specialty.dhuin.6"].effect).toMatchObject({
      type: "CREATE_INITIATIVE_BUFF",
      doubleForUnitName: "Snow Elves"
    });
    const creyle1 = adventureCards["specialty.creyle.1"].effect as { options: { effect: unknown }[] };
    expect(creyle1.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Mammoths" });
    expect(adventureCards["specialty.creyle.4"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      doubleForUnitName: "Mammoths"
    });
  });

  it("Glacius is the Frost Ring caster — the ring spares the centre", () => {
    for (const [id, amount] of [
      ["specialty.glacius.1", 1],
      ["specialty.glacius.6", 2]
    ] as const) {
      const effect = adventureCards[id].effect as { options: { effect: unknown }[] };
      expect(effect.options[0].effect).toMatchObject({
        type: "AREA_DAMAGE_PICK_ADJACENT",
        amount,
        includeCenter: false
      });
    }
  });

  it("each of Kriv's three specialties carries a scaling GAIN_RUNES option", () => {
    for (const [id, amount] of [
      ["specialty.kriv.1", 2],
      ["specialty.kriv.4", 3],
      ["specialty.kriv.6", 4]
    ] as const) {
      const effect = adventureCards[id].effect as { options: { effect: { type: string; amount?: number } }[] };
      const runeOption = effect.options.find((option) => option.effect.type === "GAIN_RUNES");
      expect(runeOption, id).toBeTruthy();
      expect(runeOption!.effect.amount).toBe(amount);
    }
  });
});

describe("Bulwark hero — Eikthurn's Yetis specialty (Yetis doubled)", () => {
  it("IV adds +1 max HP, doubled (+2) on a Yetis unit", () => {
    const state = createInitialGameState("eik-iv-yeti");
    state.players.p1.hand = ["specialty.eikthurn.4"];
    const yeti = state.combat!.units.unit_p1_crusaders;
    yeti.name = "Yetis";
    const before = yeti.maxHealth;
    const play = findUnitPlay(state, "specialty.eikthurn.4", "unit_p1_crusaders");
    expect(play, "Eikthurn IV should target a friendly unit").toBeTruthy();
    expect(applyOk(state, play!.action).combat!.units.unit_p1_crusaders.maxHealth).toBe(before + 2);
  });

  it("IV adds only +1 max HP on a non-Yetis unit (control)", () => {
    const state = createInitialGameState("eik-iv-other");
    state.players.p1.hand = ["specialty.eikthurn.4"];
    const before = state.combat!.units.unit_p1_griffins.maxHealth;
    const play = findUnitPlay(state, "specialty.eikthurn.4", "unit_p1_griffins");
    expect(play, "Eikthurn IV should be playable").toBeTruthy();
    expect(applyOk(state, play!.action).combat!.units.unit_p1_griffins.maxHealth).toBe(before + 1);
  });

  it("VI's initiative buff is doubled (+2) on a Yetis unit", () => {
    const state = createInitialGameState("eik-vi");
    state.players.p1.hand = ["specialty.eikthurn.6"];
    state.combat!.units.unit_p1_crusaders.name = "Yetis";
    const play = findUnitPlay(state, "specialty.eikthurn.6", "unit_p1_crusaders");
    expect(play, "Eikthurn VI should be playable on a friendly unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(modifierTotalOn(next, "unit_p1_crusaders", "INITIATIVE_BONUS")).toBe(2);
  });

  it("wires all three levels to the Yetis signature unit", () => {
    const one = adventureCards["specialty.eikthurn.1"].effect as { options: { effect: unknown }[] };
    expect(one.options[0].effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Yetis" });
    expect(adventureCards["specialty.eikthurn.4"].effect).toMatchObject({
      type: "ADD_UNIT_MAX_HEALTH",
      doubleForUnitName: "Yetis"
    });
    expect(adventureCards["specialty.eikthurn.6"].effect).toMatchObject({
      type: "CREATE_INITIATIVE_BUFF",
      doubleForUnitName: "Yetis"
    });
  });
});

describe("Bulwark hero — Oidana's frost Slow specialty", () => {
  it("level I drops the targeted enemy unit's Initiative by 2", () => {
    const state = createInitialGameState("oidana-i");
    state.players.p1.hand = ["specialty.oidana.1"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    const before = effectiveInitiative(target, state.activeEffects);
    const play = findUnitPlay(state, "specialty.oidana.1", "unit_p2_skeletons");
    expect(play, "Oidana I should target an enemy unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    expect(modifierTotalOn(next, "unit_p2_skeletons", "INITIATIVE_BONUS")).toBe(-2);
    expect(effectiveInitiative(next.combat!.units.unit_p2_skeletons, next.activeEffects)).toBe(before - 2);
  });

  it("each level deepens the Slow (−2 / −3 / −4) as a negative, removable Initiative debuff", () => {
    for (const [id, amount] of [
      ["specialty.oidana.1", -2],
      ["specialty.oidana.4", -3],
      ["specialty.oidana.6", -4]
    ] as const) {
      expect(adventureCards[id].effect).toMatchObject({
        type: "CREATE_INITIATIVE_BUFF",
        amount,
        polarity: "negative",
        removable: true
      });
    }
  });
});

describe("Bulwark heroes — PvP / multiplayer", () => {
  it("Oidana's Slow lands only on the targeted enemy unit, never the caster's own army", () => {
    const state = createInitialGameState("oidana-pvp");
    state.players.p1.hand = ["specialty.oidana.4"];
    state.players.p2.hand = [];
    const play = findUnitPlay(state, "specialty.oidana.4", "unit_p2_skeletons");
    expect(play, "Oidana IV should target the enemy unit").toBeTruthy();
    const next = applyOk(state, play!.action);
    // The targeted p2 unit is slowed by 3…
    expect(modifierTotalOn(next, "unit_p2_skeletons", "INITIATIVE_BONUS")).toBe(-3);
    // …while the caster's own units are untouched (no leak across the p1/p2 line).
    expect(modifierTotalOn(next, "unit_p1_marksmen", "INITIATIVE_BONUS")).toBe(0);
    expect(modifierTotalOn(next, "unit_p1_crusaders", "INITIATIVE_BONUS")).toBe(0);
  });
});
