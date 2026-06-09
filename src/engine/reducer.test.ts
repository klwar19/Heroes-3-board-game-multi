import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, findEvent, getLegalActions, getPlayerView } from "./index";
import type { GameAction } from "./state";

const castMagicArrow = {
  type: "CAST_SPELL",
  playerId: "p1",
  cardId: "spell.magic_arrow",
  target: { type: "unit", unitId: "unit_p2_pit_lords" }
} satisfies GameAction;

describe("rules engine prototype", () => {
  it("lists active-unit combat actions and spell actions for the active player", () => {
    const state = createInitialGameState();
    const legalActions = getLegalActions(state, "p1");
    const actionTypes = legalActions.map((item) => item.action.type);

    expect(state.combat?.activeUnitId).toBe("unit_p1_griffins");
    expect(actionTypes).toContain("ATTACK_UNIT");
    expect(actionTypes).toContain("MOVE_UNIT");
    expect(actionTypes).toContain("DEFEND_UNIT");
    expect(actionTypes).toContain("CAST_SPELL");
    expect(actionTypes).not.toContain("END_TURN");
  });

  it("opens a reaction window after a spell is cast", () => {
    const state = createInitialGameState();
    const result = applyAction(state, castMagicArrow);

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("reaction");
    expect(result.state.reactionWindow?.priorityPlayerId).toBe("p2");
    expect(result.state.stack[0]?.status).toBe("waiting-for-reaction");
    expect(findEvent(result.state, "SPELL_CAST_STARTED")).toBeDefined();
    expect(findEvent(result.state, "REACTION_WINDOW_OPENED")).toBeDefined();
  });

  it("resolves Magic Arrow damage after all reactions pass", () => {
    const casted = applyAction(createInitialGameState(), castMagicArrow).state;
    const result = applyAction(casted, { type: "PASS_REACTION", playerId: "p2" });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("combat");
    expect(result.state.reactionWindow).toBeNull();
    expect(result.state.stack).toEqual([]);
    expect(result.state.combat?.units.unit_p2_pit_lords.damage).toBe(2);
    expect(findEvent(result.state, "DAMAGE_ASSIGNED")).toMatchObject({
      amount: 2,
      damageKind: "spell"
    });
    expect(findEvent(result.state, "SPELL_CAST_RESOLVED")).toBeDefined();
  });

  it("ends combat when spell damage defeats the last opposing unit", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    state.combat.units.unit_p2_pit_lords.damage = 4;
    state.combat.units.unit_p2_magogs.damage = 3;

    const casted = applyAction(state, castMagicArrow).state;
    const result = applyAction(casted, { type: "PASS_REACTION", playerId: "p2" });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("game-over");
    expect(result.state.combat?.activeUnitId).toBeNull();
    expect(result.state.combat?.outcome).toEqual({
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2",
      reason: "all-enemy-units-defeated"
    });
    expect(getLegalActions(result.state, "p1")).toEqual([]);
    expect(findEvent(result.state, "COMBAT_ENDED")).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2"
    });
  });

  it("lets Resistance cancel a pending spell", () => {
    const casted = applyAction(createInitialGameState(), castMagicArrow).state;
    const result = applyAction(casted, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("combat");
    expect(result.state.reactionWindow).toBeNull();
    expect(result.state.stack).toEqual([]);
    expect(result.state.combat?.units.unit_p2_pit_lords.damage).toBe(0);
    expect(result.state.players.p2.discard).toContain("ability.resistance");
    expect(findEvent(result.state, "SPELL_CAST_CANCELLED")).toMatchObject({
      cancelledByPlayerId: "p2",
      cancelledByCardId: "ability.resistance"
    });
  });

  it("resolves a flying unit attack across the crossing lane", () => {
    const state = createInitialGameState();
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_pit_lords"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p2_pit_lords.damage).toBe(2);
    expect(result.state.combat?.units.unit_p1_griffins.damage).toBe(0);
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(findEvent(result.state, "RETALIATION_ATTACKED")).toBeUndefined();
  });

  it("ends combat when an attack defeats the last opposing unit", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    state.combat.units.unit_p2_pit_lords.damage = 5;
    state.combat.units.unit_p2_magogs.damage = 3;

    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_pit_lords"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.phase).toBe("game-over");
    expect(result.state.activePlayerId).toBe("p1");
    expect(result.state.combat?.outcome?.winnerPlayerId).toBe("p1");
    expect(result.state.combat?.activeUnitId).toBeNull();
  });

  it("lets the active unit move into the four-square crossing row", () => {
    const result = applyAction(createInitialGameState(), {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 9
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p1_griffins.position).toBe(9);
    expect(result.state.combat?.units.unit_p1_griffins.activatedThisRound).toBe(true);
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(findEvent(result.state, "UNIT_MOVED")).toMatchObject({
      unitId: "unit_p1_griffins",
      from: 5,
      to: 9
    });
  });

  it("requires non-flying units to use the crossing row before switching sides", () => {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }

    state.activePlayerId = "p2";
    state.combat.activeUnitId = "unit_p2_pit_lords";

    const illegalDirectCrossing = applyAction(state, {
      type: "MOVE_UNIT",
      playerId: "p2",
      unitId: "unit_p2_pit_lords",
      destination: 6
    });
    const legalLaneMove = applyAction(state, {
      type: "MOVE_UNIT",
      playerId: "p2",
      unitId: "unit_p2_pit_lords",
      destination: 10
    });

    expect(illegalDirectCrossing.errors).toEqual([
      {
        code: "ACTION_NOT_LEGAL",
        message: "That action is not legal in the current game state."
      }
    ]);
    expect(legalLaneMove.errors).toEqual([]);
    expect(legalLaneMove.state.combat?.units.unit_p2_pit_lords.position).toBe(10);
  });

  it("lets a unit defend and advances activation", () => {
    const result = applyAction(createInitialGameState(), {
      type: "DEFEND_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p1_griffins.defenseToken).toBe(true);
    expect(result.state.combat?.units.unit_p1_griffins.activatedThisRound).toBe(true);
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(findEvent(result.state, "UNIT_DEFENDED")).toBeDefined();
  });

  it("rejects illegal actions with a useful rules error", () => {
    const state = createInitialGameState();
    const result = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    expect(result.state).toBe(state);
    expect(result.errors).toEqual([
      {
        code: "ACTION_NOT_LEGAL",
        message: "That action is not legal in the current game state."
      }
    ]);
  });

  it("builds a player view without leaking opponent hands, deck order, or reaction choices", () => {
    const state = createInitialGameState();
    state.decks = {
      p1: {
        id: "p1",
        drawPile: ["spell.magic_arrow", "ability.resistance"],
        discardPile: ["spell.magic_arrow"]
      }
    };

    const casted = applyAction(state, castMagicArrow).state;
    const p1View = getPlayerView(casted, "p1");
    const p2View = getPlayerView(casted, "p2");

    expect(p1View.players.p1.hand).toEqual([]);
    expect(p1View.players.p1.handCount).toBe(0);
    expect(p1View.players.p2.hand).toEqual([]);
    expect(p1View.players.p2.handCount).toBe(1);
    expect(p1View.decks.p1.drawCount).toBe(2);
    expect(Object.hasOwn(p1View.decks.p1, "drawPile")).toBe(false);
    expect(p1View.reactionWindow?.legalReactions.p2).toBeUndefined();
    expect(p2View.reactionWindow?.legalReactions.p2?.[0]?.action).toEqual({
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance"
    });

    p2View.players.p2.hand.push("spell.magic_arrow");
    expect(casted.players.p2.hand).toEqual(["ability.resistance"]);
  });
});
