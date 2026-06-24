# Bulwark art runbook — town map tile + hero specialties

Two pieces of missing **Bulwark** art and how they get into the game:

1. the **town map tile** (`S10`) — a Gemini edit of the Tower snow tile (below);
2. the **hero-specialty cards** (6 heroes × levels **I / IV / VI**) — now drawn
   **natively in-app** by `SpecialtyCard`; only one transparent symbol per hero
   is an image, and most already ship.

## Bulwark town map tile (S10)

The Bulwark starting tile `S10` (`src/data/map/expansion-tiles.ts`) is drawn by
**editing the Tower starting tile** — both are `snow` tiles, so reuse Tower's
whole environment and just swap the town.

**The hex code is already aligned (the "fix code for correct hexes" step is done).**
`S10`'s field arrangement and outer borders mirror the Tower tile `#S1` exactly
(only the town's faction is `bulwark`), because a tile's field symbols are baked
into its art and the engine hides the glyph overlay once `assets.tileImage` is
set (see `renderTileArt` in `src/components/adventure/screen.tsx`). So the Tower
symbols in the base art already sit on the right engine hexes — do **not** move
them.

- **Base / template:** `public/assets/board/tiles/sx1.webp` (the Tower snow
  starting tile, `#S1`).
- **Town reference:** the Bulwark Castle render. The browser uploads **files, not
  URLs**, so download it to a local file first:

  ```powershell
  New-Item -ItemType Directory -Force -Path out\refs | Out-Null
  curl.exe -L "https://static.wikia.nocookie.net/heroes-of-might-and-magic/images/b/b2/Bulwark_Castle_render.png/revision/latest?cb=20250129141039" -o out\refs\bulwark-town-render.png
  ```

  (Dropping the `/scale-to-width-down/250` segment from the URL fetches the
  full-resolution original instead of the 250px thumbnail.)
- **Output:** `public/assets/board/tiles/s10.webp`.

### Tile prompt (TWO-image EDIT: the tile + the town render)

Upload, in order: **Image 1** = `public/assets/board/tiles/sx1.webp` (the Tower
tile), **Image 2** = `out/refs/bulwark-town-render.png` (the Bulwark Castle
render).

> **Image 1** is a finished hexagonal **map tile** from the **Heroes of Might &
> Magic III board game** — the Tower faction's snowy starting tile. **Image 2** is
> a render of the **Bulwark** town. EDIT Image 1 into the Bulwark starting tile.
> This is a precise local edit of Image 1, NOT a regeneration.
>
> Keep EVERYTHING in Image 1 except the central town building **100% identical and
> pixel-aligned**: the snowy mountain terrain, every field symbol and its exact
> position (the blocked rocky field, the two empty fields, the treasure chest, the
> resource symbol, the mine), the hex-flower shape, the cream/yellow outer border
> lines, and the overall lighting and palette. Do NOT move, restyle, recolor or
> redraw any of them.
>
> Change ONLY the central town: replace the Tower wizards' town with the **Bulwark
> town shown in Image 2** — keep its architecture, colours and identity, but
> repaint it to sit naturally inside Image 1: match the tile's perspective, scale,
> lighting and snowy setting, and fit it to the SAME footprint the Tower town
> occupied. Render crisp and print-quality at Image 1's original resolution and
> crop.

### Finalize + wire the tile

```bash
node scripts/png-to-webp.mjs out/bulwark-tile public/assets/board/tiles
```

Then set `assets: { tileImage: "/assets/board/tiles/s10.webp" }` on the `S10`
entry in `src/data/map/expansion-tiles.ts`. (Done — `s10.webp` ships and is
wired; the field symbols land on the right hexes.)

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
| **Dhuin** (`dhuin`) | Snow Elves | `specialty-card/icon-dhuin.webp` | **Gemini — TODO (prompt below)** |
| **Creyle** (`creyle`) | Mammoths | `specialty-card/icon-creyle.webp` | **Gemini — TODO** |
| **Eikthurn** (`eikthurn`) | Yetis | `specialty-card/icon-eikthurn.webp` | **Gemini — TODO** |

`SpecialtyCard` already points at every path above, and a **missing file simply
shows no icon** (the frame + text still draw), so dropping the three unit symbols
in is all that's left. The Homm3BG symbols are CC BY-NC-SA — credited in
`public/credits/Homm3BG_LICENSE.txt`; swap them for original art before any
commercial use.

### Generate the three Bulwark unit symbols (Gemini)

Make ONE transparent creature symbol per unit — **just the creature, no card,
frame, stats, text or background.** Use the unit's existing card as the look
reference:

- Dhuin → reference `public/assets/units-bulwark-bronze-snow_elves-few.webp`
- Creyle → reference `public/assets/units-bulwark-golden-mammoths-few.webp`
- Eikthurn → reference `public/assets/units-bulwark-silver-yetis-few.webp`

Prompt (upload the unit card as the reference image):

> From the creature shown in this Heroes of Might & Magic III board-game unit
> card, produce a clean **cut-out of ONLY the creature** — the single figure
> alone, on a **fully transparent background**. Remove the card entirely: no
> frame, border, title, stat icons or numbers, cost bar, ability banner, or
> background scenery — just the creature, repainted as a crisp, high-resolution
> semi-realistic digital fantasy illustration matching the card's art style.
> Centre it, fill the frame, no drop shadow. Output PNG with transparency.

Save the three PNGs as `icon-dhuin.png` / `icon-creyle.png` / `icon-eikthurn.png`
in `out/bulwark-symbols/`, then convert in place:

```bash
node scripts/png-to-webp.mjs out/bulwark-symbols public/assets/specialty-card
```

Reload `/specialty-preview` — the three unit cards now show their creatures. (The
shipped symbols were made the same way: spell symbols are the transparent Homm3BG
art, Diplomacy is the supplied dove, Runes is the supplied emblem.)

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
