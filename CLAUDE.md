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

## Morale Cards (Battlefield expansion, OPTIONAL rule) — what runs vs. printed nuances

Lobby option `GameSetupOptions.moraleCards` (default OFF). With it on, every
morale gain/loss draws from two shuffled decks instead of using the ±1 token
(regular-game rules from the expansion rulebook: DRAW 1, not the expansion
modes' Search (2)). Data in `src/data/cards/morale.ts` (crops from the provided
contact sheet); engine in `src/engine/morale-cards.ts` plus wiring in
`reducer.ts` / `adventure-reducer.ts` / `adventure.ts` / `legal-actions.ts`.
Behaviour is pinned in `src/engine/morale-card-effects.test.ts` (observable
outcomes with CONTROLs) and `morale-cards.test.ts` (gain flow).

Leading with what does NOT run:
- **`morale.positive.replace_adventure_card` and `morale.negative.put_token`
  are never in play.** Both print the expansion's Battlefield Symbol, and the
  rulebook removes/ignores such cards in regular games ("Adventure cards" and
  the unit-borne morale marker exist only in its Adventure/Skirmish modes).
  They are excluded from the shuffled decks via
  `BATTLEFIELD_ONLY_MORALE_CARD_IDS` (definitions stay, `not-implemented`, with
  the exclusion pinned in `morale-card-effects.test.ts`). The regular decks are
  therefore 9 positive / 8 negative.
- **"Combat Power" clauses are inert in regular games** (the roll exists only
  in the expansion's Adventure mode): `combat_bonus` offers only its +1 Attack /
  +1 Defense picks, and `next_roll_minus_one` can only come first on an Attack
  or Defense (Defend-die) roll. Both documented at the definitions.
- **`morale.positive.remove_token` is a documented engine reading**: the
  printed marker is Battlefield-mode-only, so in regular games it removes one
  NEGATIVE combat token (Weakness/Corrosion/Paralysis) from an own unit.
- Deck exhaustion with every card face-up is a silent no-op gain (rare:
  positive is capped at 2/player; the rulebook's fall-back-to-tokens is NOT
  modeled). Map-side attack-die rolls (Scholar) deliberately don't trigger
  `reroll_plus_one`; the Leprechaun event pool roll deliberately doesn't
  trigger `roll_one_less` (the event, not the player, rolls it).

Rulebook flow (all engine-enforced): positive gain cancels a held Negative
card first, else draws; **negative gain is absorbed by discarding a held
Positive card first** (oldest, deterministic), else draws face-up; a resolved/
cancelled/absorbed card always returns to the BOTTOM of its deck (no morale
discard zone — the legacy discardPile only reshuffles in for old snapshots);
held cards are public (face-up beside the hero) so player views never mask
them; positive cards cap at 2 (discard-down choice). Negative cards resolve
automatically the first time their printed situation occurs; only
`skip_activation` keeps re-rolling (one Attack die before each of the holder's
activations, -1 skips) until it actually skips, exactly as printed.

Wiring map (positive): `combat_draw` at combat start; `reroll_die` a reroll
source; `set_attack_die_plus` a SET source in the same window (never spent by
a plain reroll — `AttackRerollSource.setDieFace`, `REROLL_PENDING_CHOICE
.useSetDie`). `reroll_die` is ALSO offered on the holder's own MAP dice —
the Resource/Treasure result windows plus the Scholar and Sea Chest/Jetsam
Attack-die branch rolls (`moraleRerollCardOption` in adventure.ts, resolved
via the `CONSUME_MORALE_CARD` visit step) — standing in for the ±1 token's
"Reroll any Die you have thrown" while the rule is on; the Obelisk die (its
face locks once for every visitor) and the specific-face gambles (Satyr,
Leprechaun pool) stay out, and BOTH set-die cards stay combat/ability-roll
scoped ("best/worst face" is undefined for a map branch table). Pinned in
`morale-card-effects.test.ts` ("Reroll a Die (map dice)", with straight-
through CONTROLs). Both — plus the generic "Reroll a die" artifacts (Cards of
Prophecy, Diplomat's Ring, Ambassador's Sash) and the positive morale token —
are ALSO offered on an ABILITY's own roll (Death Stare, the Thunderbird/
Wyvern extra die, extra-die Paralysis, the Ghost Dragon knock-back) via the
ability-roll reroll window: the same `ATTACK_DIE_REROLL` pending choice with
an `abilityRoll` context. A reroll re-throws ALL that ability's dice
(whole-roll, like Bron's), the set-die flips the die that most helps the
ability's SUCCESS WINDOW (a Death Stare wants "-1"s, not high faces), and the
kept roll resumes the post-attack follow-up tail exactly where it paused
(`runPostAttackFollowUps` step table — its order is serialized in the choice,
keep it stable). Attack-roll-specific pools (unit reroll abilities, the Ammo
Cart, Luck/Fortune/Mirth effects) deliberately stay OFF ability rolls; rolls
that fire mid-resolution (the Dwarven resistance die, the defensive soak, the
Medusa retaliation gaze, the skip-activation check) cannot pause so they get
no window. All pinned in `ability-dice-events.test.ts`.
`redraw_hand` via `SPEND_MORALE redraw`; `combat_bonus` /
`remove_token` via `SPEND_MORALE combat-bonus / remove-token` during the
holder's own combat (offers in `addMoraleActions`, buttons in the hand panel).
`combat_bonus` (the +1 Attack / +1 Defense combat-long buff) is ALSO offered as
an instant-window reaction inside an open attack window (`getLegalReactionsForTrigger`
on `UNIT_ATTACK_DECLARED`; the +Attack pick is withheld only on the player's own
Misfortune-locked attack), so a defender can add +1 Defense in response to an
incoming hit; the window refreshes after the spend (`refreshReactionWindowLegalReactions`
in the `SPEND_MORALE` dispatch) so the used card drops out — pinned in
`morale-card-effects.test.ts` ("is playable as an INSTANT-WINDOW REACTION");
`repeat_search` opens a post-Search offer (`morale-repeat-search` choice —
discard the gained card, re-run the same Search (X); the gained card is masked
from other viewers in `player-view.ts`). (Negative): `search_one` forces the
next 2+-card shared-deck Search to 1 (`revealSharedDeckSearch`);
`set_attack_die_minus` flips the holder-worst die of the next attack roll —
and of the holder's own post-attack ABILITY rolls (Death Stare & co., where
"worst" is judged against the ability's success window, so it may be a no-op
flip on a stare that already shows "-1"s);
`next_roll_minus_one` latches -1 onto the next attack roll (stack modifier,
survives window rerolls) or Defend-die roll, whichever first — deliberately
NOT onto ability rolls (the card names Attack/Defense/Combat-Power ROLLS);
`roll_one_less` drops one die from the next 2+-dice Treasure roll (incl. the
Crypt gamble), 2+-dice Attack roll (advantage/disadvantage collapse to one
straight die — mandatory even where that helps, e.g. under disadvantage or the
Crypt's experience-face gamble) or the 2-dice Death Stare (one lone die then
petrifies — mandatory-even-when-it-helps again); `reroll_plus_one` forcibly
rerolls the holder's next "+1" Attack die (attack rolls incl. window rerolls
and the just-set +1 of `set_attack_die_plus`, the Defend die, the
skip-activation check die, and EVERY ability die the holder rolls — the
post-attack rolls above plus the Dwarven resistance die, the defensive soak
and the Medusa gaze); `random_combat_discard` at combat start.
Ability-die curse behaviour is pinned in `ability-dice-events.test.ts`.

