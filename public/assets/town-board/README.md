# Town-board tile art drop folder

The Town window's **board view** (`src/components/adventure/town-board.tsx`,
manifest `src/data/towns/boards.ts`) renders every faction's physical town
board. Castle, Rampart, Inferno, Necropolis, Dungeon, Tower and Fortress use
the real printed scans (`/public/assets/towns-<faction>-{empty,full}.webp`,
fetched by `scripts/fetch-town-boards.py`) — nothing is needed here for them.

Stronghold now uses the genuine wiki empty/full scans under `/public/assets`
and reveals the full scan in seven aligned slices like the other Archon boards.
The remaining DESIGNED boards reveal aligned built strips over an empty scene.
Factory's active board face and seven built inserts are in
`/public/factory-cards/factory-board-*.webp`;
the older individual Factory tile crops in this folder are archival. **Cove and Conflux** now ship
printed portrait tiles here (`cove-*.webp` / `conflux-*.webp`); full empty/full
board scans with English definitions live at
`/assets/towns-{cove,conflux}-board-{empty,full}.webp` (pipeline under
`assets-to-translate/cove-conflux-town-boards/`). Bulwark now uses aligned
`bulwark-panorama-unbuilt.webp` and seven `bulwark-panorama-tile-N.webp`
construction inserts. The shared Glacial Halls / Sieidi slot reveals its built
half only until both stand; the Altar has its own slot. Dropping a correctly-named
file in here upgrades a bar automatically — that is the whole integration
contract, no code changes needed:

- **File name**: `<factionId>-<buildingKey>.webp` — the building id from
  `src/data/factions/core.ts` with its dot replaced by a dash.
  Examples: `conflux-city_hall.webp`, `factory-dwelling_bronze.webp`,
  `stronghold-hall_of_valhalla.webp`, `cove-mage_guild.webp`.
- **Shape**: a TALL portrait crop (the printed tiles are roughly 2:5, e.g.
  391×819 px) showing the building over its townscape; the board
  letterboxes/covers whatever it gets (`object-fit: cover`).
- **Shared (two-in-one) bar**: a faction may print a single DOUBLE-SIDED tile
  for its shared bar instead of two half-slots. That is wired
  as `combinedTile` in `src/data/towns/boards.ts` with two full-bar faces —
  `<factionId>-shared-one.webp` (exactly one of the pair built) and
  `<factionId>-shared-both.webp` (both built) — and rendered CRISP (never
  blurred) with a label naming which building is up and which is not while only
  one is built. The current Stronghold scan does not use this legacy path.
- **Generation prompt sketch** (Gemini / any image model): "Heroes of Might
  and Magic III board game town-board building tile, tall portrait crop,
  painted style matching the <faction> townscape, showing the <building>,
  dark parchment palette, no text" — then convert to WEBP (
  `python3 -c "from PIL import Image; Image.open('x.png').save('y.webp','WEBP',quality=90)"`).
- Missing/broken files are harmless: the view falls back to the built-town
  slice (where the board has one) or the plaque.

Factory now uses the continuous empty panorama and seven built strips in
`/public/factory-cards/`. Its building plaques use live names and costs, and
the lower five cards use compact descriptions of the implemented effects.

The designed boards' resource-track + token-well section is NOT drawn in CSS
anymore: they paste the authentic printed panel cropped from the Stronghold
fan scan (`/public/assets/town-tracks-panel.webp`, produced by
`scripts/crop-town-tracks-panel.py`).

To promote a faction from a designed board to real scans later, save the
scans as `towns-<faction>-empty.webp` / `towns-<faction>-full.webp` under
`/public/assets` and point that faction's entry in `src/data/towns/boards.ts`
at them (`emptyImage`/`fullImage`, and transcribe its printed `bars` order).
The bar/track/token geometry fractions are documented in that file.
