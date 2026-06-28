import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Setup take-back warning. Clearing a roll, resetting a town, or resetting a
 * pick during map setup (RESET_SEAT_DRAFT, available in all four formats)
 * broadcasts a SETUP_SEAT_RESET event into the shared log so every client can
 * render the red "that's cheating" banner. These tests assert the OBSERVABLE
 * outcome — the event, its scope and its target — and that ordinary picks/locks
 * never raise it (the control), so the warning fails if its wiring is removed.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function resetEvents(state: GameState) {
  return state.eventLog.filter((event) => event.type === "SETUP_SEAT_RESET");
}

function lastReset(state: GameState) {
  const all = resetEvents(state);
  return all[all.length - 1];
}

describe("setup take-back warning event", () => {
  it("flags resetting a locked hero pick (free-pick format) as scope 'pick'", () => {
    let state = createAdventureLobbyState({ seed: "reset-pick" });
    // Free pick (the default "open" format): a full faction + hero pick.
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    // CONTROL: a normal pick must NOT raise the take-back warning.
    expect(resetEvents(state)).toHaveLength(0);

    state = apply(state, { type: "RESET_SEAT_DRAFT", playerId: "p1" });
    const event = lastReset(state);
    expect(event).toBeDefined();
    expect(event.type === "SETUP_SEAT_RESET" && event.scope).toBe("pick");
    expect(event.playerId).toBe("p1");
    expect(event.type === "SETUP_SEAT_RESET" && event.message).toContain("hero pick");
  });

  it("flags resetting a rolled-and-locked town (random-with-choice) as scope 'town'", () => {
    let state = createAdventureLobbyState({ seed: "reset-town" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "random-choice" });
    state = apply(state, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" });
    const rolled = state.setupLobby?.draft?.seatRolls?.p1?.townOptions ?? [];
    expect(rolled.length).toBe(2);

    // Lock one of the two rolled towns (no hero yet).
    state = apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: rolled[0] });
    // CONTROL: locking a town is not a take-back.
    expect(resetEvents(state)).toHaveLength(0);

    state = apply(state, { type: "RESET_SEAT_DRAFT", playerId: "p1" });
    const event = lastReset(state);
    expect(event.type === "SETUP_SEAT_RESET" && event.scope).toBe("town");
    expect(event.type === "SETUP_SEAT_RESET" && event.message).toContain("rolled town");
  });

  it("flags clearing a pending roll (draft format) as scope 'roll'", () => {
    let state = createAdventureLobbyState({ seed: "reset-roll" });
    state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format: "draft" });
    state = apply(state, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" });
    expect(state.setupLobby?.draft?.seatRolls?.p1?.townOptions?.length).toBe(2);

    state = apply(state, { type: "RESET_SEAT_DRAFT", playerId: "p1" });
    const event = lastReset(state);
    expect(event.type === "SETUP_SEAT_RESET" && event.scope).toBe("roll");
    expect(event.type === "SETUP_SEAT_RESET" && event.message).toContain("cleared their roll");
    // The pending roll is genuinely gone (the take-back actually happened).
    expect(state.setupLobby?.draft?.seatRolls?.p1).toBeUndefined();
  });

  it("fires in every setup format, never on a plain format switch", () => {
    // Each format commits a choice its own way; resetting it must warn in all four.
    const commit: Record<"open" | "draft" | "random" | "random-choice", (state: GameState) => GameState> = {
      open: (state) =>
        apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }),
      draft: (state) => apply(state, { type: "CHOOSE_TOWN", playerId: "p1", factionId: "castle" }),
      random: (state) => apply(state, { type: "RANDOM_ASSIGN_SEAT", playerId: "p1", scope: "faction" }),
      "random-choice": (state) => apply(state, { type: "ROLL_TOWN_OPTIONS", playerId: "p1" })
    };

    for (const format of ["open", "draft", "random", "random-choice"] as const) {
      let state = createAdventureLobbyState({ seed: `reset-fmt-${format}` });
      state = apply(state, { type: "SET_DRAFT_FORMAT", playerId: "p1", format });
      // CONTROL: choosing a format is not a take-back.
      expect(resetEvents(state), `format ${format} switch`).toHaveLength(0);

      state = commit[format](state);
      state = apply(state, { type: "RESET_SEAT_DRAFT", playerId: "p1" });
      expect(resetEvents(state), `format ${format} reset`).toHaveLength(1);
    }
  });
});
