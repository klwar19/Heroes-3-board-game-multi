import { describe, expect, it } from "vitest";

import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { expireEffectsForCombatRoundEnd, unitHasVirtualDefenseToken } from "./active-effects";
import { imperiumSpecialtyCards } from "@/data/warhammer/imperium-specialties";
import { isImplementedCardEffect } from "./effects";
import type { GameAction, GameEvent, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passReactions(state: GameState): GameState {
  let current = state;
  for (let safety = 30; current.reactionWindow && safety > 0; safety -= 1) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function dornDefenseBonus(adjacentAllyAlive: boolean): number | undefined {
  const state = createInitialGameState(`dorn-measured-bulwark-${adjacentAllyAlive}`);
  state.players.p1.hand = ["specialty.rogal_dorn.1"];
  state.players.p2.hand = [];
  const defender = state.combat!.units.unit_p1_griffins;
  const ally = state.combat!.units.unit_p1_marksmen;
  const attacker = state.combat!.units.unit_p2_skeletons;
  Object.assign(defender, { position: 9, defense: 0, maxHealth: 40, damage: 0, abilities: [] });
  Object.assign(ally, { position: 8, damage: adjacentAllyAlive ? 0 : ally.maxHealth });
  Object.assign(attacker, { position: 13, attack: 4, abilities: [], activatedThisRound: false });
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId === "p1" && unit.id !== defender.id && unit.id !== ally.id) unit.damage = unit.maxHealth;
  }
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = attacker.id;
  let current = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: defender.id });
  const reaction = (current.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.rogal_dorn.1"
  );
  expect(reaction).toBeTruthy();
  current = passReactions(applyOk(current, reaction!.action));
  return [...current.eventLog].reverse().find(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && event.attackerId === attacker.id && !event.isRetaliation
  )?.defenseBonus;
}

