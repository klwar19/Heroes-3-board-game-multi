# Hidden Leaf unit masters from scratch — ANIME SHINOBI (Naruto-like), NOT wuxia.
# One master per unit line → node scripts/build-hidden-leaf-unit-cards.mjs
#
#   powershell -File scripts/_codex-prompts/hidden-leaf-masters-v2.ps1
#   powershell -File scripts/_codex-prompts/hidden-leaf-masters-v2.ps1 -Only genin-squad

param([string]$Only = "")

$ErrorActionPreference = "Continue"
$CODEX = "C:\Users\klwar\AppData\Local\OpenAI\Codex\bin\codex.exe"
$CWD = "C:\Users\klwar\Heroes-3-board-game-multi"
$OutDir = Join-Path $CWD "scripts\anime-art\raw\hidden-leaf\units"
$Session = Join-Path $CWD "generated-session-art\hidden-leaf\masters"
New-Item -ItemType Directory -Force -Path $OutDir, $Session | Out-Null

if (-not (Test-Path $CODEX)) { Write-Host "NO CODEX"; exit 1 }

$Style = @"
FRAME-FREE vertical character illustration for a Heroes of Might and Magic board-game UNIT CARD art panel (~1024x1280).
Style: modern Japanese SHONEN ANIME painting (like Naruto / modern ninja anime) — clean line, cel shading with soft painted light, mature teen/adult proportions.
MUST look like ANIME NINJA. MUST NOT look like Chinese wuxia/xianxia: NO floating jian swords, NO daoist robes, NO jade qi talismans, NO ink-wash mountains, NO hanfu, NO guqin, NO Sect Immortal aesthetic.
World: Hidden Leaf village — wooden training posts, dense green forest canopy, dusk lanterns, blank circular metal forehead plates (NO copyrighted leaf logo).
NO card frame, NO border, NO text, NO numbers, NO stats, NO UI, NO watermark, NO logo.
Single clear pose, readable silhouette at card size, three depth planes.
"@

$jobs = @(
  @{
    id = "genin-squad"
    file = "units-hidden-leaf-bronze-genin-squad-master.png"
    subject = "GENIN SQUAD: two young Japanese anime ninja trainees (boy + girl teens), bright green high-collar jackets, dark mesh under-armor, blank metal headbands, orange goggles optional on one, practice wooden kunai, energetic training pose in a leaf-village yard. Low-tier academy kids energy — NOT masters, NOT Chinese martial artists."
  },
  @{
    id = "medical-nin"
    file = "units-hidden-leaf-bronze-medical-nin-master.png"
    subject = "MEDICAL-NIN: young Japanese anime woman medic-ninja, cream short jacket over green ninja pants, medical pouch belt, pink-brown hair in ponytail, glowing green medical chakra on both palms, calm healer pose, village clinic behind. Anime ninja medic — NOT a wuxia priestess."
  },
  @{
    id = "anbu"
    file = "units-hidden-leaf-bronze-anbu-master.png"
    subject = "ANBU BLACK OPS: Japanese anime black-ops ninja, dark grey tactical flak and arm guards, porcelain animal mask (cat, original design), short swords on back, crouching on a night branch, body-flicker cyan streaks. Stealth assassin — NOT a wuxia assassin in robes."
  },
  @{
    id = "jonin"
    file = "units-hidden-leaf-silver-jonin-master.png"
    subject = "JONIN: adult Japanese anime elite ninja man, late 20s, short dark hair, blank metal headband, green flak vest over black mesh, mid-throw of a fan of steel kunai, confident veteran. Modern anime ninja elite — NOT a samurai, NOT a wuxia swordsman."
  },
  @{
    id = "giant-toad"
    file = "units-hidden-leaf-silver-giant-toad-master.png"
    subject = "GIANT TOAD: enormous anime summon toad the size of a cart, olive warty skin, golden eyes, sitting on a giant scroll seal circle in misty forest. Beast only — no human rider in frame. Japanese anime summon creature, not Chinese myth beast."
  },
  @{
    id = "jinchuriki"
    file = "units-hidden-leaf-golden-jinchuriki-master.png"
    subject = "JINCHURIKI: Japanese anime young man blond spiky hair, whisker face marks, orange and black high-collar jacket, blank headband, wrapped in roaring orange fox chakra cloak with wispy tail-flames, mid-punch shockwave. Gold-tier anime beast-host hero — iconic shonen energy."
  },
  @{
    id = "susanoo"
    file = "units-hidden-leaf-golden-susanoo-master.png"
    subject = "SUSANOO AVATAR: towering anime spectral warrior of translucent indigo and violet chakra armor, ribcage plating, glowing eyes, giant spectral blade, small dark-haired anime swordsman kneeling at its feet. Epic gold-tier anime chakra construct — not a Chinese immortal statue."
  }
)

