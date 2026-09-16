# AI battle coordination and growth review

Implemented in the shared computer policy, with no changes to human action legality, combat rules, saved-state schemas, or hidden-information access.

- Ground damage dealers no longer receive the flyer-only back-row reserve preference.
- Movement compares available landing attacks and projected enemy replies across factions and combat modes. Optional Wait retains value for an even trade.
- Friendly lane evaluation rewards releasing ground allies and penalizes blocking them, including combined move-and-attack actions. It uses engine movement and targeting legality.
- Focus-fire risk compares chip damage against the entire Pack, rather than confusing half its first bar with half the unit.
- Developed main heroes prioritize reachable XP fights and XP locations over low-level cleanup. Banks, no-XP fields, bank-style outposts and teleport guards do not qualify as XP targets.
- Exploration retains both options at mixed Far/higher-band doorways and can choose the band that still offers XP.
- A previously travelled corridor is allowed when it strictly reduces distance to a remaining exploration objective.
- Optional Polish Quick Combat chooses the real XP fight when the army-readiness gate permits it; an unready army retains the safe shortcut.

## Evidence

- Final `tsc --noEmit --pretty false` and `git diff --check` passed.
- 65 focused combat/choice/growth checks passed; two additional post-Far doorway/corridor checks passed.
- Mutation checks failed as intended when independently removing formation, lane access, landing attack comparison, Pack valuation, growth priority, mixed doorway recognition, growth discovery selection, productive corridor reuse, and the XP Quick Combat choice. The lane mutation also breaks the combined attack regression and Castle/Rampart/Tower controls across three combat modes.
- Three saved post-Gold games (Dungeon, Tower, Stronghold) advanced from level 4 to 5. The old policy also passes these continuations: they are compatibility observations, not evidence that the new growth rule is required.
- Broad map run: 107 passed / 7 failed before adding the corridor test. Running the original policy reproduced the same seven failures (106 passed / 7 failed, new test excluded).
- Eleven-town opening-to-Gold benchmark: seven passed / four failed. Original-policy comparisons reproduced Fortress and Factory failures. Inferno attempts another Far III with Bronze after losing the first attempt; Dungeon reaches Gold at round 10 with a different capture route and does not satisfy the required second Far III battle. Expectations were not weakened. Inferno remains slower in this seed and had no Gold Pack by round 17.
- Existing synthetic combat fixtures were corrected to include combat context/effects, assign enemies to the opposing side, and place the safe-advance control outside actual move-and-attack reach. The old gold-first march expectation was replaced with explicit wounded-target versus gold-kill controls because attack quality now determines the landing.

## Limits

Enemy damage estimates remain approximate: dice, cards, conditional abilities, and subsequent rounds are not exhaustively searched. No human win-rate claim, deployment, or commit is implied. The broad progression failures remain unresolved; this is not a claim of optimal AI or complete verification.

Relevant logs: `pvp-growth-focused-final.log`, `pvp-growth-map-tests.log`, `pvp-growth-map-before.log`, `pvp-growth-town-final.log`, `pvp-growth-town-before.log`, `pvp-growth-mutation-*.log`.
