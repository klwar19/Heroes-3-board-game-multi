# Generate HIDDEN LEAF unit MASTERS only — frame-free art windows.
# Few/Pack share the same master; uniform frame is applied by:
#   node scripts/build-hidden-leaf-unit-cards.mjs
#
# Usage:
#   powershell -File scripts/_codex-prompts/hidden-leaf-masters.ps1
#   powershell -File scripts/_codex-prompts/hidden-leaf-masters.ps1 -Only genin-squad

param([string]$Only = "")

$ErrorActionPreference = "Continue"
$CODEX = "C:\Users\klwar\AppData\Local\OpenAI\Codex\bin\codex.exe"
$CWD = "C:\Users\klwar\Heroes-3-board-game-multi"
$OutDir = Join-Path $CWD "scripts\anime-art\raw\hidden-leaf\units"
$Session = Join-Path $CWD "generated-session-art\hidden-leaf\masters"
New-Item -ItemType Directory -Force -Path $OutDir, $Session | Out-Null

$MasterRules = @"
FRAME-FREE illustration master ONLY for a Heroes board-game unit card art window.
Portrait orientation ~1024x1400 or similar vertical. NO card frame, NO border, NO stats, NO title plate, NO FEW/PACK, NO text, NO numbers, NO UI, NO watermark, NO logo.
Style: painterly anime hybrid, mature proportions, muted leaf-green / slate / charcoal palette, controlled chakra light, readable silhouette at card size.
World: original Hidden Leaf shinobi village setting — forest canopy, training posts, blank metal forehead plates (NO copyrighted leaf logo — use plain circle plate or abstract spiral seal).
One dominant character/subject, one clear action pose, three depth planes.
"@

$jobs = @(
  @{
    id = "genin-squad"
    file = "units-hidden-leaf-bronze-genin-squad-master.png"
    subject = "GENIN SQUAD — two young academy ninja trainees in plain green training jackets and dark trousers, blank circular forehead plates, wooden practice kunai, forest training yard at dusk. Low-tier novices, hopeful and raw. Group of two."
  },
  @{
    id = "medical-nin"
    file = "units-hidden-leaf-bronze-medical-nin-master.png"
    subject = "MEDICAL-NIN — calm East-Asian young woman medic-ninja in cream and leaf-green robes, medical satchel, soft green healing chakra on one palm, wooden clinic hut behind. Support healer pose, not a fighter."
  },
  @{
    id = "anbu"
    file = "units-hidden-leaf-bronze-anbu-master.png"
    subject = "ANBU BLACK OPS — elite black-ops ninja in dark slate tactical gear with an original porcelain animal mask (hawk), short blades and kunai, half-crouched on a moonlit branch. Mysterious skirmisher."
  },
  @{
    id = "jonin"
    file = "units-hidden-leaf-silver-jonin-master.png"
    subject = "JONIN — seasoned elite jonin, mid-30s East-Asian man, short dark hair, blank forehead plate, dark green flak vest over black mesh, throwing a fan of silver kunai. Confident veteran, NOT a teenager."
  },
  @{
    id = "giant-toad"
    file = "units-hidden-leaf-silver-giant-toad-master.png"
    subject = "GIANT TOAD — massive summoned toad the size of a cart, warty olive and bronze hide, wise golden eyes, sitting on a mountain scroll-circle with forest mist. Beast unit, NO human."
  },
  @{
    id = "jinchuriki"
    file = "units-hidden-leaf-golden-jinchuriki-master.png"
    subject = "JINCHURIKI — young gold-tier beast-host: spiky blond hair, orange and black combat jacket, blank forehead plate, orange fox-chakra cloak with faint wispy tail-flames, mid-punch shockwave. Original heroic design."
  },
  @{
    id = "susanoo"
    file = "units-hidden-leaf-golden-susanoo-master.png"
    subject = "SUSANOO AVATAR — towering ethereal spectral warrior armor of translucent indigo/violet chakra, ribcage plating, glowing eyes, massive spectral sword, kneeling dark-haired swordsman small at its feet. Monumental gold avatar."
  }
)

function Invoke-One {
  param([string]$Prompt, [string]$Target, [int]$TimeoutSec = 420, [int]$MinBytes = 80000)
  Get-Process | Where-Object { $_.ProcessName -match '^codex$' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  $before = Get-Date
  $argsList = @(
    "exec", "-m", "gpt-5.5",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C", $CWD,
    "-s", "danger-full-access",
    "-o", (Join-Path $CWD "tmp-codex-hl-master-lastmsg.txt"),
    "-"
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $CODEX
  $psi.Arguments = ($argsList | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join " "
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
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($gen) {
      Write-Host "  GEN $($gen.Length) $($gen.Name)"
      $null = & node -e "require('sharp')(process.argv[1]).png().toFile(process.argv[2]).then(i=>console.log(i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen.FullName $Target 2>&1
      if ((Test-Path $Target) -and ((Get-Item $Target).Length -gt $MinBytes)) { $ok = $true; break }
    }
    if ($proc.HasExited) {
      $gen2 = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $before -and $_.Length -gt $MinBytes } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($gen2 -and -not $ok) {
        $null = & node -e "require('sharp')(process.argv[1]).png().toFile(process.argv[2]).then(i=>console.log(i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen2.FullName $Target 2>&1
        if ((Test-Path $Target) -and ((Get-Item $Target).Length -gt $MinBytes)) { $ok = $true }
      }
      break
    }
    Start-Sleep -Seconds 5
  }
  if (-not $proc.HasExited) { try { $proc.Kill() } catch {} }
  return $ok
}

foreach ($job in $jobs) {
  if ($Only -and $job.id -ne $Only -and $job.id -notlike "*$Only*") { continue }
  $target = Join-Path $OutDir $job.file
  # skip if already a real master
  if ((Test-Path $target) -and ((Get-Item $target).Length -gt 100000)) {
    Write-Host "SKIP $($job.id) already $( (Get-Item $target).Length ) bytes"
    continue
  }
  Write-Host "=== MASTER $($job.id) ==="
  $prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save.

$MasterRules

SUBJECT (exact, distinct design — never reuse other units):
$($job.subject)

SAVE OVERWRITE exact path:
$target

PNG. Verify > 100KB. Path and bytes only. No git. No Grok. No card frame.
"@
  $ok = Invoke-One -Prompt $prompt -Target $target
  $size = if (Test-Path $target) { (Get-Item $target).Length } else { 0 }
  Write-Host "  RESULT $($job.id) ok=$ok size=$size"
  if ($ok) { Copy-Item $target (Join-Path $Session $job.file) -Force }
  else { Write-Host "FAIL $($job.id)"; exit 1 }
}

Write-Host "MASTERS DONE — run: node scripts/build-hidden-leaf-unit-cards.mjs"
exit 0
