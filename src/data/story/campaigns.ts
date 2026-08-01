/**
 * Campaign registry — the Story-mode shell (Anime mod §12 / §3.3).
 *
 * ONE shell, N campaigns. Restoration of Erathia carries six fully playable,
 * sequential authored missions. Optional mod chronicles remain registered
 * beside it and can still use locked placeholder chapters.
 *
 * WHAT DOES NOT RUN (lead with the limits):
 *  - **Protagonists are PRESENTATION only.** Chen Fan / Bin live in the story
 *    scenes; the playable seat uses a CORE faction stand-in (anime towns are
 *    unshipped). `setup.playerFaction` names that stand-in.
 *  - **`setup` is APPLIED to the live game.** The chapter briefing collects a
 *    starting bonus and an allow-listed set of optional systems, then injects
 *    those choices, fixed forces and the authored map through normal actions.
 *  - **Erathia maps are authored scenario data.** Players cannot replace their
 *    geometry, objective, difficulty, factions or enemy seats.
 *  - **No routes / karma / cheat picks / quest-log (§13).** Chapters that print
 *    a 5A/5B split are one chapter here; the split, Golden Fingers / Cheat
 *    Skills and the System quest-log are deferred (§13, campaign-only).
 *
 * Bilingual EN/VI by construction — every player-visible string carries both,
 * enforced by `campaigns.test.ts`. Xianxia register for the Jianghu Chronicle;
 * the warmer anime/isekai register for Bin's Chronicle.
 */

import type { FactionId } from "@/data/factions/types";
import { ERATHIA_SCENARIO_MAPS, type ErathiaScenarioMap } from "@/data/story/erathia-maps";
import { resolveAnimeOptions } from "@/engine/anime";
import { DEFAULT_WOG_OPTIONS } from "@/engine/state";
import type {
  AnimeModOptions,
  CustomMapPreset,
  CustomMapTilePlan,
  GameDifficulty,
  HouseRuleId,
  WogModOptions
} from "@/engine/state";

export type LocalizedText = { en: string; vi: string };

/**
 * "classic" is the BOARD-GAME campaign register (painted late-90s HoMM chrome,
 * no anime modules at all) beside the two anime packages.
 */
export type CampaignTheme = "xianxia" | "isekai" | "classic";

/** The boolean anime module flags (every AnimeModOptions key except waveCadence). */
export type AnimeModuleFlag = keyof Omit<
  AnimeModOptions,
  "waveCadence" | "pveTheme" | "wavePressure" | "waveDefeatLimit"
>;

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
  /** Fixed campaign commander; falls back to the faction's first hero. */
  playerHeroDefId?: string;
  /** Number of computer opponents (1–3). The only field applied to the room in V1. */
  opponents: number;
  /** Intended scenario difficulty — carried config, not applied in V1. */
  difficulty?: GameDifficulty;
  /** Turn the global Field Override system on (carried config, not applied in V1). */
  fieldOverrides?: boolean;
  /** Anime module flags this chapter wants (carried config, not applied in V1). */
  anime?: Partial<AnimeModOptions>;
  /** WOG module flags (Commanders …) this chapter wants injected. */
  wog?: Partial<WogModOptions>;
  /** House-rule toggles (Polish stacks …) this chapter wants injected. */
  houseRules?: Partial<Record<HouseRuleId, boolean>>;
  /** Fixed computer seats, in p2/p3/p4 order. */
  computerSeats?: Array<{ factionId: FactionId; heroDefId: string; label: string }>;
};

export type CampaignStartingBonus = {
  id: string;
  title: LocalizedText;
  effect: LocalizedText;
  /** Board-game implementation of the selected classic PC bonus. */
  preset: Partial<CustomMapPreset>;
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
  /** Fully-authored board map and scenario rules; campaign rooms inject it verbatim. */
  scenarioMap?: ErathiaScenarioMap;
  briefingArt?: string;
  mapPosition?: { x: number; y: number };
  objective?: LocalizedText;
  levelCap?: number;
  carryOverHeroes?: number;
  heroIds?: string[];
  startingBonuses?: CampaignStartingBonus[];
  scenes: CampaignChapterScenes;
};

