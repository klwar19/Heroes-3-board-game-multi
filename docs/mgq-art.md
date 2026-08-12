# Monster Girl Quest town art provenance

The authoritative research index for this town is
`scripts/anime-art/mgq-reference-manifest.json`. It records 41 subjects and 44
direct PNGs: all requested companions, both members of each duo, five heroes,
Sonya, and the Four Spirits. `node scripts/download-mgq-references.mjs` caches
those PNGs beneath the ignored `scripts/anime-art/refs/mgq/` directory.

## What counts as a canonical reference

The selected files are the standing sprites used in character infoboxes on the
[MGQ Companions wiki](https://mgq.miraheze.org/wiki/Companions). They are
game-extracted appearance references mirrored by a fan-maintained wiki. The
wiki is not an official publisher site, so provenance must be described exactly
that way. The cached sprites are research inputs and do not ship with the app.

Use them to lock identity, silhouette, palette, costume, species anatomy, and
important weapons. Do not source from wiki gallery fan drawings, files named
like `*_by_*`, Pinterest, boorus, social-media reposts, or AI derivatives.

Most card illustrations are original compositions fitted to the established
game layout. Five deliberately documented exceptions use the verified standing
sprite itself because an identity-preserving canonical composite was requested:
Regina, Aria, Lisa, Ooma, and sealed Ilias. For those five,
`scripts/compose-mgq-canonical-scenes.mjs` only trims transparent space, scales
the sprite, and places it over an original scene; it does not redraw, restyle,
or alter the character. The cached source PNG still remains research-only and
is not copied directly into the public runtime tree.

Those five resulting card/hero composites contain game-extracted character
pixels. Treat them as private/reference-only assets unless the relevant
rightsholder authorizes redistribution; never label them as newly generated or
project-original character art.

The manifest also records the artist categories attached to each wiki page.
Those names credit the source game's visual design; they do not imply that a
new generated asset is endorsed by or authored by that artist.

## Form decisions that must remain explicit

- Alice: real form is the default hero reference; sealed small form is retained
  as an alternate and must be requested deliberately.
- Ilias: sealed form is the default for Paradox companion continuity; real form
  is retained as an alternate.
- Promestein: use the recruitable Angelic Dominion/Paradox incarnation. The
  wiki's `/Promestein/Paradox` route redirects there; do not silently swap in
  adult/original Promestein.
- Hild: use the base Brynhildr/Hild art, not a Deus Ex gallery transformation.
- Chrome and Frederica: a pack illustration must contain both. Frederica's base
  and MkII references are both recorded.
- Kamuro and Kitsu: a pack illustration must contain both while preserving each
  fox girl's distinct outfit and palette.

## Safety and card treatment

This is a fantasy combat adaptation. Chibi or childlike characters (including
Pochi, Miyabi, Cupi, Lucifina-chan, Sylph, and Gnome) must remain fully clothed,
non-sexual, and age-appropriate. Other characters should receive practical,
card-safe coverage without changing the identifiers that make them canonical.
Tentacles, vines, slime, petals, coffins, and undead elements are creature or
combat anatomy only: no sexual staging, torture imagery, or gore.

Do not add decorative mascots, unrelated props, extra limbs, invented costume
ornaments, watermarks, logos, or text inside generated art. UI frames, labels,
stats, and ability icons belong to the deterministic card renderer, not the
illustration master.

## Production contracts

MGQ art is split into two checked contracts:

- `scripts/anime-art/mgq-unit-card-contract.json` freezes all 29 cards, both
  Few and Pack faces, their exact live stats/rules, 58 dedicated master names,
  runtime paths, and character-reference ids.
- `scripts/anime-art/mgq-art-contract.json` declares the aligned town pair,
  seven derived building bars, starting tile, five heroes, Sonya, three
  equipment items, and 21 functional specialty/grade/job/spirit/mechanic icons.

The contracts deliberately contain no generated placeholder raster. Run the
non-writing checks before producing art:

```sh
node scripts/build-mgq-unit-cards.mjs --check-contract
node scripts/build-mgq-art.mjs --check-contract
node scripts/build-mgq-unit-cards.mjs --list-masters
node scripts/build-mgq-art.mjs --list-masters
```

After every listed master has been reviewed and placed at its exact path, build
with `node scripts/build-mgq-unit-cards.mjs` and
`node scripts/build-mgq-art.mjs`. Both compositors preflight the whole selected
group before writing, so a missing or undersized master cannot leave a partial
runtime pack.

Rebuild the five canonical composites before the two main compositors with:

```sh
node scripts/compose-mgq-canonical-scenes.mjs
```

Runtime dimensions follow the existing physical layout: unit/equipment/
commander cards are 743x1040; heroes 1086x1448; the town is 2044x701 and splits
into seven contiguous 292x701 bars; the starting tile is 1024x985 with the
existing board alpha mask; inventory and grade/job/spirit icons are 512x512;
specialty medallions are 256x256.

Town, tile, equipment props, grade/job emblems, Temptation, and other mechanic
icons are explicitly marked `project-original-*` where the verified manifest
has no canonical visual reference. This is intentional: do not silently attach
an unverified wiki gallery image or infer a canonical design that was not
researched.

## Voice provenance

The interim Japanese voice pack is documented in
`public/sounds/mgq/README.md`. Its lines are original and synthesized locally;
no MGQ recording or actor voice was sampled or cloned.
