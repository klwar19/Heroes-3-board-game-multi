# General unit rank-up ideas — 32 proposals

Design proposals, not implemented or playtested. Prepared for the Heroes III board-game project on 2026-09-07. These are a menu: choose a few compatible rewards, not all of them. Numbers are conservative starting points, not a claim of proven balance.

Companion files: [89 creature signatures](unit-signature-ideas-2026-09-07.md) and [review of the original 48 ideas](ability-ideas-old-review-2026-09-07.md).

## Shared rules for this proposal set

- **R2 / R3 / R4** mean Veteran / Elite / Legend. A signature replaces a reward at that rank. It is not a free fifth reward. Keep the existing tier-independent reward budget; expensive creatures do not automatically get stronger rank abilities.
- **Own attack** excludes retaliation and automatically generated follow-up attacks unless an entry explicitly modifies a follow-up. An **attack sequence** includes the primary attack, retaliation, and existing follow-ups. Resolve after-sequence movement only after all of them finish and only if the moving unit survives.
- Once-per-round and once-per-combat limits belong to the army unit, not its current side or Stack layer. Flipping, losing a layer, rebirth, or reinforcement does not refresh them. New summons do not inherit spent resources or create fresh copies of a rank reward.
- A defeated **unit** is fully removed from combat. Losing a side or Stack layer is a different event. Healing only removes existing damage on the current surviving side; it never restores a side or layer.
- New tokens with the same name do not stack. A unit cannot receive more than one extra rank-ability movement reaction in one activation/attack sequence. Extra movement is not an activation, does not reset retaliation, and does not trigger another rank movement reward or a moved-before-attacking bonus outside its own activation.
- Every move needs a legal destination and follows normal movement restrictions unless explicitly stated. Swaps require both destinations to be legal. No moving walls, siege structures, or off-board units. Forced movement cannot be converted into collision damage unless an ability explicitly says so.
- New terrain markers expire at the start of their creator's next scheduled activation, even if it is skipped, unless another expiry is stated. They disappear if the creator is removed. One active terrain marker per creator; different new terrain markers cannot share a space. Existing terrain legality still applies.
- **Effect damage** is not an attack, ignores Defense, and triggers neither retaliation nor these proposals' attack rewards. It still respects applicable immunities and explicit effect-damage protection. A **ward** prevents the next 1 applicable damage, then expires; wards from this proposal set cannot stack on a recipient.
- **Living** excludes Undead, constructs/mechanical units, and elementals. Use an explicit eligibility tag when implementing, rather than matching names. An ability that requires a living target must advertise that restriction.
- Initiative changes apply when constructing the next round's order. No rank effect reactivates a unit that already acted. A skipped activation still advances expiry clocks.
- Immunity wins. A redirected or transferred effect is checked against its new recipient's eligibility; it is not a method for bypassing immunity. Costs cannot be reduced, redirected, refunded, or used to earn on-damage rewards. A damage cost cannot defeat a side or layer.
- Choices described as "before rolling" are made before any die, card, or reaction result for that attack is revealed. Reducing actual damage cannot reduce it below 0.

## Dice and commitment

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G01 | **Banked Fortune — R3** | Once per combat, before rolling an own attack, roll normally but store its natural single-die result and resolve that attack with a natural 0 instead. Before a later own attack, you may use the stored result instead of rolling. It expires at combat end. | Moves luck between turns rather than adding a reroll. Store only a die face, not buffs, advantage totals, or a complete attack value. |
| G02 | **Calculated Risk — R2** | Before the first own attack each round, predict the natural die result: −1, 0, or +1. A correct prediction gives a ward against retaliation from that attack; a wrong prediction does nothing. | A small wager without increasing damage. Resolve against one designated primary die before rerolls; no automatic-face abilities on the same rank path. |
| G03 | **Measured Strike — R2** | Before an own attack, choose to suppress all of that attack's die results and die-triggered abilities and use a 0 contribution instead. After the sequence, you may move 1 space if you dealt damage. Once per round. | Exchanges die effects and upside for positioning. Does not preserve low-roll draw or extra-shot triggers. |
| G04 | **Loaded Choice — R3** | Once per combat, before an own attack, offer the defender a choice: your primary die is a natural 0, or you roll it normally and gain a ward against this attack's retaliation. | The opponent chooses which risk to allow. No additional attack or guaranteed +1 face. |

