import { expect, it } from "vitest";
import { chooseComputerAction } from "./policy";
import type { CombatUnitState, PlayerVisibleState, GameAction } from "../state";
it("conserves an attack reaction on a guaranteed kill but spends it to secure a close kill", () => {
  const attacker = {
    name: "attacker",
    cardName: "attacker",
    variant: "few",
    grade: "bronze",
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    id: "a",
    controllerId: "p2",
    position: 4,
    attack: 8,
    defense: 1,
    maxHealth: 6,
    damage: 0,
    initiative: 4,
    abilities: [],
    type: "ground",
  } as CombatUnitState;
  const defender = {
    ...attacker,
    id: "d",
    controllerId: "neutrals",
    position: 5,
    maxHealth: 4,
    attack: 3,
  };
  const play: GameAction = {
    type: "PLAY_REACTION",
    playerId: "p2",
    cardId: "stat.attack",
    mode: "basic",
  };
  const pass: GameAction = { type: "PASS_REACTION", playerId: "p2" };
  const state = {
    seed: "save-attack",
    round: 3,
    eventCounter: 1,
    players: {
      p2: {
        id: "p2",
        hand: ["stat.attack"],
        army: [],
        resources: { gold: 10, buildingMaterials: 0, valuables: 0 },
      },
    },
    combat: { units: { a: attacker, d: defender } },
    stack: [
      {
        action: {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "a",
          defenderId: "d",
        },
        modifiers: { attackBonus: 0, defenseBonus: 0 },
      },
    ],
  } as unknown as PlayerVisibleState;
  const obs = {
    playerId: "p2",
    state,
    legalActions: [
      { label: "boost", action: play },
      { label: "pass", action: pass },
    ],
  };
  expect(chooseComputerAction(obs)?.action).toEqual(pass);
  state.combat!.units.a.attack = 4;
  expect(chooseComputerAction(obs)?.action).toEqual(play);
});
