# Restia mode — "Cosmic Jester: Frostbitten Days"

A hidden, single-player farming / town-building / adventuring RPG set in **Haven**, the
first world of the Cosmic Jester story. Bin Chen — a broke delivery rider hired by the
trickster goddess Peri as her Jester — returns to the frozen frontier town of
**Frostbitten** after two missing months. He farms Pocket Haven (a pocket-dimension meadow
behind Garr's back door, never winter), rebuilds the town on
the Outpost Board (Frosthaven-style), finds his family again, befriends and romances the
townsfolk, climbs the Adventurers' Guild ranks and digs into the Old Temple Ruins.
(The route and code still use the name "Restia".)

## Story (first chapters)

- **Prologue (Earth):** Bracelet Boy flashback, the KFC livestream (pickup-line choice
  worth retroactive JP), Lily's hospital ward, the trash can and the sky rant, Peri in
  the bedroom. **Eos** free trial (tutorial battle), the next day, the **Contract**.
- **Haven, Chapter 1 "Snow on the Road Home":** Frostwood road (first rude-candle coin,
  frost wolf), front gate or the Frosted Mug's back door, reunion at Garr's hut (Bowy
  joins), Guild re-registration (Lysa, Corvin, Tessa, Dain, Mara, Kael, the Brinna twins),
  Frida at the Weaver's shrine, Hilda's collapsed forge, the frostcap shortage, the
  screaming frost-sprite log (rat fight), rebuilding Mitia's Apothecary (Mitia joins), the
  cat job (Hermit Rolf's coin tin, wolves), and the family dinner with the Buyer's
  envelope (Garr joins). Coins found are tracked in the `candleCoins` counter.
- **Later:** Tessa's Rank E test opens the Old Temple Ruins (Temple Chimera, Goblin King,
  Vesper, the Herald of the Ethereal Judge); Senna joins at Rank D; Dain is the rank-D spar.
- **Jester Shop story items:** three healing crystals for Lily (5 / 12 / 25 JP, in order)
  each play a call with Lily on Earth. They are story unlocks, not stat items.
- Story scenes: `src/restia/data/scenes-story.ts`; hearts/romance: `scenes-hearts.ts`
  (romance: Lysa, Hilda, Senna, Mara, Frida; family friendship events: Garr, Bowy, Mitia);
  triggers: `locationTriggers` in `engine/world.ts` and `storyTalk` in `engine/social.ts`.
- Saves from the original Dawnhollow version (save version 1) migrate: characters map to
  their Haven counterparts, and chapter 1 counts as played.

## Access

Main menu → the wrench **Modding** icon (top-right, beside the music switch) → password
`1234` → `/restia`. The password is a soft gate (`src/restia/gate.ts`), not security; the
unlock lasts for the browser session.

## Load, storage and servers

- `/restia` is its own route: `next/dynamic` with `ssr: false`, so the main game never
  downloads the mode's code. The menu only imports `src/restia/gate.ts` (a few lines).
- Pure client: no PartyKit, API or database traffic. Saves are browser `localStorage`
  (auto-save on sleep + three manual slots) with JSON export/import for other devices.
- Art is content-addressed media on R2 (`public/assets/restia/**`, ~8 MB, published with
  `node scripts/media.mjs publish --only assets/restia/`). Monsters are the game's existing
  H3 creature atlases and sounds; battlefields, effects and props are Restia's own; Bin's
  four expressions are the creator's own CJS art.
  Overworld figures reuse each character's battle sheet (no chibis).

## Farming

Pocket Haven's field (`engine/farm.ts`, `engine/day.ts`, crops in `data/crops.ts`):

- **Loop.** Clear debris (Sickle / Hammer / Axe), till (Hoe), plant in season, water.
  A crop grows one day each night its plot was watered (can, rain, sprinkler or a
  watering monster); fertilizer adds a chance of an extra day. Regrowing crops drop back
  a few days after each picking. Out-of-season crops wither when the season turns and
  must be cut (Sickle) before that soil takes seeds again. Dry, empty tilled soil may
  revert overnight; empty untilled plots may sprout weeds.
- **Crops** (30): every season has cheap Trading Post staples plus gated ones. Each
  crop's `unlock` condition gates its seeds in the shops (`seed()` in `data/shops.ts`
  adds the season) and keeps guild delivery requests to crops the player can grow.
  Pineapple / Mana Blossom / Moonberry need Trading Post 2; Golden Turnip needs
  Trading Post 3 and Farming 7 (also a rare Rift chest); Noel Grass the restored
  shrine; Ironleaf (smelts 4 -> iron ingot) Smithy 2; Lamp Grass Apothecary 2;
  Hot-Hot Fruit the Ember Vaults (floor 11; chests there drop its seeds). Crystal
  blooms harvest existing crystals: Stonepetal (earth, floor 5), Frostglass Lily (ice,
  floor 10), Emberbloom (fire, floor 15) at the Apothecary 2, each also found in that
  vault's chests; Windbell (wind) at the guild shop from rank C or from Snow Pixies.
  Toyherb seeds also turn up while foraging in spring/summer. Sprites 36-71 live on
  the second farm sheet (`farm/sheet-2.webp`), produce/dish icons on 6x3 sheet d.
