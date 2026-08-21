# SOURCES record — PvE field-effect PARTICLE SPRITES (2026-08-21).
# Serial batch generation via codex-gen-art.ps1 (codex kills concurrent runs, so
# these MUST run one at a time). Outputs land in the C:\ clone (codex-gen-art's
# hardcoded $Root); they were then alpha-verified, downscaled with sharp
# (ember/spore 128, mist 192, dust trim+64, dripwater h192) and copied to
# E:\...\public\assets\fx\pve\. The five overlay-*.mp4 files in the same
# directory are NOT generated: they are Pixabay stock clips (license: free use,
# no attribution) downscaled to 640x360 crf28, sources recorded in
# src/components/table/pve-field-effect-overlay.tsx.
$ErrorActionPreference = "Continue"
$gen = "E:\heroes 3 BG multi\scripts\codex-gen-art.ps1"
$rel = "public/assets/fx/pve"

$common = "Transparent PNG with a fully transparent background (real alpha channel), no letters, no text, no watermark, no border, no frame. Painterly Heroes of Might and Magic 3 fantasy art style."

$jobs = @(
  @{ f = "particle-ember.webp"; p = "A single soft glowing ember spark: a bright warm-orange core fading to a soft orange-red halo, gaussian-soft edges, centered, filling ~60% of a 256x256 square. $common" },
  @{ f = "particle-spore.webp"; p = "A single soft glowing spore orb: pale luminous green core fading to a wispy translucent green halo, very soft feathered edges, centered in a 256x256 square. $common" },
  @{ f = "particle-mist.webp"; p = "A single soft wisp of pale spectral mist: an irregular translucent whitish-blue cloud puff with feathered dissolving edges, centered in a 256x256 square. $common" },
  @{ f = "particle-dust.webp"; p = "A single tiny warm dust mote: a small soft cream-gold speck with a faint glow halo, centered in a 128x128 square, mostly transparent. $common" },
  @{ f = "particle-dripwater.webp"; p = "A single vertical falling water droplet streak: a thin bright teal-white elongated teardrop with a soft trailing tail above it, centered in a tall 128x256 image. $common" }
)

foreach ($j in $jobs) {
  Write-Host "=== GEN $($j.f) ==="
  & $gen -TargetRel "$rel/$($j.f)" -Prompt $j.p -TimeoutSec 480
  Write-Host "=== END $($j.f) exit=$LASTEXITCODE ==="
}
Write-Host "ALL DONE"
