# Fuyuki City — Fate/unlimited codes audio

These 37 mono Ogg clips come from the PlayStation 2 game
Fate/unlimited codes. They cover attack, defend, hurt, death, and move for all
seven Fuyuki unit lines. EMIYA and Medea also have a separate named projectile
line for `shoot`.

Frequent actions use short character-specific battle sounds so normal play does
not repeat long dialogue. Death uses the character's named KO recording.
EMIYA's `shoot` uses `emy_etc_hrunting.wav`; Medea's uses
`cas_etc_koryukion.wav`. The files were normalized to -18 LUFS, limited to
-1.5 dB true peak, downmixed to mono, and encoded as 44.1 kHz Vorbis.

## Unit and source map

| Fuyuki line | Fate character | The Sounds Resource asset | Game prefix |
| --- | --- | --- | --- |
| Sabers | Artoria Pendragon (Saber) | [442784](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442784/) | `sbr` |
| Lancers | Cu Chulainn (Lancer) | [442786](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442786/) | `lan` |
| Archers | EMIYA (Archer) | [442788](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442788/) | `emy` |
| Berserkers | Heracles (Berserker) | [442791](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442791/) | `ber` |
| Casters | Medea (Caster) | [442796](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442796/) | `cas` |
| Riders | Medusa (Rider) | [442797](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442797/) | `rid` |
| Assassins | Sasaki Kojiro (Assassin) | [442800](https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/sound/442800/) | `koj` |

For each prefix, the core action sources are
`se/chrm_<prefix>00-mono/chrm_<prefix>00_00002.wav` (attack),
`...00007.wav` (move), `...00010.wav` (defend), and `...00014.wav`
(hurt). Heracles' source has only indices 00000–00013, so his hurt clip uses
`...00012.wav`. The death sources are `voice/<prefix>/<prefix>_ko_01.wav`,
except Heracles and Medea, whose selected death variant is `_ko_00.wav`.

Source index:
https://sounds.spriters-resource.com/playstation_2/fateunlimitedcodes/

The original recordings remain copyrighted Fate/unlimited codes game assets.
The Sounds Resource describes its archive as material for personal projects,
non-commercial work, and fan games; that does not grant a license to
redistribute these recordings commercially. Keep this package private unless
the relevant rights holders authorize publication.