function Invoke-Master {
  param($job)
  $target = Join-Path $OutDir $job.file
  if ((Test-Path $target) -and ((Get-Item $target).Length -gt 150000)) {
    Write-Host "SKIP $($job.id) already $((Get-Item $target).Length)"
    return $true
  }
  Get-Process | Where-Object { $_.ProcessName -match '^codex$' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
  $before = Get-Date
  $prompt = @"
ONLY task: use the built-in image_gen tool ONCE, then save the PNG.

$Style

SUBJECT (exact):
$($job.subject)

Save OVERWRITE exact path:
$target

You may convert with node/sharp. Print final path and byte size. No git. No Grok. Stop after save.
"@
  Write-Host "=== MASTER $($job.id) $(Get-Date -Format HH:mm:ss) ==="
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $CODEX
  $psi.Arguments = "exec -m gpt-5.5 --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -C `"$CWD`" -s danger-full-access -"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = $CWD
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $p.StandardInput.Write($prompt)
  $p.StandardInput.Close()
  Write-Host "  pid=$($p.Id)"

  $ok = $false
  $deadline = (Get-Date).AddSeconds(540)
  while ((Get-Date) -lt $deadline) {
    $gen = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt $before -and $_.Length -gt 100000 } |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($gen) {
      Write-Host "  GEN $($gen.Length) $($gen.Name)"
      New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
      $null = & node -e "require('sharp')(process.argv[1]).png().toFile(process.argv[2]).then(i=>console.log(i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen.FullName $target 2>&1
      if ((Test-Path $target) -and ((Get-Item $target).Length -gt 100000)) { $ok = $true; break }
    }
    if ($p.HasExited) {
      Start-Sleep 4
      $gen2 = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $before -and $_.Length -gt 100000 } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($gen2 -and -not $ok) {
        $null = & node -e "require('sharp')(process.argv[1]).png().toFile(process.argv[2]).then(i=>console.log(i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen2.FullName $target 2>&1
        if ((Test-Path $target) -and ((Get-Item $target).Length -gt 100000)) { $ok = $true }
      }
      Write-Host "  exit=$($p.ExitCode)"
      break
    }
    Start-Sleep 6
  }
  if (-not $p.HasExited) { try { $p.Kill() } catch {} }
  $sz = if (Test-Path $target) { (Get-Item $target).Length } else { 0 }
  Write-Host "  RESULT $($job.id) ok=$ok size=$sz"
  if ($ok) {
    Copy-Item $target (Join-Path $Session $job.file) -Force
  }
  return $ok
}

$fail = @()
foreach ($job in $jobs) {
  if ($Only -and $job.id -ne $Only -and $job.id -notlike "*$Only*") { continue }
  $ok = Invoke-Master $job
  if (-not $ok) {
    Write-Host "RETRY $($job.id)"
    Start-Sleep 5
    $ok = Invoke-Master $job
  }
  if (-not $ok) { $fail += $job.id; Write-Host "HARD FAIL $($job.id)"; break }
  Start-Sleep 3
}

Write-Host "======== SUMMARY ========"
Get-ChildItem $OutDir -ErrorAction SilentlyContinue | Select-Object Name, Length | Format-Table -AutoSize
if ($fail.Count) { Write-Host "FAILED: $($fail -join ', ')"; exit 1 }
Write-Host "ALL MASTERS OK — next: node scripts/build-hidden-leaf-unit-cards.mjs"
exit 0
