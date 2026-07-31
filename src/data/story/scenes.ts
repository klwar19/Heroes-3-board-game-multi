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
  /** Styling hint — ink-wash / anime / classic painted dialogue-box chrome. */
  theme?: "xianxia" | "isekai" | "classic";
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
const CATHERINE: StorySpeaker = { en: "Queen Catherine", vi: "Nữ Hoàng Catherine" };
const KENDAL: StorySpeaker = { en: "General Kendal", vi: "Tướng Quân Kendal" };

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
  },
  // --- Restoration of Erathia (classic), Chapter 1: "The Landing" -----------
  {
    id: "story.erathia.ch1.intro",
    theme: "classic",
    background: bg("erathia-shore"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "At first light the royal fleet grinds ashore on the coast of Erathia. Smoke stains the horizon where border towns used to stand.",
          vi: "Khi trời vừa hửng sáng, hạm đội hoàng gia nghiến cát cập bờ Erathia. Khói hoen chân trời, nơi những thị trấn biên cương từng tọa lạc."
        }
      },
      {
        speaker: CATHERINE,
        sprite: sprite("catherine"),
        side: "left",
        text: {
          en: "I left a kingdom. I return to a graveyard of banners. Whoever did this will answer for every one of them.",
          vi: "Ta rời đi từ một vương quốc. Ta trở về giữa nghĩa trang của những lá cờ. Kẻ nào gây ra chuyện này sẽ phải trả giá cho từng lá cờ một."
        }
      },
      {
        speaker: KENDAL,
        sprite: sprite("kendal"),
        side: "right",
        text: {
          en: "The garrisons are scattered, Majesty, not broken. Give them a beachhead town and a griffin banner to look at, and they will come.",
          vi: "Thưa Bệ Hạ, các đồn binh chỉ tan tác chứ chưa tan vỡ. Hãy cho họ một thị trấn đầu cầu và một lá cờ sư điểu để ngước nhìn, họ sẽ kéo về."
        }
      },
      {
        speaker: CATHERINE,
        sprite: sprite("catherine"),
        side: "left",
        text: {
          en: "Then we build, General. Raise the town, rally every blade on this coast — and take back the first mile of Erathia.",
          vi: "Vậy thì ta dựng nghiệp, Tướng Quân. Dựng thị trấn, tập hợp mọi lưỡi kiếm trên bờ biển này — và giành lại dặm đất đầu tiên của Erathia."
        }
      }
    ]
  },
  {
    id: "story.erathia.ch1.victory",
    theme: "classic",
    background: bg("erathia-shore"),
    lines: [
      {
        speaker: KENDAL,
        sprite: sprite("kendal"),
        side: "right",
        text: {
          en: "The coast is ours, Majesty. The garrisons march under the griffin again — and the road inland lies open.",
          vi: "Bờ biển đã về tay ta, thưa Bệ Hạ. Các đồn binh lại hành quân dưới cờ sư điểu — và con đường vào nội địa đã rộng mở."
        }
      },
      {
        speaker: CATHERINE,
        sprite: sprite("catherine"),
        side: "left",
        text: {
          en: "One mile of Erathia, restored. Rest the men tonight, General. Tomorrow we raise the banners on the border marches.",
          vi: "Một dặm đất Erathia đã phục hưng. Đêm nay cho quân sĩ nghỉ ngơi, Tướng Quân. Ngày mai ta dựng cờ nơi biên cương."
        }
      }
    ]
  },
  {
    id: "story.erathia.ch1.defeat",
    theme: "classic",
    background: bg("erathia-shore"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The beachhead falls. Under cover of dark the boats pull back to the fleet, and the coast burns on without its Queen.",
          vi: "Đầu cầu thất thủ. Nương theo màn đêm, những chiếc thuyền rút về hạm đội, và bờ biển tiếp tục rực cháy vắng bóng nữ hoàng."
        }
      },
      {
        speaker: CATHERINE,
        sprite: sprite("catherine"),
        side: "left",
        text: {
          en: "Mourn tonight. At dawn we land again — Erathia has waited long enough for us; it can be avenged only by those who return.",
          vi: "Đêm nay cứ tiếc thương. Rạng đông ta lại đổ bộ — Erathia đã đợi chúng ta quá lâu; chỉ những kẻ quay về mới báo thù được cho nó."
        }
      }
    ]
  },
  // --- The Grand Convergence (crossover), Chapter 1: "Where Worlds Overlap" -
  {
    id: "story.convergence.ch1.intro",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The mist over Azure Cloud parts — onto castle plains that were never there before. The realms are folding into one board.",
          vi: "Màn sương trên Thanh Vân rẽ ra — để lộ những bình nguyên thành quách chưa từng tồn tại nơi đây. Các cõi giới đang gập vào cùng một bàn cờ."
        }
      },
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ Convergence detected. All rule modules loaded: cultivation, grades, equipment, commanders, stacked legions. Good luck. ]",
          vi: "[ Phát hiện hội tụ. Đã nạp toàn bộ mô-đun luật: tu luyện, phẩm cấp, trang bị, chỉ huy quan, quân đoàn chồng lớp. Chúc may mắn. ]"
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        text: {
          en: "Every world's rules at once? Fine. I have read all their stories — now I get to combine the endings.",
          vi: "Luật của mọi thế giới cùng lúc sao? Được thôi. Ta đã đọc hết truyện của chúng — giờ là lúc kết hợp những cái kết lại."
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        text: {
          en: "Hey, mountain guy! If your world runs on my board game too, then trust me — buy the stacks. Always buy the stacks.",
          vi: "Này, anh bạn trên núi! Nếu thế giới của cậu cũng chạy trên ván cờ của tôi, thì tin tôi đi — mua chồng lớp ấy. Lúc nào cũng nên mua chồng lớp."
        }
      }
    ]
  },
  {
    id: "story.convergence.ch1.victory",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ Convergence stabilized. Every module mastered on a single board. Achievement unlocked: Rulekeeper of All Realms. ]",
          vi: "[ Hội tụ đã ổn định. Mọi mô-đun đều được chinh phục trên cùng một bàn cờ. Thành tựu mở khóa: Chưởng Luật Vạn Giới. ]"
        }
      },
      {
        speaker: CHEN_FAN,
        sprite: sprite("chen-fan"),
        side: "left",
        text: {
          en: "Cultivator, commander, quartermaster — today I was all of them. The overlap holds, and it answers to us.",
          vi: "Kiếm tu, thống soái, quan quân nhu — hôm nay ta là tất cả. Vùng giao thoa đã vững, và nó nghe lệnh chúng ta."
        }
      }
    ]
  },
  {
    id: "story.convergence.ch1.defeat",
    theme: "xianxia",
    background: bg("azure-peak"),
    lines: [
      {
        speaker: THE_SYSTEM,
        sprite: sprite("system"),
        side: "right",
        text: {
          en: "[ Convergence destabilized. Too many rules, too few victories. Rolling the realms back to their checkpoints... ]",
          vi: "[ Hội tụ mất ổn định. Quá nhiều luật, quá ít chiến thắng. Đang khôi phục các cõi giới về điểm lưu... ]"
        }
      },
      {
        speaker: BIN,
        sprite: sprite("bin"),
        side: "right",
        text: {
          en: "Okay, so juggling five rulebooks at once has a learning curve. Rematch. I've already got a better build in mind.",
          vi: "Được rồi, tung hứng năm cuốn luật cùng lúc đúng là cần thời gian làm quen. Đấu lại đi. Tôi đã nghĩ ra lối chơi ngon hơn rồi."
        }
      }
    ]
  }
];