export type Campaign = {
  id: string;
  theme: CampaignTheme;
  title: LocalizedText;
  tagline: LocalizedText;
  protagonist: LocalizedText;
  /** Banner cover art under /assets/story/covers/ (drawn on the /story hub card). */
  cover: string;
  chapters: CampaignChapter[];
};

const cover = (slug: string) => `/assets/story/covers/${slug}.webp`;
const erathiaArt = (slug: string, extension = ".webp") => `/assets/story/erathia/${slug}${extension}`;

// -----------------------------------------------------------------------------
// Locked-chapter helper for the optional mod chronicles.
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
  cover: cover("jianghu"),
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
  cover: cover("bin-otherworld"),
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
// Campaign 4 — "The Grand Convergence": the EVERYTHING-TOGETHER crossover.
// One map with every coexisting mod at once — the anime/wuxia modules
// (cultivation, Pháp Bảo, hero grades, equipment + Field Overrides), WOG
// Commanders AND the Polish unit-stacks house rule — the §3.8 coexistence
// gates prove they thread into one coherent game; this chapter is the playable
// front door for that combination.
// -----------------------------------------------------------------------------

const CONVERGENCE: Campaign = {
  id: "convergence",
  theme: "xianxia",
  title: { en: "The Grand Convergence", vi: "Vạn Giới Hội Tụ" },
  cover: cover("convergence"),
  tagline: {
    en: "Every realm on one board: sword cultivators, commanders and stacked legions collide where the worlds overlap.",
    vi: "Mọi cõi giới trên cùng một bàn cờ: kiếm tu, thống soái và những quân đoàn chồng lớp va chạm nơi các thế giới giao thoa."
  },
  protagonist: { en: "The Convergent Heroes", vi: "Quần Hùng Hội Tụ" },
  chapters: [
    {
      id: "ch1",
      title: { en: "Where Worlds Overlap", vi: "Nơi Thế Giới Giao Thoa" },
      synopsis: {
        en: "The realms fold into one map: cultivate, grade up, equip, command your commander and stack your legions — every module at once, against a rival who does the same.",
        vi: "Các cõi giới gập vào một bản đồ: tu luyện, thăng phẩm, trang bị, thống lĩnh chỉ huy quan và chồng lớp quân đoàn — mọi mô-đun cùng lúc, trước một đối thủ cũng làm hệt như vậy."
      },
      playable: true,
      setup: {
        playerFaction: "rampart",
        opponents: 2,
        difficulty: "normal",
        fieldOverrides: true,
        anime: { enabled: true, cultivation: true, xianxiaArtifacts: true, heroGrades: true, equipment: true },
        wog: { enabled: true, commanders: true },
        houseRules: { "polish-unit-stacks": true }
      },
      scenes: {
        onStart: "story.convergence.ch1.intro",
        onVictory: "story.convergence.ch1.victory",
        onDefeat: "story.convergence.ch1.defeat"
      }
    },
    lockedChapter(
      "ch2",
      { en: "The Stacked Legion", vi: "Quân Đoàn Chồng Lớp" },
      {
        en: "The overlap widens and armies learn the old Polish drill: layered packs holding the line while commanders duel above them.",
        vi: "Vùng giao thoa mở rộng và các đạo quân học lại binh pháp Ba Lan xưa: những đội hình chồng lớp giữ phòng tuyến trong khi các chỉ huy quan quyết đấu bên trên."
      }
    ),
    lockedChapter(
      "ch3",
      { en: "The Commander's Dao", vi: "Đạo Của Thống Soái" },
      {
        en: "A WOG commander seeks enlightenment at the Enlightenment Stone. Nobody is sure the realms can survive what it comprehends.",
        vi: "Một chỉ huy quan WOG tìm cầu giác ngộ nơi Ngộ Đạo Thạch. Chẳng ai dám chắc các cõi giới chịu nổi điều mà hắn lĩnh hội."
      }
    ),
    lockedChapter(
      "ch4",
      { en: "Bazaar of Ten Thousand Things", vi: "Chợ Phiên Vạn Vật" },
      {
        en: "Outfitters, guild posts, gambling dens and onsen on one trade road — an economy scenario where every shop of every world is open at once.",
        vi: "Tiệm trang bị, trạm thương hội, sòng bạc và cả suối nước nóng trên cùng một con đường thương mại — một chiến dịch kinh tế nơi mọi cửa tiệm của mọi thế giới cùng mở cửa."
      }
    ),
    lockedChapter(
      "ch5",
      { en: "The Tribulation Gauntlet", vi: "Ải Độ Kiếp" },
      {
        en: "Heavenly Tribulation, morale storms and forced battle events stack onto one gauntlet map. Survive it with any build you can assemble.",
        vi: "Thiên kiếp, bão sĩ khí và những trận chiến cưỡng bách chồng chất lên một bản đồ thử luyện. Hãy sống sót bằng bất cứ lối chơi nào ngươi ghép nổi."
      }
    ),
    lockedChapter(
      "ch6",
      { en: "The Rulebreakers", vi: "Những Kẻ Phá Luật" },
      {
        en: "Rival heroes who each mastered a different world's rules meet in one arena. Whoever combines them best writes the next rulebook.",
        vi: "Những anh hùng kình địch, mỗi người tinh thông luật chơi của một thế giới, hội ngộ trong cùng một đấu trường. Ai kết hợp giỏi nhất sẽ viết nên cuốn luật kế tiếp."
      }
    ),
    lockedChapter(
      "ch7",
      { en: "One Board to Hold Them", vi: "Một Bàn Cờ Trọn Vạn Giới" },
      {
        en: "The convergence completes: one final battle with every module, every system and every world in play at once.",
        vi: "Cuộc hội tụ hoàn tất: một trận chiến cuối cùng với mọi mô-đun, mọi hệ thống và mọi thế giới cùng hiện diện."
      }
    )
  ]
};

