import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, expertUsesAvailable, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expertOffersFor(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).filter(
    (legal) =>
      (legal.action as { mode?: string }).mode === "expert" &&
      (legal.action as { cardId?: string }).cardId === cardId
  );
}

// The Dragon Fly Hive / Griffin Conservatory bonus Empowers an ability: its
// Expert side may be played without spending an Expert use (a crown). The CONTROL
// (the same 0-crown hero, ability NOT empowered) proves the crown gate is real —
// removing the empowered exception fails this test.
describe("Empowered abilities skip the crown for their Expert side", () => {
  function zeroCrownArchery(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.combatStats.expertUseBonusThisRound = 0;
    state.players.p1.hand = ["ability.archery"];
    return state;
  }

  it("CONTROL: a 0-crown hero is NOT offered Archery expert, and forcing it is rejected", () => {
    const state = zeroCrownArchery("empower-archery-control");
    expect(expertUsesAvailable(state.players.p1)).toBe(0);
    expect(expertOffersFor(state, "p1", "ability.archery")).toHaveLength(0);

    const forced = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      mode: "expert",
      target: { type: "none" }
    });
    expect(forced.errors.length, "an unaffordable expert play must be rejected").toBeGreaterThan(0);
  });

  it("an Empowered Archery is offered expert at 0 crowns and spends none when played", () => {
    let state = zeroCrownArchery("empower-archery");
    state.players.p1.empoweredAbilities = ["ability.archery"];
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    // The Empowered ability's expert side IS offered despite the empty crown pool.
    expect(expertOffersFor(state, "p1", "ability.archery").length).toBeGreaterThan(0);

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      mode: "expert",
      target: { type: "none" }
    });

    // The expert side resolved, but NO crown was spent (it is Empowered).
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(expertUsesAvailable(state.players.p1)).toBe(0);
    expect(state.eventLog.some((event) => event.type === "CARD_PLAYED")).toBe(true);
  });

  it("empowering one ability does NOT make a different ability's expert free", () => {
    const state = zeroCrownArchery("empower-archery-scoped");
    state.players.p1.hand = ["ability.archery", "ability.luck"];
    state.players.p1.empoweredAbilities = ["ability.archery"];

    // Archery (empowered) is offered; Luck (not empowered, 0 crowns) is not.
    expect(expertOffersFor(state, "p1", "ability.archery").length).toBeGreaterThan(0);
    expect(expertOffersFor(state, "p1", "ability.luck")).toHaveLength(0);
  });
});
