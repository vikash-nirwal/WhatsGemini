#!/usr/bin/env bash
# Prints how much disk this project uses, split into what you need and what
# can be regenerated or cleared. Read-only: it never deletes anything.
#
#   bash scripts/disk-usage.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

size() { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }
row() { printf "  %-46s %8s  %s\n" "$1" "$2" "$3"; }

echo "WhatsGemini disk usage ($(date '+%Y-%m-%d %H:%M'))"
echo
echo "Project folder total: $(size .)"
echo
echo "Needed:"
row "Source (files tracked by git)" "$(git ls-files -z | xargs -0 du -ck 2>/dev/null | tail -1 | awk '{printf "%.1fM", $1/1024}')" ""
row ".git (history)" "$(size .git)" ""
NM_K=$(du -sk node_modules 2>/dev/null | cut -f1); CACHE_K=$(du -sk node_modules/.cache 2>/dev/null | cut -f1)
row "node_modules (packages, excluding .cache)" "$(awk -v a="${NM_K:-0}" -v b="${CACHE_K:-0}" 'BEGIN {printf "%.0fM", (a-b)/1024}')" "reinstall with npm install"
echo
echo "Regenerable (safe to delete, rebuilt when needed):"
row "build/ (production build)" "$(size build)" "npm run build"
row "playwright-report/, test-results/" "$( { du -sk playwright-report test-results 2>/dev/null || true; } | awk '{s+=$1} END {printf s ? "%.1fM" : "-", s/1024}')" "re-created by test runs"
for d in node_modules/.cache/*/; do [ -d "$d" ] && row "${d%/}" "$(size "$d")" "build/dev-server/deploy cache"; done

echo
echo "Git worktrees:"
found=0
while read -r path _ branch; do
  [ "$path" = "$ROOT" ] && continue
  found=1
  b="${branch#[}"; b="${b%]}"
  dirty=$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if git merge-base --is-ancestor "$(git -C "$path" rev-parse HEAD 2>/dev/null)" main 2>/dev/null; then merged="merged into main"; else merged="NOT merged"; fi
  note="$merged, $([ "$dirty" = 0 ] && echo clean || echo "$dirty uncommitted changes")"
  row "${path#"$ROOT"/} ($b)" "$(size "$path")" "$note"
done < <(git worktree list)
[ "$found" = 0 ] && echo "  none"

echo
echo "Outside the project folder:"
PW_CACHE="$HOME/Library/Caches/ms-playwright"
[ -d "$PW_CACHE" ] || PW_CACHE="$HOME/.cache/ms-playwright"
row "Playwright browsers" "$(size "$PW_CACHE")" "shared by all projects; npx playwright install"
row "Claude Code session data" "$(size "$HOME/.claude/projects/$(echo "$ROOT" | sed 's#[/.]#-#g')")" "transcripts for this project"
