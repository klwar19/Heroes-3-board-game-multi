# Battle FX pipeline (Heroes III .def sprites)

How the original game's spell / ability animations get onto the table, and
how to hook up new ones.

## Pipeline

```
H3sprite.lod .def files
        |  python3 scripts/convert-h3-defs.py <folder> [<folder> ...]
        v
public/assets/fx/<key>.webp     lossless sprite sheets with alpha (112 sheets, ~3.4MB)
src/data/fx-manifest.json       frame geometry per sheet (frames, cols, fps, anchor...)
        |
src/data/fx.ts                  spellFxPlans / abilityFxPlans: card id -> sheets + sounds
        |
src/components/table/fx.tsx     FxStage plays cues built from game events (page.tsx)
```

The converter needs Pillow (`pip install pillow`). Def names were verified
against VCMI's `config/spells/*.json`; files VCMI never references were
identified visually (see `looksLike` in the manifest) or kept under their
original def name (group `unidentified`) for future use.

## How an effect plays

`page.tsx` diffs the event log on every server snapshot (same pattern as the
dice / draw cues) and queues `FxCue`s:

- `CARDS_DRAWN` — card flights deck → hand, face-up for the drawing seat,
  card backs for everyone else; discard reshuffle pulses the deck first.
  Plays on the combat table and on the adventure map (your own seat; an
  opponent drawing on the map keeps the announcement overlay since their
  deck has no on-screen home there).
- `HAND_REFRESHED` — mulligans and forced discards fly the discarded cards
  hand → discard pile before the replacement draws fly in.
- `CARD_PLAYED` / `SPELL_CAST_STARTED` — flight hand → center stage (held
  large so everyone can read it) → discard pile.
- `SPELL_CAST_RESOLVED` — looks up `spellFxPlans[cardId]`: projectile flies
  from the caster's seat, hit/affect sprites play over the target unit's
  actual board cell (`data-fx-unit` anchors survive board flips and
  resizes). Bloodlust uses a red tint on the unit card, like the original
  engine's palette trick.
- `SPELL_CAST_CANCELLED` — dispel fizzle at center stage.
- `UNIT_ATTACK_DECLARED` — the attacker's own card lunges (melee: a thrust into
  the target with a shake at contact; ranged: a recoil as the shot looses) and
  the struck card recoils in place. Melee adds a slash streak + spark over the
  target's cell; ranged flies a placeholder projectile (`.fxBolt`) cell → cell
  with a small impact burst on arrival. The whole beat is timed to
  `ATTACK_IMPACT_MS` so the contact lands with the `DAMAGE_ASSIGNED` number and
  the unit's hurt cry; retaliations re-fire the same event, so they animate too.
  Strike visuals anchor to the *cell* (not the unit) so a killing blow still
  shows the hit after the defeated unit leaves the board. The slash, bolt and
  impact use synthesized placeholder foley (`playMeleeImpact` / `playWhoosh` /
  `playProjectileImpact` in `src/lib/sound.ts`) layered under the creature's H3
  voice — swap those for recorded weapon hits without touching the FX layer.
- `DAMAGE_ASSIGNED` / `DAMAGE_HEALED` — floating −N / +N numbers.
- `UNIT_ABILITY_TRIGGERED` — `abilityFxPlans[abilityId]` (Magog splash and
  Lich death cloud are wired; poison / fear / acid etc. are ready for when
  those abilities exist).

Animations are pure presentation: state is already final before they play,
and a missing anchor consumes the cue silently, so nothing can desync.

## Adding a new spell's visuals

1. Check `src/data/fx-manifest.json` for the sheet key (most spells are
   already converted - see the catalog below).
2. Add an entry to `spellFxPlans` in `src/data/fx.ts` with the sheet key(s)
   and a sound key from `public/sounds/manifest.json`.
3. Done - the cast/resolve events trigger it automatically.

## Converted catalog

**Wired to current cards:** magic-arrow (projectiles 0-4 + hit),
lightning-bolt + lightning-crackle, fireball, stone-skin, cure, fortune,
bloodlust (tint).

**Ready for future cards (plans already declared):** bless, prayer, haste,
slow, precision, curse, dispel.

**Converted, plan needed when the card exists:** air-shield, anti-magic,
armageddon, berserk, blind, counterstrike, death-ripple, death-stare,
destroy-undead, disrupting-ray (+projectile), forgetfulness, frenzy,
fire-shield, frost-ring, hypnotize, ice-bolt (projectiles + hit), implosion,
inferno, magic-mirror, meteor-shower, mirth, misfortune, protect-air/-earth/
-fire/-water, resurrection, shield, slayer, sorrow, weakness.

**Monster ability effects:** age, bind, death-cloud, disease, paralyze,
poison, fear, acid-breath, plus `sp03_`/`sp06_`-`sp09_`/`sp12_`/`sp13_`
(unidentified, preserved).

**Obstacles:** fire-wall (13 flame variants), land-mine (4), force-field (3).

**Unidentified extras** keep def-named keys (`c12spe0`, `c15spe*`,
`c18spw0`, ...) with a `looksLike` note in the manifest.

## Card backs

`src/data/decks.ts` maps deck → back art. Until real images land in
`/public/assets`, CSS variants (globals.css `.cardBack.back-*`) give each
deck a distinct trim; setting `image` on a registry entry switches every
pile, fan and flight at once.

## Card sounds

`public/sounds/cards/` holds the card foley (two deal sounds alternated on
draw, one play sound on landing); the reshuffle riffle is synthesized in
`src/lib/sound.ts`, which also exposes the mute toggle (localStorage
`h3-table-muted`).
