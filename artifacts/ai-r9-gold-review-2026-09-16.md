# AI round-9 Gold review — 2026-09-16

Goal: a level-7 Gold body by round 9 more reliably, without touching the locked
golden rules (far-tile logic, retreat logic, Magic Arrow targeting, near-tile
logic, the Gold-unit ladder).

## Method

- Baseline: `scripts/eval-town.mjs` + a per-round economy diagnostic
  (scratchpad `diag-econ.mjs`: resources at round start, income, builds,
  recruits, moves, unspent movement, fights, Far captures) over 30 seeds per
  town, impossible, single-player boost on, seat p2 vs a Castle AI.
- Reference: 36 ranked replays (all human seats, 60 seats ≥ 8 rounds), read
  event-wise (never replayed through the engine). Human median: City Hall R4
  (40/60 seats), Silver dwelling R5, Gold dwelling R7 **with the Gold body the
  same round**, income ≈ 15 by R7. 46/60 human seats had a Gold body by R9.
- Every change was found from a concrete traced seed, then re-measured over
  the 30-seed set. Rules are checked against real engine state by
  `verify-rules.mjs` (18 checks, all pass); no vitest run was made.

## Results (30 seeds, to R11)

| Town | Gold body by R9 | Gold dwelling by R8 | Neutral fights lost |
| --- | ---: | ---: | ---: |
| Dungeon before | 25/30 | 20/30 | 0 |
| Dungeon after | **28/30** | 21/30 | 0 |
| Necropolis before | 20/30 | 21/30 | 0 |
| Necropolis after | **24/30** | 24/30 | 0 |

Out-of-sample towns (not traced or tuned), final code, same 30 seeds. The
"older file" column is `artifacts/eval-<town>.txt` from 2026-09-15, produced
on an older working tree, so it is a sanity bound rather than a strict A/B.

| Town | Gold body by R9 (final) | Older file | Gold dwelling by R8 |
| --- | ---: | ---: | ---: |
| Tower | 25/30 | 24/30 | 22/30 |
| Rampart | 24/30 | 22/30 | 25/30 |

## What was wrong (traced) and what changed

1. **Market churn after the Gold dwelling** (Dungeon seed 0, R9): the generic
   trade heuristic had no floor once Gold was unlocked. It sold the valuables
   the Black Dragon needed, the Gold-step plan bought one back at 6 gold, the
   heuristic sold it again for 3; 22 trades later the seat held 23g/0m/0v and
   no dragon (bought R11). Fix: `tradeUtility` keeps the development target
   in every phase and never spends gold below the saved-purchase target
   (market-trades.ts). Seed 0 now buys the dragon on R9.
2. **Valuables reserve (user ruling)**: valuables are never sold below what
   the remaining Gold ladder still needs — dwelling while unbuilt, then each
   missing Few/Pack; only the surplus may go, and only for a real gold
   shortfall. `goldLadderValuablesReserve` (development.ts) drives the trade
   floor, the Gold-step market plan and paid visits.
3. **Tree of Knowledge paid with valuables** (Necropolis seed 6, R5): the flat
   cost penalty preferred 3 valuables over 10 gold; the Gold dwelling slipped
   R7→R9. Fix: a paid visit never spends materials/valuables below the plan
   target (map-policy PAY_TO). Seed 6: dwelling R7, Ghost Dragons R8 (was R11).
4. **Five-round park** (Necropolis seed 14, R7–R11): the primary objective
   (beatable learning stone, 4 cells) was reachable only through a witch hut;
   the march scorer's strict graph read every step as "no progress" (260 <
   END_TURN), and the premium-approach score (936) is only honoured when the
   ordinary scorer agrees. Fix: a step that shortens the visit-passing route to
   the primary counts as progress (map-policy moveScore). The seat now
   marches, sells 7 surplus materials at the adjacent Trading Post and builds
   its Silver dwelling R7 (was R9), Vampires R9 (was R11).
