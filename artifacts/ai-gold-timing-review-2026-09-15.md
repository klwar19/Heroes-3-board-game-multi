# AI gold timing review — 2026-09-15

## Status

The round-8–9 reliability target is **not yet demonstrated**. This pass changed
AI decision code and reviewed existing results; it did not run games, tests,
simulations, or mutation checks. Existing results are not a clean baseline for
the current overlapping working-tree changes.

## Existing saved results

Counted directly from `artifacts/eval-<town>.txt`, with 30 saved runs per town.
These files predate this pass and differ from some aggregate summaries.

| Town | Gold by round 9 | No gold at saved round-11 cutoff |
| --- | ---: | ---: |
| Bulwark | 23/30 | 2/30 |
| Conflux | 15/30 | 5/30 |
| Cove | 23/30 | 1/30 |
| Dungeon | 20/30 | 3/30 |
| Inferno | 19/30 | 1/30 |
| Necropolis | 15/30 | 5/30 |
| Rampart | 22/30 | 3/30 |
| Tower | 24/30 | 3/30 |

Castle is covered by the existing formation/card policies but is not in this
eight-file aggregate. No new Castle timing result is claimed.

## Faction opening policies retained

| Town/hero | Paid Bronze Pack order | Silver direction |
| --- | --- | --- |
| Castle | level 3 → level 1 → level 2 | First planned Silver, then Gold funding |
| Conflux | level 3 → level 1 → level 2 | First planned Silver; Sprites Pack exception before Gold |
| Inferno | level 3 → level 1 | First planned Silver, then Gold funding |
| Dungeon | Evil Eyes → Harpies | Minotaurs → Medusas → Gold |
| Rampart | Elves → Dwarves | Dendroids; skip Pegasi |
| Tower, Cove, Bulwark | level 3 → level 2 → level 1 | First planned Silver, then Gold funding |
| Necropolis without Necromancy | level 3 → level 2 → level 1 | Normal development |
| Necropolis with Necromancy | Skeletons first; seek earned Wraiths, then Zombies | Vampire Few → earned Pack, with a paid fallback when no ready nearby fight can supply it |

After Silver, replacement Bronze rules supersede the opening order. After Gold,
Gold replacements supersede Bronze purchases even following casualties.

## Changes in this pass

- Save the Gold dwelling and its first Gold recruit together, including recruit
  discounts. Let the dwelling spend the Build token with its existing cushion
  while the later recruit is still being funded.
- Fund Dungeon's ordered Minotaur then Medusa purchases before Gold. Preserve
  Rampart's Dendroid-first plan and the faction-specific Bronze opening order.
- After premium capture/Silver, refuse paid lower-Bronze upgrades outside the
  explicit Conflux Sprites exception; keep Few screens.
- Compare attainable resource sources by shortage, travel, combat movement
  reserve, and recurring income. A distant valuables source no longer wins
  automatically over nearby materials, gold, or settlements.
- Count guaranteed combat Arrow + Power in map readiness. Knowledge and another
  natural copy are no longer mandatory for approaching a beatable Far fight.
- Prioritize legal held-Far placement and a short approach to its doorway in
  rounds 2–3. Empty supply skips this branch; ordinary productive routes remain.
  Begin general combat-card preparation while held Far tiles are being opened.
- Settlement valuables planning checks reachability and fight readiness, and
  stops forcing valuables after the current target is funded.
- Allow legal paid Wraith/Vampire Pack fallback when a held Necromancy cannot
  be used in a reachable fight within a turn's movement budget.
- Necropolis without Necromancy follows normal Silver/Gold development rather
  than restarting its Bronze opening after obtaining Silver.
- Enforce the two-Defense-2-guards retreat exception using Gold/Azure or an
  actual Minotaur. Attack buffs and commanders no longer waive it.
- Remember whether a failed army already had a premium body. Merely keeping
  that same Silver no longer counts as an improvement permitting a retry.
  The added memory field is optional for old saves.
- Track the early decision to withdraw from the two-armored-guards rule until
  retreat becomes legal at the round boundary. With surviving units, that
  scouting retreat permits next-round retry; same-turn reentry remains blocked.
- Remember Silver/Gold milestones across casualties. After Silver, allow at
  most one cheap lower-Bronze replacement screen; after Gold, stop all paid
  Bronze purchases. A lost Gold body reopens its Gold recruitment step.
- Permit a post-Gold secondary hero with the hiring cost plus the five-gold
  cushion and a concrete collection route. Useful market visits can join that
  route; no recruitment occurs just because the treasury can pay.
- Include standing spell Power when choosing damage targets, and include
  Mummies in the neutral targets worth boosting toward a kill. Existing exact
  pending-spell evaluation still stops pointless/lethal-overflow Power spending.

## Review boundaries

Changes are confined to computer development, navigation, purchase scoring,
card evaluation, retreat decisions, and AI memory (including optional saved
state fields). They select authoritative legal actions;
shared movement, recruitment costs, combat resolution, and UI legality were
not changed in this pass.

Reviewed existing Castle formation/Defense conservation, specialty valuation,
armored-target/Mummy spell valuation, and phantom-card combat-start/end wiring.
Those existing changes are retained, not newly behavior-verified here.

A fresh matched-seed baseline/current comparison is still needed to establish
the timing target. Compiler success cannot establish combat or economy results.

Final static validation: `npm run typecheck` completed with exit code 0 after
the code changes. `git diff --check` reported no whitespace errors in the
reviewed source paths. No deployment or commit was performed.
