"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import {
  chapterRoomOptions,
  listCampaigns,
  type Campaign,
  type CampaignChapter,
  type LocalizedText
} from "@/data/story/campaigns";
import { bindCampaignRoom, getCampaignProgress } from "@/lib/campaign-progress";
import { createSinglePlayerRoom } from "@/lib/realtime";
import { useStoryLanguage, type StoryLanguage } from "@/lib/story-language";

/**
 * Story-mode hub (Anime mod §12): lists both campaigns as theme-styled cards,
 * each expanding to its chapter list with locked / unlocked / completed states.
 * "Begin chapter" on a playable, unlocked chapter mints a private single-player
 * room exactly like `/single-player` (same `createSinglePlayerRoom` helper),
 * binds the campaign context in localStorage, then drops into the table.
 *
 * LIMITS (what does NOT run): only Chapter 1 of each campaign is playable;
 * chapters 2–7 render as "in development" once unlocked. The protagonist is
 * presentation — the seat uses a core faction stand-in — and only the opponent
 * count reaches the created room in V1 (see `chapterRoomOptions`). The card
 * theme classes are scoped to the cards, never the app root.
 */

function pickText(text: LocalizedText, language: StoryLanguage): string {
  return text[language];
}

type ChapterStatus = "locked" | "in-development" | "playable" | "completed";

function chapterStatus(
  campaign: Campaign,
  index: number,
  completedIds: readonly string[]
): ChapterStatus {
  const chapter = campaign.chapters[index];
  const unlocked = index === 0 || completedIds.includes(campaign.chapters[index - 1].id);
  if (!unlocked) {
    return "locked";
  }
  if (completedIds.includes(chapter.id)) {
    return "completed";
  }
  return chapter.playable ? "playable" : "in-development";
}

const STATUS_LABEL: Record<ChapterStatus, LocalizedText> = {
  locked: { en: "Locked", vi: "Đã khóa" },
  "in-development": { en: "In development", vi: "Đang phát triển" },
  playable: { en: "Ready", vi: "Sẵn sàng" },
  completed: { en: "Completed", vi: "Đã hoàn thành" }
};

export default function StoryPage() {
  const router = useRouter();
  const { language, toggle: toggleLanguage } = useStoryLanguage();
  // Completed chapter ids per campaign, hydrated on mount so SSR + the first
  // client render both show "no progress" (no hydration mismatch), then the
  // effect adopts the stored progress.
  const [completed, setCompleted] = useState<Record<string, string[]>>({});
  const [busyChapter, setBusyChapter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const campaign of listCampaigns()) {
      next[campaign.id] = getCampaignProgress(campaign.id).completed;
    }
    setCompleted(next);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const begin = async (campaign: Campaign, chapter: CampaignChapter) => {
    const options = chapterRoomOptions(chapter);
    if (!options || busyChapter) {
      return;
    }
    const key = `${campaign.id}:${chapter.id}`;
    setBusyChapter(key);
    setError(null);
    try {
      const { roomId } = await createSinglePlayerRoom(options.opponents);
      bindCampaignRoom(roomId, { campaignId: campaign.id, chapterId: chapter.id });
      router.push(`/?room=${encodeURIComponent(roomId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the chapter.");
      setBusyChapter(null);
    }
  };

  return (
    <MenuShell backdrop="lobby-backdrop" title="Story mode" wide>
      <div className="storyHubToolbar">
        <p className="loadingStatus storyHubBlurb">
          Solo campaigns against the computer. Chapter 1 of each is playable; later
          chapters unlock as you go and are still in development.
        </p>
        <button
          aria-pressed={language === "vi"}
          className="menuNavButton storyLangToggle"
          onClick={toggleLanguage}
          title="Switch language"
          type="button"
        >
          {language === "en" ? "EN" : "VI"}
        </button>
      </div>

      {error ? (
        <p className="authError" role="alert">
          {error}
        </p>
      ) : null}

      <div className="storyCampaignList">
        {listCampaigns().map((campaign) => {
          const completedIds = completed[campaign.id] ?? [];
          return (
            <section className={`storyCampaignCard ${campaign.theme}Theme`} key={campaign.id}>
              <header className="storyCampaignHeader">
                <h2 className="storyCampaignTitle">{pickText(campaign.title, language)}</h2>
                <p className="storyCampaignTagline">{pickText(campaign.tagline, language)}</p>
                <p className="storyCampaignProtagonist">
                  {language === "en" ? "Protagonist: " : "Nhân vật chính: "}
                  {pickText(campaign.protagonist, language)}
                </p>
              </header>
              <ol className="storyChapterList">
                {campaign.chapters.map((chapter, index) => {
                  const status = chapterStatus(campaign, index, completedIds);
                  const key = `${campaign.id}:${chapter.id}`;
                  const busy = busyChapter === key;
                  const beginnable = status === "playable" || status === "completed";
                  const chapterTitle = pickText(chapter.title, language);
                  return (
                    <li className={`storyChapter status-${status}`} key={chapter.id}>
                      <div className="storyChapterHead">
                        <span className="storyChapterNumber">{index + 1}</span>
                        <h3 className="storyChapterTitle">{chapterTitle}</h3>
                        <span className={`storyChapterStatus status-${status}`}>
                          {pickText(STATUS_LABEL[status], language)}
                        </span>
                      </div>
                      <p className="storyChapterSynopsis">{pickText(chapter.synopsis, language)}</p>
                      {beginnable ? (
                        <button
                          aria-label={`Begin chapter: ${chapterTitle}`}
                          className="menuNavButton storyBeginButton"
                          disabled={busy}
                          onClick={() => void begin(campaign, chapter)}
                          type="button"
                        >
                          {busy
                            ? language === "en"
                              ? "Starting…"
                              : "Đang bắt đầu…"
                            : status === "completed"
                              ? language === "en"
                                ? "Play again"
                                : "Chơi lại"
                              : language === "en"
                                ? "Begin chapter"
                                : "Bắt đầu chương"}
                        </button>
                      ) : (
                        <p className="storyChapterHint">
                          {status === "locked"
                            ? language === "en"
                              ? "Complete the previous chapter to unlock."
                              : "Hoàn thành chương trước để mở khóa."
                            : language === "en"
                              ? "This chapter is still in development."
                              : "Chương này vẫn đang được phát triển."}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      <nav aria-label="Story mode" className="menuNav storyHubNav">
        <Link className="menuNavButton" href="/menu">
          <span className="menuNavText">
            <span className="menuNavLabel">Back</span>
            <small>Return to the main menu</small>
          </span>
        </Link>
      </nav>
    </MenuShell>
  );
}
