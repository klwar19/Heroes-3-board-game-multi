/**
 * Campaign registry — the Story-mode shell (Anime mod §12 / §3.3).
 *
 * ONE shell, N campaigns. Each campaign lists 7 chapters as DATA (title,
 * synopsis, the arc from §12.1 / §12.2). Only **Chapter 1** of each campaign is
 * PLAYABLE this slice — it carries a `setup` (faction + opponents + the anime
 * options it wants) and `scenes` (intro / victory / defeat hooks into the
 * shared `StoryScene` registry). Chapters 2–7 are locked data: `playable:false`,
 * no `setup`, empty `scenes` — they render as "in development" once unlocked.
 *
 * WHAT DOES NOT RUN (lead with the limits):
 *  - **Protagonists are PRESENTATION only.** Chen Fan / Bin live in the story
 *    scenes; the playable seat uses a CORE faction stand-in (anime towns are
 *    unshipped). `setup.playerFaction` names that stand-in.
 *  - **`setup` is carried config, not yet applied to the live game.** The V1
 *    Begin flow (see `chapterRoomOptions` + `/story`) mints a standard
 *    single-player room and passes ONLY the opponent count. `playerFaction`,
 *    `difficulty`, `fieldOverrides` and `anime` are surfaced by the tested pure
 *    helper `chapterRoomOptions` for the setup-injection slice that lands later;
 *    the player still picks their faction on the normal setup screen and the
 *    game runs with default options. No engine change ships here.
 *  - **`mapPresetId` is unused.** Campaign maps use standard map generation in
 *    V1; a designed `CustomMapPreset` per chapter is a later content pass.
 *  - **No routes / karma / cheat picks / quest-log (§13).** Chapters that print
 *    a 5A/5B split are one chapter here; the split, Golden Fingers / Cheat
 *    Skills and the System quest-log are deferred (§13, campaign-only).
 *
 * Bilingual EN/VI by construction — every player-visible string carries both,
 * enforced by `campaigns.test.ts`. Xianxia register for the Jianghu Chronicle;
 * the warmer anime/isekai register for Bin's Chronicle.
 */

import type { FactionId } from "@/data/factions/types";
import { resolveAnimeOptions } from "@/engine/anime";
import type { AnimeModOptions, GameDifficulty } from "@/engine/state";

export type LocalizedText = { en: string; vi: string };

export type CampaignTheme = "xianxia" | "isekai";

/** The boolean anime module flags (every AnimeModOptions key except waveCadence). */
export type AnimeModuleFlag = keyof Omit<AnimeModOptions, "waveCadence">;

/**
 * A playable chapter's room configuration. `anime` names the anime MODULE flags
 * (a `Partial<AnimeModOptions>`); `fieldOverrides` is the GLOBAL Field-Override
 * system toggle (`GameSetupOptions.fieldOverrides`) — a sibling, since it lives
 * on `GameSetupOptions`, NOT inside `AnimeModOptions`. Only flags whose module
 * actually runs today may be set true (enforced in `campaigns.test.ts`).
 */
export type CampaignChapterSetup = {
  /** Core faction stand-in for the protagonist (anime towns are unshipped). */
  playerFaction: FactionId;
  /** Number of computer opponents (1–3). The only field applied to the room in V1. */
  opponents: number;
  /** Intended scenario difficulty — carried config, not applied in V1. */
  difficulty?: GameDifficulty;
  /** Turn the global Field Override system on (carried config, not applied in V1). */
  fieldOverrides?: boolean;
  /** Anime module flags this chapter wants (carried config, not applied in V1). */
  anime?: Partial<AnimeModOptions>;
};

/** Scene hooks into the shared `storySceneRegistry` (all optional). */
export type CampaignChapterScenes = {
  onStart?: string;
  onVictory?: string;
  onDefeat?: string;
};

export type CampaignChapter = {
  id: string;
  title: LocalizedText;
  synopsis: LocalizedText;
  /** Only Chapter 1 is playable this slice. */
  playable: boolean;
  /** Present only on playable chapters. */
  setup?: CampaignChapterSetup;
  /** Designed CustomMapPreset id — unused in V1 (standard map generation). */
  mapPresetId?: string;
  scenes: CampaignChapterScenes;
};

