#!/bin/bash

# Re-enable Mac sleep after Claude finishes working on a response.
# Removes this session's marker; kills the shared caffeinate only when no other
# session is still generating.
# Adapted from: https://tngranados.com/blog/preventing-mac-sleep-claude-code/

PID_FILE="/tmp/claude_caffeinate_cmd.pid"
ACTIVE_DIR="/tmp/claude_caffeinate_cmd.active"

stale_min=$(( ${CAFFEINATE_TIMEOUT:-3600} / 60 ))

# Identify this session the same way prevent-sleep.sh does
input=$(cat)
sid=$(/usr/bin/jq -r '.session_id // "default"' <<<"$input" 2>/dev/null)
[ -z "$sid" ] && sid="default"

# Release this session's hold, then reap any leaked markers
rm -f "$ACTIVE_DIR/$sid"
find "$ACTIVE_DIR" -type f -mmin +"$stale_min" -delete 2>/dev/null

# Another session still generating — leave caffeinate running
if [ -d "$ACTIVE_DIR" ] && [ -n "$(ls -A "$ACTIVE_DIR" 2>/dev/null)" ]; then
    exit 0
fi

PMSET_STATE="/tmp/claude_caffeinate_cmd.pmset_active"
if [ -f "$PMSET_STATE" ]; then
    sudo -n /usr/bin/pmset -a disablesleep 0 2>/dev/null
    rm -f "$PMSET_STATE"
fi

if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if ps -p "$pid" > /dev/null 2>&1 && ps -p "$pid" -o args= | grep -q '^caffeinate'; then
        kill "$pid" 2>/dev/null
    fi
    rm -f "$PID_FILE"
fi
rmdir "$ACTIVE_DIR" 2>/dev/null
