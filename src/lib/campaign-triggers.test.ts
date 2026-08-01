import { describe, expect, it } from "vitest";
import { getCampaign, getCampaignChapter } from "@/data/story/campaigns";
import { coreFactionDefinitions } from "@/data/factions/core";
import { campaignSceneToFire, campaignSetupActions, type CampaignStateRead } from "./campaign-triggers";
import type { CampaignRoomBinding } from "./campaign-progress";
import { DEFAULT_CAMPAIGN_RULE_OPTIONS } from "./campaign-progress";

const BINDING: CampaignRoomBinding = { campaignId: "jianghu", chapterId: "ch1" };
const CH1 = getCampaign("jianghu")!.chapters[0];
const VIEWER = "p1";

const NOT_SHOWN = { introShown: false, outcomeShown: false };

const setup: CampaignStateRead = { phase: "setup" };
const visible: CampaignStateRead = { phase: "map", adventure: { winnerPlayerId: null } };
const won: CampaignStateRead = { phase: "game-over", adventure: { winnerPlayerId: "p1" } };
const lost: CampaignStateRead = { phase: "game-over", adventure: { winnerPlayerId: "p2" } };

describe("campaignSceneToFire", () => {
  it("an UNBOUND room fires NOTHING — even at game-over (CONTROL)", () => {
    expect(campaignSceneToFire(visible, null, VIEWER, NOT_SHOWN)).toBeNull();
    expect(campaignSceneToFire(won, null, VIEWER, NOT_SHOWN)).toBeNull();
  });

  it("does not fire the intro while the game is still in setup (adventure not visible)", () => {
    expect(campaignSceneToFire(setup, BINDING, VIEWER, NOT_SHOWN)).toBeNull();
  });

  it("fires onStart when the adventure first becomes visible, then nothing once shown", () => {
    expect(campaignSceneToFire(visible, BINDING, VIEWER, NOT_SHOWN)).toEqual({
      kind: "start",
      sceneId: CH1.scenes.onStart
    });
    // Once the page records introShown, the same read fires nothing.
    expect(
      campaignSceneToFire(visible, BINDING, VIEWER, { introShown: true, outcomeShown: false })
    ).toBeNull();
  });

  it("fires onVictory AND signals completion when the human seat wins, then nothing once shown", () => {
    const trigger = campaignSceneToFire(won, BINDING, VIEWER, NOT_SHOWN);
    expect(trigger).toEqual({
      kind: "victory",
      sceneId: CH1.scenes.onVictory,
      complete: { campaignId: "jianghu", chapterId: "ch1" }
    });
    expect(
      campaignSceneToFire(won, BINDING, VIEWER, { introShown: true, outcomeShown: true })
    ).toBeNull();
  });

  it("fires onDefeat WITHOUT completion when the human seat loses (someone else won)", () => {
    const trigger = campaignSceneToFire(lost, BINDING, VIEWER, NOT_SHOWN);
    expect(trigger).toEqual({ kind: "defeat", sceneId: CH1.scenes.onDefeat });
    // No completion signal on a loss.
    expect(trigger && "complete" in trigger).toBe(false);
  });

  it("the finished outcome takes priority over a not-yet-shown intro", () => {
    // Game already over, intro never shown → show the outcome, not a late intro.
    const trigger = campaignSceneToFire(won, BINDING, VIEWER, NOT_SHOWN);
    expect(trigger?.kind).toBe("victory");
  });

  it("a binding to an unknown campaign/chapter resolves to nothing", () => {
    expect(campaignSceneToFire(visible, { campaignId: "nope", chapterId: "ch1" }, VIEWER, NOT_SHOWN)).toBeNull();
    expect(campaignSceneToFire(visible, { campaignId: "jianghu", chapterId: "ch99" }, VIEWER, NOT_SHOWN)).toBeNull();
  });
});

