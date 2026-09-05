# Parallel mode and human-controlled neutrals

Parallel players can move, build, use cards, resolve personal map interactions,
and fight independent neutral battles without waiting for another player's
private prompt. Each interaction retains its combat, decisions, reactions,
effects, neutral army, and reward queue when another player acts.

Shared decks and the map remain authoritative shared state. Requests commit in
arrival order; the same card cannot be drawn twice. Actions that affect another
player wait for outstanding independent interactions to finish before switching
to ordered play. PvP also ends parallel play. Shared round-start events resolve
before adventure actions resume, and the round advances only after every player
has ended their turn and all outstanding interactions have finished.

With **Parallel turns + PvP Neutral Control**, each human can switch between their
own adventure/battle and the neutral armies assigned to them. The next eligible
human clockwise receives an assignment, skipping computer and eliminated seats.
This combination includes ordinary computer-fighter and allied/co-op battles.
Existing special PvE-director exemptions remain in place. Ending an adventure
turn does not remove the player's neutral-control duties.

The switcher identifies the fighter, controller, selected role, and who must act.
Hosted viewers receive only their selected redacted frame and accessible window
summaries. Selection cannot grant access to another seat, and commands tagged for
a previous battle are rejected. Finished windows return to the player's own
activity; controller elimination reassigns parked neutral decisions.

Single-player map setup disables **Parallel turns** only. Existing single-player
guard control and ordinary ordered multiplayer neutral control retain their
rules.

## Verification

Regression coverage includes:

- Complete interleaved battles with two, three, four, five, and six humans;
  each action checks that other battles are unchanged and survives JSON reload.
- Mixed human/computer and allied/enemy tables in Clash and Co-op, including
  five complete simultaneous fights with two humans and three computer seats.
  These completion tests submit legal commands for all fighters; separate
  runner tests check computer handoff to the human neutral controller.
- Concurrent server requests, independent window selections, private views,
  invalid selection, and delayed command rejection.
- Own-turn completion while controlling another battle, all-player round
  completion, timeouts, elimination, and controller reassignment.
- Independent card searches, ongoing effects, town purchases, map spells,
  teleportation, map events, bank/reward prompts, Necromancy, and Spell Book UI.
- Ordered resolution of shared events/Astrologers, including human decisions
  within an event battle.
- Single-player setup and existing manual-guard/PvP-neutral behavior.

The actual switcher was rendered and inspected at desktop and phone widths.
Automated server concurrency tests exercise simultaneous client requests; a
full live match across multiple physical devices was not performed. These are
regression checks, not an exhaustive proof of every content/mod combination.

TypeScript checking passed. The broad run passed 416 checks; its final
event-routing case and a lobby worker-start timeout were subsequently resolved
by rerunning the affected suites (78 passing checks). The final battle suite
passed 34 checks, including the ended-turn controller case and the five-player
mixed-table completion cases in both Clash and Co-op.

Lint also identifies existing draft-setup React-hook errors in
`DraftPhaseAnnouncement` and `DraftFlowPanel` in `screen.tsx`; both functions are
unchanged from the repository's HEAD. These are outside this parallel-mode fix.
