import { describe, expect, it } from "vitest";

import { createInitialGameState, getLegalActions } from "./index";
import type { CardId, GameState } from "./state";

/**
 * USER RULING 2026-09-29 (Polish Balance Pack faces): Shaman's Puppet, Cards
 * of Prophecy and Hourglass of the Evil Hour print "You can play this card at
 * the start of a Combat" on their ↻ side. With the pack on, that side is
 * playable in the start-of-combat window (before any unit acts — even while
 * the enemy owns the first activation) as well as on the owner's own unit
 * activation (`combatStartOrActivation`).
 */

function sandbox(cardId: string): GameState {
  const state = createInitialGameState(`combat-start-${cardId}`);
  state.adventure = {
    houseRules: { "polish-card-balance": true }
  } as unknown as GameState["adventure"];
  state.players.p1.hand = [cardId] as CardId[];
  state.players.p2.hand = [];
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = false;
    unit.attackedThisActivation = false;
    unit.movedThisActivation = false;
  }
  // The ENEMY owns the first activation: only the start window can open p1's play.
  const enemy = Object.values(combat.units).find((unit) => unit.controllerId === "p2")!;
  combat.activeUnitId = enemy.id;
  state.activePlayerId = "p2";
  return state;
}

function offered(state: GameState, cardId: string, optionIndex: number): boolean {
  return getLegalActions(state, "p1").some(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

const CASES: [string, number][] = [
  ["artifact.shamans_puppet", 0],
  ["artifact.cards_of_prophecy", 0],
  ["artifact.hourglass_of_the_evil_hour", 1]
];

describe("Polish Balance ↻ sides playable at the start of a Combat", () => {
  for (const [cardId, optionIndex] of CASES) {
    it(`${cardId}: offered before any unit acts, on the enemy's first activation`, () => {
      expect(offered(sandbox(cardId), cardId, optionIndex)).toBe(true);
    });

    it(`${cardId}: CONTROL — not offered on the enemy's turn once a unit has acted`, () => {
      const state = sandbox(cardId);
      const someone = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
      someone.activatedThisRound = true;
      expect(offered(state, cardId, optionIndex)).toBe(false);
    });
  }
});
