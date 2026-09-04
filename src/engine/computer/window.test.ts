import { describe, expect, it } from "vitest";
import { applyAction } from "../reducer";
import { createAdventureGameState, createAdventureLobbyState } from "../adventure-setup";
import { getLegalActions } from "../legal-actions";
import { computerDecisionOwner } from "./window";
import { NEUTRAL_PLAYER_ID } from "../state";

describe("computer decision ownership", () => {
  it("waits behind the first-player ceremony until a human dismisses it", () => {
    const state = createAdventureGameState({
      seed: "computer-first-roll-gate",
      playerCount: 2,
    });
    state.sessionMode = "single-player";
    state.controllers = {
      p1: { kind: "human" },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 },
    };
    state.turnOrder = ["p2", "p1"];
    state.activePlayerId = "p2";
    state.adventure!.openingFirstPlayerRollPending = true;

    expect(state.adventure?.openingFirstPlayerRollPending).toBe(true);
    expect(computerDecisionOwner(state)).toBeNull();
    expect(getLegalActions(state, "p2")).toEqual([]);
    expect(getLegalActions(state, "p1").map((legal) => legal.action.type)).toEqual([
      "ACKNOWLEDGE_FIRST_PLAYER_ROLL",
    ]);

    const acknowledged = applyAction(state, {
      type: "ACKNOWLEDGE_FIRST_PLAYER_ROLL",
      playerId: "p1",
    });
    expect(acknowledged.errors).toEqual([]);
    expect(acknowledged.state.adventure?.openingFirstPlayerRollPending).toBe(false);
    expect(computerDecisionOwner(acknowledged.state)).toBe("p2");
  });

  function neutralControlCombat(pendingNeutralPlacement: string | null, activeUnitId?: string) {
    const state = createAdventureLobbyState({
      seed: "window-neutral-control",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "combat";
    state.turnOrder = ["p1", "p2"];
    state.adventure = {
      ...(state.adventure as object),
      pvpNeutralControl: true,
    } as typeof state.adventure;
    state.combat = {
      id: "neutral-control-combat",
      context: { kind: "neutral" },
      attackerPlayerId: "p1",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      pendingNeutralPlacement,
      activeUnitId,
      units: activeUnitId
        ? {
            [activeUnitId]: {
              id: activeUnitId,
              controllerId: NEUTRAL_PLAYER_ID,
              position: 9,
            },
          }
        : {},
      setup: { pendingPlayerIds: [], placedUnitIds: [] },
      outcome: null,
      endAcknowledged: false,
    } as unknown as typeof state.combat;
    return state;
  }

  it("routes PvP Neutral Control placement to the assigned computer seat", () => {
    const state = neutralControlCombat("p2");
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  /**
   * USER RULE 2026-09-04 (a 1 v 1 + 2 AI Clash): "only players should control
   * neutral units (now it's mixed, depending on where the seats are — just skip
   * AI in this)". PvP Neutral Control now SKIPS every computer seat when walking
   * clockwise, so a table whose only other seat is an AI derives NO controller:
   * `combatUnitDecisionOwnerId` falls back to the Neutral sentinel and the plain
   * Neutral AI plays the guard. This case used to expect "p2" (the AI seat
   * driving the guards through the human-facing menu). The human-controller
   * routing is pinned in src/engine/pvp-neutral-control.test.ts.
   */
  it("never routes a neutral guard activation to a computer seat", () => {
    const state = neutralControlCombat(null, "neutral_guard");
    expect(computerDecisionOwner(state)).toBeNull();
    // CONTROL: the branch itself is alive — a STAMPED placement window owner is
    // still driven (see the placement case above), so this null is the
    // controller derivation, not a dead code path.
    expect(computerDecisionOwner(neutralControlCombat("p2"))).toBe("p2");
  });

  it("does not invent an acknowledgment owner after a sandbox combat ends", () => {
    const state = neutralControlCombat(null);
    state.combat!.context = { kind: "sandbox" };
    state.combat!.outcome = {
      winnerPlayerId: "p2",
      defeatedPlayerId: "p1",
      reason: "all-enemy-units-defeated",
    };

    expect(getLegalActions(state, "p1")).toEqual([]);
    expect(getLegalActions(state, "p2")).toEqual([]);
    expect(computerDecisionOwner(state)).toBeNull();
  });

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

  it("WAITS during PvP pre-battle prep while only the human still owes an Accept (never claims the computer placement owner)", () => {
    const state = createAdventureLobbyState({
      seed: "window-pvp-prep",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "combat";
    state.activePlayerId = "p2";
    // A PvP fight: computer p2 (attacker) attacked human p1 (defender). Prep is
    // still open — p2 has accepted, p1 has NOT. `setup.pendingPlayerIds` is
    // already populated (p2 first), but placement is legal for NOBODY until both
    // sides accept (legal-actions returns early on `combat.prep`).
    state.combat = {
      id: "cb1",
      context: { kind: "player" },
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      prep: { accepted: ["p2"] },
      setup: { pendingPlayerIds: ["p2", "p1"], placedUnitIds: [] },
      units: {},
      outcome: null,
      endAcknowledged: false,
    } as unknown as typeof state.combat;
    // BUG (fixed): the prep loop only RETURNED for a computer that owed an
    // accept; with the human still owing it, ownership fell through to the
    // placement owner (`setup.pendingPlayerIds[0] === "p2"`) and returned the
    // computer — which then had NO legal placement action, stalling the paced
    // pump. It must WAIT for the human instead.
    expect(computerDecisionOwner(state)).toBeNull();

    // CONTROL: once the human accepts (prep clears) and the computer is first to
    // deploy, the computer DOES owe the placement.
    (state.combat as unknown as { prep: unknown }).prep = null;
    expect(computerDecisionOwner(state)).toBe("p2");

    // CONTROL: while prep is open and the COMPUTER still owes the accept, drive
    // its Accept.
    (state.combat as unknown as { prep: { accepted: string[] } }).prep = {
      accepted: ["p1"],
    };
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  it("WAITS on a HUMAN pre-activation reaction pause even when the paused-on unit is the COMPUTER's", () => {
    const state = createAdventureLobbyState({
      seed: "window-pvp-pre-activation",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "combat";
    state.activePlayerId = "p2";
    // PvP fight: computer p2 (attacker) attacked human p1 (defender). p2's unit
    // is about to activate, but a PRE-ACTIVATION reaction pause gives the HUMAN
    // (p1) the chance to react first — p1 holds priority (reactingPlayerId).
    state.combat = {
      id: "cb-pause",
      context: { kind: "player" },
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      prep: null,
      setup: { pendingPlayerIds: [], placedUnitIds: [] },
      activeUnitId: "unit_p2_dread_knights",
      units: {
        unit_p2_dread_knights: {
          id: "unit_p2_dread_knights",
          controllerId: "p2",
          position: 9,
        },
      },
      pendingNeutralStep: {
        kind: "pre-activation",
        unitId: "unit_p2_dread_knights",
        name: "Dread Knights",
        reactingPlayerId: "p1",
      },
      outcome: null,
      endAcknowledged: false,
    } as unknown as typeof state.combat;

    // BUG (fixed): ownership fell through the human reactor to the ACTIVE unit's
    // owner (p2, a computer), which then had ZERO legal actions while the pause
    // held → the paced pump stalled. The reactor owns the gate: a human reactor
    // makes the table WAIT.
    expect(computerDecisionOwner(state)).toBeNull();

    // CONTROL A: a COMPUTER reactor (an AI-only fight's pre-activation pause) is
    // still driven — the reactor, not the active unit's owner, is returned.
    (
      state.combat as unknown as { pendingNeutralStep: { reactingPlayerId: string } }
    ).pendingNeutralStep.reactingPlayerId = "p2";
    expect(computerDecisionOwner(state)).toBe("p2");

    // CONTROL B: with NO pause open, the active unit's owner (p2) legitimately
    // owns the activation — proving the pause is exactly what shifts ownership
    // (this is the pre-fix fall-through, correct only when no pause is up).
    (state.combat as unknown as { pendingNeutralStep: unknown }).pendingNeutralStep =
      undefined;
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

  /**
   * The reported round-6 single-player freeze: on a round-start barrier round
   * (a Calamity Wave / Astrologers round), a COMPUTER seat that won its wave
   * assault opens its after-combat Necromancy window while the barrier is
   * still up. `roundStartEventResolver` reads only pendingChoice/pendingVisit
   * (null here), and the pre-fix barrier branch returned that null
   * UNCONDITIONALLY — so nobody owned the window: the pump never drove the
   * computer, the human's legal set was empty, and every click was rejected
   * with "That action is not legal in the current game state." forever.
   */
  it("drives a computer-owned window the barrier's resolver read does not cover (the round-6 wave/Necromancy freeze)", () => {
    const state = createAdventureLobbyState({
      seed: "window-barrier-necromancy",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "player-turn";
    state.activePlayerId = "p1";
    state.adventure = {
      ...(state.adventure as object),
      eventResolution: { round: state.round },
      pendingNecromancy: { playerId: "p2", remaining: 1 },
    } as typeof state.adventure;
    // Barrier up, resolver null (no pendingChoice/pendingVisit), the computer
    // owns the Necromancy window: it MUST be driven.
    expect(computerDecisionOwner(state)).toBe("p2");

    // CONTROL: a HUMAN-owned window behind the barrier still makes everyone wait.
    (
      state.adventure as unknown as { pendingNecromancy: { playerId: string } }
    ).pendingNecromancy.playerId = "p1";
    expect(computerDecisionOwner(state)).toBeNull();

    // CONTROL: a named resolver (an open pendingVisit) wins the barrier — the
    // human resolver freezes the computer, a computer resolver is driven.
    (
      state.adventure as unknown as { pendingNecromancy: { playerId: string } }
    ).pendingNecromancy.playerId = "p2";
    (state.adventure as unknown as { pendingVisit: unknown }).pendingVisit = {
      playerId: "p1",
      heroId: "h1",
      fieldId: "0,0",
      steps: [{ type: "CHOOSE_ONE", prompt: "Event", options: [{ label: "x", steps: [] }] }],
    };
    expect(computerDecisionOwner(state)).toBeNull();
  });

  it("an OPEN COMBAT outranks a human-owned map window (mirrors getLegalActions' dispatcher-first order)", () => {
    const state = createAdventureLobbyState({
      seed: "window-combat-first",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "combat";
    state.activePlayerId = "p1";
    // A human-owned map window is open (e.g. commander First Aid from the
    // previous fight) while the COMPUTER's queued wave assault is already on
    // the table and owes its deployment. legal-actions shadows the map window
    // behind the combat dispatcher, so ownership must follow the combat — the
    // pre-fix map-first read returned null and froze the assault forever.
    state.adventure = {
      ...(state.adventure as object),
      pendingCommanderFirstAid: {
        playerId: "p1",
        options: [{ label: "Restore", kind: "revive", unitDefId: "castle.pikemen", side: "few" }],
      },
    } as typeof state.adventure;
    state.combat = {
      id: "cb-wave",
      context: { kind: "neutral" },
      attackerPlayerId: "p2",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      prep: null,
      setup: { pendingPlayerIds: ["p2"], placedUnitIds: [] },
      units: {},
      outcome: null,
      endAcknowledged: false,
    } as unknown as typeof state.combat;
    expect(computerDecisionOwner(state)).toBe("p2");

    // CONTROL: with the combat gone, the human's map window makes the table wait.
    state.combat = null;
    state.phase = "player-turn";
    expect(computerDecisionOwner(state)).toBeNull();
  });

  it("map windows resolve in getLegalActions' own gate order (First Aid gates Necromancy, not the reverse)", () => {
    const state = createAdventureLobbyState({
      seed: "window-map-order",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "player-turn";
    state.activePlayerId = "p1";
    // Both windows open with DIFFERENT owners: legal-actions gates the whole
    // table on pendingCommanderFirstAid FIRST, so a computer Necromancy owner
    // has zero legal actions until the human's First Aid resolves. The pre-fix
    // "any computer among the owners" read claimed the computer and stalled.
    state.adventure = {
      ...(state.adventure as object),
      pendingCommanderFirstAid: {
        playerId: "p1",
        options: [{ label: "Restore", kind: "revive", unitDefId: "castle.pikemen", side: "few" }],
      },
      pendingNecromancy: { playerId: "p2", remaining: 1 },
    } as typeof state.adventure;
    expect(computerDecisionOwner(state)).toBeNull();

    // CONTROL (reversed owners): the computer First Aid head is driven.
    (
      state.adventure as unknown as {
        pendingCommanderFirstAid: { playerId: string };
        pendingNecromancy: { playerId: string };
      }
    ).pendingCommanderFirstAid.playerId = "p2";
    (
      state.adventure as unknown as { pendingNecromancy: { playerId: string } }
    ).pendingNecromancy.playerId = "p1";
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  it("WAITS on the WOG commander pre-combat sort window instead of claiming the active unit's computer owner", () => {
    const state = createAdventureLobbyState({
      seed: "window-commander-sort",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "combat-setup";
    state.combat = {
      id: "cb-sort",
      context: { kind: "player" },
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      prep: null,
      setup: null,
      pendingCommanderPlacement: ["p1"],
      activeUnitId: "unit_p2",
      units: { unit_p2: { id: "unit_p2", controllerId: "p2", position: 9 } },
      outcome: null,
      endAcknowledged: false,
    } as unknown as typeof state.combat;
    // legal-actions gates the whole table on the sort head (the human): the
    // pre-fix fall-through claimed the computer active-unit owner, which had
    // zero legal actions → stall.
    expect(computerDecisionOwner(state)).toBeNull();

    // CONTROL: a computer head would be driven (future-proofing — today the
    // window opener skips computer seats).
    (
      state.combat as unknown as { pendingCommanderPlacement: string[] }
    ).pendingCommanderPlacement = ["p2"];
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  it("a guard-walk pause with NO named reactor belongs to the attacking fighter (legal-actions' own default)", () => {
    const state = createAdventureLobbyState({
      seed: "window-pause-default",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "combat";
    state.combat = {
      id: "cb-pause-default",
      context: { kind: "neutral" },
      attackerPlayerId: "p2",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      prep: null,
      setup: null,
      activeUnitId: "guard_1",
      units: { guard_1: { id: "guard_1", controllerId: NEUTRAL_PLAYER_ID, position: 3 } },
      pendingNeutralStep: { kind: "guard-walk", unitId: "guard_1" },
      outcome: null,
      endAcknowledged: false,
    } as unknown as typeof state.combat;
    // Legacy pause with no reactingPlayerId: legal-actions offers the
    // CONTINUE to the attacker — a computer attacker must be driven (the
    // pre-fix fall-through reached the NEUTRAL active unit and returned null).
    expect(computerDecisionOwner(state)).toBe("p2");
  });

  it("an orphaned garrison prompt on an ELIMINATED defender no longer freezes every computer seat", () => {
    const state = createAdventureLobbyState({
      seed: "window-orphan-garrison",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.phase = "player-turn";
    state.activePlayerId = "p2";
    state.players.p1.eliminated = true;
    state.adventure = {
      ...(state.adventure as object),
      pendingGarrison: { defenderPlayerId: "p1" },
    } as typeof state.adventure;
    // The eliminated defender's window gates nothing in legal-actions — the
    // computer's open turn must still be driven (pre-fix: permanent null).
    expect(computerDecisionOwner(state)).toBe("p2");

    // CONTROL: a LIVE human defender's garrison prompt makes the table wait.
    state.players.p1.eliminated = false;
    expect(computerDecisionOwner(state)).toBeNull();
  });
});