describe("Imperium specialty mechanics", () => {
  it("registers every option of all twelve cards as an implemented engine effect", () => {
    for (const card of Object.values(imperiumSpecialtyCards)) {
      expect(isImplementedCardEffect(card.effect), card.id).toBe(true);
    }
  });

  it("Measured Bulwark rewards formation: +2 beside a living ally, otherwise +1", () => {
    expect(dornDefenseBonus(true)).toBe(2);
    expect(dornDefenseBonus(false)).toBe(1);
  });

  it("Fortress Protocol grants virtual Defense tokens to the army for this round only", () => {
    let state = createInitialGameState("dorn-fortress-protocol");
    state.players.p1.hand = ["specialty.rogal_dorn.6"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(state.combat!.units)) unit.defenseToken = false;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.rogal_dorn.6" && legal.action.optionIndex === 0
    );
    expect(play).toBeTruthy();
    state = applyOk(state, play!.action);

    expect(unitHasVirtualDefenseToken(state, state.combat!.units.unit_p1_griffins)).toBe(true);
    expect(unitHasVirtualDefenseToken(state, state.combat!.units.unit_p1_marksmen)).toBe(true);
    expect(unitHasVirtualDefenseToken(state, state.combat!.units.unit_p2_skeletons)).toBe(false);
    expect(Object.values(state.combat!.units).every((unit) => unit.defenseToken === false)).toBe(true);

    expireEffectsForCombatRoundEnd(state, state.combat!.round);
    expect(unitHasVirtualDefenseToken(state, state.combat!.units.unit_p1_griffins)).toBe(false);
  });

  it("Winged Assault moves exactly one adjacent space without causing an attack or Retaliation", () => {
    let state = createInitialGameState("sanguinius-winged-assault");
    state.players.p1.hand = ["specialty.sanguinius.1"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    const unit = state.combat!.units.unit_p1_marksmen;
    unit.position = 1;
    unit.damage = 0;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.sanguinius.1" &&
        legal.action.optionIndex === 0 &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === unit.id
    );
    expect(play).toBeTruthy();
    state = applyOk(state, play!.action);
    expect(state.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-step" });
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.step) throw new Error("Expected Winged Assault move choice.");
    const destinationIndex = choice.step.positions.findIndex((position) => position === 0);
    expect(destinationIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: destinationIndex });

    expect(state.combat!.units[unit.id].position).toBe(0);
    expect(state.combat!.units[unit.id].damage).toBe(0);
    expect(state.eventLog.some((event) => event.type === "RETALIATION_ATTACKED" && event.attackerId === unit.id)).toBe(false);
    expect(state.eventLog.some((event) => event.type === "ATTACK_ROLLED" && event.attackerId === unit.id)).toBe(false);
  });

  it("offers the defensive and anytime Instant specialties during an enemy attack", () => {
    let state = createInitialGameState("imperium-instant-defense-window");
    state.players.p1.hand = [
      "specialty.emperor_of_mankind.1",
      "specialty.emperor_of_mankind.4",
      "specialty.roboute_guilliman.4",
      "specialty.rogal_dorn.1",
      "specialty.sanguinius.1"
    ];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    const defender = state.combat!.units.unit_p1_griffins;
    Object.assign(attacker, { position: 13, abilities: [], activatedThisRound: false });
    Object.assign(defender, { position: 9, damage: 1, maxHealth: 30, abilities: [] });
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = attacker.id;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: defender.id });

    const offers = (state.reactionWindow?.legalReactions.p1 ?? [])
      .filter((legal) => legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD")
      .map((legal) =>
        legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD"
          ? `${legal.action.cardId}:${legal.action.optionIndex ?? "base"}`
          : ""
      );
    expect(offers).toContain("specialty.emperor_of_mankind.1:0");
    expect(offers).toContain("specialty.emperor_of_mankind.4:0");
    expect(offers).toContain("specialty.emperor_of_mankind.4:1");
    expect(offers).toContain("specialty.roboute_guilliman.4:1");
    expect(offers).toContain("specialty.rogal_dorn.1:base");
    expect(offers).toContain("specialty.sanguinius.1:0");
  });

  it("offers the offensive Instant specialties during your declared attack", () => {
    let state = createInitialGameState("imperium-instant-attack-window");
    state.players.p1.hand = [
      "specialty.roboute_guilliman.4",
      "specialty.sanguinius.1",
      "specialty.sanguinius.6"
    ];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    const defender = state.combat!.units.unit_p2_skeletons;
    Object.assign(attacker, { position: 9, damage: 2, maxHealth: 30, abilities: [], activatedThisRound: false });
    Object.assign(defender, { position: 13, defense: 0, maxHealth: 30, abilities: [] });
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id });
    if (state.reactionWindow?.priorityPlayerId === "p2") {
      state = applyOk(state, { type: "PASS_REACTION", playerId: "p2" });
    }
    const offers = (state.reactionWindow?.legalReactions.p1 ?? [])
      .filter((legal) => legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD")
      .map((legal) =>
        legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD"
          ? `${legal.action.cardId}:${legal.action.optionIndex ?? "base"}`
          : ""
      );
    expect(offers).toContain("specialty.roboute_guilliman.4:0");
    expect(offers).toContain("specialty.sanguinius.1:1");
    expect(offers).toContain("specialty.sanguinius.6:base");
  });

  it("offers Emperor's Tarot's Power side during an actual Spell cast", () => {
    let state = createInitialGameState("emperor-tarot-spell-window");
    state.players.p1.hand = ["spell.magic_arrow", "specialty.emperor_of_mankind.1"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast).toBeTruthy();
    state = applyOk(state, cast!.action);
    const offers = state.reactionWindow?.legalReactions.p1 ?? [];
    expect(offers.some(
      (legal) => legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.emperor_of_mankind.1" &&
        legal.action.optionIndex === 1
    )).toBe(true);
  });

  it.each([
    ["specialty.emperor_of_mankind.6", 0, undefined],
    ["specialty.roboute_guilliman.6", undefined, "unit_p1_marksmen"],
    ["specialty.rogal_dorn.4", undefined, "unit_p1_marksmen"],
    ["specialty.rogal_dorn.6", 0, undefined],
    ["specialty.sanguinius.4", undefined, "unit_p1_marksmen"]
  ] as const)("%s creates its real Ongoing effect", (cardId, optionIndex, targetUnitId) => {
    let state = createInitialGameState(`ongoing-${cardId}`);
    state.players.p1.hand = [cardId];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    const play = getLegalActions(state, "p1").find((legal) => {
      if (legal.action.type !== "PLAY_CARD" || legal.action.cardId !== cardId) return false;
      if (legal.action.optionIndex !== optionIndex) return false;
      if (!targetUnitId) return true;
      return legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId;
    });
    expect(play).toBeTruthy();
    const before = state.activeEffects.length;
    state = applyOk(state, play!.action);
    expect(state.activeEffects.length).toBe(before + 1);
    expect(state.activeEffects.at(-1)?.source.type).toBe("card");
  });

  it("Logistics of Ultramar I offers exactly +1 Material or draw 2 then discard 1", () => {
    const makeState = (seed: string) => {
      const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
      for (const player of Object.values(state.players)) {
        player.canMulligan = false;
        player.needsHandRefresh = false;
      }
      state.phase = "map";
      state.activePlayerId = "p1";
      state.players.p1.hand = ["specialty.roboute_guilliman.1"];
      state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
      return state;
    };

    let material = makeState("ultramar-material");
    const goldBefore = material.players.p1.resources.gold;
    const materialBefore = material.players.p1.resources.buildingMaterials;
    const materialPlay = getLegalActions(material, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.roboute_guilliman.1" && legal.action.optionIndex === 0
    );
    expect(materialPlay).toBeTruthy();
    material = applyOk(material, materialPlay!.action);
    expect(material.players.p1.resources.buildingMaterials).toBe(materialBefore + 1);
    expect(material.players.p1.resources.gold).toBe(goldBefore);

    let briefing = makeState("ultramar-briefing");
    const deckBefore = briefing.players.p1.deck.length;
    const briefingPlay = getLegalActions(briefing, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.roboute_guilliman.1" && legal.action.optionIndex === 1
    );
    expect(briefingPlay).toBeTruthy();
    briefing = applyOk(briefing, briefingPlay!.action);
    expect(briefing.players.p1.deck.length).toBe(deckBefore - 2);
    const discard = getLegalActions(briefing, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION");
    expect(discard).toBeTruthy();
    briefing = applyOk(briefing, discard!.action);
    expect(briefing.players.p1.hand).toHaveLength(1);
  });
});
