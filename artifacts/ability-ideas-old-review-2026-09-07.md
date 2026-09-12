# Review of the original 48 rank-up ideas

Design review, not an engine audit or a playtest result. Checked the pasted N01–N48 list against local `src/data/units/abilities.ts`, `src/data/units/experience-rank-abilities.ts`, unit definitions, and the generated `docs/unit-experience-balance-sheet.md` on 2026-09-07.

The exact N-series proposals have not been implemented by this work. Existing-definition matches below mean the catalog already contains the same effect or a close relative; they do not certify every interaction by execution. Shared timing and cost definitions for recommended rewrites are in [the general pool](ability-ideas-general-2026-09-07.md).

## What the current system changes about the evaluation

The existing R1 can already grant +1 Attack on own attacks, +1 Attack on retaliation, or +1 Defense when attacked. Consequently, a conditional +1 at R3 can be a weak reward unless it opens a new interaction or replaces a more generous modifier. Several R2–R4 pools also reuse regeneration, Defense piercing, no retaliation, spell taxation, or attack-die manipulation. They are useful baseline powers, but renaming them does not create novelty.

There are particularly strong existing effects to consider: Spell Sunder taxes spells from hand; Adversity's Insight draws on low own-attack dice; Regeneration heals at activation; Soul Feast heals after own attacks; Relentless Assault adds a second attack. The combination with a new reward can matter more than the new reward alone.

The resolver includes protection against some ineffective combinations, including a minimum die result that prevents a low-roll extra-attack trigger. It is not a substitute for checking all new token, movement, and healing interactions.

## All 48 proposals

