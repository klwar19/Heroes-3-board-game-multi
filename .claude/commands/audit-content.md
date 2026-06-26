---
description: Effect-level audit of game content (units, spells, specialties, artifacts, abilities, buildings, banks, map tiles) — verifies behavior, not just wiring.
argument-hint: "[category or 'everything'] (default: everything)"
---

# /audit-content — audit what the engine actually DOES, not what it claims

You are auditing the Heroes 3 board-game engine for content that is **wrong or
decorative**, across **every** content category — not just spells. The target is
`$ARGUMENTS` (a single category, or `everything` / empty for a full sweep).

## Why this command exists (read first)

A previous audit reported everything "green" while Deemer's Meteor Shower and
Alamar's/Jeddite's Resurrection were silently broken: the card art shows a
**book = Power** table ("scales with spell power"), but the engine paid a fixed
**count** of discarded cards and ignored spell-power buffs entirely. The audit
missed it because it checked the **artifact** ("is it wired? is there a test?" —
both true) instead of the **effect** ("does the damage actually move when spell
power changes?"). Tests asserted the printed tier numbers, never the behavior,
and no test compared the specialty to its mechanical twin (the Frost Ring spell,
which *did* scale). **A passing data check is not coverage.**

Your job is to NOT repeat that. Audit the behavior.

## The bar for "verified" (per `CLAUDE.md` §1 and §1a)

A rule/ability/effect is **verified** only if BOTH hold:
1. the engine actually executes it, AND
2. a test fails if that logic is **wrong** (not merely absent).

When checking each item, apply all five habits — these are what catch the bugs an
"is it wired?" audit greenlights anyway:

1. **Assert the observable game outcome, not an intermediate value.** "token
   placed / amount X" is a data check; "defense 3→1", "damage rose by 2",
   "this option costs 1 fewer card under a +1 buff" is the real one.
2. **A surprising value is a lead, not noise.** Reconcile it before editing the
   expectation to match.
3. **Cross-check siblings that share a mechanic.** Two cards with the same printed
   table (e.g. every "Power 0/2/4 → 1/2/3" damage card, every Corrosion/Attack
   token source, every lethal-save) must encode it the same way. Divergence in
   sign / magnitude / code path / cost model is the smell. (This is exactly what
   would have caught Deemer vs. Frost Ring.)
4. **Audit the consumer, not just the producer.** Several producers can each look
   fine while the single shared reader they feed is broken and untested. Trace the
   value into the engine function that consumes it.
5. **Prefer an invariant over N one-offs.** e.g. "a card showing the book/Power
   table scales with the caster's total spell Power"; "a Corrosion token always
   lowers effective defense, never raises it." One invariant guards every producer.

Also verify the **negative space**: an effect that must NOT apply (a school buff on
a school-less specialty, an immunity, a tier gate) needs a test as explicit as the
positive one. Decorative text must be a conscious, registered entry, never a stub a
reader has to reverse-engineer.

## Categories and where they live

Audit each requested category (all of them for `everything`):

| Category | Data | Engine consumer(s) |
|---|---|---|
| Units & unit abilities | `src/data/factions/units.ts`, `src/data/units/abilities.ts` | `src/engine/unit-abilities.ts`, `reducer.ts` |
| Spells | `src/data/cards/spells.ts` | `reducer.ts` (`performSpellCast`, `getCurrentSpellPower`) |
| Hero specialties | `src/data/cards/adventure.ts` (`specialty.*`) | `reducer.ts` (`playCard`, reactions) |
| Hero abilities / permanents | `src/data/cards/abilities-extra.ts`, `permanents.ts` | `legal-actions.ts`, `permanents.ts` |
| Artifacts (incl. Orbs/Tomes) | `src/data/cards/artifacts.ts` | `reducer.ts`, `active-effects.ts` |
| Town buildings | `src/data/towns/*` | `reducer.ts`, `adventure-reducer.ts` |
| Creature banks | `src/data/map/creature-banks.ts` | `reducer.ts`, `neutral-ai.ts` |
| Map tiles / locations | `src/data/map/locations.ts` | `adventure-reducer.ts` |
| Pandora | `src/data/cards/pandora.ts` | `reducer.ts` |

## Procedure

For a full sweep, **fan out**: launch one auditor subagent per category (they are
independent), each returning a structured report, then synthesize. For a single
category, audit inline.

For each item in a category:
1. Read the printed truth: the card **art/`abilityText`/tags** AND the wiki
   (`https://en.homm3bg.wiki/...`). Do not infer mechanics from the TS alone — the
   TS may be the bug. When a card shows the **book = Power** table, it scales with
   spell power; when it shows a flat "discard N cards", it does not. Distinguish
   the two from the art, not the code.
2. Find the engine code that consumes it (the consumer, habit #4). Confirm it
   executes the printed effect — magnitude, sign, cost model, scaling, gating.
3. Find the test. Confirm it asserts the **outcome** (habit #1) and would fail if
   the behavior were wrong. If it only asserts printed/intermediate numbers, that
   item is **NOT verified** regardless of the green check.
4. Cross-check siblings (habit #3) and the negative space. Flag divergence.
5. For anything you claim is correct, **mutation-check it**: revert the engine
   logic (or neutralize the value) and confirm the relevant test goes red. If no
   test goes red, the behavior is untested — report it, don't bless it.

## Output

Report per category, **caveats first** (`CLAUDE.md` §4 — lead with what does NOT
work / is display-only; no ✓/"complete" for anything without a named, passing,
mutation-checked test). For each item, one of:

- **VERIFIED** — engine-executed + a test fails if the behavior is wrong (name the
  test; state the mutation you confirmed kills it).
- **SUSPECTED BUG** — printed effect ≠ engine behavior. Give the card art / wiki
  line, the engine line, and the divergence (the Deemer shape: art says "scales
  with Power", engine uses a fixed count).
- **WIRED BUT UNTESTED** — executes, but no test asserts the outcome (an "is-it-
  wired" green). Name the missing assertion.
- **DECORATIVE / NOT IMPLEMENTED** — `abilityText`/art describes an effect the
  engine does not run; must be a registered stub (`DISPLAY_ONLY_*`,
  `implementationStatus: "not-implemented"`), else it is an undeclared stub bug.

End with a prioritized fix list (suspected bugs first). Do not write "no decorative
features" or call the audit clean unless every item is VERIFIED with a
mutation-checked test.
