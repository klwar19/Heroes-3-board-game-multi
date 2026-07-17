import { describe, expect, it } from "vitest";
import { getCampaign } from "@/data/story/campaigns";
import { campaignSceneToFire, type CampaignStateRead } from "./campaign-triggers";
import type { CampaignRoomBinding } from "./campaign-progress";

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
