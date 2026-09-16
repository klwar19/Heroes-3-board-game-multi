# Engine-backed AI analysis

The live computer policy evaluates legal actions through the normal server runner. It now compares revealed Far tiles by their actual settlement/mine types and previews spell damage using the engine's wards, immunities and available damage caps. Early income scheduling prefers captures sooner, allowing at most one extra estimated turn for a better holding within the opening deadline.

The offline lab can additionally branch over legal combat actions and card plays, resolve each alternative through the actual reducer and normal opposing policy, and compare completed fight outcomes. This search is **not enabled in live rooms**. It is bounded analysis, not a proof of optimal play. Unfinished branches cannot beat the ordinary policy. Chance samples use matching entropy streams across alternatives.

Explicit runs only; none of these commands are connected to builds or live game startup:

```powershell
node scripts/self-play.mjs play --games 3 --batch opening-analysis --difficulty normal,hard,impossible --rounds 5 --explore 0 --search-width 3 --search-max 8 --search-min-round 3 --cf-samples 2 --rollout-steps 150 --counterfactual 0
```

`--search-width` controls alternatives per decision; `--search-max` bounds search decisions per game. `--search-min-round` concentrates the budget on later fights. The default search width is zero. The lab defaults to multiplayer rules so the single-player automatic opening wins do not contaminate the measurements. Existing optional Quick Combat rules still apply.

`--variants default` uses automatic neutrals. `--variants guards,guards-free` uses human-controller seats driven by the AI through the actual PvP-neutral-control action menu, with forced attacks or free guard play respectively. This tests human-control rules against a policy opponent, not an actual human. The records include executed guard actions and card plays.

Training records use one game seed as one independent match; multiple alternative decisions in a game cannot inflate support. Round-capped development rankings are labelled separately from actual engine wins. The candidate model remains separate until evaluation supports replacing the shipped model:

```powershell
node scripts/self-play.mjs train --batch opening-analysis --min-matches 3 --output artifacts/candidate-policy.json
node scripts/self-play.mjs eval --games 3 --batch candidate-holdout --seed-prefix unseen-seed --difficulty normal,hard,impossible --rounds 5 --counterfactual 0 --candidate all --baseline ranked --candidate-file artifacts/candidate-policy.json
```

The evaluation swaps model assignments across seats for each seed. `all` uses the candidate plus the ranked model; `ranked` uses the ranked model alone. This comparison is not a direct candidate-versus-shipped-self-play-model comparison.

Focused behavioral checks:

```powershell
node scripts/check-ai-far-choice.mjs
node scripts/check-ai-spell-ward.mjs
node scripts/check-ai-knowledge.mjs
node scripts/check-ai-low-die.mjs
node scripts/check-ai-mutations.mjs
node scripts/check-ai-impossible.mjs
node scripts/check-ai-impossible-mutations.mjs
```

These resolve actual tile placement, spell damage, extra casts, and attack dice. They include controls and distinguish policy mutations. The mutation runner changes loaded module source only inside its child process. General test runners remain disabled unless a user explicitly authorizes a run.
