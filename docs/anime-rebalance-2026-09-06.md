# Little Busters / Azur Lane balance reference

These are the requested changes on top of `main` at `eb50eb38`. Card IDs use
`specialty.<hero>.<level>`, with numeric levels `1`, `4`, and `6`.

**Instant** resolves once when played in a legal window. Attack/Defense instants
modify that attack only. **Ongoing** creates an effect with the expiry below.
An instant draw option can be used without a useful target for the card's other
effect. A required discard remains mandatory when using that draw option.

## Little Busters

| Hero / level | Timing and target | Actual effect and expiry |
| --- | --- | --- |
| Sasami I | Instant, your normal attack | +1 Attack. On a +1 die, push the surviving defender one space directly away. A successful push prevents retaliation. If blocked, deal 1 extra damage; a blocked push does not prevent retaliation. |
| Sasami IV | Ongoing, one friendly unit | +1 maximum HP for this combat; +2 for Softball Club, the silver trio. |
| Sasami VI | Instant, your normal attack | +2 Attack. Push on any die face; same blocked-push damage and retaliation rules as I. |
| Rin I | Summon during combat, or instant draw-only | Summon one Stray Cat beside an ally and draw 1. Alternatively draw 1 without summoning. The cat disappears after combat and grants no kill reward. |
| Rin IV | Summon during combat, or instant draw-only | Summon one Alley Cat beside an ally, draw 2, then discard 1. Draw-only still draws 2 and requires discarding 1. Same summon lifetime as I. |
| Rin VI | Instant, any unit | Deal 3 damage. Supports combat reaction windows, including before enemy activation, after movement, and before retaliation. |
| Riki I | Ongoing, one friendly unit | +1 Attack, plus +1 if at least one own army unit has fallen. Maximum total +2. Entire bonus expires at the end of the following combat round. Each new own army loss updates the count and refreshes that expiry, even after the bonus reaches its cap. |
| Riki IV | Ongoing, whole friendly team | +3 Initiative, plus +1 per fallen own army unit. Same complete-bonus expiry and refresh rule as I. |
| Riki VI | Instant, pending attack/spell hit | Choose a threatened friendly unit and another living unit, friend or foe. Prevent its entire remaining hit, then deal half the prevented amount, rounded up, to the second unit. Recipient immunities/reductions still apply. HP/death processing happens after prevention. Protection survives delayed area/chain target choices and belongs to that battle only. |
| Yuiko I | Instant, any unit | Deal 1 damage, with the same flexible combat windows as Rin VI. |
| Yuiko IV | Instant, map or combat | Gain 1 Morale and 2 gold. |
| Yuiko VI | Ongoing, one friendly ground unit | Add 1 attack damage per enemy orthogonally adjacent to the attacker. Recount each attack, including retaliation. This increases damage to the attacked unit; it does not damage surrounding units. Expires with combat. |
| Komari I | Ongoing shield, one friendly unit | Reduce its next damaging hit by 1, then consume the whole shield. Unspent shield lasts combat and heals 1 at that unit's activation start. |
| Komari IV | Ongoing shield, one friendly unit | Same rules, shield amount 2. |
| Komari VI | Ongoing shields | Shield amount 2 on the chosen friendly unit and one random other living friendly unit. Each shield heals/consumes independently. |

Riki's fallen count excludes summons, temporary units, clones, and commanders.
Example: play in round 1 → expires after round 2. Lose another army unit in
round 2 → the entire bonus instead expires after round 3.

## Azur Lane

| Hero / level | Timing and target | Actual effect |
| --- | --- | --- |
| Bismarck I | Instant, current attack | Choose +1 Attack for your attacker or +1 Defense for your attacked unit. Doubled to +2 for Prinz Eugen. |
| Bismarck IV | Unchanged instant | +1 Attack per other living ally adjacent to the attacked unit, capped at +2; attacker does not count itself. |
| Bismarck VI | Unchanged instant | Same adjacency rule, capped at +3, and suppresses retaliation. |
| Nagato I | Unchanged, current activation | One active non-ranged unit attacks as ranged, up to 2 spaces away. Ordinary ranged penalties apply. |
| Nagato IV | Unchanged, current activation | Same conversion, anywhere on the battlefield. |
| Nagato VI | Unchanged, current activation | Same as IV, plus 1 Attack. |
| Akashi I | Map discount OR instant draw | Bank a 3-gold discount on one recruitment or reinforcement, or draw 1 card. Unspent discount expires when a hero moves. |
| Akashi IV | Map discount OR instant draw | Same choice with a 4-gold discount. |
| Akashi VI | Instant | Heal a friendly unit 2 and draw 1, or draw 1 alone. |
| Sirius I / IV / VI | Instant, enemy normal attack | Choose another living ally adjacent to the attacked unit to take the hit instead, with +1 / +2 / +3 Defense. All levels deal 1 counterdamage after the attack. Not offered against retaliation or printed follow-up attacks. |

| Unit side | Changed values |
| --- | --- |
| Ayanami Pack | Takes 2 less damage from retaliation attacks, minimum 0. Retaliation still occurs. |
| Akagi Few | HP 7, Defense 1. |
| Akagi Pack | HP 9, Defense 1; cost 22 gold +3 valuables. |

## Art and animation

- Akagi Few: Ruby-Laced Beauty; Pack: Precipice of Sweetness.
- Ayanami Few: Lunar Demon; Pack: Dynasty Shipgirl, revised with a larger sword.
- All four illustrations were generated from the requested original skin art
  with complete backgrounds, then rebuilt into the playable cards.
- Full Barrage's real splash-hit event selects the new 16-frame generated impact
  animation. It shares the existing Full Barrage ability mapping.
- References, generation prompts, and source-master paths are recorded in
  `scripts/anime-art/azur-lane-rebalance-art.json`.

## Implementation and checks

Balance definitions: `src/data/cards/adventure.ts`, `src/data/anime/towns.ts`,
`src/data/units/abilities.ts`. Runtime resolution: `src/engine/reducer.ts`,
`events.ts`, `combat-units.ts`, and `legal-actions.ts`.

Outcome tests: `src/engine/anime-rebalance.test.ts`,
`little-busters-specialties.test.ts`, `azur-lane-hero-specialties.test.ts`, and
`src/data/anime/azur-lane-content.test.ts`. Reaction UI dispatch is covered in
`src/components/table/overlays.test.tsx`.

Thirteen temporary fault injections were detected by gameplay assertions:
Home Run Attack/shove; Riki fallen count/expiry/prevention/rounding/delayed
protection; Yuiko adjacent damage; Komari shield/healing; Ayanami retaliation
reduction; Sirius Defense/counterdamage. All injected faults were restored.

The protocol version is 108. Media was published; these source changes have not
been committed or deployed as a game release.

Final validation: TypeScript and the production build passed. The final two
test batches passed 501 tests across 14 files, including Blue Archive and FX
regressions. All 5,779 published media objects passed HTTP, size, and ETag checks.
