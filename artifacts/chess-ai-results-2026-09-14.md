# AI improvement results — September 14, 2026

This is the earlier experiment report. Continued live-policy changes and their regressions are recorded in [the flexible-AI follow-up](flexible-ai-results-2026-09-14.md).

26 completed five-round game trials, including repeated matched seeds and six held-out mirrored evaluations. These are bounded openings, not 26 completed matches. Trials used the actual engine for movement, economy, cards and combat, without the single-player two-win shortcut. One initial human-control harness attempt failed authorization and was corrected before the completed trials. An unbounded search attempt was stopped and replaced with an explicit per-game search budget.

## Measured changes

| Matched case | Baseline | Changed result | Scope |
| --- | --- | --- | --- |
| Normal, Stronghold, `chess-opening-0914-1` | First Far capture R5; 2 neutral losses | Premium Far capture R3; 0 losses | Offline engine search; 6 completed comparisons, 2 decisions changed |
| Impossible, Necropolis, `chess-opening-0914-3` | No Far capture through R5; 1 neutral loss | Premium Far capture R5; 0 losses | Live spell-policy correction |
| Hard, Castle, `chess-opening-0914-2` | Far capture R5 | No Far capture through R5 | Regression in the changed full-game trajectory; not resolved |

The initial Far-targeting-only reruns had identical outcomes to baseline. They are not evidence of increased playing strength. The later spell correction changed the Impossible outcome; full-game dice/event ordering and opposing-seat decisions can also change after a policy change, so one seed is not a general strength estimate.

## Learning evaluation

Candidate trained from 7 independent games, 1,502 decision samples, including 24 alternative-fight outcome samples. No inflated independence from multiple decisions in the same game.

Six held-out games with model assignments swapped: candidate 3 versus ranked baseline 3 on the lab's **development ranking**, not actual match victories. Mean Far holdings were 0.50 versus 0.33, mean hero levels 2.50 versus 2.17, and each side had 5 neutral losses. This does not establish a stronger overall model. The shipped self-play model was **not replaced**.

Candidate: `artifacts/self-play/chess-search-final-0914/candidate-policy.json`.
Evaluation: `artifacts/self-play/chess-candidate-holdout-0914/games.json`.

## Verification

- Final `npm run typecheck` passed; `git diff --check` found no whitespace errors.
- Real-engine Far redraw check: AI selects and materializes a gold mine instead of returning to the old ore mine. Rule-off control preserves ore. Removing the structured policy causes the outcome assertion to fail.
- Real-engine spell check: AI chooses a damageable target instead of spending Arrow into a ward for zero damage. No-ward control selects the lethal target. Removing ward-aware preview causes the damage assertion to fail.
- Both source mutations were applied temporarily, rejected by assertions, restored, and the original checks passed again.
- Five selected existing card/Far-choice tests passed; 51 unrelated tests were skipped. The old damage-spell fixture used zero-Power Implosion (zero actual damage); it now supplies Magic Arrow, preserving the intended positive-damage assertion.
- Human-control trials executed actual guard actions: normal forced-attack mode 30; Impossible free-control mode 28. Those opponents were AI policies using human controls.

## Remaining limitations

The round-4/5 deadline is **not achieved across all tested seats**. Castle remains a problem; Impossible Stronghold also missed the deadline. Search is offline, not a live chess engine, and does not establish optimal play. The new trained model has no demonstrated win-rate advantage. Existing single-player guaranteed wins and optional-rule behavior are preserved in live games.