## Time and attack order

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G05 | **Borrowed Moment — R4** | Once per combat, when an attack would deal at least 2 damage to this unit, postpone 1 of that damage until the end of its next scheduled activation. Pay that damage even if the activation is skipped; it cannot be prevented or healed before payment. | Buys a turn, not permanent healing. The postponed debt survives flips and rebirth and can defeat the unit. |
| G06 | **Declared Assault — R3** | At round start, name an enemy. This round's first own attack against it gains +1 Attack, but this unit may not attack anyone else this round. You may abandon the declaration by forfeiting the bonus and all attacks this activation. | Visible commitment gives the enemy time to move or screen. One attack receives the bonus. |
| G07 | **Exchange Orders — R4** | Once per combat, before the round order is built, swap this unit's place with one willing friendly unit in that order. Each still activates once and retains its actual Initiative for other effects. | Trades tempo between two pieces. No extra turns; does not grant a slow heavy hitter a free activation in addition to its usual one. |
| G08 | **Patient Threat — R3** | Once per combat, forgo attacking to watch one empty space within 2. Until your next scheduled activation, the first enemy voluntarily ending movement there takes 1 effect damage. The marker is visible. | A telegraphed trap the enemy can avoid. No full-strength overwatch attack and no forced-movement trigger. |

## Movement with a price

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G09 | **Spent Readiness — R2** | At the start of your own activation, if your normal retaliation is unspent, forfeit it for the rest of this round to gain +1 movement this activation. | Converts defense into mobility. Ineligible with unlimited retaliation or an ability that restores retaliation. |
| G10 | **Pressure Step — R3** | After an own attack deals damage, the defender may move 1 legal space directly away. If it declines or cannot, this unit may move 1 legal space after the sequence. Once per round. | Opponent controls which side repositions. It never cancels the retaliation already owed. |
| G11 | **Shared Passage — R2** | Once per round, during this unit's own movement, one adjacent ally may temporarily make room: pass through that ally's space without moving it. The unit must finish in an empty space. | Opens crowded formations without a swap or teleport. Still spends the full movement distance. |
| G12 | **Anchored Advance — R3** | Before moving, leave an Anchor marker on the starting space. After the attack sequence, you may return there by paying 1 damage, if the space remains legal and empty. Once per combat. | An expensive extraction that enemies can deny by occupying the anchor. No refresh from healing or side changes. |

## Space as a resource

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G13 | **Claim Ground — R2** | At round start, mark this unit's current space. If it is still there at round end and made no attacks that round, give one ally within 2 a ward until the next round ends. | A small positional objective; the unit sacrifices attacks and can be displaced. One ward, not an aura. |
| G14 | **Dust Screen — R3** | Once per combat, after moving, mark the vacated space with Smoke. A unit standing there gains +1 Defense against non-adjacent attacks, but its own non-adjacent attacks suffer −1 Attack. | Cover with a matching cost, available to either side. It is a space effect, not line-of-sight simulation. |
| G15 | **Narrow Passage — R3** | Once per combat, instead of attacking, place Rubble on an adjacent empty space. Ground movement into it costs 1 extra movement; crossing by flight ignores it. | Soft terrain control rather than another permanent obstacle. A unit may always leave rubble normally. |
| G16 | **Supply Cache — R3** | Once per combat, instead of attacking, place a Cache in an adjacent empty space. The first friendly unit ending its activation there consumes it to remove 1 damage. An enemy ending movement there destroys it. | A healing resource that requires travel and can be denied. The cache lasts until used/destroyed or combat ends, not the default terrain expiry. |

## Attack choices and target puzzles

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G17 | **Driving Blow — R3** | Before a melee attack, choose to reduce its final damage by 1. If it still deals damage, after the sequence push the target 1 space directly away. Once per round. | Purchases displacement with damage; no bonus damage on a blocked push. |
| G18 | **Disarming Cut — R3** | Before a melee attack, choose to reduce its final damage by 1. If it still deals damage, the target's next own primary attack before the end of next round suffers −1 Attack. Once per combat. | A soft offensive debuff instead of stun. Does not weaken retaliation and cannot stack with itself. |
| G19 | **Changing Rhythm — R3** | At the end of an own activation that damaged an enemy, record that enemy. Your first own attack next round gains +1 Attack only against a different enemy. Then clear the record whether used or not. | Rewards switching targets rather than focus fire. At most one bonus attack per round; unavailable in a duel. |
| G20 | **Armor or Blood — R3** | Before an own attack, choose normal resolution or Sunder: reduce final damage by 1; if at least 1 remains, remove one removable positive Defense modifier from the target after the sequence. Once per combat. | Makes buff removal a paid decision. Does not remove printed Defense, intrinsic abilities, or permanent rank stats. |

