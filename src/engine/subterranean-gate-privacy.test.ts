import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./adventure-setup";
import { eliminatePlayer } from "./adventure";
import { getPlayerView } from "./player-view";

describe("Subterranean Gate tile-pick cleanup", () => {
  it("returns the held-out alternate tile to the pool when the deciding player is eliminated", () => {
    const state = createAdventureGameState({
      seed: "subterranean-choice-elim",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    // The choice spliced its alternate (candidate[1] = "U2") OUT of the pool
    // when it opened; "U3" is the rest of the pool. Eliminating the owner
    // mid-pick must return "U2" so the underground supply does not shrink.
    state.adventure!.subterraneanTilePool = ["U3"];
    state.pendingChoice = {
      id: "choice_subterranean_elim",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Choose 1 of 2 Subterranean tiles",
      options: [{ label: "Choose tile A" }, { label: "Choose tile B" }],
      context: "subterranean-tile-pick",
      subterraneanTilePick: { tileInstanceId: "tile_secret", candidates: ["U1", "U2"] },
      returnPhase: "player-turn"
    };

    eliminatePlayer(state, "p1", "removed mid-pick", false);

    // CONTROL: without the eliminatePlayer branch the held-out "U2" is orphaned
    // (pool stays ["U3"]); the choice is dropped either way.
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure!.subterraneanTilePool).toContain("U2");
    expect(state.adventure!.subterraneanTilePool).toContain("U3");
  });
});

describe("Subterranean Gate tile-choice secrecy", () => {
  it("shows both candidates only to the deciding player and masks the remaining pool", () => {
    const state = createAdventureGameState({
      seed: "subterranean-choice-privacy",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.adventure!.subterraneanTilePool = ["U3", "U4"];
    state.pendingChoice = {
      id: "choice_subterranean_private",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Choose 1 of 2 Subterranean tiles",
      options: [{ label: "Choose tile A" }, { label: "Choose tile B" }],
      context: "subterranean-tile-pick",
      subterraneanTilePick: { tileInstanceId: "tile_secret", candidates: ["U1", "U2"] },
      returnPhase: "player-turn"
    };

    const owner = getPlayerView(state, "p1");
    const opponent = getPlayerView(state, "p2");
    expect(owner.pendingChoice?.type === "OPTION_CHOICE" ? owner.pendingChoice.subterraneanTilePick?.candidates : null)
      .toEqual(["U1", "U2"]);
    expect(opponent.pendingChoice?.type === "OPTION_CHOICE" ? opponent.pendingChoice.subterraneanTilePick?.candidates : null)
      .toEqual(["hidden", "hidden"]);
    expect(opponent.adventure?.subterraneanTilePool).toEqual(["hidden", "hidden"]);
  });
});
