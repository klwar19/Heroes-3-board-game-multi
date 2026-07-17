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
const HIKARI: StorySpeaker = { en: "Hikari", vi: "Hikari" };
const BIN: StorySpeaker = { en: "Bin", vi: "Bin" };

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

export const storySceneRegistry: Record<string, StoryScene> = Object.fromEntries(
  DEMO_SCENES.map((scene) => [scene.id, scene])
);

/** Registered scene ids, in registry order (editor dropdown / defaults). */
export const STORY_SCENE_IDS: readonly string[] = DEMO_SCENES.map((scene) => scene.id);

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
  for (const scene of DEMO_SCENES) {
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
  sprite("hikari"),
  sprite("bin")
]);

/** True when this asset path has no file on disk yet (use the fallback). */
export function storyAssetIsPlaceholder(path: string): boolean {
  return STORY_ART_PLACEHOLDERS.has(path);
}

/** Resolve a speaker's display name in the chosen language ("narrator" → null). */
export function storySpeakerName(speaker: StorySpeaker, lang: "en" | "vi"): string | null {
  return speaker === "narrator" ? null : speaker[lang];
}
