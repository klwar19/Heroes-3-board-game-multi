# Sound asset library

Complete Heroes III sound archive (~1000 IMA ADPCM WAVs) converted to web
MP3s, renamed, and sorted. Every identification is **verified against the
VCMI engine's data files** (the open-source H3 engine) — see
`docs/h3-sound-reference.csv` for the full original-name → entity table.

- Files: `public/sounds/<category>/<name>.mp3`
- Index: `public/sounds/manifest.json` — **the single source of truth** for
  playback. Each entry: `{ src, repeat?, loop?, note? }`.
- Converter: `scripts/convert-h3-sounds.mjs` (drop new WAVs in `sounds-incoming/`
  — scanned recursively — or the repo root, then run with node; needs `ffmpeg`).
  Unrecognised names are reported under `UNRESOLVED` and left untouched.

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

## Playback rules

`playLibrarySound` in `src/lib/sound.ts` loads the manifest and plays by id:

- `"repeat": 2` → plays the clip twice back-to-back (movement sounds). Wired.
- `"random": [<ids>]` → virtual entry, picks one member at random:
  `music/battle` (8 tracks, per combat) and `adventure/pickup` (7 versions).
  Wired.
- `"loop": true` → loop until stopped (ambience, battle music, horse
  riding). Not wired yet.
- `"then": <id>` → chain the second sound right after the first finishes
  (lich attack/shoot → death-cloud impact, magog attack/shoot → fireball
  explosion). Deliberately **not** auto-chained: those impacts play through
  `abilityFxPlans` only when the splash ability actually triggers, so
  chaining them onto every strike would double the explosion.
- Entries with `"note"` carry identification caveats or "unused — free to
  repurpose" flags.
- The toast system in `src/components/adventure/screen.tsx` already names
  sound cues per event; map those cue names to manifest ids when wiring.

## Creature combat voices (wired)

`src/data/unit-sounds.ts` maps every unit definition id onto its creature
voice; `src/app/page.tsx` plays the clips off combat events: card placement
and movement (`-move`), melee strike (`-attack`), ranged strike (`-shoot`),
taking damage (`-hurt`), taking the defense action (`-defend`) and dying
(`-death`). `src/data/unit-sounds.test.ts` proves the whole roster resolves
to clips that exist on disk.

## Creature ability cues

When a creature ability triggers in the board game (casts, procs, auras),
play the matching sound:

| Ability | Sound id |
|---|---|
| Faerie Dragon turn-start magic damage | `units/faerie-dragon-special` |
| Genie / Master Genie casting | `units/genie-special` |
| Lich / Power Lich death-cloud attack | automatic via `then` on attack/shoot |
| Magog fireball attack | automatic via `then` on attack/shoot |
| Devil / Arch Devil special | `units/devil-special`, `units/arch-devil-special` |
| Mighty Gorgon death stare | `spells/death-stare` |
| Ghost Dragon aging | `effects/age` |
| Rust Dragon acid breath | `effects/acid-breath` |
| Azure Dragon fear | `effects/fear` |
| Dendroid bind | `effects/bind` |
| Vampire Lord life drain | `effects/drain-life` |
| Troll / Wight regeneration | `effects/regeneration` |
| Unicorn blinding strike | `spells/blind` |
| Basilisk / Medusa petrify | `spells/paralyze` (doubles as stone gaze) |
| Wyvern Monarch poison | `spells/poison` |
| Zombie disease | `spells/disease` |
| Mummy / Black Knight curse | `spells/curse` |
| Serpent Fly dispel | `spells/dispel` |
| Dragon Fly weakness | `spells/weakness` |
| Thunderbird lightning strike | `spells/lightning-bolt` |
| Magic resistance proc | `effects/magic-resist` |

## App roster coverage

Every unit currently in the app has a full sound set, and the mapping lives
in code at `src/data/unit-sounds.ts`. Non-obvious id
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

## Horn of the Abyss (HotA) additions

