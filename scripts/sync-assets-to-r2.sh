#!/usr/bin/env bash
# Sync the game's static media to the Cloudflare R2 bucket behind the CDN
# domain (docs/cloudflare-custom-domain-cdn-plan.md, Phase 7).
#
#   public/assets  ->  <bucket>/assets/**
#   public/sounds  ->  <bucket>/sounds/**
#   public/fonts   ->  <bucket>/fonts/**   (fonts need bucket CORS: run
#                                           `npm run setup:r2-cors` once)
#   plus a tiny /cdn-check.txt health object for the smoke test.
#
# Runs automatically on every push to main that touches public/ media
# (.github/workflows/sync-media-r2.yml), so merged art/sounds/fonts appear on
# the CDN with no manual step; this script stays the manual/local path.
#
# Copy-only (never deletes remote objects), idempotent (re-runs transfer only
# changed files), stamps Cache-Control on every object, and lets rclone detect
# Content-Type from the file extension.
#
# Required env (create an "Object Read & Write" R2 API token scoped to the
# bucket under R2 -> Manage R2 API Tokens):
#   R2_ACCOUNT_ID         Cloudflare account id
#   R2_ACCESS_KEY_ID      R2 API token access key id
#   R2_SECRET_ACCESS_KEY  R2 API token secret
# Optional env:
#   R2_BUCKET             bucket name            (default: heroes3)
#   R2_CACHE_CONTROL      Cache-Control header   (default: public, max-age=604800)
#   R2_PUBLIC_DOMAIN      e.g. cdn.your-domain.com — only used to print the
#                         verification curl commands at the end
#
# Usage:
#   npm run sync:assets -- --dry-run    # preview what would upload
#   npm run sync:assets                 # real upload (extra rclone flags pass through)
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v rclone >/dev/null 2>&1; then
  echo "error: rclone is not installed (https://rclone.org/install/ — apt install rclone / brew install rclone)" >&2
  exit 1
fi

for var in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "error: $var is not set (see the header of this script)" >&2
    exit 1
  fi
done

BUCKET="${R2_BUCKET:-heroes3}"
CACHE_CONTROL="${R2_CACHE_CONTROL:-public, max-age=604800}"

# Configure an in-process rclone remote named "r2" purely through env vars —
# no rclone.conf file is written or read.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
# The scoped token cannot create buckets; don't let rclone try.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

COMMON_FLAGS=(
  --header-upload "Cache-Control: ${CACHE_CONTROL}"
  --transfers 16
  --stats-one-line
  --stats 15s
  "$@"
)

echo "== Syncing public/assets -> r2:${BUCKET}/assets (copy-only, ${CACHE_CONTROL})"
rclone copy public/assets "r2:${BUCKET}/assets" "${COMMON_FLAGS[@]}"

echo "== Syncing public/sounds -> r2:${BUCKET}/sounds"
rclone copy public/sounds "r2:${BUCKET}/sounds" "${COMMON_FLAGS[@]}"

echo "== Syncing public/fonts -> r2:${BUCKET}/fonts (CORS-mode loads — see setup-r2-cors.mjs)"
rclone copy public/fonts "r2:${BUCKET}/fonts" "${COMMON_FLAGS[@]}"

echo "== Uploading /cdn-check.txt health object"
printf 'heroes3 cdn ok — synced %s from %s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown rev')" |
  rclone rcat "r2:${BUCKET}/cdn-check.txt" \
    --header-upload "Cache-Control: no-store" \
    --header-upload "Content-Type: text/plain; charset=utf-8" "$@"

echo
echo "Done. Verify from the CDN domain (Phase 7.4 of the plan doc):"
HOST="${R2_PUBLIC_DOMAIN:-cdn.hamthefirt.xyz}"
echo "  curl -sI https://${HOST}/cdn-check.txt"
echo "  curl -sI https://${HOST}/assets/ui/map-backdrop.jpg     # 200 + image/jpeg + cache-control"
echo "  curl -sI https://${HOST}/assets/ui/map-backdrop.jpg | grep -i cf-cache-status   # 2nd hit: HIT"
echo "  curl -sI https://${HOST}/sounds/manifest.json"
echo "  curl -sI -H 'Origin: https://hamthefirt.xyz' https://${HOST}/fonts/LiberationSerif-Regular.ttf | grep -i access-control   # CORS for @font-face"
