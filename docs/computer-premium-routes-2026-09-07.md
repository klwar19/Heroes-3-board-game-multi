# Premium economy routes and combat movement

Reviewed the four-player ranked match `0oyq08`, recorded 6 September 2026 at
18:01 Bangkok time. The result lists Absolution, Goodboy2006, REAPER and
HanzoVie, with Goodboy2006 winning. Seat-specific observations below use the
replay's faction and seat IDs; participant order is not treated as seat mapping.

The stored replay contains 1,796 actions, starts at adventure setup and reaches
round 13. It is marked truncated and has four adjacent state-hash gaps. These
are recorded action/event observations, not a complete deterministic replay or
proof that every recorded choice was optimal. Combat outcomes are matched by
combatContextId because simultaneous battles are interleaved.

## Observed opening routes

- Rampart (p3) moved to `h:14:0` and `h:13:0` in round 3 (sequences 235, 246).
  In round 4 it moved to `h:13:1` with 2 MP left (395), rotated F2 to rotation 5
  (419), and entered its difficulty-3 settlement at `h:13:2` with 1 MP left
  (449). Combat `combat_1431` ended in victory (517); the settlement was flagged
  (521). It then spent the remaining point moving to `h:13:3` (524).
- Necropolis (p2) rotated F24 to rotation 0 in round 3 (348). F24's printed
  difficulty-3 mine produces gold. It entered that mine at `h:3:6` in round 4
  with 1 MP left (457), spent that point continuing combat (528), and retreated
  to `h:4:6` (542; combat `combat_1444`). In round 5 it returned with 2 MP left
  (575), continued with 1 MP left (656), and flagged the mine (692).
  Its recorded army also changed between attempts: the return is not evidence
  that movement alone caused the better outcome.

These examples support early premium-economy priority, useful return trips,
and reserving combat movement. They do not show that every player captured
premium economy by round 4 or establish a universal best rotation.

## Policy changes

- Ready difficulty-II–III premium targets receive approach/capture priority
  above further expansion. Existing army-readiness and route legality checks
  still apply.
- Budget the walk plus one paid combat continuation. This is a conservative
  buffer, not a combat-length prediction or guaranteed victory. Automatic
  Quick Combat, unlimited rounds and free continuations require no buffer.
- If capture cannot fit this turn, prefer reachable free pickups that leave
  the premium target within next turn's movement plus combat budget.
- Permit a premium approach through a previously visited hex on a later round;
  the same-round circuit guard remains active.
- For each Far-tile rotation, materialize a temporary board and compare the
  actual path to premium fields, respecting walls and guard stops. Favor short
  routes that leave combat movement over merely counting open entrances.

Regression tests cover these rules in `premium-approach.test.ts`, alongside
the existing navigation and live computer-runner suites.
