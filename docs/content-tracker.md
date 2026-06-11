# Content Tracker

Running inventory of every imported game component: what is in the app, what it still needs, and where it came from. Update this file with every content change.

Sources: community rulebook rewrite ("the rulebook", https://github.com/qwrtln/Homm3BG-build-artifacts → `main_en.pdf`), fan wiki (https://en.homm3bg.wiki/), community scenario editor tile geometry (https://github.com/Zedero/HoMM3BoardgameScenarioEditor). All stats/texts are fan transcriptions — **verify against official owned components before any release**.

Legend: ✅ playable · 🟡 data present, rules effect not implemented · 🔴 missing.

## Map tiles (`src/data/map/tile-defs.ts`)

| Group | Tiles | Status | Notes |
| --- | --- | --- | --- |
| Starting | S1 (Necropolis), S2 (Dungeon), S3 (Castle) | ✅ | Field lists from the wiki; outer impassable edges from the editor geometry. |
| Starting (expansion factions) | S4 (Rampart), S5 (Fortress), S6 (Inferno) | 🟡 | Data imported; factions not playable yet. |
| Far | F1–F18 | ✅ | In the placement pool (2 dealt to each player). |
| Near | N1–N12 | ✅ | Face-down setup pool. |
| Center | C1–C4 | ✅ | Face-down setup pool. |
| Center | C5 | 🟡 | Inferno tile with Random Town — excluded from pools until Random Town rules exist. |
| All tiles | — | needs editing | Outer yellow borders were taken from the editor's per-tile `blocked` arrays; verify each tile against its physical scan (the editor images are linked in each definition). Internal field-to-field borders are not modeled yet. |

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
| Pandora's Box | 🟡 | Dice options work. Pandora's Box card deck (Stretch Goals) 🔴. |
| Stables / Sanctuary / Trading Post | ✅ | Trade table from the rulebook back cover. Trading Post's "remove a card" and war-machine purchase 🔴. |
| War Machine Factory | 🔴 | Needs war machine price list. |
| Obelisk / Dragon Utopia / Grail / Star Axis | 🟡 | Flaggable/visitable shells; scenario-specific effects pending. |

## Factions and towns (`src/data/factions/core.ts`)

| Faction | Status | Notes |
| --- | --- | --- |
| Castle | ✅ | City Hall (5 gold / +1 MP), Citadel, Mage Guild (6g spells), Towers / Holy Grounds / Glory of Erathia, Brotherhood of the Sword (+morale each resource round). Blacksmith 🟡. |
| Necropolis | ✅ | City Hall (4 gold / free bronze reinforce), 5g Mage Guild, Old Cemetery / Mausoleum Domain / Vaults of Darkness. Ignores morale. Necromancy Amplifier, Cover of Darkness 🟡. |
| Dungeon | ✅ | City Hall (5 gold / 1 valuables), 5g Mage Guild, Warrens / Inner Labyrinths / Ancient Lairs. Portal of Summoning, Mana Vortex 🟡. |
| Rampart | ✅ | City Hall (7 gold), Citadel, 5g Mage Guild, Housing Estate / Spring upon Arches / Cliff behind the Glade. Mystic Pond, Saplings 🟡. Starting tile S4. |
| Inferno | ✅ | City Hall (6 gold / 3 materials), Citadel (9g 4m 1v), 5g Mage Guild, Crucible of Sins / Gates of Abyss / Hellfire Palace. Castle Gate, Brimstone Stormclouds 🟡. Starting tile S5. |
| Tower/Fortress/Cove/Stronghold/Conflux | 🔴 | Remaining expansion factions. |

Citadel siege bonuses (3 Walls, 1 Gate, Arrow Tower) 🔴 — siege combat not implemented.

## Heroes (`src/data/factions/core.ts`, portraits hot-linked from the wiki)

| Hero | Faction | Status | Notes |
| --- | --- | --- | --- |
| Catherine (Knight, might, A2 D2 P1 K1) | Castle | ✅ | Specialty I implemented (+1 A or +1 D; Crusader doubling 🔴), IV/VI 🟡. |
| Rion (Cleric, magic, A1 D0 P2 K2) | Castle | ✅ | Specialty I heals 1 (printed bonus draw 🔴), IV/VI 🟡. |
| Sandro (Necromancer, magic, A1 D0 P2 K2) | Necropolis | ✅ | Cloak of the Undead King specialties 🟡 (unit-stat replacement not modeled). |
| Tamika (Death Knight, might, A1 D2 P2 K1) | Necropolis | ✅ | Specialty I implemented; IV/VI 🟡. |
| Alamar (Warlock, magic, A0 D0 P3 K2) | Dungeon | ✅ | Resurrection specialties 🟡 (lethal-attack cancel not modeled). |
| Mutare (Overlord, might, A2 D2 P1 K1) | Dungeon | ✅ | Specialty I implemented; IV/VI 🟡. |
| Gelu (Ranger, might, A1 D3 P1 K1) | Rampart | ✅ | Specialty I implemented (doubles for Sharpshooters); IV/VI 🟡. Starting ability Archery. |
| Gem (Druid, magic, A0 D2 P1 K2) | Rampart | ✅ | First Aid starting ability heals 1; specialties 🟡. |
| Xyron (Heretic, magic, A1 D1 P2 K1) | Inferno | ✅ | Inferno area-damage specialties 🟡. Starting ability Wisdom. |
| Rashka (Demoniac, might, A2 D2 P1 K1) | Inferno | ✅ | Specialty I implemented (doubles for Efreet); IV/VI 🟡. Starting ability Scholar 🟡. |

Hero board level track (verified against the wiki board scan): 2 XP per level; hand limit 4→5(III)→6(V)→7(VII); expert effects +1 at II/IV/VI; ability Search (2) at II/III/V/VII; specialties at I/IV/VI. Secondary heroes 🔴 (hire via Population/Tavern, 2 MP, instant-defeat option).

## Units (`src/data/factions/units.ts`)

- ✅ Full core rosters with few/pack stats and recruit/reinforce costs: Castle (Halberdiers, Marksmen, Griffins, Crusaders, Zealots, Champions, Archangels), Necropolis (Skeletons, Zombies, Wraiths, Vampires, Liches, Dread Knights, Ghost Dragons), Dungeon (Troglodytes, Harpies, Evil Eyes, Medusas, Minotaurs, Manticores, Black Dragons).
- ✅ Rampart expansion roster: Centaurs, Dwarves, Elves, Pegasi, Dendroids, Unicorns, Gold Dragons (stats, costs, images).
- ✅ Inferno expansion roster: Familiars, Magogs, Cerberi, Demons, Pit Lords, Efreet, Arch Devils (stats, costs, images).
- ✅ 42 neutral units in four tier decks (core + Inferno/Rampart expansion neutrals incl. Faerie Dragons azure).
- Implemented unit abilities: unlimited retaliation (Griffins), attack reroll (pack Crusaders), **double attack** (pack Marksmen — second shot at non-adjacent targets, stops at 2), **double attack on −1/0** (pack Elves), **no retaliation** (Vampires, pack Harpies, Cerberi, Arch Devils), **no adjacent-shot penalty** (pack Zealots/Evil Eyes/Medusas, Sharpshooters, Halflings), **splash damage** (pack Magogs, approximation: hits all adjacent enemies instead of one chosen), **teleport move** (pack Arch Devils). Remaining printed abilities are display-only (`abilityText`) — e.g. Halberdier discard-to-ignore-die, vampire drain heal, dragon breath line attack, Dendroid root.
- Pack→Few flip with excess damage works in combat; defeated Few units leave the unit deck; empty deck restores the scenario's starting units.
- Unit card images hot-link the wiki asset pattern `units-{faction}-{tier}-{slug}-{side}.webp`; neutral image URLs need spot-checking.

## Cards (`src/data/cards/`)

| Card | Status | Notes |
| --- | --- | --- |
| Statistics: Attack, Defense, Power, Knowledge | ✅ | |
| Spells: Magic Arrow, Lightning Bolt, Stone Skin, Bloodlust, Cure, Fortune, Fireball | ✅ | Fireball splash uses single-target damage 🟡? (verify), others playable. |
| Abilities: Resistance, Archery, Offense | ✅ | |
| Luck | ✅ | Ongoing, played on your turn/activation. Basic: Treasure + Resource die rerolls on the map. Expert: one reroll of any die (attack die included), consumed on use. |
| First Aid (Gem) | ✅ | Instant heal 1. |
| Scholar (Rashka) | 🟡 | Statistic exchange needs allied-hero meetings. |
| Leadership | ✅ | Gain morale; expert draws 2 first. |
| Sorcery | ✅ | +1/+2 power then draw 1. |
| Wisdom | 🟡 | Town spell-price reduction needs the town layer hook. |
| Tactics | 🟡 | Unit-swap timing not modeled. |
| Artifacts: Ogre's Club, Titan's Gladius, Buckler, Breastplate | ✅ | |
| Centaur's Axe | ✅ | Corrected to the printed card: "Triple the Attack die's outcome" OR "+1 attack" (either fighter may triple). |
| War machines: First Aid Tent | ✅ | |
| Hero specialties (18) | see Heroes | I-level for might heroes + Rion implemented. |
| Remaining official spell/ability/artifact decks | 🔴 | Dozens of cards still to import (see wiki indexes). |
| Astrologers Proclaim deck | 🔴 | Astrologers rounds currently log and pass. |
| Card backs | 🟡 | Placeholder "H3" back; owner will supply final back-side images. |

## Adventure rules engine (`src/engine/adventure*.ts`, `neutral-ai.ts`)

| Rule | Status | Notes |
| --- | --- | --- |
| Hex map, 7-field tiles, rotation, edge sealing | ✅ | |
| Movement actions (move/revisit/discover/place tile/continue combat) | ✅ | Tile placement enforces touch-2-tiles + next-to-hero; full path-connectivity check simplified to footprint adjacency. |
| Allied heroes passing through each other | 🔴 | Moving onto your own hero's field is simply blocked. |
| Hand refresh, hand limit by level | ✅ | |
| Round structure (token refresh, resource income, timed events) | ✅/🔴 | Income + City Hall choices work; Astrologers and scenario timers 🔴. |
| Neutral combat: difficulty table, tier decks, AI placement, AI targeting, 1-round time limit (continue for 1 MP / retreat), quick combat, XP awards, neutral discards | ✅ | Targeting ties are broken deterministically (lowest board position) instead of "player chooses". Clash rule "player to your right controls neutrals" 🔴 (AI controls them). |
| Player-vs-player combat on the map | ✅ | Attacker then defender placement, full card combat, loser pays 5 gold + negative morale, winner XP, defeated hero returns home. Surrender, town-action window before combat, siege 🔴. |
| Morale | 🟡 | Tokens, Necropolis immunity, spend-to-draw. Discard-redraw + reroll spends and the double-negative hand discard 🔴. |
| Experience/level ups | ✅ | Searches queue one at a time; azure kill jumps to level VII. |
| Default scenario | 🟡 | Built-in 2–3 player skirmish (flag the enemy town). Mission Book scenarios, starting resources/units per scenario 🔴 (dev defaults: 10g/5bm/2v, three bronze "few"). |

## Multiplayer / app

- ✅ Server-authoritative rooms, SSE live stream + polling fallback, seat switching, observer seat (hands hidden, all combats watchable).
- ✅ Discard-pile viewers (own pile, shared decks, neutral tier discards) and face-down deck visuals with counts.
- 🟡 Seats are open (anyone can sit anywhere) — no auth/claiming yet.
- 🔴 Persistence across server restarts (rooms are in-memory).
