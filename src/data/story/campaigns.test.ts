import { describe, expect, it } from "vitest";
import {
  CAMPAIGNS,
  chapterRoomOptions,
  getCampaign,
  getCampaignChapter,
  listCampaigns,
  type AnimeModuleFlag,
  type Campaign,
  type CampaignChapter,
  type LocalizedText
} from "./campaigns";
import { isStoryScene } from "./scenes";
import { coreFactionDefinitions, isPlayableFaction } from "@/data/factions/core";

/**
 * The ONLY anime module flags whose module actually RUNS today (engine-wired +
 * covered by a test that fails if the logic is removed):
 *  - `enabled`        — the master crest / skin gate (required by all the rest).
 *  - `cultivation`    — the Cultivation Realm track (`anime-cultivation.test.ts`).
 *  - `xianxiaArtifacts` — the 5 Pháp Bảo artifacts (`anime-artifacts.test.ts`).
 * Every OTHER AnimeModOptions flag (towns, neutrals, destiny, guild, waves,
 * raidBosses, dungeon, gods, heartDemon, elixirPills, secretRealms) is still
 * types/lobby-only per the plan §1 status — enabling one on a playable chapter
 * would ship dead flavour, so this allowlist FAILS the test if that happens.
 * (`fieldOverrides` is NOT here: it is a global GameSetupOptions toggle, a
 * sibling of `anime`, not an AnimeModOptions key.)
 */
const SHIPPED_ANIME_MODULES = new Set<AnimeModuleFlag>(["enabled", "cultivation", "xianxiaArtifacts"]);

function bilingual(text: LocalizedText, label: string) {
  expect(typeof text.en === "string" && text.en.trim().length > 0, `${label}.en`).toBe(true);
  expect(typeof text.vi === "string" && text.vi.trim().length > 0, `${label}.vi`).toBe(true);
}

describe("campaign registry", () => {
  it("ships BOTH campaigns, each with 7 chapters and matching registry lookups", () => {
    expect(listCampaigns()).toBe(CAMPAIGNS);
    expect(CAMPAIGNS.map((c) => c.id)).toEqual(["jianghu", "bin-otherworld"]);
    expect(CAMPAIGNS.map((c) => c.theme)).toEqual(["xianxia", "isekai"]);
    for (const campaign of CAMPAIGNS) {
      expect(campaign.chapters.length, `${campaign.id} chapters`).toBe(7);
      expect(getCampaign(campaign.id)).toBe(campaign);
      expect(new Set(campaign.chapters.map((ch) => ch.id)).size).toBe(7);
    }
    expect(getCampaign("does-not-exist")).toBeUndefined();
    expect(getCampaignChapter("jianghu", "ch1")?.title.en).toBe("Awakening");
  });

  it("is bilingual by construction — non-empty EN and VI on every player-visible string", () => {
    for (const campaign of CAMPAIGNS) {
      bilingual(campaign.title, `${campaign.id} title`);
      bilingual(campaign.tagline, `${campaign.id} tagline`);
      bilingual(campaign.protagonist, `${campaign.id} protagonist`);
      for (const chapter of campaign.chapters) {
        bilingual(chapter.title, `${campaign.id}/${chapter.id} title`);
        bilingual(chapter.synopsis, `${campaign.id}/${chapter.id} synopsis`);
      }
    }
  });

  it("every referenced scene id resolves in the story registry", () => {
    for (const campaign of CAMPAIGNS) {
      for (const chapter of campaign.chapters) {
        for (const sceneId of Object.values(chapter.scenes)) {
          if (sceneId !== undefined) {
            expect(isStoryScene(sceneId), `${campaign.id}/${chapter.id} → ${sceneId}`).toBe(true);
          }
        }
      }
    }
  });

  it("exactly ONE playable chapter per campaign (chapter 1); it carries a full setup + all three scenes", () => {
    for (const campaign of CAMPAIGNS) {
      const playable = campaign.chapters.filter((ch) => ch.playable);
      expect(playable.map((ch) => ch.id), campaign.id).toEqual(["ch1"]);

      const ch1 = campaign.chapters[0];
      expect(ch1.setup, `${campaign.id}/ch1 setup`).toBeDefined();
      // A playable chapter drives intro / victory / defeat.
      expect(isStoryScene(ch1.scenes.onStart ?? "")).toBe(true);
      expect(isStoryScene(ch1.scenes.onVictory ?? "")).toBe(true);
      expect(isStoryScene(ch1.scenes.onDefeat ?? "")).toBe(true);
    }
  });

  it("non-playable chapters (2–7) carry NO setup and NO scene hooks", () => {
    for (const campaign of CAMPAIGNS) {
      for (const chapter of campaign.chapters.filter((ch) => !ch.playable)) {
        expect(chapter.setup, `${campaign.id}/${chapter.id} setup`).toBeUndefined();
        expect(Object.keys(chapter.scenes), `${campaign.id}/${chapter.id} scenes`).toEqual([]);
      }
    }
  });

  it("every playable chapter's setup names a REAL, playable faction and a sane opponent count", () => {
    for (const campaign of CAMPAIGNS) {
      for (const chapter of campaign.chapters.filter((ch) => ch.setup)) {
        const setup = chapter.setup!;
        expect(coreFactionDefinitions[setup.playerFaction], `${campaign.id}/${chapter.id} faction`).toBeDefined();
        expect(isPlayableFaction(setup.playerFaction)).toBe(true);
        expect(setup.opponents).toBeGreaterThanOrEqual(1);
        expect(setup.opponents).toBeLessThanOrEqual(3);
      }
    }
  });

  it("every anime flag a playable chapter enables corresponds to a module that actually RUNS", () => {
    for (const campaign of CAMPAIGNS) {
      for (const chapter of campaign.chapters.filter((ch) => ch.setup)) {
        const anime = chapter.setup!.anime ?? {};
        for (const [flag, value] of Object.entries(anime) as [AnimeModuleFlag, boolean][]) {
          if (value === true) {
            expect(
              SHIPPED_ANIME_MODULES.has(flag),
              `${campaign.id}/${chapter.id} enables anime.${flag}, which does NOT run yet`
            ).toBe(true);
          }
        }
      }
    }
  });
});

