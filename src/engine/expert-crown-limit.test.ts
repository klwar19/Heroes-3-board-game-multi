import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, expertUsesAvailable, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** END_COMBAT_ROUND with the active unit cleared, so the round may end here. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

function expertOffers(state: GameState, playerId: PlayerId) {
  return getLegalActions(state, playerId).filter((legal) => (legal.action as { mode?: string }).mode === "expert");
}

function scriptDice(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
}

describe("expert-effect crown limit — realistic combat flow", () => {
  it("a 1-crown hero who plays Archery expert cannot then play an attack-instant expert", () => {
    let state = createInitialGameState("crown-archery-then-instant");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.hand = ["ability.archery", "stat.attack"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9; // adjacent to the skeletons
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    scriptDice(state, [1, -1, 1, -1]);

    // Archery expert (ongoing) spends the only crown.
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      mode: "expert",
      target: { type: "none" }
    });
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    // Declaring an attack opens the reaction window.
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(state.reactionWindow).toBeTruthy();

    // The Attack statistic's expert side is NOT offered, and forcing it fails.
    const offers = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.attack"
    );
    expect(offers.every((legal) => (legal.action as { mode?: string }).mode !== "expert")).toBe(true);

    const forced = applyAction(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.attack", mode: "expert" });
    expect(forced.errors.length, "a second expert play must be rejected").toBeGreaterThan(0);
    expect(forced.state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });
});

describe("expert-effect crown limit", () => {
  it("a level-2 hero (1 crown) cannot play a second expert effect in the same round", () => {
    let state = createInitialGameState("crown-lv2-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.hand = ["ability.archery", "ability.luck"];

    const before = expertOffers(state, "p1");
    expect(before.length, "an expert effect should be offered with a free crown").toBeGreaterThan(0);

    // Spend the only crown.
    state = applyOk(state, before[0].action as GameAction);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    // No expert effect may be chosen now — the option is gone, not merely re-labelled.
    expect(expertOffers(state, "p1").map((legal) => legal.label)).toEqual([]);

    // And forcing it anyway is rejected by the reducer.
    const forced = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      mode: "expert",
      target: { type: "none" }
    });
    expect(forced.errors.length, "a second expert play must be rejected").toBeGreaterThan(0);
  });

  it("a one-round bonus crown is offered while it lasts, but only up to the total", () => {
    const state = createInitialGameState("crown-bonus-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 1; // base crown already spent
    state.players.p1.combatStats.expertUseBonusThisRound = 1; // e.g. Pendant of Courage
    state.players.p1.hand = ["ability.archery", "ability.luck"];

    // 1 + 1 bonus − 1 spent = 1 crown free.
    expect(expertUsesAvailable(state.players.p1)).toBe(1);
    expect(expertOffers(state, "p1").length, "the bonus crown should still allow an expert").toBeGreaterThan(0);

    // Spend the bonus crown; now nothing is free.
    state.players.p1.combatStats.expertUsesSpentThisRound = 2;
    expect(expertUsesAvailable(state.players.p1)).toBe(0);
    expect(expertOffers(state, "p1").map((legal) => legal.label)).toEqual([]);
  });

  it("the one-round bonus crown does NOT survive into the next combat round", () => {
    let state = createInitialGameState("crown-bonus-reset-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUseBonusThisRound = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;

    // 1 + 1 bonus available this round.
    expect(expertUsesAvailable(state.players.p1)).toBe(2);

    state = endRound(state, "p1");

    // Next round: the bonus is gone, only the base crown is back.
    expect(state.players.p1.combatStats.expertUseBonusThisRound ?? 0).toBe(0);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(expertUsesAvailable(state.players.p1)).toBe(1);
  });
});
