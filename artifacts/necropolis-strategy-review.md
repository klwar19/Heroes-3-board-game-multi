# Necropolis AI verification

Verified using the authoritative reducer and the real computer runner. Human opponent turns were deliberately idle; these are economy and neutral-combat games, not competitive PvP benchmarks. All games ran through round 18.

| Difficulty / seed suffix | First III attempt | Income on two Far tiles | First Vampire Pack | First Gold unit |
|---|---:|---:|---:|---:|
| normal | 3 | 7 | 6 | 9 |
| hard | 3 | 7 | 9 | 11 |
| hard-2 | 3 | 5 | 4 | 9 |
| hard-3 | 4 | 6 | 6 | 9 |
| impossible | 4 | 12 | 7 | 12 |
| impossible-2 | 4 | 12 | 8 | 13 |
| impossible-3 | 4 | 7 | 9 | 12 |

All seven runs captured income on two distinct Far tiles, earned Vampire Pack before Gold, and subsequently revealed more land or won fights outside those two tiles. These timings are observed results, not a guarantee for every map, draw, difficulty option, or human-controlled encounter. Some first III attempts correctly withdrew and captured the field later.

## Behavior checked

- Opening mulligan is available to the Necromancy AI. Discarding keeps Magic Arrow and existing Necromancy, digging for a second opening copy. A guaranteed fought win pays 3 gold for Wraith Pack and 2 gold for Zombie Pack before rewards are released.
- No-crown Necromancy upgrades legal Bronze/Silver targets. With one crown and an affordable Gold Few, expert Necromancy upgrades Gold before Silver. Basic-only specialties do not acquire expert privileges.
- Zombie deploys in the front row and Wraith behind it. Single Gorgon and single Treant controls win. Two Gorgons, two Treants, and the tested three-Elemental group trigger move-away/defend, no attacks, and retreat after round 1 with 2 map movement remaining. Wraith survives.
- Following a retreat, the AI collects a nearby resource without retrying the failed guard. An unchanged army refuses the rematch; after adding Vampire and Gold packs, it returns with full movement and wins against the same guard. Retreat preserves a usable army; it does not guarantee no casualties.
- Human-controlled neutrals permit a paid Wraith Pack; ordinary neutral play waits for Necromancy.
- Optional card removal retains Necromancy and Magic Arrow. Later casualty replacement cannot reset the already-earned Vampire milestone and block Gold indefinitely.
- All-town flyer deployment uses screens; neutral movement also considers lethal enemy replies for flyers. Full-game verification in this task covers Necropolis only.

## Evidence

- `necro-final-results.json`: 21 passing tests, including seven seeded games.
- `necro-human-guards-results.json`: two passing purchase-control cases.
- Mutation checks deliberately remove behavior and must fail:
  - `necro-mutation-arming.json`: 2 failing behavioral assertions with mutation enabled.
  - `necro-mutation-arrow.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-crown.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-expansion.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-formation.json`: 4 failing behavioral assertions with mutation enabled.
  - `necro-mutation-gold.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-human.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-movement.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-mulligan.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-necromancy.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-progression.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-removal.json`: 1 failing behavioral assertions with mutation enabled.
  - `necro-mutation-retreat.json`: 3 failing behavioral assertions with mutation enabled.

Earlier failing replay and JSON files are retained as diagnostics; the final results above supersede earlier runs.

## Existing assistance rules

Single-player AI receives one temporary empowered Attack and one temporary empowered Defense card in eligible fought neutral encounters. Each can supply its +2 expert effect without a crown; this is not a permanent or army-wide stat increase. The first two eligible level-I/II battles are guaranteed wins. Those fought victories use the ordinary Necromancy window; level-advantage Quick Combat still does not. No additional combat cheats were added.

## Reproduce

PowerShell:
$env:NECRO_ALL_SEEDS="1"
node node_modules/vitest/vitest.mjs run --config artifacts/necropolis-strategy.vitest.config.ts

The explicit config only includes necropolis-strategy.test.ts; unrelated disabled simulations were not enabled.

TypeScript: node node_modules/typescript/bin/tsc --noEmit --pretty false completed successfully (exit 0). git diff --check also completed successfully.
