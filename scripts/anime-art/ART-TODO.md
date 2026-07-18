# Anime mod — ART TODO (drop-art-later shopping list)

**2026-07 status: the original 27-asset shopping list has SHIPPED.** All four
placeholder registries (`FIELD_OVERRIDE_ART_PLACEHOLDERS`,
`ANIME_ARTIFACT_ART_PLACEHOLDERS`, `ANIME_EQUIPMENT_ART_PLACEHOLDERS`,
`STORY_ART_PLACEHOLDERS`) are now legitimately EMPTY; their hygiene tests still
guard both directions for any FUTURE declared placeholder. The 5 wave-1 field
hexes (`bi_canh`, `kiem_trung`, `linh_tuyen`, `ngo_dao_thach`,
`tran_phap_truyen_tong`) were additionally REGENERATED on-register — the earlier
files were mismatched stock-like scenes (a reading nook, a lighthouse…), not the
described locations.

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

**Pipeline (as actually shipped):**
1. Prompts fed to the codex desktop CLI (`codex exec`, server-side `image_gen`);
   chroma-key subjects generated on flat `#00ff00`.
2. `node scripts/place-anime-assets.mjs <collectedDir>` — fixed-green keys,
   trims, resizes and writes every category to its `public/` target (and copies
   artifact/frame masters to `scripts/anime-art/raw/artifacts/`).
3. `node scripts/build-anime-artifact-cards.mjs` — detects the frame's green art
   window, keys it, and renders the 743×1040 Pháp Bảo card faces from editable
   SVG sources (`scripts/anime-art/editable/artifacts/*.svg` — frame + art are
   linked layers, all typography editable; keep face text in lockstep with
   `src/data/anime/artifacts.ts`).

**Shipped targets** (for future replacements, keep formats):
- Field Override hexes → `public/assets/anime/field-overrides/<id>.webp`, 512×512.
- Pháp Bảo card faces → `public/assets/anime/artifacts/<slug>.webp`, 743×1040.
- Equipment icons → `public/assets/anime/equipment/<slug>.webp`, 512×512
  transparent.
- Story backgrounds → `public/assets/story/backgrounds/<slug>.webp`, 16:9.
- Story sprites → `public/assets/story/sprites/<slug>.webp`, transparent cutout,
  ≤1280 tall.

**To add a NEW art-less asset later:** declare it in the matching
`*_ART_PLACEHOLDERS` registry (the UI then uses its glyph/deck-back/gradient
fallback), and remove the entry when the file lands — the hygiene tests enforce
the contract in both directions.

---

## Next art batches (data extensions, not placeholders yet)

These are NOT in a placeholder registry today (nothing references them), but are
the natural next batches (see plan §14 asset table):

- **VN expression variants** (`sprites/<char>-<expr>.webp`) — add a new
  `STORY_ART_PLACEHOLDERS` entry per new sprite path when scenes start referencing
  moods; the current scenes carry only `expression` hints, not distinct sprites.
- **Campaign chapter backgrounds/CGs** for chapters 2–7 (unshipped — those
  chapters are `playable:false` data with empty `scenes`).
- **Anime town/unit/hero/commander/neutral art** (Fuyuki City, Azure Breeze, …) —
  those towns are still design proposals (plan §5–7, P1/P6/P9/P10/P16); the
  editable unit-card proofs under `scripts/anime-art/{raw,editable,previews}/`
  stay out of `public/assets` until their mechanics are engine-wired + tested.