export type Campaign = {
  id: string;
  theme: CampaignTheme;
  title: LocalizedText;
  tagline: LocalizedText;
  protagonist: LocalizedText;
  chapters: CampaignChapter[];
};

// -----------------------------------------------------------------------------
// Locked-chapter helper — chapters 2–7 are DATA only (no setup, no scenes).
// -----------------------------------------------------------------------------

function lockedChapter(id: string, title: LocalizedText, synopsis: LocalizedText): CampaignChapter {
  return { id, title, synopsis, playable: false, scenes: {} };
}

// -----------------------------------------------------------------------------
// Campaign 1 — "The Jianghu Chronicle" (Chen Fan), §12.1.
// -----------------------------------------------------------------------------

const JIANGHU: Campaign = {
  id: "jianghu",
  theme: "xianxia",
  title: { en: "The Jianghu Chronicle", vi: "Giang Hồ Chí" },
  tagline: {
    en: "A transmigrator's sword carves a new fate across the Ninefold Realms.",
    vi: "Thanh kiếm của kẻ xuyên không khắc nên vận mệnh mới giữa Cửu Giới."
  },
  protagonist: { en: "Chen Fan", vi: "Trần Phàm" },
  chapters: [
    {
      id: "ch1",
      title: { en: "Awakening", vi: "Tỉnh Ngộ" },
      synopsis: {
        en: "Chen Fan wakes in the dying body of an outer-sect disciple of the Azure Breeze Sect, on the eve of the Sword Trial. The System stirs. Claim your first foothold on the mountain — learn to move, fight, and build.",
        vi: "Trần Phàm tỉnh dậy trong thân xác hấp hối của một ngoại môn đệ tử Thanh Phong Tông, ngay trước thềm Kiếm Thí. Hệ Thống khẽ động. Hãy giành lấy chỗ đứng đầu tiên trên núi — học cách di chuyển, chiến đấu và dựng nghiệp."
      },
      playable: true,
      setup: {
        playerFaction: "rampart",
        opponents: 1,
        difficulty: "easy",
        fieldOverrides: true,
        anime: { enabled: true, cultivation: true, xianxiaArtifacts: true }
      },
      scenes: {
        onStart: "story.jianghu.ch1.intro",
        onVictory: "story.jianghu.ch1.victory",
        onDefeat: "story.jianghu.ch1.defeat"
      }
    },
    lockedChapter(
      "ch2",
      { en: "The Valley", vi: "Sơn Cốc" },
      {
        en: "The spirit-beasts of Yaoguai Valley bar the mountain pass. Befriend them or subdue them — the choice bends your karma, and the Valley remembers.",
        vi: "Lũ linh thú Yêu Thú Cốc chắn ngang sơn đạo. Kết giao hay chế phục — lựa chọn ấy uốn nắn nghiệp lực của ngươi, và Sơn Cốc sẽ ghi nhớ."
      }
    ),
    lockedChapter(
      "ch3",
      { en: "Silk and Silver", vi: "Tơ Lụa và Bạc" },
      {
        en: "Down in the river ports, the Nine Provinces Merchant Guild trades in spirit stones and secrets. An economy scenario: out-earn the caravans before the ledgers turn against you.",
        vi: "Nơi bến sông tấp nập, Thương Hội Cửu Châu buôn linh thạch và cả bí mật. Một chiến dịch kinh tế: hãy làm giàu vượt mặt các đoàn thương lữ trước khi sổ sách quay lưng với ngươi."
      }
    ),
    lockedChapter(
      "ch4",
      { en: "Blood Moon", vi: "Huyết Nguyệt" },
      {
        en: "Under a bleeding moon the Blood Demon Cult descends on the sect. Hold the peak: a defense scenario where every wave costs, and retreat is a slow death.",
        vi: "Dưới vầng trăng rỉ máu, Huyết Ma Giáo đổ xuống bản tông. Hãy giữ vững đỉnh núi: một chiến dịch phòng thủ nơi mỗi đợt tấn công đều phải trả giá, và lui bước là cái chết chậm rãi."
      }
    ),
    lockedChapter(
      "ch5",
      { en: "Alliance or Ascension", vi: "Liên Minh hay Thăng Ma" },
      {
        en: "The realms fracture along your karma. Forge the Orthodox Alliance, or walk the Demonic Ascension — two roads, one crossing. (The route split is deferred content.)",
        vi: "Cửu Giới nứt vỡ theo nghiệp lực của ngươi. Kết Liên Minh Chính Đạo, hay bước lên con đường Thăng Ma — hai ngả, một khúc rẽ. (Nhánh phân đôi là nội dung còn dang dở.)"
      }
    ),
    lockedChapter(
      "ch6",
      { en: "Heavenly Tribulation", vi: "Độ Kiếp" },
      {
        en: "The Nascent threshold is met, and Heaven answers with lightning. A gauntlet set-piece: survive the tribulation dice and break through — or be scattered and try again.",
        vi: "Ngưỡng Nguyên Anh đã tới, và Thiên Đạo đáp lại bằng sấm sét. Một ải thử thách: hãy sống sót qua xúc xắc độ kiếp mà đột phá — hoặc tan tác rồi làm lại từ đầu."
      }
    ),
    lockedChapter(
      "ch7",
      { en: "The Realm Breach", vi: "Phá Giới Chiến" },
      {
        en: "The Outer Court pours through the cracked heavenly seal. Both roads converge on the final invasion; a high-karma victory crowns Chen Fan the Mandate of Heaven.",
        vi: "Ngoại Vực Ma Cung tràn qua thiên phong đã rạn. Hai con đường hội tụ nơi trận xâm lăng cuối cùng; một chiến thắng thiện nghiệp sẽ phong Trần Phàm làm Chân Mệnh Thiên Tử."
      }
    )
  ]
};

