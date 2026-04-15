#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // ""')

if [ "$PERMISSION_MODE" = "plan" ]; then
  echo "Plan mode is active! Create a plan first, then use ExitPlanMode tool" >&2
  exit 2
fi

exit 0