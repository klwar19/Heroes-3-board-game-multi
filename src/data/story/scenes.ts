/**
 * Visual-novel STORY SYSTEM — shared scene data model + registry (Anime mod
 * §11 / §3.2). Package-agnostic: both theme packages (Ninefold Realms /
 * xianxia and Otherworld Gate / isekai) and the map designer feed scenes
 * through the SAME `StoryOverlay`.
 *
 * FOUNDATION SLICE — what this file is and is NOT:
 *  - It ships the data shapes, a registry, and 2 demo scenes (one per theme)
 *    that double as sample content AND the test fixtures.
 *  - It deliberately carries NO trigger metadata (campaign `on_start` /
 *    `on_victory` hooks) and NO karma/fate/flag deltas on choices. The destiny
 *    substrate is unshipped; the campaign step will add the trigger scaffolding
 *    AROUND scenes (a separate campaign registry), never inside these shapes.
 *
 * Bilingual EN/VI by construction — every player-visible string carries both a
 * `.en` and a `.vi`, enforced by `scenes.test.ts`.
 *
 * ART-LATER CONTRACT (mirrors `FIELD_OVERRIDE_ART_PLACEHOLDERS` in
 * `src/data/anime/field-overrides.ts`): sprite/background references are paths
 * under `/assets/story/...`. No story art exists on disk yet, so every
 * referenced asset is declared in {@link STORY_ART_PLACEHOLDERS}. The overlay
 * renders gracefully without the files: a placeholder background falls back to
 * a theme-tinted gradient, a placeholder sprite to an initial-letter avatar
 * chip (never a broken <img>). When real art lands: drop the `.webp` under
 * `public/assets/story/...` and remove its path from the placeholder set.
 */

/** A named speaker (bilingual) or the special "narrator" (no nameplate). */
export type StorySpeaker = { en: string; vi: string } | "narrator";

export type StoryLine = {
  speaker: StorySpeaker;
  /** Path under /assets/story/sprites/... — declared in STORY_ART_PLACEHOLDERS until art lands. */
  sprite?: string;
  /** Free-form expression hint (e.g. "smile"), reserved for future sprite variants. */
  expression?: string;
  /** Which sprite slot the speaker occupies. Defaults to "left". */
  side?: "left" | "right";
  text: { en: string; vi: string };
};

export type StoryChoice = {
  text: { en: string; vi: string };
  /** Continue into this scene in the SAME overlay session. Absent = end (onDone). */
  nextSceneId?: string;
};

export type StoryScene = {
  id: string;
  /** Styling hint — ink-wash chrome vs. anime dialogue-box chrome. */
  theme?: "xianxia" | "isekai";
  /** Path under /assets/story/backgrounds/... — declared in STORY_ART_PLACEHOLDERS until art lands. */
  background?: string;
  lines: StoryLine[];
  choices?: StoryChoice[];
};

const bg = (slug: string) => `/assets/story/backgrounds/${slug}.webp`;
const sprite = (slug: string) => `/assets/story/sprites/${slug}.webp`;

// -----------------------------------------------------------------------------
// DEMO scenes — usable sample content AND the test fixtures. One xianxia, one
// isekai; the xianxia scene ends on a 2-way choice, one arm chaining into a
// tiny follow-up scene via nextSceneId.
// -----------------------------------------------------------------------------

const CHEN_FAN: StorySpeaker = { en: "Chen Fan", vi: "Trần Phàm" };
const AZURE_ELDER: StorySpeaker = { en: "Sect Elder", vi: "Tông Lão" };
const THE_SYSTEM: StorySpeaker = { en: "The System", vi: "Hệ Thống" };
const HIKARI: StorySpeaker = { en: "Hikari", vi: "Hikari" };
const BIN: StorySpeaker = { en: "Bin", vi: "Bin" };
const GUILD_GIRL: StorySpeaker = { en: "Guild Girl", vi: "Tiếp Tân Hội" };

