# Basic school-magic ability card art

The fan-wiki pages for Basic Air, Earth, Fire, and Water Magic expose the
player-deck back instead of a printable front. The project therefore ships four
original faces built by `scripts/build-basic-magic-ability-cards.mjs`.

The compositor uses the matching printed `<School> Magic` scan as the authentic
ability frame and expert-divider reference. Generated imagery is limited to the
illustration window. The title, exact rules, and the Permanent, Instant, Spell,
and Power symbols are composed separately from `scripts/card-glyphs`, following
the wiki legend; a symbol is never repeated as a text label.

## Sources

- Rules: `https://en.homm3bg.wiki/abilities/basic_<school>_magic/`
- Symbol meanings: `https://en.homm3bg.wiki/legend/`
- Frame/format reference: `public/assets/abilities-<school>_magic.webp`

## Built-in image-generation prompt set

Each asset used the matching `<School> Magic` card as **Image 1: style and
elemental-language reference only**, with this common prompt:

> Use case: stylized-concept. Asset type: original illustration panel for a
> fantasy board-game ability card. Create a new "Basic `<School>` Magic"
> ability illustration: an apprentice spellbook opened beneath a compact
> `<palette>` elemental sigil, with a small `<material>` orb holding
> `<elemental subject>`. Detailed semi-realistic late-1990s high-fantasy
> strategy-game item illustration upgraded for modern print; sculpted painted
> icon, tactile materials, restrained magical glow. One centered emblem,
> upright portrait-friendly composition, generous dark negative space, readable
> at card-thumbnail size. Subdued mottled dark-brown leather/parchment backdrop.
> Artwork only: no card border or frame, title, letters, numbers, rules text,
> legend glyphs, watermark, logo, character, or extra objects. Keep the emblem
> comfortably away from every edge. Do not copy Image 1's exact emblem.

School-specific substitutions:

| School | Palette | Orb/material and elemental subject |
| --- | --- | --- |
| Air | silver-blue | glass orb containing spiral clouds and restrained lightning filaments |
| Earth | moss green and amber | crystal orb containing layered mountains, roots, and a faint stone rune |
| Fire | copper red and orange | obsidian orb containing a controlled flame and a few sparks |
| Water | teal, cyan, and pearl | pearl-framed orb containing a curling wave and suspended droplets |

The generated source panels are committed as
`public/assets/abilities-basic_<school>_magic-art.webp`; the final faces are
`public/assets/abilities-basic_<school>_magic.webp`.
