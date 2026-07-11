import { describe, expect, it } from "vitest";
import { createAdventureLobbyState } from "@/engine";
import { driveComputerPlayers } from "./computer-runner";

describe("computer runner foundation", () => {
  it("completes every computer free-pick seat through real legal actions and stops for the human", () => {
    const state = createAdventureLobbyState({
      seed: "runner-setup",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 3,
    });
    const result = driveComputerPlayers(state);

    expect(result.stalled).toBe(false);
    expect(result.decisions).toHaveLength(3);
    expect(
      result.decisions.every(
        (decision) => decision.action.type === "CHOOSE_FACTION",
      ),
    ).toBe(true);
    const seats = result.state.setupLobby!.seats;
    expect(seats[0].factionId).toBeNull();
    expect(
      seats.slice(1).every((seat) => seat.factionId && seat.heroDefId),
    ).toBe(true);
    expect(new Set(seats.slice(1).map((seat) => seat.factionId)).size).toBe(3);
  });

  it("reports an explicit stall instead of looping when policy has no safe action", () => {
    const state = createAdventureLobbyState({
      seed: "runner-stall",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.setupLobby!.seats[1].factionId = "inferno";
    state.setupLobby!.seats[1].heroDefId = null;
    // In open format CHOOSE_FACTION remains available, so deliberately remove
    // every playable faction by reserving the only capacity through a fixture.
    for (const seat of state.setupLobby!.seats) {
      if (seat.playerId === "p1") {
        seat.factionId = "castle";
        seat.heroDefId = "catherine";
      }
    }
    const result = driveComputerPlayers(
      state,
      () => ({
        state,
        events: [],
        errors: [{ code: "ACTION_NOT_LEGAL", message: "broken fixture" }],
      }),
      { maxSteps: 2 },
    );
    expect(result.stalled).toBe(true);
    expect(result.reason).toContain("no safe legal action");
  });
});
