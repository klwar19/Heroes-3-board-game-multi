# Bulwark faction — full card-generation runbook (browser + Gemini)

End-to-end instructions for the **local** Claude (the one with the `playwright`
MCP connected) to regenerate all 14 Bulwark unit-card faces in the game's real
card style, using a finished Castle card of the same tier as the visual
reference. Do everything yourself — **no sub-agents, no web fetching.** Every
file referenced here is already local in this repo.

## Before you start
- `/mcp` must show `playwright · connected`.
- You must be running from the repo root (`...\Heroes-3-board-game-multi`).
- Open gemini.google.com once with the browser and let the user log into Google
  (the `gemini-profile` remembers it afterward).
- Create the output folder: `out/bulwark/`.

## The loop — one ART per unit, shared across Few + Pack

The Few and Pack of a unit use the **same illustration** — only the frame format
differs (a Few has a cost bar; a Pack has a `# PACK` banner) along with the stats
and ability text. So generate the Few once, then **re-frame that exact art** into
the Pack. Repeat per unit (7 units → 14 faces).

### Step A — generate the FEW
1. Start a fresh Gemini chat (cleaner than reusing one). Enable the **Image**
   tool (`+` → "Hình ảnh" / "Image — create & edit", Nano Banana) so Gemini
   outputs an image.
2. Upload **two** local files, in this order:
   - the **Few reference card** for that tier (see Reference table), and
   - the unit's **Few art** file.
3. Send the **FEW template** with the row's title / stats / cost filled in. Add
   any agreed art direction (e.g. the Bulwark frozen-mountain-town atmosphere).
4. When the image appears, extract it full-res and **verify every field** — title,
   the 4 stat numbers, the cost bar, the ability banner. If anything is wrong,
   reply e.g. *"Regenerate. Defense must be 0, not 3; everything else stays."*
   Loop until exact. After ~3 bad tries, keep the best art and note the card for
   the programmatic-frame fallback instead of burning more attempts.
5. Save the approved Few as
   `out/bulwark/<Few basename, but .png>` (e.g.
   `out/bulwark/units-bulwark-bronze-kobolds-few.png`).

### Step B — derive the PACK from the approved Few (same art, new frame)
Do this as a **single-image minimal EDIT** of the approved Few, NOT a two-image
"reframe". Giving Gemini two images and asking it to "produce a Pack card" makes
it REPAINT the creature (different pose/anatomy) — confirmed failure. Feeding only
the finished Few and asking for a localized edit keeps the art pixel-faithful.

1. Start a fresh Gemini chat with the **Image** tool enabled.
2. Upload **one** file: the **approved Few PNG** you just saved.
3. Send the **PACK-FROM-FEW (edit) template**, filled with the Pack stats +
   ability.
4. Verify: the central illustration must be **identical to the Few**; only the
   bottom banner area and the changed stat numbers move. The banner MUST read the
   literal **`# PACK`** (a gold hash glyph + the word PACK, exactly like the
   reference Pack card). Gemini tends to render the `#` as a digit ("1 PACK") —
   if it does, reply: *"The banner must read '# PACK' with the literal hash glyph,
   not a number; change only that."* Loop until exact.
5. Save as `out/bulwark/<Pack basename, but .png>` (e.g.
   `out/bulwark/units-bulwark-bronze-kobolds-pack.png`).

Do NOT generate a separate Pack illustration — the per-unit Pack art files in
`public/assets` are not used as the visual source anymore; the Few art is the
single source of truth for both faces. (The tier's Pack **reference card** is now
only a visual guide for you, not an upload.)

## Reference cards (finished Castle cards — copy their frame/fonts/layout)
| Tier   | Few reference                              | Pack reference                              |
|--------|--------------------------------------------|---------------------------------------------|
| bronze | `units-castle-bronze-halberdiers-few.webp` | `units-castle-bronze-halberdiers-pack.webp` |
| silver | `units-castle-silver-crusaders-few.webp`   | `units-castle-silver-crusaders-pack.webp`   |
| gold   | `units-castle-golden-champions-few.webp`   | `units-castle-golden-champions-pack.webp`   |

(All are in `public/assets/`. "gold" tier uses the `golden` filenames.)

**Always upload the tier-matching reference card** (bronze/silver/gold) from the
table above — that is what makes the frame correct for the tier. The prompt only
tells Gemini to copy it.

