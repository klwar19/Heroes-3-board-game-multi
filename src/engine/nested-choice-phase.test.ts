import { describe, expect, it } from "vitest";
import { choiceReturnPhase, repairOrphanedChoicePhase } from "./choice-phase";
import type { CombatState, GameState } from "./state";

const openFight = (activeUnitId: string | null = "u1") =>
  ({ id: "c1", outcome: null, activeUnitId }) as unknown as CombatState;

function state(over: Partial<GameState>): GameState {
  return { phase: "player-turn", pendingChoice: null, combat: undefined, ...over } as unknown as GameState;
}

describe("a choice opened while another choice resolves returns to the OUTER phase", () => {
  it("inherits the outer choice's return phase instead of recording 'choice'", () => {
    const nested = state({ phase: "choice", pendingChoice: { type: "OPTION", returnPhase: "combat" } as never, combat: openFight() });
    expect(choiceReturnPhase(nested)).toBe("combat");
    const nestedMap = state({ phase: "choice", pendingChoice: { type: "OPTION", returnPhase: "player-turn" } as never });
    expect(choiceReturnPhase(nestedMap)).toBe("player-turn");
  });

  it("falls back on the open fight when the outer choice is already cleared", () => {
    expect(choiceReturnPhase(state({ phase: "choice", combat: openFight() }))).toBe("combat");
    expect(choiceReturnPhase(state({ phase: "choice" }))).toBe("player-turn");
    // A finished fight is not a combat phase to return to.
    expect(choiceReturnPhase(state({ phase: "choice", combat: { ...openFight(), outcome: { winnerPlayerId: "p1" } } as never }))).toBe("player-turn");
  });

  it("CONTROL: outside a choice the current phase is the return phase", () => {
    expect(choiceReturnPhase(state({ phase: "combat", combat: openFight() }))).toBe("combat");
    expect(choiceReturnPhase(state({ phase: "combat-setup", combat: openFight(null) }))).toBe("combat-setup");
    expect(choiceReturnPhase(state({ phase: "player-turn" }))).toBe("player-turn");
  });
});

describe("orphaned 'choice' phase repair", () => {
  it("restores the combat phase for a mid-activation fight with no pending choice", () => {
    const stuck = state({ phase: "choice", combat: openFight() });
    expect(repairOrphanedChoicePhase(stuck)).toBe(true);
    expect(stuck.phase).toBe("combat");
  });

  it("CONTROL: leaves a real pending choice, a finished fight, placement, and map play alone", () => {
    const pending = state({ phase: "choice", pendingChoice: { type: "OPTION", returnPhase: "combat" } as never, combat: openFight() });
    expect(repairOrphanedChoicePhase(pending)).toBe(false);
    expect(pending.phase).toBe("choice");
    const placing = state({ phase: "choice", combat: openFight(null) });
    expect(repairOrphanedChoicePhase(placing)).toBe(false);
    const ended = state({ phase: "choice", combat: { ...openFight(), outcome: { winnerPlayerId: "p1" } } as never });
    expect(repairOrphanedChoicePhase(ended)).toBe(false);
    const map = state({ phase: "player-turn" });
    expect(repairOrphanedChoicePhase(map)).toBe(false);
    expect(map.phase).toBe("player-turn");
  });
});
