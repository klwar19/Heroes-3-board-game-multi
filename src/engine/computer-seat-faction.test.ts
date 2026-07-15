import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState, getLegalActions } from "./index";
import { chooseComputerAction, computerDecisionOwner, observeForComputer } from "./computer";
import type { FactionId, GameState } from "./state";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";

/**
 * SET_COMPUTER_SEAT_FACTION — the single-player human owner hand-picks, rolls, or
 * clears each COMPUTER seat's faction + hero. Every claim asserts the observable
 * lobby outcome (a seat's faction/hero/name, the offered legal set, the pump's
 * behaviour) and each rejection has a mode-off / wrong-seat CONTROL, so a test
 * fails if the wiring is removed.
 */

function singlePlayerLobby(seed = "csf", computerOpponents = 2): GameState {
  return createAdventureLobbyState({
    seed,
    sessionMode: "single-player",
    computerOpponents,
    scenarioId: "skirmish"
  });
}

function seatOf(state: GameState, playerId: string) {
  const seat = state.setupLobby!.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat) {
    throw new Error(`seat ${playerId} not found`);
  }
  return seat;
}

const CASTLE_NAME = coreFactionDefinitions.castle.name;
const CATHERINE_NAME = coreHeroDefinitions.catherine.name;

describe("SET_COMPUTER_SEAT_FACTION — set", () => {
  it("writes the faction+hero to the target computer seat and its display name", () => {
    const result = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    });
    expect(result.errors).toEqual([]);
    const seat = seatOf(result.state, "p2");
    expect(seat.factionId).toBe("castle");
    expect(seat.heroDefId).toBe("catherine");
    // Same name wiring as chooseFaction — no longer the bare "Computer N".
    expect(result.state.players.p2.name).toBe(`${CATHERINE_NAME} of ${CASTLE_NAME}`);
  });

  it("re-picking overwrites an earlier pick on the same seat", () => {
    let state = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    }).state;
    state = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "inferno", heroDefId: "xyron" }
    }).state;
    expect(seatOf(state, "p2").factionId).toBe("inferno");
    expect(seatOf(state, "p2").heroDefId).toBe("xyron");
  });
});

describe("SET_COMPUTER_SEAT_FACTION — roll", () => {
  it("assigns a playable faction + one of its heroes, deterministically under a fixed seed", () => {
    const roll = () =>
      applyAction(singlePlayerLobby("roll-seed"), {
        type: "SET_COMPUTER_SEAT_FACTION",
        playerId: "p1",
        seatPlayerId: "p2",
        choice: "roll"
      }).state;
    const a = seatOf(roll(), "p2");
    const b = seatOf(roll(), "p2");
    // Same seed → identical roll (seeded, replayable across clients).
    expect(a.factionId).toBe(b.factionId);
    expect(a.heroDefId).toBe(b.heroDefId);
    expect(a.factionId).toBeTruthy();
    expect(coreFactionDefinitions[a.factionId as FactionId].heroes).toContain(a.heroDefId);
  });

  it("never lands on a faction another seat already holds (untaken filter)", () => {
    // Baseline: with no seat holding a faction, p3's deterministic roll lands on R.
    const baseline = applyAction(singlePlayerLobby("roll-untaken"), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: "roll"
    }).state;
    const rolled = seatOf(baseline, "p3").factionId as FactionId;
    expect(rolled).toBeTruthy();

    // Hold that exact faction on ANOTHER seat via a direct mutation (no event, so
    // the roll seed is byte-identical). The untaken filter must now force a
    // DIFFERENT pick — without the filter the same seed reproduces `rolled`.
    const state = singlePlayerLobby("roll-untaken");
    seatOf(state, "p2").factionId = rolled;
    seatOf(state, "p2").heroDefId = coreFactionDefinitions[rolled].heroes[0];
    const result = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: "roll"
    });
    expect(result.errors).toEqual([]);
    expect(seatOf(result.state, "p3").factionId).not.toBe(rolled);
  });
});