- **Rain** waters every tilled plot for the day, including soil tilled after it started.
- **Sprinklers** (forged at the Smithy): Iron (4 neighbours), Silver (8 around),
  Mythril (5x5 square). Place one on a cleared, untilled field plot with hotbar slot 8;
  click it without a tool to pick it back up. Every morning each one waters the tilled
  plots in its pattern exactly like the can. Stored per plot (`Plot.sprinkler`).
- **Giant crops.** Potato, Melon, Pumpkin and Snow Radish: a 3x3 block of the same ripe
  crop has a 10% chance each night to fuse into one giant crop (not on the night before
  its season ends). Harvesting it yields what the nine plants would plus 6-12 extra and
  nine plants' farming XP; befriended monsters leave giant crops alone
  (`CropState.giant` = the block's top-left plot index).
- **Skill.** Farming XP comes from tool work and harvests; each level trims tool stamina
  and adds a chance of +1 per harvest.

## Battles

Hex board in the Heroes 3 layout, turn order by SPD. The rules port the CJS
engine's action economy (github klwar19/cjs-engine-ddboardgame).

- **AP.** A turn starts with 3 AP plus whatever was carried over: Defend carries +1
  (and gives DEF/RES x1.5 and +10% MP), ending a turn without acting (**Charge**) carries +2.
  One main action per turn. Basic attack 1 AP, skills 1-5 AP (plus MP), so
  4-5 AP skills need a charged turn; a boss charging is announced. **Movement** is a pool
  per turn (`battle.turn.movePts`, the unit's move stat), spent hex by hex (terrain and
  climbing cost more) in as many steps as you like before and after the action (hit and
  run); the turn ends once the action is done and nowhere is left to go. **Sprint** (1 AP,
  before the action) adds 2 move; **items** are a quick action (1 AP, one per turn, the
  turn goes on).
- **Board** (`engine/battle-field.ts`, `data/battlefields.ts`): painted battlefields per area
  with a biome that picks a layout (open, hills, plateau, ring, pass, river, barrels,
  hazards, islands, mound, peaks, boss arena) and fills it with ground and props.
  **Elevation**: hexes are 0-2 levels high (`BattleState.heights`, layouts in
  `ELEVATIONS`, "?" may raise a mound). Climbing a level costs 2 extra movement; a 2-level
  cliff can't be climbed (flyers can) and melee can't strike across it (counters neither).
  Striking down +15%/+25%, up -10%/-20% and -5% accuracy per level; ranged reach +1 per
  level; ground higher than both ends blocks line of sight; a shooter above an adjacent
  blocker sees over it. Knockback into rising ground slams; being knocked, dragged or
  sunk off a ledge costs 10% max HP per level (bosses excepted). Shaping never leaves a hex
  without a neighbour within one level. Drawn as textured columns
  (`battle/terrain/<set>-top|side.webp`) that rise and sink when skills reshape them.
  Terrain and mobility skills: Raise the Stage / Stage Dive / Encore (Bin), Glacier Rise /
  Avalanche (Mitia), Grapple Bolt / Plunging Volley (Bowy), Hook Line / Pitfall (Garr),
  Earthshaper / Seismic Drop (Hilda), Pinning Charge / Skyfall Lance (Senna) - SkillDef
  `move` (leap/dash/blink), `shape`, `pull`, `heightPower`, `indirect`. Their animations
  come from each character's skill sheet (`restia-<name>-sk`: victory, jump, two skill
  rows); anyone else falls back to attack/cast. Cover (-30% ranged/magic),
  ice/mud (2 move), thorns and fire (hurt on entry; fire burns), healing springs, mana
  crystals (pickup), water and chasms. Props: rocks and ice pillars block line of sight,
  crates block movement, powder barrels explode (chain reactions, fire sets them off),
  enemy ward totems give nearby foes DEF/RES +20% until broken. Arrows and projectile
  skills need line of sight; area skills are lobbed. Fire melts ice, ice puts out fire.
