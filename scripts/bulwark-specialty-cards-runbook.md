# Bulwark art runbook — town map tile + hero specialties (browser + Gemini)

End-to-end instructions to generate the missing **Bulwark** art and wire it in:

1. the **town map tile** (`S10`), drawn on the Tower snow tile as the base
   environment with a new Bulwark town (section **"Bulwark town map tile"** below);
2. the **18 hero-specialty cards** (6 heroes × levels **I / IV / VI**).

It mirrors `scripts/bulwark-cards-runbook.md` (the unit-card runbook) — same
tooling, same "copy a finished card/tile as the template" trick.

## Bulwark town map tile (S10)

The Bulwark starting tile `S10` (`src/data/map/expansion-tiles.ts`) has no art
yet, so the board draws it as bare snow terrain with glyph overlays. Generate its
face by **editing the Tower starting tile** — both are `snow` tiles, so reuse
Tower's whole environment and just swap the town.

**The hex code is already aligned (the "fix code for correct hexes" step is done).**
`S10`'s field arrangement and outer borders now mirror the Tower tile `#S1`
exactly (only the town's faction is `bulwark`), because a tile's field symbols are
baked into its art and the engine hides the glyph overlay once `assets.tileImage`
is set (see `renderTileArt` in `src/components/adventure/screen.tsx`). So the Tower
symbols in the base art already sit on the right engine hexes — do **not** move
them.

- **Base / template:** `public/assets/board/tiles/sx1.webp` (the Tower snow
  starting tile, `#S1`).
- **Output:** `public/assets/board/tiles/s10.webp`.

### Tile prompt (single-image EDIT of `sx1.webp`)

> This image is a finished hexagonal **map tile** from the **Heroes of Might &
> Magic III board game** — the Tower faction's snowy starting tile. EDIT it into
> the **Bulwark** faction's starting tile. This is a precise local edit, NOT a
> regeneration.
>
> Keep EVERYTHING except the central town building **100% identical and
> pixel-aligned**: the snowy mountain terrain, every field symbol and its exact
> position (the blocked rocky field, the two empty fields, the treasure chest, the
> resource symbol, the mine), the hex-flower shape, the cream/yellow outer border
> lines, and the overall lighting and palette. Do NOT move, restyle, recolor or
> redraw any of them.
>
> Change ONLY the central town: replace the Tower wizards' town with a **Bulwark
> frozen-Norse mountain town** — timber longhouses with steep snow-laden roofs,
> rune-carved standing stones, an icy stone palisade/wall, hearth-smoke and
> banners, nestled into the snow and rock. Match the EXACT art style, scale,
> perspective and lighting of the town it replaces so it sits naturally in the
> same footprint. Render crisp and print-quality at the original resolution and
> crop.

### Finalize + wire the tile

```bash
node scripts/png-to-webp.mjs out/bulwark-tile public/assets/board/tiles
```

Then add the art reference in `src/data/map/expansion-tiles.ts` (the `S10` entry
already notes this as its last step):

```ts
assets: { tileImage: "/assets/board/tiles/s10.webp" }
```

Confirm in-app that S10 shows the Bulwark town and the field symbols land on the
right hexes (mine, treasure, resource, blocked, two empties). Until the webp
exists, leave `assets` off so the board keeps drawing the (already-correct) glyph
overlay instead of a broken image.

## Hero specialty cards

End-to-end for the **18 Bulwark hero-specialty cards** (6 heroes × levels
**I / IV / VI**) in the game's real specialty-card style, then wire them into the
engine — the hero board's specialty track instead of unit faces.

This is a **card-art + wiring** task. The art itself is produced by Gemini
("Nano Banana", the Image tool) exactly like every other card face in this repo;
this file is the prompt set + the per-hero source table + the wire-up step. No
engine behaviour changes — the specialties already run and are tested; only their
printed faces are missing.

## What a specialty card is here

- A hero gains three specialty cards, at **levels I, IV and VI** (stored as `1`,
  `4`, `6`). See `HeroDefinition.specialtyCardIds` in
  `src/data/factions/types.ts` and the per-hero entries in
  `src/data/factions/core.ts`.
- Each one is a `CardLibrary` entry `specialty.<heroSlug>.<level>` in
  `src/data/cards/adventure.ts`, and its face lives at
  **`public/assets/hero_specialties-<heroSlug>-<level>.webp`**
  (the path the `specialtyCardImage(slug, level)` helper builds).
- 102 finished specialty cards for the base-game heroes already ship in
  `public/assets/` (e.g. `hero_specialties-adelaide-1.webp`). The Bulwark ones
  are the gap this runbook fills.

### The desired composition (per the owner)

> *use hero image and frame for I / IV / VI, and the correct picture for the
> specialty — unit, spell or ability — even a new one for rune.*

So every Bulwark specialty card is built from three things:

1. **The hero's portrait** (`public/assets/hero_portraits-<slug>.webp`) — so a
   glance tells you whose specialty it is.
2. **The specialty-card frame for that level** — copied from a finished
   reference specialty card of the matching level (I/IV/VI). The frame already
   carries the level numeral; you only swap the contents.
3. **The "specialty picture"** — what the hero specialises in:
   - **Unit** specialist → that unit's illustration.
   - **Spell** specialist → that spell's illustration.
   - **Ability** specialist → that ability's illustration.
   - **Rune** specialist (Kriv) → there is no creature/spell to show, so
     **create a new carved-rune emblem** (section D).

> Specialty cards do **not** use the bronze/silver/gold *unit* frames
> (`units-blank-*.webp`). Those are for unit faces. Always template a specialty
> card off another **specialty** card.

## Reference (template) cards — copy their frame/fonts/layout

Pick any finished specialty trio as the structural template and use the
level-matching one for each card. A clean, neutral choice:

| Level | Reference specialty card (frame template)   |
|-------|---------------------------------------------|
| I     | `public/assets/hero_specialties-alamar-1.webp` |
| IV    | `public/assets/hero_specialties-alamar-4.webp` |
| VI    | `public/assets/hero_specialties-alamar-6.webp` |

(Any `hero_specialties-<hero>-{1,4,6}.webp` trio works — they share one frame
format; the numeral and contents are all that change between I/IV/VI.)

## Before you start (browser + Gemini, exactly like the unit runbook)

This is a **browser** job — a specialty card composes **three** uploaded images
(reference card + hero portrait + specialty picture), which the single-image API
script (`edit-card-image.mjs`) cannot do. Drive Gemini over the browser with the
Playwright MCP, the same way the unit cards were made.

- `/mcp` must show `playwright · connected`.
- Open gemini.google.com once and sign in with the Gemini Pro account (the
  persistent browser profile remembers it afterward).
- Run from the repo root. Create the output folders `out/bulwark-tile/` and
  `out/bulwark-specialties/`.

## The loop — one image at a time, in the browser

Do everything yourself — **no sub-agents, no web fetching**; every file
referenced here is already local in this repo. For EACH card (and the tile):

1. Start a **fresh** Gemini chat (cleaner than reusing one). Enable the **Image**
   tool (`+` → "Image — create & edit", Nano Banana) so Gemini outputs an image.
2. Upload the source files **in the exact order the prompt lists them**: the tile
   = 1 image (`sx1.webp`); a specialty card = 3 images (reference card → hero
   portrait → specialty picture); Kriv's emblem first = the 3 rune icons.
3. Send the matching prompt below, with `{HERO}` / `{LEVEL}` / `{SPECIALTY_NAME}`
   filled in.
4. When the image appears, extract it full-res and **verify every field** (frame,
   title, level numeral, the hero likeness, the specialty picture). If anything
   is wrong, reply with a targeted fix (e.g. *"the numeral must read VI, not IV;
   change only that"*) and loop until exact. After ~3 bad tries, keep the best
   and note the card for a later pass so the batch status stays honest.
5. Save the approved PNG to the output path the section specifies, then move on.

## The 18 Bulwark specialty cards (verified from `src/data/cards/adventure.ts`)

`slug` → portrait `hero_portraits-<slug>.webp`; output
`hero_specialties-<slug>-<level>.webp`.

| Hero (slug) | Type | Specialty | Specialty picture source (upload) |
|-------------|------|-----------|-----------------------------------|
| **Dhuin** (`dhuin`) | Unit | Snow Elves (I/IV/VI) | `units-bulwark-bronze-snow_elves-few.webp` |
| **Creyle** (`creyle`) | Unit | Mammoths (I/IV/VI) | `units-bulwark-golden-mammoths-few.webp` |
| **Eikthurn** (`eikthurn`) | Unit | Yetis (I/IV/VI) | `units-bulwark-silver-yetis-few.webp` |
| **Glacius** (`glacius`) | Ability | Frost Ring (I/IV/VI) | `spells-frost_ring.webp` |
| **Oidana** (`oidana`) | Ability | Diplomacy (I/IV/VI) | `abilities-diplomacy.webp` |
| **Kriv** (`kriv`) | Rune | Runes (I/IV/VI) | new emblem — section D (style ref `runes-basic/advanced/expert.webp`) |

Level numerals to print on each card: **I** for the `-1` file, **IV** for `-4`,
**VI** for `-6`. The exact printed names are `Snow Elves I/IV/VI`,
`Mammoths I/IV/VI`, `Yetis I/IV/VI`, `Frost Ring I/IV/VI`, `Diplomacy I/IV/VI`,
`Runes I/IV/VI` (these match the `name` field on each `specialty.<slug>.<level>`
card — keep them identical).

> Optional, same recipe — the three Conflux specialists also lack faces:
> **Luna** (`luna`, Spell → `spells-fire_wall.webp`), **Ciele** (`ciele`,
> Spell → `spells-magic_arrow.webp`), **Tarnum** (`tarnum_conflux`, Ability →
> the Enchanters unit art). Do them after Bulwark if wanted.

## Prompt templates (the "prompt for CLI")

Each prompt uploads, in order: **Image 1** = the level-matching reference
specialty card (frame template), **Image 2** = the hero portrait, **Image 3** =
the specialty picture source. Fill `{HERO}`, `{LEVEL}` (`I`/`IV`/`VI`) and
`{SPECIALTY_NAME}`.

### A. Unit-specialist card (Dhuin, Creyle, Eikthurn)

> You are recreating a physical **hero-specialty card** from the **Heroes of
> Might & Magic III board game**. Match that set's look exactly.
>
> **Image 1** is a FINISHED official specialty card — treat it as the absolute
> template for everything structural: the frame, its color and bevels, the blue
> outer edge, the corner filigree, the title banner, the **level numeral badge**,
> the rules-text banner, and the small © footer. Reproduce its proportions,
> borders, fonts and colors EXACTLY — same card, only the contents change.
>
> **Image 2** is the portrait of the hero **{HERO}**. **Image 3** is the
> illustration of the creature this hero specialises in.
>
> Produce ONE finished specialty card, portrait orientation, high-resolution and
> crisp:
> - Compose the art window as the board game does for a **unit specialist**: the
>   hero **{HERO}** (from Image 2) as the figure, with the specialised creature
>   (from Image 3) shown alongside/behind them as the subject of the specialty.
>   Repaint both as a single cohesive, semi-realistic digital fantasy
>   illustration in the EXACT art style of Image 1 (clean Heroes III character
>   art — NOT oil painting, NOT cartoon, no visible brush texture). Keep the
>   hero recognisably the same person as Image 2 and the creature the same
>   species as Image 3. Fill the whole art window behind the frame.
> - Title banner: **{SPECIALTY_NAME} {LEVEL}**
> - Level numeral badge: **{LEVEL}** (the Roman numeral, matching Image 1's slot).
> - Rules-text banner: copy the wording from Image 1's banner position but leave
>   the specific effect text to be set later — render a clean empty banner if
>   unsure (do NOT invent numbers).
> Render every letter sharp and legible, frame pixel-aligned and symmetrical. Do
> NOT add watermarks, coins, gems, or any icon not present on Image 1.

### B. Ability-specialist card (Glacius — Frost Ring; Oidana — Diplomacy)

Same as A, but **Image 3** is the ability/spell illustration, and the art window
shows the hero invoking that ability:

> ...Compose the art window as the board game does for an **ability specialist**:
> the hero **{HERO}** (Image 2) foregrounded, wielding/channelling the
> **{SPECIALTY_NAME}** effect depicted in Image 3 (e.g. the ring of frost, or the
> diplomatic parley). One cohesive illustration in Image 1's exact style...
> (title **{SPECIALTY_NAME} {LEVEL}**, numeral **{LEVEL}**, same frame.)

### C. Spell-specialist card (Conflux: Luna — Fire Wall; Ciele — Magic Arrow)

Same as B, with **Image 3** = the spell card art, and the art window showing the
hero casting that spell.

### D. Rune-specialist card (Kriv) — first CREATE the rune emblem

Kriv specialises in the Bulwark **Runes** mechanic, which has no creature or
spell to show. Create a new emblem first, then build the three cards.

**D1 — generate the rune emblem** (upload the three existing rune icons
`runes-basic.webp`, `runes-advanced.webp`, `runes-expert.webp` as style
reference):

> Create a single high-resolution fantasy **emblem of carved Norse runestones**
> for a frozen-mountain (Bulwark) faction. Three or more glowing rune-carved
> standing stones / a rune-inscribed shield, icy-blue magical glow, snow and
> stone, dramatic lighting. Match the visual language of the uploaded rune icons
> (Image 1–3) but as one richer, card-ready illustration. Clean semi-realistic
> digital fantasy art, no text, transparent-friendly dark background. Square,
> centered, maximum detail.

Save it as `out/bulwark-specialties/runes-emblem.png`.

**D2 — build Kriv's three cards** using prompt **B**, but with **Image 3** =
`out/bulwark-specialties/runes-emblem.png`, hero `kriv`, specialty name `Runes`,
and the art window showing Kriv before the glowing runestones.

## Verify, then save

Extract each result full-res and check: the **frame matches Image 1**, the
**title reads `{SPECIALTY_NAME} {LEVEL}`**, the **numeral badge** is the right
Roman numeral, the hero is recognisable, and the specialty picture is correct.
Regenerate with a targeted note if any field is wrong (e.g. *"The numeral must
read VI, not IV; change only that."*). Save approved PNGs as
`out/bulwark-specialties/hero_specialties-<slug>-<level>.png`.

## Finalize: PNG → WebP

```bash
npm install -D sharp   # if not already present
node scripts/png-to-webp.mjs out/bulwark-specialties public/assets
```

Confirm the 18 (or 27 with Conflux) `hero_specialties-*.webp` files landed in
`public/assets/`.

## Wire it up (code change — do this AFTER the webp files exist)

The specialties already run; they just need their `cardImage` re-enabled so the
hero board stops drawing a blank slot (`CardArt` in
`src/components/hero-board.tsx` falls back to an empty slot when no image is
set). In `src/data/cards/adventure.ts`:

- **Dhuin, Creyle, Eikthurn** — these are built by the `mightSpecialtyOne` /
  `unitHealthSpecialty` / `unitInitiativeSpecialty` helpers (which already bake
  in `cardImage: specialtyCardImage(slug, level)`) but are wrapped in
  `withoutArt(...)`. **Remove the `withoutArt(...)` wrapper** on all six lines,
  e.g.:

  ```ts
  // before
  "specialty.dhuin.1": withoutArt(mightSpecialtyOne("dhuin", "Snow Elves", "Snow Elves")),
  // after
  "specialty.dhuin.1": mightSpecialtyOne("dhuin", "Snow Elves", "Snow Elves"),
  ```

- **Glacius, Oidana, Kriv** — these are inline objects with **no `assets`
  block**. Add one to each level, e.g.:

  ```ts
  assets: { cardImage: specialtyCardImage("glacius", 1), imageAlt: "Frost Ring I specialty" },
  ```

  (`specialtyCardImage` is already defined in this file; use the slug and the
  level `1`/`4`/`6`.)

Then verify in the app: open a Bulwark hero's board and confirm the I/IV/VI
specialty cards show the new faces. There is no automated test for card *art*
(it is presentational); the engine tests already cover the specialty *effects*.

## Honesty / status note

Until the webp files are generated and the `cardImage` paths are re-enabled, the
Bulwark specialty faces remain blank slots in the UI — the cards still **work**
mechanically. Do not mark the art "done" before the files exist and the wiring
above is in place; log any hero you skipped so the batch's status stays honest
(same rule as the unit runbook).
