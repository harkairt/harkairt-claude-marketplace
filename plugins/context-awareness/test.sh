#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOOK="$ROOT/hooks/context-notify.sh"
USAGE="$ROOT/bin/context-usage.sh"
STATE_DIR="/tmp/claude_context_awareness"
TMP="$(mktemp -d)"
PREFIX="test-ca-$$-$RANDOM"
trap 'rm -rf "$TMP"; rm -f "$STATE_DIR/$PREFIX"-* "$STATE_DIR/.$PREFIX"-*' EXIT
pass=0
fail=0
n=0

new_session() {
  n=$((n + 1))
  sid="$PREFIX-$n"
  tr="$TMP/$sid.jsonl"
  : > "$tr"
}

assistant() {
  local tokens="$1" sidechain="${2:-false}" model="${3:-claude-opus-5-5}"
  printf '{"type":"assistant","isSidechain":%s,"message":{"model":"%s","usage":{"input_tokens":2,"cache_creation_input_tokens":1000,"cache_read_input_tokens":%d,"output_tokens":100}}}\n' \
    "$sidechain" "$model" "$((tokens - 1102))" >> "$tr"
}

user_line() {
  printf '{"type":"user","isSidechain":false,"message":{"role":"user","content":"hi"}}\n' >> "$tr"
}

compact() {
  printf '{"type":"system","subtype":"compact_boundary","isSidechain":false,"compactMetadata":{"trigger":"auto","preTokens":190000,"postTokens":%d}}\n' "$1" >> "$tr"
}

run_hook() {
  local event="${1:-UserPromptSubmit}" agent="${2:-}" path="${3:-$tr}"
  local input
  input=$(jq -nc --arg s "$sid" --arg t "$path" --arg e "$event" --arg a "$agent" \
    '{session_id: $s, transcript_path: $t, hook_event_name: $e} + (if $a == "" then {} else {agent_id: $a} end)')
  out="$(printf '%s' "$input" | bash "$HOOK" 2>&1)" && code=0 || code=$?
}

ok() { printf "  PASS  %s\n" "$1"; pass=$((pass + 1)); }
ko() { printf "  FAIL  %s  (%s)\n" "$1" "$2"; fail=$((fail + 1)); }

expect_silent() {
  if [ "$code" -eq 0 ] && [ -z "$out" ]; then ok "$1"; else ko "$1" "exit $code, output: $out"; fi
}

expect_note() {
  local label="$1" needle="$2" event="${3:-UserPromptSubmit}"
  local ctx
  ctx="$(printf '%s' "$out" | jq -r --arg e "$event" 'select(.hookSpecificOutput.hookEventName == $e) | .hookSpecificOutput.additionalContext' 2>/dev/null || true)"
  if [ "$code" -eq 0 ] && [[ "$ctx" == *"<context-usage-notice>"* ]] && [[ "$ctx" == *"$needle"* ]]; then
    ok "$label"
  else
    ko "$label" "exit $code, output: $out"
  fi
}

expect_no_wrap_up() {
  if [[ "$out" != *"Do not start work"* ]]; then ok "$1"; else ko "$1" "unexpected wrap-up line"; fi
}

printf "=== thresholds ===\n"
new_session
assistant 60000
run_hook; expect_silent "30% -> no output"
user_line; assistant 110000
run_hook; expect_note "55% -> note" "55% used (110k of 200k tokens)"
expect_no_wrap_up "55% -> no wrap-up line"
run_hook PostToolUse; expect_silent "55% again -> no output"
assistant 124000
run_hook PostToolUse; expect_note "62% -> new note (PostToolUse)" "62% used (124k of 200k tokens)" PostToolUse
assistant 130000
run_hook; expect_silent "65% -> no output (same bucket)"
assistant 144000
run_hook; expect_note "72% -> new note" "72% used (144k of 200k tokens)"
assistant 164000
run_hook; expect_note "82% -> new note" "82% used"
expect_no_wrap_up "82% -> no wrap-up line (below WRAP_UP_AT)"
assistant 174000
run_hook; expect_silent "87% -> no output (same bucket as 80)"
assistant 180000
run_hook; expect_note "90% -> note with wrap-up line" "stopped because the context is at 90%"
assistant 196000
run_hook; expect_silent "98% -> no output (no threshold above 90)"

printf "\n=== compaction ===\n"
new_session
assistant 110000
run_hook; expect_note "55% -> note" "55% used"
compact 40000
run_hook; expect_silent "compact to 20% -> no output"
[ "$(cat "$STATE_DIR/$sid.notified")" = "0" ] && ok "notified reset to 0" || ko "notified reset to 0" "$(cat "$STATE_DIR/$sid.notified")"
user_line; assistant 110000
run_hook; expect_note "55% after compaction -> note again" "55% used"

printf "\n=== ignored entries ===\n"
new_session
assistant 60000
assistant 190000 true
run_hook; expect_silent "later sidechain entry at 95% -> ignored"
assistant 0 false "<synthetic>"
assistant 110000 true
[ "$(bash "$USAGE" --transcript "$tr" --session "$sid" | jq .used_tokens)" = "60000" ] \
  && ok "synthetic zero-usage entry -> ignored" || ko "synthetic zero-usage entry -> ignored" "wrong used_tokens"

new_session
assistant 180000
run_hook PostToolUse agent-123; expect_silent "agent_id set -> no output"

printf "\n=== window size ===\n"
new_session
assistant 300000
state="$(bash "$USAGE" --transcript "$tr" --session "$sid")"
[ "$(printf '%s' "$state" | jq -c '[.window_tokens, .used_pct]')" = "[1000000,30]" ] \
  && ok "300k with empty WINDOW_TOKENS -> 1M window, 30%" || ko "300k -> 1M window" "$state"

printf "\n=== failures ===\n"
new_session
run_hook UserPromptSubmit "" "$TMP/does-not-exist.jsonl"; expect_silent "missing transcript -> exit 0, no output"
run_hook; expect_silent "transcript without usage -> exit 0, no output"
out="$(printf 'not json' | bash "$HOOK" 2>&1)" && code=0 || code=$?
expect_silent "invalid stdin -> exit 0, no output"

printf "\n=== CLI by session id ===\n"
new_session
mkdir -p "$TMP/home/.claude/projects/-some-project"
tr="$TMP/home/.claude/projects/-some-project/$sid.jsonl"
assistant 144000
state="$(HOME="$TMP/home" CLAUDE_CONFIG_DIR= bash "$USAGE" "$sid" 2>&1)" || true
if [ "$(printf '%s' "$state" | jq -c '[.session_id, .used_tokens, .window_tokens, .used_pct]' 2>/dev/null)" = "[\"$sid\",144000,200000,72]" ] \
  && [ "$(cat "$STATE_DIR/$sid.json")" = "$state" ]; then
  ok "context-usage.sh <session_id> prints and writes state JSON"
else
  ko "context-usage.sh <session_id>" "$state"
fi
if HOME="$TMP/home" CLAUDE_CONFIG_DIR= bash "$USAGE" "$PREFIX-unknown" >/dev/null 2>&1; then
  ko "unknown session -> non-zero exit" "exit 0"
else
  ok "unknown session -> non-zero exit"
fi

printf "\n%d passed, %d failed\n" "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
