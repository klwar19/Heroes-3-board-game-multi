# Wake of Gods — Commanders (design + card-art prep)

> **Status: ENGINE GAMEPLAY IMPLEMENTED (board-game adaptation).** The shipped
> system is the grade-0–3 / 15-combination-skill BOARD adaptation in
> `src/data/commanders.ts` + `src/engine/commanders.ts`, pinned by
> `src/engine/wog-commanders.test.ts`, `wog-commander-casts.test.ts` and
> `wog-commander-combos.test.ts`. **The WoG PC reference NUMBERS in §3–§5
> below did NOT ship** — they remain as design history (the 5-tier primary
> skills became grades 0–3 per stat; §5's fifteen secondary skills ARE now
> wired, board-adapted, unlocking at grade 3 + grade 2 of their pair).
> CLAUDE.md's "WOG Commanders" section is the authoritative list of what runs
> verbatim vs. the documented adaptations.

Reference (fan pages, HTTP-only — mirror the numbers, not the site):
- Sorts of commanders: <http://www.heroesofmightandmagic.com/wakeofgods/comm2.shtml>
- Commander skills: <http://www.heroesofmightandmagic.com/wakeofgods/comm3.shtml>

Original WoG battle sprites saved as *identity reference only* under
`scripts/commander-art/reference/` (paladin, hiero, temple, succ, brute, soul,
ogre, shaman, astral + the six primary-stat icons + the WoG logo). As with the
neutral-creature slice, these silhouettes are **not** edit targets — we generate
new HD painterly art windows and composite them into the project's card frames.

---

## 1. What a Commander is

A Commander is a persistent, hero-attached battlefield champion (one per faction).
It is placed like a unit but levels up with the hero, gains primary-skill tiers
and unlockable secondary skills, and can cast one signature spell. Two layers:

- **Base layer (always shown on the card):** faction, portrait/art, the base
  stat line, and the two signature abilities.
- **Growth layer (the click-to-expand "option bar"):** the six primary skills
  (5 tiers each, pick 4 of 6) and the fifteen secondary skills unlocked by
  Master-tier pairs. This is what the user asked to surface behind an option bar
  so it can be edited/previewed without cluttering the base face.

---

## 2. The roster (10 cards)

Nine are on `comm2.shtml`; **Cove has no WoG commander** (WoG predates HotA), so we
design one to complete the set — flagged below as an original addition.

| # | Commander | Faction | Signature abilities (verbatim from comm2) | Reference sprite |
|---|-----------|---------|-------------------------------------------|------------------|
| 1 | **Paladin** | Castle | **Wise** — Gains 150% of Hero's experience. · **Cure** — May cast Cure. | `reference/paladin.jpg` |
| 2 | **Hierophant** | Rampart | **First Aid Master** — Additional First Aid Tents, Number = Commander Level. · **Shield** — May cast Shield [Duration = Magic Power]. | `reference/hiero.jpg` |
| 3 | **Temple Guardian** | Tower | **Mana Magician** — Restores some spell points for Hero if lost since previous Commander turn (Lost Mana × (20% + 5% × Commander Level); min 1, max 90% of lost). · **Precision** — May cast Precision [Duration = Magic Power]. | `reference/temple.jpg` |
| 4 | **Succubus** | Inferno | **Charming** — Steals a portion of neutral stacks before combat: 5% + (Level−1)/2, max 20%. · **Fire Shield** — May cast Fire Shield [Duration = Magic Power]. | `reference/succ.jpg` |
| 5 | **Brute** | Dungeon | **Soul Reformer** — Gives 50% of battle experience in gold. · **Bloodlust** — May cast Bloodlust [Duration = Magic Power]. | `reference/brute.jpg` |
| 6 | **Soul Eater** | Necropolis | **Undead** — Has the properties of an undead creature. · **Animate Dead** — May cast Animate Dead on Level 1–5 creatures [HP = (Magic Power/4)×50 + 60]. | `reference/soul.jpg` |
| 7 | **Ogre Leader** | Stronghold | **Ballista Master** — Provides additional Ballistas, #= Level/4 + 1 (plus control). · **Stone Skin** — May cast Stone Skin [Duration = Magic Power]. | `reference/ogre.jpg` |
| 8 | **Shaman** | Fortress | **Superior Combat Ability** — 150% of Hero's Attack and Defense. · **Haste** — May cast Haste (Speed + 5) [Duration = Magic Power]. | `reference/shaman.jpg` |
| 9 | **Astral Spirit** | Conflux | **Pacifist** — Elemental; 5% + (Level−1)/2 (max 20%) of creatures in enemy Hero's army run away. · **Counterstrike** — May cast Counterstrike [Duration = Magic Power]. | `reference/astral.jpg` |
| 10 | **Corsair** *(Cove — original, not in WoG)* | Cove | **Plunder** — after a won combat, gain gold scaling with Commander Level (design TBD). · **Fortune** — May cast Fortune [Duration = Magic Power]. | *to generate (pirate sea-captain)* |