Presentation layer (pure UI over the wiring above, no engine change): every
`MORALE_CARD_DRAWN`/`_USED`/`_DISCARDED` event pops the `MoraleCardOverlay`
(card art + holder + a plain-words "what happened" line, gold vs red-shake
styling) on the map AND combat screens, with the converted H3
`effects/good-morale`/`bad-morale` sting — good/bad picked by whether the
moment favors the holder (a cancelled Negative card sounds GOOD, an absorbed
Positive sounds BAD), the positive-limit tidy-up stays a quiet feed line, and
the generic feed sound is suppressed for these events so nothing double-plays.
Cue builder + per-card hint/outcome texts in
`src/components/table/morale-card-cue.ts` (`morale-card-cue.test.ts`,
`morale-card-overlay.test.tsx`). In combat the `CombatMoralePanel`
(`combat-morale-panel.tsx`, extracted from page.tsx) lists the viewer's held
cards with live use buttons driven by the engine's `SPEND_MORALE` offers
(combat-bonus / remove-token / redraw; hint text for cards whose use is
offered elsewhere, e.g. the reroll window) plus the opposing fighter's public
held cards (`combat-morale-panel.test.tsx`); the map `MoraleCardsDock` also
shows other seats' held cards.

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

## PvP Neutral Control (OPTIONAL mode, multiplayer only) — what runs vs. limits

Lobby option `GameSetupOptions.pvpNeutralControl` (default OFF, Game options
"play" tab; multiplayer only — a solo table never gets it), with the
`pvpNeutralControlMustAttack` sub-toggle (default ON). With the mode on, every
NEUTRAL combat (guard fields AND Creature Banks) plays like a PvP battle: the
NEXT live player clockwise from the fighter — `neutralCombatControllerId` in
`src/engine/neutral-control.ts`, derived from the live-only `turnOrder` so
eliminations hand the guards to the next seat (or back to the AI) automatically;
NOT related to the WOG Commanders module — PLAYS the Neutral units. The engine
pump stops on each guard's activation exactly like on a PvP unit's, and that
player drives it with the normal unit actions (offered by
`addControlledNeutralUnitActions` in `legal-actions.ts`, executed AS the neutral
seat via `asNeutralSeatCommand` in `reducer.ts` so attack attribution,
retaliation and friendly checks match the AI pipeline verbatim). They also break
the guards' activation-order ties (`advanceActiveUnit`) and answer every
Neutral-owned decision the fight opens — ability follow-ups (Lich/Magog splash
targets, Magic Mirror redirect), attack-die reroll windows, and the guards'
"[activation]" ability choices (Enchanter heal pick, Faerie Bolt target, via
`maybeOpenPlayerActivationChoice`) — the pump re-stamps any NEUTRAL-owned
pendingChoice to the controller instead of auto-resolving. The controller is
notified (`NEUTRAL_CONTROL_ASSIGNED` event → feed line + a controller-only
overlay). Behaviour pinned in `src/engine/pvp-neutral-control.test.ts` (each
claim with a mode-off / wrong-seat CONTROL).

Leading with what does NOT run / deliberate limits:
- **The War Zealot Magic Mirror still auto-USES** (the printed reflect is read
  as always-on; declining is never right) — but its redirect TARGET pick goes
  to the controller like every other follow-up.
- **Guards' printed "other actions" stay off the controller's menu** (token
  placements, Summon Demons, genie draws) — parity with the AI, which never
  uses them either; passive/triggered abilities still fire normally.
- **Berserk and the Astrologers Werewolf frenzy override both toggle modes**
  (the spell/frenzy menu binds a controlled guard exactly like a player unit).
- The continue-or-retreat window, the pre-activation reaction pause (which no
  longer previews an intent under this mode — a human hasn't decided yet; the
  pause can coexist with the controller's open choice, each resolving
  independently) and every reward stay the FIGHTER's, exactly as before.
- The mode never changes `unit.controllerId` — guards stay the NEUTRAL seat's
  for rewards, win/loss and every rules read; only the acting SEAT differs.

The `pvpNeutralControlMustAttack` sub-toggle:
- **ON (default, rulebook spirit)**: a guard that can strike now gets ONLY its
  attacks (no Defend, no move, no hold); one that can reach a strike by moving
  gets only those landing cells; otherwise only steps that strictly CLOSE the
  walked distance to some enemy — no wandering to run down the neutral round
  limit; hold only when boxed in.
- **OFF**: the controller plays the guards with NO constraint — the exact PvP
  menu (move anywhere legal, attack, defend, hold after acting).

Cross-mode seams (each pinned):
- **Parallel turns**: the controller IS a participant of the open fight
  (`parallelInteractionBlocker` returns null for them), so their unit commands
  and answers pass the bystander fingerprint backstop; every other seat stays a
  plain bystander.
