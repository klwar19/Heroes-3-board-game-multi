"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import {
  chapterRoomOptions,
  getCampaign,
  type CampaignChapter,
  type LocalizedText
} from "@/data/story/campaigns";
import { assetUrl } from "@/lib/asset-url";
import { bindCampaignRoom, getCampaignProgress } from "@/lib/campaign-progress";
import { createSinglePlayerRoom } from "@/lib/realtime";
import { useStoryLanguage, type StoryLanguage } from "@/lib/story-language";

function text(value: LocalizedText | undefined, language: StoryLanguage): string {
  return value?.[language] ?? "";
}

function difficultyLabel(chapter: CampaignChapter): string {
  const difficulty = chapter.setup?.difficulty ?? "normal";
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export default function StoryPage() {
  const router = useRouter();
  const { language, toggle: toggleLanguage } = useStoryLanguage();
  const campaign = getCampaign("erathia")!;
  const [completed, setCompleted] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(campaign.chapters[0].id);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [bonusId, setBonusId] = useState(campaign.chapters[0].startingBonuses?.[0]?.id ?? "");
  const [modsOpen, setModsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCompleted(getCampaignProgress(campaign.id).completed);
  }, [campaign.id]);

  const selected = useMemo(
    () => campaign.chapters.find((chapter) => chapter.id === selectedId) ?? campaign.chapters[0],
    [campaign.chapters, selectedId]
  );
  const selectedIndex = campaign.chapters.indexOf(selected);
  const selectedUnlocked = selectedIndex === 0 || completed.includes(campaign.chapters[selectedIndex - 1].id);
  const selectedBonus = selected.startingBonuses?.find((bonus) => bonus.id === bonusId)
    ?? selected.startingBonuses?.[0];
  const options = chapterRoomOptions(selected, selectedBonus?.id);

  const chooseChapter = (chapter: CampaignChapter, index: number) => {
    const unlocked = index === 0 || completed.includes(campaign.chapters[index - 1].id);
    if (!unlocked) return;
    setSelectedId(chapter.id);
    setBonusId(chapter.startingBonuses?.[0]?.id ?? "");
    setBriefingOpen(false);
    setError(null);
  };

  const begin = async () => {
    if (!options || busy || !selectedUnlocked) return;
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await createSinglePlayerRoom(options.opponents);
      bindCampaignRoom(roomId, {
        campaignId: campaign.id,
        chapterId: selected.id,
        ...(selectedBonus ? { bonusId: selectedBonus.id } : {})
      });
      router.push(`/?room=${encodeURIComponent(roomId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the chapter.");
      setBusy(false);
    }
  };

  return (
    <MenuShell backdrop="lobby-backdrop" panel={false}>
      <section className="campaignScreen" aria-label="Restoration of Erathia campaign">
        <header className="campaignHeader">
          <p className="campaignKicker">{language === "en" ? "Original campaign" : "Chiến dịch gốc"}</p>
          <h1>{text(campaign.title, language)}</h1>
          <p>{text(campaign.tagline, language)}</p>
        </header>

        <Link className="campaignCornerButton campaignBack" href="/single-player">← {language === "en" ? "Back" : "Quay lại"}</Link>
        <button className="campaignCornerButton campaignLanguage" onClick={toggleLanguage} type="button">
          {language === "en" ? "EN" : "VI"}
        </button>
        <div className="campaignModsCorner">
          <button aria-expanded={modsOpen} className="campaignCornerButton" onClick={() => setModsOpen((open) => !open)} type="button">
            MODS <span aria-hidden>▾</span>
          </button>
          {modsOpen ? (
            <aside className="campaignModsPopover">
              <strong>{language === "en" ? "Optional chronicles" : "Biên niên sử tùy chọn"}</strong>
              <p>{language === "en" ? "Hidden from the main campaign map." : "Ẩn khỏi bản đồ chiến dịch chính."}</p>
              <ul><li>The Jianghu Chronicle</li><li>Bin&apos;s Otherworld Chronicle</li><li>The Grand Convergence</li></ul>
              <small>{language === "en" ? "Wuxia / anime content remains available as a mod, not part of Erathia." : "Nội dung wuxia / anime nằm trong mod, không thuộc Erathia."}</small>
            </aside>
          ) : null}
        </div>

        <div className="campaignMapFrame">
          <img alt="Painted map of the Long Live the Queen campaign route" className="campaignMapArt" src={assetUrl("/assets/story/erathia/campaign-map.webp")} />
          <div className="campaignMapShade" />
          {campaign.chapters.map((chapter, index) => {
            const unlocked = index === 0 || completed.includes(campaign.chapters[index - 1].id);
            const done = completed.includes(chapter.id);
            const active = chapter.id === selected.id;
            return (
              <button
                aria-label={`${text(chapter.title, language)} — ${done ? "completed" : unlocked ? "available" : "locked"}`}
                className={`campaignMapNode${active ? " active" : ""}${done ? " completed" : ""}${unlocked ? "" : " locked"}`}
                disabled={!unlocked}
                key={chapter.id}
                onClick={() => chooseChapter(chapter, index)}
                style={{ left: `${chapter.mapPosition?.x ?? 50}%`, top: `${chapter.mapPosition?.y ?? 50}%` }}
                type="button"
              >
                <span className="campaignMapNodeSigil">{done ? "✓" : unlocked ? index + 1 : "◆"}</span>
                <span className="campaignMapNodeLabel">{text(chapter.title, language)}</span>
              </button>
            );
          })}

          <aside className="campaignSelectionPanel">
            <span className="campaignChapterEyebrow">{language === "en" ? `Chapter ${selectedIndex + 1} of 3` : `Chương ${selectedIndex + 1} / 3`}</span>
            <h2>{text(selected.title, language)}</h2>
            <p>{text(selected.synopsis, language)}</p>
            <dl>
              <div><dt>{language === "en" ? "Objective" : "Mục tiêu"}</dt><dd>{text(selected.objective, language)}</dd></div>
              <div><dt>{language === "en" ? "Difficulty" : "Độ khó"}</dt><dd>{difficultyLabel(selected)}</dd></div>
              <div><dt>{language === "en" ? "Map" : "Bản đồ"}</dt><dd>{selected.scenarioMap?.tiles.length ?? 0} {language === "en" ? "authored tiles" : "ô thiết kế"}</dd></div>
            </dl>
            <button className="campaignPrimaryButton" disabled={!selectedUnlocked} onClick={() => setBriefingOpen(true)} type="button">
              {completed.includes(selected.id) ? (language === "en" ? "Replay briefing" : "Chơi lại") : (language === "en" ? "Open briefing" : "Mở chỉ thị")}
            </button>
          </aside>
        </div>

        {briefingOpen ? (
          <div className="campaignBriefingScrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setBriefingOpen(false)}>
            <section aria-label={`${text(selected.title, language)} briefing`} aria-modal="true" className="campaignBriefing" role="dialog">
              <button aria-label="Close briefing" className="campaignBriefingClose" onClick={() => setBriefingOpen(false)} type="button">×</button>
              <div className="campaignBriefingHero">
                <img alt="" src={assetUrl(selected.briefingArt!)} />
                <div className="campaignBriefingHeroCopy">
                  <span>{language === "en" ? "Queen Catherine's orders" : "Mệnh lệnh của Nữ Hoàng Catherine"}</span>
                  <h2>{text(selected.title, language)}</h2>
                  <p>{text(selected.synopsis, language)}</p>
                </div>
              </div>

              <div className="campaignBriefingBody">
                <section className="campaignBriefingBlock">
                  <h3>{language === "en" ? "Mission rules" : "Luật nhiệm vụ"}</h3>
                  <dl className="campaignRulesGrid">
                    <div><dt>{language === "en" ? "Victory" : "Chiến thắng"}</dt><dd>{text(selected.objective, language)}</dd></div>
                    <div><dt>{language === "en" ? "Difficulty" : "Độ khó"}</dt><dd>{difficultyLabel(selected)} · {language === "en" ? "fixed" : "cố định"}</dd></div>
                    <div><dt>{language === "en" ? "Hero cap" : "Giới hạn hero"}</dt><dd>{selected.levelCap ?? (language === "en" ? "None" : "Không")}</dd></div>
                    <div><dt>{language === "en" ? "Carry over" : "Chuyển tiếp"}</dt><dd>{selected.carryOverHeroes ? `${selected.carryOverHeroes} ${language === "en" ? "heroes" : "hero"}` : language === "en" ? "Campaign finale" : "Chương cuối"}</dd></div>
                    <div><dt>{language === "en" ? "Map design" : "Thiết kế bản đồ"}</dt><dd>{selected.scenarioMap?.tiles.length} {language === "en" ? "fixed tiles, no player setup" : "ô cố định, không cài đặt"}</dd></div>
                    <div><dt>{language === "en" ? "Round guide" : "Số vòng"}</dt><dd>{selected.scenarioMap?.preset.roundLimit}</dd></div>
                  </dl>
                </section>

                <section className="campaignBriefingBlock">
                  <h3>{language === "en" ? "Choose one starting bonus" : "Chọn một phần thưởng khởi đầu"}</h3>
                  <div className="campaignBonusGrid">
                    {selected.startingBonuses?.map((bonus) => (
                      <button aria-pressed={selectedBonus?.id === bonus.id} className={selectedBonus?.id === bonus.id ? "selected" : ""} key={bonus.id} onClick={() => setBonusId(bonus.id)} type="button">
                        <strong>{text(bonus.title, language)}</strong><small>{text(bonus.effect, language)}</small>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="campaignBriefingBlock">
                  <h3>{language === "en" ? "Forces" : "Lực lượng"}</h3>
                  <div className="campaignForces">
                    <div className="campaignHeroRoster">
                      <span>{language === "en" ? "Your heroes" : "Hero của bạn"}</span>
                      {selected.heroIds?.map((heroId) => {
                        const hero = coreHeroDefinitions[heroId];
                        return hero ? <figure key={heroId}><img alt="" src={assetUrl(hero.portrait)} /><figcaption>{hero.name}</figcaption></figure> : null;
                      })}
                    </div>
                    <div className="campaignEnemyRoster">
                      <span>{language === "en" ? "Computer forces" : "Quân máy"}</span>
                      {selected.setup?.computerSeats?.map((seat) => (
                        <div key={seat.label}>
                          <strong>{coreFactionDefinitions[seat.factionId].name}</strong>
                          <small>{seat.label}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="campaignMapReadout">
                  <strong>{selected.scenarioMap?.name}</strong>
                  <span>{selected.scenarioMap?.preset.notes}</span>
                </section>
                {error ? <p className="authError" role="alert">{error}</p> : null}
                <button className="campaignPrimaryButton campaignBegin" disabled={busy} onClick={() => void begin()} type="button">
                  {busy ? (language === "en" ? "Preparing the battlefield…" : "Đang chuẩn bị chiến trường…") : (language === "en" ? "Begin chapter" : "Bắt đầu chương")}
                </button>
                <p className="campaignAutoStartNote">{language === "en" ? "The fixed scenario starts immediately. Catherine's visual-novel briefing plays before your first map action." : "Kịch bản cố định sẽ bắt đầu ngay. Đối thoại của Catherine xuất hiện trước hành động bản đồ đầu tiên."}</p>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </MenuShell>
  );
}
