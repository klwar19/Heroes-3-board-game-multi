#!/usr/bin/env bash
#
# Fetch the real Heroes III board-game asset scans from the community rulebook
# project (github.com/Heegu-sama/Homm3BG) into a local staging dir, then convert
# them into the .webp files the app consumes:
#
#   scripts/fetch-boardgame-assets.sh [stageDir]
#   node scripts/convert-boardgame-assets.mjs [stageDir]
#
# Everything is hosted LOCALLY under public/assets afterwards — the game never
# loads these from a remote link at runtime. Re-run only to refresh the art.
set -euo pipefail

BASE="https://raw.githubusercontent.com/Heegu-sama/Homm3BG/main/assets"
STAGE="${1:-$(cd "$(dirname "$0")/.." && pwd)/.boardgame-asset-stage}"
mkdir -p "$STAGE/images" "$STAGE/cards" "$STAGE/skills"

dl() { # $1 = path under assets/ (e.g. images/gold.png)
  curl -fsSL "$BASE/$1" -o "$STAGE/$1" && echo "  ok $1"
}

echo "Fetching into $STAGE"

# Resource icons, building spell token, combat tokens, and stat symbols.
for f in gold building_materials valuables spells \
         attack-token weakness-token corrosion-token damage-token defense-token paralysis \
         attack defense hp power knowledge initiative experience population \
         morale-positive morale-negative; do
  dl "images/$f.png"
done

# Air Elemental Few/Pack (real printed cards), the deck card backs, and the
# distinct empowered STATISTIC card faces (Defense, Knowledge).
for f in unit-air-elemental-few unit-air-elemental-pack \
         mmback neutral-back astrolog-back event-back \
         empowered_statistic empowered-knowledge; do
  dl "cards/$f.png"
done

# The nine secondary-skill emblems wired to the main-menu buttons.
for f in attack leadership artillery pathfinding luck wisdom intelligence interference logistics; do
  dl "skills/$f.png"
done

echo "Done. Next: node scripts/convert-boardgame-assets.mjs \"$STAGE\""
