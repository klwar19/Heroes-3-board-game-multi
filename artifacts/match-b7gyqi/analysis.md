# AI learning analysis: four-player ranked match room-b7gyqi

Based on the recovered production replay for match `room-room-b7gyqi-9b8c7c7d-257e-45af-b01d-26cf482fd361`. Evidence references below use replay entry sequence numbers, not UI turns. This is analysis of recorded actions and events; no battles were simulated, no alternative moves were executed, and no model was trained.

## Recording and outcome

The replay starts at round 1 (`captureStart: adventure-start`), covers rounds 1–13 and contains 2,019 entries / 4,802,993 bytes. Its truncation flag is false; no entry reports truncated legal alternatives. The compressed replay originally could not upload because production lacked `payload_gzip_base64`. The missing column and associated payload constraint were repaired; the existing retry subsequently uploaded the replay. A local copy is in `replay.json`, with extracted evidence in `evidence.json`.

This is not a verified continuous reconstruction: 12 adjacent state-hash pairs disagree, and 362 entries have an event battle ID differing from their learning-context battle ID. Several hash gaps follow room joins, but the cause of every gap has not been established. Parallel-combat learning summaries must not be treated as authoritative for the actor's actual fight. Use explicit event combat IDs and preserve uncertainty when they are absent. The recorded round-13 PvP segment has no adjacent hash gap and consistently identifies its battle as `combat_5617`.

