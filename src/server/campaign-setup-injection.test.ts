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
import { DEFAULT_CAMPAIGN_RULE_OPTIONS } from "@/lib/campaign-progress";
import {
  computerDecisionOwner,
  getLegalActions,
  type GameAction,
  type GameState,
} from "@/engine";
import {
  cancelComputerPump,
  createRoom,
  drainComputerPumpSync,
  getRoomSnapshot,
  submitRoomAction,
} from "./game-room-store";

function uniqueId(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextHumanMapAction(state: GameState): GameAction {
  const offers = getLegalActions(state, "p1");
  const legal =
    offers.find((entry) => entry.action.type === "SET_TILE_ROTATION") ??
    offers.find((entry) => entry.action.type === "REFRESH_HAND") ??
    offers.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP") ??
    offers.find((entry) => entry.action.type === "END_TURN") ??
    offers.find((entry) => entry.action.type !== "ADVANCE_COMPUTER");
  if (!legal) {
    throw new Error(`no campaign human action among: ${offers.map((entry) => entry.action.type).join(", ")}`);
  }
  if (legal.action.type !== "REFRESH_HAND") return legal.action;
  const player = state.players.p1!;
  const limit = player.needsHandRefresh ? 4 : 5;
  return {
    ...legal.action,
    discardCardIds: player.hand.slice(0, Math.max(0, player.hand.length - limit)),
  };
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
  it("launches every rebuilt Erathia chapter directly into its authored map", () => {
    const erathia = [
      "homecoming",
      "guardian-angels",
      "griffin-cliff",
      "road-to-steadwick",
      "liberation-day",
      "throne-of-ash"
    ];
    for (const chapterId of erathia) {
      const chapter = getCampaignChapter("erathia", chapterId)!;
      const state = startWith(
        uniqueId(`sp-erathia-${chapterId}`),
        campaignSetupActions(chapter, "p1", chapter.startingBonuses?.[0]?.id),
        chapter.setup!.opponents
      );
      expect(state.phase, chapterId).not.toBe("setup");
      expect(state.setupLobby, chapterId).toBeNull();
      expect(state.adventure?.mapPreset?.notes, chapterId).toBe(chapter.scenarioMap?.preset.notes);
      expect(Object.keys(state.adventure?.tiles ?? {}), chapterId).toHaveLength(chapter.scenarioMap!.tiles.length);
      expect(state.players.p1?.heroDefId, chapterId).toBe("catherine");
    }
  });

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

  it("freezes pre-campaign optional systems onto the adventure without changing the authored map", () => {
    const chapter = getCampaignChapter("erathia", "homecoming")!;
    const rules = {
      ...DEFAULT_CAMPAIGN_RULE_OPTIONS,
      events: true,
      moraleCards: true,
      spellBook: false,
      creatureBanks: false,
      startingHandMulligan: false,
      unitExperience: true,
    };
    const state = startWith(
      uniqueId("sp-erathia-rules"),
      campaignSetupActions(chapter, "p1", "rare-resources", rules),
      chapter.setup!.opponents,
    );

    expect(Boolean(state.decks["events"])).toBe(true);
    expect(state.adventure?.moraleCards).toBe(true);
    expect(state.adventure?.spellBook).toBe(false);
    expect(state.adventure?.startingHandMulligan).toBe(false);
    expect(state.adventure?.unitExperience).toBe(true);
    expect(state.adventure?.mapPreset?.notes).toBe(chapter.scenarioMap?.preset.notes);
    expect(Object.keys(state.adventure?.tiles ?? {})).toHaveLength(chapter.scenarioMap!.tiles.length);
  });

  it("runs complete server-owned AI turns and moves an opponent on every Erathia map", () => {
    for (const chapterId of [
      "homecoming",
      "guardian-angels",
      "griffin-cliff",
      "road-to-steadwick",
      "liberation-day",
      "throne-of-ash",
    ]) {
      const chapter = getCampaignChapter("erathia", chapterId)!;
      const roomId = uniqueId(`sp-erathia-ai-${chapterId}`);
      startWith(
        roomId,
        campaignSetupActions(chapter, "p1", chapter.startingBonuses?.[0]?.id),
        chapter.setup!.opponents,
      );
      // Clear any computer-owned first-player roll before driving p1's real turn.
      drainComputerPumpSync(roomId);

      const initial = getRoomSnapshot(roomId).state;
      const enemyHero = Object.values(initial.heroes).find(
        (hero) => hero.controllerId === "p2" && hero.kind === "main",
      )!;
      const eventCount = initial.eventLog.length;
      let moved = false;
      let computerTurns = 0;
      let guard = 0;
      // The opening turn can legitimately be spent resolving income/hand gates.
      // Across three real campaign turns the opponent must perform map movement.
      while (!moved && computerTurns < 3 && guard++ < 180) {
        while (computerDecisionOwner(getRoomSnapshot(roomId).state) !== "p2" && guard++ < 180) {
          const outcome = submitRoomAction(
            roomId,
            nextHumanMapAction(getRoomSnapshot(roomId).state),
            "owner-1",
          );
          expect(outcome.result.errors, chapterId).toEqual([]);
        }
        expect(computerDecisionOwner(getRoomSnapshot(roomId).state), chapterId).toBe("p2");
        drainComputerPumpSync(roomId);
        computerTurns += 1;
        const current = getRoomSnapshot(roomId).state;
        moved = current.eventLog.slice(eventCount).some(
          (event) => event.type === "HERO_MOVED" && event.playerId === "p2",
        ) || current.heroes[enemyHero.id]?.spaceId !== enemyHero.spaceId;
        expect(computerDecisionOwner(current), chapterId).toBeNull();
      }
      expect(moved, `${chapterId}: campaign AI completed turns but never moved its hero`).toBe(true);
      cancelComputerPump(roomId);
    }
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
