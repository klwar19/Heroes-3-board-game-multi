import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type { FactionId } from "@/data/factions/types";
import type { GameAction, GameState } from "./state";

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
  const heroIds = ["dhuin", "creyle", "glacius", "kriv"] as const;

  it("registers four Bulwark heroes (two Chieftains, two Elders)", () => {
    for (const id of heroIds) {
      expect(coreHeroDefinitions[id]?.faction, id).toBe("bulwark");
    }
    expect(coreHeroDefinitions.dhuin.class).toBe("Chieftain");
    expect(coreHeroDefinitions.dhuin.type).toBe("might");
    expect(coreHeroDefinitions.creyle.class).toBe("Chieftain");
    expect(coreHeroDefinitions.glacius.class).toBe("Elder");
    expect(coreHeroDefinitions.glacius.type).toBe("magic");
    expect(coreHeroDefinitions.kriv.class).toBe("Elder");
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
