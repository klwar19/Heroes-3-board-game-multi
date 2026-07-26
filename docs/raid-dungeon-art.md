# Raid Bosses, Calamity Gate & Dungeon — finished art pipeline

The PvE modules use painted raster masters generated with OpenAI's built-in
ImageGen tool. The generated PNG masters and exact prompt provenance live in:

- `scripts/anime-art/raw/bosses/`
- `scripts/anime-art/raw/bosses/PROMPTS.md`
- `scripts/anime-art/raw/battlefields/`
- `scripts/anime-art/raw/battlefields/PROMPTS.md`

`scripts/build-raid-dungeon-art.mjs` is the deterministic compositor. It reads
those masters, adds the board-game frame, titles and functional health-layer
pips, then writes compressed WebP assets. Re-running the script does not replace
the painted work with procedural illustrations.

## Boss card contract

Every boss face is **743×1040** and renders through
`CombatUnitState.assets.cardImage`.

| Output | Encounter |
| --- | --- |
| `goblin_king.webp` | Classic raid boss |
| `colossal_titan.webp` | Classic raid boss |
| `abyss_kraken.webp` | Classic raid boss |
| `calamity_dragon.webp` | Classic raid boss |
| `avatar_of_erebos.webp` | Classic raid boss |
| `cyberdemon_prime.webp` | Doom raid boss |
| `spider_overmind.webp` | Doom raid boss |
| `minotaur_of_the_depths.webp` | Classic floor-5 boss |
| `floor_wyrm.webp` | Classic floor-10 boss |
| `doom_baron_warden.webp` | Doom floor-5 boss |
| `doom_cyberdemon_tyrant.webp` | Doom floor-10 boss |
| `custom_boss.webp` | Abstract face for designer-created bosses |

Every floor boss has a dedicated titled portrait and functional health-layer
count; Dungeon art is not aliased to the scheduled Raid Boss faces.

## Map-object contract

Every map object is **512×512**, centered with a safe margin because the board
clips it to a hex.

| Output | Theme |
| --- | --- |
| `calamity_gate_classic.webp` | Erathian Calamity Gate |
| `calamity_gate_doom.webp` | Doom Calamity Gate |
| `rift_lair_classic.webp` | Erathian Raid Boss Rift |
| `rift_lair_doom.webp` | Doom Raid Boss Rift |
| `dungeon_gate_classic.webp` | Erathian Dungeon entrance |
| `dungeon_gate_doom.webp` | Doom Dungeon entrance |

`rift_lair_field.webp` and `dungeon_gate_field.webp` remain compatibility
aliases of the classic art for old snapshots and any code that still references
the legacy names.

## PvE-only battlefield contract

Wave assaults, Rift Lair attempts, and Dungeon floor fights use one of two
theme-locked board pairs. Ordinary guards, Creature Banks, sieges, naval fights,
PvP, and the sandbox never enter this pool.

| Output pair | Theme |
| --- | --- |
| `battlefield-4x5-pve-calamity-classic[-scenery].webp` | Erathian arcane rift |
| `battlefield-4x5-pve-calamity-doom[-scenery].webp` | Doom infernal breach |

The scenery strip is **2500×520**. The orthographic play surface is
**2500×2000**, with its exact five-column × four-row grid added by
`scripts/build-pve-battlefields.mjs` rather than left to image generation.

## Rebuild and verify

```powershell
node scripts/build-raid-dungeon-art.mjs
node scripts/build-pve-battlefields.mjs
npx vitest run src/engine/boss-abilities.test.ts
```

Keep output paths and dimensions stable. If a master is replaced, update its
entry in `PROMPTS.md`, rebuild all outputs, and visually inspect both the
portrait crop and the small hex crop before committing.
