# Generate ALL Hidden Leaf Village board-game art via Codex CLI image_gen.
# Replaces procedural placeholders from scripts/build-hidden-leaf-placeholder-art.mjs.
#
# Usage:
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1 -Only genin
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1 -Only heroes
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1 -Only town
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1 -Only equipment
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1 -Only commander
#   powershell -File scripts/_codex-prompts/hidden-leaf-art-batch.ps1 -Only tile
#
# After town panorama jobs: node scripts/build-hidden-leaf-art-post.mjs
# After commander art:     node scripts/build-commander-cards.mjs might_guy

param(
  [string]$Only = ""
)

$ErrorActionPreference = "Continue"
$CODEX = "C:\Users\klwar\AppData\Local\OpenAI\Codex\bin\codex.exe"
$CWD = "C:\Users\klwar\Heroes-3-board-game-multi"
$Session = Join-Path $CWD "generated-session-art\hidden-leaf"
$UnitsOut = Join-Path $CWD "public\assets\anime\units\hidden-leaf"
$HeroesOut = Join-Path $CWD "public\assets\anime\heroes"
$TownsOut = Join-Path $CWD "public\assets\anime\towns"
$TilesOut = Join-Path $CWD "public\assets\anime\tiles"
$EquipOut = Join-Path $CWD "public\assets\anime\equipment"
$EquipMasterOut = Join-Path $CWD "scripts\anime-art\raw\artifacts\equipment-masters"
$CommanderArtOut = Join-Path $CWD "scripts\commander-art"
New-Item -ItemType Directory -Force -Path $Session, $UnitsOut, $HeroesOut, $TownsOut, $TilesOut, $EquipOut, $EquipMasterOut, $CommanderArtOut | Out-Null

if (-not (Test-Path $CODEX)) {
  Write-Host "FAIL: codex.exe not found at $CODEX"
  exit 1
}

# Frame refs (structure only — content must be original)
$UnitFrameRef = Join-Path $CWD "public\assets\anime\units\fuyuki\units-fuyuki-bronze-assassins-few.webp"
$CmdFrameRef = Join-Path $CWD "public\assets\units-commander-sword_saint.webp"
$HeroRef = Join-Path $CWD "public\assets\anime\heroes\bin.png"
$TileRef = Join-Path $CWD "public\assets\anime\tiles\a-s1.webp"
$TownRef = Join-Path $CWD "public\assets\anime\towns\fuyuki-city-full.webp"
$EquipIconRef = Join-Path $CWD "public\assets\anime\equipment\iron_blood_sword.webp"
$EquipMasterRef = Join-Path $CWD "scripts\anime-art\raw\artifacts\equipment-masters\iron_blood_sword-master.png"

$UnitFrameRules = @"
FULL unit CARD (not a loose portrait). Premium late-90s Heroes of Might and Magic III board-game unit-card quality with an ANIME nocturne frame tinted forest LEAF-GREEN / slate (not Fuyuki violet, not Azure jade):
- Dark forest-green leather outer frame with antique gold scroll corners
- Top banner plate empty (NO readable text)
- Left stat sidebar with 4 icon wells (crossed swords, shield, health cross, initiative runner) — empty of numbers, NO readable text
- Large central art panel with a single clear silhouette and readable action pose
- Bottom FEW/PACK plate empty (NO readable text)
- Tier star top-right: bronze/brown for bronze, silver for silver, gold for gold
Style: painterly anime hybrid for board-game cards — mature proportions, muted local color, controlled chakra light, real materials (cloth, leather, steel, bark, mist). Readable at card size.
Palette anchors: leaf green, slate, charcoal, warm lantern amber, soft cyan chakra accents.
World anchors: Hidden Leaf Village — wooden Hokage-style faces mountain far away as soft background only, dense forest canopy, stone paths, training posts, paper talismans, headband plates WITHOUT any copyrighted leaf logo (use a simple circular blank metal plate or abstract spiral seal).
FORBIDDEN: watermarks, English/Japanese readable rules text, UI chrome, card numbers, copying another unit's face, pure modern mobile-game sticker look, chibi, photorealism, plastic 3D, official franchise logos.
"@

