# Anime town combat audio

This pack gives every unit in Azure Breeze, Hidden Leaf Village, and Heavenly
Demon Palace a complete action set. That is 109 files: attack, defend, hurt,
death, and move for all 21 units, plus shoot for the four ranged units.

Azur Lane Naval Base is NOT part of this pack: its shipgirls (and the Belfast
commander) speak their own Japanese combat lines under
`public/sounds/azur-lane/voices/` — see `public/sounds/azur-lane/README.md`
for the event mapping (attack+shoot share Skill Activation, defend+hurt share
Low HP) and licensing caveats.

Fuyuki City is also separate from this curated pack. Its seven Servant lines
use 37 normalized clips from Fate/unlimited codes under
`public/sounds/fuyuki/voices/`: five distinct core actions per line, plus named
ranged attacks for EMIYA/Archers and Medea/Casters. See
`public/sounds/fuyuki/README.md` for the exact character and source-file map.
The former Heroes III assignments remain only as missing-asset fallbacks.

## Sound design

- Azure Breeze (righteous wuxia sword sect) was rebuilt per unit so a gold
  prodigy no longer sounds like a bronze trainee and every human voice reads
  clearly male. The sword-cultivators' and the Master's pain/death voices are
  pitched-down takes from HaelDB's four-vocalist male yelling pack (with
  thebardofblasphemy's male grunts as occasional grit), tuned per unit; the
  three former Outer-Disciple/True-Inheritor byte-identical pairs (move, hurt,
  death) are gone.
  - Outer Disciples (bronze trainees): light unison sword swishes with a faint
    young-male kiai (attack), a light metal parry (defend), a young clearly-male
    voice for hurt and death, and a light multi-step group-footwork move.
  - Inner Swordsmen (bronze): a sharper single-blade unsheathe/ring with a
    confident male kiai (attack) and a clear confident-male voice for hurt and
    death; the step-slide move is kept.
  - Sect Protectors (silver, armored): a weighty blade with armor clank and firm
    effort (attack), a shield/parry block with a metal ring (defend), a firm
    clearly-male voice for hurt and death (no longer female-range), and armored
    footsteps (move).
  - Mountain Guardian (silver tank): a deep stone impact under a low grunt
    (attack) and a deep clearly-male groan for hurt and death; its existing
    distinct stone-block defend and ground-heavy move are kept.
  - Spirit Crane (silver flyer): REAL bald-eagle cries for attack, hurt, and
    death, plus a wing-flap guard (defend) and a rhythmic wing-flap move built
    from a heavy-cloth flap — replacing the former generic spell blips.
  - True Inheritors (gold prodigies): refined "sword qi" — a blade whoosh
    layered with a bell-ring shimmer and a controlled male kiai (attack), a
    refined parry with shimmer (defend), a controlled clearly-male voice with a
    faint shimmer for hurt and death, and a swift shimmer-tailed move. It now
    clearly outranks the Outer Disciples sonically.
  - Core Formation Master (gold ranged caster): its qi-blast attack and shoot
    and its qi-ward defend are kept; hurt and death are now an aged, thin,
    clearly-male voice (pitched down with a slight tremor), with a robe-whoosh +
    light chime move.
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
- Heavenly Demon (demonic modao cult) was rebuilt so the lifeless units are
  voiceless, the living fanatics snarl in a clearly-male register, the witches
  keep their female identity, and the skeletal unit rattles bone. Wooden, metal,
  armor and monster body textures come from artisticdude's RPG Sound Pack, bone
  clatter from congusbongus's Bones rattle, and roars/insect buzz/venom spit
  from rubberduck's creature pack.
  - Blood Disciples (bronze fanatics): wet visceral blade contact with an
    aggressive male snarl (attack), a wet block (defend), an aggressive
    clearly-male snarl for hurt and death (replacing the former high shriek),
    and a hungry lunging whoosh (move).
  - Gu Witches (bronze ranged): the female cackle/pain identity is preserved —
    the female hurt is kept, and the death is a clearly-female cry over an
    insect buzz (was voiceless). Attack, defend, move and the venom-spit shoot
    now carry insect-swarm buzz layers.
  - Shadow Wraiths (bronze): the existing breathy wail attack and hurt are kept;
    a breathy spectral wail is added for death, and an airy fast whoosh for move.
  - Corpse Puppets (silver): now lifeless/voiceless — a dull heavy wooden thud
    (attack), a wooden creak block (defend), a wooden/bone creak (hurt), and a
    wooden collapse with bone clatter (death); the dragging shuffle move is kept.
  - Bone Reavers (silver): bone rattle/clatter throughout — a slashing reap over
    bone clatter (attack), bone-rattle block and hurt, a bone-collapse cascade
    (death), and skeletal rattling steps (move).
  - Ghost King (gold): its deep reverberant spectral wail attack, hurt and death
    are kept; a dread-heavy slow spectral drone is built for move.
  - Demon Avatar (gold): its monstrous roar attack, deep hurt and heavy impacts
    are kept; death is rebuilt as a deep layered monster roar (replacing the
    former female-range cry).

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

The following sources were added on 2026-07-23 for the Azure Breeze and Heavenly
Demon rebuild (distinct per-unit identities; correct voice genders; real crane):

- HaelDB, [Male Grunt/Yelling sounds](https://opengameart.org/content/male-gruntyelling-sounds), OGA-BY 3.0 / CC0 (four male vocalists). (All Azure Breeze sword-cultivator and Core-Master pain/death voices, and the Heavenly Demon Blood Disciple snarls — pitched down and tuned per unit.)
- pla1554alaska (submitted by qubodup), [Bald Eagle Screams](https://opengameart.org/content/bald-eagle-screams), CC-BY 3.0 / GPL. (Spirit Crane attack, hurt, and death cries.)
- congusbongus, [Bones rattle](https://opengameart.org/content/bones-rattle), CC0. (Bone Reaver rattle/clatter and Corpse Puppet bone layers.)
- artisticdude, [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack), CC0. (Sword swings/unsheathes, chainmail/armour, wood knocks, metal rings, and the shade/monster body layers across both towns.)
- cicifyre, [Female RPG Voice Starter Pack](https://opengameart.org/content/female-rpg-voice-starter-pack), CC0. (Gu Witch death cry — reused from the Hidden Leaf pack, different vocalist type.)
- thebardofblasphemy, [grunts of male death and pain](https://opengameart.org/content/grunts-male-death-and-pain), CC0. (Grit accents on Azure Breeze Sect Protector attack/defend — reused from the Hidden Leaf pack, different takes.)

## Output format

All new files are mono MP3 at 32 kHz and 48 kbit/s CBR. Processing trims each
cue to at most 2.35 seconds (2.8 seconds for death, 1.7 seconds for movement),
removes leading silence, filters unusable low/high frequencies, limits peaks,
and normalizes perceived loudness to -18 LUFS. The full 109-file pack is about
814 KiB.

Manifest keys follow `units/<town>-<unit>-<action>`. The resolver and tests
require dedicated keys for every action, including shoot for Core Formation
Master, Anbu Black Ops, Jonin, and Gu Witches.