## FEW prompt template
> You are recreating a physical trading card from the **Heroes of Might & Magic III
> board game**. Match that set's look exactly.
>
> **Image 1** is a FINISHED official card — treat it as the absolute template for
> everything structural: the frame and its tier color, the blue outer edge, the
> decorative corner filigree, the title banner, the small star in the top-right,
> the four stat icons down the left column (crossed swords, shield, red cross,
> running figure) each in its own beveled slot, the cost bar near the bottom, the
> empty ability banner below it, and the small © footer line. Reproduce its
> proportions, borders, bevels, fonts and font colors EXACTLY — same card, only
> the contents change.
>
> **Image 2** is concept art of the creature.
>
> **Depict EXACTLY ONE creature — a single individual. Never a pair, group, herd,
> pack or family, even if the concept art or unit name is plural. One subject only.**
>
> Produce ONE finished card, portrait orientation, as **high-resolution, crisp and
> print-quality** as you can:
> - **Redraw the creature from Image 2 as a brand-new, higher-quality
>   illustration — do NOT copy it pixel-for-pixel and do NOT paste it in.** Keep
>   the SAME subject, species, pose, composition, color palette and overall
>   mood/atmosphere, but repaint it from scratch with sharper detail, richer and
>   more dramatic lighting, cleaner anatomy, and a more polished, professional
>   finish; remove any blur or low-resolution artifacts. Render it as a **detailed,
>   semi-realistic digital fantasy illustration matching the EXACT art style of the
>   reference card's own artwork (Image 1)** — the clean Heroes of Might & Magic
>   character-art look. NOT an oil painting, NOT visible brush texture, NOT
>   cartoon. Treat Image 2 as a rough concept to elevate, not to reproduce. Fill
>   the whole art window behind the frame.
> - Title in the banner: **{TITLE}**
> - The four numbers beside the icons, top to bottom: **{ATK}, {DEF}, {HP}, {INIT}**
> - Star top-right: same as the reference.
> - Cost bar: recruit (hand icon) = **{RECRUIT}**; upgrade (up-arrows icon) = **{UPGRADE}**.
> - Ability banner: **{ABILITY_OR_EMPTY}**
> Render every number and letter sharp and perfectly legible. Keep the frame
> pixel-aligned and symmetrical. Do NOT add watermarks, extra icons, or any text
> not specified. **CRITICAL: the ONLY coin/gold icons allowed are the two small
> coin icons inside the cost-bar cells next to the recruit and upgrade numbers.
> Do NOT add any other coin, gold pile, gem, treasure or currency icon anywhere —
> especially not in the ability banner or the bottom-right corner. If the ability
> banner is empty, it must be COMPLETELY empty (no stray icon).** Output the
> maximum detail and resolution possible.

## PACK-FROM-FEW (edit) prompt template
Upload ONLY the approved **Few PNG**. (Fill {ATK},{DEF},{HP},{INIT} with the Pack
stats and note which differ from the Few so the model changes only those.)

**Banner styling rule (user directive):** both bottom banners use the card's
brown woodwork, NOT a pale/teal/cream fill. The **`# PACK`** banner = dark BROWN
background with GOLD text. The **ability** banner = dark BROWN background with
light CREAM / pale-yellow text (never a cream/white box with dark text, never a
green/teal tint). Gemini tends to invert these on the gold-tier cards — call it
out explicitly and verify.

**Pack-ability naming rule (user directive):** in a Pack's `{ABILITY}` text, OMIT
the parenthetical specialty NAME that the Pack newly introduces (the upgrade name
attached to the pack-only clause) — e.g. drop `(Freezing Shot)`, `(War Mammoth)`,
`(Teleport)`. Keep a parenthetical name only if it already appeared in that unit's
Few ability (e.g. Shamans keep `(Air Shield)` because the Few has it). Net effect:
no NEW name appears on the Pack that wasn't on the Few.
(Already-saved bronze packs — Kobolds `(Kobold Foreman)`, Mountain Rams `(Argali)`,
Snow Elves `(Steel Elf)` — predate this rule and were kept by the user; strip them
later only if consistency is requested.)

