import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, NEUTRAL_PLAYER_ID, type GameState } from "../index";
import { createInitialGameState } from "../setup";
import {
  combatHasHumanParticipant,
  computerPlayerIds,
  controllerOf,
  humanPlayerIdsByController,
  standardComputerController,
} from "./control";

describe("computer controller foundation", () => {
  it("keeps legacy snapshots human-controlled", () => {
    const state = createAdventureLobbyState({ seed: "controller-legacy" });
    expect(state.sessionMode).toBeUndefined();
    expect(controllerOf(state, "p1")).toEqual({ kind: "human" });
    expect(computerPlayerIds(state)).toEqual([]);
  });

  it("creates one human plus the requested computer seats", () => {
    const state = createAdventureLobbyState({
      seed: "controller-solo",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 3,
    });
    expect(state.setupLobby?.seats.map((seat) => seat.name)).toEqual([
      "Player 1",
      "Computer 1",
      "Computer 2",
      "Computer 3",
    ]);
    expect(humanPlayerIdsByController(state)).toEqual(["p1"]);
    expect(computerPlayerIds(state)).toEqual(["p2", "p3", "p4"]);
  });

  it("resizes roster and controller state atomically without stale players", () => {
    let state = createAdventureLobbyState({
      seed: "controller-resize",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state = applyAction(state, {
      type: "SET_COMPUTER_OPPONENTS",
      playerId: "p1",
      count: 3,
    }).state;
    expect(Object.keys(state.players)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(computerPlayerIds(state)).toEqual(["p2", "p3", "p4"]);

    const shrunk = applyAction(state, {
      type: "SET_COMPUTER_OPPONENTS",
      playerId: "p1",
      count: 1,
    });
    expect(shrunk.errors).toEqual([]);
    expect(Object.keys(shrunk.state.players)).toEqual(["p1", "p2"]);
    expect(Object.keys(shrunk.state.controllers ?? {})).toEqual(["p1", "p2"]);
    expect(computerPlayerIds(shrunk.state)).toEqual(["p2"]);
  });

  it("SET_GAME_OPTIONS.playerCount never mints a human opponent in single-player", () => {
    let state = createAdventureLobbyState({
      seed: "controller-invariant",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    // The generic multiplayer resize path must reassert the controller
    // invariant: seat 0 human, every new seat a named standard computer.
    state = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 4 },
    }).state;
    expect(computerPlayerIds(state)).toEqual(["p2", "p3", "p4"]);
    expect(humanPlayerIdsByController(state)).toEqual(["p1"]);
    expect(state.players.p4?.name).toBe("Computer 3");
  });

  it("combatHasHumanParticipant is true only when a living human seat is in the fight", () => {
    // AI-only (both seats computer): bulk-resolve off-screen.
    const aiOnly = createInitialGameState("human-participant-ai");
    aiOnly.controllers = {
      p1: standardComputerController(),
      p2: standardComputerController(),
    };
    expect(combatHasHumanParticipant(aiOnly)).toBe(false);

    // PvP: human p1 vs computer p2 — pace the fight.
    const pvp = createInitialGameState("human-participant-pvp");
    pvp.controllers = { p2: standardComputerController() };
    expect(combatHasHumanParticipant(pvp)).toBe(true);

    // Single-player PvP-Neutral-Control: the computer is the fighter, but the
    // next clockwise seat (human p1) owns the neutral side. That derived owner
    // is a real combat participant even though neutral unit.controllerId values
    // remain the sentinel "neutrals".
    const humanControlledNeutrals = createInitialGameState("human-participant-neutral-controller");
    humanControlledNeutrals.controllers = { p2: standardComputerController() };
    humanControlledNeutrals.sessionMode = "single-player";
    humanControlledNeutrals.adventure = {
      pvpNeutralControl: true,
    } as GameState["adventure"];
    const neutralCombat = humanControlledNeutrals.combat!;
    neutralCombat.attackerPlayerId = "p2";
    neutralCombat.defenderPlayerId = NEUTRAL_PLAYER_ID;
    neutralCombat.context = {
      kind: "neutral",
      heroId: "hero_p2",
      fieldId: "neutral-field",
      difficulty: 2,
      hasAzure: false,
    };
    for (const unit of Object.values(neutralCombat.units)) {
      if (unit.controllerId === "p1") {
        unit.controllerId = NEUTRAL_PLAYER_ID;
      }
    }
    expect(combatHasHumanParticipant(humanControlledNeutrals)).toBe(true);

    // CONTROL: with the option off, the same computer-vs-neutral encounter is
    // genuinely AI-only and remains eligible for off-screen bulk resolution.
    humanControlledNeutrals.adventure!.pvpNeutralControl = false;
    expect(combatHasHumanParticipant(humanControlledNeutrals)).toBe(false);

    // CONTROL: no open combat → false.
    pvp.combat = null;
    expect(combatHasHumanParticipant(pvp)).toBe(false);
  });

  it("requires explicit trusted computer authority in a hosted room", () => {
    const state = createAdventureLobbyState({
      seed: "controller-authority",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.room = {
      hosted: true,
      hostClientId: "human-client",
      visibility: "private",
      members: [
        { clientId: "human-client", name: "Human", seat: "p1", isHost: true },
      ],
    };
    const action = {
      type: "CHOOSE_FACTION" as const,
      playerId: "p2",
      factionId: "inferno" as const,
      heroDefId: "xyron",
    };

    expect(
      applyAction(state, action, { actorClientId: "human-client" }).errors[0]
        ?.message,
    ).toContain("only act for your own seat");
    const trusted = applyAction(state, action, { computerActorPlayerId: "p2" });
    expect(trusted.errors).toEqual([]);
    expect(
      trusted.state.setupLobby?.seats.find((seat) => seat.playerId === "p2")
        ?.factionId,
    ).toBe("inferno");
  });
});
