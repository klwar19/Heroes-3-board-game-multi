# Computer strategy lessons from ranked matches

Update: [Executable learning and planning](computer-learning-runtime-2026-09-05.md) documents the implemented runtime model, planning rules and current tests. It supersedes the original implementation-status statements below; the match observations remain the evidence record.

Evidence snapshot: 5 September 2026. Companion: `recorded-match-review-2026-09-05.md`. All 19 available player replays were inspected through their event histories; 13 test recordings are excluded. Older games without action records cannot teach tactical choices. This is a curriculum plus targeted heuristic improvements, not a trained model or proof of a higher human win rate.

## Evidence standard

A winner's action is not automatically good, a loser's action is not automatically bad, and an unchosen legal alternative has no observed outcome. Mark lessons as observed sequence, plausible hypothesis, or tested policy behavior. Match-result participant order is not sufficient to identify seats in recovered multiplayer games; the offline extractor keeps participants and seats separate. The two complete-start September 5 head-to-head records have consistent p1/p2 outcomes and factions.

Do not pool different factions, optional rules, maps, or engine versions as if they were the same position. Do not reward abandonment as tactical mastery. Do not count repeated decisions from one match as independent votes. Do not turn partial captures or state-hash gaps into complete openings. Legacy parallel battles without per-decision combat IDs are excluded from tactical labels when their histories overlap. Future captures now record combat IDs, own army/production/buildings/hero level, and the searching player's revealed cards.

## 1. Economy: earn for the next useful purchase

The next goal is a functioning army supported by income. Maintain separate gold, materials, and valuables deficits. A full purse does not buy a dwelling if its material input is missing. A completed dwelling without affordable recruitment is not the same as a stronger army.

Observed later HanzoVie–Absolution match (`5fcaqr`): Stronghold built Freelancer's Guild in round 1, then recorded 16 gold in guild bounties across the match. Two settlements were flagged in rounds 3 and 4, each increasing gold production by 5. Recorded resource-round gold receipts were 50 versus Necropolis's 40. Stronghold also received 16 gold from creature-bank rewards and 10 from first settlement flags. These are gross recorded receipts, not net profit, and must not be added to trades as new economic production.

Decision lesson: compare first-flag reward plus the remaining scheduled income opportunities against movement, expected casualties, and purchase delay. Do not assume income arrives every round; use scenario rules. Faction economy buildings can be worthwhile exceptions to saving everything for dwellings when the army can actually trigger their rewards.

Mistake candidate: selling needed valuables/materials to fund short-term recovery may postpone gold. Absolution sold two valuables and one material in round 6 before building gold in round 7. The log proves the trade sequence, not that selling was avoidable. A policy should ask whether another income route preserves the build reserve and whether survival requires selling now.

Implemented here: City Hall income choices consider actual development shortages. Search and discard recovery add a bounded preference for free resource effects that fill those shortages, with no bonus for surplus. Existing development-reserve, market, and trade-to-dwelling policies remain in place.

## 2. Army composition and progress through gold

Observed Stronghold development in `5fcaqr`:

| Round | Purchase/progress | Why it is useful evidence |
|---|---|---|
| 1 | Orcs; Freelancer's Guild | Early ranged support and a faction income route |
| 2 | Reinforce Orcs; recruit and reinforce Goblins | Upgrade damage plus affordable extra bodies |
| 3 | Silver dwelling; Thunderbirds | Converts development into a fighting unit in the same round |
| 5 | Gold dwelling; Cyclopes | Gold access immediately becomes an army contribution |
| 7 | Behemoths; reinforce Thunderbirds, Ogres, Goblins | Premium recruitment still accompanied by improvements to existing units |

Absolution built silver in round 3 and recruited Liches, but reached gold/Dread Knights in round 7. This is a useful faster-gold example, not a universally optimal build order. In the earlier `bti4so` game, Fortress won despite reaching silver in round 5 against Rampart's round 3. Fortress recruited Basilisks and Gorgons together, then obtained Phoenixes in round 7. Rampart also recruited foreign Dread Knights in round 7 without recording its own gold dwelling. Thus gold-grade access and gold-dwelling construction must be measured separately.

