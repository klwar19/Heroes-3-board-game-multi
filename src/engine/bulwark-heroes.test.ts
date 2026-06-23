import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import { cardLibrary } from "@/data/cards/library";
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
    // batch 2: Eikthurn (Chieftain/Might, Yetis) and Oidana (Elder/Magic, Diplomacy).
    expect(coreHeroDefinitions.eikthurn.class).toBe("Chieftain");
    expect(coreHeroDefinitions.eikthurn.type).toBe("might");
    expect(coreHeroDefinitions.oidana.class).toBe("Elder");
    expect(coreHeroDefinitions.oidana.type).toBe("magic");
  });

  it("each hero's starting ability and three specialties are real, implemented cards", () => {
    for (const id of heroIds) {
      const hero = coreHeroDefinitions[id];
      // cardLibrary is the runtime registry the engine/UI use; it includes the
      // extra ability cards (e.g. ability.diplomacy) that adventureCards omits.
      expect(cardLibrary[hero.startingAbilityCardId]?.kind, `${id} ability`).toBe("ability");
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

describe("Bulwark hero — Oidana the diplomat (Diplomacy + card draw)", () => {
  it("each level offers a scaling card draw (1 / 2 / 3) AND the map Diplomacy recruit", () => {
    for (const [id, amount] of [
      ["specialty.oidana.1", 1],
      ["specialty.oidana.4", 2],
      ["specialty.oidana.6", 3]
    ] as const) {
      const effect = adventureCards[id].effect as {
        type: string;
        options: { mapOnly?: boolean; effect: { type: string; amount?: number } }[];
      };
      expect(effect.type).toBe("CHOOSE_ONE");
      const draw = effect.options.find((option) => option.effect.type === "DRAW_CARDS");
      const diplomacy = effect.options.find((option) => option.effect.type === "DIPLOMACY_RECRUIT");
      expect(draw, `${id} draw option`).toBeTruthy();
      expect(draw!.effect.amount).toBe(amount);
      expect(diplomacy, `${id} diplomacy option`).toBeTruthy();
      expect(diplomacy!.mapOnly).toBe(true); // recruiting is a map play
    }
  });

  it("the card-draw option actually moves cards from deck to hand (IV draws 2)", () => {
    const state = createInitialGameState("oidana-draw");
    state.players.p1.hand = ["specialty.oidana.4"];
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const play = findPlay(state, "specialty.oidana.4", 0); // option 0 = Draw 2 cards
    expect(play, "Oidana IV's draw option should be playable as an instant").toBeTruthy();
    const after = applyOk(state, play!.action);
    // Two cards drawn deck -> hand; the played specialty leaves the hand.
    expect(after.players.p1.deck).toHaveLength(1);
    expect(after.players.p1.hand).toHaveLength(2);
  });

  it("her starting ability is the real, implemented Diplomacy ability", () => {
    expect(coreHeroDefinitions.oidana.startingAbilityCardId).toBe("ability.diplomacy");
    expect(cardLibrary["ability.diplomacy"]?.implementationStatus).toBe("implemented");
  });
});

describe("Bulwark heroes — PvP / multiplayer", () => {
  it("Oidana's card draw goes only to the casting player, never the opponent", () => {
    const state = createInitialGameState("oidana-pvp");
    state.players.p1.factionId = "bulwark";
    state.players.p2.factionId = "bulwark";
    state.players.p1.hand = ["specialty.oidana.6"];
    state.players.p1.deck = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p2.deck = ["spell.magic_arrow", "spell.magic_arrow"];
    const p2HandBefore = state.players.p2.hand.length;
    const p2DeckBefore = state.players.p2.deck.length;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const play = findPlay(state, "specialty.oidana.6", 0); // option 0 = Draw 3 cards
    expect(play, "Oidana VI's draw option should be playable").toBeTruthy();
    const after = applyOk(state, play!.action);
    // p1 drew 3 (the played specialty left hand); p2 is completely untouched.
    expect(after.players.p1.hand).toHaveLength(3);
    expect(after.players.p2.hand).toHaveLength(p2HandBefore);
    expect(after.players.p2.deck).toHaveLength(p2DeckBefore);
  });
});