- **Board sizes** (`BOARD_SIZES`, `BattleSpec.size`, `BattleState.size/cols/rows`): small
  11x7, medium 15x9, large 19x11 on the fixed 19x11 hex stride (outside hexes are void).
  Story/event, spar and arena fights stay small on the authored layouts; field and dungeon
  fights pick a size by enemy count (`pickBoardSize`: 1-2 mostly small/medium, 3-4
  medium/large, 5+ large). Medium and large boards are generated (`generateBoard`):
  irregular hills (rim 1, summits 2), **crags** (height `CRAG_HEIGHT` = 3: nobody stands
  on or climbs them, flyers pass over, they block sight, can't be reshaped, knockback into
  them slams), the biome's cover/hazards/goodies/props, a stream (cloister), chasms (rift)
  or broken edges (frost, nave, ember). Validation: every standable hex is reachable by a
  walker from both deployment zones and back (cliffs levelled, blockers cleared), two-hex
  creatures get a way across and enough level spots. A randomly picked small layout gets
  the same walker check, and when a two-hex walker takes part a lane across (barrels,
  islands) is cleared or bridged without levelling the layout's hills. Enemies stand in small groups over
  the east ~40% on those boards; allies deploy in the west columns.
- **Movement skills** (`SkillDef.move`): **leaps** land on any free hex in range whatever
  the height or what is in between; **dashes** run a straight line at a foe (+15% power per
  hex; anyone in the way stops a walker, flyers swoop over units and land on a free hex next
  to the target); **blinks** teleport (BattleAnim `blink`). Leaps and blinks hit foes within
  `radius` of the arrival. Two-hex creatures use all three: every dash step reuses walking's
  per-step footprint check (`footprintStep`), every landing needs the whole footprint free,
  standable and level, and landing blows, knockbacks and pulls count from the nearer hex.
  Monster kits: Pounce (frost wolf, hell hound), Crushing Pounce (Temple Chimera), Trample
  Charge (boar, wolf rider, centaur, minotaur, black knight), Ram Charge (ram, argali),
  Crag Leap (argali), Swoop (harpy, serpent fly, bone and green dragons), Undertow (nix,
  water elemental), Tail Lash (basilisk, medusa), Blink (snow pixie, imp, lich, Vesper),
  Flame Step (efreet), Void Step (Herald), Sinkhole (minotaur), Earthen Rise (dendroid,
  kobold), Entangling Roots (dendroid). Charge and non-bomb items play a `pose` animation.
- **Objectives** (`BattleState.points`, `POINT_NAMES/POINT_HELP`): 1-3 on medium/large
  random boards, sometimes one on a small random board, preferring hilltops near the
  middle. **Healing Shrine** and **War Banner**: a unit ending its turn with its footprint
  on one captures it; the holder's side heals 5% max HP at each turn start per shrine /
  gets +10% ATK and MAG per banner. **Supply Cache**: the first ally to enter its hex opens
  it (gold and often an item, paid with the victory rewards: `BattleRewards.found`); an
  enemy entering it smashes it. Loot is lost on defeat or flight.
- **Events.** Weather follows the day outdoors (snow, blizzard, rain, storm) or the area
  (cloister rain, ember heat, rift gloom) and scales elements; blizzards/storms shorten
  ranged reach. Some dungeon and Frostwood fights have falling rocks/icicles marked a round
  ahead. Floor bosses fight in an arena and call two minions on round 3. The Jester System
  may post an **audience challenge** (win fast, hit weaknesses, crit finisher, nobody
  falls, explosion kill, high-ground hits, hold every point at once on boards with two
  or more shrines/banners) worth Jester Points, at most 3 per day.
- **Passives** (`data/passives.ts`, `data/passives-monsters.ts`, `engine/passives.ts`): pure
  data read by the engine (stat %, low-HP bonuses, regen, on-hit statuses, lifesteal,
  thorns, counters, first strike, backstab, pack, auras, immunities, shields, undying,
  death bursts...). Characters have one innate, jobs teach them, gear from Silver up and
  the forged accessories carry one, every monster has its own.
- **Statuses:** poison, burn, bleed (hurts when moving), sleep, stun, freeze, slow, root,
  silence, blind, mark (+25% damage taken), taunt; regen and haste. Bosses shake off hard
  control after one turn.
- **Jobs** (`data/jobs.ts`, `engine/jobs.ts`, Party menu): Fighter, Guardian, Ranger, Mage,
  Cleric, Rogue; advanced Knight, Berserker, Sniper, Elementalist, Sage, Assassin (need
  the base job at Lv 5); Jester (Bin only). Five levels each: permanent stats, skills at
  Lv 2/4, passives at Lv 1/3/5. Job EXP goes to the current job only; everything learned
  stays after switching. Change jobs outside the ruins.