// -----------------------------------------------------------------------------
// Restoration of Erathia — the first original PC campaign, Long Live the Queen.
// Every scenario is playable, fixed, and backed by a designed board map.
// -----------------------------------------------------------------------------

const ERATHIA_LONG_LIVE_QUEEN: Campaign = {
  id: "erathia",
  theme: "classic",
  title: { en: "Restoration of Erathia", vi: "Phục Hưng Erathia" },
  cover: cover("erathia"),
  tagline: {
    en: "Long Live the Queen — Catherine's first campaign to reclaim her homeland.",
    vi: "Nữ Hoàng Vạn Tuế — chiến dịch đầu tiên của Catherine để giành lại quê hương."
  },
  protagonist: { en: "Queen Catherine Ironfist", vi: "Nữ Hoàng Catherine Ironfist" },
  chapters: [
    {
      id: "homecoming",
      title: { en: "Homecoming", vi: "Ngày Trở Về" },
      synopsis: {
        en: "Establish a base on the occupied coast, rally Erathia's militia, uncover Nighon's invasion road and capture the underground town of Terraneus.",
        vi: "Lập căn cứ trên bờ biển bị chiếm đóng, tập hợp dân quân Erathia, tìm đường xâm lược của Nighon và chiếm thành Terraneus dưới lòng đất."
      },
      objective: { en: "Defeat Terraneus's marked garrison or control 2 towns; then score VP", vi: "Đánh bại đồn trú Terraneus hoặc kiểm soát 2 thành; sau đó tính VP" },
      playable: true,
      briefingArt: erathiaArt("homecoming"),
      mapPosition: { x: 17, y: 72 },
      scenarioMap: ERATHIA_SCENARIO_MAPS.homecoming,
      levelCap: 6,
      heroIds: ["catherine", "rion", "valeska", "lord_haart"],
      startingBonuses: [
        {
          id: "pikemen",
          title: { en: "Militia Muster", vi: "Tập Hợp Dân Quân" },
          effect: { en: "Add one Pack of level-1 Castle troops to the printed opening army.", vi: "Thêm một Pack lính Castle cấp 1 vào quân khởi đầu." },
          preset: { startingUnits: [{ level: 1, side: "pack" }, { level: 1, side: "pack" }, { level: 2, side: "few" }] }
        },
        {
          id: "rare-resources",
          title: { en: "Supply Wagons", vi: "Xe Tiếp Tế" },
          effect: { en: "+8 Gold and +2 Building Materials.", vi: "+8 Vàng và +2 Vật Liệu Xây Dựng." },
          preset: { startingBonuses: [{ kind: "resources", gold: 8, buildingMaterials: 2 }] }
        },
        {
          id: "first-aid",
          title: { en: "Field Chaplain", vi: "Giáo Sĩ Chiến Trường" },
          effect: { en: "+1 Morale and Search 2 Ability cards.", vi: "+1 Morale và Search 2 thẻ Ability." },
          preset: { startingBonuses: [{ kind: "morale", amount: 1 }, { kind: "search", deck: "abilities", count: 2 }] }
        }
      ],
      setup: {
        playerFaction: "castle",
        playerHeroDefId: "catherine",
        opponents: 1,
        difficulty: "easy",
        computerSeats: [{ factionId: "dungeon", heroDefId: "alamar", label: "Nighon occupation — Alamar" }]
      },
      scenes: {
        onStart: "story.erathia.homecoming.intro",
        onVictory: "story.erathia.homecoming.victory",
        onDefeat: "story.erathia.homecoming.defeat"
      }
    },
    {
      id: "guardian-angels",
      title: { en: "Guardian Angels", vi: "Những Thiên Thần Hộ Mệnh" },
      synopsis: {
        en: "Reach Fair Feather and break the Nighon–Kreegan siege. If the rumors are true, the angels protecting the city may join Erathia's cause.",
        vi: "Tiến đến Fair Feather và phá vòng vây Nighon–Kreegan. Nếu tin đồn đúng, các thiên thần bảo vệ thành có thể gia nhập Erathia."
      },
      objective: { en: "Defeat Fair Feather's marked siege army; then score VP", vi: "Đánh bại quân vây hãm được đánh dấu tại Fair Feather; sau đó tính VP" },
      playable: true,
      briefingArt: erathiaArt("guardian-angels"),
      mapPosition: { x: 30, y: 18 },
      scenarioMap: ERATHIA_SCENARIO_MAPS["guardian-angels"],
      levelCap: 12,
      heroIds: ["catherine", "valeska", "rion", "adelaide"],
      startingBonuses: [
        {
          id: "angel",
          title: { en: "Guardian Cadre", vi: "Đội Hộ Vệ" },
          effect: { en: "Add one Few level-4 Castle unit; the Angel remains a mission reward.", vi: "Thêm một đơn vị Few Castle cấp 4; Thiên Thần vẫn là phần thưởng nhiệm vụ." },
          preset: { startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "few" }, { level: 4, side: "few" }] }
        },
        {
          id: "zealots",
          title: { en: "Veteran Zealots", vi: "Zealot Kỳ Cựu" },
          effect: { en: "Add one Few level-5 Castle unit.", vi: "Thêm một đơn vị Few Castle cấp 5." },
          preset: { startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "few" }, { level: 5, side: "few" }] }
        },
        {
          id: "prayer",
          title: { en: "Scroll of Prayer", vi: "Cuộn Phép Prayer" },
          effect: { en: "+1 Morale and Search 2 Spell cards.", vi: "+1 Morale và Search 2 thẻ Spell." },
          preset: { startingBonuses: [{ kind: "morale", amount: 1 }, { kind: "search", deck: "spells", count: 2 }] }
        }
      ],
      setup: {
        playerFaction: "castle",
        playerHeroDefId: "catherine",
        opponents: 1,
        difficulty: "normal",
        computerSeats: [{ factionId: "inferno", heroDefId: "xyron", label: "Nighon–Kreegan siege — Xyron" }]
      },
      scenes: {
        onStart: "story.erathia.guardian-angels.intro",
        onVictory: "story.erathia.guardian-angels.victory",
        onDefeat: "story.erathia.guardian-angels.defeat"
      }
    },
    {
      id: "griffin-cliff",
      title: { en: "Griffin Cliff", vi: "Vách Đá Griffin" },
      synopsis: {
        en: "Liberate all seven Griffin Towers from the combined Nighon and Kreegan occupation before the march on Steadwick.",
        vi: "Giải phóng cả bảy Tháp Griffin khỏi liên quân Nighon và Kreegan trước khi tiến quân đến Steadwick."
      },
      objective: { en: "Flag all 7 Griffin Towers", vi: "Cắm cờ cả 7 Tháp Griffin" },
      playable: true,
      briefingArt: erathiaArt("griffin-cliff"),
      mapPosition: { x: 40, y: 43 },
      scenarioMap: ERATHIA_SCENARIO_MAPS["griffin-cliff"],
      heroIds: ["catherine", "valeska", "rion", "lord_haart", "adelaide"],
      startingBonuses: [
        {
          id: "golden-bow",
          title: { en: "Golden Bow", vi: "Cung Vàng" },
          effect: { en: "Search 2 Artifact cards.", vi: "Search 2 thẻ Artifact." },
          preset: { startingBonuses: [{ kind: "search", deck: "artifacts", count: 2 }] }
        },
        {
          id: "lions-shield",
          title: { en: "Lion's Shield of Courage", vi: "Khiên Sư Tử Dũng Khí" },
          effect: { en: "+1 Morale and Search 1 Artifact.", vi: "+1 Morale và Search 1 Artifact." },
          preset: { startingBonuses: [{ kind: "morale", amount: 1 }, { kind: "search", deck: "artifacts", count: 1 }] }
        },
        {
          id: "sack-of-gold",
          title: { en: "Endless Sack of Gold", vi: "Túi Vàng Bất Tận" },
          effect: { en: "+10 Gold and +2 Building Materials.", vi: "+10 Vàng và +2 Vật Liệu Xây Dựng." },
          preset: { startingBonuses: [{ kind: "resources", gold: 10, buildingMaterials: 2 }] }
        }
      ],
      setup: {
        playerFaction: "castle",
        playerHeroDefId: "catherine",
        opponents: 2,
        difficulty: "normal",
        computerSeats: [
          { factionId: "dungeon", heroDefId: "alamar", label: "Nighon — Alamar" },
          { factionId: "inferno", heroDefId: "xyron", label: "Kreegan — Xyron" }
        ]
      },
      scenes: {
        onStart: "story.erathia.griffin-cliff.intro",
        onVictory: "story.erathia.griffin-cliff.victory",
        onDefeat: "story.erathia.griffin-cliff.defeat"
      }
    },
    {
      id: "road-to-steadwick",
      title: { en: "Road to Steadwick", vi: "Đường Tới Steadwick" },
      synopsis: {
        en: "The griffin legions are assembled, but two enemy relief columns control the river roads. Seize both bridge towns and open the final march to Erathia's capital.",
        vi: "Quân đoàn Griffin đã tập hợp, nhưng hai cánh quân cứu viện của địch kiểm soát các tuyến đường ven sông. Hãy chiếm hai thành cầu và mở đường tiến quân cuối cùng tới kinh đô Erathia."
      },
      objective: { en: "Control 3 towns across the twin banks; then score VP", vi: "Kiểm soát 3 thành dọc hai bờ sông; sau đó tính VP" },
      playable: true,
      briefingArt: erathiaArt("road-to-steadwick-generated", ".png"),
      mapPosition: { x: 49, y: 58 },
      scenarioMap: ERATHIA_SCENARIO_MAPS["road-to-steadwick"],
      levelCap: 18,
      heroIds: ["catherine", "valeska", "rion", "lord_haart", "adelaide"],
      startingBonuses: [
        {
          id: "royal-treasury",
          title: { en: "Royal Treasury", vi: "Ngân Khố Hoàng Gia" },
          effect: { en: "+10 Gold and +2 Building Materials for the river campaign.", vi: "+10 Vàng và +2 Vật Liệu Xây Dựng cho chiến dịch ven sông." },
          preset: { startingBonuses: [{ kind: "resources", gold: 10, buildingMaterials: 2 }] }
        },
        {
          id: "griffin-vanguard",
          title: { en: "Griffin Vanguard", vi: "Tiền Quân Griffin" },
          effect: { en: "Add one Few level-4 Castle unit.", vi: "Thêm một đơn vị Few Castle cấp 4." },
          preset: { startingUnits: [{ level: 1, side: "pack" }, { level: 3, side: "pack" }, { level: 4, side: "few" }, { level: 5, side: "few" }] }
        },
        {
          id: "scouts-map",
          title: { en: "Scouts' Map", vi: "Bản Đồ Trinh Sát" },
          effect: { en: "+1 Morale and Search 2 Abilities.", vi: "+1 Morale và Search 2 Ability." },
          preset: { startingBonuses: [{ kind: "morale", amount: 1 }, { kind: "search", deck: "abilities", count: 2 }] }
        }
      ],
      setup: {
        playerFaction: "castle",
        playerHeroDefId: "catherine",
        opponents: 2,
        difficulty: "normal",
        computerSeats: [
          { factionId: "dungeon", heroDefId: "mutare", label: "Nighon river host — Mutare" },
          { factionId: "inferno", heroDefId: "rashka", label: "Kreegan relief column — Rashka" }
        ]
      },
      scenes: {
        onStart: "story.erathia.road-to-steadwick.intro",
        onVictory: "story.erathia.road-to-steadwick.victory",
        onDefeat: "story.erathia.road-to-steadwick.defeat"
      }
    },
    {
      id: "liberation-day",
      title: { en: "Liberation Day", vi: "Ngày Giải Phóng" },
      synopsis: {
        en: "Steadwick is encircled by Nighon and the undead court that betrayed King Gryphonheart. Break the siege ring, storm the capital, and raise Catherine's standard above the palace.",
        vi: "Steadwick bị bao vây bởi Nighon và triều đình undead đã phản bội Vua Gryphonheart. Hãy phá vòng vây, công phá kinh đô và dựng cờ Catherine trên cung điện."
      },
      objective: { en: "Defeat Steadwick's marked garrison or control 3 towns; then score VP", vi: "Đánh bại đồn trú Steadwick hoặc kiểm soát 3 thành; sau đó tính VP" },
      playable: true,
      briefingArt: erathiaArt("liberation-day-generated", ".png"),
      mapPosition: { x: 58, y: 53 },
      scenarioMap: ERATHIA_SCENARIO_MAPS["liberation-day"],
      levelCap: 24,
      heroIds: ["catherine", "lord_haart", "adelaide", "valeska", "rion"],
      startingBonuses: [
        {
          id: "angel-host",
          title: { en: "Royal Guard", vi: "Cận Vệ Hoàng Gia" },
          effect: { en: "Add one Few level-5 Castle unit; no free level-7 stack.", vi: "Thêm một đơn vị Few Castle cấp 5; không có stack cấp 7 miễn phí." },
          preset: { startingUnits: [{ level: 2, side: "pack" }, { level: 4, side: "pack" }, { level: 5, side: "few" }, { level: 6, side: "few" }] }
        },
        {
          id: "siege-train",
          title: { en: "Siege Train", vi: "Đoàn Công Thành" },
          effect: { en: "+4 Building Materials and Search 2 Abilities.", vi: "+4 Vật Liệu Xây Dựng và Search 2 Ability." },
          preset: { startingBonuses: [{ kind: "resources", buildingMaterials: 4 }, { kind: "search", deck: "abilities", count: 2 }] }
        },
        {
          id: "crown-of-courage",
          title: { en: "Crown of Courage", vi: "Vương Miện Dũng Khí" },
          effect: { en: "+1 Morale and Search 2 Artifacts.", vi: "+1 Morale và Search 2 Artifact." },
          preset: { startingBonuses: [{ kind: "morale", amount: 1 }, { kind: "search", deck: "artifacts", count: 2 }] }
        }
      ],
      setup: {
        playerFaction: "castle",
        playerHeroDefId: "catherine",
        opponents: 2,
        difficulty: "hard",
        computerSeats: [
          { factionId: "necropolis", heroDefId: "sandro", label: "The traitor court — Sandro" },
          { factionId: "dungeon", heroDefId: "deemer", label: "Nighon siege command — Deemer" }
        ]
      },
      scenes: {
        onStart: "story.erathia.liberation-day.intro",
        onVictory: "story.erathia.liberation-day.victory",
        onDefeat: "story.erathia.liberation-day.defeat"
      }
    },
    {
      id: "throne-of-ash",
      title: { en: "Throne of Ash", vi: "Ngai Tro Tàn" },
      synopsis: {
        en: "Steadwick is free, yet the invasion survives behind the Ash Gate. Lead the royal host into the scorched southeast, destroy the final war-engine, and take the Black Citadel.",
        vi: "Steadwick đã tự do, nhưng cuộc xâm lược vẫn tồn tại sau Cổng Tro. Hãy dẫn hoàng quân vào vùng đông nam cháy xém, phá hủy chiến cụ cuối cùng và chiếm Hắc Thành."
      },
      objective: { en: "Defeat the Utopia, then the marked Black Citadel army; highest VP wins", vi: "Đánh bại Utopia rồi quân Hắc Thành được đánh dấu; VP cao nhất thắng" },
      playable: true,
      briefingArt: erathiaArt("throne-of-ash-generated", ".png"),
      mapPosition: { x: 66, y: 80 },
      scenarioMap: ERATHIA_SCENARIO_MAPS["throne-of-ash"],
      heroIds: ["catherine", "adelaide", "valeska", "rion", "lord_haart"],
      startingBonuses: [
        {
          id: "royal-legion",
          title: { en: "Royal Legion", vi: "Quân Đoàn Hoàng Gia" },
          effect: { en: "Add one Few level-6 Castle unit to the final army.", vi: "Thêm một đơn vị Few Castle cấp 6 vào đạo quân cuối." },
          preset: { startingUnits: [{ level: 3, side: "pack" }, { level: 5, side: "pack" }, { level: 6, side: "few" }, { level: 7, side: "few" }] }
        },
        {
          id: "grail-treasury",
          title: { en: "Grail Treasury", vi: "Kho Báu Grail" },
          effect: { en: "+12 Gold and +2 Valuables.", vi: "+12 Vàng và +2 Tài Nguyên Quý." },
          preset: { startingBonuses: [{ kind: "resources", gold: 12, valuables: 2 }] }
        },
        {
          id: "blessed-armory",
          title: { en: "Blessed Armory", vi: "Kho Vũ Khí Ban Phước" },
          effect: { en: "Search 2 Artifacts and 2 Spells.", vi: "Search 2 Artifact và 2 Spell." },
          preset: { startingBonuses: [{ kind: "search", deck: "artifacts", count: 2 }, { kind: "search", deck: "spells", count: 2 }] }
        }
      ],
      setup: {
        playerFaction: "castle",
        playerHeroDefId: "catherine",
        opponents: 2,
        difficulty: "hard",
        computerSeats: [
          { factionId: "inferno", heroDefId: "zydar", label: "Ash Gate legion — Zydar" },
          { factionId: "dungeon", heroDefId: "alamar", label: "Black Citadel guard — Alamar" }
        ]
      },
      scenes: {
        onStart: "story.erathia.throne-of-ash.intro",
        onVictory: "story.erathia.throne-of-ash.victory",
        onDefeat: "story.erathia.throne-of-ash.defeat"
      }
    }
  ]
};

