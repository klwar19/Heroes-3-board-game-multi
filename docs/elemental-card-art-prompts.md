# Air / Earth / Fire / Water Elemental card art

The board-game wiki publishes the Few, Pack, and Neutral rules columns for these
four units, but each image link resolves to a blank tier frame. The card faces in
`public/assets` therefore use new atmospheric art while preserving the printed
statistics, ability text, frame conventions, and classic creature identity.

## Sources

- Rules and variants: `https://en.homm3bg.wiki/units/<element>_elementals/`
- Creature identity reference: the original Heroes III 58×64 creature portrait
  from `heroes.thelazy.net` (`<Element>_Elemental_portrait.png`)
- Card-art atmosphere reference:
  `public/assets/units-conflux-bronze-storm_elementals-few.webp`
- Wider visual-reference check: Google Images query for “heroes 3 elemental”

## Final built-in image-generation prompt set

Every image used this common structure:

> Create a polished, portrait-oriented unit-card illustration panel of exactly
> one classic Heroes III Elemental. Image 1 is the exact creature-identity
> reference (silhouette, anatomy, face, proportions, and palette). Image 2 is
> only the visual-quality and atmospheric board-game-card reference. Render a
> detailed semi-realistic digital fantasy illustration: crisp classic
> late-1990s high-fantasy strategy-game character art upgraded to modern print
> quality, clean anatomy, strong readable silhouette, and no visible brush
> texture. Artwork only: no card frame, icons, typography, logo, watermark,
> weapons, clothing, or extra creatures. Keep important details away from the
> extreme edges.

Element-specific direction:

| Element | Subject lock | Scene and lighting |
| --- | --- | --- |
| Air | Pale translucent wind-body; lower body dissolves into a tight cyclone; do not turn it into armor, a ghost, or a generic tornado. | High mountain pass above clouds, spiraling wind, thin lightning, mist, pines and blue-gray peaks; cold silver-blue backlight and white wind glow. |
| Earth | Bulky brown stone anatomy, massive craggy arms and dense boulder torso; not lava, a tree creature, an armored knight, or a generic golem. | Ancient cavern opening into a ruined mountain sanctuary, fractured monoliths, amber dust, moss and earth-magic fissures; warm ochre shafts against cool shadows. |
| Fire | Vivid orange-red living-flame anatomy, sharp classic face, flame crown and bright molten core; not a demon, knight, lava golem, or fireball; no horns or wings. | Black volcanic caldera at twilight, basalt, embers, lava falls and smoke; intense orange-red self-light against charcoal shadows. |
| Water | Non-human creature made entirely from a single mass of blue-green ocean water, with the classic swept-back wave crest, broad shoulders, flowing water-arms, tapering lower body and mask-like cyan eyes; no skin, flesh, ice, merfolk, armor, trident, or human anatomical detail. | Moonlit half-submerged coastal ruin, broken marble columns, turquoise surf, sea mist and cliffs; cool cyan moonlight, teal shadows and pearlescent highlights. |

The accepted art is normalized to one 540×594 WebP panel per creature:
`units-elemental-art-{air,earth,fire,water}.webp`. The compositor reuses that
exact panel for all three variants and changes only frame, stats, cost treatment,
and rules banner:

```powershell
node scripts/build-elemental-cards.mjs
```
