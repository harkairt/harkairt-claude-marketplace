#!/bin/bash
# Blocks file edits made through Bash. All file changes must go through the
# Edit/Write tools. Rule lives in ~/.claude/CLAUDE.md:
# "every file modification goes through Edit/Write".


input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)


[ -z "$cmd" ] && exit 0


deny() {
  printf '%s\n' "$1" >&2
  exit 2
}


# in-place edits with sed / perl
printf '%s' "$cmd" | grep -qE '(^|[|;&[:space:]])(sed|perl)[[:space:]]+([^|;&]*[[:space:]])?(-[a-zA-Z0-9]*i|--in-place)' &&
  deny "Editing files from Bash is not allowed (sed -i). Use Read + Edit instead."


# writing to a file via redirection or heredoc
printf '%s' "$cmd" | grep -qE '>[[:space:]]*[^|&>[:space:]]*\.(ts|tsx|js|jsx|vue|json|css|scss|html|md|sql|sh|yml|yaml|env)' &&
  deny "Writing files from Bash is not allowed (> redirection). Use Write or Edit instead."


# opening a file for writing from an inline python/node script
printf '%s' "$cmd" | grep -qE "(python3?|node)[^|;&]*(open\([^)]*['\"]w|writeFileSync|\.write\()" &&
  deny "Writing files from an inline script is not allowed. Use Write or Edit instead."


exit 0