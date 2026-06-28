# Summon Elemental spell-card art

The Conflux Expansion's four Summon Elemental pages use the generic player
deck back instead of a spell-card image. The replacement faces preserve the
existing Expert spell-card layout and use deterministic text rendering for the
rules and Power ladder.

## Verified card text

Source pages:

- `https://en.homm3bg.wiki/spells/summon_air_elemental/`
- `https://en.homm3bg.wiki/spells/summon_earth_elemental/`
- `https://en.homm3bg.wiki/spells/summon_fire_elemental/`
- `https://en.homm3bg.wiki/spells/summon_water_elemental/`

Each card is an Expert spell in its matching school and reads:

> Activation. On a chosen empty space:
>
> Power 0: No effect
>
> Power 2: Summon a Few [Element] Elementals
>
> Power 4: Summon a Pack of [Element] Elementals
>
> — OR — Instant: +1 Power

The compositor takes its outer frame and universal discard row from a matching
Expert spell: Chain Lightning (Air), Town Portal (Earth), Slayer (Fire), and
Prayer (Water).

## Final built-in image-generation prompt set

All four illustrations used this shared structure:

> Create new icon artwork for “Summon [Element] Elemental”: exactly one
> Elemental materializing upward from a small matching summoning sigil. Image 1
> is the exact creature-identity reference. Image 2 is only the spell-card
> illustration style and scale reference. Render compact vintage painted
> fantasy board-game art with a clean readable silhouette, restrained detail,
> soft shading, generous margins, and softly feathered edges on warm antique
> brown parchment. Artwork only: no title, letters, numbers, card frame, corner
> ornaments, school glyphs, watermark, logo, border, extra creatures, weapons,
> armor, clothing, or full background scene.

Element-specific identity constraints:

| Element | Required identity | Avoid |
| --- | --- | --- |
| Air | Pale translucent wind body, stern face, broad arms, lower body tapering into a tight cyclone, thin lightning and wind ribbons. | Generic tornado, ghost, armored humanoid. |
| Earth | Massive boulder torso, craggy stone anatomy, heavy arms, squat powerful proportions, stern stone face, ochre dust and tiny fissures. | Lava, tree creature, knight, manufactured golem. |
| Fire | Vivid living-flame anatomy, sharp stern face, flame crown, long arms, bright molten core, lower body tapering into fire. | Demon, horns, wings, knight, lava golem, fireball. |
| Water | Entire body made from blue-green ocean water, swept-back wave crest, broad shoulders, long flowing arms, tapering lower body, cyan eyes. | Human or merfolk anatomy, skin, ice, armor, trident. |

The generated, text-free sources are committed (downscaled, build-input only)
under `scripts/summon-art/<element>-elemental.webp` — kept out of `public/` so
they are never served. Rebuild the final 743×1040 WebP card faces (written to
`public/assets/`) and the preview sheet with:

```powershell
node scripts/build-summon-spell-cards.mjs
```
