import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./setup";
import { getSeatIdentity, memberForSeat, seatPersonLabel, seatPickSummary } from "./player-identity";
import type { GameState, RoomMembershipState } from "./state";

/** A hosted room seating Binh (verified) at p1 and Alex (guest) at p2, plus an observer. */
function withRoom(state: GameState): GameState {
  const room: RoomMembershipState = {
    hosted: true,
    hostClientId: "cA",
    members: [
      { clientId: "cA", name: "Binh", seat: "p1", isHost: true, userId: "u_binh" },
      { clientId: "cB", name: "Alex", seat: "p2", isHost: false },
      { clientId: "cC", name: "Watcher", seat: "observer", isHost: false }
    ]
  };
  return { ...state, room };
}

describe("getSeatIdentity — person + hero + town + role", () => {
  it("resolves the town and hero display names from the player's faction/hero ids", () => {
    const state = createInitialGameState("identity-seed");
    const p1 = getSeatIdentity(state, "p1");
    // Castle/Catherine by default — these come from the registry lookups, so the
    // test fails if the faction→town or hero→name lookup is removed.
    expect(p1.townName).toBe("Castle");
    expect(p1.heroName).toBe("Catherine");
    expect(p1.factionId).toBe("castle");

    const p2 = getSeatIdentity(state, "p2");
    expect(p2.townName).toBe("Necropolis");
    expect(p2.heroName).toBe("Sandro");
  });

  it("follows the faction/hero when they change (not a hard-coded string)", () => {
    const state = createInitialGameState("identity-seed");
    state.players.p1!.factionId = "tower";
    state.players.p1!.heroDefId = "solmyr";
    const p1 = getSeatIdentity(state, "p1");
    expect(p1.townName).toBe("Tower");
    expect(p1.heroName).toBe("Solmyr");
  });

  it("without a room (open/solo table) there is no person or role, only the seat + pick", () => {
    const state = createInitialGameState("identity-seed");
    expect(state.room).toBeUndefined();
    const p1 = getSeatIdentity(state, "p1");
    expect(p1.personName).toBeUndefined();
    expect(p1.role).toBeUndefined();
    expect(p1.verified).toBe(false);
    // Falls back to the in-game seat label.
    expect(seatPersonLabel(p1)).toBe(p1.seatName);
  });

  it("surfaces the seated member as the person, with verified + role", () => {
    const state = withRoom(createInitialGameState("identity-seed"));

    const p1 = getSeatIdentity(state, "p1");
    expect(p1.personName).toBe("Binh");
    expect(p1.verified).toBe(true);
    expect(p1.role).toBe("host");
    // Person-first label: the human, not "Catherine (Castle)".
    expect(seatPersonLabel(p1)).toBe("Binh");
    expect(seatPickSummary(p1)).toBe("Catherine · Castle");

    const p2 = getSeatIdentity(state, "p2");
    expect(p2.personName).toBe("Alex");
    expect(p2.verified).toBe(false);
    expect(p2.role).toBe("player");
  });

  it("memberForSeat ignores observers (they hold no seat)", () => {
    const state = withRoom(createInitialGameState("identity-seed"));
    expect(memberForSeat(state, "p1")?.name).toBe("Binh");
    // No player seat maps to the observer member.
    const seatedNames = state.turnOrder.map((id) => memberForSeat(state, id)?.name).filter(Boolean);
    expect(seatedNames).not.toContain("Watcher");
  });
});

describe("seatPickSummary", () => {
  it("shows hero · town, town-only, or null before any pick", () => {
    const state = createInitialGameState("identity-seed");
    expect(seatPickSummary(getSeatIdentity(state, "p1"))).toBe("Catherine · Castle");

    delete state.players.p1!.heroDefId;
    expect(seatPickSummary(getSeatIdentity(state, "p1"))).toBe("Castle");

    delete state.players.p1!.factionId;
    expect(seatPickSummary(getSeatIdentity(state, "p1"))).toBeNull();
  });
});
