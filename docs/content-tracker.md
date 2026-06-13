# Content Tracker

Running inventory of every imported game component: what is in the app, what it still needs, and where it came from. Update this file with every content change.

Sources: community rulebook rewrite ("the rulebook", https://github.com/qwrtln/Homm3BG-build-artifacts → `main_en.pdf`), fan wiki (https://en.homm3bg.wiki/), wiki source database (https://github.com/Mirzipan/Homm3_BG_Database), community scenario editor tile geometry (https://github.com/Zedero/HoMM3BoardgameScenarioEditor). All stats/texts are fan transcriptions — **verify against official owned components before any release**.

Legend: ✅ playable · 🟡 data present, rules effect not implemented · 🔴 missing.

## Game modes (`src/engine/ruleset.ts`)

Chosen in the lobby ("Game mode", BINH default), stored on the game state, synced like every option, shown in the HUD. Old room snapshots without the field count as Legacy.

| Mode | Status | Rules |
| --- | --- | --- |
| **Legacy (rulebook)** | ✅ | The community rulebook as printed: one shared Spell deck and one Artifact deck (Core+Rampart+Inferno set), printed card values, printed unit stats. |
| **House rules BINH** | ✅ | Split decks per the rulebook's optional rule + BINH gates: **Basic/Expert Spell decks** (expert draws need hero level ≥4 AND an open Ⅳ–Ⅴ/Ⅵ–Ⅶ tile, OR owning Eagle Eye / Wisdom / a Basic elemental Magic) and **Minor/Major/Relic Artifact decks** (Minor always; Major on a Ⅳ–Ⅴ+ tile or level ≥4 + Blacksmith; Relic on a Ⅵ–Ⅶ tile or level ≥6 + Blacksmith; the player picks among unlocked decks on every artifact/spell search). **Wisdom** expert −3 gold (basic −2; both Search 3/4 as printed). **Estates** 2/4 gold (printed 3/6). **Few Griffins 3 attack, Pack Griffins 1 defense, Pack Marksmen 3 HP.** BINH also adds Fortune to the spell deck and Eagle Eye/Scouting/Basic elemental Magics + extra artifacts to the pools. (Cerberi now follow the printed card in both modes — see Units.) |

Rules-correctness fixes applied to **both** modes (rulebook/wiki): second negative morale token resets morale to neutral *and* discards the hand at turn end; activation-timed spells (Magic Arrow, Fireball…) cast during your own unit's activation; instant spells (Bloodlust, Stone Skin, Curse, Weakness, Bless, Precision…) play **into attack windows**, scale with Power played alongside them and count the 1-spell/round limit; every Spell card may instead be discarded for its printed "+1 Power"; Empower stacks across plays; ongoing cards last until the owner's **next** turn starts; Offense/Armorer draw their printed card; Magic Arrow starts at power 0.

## Map tiles (`src/data/map/tile-defs.ts`)

| Group | Tiles | Status | Notes |
| --- | --- | --- | --- |
| Starting | S1 (Necropolis), S2 (Dungeon), S3 (Castle) | ✅ | Field lists from the wiki; outer impassable edges from the editor geometry. |
| Starting (expansion factions) | S4 (Rampart), S5 (Fortress), S6 (Inferno) | ✅/🟡 | S4 (Rampart) and S6 (Inferno) are placed for those playable factions at setup. S5 (Fortress) is data-only — that faction is not playable yet, so no seat draws it. |
| Far | F1–F18 | ✅ | Drafted 2 per player at setup (redrawing the last until one holds a Settlement, per the Mission Book rule); placed for 1 MP at the border touching two tiles, then rotated freely. |
| Near | N1–N12 | ✅ | Face-down setup pool. |
| Center | C1–C4 | ✅ | Face-down setup pool. |
| Center | C5 | 🟡 | Inferno tile with Random Town — excluded from pools until Random Town rules exist. |
| All tiles | — | ✅ verified | Yellow borders verified against all 41 tile scans (color analysis + visual check): every border is either a full three-edge outer arc on the `outerImpassable` directions or a complete ring around a blocked field; **no internal border between two passable fields exists in the core box**. The engine renders every scanned segment, blocks movement across them, and supports `internalBorders` for future expansion tiles (engine-enforced + tested). |

## Map locations (`src/data/map/locations.ts`)

| Location | Status | Notes |
| --- | --- | --- |
| Empty / Blocked Field | ✅ | Blocked fields cannot be entered. "Pass-through if forced" edge case not modeled. |
| Town | ✅ | Flagging an enemy town wins the default skirmish. Siege combat (walls/gate/arrow tower, 8-gold defence) 🔴. |
| Mine | ✅ | +5 gold / +2 materials / +1 valuables income; first-flag instant gain; stealing supported. |
| Settlement | ✅ | Income choice or bronze/silver reinforcement at half cost (free on first flag). Secondary-hero spawn point not modeled (no secondary heroes yet). |
| Resources / Treasure symbols | ✅ | Resource die (2/4 BM, 1/2 V, 3/6 G) and treasure die (2×XP, 2×artifact search, resource die, double resource die). |
| Artifact symbol | ✅ | Search (2) the Artifact deck. |
| Windmill / Water Wheel / Mystical Garden / Learning Stone | ✅ | |
| Tree of Knowledge | ✅ | Pay 3 valuables or 10 gold → 2 XP. |
| Fountain of Youth / Temple | ✅ | Morale token + movement. |
| Warrior's Tomb | ✅ | Search (2) artifacts twice, then 2 negative morale. |
| Shrines of Magic Incantation / Gesture | ✅ | |
| Magic Spring | ✅ | Returns one of the top 3 discards to hand (order of remaining cards not user-selectable yet). |
| Witch Hut | 🟡 | Take/discard the top Ability card works; "remove an Ability card from hand" option missing. |
| Scholar | ✅ | Attack-die roll: statistic card / ability search / spell search ("remove a statistic" option missing). |
| Redwood Observatory | 🟡 | Reveals an adjacent face-down tile; revealing a *new* tile from supply not offered. |
| Pandora's Box | 🟡 | Dice options work. Pandora deck draw implemented with 2 of the 20 Stretch Goals cards: “up to 3 permanent cards” (the permanent-limit exception) and “your hand is increased by 1” — both playable permanents. 3 more cards exist as not-implemented library entries; the remaining 15 🔴. |
| Stables / Sanctuary / Trading Post | ✅ | Full choose-one menu with a market panel UI (trade table image from the rulebook back cover): repeatable resource trades, sell one card for 1 gold (Specialty/Statistic/starting Ability/Magic Arrow excluded, card removed from the game), sell a **Spell Scroll spell for 2 gold** each, or buy a war machine at the higher price. Trading locks out the other two options within a visit, as printed. |
| Spell Scroll (Stronghold) | ✅ | Take a scroll and draw **2 Spells** into it — the visitor picks the Basic or Expert Magic deck per draw (the single Spell deck in Legacy). The scroll sits next to the hero (📜 badge, not in hand; contents hidden from opponents). Either spell may be **cast in combat at power 0** — it cannot be buffed by any Power source (Power cards, +1 discards, School of Magic, town cubes, Astrologers) and is never the expert side — through the normal cast/instant timing windows; using it removes it from the game. The spell still counts toward the one-spell-per-combat-round limit. Spells may also be **sold at the market for 2 gold** each. An emptied scroll is discarded. Tested in `spell-scroll.test.ts`. |
| War Machine Factory | ✅ | Sells the five war machines at their lower price (shared one-copy supply; bought cards go to the buyer's hand and then live in their deck). |
| Obelisk / Dragon Utopia / Grail / Star Axis | 🟡 | Flaggable/visitable shells; scenario-specific effects pending. |

## Factions and towns (`src/data/factions/core.ts`)

| Faction | Status | Notes |
| --- | --- | --- |
| Castle | ✅ | City Hall (5 gold / +1 MP), Citadel, Mage Guild (6g spells), Towers / Holy Grounds / Glory of Erathia, Brotherhood of the Sword (+morale each resource round). **Blacksmith ✅**: once per turn pay 6 gold to Search (2) Artifacts or sell an Artifact from hand for 4 gold; counts as the BINH Major/Relic artifact source. |
| Necropolis | ✅ | City Hall (4 gold / free bronze reinforce), 5g Mage Guild, Old Cemetery / Mausoleum Domain / Vaults of Darkness. Ignores morale. Necromancy Amplifier, Cover of Darkness 🟡. |
| Dungeon | ✅ | City Hall (5 gold / 1 valuables), 5g Mage Guild, Warrens / Inner Labyrinths / Ancient Lairs. Portal of Summoning, Mana Vortex 🟡. |
| Rampart | ✅ | City Hall (7 gold), Citadel, 5g Mage Guild, Housing Estate / Spring upon Arches / Cliff behind the Glade. Mystic Pond, Saplings 🟡. Starting tile S4. |
| Inferno | ✅ | City Hall (6 gold / 3 materials), Citadel (9g 4m 1v), 5g Mage Guild, Crucible of Sins / Gates of Abyss / Hellfire Palace. Castle Gate, Brimstone Stormclouds 🟡. Starting tile S6 (the Inferno tile; `startingTileByFaction` is derived from the faction definitions so the public data and setup map can't drift). |
| Tower/Fortress/Cove/Stronghold/Conflux | 🔴 | Remaining expansion factions. |

Citadel siege bonuses (3 Walls, 1 Gate, Arrow Tower) 🔴 — siege combat not implemented.

## Heroes (`src/data/factions/core.ts`, portraits and board scans hosted locally)

| Hero | Faction | Status | Notes |
| --- | --- | --- | --- |
| Catherine (Knight, might, A2 D2 P1 K1) | Castle | ✅ | Specialty I implemented (+1 A or +1 D, doubled for Crusaders), IV/VI 🟡. |
| Rion (Cleric, magic, A1 D0 P2 K2) | Castle | ✅ | Specialty I heals 1 **and draws 1** (both modeled), IV/VI 🟡. |
| Sandro (Necromancer, magic, A1 D0 P2 K2) | Necropolis | ✅ | Cloak of the Undead King specialties 🟡 (unit-stat replacement not modeled). |
| Tamika (Death Knight, might, A1 D2 P2 K1) | Necropolis | ✅ | Specialty I implemented; IV/VI 🟡. |
| Alamar (Warlock, magic, A0 D0 P3 K2) | Dungeon | ✅ | Resurrection **I/IV/VI all implemented**. When a killing **normal attack** would reduce one of your units to 0 HP (attacks only — never spells or specialty damage), the engine opens a save window and **asks the unit's controller** whether to cancel it. The grade-matching option costs Power paid by discarding that many Power-source cards (a Power statistic or any Spell): **I** 1/2/4, **IV** 0/1/3, **VI** 0/0/2 for bronze/silver/gold (0 = free). A cancelled attack draws **no Retaliation**. The save is only offered when the controller can afford it; passing lets the unit die. |
| Mutare (Overlord, might, A2 D2 P1 K1) | Dungeon | ✅ | Specialty I implemented; the +1 now doubles for **every Dragons unit** (Black/Gold/Ghost/Azure/… Dragons, not Dragon Flies), IV/VI 🟡. |
| Gelu (Ranger, might, A1 D3 P1 K1) | Rampart | ✅ | Specialty I implemented (doubles for Sharpshooters); IV/VI 🟡. Starting ability Archery. |
| Gem (Druid, magic, A0 D2 P1 K2) | Rampart | ✅ | First Aid starting ability heals 1. Specialty I implemented: take the First Aid Tent from the supply for free, or draw 1 if it is gone. IV/VI 🟡. |
| Xyron (Heretic, magic, A1 D1 P2 K1) | Inferno | ✅ | Inferno I implemented: discard 2 cards, then 1 damage to a chosen unit's space and every adjacent unit (friend or foe). IV/VI 🟡. Starting ability Wisdom. |
| Rashka (Demoniac, might, A2 D2 P1 K1) | Inferno | ✅ | Specialty I implemented (doubles for Efreet); IV/VI 🟡. Starting ability Scholar 🟡. |

Hero board level track (verified against the wiki board scan): 2 XP per level; hand limit 4→5(III)→6(V)→7(VII); expert effects +1 at II/IV/VI; ability Search (2) at II/III/V/VII; specialties at I/IV/VI. Secondary heroes 🔴 (hire via Population/Tavern, 2 MP, instant-defeat option).

## Units (`src/data/factions/units.ts`)

- ✅ Full core rosters with few/pack stats and recruit/reinforce costs: Castle (Halberdiers, Marksmen, Griffins, Crusaders, Zealots, Champions, Archangels), Necropolis (Skeletons, Zombies, Wraiths, Vampires, Liches, Dread Knights, Ghost Dragons), Dungeon (Troglodytes, Harpies, Evil Eyes, Medusas, Minotaurs, Manticores, Black Dragons).
- ✅ Rampart expansion roster: Centaurs, Dwarves, Elves, Pegasi, Dendroids, Unicorns, Gold Dragons (stats, costs, images).
- ✅ Inferno expansion roster: Familiars, Magogs, Cerberi, Demons, Pit Lords, Efreet, Arch Devils (stats, costs, images).
- ✅ 74 neutral units in four tier decks (bronze 29 / silver 20 / gold 17 / azure 8), derived into the tier decks by `neutralUnitIdsByTier` (`core.ts`). Covers the core + Inferno/Rampart/Stronghold expansion neutrals plus the Tower/Fortress/Conflux/Dungeon creatures that only appear as neutral guards: **bronze** Gnolls, Gremlins, Gargoyles, Lizardmen, Iron Golems, Sprites, Dragon Flies, Air/Ice/Storm Elementals; **silver** Basilisks, Gorgons, Genies, Magi, Energy/Fire/Magma Elementals; **gold** Nagas, Wyverns, Magic Elementals; **azure** Titans, Hydras, Phoenixes, Rust Dragons, Gold Dragons (joining the original Azure/Crystal/Faerie Dragons). Stats and ability text transcribed per-unit from the wiki (`https://en.homm3bg.wiki/towns/neutral/` + each unit page). Each new unit's bare name is mapped to its original-game voice in `unit-sounds.ts` (the Gold Dragon neutral reuses the Rampart Gold Dragon voice). Implemented ability tags are used wherever the engine supports them: **no-retaliation** (Sprites, Nagas, Hydras), **no-adjacent-shot penalty** (Magi, Titans, Sharpshooters), the **Magi Power Drain**, **paralysis immunity** (Troglodytes, Gargoyles), the **Basilisk/Wyvern on-hit dice** (Stone Gaze paralysis on a "0"; Poison Sting 1 damage on a "0"), the **Gorgon Death Stare** (target reduced to 0 HP on two "-1"s), **Rust Dragon Acid Breath** (a −2 Defense token on a "-1"), the **Hatred** Attack bonuses (Genies → Efreet, Archangels ↔ Arch Devils, Titans → Black Dragons), the **Zombie/Manticore die-conditioned Defense** (+1 Defense vs an attacker's "0"/"+1"), Hydra two-target melee and the Gold Dragon line attack, plus the activation/dragon abilities below. Still display-only `abilityText` for neutrals: golem/elemental **spell-damage immunity & reduction** (Diamond/Gold/Iron Golems, the elementals, the Black Dragon spell ward), Phoenix rebirth + fire immunity, the Ghost Dragon knock-back, Mummy/Champion die manipulation, the Halberdier ally-Defense aura, the Familiar spell tax, the Skeleton necro-reinforce and the neutral Minotaur reroll. Still missing as neutrals: the Cove/sea units (Sea Dogs, Seamen, Oceanids, Nix, Ayssids, Fangarm, Leprechauns, Satyrs), which have no converted voice set yet.
- Implemented unit abilities: unlimited retaliation (Griffins), attack reroll (pack Crusaders), **double attack** (pack Marksmen — second shot at non-adjacent targets, stops at 2), **double attack on −1/0** (pack Elves), **no retaliation** (Vampires, pack Harpies, Cerberi, Arch Devils), **no adjacent-shot penalty** (pack Zealots/Evil Eyes/Medusas, Sharpshooters, Halflings), **teleport move** (pack Arch Devils), **paralysis immunity** (pack Troglodytes, neutral Troglodytes/Gargoyles), **die-conditioned Defense** (necropolis Zombies few/pack & neutral Zombies on "0"/"+1", neutral Zombies few only on "+1", neutral Manticores on "0"/"+1"), **Death Blow** (pack Dread Knights gain +1 total Attack on a "0"/"+1"), **Piercing Strike** (pack Manticores ignore the target's printed card Defense), **Hatred** (+2/+1 Attack vs a named foe — neutral Archangels↔Arch Devils, Genies→Efreet, Titans→Black Dragons), and the printed multi-target attacks:
  - **Liches' Death Cloud** (pack + neutral): a full separate second attack against a chosen unit adjacent to the original target — friend, foe, or the Liches themselves (wiki FAQ), mandatory when a candidate exists, instants playable on it, die rolled at base attack 2, resolved **before** the original target's retaliation, never chains a third attack.
  - **Magog fireball splash** (pack + neutral): 1 flat damage to **one chosen** unit adjacent to the target, only when the target is not adjacent to the Magogs; a lone friendly candidate takes the hit (mandatory per FAQ).
  - **Cerberi second head** (pack + neutral): 1 flat damage to another **enemy** unit adjacent to the Cerberi, chosen by the attacker.
  - **Magi Power Drain** (neutral Magi): after the Magi's own attack the **defending player** chooses — discard a Power-contributing card of their choice (a Power statistic, any Spell, or a Power-granting Artifact/Ability such as **Sorcery** — anything carrying the `ADD_SPELL_POWER` effect), or let a random card be discarded. With no Power card in hand the random discard is forced and resolves with no prompt; an empty hand is a no-op. Combat parks on its retaliation until the defender answers (`COMBAT_HAND_DISCARD` choice + `RESOLVE_COMBAT_DISCARD`); the candidate card identities stay hidden from other seats. Tested in `magi-power-drain.test.ts`.
  - **Dragon Breath / line attack** (Rampart Gold Dragons few+pack, neutral Gold Dragons, neutral Black Dragons): after the attack a full separate attack strikes the unit directly **behind** the target in line (friend or foe), at the printed value (2 for few/Black Dragon, 3 for pack/neutral Gold Dragon). Not adjacent to the dragon, so it never retaliates and never chains.
  - **Hydra Assault** (neutral Hydras): "attacks up to 2 adjacent enemy units" — after the primary attack, one more enemy adjacent to the Hydra takes a full separate attack at the Hydra's own attack (7); with several candidates the attacker chooses. No retaliation.
  - **Paralysis on the Attack die** (neutral Azure Dragons, neutral Basilisks): the struck target gains a Paralysis token (skips its next activation; any damage clears it) — Azure Dragons on the attack's own "-1", Basilisks on a fresh "0" rolled after the attack. A target with **paralysis immunity** (Troglodytes/Gargoyles) is never tokened.
  - **Wyvern Poison Sting** (neutral Wyverns): after the attack, roll 1 Attack die; on a "0" (and only "0", unlike the Thunderbird's 0/+1) deal 1 flat damage to the target.
  - **Gorgon Death Stare** (neutral Gorgons): after the attack, roll 2 Attack dice; on two "-1"s the target's current side is reduced to 0 HP (a Pack flips to its Few side as usual).
  - **Rust Dragon Acid Breath** (neutral Rust Dragons): on a "-1" on its own Attack die, place a Corrosion token worth −2 Defense (floored at 0) on the target for the rest of the combat.
  - **Cerberi** (pack + neutral) follow the printed card in **both** modes: 1 flat damage to another **enemy** unit adjacent to the Cerberi, chosen by the attacker (the old BINH attack-all override is gone).
  - **Enchanters' Enchant** (`enchanter-heal-or-buff`, neutral): "[activation] Remove up to 2 damage from a friendly unit. Otherwise, gain +1 Attack." On activation the controller heals a chosen *other* friendly unit or buffs the Enchanters' own Attack for the round, then acts normally (it does not end the activation). Neutral Enchanters always take the +1 Attack; a player picks heal-target vs "Gain +1 Attack instead" (auto-buffs when no friendly is wounded).
  - **Faerie Dragons' damage-spell** (`faerie-dragon-spell`, neutral): "[activation] The selected unit suffers 2 damage" as a free spell (ignores defense, no spell-limit cost), then the dragon acts normally. Neutral targets by its normal attack priority; a player chooses. The client plays the **Ice Bolt** projectile + sound on the hit.
  - **Harpies' Strike and Return** (`harpy-return`, Dungeon few/pack + neutral): after the attack and the enemy's Retaliation Attack, the harpy may fly back to the space it moved from. Neutral always returns; a player is offered "fly back or stay". Only fires when the harpy moved to attack and the origin is still clear.
  - **Pit Lords' Summon Demons** (`summon-demons`, Inferno Pack): "[unit_other] If one of your units has been removed from the board during this Combat, Summon or Reinforce Demons." Once per combat, instead of moving/attacking, the active Pit Lords either summon a Few of Demons onto an empty adjacent space or reinforce a friendly Few of Demons up to a Pack at no cost (`SUMMON_DEMONS` action). The new/reinforced unit also persists in the army after the combat. A summoned unit joins the round immediately and may still act this round when its initiative comes up.
  - Neutral-controlled Liches/Magogs/Cerberi/Hydras auto-resolve these target choices by the AI target priority (enemy units first; forced friendly hits spare the strongest).
  Remaining printed abilities are display-only (`abilityText`) — e.g. Halberdier discard-to-ignore-die, vampire drain heal, Dendroid root, and the spell-damage immunities/reductions (Black Dragons, Efreet, golems, elementals, unicorns, Pegasi spell-power drain, Dwarves' magic resist, Familiar spell tax) which await a shared spell-damage pipeline. Every card's hover/zoom now also lists the engine's wired abilities (name + rules text) next to the printed text, so the implementation is auditable (e.g. Few Medusas show only "Paralyzing Gaze", confirming they lack the Pack's "No Range Penalty").
- Pack→Few flip with excess damage works in combat; defeated Few units leave the unit deck; empty deck restores the scenario's starting units.
- Unit card images hot-link the wiki asset pattern `units-{faction}-{tier}-{slug}-{side}.webp`; neutral image URLs need spot-checking.
- **Stats verified against the wiki** for Griffins (few A2, pack A3/D0), Marksmen (pack HP2) and Cerberi (pack "Ignores Retaliation Attacks. Additionally, deals 1 damage to another enemy unit adjacent to Cerberi."). The BINH overrides (`src/engine/ruleset.ts`) change exactly these: few Griffins A3, pack Griffins D1, pack Marksmen HP3. The army panel shows the live (mode-adjusted) stats.

## Cards (`src/data/cards/`)

| Card | Status | Notes |
| --- | --- | --- |
| Statistics: Attack, Defense, Power, Knowledge | ✅ | Power also pays Empower inside attack windows (feeding spell instants). |
| **Spells — full implemented set** (`spells.ts` + `sample.ts`) | ✅ | Basic: Magic Arrow ×3, Lightning Bolt, Haste, Slow, Stone Skin, Bloodlust, Curse, Weakness, Bless, Cure, Anti-Magic, Precision (+ Fortune in BINH). Expert: Fireball (target + chosen adjacent unit, skippable second space), Fire Shield, Counterstrike, Prayer (attack/defense instants + initiative buff), Town Portal (map). Buff/debuff spells are printed Instants played into attacks, Power-scaled, spell-limit-counted. |
| Spells known but not implemented (library only, not in decks) | 🟡 | Chain Lightning, Resurrection, Teleport, Blind (paralysis), Mirth, Sorrow, Slayer, Dimension Door, Earthquake (siege), Forgetfulness, Inferno, Visions. |
| Abilities: Resistance, Archery, Offense (+draw), Armorer, Luck, Leadership, Sorcery, Mysticism (recall, expert recalls support cards), Estates, Wisdom (Mage Guild purchase), Logistics (end-turn step / expert +1 MP), Scholar (take from discard), First Aid | ✅ | All playable from the adventure hand (new play menu) or in their windows. |
| BINH-extra abilities: Eagle Eye (dig Basic/Expert spell), Scouting (Search 3/5), Basic Air/Earth/Fire/Water Magic (permanent school fetch; expert +3 school Power) | ✅ | Also the Expert-spell-deck key cards. |
| Abilities known but not implemented | 🟡 | Tactics, Intelligence, Diplomacy, Necromancy, Pathfinding, Learning, Artillery, Ballistics (kept out of the decks). |
| **Artifacts — full implemented set with printed costs** (`artifacts.ts` + `sample.ts`) | ✅ | Minor: Armor of Wonder, Breastplate of Petrified Wood, Buckler, Centaur's Axe, Dragon Wing Tabard, Hourglass, Cart of Lumber, Legs/Loins/Torso of Legion (recruit discounts), Red Dragon Flame Tongue, Rib Cage, Shield of the Yawning Dead, Speculum, Boots of Speed. Major: Dragon Scale Shield, Endless Bag of Gold, Head of Legion, Ogre's Club (printed discard option), Tunic of the Cyclops King, Vial of Lifeblood (remove up to 3 damage, OR +1 HP for the combat), Cape of Velocity, Golden Bow, Crystal Cloak, Vial of Mercury, Breastplate of Brimstone, Shield of the Damned. Relic: Angel Wings (move-through + draw), Dragon Scale Armor, Endless Sack of Gold, Sentinel's Shield, Sword of Judgement (discard X), Titan's Cuirass, Titan's Gladius (printed), Crown of Dragontooth. BINH extras: Skull Helmet, Equestrian's Gloves, Glyph of Gallantry, Quiet Eye, Pendant of Courage (search repeat), Necklace of Dragonteeth (2 spells/round), Helm of Heavenly Enlightenment (+1 crown), Celestial Necklace, Lion's Shield, Sandals of the Saint. Discard/remove costs picked in the UI (tray chips / hand cost picker). |
| Artifacts known but not implemented | 🟡 | Charm of Mana, Greater Gnoll's Flail, Shield of the Dwarven Lords, Shackles of War, Mystic Orb of Mana, Orb of Vulnerability (out of the decks). |
| War machines: First Aid Tent, Ammo Cart, Ballista, Catapult, Cannon | ✅ | Permanent cards (one in play per player; playing another discards the first). FAT heals 1 once per combat round, **or expert: spend 1 expert use to heal 3 times that round instead** (basic and expert are mutually exclusive per round); Ammo Cart waives the ranged penalties and gives ranged units +2 initiative; Ballista auto-hits the slowest enemy at every round start (ties pause for the owner), **or expert: when an expert use is free the owner is asked at round start to spend it and fire 3 times instead of once**; Catapult may pay 1 material for 1 damage to two adjacent targets (walls/gate pending sieges); Cannon may spend 1 expert use for 2 damage. The expert abilities require the war-machine card in play and a free expert use. Bought at the Factory (3/5/7/8/10 gold) or Trading Post (6/8/10/12/14). Catapult/Cannon card scans missing on the wiki — text fallback renders. |
| Schools of Magic: Fire/Water/Air/Earth Magic (Tower) | ✅ | Permanent cards: +1 power for the school's spells while in play (Magic Arrow counts for every school); expert discards the card — from hand or from play — for +3 power on one matching cast (replaces the +1, costs an expert use). Distinct from the BINH "Basic X Magic" fetch permanents above. |
| Hero specialties (18) | see Heroes | Every level-I specialty is now implemented (might heroes, Rion's heal+draw, Gem's First Aid Tent grab, Xyron's Inferno blast, Alamar's Resurrection cancel) so no selectable hero starts with a dead card. IV/VI mostly 🟡. |
| Astrologers Proclaim deck (19 core cards) | ✅ | Drawn and resolved every even round; "until the next Astrologers round" effects (movement, hand limit, spell hooks, die rerolls, neutral-draw swaps) enforced by the engine; income modifiers apply at the next Resource round. Texts from the wiki (`src/data/cards/astrologers.ts`). |
| Card backs | 🟡 | Placeholder "H3" back; owner will supply final back-side images. |
| Building tiles art | 🟡 | `assets.image`/`assets.icon` slots wired through data and town panel; awaiting scans. |

## Adventure rules engine (`src/engine/adventure*.ts`, `neutral-ai.ts`)

| Rule | Status | Notes |
| --- | --- | --- |
| Hex map, 7-field tiles, rotation, edge sealing | ✅ | Printed border lines render on the map; reveals and placements ask the player for the rotation ("you may always rotate when placing or revealing"), rejecting rotations whose border lines seal the tile off. Starting tiles are fixed by faction + seat and never rotate. |
| Movement actions (move/revisit/discover/place tile/continue combat) | ✅ | Click-to-move walks multi-field paths (1 MP per field) with arrow preview/confirm; intermediate fields must be "open" (used cubes, own flags, empties); guards/locations stop the walk. Tile placement enforces touch-2-tiles + next-to-hero. |
| Allied heroes passing through each other | ✅ | Pass-through allowed mid-path, never as the final field; the crossed field is not visited. |
| Hand flow (auto-draw, mulligan, hand limit by level) | ✅ | Starting hands dealt at setup; every turn auto-draws to the (effective) limit; one mulligan per turn — click cards to pick any number of discards, confirm once, draw that many (window closes after use or the first real action); forced discard-down when over the limit. |
| Round structure (token refresh, resource income, astrologers) | ✅/🟡 | Income + City Hall choices + Astrologers rounds work; scenario round-tracker timed events 🔴. |
| Neutral combat: difficulty table, tier decks, placement-first reveal, AI placement, AI targeting, 1-round time limit (continue for 1 MP / retreat), quick combat, XP awards, neutral discards | ✅ | Rulebook Combat Setup order: the player deploys up to 5 units first (drag & drop or click), only then is the guard army drawn from the Field Difficulty Level Table and revealed, sorted ranged→backline / ground+flying→frontline, left to right in descending initiative with higher tiers first. Targeting ties between equally valid targets now pause for the player to choose, as printed. The Groovy Satyr swap happens after the draw, before the reveal. Clash rule "player to your right controls neutrals" 🔴 (the AI controls them; the attacker breaks ties). |
| Player-vs-player combat on the map | ✅ | Attacker then defender placement (drag & drop), full card combat, loser pays 5 gold + negative morale, winner XP, defeated hero returns home. Per-combat-round spell/crown limits reset when a combat starts (a spell cast in an earlier fight no longer blocks round 1 of the next). Surrender, town-action window before combat, siege 🔴. |
| Morale | ✅ | All three printed spends: draw 1, discard-any-draw-that-many, reroll any die (attack die via the reroll window, Treasure/Resource dice via the roll prompt). Max one positive/negative token; **a second negative token resets morale to neutral and discards the hand at turn end** (wiki morale table); Necropolis immune. Positive/negative shown with the classic morale birds. |
| Experience/level ups | ✅ | Searches queue one at a time; azure kill jumps to level VII. |
| Scenario sheets (`src/data/map/scenarios.ts`) | 🟡 | Map-setup phase: pick faction + hero in the lobby **and set the game options** — scenario, neutral difficulty (Easy/Normal/Hard/Impossible, **Impossible default**, table verified against rulebook p. 91 and the wiki), starting resources, base resource gain (default **10 gold / 0 materials / 0 valuables**), starting unit tiers, pre-built buildings (validated per faction). Any seated player adjusts them until the start; everything syncs over the action stream. Built-in "Border Skirmish" still uses development numbers for the rest until the printed Mission Book sheets are transcribed. |

## Imagery (`src/data/assets/homm-assets.ts`, all URLs verified)

- ✅ Hero portraits: classic PC portraits from heroes.thelazy.net (`Hero_<name>.png`), downloaded, upscaled and hosted locally (`/assets/hero_portraits-<id>.webp`) for all 10 heroes — used on the hero board, the lobby picker and the map pawns.
- ✅ Hero board: in-app recreation of the printed board (`src/components/hero-board.tsx`) — faction-colored name banner, the four statistic tiles, starting ability + specialty art (cropped live from the local card scans), and the Ⅰ–Ⅶ level track with laurels, slots, hand-limit cards, expert crowns and the XP cube. The wiki board scan stays one click away on the name banner.
- ✅ Town buildings: town-screen renders from heroes.thelazy.net for all five factions (City Hall, Citadel, Mage Guild, Blacksmith, three dwellings mapped bronze→low / silver→mid / gold→high, faction buildings) rendered in the town panel.
- ✅ Resource icons: classic resource-bar icons — gold pile, **ore = building materials**, **crystal = valuables** (per the table owner's reference image) — in the adventure HUD.
- ✅ Morale: classic good/poor morale birds in the HUD (matching the uploaded sprite reference).

## Multiplayer / app

- ✅ Server-authoritative rooms, SSE live stream + polling fallback, seat switching, observer seat (hands hidden, all combats watchable).
- ✅ Combat deployment by drag & drop: drag units from the panel onto your two rows, drag placed units to new spaces, click flow still works; the board orients by side (your rows nearest your hand) in adventure combats.
- ✅ Ability-target choices (Death Cloud, splash, Cerberi bite, neutral target ties) highlight the candidate units on the board (click to choose) with a prompt-tray fallback.
- ✅ Adventure event feed: visits, gains, dice, experience, morale, flags, fight starts/reveals/outcomes pop as toasts; each carries a named sound cue (`ADVENTURE_FEED_CUES`) as the future audio hook.
- ✅ Tile art hides the built-in location icons (live state stays); the printed yellow borders render per scanned hex edge.
- ✅ Building art slots (`assets.image`/`assets.icon` on every town building) render in the town panel as soon as URLs land.
- ✅ Map ↔ battle switching during combats; hero-walk arrow animations on every seat; pan/zoom map with a tile-art layer (scenario-editor scans now, drop-in slot for real art).
- ✅ PartyKit scaffold (`party/index.ts` + `src/lib/realtime.ts`): one Cloudflare Durable Object per room, WebSockets at the edge, Durable Object storage persistence; enabled via `NEXT_PUBLIC_PARTYKIT_HOST`. The game-mode option flows through the same lobby actions; snapshots saved before modes existed load as Legacy.
- ✅ Adventure hand play menu: hand cards with legal plays glow; clicking opens the play list (basic/expert sides, option choices, BINH value notes) with a cost picker for "discard N cards" prices. The instant tray batches spell instants with Power cards and pays discard costs via chips.
- ✅ Discard-pile viewers (own pile, shared decks, the Astrologers deck, neutral tier discards) and face-down deck visuals with counts.
- 🟡 Seats are open (anyone can sit anywhere) — no auth/claiming yet.
- 🟡 Next.js fallback store is in-memory; the PartyKit backend persists rooms in Durable Object storage.