HotA's Cove and Factory creature/spell/dwelling sounds are wired into the
converter the same way as the base game. Identifications come from the VCMI
HotA port (`vcmi-mods/horn-of-the-abyss`, branch `vcmi-1.7`) — its creature,
spell and dwelling JSON name every `.wav` — so nothing here is guessed.
`src/data/hota-sound-mapping.test.ts` asserts each of these resolves; remove a
reference row and its case fails.

To add them: drop the HotA `.wav` files into `sounds-incoming/` and run the
converter. Decoding is identical — `<4-letter creature><4-letter action>`, e.g.
`ARMAATTK` → `units/armadillo-attack`.

**Creature voices** (one sound set per prefix; the upgrade reuses the base
creature's set, matching the base-game convention like Marksman→Archer):

| Prefix | File name | Used by |
|---|---|---|
| `NIMP` | `units/nymph-*` | Nymph, Oceanid (`EXT1/EXT2` = move-start/-end) |
| `SAYL` | `units/crew-mate-*` | Crew Mate, Seaman |
| `PIRT` | `units/pirate-*` | Pirate, Corsair, Sea Dog |
| `ASSI` | `units/stormbird-*` | Stormbird, Ayssid |
| `SORC` | `units/sea-witch-*` | Sea Witch, Sorceress |
| `NIXX` | `units/nix-*` | Nix, Nix Warrior |
| `ASPI` | `units/sea-serpent-*` | Sea Serpent, Haspid |
| `MECH` | `units/mechanic-*` | Mechanic, Engineer |
| `ARMA` | `units/armadillo-*` | Armadillo, Bellwether Armadillo |
| `AUTO` | `units/automaton-*` | Automaton, Sentinel Automaton |
| `WORM` | `units/sandworm-*` | Sandworm, Olgoi-Khorkhoi, Larva (`EXT1/EXT2` = burrow/surface) |
| `GUNS` | `units/gunslinger-*` | Gunslinger, Bounty Hunter |
| `COTL` | `units/couatl-*` | Couatl |
| `CCOT` | `units/crimson-couatl-*` | Crimson Couatl (distinct set from `COTL`) |
| `DRED` | `units/dreadnought-*` | Dreadnought, Juggernaut |
| `HALG` | `units/halfling-grenadier-shoot` | Halfling Grenadier ranged shot only |

Factory's basic **Halfling is `core:halfling`**, so it reuses the base-game
`HALF*` files (`units/halfling-*`) — only the Grenadier's `HALGSHOT` is new.

**Ability sounds** (filed under `spells/` as cast sounds):
`GRENEXPL` → `spells/grenade` (Halfling Grenadier / Bounty Hunter),
`REPAIR` → `spells/repair` (Factory mechanical-unit heal).

**Dwelling ambiences** (`ambient/`, looped): `LOOPWTFL` → `nymph-waterfall`,
`LOOPMATR` → `cove-shack`, `LOOPFRIG` → `frigate`, `LOOPNIXF` → `nix-fort`,
`LOOPHASP` → `maelstrom`, `LOOPSORC` → `tower-of-the-seas`,
`LOOPHALF` → `halfling-adobe`, `LOOPGUNS` → `watchtower`,
`LOOPCOTL` → `serpentarium`. The Stormbird Nest reuses base `LOOPBIRD`
(`ambient/birds`).

None of these HotA creatures are in the board-game roster yet, so — like the
other "not in the app" creatures — the clips are converted and indexed but not
wired to any unit in `src/data/unit-sounds.ts`. Wiring is a separate step for
when/if a HotA creature is added to the game.

## Conversion settings & history

`ffmpeg -codec:a libmp3lame -q:a 5`, original 22 kHz sample rate kept
(~55% smaller than the source ADPCM WAVs and browser-playable everywhere).
Uploaded and converted in four batches (100 + 100 + 100 + 714 files,
2026-06). Byte-identical `EXT2` duplicates dropped (Arch Devil, Devil);
all other duplication kept so every id resolves.
