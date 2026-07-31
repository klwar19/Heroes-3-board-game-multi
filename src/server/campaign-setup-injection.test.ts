/**
 * Campaign SETUP INJECTION over the built-in room store (Anime mod §12).
 *
 * A Story-mode chapter's carried config is made REAL: the /story Begin flow mints
 * a plain single-player room, and once the human is seated the table page pushes
 * `campaignSetupActions(chapter, seat)` — SET_GAME_OPTIONS + CHOOSE_FACTION —
 * through the NORMAL action pipeline. This proves that a room built with the
 * Jianghu ch-1 options actually STARTS with the anime modules + Field Overrides
 * on and the protagonist's core faction seated. The CONTROL (a plain
 * single-player room that injects nothing) stays all-default — the guarantee that
 * a normal table is byte-identical.
 *
 * Each assertion fails if the injection path is removed: drop the
 * buildAdventureFromLobby anime/fieldOverrides carry-through and the ON-at-start
 * asserts fail; drop the CHOOSE_FACTION and the seated-faction assert fails.
 */
import { describe, expect, it } from "vitest";
import { getCampaignChapter } from "@/data/story/campaigns";
import { campaignSetupActions } from "@/lib/campaign-triggers";
import type { GameState } from "@/engine";
import { createRoom, submitRoomAction } from "./game-room-store";

function uniqueId(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drive a single-player room from a fresh lobby to a started adventure. */
function startWith(
  roomId: string,
  preStartActions: readonly Parameters<typeof submitRoomAction>[1][],
  computerOpponents = 1
): GameState {
  createRoom({ roomId, sessionMode: "single-player", computerOpponents });
  const joined = submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }, "owner-1");
  expect(joined.result.errors).toEqual([]);

  for (const action of preStartActions) {
    const outcome = submitRoomAction(roomId, action, "owner-1");
    expect(
      outcome.result.errors,
      `${JSON.stringify(action)}: ${outcome.result.errors.map((error) => error.message).join("; ")}`
    ).toEqual([]);
  }

  const started = submitRoomAction(roomId, { type: "START_ADVENTURE", playerId: "p1" }, "owner-1");
  expect(started.result.errors, started.result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return started.snapshot.state;
}

describe("campaign setup injection", () => {
  it("starts the authored Erathia maps with the selected bonus and fixed computer seats", () => {
    const homecoming = getCampaignChapter("erathia", "homecoming")!;
    const homecomingState = startWith(
      uniqueId("sp-erathia-homecoming"),
      campaignSetupActions(homecoming, "p1", "rare-resources"),
      homecoming.setup!.opponents
    );

    expect(homecomingState.adventure?.difficulty).toBe("easy");
    expect(homecomingState.adventure?.scenarioId).toBe("skirmish");
    expect(homecomingState.adventure?.mapPreset?.customWinConditions).toEqual([
      { kind: "control-towns", count: 2 }
    ]);
    expect(homecomingState.adventure?.mapPreset?.startingResources).toEqual({
      gold: 15,
      buildingMaterials: 3,
      valuables: 1
    });
    expect(homecomingState.adventure?.mapPreset?.startingBonuses).toEqual([
      { kind: "resources", gold: 0, buildingMaterials: 0, valuables: 5 }
    ]);
    expect(Object.keys(homecomingState.adventure?.tiles ?? {})).toHaveLength(homecoming.scenarioMap!.tiles.length);
    expect(homecomingState.players.p1?.factionId).toBe("castle");
    expect(homecomingState.players.p1?.heroDefId).toBe("catherine");
    expect(homecomingState.players.p2?.factionId).toBe("dungeon");
    expect(homecomingState.players.p2?.heroDefId).toBe("alamar");

    const griffinCliff = getCampaignChapter("erathia", "griffin-cliff")!;
    const griffinState = startWith(
      uniqueId("sp-erathia-griffin"),
      campaignSetupActions(griffinCliff, "p1", "lions-shield"),
      griffinCliff.setup!.opponents
    );

    expect(griffinState.adventure?.difficulty).toBe("normal");
    expect(griffinState.adventure?.mapPreset?.customWinConditions).toEqual([
      { kind: "flag-mines", count: 7 }
    ]);
    expect(griffinState.adventure?.mapPreset?.startingBonuses).toEqual([
      { kind: "morale", amount: 1 },
      { kind: "search", deck: "artifacts", count: 3 }
    ]);
    expect(Object.keys(griffinState.adventure?.tiles ?? {})).toHaveLength(griffinCliff.scenarioMap!.tiles.length);
    expect(griffinState.players.p2?.factionId).toBe("dungeon");
    expect(griffinState.players.p3?.factionId).toBe("inferno");
  });

  it("a room built with the Jianghu ch-1 options starts with anime + Field Overrides ON and the seat's faction", () => {
    const chapter = getCampaignChapter("jianghu", "ch1")!;
    const actions = campaignSetupActions(chapter, "p1");
    // The assembled actions are exactly what the table page dispatches after join.
    const state = startWith(uniqueId("sp-campaign"), actions);

    expect(state.setupLobby).toBeNull();
    expect(state.adventure).not.toBeNull();

    // (a) The chapter's anime modules + (b) the global Field Override system are
    // live at game start — the whole point of the injection slice.
    expect(state.anime?.enabled).toBe(true);
    expect(state.anime?.cultivation).toBe(true);
    expect(state.anime?.xianxiaArtifacts).toBe(true);
    expect(state.adventure?.fieldOverrides).toBe(true);

    // (c) The configured difficulty and (d) the protagonist's core faction seat.
    expect(state.adventure?.difficulty).toBe("easy");
    expect(state.players.p1?.factionId).toBe("rampart");
  });

  it("a plain single-player room stays ALL-DEFAULT — no anime, no Field Overrides (CONTROL)", () => {
    // Same room shape, but the human picks a faction by hand and injects NOTHING.
    const state = startWith(uniqueId("sp-plain"), [
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" }
    ]);

    expect(state.adventure).not.toBeNull();
    expect(state.anime?.enabled ?? false).toBe(false);
    expect(state.anime?.cultivation ?? false).toBe(false);
    expect(state.anime?.xianxiaArtifacts ?? false).toBe(false);
    expect(state.adventure?.fieldOverrides).toBe(false);
    expect(state.players.p1?.factionId).toBe("castle");
  });
});
