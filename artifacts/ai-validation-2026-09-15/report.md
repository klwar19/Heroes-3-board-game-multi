# AI economy and PvP validation — 2026-09-15

## Conclusion

High round-9 Gold reliability is **not established**. The bounded current-AI screen obtained Gold by round 9 in 9/12 runs; this is a deliberately small screen, not an estimate of every town’s long-run reliability. Concrete misses and requested-path mismatches remain.

The updated AI won **74/90** completed/requested equal-army PvP fixtures against the committed AI (82.2%). This supports improvement in this fixture family, not general full-game or human-opponent win rates.

## Economy observations

Impossible adventure; events disabled; deterministic seeds; fixed baseline Castle opponent; actual recruit ownership excludes bank cards. Stop after round 11 or actual game over. A defeat before Gold counts as a miss, not an excluded sample. Far III wins count distinct Far tiles, not multiple fields on one tile.

| Town / hero | Seed | AI | First Far III win | Second Far III win | Silver | Any Gold | Top Gold | End |
|---|---|---|---:|---:|---:|---:|---:|---|
| dungeon / alamar | eval-0 | current | 4 | 7 | 7 | 9 | not recorded | round-11-complete, R12 |
| dungeon / alamar | eval-0 | baseline | 3 | 5 | 5 | 9 | not recorded | round-11-complete, R12 |
| conflux / erdamon | eval-0 | current | 5 | 8 | 5 | 9 | 9 | round-11-complete, R12 |
| necropolis / sandro | eval-0 | current | 7 | — | — | — | — | engine-game-over, R10 |
| necropolis / tamika | eval-0 | current | 4 | — | 5 | 9 | 9 | round-11-complete, R12 |
| castle / catherine | eval-0 | current | 4 | — | 5 | 9 | 9 | round-11-complete, R12 |
| tower / cyra | eval-0 | current | 4 | — | 5 | 9 | — | round-11-complete, R12 |
| necropolis / sandro | eval-0 | baseline | 8 | — | 9 | — | — | round-11-complete, R12 |
| rampart / gelu | eval-0 | current | 3 | 7 | 7 | 9 | 9 | round-11-complete, R12 |
| cove / astra | eval-0 | current | 4 | 10 | 5 | 9 | 9 | round-11-complete, R12 |
| inferno / xyron | eval-0 | current | 4 | 9 | 7 | 11 | 11 | round-11-complete, R12 |
| bulwark / dhuin | eval-0 | current | 4 | 9 | 5 | 9 | 9 | round-11-complete, R12 |
| necropolis / sandro | eval-1 | current | 4 | 9 | 5 | 9 | 9 | round-11-complete, R12 |
| necropolis / sandro | eval-2 | current | 7 | 8 | 7 | 11 | 11 | round-11-complete, R12 |

The initial Dungeon pilot did not record the separate top-Gold metric. A dash means not obtained/observed before termination. Round-11-complete has finalRound 12 because the engine advanced after completing round 11.

### Concrete findings

- Sandro, eval-0: first Far III victory round 7, no Silver or Gold, defeated round 10. Tamika on the same seed obtained Silver round 5 and Ghost Dragons round 9. These distinct hero paths must not be conflated.
- Sandro follow-up: eval-1 obtained Ghost Dragons round 9; eval-2 obtained them round 11 after its first Far III victory round 7. Across the three Sandro seeds, only 1/3 met round 9. The matched committed Sandro eval-0 baseline also missed Gold by cutoff, although it obtained Silver round 9.
- Inferno, eval-0: Silver round 7, second Far III win round 9, Arch Devils round 11. The requested round-9 Gold timing was missed.
- Tower, eval-0: Nagas round 9; no Titans by cutoff. An any-Gold metric alone hides the unmet top-Gold goal.
- Rampart, eval-0: recruited Pegasi round 7 instead of the requested Dendroids. Gold Dragons round 9 does not make the faction path compliant.
- Dungeon paired eval-0: both AI versions obtained Gold round 9. Current first/second Far III victories were rounds 4/7 versus baseline 3/5; Silver was round 7 versus baseline 5. This pair does not demonstrate an economy improvement.

## PvP controlled comparison

Five seeds (pvp-1 through pvp-5), nine factions, current AI attacking and defending each seed: 90 fixtures. Both sides have the same faction, hero, level-5 hero, level-3 Bronze Pack, one cheap Bronze Few, one Silver Few, both Gold Few, seven identical held cards, and identical resources. Dungeon uses Minotaurs; Rampart uses Dendroids. Authoritative player-combat initialization and production decision runner handle preparation, cards, formation, and resolution. Only actual engine combat winners count; no development-score cutoff winner is used.

| Town | Updated AI wins | Completed outcomes |
|---|---:|---:|
| castle | 6/10 | 10 |
| rampart | 9/10 | 10 |
| inferno | 7/10 | 10 |
| dungeon | 10/10 | 10 |
| tower | 8/10 | 10 |
| conflux | 8/10 | 10 |
| necropolis | 9/10 | 10 |
| cove | 9/10 | 10 |
| bulwark | 8/10 | 10 |

Across 45 seed/faction pairs: updated AI won both seat assignments in 31, split in 12, and lost both in 2. The two seats of a pair are correlated; do not treat them as independent random population samples.

The separate pvp-0 Castle/Dungeon pilots each split 1–1 (defender won both). They are saved but excluded from the balanced 90-fixture table.

## Baseline and limits

- Baseline AI modules come from commit d4acdeb7bfbaeb2aceacf5c101f3ac37ea8c7dd5. Both policies run on the same frozen current engine, data, legal actions and runner. This isolates the AI-module bundle; it is not an exact historical full-engine checkout or an ablation of individual edits.
- Snapshot and manifest were captured before runs. Concurrent workspace edits cannot change the measured candidate.
- Economy uses one seed for most towns and additional targeted Sandro checks. No claim of 90% reliability per town is supported. No paired all-town economy improvement claim is supported.
- PvP supplies a fixed developed army and hand. It measures conditional combat strength, not economy-to-PvP success, varied opponents, every hero/card/formation, or human play.
- This is performance observation against a behavioral control, not mutation-checked coverage of every golden rule. No production behavior was changed during this verification.
- Recorded errors/stalls/step limits: 0. All such runs remain in denominators.

## Reproduction

Harness: ../../scripts/validate-ai-gold-pvp.mjs. Frozen source: snapshot/. Baseline metadata: manifest.json. Inputs: *jobs.json and economy-batch-*.json. Raw results: *results*.jsonl. Failure state and last actions: *failure.json.

Run an explicitly authorized job file with:

```text
node scripts/validate-ai-gold-pvp.mjs run artifacts/ai-validation-2026-09-15 <jobs.json> <fresh-results.jsonl>
```

Result files append; use a fresh result filename to avoid double-counting. Do not recreate the existing snapshot. This harness is not attached to npm test, builds, CI, or background schedules.
