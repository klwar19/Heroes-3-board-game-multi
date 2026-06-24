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

## The loop — repeat for each of the 14 faces in the table below
1. Start a fresh Gemini chat (cleaner than reusing one).
2. Upload **two** local files:
   - the **reference card** for that row's tier+side (see "Reference" column), and
   - the unit's **art** file (the "Art file" column).
3. Send the matching prompt (FEW template or PACK template) with that row's
   title / stats / cost / ability filled in.
4. When the image appears: screenshot it and **verify against the row**, every
   field — title, the 4 stat numbers, the cost bar (Few) or the `# PACK` banner
   (Pack), and the ability text. If anything is wrong, reply e.g.
   *"Regenerate. Defense must be 0, not 3; everything else stays."* Loop until
   it's exact. After ~3 bad tries, keep the best art and note the card for the
   programmatic-frame fallback instead of burning more attempts.
5. Download the approved image and save it as
   `out/bulwark/<exact basename from the Art-file column, but .png>`.
   e.g. art `units-bulwark-bronze-kobolds-few.webp` → save
   `out/bulwark/units-bulwark-bronze-kobolds-few.png`.
6. Next row.

## Reference cards (finished Castle cards — copy their frame/fonts/layout)
| Tier   | Few reference                              | Pack reference                              |
|--------|--------------------------------------------|---------------------------------------------|
| bronze | `units-castle-bronze-halberdiers-few.webp` | `units-castle-bronze-halberdiers-pack.webp` |
| silver | `units-castle-silver-crusaders-few.webp`   | `units-castle-silver-crusaders-pack.webp`   |
| gold   | `units-castle-golden-champions-few.webp`   | `units-castle-golden-champions-pack.webp`   |

(All are in `public/assets/`. "gold" tier uses the `golden` filenames.)

## FEW prompt template
> I'm giving you two images. Image 1 is a FINISHED reference card — copy its
> exact style: the frame, the colored outer edge, the title banner at top, the
> small star in the top-right corner, the four stat icons down the left side
> (crossed swords, shield, red cross, running figure), the cost bar near the
> bottom, the empty ability banner, and the same fonts and layout. Image 2 is
> creature artwork. Produce ONE new card in that exact style:
> - Portrait: the creature from Image 2, filling the central art window.
> - Title: **{TITLE}**
> - Numbers beside the four left icons, top to bottom: **{ATK}, {DEF}, {HP}, {INIT}**
> - Star: same as the reference.
> - Cost bar: recruit (hand icon) = **{RECRUIT}**; upgrade (up-arrows icon) = **{UPGRADE}**.
> - Ability banner: **{ABILITY_OR_EMPTY}**
> Keep every number crisp and exactly as written. Do not add any other text or
> change the layout.

## PACK prompt template
> I'm giving you two images. Image 1 is a FINISHED reference PACK card — copy its
> exact style, including the **`# PACK` banner** in the lower-middle (where a Few
> card's cost bar would be), the frame, the title banner, the top-right star, the
> four left-side stat icons, and the bottom ability banner with the same fonts
> and layout. Image 2 is creature artwork. Produce ONE new PACK card in that exact
> style:
> - Portrait: the creature from Image 2, filling the central art window.
> - Title: **{TITLE}**
> - Numbers beside the four left icons, top to bottom: **{ATK}, {DEF}, {HP}, {INIT}**
> - Keep the **`# PACK`** banner exactly like the reference.
> - Ability banner text: **{ABILITY}**
> Keep everything crisp and exactly as written. Do not add other text or change
> the layout.

Cost notation: "gold" = the coin icon, "gem" = the red valuables crystal icon.

---

## The 14 cards (verified from src/data/factions/units.ts)

### 1. Kobolds — bronze
- **Few** `units-bulwark-bronze-kobolds-few` · Title **Kobolds** · ATK 2 DEF 0 HP 2 INIT 4
  · recruit **0 gold** · upgrade **2 gold** · ability banner **empty**
- **Pack** `units-bulwark-bronze-kobolds-pack` · Title **Kobolds** · ATK 2 DEF 1 HP 3 INIT 5
  · ability: *"Map: at the beginning of each Resource round, gain 1 gold (Kobold Foreman)."*

### 2. Mountain Rams — bronze
- **Few** `units-bulwark-bronze-mountain_rams-few` · Title **Mountain Rams** · ATK 2 DEF 1 HP 3 INIT 4
  · recruit **2 gold** · upgrade **4 gold** · ability banner **empty**
- **Pack** `units-bulwark-bronze-mountain_rams-pack` · Title **Mountain Rams** · ATK 2 DEF 1 HP 4 INIT 5
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
- **Pack** `units-bulwark-silver-yetis-pack` · Title **Yetis** · ATK 3 DEF 2 HP 5 INIT 6
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
  · ability: *"As a regular movement, this unit can move to any empty space (Teleport)."*

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
