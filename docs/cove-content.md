# Cove (expansion) — what the engine actually runs

This is the human-readable audit of the Cove faction the user asked for: every
unit ability, building effect and hero specialty **the engine executes today**,
each backed by a named test that fails if the wiring is removed. Stats/abilities
are the fan-wiki Cove pages (https://en.homm3bg.wiki/towns/cove/); the board-game
**card images are real** (cropped from the official Gamefound Cove reveal, see
"Caveats"). Nothing in this list is decorative — there are no `abilities: []`
sides pretending to do something they print.

## Units — faction Few/Pack (recruited from the Cove town)

| Unit (tier) | Side | A / D / HP / Init / Cost | Ability the ENGINE runs |
|---|---|---|---|
| **Oceanids** (bronze, flying) | Few | 2/0/3/6 · 2g | — (nothing) |
| | Pack | 3/0/3/8 · 3g | `immune-all-spells` — ignore all spell effects & damage (every school + Magic Arrow) |
| **Seamen** (bronze, ground) | Few | 2/1/3/5 · 3g | — |
| | Pack | 2/1/5/6 · 5g | `seamen-plunder` — once/combat, gain **2 gold** when this unit removes a unit |
| **Sea Dogs** (bronze, ranged) | Few | 2/0/4/6 · 4g | `ignore-combat-penalties` — no adjacent-target ranged penalty |
| | Pack | 3/0/5/8 · 6g | `ignores-retaliation` + `ignore-combat-penalties` |
| **Ayssids** (silver, flying) | Few | 3/1/5/9 · 6g | — |
| | Pack | 3/1/6/11 · 10g | `ayssid-pounce` — on a kill, attack another adjacent unit after retaliation |
| **Sorceresses** (silver, ranged) | Few | 3/1/5/6 · 8g | `sorceress-weakness-few` — place a **−2** Weakness token on any unit (2 rounds) |
| | Pack | 4/1/6/7 · 13g | `sorceress-weakness-on-attack` — after the attack, **−1** Weakness token on the target (2 rounds) |
| **Nix** (gold, ground) | Few | 5/2/7/6 · 12g | — |
| | Pack | 6/2/8/7 · 20g+1v | `nix-damage-cap` — cannot take more than **4** damage from a single attack |
| **Haspids** (gold, ground) | Few | 5/3/8/9 · 18g+1v | `haspid-vengeance` — **+2 Attack** once flipped Pack→Few this combat |
| | Pack | 7/3/8/12 · 30g+2v | `wyvern-poison-cube-pack` — plant **2** poison cubes (1 dmg per target activation) |

Tests: `cove-content.test.ts` (stats + ability wiring, "no decorative ones"),
`cove-unit-abilities.test.ts` (Plunder / Killer-Instinct / Hardened-Shell /
Vengeance behaviour, each with a control).

## Units — NEW neutral guards (added this pass)

The wiki prints a single-sided **Neutral** card for each Cove creature; all seven
now ship as `neutral.<slug>`. They auto-join their tier's Neutral Units deck (map
guards) and Cove's faction counterparts (Unexpected Reinforcements). Stats are the
wiki Neutral column — **distinct** from Few/Pack — and two carry a *different*
engine effect from the faction side:

