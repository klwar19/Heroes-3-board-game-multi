# Wake of Gods (WOG) option

WOG is an optional module available only under **House rules BINH**.

## Setup flow

1. Select House rules BINH.
2. Click the WOG crest to enable the mod.
3. Click **Mod options** to open the compact setup window.
4. Choose modules:
   - New neutral creatures (implemented: adds 15 WOG cards to matching Neutral decks)
   - Commanders (implemented: every player gets their faction's battlefield
     commander — grades, command abilities, specialties, combos, death/revive;
     see the "Commanders" section below and CLAUDE.md for the full contract)
   - New adventure objects (selection persisted; content is a future slice)

Switching to Legacy immediately disables WOG. Older saves without `wog` remain WOG-off.

## Commanders (implemented — board-game adaptation)

Content tables in `src/data/commanders.ts`, engine in `src/engine/commanders.ts`
plus wiring across the reducer/adventure layers; behaviour pinned in
`src/engine/wog-commanders.test.ts` and `src/engine/wog-commander-casts.test.ts`
(every mechanic has a test with a CONTROL that fails if the wiring is removed).
The shipped system is the BOARD adaptation (grades 1-3, two combos), NOT the
WoG PC reference tables — see CLAUDE.md's "WOG Commanders" section for what
runs verbatim vs. the documented adaptations, and docs/wog-commanders-plan.md
for the design history and art pipeline.

## Neutral creature slice

The roster, supplied A/D/HP/I values, tiers, gold costs and adaptations live in
`src/data/wog.ts`. All printed mechanics in this neutral-creature slice are engine-backed:

- ranged combat-penalty waivers;
- Arctic Sharpshooter's +1 Defense against ranged attacks;
- double ranged attack for Sylvan Centaur;
- Nightmare's Death Stare;
- Lava Sharpshooter and Hell Steed's 1-damage Fire Shield;
- Gorynych's gold-tier 5/2/7/8, 25-gold profile and no-retaliation Attack-4 adjacent sweep;
- Dracolich's Devil-style move-to-any-empty-space, no-melee-penalty (ignore the
  combat penalty vs. adjacent units), ongoing-effect immunity, -2 Spell damage,
  and recruitable 45-gold + 2-valuables Azure profile (Attack 7 / Defense 2);

- Ghost's persistent +Health Soul Harvest and full heal (a bronze-tier guard);
- school-specific Messenger damage protection;
- War Zealot's free innate Magic Mirror;
- Sylvan Centaur's minimum-0 Attack die;
- Werewolf's Astrologers-round forced attack/+Attack and temporary weak summon;
- Hell Steed's elemental Magic Arrow attack and attack-created Fire Wall;
- Santa Gremlin's extra neutral Gremlin guard and post-victory Resource die;
- Dracolich's defensive Attack-die armor roll and Lich-style Attack-4 spread shot.

## Card-art pipeline

The original WoG creature images are used only as identity/silhouette reference.
The built-in image generator creates new HD painterly art windows. The builder
then composites those windows into the exact neutral Bronze/Silver/Gold/Azure
frames and uses the project's SVG copies of the official board-game legend
glyphs. No frame, statistic, rules text, number or symbol is baked into the art.

Shared generation prompt:

```text
Use case: stylized-concept
Asset type: HD creature-card illustration window (art only)
Input images: Image 1 is a visual reference for the creature's canonical WoG
identity, silhouette, costume and palette; it is not an edit target.
Primary request: Create an original, professionally finished painterly fantasy
illustration of the named creature in its specified environment.
Style/medium: richly rendered classic heroic-fantasy board-game oil painting;
realistic anatomy and materials; visible painterly texture; dramatic but readable.
Composition/framing: portrait-friendly near-square composition; exactly one
creature; full silhouette or three-quarter body; centered; generous breathing
room; safe to crop to a 540:594 card-art window.
Constraints: illustration only; no card frame; no UI; no text; no numbers; no
icons; no logos; no watermark; no extra characters; no cropped head or limbs.
```

The per-creature scene direction is encoded by the saved final artwork under
`scripts/neutral-unit-art/wog_*.png`. Rebuild cards with:

```powershell
node scripts/build-placeholder-neutral-cards.mjs wog_ghost wog_air_messenger
```

Pass any set of `wog_<slug>` names, or run without names to rebuild the full
neutral-card set.
