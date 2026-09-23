# Factory specialty review — 2026-09-22

Code review only. No tests, battles, or simulations were executed. This is not a claim of runtime verification or deployment.

## Confirmed defects corrected

- Henrietta I/IV compared the unit name with `Halflings`, while the Factory roster calls the unit `Grenadiers`. Her doubled Attack/Defense and maximum-Health bonuses therefore missed the actual Factory unit.
- Sam IV compared with `Mechanics`, while the roster uses `Engineers`, losing his doubled maximum-Health bonus.
- The reaction tray added only printed base amounts, omitting specialty doubling. It now shares the resolution multiplier, including named units, unit types, and strict Initiative comparisons. AI stat-reaction valuation shares it too.
- Card text now uses the current roster names. Exact legacy names remain compatible with saved combats; the alias applies to the specialty's printed name only, so the neutral Halflings card never borrows Henrietta's Grenadiers doubling. Sam I explicitly says its multiplier applies to ground units, matching its existing type-based rule.

The user confirmed that other units already receive Henrietta's base +1. That eligibility and base amount were preserved.

## All 18 Factory specialties reviewed

| Hero | I | IV | VI |
| --- | --- | --- | --- |
| Henrietta (redesigned 2026-09-23 as the printed "Halflings" cards) | Start of Combat: +1 Defense to all your Halflings and Grenadiers units for the combat, and +1 combat-long Health to the neutral ones (`HALFLINGS_RALLY`, name-gated player effect). | Global: search the bronze Neutral deck and discard for a Halfling/Grenadier, recruit it free, then shuffle the deck (`NEUTRAL_DECK_UNIT_SEARCH`); or +2 Defense on the friendly unit being attacked. | Round-start option grants all friendly units Attack-roll advantage for the combat. |
| Sam | Attack or Defense reaction: +1, doubled for ground units. | Combat-long +1 maximum Health, doubled for Engineers. | +4 Defense on the friendly unit being attacked. |
| Tancred | Attack or Defense reaction: +1, doubled for ranged units. | Enemy mark adds 1 damage to ranged attacks against that unit this combat. | Bounty Hunters ignore non-adjacent targets' Defense for this round, or draw 2. |
| Celestine | +2 Defense on the friendly unit being attacked. | Combat-long +1 maximum Health, doubled for Armadillos. | Combat-long +4 Initiative, +1 movement and +1 Attack against slower units; numeric modifiers double for Armadillos. |
| Agar | All enemies suffer -2 Initiative for the combat. | Combat-long +1 maximum Health, doubled for Sandworms. | +1 Attack, doubled for Sandworms, with retaliation bypass on that attack; or draw 2. |
| Frederick | Combat-long +1 maximum Health, doubled for Automatons. | Friendly-unit teleport using the destination picker and relocation restrictions. | +2 Attack reaction, doubled for Automatons. |

Reviewed the card definitions and their legal-action/reaction branches, stat resolution, maximum-Health persistence, active-effect scopes/durations, round-start offer, movement calculation, teleport picker and retaliation flag. Human and multiplayer actions use the same engine legality/resolution; no transport-specific specialty implementation was added.

## Gold units, including both level-7 lines

- **Bounty Hunters:** Few/Pack both define +1 Attack against a Marked unit. The combat-start target choice writes the mark consumed by attack calculation. Neutral preemptive/ranged retaliation remains separate. Veteran Evasive Quarry uses the attacker-disadvantage mechanic.
- **Couatls:** Few protection is an optional first-round activation ending that activation; Pack protection is passive during round one. Attack and Spell targeting use the ward check; retaliation is allowed. Skycurrent heals after qualifying movement through both move and move-and-attack paths.
- **Juggernauts:** Few/Neutral allocation is 2/1/1 and Pack allocation is 3/2/1, through the sequential adjacent-unit picker. Allocation replaces attacking and offers Stop; it does not become a normal Attack or provoke retaliation. Counter-velocity reads live Initiative. Guarded supplies the Defense token and Defend healing through their existing consumers.

No additional confirmed behavioral defect was found in these gold-unit paths during this review. A stale splash-allocation code comment was corrected. Existing tests were read where useful but not executed and are not presented as proof.

## Wider specialty matching review

Inspected literal named-unit specialty conditions across the data sources and the shared name-matching consumers. Compound names, Dragons/Golems/Elementals family descriptors, and existing MGQ species matching retain their prior behavior. The removed Bin/Sabers legacy definition is not a current Factory specialty. This broader name review is not an exhaustive behavioral certification of every non-Factory hero.
