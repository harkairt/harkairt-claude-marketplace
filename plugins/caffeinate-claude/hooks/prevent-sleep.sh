#!/bin/bash

# Prevent Mac from sleeping while Claude is actively working on a response.
# Starts caffeinate on each prompt submission; kills it when Claude stops.
# Parallel-safe: each active session owns a marker file in ACTIVE_DIR, and a
# single machine-global caffeinate runs while any marker exists (a ref-count).
# Adapted from: https://tngranados.com/blog/preventing-mac-sleep-claude-code/

PID_FILE="/tmp/claude_caffeinate_cmd.pid"
ACTIVE_DIR="/tmp/claude_caffeinate_cmd.active"

timeout="${CAFFEINATE_TIMEOUT:-3600}"
stale_min=$(( timeout / 60 ))

# Identify this session (fall back to a single shared slot if jq/id absent)
input=$(cat)
sid=$(/usr/bin/jq -r '.session_id // "default"' <<<"$input" 2>/dev/null)
[ -z "$sid" ] && sid="default"

# Register this session, then reap markers older than the timeout (leaked by a
# session that was interrupted without a Stop hook firing).
mkdir -p "$ACTIVE_DIR"
find "$ACTIVE_DIR" -type f -mmin +"$stale_min" -delete 2>/dev/null
touch "$ACTIVE_DIR/$sid"

# Start caffeinate only if it isn't already running (don't kill/restart — that
# clobbered other sessions' caffeinate in the old single-PID design).
running=0
if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if ps -p "$pid" > /dev/null 2>&1 && ps -p "$pid" -o args= | grep -q '^caffeinate'; then
        running=1
    fi
fi

if [ "$running" -eq 0 ]; then
    nohup caffeinate -is -t "$timeout" > /dev/null 2>&1 &
    echo $! > "$PID_FILE"
fi

PMSET_STATE="/tmp/claude_caffeinate_cmd.pmset_active"
if sudo -n /usr/bin/pmset -a disablesleep 1 2>/dev/null; then
    touch "$PMSET_STATE"
fi
