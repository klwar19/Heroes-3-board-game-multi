# Flexible opening AI — September 14, 2026

The live policy now keeps opening Attack/Power/Knowledge support, cycles surplus Knowledge while seeking Arrow, values a powered Arrow killing an armored enemy before it acts, and spends expert Knowledge when the available damaging spells exceed remaining cast slots. It avoids redundant basic recall on the same cast. Attack decisions allow for the negative die, including attacks already at a damage cap on an average roll.

Ordinary level-II guards are now an opening alternative for a complete Bronze Pack core. This changes AI planning only: banks, special guard rules, action legality, and human-neutral formation checks remain separate. Finished combat/retreat memory now receives the pre-action state when the reducer has removed the combat.

## Matched automatic-neutrals openings

Actual multiplayer engine, five rounds, no guaranteed single-player wins, no offline search override or exploration. Seeds `chess-opening-0914-1` through `-3`, mixed Castle/Necropolis/Stronghold, Normal/Hard/Impossible respectively. Baseline is the policy at the start of this continuation (`chess-ward-fix-0914`).

Final confirmation records: `artifacts/self-play/flexible-confirm-normal-0914/games.json` and `artifacts/self-play/flexible-confirm-guards-0914/games.json`, with compressed action replays beside each record. Repeated confirmation seeds reproduced the prior changed-policy result; they are reproducibility checks, not extra independent evidence of strength.

| Seat | Baseline first premium Far | Updated first premium Far | Neutral losses before → after |
| --- | --- | --- | --- |
| Normal Stronghold | 5 | 3 | 2 → 1 |
| Normal Castle | none | 5 | 1 → 0 |
| Hard Necropolis | 4 | 5 | 0 → 0 |
| Hard Castle | none | none | 2 → 3 |
| Impossible Necropolis | 5 | 5 | 0 → 0 |
| Impossible Stronghold | none | none | 1 → 2 |

Premium captures by round 5 improve from 3/6 to 4/6; aggregate losses remain 6. Hard Necropolis is one round slower than the starting baseline. Castle Hard and Stronghold Impossible remain failures, with more losses. These small matched openings demonstrate changed behavior and specific improvements, not a general win-rate improvement or optimal play.

During development, protecting support cards initially made Hard Necropolis miss the deadline. Enabling actual level-II fallback recovered its round-5 capture and removed its two losses. An intermediate Castle Hard round-4 capture did not survive later changes and is not reported as the final result.

## Human-control rules

Different seeds `flexible-unseen-0914-1` through `-3`; policy opponents using the real human-neutral-control legal actions, not human testers. Normal and Impossible use forced attacks; Hard uses free guard control. Five of six seats capture premium Far income by round 5: rounds 4/4, 5/3, and 5/none. The Impossible Stronghold seat still misses. There were 95 executed guard-control actions and no stalls.

## Focused behavior checks

- `node scripts/check-ai-knowledge.mjs`: full legal action menu selects Arrow against a 3-health, 2-defense silver fixture; real Power reaction kills it. With an existing extra slot, useful expert Knowledge enables a third resolved Arrow, while the basic-only control cannot. The first extra Arrow also deals real damage.
- `node scripts/check-ai-low-die.mjs`: the actual attack event reports −1 in both runs. Passing deals 3 damage; the AI spends Attack and deals 4 under the same cap.
- `node scripts/check-ai-mutations.mjs`: isolated module-source mutations removing Knowledge planning and the cap's −1 allowance each fail the respective real-engine assertion. Source files are never changed by the mutation runner.
- The earlier ward-aware Arrow and legal Far-reroll checks remain available in `scripts/check-ai-spell-ward.mjs` and `scripts/check-ai-far-choice.mjs`.
- Both earlier checks were rerun successfully. `npm run typecheck` passed, and `git diff --check` reported no whitespace errors.

Offline search/training remains available, but no new learned model is installed: previous held-out evaluation did not establish a stronger model. All reported openings are round-capped trials, not completed match victories.
