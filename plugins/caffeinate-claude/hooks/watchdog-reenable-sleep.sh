#!/bin/bash

PMSET_STATE="/tmp/claude_caffeinate_cmd.pmset_active"
PID_FILE="/tmp/claude_caffeinate_cmd.pid"
ACTIVE_DIR="/tmp/claude_caffeinate_cmd.active"

if [ ! -f "$PMSET_STATE" ]; then
    exit 0
fi

alive=0
if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if ps -p "$pid" > /dev/null 2>&1 && ps -p "$pid" -o args= | grep -q '^caffeinate'; then
        alive=1
    fi
fi

if [ "$alive" -eq 1 ]; then
    exit 0
fi

sudo -n /usr/bin/pmset -a disablesleep 0 2>/dev/null
rm -f "$PMSET_STATE" "$PID_FILE"
rm -rf "$ACTIVE_DIR"
