# Town AI strategy review — 2026-09-13

The AI changes extend the opening and retreat plan to non-Necropolis towns. Existing engine actions, combat resolution, saves, and the Necromancy path remain in use.

## Behavior

- Paid Bronze opening: two or three Packs, with Elves then Dwarves for Rampart, Cerberi then Familiars for Inferno, and Harpies then Evil Eyes for Dungeon. The third starting unit remains a Few in these three openings.
- The first Far III income fight can use that Bronze core. Travel and paid combat continuations are included when selecting a round-four target. A second Far III on another income tile requires a Silver or higher unit; automatic quick wins remain available.
- Card preparation starts during the approach, including when the next guard is waiting on army development. Magic Arrow is valued for acquisition and retention, and unusable or unsuitable cards can be cycled through actual refresh actions.
- Bronze armies recognize unfavorable revealed guards, preserve the formation while withdrawing, and avoid unchanged immediate retries. Retreat movement considers other friendly units, elemental Defense bypass, and a possible +1 attack roll.
- After the first Far capture, the reserve pays for a real Silver recruit. After two captures, missing resources guide income and pickup targets toward Gold buildings, recruits, and upgrades. Optional buildings and Silver purchases cannot consume a committed Gold fund.
- After recruiting the Gold pair, optional banks and deep guards wait for the first Gold Pack. Factory's Gold ladder honors the engine's Couatl/Dreadnought mutual exclusion instead of saving forever for an illegal recruit.
- If the preferred first Gold upgrade is unaffordable, the two-Far plan can buy an affordable Gold Pack from the existing pair. It still prefers the top unit when both upgrades are funded. Conflux can therefore upgrade Magic Elementals while short of Phoenix valuables.

## Verification scope

The user explicitly authorized these tests. The ordinary disabled test and simulation scripts were not changed.

- Focused cases use legal AI decisions and the authoritative reducer for purchases, hand refreshes, and combat entry. The opening distinction is checked across 11 standard towns and all four difficulty settings.
- Retreat cases fight revealed elemental guards and compare against weak-guard controls. They check actual retreat, surviving army cards, retry refusal, and victory/capture in the control.
- Full games use one fixed Hard seed per standard non-Necropolis town, from setup through the first Gold Pack, with a round-16 deadline. They assert the first Far III by round four, Magic Arrow in that entry hand, a Silver-or-higher body for the second Far III, and two captured Far income tiles.
- Full games retain the existing single-player first-two-level-I/II guaranteed-win rule. The harness checks every step to ensure no level-III fight receives that shortcut. These are not multiplayer or arbitrary-seed guarantees.
- Twelve source-transform mutations remove individual strategy rules without changing source files on disk. A mutation must cause a relevant behavior assertion to fail; merely loading a rule or recognizing an ID is not counted as verification.

Results and timing are recorded in `town-strategy-final.json`, `town-game-<town>.json`, and `town-mutation-<rule>.json`. TypeScript output is recorded in `town-strategy-typecheck.txt`.

## Results

Final authorized strategy run: **51 passed, 0 failed**. All 12 mutations produced relevant assertion failures. The ordinary test scripts remain disabled.

Final TypeScript check: `npx tsc --noEmit --incremental false --pretty false` exited **0**, with no diagnostics, after correcting the new reinforcement-pricing call's arguments.

The table records battle entry rounds and the first paid Gold Pack. Every listed second Far III entry carried Silver or better; every first Far III entry carried Magic Arrow. Each run captured income on at least two Far tiles before stopping.

| Town | First Far III | Next distinct Far III | Gold Pack |
| --- | ---: | ---: | ---: |
| Castle | 3 | 7 | 13 |
| Rampart | 3 | 6 | 11 |
| Inferno | 3 | 5 | 11 |
| Dungeon | 3 | 5 | 10 |
| Tower | 4 | 5 | 11 |
| Fortress | 4 | 7 | 13 |
| Stronghold | 3 | 9 | 11 |
| Conflux | 4 | 5 | 15 |
| Cove | 3 | 5 | 13 |
| Factory | 3 | 6 | 10 |
| Bulwark | 4 | 8 | 11 |

The new tests exposed and led to fixes for optional spending delaying Gold Packs, unsafe retreat movement, Factory's impossible Gold purchase target, and Conflux waiting for a costly upgrade while another Gold Pack was affordable. Earlier failing result files remain as audit history; the final result file is the completion record.
