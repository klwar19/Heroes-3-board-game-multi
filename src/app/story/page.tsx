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
import {
  bindCampaignRoom,
  DEFAULT_CAMPAIGN_RULE_OPTIONS,
  getCampaignProgress,
  type CampaignRuleOptions,
} from "@/lib/campaign-progress";
import { createSinglePlayerRoom } from "@/lib/realtime";
import { useStoryLanguage, type StoryLanguage } from "@/lib/story-language";

function text(value: LocalizedText | undefined, language: StoryLanguage): string {
  return value?.[language] ?? "";
}

function difficultyLabel(chapter: CampaignChapter): string {
  const difficulty = chapter.setup?.difficulty ?? "normal";
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

const CAMPAIGN_RULE_CHOICES: Array<{
  key: keyof CampaignRuleOptions;
  title: LocalizedText;
  detail: LocalizedText;
}> = [
  {
    key: "events",
    title: { en: "Event cards", vi: "Thẻ sự kiện" },
    detail: { en: "Draw a world event each resource round.", vi: "Rút sự kiện thế giới mỗi vòng tài nguyên." },
  },
  {
    key: "moraleCards",
    title: { en: "Morale cards", vi: "Thẻ tinh thần" },
    detail: { en: "Use the positive and negative Morale decks.", vi: "Dùng bộ bài tinh thần tích cực và tiêu cực." },
  },
  {
    key: "spellBook",
    title: { en: "Spell Book", vi: "Sách phép" },
    detail: { en: "Store spells outside your normal hand.", vi: "Cất phép bên ngoài tay bài thông thường." },
  },
  {
    key: "creatureBanks",
    title: { en: "Creature banks", vi: "Kho sinh vật" },
    detail: { en: "Enable optional bank encounters on eligible tiles.", vi: "Bật các trận kho sinh vật trên ô phù hợp." },
  },
  {
    key: "startingHandMulligan",
    title: { en: "Opening mulligan", vi: "Đổi bài khởi đầu" },
    detail: { en: "Replace unwanted cards in the opening hand.", vi: "Thay các lá không muốn trong tay bài đầu." },
  },
  {
    key: "unitExperience",
    title: { en: "Unit experience", vi: "Kinh nghiệm đơn vị" },
    detail: { en: "Surviving troops gain ranks across battles.", vi: "Quân sống sót tăng hạng qua các trận chiến." },
  },
];

export default function StoryPage() {
  const router = useRouter();
  const { language, toggle: toggleLanguage } = useStoryLanguage();
  const campaign = getCampaign("erathia")!;
  const [completed, setCompleted] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(campaign.chapters[0].id);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [bonusId, setBonusId] = useState(campaign.chapters[0].startingBonuses?.[0]?.id ?? "");
  const [modsOpen, setModsOpen] = useState(false);
  const [rules, setRules] = useState<CampaignRuleOptions>(() => ({
    ...DEFAULT_CAMPAIGN_RULE_OPTIONS,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate completion from localStorage on mount (client-only): SSR + the first
  // client render both show "no progress" so there is no hydration mismatch, then
  // this adopts the stored progress. setState-in-effect is the correct pattern here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCompleted(getCampaignProgress(campaign.id).completed);
  }, [campaign.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
        ...(selectedBonus ? { bonusId: selectedBonus.id } : {}),
        rules,
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
          <img alt="Newly painted six-mission map of Catherine's Erathian campaign" className="campaignMapArt" src={assetUrl("/assets/story/erathia/campaign-map-rebuilt.webp")} />
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
            <span className="campaignChapterEyebrow">{language === "en" ? `Chapter ${selectedIndex + 1} of ${campaign.chapters.length}` : `Chương ${selectedIndex + 1} / ${campaign.chapters.length}`}</span>
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
                    <div><dt>{language === "en" ? "Commander" : "Chỉ huy"}</dt><dd>{selected.setup?.playerHeroDefId ? coreHeroDefinitions[selected.setup.playerHeroDefId]?.name : "Catherine"} · {language === "en" ? "1 main hero deployed" : "triển khai 1 hero chính"}</dd></div>
                    <div><dt>{language === "en" ? "Map design" : "Thiết kế bản đồ"}</dt><dd>{selected.scenarioMap?.tiles.length} {language === "en" ? "fixed tiles, no player setup" : "ô cố định, không cài đặt"}</dd></div>
                    <div><dt>{language === "en" ? "Round guide" : "Số vòng"}</dt><dd>{selected.scenarioMap?.preset.roundLimit}</dd></div>
                  </dl>
                </section>

                <section className="campaignBriefingBlock">
                  <h3>{language === "en" ? "Choose one board-game starting package" : "Chọn một gói khởi đầu board game"}</h3>
                  <p className="campaignBonusNote">{language === "en" ? "Each package is a small, scenario-scaled alternative—not an extra hero or the original PC campaign reward." : "Mỗi gói là một lựa chọn nhỏ được cân theo nhiệm vụ—không phải hero bổ sung hay phần thưởng nguyên bản của bản PC."}</p>
                  <div className="campaignBonusGrid">
                    {selected.startingBonuses?.map((bonus) => (
                      <button aria-pressed={selectedBonus?.id === bonus.id} className={selectedBonus?.id === bonus.id ? "selected" : ""} key={bonus.id} onClick={() => setBonusId(bonus.id)} type="button">
                        <strong>{text(bonus.title, language)}</strong><small>{text(bonus.effect, language)}</small>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="campaignBriefingBlock campaignOptionsBlock">
                  <div className="campaignOptionsHead">
                    <div>
                      <span>{language === "en" ? "Before deployment" : "Trước khi triển khai"}</span>
                      <h3>{language === "en" ? "Optional campaign systems" : "Hệ thống chiến dịch tùy chọn"}</h3>
                    </div>
                    <span className="campaignMapLockedBadge">
                      <span aria-hidden>◆</span> {language === "en" ? "Authored map locked" : "Bản đồ thiết kế đã khóa"}
                    </span>
                  </div>
                  <p className="campaignOptionsIntro">
                    {language === "en"
                      ? "Tune the supporting rules. Mission map, victory objective, heroes and enemy forces stay fixed."
                      : "Tùy chỉnh luật hỗ trợ. Bản đồ, mục tiêu, hero và quân địch vẫn cố định."}
                  </p>
                  <div className="campaignOptionGrid">
                    {CAMPAIGN_RULE_CHOICES.map((choice) => {
                      const enabled = rules[choice.key];
                      return (
                        <button
                          aria-pressed={enabled}
                          className={enabled ? "enabled" : ""}
                          key={choice.key}
                          onClick={() => setRules((current) => ({
                            ...current,
                            [choice.key]: !current[choice.key],
                          }))}
                          type="button"
                        >
                          <span className="campaignOptionSwitch" aria-hidden><i /></span>
                          <span className="campaignOptionCopy">
                            <strong>{text(choice.title, language)}</strong>
                            <small>{text(choice.detail, language)}</small>
                          </span>
                          <b>{enabled ? (language === "en" ? "ON" : "BẬT") : (language === "en" ? "OFF" : "TẮT")}</b>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="campaignBriefingBlock">
                  <h3>{language === "en" ? "Forces" : "Lực lượng"}</h3>
                  <div className="campaignForces">
                    <div className="campaignHeroColumn">
                      <div className="campaignHeroRoster">
                        <span>{language === "en" ? "Story cast" : "Nhân vật"}</span>
                        {selected.heroIds?.map((heroId) => {
                          const hero = coreHeroDefinitions[heroId];
                          return hero ? <figure key={heroId}><img alt="" src={assetUrl(hero.portrait)} /><figcaption>{hero.name}</figcaption></figure> : null;
                        })}
                      </div>
                      <small className="campaignCastNote">{language === "en" ? "Portraits identify the chapter's story cast. Only the fixed commander above starts on the board." : "Chân dung thể hiện nhân vật trong truyện. Chỉ chỉ huy cố định ở trên bắt đầu trên bàn."}</small>
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
                <p className="campaignAutoStartNote">{language === "en" ? "Your selected systems are applied, then the locked scenario starts immediately. Catherine's briefing plays before your first map action." : "Các hệ thống đã chọn sẽ được áp dụng, sau đó kịch bản khóa bắt đầu ngay. Đối thoại của Catherine xuất hiện trước hành động bản đồ đầu tiên."}</p>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </MenuShell>
  );
}