The official result credits Peasant with the win, VuHy with a loss, and Dra and HanzoVie with abandonment. In the replay, p1 is Rampart/Gelu, p2 Conflux/Ciele, p3 Castle/Catherine, and p4 Stronghold/Yog. Castle was removed by an AFK vote in round 10 (#1412–1414). Stronghold beat Conflux in the only PvP battle in round 13 (#2015). Conflux then gave up (#2018), and Stronghold was removed by an AFK vote (#2019), leaving Rampart as the match winner. Do not label Stronghold's battle-winning strategy as a failure because of that administrative outcome. Do not use AFK removal as a strategic action to imitate.

## Round-by-round development

| Round | Recorded development | Candidate lesson |
|---|---|---|
| 1 | All four seats reinforced their openings and won their first neutral fight. Stronghold built Freelancer's Guild, recruited/reinforced Wolf Raiders and added Goblins. Rampart added packed Dwarves and Centaurs to its Elves. Castle added packed Marksmen and Halberdiers to Griffins. Conflux added packed Sprites and Garden of Life. Rampart retreated from a second neutral fight. | Build an army with complementary jobs before expanding; a first victory does not guarantee readiness for another fight. |
| 2 | Rampart returned to its failed mine fight and won; Rampart and Conflux flagged material mines. Stronghold also flagged a material mine and revealed a new tile. | Value routes that unlock future building resources; reassess a rematch using the current hand and battle state. |
| 3 | Rampart built City Hall. Stronghold built its silver dwelling and recruited Thunderbirds. Conflux, Castle and Stronghold all retreated from neutral fights. | An upgrade is not a sufficient fight-readiness test; evaluate the actual opposing army and available cards. |
| 4 | Those three seats recovered with neutral wins; Stronghold cleared a Dwarven Treasury. Rampart won a difficulty-3 fight and flagged a gold mine. | Compare recovery cost and subsequent rewards, not only a binary retreat label. |
| 5 | Rampart, Conflux and Castle built silver dwellings; Stronghold already had its silver tier and added Thunderbirds/Ogres. Stronghold won its earlier failed difficulty-3 field. | Early economic advantages matter when they become earlier useful troops. |
| 6 | Castle hired a second hero. Rampart cleared a Shipwreck; Stronghold cleared another difficulty-3 field and flagged a settlement. | Separate the scouting/collection job from the main army's combat route when the investment pays back. |
| 7 | Stronghold built its gold dwelling and recruited Behemoths. Conflux, Castle and Stronghold won creature-bank fights. | Recognize a gold-tier power spike and choose profitable objectives it unlocks. |
| 8 | Conflux hired a second hero and built its gold dwelling. Stronghold added Cyclopes, won two neutral fights, revealed the central tile and built Hall of Valhalla. | Develop army, map access and supporting buildings together. |
| 9 | Rampart recruited Gold Dragons and Unicorns; Conflux recruited Phoenixes. Stronghold reinforced Behemoths/Thunderbirds and won a difficulty-5 fight. Castle retreated from a Shipwreck. | Compare actual fight returns with upgrade cost; retain successful neutral examples from players who do not win the match. |
| 10 | Castle was AFK-removed. Rampart retreated from a size-IV Griffin Conservatory. | AFK outcomes censor strategy evidence; a late-game army can still fail a specific bank. |
| 11 | Conflux cleared Dragon Utopia. Stronghold cleared difficulty 6 and reached hero level 6. Rampart built Saplings, hired a second hero and reached level 5. | Compare objectives and specialization; do not assume the same development schedule fits each faction. |
| 12 | Conflux won a size-III Griffin Conservatory. Stronghold won difficulty 7, captured the Random Town and reached level 7. Rampart returned to its size-IV Conservatory after upgrades and won. | Match bank size to readiness; terrain/town control is part of preparation for PvP. |
| 13 | Conflux attacked Stronghold at the captured town. Stronghold reinforced before accepting combat and won the siege in combat round 3. Administrative removals then gave Rampart the match win. | Evaluate the defender's final army, fortifications and card timing, separately from the final ranking. |

## Economy: teach spending plans, not gold hoarding

Stronghold gives the clearest combat-linked economic example. The round-1 Guild cost two materials (#15). Recorded Guild bounties later total 26 gold, and four Estates plays generated another 16 gold. Its silver dwelling arrived in round 3, gold dwelling and Behemoths in round 7. In round 13 it used the Guild to pay seven materials alongside seven gold for a Thunderbird reinforcement (#1871). This shows both recurring combat income and resource flexibility contributing to an army plan; it does not prove every faction should follow this opening.

Rampart offers a different economic lesson. City Hall cost 10 gold and six materials in round 3 (#287), and subsequent events explicitly credit 35 gold to City Hall. That is a realized gross gold return, not a complete return-on-investment calculation: materials, timing and alternative spending also matter. Rampart's later Gold Dragons and Unicorns arrived in round 9. The useful policy feature is the remaining income horizon and the next purchase the building enables.

Conflux received 62 gold explicitly from creature-bank rewards and won ten resolved neutral battles, including Dragon Utopia. Its later PvP loss does not erase those successful economic decisions. Castle's last recorded actor context had 54 gold and only the silver dwelling: unspent resources suggest a question about conversion timing, but AFK interruption prevents a fair claim that saving caused its result.

At PvP preparation Stronghold spent 13 gold recruiting Cyclopes, 17 gold plus one valuable reinforcing them, then seven gold/seven materials reinforcing Thunderbirds (#1868–1871). An attacking AI must account for legal preparation purchases rather than freezing its opponent's strength at the moment it moves onto the field.

## Exploration and map opening

Early material access was common: Castle flagged its material mine in round 1, the other three in round 2. Resource production should be evaluated through the next dwelling/building threshold, not only the immediate pickup. By round 6 all four had flagged a settlement.

Do not confuse `DISCOVER_TILE` clicks with successful revelations: some entries have no reveal event. The replay contains 13 `TILE_REVEALED` events and 16 `FIELD_FLAGGED` events. Castle issued the most discovery actions (four) but was AFK-removed, so exploration count alone is not a quality score.

Stronghold's late route is particularly useful: difficulty 4 in round 8, difficulty 5 in round 9, difficulty 6 in round 11, then difficulty 7 and Random Town in round 12. The town subsequently provided the defensive setting for its round-13 win. Conflux also captured Stronghold's earlier gold mine in round 12 and Castle's mine in round 13. Teach both the value of gaining territory and the cost of leaving income exposed. Optimal-route or movement-efficiency claims require a reliable reconstruction of available paths and fog information, which this event review does not establish.

## Neutral fights and recovery

The 40 recorded combat endings comprise 39 neutral fights and one PvP fight; creature-bank start events are additional descriptions of the same neutral fights, not extra battles. Neutral results: Rampart 6 wins/2 retreats; Conflux 10/1; Castle 6/2; Stronghold 11/1. Nine quick-combat wins are recorded separately and should not be confused with these tactical combat endings.

The best within-player comparison is Rampart's size-IV Griffin Conservatory at the same field: retreat in round 10 (#1446–1485), win in round 12 (#1810–1854). In between, the recorded development changed from few to packed Gold Dragons and Dendroids, with hero level rising from 4 to 5. These changes are plausible contributors, not proof of a single cause; cards, rolls and deployments also differ. The failed attempt ended with a surviving enemy despite a favorable displayed aggregate-health comparison, illustrating why total HP alone is not a sufficient success estimator.

Train readiness using enemy composition, stack size, attack opportunities, remaining battle duration, cards and persistent troop cost. Preserve retreats as decisions requiring context rather than universally punishing them. Use the event combat ID to group overlapping battles; never infer a battle from the adjacent player's summary.

## Formation and the PvP battle

Use final deployment states, not every placement click as a separate strategy example. Conflux repositioned the same five units repeatedly before confirming. Its final positions were Phoenixes 12, Ice Elementals 16, Energy Elementals 18, Magic Elementals 19 and Magma Elementals 17. Stronghold finished with Orcs 2, Cyclopes 3, Ogres 5, Thunderbirds 6 and Behemoths 7. Fortifications were placed at walls 8–10 and gate 11. These are board position IDs, not a universally recommended formation.

The battle began with five living army units per side; recorded health summaries were Conflux 30 and Stronghold 36 (#1926). The gate and walls demanded actions from Conflux while Stronghold's tower contributed attacks. Conflux's Phoenixes first destroyed the gate, took Thunderbird damage, then teleported from position 15 to 1 (#1926–1939). The tower, Cyclopes, Orcs and Ogres subsequently attacked them; Thunderbirds finished them in combat round 2. This is evidence for evaluating the danger of an isolated insertion and follow-up support, not proof that Teleport itself is bad.

Stronghold preserved all five deployed army units through victory, with 21 remaining health in the final battle context (#2016); some units had flipped from pack to few. Its tower dealt five recorded damage, and Behemoths dealt 22 assigned damage across two strikes, including overkill. Do not equate assigned damage with enemy HP removed.

## Cards, abilities and target selection

The decisive sequence is #1950–1954: Behemoths attacked packed Magic Elementals; Stronghold added Hall of Valhalla, expert Offense and expert Attack. The recorded result was 14 damage, flipping and removing Magic Elementals in the same resolution. Learn to spend cards when they cross a meaningful removal threshold and deny future activations. This observed roll was +1; the record alone does not establish that the full card package was always necessary.

Conflux's own examples are more nuanced. Teleport repositioned its Phoenixes but was followed by concentrated enemy attacks. Two Magic Arrows targeted Behemoths (#1961–1969), dealing three damage each; the second used Necklace of Dragonteeth and resolved at higher power without increasing recorded damage. That is a reason to evaluate the actual marginal effect of a boost, not automatically spend +Power. A separate rule evaluation would be needed to attribute the equal damage to a particular cap or modifier.

Stronghold used First Aid Tent to heal Behemoths and Thunderbirds during the PvP battle (#1960, #2009). The late heal was one HP; do not overstate it as the reason for victory. Ogres placed a +2 attack Bloodlust token on Thunderbirds (#2011), which delivered the final seven-damage strike (#2015). Sequence support effects before the ally's useful activation, with explicit target and timing features.

Deck searches can connect acquisition to later use: Conflux selected Skull Helmet in round 8 and used it in PvP; Necklace of Dragonteeth was selected in round 11 and used as a spell reaction. Stronghold selected Archery over Scholar in round 9 and Precision over View Earth in round 12. These are examples for contextual evaluation, not evidence that the unchosen cards were wrong. Some parallel search entries lack revealed-card context, so their alternatives cannot be confidently labelled from the action index alone.

## What to teach first

1. Predict pre-fight strength after legal purchases, including defender preparation and fortifications.
2. Learn card/ability combinations around removal thresholds and activation denial.
3. Evaluate exploration by the resource, upgrade and objective it unlocks.
4. Compare neutral fights locally, including failed attempts followed by recovery.
5. Score final formations using reach, exposure, protection and supporting units; collapse repeated repositioning clicks.
6. Separate tactical wins from match wins, AFK removals and surrender.

No learned policy weights were trained from this match. The current automatic training script excludes matches containing an abandonment result, so this match will be skipped as written. Its useful tactical segments should be curated only after repairing or excluding mismatched parallel contexts and resolving the continuity limitations. One match provides concrete examples and hypotheses, not statistically established universal preferences. The follow-up below records hand-authored decision-policy changes, not statistical training.

## Stronghold versus the VII Random Town

Round 12, entries #1696–1800: Stronghold deployed five army units with 36 combined current-bar health against five Fortress guards with 29: Dragon Flies, Basilisks, Gorgons, Wyverns and Hydras. These health sums do not include every subsequent Pack-to-Few life bar. The siege also had fortifications and an Arrow Tower.

- Round 1: Thunderbirds defended after moving; Behemoths advanced; Ogres broke a wall. First Aid Tent entered play (#1716) and healed Cyclopes (#1726). The opening spent activations gaining access rather than immediately killing the entire guard army.
- Round 2: Thunderbirds killed Dragon Flies. Wyverns poisoned Thunderbirds. Behemoths reduced Gorgon defense and eventually killed them (#1758). Yog's defensive specialty protected Cyclopes; Tent healed them again. Expert Archery and Precision supported the ranged attack. Ogres placed Bloodlust on Behemoths. Armor cards were committed in a defense window.
- Round 3: Poison flipped Thunderbirds. Tent healed Cyclopes a third time; Wyverns died. Behemoths killed Hydras. Cyclopes and Basilisks both flipped later in the round.
- Round 4: Poison continued. Tent healed Behemoths. Cyclopes died (#1797); Behemoths killed the last Basilisks (#1799). The town capture raised Yog to level 7 (#1800). Four surviving army units had 13 combined current-bar health.

This was a successful but attritional assault, not a clean demonstration that any army containing gold creatures can clear VII. The useful lessons are to deploy a complete force, protect ranged units across multiple rounds, account for poison and defense-reducing threats, distinguish a flip from removal, and prepare to replace losses. In round 13, Stronghold recruited and reinforced replacement Cyclopes and reinforced Thunderbirds before accepting Conflux's attack (#1868–1872). That recovery is part of the PvP preparation, not part of the preceding town fight's starting strength.

The authoritative engine gives Random Town its VII difficulty and disallows paid movement-point continuations there. Reserving an extra movement point cannot solve this particular battle. Ordinary limited-duration guards do benefit from budgeting entry plus a continuation; banks and unlimited encounters do not use that budget.

## Implemented policy follow-up

Local AI decision code now:

- Estimates PvP and bank readiness using only the strongest units that fit the configured deployment limit, and prioritizes legal deployment of those units. Unused cards no longer inflate that battle estimate. Publicly fortified towns/holdings add an assault-risk margin.
- Accepts reversible deployment and Tactics rearrangements only when the whole formation improves; completes deployment rather than sacrificing a slot solely because its remaining position is awkward.
- Remembers recent failed neutral fields and temporarily rejects an unchanged rematch. Army, hand or hero-level changes can justify reassessment; gold alone cannot. This is a bounded cooldown, not a permanent ban on retreat-and-recover play.
- Retains route history across other simultaneous seats ending turns, records the actual destination of path movement, and stops treating another seat's ordinary field captures as this seat's progress.
- Adds resource-deficit value to mines and an early-economy bonus to settlement objectives. Existing expansion/path legality remains authoritative; these priorities do not reveal fog or create new paths.
- Budgets one optional paid continuation for ordinary guarded arrivals, while exempting banks, bank-style outposts, teleport objects, unlimited fights and Random Town. Mandatory shared-field departures are not delayed by this budget.
- Applies the active Polish/classic Quick Combat distinction when deciding whether a guard is genuinely an automatic win, and does not classify custom or bank-style guards as free wins merely from hero level.
- Distinguishes Pack/Few removal durability from the current health bar in lethal estimates and card conservation. Bank-token removals remain conservatively unknown rather than falsely guaranteed.
- Evaluates single-target spell Power boosts through the engine's actual power calculation, including public modifiers, and conserves boosts that cannot improve the modeled spell. Unmodeled splash/chain effects retain their existing heuristic. Healing measures actual damage on the current bar, not unused future stack health.

These are heuristic improvements, not guarantees against every poor move. In particular, full ability-aware neutral outcome prediction, defender purchases not yet made, and multi-card plans spanning several Power breakpoints remain limitations. Verification: `npm run typecheck` completed successfully (exit 0), and scoped `git diff --check` reported no whitespace errors. No tests, battles, map simulations or training runs were executed. This follow-up has not been deployed or committed by this implementation pass.
