import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameState
} from "./index";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("Cover of Darkness", () => {
  it("is usable from anywhere during its owner's turn, cycles 1-2 cards, and is once per round", () => {
    let state = createAdventureGameState({
      seed: "cover-anywhere",
      rollFirstPlayer: false
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p2";
    state.towns.town_p2.buildings.push("necropolis.cover_of_darkness");
    getMainHero(state, "p2")!.spaceId = "99,99";
    state.players.p2.hand = ["stat.attack", "ability.necromancy"];
    state.players.p2.discard = [];
    state.players.p2.deck = ["stat.defense", "stat.power"];

    const offer = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "USE_TOWN_BUILDING" &&
        legal.action.buildingId === "necropolis.cover_of_darkness"
    );
    expect(offer, "the building action is available away from town").toBeTruthy();

    state = applyOk(state, {
      ...offer!.action,
      cardIds: ["stat.attack", "ability.necromancy"]
    } as GameAction);

    expect(state.players.p2.discard).toEqual(
      expect.arrayContaining(["stat.attack", "ability.necromancy"])
    );
    expect(state.players.p2.hand).toHaveLength(2);
    expect(
      getLegalActions(state, "p2").some(
        (legal) =>
          legal.action.type === "USE_TOWN_BUILDING" &&
          legal.action.buildingId === "necropolis.cover_of_darkness"
      )
    ).toBe(false);
  });
});
