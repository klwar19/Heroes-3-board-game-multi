import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import type { GameState } from "../state";
import {
  ENEMY_ENGAGE_RATIO,
  playerArmyStrength,
  shouldEngageEnemy,
} from "./army-strength";

/**
 * The army-strength read behind the computer's "should I attack this hero?"
 * decision. It never resolves a battle (the dice do that) — it only decides
 * whether the AI is willing to start one. A comparable or larger army engages; a
 * clearly outmatched one holds off. Pinned on a real starting map (both seats
 * open with the same starting army, so strengths tie).
 */
function game(): GameState {
  return createAdventureGameState({
    seed: "strength-map",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
  });
}

describe("playerArmyStrength", () => {
  it("values a non-empty army above an empty one", () => {
    const state = game();
    expect(playerArmyStrength(state, "p2")).toBeGreaterThan(0);
    state.players.p2.army = [];
    expect(playerArmyStrength(state, "p2")).toBe(0);
  });
});

describe("shouldEngageEnemy", () => {
  it("engages a comparable army and one it outweighs", () => {
    const state = game();
    // Equal starting armies: a roughly even fight the AI takes.
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
    // Enemy with nothing to fear is always engaged.
    state.players.p1.army = [];
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(true);
  });

  it("CONTROL: holds off when clearly outmatched", () => {
    const state = game();
    // Gut the AI's army so it sits well under the engage ratio; the enemy keeps
    // its full starting army.
    const enemyStrength = playerArmyStrength(state, "p1");
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    // Sanity: the fixture really is below the engage threshold.
    expect(playerArmyStrength(state, "p2")).toBeLessThan(
      enemyStrength * ENEMY_ENGAGE_RATIO,
    );
    expect(shouldEngageEnemy(state, "p2", "p1")).toBe(false);
  });
});