| Guard (tier) | A / D / HP / Init / Cost | Ability the ENGINE runs |
|---|---|---|
| `neutral.oceanids` (bronze) | 2/0/3/6 · 3g | `immune-all-spells` |
| `neutral.seamen` (bronze) | 2/1/3/5 · 5g | — (wiki prints a dash) |
| `neutral.sea_dogs` (bronze) | 2/0/4/6 · 7g | `ignore-combat-penalties` |
| `neutral.ayssids` (silver) | 3/1/5/9 · 9g | `ayssid-pounce` |
| `neutral.sorceresses` (silver) | 3/1/5/6 · 13g | `sorceress-weakness-on-attack` |
| `neutral.nix` (gold) | 5/1/7/6 · 20g | `nix-damage-cap-neutral` — caps a hit at **5** (NOT the Pack's 4) |
| `neutral.haspids` (gold) | 5/2/6/9 · 25g | `wyvern-poison-cube-few` — plant **1** cube (NOT the Pack's 2) |

Card image = the faction **Few-side** art (placeholder, as requested). Voices =
the same creature voice as the faction twin (bare-name sound mapping). Tests:
`cove-content.test.ts` ("Cove neutral guard units" — stats, abilities, deck
membership, faction-counterpart match, shared voice) and `cove-unit-abilities.test.ts`
("Nix Neutral Hardened Shell — per-attack damage cap of 5", with the Pack 4-cap as
the control).

## Buildings (all 8 implemented)

| Building | Cost | Effect the ENGINE runs |
|---|---|---|
| **City Hall** | 10g 4m | Each Astrologers' round: **+4 gold** OR remove 1 Artifact from hand → **+1 XP** (artifact option only offered when you hold one) |
| **Citadel** | 8g 4m 1v | Unlock reinforcing (`UNLOCK_REINFORCE`) + siege defense |
| **Mage Guild** | 4g 2m 1v | `MAGE_GUILD`, spell-book cost 5 |
| **Bay** (dwelling I) | 4g 3m 1v | Unlock recruiting bronze units |
| **Nests Towering the Seas** (II) | 8g 6m 3v | Unlock silver units |
| **Redoubled Vortex** (III) | 10g 8m 4v | Unlock golden units |
| **Thieves' Guild** | 4g 2m 1v | Once/turn: peek the top 2 of ANY deck (incl. a rival's M&M), discard one, keep one on top |
| **Pub** | 3g 2m | Each Astrologers' round: reinforce one Few unit for **−3 gold** (min 0) |

Town-screen art now renders for every building (`TOWN_BUILDING_IMAGES.cove`,
fetched by `scripts/fetch-cove-town-art.py`). Tests: `cove-content.test.ts`
("Cove buildings" incl. the 8-image render check), `cove-thieves-guild.test.ts`.

## Heroes & specialties (all 6 implemented, I / IV / VI)

| Hero | Class / type | Start ability | Specialty — what the ENGINE runs |
|---|---|---|---|
| **Astra** | Navigator / magic | Luck | **Cure**: I remove any effect+paralysis & draw 1; IV also heal 2; VI heal 3 |
| **Cassiopeia** | Captain / might | Tactics | **Oceanids**: I +1 atk-or-def, IV +1 initiative, VI +2 attack (to Oceanids) |
| **Jeremy** | Captain / might | Offense | **Cannon**: I buy a Cannon (7g) / deal 1; IV fire Cannon (2 dmg, needs one) / draw 1; VI fire / draw 2 |
| **Zilare** | Navigator / magic | Interference | **Forgetfulness**: I stop a bronze/silver ranged enemy attacking / draw; IV reaches gold ranged + a +2-Power cast; VI reaches any gold unit |
| **Miriam** | Captain / might | Logistics | **Scouting**: remove a hand card → Search its deck (I Ability-only ×2; IV adds Major/Expert reach; VI Search 4 deep) |
| **Casmetra** | Navigator / magic | Wisdom | **Sorceresses**: I +1 atk-or-def, IV +1 initiative, VI place a −2 Weakness token on any unit OR flat +2 attack |

Tests: `cove-hero-specialties.test.ts` (Jeremy/Zilare/Miriam behaviour),
`casmetra-specialty.test.ts`, `hero-specialty-levels.test.ts` ("no remaining
not-implemented hero specialty"). Portraits: the classic PC portrait for all six,
incl. **Casmetra** (now the real thelazy.net portrait, no longer a placeholder).

## Caveats (read first)

- **The card ART is a 2024 preview revision; the ENGINE follows the wiki.** The
  Gamefound reveal predates the final wiki numbers, so a few printed card faces
  disagree with what the engine plays. Per the user's instruction ("the image
  stats and ability is incorrect, just follow wiki"), the engine uses the wiki on
  every card (verified by `cove-content.test.ts`); treat the art as decoration.
  Known face-vs-engine divergences:

  | Card | Printed on the art | What the ENGINE plays (wiki) |
  |---|---|---|
  | Oceanids **Pack** | A2 / HP4, "ignore *Water-school* spells" | **A3 / HP3**, ignore **all** spells |
  | Seamen **Pack** | "+1 movement if you start on a Sea tile" | **gain 2 gold** when it removes a unit |
  | Sorceresses **Few** | Attack **4** | Attack **3** |

  All other faces match the wiki. If you would rather not show the mismatched
  faces, the alternative is the blank tier placeholder for those three.
- **Unit card art is upscaled.** The fan wiki has no individual Cove cards yet, so
  each Few/Pack face is cropped from the 1200×1500 Gamefound reveal (~245 px wide
  per card) and scaled up to the repo's 743×1040 canvas. It is the real card art,
  but **softer** than the factions whose cards come straight from the wiki at
  native size. Swap in wiki cards via `scripts/fetch-cove-unit-art.py`'s URL when
  they publish.
- **Neutral guards reuse the Few-side image** as a placeholder (per request); they
  have no separate printed art.
- **Hero specialty cards render without their own card art** (`withoutArt(...)`),
  unchanged by this pass — a pre-existing display gap, not part of this work.