Decision lesson: reinforce the unit with the greatest marginal battlefield contribution, retain screens for ranged/caster pieces, and budget dwelling plus a useful recruit. Do not mechanically reinforce every bronze unit before silver. Keep the gold plan active after setbacks, but rebuild the minimum safe force if the route cannot be fought. Foreign/neutral offers can bridge an army gap; check reinforcement eligibility before treating them as a permanent development route.

Existing tested implementation: composition-aware core targets, silver/gold resource reserves, first gold recruit reserve, and affordable same-turn dwelling trades. No new universal round-5 deadline is imposed.

## 3. Expansion: movement must buy income, level, or a victory opportunity

Prefer routes that connect a safe clear with a mine/settlement and then another useful objective. Include the movement cost of returning after defeat, not only the outward path. A low-risk level increase can unlock later Quick Combat and save multiple future fights. Banks are income opportunities, but their XP behavior is rule-dependent; do not replace all hero development with bank farming.

Counterexamples to simplistic expansion rules: Absolution won `bi3xov` with gold in round 7 against REAPER's round 9; both reached level 3 by round 4, but Absolution later reached level 6 while REAPER's recorded level-ups stopped at 4. In `qzb56c`, both built gold in round 7, but REAPER reached level 7 and captured a Random Town in round 13. Equal dwelling timing does not mean equal readiness.

Lesson: compare level, army strength, expected route rewards, and the actual victory condition. Gold progress remains a goal, but development must eventually turn into pressure. Existing map-policy tests cover safe cleanup, premium economy, navigation, and engagement gates; the new curriculum does not claim those heuristics solve every map.

## 4. Search, discard recovery, and card use

Choose among the actual revealed cards for the present plan. Preserve card ID, selected mode, target, cost and relevant alternatives. An index such as 'pick 1' without the revealed list is not a card-selection lesson. Old search events often lack this mapping; future replay capture now includes it for the owning seat.

Observed `bti4so`, sequences 571–574: Torso of Legion supplies two materials, Mystic Orb of Mana searches the discard, then Torso supplies a valuable. Lesson: recover a resource card when it solves a purchase shortage; recover defense/damage instead when a battle is the urgent problem. Never recurse indefinitely through self-retrieval cards.

Implemented here: map search, discard-pick and own-deck-pick consider development deficits. Search scores remain strictly ordered above the old clipping threshold, so two expensive cards no longer tie solely because both exceeded 80. Combat searches keep existing card valuation and receive no map-resource bonus. This does not yet simulate every candidate card's future combat sequence.

Combat lesson: evaluate a card by the outcome it changes—lethal, survival, denied activation, useful movement, or resource conservation. Account for Power discards, crowns, spell limits, and recall value. Do not spend a premium damage spell as Power if a cheaper expendable card yields the same useful result, unless the alternative is unavailable.

Observed `5fcaqr`, sequences 451–454: HanzoVie attacked, played Bloodlust plus Magic Arrow as Power, then Knowledge. Expert Resistance cancelled Bloodlust, but the resolved attack still dealt lethal two damage. Lesson candidate: a cancellation that fails to change survival may be less valuable than another response or conserving the card. We have not proven Resistance was a mistake or evaluated every reaction counterfactual. Existing damage, lethal-save, boost-cost and reaction tests remain the validated baseline.

## 5. Formation and target selection

Deploy useful shooters/casters into protected cells and screens where they obstruct enemy access. Preserve a line of support; a single frontline unit several steps ahead is a focus-fire invitation. Flying enemies, ranged enemies and multi-head attackers alter what counts as protected. Do not cluster automatically against splash attacks, and do not assume adjacency alone stops flying or ranged pressure.

Choose targets by expected removed value and denied activations: finish a reachable dangerous enemy, coordinate allied attacks to finish a target, exploit spent retaliation, and avoid waking paralyzed enemies for inconsequential damage. Screens may accept a trade when it protects the damage core. A commander whose death ends the fight is not ordinary disposable chaff.

