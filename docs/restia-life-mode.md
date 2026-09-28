# Restia — single-player life-sim RPG mode ("Otherworld Life")

A hidden, single-player farming / village-building / adventuring RPG set in Restia,
the world of the "Bin's Otherworld Chronicle" campaign. Bin (the summoned gamer) runs an
abandoned farm, rebuilds Dawnhollow village, befriends and romances its people, climbs
the Adventurers' Guild ranks and fights down the catacombs beneath the old capital.

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
  `node scripts/media.mjs publish --only assets/restia/`). Monsters, battle backdrops,
  music, Bin/Hikari/Elise/System standing art are the game's existing assets.

## Code map

- `src/restia/engine/` — pure TypeScript. `reducer.ts` `dispatch(state, action)` clones the
  state, routes the action, then settles quests, boards, story triggers and the 2 AM
  collapse. Invalid actions throw `ActionError` and leave the state untouched.
  Modules: `farm`, `social`, `quests`, `town` (building, shops, crafting, shrine, Admin
  Console), `battle` + `hex`, `dungeon`, `world` (zones, walking, field monsters, forage),
  `day` (sleep, pass-out, waiting), `items`, `party`, `scenes`, `save`.
- `src/restia/data/` — content: items, crops, characters, monsters (H3 sprite slugs),
  skills, NPCs (schedules, gift tastes, lines), story + heart-event scenes, quests,
  guild requests, System missions, perks, recipes, shops, buildings, zones, dungeon themes.
- `src/restia/ui/` — React views (world map, interiors, visual-novel scenes, hex battle,
  dungeon, menus) in one CSS module (`restia.module.css`).

## Art pipeline

1. `node scripts/restia/codex-gen-batch.mjs [keyGlob]` — Codex image_gen masters from
   `scripts/restia/codex-jobs.json` into the git-ignored `tmp/gen/restia/raw/`.
2. `node scripts/restia/build-restia-assets.mjs [--only tachie,chibi,backdrops,buildings,sheets,battle]`
   — background keying, sheet slicing and webp output into `public/assets/restia/`; party
   battle sheets go through `scripts/import-sprite-sheet.mjs` into
   `src/restia/data/battle-atlases.json` (the main creature atlas file is untouched).
3. `node scripts/media.mjs publish --only assets/restia/` and commit both manifests.

Zone walkability, building lots and NPC spots in `src/restia/data/zones.ts` were authored
against the generated maps; regenerating a map means re-checking those rectangles.

## Limitations (current)

- English only (all strings live in `src/restia/data`).
- One expression per character portrait; NPCs stand at schedule spots rather than walking
  between them.
- Balance numbers (EXP curve, monster stats, prices) are first-pass and untuned by play.
