#!/usr/bin/env bash
set -euo pipefail

# PreToolUse (Edit|Write) self-judge gate: regex-detect newly added comment
# lines and deny once (exit 2). The denial feedback goes back to the running
# session, which either strips the comments or resubmits the identical edit;
# a per-edit marker then allows the resubmission. No API/LLM spend, no user prompt.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"')

[ -n "$FILE_PATH" ] || exit 0

# Extension gate: map extension to a comment style, or bail if the file has none.
ext="${FILE_PATH##*.}"
ext=$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')
style=""
case "$ext" in
  py|sh|bash|zsh|rb|pl|r|yaml|yml|toml) style="hash" ;;
  js|jsx|ts|tsx|mjs|cjs|dart|go|rs|java|kt|kts|swift|c|h|cpp|hpp|cc|cs|scala|php|proto) style="slash" ;;
  sql|lua) style="dash" ;;
  *) exit 0 ;;
esac

# New text vs the text it replaces (Edit: old_string; Write: on-disk file).
if [ "$TOOL_NAME" = "Write" ]; then
  new_text=$(echo "$INPUT" | jq -r '.tool_input.content // ""')
  if [ -f "$FILE_PATH" ]; then old_text=$(cat "$FILE_PATH"); else old_text=""; fi
else
  new_text=$(echo "$INPUT" | jq -r '.tool_input.new_string // ""')
  old_text=$(echo "$INPUT" | jq -r '.tool_input.old_string // ""')
fi

# Extract comment lines for the file's style, dropping tool directives.
extract_comments() {
  local pat
  case "$1" in
    hash)  pat='(^|[[:space:]])# ' ;;
    slash) pat='(^|[[:space:]])(//|/\*)' ;;
    dash)  pat='(^|[[:space:]])-- ' ;;
  esac
  grep -E "$pat" \
    | grep -Ev 'eslint-|@ts-ignore|@ts-expect-error|@ts-nocheck|prettier-ignore|biome-ignore|noqa|type:|pragma|shellcheck|ruff:|mypy:|coverage|istanbul' \
    || true
}

old_comments=$(printf '%s\n' "$old_text" | extract_comments "$style")
new_comments=$(printf '%s\n' "$new_text" | extract_comments "$style")

# Comment lines in the new text that were not already present in the old text.
added=$(grep -Fxv -f <(printf '%s\n' "$old_comments") <(printf '%s\n' "$new_comments") || true)

# Nothing added — the common path, zero friction.
[ -n "$(printf '%s' "$added" | tr -d '[:space:]')" ] || exit 0

# Deny-once / allow-on-retry keyed by (file_path + new text).
MARKER_ROOT="/tmp/claude_comment_kill"
MARKER_DIR="$MARKER_ROOT/$SESSION_ID"
hash=$(printf '%s' "$FILE_PATH$new_text" | shasum -a 256 | cut -d' ' -f1)
marker="$MARKER_DIR/$hash"

# Marker present → this exact edit was already denied and deliberately resubmitted.
if [ -f "$marker" ]; then
  rm -f "$marker"
  exit 0
fi

mkdir -p "$MARKER_DIR"
touch "$marker"
find "$MARKER_ROOT" -type f -mmin +60 -delete 2>/dev/null || true

{
  echo "comment-kill: this edit adds comment line(s):"
  printf '%s\n' "$added"
  echo "Remove every comment that does not state a non-obvious constraint the code cannot express. If you judge ALL of them truly necessary, resubmit the identical edit and it will be allowed."
} >&2
exit 2
