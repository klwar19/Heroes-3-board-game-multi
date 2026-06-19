# sounds-incoming — drop raw H3 / HotA sounds here

This is the upload folder for the sound pipeline. Put raw `.wav` files in here
(or in the repo root) and run the converter:

```bash
node scripts/convert-h3-sounds.mjs      # needs ffmpeg on PATH
```

The script:

1. scans this folder **recursively** (so the HotA sound-archive folder layout
   works untouched) plus loose `.wav` drops in the repo root,
2. looks each file's 8-character name up in `docs/h3-sound-reference.csv`
   (identifications taken from the VCMI engine / VCMI HotA port — never guessed),
3. transcodes it to `public/sounds/<category>/<kebab-name>.mp3`, and
4. rebuilds `public/sounds/manifest.json`.

Anything whose name is not in the reference is **left in place** and printed
under `UNRESOLVED` at the end — nothing is silently misnamed.

The `.wav`/`.mp3` files you drop here are git-ignored (they are build input,
not committed assets); only the converted MP3s under `public/sounds/` are
committed.

## How the names decode

A creature file is `<4-letter creature><4-letter action>.wav`, e.g.
`ARMAATTK` = Armadillo + attack → `units/armadillo-attack.mp3`,
`AELMWNCE` = Air Elemental + wince → `units/air-elemental-hurt.mp3`.

| Suffix | Action          | Suffix | Action            |
|--------|-----------------|--------|-------------------|
| `ATTK` | attack          | `MOVE`  | move (loops once) |
| `SHOT` | shoot           | `WNCE`  | hurt              |
| `DFND` | defend          | `KILL`  | death             |
| `EXT1` | special / move-start | `EXT2` | special-2 / move-end |
| `DETH` | death-alt       |        |                   |

See `docs/sound-mapping.md` for the full library layout and the HotA additions.
