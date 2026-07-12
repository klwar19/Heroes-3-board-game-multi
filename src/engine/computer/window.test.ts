import { describe, expect, it } from "vitest";
import { applyAction } from "../reducer";
import { createAdventureLobbyState } from "../adventure-setup";
import { computerDecisionOwner } from "./window";

describe("computer decision ownership", () => {
  it("finds an incomplete computer setup seat only after the human picked, and never claims the human seat", () => {
    const state = createAdventureLobbyState({
      seed: "window-setup",
      sessionMode: "single-player",
      computerOpponents: 2,
      scenarioId: "skirmish",
    });
    // Human first dibs: while the human seat is incomplete, no computer seat
    // owes a pick (a bot must not snipe the faction the human wants).
    expect(computerDecisionOwner(state)).toBeNull();
    state.setupLobby!.seats[0].factionId = "castle";
    state.setupLobby!.seats[0].heroDefId = "catherine";
    expect(computerDecisionOwner(state)).toBe("p2");
    state.setupLobby!.seats[1].factionId = "inferno";
    state.setupLobby!.seats[1].heroDefId = "xyron";
    expect(computerDecisionOwner(state)).toBe("p3");
    state.setupLobby!.seats[2].factionId = "necropolis";
    state.setupLobby!.seats[2].heroDefId = "sandro";
    expect(computerDecisionOwner(state)).toBeNull();
  });

  it("gives a computer-owned pending choice priority over turn ownership", () => {
    const state = createAdventureLobbyState({
      seed: "window-choice",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.pendingChoice = {
      id: "choice_bot",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Pick",
      options: [{ label: "One" }],
      context: "city-hall",
      returnPhase: "setup",
    };
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  it("WAITS on a human-owned pending choice instead of falling through to a computer seat", () => {
    const state = createAdventureLobbyState({
      seed: "window-human-choice",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.setupLobby!.seats[0].factionId = "castle";
    state.setupLobby!.seats[0].heroDefId = "catherine";
    // Without a choice, the incomplete computer setup seat owes its pick…
    expect(computerDecisionOwner(state)).toBe("p2");
    // …but an open HUMAN-owned exclusive interaction freezes everyone else.
    state.pendingChoice = {
      id: "choice_human",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Pick",
      options: [{ label: "One" }],
      context: "city-hall",
      returnPhase: "setup",
    };
    expect(computerDecisionOwner(state)).toBeNull();
  });

  it("drives a computer-owned commander First Aid window (exclusive interaction)", () => {
    const state = createAdventureLobbyState({
      seed: "window-first-aid",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    // Simulate post-combat First Aid owned by the computer while the human
    // would otherwise be the active seat — exclusive map interaction must win.
    state.phase = "player-turn";
    state.activePlayerId = "p1";
    state.adventure = {
      ...(state.adventure as object),
      pendingCommanderFirstAid: {
        playerId: "p2",
        options: [
          {
            label: "Restore Pikemen",
            kind: "revive",
            unitDefId: "castle.pikemen",
            side: "few",
          },
        ],
      },
    } as typeof state.adventure;
    expect(computerDecisionOwner(state)).toBe("p2");

    // CONTROL: human-owned First Aid freezes computers.
    (
      state.adventure as { pendingCommanderFirstAid: { playerId: string } }
    ).pendingCommanderFirstAid.playerId = "p1";
    expect(computerDecisionOwner(state)).toBeNull();
  });

  it("drives a computer-owned pending visit (Event / field reward) over turn ownership", () => {
    const state = createAdventureLobbyState({
      seed: "window-visit",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "player-turn";
    state.activePlayerId = "p1";
    state.adventure = {
      ...(state.adventure as object),
      pendingVisit: {
        playerId: "p2",
        heroId: "h2",
        fieldId: "0,0",
        steps: [
          {
            type: "CHOOSE_ONE",
            prompt: "Event",
            options: [{ label: "Gain gold", steps: [{ type: "GAIN_RESOURCES", gold: 5 }] }],
          },
        ],
      },
    } as typeof state.adventure;
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  it("draft format: computers wait for the human's town, then lock; a locked seat waits for its ban turn", () => {
    let state = createAdventureLobbyState({
      seed: "window-draft-wait",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state = applyAction(state, {
      type: "SET_DRAFT_FORMAT",
      playerId: "p1",
      format: "draft",
    }).state;
    // Human town dibs first: the computer seat owes nothing yet.
    expect(computerDecisionOwner(state)).toBeNull();
    state = applyAction(state, {
      type: "CHOOSE_TOWN",
      playerId: "p1",
      factionId: "castle",
    }).state;
    // Now the computer seat owes its town lock.
    expect(computerDecisionOwner(state)).toBe("p2");
    const locked = applyAction(
      state,
      { type: "CHOOSE_TOWN", playerId: "p2", factionId: "inferno" },
      { computerActorPlayerId: "p2" },
    );
    expect(locked.errors).toEqual([]);
    state = locked.state;
    // Ban phase opens with the HUMAN as the first banner: the computer seat is
    // incomplete (no hero) but has NO legal setup action — never the owner.
    expect(computerDecisionOwner(state)).toBeNull();
  });
});