- **Turn clock**: the fighter's 10-minute clock pauses while the guards' slot
  (or a controller-owned choice) is open (`turnClockPausedFor`); the controller
  has no clock of their own — a staller is removed by the AFK vote / idle-kick
  path, whose driver can now play a dropped controller's guard slot out with
  default unit commands and default-answer `CHOOSE_ABILITY_TARGET` /
  `CHOOSE_PENDING_ROLL` (both added to `RESOLVING_ACTION_TYPES`, `afk-drop.ts`).
- **Elimination**: `eliminatePlayer` hands a dead controller's open
  neutral-side choice BACK to the NEUTRAL seat (`isNeutralSideCombatChoice`)
  instead of dropping it mid-attack; the next action's pump re-stamps it to the
  new next-clockwise seat, or the AI resolves it when nobody live remains.

Mode off / solo / legacy snapshots: the rulebook Neutral AI plays the guards
unchanged (`executeNeutralActivation`), with the fighter breaking its ties and
picking its landing cells exactly as before.

## Multiplayer ladder & turn discipline (MMR, quit penalty, 10-min turns) — what runs vs. limits

Leading with what does NOT run: a game that never reaches a winner (every seat
walks away before anything triggers the last-standing win) reports nothing; OPEN
tables are never recorded (their members hold no seats, so results cannot be
attributed); a turn-clock pause forgives the seat's WHOLE 10-minute budget
(fresh stamp), not just the paused interval; and the timeout/auto-kick triggers
are CLIENT-fired (server-validated) — with zero connected clients nothing fires,
which is fine because nobody is waiting.

- **Every finished win/loss is RECORDED; only a RANKED game moves MMR.** All
  victory modes funnel through `declareAdventureWinner` (conquest, grail,
  dragon-hunt, dragon-conqueror, last-faction-standing after eliminations/
  give-ups/AFK kicks), so `detectFinishedMatch` (`src/server/match-report.ts`)
  reports them all on a hosted table with ≥2 verified accounts, a winner AND a
  loser — **including a NORMAL/casual table** (`room.ranked === false`), so a
  give-up or quit shows up as a win/loss on the profile even in a casual game.
  The match carries a `ranked` flag: `recordMatchResult` bumps wins/losses/
  matches for every reported game but recomputes Elo ONLY when `ranked` (a
  NORMAL game leaves every rating untouched — pinned with W/L-moves-MMR-doesn't
  tests on both account backends AND the `/api/matches/report` route). Elo is
  winner-takes-field (`accounts/elo.ts`); "abandon" scores as a loss on BOTH
  account backends. An absent `ranked` flag (legacy rooms) stays ranked.
- **Losing or quitting loses points.** `buildAdventureFromLobby` freezes
  `room.matchSeats` (seat → account) at map build; at game end the reporter
  unions that snapshot with the live members, so LEAVE_ROOM, stepping down to
  observer or a host kick mid-game is reported as **abandon** instead of
  vanishing. A replacement account seated mid-game gets the seat's real result;
  the deserter still gets the abandon. Pinned in `match-report.test.ts`
  (leaver / stepped-down / replacement / winner-seat cases, with a no-snapshot
  legacy CONTROL proving the snapshot is what closes the quit-to-dodge hole).
- **10-minute turn budget** (`TURN_TIME_LIMIT_MS`; engine in `afk.ts`,
  `afk-drop.ts`, `resolveTurnTimeout` in `adventure-reducer.ts`): even an
  actively-clicking seat gets 10 minutes per OPEN turn (`afk.turnOpenSince`,
  maintained by `applyTurnClockBookkeeping` on every server-stamped action;
  ordered AND parallel modes). The clock PAUSES (re-stamps, checked on BOTH
  sides of each action) while the seat is blocked: an open PvP battle, another
  seat's exclusive interaction, the round-start event barrier. On expiry any
  live client fires `FORCE_TURN_TIMEOUT` (the server re-checks its own clock
  and the pause state); the shared forced-resolution driver then
  default-resolves the seat's pending inputs, retreats an open NEUTRAL fight,
  and ends the turn through the normal `endTurnAdventure` — Pandora/Logistics
  end-turn prompts and the no-base elimination clock run exactly as if End
  Turn was pressed by hand. The player is NOT eliminated (the AFK vote /
  30-minute kick remain the removal path), driver-issued auto-answers do NOT
  refresh the target's AFK idle clock, and force-ending the LAST open parallel
  turn wraps the round WITHOUT consuming the seat's fresh next turn. Pinned in
  `turn-timeout.test.ts` (too-early / paused / wrong-seat CONTROLs); the
  countdown chip + client auto-fire live in `overlays.tsx`
  (`overlays.test.tsx`).
- **Who is here / who joined.** A genuinely NEW `JOIN_ROOM` announces itself —
  a forced system chat line plus a feed toast — with verified accounts named
  by nickname and guests honestly labeled "guest — name"; reconnects/rebinds
  re-emit the event with `newMember: false` and stay silent so refreshes never
  spam (`room-membership.test.ts`, `chat.test.ts`). The lobby directory carries
  a bounded per-room roster (host first, guests dashed + labeled,
  `MAX_DIRECTORY_MEMBERS`) so players can see who is in which room — and who
  hosts it — before joining (`lobby-registry.test.ts`).
- **Public profiles.** `GET /api/players/[nickname]` (rate-limited; banned →
  404) serves the PUBLIC profile — rating, W/L record, member-since, the
  owner-editable contact fields, never the email — and `/players/[nickname]`
  renders it, linked from Hall of Fame rows and verified room-member names
  (`account-store.test.ts` "looks up a PUBLIC profile by nickname").

## WOG Commanders (optional module, BINH-only) — what runs vs. adaptations

Lobby: WOG crest + "Commanders" module (`WogModOptions.commanders`, default
OFF). Content in `src/data/commanders.ts`, engine in `src/engine/commanders.ts`
wired through setup/adventure/reducer/legal-actions/permanents/runes; behaviour
pinned in `src/engine/wog-commanders.test.ts` + `wog-commander-casts.test.ts`
+ `wog-commander-combos.test.ts` (observable outcomes with CONTROLs; each
fails if its wiring is removed).

Leading with what does NOT run / deliberate readings:
- **The WoG PC reference layer did NOT ship**: the 5-tier primary skills and
  the PC numbers in `docs/wog-commanders-plan.md` §4–5 are design history. The
  shipped system is grades 0–3 per stat plus the 15 combination skills below.
