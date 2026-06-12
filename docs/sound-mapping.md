# Sound asset mapping

Source: Heroes III sound archive WAVs (IMA ADPCM, 22 kHz), converted to MP3
(`ffmpeg -q:a 5`, ~45% smaller and browser-playable everywhere) and renamed.
Converted files live in `public/sounds/{units,spells,effects,music}/`.

## Naming convention of the originals

Creature sounds are `PREFIX` (4-letter creature code) + `SUFFIX` (4-letter action):

| Suffix | Meaning | Our name |
|---|---|---|
| `ATTK` | melee attack | `-attack` |
| `DFND` | defending / blocking | `-defend` |
| `KILL` | dying | `-death` |
| `MOVE` | moving | `-move` |
| `WNCE` | wince — taking damage | `-hurt` |
| `SHOT` | ranged attack | `-shoot` |
| `EXT1`/`EXT2` | special ability | `-special` |
| `DETH` | alternate death (only seen on BHDR) | `-death-alt` |

An upgrade is often the base creature's code with an `A` in front
(`ANGL` → angel, `AAGL` → archangel; `MAG` → `AMAG` arch mage).

## Creature prefixes in this batch (batch 1: A–BKNT)

| Prefix | Creature | Faction | Files |
|---|---|---|---|
| `AAGL` | Archangel | Castle | attack, defend, death, move, hurt |
| `ADVL` | Arch Devil | Inferno | attack, defend, death, move, hurt, special (EXT2 was a byte-identical duplicate of EXT1 — dropped) |
| `AELM` | Air Elemental | Conflux/neutral | attack, defend, death, move, hurt |
| `AGRM` | Master Gremlin | Tower | attack, defend, death, move, hurt, shoot |
| `ALIZ` | Lizard Warrior | Fortress | attack, defend, death, move, hurt, shoot |
| `AMAG` | Arch Mage | Tower | attack, defend, death, move, hurt, shoot |
| `ANGL` | Angel | Castle | attack, defend, death, move, hurt |
| `APEG` | Silver Pegasus | Rampart | attack, defend, death, move, hurt |
| `AZUR` | Azure Dragon | Neutral | attack, defend, death, move, hurt |
| `BALL` | Ballista (war machine) | — | shoot, hurt, death (destroyed) |
| `BASL` | Basilisk | Fortress | attack, defend, death, move, hurt |
| `BDRF` | Battle Dwarf | Rampart | attack, defend, death, move, hurt |
| `BGOR` | Mighty Gorgon (see ⚠ below) | Fortress | attack, defend, death, move, hurt |
| `BHDR` | Beholder | Dungeon | attack, defend, death, death-alt, move, hurt, shoot |
| `BKDR` | Black Dragon | Dungeon | attack, defend, death, move, hurt |
| `BKNT` | Black Knight | Necropolis | attack (only file in this batch) |

## Spells

| Original | New file | Spell |
|---|---|---|
| `AIRSHELD` | `spells/air-shield.mp3` | Air Shield |
| `ANIMDEAD` | `spells/animate-dead.mp3` | Animate Dead |
| `ANTIMAGK` | `spells/anti-magic.mp3` | Anti-Magic |
| `ARMGEDN` | `spells/armageddon.mp3` | Armageddon |
| `BERSERK` | `spells/berserk.mp3` | Berserk |

## Combat effects / events

| Original | New file | What it is |
|---|---|---|
| `ACID` | `effects/acid.mp3` | Acid effect (Rust Dragon acid breath — see ⚠) |
| `AGE` | `effects/age.mp3` | Aging effect (Ghost Dragon ability) |
| `BACKLASH` | `effects/backlash.mp3` | Magic backlash (see ⚠) |
| `BADLUCK` | `effects/bad-luck.mp3` | Bad luck triggers in combat |
| `BADMRLE` | `effects/bad-morale.mp3` | Bad morale — stack freezes |
| `BIND` | `effects/bind.mp3` | Bind (Dendroid root ability) |

## Music / ambience

`BATTLE00`–`BATTLE07` → `music/battle-00.mp3` … `battle-07.mp3` — eight short
(~7 s) stereo combat tracks; the game picks one at random per battle.

## ⚠ Uncertain identifications

These are best guesses — verify by listening:

- **`BGOR`** — definitely a Gorgon, but unclear whether the base Gorgon or the
  Mighty Gorgon upgrade. Named `mighty-gorgon` for now; rename if the base
  Gorgon's files (`CGOR`? `GGOR`?) turn up in a later batch.
- **`BHDRDETH` vs `BHDRKILL`** — Beholder has two distinct death sounds.
  `KILL` is the standard slot, so it got `-death` and `DETH` got `-death-alt`.
  Listen to both to decide which the game should use.
- **`ACID`** — acid splash; most likely the Rust Dragon's acid breath, but
  could be a generic acid/poison effect.
- **`BACKLASH`** — guessing this is a spell-backfire / magic-mirror style
  effect; not certain what triggers it in the original game.
- **`AGRM` = Master Gremlin, `ALIZ` = Lizard Warrior, `APEG` = Silver
  Pegasus** — inferred from the "`A` + base code = upgrade" pattern plus the
  presence/absence of `SHOT` files. High confidence but worth a listen.