> The Cove "Corsair" name/abilities are a **proposed original** to round out the
> 10-faction set; confirm before wiring. Its abilities intentionally mirror the
> WoG template (one economy/utility passive + one signature spell already in our
> spell art set — Fortune icon exists at `specialty-card/icon-fortune.webp`).

---

## 3. Base stats (WoG source formulas — reference, pre board-game adaptation)

From `comm3.shtml`, a Commander with **no** points in a skill uses these bases:

| Stat | Base (no skill) |
|------|-----------------|
| Attack | 5 |
| Defense | 5 |
| Hit Points | 20 + Level×20 |
| Damage | 8 + Level×4 |
| Magic Power | 1 (may cast 1×, 5% Magic Resistance) |
| Speed | 4 |

These are **PC-game scale**, not our board-game A/D/Health/Initiative + gold-cost
scale. For the card face we will show a board-adapted line (Attack / Defense /
Health / Initiative) with placeholder values to be tuned later — the user asked to
"leave room to edit later," so the generated card art bakes **no numbers**; stats
are composited by the build script and trivially editable in the card data table.

---

## 4. Primary skills (the "option bar" — 6 skills, pick 4, 5 tiers each)

Icons saved at `reference/stat-{at,def,hp,dam,power,speed}.jpg`.

| Skill | none | Basic | Advanced | Expert | Master | Grandmaster |
|-------|------|-------|----------|--------|--------|-------------|
| **Attack** | 5 | 7 | 10 | 14 | 20 | 30 |
| **Defense** | 5 | 9 | 15 | 23 | 35 | 55 |
| **Hit Points** | 20+Lv×20 | +10% | +25% | +45% | +70% | +100% |
| **Damage** | 8+Lv×4 | +10% | +25% | +45% | +70% | +100% |
| **Magic Power** | 1 pow / 1 cast / 5% MR | 2 / 2 / 10% | 4 / 3 / 20% | 7 / 4 / 40% | 15 / 5 / 65% | 30 / 6 / 95% |
| **Speed** | 4 | 5 | 6 | 7 | 8 | 10 |

Each level-up lets the player boost one of the commander's four chosen skills.

## 5. Secondary skills (unlocked by two Master-tier primaries)

Each is gated on a **pair of Master-level primaries** and shown by a one-letter tag.

| Tag | Skill | Requires (both Master) |
|-----|-------|------------------------|
| **N** | No Enemy Retaliation | Attack + Magic Power |
| **S** | Can Shoot | Attack + Speed |
| **M** | Maximum damage always | Attack + Damage |
| **E** | Endless Retaliation | Defense + Hit Points |
| **D** | Reduce Enemy Defense by 50% | Attack + Defense |
| **O** | Fearsome (enemy may lose turn to fear) | Attack + Hit Points |
| **A** | Strikes all enemies around | Defense + Damage |
| **I** | Permanent Fire Shield | Defense + Magic Power |
| **B** | 30% chance to Block any Physical Damage | Defense + Speed |
| **2** | Attack twice | Hit Points + Damage |
| **P** | Melee 50% chance to Paralyze 3 rounds | Hit Points + Magic Power |
| **R** | Regeneration 50 HP every turn | Hit Points + Speed |
| **G** | DeathStare (kills Level/CreatureLevel per stack) | Damage + Magic Power |
| **F** | Ignore Obstacles [fly] | Magic Power + Speed |
| **C** | Champion Distance Bonus (+5% damage/square) | Damage + Speed |

