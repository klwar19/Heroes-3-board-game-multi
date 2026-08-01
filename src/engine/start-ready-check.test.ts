import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureLobbyState,
  readyCheckConfirmers,
  START_CHECK_MS,
  type GameAction,
  type GameState,
  type RoomMember
} from "./index";

/**
 * Pre-start ready check (multiplayer hosted tables): pressing Start opens a
 * check instead of building the map; the map builds only once EVERY seated
 * player confirms within 30 seconds. Pressing Cancel, or the window elapsing,
 * drops the table back to setup. Every claim below fails if its wiring is
 * removed, each with a solo/open-table CONTROL that still starts immediately.
 */

const T0 = 2_000_000_000;

function applyOk(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, now?: number): string {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

/** A 2-seat setup lobby with both seats picked. */
function seatedLobby(seed: string): GameState {
  const state = createAdventureLobbyState({ seed, playerCount: 2 });
  const seats = state.setupLobby!.seats;
  seats[0].factionId = "castle";
  seats[0].heroDefId = "catherine";
  seats[1].factionId = "necropolis";
  seats[1].heroDefId = "sandro";
  return state;
}

function hostMembers(): RoomMember[] {
  return [
    { clientId: "c1", name: "Alice", seat: "p1", isHost: true },
    { clientId: "c2", name: "Bob", seat: "p2", isHost: false }
  ];
}

/** A hosted 2-player table (the mode the ready check is enforced on). */
function hostedLobby(seed: string): GameState {
  const state = seatedLobby(seed);
  state.room = { hosted: true, hostClientId: "c1", members: hostMembers() };
  return state;
}

describe("start ready check — hosted multiplayer", () => {
  it("opens the check on Start (does NOT build yet) and builds only once everyone confirms", () => {
    const state = hostedLobby("rc-confirm");

    // Start opens the check with the presser already confirmed — the map is NOT
    // built (still a setup lobby, no adventure).
    const opened = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);
    expect(opened.setupLobby?.startCheck).toMatchObject({
      startedByPlayerId: "p1",
      confirmations: ["p1"],
      deadline: T0 + START_CHECK_MS
    });
    expect(opened.setupLobby).not.toBeNull();
    expect(opened.adventure).toBeNull();

    // The second seat confirms → the map builds (lobby cleared, adventure live).
    const built = applyOk(opened, { type: "CONFIRM_START_ADVENTURE", playerId: "p2" }, T0 + 5_000);
    expect(built.setupLobby).toBeNull();
    expect(built.adventure).not.toBeNull();
    // The room (and its ranked flag) survives the build.
    expect(built.room?.hosted).toBe(true);
  });

  it("Cancel drops the table back to setup without building (CONTROL: a confirm would have started it)", () => {
    const state = hostedLobby("rc-cancel");
    const opened = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);

    const cancelled = applyOk(opened, { type: "CANCEL_START_ADVENTURE", playerId: "p2" }, T0 + 2_000);
    expect(cancelled.setupLobby?.startCheck ?? null).toBeNull();
    expect(cancelled.setupLobby).not.toBeNull();
    expect(cancelled.adventure).toBeNull();
    expect(
      cancelled.eventLog.some((event) => event.type === "START_CHECK_CANCELLED" && event.reason === "cancel")
    ).toBe(true);
  });

  it("the 30-second window elapsing aborts as a timeout instead of confirming late", () => {
    const state = hostedLobby("rc-timeout");
    const opened = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);

    // A confirm AFTER the deadline aborts (the AFK seat never confirmed in time).
    const timedOut = applyOk(
      opened,
      { type: "CONFIRM_START_ADVENTURE", playerId: "p2" },
      T0 + START_CHECK_MS + 1
    );
    expect(timedOut.setupLobby?.startCheck ?? null).toBeNull();
    expect(timedOut.adventure).toBeNull();
    expect(
      timedOut.eventLog.some((event) => event.type === "START_CHECK_CANCELLED" && event.reason === "timeout")
    ).toBe(true);
  });

  it("only a seated player may confirm or cancel the check", () => {
    const state = hostedLobby("rc-guards");
    const opened = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);
    // "observer" / an unknown seat is not a confirmer.
    expect(
      expectRejected(opened, { type: "CONFIRM_START_ADVENTURE", playerId: "neutral" }, T0 + 1_000)
    ).toContain("seated player");
    // Confirming with no check open is rejected.
    expect(
      expectRejected(state, { type: "CONFIRM_START_ADVENTURE", playerId: "p1" }, T0)
    ).toContain("No start check is open");
  });

  it("ranked room creation auto-seats every joining player and lets the non-creator confirm", () => {
    let state = seatedLobby("rc-ranked-creation");
    // This is the real creation order: the API seeds ranked before the creator
    // joins; the creator then turns hosting on, and the opponent joins later.
    state.room = { hosted: false, hostClientId: null, ranked: true, members: [] };
    state = applyOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = applyOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    expect(state.room?.members.find((member) => member.clientId === "c1")?.seat).toBe("p1");

    state = applyOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    expect(state.room?.members.find((member) => member.clientId === "c2")?.seat).toBe("p2");
    expect(readyCheckConfirmers(state)).toEqual(["p1", "p2"]);

    const opened = applyAction(
      state,
      { type: "START_ADVENTURE", playerId: "p1" },
      { now: T0, actorClientId: "c1" }
    );
    expect(opened.errors).toEqual([]);
    expect(opened.state.setupLobby?.startCheck?.confirmations).toEqual(["p1"]);

    const confirmed = applyAction(
      opened.state,
      { type: "CONFIRM_START_ADVENTURE", playerId: "p2" },
      { now: T0 + 1_000, actorClientId: "c2" }
    );
    expect(confirmed.errors).toEqual([]);
    expect(confirmed.state.setupLobby).toBeNull();
    expect(confirmed.state.adventure).not.toBeNull();
    expect(confirmed.state.room?.ranked).toBe(true);
  });
});

