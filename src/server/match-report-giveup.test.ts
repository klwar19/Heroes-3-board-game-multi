import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState } from "@/engine";
import { detectFinishedMatch } from "./match-report";

/**
 * End-to-end: a closed ranked 2p game where one player gives up must produce
 * a FinishedMatch the ladder can record. This is the user-reported failure
 * mode (ranked + closed + give-up → never W/L).
 */
describe("closed ranked GIVE_UP → detectFinishedMatch", () => {
  it("records a win/loss when p2 gives up on a quiet closed table", () => {
    const state = createAdventureGameState({
      seed: "room-giveup-closed-ranked",
      playerCount: 2,
      rollFirstPlayer: false,
      rotateStartTiles: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Roland", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    state.room = {
      hosted: true,
      hostClientId: "c1",
      ranked: true,
      members: [
        { clientId: "c1", name: "Catherine", seat: "p1", isHost: true, userId: "u_cat" },
        { clientId: "c2", name: "Roland", seat: "p2", isHost: false, userId: "u_rol" }
      ],
      matchSeats: {
        p1: { userId: "u_cat", name: "Catherine" },
        p2: { userId: "u_rol", name: "Roland" }
      }
    };

    const after = applyAction(
      state,
      { type: "GIVE_UP", playerId: "p2" },
      { now: 2_000_000, actorClientId: "c2", actorUserId: "u_rol" }
    );
    expect(after.errors).toEqual([]);
    expect(after.state.phase).toBe("game-over");
    expect(after.state.adventure?.winnerPlayerId).toBe("p1");

    const match = detectFinishedMatch(state, after.state);
    expect(match).not.toBeNull();
    expect(match!.ranked).toBe(true);
    expect(match!.matchId).toBe("room-giveup-closed-ranked");
    expect(match!.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "u_cat", result: "win" }),
        expect.objectContaining({ accountId: "u_rol", result: "loss" })
      ])
    );
  });
});