describe("campaignSetupActions", () => {
  it("assembles SET_GAME_OPTIONS + CHOOSE_FACTION for Jianghu ch-1", () => {
    const actions = campaignSetupActions(CH1, "p1");
    expect(actions).toHaveLength(2);

    const [setOptions, chooseFaction] = actions;
    // The chapter's anime options + fieldOverrides + difficulty ride in the
    // game-options action, keyed to the human seat.
    expect(setOptions).toMatchObject({
      type: "SET_GAME_OPTIONS",
      playerId: "p1"
    });
    if (setOptions.type !== "SET_GAME_OPTIONS") throw new Error("expected SET_GAME_OPTIONS");
    expect(setOptions.options.fieldOverrides).toBe(true);
    expect(setOptions.options.difficulty).toBe("easy");
    expect(setOptions.options.anime).toMatchObject({
      enabled: true,
      cultivation: true,
      xianxiaArtifacts: true
    });

    // The protagonist's core faction is preselected with that faction's first hero.
    expect(chooseFaction).toEqual({
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "rampart",
      heroDefId: coreFactionDefinitions.rampart.heroes[0]
    });
  });

  it("omits difficulty when the chapter names none", () => {
    // A synthetic chapter with a setup but no difficulty must not emit the key.
    const chapter = {
      ...CH1,
      setup: { playerFaction: "tower" as const, opponents: 1, anime: { enabled: true } }
    };
    const [setOptions] = campaignSetupActions(chapter, "p1");
    if (setOptions.type !== "SET_GAME_OPTIONS") throw new Error("expected SET_GAME_OPTIONS");
    expect("difficulty" in setOptions.options).toBe(false);
  });

  it("injects only the allowed optional systems without replacing the authored map", () => {
    const chapter = getCampaignChapter("erathia", "homecoming")!;
    const rules = {
      ...DEFAULT_CAMPAIGN_RULE_OPTIONS,
      events: true,
      moraleCards: true,
      creatureBanks: false,
      unitExperience: true,
    };
    const [setOptions] = campaignSetupActions(chapter, "p1", "rare-resources", rules);
    if (setOptions.type !== "SET_GAME_OPTIONS") throw new Error("expected SET_GAME_OPTIONS");
    expect(setOptions.options).toMatchObject(rules);
    expect(setOptions.options.customMap).toEqual(chapter.scenarioMap?.tiles);
    expect(setOptions.options.customMapName).toBe(chapter.scenarioMap?.name);
    expect(setOptions.options.customMapPreset?.customWinConditions).toEqual(
      chapter.scenarioMap?.preset.customWinConditions,
    );
  });

  it("a LOCKED chapter (no setup) injects nothing (CONTROL)", () => {
    const locked = getCampaignChapter("jianghu", "ch2")!;
    expect(locked.setup).toBeUndefined();
    expect(campaignSetupActions(locked, "p1")).toEqual([]);
  });

  // REGRESSION: the scripted computer opponents MUST be seated BEFORE the human's
  // CHOOSE_FACTION. In single player, CHOOSE_FACTION triggers the computer setup
  // policy to roll a random town for every AUTO opponent seat, and a random roll
  // landing on a scripted faction made the later explicit SET throw "Another seat
  // already picked that faction." — an intermittent campaign-setup failure. With
  // the opponents seated while the human is still on auto (no rolling happens
  // yet), every clear+set completes before the human picks. This order property
  // is what makes the seating deterministic regardless of the room seed.
  it("seats the fixed computer opponents BEFORE the human CHOOSE_FACTION (multi-opponent chapter)", () => {
    const griffin = getCampaignChapter("erathia", "griffin-cliff")!;
    expect(griffin.setup?.computerSeats).toHaveLength(2);
    const actions = campaignSetupActions(griffin, "p1");

    const chooseIndex = actions.findIndex((a) => a.type === "CHOOSE_FACTION");
    const explicitSetIndices = actions
      .map((a, i) => (a.type === "SET_COMPUTER_SEAT_FACTION" && a.choice !== "clear" ? i : -1))
      .filter((i) => i >= 0);
    expect(chooseIndex).toBeGreaterThanOrEqual(0);
    expect(explicitSetIndices).toHaveLength(2);
    // Every scripted-opponent assignment precedes the human's faction pick.
    for (const setIndex of explicitSetIndices) {
      expect(setIndex).toBeLessThan(chooseIndex);
    }
    // Each seat is cleared to auto before being explicitly assigned.
    for (const seat of ["p2", "p3"] as const) {
      const clearIndex = actions.findIndex(
        (a) => a.type === "SET_COMPUTER_SEAT_FACTION" && a.seatPlayerId === seat && a.choice === "clear"
      );
      const setIndex = actions.findIndex(
        (a) => a.type === "SET_COMPUTER_SEAT_FACTION" && a.seatPlayerId === seat && a.choice !== "clear"
      );
      expect(clearIndex).toBeGreaterThanOrEqual(0);
      expect(setIndex).toBeGreaterThan(clearIndex);
    }
  });
});