$jobs = @()

# ---- UNITS (14 full cards) -------------------------------------------------
$unitJobs = @(
  @{
    id = "genin-squad-few"; min = 40000
    path = "units-hidden-leaf-bronze-genin-squad-few.webp"
    star = "bronze/brown star"; side = "few"
    subject = "GENIN SQUAD (FEW) — two young academy ninja trainees in plain green training jackets and dark trousers, blank metal forehead plates (no logo), carrying wooden practice kunai, standing in a forest training yard at dusk. Low-tier chaff feel, hopeful and raw. Group of novices, not a named hero."
  },
  @{
    id = "genin-squad-pack"; min = 40000
    path = "units-hidden-leaf-bronze-genin-squad-pack.webp"
    star = "bronze/brown star"; side = "pack"
    subject = "GENIN SQUAD (PACK) — three young academy ninja trainees in green jackets with blank forehead plates, formation stance with practice kunai and shuriken, training yard under canopy light. Clearly a pack of novices working as a team."
  },
  @{
    id = "medical-nin-few"; min = 40000
    path = "units-hidden-leaf-bronze-medical-nin-few.webp"
    star = "bronze/brown star"; side = "few"
    subject = "MEDICAL-NIN (FEW) — a calm East-Asian young woman medic-ninja in cream and leaf-green robes with a medical satchel, glowing soft green healing chakra on one palm, forest clinic hut behind her. Support unit, not a fighter pose."
  },
  @{
    id = "medical-nin-pack"; min = 40000
    path = "units-hidden-leaf-bronze-medical-nin-pack.webp"
    star = "bronze/brown star"; side = "pack"
    subject = "MEDICAL-NIN (PACK) — two medic-ninjas (woman and man) in cream/leaf robes, green chakra palms and scroll satchels, treating wounded beside a wooden clinic. Support pack, gentle light."
  },
  @{
    id = "anbu-few"; min = 40000
    path = "units-hidden-leaf-bronze-anbu-few.webp"
    star = "bronze/brown star"; side = "few"
    subject = "ANBU BLACK OPS (FEW) — a lone elite black-ops ninja in dark slate tactical gear with an animal porcelain mask (cat or hawk, original design), short blades and kunai holsters, half-crouched on a moonlit branch. Ranged skirmisher silhouette. Mysterious, not comic."
  },
  @{
    id = "anbu-pack"; min = 40000
    path = "units-hidden-leaf-bronze-anbu-pack.webp"
    star = "bronze/brown star"; side = "pack"
    subject = "ANBU BLACK OPS (PACK) — two masked black-ops operatives on a night rooftop, porcelain animal masks (different animals), dark slate gear, body-flicker motion trails of cyan chakra. Pack of assassins."
  },
  @{
    id = "jonin-few"; min = 40000
    path = "units-hidden-leaf-silver-jonin-few.webp"
    star = "silver star"; side = "few"
    subject = "JONIN (FEW) — a seasoned elite jonin, mid-30s East-Asian man with short dark hair and a blank forehead plate, dark green flak vest over black mesh, throwing a fan of silver kunai mid-air. Confident silver-tier ranged elite. NOT a teenager."
  },
  @{
    id = "jonin-pack"; min = 40000
    path = "units-hidden-leaf-silver-jonin-pack.webp"
    star = "silver star"; side = "pack"
    subject = "JONIN (PACK) — two seasoned jonin elites (man and woman) in dark green flak vests, blank forehead plates, coordinated kunai barrage over a village rooftop at dusk. Silver pack."
  },
  @{
    id = "giant-toad-few"; min = 40000
    path = "units-hidden-leaf-silver-giant-toad-few.webp"
    star = "silver star"; side = "few"
    subject = "GIANT TOAD (FEW) — a massive summoned toad the size of a cart, warty olive and bronze hide, wise golden eyes, sitting on a mountain scroll-circle with mist and forest. Beast unit, NOT a human. Tank feel."
  },
  @{
    id = "giant-toad-pack"; min = 40000
    path = "units-hidden-leaf-silver-giant-toad-pack.webp"
    star = "silver star"; side = "pack"
    subject = "GIANT TOAD (PACK) — two huge summoned toads side by side on a misty mountain ridge, olive/bronze hide, smoke puffing from mouths, powerful tank pack. Beasts only."
  },
  @{
    id = "jinchuriki-few"; min = 40000
    path = "units-hidden-leaf-golden-jinchuriki-few.webp"
    star = "gold star"; side = "few"
    subject = "JINCHURIKI (FEW) — a young gold-tier host of a sealed beast: spiky blond hair, orange and black combat jacket, blank forehead plate, orange fox-chakra cloak with faint wispy tail-flames swirling, mid-punch shockwave. Original board-game design, intense and heroic. Gold striker."
  },
  @{
    id = "jinchuriki-pack"; min = 40000
    path = "units-hidden-leaf-golden-jinchuriki-pack.webp"
    star = "gold star"; side = "pack"
    subject = "JINCHURIKI (PACK) — two orange-cloaked beast-hosts (one blond youth, one dark-haired youth) wreathed in orange chakra flames with spectral tail wisps, cratered training field. Gold pack of tailed-beast hosts. Original designs."
  },
  @{
    id = "susanoo-few"; min = 40000
    path = "units-hidden-leaf-golden-susanoo-few.webp"
    star = "gold star"; side = "few"
    subject = "SUSANOO AVATAR (FEW) — a towering ethereal spectral warrior armor of translucent indigo and violet chakra, ribcage-like plating, glowing eyes, massive spectral sword, standing over a kneeling dark-haired swordsman on rocky ground. Gold armored avatar. Monumental silhouette."
  },
  @{
    id = "susanoo-pack"; min = 40000
    path = "units-hidden-leaf-golden-susanoo-pack.webp"
    star = "gold star"; side = "pack"
    subject = "SUSANOO AVATAR (PACK) — two ethereal spectral warrior avatars (one indigo, one violet-crimson) of translucent chakra armor with swords, towering over a battlefield crater. Gold pack of armored spirits. No readable text."
  }
)

