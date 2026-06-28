# Artifact card-art audit

Audit date: 2026-06-28  
Rules source: <https://en.homm3bg.wiki/artifacts/>  
Timing-symbol reference: <https://en.homm3bg.wiki/legend/>  
Classic subject reference: <https://heroes.thelazy.net/index.php/List_of_artifacts>

The repository initially had 29 artifact definitions routed to the generic
Might & Magic deck back because no usable card face was committed. All 29 now
have approved original replacement cards. No artifact definitions remain on
the deck-back fallback.

Each replacement uses its correct Minor, Major, or Relic frame; exact wiki
rules text; and the timing glyph declared by the wiki:

- Instant: lightning bolt
- Ongoing: open circular arrow
- Permanent: infinity
- Activation: outlined right arrow
- Map effect: circle over a horizontal line

The subject designs follow the classic Heroes III artifact icons where a
matching icon exists. Bowstring of the Unicorn's Mane has no matching entry in
the classic list and therefore uses a new subject design based on its name.

## Original replacements

### Minor (6)

- Bowstring of the Unicorn's Mane
- Eversmoking Ring of Sulfur
- Necklace of Swiftness
- Quiet Eye of the Dragon
- Shaman's Puppet
- Skull Helmet

### Major (13)

- Crown of the Five Seas
- Diplomat's Ring
- Necklace of Dragonteeth
- Orb of Driving Rain
- Orb of Silt
- Orb of Tempestuous Fire
- Orb of the Firmament
- Pendant of Courage
- Pendant of Negativity
- Pendant of Second Sight
- Royal Armor of Nix
- Shield of Naval Glory
- Trident of Dominion

### Relic (10)

- Celestial Necklace of Bliss
- Lion's Shield of Courage
- Orb of Inhibition
- Plate of the Dying Light
- Sandals of the Saint
- Thunder Helmet
- Tome of Air
- Tome of Earth
- Tome of Fire
- Tome of Water

`src/data/cards/artifact-card-art.test.ts` enforces that every artifact points
to a committed WebP card face and that every original replacement remains wired
to its tier-specific asset.
