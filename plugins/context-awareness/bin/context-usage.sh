#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="/tmp/claude_context_awareness"

usage() {
  echo "usage: context-usage.sh <session_id>" >&2
  echo "       context-usage.sh --transcript <path> [--session <id>]" >&2
  exit 2
}

transcript=""
session=""
while [ $# -gt 0 ]; do
  case "$1" in
    --transcript) [ $# -ge 2 ] || usage; transcript="$2"; shift 2 ;;
    --session) [ $# -ge 2 ] || usage; session="$2"; shift 2 ;;
    -*) usage ;;
    *) [ -z "$session" ] || usage; session="$1"; shift ;;
  esac
done

if [ -z "$transcript" ]; then
  [ -n "$session" ] || usage
  for f in "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/"$session".jsonl; do
    [ -f "$f" ] && transcript="$f" && break
  done
fi
if [ -z "$transcript" ] || [ ! -f "$transcript" ]; then
  echo "context-usage: transcript not found${session:+ for session $session}" >&2
  exit 1
fi
[ -n "$session" ] || session="$(basename "$transcript" .jsonl)"

. "$PLUGIN_ROOT/config"

# <synthetic> assistant entries (local errors) carry all-zero usage.
USED_FILTER='
  [inputs | fromjson? | select(.isSidechain != true)] as $e
  | ([$e | to_entries[] | select(.value.type == "assistant" and .value.message.usage != null
        and .value.message.model != "<synthetic>") | .key] | last) as $a
  | ([$e | to_entries[] | select(.value.type == "system" and .value.subtype == "compact_boundary") | .key] | last) as $c
  | if $c != null and ($a == null or $c > $a) then $e[$c].compactMetadata.postTokens
    elif $a != null then $e[$a].message.usage
      | (.input_tokens // 0) + (.cache_creation_input_tokens // 0)
        + (.cache_read_input_tokens // 0) + (.output_tokens // 0)
    else empty end'

used="$(tail -n 500 "$transcript" | jq -Rn "$USED_FILTER")"
[ -n "$used" ] || used="$(jq -Rn "$USED_FILTER" < "$transcript")"
if ! [[ "$used" =~ ^[0-9]+$ ]]; then
  echo "context-usage: no usage found in $transcript" >&2
  exit 1
fi

window="${WINDOW_TOKENS:-}"
if [ -z "$window" ]; then
  window=200000
  [ "$used" -le 200000 ] || window=1000000
fi

mkdir -p "$STATE_DIR"
out="$STATE_DIR/$session.json"
tmp="$(mktemp "$STATE_DIR/.$session.XXXXXX")"
jq -n \
  --arg session_id "$session" \
  --argjson used "$used" \
  --argjson window "$window" \
  --arg updated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{session_id: $session_id, used_tokens: $used, window_tokens: $window,
    used_pct: (($used * 100 / $window) | floor), updated_at: $updated_at}' > "$tmp"
mv "$tmp" "$out"
cat "$out"