| ID / original idea | Assessment | Recommended treatment |
|---|---|---|
| N01 Pack Tactics | Good simple general reward; formation play rather than a new subsystem. | R2. Own primary attack only; one other ally adjacent to the target. Do not also give unconditional Aggressive Drill at the same reward slot. |
| N02 Hold the Line | Useful but overlaps Guarded Stance, with potentially broader retaliation protection. | R2. Check at activation end; +1 Defense only against the next attack before its next scheduled activation. State whether retaliation counts. |
| N03 Blood Scent | Close to the existing damaged-non-adjacent targeting effect used by Imperium/Kivotos. | R2, own primary attack only. Never claim that it cannot improve the opening attack: a spell or another unit can wound the target first. |
| N04 Skirmisher | Good movement choice, but repeated ranged kiting may dominate slow melee. | R3. Resolve after the complete sequence; once per round. Do not combine freely with every extra-shot and retreat effect. |
| N05 Shield Breaker | Interesting token interaction; not the same as reducing printed Defense. | R2. Suppress the target's actual Defense token for this primary attack rather than permanently destroying it. An intrinsic virtual token needs an explicit rule. |
| N06 Bodyguard | Close relative of Masato's existing full-attack interception, although splitting damage is different. | R3. Redirect 1 already-calculated damage once per round; the bodyguard cannot reduce or redirect it. No bodyguard-to-bodyguard loop. |
| N07 Countercharge | Narrower than the existing unconditional Retaliation Drill. | R2 unless redesigned. Track the first voluntarily approaching enemy; clear the bonus at round end or when spent. No stacking with every retaliation from unlimited retaliation. |
| N08 Crippling Blow | Existing Freezing Shot already reduces Initiative after an attack. | Use as an R2/R3 weaker variant, not a new mechanic. Apply −1 to next round's order, not a promise of changing the already-resolved activation. |
| N09 Finishing Blow | Another damaged-target modifier; substantially overlaps N03. | Keep N03 or N09 in a given pool. Define half Health using current-side maximum Health; own primary attack only. R2. |
| N10 Tactical Withdrawal | Good defensive repositioning. | R3, once per round, after the full attack sequence. It must not interrupt a follow-up that was already owed before the retreat. |
| N11 Defensive Formation | A valid formation bonus, but can stack too efficiently with existing guard and high Defense. | R2. Protect against the first incoming attack each round only. Multiple copies do not add; define adjacency using existing combat rules. |
| N12 Unyielding | Straight damage reduction with a useful minimum. | R3. Once per round on attack damage only, minimum 1. Do not also grant N36 to the same unit. |
| N13 Pinning Shot | Dangerous repeated ranged rooting, especially with escape moves. Existing Bind supplies a related control effect. | R4, once per combat, after actual damage. Prefer a −1 movement penalty, minimum one normal step, rather than repeatedly forbidding movement. |
| N14 Sweeping Strike | Close to the existing Cerberi secondary-head damage. | A reasonable borrowed R3/R4 effect, not a new mechanic. One secondary enemy and once per round; evaluate its Defense-ignoring damage against low-Health units. |
| N15 Dive Attack | A more restrictive version of existing Charge. Prohibiting a return may be irrelevant for most fliers. | R2 as written. For novelty, trade damage for a landing effect or target displacement instead. Count actual traversed movement, not a teleport as two spaces. |
| N16 Feint | A strong starting idea: pay offense for safety. | R3. Choose before rolling; −1 Attack on the primary attack for no retaliation to that attack. No refund if damage is 0; do not award to units already ignoring retaliation. |
| N17 Intercept | The name promises protection but the rule only moves closer. | Keep as R3 reactive movement and rename it Reinforce the Flank, or explicitly design attack redirection. Resolve after enemy movement; one step must reduce distance and cannot chain. |
| N18 Vengeful Bond | Good emotional theme; permanent death-triggered growth also exists in the catalog. | R2/R3. Trigger on full removal of another friendly non-summoned unit, not a layer. Store one bonus to the next own primary attack, expiring at next round's end. |
| N19 Rallying Kill | Close to existing layer-kill draw, with healing instead of a card. | R4, once per round. Heal one existing damage only; no side restoration. Be explicit that multiple killed layers in one attack still give one payout. |
| N20 Disrupting Presence | New-token denial is interesting but may be ineffective against virtual Defense tokens. | R3. State it blocks placing actual tokens only, with a one-round duration if triggered. It should not silently disable permanent Guarded. |
| N21 Predatory Advance | Good uncomplicated positional reward. | R2/R3. Trigger only on complete unit removal, and resolve after the sequence. Losing a Stack layer does not vacate the space. |
| N22 Staggering Impact | Knockback is already represented by Ghost Dragon effects. Guaranteed post-sequence push is a useful variant. | R3/R4. Pay −1 actual attack damage as in G17, once per round; no damage for failed displacement. This keeps positioning from being free. |
| N23 Shared Momentum | Same-round Initiative may be worthless if the ally already acted or order is fixed. | R2/R3. Grant +1 Initiative for the next round, selected after movement; one ally only and no stacking. |
| N24 Rearguard | Sensible anti-charge identity but still a conditional Defense modifier. | R2. First incoming primary attack each round by a unit that voluntarily moved in its activation. Specify that teleports and forced movement do not qualify. |
| N25 Spell Absorption | Reducing 2 damage and healing 1 can swing Health by 3. It also needs ordering to avoid healing a defeated unit. | R4, once per combat. Choose either prevent up to 2 spell damage or heal 1 after surviving the spell; do not automatically grant both. |
| N26 Arcane Feedback | Close to Pegasi Magic Damper, which already reduces enemy spell Power. | R2/R3 limited variant. Reduce the first enemy spell's Power each round by 1, minimum 0; use the caster/controller terminology of this game. Not a novel system. |
| N27 Elemental Attunement | Reasonable reactive bonus, but friendly fire could farm it. | R2/R3. Only actual damage from an enemy spell; +1 on the next own primary attack before next round ends. Maximum one charge. |
| N28 Mana Fracture | Existing Mystic Toll and Spell Sunder already impose spell/card taxes. Extra matching-statistic cost can completely prevent casting. | R4, once per combat. Prefer a payable one-card tax with explicit expiry and a global cap on overlapping taxes. "Matching statistic" is too vague to ship. |
| N29 Purifying Surge | Close to the existing Yeti activation recovery. Activation timing may be too late to save a skipped activation. | R3, once per combat. Limit to removable Weakness, Corrosion, or a specified ongoing debuff. If it can cancel Paralysis, resolve before the skip check explicitly. |
| N30 Conduit | Copying an unrestricted friendly spell is the largest abuse risk in the list. | Redesign. Transfer an existing limited buff, or redirect 1 spell damage as U18. Do not clone resurrection, invulnerability, summons, or arbitrary area effects. |
| N31 Grave Momentum | A death-triggered Initiative boost can fail late in a round and reward sacrifice loops. | R2/R3. Full removal of a non-summoned unit grants +1 Initiative next round, once per round. No layer triggers. |
| N32 Death Ward | A clean one-use defense, related to existing paralysis immunity. | R2/R3. Explicitly cancel the first eligible application per combat. If the unit already ignores both named effects, this is a dead reward. |
| N33 Life Drain Aura | Recurring healing can trigger on poison, friendly fire, splash, or many tiny damage events. | R4. Once per round after another friendly unit's primary attack damages an adjacent living enemy. Heal 1 existing damage; effect damage does not trigger it. |
| N34 Withering Touch | Good anti-healing concept, though niche against many armies. | R3. Replace the next healing event with one less healing, then consume the effect; do not prohibit all healing across repeated attacks. |
| N35 Restless Dead | A death reward that may expire before the chosen ally acts. | R3. Full removal only; chosen surviving Undead gets +1 Attack on its next primary attack and +1 Initiative next round. No summons or layers. |
| N36 Reinforced Plating | Nearly duplicates N12. Without a minimum it can erase every 1-damage hit selected by its trigger. | Merge with N12 or use a clearly one-use physical ward. Do not keep two near-identical defenses in a unit's rank path. |
| N37 Overclock | The most obvious timing error: Initiative gained at activation cannot make that activation happen earlier. | R3. Pay 1 damage at round start for +2 Initiative that round and +1 movement in its own activation. Cost cannot defeat a side, trigger on-damage abilities, or be reduced. |
| N38 Stabilizers | A clean new counter, but a worthless reward when forced movement is absent. | R2. Prefer optional resistance to the first forced move each round, so beneficial allied repositioning remains possible. Assign only where displacement occurs. |
| N39 Reactive Armor | Primarily counters repeated attacks by the same attacker; otherwise may do nothing. | R2/R3, not automatically R4. After first damage, +1 Defense against that attacker's remaining attacks this round. Do not carry it into subsequent rounds. |
| N40 Detonation Core | An existing neutral Automaton definition already deals 1 adjacent damage on removal. | Reuse as a borrowed ability if desired; it is not new. Full unit removal only, and no reward on every lost layer. |
| N41 Commanding Presence | Solid support but close to existing adjacent Initiative auras. | R3. Choose before next round's order is constructed. One ally and +1 only; no aura stacking across multiple commanders. |
| N42 Perfect Positioning | One of the better positional ideas, though broader allied teleportation already exists. | R3/R4, once per combat. Choose a precise window: start of own activation, before movement. Both units must legally occupy the other's space; no reactivation. |
| N43 Second Wind | Useful paid recovery, related to regeneration and cleansing. | R3/R4. Forgo every attack and activated offensive ability that activation; heal 2 or heal 1 plus remove one removable Weakness. Cannot restore layers. |
| N44 Duelist | The condition is contradictory if each combatant counts as adjacent to the other. | R3. "Neither combatant is adjacent to any third unit." Apply +1 Attack to the primary attack and +1 Defense only to its retaliation exchange. |
| N45 Indomitable Advance | Overlaps existing flying movement and teleportation. | R3 ground-only utility. Cross one enemy at normal movement cost; end empty and legal. No attacks on the crossed enemy in that activation. |
| N46 Last Survivor | Dramatic but can reward intentionally fielding one large stack or sacrificing cheap allies. | R4. Must start combat with at least three non-summoned friendly units and become the last through enemy-caused removals. Prefer one temporary benefit, not permanent +1 to three stats. |
| N47 Coordinated Assault | Good support but overlaps N17/N23 movement coordination and current transport effects. | R3, once per round, after the full primary attack sequence. One adjacent ally moves 1; no extra activation and no movement-reaction chain. |
| N48 Adaptation | An unrestricted new choice after every attack adds bookkeeping and may stack badly with temporary stat effects. | R3/R4. Once per round choose a ward against the next attack or +1 movement next activation. Use a clear token, and do not grant current-round Initiative after activation. |