/**
 * The Dungeon's whispering-wall rooms (§6.7.3 door rooms): tiny bilingual
 * narrator vignettes fired mid-delve by the PLAY_STORY_SCENE visit step.
 * Deliberately art-less (no background/sprite refs — the overlay's theme
 * gradient + narrator layout carry them), so they add no asset obligations.
 */
const ERATHIA_CAMPAIGN_SCENES: StoryScene[] = [
  {
    id: "story.erathia.homecoming.intro",
    theme: "classic",
    background: "/assets/story/erathia/homecoming.webp",
    lines: [
      { speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "General, our landing confirms the worst. Nighon has held this coast for a month, and the road to its command post runs beneath our feet.", vi: "Tướng quân, cuộc đổ bộ xác nhận điều tồi tệ nhất. Nighon đã chiếm bờ biển này suốt một tháng, và đường tới căn cứ chỉ huy chạy ngay dưới chân ta." } },
      { speaker: KENDAL, sprite: sprite("kendal"), side: "right", text: { en: "Caryatid can be rebuilt. Plinth, Mirham and Trailia are occupied, but their militia still watches for the griffin banner.", vi: "Caryatid có thể được dựng lại. Plinth, Mirham và Trailia đang bị chiếm, nhưng dân quân vẫn chờ cờ Griffin." } },
      { speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "Then raise it. Rally the coast, descend through the invasion road, and take Terraneus. Assume we are at war.", vi: "Vậy hãy giương cờ. Tập hợp bờ biển, đi xuống đường xâm lược và chiếm Terraneus. Hãy coi như chúng ta đang có chiến tranh." } }
    ]
  },
  { id: "story.erathia.homecoming.victory", theme: "classic", background: "/assets/story/erathia/homecoming.webp", lines: [{ speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "Terraneus is ours. Nighon's route is exposed, and Erathia has a coast from which to fight back.", vi: "Terraneus đã thuộc về ta. Đường xâm lược của Nighon đã lộ, và Erathia có một bờ biển để phản công." } }] },
  { id: "story.erathia.homecoming.defeat", theme: "classic", background: "/assets/story/erathia/homecoming.webp", lines: [{ speaker: KENDAL, sprite: sprite("kendal"), side: "right", text: { en: "The beachhead is lost, Majesty. The fleet can land again, but the enemy will be waiting.", vi: "Đầu cầu đã mất, thưa Bệ Hạ. Hạm đội có thể đổ bộ lại, nhưng kẻ thù sẽ chờ sẵn." } }] },
  {
    id: "story.erathia.guardian-angels.intro",
    theme: "classic",
    background: "/assets/story/erathia/guardian-angels.webp",
    lines: [
      { speaker: KENDAL, sprite: sprite("kendal"), side: "right", text: { en: "Peasants speak of Fair Feather, a white city that has survived every assault. They say angels guard its walls.", vi: "Nông dân kể về Fair Feather, thành phố trắng sống sót qua mọi cuộc tấn công. Họ nói thiên thần bảo vệ tường thành." } },
      { speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "Angels fought the Kreegans once before. We must reach them before four underground strongholds close the valley.", vi: "Thiên thần từng chống Kreegan. Ta phải đến trước khi bốn cứ điểm dưới lòng đất khóa kín thung lũng." } },
      { speaker: KENDAL, sprite: sprite("kendal"), side: "right", text: { en: "One road to Fair Feather; four roads for the enemy. We will have to move quickly.", vi: "Một đường tới Fair Feather; bốn đường cho kẻ thù. Chúng ta phải thật nhanh." } }
    ]
  },
  { id: "story.erathia.guardian-angels.victory", theme: "classic", background: "/assets/story/erathia/guardian-angels.webp", lines: [{ speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "Fair Feather stands, and the angels have answered. Steadwick will hear their wings before it sees our banners.", vi: "Fair Feather vẫn đứng vững, và các thiên thần đã đáp lời. Steadwick sẽ nghe tiếng cánh trước khi thấy cờ của ta." } }] },
  { id: "story.erathia.guardian-angels.defeat", theme: "classic", background: "/assets/story/erathia/guardian-angels.webp", lines: [{ speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "We were too slow. Regroup and open the valley before Fair Feather's light goes out.", vi: "Ta đã quá chậm. Tập hợp lại và mở thung lũng trước khi ánh sáng Fair Feather tắt." } }] },
  {
    id: "story.erathia.griffin-cliff.intro",
    theme: "classic",
    background: "/assets/story/erathia/griffin-cliff.webp",
    lines: [
      { speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "Every year the griffins return to these cliffs. Gryphonheart the First tamed them here, and with them forged Erathia.", vi: "Mỗi năm griffin trở về những vách đá này. Gryphonheart Đệ Nhất đã thuần hóa chúng tại đây và cùng chúng lập nên Erathia." } },
      { speaker: KENDAL, sprite: sprite("kendal"), side: "right", text: { en: "Nighon and Kreegan troops hold all seven towers. Their two armies are stripping the nests for the siege of Steadwick.", vi: "Quân Nighon và Kreegan giữ cả bảy tháp. Hai đạo quân đang vét tổ griffin để vây Steadwick." } },
      { speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "Free every tower. We do not march on the capital without the wings that built it.", vi: "Giải phóng mọi ngọn tháp. Ta sẽ không tiến về kinh đô nếu thiếu đôi cánh đã xây nên nó." } }
    ]
  },
  { id: "story.erathia.griffin-cliff.victory", theme: "classic", background: "/assets/story/erathia/griffin-cliff.webp", lines: [{ speaker: KENDAL, sprite: sprite("kendal"), side: "right", text: { en: "Seven towers fly the griffin banner. The sky itself is marching with us toward Steadwick.", vi: "Bảy ngọn tháp tung cờ Griffin. Cả bầu trời đang cùng ta tiến về Steadwick." } }] },
  { id: "story.erathia.griffin-cliff.defeat", theme: "classic", background: "/assets/story/erathia/griffin-cliff.webp", lines: [{ speaker: CATHERINE, sprite: sprite("catherine"), side: "left", text: { en: "The cliffs remain chained. We return before the last aerie is emptied; Erathia cannot lose its griffins twice.", vi: "Các vách đá vẫn bị xiềng xích. Ta phải trở lại trước khi tổ cuối cùng bị vét sạch; Erathia không thể mất griffin hai lần." } }] }
];

