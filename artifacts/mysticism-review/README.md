# Mysticism recall investigation

The production replay for match `room-room-wkz495-d4feab4b-26b3-4d63-8f48-f195d790cfa0`, recorded 2026-09-13 17:39 UTC, matches the supplied Luna/Conflux versus Castle screenshot.

Round 11, Conflux seat p3:

| Sequence | Recorded action |
| --- | --- |
| 1173 | Declare melee attack |
| 1174–1175 | Cast Bloodlust; discard Power to enemy Zealots' Spell Sunder |
| 1176 | Play Mysticism in **expert** mode |
| 1177 | Play Scales of the Greater Basilisk (+1 Power, draw 1); draw Power |
| 1178 | Pass; attack deals 5 damage; only Bloodlust returns |

The instant-spell handler selected support cards when Mysticism was played. It therefore missed Basilisk played afterward, although that card still increased Bloodlust's effect. Normal casts selected support at resolution and did not have that timing mismatch.

The fix defers expert instant-spell support collection until attack resolution. It also preserves per-player ownership, paid fuel and source zones, ongoing spell destinations, and cards promised for return during reshuffles. Additional corrections cover cancellation, later Knowledge overwriting expert recall, consumed School cards, and consistent map recall offers.

The Power discarded to Spell Sunder is a separate enemy-imposed discard, not the newly drawn Power. The latter was never played in this recorded sequence and was already in hand.

`recorded-bug-evidence.json` contains the relevant original actions and events. The ranked replay was inspected without replaying the entire game through the current engine. The regression tests recreate the recorded action order in a controlled combat fixture.

Focused checks: `node node_modules/vitest/vitest.mjs run --config vitest.mysticism.config.ts`.

Mutation checks: `node scripts/check-mysticism-mutations.mjs`. These use test-only source transforms and never edit the production files. Results are recorded in `mutations.json`; a mutation counts as detected only when an actual assertion fails.

Completed validation: 18 focused tests passed; all 9 deliberate mutations were caught by observable-outcome assertions; TypeScript `--noEmit --incremental false` passed; changed-file whitespace/diff checks passed.

The default test runner remains disabled. No unrelated suites or battle/map simulations were run. These changes have not been committed, pushed, or deployed; the user explicitly requested no push.
