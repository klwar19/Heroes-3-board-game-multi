[CmdletBinding()]
param(
  [string[]]$Only = @(),
  [switch]$SkipRegistration
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$profilePath = Join-Path $repoRoot "scripts\anime-art\mgq-voice-lines.json"
$outputRoot = Join-Path $repoRoot "public\sounds\mgq\voices"
$tempRoot = Join-Path $repoRoot "tmp\mgq-voice-wav"
$actions = @("attack", "shoot", "defend", "hurt", "death", "move")

$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegCommand) {
  throw "ffmpeg is required to normalize and encode the generated voices."
}

Add-Type -AssemblyName System.Speech
$profiles = (Get-Content -Raw -Encoding utf8 -LiteralPath $profilePath | ConvertFrom-Json).profiles
if ($Only.Count -gt 0) {
  $wanted = [System.Collections.Generic.HashSet[string]]::new([string[]]$Only)
  $profiles = @($profiles | Where-Object { $wanted.Contains([string]$_.slug) })
  $missing = @($Only | Where-Object { $_ -notin @($profiles.slug) })
  if ($missing.Count -gt 0) {
    throw "Unknown MGQ voice slug(s): $($missing -join ', ')"
  }
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

# Action-level changes are intentionally small. Character identity comes from
# each profile's stable rate/pitch/formant tuple; these only improve delivery.
$actionShape = @{
  attack = @{ tempo = 1.03; pitch = 1.01 }
  shoot  = @{ tempo = 1.01; pitch = 1.01 }
  defend = @{ tempo = 0.98; pitch = 1.00 }
  hurt   = @{ tempo = 1.04; pitch = 1.02 }
  death  = @{ tempo = 0.92; pitch = 0.98 }
  move   = @{ tempo = 1.02; pitch = 1.00 }
}

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voiceName = "Microsoft Haruka Desktop"
  $installed = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
  if ($voiceName -notin $installed) {
    throw "$voiceName is not installed. Installed SAPI voices: $($installed -join ', ')"
  }
  $synth.SelectVoice($voiceName)
  $synth.Volume = 100

  $rendered = 0
  foreach ($profile in $profiles) {
    $slug = [string]$profile.slug
    $destinationDir = Join-Path $outputRoot $slug
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    $synth.Rate = [int]$profile.sapiRate

    foreach ($action in $actions) {
      $line = [string]$profile.lines.$action
      if ([string]::IsNullOrWhiteSpace($line)) {
        throw "$slug has no $action line in $profilePath"
      }

      $wav = Join-Path $tempRoot "$slug-$action.wav"
      $ogg = Join-Path $destinationDir "$action.ogg"
      $synth.SetOutputToWaveFile($wav)
      $synth.Speak($line)
      $synth.SetOutputToNull()

      $tempo = [double]$profile.tempo * [double]$actionShape[$action].tempo
      $pitch = [double]$profile.pitch * [double]$actionShape[$action].pitch
      $tempoText = $tempo.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
      $pitchText = $pitch.ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
      $formant = if ([string]$profile.formant -eq "shifted") { "shifted" } else { "preserved" }
      $filter = "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-52dB:stop_periods=-1:stop_duration=0.08:stop_threshold=-52dB," +
        "rubberband=tempo=${tempoText}:pitch=${pitchText}:transients=smooth:detector=soft:formant=${formant}," +
        "highpass=f=80,lowpass=f=10000,loudnorm=I=-18:TP=-1.5:LRA=7,apad=pad_dur=0.05"
      $ffmpegArgs = @(
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", $wav, "-af", $filter, "-ac", "1", "-ar", "44100",
        "-c:a", "libvorbis", "-q:a", "4", $ogg
      )
      & $ffmpegCommand.Source @ffmpegArgs
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ogg)) {
        throw "ffmpeg failed for $slug/$action"
      }
      Remove-Item -LiteralPath $wav -Force
      $rendered += 1
      Write-Output ("rendered {0}/{1} — {2}" -f $slug, $action, $line)
    }
  }
} finally {
  $synth.Dispose()
}

if (-not $SkipRegistration) {
  & node (Join-Path $repoRoot "scripts\register-mgq-voices.mjs")
  if ($LASTEXITCODE -ne 0) { throw "MGQ manifest registration failed." }
  & node (Join-Path $repoRoot "scripts\measure-sound-durations.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Sound duration measurement failed." }
}

Write-Output "Generated $rendered original synthetic Japanese MGQ combat clips."
