#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // ""')

if [ "$PERMISSION_MODE" = "plan" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
  # Allow writes to plan folders/files
  if echo "$FILE_PATH" | grep -qE '(^|/)(plans?/|plan[-_.]|[^/]*\.plan\.md$)'; then
    exit 0
  fi
  echo "Plan mode is active! Create a plan first, then use ExitPlanMode tool" >&2
  exit 2
fi

exit 0