5. **Dwelling gold gap**: the Gold-step market plan now also covers the next
   dwelling's GOLD gap from surplus materials (+3 cushion) and Pack steps
   (user: "sell to upgrade others"); it never buys dwelling inputs (that stays
   the rush planner's job).
6. **City Hall window (user ruling)**: ideal ≤ R4, marginal R5–R6 (surplus
   only, never ahead of a dwelling), off limits from R7
   (`INCOME_FIRST_LAST_ROUND = 4`, `INCOME_NEVER_FROM_ROUND = 7`). The old
   "first Far income captured" precondition was dropped (it made the window
   unreachable), the hall must be payable now, and it never pushes a
   next-Resource-Round dwelling out. A trial that also allowed it during the
   Pack-core opening was **reverted**: it fired on R3 in Tower seeds 11 and 12,
   left 0 gold, and after a lost fight the re-recruits ate the R5 income, so
   the Silver dwelling slipped to R6–R8 (Gold body R11 / never). On this
   impossible economy the hall only pays once the core stands; it still fires
   rarely (0–1 seeds per 30).

## Second pass (user rulings on the two blockers)

7. **Valuables-starved seats go and get valuables.** `resourceUrgency` reads
   each shortage in Resource Rounds of income (16 gold on 15 income = 1 round;
   3 valuables on 1 = 3 rounds); the funding planner weighs sources by that,
   counts creature banks whose floor reward pays the resource, and — when no
   valuables source is known and no Trading Post can close the gap — reveals
   more land (the band deferral for near / deeper / underground / sea tiles is
   lifted for such a seat, so their unguarded pickups and beatable banks
   become objectives; unbeatable guards stay excluded). Dungeon's hall picks
   its valuable option while starved. Necropolis seed 29: dwelling R7, Ghost
   Dragons R9 (was R11).
8. **Lower Gold Few released** when it cannot delay the level-7's landing
   (landing rounds read without trading unless a Trading Post is in reach)
   AND the army with it can beat a reachable resource fight (bank, guarded
   mine / settlement / pickup). Necropolis seed 0: both Gold bodies R9.
9. **Reachability through visit stops.** The objective picker's "reachable"
   filter used the strict graph, so anything behind a temple / shrine was
   invisible to every branch (a funded Trading Post four cells away in Dungeon
   seed 22). It now reads the visit-passing graph, like the march scorer.
10. **Only the Trading Post trades resources.** The War Machine Factory is a
    "market" too; the saved-recruit and rush plans pulled the hero to a
    Factory on its Far tile every turn (open, no trade, leave, return —
    Rampart seed 0). Every resource-trade plan now targets `trading_post`.
11. **No side building during PvP preparation.** With the enemy at the gate
    the 280 "not before the Gold dwelling" band still beat ACCEPT (225) and
    Dungeon seed 10 bought a Portal of Summoning with the dwelling's valuable.
    Non-dwelling builds score 200 while a battle is being prepared.

12. **Faction-specific hall payout.** Rampart's hall pays 7 gold, Inferno's 6
    (others 4–5). A high-payout hall may go during the Pack-core opening and
    without the five-gold cushion (the dwelling tempo guard still applies);
    every ranked Rampart seat built it by R3. In the eval it still fires only
    1–2 times per 30 seeds: the Silver dwelling is almost always "reachable
    now" on R3–R4, and the ruling keeps a dwelling ahead of the hall.

### Results after the second pass (same 30 seeds, final code)

| Town | Baseline / older file | Final | Gold body on R7 |
| --- | ---: | ---: | ---: |
| Dungeon | 25/30 (baseline) | **27/30** | 10 (was 4) |
| Necropolis | 20/30 (baseline) | **26/30** | 7 (was 1) |
| Tower | 24/30 (older file) | **28/30** | 9 |
| Rampart | 22/30 (older file) | **23/30** | 10 |
| Inferno | 19/30 (older file) | **22/30** | 6 |

"Baseline" = this tree before the pass; "older file" = `artifacts/eval-<town>.txt`
from 2026-09-15 on an older tree (a bound, not a strict A/B).

Dungeon's one lost seed (eval-10) is a PvP defeat at its settlement on R9,
not an economy miss; its Gold body now lands R7 in a third of the seeds.

## Remaining limits

- PvP defeats at R8–R11 (the Castle AI attacking our Far settlement) still
  cost 2–3 seeds per town; combat and PvP engagement were not in this pass.
- The City Hall window is encoded but rarely reachable on impossible.
- Neutral fights: 0 losses in 150 seeds; the R/L entries are the two-Def-2
  scouting retreats the retreat rule mandates.

## Files

development.ts (hall window, valuables reserve, remaining opening Pack gold,
market plan), market-trades.ts (trade floors), map-policy.ts (hall band, route
progress, paid-visit guard). `npm run typecheck` exit 0 after every step.
