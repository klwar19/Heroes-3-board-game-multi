# Inferno and Sandro AI corrections — 2026-09-15

## Implemented decisions

- Inferno: after securing its first Far income tile, keep the surviving Cerberus and Familiar Packs and save for Silver instead of replacing a lost Magog screen. If either opening Pack is lost, ordinary recovery remains available. This does not change legal recruitment or unit costs.
- Sandro without Necromancy: Wraiths remain the first paid Pack, then Skeletons before Zombies so the starting Skeleton transformation has a legal host earlier. Heroes with actual Necromancy retain their earned-upgrade plan.
- Sandro hand preparation: before a nearby neutral fight in the opening, a duplicate natural Magic Arrow can be cycled while searching for the Skeleton specialty. One natural Arrow is retained. The change excludes imminent PvP and respects actual replacement-card supply.
- Sandro settlement choice: when existing materials/valuables plus the next printed income cover the Silver dwelling and Vampire, but gold is short, choose Gold income for that breakthrough. Once Silver is owned, ordinary valuables-deficit planning resumes.
- Tavern: the seven-gold secondary-hero purchase now uses the existing Gold-army and useful-work gate. The nested visit previously bypassed the direct hiring policy and spent the first Gold recruit fund.
- TypeScript configuration excludes only saved AI snapshot directories from the application compilation; production source and existing tests remain included.

## Observed results

Top Gold by round 9: **6/6** completed scoped runs. This small, deliberately selected sample is not a general reliability estimate.

| Town / hero | Seed | Before: first Gold | After: first top Gold | Before: Silver | After: Silver | First Far III win after | End |
|---|---|---|---:|---|---:|---:|---|
| inferno / xyron | eval-0 | 11 | 9 | 7 | 5 | 4 | round-11-complete |
| inferno / xyron | eval-1 | not measured | 9 | not measured | 5 | 6 | round-11-complete |
| inferno / xyron | eval-2 | not measured | 9 | not measured | 3 | 4 | round-11-complete |
| necropolis / sandro | eval-0 | none before defeat R10 | 9 | none | 5 | 4 | round-11-complete |
| necropolis / sandro | eval-1 | 9 | 8 | 5 | 5 | 4 | round-11-complete |
| necropolis / sandro | eval-2 | 11 | 9 | 7 | 5 | 5 | round-11-complete |

The Inferno eval-1/eval-2 runs were additional scenarios, not used to choose the fixes. The other four initial states have pre-change controls in ../ai-validation-2026-09-15/.

## Evidence that the decisions matter

- Original Inferno eval-0 bought a Magog after its round-4 Far win, obtained Silver round 7 and Arch Devils round 11. Removing that replacement purchase moved Silver to round 5 but Gold only to round 10: a round-8 Tavern hire still consumed seven gold. With the Tavern gate, Arch Devils arrived round 9.
- Original Sandro eval-0 retreated after the round-4 fight and never obtained Silver or Gold before defeat. The specialty-opening revision won its first Far III round 4 but still obtained Silver round 7 and Ghost Dragons round 11. The settlement-income revision moved Silver to round 5 and Ghost Dragons to round 9, with no neutral retreats or losses in that replay.
- Intermediate control results and action traces are retained in ../ai-inferno-sandro-fix-2026-09-15/. These are observed whole-policy controls, not a claim of mutation-checked coverage for every golden rule.

## Method and limits

Authoritative engine and production computer runner; Impossible adventure; events off; same eval-N seeds; fixed committed Castle opponent. Current candidate and pre-change controls use identical frozen engine/data. The final snapshot reuses the first revision’s engine and replaces only the changed map policy. No resource grants, weakened guards, fabricated wins, or cutoff-score winners were added.

Stop after round 11 or an actual game-over. A missed Gold purchase remains a miss. Raw results distinguish Gold dwelling construction from actual ownership of the top roster Gold unit. Far III wins count distinct tiles; some later captures can occur through quick resolution without a recorded full battle.

Errors, stalls or action-limit exits in this sample: 0.

PvP was not rerun in this economy correction. These results do not establish high win rates against humans or round-9 reliability for every town/hero/seed.

## Static validation

Passed: focused TypeScript semantic check of the three changed AI modules and their imported production dependencies (`tsc --noEmit -p tmp/ai-inferno-sandro-typecheck.json`), and `git diff --check` for the changed AI/config files. The full-project typecheck attempts were interrupted while investigating compilation of saved source copies; they are not reported as passes. Existing unrelated tests were not executed.

## Reproduction and files

Harness: ../../scripts/validate-ai-gold-pvp.mjs. Input jobs: inferno-jobs.json, inferno-extra-jobs.json, sandro-jobs.json. Frozen source and hashes: snapshot/, manifest.json. Outcomes: *results.jsonl. Decisions, resources and hands: *results.jsonl.trace.jsonl.

```text
node scripts/validate-ai-gold-pvp.mjs run artifacts/ai-inferno-sandro-final-2026-09-15 <jobs.json> <fresh-results.jsonl>
```

Use fresh result filenames: the runner appends. No runner was added to CI, npm test, build hooks, or a schedule.
