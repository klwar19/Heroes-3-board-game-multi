# Missing spell card artwork

The 11 replacement illustrations were generated with the built-in image-generation tool, then composed into deterministic 743×1040 card faces by `scripts/build-missing-spell-cards.mjs`.

Build inputs are kept **out of `public/`** so the heavy raw art is never served:
the downscaled source illustrations live in `scripts/missing-spell-art/` and the
legend glyphs in `scripts/card-glyphs/`. Only the finished, compressed faces
(WebP quality 82, ~76–92 KB each — matching the Summon Elemental faces) land in
`public/assets/spells-<slug>.webp`.

References:

- Board-game wording and tier: <https://en.homm3bg.wiki/spells/>
- Board-game glyph meanings: <https://en.homm3bg.wiki/legend/>
- Original Heroes III icon concepts: <https://heroes.thelazy.net/index.php/List_of_spells>

## Shared final prompt

```text
Use case: stylized-concept
Asset type: central illustration for a fantasy board-game spell card
Input images: Image 1 is the classic spell icon and provides only the spell concept; Image 2 is an existing same-school board-game spell card and provides the restrained hand-painted spot-illustration style only.
Style/medium: compact 1990s fantasy strategy-game painted illustration, softly realistic brushwork, slightly aged print texture, matching the existing board-game spell illustrations.
Composition/framing: square art-only asset; one centered iconic subject; strong silhouette; readable at small card size; generous edge breathing room; no card frame.
Constraints: original artwork; use the reference icon only for semantic inspiration; art only; no title, words, numbers, border, card frame, watermark, or logo; avoid modern and science-fiction objects.
```

The per-card `Primary request` lines were:

- **Magic Mirror:** An ornate silver hand mirror catches an incoming blue-white magic bolt and reflects it in a different direction.
- **Quicksand:** An adventurer's armored legs sink into a spiral of enchanted golden-brown sand, with faint green earth runes around the trap.
- **Land Mine:** An armored boot is about to step on a concealed fantasy rune plate glowing red-orange beneath cracked earth.
- **Force Field:** A sentinel stands behind a luminous emerald semicircular barrier that bends or stops a spear thrust and incoming arrows.
- **Air Shield:** A lightly armored figure is enclosed by a translucent sphere of wind while incoming arrows curve harmlessly away.
- **Clone:** An armored knight stands over a pool while an identical, fragile water-made duplicate rises beside the original.
- **Protection from Air:** A round antique shield inside a pale-blue vortex repels lightning and storm clouds.
- **Protection from Water:** A round antique shield splits a crashing wave and deflects icy shards.
- **Protection from Fire:** A round antique shield with a cool protective rim breaks a fireball into harmless ribbons of flame.
- **Protection from Earth:** A vine-rooted round antique shield stops flying rocks and a jagged stone spike.
- **Water Walk:** A cloaked hero steps across open sea, each boot supported by a luminous circular ripple of water magic.

## Deterministic card text

The compositor uses the spell tier, power ladder, and descriptions from the English fan wiki. It embeds the wiki repository's SVG glyphs for Instant, Ongoing, Map effect, Power, Spell, Health, Defense, Ranged unit, Movement, Expert, and the Bronze/Silver/Gold tiers. The universal `Instant: +1 Power` row remains from the authentic same-school template card.

Rebuild the faces and preview sheet with:

```powershell
node scripts/build-missing-spell-cards.mjs
```

The preview is written to `out/missing-spell-cards-contact-sheet.png`.
