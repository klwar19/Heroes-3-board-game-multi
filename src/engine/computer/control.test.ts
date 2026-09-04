import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, NEUTRAL_PLAYER_ID, type GameState } from "../index";
import { neutralCombatControllerId } from "../neutral-control";
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

    // PvP-Neutral-Control: human p1 fights the guards and the OTHER HUMAN (p2,
    // next clockwise) owns the neutral side. That derived owner is a real
    // combat participant even though every neutral unit.controllerId stays the
    // sentinel "neutrals".
    const humanControlledNeutrals = createInitialGameState("human-participant-neutral-controller");
    humanControlledNeutrals.adventure = {
      pvpNeutralControl: true,
    } as GameState["adventure"];
    const neutralCombat = humanControlledNeutrals.combat!;
    neutralCombat.attackerPlayerId = "p1";
    neutralCombat.defenderPlayerId = NEUTRAL_PLAYER_ID;
    neutralCombat.context = {
      kind: "neutral",
      heroId: "hero_p1",
      fieldId: "neutral-field",
      difficulty: 2,
      hasAzure: false,
    };
    for (const unit of Object.values(neutralCombat.units)) {
      if (unit.controllerId === "p2") {
        unit.controllerId = NEUTRAL_PLAYER_ID;
      }
    }
    expect(neutralCombatControllerId(humanControlledNeutrals, neutralCombat)).toBe("p2");
    expect(combatHasHumanParticipant(humanControlledNeutrals)).toBe(true);

    // CONTROL: with the option off, nobody is handed the guards — but p1 is
    // still a human FIGHTER, so the predicate must stay true for that reason.
    humanControlledNeutrals.adventure!.pvpNeutralControl = false;
    expect(neutralCombatControllerId(humanControlledNeutrals, neutralCombat)).toBeNull();
    expect(combatHasHumanParticipant(humanControlledNeutrals)).toBe(true);

    // USER RULE 2026-09-04 ("only players should control neutral units … do not
    // fight neutrals vs AI"): a COMPUTER fighter's neutral fight is never handed
    // to a human, so the same shape with an AI fighter is genuinely AI-only and
    // remains eligible for off-screen bulk resolution. (This fixture used to
    // expect `true`; the rule that nulls its controller is pinned in
    // src/engine/pvp-neutral-control.test.ts.)
    const aiFighterNeutrals = createInitialGameState("ai-fighter-neutral-controller");
    aiFighterNeutrals.controllers = { p2: standardComputerController() };
    aiFighterNeutrals.adventure = {
      pvpNeutralControl: true,
    } as GameState["adventure"];
    const aiNeutralCombat = aiFighterNeutrals.combat!;
    aiNeutralCombat.attackerPlayerId = "p2";
    aiNeutralCombat.defenderPlayerId = NEUTRAL_PLAYER_ID;
    aiNeutralCombat.context = {
      kind: "neutral",
      heroId: "hero_p2",
      fieldId: "neutral-field",
      difficulty: 2,
      hasAzure: false,
    };
    for (const unit of Object.values(aiNeutralCombat.units)) {
      if (unit.controllerId === "p1") {
        unit.controllerId = NEUTRAL_PLAYER_ID;
      }
    }
    expect(neutralCombatControllerId(aiFighterNeutrals, aiNeutralCombat)).toBeNull();
    expect(combatHasHumanParticipant(aiFighterNeutrals)).toBe(false);

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
