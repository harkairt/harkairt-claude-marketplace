#!/bin/bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHDOG_SCRIPT="$PLUGIN_DIR/hooks/watchdog-reenable-sleep.sh"
PLIST_TEMPLATE="$PLUGIN_DIR/com.claude.caffeinate-watchdog.plist.template"
PLIST_NAME="com.claude.caffeinate-watchdog.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
SUDOERS_FILE="/etc/sudoers.d/claude_caffeinate"

setup_sudoers() {
    if sudo -n /usr/bin/pmset -a disablesleep 0 2>/dev/null; then
        echo "Passwordless pmset already available, skipping sudoers setup."
        return 0
    fi

    echo "Setting up passwordless sudoers entry for pmset..."
    local tmp
    tmp=$(mktemp)
    echo "$(whoami) ALL=(root) NOPASSWD: /usr/bin/pmset" > "$tmp"
    chmod 0440 "$tmp"

    if ! visudo -c -f "$tmp" 2>/dev/null; then
        echo "ERROR: sudoers validation failed." >&2
        rm -f "$tmp"
        return 1
    fi

    sudo cp "$tmp" "$SUDOERS_FILE"
    sudo chmod 0440 "$SUDOERS_FILE"
    sudo chown root:wheel "$SUDOERS_FILE"
    rm -f "$tmp"

    if ! sudo -n /usr/bin/pmset -a disablesleep 0 2>/dev/null; then
        echo "ERROR: sudoers entry installed but sudo -n still fails." >&2
        return 1
    fi

    echo "Sudoers entry installed at $SUDOERS_FILE"
}

setup_watchdog() {
    chmod +x "$WATCHDOG_SCRIPT"

    mkdir -p "$HOME/Library/LaunchAgents"

    if launchctl list "com.claude.caffeinate-watchdog" 2>/dev/null | grep -q .; then
        launchctl bootout "gui/$(id -u)" "$PLIST_DEST" 2>/dev/null || true
    fi

    sed "s|__WATCHDOG_PATH__|$WATCHDOG_SCRIPT|g" "$PLIST_TEMPLATE" > "$PLIST_DEST"

    launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
    echo "Watchdog launchd agent installed and loaded."
}

echo "=== caffeinate-claude setup ==="
echo

setup_sudoers
echo

setup_watchdog
echo

echo "Setup complete. Verify with:"
echo "  pmset -g | grep SleepDisabled"
echo "  launchctl list | grep caffeinate-watchdog"
