import { describe, expect, it } from "vitest";
import { noticeRewardsFromEvents } from "./utils";
import type { GameEvent, GameState } from "@/engine";

// The map-visit notice used to spell out every outcome as a bullet list of text
// ("p1 rolls treasure dice: …", "p1 gains 3 gold (treasure)", …). These pin the
// pure derivation that replaces that with compact icon chips — the treasure
// chest / mine RESULT shown with the correct board icons.

const ev = (fields: Record<string, unknown> & { type: string }): GameEvent =>
  ({ id: "evt-1", ...fields }) as unknown as GameEvent;

const NO_STATE = {} as GameState;

describe("noticeRewardsFromEvents — map-visit reward chips", () => {
  it("turns a treasure chest's gold + experience into icon chips (no mass of text)", () => {
    const { rewards } = noticeRewardsFromEvents(
      [
        ev({ type: "RESOURCES_GAINED", playerId: "p1", gold: 3, reason: "treasure" }),
        ev({ type: "EXPERIENCE_GAINED", playerId: "p1", amount: 1, level: 1 })
      ],
      NO_STATE
    );
    expect(rewards.map((r) => r.label)).toEqual(["+3", "+1"]);
    expect(rewards[0].icon, "gold token").toContain("resource-gold");
    expect(rewards[1].icon, "experience glyph").toContain("experience");
    expect(rewards.every((r) => r.tone === "gain")).toBe(true);
  });

  it("shows a mine's income as a +N/turn chip AND uses the resource token as the notice art", () => {
    const { rewards, iconImage } = noticeRewardsFromEvents(
      [
        ev({ type: "RESOURCES_GAINED", playerId: "p1", buildingMaterials: 2, reason: "first to flag the mine" }),
        ev({ type: "PRODUCTION_CHANGED", playerId: "p1", amount: 1, resource: "buildingMaterials" })
      ],
      NO_STATE
    );
    const stockpile = rewards.find((r) => r.label === "+2");
    expect(stockpile?.icon, "the first-flag stockpile chip").toContain("building_materials");
    const income = rewards.find((r) => r.label.includes("/turn"));
    expect(income?.label, "the mine's per-turn income").toBe("+1/turn");
    expect(income?.icon).toContain("building_materials");
    // A mine has no dedicated notice art → its resource token is the icon.
    expect(iconImage, "mine notice art = its resource token").toContain("building_materials");
  });

  it("marks a production LOSS (a mine taken from you) as a loss-tone chip", () => {
    const { rewards } = noticeRewardsFromEvents(
      [ev({ type: "PRODUCTION_CHANGED", playerId: "p1", amount: -1, resource: "gold" })],
      NO_STATE
    );
    expect(rewards[0].label).toBe("-1/turn");
    expect(rewards[0].tone).toBe("loss");
  });

  it("shows a morale change with its morale-bird icon", () => {
    const { rewards } = noticeRewardsFromEvents(
      [ev({ type: "MORALE_CHANGED", playerId: "p1", amount: 1, total: 2 })],
      NO_STATE
    );
    expect(rewards[0].label).toBe("+1");
    expect(rewards[0].icon, "the morale bird for +2").toContain("morale");
    expect(rewards[0].tone).toBe("gain");
  });

  it("returns no chips (and no notice art) for an outcome with no material reward — the caller falls back to text", () => {
    const { rewards, iconImage } = noticeRewardsFromEvents(
      [ev({ type: "FIELD_FLAGGED", playerId: "p1", location: "mine" })],
      NO_STATE
    );
    expect(rewards).toEqual([]);
    expect(iconImage).toBeUndefined();
  });

  it("shows Treasure-die GET images (face chips) on a chest notice, not just the paid-out gold/XP", () => {
    const { rewards } = noticeRewardsFromEvents(
      [
        ev({
          type: "ADVENTURE_DICE_ROLLED",
          playerId: "p1",
          dice: "treasure",
          results: ["Gain 1 experience"],
          treasureRolls: ["experience"]
        }),
        ev({ type: "EXPERIENCE_GAINED", playerId: "p1", amount: 1, level: 1 })
      ],
      NO_STATE
    );
    // Die face first (the GET image), then the material XP payout.
    expect(rewards.map((r) => r.label)).toEqual(["XP", "+1"]);
    expect(rewards[0].icon, "treasure experience face glyph").toContain("treasure-face-experience");
    expect(rewards[0].title).toMatch(/Treasure die/i);
    expect(rewards[1].icon).toContain("experience");
  });

  it("shows Resource-die GET images with the resource token + amount", () => {
    const { rewards } = noticeRewardsFromEvents(
      [
        ev({
          type: "ADVENTURE_DICE_ROLLED",
          playerId: "p1",
          dice: "resource",
          results: ["3 gold"],
          resourceRolls: [{ resource: "gold", amount: 3 }]
        }),
        ev({ type: "RESOURCES_GAINED", playerId: "p1", gold: 3, reason: "treasure" })
      ],
      NO_STATE
    );
    expect(rewards[0].label).toBe("+3");
    expect(rewards[0].icon).toContain("resource-gold");
    expect(rewards[0].title).toMatch(/Resource die/i);
    // RESOURCES_GAINED still chips the stockpile (same numbers — two chips is fine:
    // die face + paid-out result). formatResourceName uses lowercase "gold".
    expect(rewards.some((r) => /gold/i.test(r.title))).toBe(true);
  });
});
