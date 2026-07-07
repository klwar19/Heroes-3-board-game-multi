# CLAUDE.md — rules for AI/automated contributors

These apply to every automated contributor (Claude Code, including claude.ai/code
in the browser). They exist because past work shipped non-functional "decorative"
abilities and then summarized them as complete. Treat these as hard requirements,
not suggestions.

## 1. "Done" means engine-enforced AND tested

A gameplay rule, unit ability, card effect, hero specialty, or building effect is
**done only if both** are true:
1. the engine actually executes it, and
2. a test fails if that logic is removed.

If you cannot do both, it is **NOT done**. Say so explicitly in your reply, leave
it clearly marked not-implemented, and stop — do **not** paste the printed rules
text into a display field and move on. Pasted-but-inert text is a stub, never a
feature.

### 1a. Test the EFFECT, not the artifact (how the "done" bar is actually met)

A passing data check is not coverage. These five habits catch the bugs an
"is it wired? is there a test?" audit greenlights anyway:

1. **Assert the observable game outcome, not an intermediate value.** "Token
   placed, amount X" is a data check; "defense went 3→1" / "damage rose by 2" is
   the real one. A test must fail if the logic is *wrong*, not just *absent*.
2. **A surprising test value is a lead, not noise.** If an assertion fails on a
   number you were sure of, explain the discrepancy before changing the
   expectation to match reality — that reconciliation is often where a bug hides.
3. **Cross-check siblings that share a mechanic** (e.g. every Corrosion/Attack
   token source). Divergence in how they encode the same thing (sign, magnitude,
   code path) is a smell.
4. **Audit the consumer, not just the producer.** Several producers can each look
   fine while the single shared reader they feed is broken and untested.
