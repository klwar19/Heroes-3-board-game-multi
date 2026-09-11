# Event window review

The Wandering Merchant uses an independent, authoritative purchase action. It checks the active round, buyer eligibility, ownership, current discounted cost, resources and the once-per-round purchase record. Only the buyer's combat or unfinished hand draw blocks it. Opening or minimizing its notice is local UI state. Buying does not advance the displayed combat. The notice is mounted on both the adventure and combat layouts and disappears after buying or round expiry. Its generated WebP artwork is 79,388 bytes.

Parallel Event/Astrologers rewards are routed at their event creation sites into per-player interaction contexts. Ordinary building rewards, wave queues, arena duels and designer timed events retain their own paths. Normal ordered play retains its existing event sequence. Deferred rewards are retained when parallel play ends; private rewards are filtered in player views.

## Coverage reviewed

| Event cards | Parallel handling |
| --- | --- |
| Crypt; Cursed Swamp; Garden of Revelation; Market of Time; School of Magic and School of War; Stables; The Villagers' Plea; Withered Hermit | Independent player choices and their draw/search follow-ups |
| Messenger with Supplies | Independent player draw and selection |
| Library of Enlightenment; Mage Laboratory; Shrine of the Magic Thought | Concurrent shop choices, live pool and cost validation |
| Artifact Merchant | Concurrent shopping; live pool and discard-top validation |
| Magical Forest | Concurrent contributions, then concurrent selections; cleanup follows completed selections |
| Mercenary Camp | Concurrent draws, then concurrent recruiting; cleanup follows completed selections |
| Mischievous Leprechaun | Concurrent dice choices, matching by die face rather than a shifting pool index |
| A Shady Auction | Concurrent sealed bids; each lot resolves after its bids, before the next lot |
| Marketplace | Shared proposals retain their deal sequence; responses open concurrently; acceptance does not stop parallel play |
| Prison | Retains the shared hand's pass sequence |
| Den of Thieves | Drawer-only interaction in that player's context |

All 17 Event effect variants and all 41 Astrologers effect variants have corresponding resolver cases (checked by static TypeScript AST inspection). Interactive Astrologers paths include Disruption, Crag Hack, dice offers, Destruction, Terrible Plague, Isra's Friends, Dancing Imp, Plane Between Planes, Charlie and his Circus, Unexpected Reinforcements, and McGiver. Charlie's following Resource-round offer and McGiver's deferred grant use the same event routing. Hero and Explorers keep their existing player-owned hand-action paths. Passive effects retain their existing application sites.

## Boundaries and verification

Shared contribution, bid, deal and pass dependencies still apply. Event windows can suspend a player's unfinished noncombat interaction and restore it after the event choice finishes. That player's combat and unfinished hand draw remain blockers. The Merchant purchase uses no interaction queue and can coexist with a local choice.

Identifiable legacy Event/Astrologers rewards can be separated from saved round barriers; unrecognized legacy rewards are preserved in place. Saved merchant purchases revalidate their current offer before charging.

Code review and TypeScript compilation are the verification performed. No tests, simulations or live multiplayer playthroughs were run. These changes have not been deployed by this task; the frontend and authoritative room server need matching engine versions when deployed.

## Audit fixes (2026-09-11, landed with v130)

- The auto-pumped Marketplace answer step never throws: a deal a seat cannot answer is simply no answer. Throwing rejected whichever player's action ran the pump (even the proposer's own proposal) and, once parked, every later action of every seat.
- A parked window whose shared prerequisite vanished is rolled back and dropped with a note to its owner (`run()` in `pumpParallelRoundEvents`), so it can never reject a third party's committed action.
- Table-wide round-start work (City Hall choices, round dice, the legacy sentinel) is never captured into one seat's Event context: the shared queue drains first, then the per-seat windows open. In parallel play City Hall choices therefore resolve before the Event windows (ordered play keeps the printed Event-first order).
- Under a wave / arena / timed-event barrier only a seat whose window is actually open leaves the barrier; a seat with merely queued work stays frozen like everyone else.
- `stopParallelTurns` re-homes open windows and suspended interactions to the ordered queue and re-raises the whole-table barrier when Event work was flushed.
- The parallel-impact exemption applies only to a visit the round-event router opened, never to an ordinary map or town step that happens to share a step type.
- The legacy `OPEN_WANDERING_MERCHANT` visit is turn-gated again; an atomic buy closes the buyer's opened legacy shop; the `GRANT_WAR_MACHINE` guard behaves the same in every turn mode.
- Known limits: a parked seat still takes its start-of-turn draw before its window opens (the hand-limit snapshot runs before any Event card is handed out), and `pumpParallelRoundEvents` runs after every action in parallel mode.
