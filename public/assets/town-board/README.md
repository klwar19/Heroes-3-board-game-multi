# Town-board tile art drop folder

The Town window's **board view** (`src/components/adventure/town-board.tsx`,
manifest `src/data/towns/boards.ts`) renders every faction's physical town
board. Castle, Rampart, Inferno, Necropolis, Dungeon, Tower and Fortress use
the real printed scans (`/public/assets/towns-<faction>-{empty,full}.webp`,
fetched by `scripts/fetch-town-boards.py`) — nothing is needed here for them.

Stronghold (fan empty board, no fully-built scan) and the four DESIGNED boards
(Conflux, Cove, Bulwark, Factory) overlay per-building tile art from THIS
folder on every built bar. Stronghold and Factory ship a complete set of the
REAL printed board-game tiles (all eight Stronghold buildings — the six single
bars plus the shared bar's two faces, below); Conflux, Cove and Bulwark
currently have none, so their built bars fall back to the aligned slice of the
fully-built townscape (`fullImage`), then to a styled plaque. Dropping a
correctly-named file in here upgrades a bar automatically — that is the whole
integration contract, no code changes needed:

- **File name**: `<factionId>-<buildingKey>.webp` — the building id from
  `src/data/factions/core.ts` with its dot replaced by a dash.
  Examples: `conflux-city_hall.webp`, `factory-dwelling_bronze.webp`,
  `stronghold-hall_of_valhalla.webp`, `cove-mage_guild.webp`.
- **Shape**: a TALL portrait crop (the printed tiles are roughly 2:5, e.g.
  391×819 px) showing the building over its townscape; the board
  letterboxes/covers whatever it gets (`object-fit: cover`).
- **Shared (two-in-one) bar**: a faction may print a single DOUBLE-SIDED tile
  for its shared bar instead of two half-slots (Stronghold does). That is wired
  as `combinedTile` in `src/data/towns/boards.ts` with two full-bar faces —
  `<factionId>-shared-one.webp` (exactly one of the pair built) and
  `<factionId>-shared-both.webp` (both built) — and rendered CRISP (never
  blurred) with a label naming which building is up and which is not while only
  one is built. Stronghold's pair is Barracks Tower + Freelancer's Guild.
- **Generation prompt sketch** (Gemini / any image model): "Heroes of Might
  and Magic III board game town-board building tile, tall portrait crop,
  painted style matching the <faction> townscape, showing the <building>,
  dark parchment palette, no text" — then convert to WEBP (
  `python3 -c "from PIL import Image; Image.open('x.png').save('y.webp','WEBP',quality=90)"`).
- Missing/broken files are harmless: the view falls back to the built-town
  slice (where the board has one) or the plaque.

The designed boards' resource-track + token-well section is NOT drawn in CSS
anymore: they paste the authentic printed panel cropped from the Stronghold
fan scan (`/public/assets/town-tracks-panel.webp`, produced by
`scripts/crop-town-tracks-panel.py`).

To promote a faction from a designed board to real scans later, save the
scans as `towns-<faction>-empty.webp` / `towns-<faction>-full.webp` under
`/public/assets` and point that faction's entry in `src/data/towns/boards.ts`
at them (`emptyImage`/`fullImage`, and transcribe its printed `bars` order).
The bar/track/token geometry fractions are documented in that file.
