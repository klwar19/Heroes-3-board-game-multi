#!/usr/bin/env bash
# gen.sh <prompt_file> <out_png> [input_ref_png]
# Runs one Codex image_gen job and copies the resulting PNG to <out_png>.
set -u
CODEX="C:/Users/klwar/AppData/Local/OpenAI/Codex/bin/05b3ab7eada19011/codex.exe"
PROMPT="$1"
OUT="$2"
REF="${3:-}"
WORK="C:/Users/klwar/Heroes-3-board-game-multi/.claude/worktrees/xianxia-town/scripts/anime-art/raw/heavenly-demon"
LOG="${OUT}.log"
mkdir -p "$(dirname "$OUT")"
if [ -n "$REF" ]; then
  cat "$PROMPT" | "$CODEX" exec --skip-git-repo-check --sandbox workspace-write -C "$WORK" -i "$REF" - > "$LOG" 2>&1
else
  cat "$PROMPT" | "$CODEX" exec --skip-git-repo-check --sandbox workspace-write -C "$WORK" - > "$LOG" 2>&1
fi
SESS=$(grep -oE 'session id: [0-9a-f-]+' "$LOG" | head -1 | awk '{print $3}')
if [ -z "$SESS" ]; then echo "FAIL no-session $OUT"; exit 1; fi
SDIR="C:/Users/klwar/.codex/generated_images/$SESS"
PNG=$(ls -t "$SDIR"/*.png 2>/dev/null | head -1)
if [ -z "$PNG" ]; then echo "FAIL no-png $OUT (session $SESS)"; exit 1; fi
cp "$PNG" "$OUT"
echo "OK $OUT <= $SESS"