const DEMO_SCENES: StoryScene[] = [
  {
    id: "story.demo.xianxia",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "On the peak of Azure Cloud, the morning mist has yet to lift.",
          vi: "Trên đỉnh Thanh Vân, sương sớm vẫn chưa tan."
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        expression: "resolute",
        text: {
          en: "So this is cultivation — a dying disciple's body, and a world that runs on qi.",
          vi: "Vậy ra đây chính là tu tiên — thân xác một đệ tử hấp hối, giữa thế giới vận hành bằng linh khí."
        }
      },
      {
        speaker: AZURE_ELDER,
        sprite: sprite("azure-elder"),
        side: "right",
        text: {
          en: "Disciple Chen Fan. The Sword Trial begins at dawn. Will you walk the orthodox path — or forge your own?",
          vi: "Đệ tử Trần Phàm. Kiếm Thí sẽ bắt đầu lúc rạng đông. Ngươi đi theo chính đạo — hay tự mở lối riêng?"
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        text: {
          en: "I have read this story a hundred times. This time, I write the ending.",
          vi: "Câu chuyện này ta đã đọc trăm lần. Lần này, kết cục do chính tay ta viết."
        }
      }
    ],
    choices: [
      {
        text: {
          en: "Vow to uphold the orthodox path.",
          vi: "Thề giữ vững chính đạo."
        },
        nextSceneId: "story.demo.xianxia.oath"
      },
      {
        text: {
          en: "Say nothing, and grip the sword.",
          vi: "Lặng thinh, siết chặt chuôi kiếm."
        }
      }
    ]
  },
  {
    // Tiny follow-up reached from the xianxia scene's first choice.
    id: "story.demo.xianxia.oath",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: AZURE_ELDER,
        sprite: sprite("azure-elder"),
        side: "right",
        text: {
          en: "Then let Heaven and Earth bear witness.",
          vi: "Vậy thì để Trời Đất chứng giám."
        }
      },
      {
        speaker: "narrator",
        text: {
          en: "A vow sworn on the peak echoes across the Ninefold Realms.",
          vi: "Một lời thề trên đỉnh núi vọng khắp Cửu Giới."
        }
      }
    ]
  },
  {
    id: "story.demo.isekai",
    theme: "isekai",
    background: bg("dawn-gate"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The Dawn Gate flares. A summoning older than the Accord tears the sky.",
          vi: "Cổng Bình Minh bùng sáng. Một nghi thức triệu hồi cổ xưa hơn cả Thần Ước xé toạc bầu trời."
        }
      },
      {
        speaker: HIKARI,
        sprite: sprite("hikari"),
        side: "left",
        text: {
          en: "Welcome, Bin. I am Hikari, Goddess of the Dawn Gate. My realm is dying — and you are my last gamble.",
          vi: "Chào mừng, Bin. Ta là Hikari, Nữ Thần Cổng Bình Minh. Vương quốc của ta đang lụi tàn — và ngươi là canh bạc cuối cùng của ta."
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        expression: "wry",
        text: {
          en: "A goddess, a game world, and a status screen floating in my vision. Fine — I can work with a cheat menu.",
          vi: "Một nữ thần, một thế giới game, và bảng trạng thái lơ lửng trước mắt. Được thôi — ta xoay xở được với một menu gian lận."
        }
      },
      {
        speaker: HIKARI,
        sprite: sprite("hikari"),
        side: "left",
        text: {
          en: "Then take my blessing, Champion — and make them regret opening the Gate.",
          vi: "Vậy hãy nhận lấy ân sủng của ta, Dũng Sĩ — và khiến chúng phải hối hận vì đã mở Cổng."
        }
      }
    ]
  }
];