> This image is a finished **"Few"** trading card from the **Heroes of Might &
> Magic III board game**. EDIT it into the matching **"Pack"** version of the SAME
> card. This is a precise local edit, NOT a regeneration.
>
> Keep the entire creature illustration **100% pixel-identical** — do not repaint,
> redraw, restyle, re-pose, move, recolor or alter the creature, the background,
> the lighting, the frame, the title banner, the corner filigree, the star, or the
> stat icons in any way. Change ONLY these three things:
> 1. Replace the bottom **cost bar** (the hand + up-arrows row) with a single
>    horizontal **`# PACK`** banner styled like an official Heroes III Pack card —
>    a stylized gold hash/pound glyph (#) followed by the word PACK. Do NOT use a
>    digit or any number; it is the literal `#` symbol. Add a small ability-text
>    banner directly beneath it.
> 2. Update the four left-column stat numbers to read, top to bottom:
>    **{ATK}, {DEF}, {HP}, {INIT}** (only the ones that differ from the Few change).
> 3. Put this exact text in the new ability banner: **{ABILITY}**
>
> Keep everything else identical and pixel-aligned. **A Pack card has NO cost bar
> and therefore NO coin/gold icons at all — do NOT add any coin, gold pile, gem or
> currency icon anywhere (the ability banner takes only its small effect glyph, if
> any, never a coin).** Output at full resolution, crisp and legible.

Cost notation: "gold" = the coin icon, "gem" = the red valuables crystal icon.

## Note on "HD" / resolution
Gemini returns roughly a 1-megapixel image, so these prompts maximize *crispness
and detail* but won't emit a true 4K file. If you need genuinely high-res cards,
keep the approved PNGs and upscale them afterward (2x–4x) before the webp step —
ask the cloud session to add an upscale script, or use any image upscaler.

---

## The 14 cards (verified from src/data/factions/units.ts)

### 1. Kobolds — bronze
- **Few** `units-bulwark-bronze-kobolds-few` · Title **Kobolds** · ATK 2 DEF 0 HP 2 INIT 4
  · recruit **0 gold** · upgrade **2 gold** · ability banner **empty**
- **Pack** `units-bulwark-bronze-kobolds-pack` · Title **Kobolds** · ATK 2 DEF 1 HP 3 INIT 5
  · ability: *"Map: at the beginning of each Resource round, gain 1 gold (Kobold Foreman)."*

### 2. Mountain Rams — bronze
- **Few** `units-bulwark-bronze-mountain_rams-few` · Title **Mountain Rams** · ATK 2 DEF 1 HP 3 INIT 6
  · recruit **2 gold** · upgrade **4 gold** · ability banner **empty**
- **Pack** `units-bulwark-bronze-mountain_rams-pack` · Title **Mountain Rams** · ATK 2 DEF 1 HP 4 INIT 8
  · ability: *"Reduce any damage from spells by 1 (Argali)."*

### 3. Snow Elves — bronze
- **Few** `units-bulwark-bronze-snow_elves-few` · Title **Snow Elves** · ATK 3 DEF 0 HP 3 INIT 4
  · recruit **3 gold** · upgrade **5 gold**
  · ability: *"No combat penalty for attacking an adjacent unit."*
- **Pack** `units-bulwark-bronze-snow_elves-pack` · Title **Snow Elves** · ATK 3 DEF 1 HP 3 INIT 5
  · ability: *"No combat penalty for attacking an adjacent unit. This unit's attacks provoke no Retaliation (Steel Elf)."*

### 4. Yetis — silver
- **Few** `units-bulwark-silver-yetis-few` · Title **Yetis** · ATK 3 DEF 2 HP 4 INIT 5
  · recruit **6 gold** · upgrade **10 gold** · ability banner **empty**
- **Pack** `units-bulwark-silver-yetis-pack` · Title **Yetis** · ATK 3 DEF 2 HP 5 INIT 7
  · ability: *"At the start of its activation, this unit recovers from all negative effects."*

### 5. Shamans — silver
- **Few** `units-bulwark-silver-shamans-few` · Title **Shamans** · ATK 3 DEF 0 HP 5 INIT 5
  · recruit **7 gold** · upgrade **11 gold**
  · ability: *"+1 Defense against ranged attackers (Air Shield)."*
- **Pack** `units-bulwark-silver-shamans-pack` · Title **Shamans** · ATK 3 DEF 1 HP 6 INIT 6
  · ability: *"+1 Defense against ranged attackers (Air Shield). After the attack, reduce the target's Initiative by 2 next round (Freezing Shot)."*

### 6. Mammoths — gold (golden frame)
- **Few** `units-bulwark-golden-mammoths-few` · Title **Mammoths** · ATK 5 DEF 2 HP 7 INIT 5
  · recruit **12 gold** · upgrade **20 gold + 1 gem** · ability banner **empty**
- **Pack** `units-bulwark-golden-mammoths-pack` · Title **Mammoths** · ATK 5 DEF 2 HP 8 INIT 6
  · ability: *"+1 Defense while this unit is defending (War Mammoth)."*

### 7. Jotunns — gold (golden frame)
- **Few** `units-bulwark-golden-jotunns-few` · Title **Jotunns** · ATK 5 DEF 3 HP 8 INIT 6
  · recruit **18 gold + 1 gem** · upgrade **32 gold + 2 gems** · ability banner **empty**
- **Pack** `units-bulwark-golden-jotunns-pack` · Title **Jotunns** · ATK 6 DEF 3 HP 9 INIT 8
  · ability: *"At the start of its activation, this unit may teleport any one unit on the battlefield to an empty space, then act as normal (Teleport)."*

---

## Finalize (after all 14 PNGs are in out/bulwark/)
Convert them to the `.webp` files the game uses, overwriting the placeholders:

```powershell
npm install -D sharp
node scripts/png-to-webp.mjs out/bulwark public/assets
```

Then sanity-check that 14 webp files updated, and commit + push:

```powershell
git add public/assets/units-bulwark-*.webp
git commit -m "Replace Bulwark placeholder art with finished cards"
git push -u origin claude/kind-fermi-f8gz09
```

The `cardImage` paths in `src/data/factions/units.ts` already point at these
exact `.webp` names, so no code change is needed — the game picks them up.

## If Gemini keeps botching numbers/frame on a card
Don't fight it. Keep the best **art-only** result, and instead composite the
real frame + exact stats programmatically (see
`scripts/README-card-image-editing.md` for the API path, or ask the cloud
session to add a local compositor). Log which cards took that route so the
batch's status is honest.
