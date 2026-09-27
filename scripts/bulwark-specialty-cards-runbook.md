# Bulwark art runbook — town map tile + hero specialties

Two pieces of missing **Bulwark** art and how they get into the game:

1. the **town map tile** (`S11`) — built by `scripts/build-expansion-starting-tiles.mjs` (below);
2. the **hero-specialty cards** (6 heroes × levels **I / IV / VI**) — now drawn
   **natively in-app** by `SpecialtyCard`; only one transparent symbol per hero
   is an image, and most already ship.

## Bulwark town map tile (S11)

The Bulwark starting tile is now `S11` (`public/assets/board/tiles/s11.webp`);
`S10` is the Factory tile. The old Gemini edit of the Tower tile `#S1` is
retired: its layout no longer matches the tile definition, and its output path
(`s10.webp`) would overwrite the Factory art. `S10`/`S11`/`S12` are built by
`node scripts/build-expansion-starting-tiles.mjs guides|build`, which draws every
border, label and field symbol from the same slots as
`src/data/map/expansion-tiles.ts`.

## Hero specialty cards (native render — `SpecialtyCard`)

Specialty cards are now drawn **in-app** by `src/components/specialty-card.tsx`
(`SpecialtyCard`) — a port of the HoMM3 Hero Creator's card (MIT; see
`public/credits/`). It renders the **frame, title, I/IV/VI level badge and the
effect text** from game data (`coreHeroDefinitions` + `cardLibrary`). The only
image it needs is the central **specialty symbol**, shown transparently
(`object-fit: contain`) over the leather panel. Preview every card at
**`/specialty-preview`** (`npm run dev`).

So there are **no full cards to generate** — just one transparent symbol per
hero. Most already ship; only the three Bulwark **unit** symbols remain.

### Symbol sources (one transparent picture per specialty)

| Hero (slug) | Specialty | Symbol file under `public/assets/` | Source / status |
|---|---|---|---|
| Glacius (`glacius`) | Frost Ring | `specialty-card/icon-frost_ring.webp` | Homm3BG (CC BY-NC-SA) — shipped |
| Ciele (`ciele`) | Magic Arrow | `specialty-card/icon-magic_arrow.webp` | Homm3BG — shipped |
| Luna (`luna`) | Fire Wall | `specialty-card/icon-firewall.webp` | Homm3BG — shipped |
| Oidana (`oidana`) | Diplomacy | `specialty-card/icon-diplomacy.webp` | owner-supplied dove — shipped |
| Kriv (`kriv`) | Runes | `runes-emblem.webp` | owner-supplied emblem — shipped |
| **Dhuin** (`dhuin`) | Snow Elves | `units-bulwark-snow_elves-portrait.webp` | wiki creature portrait — shipped |
| **Creyle** (`creyle`) | Mammoths | `units-bulwark-mammoths-portrait.webp` | wiki creature portrait — shipped |
| **Eikthurn** (`eikthurn`) | Mountain Rams | `units-bulwark-mountain_rams-portrait.webp` | wiki creature portrait — shipped |

`SpecialtyCard` points at every path above, and a **missing file simply shows no
icon** (the frame + text still draw). The Homm3BG symbols are CC BY-NC-SA —
credited in `public/credits/Homm3BG_LICENSE.txt`; swap them for original art
before any commercial use.

### The Bulwark unit portraits (wiki)

The three unit specialists use the unit's own **creature portrait** from the
board-game wiki (heroes.thelazy.net), not the full card. All seven Bulwark unit
portraits are downloaded to `public/assets/units-bulwark-<slug>-portrait.webp`
(kobolds, mountain_rams, snow_elves, yetis, shamans, mammoths, jotunns) — clean
creature icons (~58×64 originals, upscaled). They are pulled via MediaWiki
`Special:FilePath/<File>` (e.g. `Snow_Elf_(HotA)_portrait.png`), the same source
`scripts/fetch-bulwark-art.py` uses for the cards. Re-fetch with:

```bash
python3 scripts/fetch-bulwark-art.py    # or curl Special:FilePath/<File>.png
```

Only snow_elves / mammoths / yetis feed a specialty today; the rest are kept for
reuse (unit tokens, etc.).

### Still TODO: wire into the hero board

`SpecialtyCard` renders standalone (preview route) but is **not yet shown on the
hero board**. The remaining step: render `<SpecialtyCard cardId={…} />` from
`hero-board.tsx`'s `CardArt` (the specialty slot) when a specialty has no baked
`cardImage`, and in the card zoom. Do it after tuning the proportions (the `.sc*`
rules in `globals.css`) against the preview.

## Credits

- Card frame / leather / border textures — HoMM3 Hero Creator (MIT © 2025 Adam
  Kecskes): `public/credits/Homm3_hero_creator_LICENSE.txt`.
- Frost Ring / Magic Arrow / Fire Wall symbols — Homm3BG (CC BY-NC-SA 4.0):
  `public/credits/Homm3BG_LICENSE.txt`.
