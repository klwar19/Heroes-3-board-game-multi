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

  /**
   * The GAP this closes: a table that assembles the Tournament package by
   * ticking the granular rules one by one (the "Tournament rules" collapsible,
   * not the mode card / master toggle) used to get the bans and a SINGLE-deck
   * game — nothing on screen said so, and no Search / Eagle Eye ever picked a
   * Basic vs Expert Spell deck.
   */
  describe("granular ticks — the last rule that completes the package forces it too", () => {
    const GRANULAR = [
      "tournamentBanDiplomacy",
      "tournamentBanHourglass",
      "tournamentSecondPlayerMorale",
      "tournamentObservatoryRerotate"
    ] as const;

    it("ticking all four granular rules one at a time splits the decks in the BUILT game", () => {
      let state = lobby("tournament-split-granular");
      // Legacy ruleset: split-decks defaults OFF, so nothing but the wiring
      // under test can turn it on.
      state = applyAction(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { ruleset: "legacy", difficulty: "hard" }
      }).state;
      expect(state.setupLobby!.options.houseRules?.["split-decks"]).not.toBe(true);

      for (const key of GRANULAR) {
        state = applyAction(state, {
          type: "SET_GAME_OPTIONS",
          playerId: "p1",
          options: { [key]: true }
        }).state;
      }
      // The master flag re-derives from the granular rules …
      expect(state.setupLobby!.options.tournamentMode).toBe(true);
      // … and the package's headline house rule came with it.
      expect(state.setupLobby!.options.houseRules?.["split-decks"]).toBe(true);

      state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }).state;
      state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" }).state;
      state = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" }).state;

      expect(state.decks["spells-expert"]).toBeTruthy();
      expect(state.decks["artifacts-minor"]).toBeTruthy();
      expect(state.decks["artifacts-major"]).toBeTruthy();
      expect(state.decks["artifacts-relic"]).toBeTruthy();
      expect(state.decks.artifacts).toBeUndefined();
    });

    it("CONTROL: a PARTIAL tournament package leaves the decks alone", () => {
      let state = lobby("tournament-split-partial");
      state = applyAction(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { ruleset: "legacy", difficulty: "hard" }
      }).state;
      // Three of the four rules: the package is NOT on, so nothing is forced.
      for (const key of GRANULAR.slice(0, 3)) {
        state = applyAction(state, {
          type: "SET_GAME_OPTIONS",
          playerId: "p1",
          options: { [key]: true }
        }).state;
      }
      expect(state.setupLobby!.options.tournamentMode).toBe(false);
      expect(state.setupLobby!.options.houseRules?.["split-decks"]).not.toBe(true);

      state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }).state;
      state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" }).state;
      state = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" }).state;
      expect(state.decks.artifacts).toBeTruthy();
      expect(state.decks["spells-expert"]).toBeUndefined();
    });

    it("the split-decks tick stays the host's to un-tick after the package is on", () => {
      let state = lobby("tournament-split-untick");
      state = applyAction(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { ruleset: "legacy", tournamentMode: true, difficulty: "hard" }
      }).state;
      expect(state.setupLobby!.options.houseRules?.["split-decks"]).toBe(true);

      // Un-ticking the row is a plain house-rule payload — it must NOT be
      // re-forced (the tournament seam only fires on a tournament key).
      state = applyAction(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { houseRules: { "split-decks": false } }
      }).state;
      expect(state.setupLobby!.options.houseRules?.["split-decks"]).toBe(false);
      expect(state.setupLobby!.options.tournamentMode).toBe(true);

      state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }).state;
      state = applyAction(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" }).state;
      state = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" }).state;
      expect(state.decks.artifacts).toBeTruthy();
    });
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
