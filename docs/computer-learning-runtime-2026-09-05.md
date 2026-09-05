# Executable ranked-learning and planning update

## What now runs in code

The computer does not interpret Markdown at runtime. Lessons are implemented as tested policy rules plus a small outcome-trained model consumed by `chooseComputerAction`.

Validation: the combined computer policy, runner, cycle guard, multi-seed soak, tempo, replay capture and replay learning suites pass: **35 files, 497 tests**. Type checking and linting are checked separately. These are regression results, not a measured win rate against humans.

| Request | Runtime implementation | Validation |
|---|---|---|
| Learn automatically from replays | `scripts/train-ranked-policy.mjs` extracts outcome-labelled choices; `replay-model.ts` trains bounded per-context preferences; `learned-policy.ts` supplies biases to the live chooser | `replay-model.test.ts`: training changes the selected building; a large baseline advantage still wins; repeated/conflicting evidence cannot vote repeatedly |
| Economy and progress toward gold | `development-plan.ts` persists rebuild → silver → gold → gold recruit → pressure goals, reserves inputs and defers competing side purchases | `development-plan.test.ts`: recover from casualties, serialize/resume, return to gold, actually select gold construction |
| Searches and recovery | Existing new shortage-aware acquisition scoring and strictly ordered search values | `choice-policy.test.ts`: a resource shortage changes the chosen card; surplus reverses the choice |
| Card timing | `card-policy.ts` saves another Attack reaction when the low printed die already kills; close attacks still get the boost | `card-tempo.test.ts`: selected PASS versus PLAY_REACTION flips with target survival |
| Human/neutral coordinated replies | `opponent-reply.ts` projects our position, enumerates legal enemy movement and attack reach, accounts for screens, ranged engagement and spent/paralyzed units | `planning-replies.test.ts`, `formation-tactics.test.ts`: reachable collapse, blocked approach, spent support, worthwhile attack controls |
| Formation and target choice | Existing screens, placement/tactics, focus-fire and target scorers now use the expanded reply estimate in overextension evaluation | Combat and formation regressions; no opponent private hand is consulted |
| Purposeful movement | Existing objective-distance navigation plus bounded cross-turn route history rejects repeated destinations with unchanged resources/army/holdings/reveals | `planning-replies.test.ts`: rejects empty backtracking after serialization, chooses another move, permits returning after progress |
| Second hero timing | `secondary-plan.ts` requires development gold reserve after the hire and a short reachable job list; rejects duplicating the main objective and delays a hire before the first gold recruit | `secondary-plan.test.ts`: selected hire versus end changes with jobs, reachability and funds |
| Avoid stalls | Existing runner cycle recovery remains active alongside route guard | Multi-seed soak, tempo and cycle-guard suites |

## Automatic update boundary

`npm run train:ranked` trains from configured Supabase read-only credentials. `--input <export.json>` supports an offline export; `--output <path>` supports an inspection artifact. Neither path writes to the database. No accounts or match histories are bundled in the policy JSON.

**Training NEVER runs from a build or a deploy** (audit 2026-09-05). `src/engine/computer/learned-policy.json` is a COMMITTED artifact the runtime imports; it is regenerated only by an explicit `npm run train:ranked` and reviewed in its own commit. The batch originally hung the trainer off a `prebuild` / `predeploy:partykit` npm hook and off `runNext` in `scripts/vercel-build.mjs`, failing the build on a non-zero training exit — three defects at once: a Vercel deploy would then depend on Supabase credentials and on network reachability (a single HTTP hiccup or a 30-second page timeout throws and kills the deploy), two deploys of the SAME commit could ship DIFFERENT AI behaviour, and the trainer imports `.ts` from a `.mjs`, which only resolves on Node ≥23.6 type-stripping (it fails outright on the Node 22 a Vercel builder may use, and was observed exiting 127 on Windows through a libuv assertion). All three hooks are removed; the build path is byte-identical to before the batch.

A network failure or zero usable samples during a manual training run preserves the previous model. No live match performs training or network fetches. A newly trained model takes effect when its commit is deployed.

The current snapshot produces 3,114 eligible samples across 10 retained matches, after test/short/abandonment exclusions and integrity/battle checks. With a minimum of three independent comparable matches, only one model entry currently qualifies: Fortress City Hall in stable midgame map play (two wins, one loss, a small +1.71 bias). This is correlation with shrinkage, not proof the building caused the wins. The runtime applies learned values only among close candidates of the same action type; mandatory actions and materially better base decisions remain protected. Unknown search-card identities never become invented examples.

## Scope of the planning

The development plan is a persistent goal/reserve system that adapts to losses, not an exhaustive multi-turn game-tree search. The opponent model enumerates one layer of visible attack/movement possibilities and sums possible focus damage; replies may compete for destinations, so this is conservative exposure estimation rather than a guaranteed sequence. Legal reach respects visible active effects. Damage is an expectation, and the model does not predict hidden cards, dice, or an individual human's mind.

A second hero needs two nearby usable jobs or a premium income capture within four path steps from an offered spawn. This is an opportunity threshold, not an exact gold-return calculation or a permanently assigned personal route. Ordinary secondary navigation chooses the jobs after hiring.

The route guard keeps 12 compact destination/progress records per seat. It stops the tested unchanged backtracking pattern; it does not claim that no arbitrary map can ever produce an idle turn. Ending a turn can still be correct when all useful actions are unavailable or too costly. The AI should not burn a unit or buy a useless hero merely to appear active.

## Relationship to the earlier curriculum

`computer-ranked-lessons-2026-09-05.md` preserves the original evidence, examples, and counterexamples. Its statement that no trained policy is consumed is superseded by this update. The tested rules above run; other suggestions in that document remain hypotheses until a corresponding behavior and test exist. No guarantee of beating every human or measured human win-rate increase is made.
