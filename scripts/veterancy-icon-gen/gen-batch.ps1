# Sequential Codex image_gen batch for the unit-experience icons listed in manifest.json.
# Output PNGs land in tmp/gen/<id>.png (existing ones are skipped); then run
# node scripts/veterancy-icon-gen/convert-icons.mjs to produce the 256px webps and point
# UNIT_RANK_ABILITY_ICONS at /game-tokens/rank-ability/veterancy/<id>.webp. Asset preparation only.
$ErrorActionPreference = "Continue"
$Root = "E:\heroes 3 BG multi"
$Codex = "C:\Users\klwar\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe"  # 0.145+; the older AppData\Local\OpenAI build cannot use gpt-5.6-* models
$GenDir = Join-Path $Root "tmp\gen"
$Log = Join-Path $GenDir "batch.log"
$manifest = Get-Content (Join-Path $Root "scripts\veterancy-icon-gen\manifest.json") -Raw | ConvertFrom-Json
foreach ($p in $manifest.PSObject.Properties) {
  $key = $p.Name; $subject = $p.Value
  $Target = Join-Path $GenDir "$key.png"
  if ((Test-Path $Target) -and ((Get-Item $Target).Length -gt 8000)) { Add-Content $Log "SKIP $key"; continue }
  $before = Get-Date
  $FullPrompt = @"
ONLY task: use the built-in image_gen tool once, then save the result to the project.

Single square video-game ability ICON: $subject. Centered symbol, painterly Heroes of Might and Magic III fantasy style, rich detail, dramatic rim lighting on a dark moody background with a soft radial vignette, luminous magical glow. No text, letters, numbers, frame, border, UI, watermark or logo. Output a single 512x512 image.

After generation, copy/move the selected image to EXACT path:
$Target
Overwrite if present. Print final path and byte size. No git. No other files.
"@
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Codex
  $psi.Arguments = "exec -m gpt-5.6-luna --dangerously-bypass-approvals-and-sandbox -C `"$GenDir`" -s danger-full-access -"
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = $GenDir
  $proc = New-Object System.Diagnostics.Process; $proc.StartInfo = $psi; [void]$proc.Start()
  $drain = { param($reader) try { $reader.ReadToEnd() } catch {} }
  $psOut = [powershell]::Create().AddScript($drain).AddArgument($proc.StandardOutput); $hOut = $psOut.BeginInvoke()
  $psErr = [powershell]::Create().AddScript($drain).AddArgument($proc.StandardError); $hErr = $psErr.BeginInvoke()
  $proc.StandardInput.Write($FullPrompt); $proc.StandardInput.Close()
  Add-Content $Log "START $key pid=$($proc.Id) $(Get-Date -Format HH:mm:ss)"
  $deadline = (Get-Date).AddSeconds(420); $ok = $false
  while ((Get-Date) -lt $deadline) {
    if ((Test-Path $Target) -and ((Get-Item $Target).LastWriteTime -gt $before) -and ((Get-Item $Target).Length -gt 8000)) { $ok = $true; if (-not $proc.HasExited) { Start-Sleep 2; try { $proc.Kill() } catch {} }; break }
    if ($proc.HasExited) { break }
    Start-Sleep 5
  }
  if (-not $proc.HasExited) { try { $proc.Kill() } catch {} }
  $out = ""; try { $out = $psOut.EndInvoke($hOut) } catch {}; $err = ""; try { $err = $psErr.EndInvoke($hErr) } catch {}
  if (-not $ok) {
    $gen = Get-ChildItem "$env:CODEX_HOME\generated_images" -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $before } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $gen) { $gen = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $before } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
    if ($gen) { Copy-Item $gen.FullName $Target -Force; $ok = $true; Add-Content $Log "FALLBACK $key from $($gen.FullName)" }
  }
  if ($ok) { Add-Content $Log "OK $key size=$((Get-Item $Target).Length) $(Get-Date -Format HH:mm:ss)" }
  else { Add-Content $Log "FAIL $key"; Add-Content $Log ("ERR: " + ([string]$err).Substring(0, [Math]::Min(1500, ([string]$err).Length))); Add-Content $Log ("OUT: " + ([string]$out).Substring(0, [Math]::Min(1500, ([string]$out).Length))) }
}
Add-Content $Log "BATCH DONE $(Get-Date -Format HH:mm:ss)"