// -----------------------------------------------------------------------------
// Registry.
// -----------------------------------------------------------------------------

// Restoration of Erathia leads the hub — the classic board-game campaign is the
// front door to Story mode; the anime/crossover campaigns follow.
export const CAMPAIGNS: readonly Campaign[] = [ERATHIA_LONG_LIVE_QUEEN, JIANGHU, BIN, CONVERGENCE];

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
 * The room-creation options a chapter maps to. Pure — no side effects.
 * `opponents` sizes the minted room; `playerFaction` / `difficulty` /
 * `fieldOverrides` / `anime` are injected into the room's game options + seat
 * after join (`campaignSetupActions`). Returns null for a chapter with no
 * `setup` (a locked chapter).
 */
export type ChapterRoomOptions = {
  opponents: number;
  playerFaction: FactionId;
  playerHeroDefId?: string;
  computerSeats?: Array<{ factionId: FactionId; heroDefId: string; label: string }>;
  difficulty?: GameDifficulty;
  /** Global Field Override system toggle. */
  fieldOverrides: boolean;
  /** Fully-resolved anime options (defaults merged with the chapter's partial). */
  anime: AnimeModOptions;
  /** Fully-resolved WOG modules to inject (absent = untouched defaults). */
  wog?: WogModOptions;
  /** House-rule toggles to inject (absent = untouched defaults). */
  houseRules?: Partial<Record<HouseRuleId, boolean>>;
  customMap?: CustomMapTilePlan[];
  customMapName?: string;
  customMapPreset?: CustomMapPreset;
};

