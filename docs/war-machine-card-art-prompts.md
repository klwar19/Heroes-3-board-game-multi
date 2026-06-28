# Cannon and Catapult card art

The fan wiki has real 743×1040 card scans for First Aid Tent, Ammo Cart, and
Ballista, but Cannon falls back to a small specialty icon and Catapult has no
card face. The two replacements use original generated illustrations and the
same deterministic composition approach as the project's replacement spell and
unit cards.

`scripts/build-war-machine-cards.mjs` confines each generated illustration to
the card's central art window. It takes the frame and market icon row from the
real First Aid Tent card, then composes the title, prices, rules, and wiki legend
glyphs separately. This keeps the illustration unobstructed and makes symbols
and rules reproducible instead of relying on generated typography.

The rules follow the English wiki:

- Cannon: permanent; at the beginning of each Combat round, spend 1 Expert to
  deal 2 Damage to 1 enemy unit; costs 10 Gold at the Blacksmith and 14 Gold at
  the Trading Post.
- Catapult: permanent; at the beginning of each Combat round, pay 1 Building
  Materials to choose 2 adjacent targets (units, Walls, or Gate) and deal 1
  Damage to each; costs 8 Gold at the Blacksmith and 12 Gold at the Trading
  Post.

The permanent, Expert, Building Materials, Damage, pay, and Gold concepts are
shown with glyphs wherever they appear as symbols; their names are not repeated
beside those glyphs.

## Cannon prompt

```text
Use case: stylized-concept
Asset type: central illustration for a portrait fantasy board-game War Machine card
Input images: Images 1-3 are style references only for painterly finish, lighting, palette, and simple outdoor presentation; do not reproduce their card frames, text, symbols, or layouts.
Primary request: Create an original, premium high-resolution illustration of a medieval cast-iron naval cannon mounted on a sturdy weathered wooden two-wheeled field carriage.
Scene/backdrop: open green coastal highland battlefield, distant rocky cliffs and hazy blue sea beneath a clear sky.
Subject: one complete cannon, dark iron barrel, reinforced timber carriage, bronze fittings, believable medieval engineering.
Style/medium: polished hand-painted high-fantasy board-game illustration, natural brush texture, grounded realism, harmonious with the supplied War Machine card art.
Composition/framing: near-square landscape illustration; three-quarter view; entire cannon and both carriage wheels visible; centered with generous safe margins; strong readable silhouette; no important detail near the edges.
Lighting/mood: bright natural daylight, adventurous and heroic, soft atmospheric depth.
Constraints: illustration only; the machine must not be cropped; no people; no projectile, muzzle flash, smoke, or active battle; no frame; no border; no card UI; no text; no numbers; no symbols; no logos; no watermark.
Avoid: photorealism, 3D render, modern artillery, sci-fi parts, busy scenery, extreme close-up.
```

## Catapult prompt

```text
Use case: stylized-concept
Asset type: central illustration for a portrait fantasy board-game War Machine card
Input images: Images 1-3 are style references only for painterly finish, lighting, palette, and simple outdoor presentation; do not reproduce their card frames, text, symbols, or layouts.
Primary request: Create an original, premium high-resolution illustration of a compact medieval torsion catapult on a heavy weathered wooden wheeled chassis, with a raised throwing arm, sling, winding mechanism, rope bindings, and one stone ready to launch.
Scene/backdrop: grassy battlefield before distant warm-stone castle walls and mountain foothills beneath a blue sky.
Subject: one complete mobile catapult, believable medieval engineering, timber grain, iron braces, rope tension, rugged wheels.
Style/medium: polished hand-painted high-fantasy board-game illustration, natural brush texture, grounded realism, harmonious with the supplied War Machine card art.
Composition/framing: near-square landscape illustration; three-quarter view; entire machine and all wheels visible; centered with generous safe margins; strong readable silhouette; no important detail near the edges.
Lighting/mood: bright natural daylight, resolute siege atmosphere, soft atmospheric depth.
Constraints: illustration only; the machine must not be cropped; no people; no flying projectile, impact, smoke, or active battle; no frame; no border; no card UI; no text; no numbers; no symbols; no logos; no watermark.
Avoid: ballista, crossbow, counterweight trebuchet, modern machinery, photorealism, 3D render, busy scenery, extreme close-up.
```
