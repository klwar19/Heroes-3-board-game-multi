import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ANIME_FACTION_PENALTIES, animeFactionPenalty, animeFactionPenaltyTitle } from "./faction-penalties";
import { coreFactionDefinitions } from "@/data/factions/core";
import { factionVisualRegister } from "@/data/faction-theme";

const ROOT = process.cwd();

describe("anime/xianxia faction briefings", () => {
  it("covers exactly the seven custom towns, each a real faction", () => {
    const ids = ANIME_FACTION_PENALTIES.map((entry) => entry.factionId);
    expect(new Set(ids)).toEqual(
      new Set(["fuyuki", "azure_breeze", "heavenly_demon", "hidden_leaf", "mgq", "little_busters", "azur_lane"])
    );
    ids.forEach((id) => expect(coreFactionDefinitions[id]).toBeDefined());
  });

  it("every town is explained PER TOWN — no grouped/shared penalty titles", () => {
    const titles = ANIME_FACTION_PENALTIES.map((entry) => entry.title);
    // Distinct titles are what makes the notice per-town; a duplicate would be the
    // old grouped behaviour the user rejected.
    expect(new Set(titles).size).toBe(titles.length);
    // The old grouped name must be gone everywhere.
    titles.forEach((title) => expect(title).not.toMatch(/Otherworld Penalty/));
  });

  it("each entry states BOTH halves: a signature mechanic and its own penalty", () => {
    for (const entry of ANIME_FACTION_PENALTIES) {
      expect(entry.mechanicTitle.length).toBeGreaterThan(0);
      expect(entry.mechanicDetail.length).toBeGreaterThan(20);
      expect(entry.short.length).toBeGreaterThan(0);
      expect(entry.detail.length).toBeGreaterThan(20);
      expect(entry.mechanicDetail).not.toBe(entry.detail);
    }
  });

  it("uses the same visual register the rest of the UI uses", () => {
    for (const entry of ANIME_FACTION_PENALTIES) {
      // faction-theme keeps Azur Lane on the shared "anime" register.
      expect(entry.register).toBe(factionVisualRegister(entry.factionId));
    }
  });

  it("ships a themed art file under public/ for every town's briefing/notice", () => {
    for (const entry of ANIME_FACTION_PENALTIES) {
      expect(entry.artImage.startsWith("/assets/anime/notices/")).toBe(true);
      const path = join(ROOT, "public", entry.artImage.replace(/^\//, ""));
      expect(existsSync(path), `missing art: ${entry.artImage}`).toBe(true);
    }
  });

  it("exposes the engine's per-town notice prefix", () => {
    expect(animeFactionPenaltyTitle("fuyuki")).toBe("Grail War Upkeep");
    expect(animeFactionPenaltyTitle("azure_breeze")).toBe("Formation Exposure");
    expect(animeFactionPenaltyTitle("heavenly_demon")).toBe("Demonic Backlash");
    expect(animeFactionPenaltyTitle("azur_lane")).toBe("Fleet Maintenance");
    expect(animeFactionPenaltyTitle("castle")).toBeUndefined();
    expect(animeFactionPenalty("mgq")?.mechanicTitle).toBe("Four Spirits");
  });

  it("prints every cumulative custom-town drawback in the briefing notice", () => {
    expect(animeFactionPenalty("fuyuki")?.detail).toContain("round 2");
    expect(animeFactionPenalty("azure_breeze")?.detail).toContain("rounds 1 and 3 only");
    expect(animeFactionPenalty("azure_breeze")?.detail).toContain("no Resource-round gold penalty");
    expect(animeFactionPenalty("heavenly_demon")?.detail).toContain("enemy draws no penalty cards");
    expect(animeFactionPenalty("heavenly_demon")?.detail).toContain("no Resource-round gold penalty");
    expect(animeFactionPenalty("little_busters")?.detail).toContain("Paralysis and −2 Attack");
    expect(animeFactionPenalty("azur_lane")?.detail).toContain("draws 1 card");
    expect(animeFactionPenalty("mgq")?.short).toBe("No recurring penalty");
  });
});
