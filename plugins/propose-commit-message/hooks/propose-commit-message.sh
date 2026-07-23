#!/bin/bash
# Stop hook: propose commit message when uncommitted changes exist
# Uses a hash file to avoid re-proposing for same diff

staged=$(git diff --cached --stat 2>/dev/null)
unstaged=$(git diff --stat 2>/dev/null)
untracked=$(git ls-files --others --exclude-standard 2>/dev/null)

if [ -z "$staged" ] && [ -z "$unstaged" ] && [ -z "$untracked" ]; then
  rm -f /tmp/claude-propose-commit-hash 2>/dev/null
  exit 0
fi

current_hash=$(echo "$staged$unstaged$untracked" | shasum -a 256 | cut -d' ' -f1)
last_hash=$(cat /tmp/claude-propose-commit-hash 2>/dev/null)

if [ "$current_hash" = "$last_hash" ]; then
  exit 0
fi

echo "$current_hash" > /tmp/claude-propose-commit-hash

context="There are uncommitted changes in the working directory. Propose a short commit message (just print the message, don't run git commit)."

if [ -n "$staged" ]; then
  context="$context\n\nStaged changes:\n$staged"
fi
if [ -n "$unstaged" ]; then
  context="$context\n\nUnstaged changes:\n$unstaged"
fi
if [ -n "$untracked" ]; then
  context="$context\n\nUntracked files:\n$untracked"
fi

diff_content=$(git diff --cached -U3 2>/dev/null; git diff -U3 2>/dev/null)
if [ ${#diff_content} -gt 6000 ]; then
  diff_content="${diff_content:0:6000}
... (truncated)"
fi

if [ -n "$diff_content" ]; then
  context="$context\n\nDiff:\n$diff_content"
fi

printf '%s' "$context" | jq -Rs '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:.}}'

exit 2