describe("start ready check — CONTROLs that start immediately (no check)", () => {
  it("a solo / no-room lobby builds the map straight away on Start", () => {
    const state = seatedLobby("rc-solo"); // no state.room at all
    const built = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);
    expect(built.setupLobby).toBeNull();
    expect(built.adventure).not.toBeNull();
  });

  it("an OPEN (un-hosted) table builds immediately even with two members", () => {
    const state = seatedLobby("rc-open");
    state.room = { hosted: false, hostClientId: null, members: hostMembers() };
    const built = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);
    expect(built.setupLobby).toBeNull();
    expect(built.adventure).not.toBeNull();
  });

  it("single-player: one human plus computers starts the moment the human presses Start", () => {
    let state = createAdventureLobbyState({
      seed: "rc-single-player",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2
    });
    // A hosted PRIVATE room with the ONE human member — computer seats have no
    // RoomMember row, so they must never be waited on as confirmers.
    state.room = {
      hosted: true,
      hostClientId: "c1",
      visibility: "private",
      ranked: false,
      members: [{ clientId: "c1", name: "Owner", seat: "p1", isHost: true }]
    };
    state = applyOk(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    for (const [playerId, factionId, heroDefId] of [
      ["p2", "inferno", "xyron"],
      ["p3", "necropolis", "sandro"]
    ] as const) {
      const picked = applyAction(
        state,
        { type: "CHOOSE_FACTION", playerId, factionId, heroDefId },
        { computerActorPlayerId: playerId }
      );
      expect(picked.errors).toEqual([]);
      state = picked.state;
    }

    const built = applyOk(state, { type: "START_ADVENTURE", playerId: "p1" }, T0);
    // No ready check opened — the map built immediately…
    expect(built.setupLobby).toBeNull();
    expect(built.adventure).not.toBeNull();
    // …and the built game keeps its single-player identity end to end.
    expect(built.sessionMode).toBe("single-player");
    expect(built.controllers?.p2?.kind).toBe("computer");
    expect(built.controllers?.p3?.kind).toBe("computer");
    expect(built.room?.visibility).toBe("private");
    expect(built.room?.ranked).toBe(false);
  });
});
