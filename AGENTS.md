# Agent instructions

## Implement real behavior
- Implement requested rules in the authoritative engine and connect them to usable UI actions.
- Text, labels, ability IDs, animations, and data entries alone are not implementation. No decorative or inert features.
- Keep displayed rules, ability definitions, and implementation status consistent with actual behavior. Mark unfinished behavior honestly.
- Follow each rule through action legality, resolution, targeting, damage/healing, timing, cleanup, and multiplayer state where applicable.
- Preserve existing gameplay, optional-rule behavior, saves, and unrelated user changes. Fix the cause of a bug, not just its symptom.
- AI plans must account for each hero's implemented specialties, starting cards and stats as well as faction. Use observed mistakes to improve exploration, economy, building, combat preparation, fighting and recovery while preserving the user's golden rules.
- Isolate ability- or rule-specific changes to their own branch/path. Never tighten shared legality, movement, targeting, or resolution for a special case unless every consumer is audited and the broader behavior is explicitly requested.

## Verification restrictions
- Do not create, run, or re-enable battle simulations, map simulations, stress tests, soak suites, or any test runs unless the user explicitly asks.
- This restriction includes direct runs and runs through scripts, CI, helpers, or background jobs. Do not bypass disabled runner configurations without that explicit request.
- Review the relevant code paths and edge cases without executing tests. Do not broaden work into unrelated checks.
- When the user explicitly requests a test or simulation, run only what they requested; do not expand it into other tests or suites. Check observable behavior, not just labels or data presence. Never change an expected result merely to hide a failure.
- A test verifies a rule only if it FAILS when that rule's logic is removed (mutation-checked). A wiring/data check that still passes with the behavior broken is not coverage: treat a "verified" claim whose test survives the mutation as a finding to fix, not as proof. Assert the observable outcome against a CONTROL where the old and new behavior diverge.

## Honest completion
- Complete the requested behavior; do not substitute a stub or silently change the rules.
- Report what changed, what was actually checked, and any remaining limitations. Never claim a test passed if it was not run, or guarantee zero bugs.
- Do not claim work is deployed, committed, or fully verified without evidence.
- Keep these instruction files short. Do not append completed-feature histories, changelogs, or session reports.
