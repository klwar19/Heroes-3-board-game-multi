# Game modes & content build — status

Mirror of the build request. ✅ = implemented **and wired** (engine + UI + tests where it matters). Authoritative detail lives in `content-tracker.md`.

## Modes
- [x] `ruleset` option (`legacy` | `binh`) chosen in the lobby (BINH default), threaded through state/engine/PartyKit, shown in the HUD; old snapshots load as Legacy
- [x] Legacy = community rulebook behavior; BINH = house rules below

## House rules (BINH only)
- [x] Wisdom: basic −2 gold + Search (3); expert −3 gold + Search (4) (legacy expert keeps the printed −2)
- [x] Estates: 2 gold basic / 4 expert (legacy printed 3/6)
- [x] Griffins Few 3 attack · Griffins Pack 1 defense · Marksmen Pack 3 HP (army panel shows live values)
- [x] Cerberi Pack/Neutral: full separate attack (attack 3) vs every other adjacent enemy, instants/defense apply, no retaliation, engine-tested
- [x] Split spell decks with the level-4 + open-Ⅳ–Ⅴ gate and the Eagle Eye / Wisdom / Basic elemental Magic bypass (tested)
- [x] Split artifact decks Minor/Major/Relic with position or level+Blacksmith unlocks; deck pick offered on every artifact/spell gain (tested)
- [x] BINH deck extras: Fortune, Eagle Eye, Scouting, Basic Air/Earth/Fire/Water Magic, extra artifacts

## Rules-correctness fixes (both modes)
- [x] Second negative morale token → neutral + hand discard at turn end (tested)
- [x] Mage Guild verified: build → Search (2) twice; token locked the build round; 6g Castle / 5g others per purchase
- [x] Activation spells cast during your own unit's activation (the "Magic Arrow can't be cast" report)
- [x] Buff/debuff spells (Bloodlust, Stone Skin, Curse, Weakness, Bless, Precision) played INTO attacks, Power-scaled, spell-limit-counted (tested end to end)
- [x] Every spell discardable for the printed "+1 Power"; Empower stacks (rulebook)
- [x] Ongoing cards last until the owner's next turn starts
- [x] Offense/Armorer printed draw; Scholar basic = take a discard card; Magic Arrow base power 0

## Map-usable abilities
- [x] Wisdom (purchase) · Estates · Luck · Logistics (end-turn step + expert +1 MP) · Scouting (next Search 3/5) · Mysticism (recall; expert recalls support cards) · Eagle Eye (dig Basic/Expert spell) · Basic X Magic (school fetch in searches; expert +3 school Power) · Scholar · Leadership · Sorcery · Armorer/Offense map draw
- [x] Adventure hand play menu (cards with legal plays glow; cost picker for discard prices)

## Content
- [x] Full implemented spell set incl. Fireball (second adjacent target, skippable), Fire Shield, Counterstrike, Prayer, Town Portal, Haste/Slow (live initiative order)
- [x] Full implemented artifact set across three tiers with printed discard/remove costs (tray chips + hand cost picker)
- [x] Blacksmith building implemented (artifact source)
- [x] Dice rewards verified vs wiki (resource 2/4 BM · 1/2 V · 3/6 G; treasure 2×XP · 2×artifact search · 1/2 resource dice)

## Images (all URLs verified)
- [x] Hero portraits → heroes.thelazy.net full-size classics
- [x] Town buildings (all 5 factions incl. bronze/silver/gold dwelling mapping) → heroes.thelazy.net town renders
- [x] Resource icons: gold pile / ore = building materials / crystal = valuables (HUD)
- [x] Morale birds (positive/negative) in the HUD
- [x] WoG army-management stats art, zoomable from the hero board

## Infra
- [x] PartyKit/Durable Objects unchanged-compatible (mode flows through the lobby actions; legacy fallback for old snapshots)
- [x] Tests: 115 passing (ruleset suite covers modes, gates, Cerberi, morale, Wisdom purchase, spell-into-attack)
- [x] content-tracker.md + README updated

## Known gaps (tracked in content-tracker.md)
- NI cards stay out of the decks: Chain Lightning, Resurrection, Teleport, Blind/paralysis, Mirth, Sorrow, Slayer, Dimension Door, Earthquake, Forgetfulness, Inferno, Visions; Tactics, Intelligence, Diplomacy, Necromancy, Pathfinding, Learning, Artillery, Ballistics; Charm of Mana, Greater Gnoll's Flail, Shield of the Dwarven Lords, Shackles of War, Mystic Orb, Orb of Vulnerability
- Map-spell Empowerment (Town Portal +MP at power 2/4) resolves at base power for now
- Siege combat, secondary heroes, war machines beyond the Tent, scenario-specific Obelisk/Grail effects — unchanged from before
