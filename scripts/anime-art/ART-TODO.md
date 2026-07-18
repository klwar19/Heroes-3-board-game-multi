# Anime mod — ART TODO (drop-art-later shopping list)

Every asset below is a currently-DECLARED art placeholder: the system runs today
on a fallback (glyph / deck-back / gradient-avatar), and a hygiene test fails if a
file lands without its registry entry being removed (and vice-versa). This is the
image-gen shopping list. When a file lands, follow the per-section **PROMOTE**
recipe or the test stays red.

**Registers** (from `docs/anime-art-style.md` — obey per asset's package):
- **Xianxia** (Ninefold Realms): hand-painted wuxia — ink-wash atmosphere over
  painterly HoMM readability; jade/celadon + antique gold + granite + cloud-mist;
  NO photorealism, NO European plate armor, NO neon spell FX.
- **Isekai** (Otherworld Gate): anime-painterly hybrid — clean lineart,
  cel-adjacent shading, muted saturation, painterly texture so art sits beside the
  H3 scans without reading as a mobile-game sticker (full cel style allowed for VN
  sprites/CGs only).
- **Hard rule (all art):** NO text/numbers/frame/UI/logo/watermark baked into
  generated illustration — titles/stats/glyphs are the compositor's job.

**Pipeline:** raw masters → `scripts/anime-art/raw/` (never `public/`); optional
editable SVG → `scripts/anime-art/editable/`; compositor
`node scripts/build-anime-cards.mjs` → `public/assets/*.webp`. Full conventions:
plan `docs/anime-mod-plan.md` §14. Every code reference already goes through
`assetUrl()` / the registry helper, so a promoted file is picked up with no code
change beyond the registry edit.

**Totals:** 8 hex fields + 5 artifact card faces + 6 equipment icons + 8 story
assets (2 backgrounds + 6 sprites) = **27 placeholder assets**.

---

## 1. Field Override hex art — `FIELD_OVERRIDE_ART_PLACEHOLDERS`

- **Registry:** `src/data/anime/field-overrides.ts` → `FIELD_OVERRIDE_ART_PLACEHOLDERS`
- **Target path:** `public/assets/anime/field-overrides/<id>.webp`
- **Format/size:** **512×512 webp** (matches the 5 shipped wave-1 hexes:
  `bi_canh`, `kiem_trung`, `linh_tuyen`, `ngo_dao_thach`, `tran_phap_truyen_tong`).
  A single centered board-hex scene, no frame (the board draws the hex ring).
- **PROMOTE (each):** drop `public/assets/anime/field-overrides/<id>.webp` **AND**
  set `image: art("<id>")` on that definition **AND** delete `<id>` from
  `FIELD_OVERRIDE_ART_PLACEHOLDERS`. Test: `src/engine/field-overrides.test.ts`
  ("art wins over glyph" + the placeholder-vs-disk both-directions checks).

| # | id (package) | Location / what it is | ART PROMPT seed |
| --- | --- | --- | --- |
| 1 | `thuong_hoi_tram` (xianxia) | Trạm Thương Hội — Merchant Guild Post; revisitable Trading Post | Ink-wash: a xianxia guild trading stall on a mountain trail — abacus, hanging ledgers, jade coin strings, a celadon awning; muted jade-gold, granite steps, cloud-mist edges. |
| 2 | `song_bac_quan` (xianxia) | Sòng Bạc Quán — Gambling Den; Attack-die gamble for a fee | Ink-wash: a dim brotherhood gambling den — a low lacquer table, cast bone dice, a hanging red lantern, coin piles; smoky warm-gold light against charcoal shadow. |
| 3 | `dai_luyen_khi` (xianxia) | Đài Luyện Khí — Qi Refinement Platform; meditate/breakthrough | Ink-wash: a stone qi-refinement platform on a floating granite peak — a lone cross-legged cushion, faint warm-gold qi swirl rising, old pines and cloud sea behind. |
| 4 | `capsule_lab` (isekai) | Capsule Corp Lab; revisitable War Machine Factory | Anime-painterly: a rounded dome science lab in a green valley — capsule-shaped hangar, workbench with a half-built machine, soft cel shading, muted teal/orange, clean lineart. |
| 5 | `urahara_shop` (isekai) | Urahara's Shop; paid Artifact/Treasure counter | Anime-painterly: a shabby-charming candy-store curio shop front — hand-painted signboard, crates of oddments, a paper lantern, dusty warm light; muted palette, cel-adjacent. |
| 6 | `onsen_ryokan` (isekai) | Hot Spring Inn (Onsen); soak for morale/movement | Anime-painterly: a steaming open-air onsen at a wooden ryokan — rocky pool, rising steam, lantern glow at dusk, distant forested hills; warm muted tones, painterly texture. |
| 7 | `ren_binh_cac` (xianxia · equipment) | Rèn Binh Các — Blacksmith outfitter (`anime.equipment`) | Ink-wash: a mountain sword-forge — glowing forge mouth, hanging jian and jade-inlaid armor, an anvil, sparks against dark timber; antique bronze + warm-gold ember, granite. |
| 8 | `adventurer_outfitter` (isekai · equipment) | Adventurer Outfitter (`anime.equipment`) | Anime-painterly: a fantasy adventurer's gear shop — racks of blades, mail and packs, a guild-notice board, a wooden counter; clean lineart, muted saturation, cozy lamplight. |

---

## 2. Pháp Bảo artifact card faces — `ANIME_ARTIFACT_ART_PLACEHOLDERS`

- **Registry:** `src/data/anime/artifacts.ts` → `ANIME_ARTIFACT_ART_PLACEHOLDERS`
- **Target path:** `animeArtifactArtPath(slug)` = `public/assets/anime/artifacts/<slug>.webp`
- **Format/size:** **743×1040 webp, q82–92** (portrait card face, the §14 card
  convention). Full painted card face (illustration + frame) — build via the
  compositor `scripts/build-anime-cards.mjs`, OR ship a hand-composed face at the
  same dimensions. All five are the **xianxia** register.
- **PROMOTE (each):** drop `public/assets/anime/artifacts/<slug>.webp` **AND**
  delete `<slug>` from `ANIME_ARTIFACT_ART_PLACEHOLDERS` (the `cardImage` then
  auto-routes from the deck-back to the face). Test:
  `src/data/anime/anime-artifacts.test.ts` (placeholder→deck-back vs
  promoted→own-face-on-disk, both directions disk-checked).

| # | slug | Card (EN / VI) — printed effect | ART PROMPT seed (illustration only, no text) |
| --- | --- | --- | --- |
| 1 | `tui_can_khon` | Túi Càn Khôn / Cosmic Bag — +1 building materials income | Ink-wash: a small embroidered qiankun pouch spilling an impossible amount of ore and jade dust, a hint of a swirling void mouth inside; jade-gold on cloud-grey, painterly. |
| 2 | `tu_linh_ban` | Tụ Linh Bàn / Spirit Gathering Board — +2 gold when hero in a Town | Ink-wash: a bronze spirit-gathering array plate etched with a bagua, gold qi threads streaming inward from a distant pagoda skyline; antique bronze + warm gold, misty. |
| 3 | `phong_hoa_luan` | Phong Hỏa Luân / Wind & Fire Wheels — +2/+3 hero movement | Ink-wash: a pair of spinning wind-and-fire wheels wreathed in red flame and blue wind streaks, hovering mid-air over a mountain path; dynamic motion, muted red/cyan, granite. |
| 4 | `bat_qua_kinh` | Bát Quái Kính / Bagua Mirror — defender +1/+2 defense reaction | Ink-wash: a round bronze bagua mirror deflecting a beam of light into scattered sparks, held up defensively; jade-gold rim, cool reflected glow, cloud-mist backdrop. |
| 5 | `tru_tien_kiem` | Tru Tiên Kiếm / Heaven-Slaying Sword — attacker +2/+3 attack reaction | Ink-wash: a legendary jian blazing with heavenly sword-light mid-cleave, faint slain-immortal talisman glyphs dissolving around it; blinding warm-gold edge, dark storm sky. |

---

## 3. Equipment item icons — `ANIME_EQUIPMENT_ART_PLACEHOLDERS`

- **Registry:** `src/data/anime/equipment.ts` → `ANIME_EQUIPMENT_ART_PLACEHOLDERS`
- **Target path:** `equipmentArtPath(id)` = `public/assets/anime/equipment/<slug>.webp`
  (slug = the id minus the `anime.equip.` prefix).
- **Format/size:** **square item icon, 512×512 webp**, transparent or subtle-frame
  background — a hero-board chip scale (see the `equipment.ts` docblock). Register
  per the item's `package` (xianxia ink-wash / isekai anime-painterly; the shared
  Satchel reads neutral-adventuring).