// -----------------------------------------------------------------------------
// Campaign 2 — "Bin's Otherworld Chronicle" (Bin), §12.2.
// -----------------------------------------------------------------------------

const BIN: Campaign = {
  id: "bin-otherworld",
  theme: "isekai",
  title: { en: "Bin's Otherworld Chronicle", vi: "Dị Giới Ký Của Bin" },
  tagline: {
    en: "A summoned gamer, a broke goddess, and a world that runs suspiciously like his favorite board game.",
    vi: "Một game thủ bị triệu hồi, một nữ thần rỗng túi, và một thế giới vận hành y hệt trò chơi bàn cờ hắn mê nhất."
  },
  protagonist: { en: "Bin", vi: "Bin" },
  chapters: [
    {
      id: "ch1",
      title: { en: "Summoned at Dawn", vi: "Triệu Hồi Lúc Bình Minh" },
      synopsis: {
        en: "Hikari's Dawn Gate spits Bin into Restia with admin access and no instructions. Register at the Adventurers' Guild, take your first commissions, and learn the hard way why nobody laughs at goblins.",
        vi: "Cổng Bình Minh của Hikari ném Bin vào Restia cùng quyền quản trị mà chẳng kèm hướng dẫn. Hãy ghi danh tại Hội Mạo Hiểm Giả, nhận những nhiệm vụ đầu tiên, và thấm thía vì sao chẳng ai dám cười nhạo lũ quỷ lùn."
      },
      playable: true,
      setup: {
        playerFaction: "tower",
        opponents: 1,
        difficulty: "easy",
        fieldOverrides: true,
        anime: { enabled: true }
      },
      scenes: {
        onStart: "story.bin.ch1.intro",
        onVictory: "story.bin.ch1.victory",
        onDefeat: "story.bin.ch1.defeat"
      }
    },
    lockedChapter(
      "ch2",
      { en: "Rank and File", vi: "Thăng Hạng Nhập Ngũ" },
      {
        en: "Commissions become a living. The first small Calamity Wave hits the outer farms, the flashy A-rank Kaito swaggers in, and the Priestess joins the party.",
        vi: "Nhiệm vụ trở thành kế sinh nhai. Đợt Sóng Tai Ương nhỏ đầu tiên ập xuống nông trại ngoại vi, gã hạng A hào nhoáng Kaito nghênh ngang xuất hiện, và Nữ Tư Tế gia nhập đội."
      }
    ),
    lockedChapter(
      "ch3",
      { en: "Into the Dungeon", vi: "Tiến Vào Mê Cung" },
      {
        en: "Floors one through five of the Dungeon beneath the old capital, down to the Minotaur. Vesper, High Priest of the Silent End, surfaces — and the High Elf Archer joins the hunt.",
        vi: "Năm tầng đầu của Mê Cung dưới cố đô, xuống tận chỗ Ngưu Đầu Nhân. Vesper, Đại Tư Tế của Tịch Diệt, lộ diện — và Cung Thủ Cao Tinh nhập cuộc săn."
      }
    ),
    lockedChapter(
      "ch4",
      { en: "The Wave of Calamity", vi: "Đợt Sóng Tai Ương" },
      {
        en: "A full wave-defense set-piece as Erebos tests the continent. Goblin Slayer's farm-rescue side chain runs alongside — his episode, his rules.",
        vi: "Một trận phòng thủ toàn diện khi Erebos thử thách cả lục địa. Chuỗi nhiệm vụ giải cứu nông trại của Goblin Slayer diễn ra song song — tập của gã, luật của gã."
      }
    ),
    lockedChapter(
      "ch5",
      { en: "Hero of the Guild", vi: "Anh Hùng Của Hội" },
      {
        en: "The S-rank exam boss-rush — or take Erebos's Mark for corrupted cheats: bigger numbers, karma bleed, and a Guild that turns cold. (The dark-bargain route is deferred content.)",
        vi: "Kỳ thi hạng S đầy ải trùm — hoặc nhận Ấn Ký của Erebos để đổi lấy gian lận hắc hóa: những con số lớn hơn, nghiệp lực rỉ máu, và một Hội Mạo Hiểm hóa lạnh lùng. (Nhánh giao kèo hắc ám là nội dung còn dang dở.)"
      }
    ),
    lockedChapter(
      "ch6",
      { en: "The Goblin King's Horde", vi: "Bầy Đàn Của Vua Quỷ Lùn" },
      {
        en: "Waves, traps, and the Goblin King himself as a raid boss. The continent's oldest joke stops being funny.",
        vi: "Sóng quái, cạm bẫy, và đích thân Vua Quỷ Lùn trong vai trùm đột kích. Trò đùa xưa nhất lục địa thôi không còn buồn cười."
      }
    ),
    lockedChapter(
      "ch7",
      { en: "Godfall", vi: "Thần Đổ" },
      {
        en: "The Avatar of Erebos: a seven-layer raid boss with phase gates. Hikari spends her last investiture on Admin Override; the epilogue teases the sea passage west, to the other continent.",
        vi: "Hóa Thân của Erebos: một trùm đột kích bảy tầng với các cửa ải chuyển pha. Hikari dốc cạn phần thần lực cuối cùng cho quyền Ghi Đè Quản Trị; hồi kết hé lộ hải trình về phương Tây, sang lục địa bên kia."
      }
    )
  ]
};

