import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState } from "./index";

/**
 * The Tournament preset's headline is tier-split Spell / Artifact decks. That
 * must hold at the ENGINE seam (the SET_GAME_OPTIONS master toggle), not only
 * in the Setup-Hub preset payload — a table that reaches Tournament by ticking
 * "Tournament Mode" in the options panel must get the same decks.
 */
describe("Tournament Mode forces tier-split decks (engine seam)", () => {
  function lobby(seed: string) {
    return createAdventureLobbyState({ seed, playerCount: 2 });
  }

  it("the master toggle sets split-decks and the built game splits the decks", () => {
    let state = lobby("tournament-split-master");
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { ruleset: "legacy", tournamentMode: true, difficulty: "hard" }
    }).state;
    expect(state.setupLobby!.options.houseRules?.["split-decks"]).toBe(true);

    state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }).state;
    state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" }).state;
    state = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" }).state;

    expect(state.decks["artifacts-minor"]).toBeTruthy();
    expect(state.decks["artifacts-major"]).toBeTruthy();
    expect(state.decks["artifacts-relic"]).toBeTruthy();
    expect(state.decks["spells-expert"]).toBeTruthy();
    expect(state.decks.artifacts).toBeUndefined();
  });

  it("an EXPLICIT houseRules payload in the same action wins over the master convenience", () => {
    let state = lobby("tournament-split-explicit");
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        ruleset: "legacy",
        tournamentMode: true,
        difficulty: "hard",
        houseRules: { "split-decks": false }
      }
    }).state;
    expect(state.setupLobby!.options.houseRules?.["split-decks"]).toBe(false);
  });

  it("CONTROL: turning the master OFF leaves split-decks alone", () => {
    let state = lobby("tournament-split-off");
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { ruleset: "legacy", tournamentMode: true, difficulty: "hard" }
    }).state;
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { tournamentMode: false }
    }).state;
    expect(state.setupLobby!.options.houseRules?.["split-decks"]).toBe(true);
  });
});