const DUNGEON_SCENES: StoryScene[] = [
  {
    id: "dungeon_whispers_first",
    theme: "classic",
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "The wall is warm under your palm. Words seep out of the stone like ground-water: \"...delvers before you counted their steps aloud, so the dark would not swallow the number...\"",
          vi: "Bức tường ấm dưới lòng bàn tay. Những lời rỉ ra từ đá như nước ngầm: \"...những kẻ xuống hầm trước ngươi đã đếm to từng bước chân, để bóng tối không nuốt mất con số...\""
        }
      },
      {
        speaker: "narrator",
        text: {
          en: "\"...the floors go down farther than the mountain is tall. Take what the rooms offer. The Dungeon deals fair — it only ever takes what you bring.\"",
          vi: "\"...các tầng sâu hơn cả chiều cao ngọn núi. Hãy nhận những gì các căn phòng trao. Hầm Ngục luôn sòng phẳng — nó chỉ lấy những gì ngươi mang theo.\""
        }
      }
    ]
  },
  {
    id: "dungeon_whispers_deep",
    theme: "classic",
    lines: [
      {
        speaker: "narrator",
        text: {
          en: "Deeper now. The whispers overlap — a hundred voices reading a ledger: \"...floor five keeps a horned warden... floor ten keeps the Wyrm, and under the Wyrm, nothing. It is the bottom. It is the prize.\"",
          vi: "Sâu hơn rồi. Những lời thì thầm chồng lên nhau — trăm giọng nói đọc một cuốn sổ: \"...tầng năm có gã cai ngục mang sừng... tầng mười có Cự Long, và dưới Cự Long là hư không. Đó là đáy. Đó là phần thưởng.\""
        }
      },
      {
        speaker: "narrator",
        text: {
          en: "One voice, closer than the rest: \"Conqueror. We will remember the one who reaches the bottom and walks back up.\"",
          vi: "Một giọng nói, gần hơn tất cả: \"Kẻ Chinh Phục. Chúng ta sẽ nhớ kẻ chạm tới đáy và tự bước lên lại.\""
        }
      }
    ]
  }
];

const ALL_SCENES: StoryScene[] = [...DEMO_SCENES, ...CH1_SCENES, ...ERATHIA_CAMPAIGN_SCENES, ...DUNGEON_SCENES];

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
  // 2026-07: EMPTY — both backgrounds and all six base sprites ship real art
  // (backgrounds 16:9, sprites transparent cutouts; pipeline:
  // `scripts/place-anime-assets.mjs`). Any FUTURE referenced-but-unshipped
  // asset path (e.g. an expression variant) must be declared here so the
  // overlay keeps its gradient/avatar fallback instead of a broken image.
]);

/** True when this asset path has no file on disk yet (use the fallback). */
export function storyAssetIsPlaceholder(path: string): boolean {
  return STORY_ART_PLACEHOLDERS.has(path);
}

/** Resolve a speaker's display name in the chosen language ("narrator" → null). */
export function storySpeakerName(speaker: StorySpeaker, lang: "en" | "vi"): string | null {
  return speaker === "narrator" ? null : speaker[lang];
}
