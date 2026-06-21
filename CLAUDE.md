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

The tower and hero items this list previously named have since been wired, each
covered by a test that fails if the logic is removed:
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
  number of Stacked defenders (X).
- Stack Tokens: count by Scenario Difficulty (Easy 1 / Normal 2 / Hard 3 /
  Impossible 4), placed on distinct cards, +1 attack/defense/health or +2
  initiative; a Stacked defender absorbs one lethal blow by discarding its token
  and carrying the leftover damage (`markUnitRemovedIfNeeded`). The board shows a
  gold badge naming each token's stat.
- Bank combat: no Quick Combat, no experience; win marks a Black Cube and grants
  the reward. HOUSE RULE (overrides the rulebook): a bank DOES obey the one-Round
  time limit and the spend-1-MP-to-extend rule, exactly like a normal neutral
  fight.
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

**Display-only bank-card abilities (declared in `DISPLAY_ONLY_BANK_ABILITIES`,
`src/data/units/abilities.ts`) — these do NOTHING mechanically:**
- Imp Cache Familiars (while-Stacked enemy spell-Power drain), Crypt/Shipwreck
  Wraiths (on-attack enemy discard), Dwarven Treasury Dwarves / Dragon Utopia
  Crystal Dragons (while-Stacked Defense token), Dragon Utopia Black Dragons
  (while-Stacked +3 Attack), Dragon Utopia Faerie Dragons (while-Stacked spell
  lock), and the Medusa Stores "if Stacked, Paralyze" rider (only the
  ignore-retaliation half runs).

**NOT implemented at all (deferred):**
- "Gain a unit" rewards: Dragon Fly Hive and Griffin Conservatory grant nothing
  (`rewardStatus: "not-implemented"`); the "Gained Stacked Units" mechanic does
  not exist. The Pyramid's per-Stack "remove a card then Search(5)" extra is
  also unimplemented (`rewardStatus: "partial"`; only base Search(5) runs).
- Bank units carry the underlying unit's `grade` for placement/display, so the
  "no tier" exemption from tier-targeting effects (e.g. Berserk) is NOT
  special-cased, and the rulebook's special AI-targeting rules for bank units
  are not implemented.