- **EXP without grinding:** each member's share scales with the level gap to each foe
  (x0.15-x1.5), and the same species gives full EXP only for its first 3 kills each day
  (then -15% per kill, floor 25%; resets every morning). The results screen says why EXP
  was reduced.
- **Monster AI** (`engine/battle-ai.ts`): each monster's rules (`ai.rules` in
  `data/monsters.ts`) are tried top-down; a rule whose skill can't be paid for yet falls
  through so a following "charge" rule builds the AP. Otherwise every reachable hex x
  action is scored with the monster's style (aggressive, sniper, support, tank, swarmer,
  coward, caster, boss) plus terrain (hazards, warnings, springs, height, cover) and
  objectives (capturing shrines/banners, smashing caches on the way; always worth less
  than a kill or a solid hit), with a little seeded noise. Monsters also shoot barrels
  next to the party. Leaps and blinks are aimed at landing hexes whose strike reaches a foe,
  or (no strike) at clearly better spots: out of reach for shooters, casters, supports and
  cowards that started next to a foe, closer when nothing could be hit this turn, higher
  ground; dashes are judged where the run ends. Hazards and warnings at the landing count
  against a plan, taunted monsters don't reposition, and a movement-skill rule whose best
  plan is still a bad place falls through to the next rule. With nothing to hit this turn a
  monster closes in by the movement it still needs to reach a striking spot (round water,
  chasms, crags and cliffs), not by straight-line distance.
- **Presentation:** every skill has an impact effect, optional projectile and a sound from
  the game's library; monsters use their Heroes 3 creature voices
  (`data/unit-sounds.ts`, generated by `scripts/restia/build-unit-sounds.mjs`).

## Code map

- `src/restia/engine/` — pure TypeScript. `reducer.ts` `dispatch(state, action)` clones the
  state, routes the action, then settles quests, boards, story triggers and the 2 AM
  collapse. Invalid actions throw `ActionError` and leave the state untouched.
  Modules: `farm`, `social`, `quests`, `town` (building, shops, crafting, shrine, Admin
  Console), `battle` + `battle-ai` + `battle-field` + `passives` + `jobs` + `hex`, `dungeon`, `world` (zones, walking, field monsters, forage),
  `day` (sleep, pass-out, waiting), `items`, `party`, `scenes`, `save`.
- `src/restia/data/` — content: items, crops, characters, monsters (H3 sprite slugs),
  skills, NPCs (schedules, gift tastes, lines), story + heart-event scenes, quests,
  guild requests, System missions, perks, recipes, shops, buildings, zones, dungeon themes.
- `src/restia/ui/` — React views (world map, interiors, visual-novel scenes, hex battle,
  dungeon, menus) in one CSS module (`restia.module.css`).

## Art pipeline

1. `node scripts/restia/codex-gen-batch.mjs [keyGlob]` — Codex image_gen masters from
   `scripts/restia/codex-jobs.json` into the git-ignored `tmp/gen/restia/raw/`
   (`hv-*` maps/backgrounds/buildings/battle sheets, `hv2-tachie-*` portraits styled
   after official Blue Archive / Azur Lane / Sengoku Rance art, `hv5`/`hv6-tachie-*` final
   portraits, `hv6-bin-earth-*` Bin in Earth clothes, `hv6-battle-*` NPC battle sheets that
   also walk the overworld, `hv7-*` skill effects, projectiles, board props and battlefields,
   `hv8-tex-*` hill textures, `hv8-skill-*` the main characters' extra-move sheets).
   References live in
   `tmp/gen/restia/refs/` (Bin's cutouts are copied to `raw/user-bin-*.png`).
2. `node scripts/restia/build-restia-assets.mjs [--only tachie,bin,backdrops,buildings,sheets,battle,battleArt,terrain,skillSheets]`
   — background keying, sheet slicing and webp output into `public/assets/restia/`; party
   battle sheets go through `scripts/import-sprite-sheet.mjs` into
   `src/restia/data/battle-atlases.json` (the main creature atlas file is untouched).
3. `node scripts/media.mjs publish --only assets/restia/` and commit both manifests.

Zone walkability, building lots and NPC spots in `src/restia/data/zones.ts` were authored
against the generated maps; regenerating a map means re-checking those rectangles.

## Limitations (current)

- English only (all strings live in `src/restia/data`). Music reuses the game's tracks until
  the creator supplies more.
- One expression per character portrait; NPCs stand at schedule spots rather than walking
  between them.
- Balance numbers (EXP curve, monster stats, prices) are first-pass and untuned by play.
