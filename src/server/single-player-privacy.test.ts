import { describe, expect, it } from "vitest";
import { applyAction, createAdventureLobbyState } from "@/engine";
import { createRoom, listRooms } from "./game-room-store";
import { detectFinishedMatch } from "./match-report";
import { deriveLobbyRecord, LobbyRegistry } from "./lobby-registry";

describe("single-player privacy foundation", () => {
  it("creates a private store room that never enters the built-in directory", () => {
    const roomId = `solo-foundation-${Math.random().toString(36).slice(2)}`;
    const created = createRoom({
      roomId,
      sessionMode: "single-player",
      computerOpponents: 2,
    });
    expect(created.state.room?.visibility).toBe("private");
    expect(created.state.room?.ranked).toBe(false);
    expect(listRooms().some((room) => room.roomId === roomId)).toBe(false);
  });

  it("binds the first private owner to p1 and rejects an unrelated join", () => {
    const state = createAdventureLobbyState({
      seed: "privacy-owner",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.room = {
      hosted: true,
      hostClientId: null,
      members: [],
      visibility: "private",
      ranked: false,
    };
    const joined = applyAction(
      state,
      { type: "JOIN_ROOM", clientId: "owner-client", name: "Owner" },
      { actorClientId: "owner-client", actorUserId: "owner-user" },
    );
    expect(joined.errors).toEqual([]);
    expect(joined.state.room?.members[0]?.seat).toBe("p1");
    expect(joined.state.room?.ownerUserId).toBe("owner-user");

    const intruder = applyAction(
      joined.state,
      { type: "JOIN_ROOM", clientId: "intruder-client", name: "Intruder" },
      { actorClientId: "intruder-client", actorUserId: "intruder-user" },
    );
    expect(intruder.errors[0]?.message).toContain("belongs to another player");
    expect(intruder.state.room?.members).toHaveLength(1);
  });

  it("never lets a member take a computer seat (the one-human invariant)", () => {
    const state = createAdventureLobbyState({
      seed: "privacy-seats",
      sessionMode: "single-player",
      computerOpponents: 2,
    });
    state.room = {
      hosted: true,
      hostClientId: null,
      members: [],
      visibility: "private",
      ranked: false,
    };
    const joined = applyAction(
      state,
      { type: "JOIN_ROOM", clientId: "owner-client", name: "Owner" },
      { actorClientId: "owner-client" },
    );
    expect(joined.errors).toEqual([]);

    const stolen = applyAction(
      joined.state,
      { type: "ASSIGN_SEAT", clientId: "owner-client", targetClientId: "owner-client", seat: "p2" },
      { actorClientId: "owner-client" },
    );
    expect(stolen.errors[0]?.message).toContain("Computer seats cannot be taken");
    // CONTROL: stepping down to observer and retaking the human seat both work.
    const observer = applyAction(
      joined.state,
      { type: "ASSIGN_SEAT", clientId: "owner-client", targetClientId: "owner-client", seat: "observer" },
      { actorClientId: "owner-client" },
    );
    expect(observer.errors).toEqual([]);
    const retaken = applyAction(
      observer.state,
      { type: "ASSIGN_SEAT", clientId: "owner-client", targetClientId: "owner-client", seat: "p1" },
      { actorClientId: "owner-client" },
    );
    expect(retaken.errors).toEqual([]);
    expect(retaken.state.room?.members[0]?.seat).toBe("p1");
  });

  it("removes a private single-player record from the shared lobby registry", () => {
    const state = createAdventureLobbyState({
      seed: "privacy-registry",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.room = {
      hosted: true,
      hostClientId: null,
      members: [],
      visibility: "private",
      ranked: false,
    };
    const record = deriveLobbyRecord({
      roomId: "solo-secret",
      state,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const registry = new LobbyRegistry();
    registry.upsert(record);
    expect(registry.list()).toEqual([]);
  });

  it("never reports a single-player result to accounts or MMR", () => {
    const prev = createAdventureLobbyState({
      seed: "privacy-match",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    const next = structuredClone(prev);
    next.phase = "game-over";
    next.adventure = { winnerPlayerId: "p1" } as typeof next.adventure;
    next.room = {
      hosted: true,
      hostClientId: "owner",
      visibility: "private",
      ranked: true,
      members: [
        {
          clientId: "owner",
          userId: "u1",
          name: "Owner",
          seat: "p1",
          isHost: true,
        },
        {
          clientId: "other",
          userId: "u2",
          name: "Other",
          seat: "p2",
          isHost: false,
        },
      ],
    };
    expect(detectFinishedMatch(prev, next)).toBeNull();
  });
});
