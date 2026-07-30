import { describe, expect, it } from "vitest";
import { applyAction } from "./reducer";
import { getLegalActions } from "./legal-actions";
import { createInitialGameState } from "./setup";
import type { GameState } from "./state";

/**
 * A MANDATORY ability-target choice (Fireball splash, Lich/Magog picks …) whose
 * every candidate died or left the board between the window opening and the
 * pick (an intervening reaction, retaliation or removal) used to offer ZERO
 * actions — its owner (human or computer) could never answer it, so the whole
 * table froze with every click rejected ("That action is not legal in the
 * current game state."). The offer side now surfaces the skip for exactly that
 * shape, and the resolver accepts it; a choice with a LIVING candidate keeps
 * the mandatory-pick rule (the CONTROL).
 */
describe("mandatory ability-target choice with no living candidate", () => {
  function stateWithSplashChoice(candidateUnitIds: string[]): GameState {
    const state = createInitialGameState("ability-target-dead-candidates");
    state.pendingChoice = {
      id: "atc_dead",
      type: "ABILITY_TARGET_CHOICE",
      playerId: "p1",
      prompt: "Fireball: pick the second space",
      kind: "spell-splash",
      abilityName: "Fireball",
      abilityId: "spell.fireball",
      candidateUnitIds,
      amount: 2,
      optional: false
    } as unknown as typeof state.pendingChoice;
    return state;
  }

  it("offers the skip (and ONLY the skip), which resolves the window", () => {
    // Both candidates are gone from the board — the removal that ended them
    // ran after the window opened.
    const state = stateWithSplashChoice(["unit_gone_1", "unit_gone_2"]);
    const offers = getLegalActions(state, "p1");
    expect(offers).toHaveLength(1);
    expect(offers[0].action).toMatchObject({
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: "atc_dead",
      targetUnitId: "skip"
    });

    const result = applyAction(state, offers[0].action);
    expect(result.errors).toEqual([]);
    expect(result.state.pendingChoice).toBeNull();
  });

  it("CONTROL: with a living candidate the pick stays mandatory — no skip offered, a forged skip is rejected", () => {
    const living = Object.values(createInitialGameState("ability-target-dead-candidates").combat!.units)[0];
    const state = stateWithSplashChoice([living.id]);
    const offers = getLegalActions(state, "p1");
    expect(offers.some((offer) => "targetUnitId" in offer.action && offer.action.targetUnitId === living.id)).toBe(
      true
    );
    expect(offers.some((offer) => "targetUnitId" in offer.action && offer.action.targetUnitId === "skip")).toBe(
      false
    );

    const forged = applyAction(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: "atc_dead",
      targetUnitId: "skip"
    });
    expect(forged.errors.length).toBeGreaterThan(0);
  });
});