## Support without free extra armies

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G21 | **Passing the Guard — R2** | At activation start, transfer your actual Defense token to an adjacent ally without one. The ally keeps the original expiry. Once per round. | Moves existing protection instead of creating it. A virtual token from an intrinsic ability cannot be transferred. |
| G22 | **Relief Rotation — R3** | Instead of attacking, swap with an adjacent ally. If that ally has already activated this round, it gains a ward until round end. Once per combat. | Extracts a spent front-line unit at a full attack cost. No activation reset. |
| G23 | **Shared Burden — R4** | Once per combat at activation start, transfer one removable Weakness or Corrosion token from an adjacent ally to this unit, preserving magnitude and expiry. Both units must be eligible for the token. | Self-sacrificing cleansing, not deletion. An immune recipient cannot accept it. |
| G24 | **Field Instruction — R3** | After this unit Defends, choose an adjacent ally. Before its next own primary attack, that ally may suppress its primary die and resolve a 0 with no primary-die triggers. Expires after its next scheduled activation. Once per combat. | Gives reliability as an option rather than another flat buff. No draw, reroll, or low-roll combo from the substituted die. |

## Magic and adaptation

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G25 | **Residual Charge — R3** | The first enemy spell each combat that actually affects this unit leaves a Charge. At a later own activation, spend it for either +1 movement or a ward against spell damage, expiring at that activation's end. | Turns hostile magic into a later choice without negating the spell. Immunity does not earn a charge. |
| G26 | **Ward Migration — R3** | Once per combat at activation start, move one removable positive Defense spell effect from this unit to an eligible adjacent ally, preserving strength and expiry. | Relocates one existing buff without copying the spell. Both targets must be legal; nothing is recast. |
| G27 | **Broken Channel — R4** | Once per combat, after damaging an enemy, the next spell cast by its controller before your next scheduled activation cannot use that damaged unit as its origin or relay. It may otherwise be cast normally. | An experimental counter to a future origin/relay spell system, rather than a global spell tax. Do not include in the current default pool without that system. |
| G28 | **School Forecast — R3** | At round start, name Air, Earth, Fire, or Water. Prevent 1 damage from the first spell of that school damaging this unit that round, then clear the forecast. A wrong forecast gives nothing. | Predictive defense with visible counterplay. No stacking with another forecast; school must be a defined spell tag. |

## New resources and bargains

| ID | Ability / rank | Proposed rule | Why it is interesting; balance limit |
|---|---|---|---|
| G29 | **Scars of Battle — R3** | The first time each combat an enemy attack deals at least 2 damage to this unit and it survives, gain a Scar. Spend it before a later own attack to ignore 1 Defense for that attack, or after a later movement to move 1 extra space. | A single earned resource with two uses. Damage costs and friendly fire do not qualify. |
| G30 | **Merciful Opening — R3** | Before an own attack, offer the target a choice: its controller lets you remove 1 damage from an adjacent wounded ally, or the attack ignores 1 Defense. Once per combat; an eligible wounded ally must exist. | Opponent chooses which advantage you get. No healing beyond current-side maximum; not additional damage by default. |
| G31 | **Salvaged Momentum — R2** | If your own primary attack deals 0 damage after resolution, gain a Focus token. At your next own activation's start, spend it to add 1 movement that activation. Maximum one token; it expires after that next scheduled activation. | Failure creates a movement option, not an automatic second attack or card draw. Cannot generate and spend the token in the same activation. |
| G32 | **Battle Contract — R4** | At combat start choose a condition: damage two different enemy units, or survive attacks by two different enemies. When completed, gain one Seal. At an own activation, spend it to remove 1 damage or gain +1 movement. | A visible personal objective with one modest payout. No additional XP, permanent stats, or repeat farming. |

## What I would prototype first

**G01 Banked Fortune, G05 Borrowed Moment, G08 Patient Threat, G09 Spent Readiness, G16 Supply Cache, G17 Driving Blow, G21 Passing the Guard, and G30 Merciful Opening.** They explore different decisions: when to use luck, when to accept damage, where to threaten, what to sacrifice, and which advantage to allow an opponent.

Start with one unfamiliar subsystem in a match. For example, test dice banking before combining it with delayed damage, terrain, and new spell relays. Otherwise it becomes difficult to tell which mechanic is creating the interesting decision or the imbalance.

## Balance checks before adoption

Compare the proposed replacement against the actual current reward and printed Few/Pack abilities, not against a blank unit. In particular, the project already supplies unconditional attack bonuses, guard, defense piercing, card draw, regeneration, spell taxation, no retaliation, and repeated attacks through multiple sources.

Use short and long combats; Few and Pack; zero and multiple Stack layers; low- and high-Defense opponents; melee and ranged matchups; and mixed armies. Measure damage, damage prevented, cards gained, enemy movement denied, and extra attack opportunities created by movement. A one-space move can be worth much more than +1 Attack.

Watch three combinations especially: movement plus no retaliation; sustain plus damage caps or rebirth; and die substitution plus extra-attack/card-draw triggers. The proposal conventions intentionally close these loops, but the implementation must enforce them.

This is a design review of local definitions and rank schedules, not an engine behavior audit or a statistical balance test.
