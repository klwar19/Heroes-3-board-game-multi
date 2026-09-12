# AI income and commitment review — 13 September 2026

## Changes

- The forced home sweep ends after round 2. When FAR income is still missing and no attainable FAR capture is selected, the main hero prioritizes an accessible FAR doorway over leftover home fights.
- An attainable settlement/gold/valuables commitment survives changing movement-point estimates instead of reversing toward a newly earlier target.
- A known attainable premium-income route suppresses optional discovery/placement. Off-route fallback moves cannot consume its attack budget or trigger the old opened-tile movement bonus.
- Reveals and passive income no longer reset the route-progress comparison. A high exploration movement score is no longer sufficient to exempt an empty repeated route; a return toward a concrete attainable payoff remains allowed. History compares the last 12 recorded destinations for up to three rounds.
- Combat readiness and paid-continuation rules remain authoritative. A commitment does not authorize an unbeatable fight. Existing casualty-sensitive continue/retreat decisions remain in force.

## Observed real-battle openings

Seed `income-fortress-opening`, Gerwulf/Fortress versus a human seat which refreshes and ends turns. Normal and Impossible, events disabled, paid neutral continuations enabled. The single-player two-win allowance is exhausted before play. No guaranteed computer victories occur; each captured income field starts an actual neutral combat.

| Difficulty | First FAR income captured | Field | Paid continuations before capture | AI casualties before capture |
| --- | --- | --- | --- | --- |
| Normal | Round 3 | `h:11:5` | 0 | 1 |
| Impossible | Round 4 | `h:12:5` | 3 | 2 |

These counts cover the opening, including home battles, not only the final income battle. Before the FAR-doorway priority correction, Impossible reached round 5 without FAR income: it spent round 3 on another home fight and placed its income tile in round 4. Removing that correction reproduces the failed deadline assertion.

## Focused checks

19 tests pass across `income-commitment.test.ts` and `premium-approach.test.ts`. Checks include actual reducer ownership for settlement/gold/valuables, guarded-entry movement reserves, retaining an income commitment, rejecting empty returns, opening-bonus detours, home leftovers, and continuing after a casualty when survivors can finish versus retreating when outmatched.

Nine independent mutation checks fail on observable assertions when their behavior is removed: expansion suppression, target commitment, home-sweep cutoff, off-route suppression, progress history, route-score exemption, FAR-doorway priority, continuation budget, and casualty-sensitive continuation. Mutations are Vite transforms; production source is never rewritten for mutation runs.

An existing return test failed on the unchanged HEAD baseline: its supposed empty circuit still had a beatable settlement ahead. Its fixture now starts with that settlement already owned, then makes it capturable as the productive-return CONTROL. The expected outcomes remain END_TURN for the empty circuit and MOVE_HERO for the productive return.

Final production/test TypeScript check, focused ESLint, and `git diff --check` passed. Default test runners remain disabled; `artifacts/ai-income.vitest.config.ts` restricts the explicitly authorized run to these two files.

## Replay evidence reviewed

The stored `al8ilr` replay shows p2 attacking the level-3 field `h:3:-1` at sequence 255 in round 5, retreating at 280, and returning at 297 in round 6. The second attempt pays a continuation at 332, loses a unit at 333, and wins at 336. This supports reserving continuation capacity and judging survivors, rather than treating one casualty as an automatic retreat. It does not isolate movement from changes in army/cards.

The existing four-replay review also records `w4ibj2` losing a level-3 fight after two continuations: spare movement alone does not guarantee a win. These stored matches are human/system decisions, not measurements of the modified AI, and were used as strategic evidence only.

## Limits

No deployment or commit was performed. The screenshot's exact match state/replay was not supplied. The opening results cover this controlled seed on two difficulties, not every map, event, faction, or combat roll. Normal/impossible openings use real battles; separate automatic-win fixtures deliberately isolate navigation and ownership resolution.

Reproduce:

```powershell
node node_modules/vitest/vitest.mjs run --config artifacts/ai-income.vitest.config.ts --disableConsoleIntercept
node artifacts/check-income-mutations.mjs
```
