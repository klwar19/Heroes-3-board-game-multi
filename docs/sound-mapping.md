# Sound asset mapping

Source: Heroes III sound archive WAVs (IMA ADPCM, 22 kHz), converted to MP3
and renamed. Converted files live in
`public/sounds/{units,spells,effects,ui,adventure,music}/`, indexed by
`public/sounds/manifest.json`.

Identifications are **verified against the VCMI engine's data files** (the
open-source H3 engine), not guessed: `docs/h3-sound-reference.csv` maps all
~1000 original sound names to the creature/spell/event that uses them.

## Adding the next batch (instructions)

1. Upload the raw `*.wav` files to the repo root (any amount).
2. Run `node scripts/convert-h3-sounds.mjs` (needs `ffmpeg`:
   `sudo apt-get install ffmpeg`). It decodes each name via the reference CSV,
   converts to MP3, drops byte-identical duplicates within a creature, and
   rebuilds `manifest.json`. Unrecognized files are listed at the end and left
   in place for manual triage.
3. Delete the root WAVs (`git rm *.wav`) and commit `public/sounds` + docs.

## Naming convention of the originals

Creature sounds are a creature code + 4-letter action suffix:

| Suffix | Meaning | Our name | Notes |
|---|---|---|---|
| `ATTK` | melee attack | `-attack` | |
| `DFND` | defending / blocking | `-defend` | |
| `KILL` | dying | `-death` | |
| `MOVE` | moving | `-move` | **loop once (play twice) for a full movement** — encoded as `"repeat": 2` in the manifest |
| `WNCE` | wince — taking damage | `-hurt` | |
| `SHOT` | ranged attack | `-shoot` | |
| `EXT1`/`EXT2` | special ability | `-special` | |
| `DETH` | alternate death | `-death-alt` | only seen on Beholder so far |

## Playback rules (for when audio gets wired in)

- The manifest is the single source of truth: load it, play by id
  (`new Audio(manifest[id].src)`).
- Honor `"repeat"`: movement sounds play twice back-to-back per move.
- Battle music: pick one of `music/battle-00`…`07` at random per combat.
- Entries with a `"note"` are either unused in the original game (free for
  custom use: `effects/climax`, `spells/cold-ray`, `spells/cold-ring`,
  `units/centaur-shoot`) or carry usage caveats — read the note.
- The toast system in `src/components/adventure/screen.tsx` already names
  sound cues per event type; map those cue names to manifest ids when wiring.

## Batch 1 (A–BKNT, 100 files) — converted

Creatures (suffix set is attack/defend/death/move/hurt unless noted):

| Prefix | Creature | Faction | Notes |
|---|---|---|---|
| `AAGL` | Archangel | Castle | |
| `ADVL` | Arch Devil | Inferno | +special (`EXT2` was byte-identical to `EXT1`, dropped) |
| `AELM` | Air Elemental | Conflux | |
| `AGRM` | **Gremlin** (base, not Master) | Tower | +shoot — the shoot file is used by the Master Gremlin upgrade |
| `ALIZ` | Lizard Warrior | Fortress | +shoot |
| `AMAG` | Arch Mage | Tower | +shoot |
| `ANGL` | Angel | Castle | |
| `APEG` | Silver Pegasus | Rampart | |
| `AZUR` | Azure Dragon | Neutral | |
| `BALL` | Ballista (war machine) | — | shoot/hurt/death only |
| `BASL` | Basilisk | Fortress | |
| `BDRF` | Battle Dwarf | Rampart | |
| `BGOR` | Mighty Gorgon | Fortress | base Gorgon is `CGOR` (batch 2) |
| `BHDR` | Beholder | Dungeon | +shoot, +death-alt (`DETH`) |
| `BKDR` | Black Dragon | Dungeon | |
| `BKNT` | Black Knight | Necropolis | attack here; rest in batch 2 |

Spells: `AIRSHELD` air-shield, `ANIMDEAD` animate-dead, `ANTIMAGK` anti-magic,
`ARMGEDN` armageddon, `BERSERK` berserk, `BACKLASH` **magic-mirror**.

Effects: `ACID` acid-breath (Rust Dragon), `AGE` age (Ghost Dragon),
`BADLUCK` bad-luck, `BADMRLE` bad-morale, `BIND` bind (Dendroid).

Music: `BATTLE00`–`07` → `music/battle-00`…`07` (~7 s combat tracks, pick at
random).

## Batch 2 (BKNT–CRYS, 100 files) — converted

Creatures:

| Prefix | Creature | Faction | Notes |
|---|---|---|---|
| `BKNT` | Black Knight (rest) | Necropolis | |
| `BLRD` | Dread Knight | Necropolis | shares defend/death audio with Black Knight |
| `BMTH` | **Ancient** Behemoth | Stronghold | base Behemoth comes later |
| `BOAR` | Boar | Neutral | |
| `BODR` | Bone Dragon | Necropolis | |
| `BTRE` | Dendroid Soldier | Rampart | base Dendroid Guard is `TREE` |
| `CALF` | Master Genie | Tower | +shoot (its spell-cast) |
| `CART` | Ammo Cart (war machine) | — | hurt/death only |
| `CATA` | Catapult (war machine) | — | shoot/hurt/death only |
| `CAVA` | Cavalier | Castle | |
| `CCYC` | Cyclops | Stronghold | +shoot |
| `CERB` | Cerberus | Inferno | |
| `CGOR` | Gorgon (base) | Fortress | |
| `CHMP` | Champion | Castle | shares defend audio with Cavalier |
| `CHYD` | Chaos Hydra | Fortress | |
| `CNTR` | Centaur | Rampart | +shoot — **unused**, centaurs are melee |
| `CRUS` | Crusader | Castle | |
| `CRYS` | Crystal Dragon | Neutral | no `WNCE` yet — expect it in batch 3 |

Spells: `BLESS` bless, `BLIND` blind, `BLOODLUS` bloodlust, `CHAINLTE`
chain-lightning, `CLONE` clone, `CNTRSTRK` counterstrike, plus the unused
alternates `COLDRAY` cold-ray and `COLDRING` cold-ring (the game actually uses
`ICERAY`/`FROSTING` for Ice Bolt / Frost Ring).

UI / adventure: `BUTTON` ui/button (click), `CHAT` ui/chat (chat message),
`BUILDTWN` adventure/build-town (structure completed), `CHEST` adventure/chest
(treasure pickup), `CAVEHEAD` adventure/cave-visit (Subterranean Gate /
Quest Guard / Border Guard visit sound).

Unknown purpose: `CLIMAX` → `effects/climax` — present in the archive but
referenced nowhere in the engine; free to repurpose.

## Corrections vs the first pass

- `AGRM` is the base **Gremlin**, not Master Gremlin (files renamed).
- `BACKLASH` is the **Magic Mirror** spell (moved to `spells/magic-mirror`).
- `ACID` confirmed as Rust Dragon's **Acid Breath** (renamed `acid-breath`).
- `BGOR` = Mighty Gorgon confirmed (`CGOR` is the base Gorgon).
