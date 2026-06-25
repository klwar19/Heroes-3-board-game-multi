import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { adventureCards } from "@/data/cards/adventure";
import { coreHeroDefinitions } from "@/data/factions/core";
import { getUnitTokens, tokenAttackBonus } from "./tokens";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Casmetra (Cove, Navigator/Wisdom) — the Sorceresses specialist. I and IV reuse
 * the shared creature-buff helpers (doubling for a Sorceresses unit, exactly like
 * Cassiopeia's Oceanids). VI is a CHOICE — place the Cove Sorceresses' −2 Weakness
 * token on any unit (the new PLACE_WEAKNESS_TOKEN effect) OR an instant FLAT +2
 * attack (NO Sorceresses doubling). Every assertion fails if the wiring is removed.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

/** A combat with p1 active (Griffins ready to act), hand set by the caller. */
function casmetraCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["specialty.casmetra.6"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

describe("Casmetra — the doubling rule (I/IV double for Sorceresses, VI's +2 does NOT)", () => {
  it("I doubles its +attack/+defense for Sorceresses", () => {
    const card = adventureCards["specialty.casmetra.1"];
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;
    for (const option of card.effect.options) {
      expect(option.effect).toMatchObject({ type: "ADD_COMBAT_STAT", doubleForUnitName: "Sorceresses" });
    }
  });

  it("IV doubles its +initiative for Sorceresses", () => {
    // House rule (BINH): IV is now a CHOOSE_ONE — option A is the initiative buff
    // (which also grants +1 Combat movement), option B draws a card.
    const four = adventureCards["specialty.casmetra.4"].effect as { options: { effect: unknown }[] };
    expect(four.options[0].effect).toMatchObject({
      type: "CREATE_INITIATIVE_BUFF",
      doubleForUnitName: "Sorceresses",
      movementBonus: 1
    });
  });

  it("VI option B is a FLAT +2 attack with NO Sorceresses doubling", () => {
    const card = adventureCards["specialty.casmetra.6"];
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;
    const attack = card.effect.options.find((option) => option.effect.type === "ADD_COMBAT_STAT");
    expect(attack?.effect).toMatchObject({ type: "ADD_COMBAT_STAT", stat: "attack", amount: 2 });
    // The decision: it must NOT carry doubleForUnitName (that would make it +4 for Sorceresses).
    expect(attack?.effect && "doubleForUnitName" in attack.effect).toBe(false);
  });

  it("VI option A is the −2 Weakness token for 2 rounds", () => {
    const card = adventureCards["specialty.casmetra.6"];
    if (card.effect.type !== "CHOOSE_ONE") throw new Error("VI should be a CHOOSE_ONE");
    const token = card.effect.options.find((option) => option.effect.type === "PLACE_WEAKNESS_TOKEN");
    expect(token?.effect).toMatchObject({ type: "PLACE_WEAKNESS_TOKEN", amount: -2, rounds: 2 });
    expect(token?.target).toMatchObject({ type: "any-unit" });
  });
});

describe("Casmetra VI option A — placing the Weakness token", () => {
  it("drops a −2 Weakness token on the chosen enemy unit", () => {
    const state = casmetraCombat("casmetra-vi-weakness");
    const before = state.combat!.units.unit_p2_skeletons;
    expect(getUnitTokens(before).some((token) => token.kind === "weakness")).toBe(false); // control

    const play = findPlay(state, "specialty.casmetra.6", 0, "unit_p2_skeletons");
    expect(play, "VI option A should target an enemy unit").toBeTruthy();
    const after = passAllReactions(applyOk(state, play!.action));

    const target = after.combat!.units.unit_p2_skeletons;
    expect(getUnitTokens(target).find((token) => token.kind === "weakness")?.amount).toBe(-2);
    expect(tokenAttackBonus(target)).toBe(-2); // the token reduces the unit's attack by 2
  });

  it("can target ANY unit — even one of your own (any-unit), not just enemies", () => {
    const state = casmetraCombat("casmetra-vi-any");
    const play = findPlay(state, "specialty.casmetra.6", 0, "unit_p1_crusaders");
    expect(play, "any-unit targeting should also offer a friendly unit").toBeTruthy();
  });

  it("control: option B is an attack-declared reaction, so it is NOT a free token-placing play", () => {
    const card = adventureCards["specialty.casmetra.6"];
    if (card.effect.type !== "CHOOSE_ONE") throw new Error("VI should be a CHOOSE_ONE");
    const attack = card.effect.options.find((option) => option.effect.type === "ADD_COMBAT_STAT");
    expect(attack?.trigger).toMatchObject({ event: "UNIT_ATTACK_DECLARED", controller: "self" });
    // With no attack waiting to resolve, option B is not offered as a free play
    // (only option A, the token, is a direct combat play).
    const state = casmetraCombat("casmetra-vi-optionB");
    expect(findPlay(state, "specialty.casmetra.6", 1)).toBeFalsy();
  });
});

describe("Casmetra — registration", () => {
  it("is a Cove Navigator (Wisdom) with the Sorceresses I/IV/VI specialty", () => {
    const hero = coreHeroDefinitions.casmetra;
    expect(hero).toBeDefined();
    expect(hero.faction).toBe("cove");
    expect(hero.class).toBe("Navigator");
    expect(hero.type).toBe("magic");
    expect(hero.startingAbilityCardId).toBe("ability.wisdom");
    expect(hero.specialtyCardIds).toEqual({
      1: "specialty.casmetra.1",
      4: "specialty.casmetra.4",
      6: "specialty.casmetra.6"
    });
  });
});