foreach ($u in $unitJobs) {
  $jobs += @{
    id = $u.id
    group = "units"
    target = (Join-Path $UnitsOut $u.path)
    sessionName = $u.path
    minBytes = $u.min
    refs = @($UnitFrameRef)
    prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save the result.

$UnitFrameRules
Tier marker: $($u.star)
Side: $($u.side)

SUBJECT (exact, DISTINCT character design — never reuse another unit's face or costume):
$($u.subject)

Composition: portrait-oriented full card ~743x1040. Art panel fills most of the center. Single clear action. Three depth planes.

SAVE OVERWRITE exact path:
$(Join-Path $UnitsOut $u.path)

Convert to webp quality ~88 if needed. Verify file size > 40KB. Print path and bytes only. No git. No other files. No Grok.
"@
  }
}

# ---- HEROES (3 portraits) -------------------------------------------------
$heroJobs = @(
  @{
    id = "hero-naruto"
    file = "naruto.png"
    subject = "Original board-game hero portrait of a young male jinchuriki protagonist: spiky blond hair, bright blue eyes, confident grin, orange and black high-collar jacket, blank metal forehead plate (no logo), soft orange chakra aura. Bust/portrait, shoulders-up, dark forest-green gradient backdrop with faint leaf motifs. Painterly anime hybrid, mature HOMM3 board-game portrait quality. NOT a child chibi."
  },
  @{
    id = "hero-sasuke"
    file = "sasuke.png"
    subject = "Original board-game hero portrait of a dark-haired male avenger swordsman: sleek black hair, pale skin, intense dark eyes with a faint crimson iris gleam, navy and black high-collar outfit, one short sword strap, cool lightning-blue rim light. Bust/portrait, shoulders-up, stormy slate backdrop. Painterly anime hybrid, mature HOMM3 board-game portrait quality. Distinct from the blond jinchuriki hero."
  },
  @{
    id = "hero-tsunade"
    file = "tsunade.png"
    subject = "Original board-game hero portrait of a legendary medical kunoichi: mature East-Asian woman ~30s, long blonde hair with a diamond forehead mark, green open jacket over a dark top, calm powerful expression, soft green healing chakra glow. Bust/portrait, shoulders-up, warm lantern and leaf backdrop. Painterly anime hybrid, mature HOMM3 board-game portrait quality. Distinct from both male heroes."
  }
)

foreach ($h in $heroJobs) {
  $jobs += @{
    id = $h.id
    group = "heroes"
    target = (Join-Path $HeroesOut $h.file)
    sessionName = $h.file
    minBytes = 80000
    refs = @($HeroRef)
    prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save.

Use case: production game asset. Asset type: vertical hero portrait card for a fantasy strategy board game (approx 1086x1448).
Style: painterly anime hybrid matching Heroes board-game hero portraits — crisp silhouette, muted palette, NO text, NO frame, NO UI, NO watermark, NO logo.
$($h.subject)

SAVE OVERWRITE exact path:
$(Join-Path $HeroesOut $h.file)

PNG preferred. Verify > 80KB. Path+bytes only. No git. No Grok.
"@
  }
}

# ---- COMMANDER art window (composited later) ------------------------------
$jobs += @{
  id = "commander-might-guy"
  group = "commander"
  target = (Join-Path $CommanderArtOut "might_guy.png")
  sessionName = "might_guy.png"
  minBytes = 100000
  refs = @()
  prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save.

Asset type: vertical COMMANDER art window only (NO card frame, NO text, NO stats, NO UI) for a WoG-style board-game commander, roughly 1000x1500 portrait.
SUBJECT — Hidden Leaf Village commander MIGHT GUY (original design):
- Energetic middle-aged East-Asian taijutsu master, green jumpsuit, orange leg warmers, open white smile, thick eyebrows, bowl-cut black hair
- Dynamic standing power pose, fists clenched, green speed-lines of body-flicker motion
- Background: sunlit forest training ground and wooden posts
- Style: painterly HOMM3 commander art + anime hybrid, mature proportions
FORBIDDEN: card frame, text, numbers, logos, watermark, child proportions

SAVE OVERWRITE exact path:
$(Join-Path $CommanderArtOut "might_guy.png")

PNG. Verify > 100KB. Path+bytes only. No git. No Grok.
"@
}

# ---- TOWN panoramas -------------------------------------------------------
$jobs += @{
  id = "town-full"
  group = "town"
  target = (Join-Path $TownsOut "hidden-leaf-village-full.webp")
  sessionName = "hidden-leaf-village-full.webp"
  minBytes = 120000
  refs = @($TownRef)
  prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save.

Use case: stylized-concept
Asset type: widescreen town panorama for a fantasy strategy board-game UI (exactly usable at 1672x941)
Primary request: Create an original, premium anime-fantasy HIDDEN LEAF VILLAGE fully built — a shinobi mountain village nestled in dense forest at golden hour.
Scene/backdrop: wide elevated view across seven visually distinct vertical districts left-to-right for UI building slots:
1 Mission Board plaza with wooden notice boards and banners
2 Ninja Academy courtyard with training posts
3 Summoning Pact Shrine with stone toads and scroll circles
4 Forest of Death canopy + Chunin Exam Arena stands (shared denser mid district)
5 Scroll Vault archive pavilion with paper seals
6 Village Walls / gate fortress with watch towers
7 Sanctum of the Tailed Beast sealed cave shrine with orange chakra glow
Style/medium: cinematic hand-painted anime background art, professional strategy-game town screen, crisp painterly textures
Composition/framing: 16:9-ish landscape filling 1672x941; architecture distributed across seven vertical regions; no foreground characters; clear atmospheric depth
Lighting/mood: warm late-afternoon canopy light, leaf-green and slate, amber lanterns, soft cyan/orange chakra accents
Constraints: original design; no copyrighted leaf logo (use blank circular plates or spiral seals); no text, labels, logos, borders, UI, watermark, card frame. Buildings readable in narrow vertical crops.
Avoid: modern city, cyberpunk neon, European castles, plastic 3D, empty skyline.

SAVE OVERWRITE:
$(Join-Path $TownsOut "hidden-leaf-village-full.webp")

webp. Verify > 120KB. Path+bytes only. No git. No Grok.
"@
}

$jobs += @{
  id = "town-empty"
  group = "town"
  target = (Join-Path $TownsOut "hidden-leaf-village-empty.webp")
  sessionName = "hidden-leaf-village-empty.webp"
  minBytes = 120000
  refs = @($TownRef)
  prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save.

Use case: stylized-concept
Asset type: widescreen EMPTY townscape panorama (1672x941) for a board-game town board — the same Hidden Leaf Village valley BEFORE major buildings rise.
Scene: forest valley foundation, wooden scaffolds, empty plazas, dirt paths, foundation stones for seven districts matching the full version layout, soft morning mist, no large finished buildings, no characters.
Style: cinematic hand-painted anime background, leaf-green / slate palette, readable when cropped into seven vertical bars.
Constraints: no text, logos, watermark, UI, card frame. Original design.

SAVE OVERWRITE:
$(Join-Path $TownsOut "hidden-leaf-village-empty.webp")

webp. Verify > 120KB. Path+bytes only. No git. No Grok.
"@
}

# ---- STARTING TILE L-S1 ---------------------------------------------------
$jobs += @{
  id = "tile-l-s1"
  group = "tile"
  target = (Join-Path $TilesOut "l-s1.webp")
  sessionName = "l-s1.webp"
  minBytes = 80000
  refs = @($TileRef)
  prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save.

Use case: production game asset. Asset type: square top-down map tile illustration for a fantasy strategy board game.
Create an original Hidden Leaf Village starting tile viewed perfectly from above, designed as one large regular hexagon containing seven clearly readable smaller hex fields: one central field and six surrounding fields.
Central field: forest shinobi village with wooden roofs and training yard (leaf-green slate palette).
Surrounding fields, clockwise: glowing resource shrine, quiet forest road, impassable dark mountain ridge, guarded treasure courtyard, materials quarry, forest path to river.
Style: premium hand-painted anime strategy map, crisp readable terrain, painterly not photorealistic, leaf green, slate, amber lantern, soft cyan accents.
Composition: the large tile fills the square canvas with the full outer hex visible and a little dark margin; straight top-down orthographic view; paths connect passable fields.
No characters, no text, no numbers, no logos, no card frame, no UI, no watermark.
Avoid: perspective view, rectangular panorama, cyberpunk, blurry buildings, split screen.

SAVE OVERWRITE:
$(Join-Path $TilesOut "l-s1.webp")

webp. Verify > 80KB. Path+bytes only. No git. No Grok.
"@
}

# ---- SHINOBI EQUIPMENT icons + masters ------------------------------------
$equipJobs = @(
  @{
    id = "equip-kunai-icon"
    target = (Join-Path $EquipOut "shinobi_kunai_pouch.webp")
    session = "shinobi_kunai_pouch.webp"
    min = 20000
    ref = $EquipIconRef
    prompt = @"
ONLY task: use built-in image_gen ONCE, then save.
Asset: square 512x512 inventory ICON for a board-game equipment item.
SUBJECT: Shinobi Kunai Pouch — a worn leather pouch bristling with polished steel kunai and a blank metal forehead plate charm, leaf-green ribbon, soft rim light on dark gradient. Centered product shot, no text, no logo, no watermark.
SAVE: $(Join-Path $EquipOut "shinobi_kunai_pouch.webp")
webp. >20KB. Path+bytes. No git. No Grok.
"@
  },
  @{
    id = "equip-kunai-master"
    target = (Join-Path $EquipMasterOut "shinobi_kunai_pouch-master.png")
    session = "shinobi_kunai_pouch-master.png"
    min = 80000
    ref = $EquipMasterRef
    prompt = @"
ONLY task: use built-in image_gen ONCE, then save.
Asset: wide painted still-life master (~1230x866) for an equipment card art window — no frame, no text.
SUBJECT: Shinobi Kunai Pouch still life — leather pouch of steel kunai on dark wood with forest light, leaf-green ribbon, blank metal plate charm. Painterly HOMM3 artifact-card quality.
SAVE: $(Join-Path $EquipMasterOut "shinobi_kunai_pouch-master.png")
PNG. >80KB. Path+bytes. No git. No Grok.
"@
  },
  @{
    id = "equip-tabi-icon"
    target = (Join-Path $EquipOut "body_flicker_tabi.webp")
    session = "body_flicker_tabi.webp"
    min = 20000
    ref = $EquipIconRef
    prompt = @"
ONLY task: use built-in image_gen ONCE, then save.
Asset: square 512x512 inventory ICON.
SUBJECT: Body-Flicker Tabi — a pair of dark ninja tabi boots with cyan body-flicker motion trails and leaf-green wraps, product-centered on dark gradient. No text, no logo.
SAVE: $(Join-Path $EquipOut "body_flicker_tabi.webp")
webp. >20KB. Path+bytes. No git. No Grok.
"@
  },
  @{
    id = "equip-tabi-master"
    target = (Join-Path $EquipMasterOut "body_flicker_tabi-master.png")
    session = "body_flicker_tabi-master.png"
    min = 80000
    ref = $EquipMasterRef
    prompt = @"
ONLY task: use built-in image_gen ONCE, then save.
Asset: wide painted still-life master (~1230x866), no frame, no text.
SUBJECT: Body-Flicker Tabi still life — dark tabi boots mid-blur with cyan chakra afterimages on a forest path stone, leaf-green wraps, HOMM3 artifact quality.
SAVE: $(Join-Path $EquipMasterOut "body_flicker_tabi-master.png")
PNG. >80KB. Path+bytes. No git. No Grok.
"@
  },
  @{
    id = "equip-charm-icon"
    target = (Join-Path $EquipOut "sage_chakra_charm.webp")
    session = "sage_chakra_charm.webp"
    min = 20000
    ref = $EquipIconRef
    prompt = @"
ONLY task: use built-in image_gen ONCE, then save.
Asset: square 512x512 inventory ICON.
SUBJECT: Sage Chakra Charm — an ornate wooden and jade amulet with spiral seal and dual orange/cyan chakra glow, centered product shot on dark gradient. No text, no franchise logo.
SAVE: $(Join-Path $EquipOut "sage_chakra_charm.webp")
webp. >20KB. Path+bytes. No git. No Grok.
"@
  },
  @{
    id = "equip-charm-master"
    target = (Join-Path $EquipMasterOut "sage_chakra_charm-master.png")
    session = "sage_chakra_charm-master.png"
    min = 80000
    ref = $EquipMasterRef
    prompt = @"
ONLY task: use built-in image_gen ONCE, then save.
Asset: wide painted still-life master (~1230x866), no frame, no text.
SUBJECT: Sage Chakra Charm still life — wooden/jade spiral amulet floating above a scroll circle with dual orange and cyan chakra wisps, forest shrine backdrop, HOMM3 artifact quality.
SAVE: $(Join-Path $EquipMasterOut "sage_chakra_charm-master.png")
PNG. >80KB. Path+bytes. No git. No Grok.
"@
  }
)

foreach ($e in $equipJobs) {
  $jobs += @{
    id = $e.id
    group = "equipment"
    target = $e.target
    sessionName = $e.session
    minBytes = $e.min
    refs = @($e.ref)
    prompt = $e.prompt
  }
}

function Invoke-CodexImage {
  param(
    [string]$Prompt,
    [string]$Target,
    [string[]]$Refs,
    [int]$TimeoutSec = 420,
    [int]$MinBytes = 30000
  )
  $before = Get-Date
  # Kill stale codex so only one image_gen runs
  Get-Process | Where-Object { $_.ProcessName -match '^codex$' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1

  $argsList = @(
    "exec", "-m", "gpt-5.5",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C", $CWD,
    "-s", "danger-full-access",
    "-o", (Join-Path $CWD "tmp-codex-hidden-leaf-lastmsg.txt")
  )
  foreach ($r in $Refs) {
    if ($r -and (Test-Path $r)) { $argsList += @("-i", $r) }
  }
  $argsList += "-"

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $CODEX
  $psi.Arguments = ($argsList | ForEach-Object {
      if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join " "
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = $CWD
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $proc.StandardInput.Write($Prompt)
  $proc.StandardInput.Close()
  Write-Host "  STARTED pid=$($proc.Id) -> $Target"

  $ok = $false
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $gen = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt $before -and $_.Length -gt $MinBytes } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($gen) {
      Write-Host "  GEN $($gen.Length) $($gen.Name)"
      $dir = Split-Path $Target -Parent
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
      if ($Target -match '\.png$') {
        $null = & node -e "require('sharp')(process.argv[1]).png().toFile(process.argv[2]).then(i=>console.log('  wrote',i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen.FullName $Target 2>&1
      } else {
        $null = & node -e "require('sharp')(process.argv[1]).webp({quality:88,effort:6}).toFile(process.argv[2]).then(i=>console.log('  wrote',i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen.FullName $Target 2>&1
      }
      if ((Test-Path $Target) -and ((Get-Item $Target).LastWriteTime -gt $before) -and ((Get-Item $Target).Length -gt $MinBytes)) {
        $ok = $true
        break
      }
    }
    if ($proc.HasExited) {
      Write-Host "  exit=$($proc.ExitCode)"
      # last-chance scan
      $gen2 = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $before -and $_.Length -gt $MinBytes } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($gen2 -and -not $ok) {
        if ($Target -match '\.png$') {
          $null = & node -e "require('sharp')(process.argv[1]).png().toFile(process.argv[2]).then(i=>console.log('  wrote',i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen2.FullName $Target 2>&1
        } else {
          $null = & node -e "require('sharp')(process.argv[1]).webp({quality:88,effort:6}).toFile(process.argv[2]).then(i=>console.log('  wrote',i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen2.FullName $Target 2>&1
        }
        if ((Test-Path $Target) -and ((Get-Item $Target).Length -gt $MinBytes)) { $ok = $true }
      }
      break
    }
    Start-Sleep -Seconds 5
  }
  if (-not $proc.HasExited) { try { $proc.Kill() } catch {} }
  return $ok
}

$selected = $jobs | Where-Object {
  if (-not $Only) { return $true }
  $o = $Only.ToLower()
  if ($o -eq "units") { return $_.group -eq "units" }
  if ($o -eq "heroes") { return $_.group -eq "heroes" }
  if ($o -eq "town") { return $_.group -eq "town" }
  if ($o -eq "tile") { return $_.group -eq "tile" }
  if ($o -eq "equipment") { return $_.group -eq "equipment" }
  if ($o -eq "commander") { return $_.group -eq "commander" }
  return ($_.id -like "*$o*")
}

$results = @()
foreach ($job in $selected) {
  Write-Host "=== $($job.id) ==="
  $ok = Invoke-CodexImage -Prompt $job.prompt -Target $job.target -Refs $job.refs -MinBytes $job.minBytes
  $size = 0
  if (Test-Path $job.target) { $size = (Get-Item $job.target).Length }
  Write-Host "  RESULT $($job.id) ok=$ok size=$size"
  if ($ok) {
    Copy-Item $job.target (Join-Path $Session $job.sessionName) -Force
  }
  $results += [pscustomobject]@{ id = $job.id; ok = $ok; size = $size; path = $job.target }
}

Write-Host ""
Write-Host "========== BATCH SUMMARY =========="
$results | Format-Table -AutoSize
$fail = @($results | Where-Object { -not $_.ok })
Write-Host "OK $($results.Count - $fail.Count) / $($results.Count); FAIL $($fail.Count)"
if ($fail.Count -gt 0) {
  Write-Host "Failed:"
  $fail | ForEach-Object { Write-Host "  - $($_.id)" }
  exit 1
}
Write-Host "BATCH DONE"
exit 0
