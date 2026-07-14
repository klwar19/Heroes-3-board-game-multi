# All modified English Conflux art (review pack)

**Path:** `assets-to-translate/conflux-drive/english/_ALL_MODIFIED/`

Not copied into `public/assets/` yet — review first, then assign.

## Format (matches current game setup)

| Kind | Filename pattern | Size |
|------|------------------|------|
| Specialty cards | `hero_specialties-{slug}-{1\|4\|6}.webp` | **743×1040** (same as Solmyr/Gem/etc.) |
| Spell cards | `spells-{id}.webp` | **743×1040** |
| Major artifacts | `artifacts_major-{id}.webp` | **743×1040** |
| Full hero boards | `hero_board-full-{slug}.webp` | **1216×848** landscape |

Engine specialty path: `/assets/hero_specialties-${heroSlug}-${level}.webp`  
Tarnum slug is **`tarnum_conflux`** (not bare `tarnum`).

Note: in-game `hero_boardart-*` is a **572×582 portrait** slot (different from these full boards). Full boards are for reference / future UI only.

## Contents (33 files)

### Hero specialties (18)
- ciele · luna · erdamon · monere · pasis · **tarnum_conflux** — levels 1 / 4 / 6

### Hero boards (6)
- ciele, luna, erdamon, monere, pasis, tarnum_conflux

### Spells (7)
- `spells-protection_from_fire|air|water.webp` (no Earth source in Drive)
- `spells-magic_mirror.webp`
- `spells-summon_fire|water|air_elemental.webp` (no full Earth card in Drive)

### Artifacts (2)
- `artifacts_major-orb_of_tempestuous_fire.webp`
- `artifacts_major-orb_of_the_firmament.webp`

## Known residual nits (image model)
- Some specialty instant glyphs slightly soft after re-encode
- Magic Mirror tier stars may still show partial text labels — re-touch if needed
- Fire orb ongoing glyph sometimes ∞ instead of circular arrow
- Protection from Earth / Summon Earth Elemental / Orb of Silt / Orb of Driving Rain **not in the Drive pack**

## Skipped (per request)
- Town tiles, unit cards, map tiles
