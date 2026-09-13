# Far-tile AI behavior check

Requested scope: clear both nearby Far tiles, including material mines; improve combat hands; recover from two settlement defeats with a Silver recruit; hire a second hero after Gold for leftover collections. Normal test runners remain disabled. These checks were explicitly authorized in this conversation.

Implementation prioritizes the two Far tiles nearest the player's starting town on the same map layer, using public positions. It selects reachable captures first, then remaining collectible objectives. It retains combat readiness checks and the two-loss recovery exception. The main hero returns to its existing policy after Gold; second-hero hiring requires Gold, reachable collection jobs, and enough gold remaining for the existing development reserve.

## Results

Final full-project TypeScript check (`tsc --noEmit --incremental false`) passed. The diff whitespace check also passed.

41 focused checks passed. They cover all four difficulties and priority decisions for Necropolis, Castle, Conflux, and Stronghold; actual hand refresh, Silver recruitment, secondary-hero hiring and leftover collection through the reducer; loss-memory deduplication and recovery; ordinary Near-mine and post-Gold controls; and actual battles along the same two-Far route.

The battle scenarios start at round 4 with three faction Bronze Packs, a level-2 main hero, two movement points, and no resources. They contain a guarded settlement and a guarded material mine on the two Far tiles, plus home leftovers. They run real combat and map actions, with computer guaranteed wins exhausted and paid combat continuations enabled. Each faction uses its own hero and one fixed seed shared across difficulties. This is a controlled route comparison, not a claim about completion rounds from a fresh random-map opening.

| Faction | Easy | Normal | Hard | Impossible |
| --- | ---: | ---: | ---: | ---: |
| Necropolis | 5 | 5 | 7 | 8 |
| Castle | 5 | 5 | 5 | 6 |
| Conflux | 5 | 5 | 6 | 6 |
| Stronghold | 5 | 5 | 5 | 6 |

Numbers are the rounds when both fields were captured. Easier difficulties never finished later than harder ones in these paired scenarios. Separate movement checks verify Easy/Normal/Hard enter with two MP while Impossible waits for the extra continuation budget. Equal completion rounds are possible; random combat is not guaranteed to have strictly ordered action counts.

## Mutation checks

All mutations were applied only by the dedicated Vitest transform, leaving source files intact. Every failure was an assertion failure, not an import or runner error.

| Logic removed | Failed focused assertions/tests |
| --- | ---: |
| Opening Far sweep/material-mine scope | 16 |
| Fight-focused hand refresh | 4 |
| Distinct settlement loss counting | 4 |
| Silver breakthrough funding exception | 4 |
| Gold required before second-hero hiring | 4 |
| Impossible's extra combat movement reserve | 1 |
| Second hero avoids the main target to collect leftovers | 4 |

The original hiring test survived the Gold-gate mutation because its pre-Gold state had fewer collection jobs. That fixture was corrected to offer the same jobs on both sides of the control, and the mutation then failed on every difficulty. The refresh fixture uses View Earth as the expendable map-only card (the audit landed the later card-planning batch, under which Estates is deliberately KEPT before a fight — it is played for gold rather than discarded); Logistics is correctly retained for movement and combat continuations.

Run the authorized checks with `node node_modules/vitest/vitest.mjs run --config artifacts/far-sweep.vitest.config.ts`. JSON results and per-faction battle timings are stored alongside this report. Mutation reports intentionally contain failures. No broad test suites or random-map soak runs were executed.
