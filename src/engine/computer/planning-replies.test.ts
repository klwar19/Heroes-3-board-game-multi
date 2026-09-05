import { describe, expect, it, vi } from "vitest";
import { coordinatedReplyDamage } from "./opponent-reply";
import type {
  CombatState,
  CombatUnitState,
  GameAction,
  PlayerVisibleState,
} from "../state";
import { createAdventureGameState } from "../adventure-setup";
import {
  refreshComputerMemory,
  getComputerMemory,
  noteComputerAction,
  repeatsUnproductiveRoute,
} from "./memory";
import { chooseComputerAction } from "./policy";
import * as mapPolicy from "./map-policy";
const unit = (
  id: string,
  position: number,
  controllerId: string,
  type = "ground",
) =>
  ({
    id,
    position,
    controllerId,
    type,
    attack: 4,
    defense: 1,
    maxHealth: 5,
    damage: 0,
    abilities: [],
    initiative: 4,
    activatedThisRound: false,
    movedThisActivation: false,
  }) as unknown as CombatUnitState;
describe("enemy legal reply search", () => {
  it("sees move-and-attack threats, screens, and activation exhaustion", () => {
    const own = unit("own", 0, "p2");
    const enemy = unit("enemy", 8, "neutrals");
    const board = {
      units: { own, enemy },
      obstacles: [],
    } as unknown as CombatState;
    expect(coordinatedReplyDamage(board, own, 0)).toBe(3);
    board.units.screen = unit("screen", 4, "p2");
    board.units.screen2 = unit("screen2", 1, "p2");
    expect(coordinatedReplyDamage(board, own, 0)).toBe(0);
    delete board.units.screen;
    delete board.units.screen2;
    enemy.activatedThisRound = true;
    expect(coordinatedReplyDamage(board, own, 0)).toBe(0);
  });
  it("does not count an attack forbidden by a visible ongoing effect", () => {
    const own = unit("own", 0, "p2");
    const enemy = unit("enemy", 8, "neutrals");
    const state = createAdventureGameState({ seed: "reply-effects", playerCount: 2, events: false, rollFirstPlayer: false });
    const board = { units: { own, enemy }, obstacles: [] } as unknown as CombatState;
    expect(coordinatedReplyDamage(board, own, 0, undefined, state)).toBe(3);
    state.activeEffects.push({
      id: "cannot-attack", sourceCardId: "test", ownerPlayerId: "p2",
      scope: "unit", target: { type: "unit", unitId: enemy.id }, duration: "combat",
      modifiers: [{ type: "UNIT_CANNOT_ATTACK" }],
    } as unknown as typeof state.activeEffects[number]);
    expect(coordinatedReplyDamage(board, own, 0, undefined, state)).toBe(0);
    state.activeEffects = [];
    expect(coordinatedReplyDamage(board, own, 0, undefined, state)).toBe(3);
  });
});
describe("persistent empty-route guard", () => {
  it("rejects repeated backtracking but allows the route after real progress", () => {
    let state = createAdventureGameState({
      seed: "routes",
      playerCount: 2,
      events: false,
      rollFirstPlayer: false,
    });
    state = refreshComputerMemory(state, "p2");
    const hero = Object.values(state.heroes).find(
      (h) => h.controllerId === "p2",
    )!;
    const action: GameAction = {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: hero.id,
      to: "h:1:0",
    };
    for (const to of ["h:1:0", "h:0:0", "h:1:0", "h:0:0"])
      state = noteComputerAction(state, "p2", { ...action, to });
    state = JSON.parse(JSON.stringify(state));
    state.round++;
    expect(
      repeatsUnproductiveRoute(
        state,
        "p2",
        action,
        getComputerMemory(state, "p2"),
      ),
    ).toBe(true);
    vi.spyOn(mapPolicy, "scoreMapAction").mockReturnValue({
      score: 600,
      policy: "test-move",
    });
    const alternate: GameAction = { ...action, to: "h:2:0" };
    const obs = {
      playerId: "p2",
      state: state as unknown as PlayerVisibleState,
      memory: getComputerMemory(state, "p2"),
      legalActions: [
        { label: "loop", action },
        { label: "progress", action: alternate },
      ],
    };
    expect(chooseComputerAction(obs)?.action).toEqual(alternate);
    state.players.p2.resources.gold++;
    expect(
      repeatsUnproductiveRoute(
        state,
        "p2",
        action,
        getComputerMemory(state, "p2"),
      ),
    ).toBe(false);
    vi.restoreAllMocks();
  });
});