5. **Prefer an invariant over N one-offs** where one exists (e.g. "a Corrosion
   token always *lowers* effective defense, never raises it") — it guards every
   producer at once.

**Auditing content?** Use the `/audit-content` command (`.claude/commands/`),
which operationalises these five habits across *every* category (units, spells,
specialties, artifacts, abilities, buildings, banks, map tiles) — not just the one
you came in for. It exists because a prior audit reported green while Deemer's
Meteor Shower / Resurrection were broken: they were wired and had tests, but the
tests asserted the printed tier numbers instead of whether the damage/cost moved
with spell power, and no test compared the specialty to its scaling twin (the
Frost Ring spell). An "is it wired? is there a test?" pass is **not** an audit;
audit the behaviour and mutation-check every "verified" claim.

## 2. Every card/unit definition must state exactly what the engine implements

A human must be able to read a definition and know precisely what runs.

- **Units** (`src/data/factions/units.ts`): the `abilities: [...]` array is the
  *complete, literal* list of engine-wired effects for that side — no more, no
  less. `abilityText` is printed-card flavor/reference only and is **never**
  proof that something works.
  - If `abilityText` describes anything the engine does NOT do, add a comment on
    that side stating exactly what runs, e.g.
    `// engine: ignore-combat-penalties only; the +1 Power activation is display-only`.
  - A side with `abilities: []` does **nothing** mechanically, whatever its
    `abilityText` says. It is a stub.
- **Cards** (`src/data/cards/*`): `effect` + `implementationStatus` are the truth.
  Use `implementationStatus: "not-implemented"` (with a no-op effect) for anything
  not wired. Never set `"implemented"` unless the effect actually executes.
- Known display-only abilities must be **declared in one explicit registry**
  (e.g. `DISPLAY_ONLY_ABILITIES`) so a stub is a conscious, reviewable entry — not
  something a reader has to reverse-engineer.

## 3. Required enforcement (now in the repo)

`src/data/factions/ability-text-enforcement.test.ts` asserts, for EVERY unit
side in `coreUnitDefinitions` (few/pack/neutral, all factions + neutral decks):
- every `abilities` tag resolves to a `unitAbilities` entry with
  `implementationStatus: "implemented"`;
- a side with effect-describing `abilityText` and empty `abilities` must be
  declared in `DISPLAY_ONLY_ABILITIES` (a conscious stub, engine does NOT run
  it) or in `ENGINE_RULE_WIRED_ABILITY_TEXT` (implemented as a dedicated engine
  rule keyed off the unit — e.g. the neutral Skeletons' Necropolis reinforce —
  with the wiring and covering test named in the value);
- registry hygiene: no entries for nonexistent sides, no display-only entry for
  a side without text, no engine-rule entry whose side gained wired tags, no
  side in both registries.

New decorative unit text now fails CI until consciously declared. The Creature
Bank side-space has the same invariant in `src/data/map/creature-banks.test.ts`.
**Limit (rule #1a still applies):** this proves text is declared and tagged,
not that a wired ability BEHAVES correctly — behaviour stays pinned by the
per-mechanic tests, and an audit still means mutation-checking those.

## 4. How to report work (no dressing up)

- Lead with what does **NOT** work / what is display-only. Caveats go first, never
  in a footnote.
- Do not use ✓/✅ or words like "complete", "fully implemented", or "no decorative
  features" for anything you cannot back with a named, passing test.
- If you took a shortcut or shipped a stub, say that in the first sentence.

## Where this file lives / why it works on the web

This is the repository-root `CLAUDE.md`. Claude Code auto-loads it as context at
the start of every session, including claude.ai/code in the browser. The web
environment clones the repo fresh each session, so **only what is committed to the
default branch (`main`) takes effect there.** Keep this file committed on `main`.
Nested `CLAUDE.md` files in subdirectories are also loaded when working in those
folders; per-user `~/.claude/CLAUDE.md` does **not** persist on the web.

## Current known stubs (display-only, NOT implemented)

Most items this list previously named (the Tower hold-outs) have since been
wired and are covered by a test that fails if the logic is removed:
- `tower.genies` few & pack — "discard from deck, take a Spell" → `genie-spell-draw-few`
  / `genie-spell-draw-pack` (`DECK_DISCARD_TAKE_SPELL`); see
  `src/engine/expansion-creature-abilities.test.ts` ("Genie Wish").
- `tower.magi` pack — "+1 Power to the first spell you cast this round" →
  `magi-power-boost`; see `src/engine/decorative-faction-abilities.test.ts`.
- `tower.gargoyles` / `tower.titans` — the ongoing-effect immunity →
  `gargoyle-spell-ward` / `titan-ignore-ongoing`; see
  `src/engine/expansion-creature-abilities.test.ts` ("Gargoyle / Titan
  ongoing-effect immunity").
- `tower.iron_golems` — spell-damage reduction → `reduce-spell-damage-1` /
  `reduce-spell-damage-2`; see `src/engine/decorative-faction-abilities.test.ts`.
- Solmyr I/IV/VI, Cyra IV/VI, Torosar I/IV/VI — now implemented;
  `src/engine/hero-specialty-levels.test.ts` asserts "has no remaining
  not-implemented hero specialty" and `src/engine/tower-hero-specialties.test.ts`
  exercises each. (`PENDING_TOWER_SPECIALTIES` no longer exists.)

Conflux — now fully engine-wired (no display-only unit clauses left):
- `conflux.{storm,ice,energy,magma}_elementals` (Few & Pack) — the FACTION
  (recruitable) elementals do NOT carry the Magic-Arrow/school immunity or the
  "deals elemental damage" trait: per the verbatim 3-column wiki card those
  belong to the separate NEUTRAL guard (`neutral.*_elementals`) column ALONE.
  The faction Few has no abilities; the faction Pack has ONLY its "[activation]
  +1 Power to the first <School> spell" rider. The earlier wiring (which copied
  the neutral guard's `elemental-damage` + `<school>-elemental-immunity` onto the
  faction Few/Pack) was a transcription fabrication and has been removed —
  enforced in `conflux-content.test.ts` (faction Few = [], Pack = activation only;
  the neutral guard keeps the passives as the control).
- `conflux.magic_elementals` (Few & Pack) — "Attack all adjacent [enemy] units"
  is now wired via the generic `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` multi-attack
  queue: a full separate follow-up attack at the unit's OWN (buffable) Attack
  against every other adjacent unit — the Few hits friend AND foe
  (`magic-elemental-attack-all`, `includeAllies`), the Pack enemies only
  (`magic-elemental-attack-all-enemies`). The Pack's "Ignore any Spell effects"
  is the shared full spell immunity (`immune-all-spells`, which also covers Magic
  Arrows) and "damage from Specialty" is `immune-specialty-damage` (the Azure
  Dragon combo). Per the verbatim wiki card the faction Magic Elementals carry NO
  "deals elemental damage" line on EITHER side and no separate Magic-Arrow line —
  the earlier `elemental-damage` + Magic-Arrow-only wiring was a fabrication and
  has been removed. Engine-enforced in `conflux-content.test.ts` ("Conflux Magic
  Elementals abilities", with the Few/Pack divergence as the mutation control).
- Erdamon is the **Magma Elementals** specialist (wiki: "The effect doubles for
  the Magma Elementals unit"), NOT an all-Elementals generalist — the earlier
  all-Elementals doubling on I/IV was a deviation and has been corrected to match
  the card (`conflux-content.test.ts`, with the other Elementals as the control).
- Conflux heroes now shipped: the three unit-specialist Planeswalkers (Erdamon,
  Monere, Pasis) AND **Luna** the Fire Wall Elementalist — I/VI place the shared
  `fire_wall` battlefield token at a FIXED 1/3 damage (`PLACE_FIRE_WALL_FIXED`),
  IV is the spell-economy choice (map discard recall OR a +2-Power spell-cast
  reaction). All I/IV/VI implemented + tested (`conflux-content.test.ts`). Conflux
  PC portraits (incl. Luna and Tarnum) are now downloaded to `/public/assets`.
- **Ciele** (Magic Arrow Elementalist) is now shipped — Magic Arrow is a
  STARTING_ONLY spell, so a cast copy lands in the player's OWN discard pile, NOT
  the shared Spell deck; both I and IV read that own discard (the earlier
  shared-Spell-deck wiring meant neither could ever find the arrow in real play).
  I is an `<instant>` recall of a Magic Arrow from your discard to hand, playable
  on the map AND in combat (`TAKE_FROM_DISCARD` filtered to Magic Arrow,
  `allowInCombat`). IV casts a Magic Arrow from your OWN discard for FREE over the
  limit (the `CAST_FROM_SPELL_DISCARD` pipeline with `ownDiscard`, `spellId`-
  filtered — the arrow stays in your discard, the specialty cycles to discard).
  VI deals 2 damage; each with a +Power reaction alternative. The tests seed the
  PLAYER's own discard and keep a CONTROL proving a Magic Arrow in the shared
  Spell-deck discard is NOT castable. See `conflux-ciele-specialty.test.ts`.
- **Tarnum (Conflux)** (Enchanters Elementalist) is now shipped — all I/IV/VI
  engine-wired and covered by `conflux-tarnum-specialty.test.ts` (each level fails
  if its wiring is removed):
  - I — `Search(1) Spell` with the new `CARD_DECK_SEARCH.allowRemove` flag: the
    revealed Spell can be KEPT into hand OR REMOVED from the game (the deck-search
    pipeline now carries `allowRemove` through `openSharedDeckSearch` /
    `revealSharedDeckSearch` / the DECK_SEARCH choice and offers a "Remove …"
    pick). The control proves a normal Search offers no Remove.
  - IV — `CONVERT_ARMY_UNIT` extended with a `goldCost` and an optional from-unit:
    "Pay 10 gold → the unique neutral Enchanters card" (or draw). Gated on gold
    and the `unique` one-Enchanters limit.
  - VI — the over-limit multi-cast subsystem (`TARNUM_OVERLIMIT_SEARCH`): an
    **Instant** playable on your turn, off-turn in the instant window, OR as a
    reaction inside an open attack window. It opens a per-search deck choice
    (`TARNUM_SEARCH` pendingChoice): twice, the caster picks ONE Spell deck —
    basic or expert — to Search 1 card from. Each taken card is flagged
    (`combatStats.tarnumOverlimitCards`) for a FREE cast over the per-round limit
    (never bumps `spellsCastThisRound`; forgery-validated in `castSpell` AND
    `applyReactionPlayCore`), returning to the shared Spell deck top OR discard —
    the caster's choice via `CAST_SPELL.tarnumReturn` / `PLAY_REACTION.tarnumReturn`
    — instead of the caster's own discard. A flagged spell casts only when "their
    type allows it" in the open window: a combat spell (Fireball) during your own
    activation, a trigger-free instant anytime (both via `addSpellActions`), and an
    attack/defense-changing reaction instant (Bless, Curse, Bloodlust…) in the
    reaction/instant window via a dedicated free over-limit pass in
    `getLegalReactionsForTrigger`. Used AS a reaction in an attack window, playing
    VI runs the Search inside the still-open window and then re-derives its offers
    (`refreshReactionWindowLegalReactions`) so a just-Searched applicable instant
    can be cast into the SAME window; a Searched spell that does not fit just stays
    in hand. The flag clears at combat start and each combat round. All covered in
    `conflux-tarnum-specialty.test.ts` (per-search choice, both/same deck, the
    on-turn vs off-turn split, the reaction-window cast with a graded CONTROL that
    the flag is what lifts the limit, AND the in-window search-and-cast flow).

Factory (expansion) — unit Few/Pack card art is now the REAL board-game scans
(was fake PC-portrait placeholders); the abilities are being wired off those scans
(read the card, not a wiki). WIRED + engine-enforced (a test in
`factory-unit-abilities.test.ts` / `factory-combat.test.ts` fails if removed;
`factory-content.test.ts` pins which sides carry which id):
- Halflings — Few/Pack `attack-roll-advantage`; Pack also `halfling-precise-shot`
  (a "+1" roll drops a Corrosion token, -1 Defense). The "resolve the higher"
  advantage OVERRIDES the ranged Combat penalty (adjacent / backline-to-backline):
  the Factory Halfling has no "Ignore combat penalties" waiver (unlike the neutral
  core Halfling), so under a penalty it still rolls two dice and keeps the HIGHER,
  not the penalty's lower — the `ATTACK_ROLL_ADVANTAGE` branch resolves before the
  penalty in `getAttackRollMode`. Enforced (with plain-ranged-unit CONTROLs) in
  `factory-unit-abilities.test.ts` ("advantage overrides the ranged Combat
  penalty"). The Shaman's Puppet forced-disadvantage still beats advantage.
- Mechanics — all sides `mechanics-line-attack-1/2` ("Attack 2 spaces in a line",
  SECOND_ATTACK_BEHIND_TARGET); Few/Pack also `mechanics-repair-1/2` (repair an
  adjacent mechanical unit — Automatons/Dreadnoughts — the Pack falling back to
  +1 Attack). The Neutral guard has only the reach.
- Armadillos — Pack `armadillo-initiative-amplify` (AMPLIFY_INITIATIVE_INCREASE:
  any positive Initiative increase gets +1 more). Few/Neutral have no printed
  ability (genuinely `[]`, not a stub).
- Automatons — Pack `ignores-retaliation`; Neutral `automaton-detonate-1`.
- Sandworms — Neutral `sandworm-strike-again` (attack an adjacent target again).
- Bounty Hunters — Few/Pack `bounty-hunter-mark-1/2` (Mark the strongest enemy at
  combat start; +1/+2 Attack vs Marked units). Mark target selection is
  auto-resolved (deterministic), not a player prompt.

The former "STILL display-only" Factory hold-outs have since ALL been wired
(pinned in `factory-content.test.ts` "every former Factory display-only stub is
now an implemented, engine-wired ability", behaviour + CONTROLs in
`factory-gold-abilities.test.ts`):
- Automaton Few — cube-scaled Detonate → `automaton-place-cube` +
  `automaton-detonate-cubes` (faction-cube subsystem).
- Sandworm Pack — cube-fuelled extra attack → `sandworm-cube-gain` +
  `sandworm-cube-attack`.
- Bounty Hunter Neutral — pre-emptive + ranged retaliation →
  `bounty-hunter-preemptive` (`PREEMPTIVE_RETALIATION`).
- Couatl Few/Pack — activated invulnerability until next activation →
  `couatl-invulnerability-few` (ends the turn) / `-pack` (free); Couatl Neutral
  genuinely has no printed ability.
- Dreadnought Few/Pack/Neutral — splash allocation instead of attacking →
  `dreadnought-splash-1` (1/1, up to 2 units) / `dreadnought-splash-2` (2/1/1,
  up to 3).
No Factory unit side is display-only anymore.
Factory buildings use the real thelazy.net PC building art and are wired to their
shared archetype effects (`factory-content.test.ts` "ships the 7 board-game
buildings…"); the PC-only special buildings (Mana Generator spell-points, Grail
Lightning Rod, Pen horde) are NOT modeled as distinct effects.

This section is maintained by hand, but the rule #3 enforcement test now
exists (`src/data/factions/ability-text-enforcement.test.ts`): the machine
truth is `DISPLAY_ONLY_ABILITIES` (currently EMPTY — no unit side is
display-only) plus `ENGINE_RULE_WIRED_ABILITY_TEXT` (currently exactly
`neutral.skeletons#neutral`, whose Necropolis-reinforce text runs as a
dedicated rule, not an ability tag). Re-verify any prose claim here against
those registries and `src/data/factions/units.ts` before trusting it. The
Creature Bank system tracks its own display-only items in the section below.

## Parallel turns (OPTIONAL house rule, multiplayer only) — what runs vs. limits

Engine in `src/engine/parallel-turns.ts` (predicates, the stop/collapse, the
transactional bystander guard) wired through `adventure-reducer.ts` (END_TURN /
movement / rotation chaining), `legal-actions.ts` (open-turn gating + the
bystander quiet-action set), `reducer.ts` (the applyAction fingerprint backstop)
and `adventure.ts` (`flagField` steal hook, quiet-filtered reachable paths).
Lobby option `GameSetupOptions.parallelTurns` (0 = off, 1–12 rounds; Game
options UI). Behaviour is pinned in `src/engine/parallel-turns.test.ts` — every
claim below has a test that fails if the wiring is removed, each with an
ordered-mode or unowned-target CONTROL.

- While `turn.mode === "parallel"` every live player's turn is open at once:
  move, build, refresh, end turn independently; the round wraps when everyone
  has ended (`turn.completedPlayerIds`, reused from the sandbox machinery).
- The exclusive interaction machinery stays a strict SINGLETON (one combat, one
  pendingChoice/visit/tile rotation/Necromancy window at a time). While one is
  open for player A, everyone else gets ONLY the quiet set: steps onto "open"
  (trigger-free) fields, the start-of-turn hand steps, and — outside combats —
  town/morale actions (which queue/park, never interrupt). Everything else
  (visits, discoveries, battles, card plays, searches, END_TURN) waits with a
  "wait until …" rejection. Safety is transactional, not enumerative: a
  bystander action that touches the interaction fingerprint
  (`parallelSlotSignature`) is rejected WHOLE in `applyAction`, so a
  mis-classified action can only fail cleanly, never corrupt an open battle.
- Shared-deck draws are therefore strictly first-come-first-served (arrival
  order through the single reducer + the reward-queue FIFO) — no card can be
  handed out twice; round-start effects (income, Events, Astrologers,
  start-of-turn hand dividers) resolve clockwise from seat 1 exactly like
  ordered play. `pumpAdventureQueues`' start-turn-hand divider requeue ignores
  other dividers (N players queue N dividers — they must not chase each other
  forever). Round 1's forced home-tile rotations chain one at a time in seat
  order (`beginNextPendingStartTileRotation`). A round that draws an **Event or
  Astrologers proclamation** raises the round-start EVENT BARRIER
  (`adventure.eventResolution`): the whole table pauses to resolve the event
  FIRST — even the quiet set is off, no seat may move/draw/build until every
  player has resolved it — then normal play resumes (see the Event-deck section).
- The mode STOPS — `PARALLEL_TURNS_STOPPED` warning to the whole table, then
  classic one-at-a-time turns forever — when (a) a PvP battle starts
  (`startPlayerCombat` / the garrison prompt), (b) a serious PvP interaction
  resolves: taking a flag FROM a live player (`flagField` chokepoint — covers
  walking onto an enemy mine/settlement/town AND the View Earth capture; hand
  discards are deliberately NOT serious), or (c) the chosen period ends. On a
  PvP stop the aggressor becomes the active player and the battle resolves
  normally; players who had already ended stay ended (the rotation skips them,
  wrapping only when nobody live still owes a turn) and nobody's start-of-turn
  re-runs mid-round (no second mandatory draw).
- Deliberate LIMITS (documented, not bugs): only ONE battle can run at a time
  (the physical game has one battle board) — a second fight, and any visit or
  card play, waits for the open interaction; town actions stay blocked during
  combats exactly like ordered play. Ordered games (`parallelTurns` 0/absent),
  solo tables and legacy snapshots are untouched — every parallel predicate
  no-ops when the mode is off.

## Event deck (Fortress expansion, OPTIONAL rule) — what runs vs. printed nuances

A separate system from the Astrologers Proclaim deck (do not confuse the two).
Data in `src/data/cards/events.ts` (all 20 published Fortress Events, real card
scans fetched by `scripts/fetch-events-art.py`); engine in `src/engine/adventure.ts`
(`drawEventCard` / `resolveEventCard` / `applyEventVisitStep`); toggle
`GameSetupOptions.events` (Game options UI, **default OFF** — an opt-in optional
rule — and "multiplayer only": even switched On, a solo table never gets the
deck; the deck's absence in `state.decks` IS the off switch). A drawn Event pops
the `EventDrawnOverlay` on every client (drawer named, resolves clockwise from
them) plus a feed line. Timing per the rulebook p.15-16: drawn at the start of each Resource
Round AFTER income; the drawer rotates clockwise per draw; effects resolve in
clockwise order starting with the drawer (the FIFO reward queue is the order).
Tests: `event-deck.test.ts` (flow/toggle/rotation/secrecy), `event-cards.test.ts`
and `event-market-cards.test.ts` (every card's observable effect, each failing if
its wiring is removed). `EVENTS_NOT_IMPLEMENTED` is empty — no display-only
Events ship; that registry is the only legal home for a future unwireable one.

**Round-start EVENT BARRIER (both event types, ordered AND parallel play).** When
a round draws an Event (this deck) or an Astrologers proclamation, the WHOLE table
pauses to resolve it FIRST — the Fortress Event is drawn at the FRONT of the
round-start reward queue (before City Hall / resource-die / war-machine offers,
`startAdventureRound`), and while `adventure.eventResolution` is set the ONLY
player who may act is the one whose event choice is currently open. Every other
player is frozen — no quiet move, no start-of-turn draw, no town/morale action, no
ending the turn — until every player has resolved it (enforced in `applyAction`
and offered as `[]` in `legal-actions`; the read helper is
`isRoundStartEventBarrierActive`/`roundStartEventResolver` in `parallel-turns.ts`).
A trailing `round-start-events-resolved` sentinel reward (always LAST, since event
follow-ups `unshift` ahead of it) clears the barrier in `pumpAdventureQueues`,
after which the normal flow (City Halls, turn-start effects, first-turn hand,
turns) proceeds. Automatic Resource income is still applied inline BEFORE the
Event (rulebook p.15), so a player has fresh Resources to spend in the event's own
markets/auctions; only the player-facing steps wait behind the barrier. Instant
proclamations (Dead Silence, movement/morale buffs) queue nothing and raise no
barrier. Pinned in `round-start-event-barrier.test.ts` (Event side: freeze,
event-before-City-Hall ordering, ordered mode, a real Resource-round wrap, and a
no-barrier CONTROL) and `astrologers-parallel-turns.test.ts` (Astrologers side),
each with a CONTROL where the same action succeeds once the barrier lifts.

**Barrier RECOVERY (the barrier may freeze the table, but never strand it).**
Three guards keep a mid-resolution table recoverable, each pinned in
`astrologers-barrier-recovery.test.ts` (fails if the guard is removed):
(1) `eliminatePlayer` drops EVERY interaction the eliminated seat owns — its
queued rewards and open `pendingVisit` (as before) AND an open `pendingChoice`
(returning cards a DECK_SEARCH / Visions scry had lifted out of a shared deck,
restoring `phase`), plus an owned `pendingNecromancy`/`pendingFarTileFlip` — so
a seat eliminated mid-resolution (AFK kick, concede) hands the slot to the next
seat in order and the barrier still lifts after the last LIVE seat. (2) A
round-start City-Hall choice whose every option was context-filtered away
(e.g. Cove's remove-an-Artifact arm with no Artifact in hand) is SKIPPED in
`pumpAdventureQueues`, never opened as a zero-option prompt nobody (not even
the AFK-drop driver) could answer. (3) A client that (re)connects mid-barrier
still gets the proclamation/Event overlay: the first-snapshot priming marks the
draw event "seen", so `reconnectRoundStartCues` (components/table/utils.ts,
pinned in `reconnect-round-start-cue.test.ts`) rebuilds the cue from live state
for exactly the barrier-up window — reconnects after resolution stay replay-free.

Engine readings / deviations a reviewer should know (all deliberate, commented at
the wiring site):
- **Den of Thieves** resolves for the DRAWER only — its printed "you" with no
  pass-around clause, read like Artifact Merchant's "you" (which the rulebook's
  own example pins to the drawer).
- **A Shady Auction** bids are sequential-but-hidden rather than physically
  simultaneous: each seat picks a gold bid in turn; the amount is stored in
  `adventure.events.auction.bids`, masked in other players' views
  (`player-view.ts`) and logged without the amount, then revealed all at once at
  the lot's resolution. Single highest pays and takes; a tie or all-zero round
  discards the lot.
- **Search timing**: Searches earned by Cursed Swamp's remove-Spells option, the
  Market of Time / School / Garden remove loops and the Withered Hermit pay
  option resolve INSIDE the earning player's slot (front-of-queue rewards —
  `EVENT_SEARCH_FRONT`). A Search granted by a rolled Treasure-die FACE (Crypt's
  gamble, Cursed Swamp's roll, a taken Leprechaun die) queues at the END of the
  round-start queue instead — the engine-wide treasure-face convention the
  Astrologers dice share.
- **Crypt's 2-die gamble** ("any experience face — gain nothing") is its own
  roll: Luck rerolls / Cards-of-Prophecy die-sets do not hook it (they do hook
  Cursed Swamp's standard 2-Treasure-dice roll).
- **Magical Forest** contributions are face-down: pool entries are masked for
  everyone in player views (after the shuffle even the contributor cannot tell
  which entry is theirs); a drawn-and-viewed contribution is shown privately to
  the contributor only. Taking from the pool is a seeded-random pick.
- **Mercenary Camp** "up to 2 from one of the chosen decks" = draw 2 / draw 1 /
  none, all from ONE Neutral deck (Azure included — no printed exclusion;
  Prison's "except for Azure" IS enforced). Recruits pay the printed Neutral
  cost; leftovers recycle to their tier discard piles (engine convention for
  returned Neutral draws).
- **Garden of Revelation** "draw 4 from your discard pile" takes the TOP 4; the
  closing "discard all cards from hand and draw up to your hand limit" runs
  AFTER the earned Searches, in printed order.
- **Cursed Swamp** "cheapest unit" = lowest gold-equivalent printed cost of the
  card's CURRENT side (materials/valuables valued at Trading Post rates); ties
  break by army order. A discarded Neutral-side card recycles to its tier
  discard pile like a combat casualty.
- **Spell/Artifact market draws** ("draw the top Spell/Artifact card") draw
  across BINH's split decks weighted by remaining size — the odds of one
  combined physical deck. A low-level hero may therefore buy an Expert spell at
  the Library/Laboratory/Shrine (an event special-offer; the usual search gates
  are not applied to buying, only the duplicate/uniqueness gate is).
- **Marketplace** "Trade resources using Trading Post rules" is the resource
  exchange ONLY (`TRADING_POST.tradesOnly` hides the sell-a-card / war-machine /
  scroll options at the menu AND at the action guards). The 1-for-1 deal is one
  proposal per player's own resolution; the other players answer immediately
  (the answers cut the reward queue), first accept wins.
- Leftover revealed cards shuffle back into their decks (rulebook default);
  Shrine of the Magic Thought's leftovers go to the Spell discard pile and
  Messenger's declined pair to the Artifact discard pile, as printed.

## Creature Banks (Naval Battles optional rule) — what runs vs. what is deferred

Added in `src/data/map/creature-banks.ts` (data, tested in
`creature-banks.test.ts`) and wired through the combat engine (tested in
`src/engine/creature-bank-combat.test.ts`) with map/combat UI in
`screen.tsx` / `board.tsx` (badge tested in `board.test.tsx`). Leading with what
is NOT done:

**Implemented and engine-enforced (a test fails if removed):**
- The 12 banks' defenders, bank-card stats (their OWN stats, no tier — distinct
  from Few/Pack/Neutral), and resource/morale/search rewards scaled by the
  number of Stacked defenders (X). The two sea banks (Shipwreck, Derelict Ship)
  grant POSITIVE morale (`morale_positive` on the wiki), and the Medusa Stores
  per-Stack bonus is a CHOICE of +3 gold OR +1 valuables (not both); both are
  pinned in `creature-banks.test.ts`.
- Gradeless targeting: a bank card carries NO tier ("grade 0"), so the neutral
  AI's same-tier priority can't apply — a bank guard (the `bankUnit` flag) ranks
  its candidate targets purely by distance and attacks the NEAREST. It KEEPS the
  universal ranged rules (a ranged guard still hunts ranged targets first; an
  engaged one must hit an adjacent enemy) — only the tier ordering is dropped.
  Conversely, a bank guard card AS A TARGET is no-tier too, so a graded neutral
  attacker hits it LAST (behind every graded enemy, exactly like a summoned
  unit) — `isNoTierTarget` in `neutral-ai.ts`. Wired in `neutral-ai.ts`
  (`isGradelessNeutralAttacker` / `isNoTierTarget`), tested in
  `creature-bank-combat.test.ts` ("are gradeless and target the nearest enemy"
  and "a gradeless bank-guard card is targeted LAST"), each with a graded
  CONTROL that diverges.
- Tier-specific spells/specialties cannot target a bank defender: with no tier it
  fails every grade gate (Blind, Berserk, Frenzy, Disrupting Ray, Forgetfulness,
  Sorrow/Skip-Activation, Slayer, …). Enforced both at targeting (a tier-gated
  card never offers a bank guard — `effectIsTierGated` in `legal-actions.ts`) and
  at resolution (`gradeRankOfUnit` ranks a bank unit above every grade in both
  `legal-actions.ts` and `reducer.ts`, so a forced cast fizzles). Tested in
  `creature-bank-combat.test.ts` ("exempt from tier-specific spells") with a
  graded CONTROL.
- "Gain a unit" rewards: the Dragon Fly Hive (Dragon Flies) and Griffin
  Conservatory (Griffins) add the recruitable card to the army for free — a Few
  normally, a Stacked Pack when X ≥ 2 (the `GAIN_UNIT` interaction → `RECRUIT_FREE`
  step with a `side`). Tested in `creature-banks.test.ts` and end-to-end in
  `creature-bank-combat.test.ts` ("adds the gained Dragon Flies card to the army").
  HOUSE-RULE bonus: each of these two banks ALSO Empowers one ability the winner
  owns (the `EMPOWER_ABILITY` interaction, additive in the reward `SEQUENCE`).
  Empowering an ability adds its card id to `player.empoweredAbilities`, which
  lets its Expert side be played WITHOUT spending a crown for the rest of the
  game — `abilityExpertIsCrownFree` / `canPlayExpertMode` (`ruleset.ts`) are
  honoured at every Expert-use gate (legal-actions offers + reducer guards/spends
  for reactions, map plays, Tactics, Wisdom and Learning). Tested in
  `empowered-ability.test.ts` (the crown-free Expert play, with a graded CONTROL)
  and `creature-bank-combat.test.ts` ("a win gains the unit AND lets the player
  Empower an ability").
- Stack Tokens: the Scenario Difficulty (Easy 1 / Normal 2 / Hard 3 /
  Impossible 4) sets the number of token ROLLS, NOT a guaranteed count. Each roll
  targets a distinct candidate card and lands only `STACK_TOKEN_PLACEMENT_PERCENT`
  (77)% of the time, so the Stacked count varies run-to-run — even Impossible can
  come up anywhere from 0 to 4 Stacked defenders (HOUSE RULE; the rulebook places
  a fixed count). A landed token gives +1 attack/defense/health or +2 initiative;
  a Stacked defender absorbs one lethal blow by discarding its token and carrying
  the leftover damage (`markUnitRemovedIfNeeded`). The board shows a gold badge
  naming each token's stat. Tested in `creature-bank-combat.test.ts` ("never
  Stacks more than the difficulty allows" and "rolls each token at ~77%").
- Bank combat: no Quick Combat, no experience; win marks a Black Cube and grants
  the reward. HOUSE RULE (overrides the rulebook): a bank DOES obey the one-Round
  time limit and the spend-1-MP-to-extend rule, exactly like a normal neutral
  fight.
- Battlefield formation (HOUSE RULE): a Creature Bank fight uses a special
  layout — the four guardians are pinned to the four board CORNERS
  (`CREATURE_BANK_GUARD_CORNERS` = 0/3/16/19) and the attacker deploys in the
  central SIX squares (`CREATURE_BANK_ATTACKER_CELLS` = 5/6/9/10/13/14), not the
  usual front/back rows. The shared `placementCellsFor` (engine, legal-actions,
  and `board.tsx` all consume it) and `placeCreatureBankGuards` enforce it;
  tested in `creature-bank-combat.test.ts` ("battlefield formation").
- Placement: with the rule on (`creatureBanks`, default ON), discovering a
  Far (II-III) or Near (IV-V) Map Tile with a Blocked Field offers the
  discovering player a Creature Bank token from the matching shuffled pile
  (`creatureBankTokensFar`/`Near`); accepting carves the Blocked Field into a
  bank (`placeCreatureBank`). The offer is gated on the tile GROUP
  (`creatureBankTierForGroup`): Far→Far pile, Near→Near pile, and — BINH house
  rule — a **Subterranean cavern also offers a bank, drawing from the NEAR pile**.
  Sea/center/starting tiles never trigger it — including sea tiles that DO carry a
  Blocked Field / impassable terrain (e.g. the Cove tile W1). A cavern's bank
  lands on its Blocked Field EXCEPT when that field was sacrificed to a
  Subterranean Gate: the gate carves before the bank is offered, so a Blocked
  Field that became the gate hex is gone and no bank is offered there ("not at the
  gate hex"). Engine-enforced in `subterranean-gate-choice.test.ts` (a cavern gets
  a Near bank; the path-up-on-the-Blocked-Field control gets none). A bank is
  reachable only from within its own Tile — you can walk in to fight, but it is
  never a route across a Tile edge to the outside (enforced in `canCrossEdge`,
  even for Pathfinding).
- Bank-card abilities that map to a wired engine effect: Skeletons (rebirth),
  Zombies (resilience), Vampires (life drain), Medusas + Nagas (ignore
  retaliation), Dragon Flies (-2 retaliation attack), Water Elementals (Magic
  Arrow immunity), Gold/Diamond Golems (spell-damage reduction), Griffins
  (unlimited retaliation), Gold Dragons (line breath). Cyclops Stockpile prints
  no ability.
- The former display-only hold-outs are now ALL engine-wired and covered by a
  test that fails if the logic is removed
  (`src/engine/creature-bank-abilities.test.ts`):
  - Imp Cache Familiars — while Stacked, every enemy spell loses 1 Power
    (`bank-familiar-power-drain`).
  - Crypt/Shipwreck Wraiths — on their own attack, the enemy discards 1 card
    (`bank-wraith-attack-discard`; not gated on Stacked).
  - Dwarven Treasury Dwarves / Dragon Utopia Crystal Dragons — while Stacked,
    roll the Defend die like a Defense token (`bank-stacked-defense-token`).
  - Dragon Utopia Black Dragons — while Stacked, +3 Attack
    (`bank-black-dragon-stacked-attack`).
  - Dragon Utopia Faerie Dragons — while Stacked, the enemy cannot cast Spells
    (`bank-faerie-dragon-spell-lock`; blocked at legal-actions AND backstopped at
    resolution).
  - Medusa Stores Medusas — while Stacked, the attack also Paralyzes
    (`bank-medusa-paralyze-stacked`; the ignore-retaliation half always runs).
  The "while Stacked" gate lives in ONE place — `getUnitAbilityDefinitions`
  hides any ability flagged `requiresStacked` until the unit carries a Stack
  Token — so the effect switches off the instant the token is discarded.

**Display-only bank-card abilities:** none. `DISPLAY_ONLY_BANK_ABILITIES`
(`src/data/units/abilities.ts`) is now empty; it remains the explicit, reviewable
home any FUTURE decorative bank clause must be declared in.

All twelve bank rewards are now engine-resolved (`rewardStatus: "implemented"`).
The Pyramid's per-Stack extra — "up to X times, remove 1 Spell/Ability/Artifact
card from hand or discard pile, then Search (5) the matching deck" — runs via the
`REMOVE_THEN_SEARCH_REPEAT` interaction/visit-step (an optional, Done-exitable
loop built in `processPendingVisit`, mirroring `REMOVE_UP_TO`). It is covered by
a test that fails if the logic is removed (`creature-banks.test.ts` for the data
and `creature-bank-combat.test.ts` "Pyramid: a Stacked win …" end-to-end).

**NOT implemented at all (deferred):**
- Bank units still carry the underlying unit's `grade` field for placement and
  display, but it never grants them a tier in play: the gradeless TARGETING/AI
  rules above treat a bank card as no-tier ("grade 0") on BOTH axes — its guard
  targets the nearest, and as a target it is hit LAST — and tier gates exempt it
  via `gradeRankOfUnit`. The "gain a Stacked unit" reward is modelled as gaining
  the recruitable card's Pack side — a HOUSE-RULE reading of "Stacked", since
  army cards carry no Stack Token of their own.