export function chapterRoomOptions(chapter: CampaignChapter, bonusId?: string): ChapterRoomOptions | null {
  const setup = chapter.setup;
  if (!setup) {
    return null;
  }
  const bonus = chapter.startingBonuses?.find((candidate) => candidate.id === bonusId)
    ?? chapter.startingBonuses?.[0];
  const basePreset = chapter.scenarioMap?.preset;
  const customMapPreset = basePreset
    ? {
        ...basePreset,
        ...(bonus?.preset ?? {}),
        ...(basePreset.startingBonuses || bonus?.preset.startingBonuses
          ? { startingBonuses: [...(basePreset.startingBonuses ?? []), ...(bonus?.preset.startingBonuses ?? [])] }
          : {})
      }
    : undefined;
  return {
    opponents: setup.opponents,
    playerFaction: setup.playerFaction,
    ...(setup.playerHeroDefId ? { playerHeroDefId: setup.playerHeroDefId } : {}),
    ...(setup.computerSeats ? { computerSeats: setup.computerSeats } : {}),
    ...(setup.difficulty ? { difficulty: setup.difficulty } : {}),
    fieldOverrides: Boolean(setup.fieldOverrides),
    anime: resolveAnimeOptions(setup.anime ?? null),
    // GameSetupOptions.wog wants the FULL module record — resolve the partial
    // against the defaults (the anime twin of resolveAnimeOptions).
    ...(setup.wog ? { wog: { ...DEFAULT_WOG_OPTIONS, ...setup.wog } } : {}),
    ...(setup.houseRules ? { houseRules: setup.houseRules } : {}),
    ...(chapter.scenarioMap
      ? {
          customMap: chapter.scenarioMap.tiles,
          customMapName: chapter.scenarioMap.name,
          customMapPreset
        }
      : {})
  };
}
