import { describe, expect, it } from "vitest";
import { createAdventureGameState, getLegalActions } from "./index";
import type { GameState } from "./state";

/**
 * Cross-hero timing audit for every official war-machine specialty currently in
 * the card library. Mixed cards expose only their map-capable face on the map;
 * pure combat faces must stay hidden.
 */
function mapState(cardId: string): GameState {
  const state = createAdventureGameState({
    seed: `war-machine-map-${cardId}`,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Hero", factionId: "tower", heroDefId: "torosar" },
      { id: "p2", name: "Opponent", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.hand = [cardId];
  state.players.p1.resources.gold = 50;
  state.players.p1.permanents = [];
  return state;
}

function mapOptions(cardId: string): Array<number | undefined> {
  return getLegalActions(mapState(cardId), "p1")
    .filter(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === cardId
    )
    .map((legal) =>
      legal.action.type === "PLAY_CARD" ? legal.action.optionIndex : undefined
    );
}

describe("war-machine hero specialties - map timing audit", () => {
  it.each([
    ["specialty.torosar.1", [undefined]],
    ["specialty.torosar.4", [undefined]],
    ["specialty.torosar.6", [undefined]],
    ["specialty.gem.1", [undefined]],
    ["specialty.tarnum_castle.1", [0]],
    ["specialty.tarnum_castle.4", [1]],
    ["specialty.gerwulf.1", [0]],
    ["specialty.jeremy.1", [0]],
    ["specialty.jeremy.4", [1]],
    ["specialty.jeremy.6", [1]]
  ] as const)("%s exposes exactly its map-capable face", (cardId, expectedOptions) => {
    expect(mapOptions(cardId)).toEqual(expectedOptions);
  });

  it.each([
    "specialty.gem.4",
    "specialty.gem.6",
    "specialty.tarnum_castle.6",
    "specialty.gerwulf.4",
    "specialty.gerwulf.6"
  ] as const)("%s remains combat-only", (cardId) => {
    expect(mapOptions(cardId)).toEqual([]);
  });
});