Existing formation/target tests cover screening, placement, tactics swaps, focus fire, retaliation and paralysis. New behavior extends the valuable-unit overextension check to neutral fights: decline a small nonlethal chip when retaliation plus remaining reachable enemy attacks project a lethal response. The check still permits lethal attacks and allied focus finishes. It uses public unit positions/activation flags and expected damage, not a human's hidden intention.

## 6. Human-controlled neutrals: expect deliberate focus fire

Treat human-controlled guards as coordinated opponents. Humans may bait an exposed unit, concentrate ranged damage, spend cheap bodies to remove a shooter, or defend and wait when permitted. The AI should choose a formation and attack order that remains useful under those responses, rather than assuming guards split their damage.

New regression scenario: a valuable ranged unit can chip a durable adjacent guard while a second neutral shooter can finish it. It now prefers Defend. Once the shooter has already acted, it attacks; if the chip becomes lethal, it attacks even while the shooter remains ready. This is a concrete flexible response, not blanket passivity against neutrals.

Limits: the current focus model estimates immediate ranged/adjacent follow-up attacks. It does not perform minimax search over every legal enemy move, spell or dice result. Existing mode restrictions also mean some computer-owned neutral fights are automatically controlled; this change does not change who controls guards. No opponent private hand or deck is consulted.

## 7. Learning from mistakes without learning the wrong lesson

Repeated retreat is a signal to inspect engagement estimates and replacement costs. In `bti4so`, Absolution retreated in rounds 4, 6 and 7; HanzoVie retreated in round 3 and recovered. In `5fcaqr`, Absolution retreated in round 6, lost the secondary encounter and main PvP fight, then gave up. Do not translate this to 'never retreat': Dra won `66n5am` after a round-1 retreat, and Absolution won the September 2 three-player game after early setbacks.

Maintain a mistake case as: visible position, chosen action, observed local outcome, alternative candidates, uncertain assumptions, and a reproducible test. A rejected attack should identify the projected lethal response. An economy mistake should identify the delayed useful purchase, not just low remaining gold. A formation mistake should identify the exposed unit and opponent replies.

The learning extractor now permanently neutralizes contradictory per-match votes, separates identified interleaved battles, excludes ambiguous legacy parallel combat labels, and does not call hash-gapped captures complete trajectories. This prevents false lessons; it does not turn correlation into causation.

## Validation and next promotion criteria

Use `scripts/analyze-ranked-lessons.mjs` on a private export to regenerate seat-level milestones, income sources, card plays and known search candidates. The script performs no network requests or writes to the production database. Local detailed evidence is in `tmp/ranked-audit-2026-09-05/learning-evidence.json`.

New policy changes must change actual selected actions in regression scenarios, retain controls where the opposite decision is correct, and preserve legal actions/nonnegative resources/progression in bounded games. Before claiming increased strength, run paired-seed baseline-versus-candidate matches with seat swaps across factions/maps and scripted aggressive neutral policies; report wins, abandonment separately, gold dwelling and first gold recruit rounds, losses, stalls and remaining army value. Those win-rate experiments and a full adversarial planner have not been completed here. No policy has been deployed by this task.

## Validation recorded for this change

- Broad computer/replay/runner regression pass: 28 files, 472 tests before the final neutral-focus adjustment.
- Final combat/formation regression pass: 53 tests, including the new coordinated-neutral scenario and aggressive controls.
- Final neutral-control and multi-round soak pass: 15 tests; the soak checks bounded progression, reconnect behavior and state invariants across seeds.
- Replay capture, learning and choice regression pass: 43 tests; two additional selection assertions subsequently checked in the focused pass.
- TypeScript check and targeted ESLint passed. Policy modifications are local and have not been deployed.
- Re-extracting with conservative integrity/battle rules leaves 3,377 candidate decisions, including 2,126 battle-labelled decisions. This is a filtered evidence export, not trained policy weights. The 12 coarse aggregate patterns are not promoted to runtime recommendations.
