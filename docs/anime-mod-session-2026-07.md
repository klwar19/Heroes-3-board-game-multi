# Anime mod — 2026-07 session summary (re-entry point)

Branch `claude/anime-mod-foundation-skadts`, 12 commits (`9b8f423..596dab9`, plus
one merge). This session took the Anime mod from "art proofs + a Field-Override
spine" to a **first playable wave of engine-wired, mutation-tested gameplay
systems**. Every system is **default OFF and byte-identical when off**, gated on
`GameSetupOptions.fieldOverrides` / `AnimeModOptions`, and covered by tests that
fail if the wiring is removed (CLAUDE.md §1/§1a).

Truth sources, in order: the code + tests (machine truth) → CLAUDE.md's "Field
Overrides & multi-pin tiles" section (what-runs-vs-limits) → `docs/anime-mod-plan.md`
(design + phase status) → this doc (the map).

## Shipped systems

| System | Flag | Key files | Tests | Runs / limits |
| --- | --- | --- | --- | --- |
| **Field Override system + 13 Ninefold hex locations** (wave 1 + wave 2 + audit) | `GameSetupOptions.fieldOverrides` (global; auto-ON with designer pins) + `AnimeModOptions` package gate | `src/data/map/field-overrides.ts`, `src/engine/field-overrides.ts`, `src/engine/tile-hex-placements.ts`, `src/data/anime/field-overrides.ts` | `src/engine/field-overrides.test.ts`, `anime-locations.test.ts`, `tile-hex-placements.test.ts`, `map-tokens.test.ts` | 13 single-hex kinds (9 xianxia + 4 isekai; 2 are equipment outfitters), multi-pin tiles (overrides+tokens on distinct slots), reveal-order + protection + elimination recovery. LIMITS: pool kinds readable in raw snapshots; no standalone off-tile override objects; `linh_tuyen` = +1 movement only (no cleanse); 8 hexes art-less (glyph fallback). |
| **Pháp Bảo artifacts** | `anime.xianxiaArtifacts` | `src/data/anime/artifacts.ts` | `src/engine/anime-artifacts.test.ts`, `src/data/anime/anime-artifacts.test.ts` | 5 original cards reusing wired arms (income permanent incl. new `requiresHeroInTown`, movement, atk/def reactions), deck-join on/off. LIMITS: 2 cards designed-not-shipped (await new arms); fancier halves deferred; 5 faces art-less (deck-back). |
| **Cultivation & Heavenly Tribulation** | `anime.cultivation` | `src/engine/anime-cultivation.ts` | `src/engine/anime-cultivation.test.ts`, `hero-board.test.tsx` | Per-hero realm 1/2/3 (auto on level-up / bank-win; realm 3 via `HEAVEN_TRIBULATION` map action), grants +1 hand / free reroll / +1 Power; cross-mod seams tested. LIMITS: no Foundation-Pill path; realm-2 gate is "≥1 bank won" (Secret Realms unshipped). |
| **Hero Grades** | `anime.heroGrades` | `src/engine/anime-hero-grades.ts`, `src/data/anime/hero-grades.ts` | `src/engine/anime-hero-grades.test.ts`, `hero-board.test.tsx`, `overlays.test.tsx` | Merit→grade 0-3 ladder ([3,7,12] thresholds) + 3-tier×3-node passive/skill tree; 5 Merit sources; per-family name registers. LIMITS: AI won't buy the Training Manual; combat skills = main hero's fights only. |
| **Equipment** | `anime.equipment` | `src/engine/anime-equipment.ts`, `src/data/anime/equipment.ts` | `src/engine/anime-equipment.test.ts`, `src/data/anime/equipment.test.ts` | 6 always-on hero items in 3 slots, bought at 2 outfitter hexes (Rèn Binh Các / Adventurer Outfitter), each a proven-seam reuse. LIMITS: no map-action button (shop-only); no designer pin for outfitters; combat items main-hero only; AI never buys; 6 icons art-less. |
| **Forced Battle Events (scripted neutral combats)** | none (scripted-field gated; content on `anime.bi_canh`, `anime.enabled`) | `src/data/map/combat-scripts.ts`, `src/engine/combat-scripts.ts`, `src/data/anime/combat-scripts.ts` | `src/engine/combat-scripts.test.ts` | 4 effect kinds (environment-stat / damage-pulse / place-obstacles / announce) at combat-start & round-start; V1 content = 2 Bí Cảnh scripts. LIMITS: fully automatic (no player window); NEUTRAL fights only; no designer/campaign attach surface yet. |
| **Visual-novel Story system** | none (map-designer timed-event trigger) | `src/data/story/scenes.ts`, `src/lib/story-language.ts`, `src/components/table/story-overlay.tsx` | `scenes.test.ts`, `story-language.test.ts`, `story-overlay.test.tsx`, `custom-setup.test.ts` | Bilingual EN/VI scene registry + `StoryOverlay` (typewriter/skip/history/choice-chaining) + one trigger (designer `{kind:"story"}` timed event). LIMITS: no campaign hooks in this layer, no karma/music/e2e, all art placeholder. |
| **Story-mode campaign hub + Chapter 1 of both campaigns + setup injection** | engine-free presentation; playable chapters set allowlisted `{enabled,cultivation,xianxiaArtifacts}` + `fieldOverrides` | `src/data/story/campaigns.ts`, `src/lib/campaign-progress.ts`, `src/lib/campaign-triggers.ts`, `src/app/story/page.tsx`, `src/components/adventure/hero-actions-dock.tsx` | `campaigns.test.ts`, `campaign-progress.test.ts`, `campaign-triggers.test.ts`, `story/page.test.tsx`, `server/campaign-setup-injection.test.ts` | 2 campaigns × 7 chapters (ch-1 playable each), progress store + unlock chain, live setup-injection through the normal action pipeline (`buildAdventureFromLobby` now carries `anime`+`fieldOverrides`), hero map-action dock. LIMITS: only ch-1 playable; protagonists presentation-only (core faction stand-in: Jianghu=Rampart, Bin=Tower); `mapPresetId` unused; no routes/karma/quest-log. |
| **Cross-mod coexistence gates (§3.8)** | n/a (guarantee layer) | (spans the above) | `src/engine/anime-coexistence.test.ts`, `src/server/anime-coexistence-soak.test.ts`, `src/components/anime-coexistence-display.test.tsx` | 4 gates: master byte-identical-when-off CONTROL, all-modules-on single-player soak to round 6, mixed-package no-cross-talk, simultaneous display. LIMIT: AI never buys Equipment in the soak (policy), so `EQUIPMENT_EQUIPPED` stays 0. |