## My recommended selections from the old list

**Keep and refine:** N01 Pack Tactics, N04 Skirmisher, N06 Bodyguard, N10 Tactical Withdrawal, N16 Feint, N19 Rallying Kill, N21 Predatory Advance, N34 Withering Touch, N37 Overclock, N42 Perfect Positioning, N47 Coordinated Assault.

**Merge or openly label as borrowed variants:** N03/N09; N08 with Freezing Shot; N12/N36; N14 with Cerberi splash; N15 with Charge; N26 with Magic Damper; N28 with existing spell taxes; N29 with recovery; N40 with Detonate.

**Redesign before using:** N13 unrestricted repeat pinning, N25 prevention plus healing, N30 arbitrary spell copying, N33 broadly triggered drain, and N46 unrestricted last-survivor stat stacking.

## Recommended structure for future rank changes

Keep R1 small and readable. Use R2 for one modest tactic, R3 for a meaningful choice or creature signature, and R4 for a limited capstone. Not every creature needs its signature at R4. A Bronze unit can receive an excellent tactical identity early without receiving a Gold unit's raw damage output.

Use [the 32 general proposals](ability-ideas-general-2026-09-07.md) to replace repetitive rank fillers and [the 89 creature proposals](unit-signature-ideas-2026-09-07.md) to reserve a distinctive interaction for each creature. Review complete four-rank paths together with printed abilities before implementation.
