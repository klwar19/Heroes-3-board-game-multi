# Little Busters town art pack

Generation mode: OpenAI built-in image generation. Runtime art is rebuilt by:

```sh
node scripts/build-little-busters-art.mjs
node scripts/build-little-busters-unit-cards.mjs
node scripts/build-commander-cards.mjs kyousuke_natsume
```

## Reference discipline

Character identity was researched from the Little Busters Wiki character pages and gallery images before generation. Local downloads live under the gitignored `scripts/anime-art/refs/little-busters/` tree and are never shipped. Key checks included canonical hair construction/color, eyes, uniform variants, stockings, ribbons, armbands, goggles, parasol, and role-specific props.

Primary sources:

- <https://littlebusters.fandom.com/wiki/Haruka_Saigusa/Gallery>
- <https://littlebusters.fandom.com/wiki/Saya_Tokido>
- <https://littlebusters.fandom.com/wiki/Sasami_Sasasegawa>
- <https://littlebusters.fandom.com/wiki/Little_Busters!/Visual_Novel>
- <https://w.atwiki.jp/littlebustersex/pages/20.html> (VN battle weapons and character-specific props)

The Softball Club uses the three named followers rather than Sasami duplicates: Yukari Nakamura (short teal hair/red bows), Rei Kawagoe (long dark-red twin-tails), and Sakiko Watanabe (sandy-blonde side ponytail).

## Shared generation prompt

```text
Use case: stylized-concept.
Asset type: production art for an existing Heroes III board-game compositor.
Reference policy: supplied wiki images strictly define identity/costume; preserve canonical hair, eyes, face, uniform, footwear, ribbons, armband and accessories. Create a new pose and background; never copy reference composition or text.
Style: premium hand-painted anime/visual-novel hybrid, faithful Key-style identity, mature proportions, disciplined linework, cel-adjacent values, tactile paint, darker strategy-board-game finish, readable at card size.
Constraints: no baked text, number, logo, UI, border, watermark, chibi, fan-service, photorealism, glossy 3D, extra limbs or malformed hands.
```

Subject directives:

- Haruka: prank backfire, streamers and toppled practice cones.
- Rin's Cats: moonlit cat courtyard and coordinated pounce arcs.
- Disciplinary Committee: Kanata, canonical armband, confiscation scene.
- Masato: blocks an impact; wounded state reads as controlled muscle rage.
- Softball Club: Yukari, Rei and Sakiko in a three-person twin-throw formation.
- Saya: underground passage, compact silver knife, explicitly no firearm.
- Mio: white parasol and a blue-black Midori shadow absorbing one lethal blow.
- Heroes: researched three-quarter VN portraits with role-specific baseball, cat, die, map, first-aid and logistics props.
- Commander: Kyousuke directing a tactical campus map from the dugout.

## Town and tile prompt

```text
Empty panorama: high three-quarter hillside Japanese boarding-school campus with real foreground/midground/background depth, winding roads, terraces, a sunken practice field, pond, hills and distant school.
Full panorama: edit that exact empty camera and terrain. Add seven constructions inside the seven crop regions at deliberately different depths: foreground mission pavilion, lower-road club rooms, field-side cat/baseball clubhouse, middle-distance athletics facilities, elevated occult observatory, distant hilltop main clubhouse/citadel, and near-right secret passage. Preserve sky, roads, terrain and lighting across crop boundaries; no flat façade lineup or visible panel art.
Tile: exact seven-touching-hex flower geometry from A-S1; center school, surrounding baseball field, cat courtyard, parasol garden, blocked ridge, disciplinary gate and secret tunnel. No text or UI.
```

The completed panorama is sliced into widths `238 + 6x239 = 1672`. `little-busters-town-progress-0-to-7.webp` composites those real strips over the empty panorama as an eight-state visual regression sheet.

## Equipment and emblem prompt

```text
Square painted inventory/emblem asset; one strong centered silhouette; dark navy enamel, antique-gold edge and restrained character accents; readable at 48px. Generate on a perfectly uniform #00ff00 chroma-key background with no shadow, reflection, text or border; remove the key locally with soft matte and despill before WebP export.
```

Equipment: Haruka's Glass Marbles, Lennon's Mission Letter, Mio's Parasol, Kud's Flight Goggles, Little Busters Practice Bat, School Revolution Watch.

Veterancy emblems: Haruka lucky roll, Cats double pounce, Committee penalty break, Masato infinite retaliation, Softball ace pitcher, Saya assassination, Mio parasol ward, plus a shared faction rank shield.

Seishun grade emblems: Benchwarmer, Regular, Ace, Strongest in the School.

## Production outputs

- 14 finished unit faces (7 Few + 7 Pack), `743x1040`.
- Empty/full town panoramas, `1672x941`, plus seven contiguous building strips.
- Starting tile, `1024x985`, with the shipped board-tile alpha silhouette.
- Six hero portraits, `1086x1448`.
- Kyousuke commander face, `743x1040`.
- Six transparent equipment icons and twelve transparent rank/grade emblems, `512x512`.

## 2026-08-10 Sasami and unit-card correction pass

Sasami was regenerated from her VN gallery identity sheet, corrected against the exact `Fgss02a_15146639202_o.jpg` CG, and finally audited against all 113 images in the gallery's Portraits set. The final uses the recurring neutral sprite model rather than a single expression variant: short rounded face, tiny tapered chin and mouth, both large circular turquoise eyes open, blunt separated center fringe, high symmetric side ties, straight indigo-violet hair sheets, navy cat-ear-shaped ribbons with white scalloped trim and long edged tails, pink chest bow, black/red blazer, gray plaid skirt and pale-lavender lace-trim thigh-highs. The hero scene gives her a softball and glove without changing those canonical features.

The installed Sasami master was subsequently generated entirely from scratch using only four canonical VN portrait sprites plus the supplied `Fgss02a` CG. No earlier generated portrait was included as an edit target or reference. Its new pose, field, lighting, face, hair, hands, ball and glove were constructed anew by the built-in image generator.

The final professional-HD pass was generated afresh with `Fgss02b_15124018176_o.jpg` as the primary face authority and four canonical portrait sprites as supporting model sheets. It preserves the original open turquoise eyes, calm smile, jaw, fringe and ribbon construction while increasing line cleanliness, hair separation, fabric/plaid detail, glove stitching, ball seams and field lighting. The selected source was mastered at `2172x2896` before the runtime WebP build.

The Softball Club illustration was regenerated from the supplied Sakiko Watanabe group CG. It contains three distinct followers only: sandy-blonde Sakiko in front, wine-red-haired Rei behind her, and teal-haired Yukari with red bows; all three wear the followers' green chest bows. Sasami is not duplicated into this unit.

Card compositor corrections in the same pass: Softball Club `3/1/5/7` and `4/1/5/8`; Rin's Cats costs `3/6` gold; Disciplinary Committee remains `2/1/3/6` and `3/1/3/7` while its type marker is corrected to Ranged; Masato retains `3/2/5/4` and `4/2/6/5`, costs `8/15`, and Pack Bodyguard; Saya retains `6/2/5/8` and `7/2/6/9` with corrected costs `14 + 1 valuable` and `21 + 2 valuables`; Mio retains `5/3/6/4` and `6/3/7/5`. Saya/Mio use the canonical red valuables crystal asset. Every unit side prints a labeled Ground boot or Ranged bow marker.