describe("chapterRoomOptions", () => {
  const ch1 = (campaignId: string): CampaignChapter => getCampaign(campaignId)!.chapters[0];

  it("maps the Jianghu ch-1 config to 1 opponent + the shipped xianxia options", () => {
    const options = chapterRoomOptions(ch1("jianghu"))!;
    expect(options.opponents).toBe(1);
    expect(options.playerFaction).toBe("rampart");
    expect(options.fieldOverrides).toBe(true);
    // The three flags the chapter turns on — each a shipped module.
    expect(options.anime.enabled).toBe(true);
    expect(options.anime.cultivation).toBe(true);
    expect(options.anime.xianxiaArtifacts).toBe(true);
    // A dead flag stays merged-off (resolveAnimeOptions defaults).
    expect(options.anime.destiny).toBe(false);
    expect(options.anime.isekaiTowns).toBe(false);
  });

  it("maps Bin's ch-1 config to 1 opponent + field overrides only (isekai systems unshipped)", () => {
    const options = chapterRoomOptions(ch1("bin-otherworld"))!;
    expect(options.opponents).toBe(1);
    expect(options.playerFaction).toBe("tower");
    expect(options.fieldOverrides).toBe(true);
    expect(options.anime.enabled).toBe(true);
    // No xianxia gameplay flags on the isekai chapter.
    expect(options.anime.cultivation).toBe(false);
    expect(options.anime.xianxiaArtifacts).toBe(false);
  });

  it("returns null for a locked chapter with no setup (CONTROL)", () => {
    const locked = getCampaign("jianghu")!.chapters[1];
    expect(locked.playable).toBe(false);
    expect(chapterRoomOptions(locked)).toBeNull();
  });
});

// Type-only exercise so a Campaign shape regression is a compile error too.
const _typecheck: Campaign = {
  id: "x",
  theme: "xianxia",
  title: { en: "a", vi: "b" },
  tagline: { en: "a", vi: "b" },
  protagonist: { en: "a", vi: "b" },
  chapters: []
};
void _typecheck;