- **PROMOTE (each):** drop `public/assets/anime/equipment/<slug>.webp` **AND**
  delete the id from `ANIME_EQUIPMENT_ART_PLACEHOLDERS` (`equipmentImage` then
  returns the path instead of `undefined`, and the chip draws it over the slot
  glyph). Test: `src/data/anime/equipment.test.ts` (promote-safe both-directions
  disk check).

| # | slug (slot · package) | Item (EN / VI) — effect | ART PROMPT seed |
| --- | --- | --- | --- |
| 1 | `iron_blood_sword` (weapon · xianxia) | Iron-Blood Sword / Thiết Huyết Kiếm — first attack +1 Attack | Ink-wash icon: a dark blood-tempered jian, faint crimson qi along the fuller, wrapped hilt; centered item shot, jade-gold accents on charcoal. |
| 2 | `black_tortoise_mail` (armor · xianxia) | Black Tortoise Mail / Huyền Vũ Giáp — first incoming attack −1 Attack | Ink-wash icon: heavy lamellar mail bearing a black-tortoise-and-serpent (Xuanwu) sigil, deep indigo lacquer plates, bronze rivets; centered, muted. |
| 3 | `cosmos_pendant` (accessory · xianxia) | Cosmos Pendant / Càn Khôn Bội — +1 spell Power | Ink-wash icon: a carved jade pendant with a swirling galaxy-nebula core on a silk cord, faint gold star motes; centered, celadon + warm gold. |
| 4 | `adventurers_blade` (weapon · isekai) | Adventurer's Blade / Kiếm Mạo Hiểm Giả — +1 gold per won combat | Anime-painterly icon: a reliable arming sword with a worn leather grip and a small guild tag on the pommel; clean lineart, cel shading, muted steel/brown. |
| 5 | `guild_issue_mail` (armor · isekai) | Guild-Issue Mail / Giáp Công Hội — +1 hand limit | Anime-painterly icon: practical adventurer's chainmail-and-leather chest armor stamped with a guild crest; centered, muted earth tones, painterly texture. |
| 6 | `supply_satchel` (accessory · shared) | Supply Satchel / Túi Tiếp Tế — +1 building materials income | Neutral-adventuring icon: a well-worn leather traveler's satchel bulging with tools, rope and a bedroll strap; centered, warm muted tan, works for either register. |

