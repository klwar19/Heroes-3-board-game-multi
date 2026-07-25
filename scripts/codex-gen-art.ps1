param(
  [Parameter(Mandatory = $true)][string]$TargetRel,
  [Parameter(Mandatory = $true)][string]$Prompt,
  [int]$TimeoutSec = 600
)
$ErrorActionPreference = "Continue"
$Root = "C:\Users\klwar\Heroes-3-board-game-multi"
$Codex = "C:\Users\klwar\AppData\Local\OpenAI\Codex\bin\codex.exe"
if (-not (Test-Path $Codex)) {
  Write-Host "FAIL: codex.exe not found at $Codex"
  exit 1
}
$Target = Join-Path $Root $TargetRel
$dir = Split-Path $Target -Parent
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Get-Process | Where-Object { $_.ProcessName -match '^codex$' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$before = Get-Date
$FullPrompt = @"
ONLY task: use the built-in image_gen tool once, then save the result to the project.

$Prompt

After generation, copy/move the selected image to EXACT path:
$Target
If the raw file is not already PNG/WebP at a useful size, convert with node sharp.
Overwrite if present. Print final path and byte size. No git. No other files. No Grok.
"@
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Codex
$psi.Arguments = "exec -m gpt-5.5 --dangerously-bypass-approvals-and-sandbox -C `"$Root`" -s danger-full-access -"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$psi.WorkingDirectory = $Root
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
[void]$proc.Start()
$drain = { param($reader, $path) try { $all = $reader.ReadToEnd(); if ($path) { [System.IO.File]::WriteAllText($path, [string]$all) } } catch {} }
$stdoutLog = Join-Path $env:TEMP ("codex-art-out-" + [guid]::NewGuid().ToString("n") + ".log")
$stderrLog = Join-Path $env:TEMP ("codex-art-err-" + [guid]::NewGuid().ToString("n") + ".log")
$psOut = [powershell]::Create().AddScript($drain).AddArgument($proc.StandardOutput).AddArgument($stdoutLog)
$psErr = [powershell]::Create().AddScript($drain).AddArgument($proc.StandardError).AddArgument($stderrLog)
$hOut = $psOut.BeginInvoke(); $hErr = $psErr.BeginInvoke()
$proc.StandardInput.Write($FullPrompt)
$proc.StandardInput.Close()
Write-Host "STARTED pid=$($proc.Id) -> $TargetRel"
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$ok = $false
while ((Get-Date) -lt $deadline) {
  if (Test-Path $Target) {
    $item = Get-Item $Target
    if ($item.LastWriteTime -gt $before -and $item.Length -gt 8000) {
      Write-Host "OK size=$($item.Length) mtime=$($item.LastWriteTime)"
      $ok = $true
      if (-not $proc.HasExited) { Start-Sleep -Seconds 2; try { $proc.Kill() } catch {} }
      break
    }
  }
  $gen = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $before } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($gen) { Write-Host "GEN $($gen.Length) $($gen.FullName)" }
  if ($proc.HasExited) { Write-Host "exit=$($proc.ExitCode)"; break }
  Start-Sleep -Seconds 5
}
if (-not $proc.HasExited) { Write-Host "TIMEOUT"; try { $proc.Kill() } catch {} }
try { $psOut.EndInvoke($hOut) } catch {}; try { $psErr.EndInvoke($hErr) } catch {}
if (-not $ok) {
  $gen2 = Get-ChildItem "$env:USERPROFILE\.codex\generated_images" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt $before } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($gen2) {
    Write-Host "FALLBACK sharp from $($gen2.FullName)"
    & node -e "require('sharp')(process.argv[1]).toFile(process.argv[2]).then(i=>console.log('sharp',i.size)).catch(e=>{console.error(e);process.exit(1)})" $gen2.FullName $Target
    if ((Test-Path $Target) -and ((Get-Item $Target).LastWriteTime -gt $before)) {
      $ok = $true
      Write-Host "OK fallback size=$((Get-Item $Target).Length)"
    }
  }
}
if (-not $ok) {
  Write-Host "FAIL $TargetRel"
  if (Test-Path $stdoutLog) { Write-Host "--- stdout ---"; Get-Content $stdoutLog -Tail 40 }
  if (Test-Path $stderrLog) { Write-Host "--- stderr ---"; Get-Content $stderrLog -Tail 40 }
  exit 1
}
Write-Host "DONE $TargetRel size=$((Get-Item $Target).Length)"
exit 0