## Art status (the drop-art-later contract)

27 declared art placeholders across 4 hygiene-tested registries; each runs today
on a fallback. The full image-gen shopping list — target path, size, a per-asset
prompt seed, and the exact promote step — is **`scripts/anime-art/ART-TODO.md`**.
Summary: 8 field-override hexes (512×512 webp), 5 Pháp Bảo card faces (743×1040
webp), 6 equipment icons (512×512 webp), 8 story assets (2×16:9 backgrounds + 6
character sprites). The editable Fuyuki/Azure Breeze unit-card proofs remain
art-only under `scripts/anime-art/` (not `public/`).

## Recommended next slices (default plan phase order — `docs/anime-mod-plan.md` §20)

The shipped systems pulled P0b/P0c + several §3/§5/§11/§12 rows forward. The
natural continuations, cheapest-first / highest-value-first:

1. **Isekai neutrals + banks (P2)** — the new-content ask; unlocks the isekai
   package's combat identity and gives the shipped isekai hexes real fights.
2. **Secret Realm banks + Elixir Pills (P7)** — closes the Cultivation realm-2
   adaptation (currently gated on any bank win) and the Foundation-Pill gap.
3. **Quest Guards + Traps + xianxia map locations (P8)** — the "designer wave";
   extends the Field-Override/timed-event spine already shipped.
4. **VN art + expression variants** — promote `STORY_ART_PLACEHOLDERS` (biggest
   visible upgrade for the shipped story/campaign layer), then add `-<expr>`
   sprite variants.
5. **Campaign chapters 2+ (P13–P15)** — the ch-2 unlock already renders "in
   development"; add `setup` + `scenes` per chapter, protagonists still on core
   faction stand-ins until anime towns (P1/P6) ship.

Deferred and unshipped throughout: anime TOWNS/factions/commanders (P1/P6/P9/P10/
P16), the destiny/karma substrate + Gods (P11), Adventurers' Guild (P3), Calamity
Waves (P4), Raid Bosses (P5), the Dungeon (P12). See §20 for the full table and
the "SHIPPED AHEAD OF PHASE ORDER" note.
