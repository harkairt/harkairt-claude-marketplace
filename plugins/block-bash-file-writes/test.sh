#!/bin/bash
set -euo pipefail

HOOK="$(dirname "$0")/hooks/block-bash-file-writes.sh"
pass=0
fail=0

check() {
  local expected="$1" label="$2" cmd="$3"
  local input
  input=$(python3 -c "import json,sys;print(json.dumps({'tool_input':{'command':sys.argv[1]}}))" "$cmd")
  if printf '%s' "$input" | bash "$HOOK" >/dev/null 2>&1; then
    result="allow"
  else
    result="block"
  fi
  if [ "$result" = "$expected" ]; then
    printf "  PASS  %s\n" "$label"
    pass=$((pass + 1))
  else
    printf "  FAIL  %s  (expected %s, got %s)\n" "$label" "$expected" "$result"
    fail=$((fail + 1))
  fi
}

printf "=== sed / perl in-place edits ===\n"
check block "sed -i"                        "sed -i '' 's/a/b/' file.json"
check block "sed -i (second flag group)"    "sed -E -i '' 's/a/b/' file.json"
check block "sed --in-place"                "sed --in-place 's/a/b/' file.json"
check block "perl -i"                       "perl -i -e 's/a/b/' file.yml"
check block "perl -pi"                      "perl -pie 's/a/b/' file.yml"
check block "perl -0pi (digits in flags)"   "perl -0pi -e 's/a/b/' file.yml"
check block "perl -0i"                      "perl -e 'code' -0i file.yml"
check block "sed -i after &&"              "echo hello && sed -i '' 's/a/b/' f.json"
check block "perl -0pi after &&"           "echo hello && perl -0pi -e 's/x/y/' f.yml"
check allow "sed read-only (-n)"            "sed -n 1,40p file.ts"
check allow "perl read-only (-pe)"          "perl -pe 's/foo/bar/' file.yml"
check allow "grep -i (not sed/perl)"        "grep -i pattern file.ts"

printf "\n=== file redirection ===\n"
check block "> .ts file"                    "echo x > out.ts"
check block "> .json file"                  "echo x > out.json"
check block "> .yml file"                   "echo x > config.yml"
check block "> .env file"                   "echo x > .env"
check allow "pipe (not redirect)"           "echo x | grep y"

printf "\n=== inline script writes ===\n"
check block "python open(w)"                "python3 -c \"open('f','w').write('x')\""
check block "node writeFileSync"            "node -e \"fs.writeFileSync('f','x')\""
check allow "python read-only"              "python3 -c \"print('hello')\""

printf "\n=== edge cases ===\n"
check allow "empty command"                 ""
check allow "ls -lai (not sed/perl)"        "ls -lai somefile"

printf "\n%d passed, %d failed\n" "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
