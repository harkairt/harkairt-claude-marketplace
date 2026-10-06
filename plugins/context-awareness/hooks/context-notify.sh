#!/usr/bin/env bash
set -uo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="/tmp/claude_context_awareness"

input="$(cat)"
fields="$(printf '%s' "$input" | jq -r '[.agent_id // "", .session_id // "", .transcript_path // "", .hook_event_name // "", .source // ""] | join("\u001f")' 2>/dev/null)" || exit 0
IFS=$'\x1f' read -r agent_id session_id transcript_path event source <<< "$fields"

[ -z "$agent_id" ] || exit 0
[ -n "$session_id" ] && [ -n "$transcript_path" ] && [ -n "$event" ] || exit 0

compacted=false
if [ "$event" = "SessionStart" ]; then
  [ "$source" = "compact" ] || exit 0
  compacted=true
fi

state="$("$PLUGIN_ROOT/bin/context-usage.sh" --transcript "$transcript_path" --session "$session_id" 2>/dev/null)"

. "$PLUGIN_ROOT/config"

[ -f "$PLUGIN_ROOT/config" ] && . "$PLUGIN_ROOT/config"

read -r used_tokens window_tokens used_pct from_boundary <<< "$(printf '%s' "$state" | jq -r '"\(.used_tokens) \(.window_tokens) \(.used_pct) \(.from_compact_boundary)"')" || exit 0
known=true
if ! [[ "$used_pct" =~ ^[0-9]+$ ]] || { $compacted && [ "$from_boundary" != true ]; }; then
  $compacted || exit 0
  known=false used_tokens=0 window_tokens=0 used_pct=0
fi

bucket=0
for t in $THRESHOLDS; do
  [ "$t" -le "$used_pct" ] && [ "$t" -gt "$bucket" ] && bucket="$t"
done

notified_file="$STATE_DIR/$session_id.notified"
if $compacted; then
  printf '%s\n' "$bucket" > "$notified_file" 2>/dev/null
else
  notified="$(cat "$notified_file" 2>/dev/null)"
  [[ "$notified" =~ ^[0-9]+$ ]] || notified=0

  [ "$bucket" -ne "$notified" ] || exit 0
  printf '%s\n' "$bucket" > "$notified_file" 2>/dev/null || exit 0
  [ "$bucket" -gt "$notified" ] || exit 0
fi

jq -n \
  --arg event "$event" \
  --argjson compacted "$compacted" \
  --argjson known "$known" \
  --argjson used "$used_tokens" \
  --argjson window "$window_tokens" \
  --argjson pct "$used_pct" \
  --argjson wrap "$WRAP_UP_AT" \
  'def k: (. / 1000 | round | tostring) + "k";
   "Context window: \($pct)% used (\($used | k) of \($window | k) tokens)." as $usage
   | (["<context-usage-notice>"]
   + (if $compacted then
        [(["Context was compacted."] + (if $known then [$usage] else [] end) | join(" ")),
         "Earlier context-usage notices are out of date. Ignore them and any stop rule in them."]
      else [$usage] end)
   + ["This is an automatic notice from the context-awareness plugin. Do not reply to it just keep it in mind."]
   + (if $pct >= $wrap then ["Do not start work that cannot finish in the remaining context. Finish the current step. Then tell the user what you would do next and that you stopped because the context is at \($pct)%."] else [] end)
   + ["</context-usage-notice>"]) as $lines
   | {hookSpecificOutput: {hookEventName: $event, additionalContext: ($lines | join("\n"))}}'
