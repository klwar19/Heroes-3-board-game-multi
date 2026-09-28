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

## Battles

Hex board (11x7) in the Heroes 3 layout, turn order by SPD. The rules port the CJS
engine's action economy (github klwar19/cjs-engine-ddboardgame).

- **AP.** A turn starts with 3 AP plus whatever was carried over: Defend carries +1
  (and gives DEF/RES x1.5 and +10% MP), ending a turn without acting (**Charge**) carries +2.
  One move and one main action per turn. Basic attack 1 AP, skills 1-5 AP (plus MP), so
  4-5 AP skills need a charged turn; a boss charging is announced. **Sprint** (1 AP, before
  moving) adds 2 move; **items** are a quick action (1 AP, one per turn, the turn goes on).
- **Board** (`engine/battle-field.ts`, `data/battlefields.ts`): painted battlefields per area
  with a biome that picks a layout (open, hills, plateau, ring, pass, river, barrels,
  hazards, islands, boss arena) and fills it with ground and props. High ground (+15%
  damage down, ranged reach +1, sees over an adjacent blocker), cover (-30% ranged/magic),
  ice/mud (2 move), thorns and fire (hurt on entry; fire burns), healing springs, mana
  crystals (pickup), water and chasms. Props: rocks and ice pillars block line of sight,
  crates block movement, powder barrels explode (chain reactions, fire sets them off),
  enemy ward totems give nearby foes DEF/RES +20% until broken. Arrows and projectile
  skills need line of sight; area skills are lobbed. Fire melts ice, ice puts out fire.
- **Events.** Weather follows the day outdoors (snow, blizzard, rain, storm) or the area
  (cloister rain, ember heat, rift gloom) and scales elements; blizzards/storms shorten
  ranged reach. Some dungeon and Frostwood fights have falling rocks/icicles marked a round
  ahead. Floor bosses fight in an arena and call two minions on round 3. The Jester System
  may post an **audience challenge** (win fast, hit weaknesses, crit finisher, nobody
  falls, explosion kill, high-ground hits) worth Jester Points, at most 3 per day.
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
  coward, caster, boss) plus terrain (hazards, warnings, springs, height, cover), with a
  little seeded noise. Monsters also shoot barrels next to the party.
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
   also walk the overworld, `hv7-*` skill effects, projectiles, board props and battlefields).
   References live in
   `tmp/gen/restia/refs/` (Bin's cutouts are copied to `raw/user-bin-*.png`).
2. `node scripts/restia/build-restia-assets.mjs [--only tachie,bin,backdrops,buildings,sheets,battle,battleArt]`
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
