# Anime mod art direction

## Shipping status

The current Fuyuki and Azure Breeze unit suites are **art proofs, not playable
content**. Each has seven frame-free active masters, fourteen editable Few/Pack
card sources, and fourteen flattened review proofs. Nothing is copied into
`public/assets` until the matching mechanics are engine-wired and effect-tested.

## Shared board-game register

All card art uses a painterly anime hybrid: recognizable, disciplined anime
linework and faces, cel-adjacent value grouping, and tactile painted materials.
It should feel at home beside dark fantasy board-game cards rather than like a
bright mobile-game sticker.

- Readability at card size beats micro-detail.
- A single dominant silhouette, one clear action, and three depth planes.
- Muted local color, controlled magic light, and real material texture.
- Mature proportions and expressions; no chibi, comedy, fan-service, glossy 3D,
  or overloaded particle effects.
- Illustration masters contain no text, numbers, frame, UI, icon, logo, or
  watermark. Those stay editable in the SVG/compositor layer.

## Fuyuki City register

Palette: violet, indigo, charcoal, antique gold, cool ley-line cyan, and small
character-specific accents. Repeating world anchors are rainy city nights, the
river bridge, the hill church, temple gates, ritual geometry, and distant
ley-line light. Each class keeps its canonical silhouette and signature weapon:

- Assassins: long-haired temple swordsman, violet kimono, long nodachi.
- Riders: lavender hair, sigil blindfold, chain-and-anchor weapon, Pegasus hint.
- Lancers: cobalt suit and hair, silver armor, crimson cursed spear.
- Archers: white hair, dark armor, red mantle, projected bow and paired blades.
- Casters: deep hood, violet robes, ancient geometric sorcery.
- Sabers: blonde braided bun, blue dress, silver plate, wind-veiled sword.
- Berserkers: monumental ancient hero, stone axe-sword, winter estate grounds.

## Azure Breeze Sect register

Palette: celadon and deep jade, cloud white, charcoal ink, weathered granite,
antique bronze, and sparing warm-gold qi. Architecture and martial dress are
grounded in Wudang references; landscapes use Huangshan's granite peaks, old
pines, waterfalls, and cloud seas. The register avoids European plate armor,
samurai silhouettes, katanas, generic ninja styling, and neon spell effects.

Azure Breeze intentionally preserves the original board game's unit-card
geometry rather than introducing a new TCG frame: compact title bar, four
stacked stat cells on the left, large portrait on the right, one small
Ground/Flying/Ranged mark over the art, centered `# FEW` / `# PACK` band, and a
dark bottom rules panel. A linked image-generated blank frame supplies restrained
jade inlay, brown tooled leather, aged bronze edging and small ruyi corners.
Functional overlays remain exact SVG: crossed jian for Attack, a classic shield
with a small jade ward for Defense, the familiar medical cross with a lotus
inset for Health, and a cloud-step runner for Initiative. This changes the icon
details without changing what an original-board-game player expects them to mean.

Current revised roster anchors:

- Level 3 **Spirit Crane** (*Linh Cầm*): red-crowned spirit beast, practical
  celadon travel harness, diving melee silhouette and high-speed wind pressure.
- Level 6 **Core Formation Master** (*Kim Đan Chân Nhân*): senior Daoist ranged
  caster, ritual jian, talisman array and a restrained jade defensive ward.
- Level 7 **Mountain Guardian** (*Thủ sơn linh thú*): a colossal living-stone
  qilin/pixiu guardian beast, with regenerative jade qi linking self and allies.

## Reference discipline

Identity and costume checks use the [official Unlimited Blade Works character
page](https://www.fate-sn.com/ubw/sp/chara/) and the setting/class vocabulary
uses the [official introduction](https://www.fate-sn.com/ubw/sp/intro/).
References live only in the gitignored `scripts/anime-art/refs/` directory.
Every final master is a newly generated pose, composition, lighting setup, and
background; official images are never traced, pasted, upscaled, committed, or
shipped.

Azure Breeze environmental research uses UNESCO's [Wudang Mountains building
complex](https://whc.unesco.org/en/list/705/) and [Mount Huangshan shanshui
landscape](https://whc.unesco.org/en/list/547/) references. These references
inform architecture, granite/cloud structure, and cultural vocabulary; all
figures and scenes are original generated compositions. The Spirit Crane's
anatomy and Daoist association were checked against the Metropolitan Museum of
Art's public-domain [Crane in a bamboo grove](https://www.metmuseum.org/art/collection/search/39993),
and the Core Formation Master's paper charms against the British Museum's
[Daoist talisman](https://www.britishmuseum.org/collection/object/A_2017-3055-6).

## Editable production layout

- Raw master: `scripts/anime-art/raw/<faction>/<category>/`
- Layered SVG: `scripts/anime-art/editable/<faction>/<category>/`
- Flattened proof: `scripts/anime-art/previews/<faction>/<category>/`
- Runtime export: `public/assets/` only after the owning gameplay phase lands

The layered SVGs name four groups—background, linked illustration, frame, and
typography—so an artist can replace/crop the illustration or revise frame,
stats, title, and rules independently. Rebuild with `npm run build:anime-cards`.
