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

## 3. Required enforcement (NOT yet in the repo — add it before relying on this)

A test must assert: every unit `abilityText` that describes an effect is either
backed by an implemented `abilities` tag or listed in `DISPLAY_ONLY_ABILITIES`.
New decorative text then fails CI until it is consciously declared. **This test
does not exist yet** — until it does, rules #1–#2 are guidance, not enforcement.
Do not describe them as enforced.

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

Still display-only / not on the roster (Conflux):
- `conflux.magic_elementals` (Few & Pack) — "Attack all adjacent (enemy) units"
  is display-only (the engine has no primary attack-every-adjacent action); the
  Pack's "Ignore any ongoing spell effects and Specialty damage" line is also
  display-only. What IS wired: `ignores-retaliation` (both sides) and, on the
  Pack, Magic-Arrow immunity + elemental damage.
- Conflux heroes Ciele, Luna and Tarnum (Conflux) are NOT on the roster yet —
  their spell/obstacle/search specialties are not implemented. Only the three
  unit-specialist Planeswalkers (Erdamon, Monere, Pasis) ship, with all of
  their I/IV/VI specialties implemented and tested (`conflux-content.test.ts`).

This section is maintained by hand — the rule #3 enforcement test still does
**not** exist, so re-verify any "stub" claim against `src/data/factions/units.ts`
and the tests before trusting it. The Creature Bank system tracks its own
display-only items in the section below.

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
  (`creatureBankTierForGroup`), so sea/center/subterranean/starting tiles never
  trigger it — including sea tiles that DO carry a Blocked Field / impassable
  terrain (e.g. the Cove tile W1). A bank is reachable only from within its own
  Tile — you can walk in to fight, but it is never a route across a Tile edge to
  the outside (enforced in `canCrossEdge`, even for Pathfinding).
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
