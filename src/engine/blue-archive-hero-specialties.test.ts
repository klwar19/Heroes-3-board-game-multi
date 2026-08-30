import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { unitAttackRollFixedMinusOne } from "./active-effects";
import type { GameAction, GameState, UnitId } from "./state";
import { adventureCards } from "../data/cards/adventure";

const ATTACKER: UnitId = "unit_p2_skeletons";
const DEFENDER: UnitId = "unit_p1_griffins";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function playOn(state: GameState, cardId: string, targetId: UnitId): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === targetId
  );
  expect(play, `${cardId} should be playable on ${targetId}`).toBeTruthy();
  return applyOk(state, play!.action);
}

function resolveIncomingAttack(state: GameState): GameState {
  const combat = state.combat!;
  combat.units[ATTACKER].position = 9;
  combat.units[DEFENDER].position = 13;
  combat.units[ATTACKER].maxHealth = 50;
  combat.units[DEFENDER].maxHealth = 50;
  combat.units[ATTACKER].attackedThisActivation = false;
  combat.activeUnitId = ATTACKER;
  combat.dice.scriptedRolls = [1, 1, 1, 1];
  combat.dice.rollCount = 0;
  state.activePlayerId = "p2";
  state.players.p2.hand = [];
  let next = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: ATTACKER,
    defenderId: DEFENDER
  });
  let guard = 30;
  while (next.reactionWindow && guard-- > 0) {
    next = applyOk(next, {
      type: "PASS_REACTION",
      playerId: next.reactionWindow.priorityPlayerId
    });
  }
  return next;
}

describe("Blue Archive bespoke specialty mechanics", () => {
  it("assigns approved card art to all 15 Blue Archive specialties", () => {
    for (const hero of ["mika", "yuuka", "seia", "chise", "kei"] as const) {
      for (const [level, fileLevel] of [[1, "i"], [4, "iv"], [6, "vi"]] as const) {
        const card = adventureCards[`specialty.${hero}_blue_archive.${level}`];
        expect(card.assets?.cardImage).toBe(
          `/assets/anime/cards/blue-archive/approved-style/${hero}-${fileLevel}.webp`
        );
      }
    }
  });

  it("keeps the corrected Yuuka, Seia, and Chise card definitions", () => {
    expect(adventureCards["specialty.yuuka_blue_archive.4"].target).toEqual({ type: "any-unit" });
    expect(adventureCards["specialty.seia_blue_archive.6"].target).toEqual({ type: "any-unit" });

    const seiaIv = adventureCards["specialty.seia_blue_archive.4"];
    expect(seiaIv.effect.type).toBe("CHOOSE_ONE");
    if (seiaIv.effect.type === "CHOOSE_ONE") {
      for (const option of seiaIv.effect.options) {
        expect(option.effect).toMatchObject({
          type: "REMOVE_HAND_CARD_THEN_SEARCH",
          count: 3,
          filter: "removable"
        });
        if (option.effect.type === "REMOVE_HAND_CARD_THEN_SEARCH") {
          expect(option.effect.tieredReach).toBeUndefined();
        }
      }
      expect(seiaIv.effect.options.some((option) => option.cost?.removeSelf)).toBe(true);
    }

    for (const level of [1, 4] as const) {
      const chise = adventureCards[`specialty.chise_blue_archive.${level}`];
      expect(chise.timing).toBe("instant");
      expect(chise.phaseLimit).toEqual(["reaction", "combat"]);
    }
  });

  it("offers Chise I and IV only at the beginning of combat", () => {
    for (const level of [1, 4] as const) {
      const cardId = `specialty.chise_blue_archive.${level}`;
      const state = createInitialGameState(`chise-${level}-opening-window`);
      state.players.p1.hand = [cardId];
      expect(
        getLegalActions(state, "p1").some(
          (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
        )
      ).toBe(true);

      state.combat!.units[DEFENDER].activatedThisRound = true;
      expect(
        getLegalActions(state, "p1").some(
          (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
        )
      ).toBe(false);
    }
  });

  it("Yuuka IV and Seia VI can select friendly or enemy units", () => {
    for (const cardId of ["specialty.yuuka_blue_archive.4", "specialty.seia_blue_archive.6"] as const) {
      const state = createInitialGameState(`${cardId}-any-unit`);
      state.players.p1.hand = [cardId];
      const targets = getLegalActions(state, "p1")
        .filter((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId)
        .flatMap((legal) => legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit"
          ? [legal.action.target.unitId]
          : []);
      expect(targets).toContain(DEFENDER);
      expect(targets).toContain(ATTACKER);
    }
  });

  it("Mika IV damages a unit after it attacks the protected unit", () => {
    let state = createInitialGameState("mika-iv-thorns");
    state.players.p1.hand = ["specialty.mika_blue_archive.4"];
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "specialty.mika_blue_archive.4" &&
          legal.action.target?.type === "unit" &&
          legal.action.target.unitId === ATTACKER
      ),
      "Mika IV must be able to select any unit, including an enemy"
    ).toBe(true);
    state = playOn(state, "specialty.mika_blue_archive.4", DEFENDER);
    expect(
      state.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "DAMAGE_ATTACKER_AFTER_ATTACKED")
      )
    ).toBe(true);

    const after = resolveIncomingAttack(state);
    expect(after.combat!.units[ATTACKER].damage).toBeGreaterThanOrEqual(1);
    expect(
      after.eventLog.some(
        (event) =>
          event.type === "DAMAGE_ASSIGNED" &&
          event.target.type === "unit" &&
          event.target.unitId === ATTACKER &&
          event.source.type === "card" &&
          event.source.cardId === "specialty.mika_blue_archive.4"
      )
    ).toBe(true);
  });

  it("Seia VI fixes the selected enemy unit's Attack die at -1", () => {
    let state = createInitialGameState("seia-vi-fixed-minus");
    state.players.p1.hand = ["specialty.seia_blue_archive.6"];
    state = playOn(state, "specialty.seia_blue_archive.6", ATTACKER);
    expect(unitAttackRollFixedMinusOne(state, state.combat!.units[ATTACKER])).toBe(true);

    const after = resolveIncomingAttack(state);
    expect(unitAttackRollFixedMinusOne(after, after.combat!.units[ATTACKER])).toBe(true);
    const rolls = after.eventLog.filter(
      (event) => event.type === "ATTACK_ROLLED" && event.attackerId === ATTACKER
    );
    expect(rolls.at(-1)).toMatchObject({ roll: -1 });
  });
});