describe("SET_COMPUTER_SEAT_FACTION — clear", () => {
  it("unsets a set seat's faction+hero, returning it to auto (default name)", () => {
    const state = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    }).state;
    expect(seatOf(state, "p2").factionId).toBe("castle");

    const cleared = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: "clear"
    });
    expect(cleared.errors).toEqual([]);
    expect(seatOf(cleared.state, "p2").factionId).toBeNull();
    expect(seatOf(cleared.state, "p2").heroDefId).toBeNull();
    // Display name reverts to the bare seat label ("Computer 1").
    expect(cleared.state.players.p2.name).toBe(seatOf(cleared.state, "p2").name);
  });
});

describe("SET_COMPUTER_SEAT_FACTION — rejections", () => {
  it("CONTROL: a non-single-player (multiplayer) session is refused", () => {
    const state = createAdventureLobbyState({ seed: "mp", scenarioId: "skirmish", playerCount: 2 });
    const result = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    });
    expect(result.errors.length).toBe(1);
    expect(seatOf(result.state, "p2").factionId).toBeNull();
  });

  it("an issuer that is not the human owner seat is refused", () => {
    const result = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p2",
      seatPlayerId: "p3",
      choice: { factionId: "castle", heroDefId: "catherine" }
    });
    expect(result.errors.length).toBe(1);
    expect(seatOf(result.state, "p3").factionId).toBeNull();
  });

  it("a target that is not a computer seat (the human's own seat) is refused", () => {
    const result = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p1",
      choice: { factionId: "castle", heroDefId: "catherine" }
    });
    expect(result.errors.length).toBe(1);
    expect(seatOf(result.state, "p1").factionId).toBeNull();
  });

  it("a faction already taken by another seat is refused", () => {
    const state = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    }).state;
    const result = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: { factionId: "castle", heroDefId: "rion" }
    });
    expect(result.errors.length).toBe(1);
    expect(seatOf(result.state, "p3").factionId).toBeNull();
  });

  it("a hero that does not belong to the chosen faction is refused", () => {
    const result = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      // xyron leads Inferno, not Castle.
      choice: { factionId: "castle", heroDefId: "xyron" }
    });
    expect(result.errors.length).toBe(1);
    expect(seatOf(result.state, "p2").factionId).toBeNull();
  });

  it("CONTROL: any non-open setup format is refused", () => {
    const state = applyAction(singlePlayerLobby(), {
      type: "SET_DRAFT_FORMAT",
      playerId: "p1",
      format: "random"
    }).state;
    const result = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: "roll"
    });
    expect(result.errors.length).toBe(1);
    expect(seatOf(result.state, "p2").factionId).toBeNull();
  });
});

describe("SET_COMPUTER_SEAT_FACTION — legal actions", () => {
  it("offers set + roll for each computer seat in single-player + open, no clear until set", () => {
    const legal = getLegalActions(singlePlayerLobby(), "p1").map((entry) => entry.action);
    const offers = legal.filter((action) => action.type === "SET_COMPUTER_SEAT_FACTION");
    for (const seatPlayerId of ["p2", "p3"]) {
      expect(offers.some((a) => a.seatPlayerId === seatPlayerId && a.choice === "roll")).toBe(true);
      expect(
        offers.some((a) => a.seatPlayerId === seatPlayerId && typeof a.choice === "object")
      ).toBe(true);
    }
    // Nothing is set yet → no "clear" offered.
    expect(offers.some((a) => a.choice === "clear")).toBe(false);
  });

  it("a set offer round-trips: dispatching it applies the pick", () => {
    const state = singlePlayerLobby();
    const setOffer = getLegalActions(state, "p1")
      .map((entry) => entry.action)
      .find(
        (action) =>
          action.type === "SET_COMPUTER_SEAT_FACTION" &&
          action.seatPlayerId === "p2" &&
          typeof action.choice === "object"
      );
    expect(setOffer).toBeTruthy();
    const result = applyAction(state, setOffer!);
    expect(result.errors).toEqual([]);
    expect(seatOf(result.state, "p2").factionId).toBeTruthy();
  });

  it("offers a clear for a seat that already has a pick", () => {
    const state = applyAction(singlePlayerLobby(), {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "castle", heroDefId: "catherine" }
    }).state;
    const legal = getLegalActions(state, "p1").map((entry) => entry.action);
    expect(
      legal.some(
        (a) => a.type === "SET_COMPUTER_SEAT_FACTION" && a.seatPlayerId === "p2" && a.choice === "clear"
      )
    ).toBe(true);
  });

  it("CONTROL: a multiplayer lobby offers none", () => {
    const state = createAdventureLobbyState({ seed: "mp2", scenarioId: "skirmish", playerCount: 2 });
    const legal = getLegalActions(state, "p1").map((entry) => entry.action);
    expect(legal.some((a) => a.type === "SET_COMPUTER_SEAT_FACTION")).toBe(false);
  });

  it("CONTROL: a non-open format offers none", () => {
    const state = applyAction(singlePlayerLobby(), {
      type: "SET_DRAFT_FORMAT",
      playerId: "p1",
      format: "draft"
    }).state;
    const legal = getLegalActions(state, "p1").map((entry) => entry.action);
    expect(legal.some((a) => a.type === "SET_COMPUTER_SEAT_FACTION")).toBe(false);
  });
});

