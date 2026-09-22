import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

/**
 * Bulwark City Hall — the "Rune-Empowered" combat-focus Resource-round option.
 * Pinned here:
 *   1. the option grants +3 starting Runes each combat, stored in its own
 *      City Hall flag (PlayerState.cityHallRunesNextCombats), separate from
 *      Kriv's GAIN_STARTING_RUNES flag (runeEmpoweredNextCombats),
 *   2. it is ADDITIVE within one Resource round (a second resolution adds), and
 *   3. it is cleared at the next Resource round before the choice is re-offered,
 *      so it never carries over round after round.
 * All asserted on the OBSERVABLE flag that seedRunesForCombat reads.
 */
describe("Bulwark City Hall — Rune-Empowered combat focus (+3, cleared each Resource round)", () => {
  function applyOk(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return result.state;
  }

  /**
   * A Bulwark (p1) adventure parked at the start of a Resource round, with a
   * City-Hall-only town, so the City Hall income choice is the pending choice.
   */
  function bulwarkCityHallRound(seed: string, round: number): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Kriv", factionId: "bulwark", heroDefId: "kriv" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) {
      throw new Error("no Bulwark town");
    }
    town.buildings = ["bulwark.city_hall"];
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = round; // odd round > 1 → Resource round
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  /** The City Hall combat-focus legal action (found by its "Rune-Empowered" label). */
  function runeOption(state: GameState) {
    return getLegalActions(state, "p1").find((legal) => legal.label.includes("Rune-Empowered"));
  }

  it("grants exactly +3 starting Runes in the City Hall flag (Kriv's flag untouched)", () => {
    const state = bulwarkCityHallRound("bulwark-ch-plus3", 3);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "city-hall").toBe(true);

    const pick = runeOption(state);
    expect(pick, "the Rune-Empowered combat-focus option should be offered").toBeTruthy();
    const after = applyOk(state, pick!.action);
    expect(after.players.p1.cityHallRunesNextCombats).toBe(3);
    expect(after.players.p1.runeEmpoweredNextCombats ?? 0).toBe(0);
  });

  it("CONTROL: the gold option pays 5 gold and sets no Rune flag", () => {
    const state = bulwarkCityHallRound("bulwark-ch-gold", 3);
    const gold = getLegalActions(state, "p1").find((legal) => legal.label.includes("Gain 5 gold"));
    expect(gold, "the Gain 5 gold option should be offered").toBeTruthy();
    const before = state.players.p1.resources.gold;
    const after = applyOk(state, gold!.action);
    expect(after.players.p1.resources.gold).toBe(before + 5);
    expect(after.players.p1.cityHallRunesNextCombats ?? 0).toBe(0);
  });

  it("is ADDITIVE within a Resource round: a second resolution adds +3 on top", () => {
    // A City Hall resolution already banked +3 this round (e.g. a second
    // controlled Bulwark City Hall); resolving the option again adds, 3 + 3 = 6.
    const state = bulwarkCityHallRound("bulwark-ch-additive", 3);
    state.players.p1.cityHallRunesNextCombats = 3;
    const pick = runeOption(state);
    expect(pick).toBeTruthy();
    const after = applyOk(state, pick!.action);
    expect(after.players.p1.cityHallRunesNextCombats).toBe(6);
  });

  it("is cleared at the next Resource round: re-choosing stays +3 (never +6 across rounds)", () => {
    // Round 3: pick the combat focus → +3 (Kriv's separate flag also set).
    let state = bulwarkCityHallRound("bulwark-ch-rounds", 3);
    state = applyOk(state, runeOption(state)!.action);
    expect(state.players.p1.cityHallRunesNextCombats).toBe(3);
    state.players.p1.runeEmpoweredNextCombats = 3;

    // Round 5 (the next Resource round): both flags are cleared at round start…
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 5;
    startAdventureRound(state);
    pumpAdventureQueues(state);
    expect(state.players.p1.cityHallRunesNextCombats ?? 0, "City Hall flag cleared at the new Resource round").toBe(0);
    expect(state.players.p1.runeEmpoweredNextCombats ?? 0, "Kriv flag cleared at the new Resource round").toBe(0);

    // …and picking it again re-applies the flat +3 — it does not climb to +6.
    state = applyOk(state, runeOption(state)!.action);
    expect(state.players.p1.cityHallRunesNextCombats).toBe(3);
  });

  it("CONTROL: an Astrologers (even) round does not clear the City Hall flag", () => {
    let state = bulwarkCityHallRound("bulwark-ch-even", 3);
    state = applyOk(state, runeOption(state)!.action);
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 4;
    startAdventureRound(state);
    pumpAdventureQueues(state);
    expect(state.players.p1.cityHallRunesNextCombats).toBe(3);
  });
});
