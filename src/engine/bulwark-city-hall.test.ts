import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

/**
 * Bulwark City Hall — the "Rune-Empowered" combat-focus Resource-round option
 * (Gamefound Update #3). Two things are pinned here:
 *   1. the nerf: the option grants +2 starting Runes each combat, not +3, and
 *   2. it must NOT stack — neither within one resolution (the handler SETS the
 *      flag, it never adds) nor round after round (the flag is cleared at every
 *      Resource round before the choice is re-offered).
 * Both are tested on the OBSERVABLE flag (PlayerState.runeEmpoweredNextCombats),
 * the exact value seedRunesForCombat reads when a battle opens.
 */
describe("Bulwark City Hall — Rune-Empowered combat focus (nerfed +2, non-stacking)", () => {
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

  it("grants exactly +2 starting Runes (the nerf), not +3", () => {
    const state = bulwarkCityHallRound("bulwark-ch-plus2", 3);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "city-hall").toBe(true);

    const pick = runeOption(state);
    expect(pick, "the Rune-Empowered combat-focus option should be offered").toBeTruthy();
    const after = applyOk(state, pick!.action);
    expect(after.players.p1.runeEmpoweredNextCombats).toBe(2);
  });

  it("does NOT stack within a resolution: the handler REPLACES the flag with +2 (never +7)", () => {
    // Inject a stale flag value AFTER the round's clear but BEFORE resolving the
    // choice, so this directly exercises the resolver's set-vs-add behaviour. If
    // the handler ever used `+=` instead of `=`, this would read 5 + 2 = 7.
    const state = bulwarkCityHallRound("bulwark-ch-nostack", 3);
    state.players.p1.runeEmpoweredNextCombats = 5;
    const pick = runeOption(state);
    expect(pick).toBeTruthy();
    const after = applyOk(state, pick!.action);
    expect(after.players.p1.runeEmpoweredNextCombats).toBe(2); // replaced, not 7
  });

  it("does NOT stack across Resource rounds: cleared at the new round, re-choosing stays +2 (never +4)", () => {
    // Round 3: pick the combat focus → +2.
    let state = bulwarkCityHallRound("bulwark-ch-rounds", 3);
    state = applyOk(state, runeOption(state)!.action);
    expect(state.players.p1.runeEmpoweredNextCombats).toBe(2);

    // Round 5 (the next Resource round): the flag must be cleared at round start…
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 5;
    startAdventureRound(state);
    pumpAdventureQueues(state);
    expect(state.players.p1.runeEmpoweredNextCombats ?? 0, "flag cleared at the new Resource round").toBe(0);

    // …and picking it again re-applies the flat +2 — it does not climb to +4.
    state = applyOk(state, runeOption(state)!.action);
    expect(state.players.p1.runeEmpoweredNextCombats).toBe(2);
  });
});
