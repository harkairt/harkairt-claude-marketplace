#!/bin/bash

PMSET_STATE="/tmp/claude_caffeinate_cmd.pmset_active"
PID_FILE="/tmp/claude_caffeinate_cmd.pid"
ACTIVE_DIR="/tmp/claude_caffeinate_cmd.active"
BRIGHTNESS_BIN="$(dirname "$0")/brightness"
BRIGHTNESS_STATE="/tmp/claude_caffeinate_cmd.brightness"
LID_DIMMED="/tmp/claude_caffeinate_cmd.lid_dimmed"

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
    if [ -f "$BRIGHTNESS_STATE" ] && [ -x "$BRIGHTNESS_BIN" ]; then
        lid_closed=$(ioreg -r -k AppleClamshellState -d 4 2>/dev/null | grep '"AppleClamshellState"' | grep -c 'Yes')
        if [ "$lid_closed" -eq 1 ]; then
            if [ ! -f "$LID_DIMMED" ]; then
                "$BRIGHTNESS_BIN" set 0 2>/dev/null
                touch "$LID_DIMMED"
            fi
        else
            if [ -f "$LID_DIMMED" ]; then
                "$BRIGHTNESS_BIN" set "$(cat "$BRIGHTNESS_STATE")" 2>/dev/null
                rm -f "$LID_DIMMED"
            fi
        fi
    fi
    exit 0
fi

if [ -f "$BRIGHTNESS_STATE" ] && [ -x "$BRIGHTNESS_BIN" ]; then
    "$BRIGHTNESS_BIN" set "$(cat "$BRIGHTNESS_STATE")" 2>/dev/null
    rm -f "$BRIGHTNESS_STATE" "$LID_DIMMED"
fi

sudo -n /usr/bin/pmset -a disablesleep 0 2>/dev/null
rm -f "$PMSET_STATE" "$PID_FILE"
rm -rf "$ACTIVE_DIR"