- **Stat points from level-ups** (`commanderGradePointsForLevelUp`,
  `awardCommanderGradePoints`): every hero level-up awards the commander stat
  POINTS to spend (one point raises one stat by one grade). A normal level-up
  gives 1 point; the two MILESTONE levels give 2 — levels 3 & 6 for everyone
  EXCEPT the Castle Paladin, whose Wise specialty pulls the milestones EARLIER
  to levels 2 & 5 (`commanderDoublePointLevels`). A full run to level 7 is 8
  points either way. Points live in `commander.gradePoints`; `COMMANDER_GRADE_UP`
  spends ONE to raise a single stat (max grade 3). Pinned in
  `wog-commanders.test.ts` ("stat points from the hero's level": the point
  schedule, the spend, the Paladin milestone shift, the legal-action offers).
- **Stats are grades 0–3** (`COMMANDER_GRADE_VALUES`): every stat STARTS at
  grade 0 (the base line A2/D1/H4/dmg0/Pow0/Spd5). A grade's bonus over the
  base is the value shown, never summed with earlier grades: +1/+2 at grade
  I/II; grade III is adjusted per the user spec — Attack +3 (5), Health +4 (8),
  Speed +5 (Initiative 10). Two stats work differently:
  - **Defense = 1/2/2/3** (NOT +3 at III). Grade II is the "+1 def when
    attacked" tier: Defense 2 PLUS a permanent Defense token
    (`commander-defense-token`, `SELF_DEFENSE_TOKEN` — the commander rolls the
    Defend die when attacked, +1 on a "+1" face). Grade III is a reliable flat
    Defense 3 with NO die (the token is on grade II ONLY —
    `COMMANDER_DEFENSE_TOKEN_GRADE`). Pinned in `wog-commanders.test.ts`
    ("Defense grade II Defense token", with grade-I no-token / grade-III no-die
    CONTROLs).
  - **Damage = extra ATTACK DICE, not a flat bonus.** At Damage grade N the
    commander rolls N ADDITIONAL attack dice (0/1/2/3) alongside its normal
    attack die on every attack; each extra "+1" face raises the attack value,
    and AT MOST ONE "−1" counts (`getMightDiceCount` / `mightDiceAttackBonus`,
    rolled once per attack in `finishResolvedAttack` and reused by the
    lethal-save preview). Because they are attack dice they ride the attack
    value BEFORE Defense (they can push through Defense; a fully-blocked hit is
    still 0). Pinned in `wog-commanders.test.ts` (the "Might" case, with the
    "at most one −1" and the push-through-Defense CONTROLs).
  The Magic ladder (user spec — grade 0 buys NOTHING but the cast itself):
  Power **0/0/1/2** (`COMMANDER_GRADE_VALUES.magic`; cast tiers cap at "Power
  2+"), Spell ward **0/1/1/3** (`COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION` — no
  `reduce-spell-damage-*` id at all at grade 0, `-1/-1/-3` from grade 1),
  ongoing-effect immunity from **grade 1** (`titan-ignore-ongoing`, gate
  `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE` = 1 — a grade-0-Magic commander is NOT
  immune and takes full Spell damage). So grade 0 = the once-per-round cast
  only; grade 1 = -1 ward + ongoing immunity; grade 2 = +Power 1; grade 3 =
  Power 2 + -3 ward. Pinned in `wog-commanders.test.ts` ("the Magic grade
  package", with grade-0 full-damage / not-immune CONTROLs) and the injection
  test.
- **15 combination skills** (`COMMANDER_COMBOS`, one per stat pair): a combo
  unlocks once ONE stat of its pair is grade 3 and the OTHER at least grade 2
  (either orientation; 2+2 and 3+1 stay locked). Death Stare (DMG+MAG,
  `gorgon-death-stare`) and Charge (DMG+SPD, `commander-charge`) kept their
  original wiring; the other 13 (plan §5, board-adapted): No Enemy Retaliation
  (ATK+MAG, `ignores-retaliation`), Sharpshooter/Can Shoot (ATK+SPD — the
  unit's TYPE flips to ranged in `makeCommanderCombatUnit`, no ability tag),
  Mighty Blow/max damage (ATK+DMG, `MINIMUM_ATTACK_DIE` 1 — the own die always
  counts +1), Endless Retaliation (DEF+HP, `unlimited-retaliation`), Crushing
  Strike/-50% Defense (ATK+DEF, `DEFENSE_REDUCTION_ON_ATTACK` 2), Fearsome
  (ATK+HP, Paralysis on an own "-1" die), Whirlwind Strike (DEF+DMG,
  `SECOND_ATTACK_ALL_ADJACENT_TO_SELF`), Fire Shield (DEF+MAG, passive
  `FIRE_SHIELD_DAMAGE` 1), Block (DEF+SPD, a "-1" defensive die fully blocks
  the hit), Double Strike (HP+DMG, `SECOND_ATTACK_SAME_TARGET_AFTER_
  RETALIATION`), Paralyzing Touch (HP+MAG, extra die "0" Paralyzes),
  Regeneration (HP+SPD, heal 1 on activation), Battle Teleport (MAG+SPD,
  `teleport-move` MOVE_ANYWHERE — the user-spec "can move anywhere in battle",
  replacing WoG's Fly). Each behaviour + a locked CONTROL one grade below is
  pinned in `wog-commander-combos.test.ts`. With ~8 points over a full run one
  combo is comfortably reachable (grade a stat to 3 = 3 points, its partner to
  2 = 2 points) and a second is possible if the builds overlap — a deliberate
  build choice.
- **Deployment cap**: with the module on, `combatUnitLimit` = 4 army units
  (both neutral and PvP setups) — the commander IS the 5th body. Module off =
  the classic 5 (pinned with a CONTROL in `wog-commanders.test.ts`).
- **UI**: the CARD face (`CommanderCardFace`) keeps the classic HoMM3 spell
  icons (`public/assets/spell-icons/`) for the cast/combo chips and overlays the
  REAL stat numbers on the frame wells plus the Might-dice / Power badges. The
  read-only STATS view (`CommanderStatsPanel`, used by the map card AND the
  combat inspect/zoom — `board.tsx` / `zoom.tsx`) instead uses the AUTHENTIC WoG
  comm3 symbols (`public/assets/commander-icons/stat-*.jpg` for the six stats,
  `combo-<tag>.jpg` for the fifteen skills, downloaded from
  heroesofmightandmagic.com/wakeofgods/pics/comds; existence pinned in
  `wog-commander-combos.test.ts`). It spells out each grade bonus (base + grade
  delta), the Defense-token "+1 def when attacked" tier, the Damage DICE, a
  Magic Power ladder with the current tier + spell ward highlighted (grade 0
  reads "cast only — no ward, not immune"), and every combination skill with its
  symbol + full text (render smoke-tested in `commander-card.test.tsx`). Combat
  inspect also shows the Might dice + Power inline. On level-up the map card's
  point picker lists each stat with a plain-words "what you gain" line
  (`gradeUpBenefit`); one click spends one point on a stat and the count ticks
  down. Unspent points pulse/blink the dock tile.
- **Presentation (sfx + animation, all engine-event-driven, tested where pure):**
  the card FACE now carries an animated **rainbow frame spark** (a rotating
  rainbow ring + travelling white spark tracing the border; hidden for a fallen
  commander; `.commanderRainbowFrame` in globals.css). Every command ability
  animates + sounds in combat: `COMMANDER_CAST_USED` (the activation cast AND the
  Shield / Stone Skin reaction) reuses the matching H3 spell's sprite + sound
  over the target via `commanderCastFxPlan` (`src/data/commander-fx.ts`, Animate
  Dead falls back to a heal shimmer), and `COMMANDER_SPECIALTY_TRIGGERED` plays a
  themed sting (`commanderSpecialtySound`) — both wired in `page.tsx`'s combat FX
  loop; the mapping is pinned in `commander-fx.test.ts`. A hero level-up that
  awards commander points fires `COMMANDER_POINTS_AWARDED` and pops a celebratory
  **level-up popup** (`CommanderLevelUpOverlay`, slam-in + fanfare) carrying the
  clearer `CommanderLevelUpPicker`: one clearly-separated, per-stat-accent-
  coloured option showing the grade jump, the numeric value change and the
  benefit (render + click tested in `commander-card.test.tsx`).
- **Battlefield voices**: a commander has no unit definition, so its combat
  voice is keyed by slug in `commanderVoices` (`unit-sounds.ts`,
  `commanderSoundKey`); the table passes `commander:<slug>` as the voice id
  (`commanderVoiceId`) and `unitSoundKey` routes it. Per the user spec:
  Castle=Swordsman, Rampart=Monk, Tower=Sorceress(Sea Witch), Inferno=move
  Gargoyle/hurt-death-defend Pixie/attack Magi, Dungeon=Minotaur,
  Necropolis=move Zombie/hurt-defend-death Lich/attack Lich-melee,
  Stronghold=Ogre, Fortress=Gnoll, Conflux=hurt-death-defend Pixie/move-attack
  Efreet, Factory=Cove Seamen, Cove=Sea Dogs, Bulwark=Jotunns. Pinned in
  `unit-sounds.test.ts`.
- **Specialty adaptations** (each engine-enforced, but a conscious rewrite of
  the WoG printed passive): Paladin Wise = the two MILESTONE (2-point) level-ups
  come early, at hero level 2 & 5 instead of 3 & 6 (not 150% XP); Temple Guardian
  Mana Magician = twice per COMBAT a Spell may
  exceed the per-round limit (this game has no mana pool; a burned charge
  converts into `spellLimitBonusThisRound` so the limit never dips below the
  count); Brute Soul Reformer = flat +2 gold after each WON combat (no XP→gold
  pools); Soul Eater Undead = Paralysis-token immunity; Shaman Superior Combat
  AND Sea Marshal Battle Stance = the owner picks the commander's combat stance
  (+1 Attack OR +1 Defense) on the commander card OUTSIDE combat, baked into the
  unit at each combat's setup (default +1 Attack; `commander.stance`); Astral
  Spirit **Elemental Scourge** = at the start of a combat vs neutral units,
  EVERY enemy neutral unit takes 1 damage (`applyElementalScourge`, effect
  damage through the normal removal path, every neutral combat incl. banks —
  this REPLACED the old "Pacifist" flee specialty; pinned in
  `wog-commanders.test.ts` with a module-off and a non-Conflux CONTROL); Rune
  Keeper Rune Ritual = +1 Rune EVERY time the commander is attacked AND +1 EVERY
  time it MOVES (`applyCommanderRuneRitual` on the attack, `applyCommanderRuneOnMove`
  in `moveUnit`; NO once-per-combat cap any more — user spec "when he move or get
  attacked, also gain rune +1"; retaliations don't count as being attacked;
  pinned in `wog-commanders.test.ts` with a Paladin CONTROL for both halves);
  Hierophant First Aid = post-combat window restoring ONE bronze/silver
  casualty (died card returns — a Neutral-side card is pulled back OUT of its
  tier discard so it is never duplicated; a Pack that fell to Few flips back);
  Ogre Leader Ballista Master = the player aims the Ballista's round-start
  shot (the Gerwulf `BALLISTA_CHOOSE_TARGET` freedom, granted passively);
  Artificer Tinkerer = war machines cost 5 less gold (min 0) at both shops.
- **Roster renames** (user spec): Cove Corsair → Sea Marshal, Factory Engineer
  → Artificer, Bulwark Frost Warlord → Rune Keeper (slugs/assets unchanged).
- **Commander scope**: it fights ONLY the main hero's combats (garrison
  defenses and secondary-hero fights get none), is AUTO-placed at combat start
  (own backline first, then frontline; bank fights use the six central cells)
  rather than hand-placed, enters every combat at full health, and only DEATH
  persists (revive anywhere on your map turn for 2 + 2x hero level gold).
- **Tierless both ways** (bank-guard convention): tier-gated spells (Blind…)
  never target a commander, and the neutral AI hits it LAST.
- **Ongoing-effect immunity is a Magic grade-1+ perk** (titan-style, gate
  `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE` = 1): from grade 1 even FRIENDLY ongoing
  buffs skip the commander, so the buff-type command casts exclude an
  ongoing-IMMUNE commander from their target lists up front
  (`commanderUnitImmuneToOngoing`). A grade-0-Magic commander is NOT immune — an
  ongoing cast (e.g. an enemy Slow) CAN land on it, and it takes full Spell
  damage; the cast-candidate exclusion and the effect application both key off
  the actual immunity, pinned with grade-0 CONTROLs in `wog-commanders.test.ts`
  and `wog-commander-casts.test.ts`. Tokens are NOT ongoing effects — a commander
  can still be Paralyzed (unless Soul Eater).
- **Cast readings**: the cast is once per combat round, FREE during the
  commander's own activation. Per the user spec a cast ENDS the commander's
  MOVEMENT for that activation (it may still attack, but no longer move —
  `movementLockedThisActivation`, gated in `getLegalMoveDestinations` so
  MOVE_UNIT / MOVE_AND_ATTACK / the Battle-Teleport MOVE_ANYWHERE are all
  blocked; pinned in `wog-commander-casts.test.ts`). The lone EXCEPTION is the
  two **instant-reaction** defend buffs below, which are played off-turn and
  never touch movement.
  Cure's cleanse removes ALL negative tokens+effects (not one); Animate Dead
  heals a flat 2 (the bronze/silver/gold ladder IS the Power scaling);
  Counterstrike = unlimited retaliation for the round (tier-laddered);
  Haste/Slow riders compare effective Initiative at attack time (+1 vs slower
  / -1 vs faster, on the buffed/slowed unit's own attacks); Fire Shield
  durations are 1 round / whole combat / 2 rounds by Power; Rune Mend spends
  the per-combat Rune pool (1/2/2 → heal 1/2/3) and never revokes an
  already-latched Rune Level (that pool is add-only by design); Field Repair's
  "mechanical" = the engine's `isMechanicalUnit` (Factory Automatons /
  Dreadnoughts); Shield shares the Shield SPELL's `DEFENSE_VS_ATTACKER_TYPE`
  semantics (a ranged-TYPE unit attacking adjacent is still not "melee").
- **Hierophant Shield & Ogre Leader Stone Skin are INSTANT REACTIONS**, NOT
  activation casts (user spec "the defend buff of 2 commanders is instant
  reaction"). Keyed off `commanderCastIsInstantReaction` (`effect.kind ===
  "defense-buff"`): removed from the activation offer (`commanderCastAvailable`
  returns false for them) and instead offered to the ATTACKED unit's controller
  in the open attack window (`commanderDefenseReactionUnit` →
  `USE_COMMANDER_CAST_REACTION`, resolved via `applyCommanderCastReaction` +
  `advanceReactionWindowAfterPlay`). They buff the attacked unit's Defense
  BEFORE the hit resolves (a `current-combat-round` effect folds into the
  triggering attack, like Interference), stay once-per-combat-round, cost no
  activation and never lock movement. Shield (vs melee) is NOT offered against a
  ranged-TYPE attacker (its `DEFENSE_VS_ATTACKER_TYPE` would do nothing); Stone
  Skin (vs all) is offered against any attacker. Pinned in
  `wog-commander-casts.test.ts` with a pass-the-reaction CONTROL, the melee-only
  gate, and a once-per-round CONTROL.
- **Dungeon Brute Bloodlust (melee) & Tower Temple Guardian Precision (ranged)**
  now scale Pow 0 = +1 (target must be ADJACENT to the commander), Pow 1 = +1
  (anywhere), Pow 2 = +2 (anywhere), always THIS round only
  (`adjacentBelowPower: 1`, `amountByPower: [1, 1, 2]`; user spec). Precision
  keeps its "ignore ranged penalties" rider. Pinned in
  `wog-commander-casts.test.ts` (targeting-adjacency + amount, each with a
  no-cast CONTROL).
- **Might (Damage grade)** rolls N EXTRA attack dice (N = Damage grade 0/1/2/3)
  on the commander's attacks AND retaliations, folded into the attack value
  beside the normal die (each "+1" raises the attack; at most one "−1" counts).
  Because they are attack dice they interact with Defense and stay under
  per-attack damage caps (Cove Nix). Charge fires on its own attacks after
  moving, never on retaliations. Death Stare reuses `gorgon-death-stare`
  verbatim (2 dice, double "-1" destroys the side). The ATTACK_ROLLED event
  carries the extra dice as `mightRolls` so the combat UI can show them.
- The commander COUNTS for win/loss (`livingControllerIds`): an army can fight
  on through its commander, and killing a side needs the commander dead too.
- `COMMANDER_GRADE_UP` / `REVIVE_COMMANDER` / `COMMANDER_FIRST_AID` are
  handler-validated actions (self-validating; usable outside combat without a
  legal-actions membership match). While `pendingCommanderFirstAid` is open,
  the owner's map actions are gated to answering it (Necromancy-style);
  `eliminatePlayer` clears an eliminated seat's window.

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
(returning cards a DECK_SEARCH / Visions scry / Pandora scry had lifted out of
a shared deck — the Pandora scry's undecided AND kept cards go back on TOP of
the draw pile, pinned in `pandora-cards.test.ts` "eliminating the scrying
player mid-scry destroys NO shared-deck cards" — restoring `phase`), plus an
owned `pendingNecromancy`/`pendingFarTileFlip` — so
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
(4) A mid-Event elimination (AFK kick / concede while a Fortress Event is
resolving) must not leak the shared display: the drawer-owned TABLE bookkeeping
rewards (`EVENT_POOL_CLEANUP`, `EVENT_AUCTION_OPEN`/`_RESOLVE` — playerId-
agnostic steps) are handed to the next live seat instead of being dropped with
the seat's own rewards (`isSharedEventBookkeepingReward`, applied in
`eliminatePlayer` AND in `pumpAdventureQueues`' eliminated-owner skip for
pre-fix snapshots); the dead seat's secret auction bid is scrubbed so it can
never win a lot into a dead hand, and an un-answered 1-for-1 Marketplace deal
they proposed is voided (queued ANSWER steps fall through cleanly — an
already-open Accept button becomes a no-op). Pinned in `event-deck.test.ts`
("Event resolution survives a mid-Event elimination"), each fix
mutation-checked.

Engine readings / deviations a reviewer should know (all deliberate, commented at
the wiring site):
- **Early-game Relic lock (HOUSE RULE)**: Events that GIVE Artifact cards — the
  Shady Auction's lots, the Artifact Merchant's pool AND its discard-top offer,
  Messenger with Supplies' draws, a Magical Forest "draw and view" contribution
  (whose menu option is also hidden when the lock leaves nothing drawable) —
  offer minor/major Artifacts only before round 5; Relics join the offers from
  round `EVENT_RELIC_MIN_ROUND` (= 5, `src/engine/adventure.ts`) on. With split
  decks the Relic deck drops out of the weighted pick; a legacy single Artifact
  deck redraws past Relic cards (tucked under, never consumed). Event-granted
  SEARCHES of the Artifact deck keep the normal BINH progression gates instead,
  and a Relic contributed from a player's own hand stays legal in the Forest
  pool. Pinned in `event-market-cards.test.ts` ("Event — early-game Relic
  lock") with round-5 CONTROLs; mutation-checked.
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

## Monolith & Whirlpool Tokens (Conflux/Cove, map-designer content) — what runs vs. readings

Location Tokens per rulebook p.35/83, placeable ONLY through the map designer
(`CustomMapTilePlan.token`; no standard scenario ships them). Data in
`src/data/map/locations.ts` (`monolith`, `whirlpool`, category "revisitable"),
engine in `src/engine/adventure.ts` (`resolveTokenTeleport` and the map-token
section) + `adventure-reducer.ts` (`offerPendingTokenPlacement`,
`place-map-token`), setup in `adventure-setup.ts` (`applyCustomMapTokens`).
Behaviour pinned in `src/engine/map-tokens.test.ts` (observable outcomes — hero
position, army size, field state — each mutation-checked with CONTROLs), the
designer UI in `map-designer.test.tsx`, save round-trip in
`map-registry.test.ts`.

Leading with what does NOT run / deliberate readings:
- **Only the Two-Way Monolith is modeled.** The printed One-Way
  Entrance/Exit Monolith pair is NOT a separate location — every monolith is
  two-way. With 3+ monoliths the TRAVELLER PICKS the destination (the printed
  "corresponding" pairing has no meaning on a designed map); with exactly 2 the
  travel is automatic.
- **"Lose 1 unit from your unit Deck" is the traveller's pick** of one army
  card (the card names no unit); a Neutral-side card recycles to its tier
  discard pile like a combat casualty. An empty army loses nothing (noted).
- **Occupied destinations are skipped** (the p.83 "skip the movement if you
  would be stepping onto an allied Hero" note, read for ANY hero): a token a
  hero stands on is not offered, the 3-whirlpool die rerolls its number, and
  with no free destination the travel fizzles with a note.
- **Guarded fields refuse a token placement** (engine safety reading — the
  printed rule bans only Location Tokens/Blocked Fields/victory Locations, but
  overwriting a guard would erase it for free). Towns, Settlements, Mines,
  Obelisks, the Grail and the Dragon Utopia are excluded as the conservative
  "victory conditions" reading. Terrain is enforced: monolith = land hex,
  whirlpool = sea hex.
- **Cross-layer monoliths are allowed** (a designer may knowingly link the
  Surface and the Underground — a Town-Portal-like exception to the
  gate-only-crossing rule; the teleport never consults `canCrossEdge`).
- The designer caps whirlpools at 3 (the physical numbered tokens; the engine
  falls back to traveller's-pick if a hand-edited save exceeds it) and allows
  at most ONE token per tile.

What runs (each with a failing-if-removed test):
- Designer: token per tile — face-up tiles pin a legal slot (picker filtered by
  `legalTokenSlotsForTileDef`), face-down tiles carry a pending token placed on
  discovery. Lone-token maps show the "needs at least 2 to work" warning; a
  lone token in play is inert with the same note. Tokens survive save/load
  (`sanitizeTile`) and are validated again at setup (illegal slots dropped).
- Discovery: revealing a pending-token tile lets the DISCOVERING player place
  it on "a Field of your choosing" (`place-map-token` choice, glowing
  candidates; single candidate auto-places, zero drops the token). It waits
  behind the Subterranean-Gate and Creature-Bank prompts on the same reveal;
  gates and tokens never cover each other.
- Travel: entering (or Revisiting, 1 MP) a token teleports to another token of
  the kind. Arrival does NOT re-trigger (no ping-pong). Whirlpool numbers are
  the die faces +1/0/-1 (assigned in plan order); with exactly 3 whirlpools the
  Attack die decides, rerolling the origin's number, per the printed rule.
  Each whirlpool travel then costs the unit toll.
- Travel into a face-down tile: the tile flips for FREE, the traveller rotates
  it (a Ⅱ–Ⅲ tile runs the standard keep/reroll flip), places the destination
  token, and arrives on it (`pendingTokenTeleport`; whirlpool toll after
  arrival). Elimination mid-flow auto-places the token and cancels only the
  dead seat's travel.

## First-round rules, Cove City Hall & bank/opponent UI (BINH house rules) — what runs

Six additions; each engine rule fails a named test if its wiring is removed.

- **First-round hand discards return to your OWN deck, not the discard pile.**
  During round 1 (`state.round === 1`) a card discarded in the opening hand
  refresh (`refreshHand`, `adventure-reducer.ts`) is placed at the BOTTOM of the
  player's `deck` (index 0; the top is the last element) instead of on
  `player.discard` — so an early mulligan does not strand cards in the discard
  for the whole first deck cycle, and (bottom placement) the immediate
  draw-up-to-limit never just hands the same cards back. From round 2 on, discards
  go to the discard pile as normal. Pinned in `first-round-hand-discard.test.ts`
  (round-1 → deck / later-round → discard CONTROL) and `adventure.test.ts`.
- **Each shared deck starts with one card face-up on its discard pile.** At game
  setup (`makeSharedDecks`, `adventure-setup.ts`) every shared deck (Abilities,
  Spells, Artifacts — and their BINH split variants spells-expert /
  artifacts-minor/major/relic) flips its top card onto its discard pile, so each
  discard pile shows one card from round 1. No card is lost — it stays in the
  deck's discard/draw cycle. CONSEQUENCE (a real effect, not decoration): because
  the discard-top is now non-empty, the FIRST search of a deck offers the normal
  "Search the deck, or take its top discard?" option (`openSharedDeckSearch`) —
  the seeded card is a genuine, takeable discard card (subject to
  `canAcquireSharedDeckCard`; a low-level hero only ever searches its allowed-tier
  deck, so it never reaches a high-tier seed's take-option). Pinned in
  `shared-deck-discard-seed.test.ts` (one card of the right kind on every shared
  discard, deck total conserved) and `adventure.test.ts`.
- **Cove City Hall fires on the RESOURCE round, not the Astrologers' round.**
  `cove.city_hall` (`core.ts`) is now a `RESOURCE_ROUND_CHOICE` (the 4-gold /
  remove-an-Artifact-for-1-XP choice) like every other faction's City Hall,
  overriding its printed "each Astrologers' round". The now-unused
  `ASTROLOGERS_ROUND_CHOICE` effect type + its handlers were removed. Pinned in
  `cove-content.test.ts` (queues on round 3 / a round-2 Astrologers CONTROL that
  stays silent) and `describe.test.ts`.
- **A tile's Creature Bank is drawn (known) BEFORE the tile is rotated.** On
  reveal, `beginTileRotation` (`adventure-reducer.ts`) calls
  `reserveCreatureBankForTile`, which PEEKS the top token of the matching tier
  pile and stashes it on `tile.reservedBankId` (a peek, never a pop — the pile is
  consumed only when the placement is accepted, so a decline or a Blocked Field
  lost to a Subterranean Gate leaves the pile intact and nothing is stranded on an
  elimination). The rotation-preview UI (`screen.tsx`) shows the reserved bank's
  art + name on its Blocked Field, and the placement choice names it. Pinned in
  `creature-bank-combat.test.ts` ("reserved (known) before the tile is rotated":
  reservedBankId set before rotation with the pile intact; the placed bank EQUALS
  the reserved one on accept; decline leaves the pile intact; both clear the
  reservation).
- **A Creature Bank field draws NO borders by default (toggleable).**
  `getTileBorderSegments` (`borders.ts`) takes `showBankBorders` (default false):
  a bank slot draws none of its edges — neither the blocked-field ring NOR the
  tile's outer-impassable arc — so the field reads as fully open. A toolbar toggle
  (`screen.tsx`, shown only when a bank is on the map) restores the classic
  outline (outer arc only, inner open). Pure rendering — movement is unchanged
  (`canCrossEdge`). Pinned in `multi-target.test.ts` ("draws NO borders … by
  default" + a "borders toggled on … outer arc only" case).
- **Opponent info panel (map AND combat).** `OpponentInfoDock` / `OpponentInfoModal`
  (`components/adventure/opponent-info.tsx`) render a per-opponent button that
  opens a read-only panel of that opponent's PUBLIC state — resources (+income),
  hero (level + `HeroBoard`), current unit deck (`ArmyPanel`) and buildings — all
  already public (player-view masks only hands/decks/spell-books), so this is a
  pure presentation layer with no engine change. Rendered in the map left rail and
  the combat card strip (`page.tsx`). Render-tested in `opponent-info.test.tsx`.

## Neutral-combat & Sorrow refinements (BINH house rules) — what runs

Three engine-enforced additions; each fails a named test if its wiring is removed.

- **Mysticism EXPERT recalls the "pow" cards paid for a Sorrow.** A silver/gold
  Sorrow is paid with power-source ("pow") cards. When the caster then plays
  Mysticism into the kept-open activation-skip window, Mysticism's expert side
  ("also take back all other cards played together with it") now sweeps those pow
  cards back to hand along with the Sorrow — not just the Sorrow. The paid cards
  are captured on `combat.pendingActivationSkipRecall.powerCardIds` when the
  window is held open and returned from the discard in the RECALL_SPELL take-back
  handler (reducer.ts). Knowledge and BASIC Mysticism leave the pow cards spent
  (the control). Pinned in `rampart-inferno-spells.test.ts` ("expert Mysticism
  recalls every pow card paid for the Sorrow", with a basic-Mysticism control).

- **A +Movement card can extend a neutral combat.** Boots of Speed, the Logistics
  ability's expert side, Dessa's Logistics IV/VI, Shield of Naval Glory's sea
  side, AND Equestrian's Gloves' "+1 movement" side — normally map-only — may be
  played in a neutral combat's
  continue-or-retreat window (`awaitingContinue`) to top up `hero.movementPoints`,
  so a hero OUT of movement can buy another round (spend 1 on
  `CONTINUE_NEUTRAL_COMBAT`) instead of being forced to retreat. Optional: the
  player chooses to use it or not at the end of each round. `heroMovementGrantOption`
  (effects.ts) detects the movement side by EFFECT KIND (`GAIN_HERO_MOVEMENT`),
  wherever it sits in a `CHOOSE_ONE` — so the Gloves' movement side at option
  index 1 is caught exactly like Boots' at index 0; the offer lives in the
  awaitingContinue gate (legal-actions.ts, gated on the same expert-use / sea-tile
  conditions the reducer checks); playCard waives `mapOnly` ONLY for that exact
  window (`continueMovementTopUp`) and keeps the window open afterwards. Pinned in
  `neutral-combat-movement-extend.test.ts` (Boots, Equestrian's Gloves, and the
  expert-only Logistics sibling, with a normal-combat control that mapOnly still
  holds) and the UI in `combat-round-over-prompt.test.tsx`.

- **The player picks a neutral's move destination.** When a neutral must MOVE to
  reach the target it will attack and several legal cells reach it, the attacking
  player picks which — a `choose-destination` intent (`neutral-ai.ts`) →
  `neutral-destination` OPTION_CHOICE (reducer.ts) → resume the activation with
  the picked cell forced. It still attacks the rules-fixed target (target
  selection is unchanged); only the landing cell is the player's choice. A single
  legal cell needs no prompt (move-and-attack directly), and an already-adjacent
  guard just attacks. The offered cells are the obstacle-aware reachable set
  (`getLegalMoveDestinations` → `getReachableDestinations`): a GROUND guard's
  offer drops cells blocked or severed by Combat Obstacles, a FLYING guard's
  offer includes cells reachable only by crossing over obstacles (but never a
  cell it cannot land on), and a RANGED guard shoots from where it stands and is
  never prompted. Composes with the existing "player breaks a target tie" choice:
  pick the target, THEN the cell. Board cells are clickable (board.tsx, reusing
  the teleport cell-picker). Pinned in `neutral-move-destination.test.ts`
  (unit-level intents, the obstacle/flying/ranged cases each with a control, and
  an end-to-end test proving the guard lands on the CELL the player picked), the
  composition in `adventure.test.ts`, and the board wiring in `board.test.tsx`.