---

## 6. Card design

Base the commander frame on the existing **golden** unit frame
(`public/assets/units-blank-golden.webp`) — the same HD-painterly composite the
Nightmare card uses — with a distinct commander accent (crown/laurel motif on the
name banner) so a commander reads apart from a creature.

Front face (always visible):
- Name banner (top) + commander crown accent + faction crest.
- Left stat column: Attack / Defense / Health / Initiative glyphs (reuse
  `scripts/card-glyphs/`).
- Central HD art window (generated, no baked text).
- Two signature-ability lines in the bottom panel, using the spell glyph +
  matching `specialty-card/icon-*.webp` where one exists (cure, bloodlust, haste,
  stone_skin, firewall, fortune all present).

Click-to-expand **option bar** (the growth layer): a toggle that flips the card
to a "growth" back showing the six primary-skill tracks (with the stat icons and
the 5-tier ladder) and the unlocked secondary-skill tags. This is a UI component,
not baked into the art — so tiers are editable/preview-able live.

---

## 7. WOG option icon / menu

The user wants a WOG menu icon "like in the page" — i.e. derived from the ornate
serpentine **"In the Wake of Gods"** logo (`reference/wog-logo.gif`: gold filigree
lettering with a cross). Plan: generate a **new** compact crest/emblem in that
spirit (gold serpentine filigree + a subtle cross/gods motif) at icon sizes for
the lobby WOG toggle and the "Mod options" menu — an original piece evoking the
logo, not a copy of the trademarked art.

---

## 8. Art-generation pipeline (Nano Banana via the Gemini app — VALIDATED)

**Route decision (settled 2026-07):** AI Studio's Playground blocks the good
image models (Nano Banana 2 / Pro) behind a **paid API key + billing** —
"permission denied" on this account. The **Gemini app** (gemini.google.com)
includes Nano Banana 2 under the user's **Pro subscription** with no API billing,
and its "Tạo lại bằng Pro" ("Regenerate with Pro") action upgrades a render to the
Pro image model for free. So the pipeline runs in the Gemini app, not AI Studio.
(The repo's `scripts/browser-gemini-card-workflow.md` already anticipated this
Gemini-app route.)

Per commander, driven with the Playwright MCP on the local logged-in machine:

1. **New Gemini chat window** each time (a single long thread gets repetitive) →
   `+` → enable **"Hình ảnh"** (Image — create & edit) mode.
2. Upload TWO references: the commander's WoG **sprite** (`reference/<slug>.jpg`,
   identity/pose/colour only — never an edit target) **and the Dracolich art**
   (`scripts/neutral-unit-art/wog_dracolich.png`) as the **quality/detail/finish
   target** — the user picked this AI piece as the look to match.
3. Prompt for a stunning, original, ultra-detailed, dramatic, cinematic fantasy
   card illustration matching the Dracolich reference's finish. **Do NOT say "oil
   painting"** (the user rejected that look — it read flat/fake). Illustration
   only, no frame/text/numbers/icons, one figure, ~4:5 portrait, don't crop
   head/limbs.
4. Generate with Nano Banana 2, then **"Tạo lại bằng Pro"** (more-options menu on
   the image) to upgrade. Judge both; keep the better (Pro has been winning).
5. Extract the image via canvas→dataURL (blob fetch is CORS-blocked) and save to
   `scripts/commander-art/<slug>.png`. Working review copies:
   `scripts/commander-art/_review-<slug>-{v1,v2,pro}.jpg`.