// -----------------------------------------------------------------------------
// CAMPAIGN CHAPTER-1 scenes (Anime mod §12). Both campaigns' Chapter 1 is
// playable, so each carries an intro (6–10 lines, at least one choice), a
// victory scene and a defeat scene, referenced from `src/data/story/campaigns.ts`.
// Xianxia register for the Jianghu Chronicle (Chen Fan / The System); the warmer
// anime/isekai register for Bin's Chronicle (Bin / Hikari / Guild Girl).
// -----------------------------------------------------------------------------

const CH1_SCENES: StoryScene[] = [
  // --- Jianghu Chronicle, Chapter 1: "Awakening" ---------------------------
  {
    id: "story.jianghu.ch1.intro",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The Sword Trial dawns over Azure Cloud Peak. The outer disciples gather, breath held, blades cold in the mist.",
          vi: "Kiếm Thí rạng sáng trên đỉnh Thanh Vân. Ngoại môn đệ tử tụ lại, nín thở, lưỡi kiếm lạnh giá trong màn sương."
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        expression: "resolute",
        text: {
          en: "I died at my desk and woke on a mountain of immortals. This borrowed body is failing — but the mind inside it is still mine.",
          vi: "Ta chết gục bên bàn làm việc rồi tỉnh dậy giữa một ngọn núi của tiên nhân. Thân xác mượn tạm này đang suy tàn — nhưng thần trí bên trong vẫn là của ta."
        }
      },
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ System online. Host: Chen Fan. Objective: survive the Sword Trial. Reward: a foothold in the Ninefold Realms. ]",
          vi: "[ Hệ Thống trực tuyến. Ký chủ: Trần Phàm. Mục tiêu: sống sót qua Kiếm Thí. Phần thưởng: một chỗ đứng giữa Cửu Giới. ]"
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        text: {
          en: "A status window. Of course there's a status window. Fine — I have ground through worse tutorials than this.",
          vi: "Một bảng trạng thái. Quả nhiên là có bảng trạng thái. Được thôi — ta từng cày qua những màn hướng dẫn còn tệ hơn thế này."
        }
      },
      {
        speaker: AZURE_ELDER,
        sprite: sprite("azure-elder"),
        side: "right",
        text: {
          en: "Disciple Chen Fan. You are the frailest of your cohort, and the last to be called. Prove the sect did not waste its rice raising you.",
          vi: "Đệ tử Trần Phàm. Ngươi yếu nhược nhất trong khóa, lại là kẻ được gọi tên sau chót. Hãy chứng minh bản tông không phí gạo nuôi ngươi."
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        expression: "wry",
        text: {
          en: "Frailest today, Elder. Keep an eye on the leaderboard.",
          vi: "Hôm nay yếu nhất, thưa Tông Lão. Cứ dõi theo bảng xếp hạng đi."
        }
      },
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ First quest issued: claim the peak. Move your hero, defeat what guards the mountain, and build your strength. The System is watching. ]",
          vi: "[ Nhiệm vụ đầu tiên: chiếm lấy đỉnh núi. Điều khiển anh hùng, đánh bại kẻ trấn giữ ngọn núi, và bồi đắp thực lực. Hệ Thống đang dõi theo. ]"
        }
      },
      {
        speaker: "narrator",
        text: {
          en: "The mist parts. Somewhere below the cloud line, an enemy banner rises against the dawn.",
          vi: "Màn sương rẽ ra. Đâu đó dưới tầng mây, một lá cờ địch dựng lên giữa ánh bình minh."
        }
      }
    ],
    choices: [
      {
        text: {
          en: "Vow to walk the orthodox path.",
          vi: "Thề đi theo chính đạo."
        },
        nextSceneId: "story.jianghu.ch1.intro.vow"
      },
      {
        text: {
          en: "Say nothing. Let the sword answer.",
          vi: "Lặng thinh. Để thanh kiếm lên tiếng."
        }
      }
    ]
  },
  {
    id: "story.jianghu.ch1.intro.vow",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: AZURE_ELDER,
        sprite: sprite("azure-elder"),
        side: "right",
        text: {
          en: "Then let Heaven and Earth bear witness to your vow, disciple. See that you keep it.",
          vi: "Vậy thì để Trời Đất chứng giám lời thề của ngươi, đệ tử. Nhớ giữ trọn lấy nó."
        }
      },
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "left",
        text: {
          en: "[ Path noted: orthodox. The System remembers every choice. Now — take the peak. ]",
          vi: "[ Đã ghi nhận: chính đạo. Hệ Thống ghi nhớ mọi lựa chọn. Giờ thì — hãy chiếm lấy đỉnh núi. ]"
        }
      }
    ]
  },
  {
    id: "story.jianghu.ch1.victory",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The enemy banner falls. The peak of Azure Cloud is yours.",
          vi: "Lá cờ địch đổ xuống. Đỉnh Thanh Vân đã thuộc về ngươi."
        }
      },
      {
        speaker: AZURE_ELDER,
        sprite: sprite("azure-elder"),
        side: "right",
        text: {
          en: "The frailest disciple takes the mountain before any other. The sect... will remember this day.",
          vi: "Kẻ đệ tử yếu nhược nhất lại chiếm núi trước mọi người. Bản tông... sẽ ghi nhớ ngày hôm nay."
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        text: {
          en: "One foothold down. Nine realms to go.",
          vi: "Xong một chỗ đứng. Còn cả Cửu Giới phía trước."
        }
      },
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ Chapter cleared. Foundation Establishment within reach. The next road opens: the Valley. ]",
          vi: "[ Hoàn thành chương. Cảnh giới Trúc Cơ đã cận kề. Con đường kế tiếp mở ra: Sơn Cốc. ]"
        }
      }
    ]
  },
  {
    id: "story.jianghu.ch1.defeat",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "Your qi scatters on the wind. The peak slips from your grasp.",
          vi: "Linh khí của ngươi tan vào gió. Đỉnh núi tuột khỏi tay."
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        text: {
          en: "Not dead. Just... reset to the last checkpoint. I have done this before.",
          vi: "Chưa chết. Chỉ là... quay về điểm lưu gần nhất. Chuyện này ta từng làm rồi."
        }
      },
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ Trial failed. The System is patient. Rise, temper yourself, and try the peak again. ]",
          vi: "[ Thử thách thất bại. Hệ Thống rất kiên nhẫn. Hãy đứng dậy, tôi luyện, và thử lại đỉnh núi. ]"
        }
      }
    ]
  },
  // --- Bin's Otherworld Chronicle, Chapter 1: "Summoned at Dawn" ------------
  {
    id: "story.bin.ch1.intro",
    theme: "isekai",
    background: bg("dawn-gate"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The Dawn Gate flares shut behind Bin, leaving him at a muddy Restia crossroads — with a floating menu only he can see.",
          vi: "Cổng Bình Minh lóe lên rồi khép lại sau lưng Bin, bỏ hắn giữa ngã tư lầy lội đất Restia — cùng một bảng menu lơ lửng mà chỉ mình hắn thấy."
        }
      },
      {
        speaker: HIKARI,
        sprite: sprite("hikari"),
        side: "left",
        text: {
          en: "Champion! I, Hikari, Goddess of the Dawn Gate, grant you— ...ah. That was the very last of my divinity. I'm... quite broke now. Sorry.",
          vi: "Dũng Sĩ! Ta, Hikari, Nữ Thần Cổng Bình Minh, ban cho ngươi— ...ơ. Đó là chút thần lực cuối cùng của ta. Ta... giờ rỗng túi thật rồi. Xin lỗi nhé."
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        expression: "wry",
        text: {
          en: "A goddess who blew her entire budget on the summon. Honestly? Most relatable deity I've ever met.",
          vi: "Một nữ thần nướng sạch ngân sách chỉ để triệu hồi. Thành thật mà nói? Đây là vị thần dễ đồng cảm nhất ta từng gặp."
        }
      },
      {
        speaker: HIKARI,
        sprite: sprite("hikari"),
        side: "left",
        text: {
          en: "R-rude! I gave you admin access! ...Which mostly means the world runs like a board game, and you can read its rules. Small print, enormous power.",
          vi: "V-vô lễ! Ta đã trao ngươi quyền quản trị đấy! ...Mà nói cho cùng thì thế giới này vận hành như một ván cờ bàn, còn ngươi thì đọc được luật chơi của nó. Dòng chữ nhỏ, quyền năng khổng lồ."
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        text: {
          en: "A board game. My board game. Okay. I know this game. I can absolutely break this game.",
          vi: "Một ván cờ bàn. Đúng ván cờ của ta. Được. Ta thuộc trò này. Ta thừa sức phá đảo trò này."
        }
      },
      {
        speaker: GUILD_GIRL,
        sprite: sprite("guild-girl"),
        side: "left",
        text: {
          en: "Welcome to the Adventurers' Guild! New face? Sign here, rank F. And please — please — take the goblin warnings seriously.",
          vi: "Chào mừng đến Hội Mạo Hiểm Giả! Người mới à? Ký vào đây, hạng F. Và xin ngươi — làm ơn — hãy xem những lời cảnh báo về quỷ lùn cho nghiêm túc."
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        text: {
          en: "Everyone keeps saying that. How bad can a goblin possibly be?",
          vi: "Ai cũng nói câu đó. Một con quỷ lùn thì tệ đến mức nào được chứ?"
        }
      },
      {
        speaker: GUILD_GIRL,
        sprite: sprite("guild-girl"),
        side: "left",
        text: {
          en: "...That is exactly what the last rank-F said. Here is your first commission. Come back alive, please.",
          vi: "...Kẻ hạng F trước cũng nói y hệt vậy. Đây là nhiệm vụ đầu tiên của ngươi. Làm ơn, hãy trở về còn sống."
        }
      }
    ],
    choices: [
      {
        text: {
          en: "Sign the register and take the commission.",
          vi: "Ký vào sổ và nhận nhiệm vụ."
        }
      },
      {
        text: {
          en: "Ask Hikari if \"admin access\" comes with a refund.",
          vi: "Hỏi Hikari xem \"quyền quản trị\" có được hoàn tiền không."
        }
      }
    ]
  },
  {
    id: "story.bin.ch1.victory",
    theme: "isekai",
    background: bg("dawn-gate"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The goblin cave goes quiet. Every last one accounted for — exactly as the warnings insisted you make sure.",
          vi: "Hang quỷ lùn chìm vào im lặng. Không sót một con nào — đúng như lời cảnh báo đã một mực dặn ngươi phải chắc chắn."
        }
      },
      {
        speaker: GUILD_GIRL,
        sprite: sprite("guild-girl"),
        side: "left",
        text: {
          en: "You... actually cleared it. Cleanly, too. Maybe you'll last around here after all.",
          vi: "Ngươi... dọn sạch thật rồi. Mà còn gọn gàng nữa. Xem ra ngươi trụ lại được ở đây thật đấy."
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        text: {
          en: "Turns out \"trivial mob\" plus \"never underestimate them\" equals free experience — if you respect the mechanics.",
          vi: "Hóa ra \"quái tầm thường\" cộng với \"đừng bao giờ coi thường\" thì bằng kinh nghiệm miễn phí — miễn là ngươi tôn trọng cơ chế của trò chơi."
        }
      },
      {
        speaker: HIKARI,
        sprite: sprite("hikari"),
        side: "left",
        text: {
          en: "See? My champion! ...Does the guild happen to pay in food? I haven't eaten since the Accord.",
          vi: "Thấy chưa? Dũng Sĩ của ta! ...Mà Hội có trả công bằng đồ ăn không nhỉ? Ta chưa ăn gì kể từ thời Thần Ước."
        }
      }
    ]
  },
  {
    id: "story.bin.ch1.defeat",
    theme: "isekai",
    background: bg("dawn-gate"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The commission goes sideways. Bin limps back through the Gate-lit dark, empty-handed.",
          vi: "Nhiệm vụ đổ bể. Bin khập khiễng lê bước trở về trong bóng tối le lói ánh Cổng, tay trắng."
        }
      },
      {
        speaker: HIKARI,
        sprite: sprite("hikari"),
        side: "left",
        text: {
          en: "You're alive! That's — that's the important part. Admin access does not include a respawn, so, um, let's be careful out there.",
          vi: "Ngươi còn sống! Đó — đó mới là điều quan trọng. Quyền quản trị không kèm hồi sinh đâu, nên là, ừm, ra ngoài phải cẩn thận đấy."
        }
      },
      {
        speaker: GUILD_GIRL,
        sprite: sprite("guild-girl"),
        side: "left",
        text: {
          en: "The commission board resets each dawn. Rest, re-equip, and try again, rank F.",
          vi: "Bảng nhiệm vụ làm mới mỗi rạng đông. Nghỉ ngơi, sắm sửa lại, rồi thử lần nữa, hạng F."
        }
      }
    ]
  }
];