describe("SET_COMPUTER_SEAT_FACTION — end to end with the setup pump", () => {
  it("keeps a pinned computer seat while the pump auto-completes the others", () => {
    let state = singlePlayerLobby("e2e", 2); // p1 human, p2 + p3 computer
    // Pin p2, and pick the human's own seat so the setup pump may run.
    state = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "necropolis", heroDefId: "sandro" }
    }).state;
    state = applyAction(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    }).state;

    // Drive the computer setup to completion.
    for (let step = 0; step < 20; step += 1) {
      const owner = computerDecisionOwner(state);
      if (!owner) {
        break;
      }
      const decision = chooseComputerAction(observeForComputer(state, owner));
      expect(decision).not.toBeNull();
      state = applyAction(state, decision!.action, { computerActorPlayerId: owner }).state;
    }

    // The pin survived the pump (a seat already set is never re-picked)…
    expect(seatOf(state, "p2").factionId).toBe("necropolis");
    expect(seatOf(state, "p2").heroDefId).toBe("sandro");
    // …p3 got auto-completed with a DIFFERENT, untaken faction…
    const p3Faction = seatOf(state, "p3").factionId;
    expect(p3Faction).toBeTruthy();
    expect(p3Faction).not.toBe("necropolis");
    expect(p3Faction).not.toBe("castle");
    // …and every seat is now ready to start.
    expect(state.setupLobby!.seats.every((seat) => seat.factionId && seat.heroDefId)).toBe(true);

    // START_ADVENTURE still builds the map with the pinned computer seat intact.
    const started = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.errors).toEqual([]);
    expect(started.state.phase).not.toBe("setup");
    expect(started.state.adventure).toBeTruthy();
    // The pinned pick carried into the built game (Sandro of Necropolis leads p2).
    expect(started.state.players.p2.factionId).toBe("necropolis");
  });
});

describe("SET_COMPUTER_SEAT_FACTION — resize", () => {
  it("drops a removed seat's pick and keeps a surviving seat's pick (name in sync)", () => {
    // 3 computer opponents → seats p1..p4. Pin the LAST computer seat (p4) and a
    // surviving one (p2).
    let state = singlePlayerLobby("resize", 3);
    state = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p2",
      choice: { factionId: "necropolis", heroDefId: "sandro" }
    }).state;
    state = applyAction(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p4",
      choice: { factionId: "castle", heroDefId: "catherine" }
    }).state;
    expect(seatOf(state, "p4").factionId).toBe("castle");

    // Shrink to 1 computer opponent → seats p1, p2. p3 and p4 are removed.
    state = applyAction(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 }).state;
    expect(state.setupLobby!.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2"]);
    expect(state.setupLobby!.seats.find((seat) => seat.playerId === "p4")).toBeUndefined();
    expect(state.players.p4).toBeUndefined();

    // The surviving pinned seat keeps its pick, and its name stays consistent
    // with the pick (not reverted to the bare "Computer 1" label).
    expect(seatOf(state, "p2").factionId).toBe("necropolis");
    expect(seatOf(state, "p2").heroDefId).toBe("sandro");
    expect(state.players.p2.name).toBe(
      `${coreHeroDefinitions.sandro.name} of ${coreFactionDefinitions.necropolis.name}`
    );
  });
});