6. Composite into the golden frame with a `build-commander-cards.mjs` script (to
   be written, modeled on `build-placeholder-neutral-cards.mjs`) so **no frame,
   number, or symbol is baked into the AI art**, using the fixed base stat line
   **Attack 2 / Defense 1 / Health 4 / Speed(Initiative) 5** (user-specified for
   every commander) plus the click-to-open growth menu (§4–§6).

Authentic *original* board-game cards (e.g. Castle **Crusaders**/**Archangels**,
cropped to `reference/style-auth-*.png`) remain on hand as an alternate style
anchor, but the Dracolich look is the current target.

Slugs: `paladin, hierophant, temple_guardian, succubus, brute, soul_eater,
ogre_leader, shaman, astral_spirit, corsair`. Output cards:
`public/assets/units-commander-<slug>.webp`.

### Progress — ALL 12 ART PIECES DONE

Style note (user-refined 2026-07): match the **Dracolich's hand-drawn, human-
painted HD texture** — gritty real-artist linework/brushwork, NOT smooth /
airbrushed / "oil painting" / plastic-3D / AI-glossy. Every render used 2–3
references (commander sprite where it exists + the Dracolich quality anchor + a
faction-authentic original board-game card), a "hand-painted, dark-fantasy, pro
artist, full-body" prompt, then the **"Tạo lại bằng Pro"** upgrade. Art saved to
`scripts/commander-art/<slug>.png`; a montage is at
`scripts/commander-art/_ALL-commanders-contact-sheet.png`.

Beyond the 9 WoG factions the user also asked for **Cove, Factory and Bulwark**
commanders (no WoG sprite → designed from scratch off a faction-authentic card).

| # | Commander | Faction | Art | Note |
|---|-----------|---------|-----|------|
| 1 | Paladin | Castle | `paladin.png` | golden holy knight, griffin banner, citadel |
| 2 | Hierophant | Rampart | `hierophant.png` | green healer, emerald staff, shield-of-light, forest |
| 3 | Temple Guardian | Tower | `temple_guardian.png` | green-haired titan-kin, lightning glaive, ice fortress |
| 4 | Succubus | Inferno | `succubus.png` | horned winged demoness, flaming whip, hellfire |
| 5 | Brute | Dungeon | `brute.png` | **minotaur** beast-man, bloodied axe, torch-lit cavern |
| 6 | Soul Eater | Necropolis | `soul_eater.png` | undead necromancer, bone bow, raising skeletons |
| 7 | Ogre Leader | Stronghold | `ogre_leader.png` | tusked ogre warlord + war ballista, fortress |
| 8 | Shaman | Fortress | `shaman.png` | **gnoll** witch-doctor, skull-totem staff, swamp |
| 9 | Astral Spirit | Conflux | `astral_spirit.png` | radiant magic-elemental (not undead), astral plane |
| 10 | Corsair | Cove *(orig)* | `corsair.png` | full-body pirate captain, storm galleon deck |
| 11 | Engineer | Factory *(orig)* | `factory.png` | full-body steampunk gunslinger, brass factory |
| 12 | Frost Warlord | Bulwark *(orig)* | `bulwark.png` | full-body rune-armoured frost jotunn, aurora peaks |

Per-commander review copies kept as `_review-<slug>-pro.jpg`; authentic style
anchors under `reference/auth-<slug>.png`. Minor cleanups still open: a faint fake
"signature" in the Shaman corner (croppable), and a painterly paper edge on the
Astral Spirit (croppable) — both fall outside/at the edge of the 540×594 art window.

### Card composite + dynamic UI — DONE

- **Card composite** — `scripts/build-commander-cards.mjs` drops each art into the
  golden frame (`units-blank-golden.webp`) with the name, `<FACTION> COMMANDER`
  tag and the two signature abilities. It **fixes the right frame border** (art
  window inset to L173/T166/530×589, inside the inner gold border) and **removes
  the cost bar** (covered with leather sampled from the bottom panel — commanders
  have no gold recruit cost). **No stat numbers are baked in.** Output:
  `public/assets/units-commander-<slug>.webp` (all 12).
- **Dynamic stats + growth menu** — `src/components/commander-card.tsx`
  (`CommanderCard`) renders the built card and **overlays the four stat numbers as
  DYNAMIC, upgradeable values** (seeded from `COMMANDER_BASE_STATS` A2/D1/H4/Spd5,
  positioned over the empty wells at x≈15.75%, y≈25/39.9/53.85/68.3%). A
  click-to-open **"Upgrades & Skills"** panel (the option bar) edits Level and each
  stat live (the card number updates), picks the six primary-skill tiers (comm3),
  and auto-unlocks the secondary skills at two Master primaries. Roster/skill data
  in `src/data/commanders.ts`; preview at `/commander-preview` (dev).

### Engine gameplay — SHIPPED (the 2026-07 board adaptation)

The open decisions below were settled by the user's board-game spec and the
module is engine-wired end to end:

- **Roster renames**: Cove "Corsair" → **Sea Marshal** (Slow + Battle Stance),
  Factory "Engineer" → **Artificer** (Field Repair + Tinkerer), Bulwark
  "Frost Warlord" → **Rune Keeper** (Rune Mend + Rune Ritual). Slugs and art
  assets unchanged.
- **Superior Combat / Battle Stance** (Shaman & Sea Marshal): the owner chooses
  the commander's stance — +1 Attack OR +1 Defense — on the commander card
  outside combat; it is baked into the commander's unit at the start of each of
  its combats (`COMMANDER_SET_STANCE`; default +1 Attack). This replaced the
  earlier map-movement passives (Swiftness / Dead Calm), which were removed.
- **Rune Ritual** (Rune Keeper): +1 Rune the first time the commander is
  attacked each combat (once per fight), not a combat-start grant.
- **Stats**: six stats at grade 0–3 (`COMMANDER_GRADE_VALUES`) replacing §4's
  5-tier tracks. Every stat STARTS at grade 0 (the base A2/D1/H4/dmg+0/Pow0/
  Spd5); grade bonuses are the value shown, never summed (+1/+2 at grade I/II;
  grade III adjusted per user spec: Attack +3, Health +4, Speed +5): Attack
  2/3/4/5, Defense 1/2/3/4, Health 4/5/6/8, Damage +0/+1/+2/+3 on-hit, Magic =
  Power 0/1/2/3 with -1/-1/-2/-3 Spell damage + ongoing-effect immunity from
  grade 0, Speed (Initiative) 5/6/7/10. Grade-up picks (two DIFFERENT stats
  each) at hero level 2, 4 & 6 — the Paladin's Wise: 2, 3 & 5.
- **Combination skills**: ALL fifteen of §5's tags are engine-wired
  (`COMMANDER_COMBOS`, one skill per stat pair), board-adapted; a combo
  unlocks with ONE stat of its pair at grade 3 and the other at grade 2+.
  Death Stare (Damage+Magic) and Charge (Damage+Speed) kept their original
  wiring; Magic+Speed is the user-spec **Battle Teleport** ("can move
  anywhere in battle", `MOVE_ANYWHERE`) instead of WoG's Fly. Icons are the
  classic HoMM3 spell icons (heroes.thelazy.net →
  `public/assets/spell-icons/`). Behaviour pinned per-skill (with locked
  CONTROLs) in `src/engine/wog-commander-combos.test.ts`.
- **Deployment**: with the module on a player deploys at most 4 army units —
  the commander is the army's 5th body (`combatUnitLimit`).
- **Command ability**: once per combat round, free during the commander's own
  activation, Power-scaled per `commanderDefinitions[slug].cast`.
- **Death/revive**: a fallen commander stays dead until revived on the map for
  2 + 2x hero level gold.
- Tests: `wog-commanders.test.ts` (52 cases with the casts file) — every claim
  above fails if its wiring is removed.

### Still TODO (not done)

- Optional art cleanups (fake "signature" on Shaman, paper edge on Astral Spirit).
- The lobby "New adventure objects" module remains selection-only (unrelated to
  commanders).
