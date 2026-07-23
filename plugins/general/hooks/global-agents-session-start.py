#!/usr/bin/env python3
import json
import sys
import os

try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    sys.exit(1)

agents_file = os.path.expanduser("~/.claude/AGENTS.md")
try:
    with open(agents_file, "r") as f:
        agents_content = f.read()

        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "SessionStart",
                        "additionalContext": f"<EXTREMELY_IMPORTANT>\n{agents_content}\n</EXTREMELY_IMPORTANT>",
                    },
                }
            )
        )
        
except FileNotFoundError:
    print(f"~/.claude/AGENTS.md not found at {agents_file}", file=sys.stderr)
    sys.exit(100)
except Exception as e:
    print(f"Error reading ~/.claude/AGENTS.md: {e}", file=sys.stderr)
    sys.exit(100)

sys.exit(0)
