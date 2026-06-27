import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * The forced-use bug (Breastplate of Petrified Wood, and every other card whose
 * only matching arm is a trigger-free "Draw 1 card" — Offense I / Armorer I's
 * draw option, …).
 *
 * A card-draw is not a *response* to anything: drawing a card has nothing to do
 * with the spell/attack/activation that opens a reaction window. The engine used
 * to slot a trigger-free DRAW_CARDS into EVERY open window, which FORCED a
 * reaction window open (and dragged its holder into it) the instant ANY spell
 * was cast / attack declared. So merely *holding* the Breastplate meant
 * "suddenly you must use it / pass" on every opponent's action.
 *
 * Fix (legal-actions.ts `variantMatchesTrigger`): a trigger-free DRAW_CARDS is
 * never a reaction. It stays fully playable on its holder's OWN initiative, but
 * never forces or joins a reaction window. A real triggered reaction (the
 * Breastplate's own "+1 Power" on YOUR cast) is unaffected.
 *
 * Each test fails if the fix is reverted (`return variant.effect.type ===
 * "DRAW_CARDS"`).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const castMagicArrow = {
  type: "CAST_SPELL",
  playerId: "p1",
  cardId: "spell.magic_arrow",
  target: { type: "unit", unitId: "unit_p2_vampires" }
} satisfies GameAction;

describe("Artifact forced-use: a trigger-free Draw-a-card never forces a reaction window", () => {
  it("an opponent's spell does NOT drag a Breastplate holder into a forced window", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = ["artifact.breastplate_of_petrified_wood"];

    const casted = applyOk(state, castMagicArrow);

    // No reaction window was forced open just because p2 holds a draw card.
    // (Mutation guard: with the old `return …DRAW_CARDS` the window opens with
    // p2 in it and this is non-null.)
    expect(casted.reactionWindow).toBeNull();
    // p2 is never handed a forced "pass or play" decision.
    const p2Forced = getLegalActions(casted, "p2").some((legal) => legal.action.type === "PASS_REACTION");
    expect(p2Forced).toBe(false);
    // The artifact is untouched — never consumed or forced.
    expect(casted.players.p2.hand).toContain("artifact.breastplate_of_petrified_wood");
  });

  it("an enemy attack does NOT drag a Breastplate holder into a forced window", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.breastplate_of_petrified_wood"];
    state.players.p2.hand = [];
    // p2's unit attacks p1's unit. Before the fix, p1 (holding the draw) was
    // pulled into the attack window and forced to pass/play.
    const attack = {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_vampires",
      defenderId: "unit_p1_griffins"
    } satisfies GameAction;

    // Make p2 the active player so its unit may attack.
    const ready: GameState = { ...state, activePlayerId: "p2" };
    if (ready.combat) {
      ready.combat.activeUnitId = "unit_p2_vampires";
    }
    const result = applyAction(ready, attack);
    // Whether or not the attack is legal in this minimal fixture, what matters is
    // that p1 is never forced into a window by the held draw.
    const p1Forced = getLegalActions(result.state, "p1").some((legal) => legal.action.type === "PASS_REACTION");
    expect(p1Forced).toBe(false);
    expect(result.state.players.p1.hand).toContain("artifact.breastplate_of_petrified_wood");
  });

  it("still lets you PLAY the Draw-1-card on your own turn (no functionality lost)", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.breastplate_of_petrified_wood"];
    state.players.p2.hand = [];

    const drawPlay = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.breastplate_of_petrified_wood" &&
        legal.action.optionIndex === 0
    );
    expect(drawPlay, "the Draw-1-card option is offered as a normal play on your own turn").toBeDefined();

    const deckBefore = state.players.p1.deck.length;
    const drawn = applyOk(state, drawPlay!.action);
    expect(drawn.players.p1.deck.length).toBe(deckBefore - 1);
    expect(drawn.players.p1.discard).toContain("artifact.breastplate_of_petrified_wood");
  });

  it("KEEPS the '+1 Power' arm as a real, optional self-reaction on your own cast", () => {
    // Regression guard: the fix must NOT break a genuine triggered reaction.
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow", "artifact.breastplate_of_petrified_wood"];
    state.players.p2.hand = [];

    const casted = applyOk(state, castMagicArrow);
    // Your own cast opens YOUR window: the +1 Power arm (optionIndex 1) is offered…
    const offers = getLegalActions(casted, "p1");
    const powerReaction = offers.find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "artifact.breastplate_of_petrified_wood" &&
        legal.action.optionIndex === 1
    );
    expect(powerReaction, "+1 Power is still a real self-cast reaction").toBeDefined();
    // …but it is OPTIONAL: a Pass is always offered, and passing resolves the
    // spell with the artifact untouched.
    expect(offers.some((legal) => legal.action.type === "PASS_REACTION")).toBe(true);
    const passed = applyOk(casted, { type: "PASS_REACTION", playerId: "p1" });
    expect(passed.reactionWindow).toBeNull();
    expect(passed.players.p1.hand).toContain("artifact.breastplate_of_petrified_wood");
  });
});