// -----------------------------------------------------------------------------
// Registry.
// -----------------------------------------------------------------------------

export const CAMPAIGNS: readonly Campaign[] = [JIANGHU, BIN];

export const campaignRegistry: Record<string, Campaign> = Object.fromEntries(
  CAMPAIGNS.map((campaign) => [campaign.id, campaign])
);

export function getCampaign(id: string): Campaign | undefined {
  return campaignRegistry[id];
}

export function listCampaigns(): readonly Campaign[] {
  return CAMPAIGNS;
}

export function getCampaignChapter(campaignId: string, chapterId: string): CampaignChapter | undefined {
  return getCampaign(campaignId)?.chapters.find((chapter) => chapter.id === chapterId);
}

/**
 * The room-creation options a chapter maps to. Pure — no side effects. Only
 * `opponents` reaches the created room in V1 (see `/story` Begin flow); the rest
 * is the intended setup, surfaced here (and tested) for the injection slice that
 * lands later. Returns null for a chapter with no `setup` (a locked chapter).
 */
export type ChapterRoomOptions = {
  opponents: number;
  playerFaction: FactionId;
  difficulty?: GameDifficulty;
  /** Global Field Override system toggle. */
  fieldOverrides: boolean;
  /** Fully-resolved anime options (defaults merged with the chapter's partial). */
  anime: AnimeModOptions;
};

export function chapterRoomOptions(chapter: CampaignChapter): ChapterRoomOptions | null {
  const setup = chapter.setup;
  if (!setup) {
    return null;
  }
  return {
    opponents: setup.opponents,
    playerFaction: setup.playerFaction,
    ...(setup.difficulty ? { difficulty: setup.difficulty } : {}),
    fieldOverrides: Boolean(setup.fieldOverrides),
    anime: resolveAnimeOptions(setup.anime ?? null)
  };
}
