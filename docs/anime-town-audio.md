# Anime town combat audio

This pack gives every unit in Azure Breeze, Hidden Leaf Village, and Heavenly
Demon Palace a complete action set. That is 109 files: attack, defend, hurt,
death, and move for all 21 units, plus shoot for the four ranged units.

## Sound design

- Azure Breeze uses clean sword attacks and blocks for the martial units,
  light spell effects for the Spirit Crane and Core Formation Master, and the
  existing H3 body voices where they already suit the creature.
- Hidden Leaf uses the Naruto collection's jutsu, kunai, dash, fire-style,
  chakra, ward, impact, and Chidori cues. These are layered over the existing
  fitting H3 body/impact sounds so hurt, death, and large summons remain clear
  during rapid board-game combat.
- Heavenly Demon uses ghost moans, monster vocals, spell effects, sword
  attacks, and blocks. The H3 vampire/undead/demon recordings remain as body
  layers where they fit the unit rather than being discarded solely for being
  old.

## Internet sources

Sources were retrieved on 2026-07-22.

- StarNinjas, [20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes), CC0.
- JaggedStone, [Magic Spell SFX](https://opengameart.org/content/magic-spell-sfx), CC0.
- Ogrebane, [Monster Sound Effects Pack](https://opengameart.org/content/monster-sound-effects-pack), CC0.
- qubodup, [Ghost Monster Voice Moaning and Growling](https://opengameart.org/content/ghost-monster-voice-moaning-growling), CC0.
- [SoundDino Naruto SFX](https://sounddino.com/en/effects/naruto/) for the
  Hidden Leaf ninja layer. The source page describes these MP3s as royalty-free,
  no-signup downloads intended for fan content and game development. Confirm
  that site's current terms before commercial redistribution.
- Existing Heroes III-derived creature clips already present in this project,
  retained as permitted body layers when they fit the unit.

## Output format

All new files are mono MP3 at 32 kHz and 48 kbit/s CBR. Processing trims each
cue to at most 2.35 seconds (2.8 seconds for death, 1.7 seconds for movement),
removes leading silence, filters unusable low/high frequencies, limits peaks,
and normalizes perceived loudness to -18 LUFS. The full 109-file pack is about
762 KiB.

Manifest keys follow `units/<town>-<unit>-<action>`. The resolver and tests
require dedicated keys for every action, including shoot for Core Formation
Master, Anbu Black Ops, Jonin, and Gu Witches.
