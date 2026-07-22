#!/usr/bin/env bash
# Copies the staged Heavenly Demon art (scripts/anime-art/raw/heavenly-demon/_staged)
# into public/assets. Split from build-heavenly-demon-art.mjs because an external
# scanner on this Windows worktree intermittently locks existing public/assets
# targets against node's writeFile/rename (errno -4094/-4048); shell `cp` is
# reliable. Retries each file. Run AFTER: node scripts/build-heavenly-demon-art.mjs
set -u
ROOT="C:/Users/klwar/Heroes-3-board-game-multi/.claude/worktrees/xianxia-town"
STAGE="$ROOT/scripts/anime-art/raw/heavenly-demon/_staged"
DEST="$ROOT/public/assets"
fail=0
count=0
while IFS= read -r src; do
  rel="${src#$STAGE/}"
  dst="$DEST/$rel"
  mkdir -p "$(dirname "$dst")"
  ok=0
  for attempt in 1 2 3 4 5 6 7 8; do
    if cp -f "$src" "$dst" 2>/dev/null; then ok=1; break; fi
    sleep 0.5
  done
  if [ "$ok" = 1 ]; then count=$((count+1)); else echo "FAIL: $rel"; fail=1; fi
done < <(find "$STAGE" -type f ! -name '*.tmp')
echo "deployed $count files"
exit $fail
