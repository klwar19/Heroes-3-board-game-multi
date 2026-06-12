# Content Tracker

Running inventory of every imported game component: what is in the app, what it still needs, and where it came from. Update this file with every content change.

Sources: community rulebook rewrite ("the rulebook", https://github.com/qwrtln/Homm3BG-build-artifacts → `main_en.pdf`), fan wiki (https://en.homm3bg.wiki/), community scenario editor tile geometry (https://github.com/Zedero/HoMM3BoardgameScenarioEditor). All stats/texts are fan transcriptions — **verify against official owned components before any release**.

Legend: ✅ playable · 🟡 data present, rules effect not implemented · 🔴 missing.

## Map tiles (`src/data/map/tile-defs.ts`)

| Group | Tiles | Status | Notes |
| --- | --- | --- | --- |
| Starting | S1 (Necropolis), S2 (Dungeon), S3 (Castle) | ✅ | Field lists from the wiki; outer impassable edges from the editor geometry. |
| Starting (expansion factions) | S4 (Rampart), S5 (Fortress), S6 (Inferno) | 🟡 | Data imported; factions not playable yet. |
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
| Pandora's Box | 🟡 | Dice options work. Pandora's Box card deck (Stretch Goals) 🔴. |
| Stables / Sanctuary / Trading Post | ✅ | Full choose-one menu with a market panel UI (trade table image from the rulebook back cover): repeatable resource trades, sell one card for 1 gold (Specialty/Statistic/starting Ability/Magic Arrow excluded, card removed from the game), or buy a war machine at the higher price. Trading locks out the other two options within a visit, as printed. |
| War Machine Factory | ✅ | Sells the five war machines at their lower price (shared one-copy supply; bought cards go to the buyer's hand and then live in their deck). |
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
- Implemented unit abilities: unlimited retaliation (Griffins), attack reroll (pack Crusaders), **double attack** (pack Marksmen — second shot at non-adjacent targets, stops at 2), **double attack on −1/0** (pack Elves), **no retaliation** (Vampires, pack Harpies, Cerberi, Arch Devils), **no adjacent-shot penalty** (pack Zealots/Evil Eyes/Medusas, Sharpshooters, Halflings), **teleport move** (pack Arch Devils), and the printed multi-target attacks:
  - **Liches' Death Cloud** (pack + neutral): a full separate second attack against a chosen unit adjacent to the original target — friend, foe, or the Liches themselves (wiki FAQ), mandatory when a candidate exists, instants playable on it, die rolled at base attack 2, resolved **before** the original target's retaliation, never chains a third attack.
  - **Magog fireball splash** (pack + neutral): 1 flat damage to **one chosen** unit adjacent to the target, only when the target is not adjacent to the Magogs; a lone friendly candidate takes the hit (mandatory per FAQ).
  - **Cerberi second head** (pack + neutral): 1 flat damage to another **enemy** unit adjacent to the Cerberi, chosen by the attacker.
  - Neutral-controlled Liches/Magogs/Cerberi auto-resolve these choices by the AI target priority (enemy units first; forced friendly hits spare the strongest).
  Remaining printed abilities are display-only (`abilityText`) — e.g. Halberdier discard-to-ignore-die, vampire drain heal, dragon breath line attack, Dendroid root.
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
| War machines: First Aid Tent, Ammo Cart, Ballista, Catapult, Cannon | ✅ | Permanent cards (one in play per player; playing another discards the first). FAT heals 1 once per combat round; Ammo Cart waives the ranged penalties and gives ranged units +2 initiative; Ballista auto-hits the slowest enemy at every round start (ties pause for the owner); Catapult may pay 1 material for 1 damage to two adjacent targets (walls/gate pending sieges); Cannon may spend 1 expert use for 2 damage. Bought at the Factory (3/5/7/8/10 gold) or Trading Post (6/8/10/12/14). Catapult/Cannon card scans missing on the wiki — text fallback renders. |
| Schools of Magic: Fire/Water/Air/Earth Magic | ✅ | Permanents: +1 power for the school's spells while in play (Magic Arrow counts for every school); expert discards the card — from hand or from play — for +3 power on one matching cast (replaces the +1, costs an expert use). |
| Hero specialties (18) | see Heroes | I-level for might heroes + Rion implemented. |
| Remaining official spell/ability/artifact decks | 🔴 | Dozens of cards still to import (see wiki indexes). |
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
| Morale | ✅ | All three printed spends: draw 1, discard-any-draw-that-many, reroll any die (attack die via the reroll window, Treasure/Resource dice via the roll prompt). Max one positive/negative token; a second negative discards the hand at turn end; Necropolis immune. |
| Experience/level ups | ✅ | Searches queue one at a time; azure kill jumps to level VII. |
| Scenario sheets (`src/data/map/scenarios.ts`) | 🟡 | Map-setup phase: pick faction + hero in the lobby **and set the game options** — scenario, neutral difficulty (Easy/Normal/Hard/Impossible, **Impossible default**, table verified against rulebook p. 91 and the wiki), starting resources, base resource gain (default **10 gold / 0 materials / 0 valuables**), starting unit tiers, pre-built buildings (validated per faction). Any seated player adjusts them until the start; everything syncs over the action stream. Built-in "Border Skirmish" still uses development numbers for the rest until the printed Mission Book sheets are transcribed. |

## Multiplayer / app

- ✅ Server-authoritative rooms, SSE live stream + polling fallback, seat switching, observer seat (hands hidden, all combats watchable).
- ✅ Combat deployment by drag & drop: drag units from the panel onto your two rows, drag placed units to new spaces, click flow still works; the board orients by side (your rows nearest your hand) in adventure combats.
- ✅ Ability-target choices (Death Cloud, splash, Cerberi bite, neutral target ties) highlight the candidate units on the board (click to choose) with a prompt-tray fallback.
- ✅ Adventure event feed: visits, gains, dice, experience, morale, flags, fight starts/reveals/outcomes pop as toasts; each carries a named sound cue (`ADVENTURE_FEED_CUES`) as the future audio hook.
- ✅ Tile art hides the built-in location icons (live state stays); the printed yellow borders render per scanned hex edge.
- ✅ Building art slots (`assets.image`/`assets.icon` on every town building) render in the town panel as soon as URLs land.
- ✅ Map ↔ battle switching during combats; hero-walk arrow animations on every seat; pan/zoom map with a tile-art layer (scenario-editor scans now, drop-in slot for real art).
- ✅ PartyKit scaffold (`party/index.ts` + `src/lib/realtime.ts`): one Cloudflare Durable Object per room, WebSockets at the edge, Durable Object storage persistence; enabled via `NEXT_PUBLIC_PARTYKIT_HOST`.
- ✅ Discard-pile viewers (own pile, shared decks, the Astrologers deck, neutral tier discards) and face-down deck visuals with counts.
- 🟡 Seats are open (anyone can sit anywhere) — no auth/claiming yet.
- 🟡 Next.js fallback store is in-memory; the PartyKit backend persists rooms in Durable Object storage.
