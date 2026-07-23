# Anime town combat audio

This pack gives every unit in Azure Breeze, Hidden Leaf Village, and Heavenly
Demon Palace a complete action set. That is 109 files: attack, defend, hurt,
death, and move for all 21 units, plus shoot for the four ranged units.

Azur Lane Naval Base is NOT part of this pack: its shipgirls (and the Belfast
commander) speak their own Japanese combat lines under
`public/sounds/azur-lane/voices/` — see `public/sounds/azur-lane/README.md`
for the event mapping (attack+shoot share Skill Activation, defend+hurt share
Low HP) and licensing caveats. Fuyuki City still reuses Heroes III voice sets.

## Sound design

- Azure Breeze uses clean sword attacks and blocks for the martial units,
  light spell effects for the Spirit Crane and Core Formation Master, and the
  existing H3 body voices where they already suit the creature.
- Hidden Leaf's attack, defend, and shoot cues use the Naruto collection's
  jutsu, kunai, dash, fire-style, chakra, ward, impact, and Chidori sounds,
  layered over fitting Heroes III body/impact sounds. The movement cues and
  three units' pain/death voices were rebuilt from the CC0 OpenGameArt sources
  below so every unit is distinct and correctly gendered:
  - Movement is per-unit and no longer shared: Genin Squad = a quick, light,
    pitched-up multi-footstep scamper and Medical-Nin = softer, fewer quick
    steps (both from Fantozzi's Footsteps); Anbu Black Ops = a single sharp,
    near-silent body-flicker whoosh and Jonin = a heavier two-stage committed
    dash (both from the Swishes pack); Jinchuriki = a heavy low chakra-surge
    rumble with a bestial roar (a Swishes whoosh pitched down, a creature roar,
    and a sub-bass swell). Giant Toad and Susanoo Avatar keep their existing,
    already-distinct move cues.
  - Medical-Nin's hurt and death are now clearly female (cicifyre's female
    voice pack). Anbu Black Ops and Jonin now use clearly male grunts
    (thebardofblasphemy's male death/pain grunts) — replacing the previous
    mismatched clips, including Jonin's hurt/death, which had been byte-identical
    to Azure Breeze's Core Formation Master. Anbu's are pitched down and muffled
    for a restrained operative; Jonin's are kept firm and clear.
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

The following CC0 sources were added on 2026-07-23 for the Hidden Leaf
movement/voice rebuild (per-unit moves; female Medical-Nin; male Anbu/Jonin):

- cicifyre, [Female RPG Voice Starter Pack](https://opengameart.org/content/female-rpg-voice-starter-pack), CC0. (Medical-Nin hurt/death, voice "Type 3".)
- thebardofblasphemy, [grunts of male death and pain](https://opengameart.org/content/grunts-male-death-and-pain), CC0. (Anbu and Jonin hurt/death.)
- artisticdude, [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack), CC0. (Anbu, Jonin, and Jinchuriki movement whooshes.)
- Fantozzi (submitted by qubodup), [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone), CC0. (Genin Squad and Medical-Nin footstep moves.)
- rubberduck, [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx), CC0. (Jinchuriki move roar layer.)

## Output format

All new files are mono MP3 at 32 kHz and 48 kbit/s CBR. Processing trims each
cue to at most 2.35 seconds (2.8 seconds for death, 1.7 seconds for movement),
removes leading silence, filters unusable low/high frequencies, limits peaks,
and normalizes perceived loudness to -18 LUFS. The full 109-file pack is about
739 KiB.

Manifest keys follow `units/<town>-<unit>-<action>`. The resolver and tests
require dedicated keys for every action, including shoot for Core Formation
Master, Anbu Black Ops, Jonin, and Gu Witches.
