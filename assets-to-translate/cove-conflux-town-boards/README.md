# Cove / Conflux town boards — source drop

**Upload your Polish town-board scans here:**

```
assets-to-translate/cove-conflux-town-boards/source/
```

## What to put in `source/`

High-res photos or scans of the **physical Polish town boards** (full board is best).

Preferred:

| File | Contents |
|------|----------|
| `cove-town-board-pl.jpg` (or `.png` / `.webp`) | Full Cove town board |
| `conflux-town-board-pl.jpg` | Full Conflux town board |

Also fine:

- Separate photos of each building tile strip
- Built vs unbuilt faces if the tiles are double-sided / flip tiles
- Extra close-ups of any plaque text that is hard to read on the full board

Polish filenames are fine. Multiple angles/shots of the same board are fine — we pick the sharpest.

## What we will do after you upload

1. **Read** every Polish label, cost, and effect on the board (no guessing from wiki).
2. **Crop** each building tile cleanly (portrait tile crop, not messy boxes).
3. **Translate** Polish → English with correct **Homm3BG legend glyphs**  
   https://github.com/Heegu-sama/Homm3BG/tree/main/assets/glyphs  
   (same set as `scripts/card-glyphs/` in this repo).
4. Keep art, parchment, numbers, and icon layout intact — **no white boxes**, no wrong symbols.
5. Output final tiles as:

```
public/assets/town-board/cove-<building>.webp
public/assets/town-board/conflux-<building>.webp
```

(and `-unbuilt.webp` if the board has unbuilt plaque faces, like Factory).

## Expected building slots (engine ids)

**Cove** (`src/data/towns/boards.ts`):

- `cove.city_hall`
- `cove.dwelling_bronze`
- `cove.dwelling_silver` + `cove.pub` (shared bar)
- `cove.citadel`
- `cove.thieves_guild`
- `cove.dwelling_gold`
- `cove.mage_guild`

**Conflux:**

- `conflux.city_hall`
- `conflux.dwelling_bronze`
- `conflux.dwelling_silver` + `conflux.magic_university` (shared bar)
- `conflux.citadel`
- `conflux.garden_of_life`
- `conflux.dwelling_gold`
- `conflux.mage_guild`

## Quality notes (so the edit stays clean)

- Prefer **flat, well-lit, sharp** full-board photos (phone flash glare is the worst).
- Straight-on angle if possible (less perspective warp → cleaner crops).
- If text on a cost/effect strip is tiny, add one close-up of that strip.

## Pipeline folders (do not put uploads here)

| Folder | Role |
|--------|------|
| `source/` | **Your uploads only** |
| `cropped/` | Per-building crops from the board |
| `english/` | Translated tile art |
| `final/` | Ready-to-ship webp before copy into `public/assets/town-board/` |
| `glyphs-ref/` | Homm3BG glyph references used for correct legend |

## After upload

Reply in chat (e.g. “uploaded”) and we process Cove then Conflux: crop → translate with correct glyphs → verify every plaque against the scan → ship tiles.
