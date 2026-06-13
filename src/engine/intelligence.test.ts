import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions, spellLimitFor } from "./index";
import type { CardPlayMode, GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function castAction(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId
  );
}

/** Plays Intelligence (basic/expert) from p1's hand while a p1 unit is active. */
function withIntelligence(mode: CardPlayMode, extraHand: string[] = []): GameState {
  const state = createInitialGameState();
  state.players.p1.hand = ["ability.intelligence", ...extraHand];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.intelligence" && legal.action.mode === mode
  );
  expect(play, `Intelligence (${mode}) should be playable`).toBeTruthy();
  return applyOk(state, play!.action);
}

describe("Intelligence — when spells may be cast", () => {
  it("creates the right ongoing effect for basic and expert", () => {
    const basic = withIntelligence("basic");
    expect(
      basic.activeEffects.some(
        (effect) =>
          effect.controllerId === "p1" &&
          effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME" && !modifier.ignoreSpellLimit)
      )
    ).toBe(true);
    expect(spellLimitFor(basic, basic.players.p1)).toBe(1);

    const expert = withIntelligence("expert");
    expect(
      expert.activeEffects.some(
        (effect) =>
          effect.controllerId === "p1" &&
          effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME" && modifier.ignoreSpellLimit === true)
      )
    ).toBe(true);
    expect(expert.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(spellLimitFor(expert, expert.players.p1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("lets the holder cast an activation spell off-turn, with no unit of theirs active", () => {
    const state = withIntelligence("basic", ["spell.magic_arrow"]);
    // Hand to the opponent: it is p2's unit that is active now, not p1's.
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";

    expect(
      castAction(state, "p1", "spell.magic_arrow"),
      "Intelligence lifts the activation-timing gate, even off-turn"
    ).toBeTruthy();
  });

  it("control: without Intelligence an activation spell cannot be cast off-turn", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    expect(castAction(state, "p1", "spell.magic_arrow")).toBeFalsy();
  });

  it("expert lets the holder cast more than one spell in a combat round", () => {
    let state = withIntelligence("expert", ["spell.magic_arrow", "spell.lightning_bolt"]);

    const first = castAction(state, "p1", "spell.magic_arrow");
    expect(first).toBeTruthy();
    state = passAllReactions(applyOk(state, first!.action));
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);

    // A second cast would breach the normal one-per-round limit — expert
    // Intelligence ignores it.
    const second = castAction(state, "p1", "spell.lightning_bolt");
    expect(second, "expert Intelligence ignores the per-round spell limit").toBeTruthy();
    state = passAllReactions(applyOk(state, second!.action));
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(2);
  });

  it("control: basic Intelligence still enforces one spell per combat round", () => {
    let state = withIntelligence("basic", ["spell.magic_arrow", "spell.lightning_bolt"]);

    const first = castAction(state, "p1", "spell.magic_arrow");
    expect(first).toBeTruthy();
    state = passAllReactions(applyOk(state, first!.action));
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);

    // The round's one spell is spent: no second cast is offered.
    expect(castAction(state, "p1", "spell.lightning_bolt")).toBeFalsy();
  });
});
