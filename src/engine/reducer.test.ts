import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, findEvent, getLegalActions } from "./index";
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

  it("resolves unit attacks with defense and adjacent retaliation", () => {
    const state = createInitialGameState();
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_pit_lords"
    });

    expect(result.errors).toEqual([]);
    expect(result.state.combat?.units.unit_p2_pit_lords.damage).toBe(2);
    expect(result.state.combat?.units.unit_p1_griffins.damage).toBe(4);
    expect(result.state.combat?.activeUnitId).toBe("unit_p1_elves");
    expect(findEvent(result.state, "RETALIATION_ATTACKED")).toMatchObject({
      attackerId: "unit_p2_pit_lords",
      defenderId: "unit_p1_griffins"
    });
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
});