---

## 4. Visual-novel story art — `STORY_ART_PLACEHOLDERS`

- **Registry:** `src/data/story/scenes.ts` → `STORY_ART_PLACEHOLDERS`
- **Target paths (as the shipped scenes reference them):**
  - backgrounds → `public/assets/story/backgrounds/<slug>.webp`
  - sprites → `public/assets/story/sprites/<slug>.webp`
- **Format/size:**
  - **Backgrounds: 16:9 webp** (e.g. 1920×1080), full-bleed scene, no characters.
  - **Sprites: tall character cutout, transparent background, ~768×1280+ webp**
    (portrait framing, waist-up or full-body). The shipped foundation uses ONE
    base sprite per character (no `-<expr>` suffix); §14's `<char>-<expr>`
    expression variants are a later extension (add new placeholder entries then).
- **PROMOTE (each):** drop the `.webp` at the exact referenced path **AND** delete
  that path from `STORY_ART_PLACEHOLDERS` (the overlay then draws it instead of the
  theme-gradient background / initial-letter avatar chip). Test:
  `src/data/story/scenes.test.ts` (on-disk vs declared, both directions).

| # | asset (kind · theme) | Who / where | ART PROMPT seed |
| --- | --- | --- | --- |
| 1 | `backgrounds/azure-peak` (bg · xianxia) | Azure Cloud Peak — the Sword Trial dawn | Ink-wash 16:9: a Wudang-style temple platform on a Huangshan granite peak at dawn, old pines, waterfall, a sea of cloud below; celadon + charcoal ink + warm-gold morning light, no figures. |
| 2 | `backgrounds/dawn-gate` (bg · isekai) | The Dawn Gate — a muddy Restia crossroads | Anime-painterly 16:9: a glowing ancient stone portal-arch fading shut over a muddy frontier crossroads, dawn sky, distant town rooftops; clean lineart, muted teal/amber, no figures. |
| 3 | `sprites/chen-fan` (sprite · xianxia) | Chen Fan (Trần Phàm) — reincarnated frail disciple protagonist | Xianxia character cutout, transparent bg: a lean young male outer-sect disciple in celadon travel robes, a plain jian at his hip, resolute-but-frail expression, modern-mind glint; painterly, waist-up. |
| 4 | `sprites/azure-elder` (sprite · xianxia) | Sect Elder (Tông Lão) | Xianxia character cutout, transparent bg: a stern silver-bearded Daoist sect elder in layered jade-and-grey robes, hands folded, an aloof appraising look; ink-wash painterly, waist-up. |
| 5 | `sprites/system` (sprite · xianxia) | The System (Hệ Thống) — a floating status intelligence | Semi-abstract cutout, transparent bg: a translucent glowing status-panel/hologram construct — a faint humanoid outline of gold interface lines and bagua-styled UI runes (no baked text); cool cyan-gold, ethereal. |
| 6 | `sprites/hikari` (sprite · isekai) | Hikari — broke Goddess of the Dawn Gate | Anime-painterly cutout, transparent bg: a warm bright goddess with dawn-gold hair and flowing white-and-amber robes, a sheepish endearing smile, faint fading halo; clean lineart, cel shading, waist-up. |
| 7 | `sprites/bin` (sprite · isekai) | Bin — genre-savvy summoned protagonist | Anime-painterly cutout, transparent bg: a modern young man in practical travel gear reading a floating status menu with a wry knowing smirk; clean lineart, muted saturation, waist-up. |
| 8 | `sprites/guild-girl` (sprite · isekai) | Guild Girl (Tiếp Tân Hội) — adventurers' guild receptionist | Anime-painterly cutout, transparent bg: a friendly guild receptionist in a tidy uniform behind a counter vibe, holding a commission slip, earnest worried-but-cheerful look; cel-adjacent, waist-up. |

---

## Next promotions after art lands (data extensions, not placeholders yet)

These are NOT in a placeholder registry today (nothing references them), but are
the natural next art batches once the above ship — tracked here so the pipeline
has the full picture (see plan §14 asset table):

- **VN expression variants** (`sprites/<char>-<expr>.webp`) — add a new
  `STORY_ART_PLACEHOLDERS` entry per new sprite path when scenes start referencing
  moods; the current scenes carry only `expression` hints, not distinct sprites.
- **Campaign chapter backgrounds/CGs** for chapters 2–7 (unshipped — those
  chapters are `playable:false` data with empty `scenes`).
- **Anime town/unit/hero/commander/neutral art** (Fuyuki City, Azure Breeze, …) —
  those towns are still design proposals (plan §5–7, P1/P6/P9/P10/P16); the
  editable unit-card proofs under `scripts/anime-art/{raw,editable,previews}/`
  stay out of `public/assets` until their mechanics are engine-wired + tested.