const ALL_SCENES: StoryScene[] = [...DEMO_SCENES, ...CH1_SCENES];

export const storySceneRegistry: Record<string, StoryScene> = Object.fromEntries(
  ALL_SCENES.map((scene) => [scene.id, scene])
);

/** Registered scene ids, in registry order (editor dropdown / defaults). */
export const STORY_SCENE_IDS: readonly string[] = ALL_SCENES.map((scene) => scene.id);

export function getStoryScene(id: string): StoryScene | undefined {
  return storySceneRegistry[id];
}

export function isStoryScene(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(storySceneRegistry, id);
}

export function listStoryScenes(): StoryScene[] {
  return STORY_SCENE_IDS.map((id) => storySceneRegistry[id]);
}

/**
 * Every sprite/background referenced by any registered scene. The single source
 * of truth the overlay reads to decide "art or fallback" at runtime, and the
 * integrity test cross-checks against disk.
 */
export function referencedStoryAssets(): string[] {
  const assets = new Set<string>();
  for (const scene of ALL_SCENES) {
    if (scene.background) {
      assets.add(scene.background);
    }
    for (const line of scene.lines) {
      if (line.sprite) {
        assets.add(line.sprite);
      }
    }
  }
  return [...assets];
}

/**
 * Referenced assets that ship WITHOUT a file on disk yet (drop-art-later
 * contract). Each MUST be referenced by some scene AND absent from disk;
 * `scenes.test.ts` fails if a declared path gains a file, names a path no scene
 * references, or if any referenced asset is neither on disk nor declared here.
 * When real art lands: drop the `.webp` under `public/assets/story/...` and
 * remove its path from this set. The overlay treats a path in this set as
 * "no art" (theme-gradient background / initial-letter sprite avatar).
 */
export const STORY_ART_PLACEHOLDERS: ReadonlySet<string> = new Set([
  bg("azure-peak"),
  bg("dawn-gate"),
  sprite("chen-fan"),
  sprite("azure-elder"),
  sprite("system"),
  sprite("hikari"),
  sprite("bin"),
  sprite("guild-girl")
]);

/** True when this asset path has no file on disk yet (use the fallback). */
export function storyAssetIsPlaceholder(path: string): boolean {
  return STORY_ART_PLACEHOLDERS.has(path);
}

/** Resolve a speaker's display name in the chosen language ("narrator" → null). */
export function storySpeakerName(speaker: StorySpeaker, lang: "en" | "vi"): string | null {
  return speaker === "narrator" ? null : speaker[lang];
}
