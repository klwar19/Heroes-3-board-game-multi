# Sound asset library

Complete Heroes III sound archive (~1000 IMA ADPCM WAVs) converted to web
MP3s, renamed, and sorted. Every identification is **verified against the
VCMI engine's data files** (the open-source H3 engine) — see
`docs/h3-sound-reference.csv` for the full original-name → entity table.

- Files: `public/sounds/<category>/<name>.mp3`
- Index: `public/sounds/manifest.json` — **the single source of truth** for
  playback. Each entry: `{ src, repeat?, loop?, note? }`.
- Converter: `scripts/convert-h3-sounds.mjs` (drop new WAVs in the repo root,
  run with node; needs `ffmpeg`).

## Library layout (1012 sounds)

| Category | Count | Contents |
|---|---|---|
| `units/` | 765 | 144 creatures + war machines (ballista, catapult, ammo cart, first aid tent), `<creature>-<action>` |
| `spells/` | 76 | one per spell (cast sound); `-hit` variants for fireball/ice-bolt impacts |
| `ambient/` | 71 | looping map-object/dwelling ambience (taverns, dwellings, monoliths, volcano…) |
| `adventure/` | 56 | map events: pickups, new day/week/month, object visits, horse movement per terrain, level-up, Grail dig |
| `effects/` | 33 | battle effects: luck/morale triggers, siege (wall hit/miss, keep shot, drawbridge), ability procs (fear, regeneration, mana drain, spell fizzle…) |
| `music/` | 8 | battle tracks 00–07, pick one at random per combat |
| `ui/` | 7 | button, chat, system message, your-turn, player joined/left, time-over |

## Creature sound actions

`units/<creature>-<action>`, decoded from the original 4-letter suffixes:

| Suffix | Our name | Notes |
|---|---|---|
| `ATTK` | `-attack` | melee attack |
| `SHOT` | `-shoot` | ranged attack |
| `DFND` | `-defend` | blocking |
| `WNCE` | `-hurt` | taking damage |
| `KILL` | `-death` | dying |
| `MOVE` | `-move` | **loop once (play twice) per full movement** — `"repeat": 2` in the manifest |
| `EXT1`/`EXT2` | `-special` | abilities (e.g. devil teleport, genie/faerie-dragon spell-cast) |
| `DETH` | `-death-alt` | alternate death (Beholder, Evil Eye) |

## Playback rules (for wiring audio later)

- Load the manifest, play by id; never hardcode paths.
- `"repeat": 2` → play the clip twice back-to-back (movement sounds).
- `"loop": true` → loop until stopped (ambience, battle music, horse riding).
- Random pools: `music/battle-00`–`07` per combat; `adventure/pickup-01`–`07`
  per pickup.
- Entries with `"note"` carry identification caveats or "unused — free to
  repurpose" flags.
- The toast system in `src/components/adventure/screen.tsx` already names
  sound cues per event; map those cue names to manifest ids when wiring.

## App roster coverage

Every unit currently in the app has a full sound set. Non-obvious id
mappings: dendroids → `dendroid-soldier`, marksmen → `archer` (the original
game shares Archer files with Marksman), elves → `wood-elf`, zombies →
`zombie-lord` (same files serve the base Walking Dead), efreet →
`efreet`/`efreet-sultan`, cerberi → `cerberus`. Everything else is the
singular kebab-case of the app name. Creatures not in the app yet (gnolls,
ogres, rocs, titans, nagas, the full Conflux/Stronghold/Tower rosters, etc.)
are converted and ready under the same pattern.

## Known oddities & uncertain identifications

Verified-but-shared audio: Dread Knight reuses Black Knight defend/death;
Champion reuses Cavalier defend; Gog's shoot equals its attack;
`LICHATK` is kept as `units/lich-special` (area-attack variant).

Unused in the original game (free to repurpose): `spells/cold-ray`,
`spells/cold-ring` (the game casts Ice Bolt/Frost Ring with
`ICERAY`/`FROSTING`), `spells/haste-alt` (game uses `TAILWIND`),
`units/centaur-shoot` (centaurs are melee), `effects/climax`,
`effects/danger`, `effects/fire-storm`, `effects/dragon-slayer` (Slayer casts
with `SLAYER`), `effects/dragon-hall`.

Still unidentified (converted, raw names kept): `effects/dipmagk`,
`effects/magcarow`, `effects/magchdrn`, `effects/magchfil`,
`effects/mnrdeath`, `effects/mirror-image` (possibly Magic Mirror
reflection), `ambient/storm`, and the object-visit cues
`adventure/{military,mystery,nomad,rogue,store,protect,get-protection}` —
all flagged with `(uncertain)`/`unknown` notes in the manifest. Listen and
rename if you can place them.

## Conversion settings & history

`ffmpeg -codec:a libmp3lame -q:a 5`, original 22 kHz sample rate kept
(~55% smaller than the source ADPCM WAVs and browser-playable everywhere).
Uploaded and converted in four batches (100 + 100 + 100 + 714 files,
2026-06). Byte-identical `EXT2` duplicates dropped (Arch Devil, Devil);
all other duplication kept so every id resolves.
