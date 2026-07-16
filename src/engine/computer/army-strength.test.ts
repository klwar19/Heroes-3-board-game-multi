import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import type { GameState, MapFieldState } from "../state";
import {
  BANK_ENGAGE_RATIO,
  canBeatCreatureBank,
  creatureBankStrength,
  ENEMY_ENGAGE_RATIO,
  playerArmyStrength,
  shouldAssaultEnemyHolding,
  shouldEngageEnemy,
} from "./army-strength";

/**
 * The army-strength read behind the computer's "should I attack this hero /
 * bank / garrison?" decision. It never resolves a battle (the dice do that) —
 * it only decides whether the AI is willing to start one.
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

  it("values Polish Stack layers as full Pack health bars plus one flat Attack", () => {
    const state = game();
    const unit = state.players.p2.army[0];
    unit.side = "pack";
    unit.stacks = 0;
    const base = playerArmyStrength(state, "p2");
    unit.stacks = 2;
    const stacked = playerArmyStrength(state, "p2");
    const side = state.players.p2.army[0];
    // Sanity/control: layers materially raise engagement strength, but do not
    // duplicate the entire unit's attack/defense/initiative package.
    expect(stacked).toBeGreaterThan(base);
    unit.stacks = 1;
    const one = playerArmyStrength(state, "p2");
    expect(stacked - one).toBeLessThan(one - base);
    expect(side.side).toBe("pack");
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

describe("creature bank strength", () => {
  it("values a known bank and engages only when the army can take it", () => {
    const state = game();
    // Imp Cache is the weakest far bank (4× familiars). A full starting army
    // should clear it; a gutted army must refuse.
    const impStr = creatureBankStrength("imp_cache", "normal");
    expect(impStr).toBeGreaterThan(0);
    expect(Number.isFinite(impStr)).toBe(true);

    const field = {
      spaceId: "bank:1",
      location: "creature_bank",
      bankId: "imp_cache",
    } as MapFieldState;

    expect(canBeatCreatureBank(state, "p2", field)).toBe(true);

    // CONTROL: gut the army well below the bank engage ratio.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    expect(playerArmyStrength(state, "p2")).toBeLessThan(
      impStr * BANK_ENGAGE_RATIO,
    );
    expect(canBeatCreatureBank(state, "p2", field)).toBe(false);

    // CONTROL: unknown bank id → never engage (no blind gamble).
    expect(
      canBeatCreatureBank(state, "p2", {
        ...field,
        bankId: undefined,
      } as MapFieldState),
    ).toBe(false);

    // CONTROL: Dragon Utopia is far stronger than Imp Cache.
    expect(creatureBankStrength("dragon_utopia", "normal")).toBeGreaterThan(
      impStr,
    );
  });
});

describe("shouldAssaultEnemyHolding", () => {
  it("assaults when armies are even; refuses when outmatched", () => {
    const state = game();
    const field = {
      spaceId: "t:1",
      location: "castle_town",
      flagOwnerId: "p1",
    } as MapFieldState;
    // Equal armies → assault.
    expect(shouldAssaultEnemyHolding(state, "p2", field)).toBe(true);
    // CONTROL: outmatched → refuse.
    state.players.p2.army = state.players.p2.army.slice(0, 1);
    expect(shouldAssaultEnemyHolding(state, "p2", field)).toBe(false);
  });
});
