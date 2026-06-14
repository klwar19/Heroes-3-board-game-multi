import { describe, expect, it } from "vitest";
import { ENGINE_PROTOCOL_VERSION, ENGINE_SIGNATURE } from "./version";
import { coreHeroDefinitions } from "@/data/factions/core";
import { getRoomSnapshot, submitRoomAction } from "@/server/game-room-store";

describe("ENGINE_SIGNATURE", () => {
  it("is a stable, protocol-prefixed fingerprint", () => {
    expect(ENGINE_SIGNATURE).toMatch(new RegExp(`^v${ENGINE_PROTOCOL_VERSION}-[0-9a-f]{8}$`));
  });

  it("covers the heroes that the room-server-skew bug was about", () => {
    // The signature is derived from the hero/faction/unit catalog, so a room
    // server missing Moandor/Zydar would compute a different value — which is
    // exactly the drift the version banner is meant to catch.
    expect(coreHeroDefinitions.moandor).toBeDefined();
    expect(coreHeroDefinitions.zydar).toBeDefined();
  });
});

describe("room store stamps the engine signature on outgoing snapshots", () => {
  it("includes serverSignature on a fresh snapshot and after an action", () => {
    const roomId = `sig-test-${Math.random().toString(36).slice(2)}`;
    const fresh = getRoomSnapshot(roomId);
    expect(fresh.serverSignature).toBe(ENGINE_SIGNATURE);

    // A seat picking a faction is a server-confirmed action; its returned
    // snapshot must carry the signature too (this is the frame the client
    // compares against its own).
    const seatId = fresh.state.setupLobby?.seats[0]?.playerId ?? "p1";
    const { snapshot } = submitRoomAction(roomId, {
      type: "CHOOSE_FACTION",
      playerId: seatId,
      factionId: "necropolis",
      heroDefId: "moandor"
    });
    expect(snapshot.serverSignature).toBe(ENGINE_SIGNATURE);
    expect(snapshot.state.setupLobby?.seats[0]?.heroDefId).toBe("moandor");
  });
});
